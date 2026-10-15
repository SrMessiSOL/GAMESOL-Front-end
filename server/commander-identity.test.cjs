const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const {Keypair, PublicKey} = require('@solana/web3.js');
const utility = require('./ufo-attestations.cjs');
function load(name, dependencies) {
  const filename = path.join(__dirname, '../src', name);
  const mod = new Module(filename, module); mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = id => dependencies[id] ?? original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename);
  return mod.exports;
}
const chain = load('ufo-onchain.ts', {'./game-state':{GAME_STATE_PROGRAM_ID:utility.PROGRAM}});
const {saveCommanderSelection} = load('commander-identity.ts', {'./ufo-onchain':chain});
function fixture() {
  const commander = Keypair.generate().publicKey.toBase58(), owner = Keypair.generate().publicKey.toBase58(), asset = Keypair.generate().publicKey.toBase58();
  let account = null, sent = 0, authorizations = 0, fail = false, current = true, network = utility.DEVNET_GENESIS;
  const encode = (id, nonce) => {
    const data = Buffer.alloc(120); utility.discriminator('CommanderIdentity').copy(data);
    new PublicKey(commander).toBuffer().copy(data,8); data.writeBigUInt64LE(nonce,40);
    new PublicKey(id ? owner : PublicKey.default).toBuffer().copy(data,48);
    new PublicKey(id ?? PublicKey.default).toBuffer().copy(data,80);data.writeBigInt64LE(id ? 1n : 0n,112);
    return {owner:utility.PROGRAM,data};
  };
  const connection = {getGenesisHash:async()=>network,getAccountInfo:async()=>account};
  const attest = async () => {
    authorizations++;
    const proof = {owner,asset,nonce:(account?.data.readBigUInt64LE(40)??0n).toString(),doctrine:1,route:0,accessory:Array(32).fill(0),hair:Array(32).fill(0),expires:Math.floor(Date.now()/1000)+90};
    return {proof,attestor:'9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a',message:utility.attestationMessage(commander,proof,'commander').toString('base64'),signature:Buffer.alloc(64).toString('base64')};
  };
  const game = {getConnection:()=>connection,buildSponsoredProgramRentInstruction:async(_,accounts)=>{assert.equal(accounts[0].space,120);return null;},sendUfoInstructions:async(_,instructions)=>{
    if(fail) throw Error('Quick Play is off');
    if (instructions.at(-1).data.length === 154) assert.equal(await chain.isUfoSessionBundle(instructions,new PublicKey(commander)),true);
    sent++;
    const action = instructions.at(-1);account=encode(action.data.length===154?asset:null,(account?.data.readBigUInt64LE(40)??0n)+1n);
  }};
  const guard = () => {if(!current) throw Error('Account changed');};
  return {game,commander,asset,attest,guard,connection,save: id=>saveCommanderSelection(game,commander,id,attest,guard),sent:()=>sent,authorizations:()=>authorizations,
    fail:()=>{fail=true;},switch:()=>{current=false;},wrongNetwork:()=>{network='mainnet';},account:()=>account};
}
test('save and clear confirm the chain nonce; a fresh reader restores without browser storage',async()=>{
  const f=fixture();const saved=await f.save(f.asset);assert.equal(saved.asset,f.asset);assert.equal(saved.nonce,1n);
  const fresh=await chain.fetchCommanderIdentity(f.connection,f.commander);assert.equal(fresh.asset,f.asset);
  await f.save(null);assert.equal((await chain.fetchCommanderIdentity(f.connection,f.commander)).asset,PublicKey.default.toBase58());
  assert.equal(f.authorizations(),1);assert.equal(f.sent(),2);
  await f.save(null);assert.equal(f.sent(),2);
});
test('failed save and wrong network do not create an optimistic identity',async()=>{
  const f=fixture();f.fail();await assert.rejects(f.save(f.asset),/Quick Play/);assert.equal(f.account(),null);
  const other=fixture();other.wrongNetwork();await assert.rejects(other.save(other.asset),/devnet only/);assert.equal(other.authorizations(),0);assert.equal(other.sent(),0);
});
test('account changes and substituted assets stop before signing a game transaction',async()=>{
  const f=fixture();await assert.rejects(saveCommanderSelection(f.game,f.commander,f.asset,async()=>{const p=await f.attest();f.switch();return p;},f.guard),/Account changed/);assert.equal(f.sent(),0);
  const other=fixture();await assert.rejects(saveCommanderSelection(other.game,other.commander,other.asset,async()=>{const p=await other.attest();p.proof.asset=Keypair.generate().publicKey.toBase58();return p;},other.guard),/selection changed/);assert.equal(other.sent(),0);
});
test('identity decoder rejects another program, commander, discriminator and truncated record',async()=>{
  const f=fixture();await f.save(f.asset);const original=f.account();
  for(const altered of [{...original,owner:Keypair.generate().publicKey},{...original,data:original.data.subarray(0,119)},{...original,data:Buffer.alloc(120)}])
    await assert.rejects(chain.fetchCommanderIdentity({getAccountInfo:async()=>altered},f.commander),/Invalid/);
  await assert.rejects(chain.fetchCommanderIdentity(f.connection,Keypair.generate().publicKey.toBase58()),/Invalid/);
});
