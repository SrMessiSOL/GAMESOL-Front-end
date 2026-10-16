const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const {Keypair} = require('@solana/web3.js');
const source = ts.createSourceFile('session.ts', fs.readFileSync(path.join(__dirname,'../src/player-funded-session.ts'),'utf8'), ts.ScriptTarget.Latest, true);
const names = ['sessionStorageKey','readStoredSession','writeStoredSession','keypairFromStored','ensurePlayerFeeSession'];
const functions = source.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(source)).join('\n');
function reader(storage = new Map(), game = 'game') {
  const context = {Keypair, SESSION_STORAGE_KEY:'lazorkit-session', GAME_STATE_PROGRAM_ID:{toBase58:()=>game}, MARKET_PROGRAM_ID:{toBase58:()=> 'market'},
    window:{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}}, exports:{}};
  vm.runInNewContext(ts.transpileModule(functions,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+
    '\nexports.read=readStoredSession; exports.write=writeStoredSession; exports.ensure=ensurePlayerFeeSession; exports.key=sessionStorageKey;',context);
  return {...context.exports,storage};
}
test('switch A to B to A and restart preserves each account session key and state',()=>{
  const first=reader();
  const a=first.ensure('a'); first.write({...a,active:true,sessionPda:'session-a',expiresAt:'100'});
  const b=first.ensure('b'); first.write({...b,active:true,sessionPda:'session-b',expiresAt:'200'});
  assert.notEqual(a.publicKey,b.publicKey);
  const reopened=reader(first.storage);
  assert.equal(reopened.ensure('a').publicKey,a.publicKey);
  assert.equal(reopened.read('a').sessionPda,'session-a');
  assert.equal(reopened.read('b').sessionPda,'session-b');
  reopened.write({...reopened.read('a'),active:false,sessionPda:undefined});
  assert.equal(reader(first.storage).read('a').active,false);
  assert.equal(reader(first.storage).read('b').active,true);
});
test('legacy migration is matching-account only and cannot overwrite a newer revocation',()=>{
  const f=reader(); const a=f.ensure('a');
  f.storage.delete(f.key('a')); f.storage.set('lazorkit-session',JSON.stringify({...a,active:true}));
  assert.equal(f.read('b'),null);
  assert.equal(f.read('a').publicKey,a.publicKey);
  f.write({...a,active:false});
  assert.equal(reader(f.storage).read('a').active,false);
});
test('substituted records, corrupt keys and other program scopes cannot restore access',()=>{
  const f=reader();const a=f.ensure('a');
  f.storage.set(f.key('b'),JSON.stringify(a));assert.equal(f.read('b'),null);
  f.storage.set(f.key('a'),JSON.stringify({...a,publicKey:Keypair.generate().publicKey.toBase58()}));assert.equal(f.read('a'),null);
  assert.equal(reader(f.storage,'other-game').read('a'),null);
});
