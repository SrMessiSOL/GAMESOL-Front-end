const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const filename = require('node:path').join(__dirname, '../src/commander-restoration.ts');
const mod = new Module(filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, filename);
const {restoredCommanderAsset: restore} = mod.exports;
const assets = [{id:'513'}, {id:'4016'}];
const saved = {commander:'game',record:{owner:'holder',asset:'513',verifiedAt:1n}};

test('late wallet read restores the current chain avatar instead of captured null',()=>{
  assert.equal(restore(assets,'holder',null,saved,'game'),'513');
  assert.equal(restore(assets,'holder','4016',saved,'game'),'513');
});
test('wallet reconnect before the chain read is reconciled by the later chain read',()=>{
  assert.equal(restore(assets,'holder',null,null,'game'),null);
  assert.equal(restore(assets,'holder','513',saved,'game'),'513');
});
test('chain selection never restores a transferred or unowned asset',()=>{
  assert.equal(restore([{id:'4016'}],'holder',null,saved,'game'),null);
  assert.equal(restore(assets,'other',null,saved,'game'),null);
  assert.equal(restore(assets,'holder',null,saved,'other-game'),null);
});
test('cleared identity and absent identity do not invent a selection',()=>{
  assert.equal(restore(assets,'holder',null,{commander:'game',record:{owner:'holder',asset:'513',verifiedAt:0n}},'game'),null);
  assert.equal(restore(assets,'holder','513',{commander:'game',record:{owner:'holder',asset:'513',verifiedAt:0n}},'game'),null);
  assert.equal(restore(assets,'holder',null,null,'game'),null);
});
