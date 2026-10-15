const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const {PublicKey,Keypair,Ed25519Program}=require('@solana/web3.js');
const nft=require('./crypto-ufos.cjs');
const utility=require('./ufo-attestations.cjs');
const origin='https://game.example';
function setup() {
  const holder=crypto.generateKeyPairSync('ed25519');
  const owner=new PublicKey(holder.publicKey.export({type:'spki',format:'der'}).subarray(-32)).toBase58();
  const commander=Keypair.generate().publicKey.toBase58();
  const issuer=Keypair.generate();
  const asset={id:Keypair.generate().publicKey.toBase58(),ownership:{owner},compression:{compressed:true},grouping:[{group_key:'collection',group_value:nft.COLLECTION}],content:{metadata:{name:'Crypto UFO #7541',attributes:[{trait_type:'Body',value:'Silver UFO'},{trait_type:'Eyes',value:'Small Eyes'},{trait_type:'Accesory',value:'Frown'},{trait_type:'Hair',value:'Tiara'}]}}};
  const config=Buffer.concat([utility.discriminator('UfoConfig'),issuer.publicKey.toBuffer(),Buffer.from([1])]);
  const state={now:1000000,asset,nonce:0n,enabled:true,genesis:utility.DEVNET_GENESIS,loadout:null};
  const configPda=PublicKey.findProgramAddressSync([Buffer.from('ufo_config')],utility.PROGRAM)[0];
  const rpc={getGenesisHash:async()=>state.genesis,getAccountInfo:async key=>key.equals(configPda)?{owner:utility.PROGRAM,data:Buffer.concat([config.subarray(0,40),Buffer.from([state.enabled?1:0])])}:state.loadout};
  const service=utility.createAttestationService({env:{GAMESOL_NFT_LINK_SECRET:'test-only-secret-at-least-thirty-two-characters',GAMESOL_UFO_ATTESTOR_KEY:Buffer.from(issuer.secretKey).toString('base64')},connection:rpc,das:async()=>state.asset,now:()=>state.now});
  async function authorize(purpose) {
    const challenge=await service({action:'ufo-challenge',commander,owner,asset:asset.id,purpose},origin);
    const signature=crypto.sign(null,Buffer.from(challenge.message),holder.privateKey).toString('base64');
    return {...await service({action:'ufo-verify',challengeToken:challenge.challengeToken,signature},origin),challenge,signature};
  }
  return {service,state,authorize,holder,owner,commander,issuer,asset};
}
function loadFrontend() {
  const name=path.join(__dirname,'../src/ufo-onchain.ts');
  const mod=new Module(name,module); mod.paths=module.paths;
  const original=mod.require.bind(mod);
  mod.require=request=>request==='./game-state'?{GAME_STATE_PROGRAM_ID:utility.PROGRAM}:original(request);
  mod._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,name);
  return mod.exports;
}
const frontend=loadFrontend();

test('avatar authorization and independent nonce cannot be substituted for expedition utility',async()=>{
  const ctx=setup();
  const expedition=await ctx.authorize();
  await assert.rejects(ctx.service({action:'ufo-commander-attest',utilityToken:expedition.utilityToken},origin),/different action/);
  const avatar=await ctx.authorize('commander');
  assert.match(avatar.challenge.message,/Save my commander avatar/);
  await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:avatar.utilityToken},origin),/different action/);
  const data=Buffer.alloc(120);utility.discriminator('CommanderIdentity').copy(data);new PublicKey(ctx.commander).toBuffer().copy(data,8);data.writeBigUInt64LE(19n,40);
  ctx.state.loadout={owner:utility.PROGRAM,data};
  const result=await ctx.service({action:'ufo-commander-attest',utilityToken:avatar.utilityToken,nonce:'999'},origin);
  assert.equal(result.proof.nonce,'19');
  assert(Buffer.from(result.message,'base64').equals(utility.attestationMessage(ctx.commander,result.proof,'commander')));
  assert(!Buffer.from(result.message,'base64').equals(utility.attestationMessage(ctx.commander,result.proof)));
  const instructions=await frontend.commanderIdentityInstructions(ctx.commander,'set',result);
  assert.equal(instructions[1].keys.length,6);
  assert.equal(instructions[1].data.length,154);
  await assert.rejects(frontend.ufoInstructions(ctx.commander,'start',result),/another game account/);
  await assert.rejects(frontend.commanderIdentityInstructions(ctx.owner,'set',result),/does not authorize/);
  const read=await frontend.fetchCommanderIdentity({getAccountInfo:async()=>ctx.state.loadout},ctx.commander);
  assert.equal(read.nonce,19n);
  assert.equal((await frontend.commanderIdentityInstructions(ctx.commander,'clear'))[0].keys.length,2);
  ctx.state.loadout.data=Buffer.alloc(119);
  await assert.rejects(ctx.service({action:'ufo-commander-attest',utilityToken:avatar.utilityToken},origin),/Invalid on-chain/);
  ctx.state.asset={...ctx.asset,ownership:{owner:ctx.commander}};
  await assert.rejects(ctx.service({action:'ufo-commander-attest',utilityToken:avatar.utilityToken},origin),/no longer owned/);
});

test('holder signature activates only domain-bound UFO utility, never a Lazor signature',async()=>{
  const ctx=setup(); const auth=await ctx.authorize();
  assert.match(auth.challenge.message,/No NFT transfer, delegation, token reward or PvP bonus/);
  const result=await ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},origin);
  assert.equal(result.proof.doctrine,1); assert.equal(result.proof.route,5); assert.equal(result.proof.nonce,'0');
  assert.equal(Buffer.from(result.proof.accessory).subarray(0,5).toString(),'Frown');
  const publicKey=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),ctx.issuer.publicKey.toBuffer()]),format:'der',type:'spki'});
  assert(crypto.verify(null,Buffer.from(result.message,'base64'),publicKey,Buffer.from(result.signature,'base64')));
});
test('wrong holding signatures, origin, token edits and expiry fail closed',async()=>{
  const ctx=setup(); const auth=await ctx.authorize();
  await assert.rejects(ctx.service({action:'ufo-verify',challengeToken:auth.challenge.challengeToken,signature:Buffer.alloc(64).toString('base64')},origin),/signature/);
  await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},'https://other.example'));
  await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken+'x'},origin));
  ctx.state.now+=3600001; await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},origin),/expired/);
});

test('utility expiry exposed to the UI matches the sealed server deadline and never refreshes on attestations', async () => {
  const ctx = setup(); const auth = await ctx.authorize();
  const payload = JSON.parse(Buffer.from(auth.utilityToken.split('.')[0], 'base64url').toString());
  assert.equal(auth.expiresAt, payload.expires); assert.equal(auth.expiresAt, ctx.state.now + 3600000);
  ctx.state.now += 3500000;
  const proof = await ctx.service({ action: 'ufo-attest', utilityToken: auth.utilityToken }, origin);
  assert.equal(proof.proof.expires, Math.floor(ctx.state.now / 1000) + 90);
  ctx.state.now = auth.expiresAt;
  await assert.rejects(ctx.service({ action: 'ufo-attest', utilityToken: auth.utilityToken }, origin), /expired/);
});
test('replaying a still-valid holder challenge cannot extend its signed authorization window',async()=>{
  const ctx=setup(); const auth=await ctx.authorize();
  ctx.state.now+=240000;
  const replay=await ctx.service({action:'ufo-verify',challengeToken:auth.challenge.challengeToken,signature:auth.signature},origin);
  const payload=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
  assert.equal(payload(replay.utilityToken).expires,payload(auth.utilityToken).expires);
});
test('fresh mainnet ownership is required after verification, including at claims',async()=>{
  const ctx=setup(); const auth=await ctx.authorize();
  ctx.state.asset={...ctx.asset,ownership:{owner:ctx.commander}};
  await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},origin),/no longer owned/);
  for(const changed of [{burnt:true},{compression:{compressed:false}},{grouping:[]},{id:ctx.commander}]) {
    ctx.state.asset={...ctx.asset,...changed};
    await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},origin),/no longer owned/);
  }
});
test('server reads nonce from the program-owned commander account, ignoring client traits and counters',async()=>{
  const ctx=setup(); const auth=await ctx.authorize();
  const data=Buffer.alloc(211); utility.discriminator('UfoLoadout').copy(data); new PublicKey(ctx.commander).toBuffer().copy(data,8); data.writeBigUInt64LE(77n,40);
  ctx.state.loadout={owner:utility.PROGRAM,data};
  const result=await ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken,nonce:'999',doctrine:6,asset:ctx.commander},origin);
  assert.equal(result.proof.nonce,'77'); assert.equal(result.proof.doctrine,1); assert.equal(result.proof.asset,ctx.asset.id);
  ctx.state.loadout.owner=new PublicKey(ctx.owner);
  await assert.rejects(ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},origin),/Invalid on-chain/);
});
test('disabled configuration, unknown Body and wrong game network never issue utility',async()=>{
  assert.equal(utility.DEVNET_GENESIS,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const ctx=setup(); ctx.state.enabled=false;
  assert.equal((await ctx.service({action:'ufo-status'},origin)).enabled,false);
  await assert.rejects(ctx.authorize(),/not enabled/);
  ctx.state.enabled=true; ctx.state.genesis='mainnet'; await assert.rejects(ctx.authorize(),/devnet/);
  ctx.state.genesis=utility.DEVNET_GENESIS; ctx.state.asset.content.metadata.attributes[0].value='Unknown UFO';
  await assert.rejects(ctx.authorize(),/no active expedition/);
});
test('frontend proof bytes agree with issuer and canonical top-level Ed25519 offsets',async()=>{
  const ctx=setup(); const auth=await ctx.authorize(); const proof=await ctx.service({action:'ufo-attest',utilityToken:auth.utilityToken},origin);
  assert.deepEqual(frontend.proofData(proof),utility.proofBytes(proof.proof));
  const instructions=await frontend.ufoInstructions(ctx.commander,'start',proof);
  assert(instructions[0].programId.equals(Ed25519Program.programId));
  const data=instructions[0].data;
  for(const [offset,value] of [[2,48],[4,65535],[6,16],[8,65535],[10,112],[14,65535]]) assert.equal(data.readUInt16LE(offset),value);
  assert.deepEqual(data.subarray(112),Buffer.from(proof.message,'base64'));
  assert.equal(instructions[1].keys.length,8);
  await assert.rejects(frontend.ufoInstructions(ctx.owner,'start',proof),/another game account/);
  await assert.rejects(frontend.ufoInstructions(ctx.commander,'advance',proof,256),/Invalid/);
});
test('on-chain decoder preserves bigint counters and rejects truncated or excessive loot',()=>{
  const ctx=setup(); const data=Buffer.alloc(245);
  utility.discriminator('UfoLoadout').copy(data); new PublicKey(ctx.commander).toBuffer().copy(data,8);
  data.writeBigUInt64LE(9007199254740993n,40); data[112]=1; data[178]=2; data[179]=3; data[181]=1; data[206]=0; data.writeUInt32LE(1,207); data[211]=1; Buffer.from('Frown').copy(data,213);
  const decoded=frontend.decodeUfoLoadout(data);
  assert.equal(decoded.nonce,9007199254740993n); assert.equal(decoded.status,2); assert.equal(decoded.booster,true); assert.equal(frontend.lootName(decoded.loot[0]),'Frown insignia');
  assert.throws(()=>frontend.decodeUfoLoadout(data.subarray(0,220)));
  data.writeUInt32LE(25,207); assert.throws(()=>frontend.decodeUfoLoadout(data));
});
test('all real Body doctrines have equal booster budgets and no rarity power',()=>{
  const ctx=setup();
  for(const [index,body] of ['Silver UFO','Blue UFO','Red UFO','Green UFO','Gold UFO','Pink UFO'].entries()) {
    ctx.asset.content.metadata.attributes[0].value=body;
    assert.equal(utility.policy(ctx.asset).doctrine,index+1);
  }
  ctx.asset.content.metadata.attributes.push({trait_type:'Rarity Rank',value:1});
  const rare=utility.policy(ctx.asset);
  ctx.asset.content.metadata.attributes.at(-1).value=9999;
  assert.deepEqual(utility.policy(ctx.asset),rare);
});
