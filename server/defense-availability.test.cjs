const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const validation=fs.readFileSync(path.join(__dirname,'../src/command-validation.ts'),'utf8');
const moduleObject={exports:{}};
new Function('module','exports',ts.transpileModule(validation,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(moduleObject,moduleObject.exports);
const {defenseProductionBlock}=moduleObject.exports;
const source=fs.readFileSync(path.join(__dirname,'../src/PlanetWorld.tsx'),'utf8');
const ast=ts.createSourceFile('PlanetWorld.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),definitions={};
function visit(node){if(ts.isVariableDeclaration(node)&&['allDefenseOptions','defenseOptions'].includes(node.name.getText(ast)))definitions[node.name.getText(ast)]=node.initializer.getText(ast);ts.forEachChild(node,visit);}
visit(ast);
assert(definitions.allDefenseOptions&&definitions.defenseOptions);
const body=ts.transpileModule(`function options(DEFENSE,state,quantity,showLockedDefenses){const requirementRows=()=>[];const requirementsMet=()=>true;const canAfford=()=>true;const DEFENSE_REQUIREMENTS={};const allDefenseOptions=${definitions.allDefenseOptions};const defenseOptions=${definitions.defenseOptions};return {allDefenseOptions,defenseOptions};}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const options=new Function('defenseProductionBlock',body+';return options;')(defenseProductionBlock);
const catalog=['rocketLauncher','lightLaser','heavyLaser','gaussCannon','ionCannon','plasmaTurret','smallShieldDome','largeShieldDome','antiBallisticMissile','interplanetaryMissile'].map(key=>({key,cost:[1,1,1]}));
test('actual defense options never mark unsupported missiles ready, even with every prerequisite and resource',()=>{
  const normal=options(catalog,{planet:{}},1,false),all=options(catalog,{planet:{}},1,true);
  assert.equal(normal.defenseOptions.length,8);assert.equal(all.defenseOptions.length,10);
  for(const row of all.allDefenseOptions.slice(8)){assert.equal(row.ready,false);assert.equal(row.blockReason,'Unavailable');}
});
test('actual defense options reject multiple domes and retain existing legacy inventory as read-only',()=>{
  const multiple=options(catalog,{planet:{}},2,true);
  assert.equal(multiple.allDefenseOptions[0].ready,true);
  for(const row of multiple.allDefenseOptions.slice(6,8)){assert.equal(row.ready,false);assert.equal(row.blockReason,'One shield dome only');}
  const existing=options(catalog,{planet:{smallShieldDome:1,antiBallisticMissile:2}},1,false);
  assert.equal(existing.allDefenseOptions[6].ready,false);
  assert(existing.defenseOptions.some(x=>x.index===8));assert.equal(existing.allDefenseOptions[8].ready,false);
  assert(source.includes('blockReason.toUpperCase()'));assert(source.includes('shipyardUpgrading || !ready'));
});
