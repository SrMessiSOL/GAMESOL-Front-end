const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=require('./frontend-ts-loader.cjs').frontendLoader();
const {shortPlanetOwner}=load('planet-owner.ts');
const {createUniverseSnapshotFromChainData}=load('universe-data.ts');

test('owner labels preserve base58 case and both identifying ends',()=>{
  const address='G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r';
  assert.equal(shortPlanetOwner(address),'G6tR...7s6r');
  assert.equal(shortPlanetOwner(''),'Unknown owner');
});

test('map owner label is current authority, not planet name or original creator',()=>{
  const source={entity:'colony',name:'Original Owner Colony',owner:'G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r',galaxy:9,system:427,position:14,planetIndex:1,protectionUntilTs:0};
  const first=createUniverseSnapshotFromChainData([source]).planets[0];
  assert.equal(first.ownerLabel,'G6tR...7s6r');assert.equal(first.ownerAddress,source.owner);
  const transferred=createUniverseSnapshotFromChainData([{...source,owner:'Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd'}]).planets[0];
  assert.equal(transferred.ownerLabel,'Fv9x...Rvdd');assert.notEqual(transferred.ownerAddress,first.ownerAddress);
});

test('system selection and orbital tooltips expose foreign owners without changing own-world labels',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/UniverseLab.tsx'),'utf8');
  assert.match(source,/selected\.faction !== "owned" && <span className="orbit-owner"/);
  assert.match(source,/title=\{selected\.ownerAddress \?\? selected\.ownerLabel\}/);
  assert.match(source,/Owner <strong>\{selected\.ownerLabel\}<\/strong>/);
  assert.match(source,/Owner \$\{planet\.ownerAddress \?\? planet\.ownerLabel\}/);
  assert.match(source,/planet\.faction === "owned" \? "YOUR WORLD" : `Owner \$\{planet\.ownerLabel\}`/);
});

test('owner row contains long names or addresses without changing button width or address case',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/universe-lab.css'),'utf8');
  assert.match(css,/\.orbit-selection \.orbit-owner strong\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*text-transform:none/);
});
