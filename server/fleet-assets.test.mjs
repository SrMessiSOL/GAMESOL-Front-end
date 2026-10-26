import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/FleetVessel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require });
const { FLEET_HULLS } = exports;

test('strategic fleet scale remains readable, bounded and finite across camera distances', () => {
  const scale = exports.strategicFleetScale;
  assert.equal(scale(0,50,800,9),9);
  assert.ok(scale(4000,50,800,9)>9);
  assert.equal(scale(1e9,50,800,9),128);
  assert.equal(scale(NaN,50,800,9),1);
  assert.ok(Number.isFinite(scale(100,50,0,1)));
});

test('all four fleet roles have distinct finite lightweight +Y hull geometry', () => {
  const signatures = new Set();
  for (const [role, geometry] of Object.entries(FLEET_HULLS)) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const minimumLength=role==='espionage'?.35:.8;
    assert.ok(box.max.y > minimumLength && box.min.y < -minimumLength, role);
    assert.ok(box.max.z - box.min.z > .08, role);
    const positions = geometry.getAttribute('position');
    assert.ok(positions.count / 3 < 250, `${role} triangle budget`);
    assert.ok([...positions.array].every(Number.isFinite));
    signatures.add(JSON.stringify([...positions.array]));
  }
  assert.equal(signatures.size, 4);
});

test('distant fleets use at most three meshes and share geometry/materials across instances', () => {
  function meshes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(meshes);
    return [...(node.type === 'mesh' ? [node] : []), ...meshes(node.props?.children)];
  }
  for (const kind of Object.keys(FLEET_HULLS)) {
    const first = meshes(exports.FleetVessel({kind,compact:true}));
    const second = meshes(exports.FleetVessel({kind,compact:true}));
    assert.ok(first.length <= 3);
    first.forEach((node,index) => {
      assert.equal(node.props.geometry, second[index].props.geometry);
      assert.equal(node.props.material, second[index].props.material);
    });
  }
});

test('public, system, galaxy and universe share the fleet model without new lights or movement authority', () => {
  const source = fs.readFileSync(new URL('../src/FleetVessel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /pointLight|useFrame|fetch\(|sendTransaction/);
  assert.match(source, /compact \? distant : armor/);
  const game = fs.readFileSync(new URL('../src/UniverseLab.tsx', import.meta.url), 'utf8');
  assert.match(game, /return <FleetVessel kind=\{kind\} shipClass=\{shipClass\} color=\{color\} compact=\{compact\}/);
  assert.match(game, /ref=\{dot\} scale=\{size \* 1\.8\}><FleetVessel/);
  assert.match(game, /if \(mission.phase === 'returning'\) tangent.negate\(\)/);
  const publicPage = fs.readFileSync(new URL('../src/PublicWorld.tsx', import.meta.url), 'utf8');
  assert.match(publicPage, /<FleetVessel/);
});

test('all fourteen catalog classes have distinct finite bounded navigation hulls', () => {
  assert.equal(Object.keys(exports.FLEET_CLASS_HULLS).length,14);
  const signatures = new Set();
  for(const geometry of Object.values(exports.FLEET_CLASS_HULLS)) {
    const positions=geometry.getAttribute('position');
    assert.ok(positions.count/3<300);
    assert.ok([...positions.array].every(Number.isFinite));
    signatures.add(JSON.stringify([...positions.array]));
  }
  assert.equal(signatures.size,14);
});

test('original spherical hulls, cargo stacks and colony habitat retain their volumes',()=>{
  for(const key of ['deathstar','espionageProbe']){
    const g=exports.FLEET_CLASS_HULLS[key];g.computeBoundingBox();const b=g.boundingBox;
    assert.ok(Math.abs((b.max.x-b.min.x)-(b.max.z-b.min.z))<.05,key);
  }
  const colony=exports.FLEET_MODELS.colonyShip.glass;colony.computeBoundingBox();assert.ok(colony.boundingBox.max.z>.65);
  const cargo=exports.FLEET_MODELS.largeCargo.plating;cargo.computeBoundingBox();assert.ok(cargo.boundingBox.max.z>.85);
  const capital=exports.FLEET_CLASS_HULLS.battlecruiser;capital.computeBoundingBox();assert.ok(capital.boundingBox.max.z-capital.boundingBox.min.z>.6);
  assert.equal(exports.FLEET_MODELS.deathstar.engines.getAttribute('position').count,0);
  assert.equal(exports.FLEET_MODELS.solarSatellite.engines.getAttribute('position').count,0);
});

test('all class-specific distant silhouettes stay below 300 triangles with shared two-mesh rendering',()=>{
  function meshes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(meshes);return [...(node.type==='mesh'?[node]:[]),...meshes(node.props?.children)];}
  for(const [key,model]of Object.entries(exports.FLEET_MODELS)){
    assert.ok(model.compact.getAttribute('position').count/3<300,key);
    assert.ok([...model.compact.getAttribute('position').array].every(Number.isFinite),key);
    const first=meshes(exports.FleetVessel({kind:'attack',shipClass:key,compact:true})),second=meshes(exports.FleetVessel({kind:'attack',shipClass:key,compact:true}));
    assert.equal(first.length,2,key);first.forEach((mesh,i)=>{assert.equal(mesh.props.geometry,second[i].props.geometry);assert.equal(mesh.props.material,second[i].props.material);});
  }
});

test('catalog delivers every enabled class once using separate optimized artwork', () => {
  const catalog=fs.readFileSync(new URL('../src/ship-catalog.ts',import.meta.url),'utf8');
  const keys=[...catalog.matchAll(/\{key:'([^']+)'/g)].map(m=>m[1]);
  assert.equal(keys.length,14); assert.equal(new Set(keys).size,14);
  const source=ts.createSourceFile('game-state.ts',fs.readFileSync(new URL('../src/game-state.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  let canonical=[];
  function visit(node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='SHIPS') {
      let initializer=node.initializer;
      while(ts.isAsExpression(initializer)||ts.isTypeAssertionExpression(initializer)) initializer=initializer.expression;
      assert.ok(ts.isArrayLiteralExpression(initializer));
      canonical=initializer.elements.map(element=>element.properties.find(property=>property.name?.getText(source)==='key').initializer.text);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  assert.deepEqual([...keys].sort(),[...canonical].sort());
  const imports=[...catalog.matchAll(/import (\w+) from '([^']+\.webp)'/g)];
  assert.equal(imports.length,16);
  for(const [,name,file] of imports) {
    const data=fs.readFileSync(new URL('../src/'+file.replace(/^\.\//,''),import.meta.url));
    assert.equal(data.subarray(0,4).toString(),'RIFF',name);
    assert.equal(data.subarray(8,12).toString(),'WEBP',name);
    assert.ok(data.length<650000,`${name} delivery budget`);
  }
  const ui=fs.readFileSync(new URL('../src/ui-art.ts',import.meta.url),'utf8');
  assert.match(ui,/fleetArt\.get\(toLookupKey\(key\)\)/);
  assert.doesNotMatch(ui,/SHIP_BACKDROPS.hangar/);
  const shipImports=imports.filter(([,name])=>!['hangar','space'].includes(name));
  assert.equal(shipImports.length,14);
  for(const [,name,file]of shipImports)assert.match(file,/^\.\/assets\/ui\//,`${name} preserves original artwork`);
});

test('live mission artwork is dimension-bounded instead of using intrinsic image size', () => {
  const css=fs.readFileSync(new URL('../src/ship-artwork.css',import.meta.url),'utf8');
  assert.match(css,/\.pw-mission-badge\{[^}]*width:64px;height:64px;[^}]*overflow:hidden/);
  assert.match(css,/\.pw-launch-type-art\{height:40px;overflow:hidden\}/);
  assert.match(css,/\.pw-mission-badge img,\.pw-launch-type-art img\{[^}]*width:100%;height:100%;[^}]*object-fit:contain!important/);
});

test('mission hull selection uses real positive ship counts and never invents satellites in flight', () => {
  const source=fs.readFileSync(new URL('../src/fleet-identity.ts',import.meta.url),'utf8');
  const scope={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,scope);
  const select=scope.exports.missionShipClass;
  assert.equal(select({sLightFighter:3},'attack'),'lightFighter');
  assert.equal(select({sLightFighter:3,sDestroyer:1},'attack'),'destroyer');
  assert.equal(select({sColonyShip:1,sLargeCargo:2},'colonize'),'colonyShip');
  assert.equal(select({sEspionageProbe:2,sCruiser:1},'espionage'),'espionageProbe');
  assert.equal(select({sLargeCargo:1},'transport'),'largeCargo');
  assert.equal(select({sLargeCargo:-1,sDestroyer:NaN,sSolarSatellite:1},'attack'),undefined);
  assert.equal(select({},'attack'),undefined);
});
