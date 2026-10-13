const crypto = require('node:crypto');
const { PublicKey, Keypair, Connection } = require('@solana/web3.js');
const nft = require('./crypto-ufos.cjs');
const PROGRAM = new PublicKey('J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
const DOMAIN = Buffer.from('gamesol:ufo:devnet:v1');
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const normalize = value => String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const BODIES = ['silver ufo', 'blue ufo', 'red ufo', 'green ufo', 'gold ufo', 'pink ufo'];
const ROUTES = { vr:1, '3d glasses':1, 'nerd glasses':2, 'horned rim glasses':2, 'eye patch':3,
  'classic shades':4, 'regular shades':4, 'small sun glasses':4, 'violet shades':4,
  normal:5, 'small eyes':5, o0:5, 'clown eyes blue':5, 'clown eyes green':5 };
const discriminator = name => crypto.createHash('sha256').update(`account:${name}`).digest().subarray(0,8);
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM)[0];
const address = value => new PublicKey(value).toBase58();
function traitBytes(value) {
  const result=Buffer.alloc(32);
  // Truncate whole code points, not a UTF-8 byte sequence.
  let offset=0;
  for (const char of value || '') { const bytes=Buffer.from(char); if (offset+bytes.length>32) break; bytes.copy(result,offset); offset+=bytes.length; }
  return result;
}
function policy(asset) {
  const traits=nft.displayAsset(asset).traits;
  const value=name=>traits.find(item=>normalize(item.name)===name)?.value;
  const doctrine=BODIES.indexOf(normalize(value('body') || ''))+1;
  if (!doctrine) throw new Error('This Body trait has no active expedition doctrine.');
  return { doctrine, route:ROUTES[normalize(value('eyes') || '')] || 0,
    accessory:traitBytes(value('accesory') || value('accessory')), hair:traitBytes(value('hair')) };
}
function proofBytes(proof) {
  const nonce=Buffer.alloc(8); nonce.writeBigUInt64LE(BigInt(proof.nonce));
  const expires=Buffer.alloc(8); expires.writeBigInt64LE(BigInt(proof.expires));
  return Buffer.concat([new PublicKey(proof.owner).toBuffer(),new PublicKey(proof.asset).toBuffer(),nonce,
    Buffer.from([proof.doctrine,proof.route]),Buffer.from(proof.accessory),Buffer.from(proof.hair),expires]);
}
function attestationMessage(commander, proof) {
  return Buffer.concat([DOMAIN,PROGRAM.toBuffer(),new PublicKey(nft.COLLECTION).toBuffer(),new PublicKey(commander).toBuffer(),proofBytes(proof)]);
}
function holdingMessage(data) {
  return ['GAMESOL: Activate my UFO PvE utility',`Site: ${data.origin}`,`Game commander (devnet): ${data.commander}`,
    `NFT holding wallet (mainnet): ${data.owner}`,`Crypto UFO asset: ${data.asset}`,`Collection: ${nft.COLLECTION}`,
    `Nonce: ${data.nonce}`,`Challenge expires: ${new Date(data.expires).toISOString()}`,
    `Utility authorization expires: ${new Date(data.issuedAt+3600000).toISOString()}`,
    'Allow ownership attestations for this commander for one hour. No NFT transfer, delegation, token reward or PvP bonus.'].join('\n');
}
function issuerKey(env) {
  if (!env.GAMESOL_UFO_ATTESTOR_KEY) throw new Error('UFO ownership attestor is not configured.');
  try { return Keypair.fromSecretKey(Buffer.from(env.GAMESOL_UFO_ATTESTOR_KEY,'base64')); }
  catch { throw new Error('UFO ownership attestor configuration is invalid.'); }
}
function createAttestationService({ env=process.env, das, connection, now=Date.now }={}) {
  const rpc=connection || new Connection(env.SOLANA_RPC_URL || 'https://api.devnet.solana.com','confirmed');
  const lookup=das || nft.createDas(nft.mainnetEndpoint(env));
  const configAddress=pda(Buffer.from('ufo_config'));
  async function config() {
    if (await rpc.getGenesisHash()!==DEVNET_GENESIS) throw new Error('UFO utility currently supports the devnet game only.');
    const account=await rpc.getAccountInfo(configAddress,'confirmed');
    if (!account) return null;
    if (!account.owner.equals(PROGRAM) || account.data.length!==41 || !account.data.subarray(0,8).equals(discriminator('UfoConfig')))
      throw new Error('Invalid on-chain UFO configuration.');
    return { attestor:new PublicKey(account.data.subarray(8,40)).toBase58(),enabled:account.data[40]===1 };
  }
  async function owned(owner, assetId) {
    const asset=await lookup('getAsset',{id:assetId});
    if (asset?.id!==assetId || !nft.ownedCollectionAsset(asset,owner)) throw new Error('This UFO is no longer owned by the verified holding wallet.');
    return asset;
  }
  return async function service(body,origin) {
    if (body.action==='ufo-status') {
      const current=await config();
      let enabled=false;
      if (current?.enabled && env.GAMESOL_UFO_ATTESTOR_KEY) enabled=current.attestor===issuerKey(env).publicKey.toBase58();
      return { enabled,network:'devnet',storage:'on-chain' };
    }
    const current=await config();
    if (!current?.enabled) throw new Error('On-chain UFO expeditions are not enabled yet.');
    const issuer=issuerKey(env);
    if (current.attestor!==issuer.publicKey.toBase58()) throw new Error('UFO attestor does not match the on-chain configuration.');
    const key=nft.signingKey(env);
    if (body.action==='ufo-challenge') {
      const data={v:1,kind:'ufo-challenge',origin,commander:address(body.commander),smartWallet:address(body.commander),
        owner:address(body.owner),asset:address(body.asset),nonce:crypto.randomBytes(24).toString('base64url'),issuedAt:now(),expires:now()+300000};
      policy(await owned(data.owner,data.asset));
      return {challengeToken:nft.seal(data,key),message:holdingMessage(data)};
    }
    if (body.action==='ufo-verify') {
      const data=nft.unseal(body.challengeToken,key,'ufo-challenge',origin,now());
      nft.verifyHoldingSignature(data.owner,holdingMessage(data),body.signature);
      policy(await owned(data.owner,data.asset));
      return {utilityToken:nft.seal({...data,kind:'ufo-authorization',expires:data.issuedAt+3600000},key)};
    }
    if (body.action==='ufo-attest') {
      const data=nft.unseal(body.utilityToken,key,'ufo-authorization',origin,now());
      const asset=await owned(data.owner,data.asset);
      const loadout=await rpc.getAccountInfo(pda(Buffer.from('ufo_loadout'),new PublicKey(data.commander).toBuffer()),'confirmed');
      let nonce=0n;
      if (loadout) {
        if (!loadout.owner.equals(PROGRAM) || loadout.data.length<48 || !loadout.data.subarray(0,8).equals(discriminator('UfoLoadout'))
          || !loadout.data.subarray(8,40).equals(new PublicKey(data.commander).toBuffer())) throw new Error('Invalid on-chain commander loadout.');
        nonce=loadout.data.readBigUInt64LE(40);
      }
      const proof={owner:data.owner,asset:data.asset,nonce:nonce.toString(),...policy(asset),expires:Math.floor(now()/1000)+90};
      const message=attestationMessage(data.commander,proof);
      const privateKey=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(issuer.secretKey.subarray(0,32))]),format:'der',type:'pkcs8'});
      return {proof:{...proof,accessory:[...proof.accessory],hair:[...proof.hair]},message:message.toString('base64'),
        signature:crypto.sign(null,message,privateKey).toString('base64'),attestor:issuer.publicKey.toBase58()};
    }
    throw new Error('Unknown UFO utility action.');
  };
}
module.exports={createAttestationService,policy,proofBytes,attestationMessage,holdingMessage,PROGRAM,DEVNET_GENESIS,discriminator};
