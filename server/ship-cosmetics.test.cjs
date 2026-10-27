const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const crypto=require('node:crypto');
const {PublicKey,Keypair}=require('@solana/web3.js');
const exportsUnderTest={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/ship-cosmetics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports:exportsUnderTest,require,crypto:crypto.webcrypto,TextEncoder,Uint8Array});
const api=exportsUnderTest;
test('livery choices retain their grid despite shared command button overrides',()=>{
  const css=fs.readFileSync('src/ship-cosmetics-store.css','utf8');
  assert.match(css,/\.ship-skin-store \.ship-skin-options button\{display:grid!important;min-height:90px!important/);
  assert.match(css,/\.ship-skin-store \.ship-skin-options strong\{white-space:nowrap;overflow-wrap:normal/);
  assert.match(css,/@media\(max-width:600px\).*repeat\(2,minmax\(0,1fr\)\)/);
});
const spl=require('@solana/spl-token');
const program=Keypair.generate().publicKey,commander=Keypair.generate().publicKey;
test('pre-submission approval timeout is distinct from an unknown payment outcome',()=>{
  assert.match(api.cosmeticCommandError('buy',new Error('Passkey approval timed out. No command was submitted. You can try again.')),/No payment was sent/);
  assert.match(api.cosmeticCommandError('equip',new Error('Passkey approval timed out. No command was submitted.')),/not changed/);
  assert.doesNotMatch(api.cosmeticCommandError('buy',new Error('Network error after submission')),/No payment/);
});
function fixture(){
  const bytes=Buffer.alloc(63);crypto.createHash('sha256').update('account:ShipCosmeticInventory').digest().copy(bytes,0,0,8);
  commander.toBuffer().copy(bytes,8);bytes[40]=2;bytes[41]=1;bytes.writeBigUInt64LE(4n,55);return bytes;
}
test('cosmetic inventory restores only from the correct program, PDA and commander',async()=>{
  const address=api.cosmeticInventoryAddress(program,commander);
  const inv=await api.decodeShipSkins(program,commander,address,program,fixture());
  assert.equal(inv.revision,4n);assert.equal(api.equippedShipSkin(inv,'smallCargo').id,1);
  assert.equal(api.equippedShipSkin(null,'deathstar').id,0);
  await assert.rejects(api.decodeShipSkins(program,commander,address,commander,fixture()));
  const invalid=fixture();invalid[41]=3;
  await assert.rejects(api.decodeShipSkins(program,commander,address,program,invalid));
  await assert.rejects(api.decodeShipSkins(program,commander,address,program,fixture().subarray(0,62)));
});
test('equipment binds the revision, class, owner and network without gameplay statistics',async()=>{
  const inv=await api.decodeShipSkins(program,commander,api.cosmeticInventoryAddress(program,commander),program,fixture());
  const ix=await api.equipShipSkinInstruction(api.COSMETIC_DEVNET_GENESIS,program,inv,'destroyer',1);
  assert.equal(ix.data[8],8);assert.equal(ix.data.readBigUInt64LE(10),4n);assert(ix.keys[0].isSigner);
  await assert.rejects(api.equipShipSkinInstruction('mainnet',program,inv,'destroyer',1));
  await assert.rejects(api.equipShipSkinInstruction(api.COSMETIC_DEVNET_GENESIS,program,inv,'destroyer',3));
  for(const skin of api.SHIP_SKINS)assert.deepEqual(Object.keys(skin).sort(),['hull','id','name','price','trim']);
});
test('purchases bind an exact catalog price and token accounts',async()=>{
  const mint=Keypair.generate().publicKey,treasury=Keypair.generate().publicKey,payment=Keypair.generate().publicKey;
  const ix=await api.buyShipSkinInstruction(api.COSMETIC_DEVNET_GENESIS,program,commander,mint,treasury,payment,2);
  assert.equal(ix.data.readBigUInt64LE(9),2_000_000n);assert(ix.keys[3].pubkey.equals(mint));assert(ix.keys[5].pubkey.equals(treasury));
  await assert.rejects(api.buyShipSkinInstruction('mainnet',program,commander,mint,treasury,payment,2));
  await assert.rejects(api.buyShipSkinInstruction(api.COSMETIC_DEVNET_GENESIS,program,commander,mint,treasury,payment,0));
});
test('fresh reads restore equipment without browser state and reject other clusters before reading',async()=>{
  let reads=0;
  const connection={getGenesisHash:async()=>api.COSMETIC_DEVNET_GENESIS,getAccountInfo:async()=>{reads++;return {owner:program,data:fixture()};}};
  const first=await api.readShipSkinInventory(connection,program,commander);
  const restored=await api.readShipSkinInventory(connection,program,commander);
  assert.equal(first.equipped[0],restored.equipped[0]);assert.equal(reads,2);
  await assert.rejects(api.readShipSkinInventory({...connection,getGenesisHash:async()=>'mainnet'},program,commander));
  assert.equal(reads,2);
  assert.equal(await api.readShipSkinInventory({...connection,getAccountInfo:async()=>null},program,commander),null);
});

function storeFixture(){
  const mint=Keypair.generate().publicKey,treasury=Keypair.generate().publicKey,payment=spl.getAssociatedTokenAddressSync(mint,commander,true);
  const storeAddress=PublicKey.findProgramAddressSync([Buffer.from('ship_cosmetic_store')],program)[0];
  const store=Buffer.alloc(73);crypto.createHash('sha256').update('account:ShipCosmeticStore').digest().copy(store,0,0,8);mint.toBuffer().copy(store,8);treasury.toBuffer().copy(store,40);store[72]=1;
  const mintData=Buffer.alloc(82);mintData[44]=6;mintData[45]=1;
  const token=(owner,amount)=>{const data=Buffer.alloc(165);mint.toBuffer().copy(data);owner.toBuffer().copy(data,32);data.writeBigUInt64LE(amount,64);data[108]=1;return {data,owner:spl.TOKEN_PROGRAM_ID,lamports:1,executable:false,rentEpoch:0};};
  const records=new Map([[storeAddress.toBase58(),{data:store,owner:program}],[mint.toBase58(),{data:mintData,owner:spl.TOKEN_PROGRAM_ID}],[treasury.toBase58(),token(Keypair.generate().publicKey,0n)],[payment.toBase58(),token(commander,5_000_000n)]]);
  const connection={getGenesisHash:async()=>api.COSMETIC_DEVNET_GENESIS,getAccountInfo:async key=>records.get(key.toBase58())??null};
  return {connection,records,mint,treasury,payment,store,putInventory(data){records.set(api.cosmeticInventoryAddress(program,commander).toBase58(),{data,owner:program});}};
}
test('store checks canonical accounts, disabled state and funds before any signing',async()=>{
  const f=storeFixture();let sent=0;const client=api.createShipCosmeticController({connection:f.connection,program,commander,send:async()=>{sent++;return 'signature';}});
  const current=await client.read();assert.equal(current.balance,5_000_000n);assert(current.enabled);
  f.store[72]=0;await assert.rejects(client.buy(1),/not available/);assert.equal(sent,0);
  f.store[72]=1;f.records.get(f.payment.toBase58()).data.writeBigUInt64LE(999_999n,64);await assert.rejects(client.buy(1),/Insufficient/);assert.equal(sent,0);
  f.records.get(f.mint.toBase58()).data[44]=9;await assert.rejects(client.read(),/Unsupported/);
});
test('interrupted payment reconciles owned skin and a retry sends no second transaction',async()=>{
  const f=storeFixture();let sent=0;
  const client=api.createShipCosmeticController({connection:f.connection,program,commander,send:async()=>{sent++;f.putInventory(fixture());throw Error('Confirmation interrupted');}});
  const recovered=await client.buy(1);assert.equal(recovered.inventory.owned,2);await client.buy(1);assert.equal(sent,1);
});
test('concurrent UI clicks share a command lock and stale equipment never opens signer',async()=>{
  const f=storeFixture();let sent=0,release;
  const held=new Promise(resolve=>{release=resolve;});
  const client=api.createShipCosmeticController({connection:f.connection,program,commander,send:async()=>{sent++;await held;f.putInventory(fixture());return 'signature';}});
  const first=client.buy(1);await assert.rejects(client.buy(1),/already pending/);
  release();await first;assert.equal(sent,1);await assert.rejects(client.equip('destroyer',1,3n),/loadout changed/);assert.equal(sent,1);
});
