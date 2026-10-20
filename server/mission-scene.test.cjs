const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.join(__dirname,'../src');
function load(name,imports={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:id=>{assert(id in imports,id);return imports[id];},Date,Math,Map,Set,BigInt});return exports;}
const data=load('universe-data',{'./planet-style':{planetClassForPosition:()=> 'terran'},'./planet-owner':load('planet-owner')});
const scene=load('mission-scene',{'./universe-data':data});
test('empty colony destinations retain authoritative galaxy/system/position and distinct slot IDs',()=>{
  const now=Math.floor(Date.now()/1000),mission=position=>({missionType:5,departTs:now-10,arriveTs:now+90,returnTs:now+190,targetGalaxy:9,targetSystem:427,targetPosition:position,applied:false});
  const snapshot=data.createUniverseSnapshotFromChainData([{entity:'home',owner:'owner',name:'Home',galaxy:9,system:427,position:13,planetIndex:0,metal:0n,crystal:0n,deuterium:0n,protectionUntilTs:0,missions:[mission(1),mission(2)]}]);
  assert.equal(snapshot.missions.length,2);assert.notEqual(snapshot.missions[0].id,snapshot.missions[1].id);
  assert.deepEqual({...snapshot.missions[0].destinationPosition},{galaxy:9,system:427,position:1});
  assert(scene.missionDestinationIsLocal(snapshot.missions[0],9,427));assert(!scene.missionDestinationIsLocal(snapshot.missions[0],9,428));
  assert.equal(snapshot.missions[0].sampledAt,now);
});
test('empty endpoint uses exactly the visible slot orbit, including presentation scale and star clearance',()=>{
  for(const position of [1,2,8,15]){
    const base=data.orbitForSystemPosition(position,9427),orbit=scene.emptySystemDisplayOrbit(position,9,427,1.6,18);
    assert.equal(orbit.radius,base.radius*1.3*1.6+18);assert.equal(orbit.phase,base.phase-(base.ascendingNode??0));assert.equal(orbit.angularVelocity,base.angularVelocity*.12);
    assert.notDeepEqual([...data.pointOnUniverseOrbit(orbit,orbit.phase)],[...data.pointOnUniverseOrbit(orbit,orbit.phase+600*orbit.angularVelocity)]);
  }
});
test('mission progress advances only since its snapshot, not since the scene mounted',()=>{
  const mission={phase:'outbound',progress:.4,durationSeconds:100,sampledAt:1000};
  assert.equal(scene.missionJourneyProgress(mission,1000,1),.4);assert.equal(scene.missionJourneyProgress(mission,1010,1),.5);
  assert.equal(scene.missionJourneyProgress({...mission,progress:.5,sampledAt:1010},1010,1),.5);
  assert.equal(scene.missionJourneyProgress({...mission,phase:'returning'},1010,1),.5);
  assert.equal(scene.missionJourneyProgress(mission,900,1),.4);assert.equal(scene.missionJourneyProgress(mission,1200,1),1);
  assert.equal(scene.missionJourneyProgress({...mission,phase:'arrived'},1000,1),1);
});
test('actual route and slot renderer share the orbit helper and allow destinations without a planet account',()=>{
  const source=fs.readFileSync(path.join(root,'UniverseLab.tsx'),'utf8');
  assert.match(source,/destinationHere = .*missionDestinationIsLocal/);
  assert.match(source,/destinationOrbit\.phase \+ elapsed \* mission\.destinationOrbit\.angularVelocity/);
  assert.match(source,/planet\?\.orbit \?\? emptySystemDisplayOrbit/);
  assert.match(source,/missionJourneyProgress\(mission, Date\.now\(\) \/ 1000/);
  assert.doesNotMatch(source,/mission\.progress \+ elapsedProgress|navigationRailOpen|navigation-rail-toggle/);
});

test('cross-system entry stays just outside the orbital boundary instead of hundreds of units away',()=>{
  for(const radius of [40,90,160]) {
    const point=scene.systemEntryPoint('incoming-colony',radius);
    assert(Math.abs(Math.hypot(point[0],point[2])-(radius+12))<1e-8);
    assert.equal(point.join(','),scene.systemEntryPoint('incoming-colony',radius).join(','));
  }
});

test('real fleet stays readable at desktop and mobile zoom without unbounded scaling',()=>{
  assert.equal(scene.readableFleetScale(2,50,1000),1);
  assert(scene.readableFleetScale(150,50,844)>1);
  assert.equal(scene.readableFleetScale(10000,50,320),16);
  const source=fs.readFileSync(path.join(root,'UniverseLab.tsx'),'utf8');
  assert.match(source,/vessel\.current\.scale\.setScalar\(readableFleetScale/);
  assert.match(source,/if \(!point\.waiting\) return null/);
  assert.match(source,/remote\.set\(direction\.x \/ extent \* \.88/);
  assert.match(source,/Colony ship/);
});
