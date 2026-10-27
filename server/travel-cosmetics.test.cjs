const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const load=require('./frontend-ts-loader.cjs').frontendLoader();
const {PublicKey,Keypair}=require('@solana/web3.js');
const {readTravelCosmetics,travelShipSkin,MAX_TRAVEL_COSMETIC_OWNERS}=load('travel-cosmetics');
const {cosmeticInventoryAddress,COSMETIC_DEVNET_GENESIS}=load('ship-cosmetics');
const {missionRenderGroups,TRAFFIC_ROUTE_LIMIT}=load('mission-visibility');
const program=Keypair.generate().publicKey,one=Keypair.generate().publicKey,two=Keypair.generate().publicKey;
function bytes(owner,skin=3,owned=8){const data=Buffer.alloc(63);crypto.createHash('sha256').update('account:ShipCosmeticInventory').digest().copy(data,0,0,8);owner.toBuffer().copy(data,8);data[40]=owned;data[41+6]=skin;data.writeBigUInt64LE(7n,55);return data;}
test('remote fleets use their own program-owned PDA, not the viewer or destination',async()=>{
  let requested;
  const records=await readTravelCosmetics({getGenesisHash:async()=>COSMETIC_DEVNET_GENESIS,getMultipleAccountsInfo:async addresses=>{requested=addresses;return addresses.map(address=>({owner:program,data:address.equals(cosmeticInventoryAddress(program,one))?bytes(one):bytes(two,1,2)}));}},program,[one.toBase58(),two.toBase58(),one.toBase58()]);
  assert.equal(requested.length,2);assert.equal(travelShipSkin(records,one.toBase58(),'battlecruiser'),3);assert.equal(travelShipSkin(records,two.toBase58(),'battlecruiser'),1);
  assert.equal(travelShipSkin(records,one.toBase58(),'destroyer'),0);assert.equal(travelShipSkin(records,undefined,'battlecruiser'),0);
});
test('missing, forged, mismatched and unowned records fail closed independently',async()=>{
  for(const bad of [null,{owner:one,data:bytes(one)},{owner:program,data:bytes(two)},{owner:program,data:bytes(one,3,2)},{owner:program,data:bytes(one).subarray(0,62)}]){
    const records=await readTravelCosmetics({getGenesisHash:async()=>COSMETIC_DEVNET_GENESIS,getMultipleAccountsInfo:async addresses=>addresses.map(a=>a.equals(cosmeticInventoryAddress(program,one))?bad:{owner:program,data:bytes(two,1,2)})},program,[one.toBase58(),two.toBase58()]);
    assert.equal(travelShipSkin(records,one.toBase58(),'battlecruiser'),0);assert.equal(travelShipSkin(records,two.toBase58(),'battlecruiser'),1);
  }
  assert.equal(travelShipSkin(new Map([[one.toBase58(),{commander:two,owned:8,equipped:Array(14).fill(3)}]]),one.toBase58(),'battlecruiser'),0);
});
test('mainnet never reads cosmetics; visible-owner requests are deduplicated and bounded',async()=>{
  let calls=0,count=0;const connection={getGenesisHash:async()=>'mainnet',getMultipleAccountsInfo:async addresses=>{calls++;count=addresses.length;return addresses.map(()=>null);}};
  assert.equal((await readTravelCosmetics(connection,program,[one.toBase58()])).size,0);assert.equal(calls,0);
  connection.getGenesisHash=async()=>COSMETIC_DEVNET_GENESIS;
  await readTravelCosmetics(connection,program,['invalid',...Array.from({length:200},()=>Keypair.generate().publicKey.toBase58()),one.toBase58(),one.toBase58()]);
  assert.equal(calls,1);assert.equal(count,MAX_TRAVEL_COSMETIC_OWNERS);assert.equal(MAX_TRAVEL_COSMETIC_OWNERS,TRAFFIC_ROUTE_LIMIT);
});
test('route groups never mix commanders or ship sizes and retain the draw cap',()=>{
  const mission={sourceId:'source',destinationId:'target',sourcePosition:{galaxy:1,system:1,position:1},destinationPosition:{galaxy:2,system:2,position:2},kind:'attack',phase:'outbound',shipClass:'lightFighter',ownerAddress:one.toBase58()};
  const result=missionRenderGroups({planets:[],missions:[{...mission,id:'a'},{...mission,id:'b'},{...mission,id:'c',shipClass:'deathstar'},{...mission,id:'d',ownerAddress:two.toBase58()}]},{level:'universe',galaxy:1,system:1});
  assert.equal(result.groups.length,3);assert.equal(result.total,4);assert.equal(result.groups.find(g=>g.mission.id==='a').count,2);
  const many=missionRenderGroups({planets:[],missions:Array.from({length:200},(_,i)=>({...mission,id:String(i),ownerAddress:'owner'+i}))},{level:'universe',galaxy:1,system:1});assert.equal(many.groups.length,32);
});
test('system, galaxy and universe forward authoritative owner without changing sizes or travel physics',()=>{
  const scene=fs.readFileSync('src/UniverseLab.tsx','utf8'),wrapper=fs.readFileSync('src/TravelFleetVessel.tsx','utf8'),data=fs.readFileSync('src/universe-data.ts','utf8');
  assert.equal((scene.match(/ownerAddress=\{mission.ownerAddress\}/g)||[]).length,3);
  assert.match(data,/ownerAddress: source.owner/);
  assert.match(wrapper,/skin=\{travelShipSkin\(records,ownerAddress,shipClass\)\}/);
  assert.doesNotMatch(wrapper,/scale=|useFrame|sendTransaction|localStorage/);
  assert.match(wrapper,/15_000/);assert.match(wrapper,/visibilitychange/);assert.match(wrapper,/loaded.connection===connection/);
});
