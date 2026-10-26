import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import ts from 'typescript';
import {loadEnv,build} from 'vite';

const [host,moduleName]=process.argv.slice(2);
assert.match(host,/^[a-z0-9-]+\.vercel\.app$/);
assert.match(moduleName,/^ui-art-[A-Za-z0-9_-]+\.js$/);
const response=await fetch(`https://${host}/assets/${moduleName}`,{signal:AbortSignal.timeout(30000)});
assert.equal(response.status,200);
const ast=ts.createSourceFile('deployed.js',await response.text(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const metadata={};
function visit(node){
  if(ts.isPropertyAssignment(node)&&ts.isIdentifier(node.name)&&node.name.text.startsWith('VITE_VERCEL_')){
    assert(ts.isStringLiteralLike(node.initializer));metadata[node.name.text]=node.initializer.text;
  }
  ts.forEachChild(node,visit);
}
visit(ast);assert(Object.keys(metadata).length>0);
Object.assign(process.env,loadEnv('production',resolve('.vercel'),''));
for(const key of Object.keys(process.env).filter(key=>key.startsWith('VITE_'))){
  process.env[key]=process.env[key].replaceAll(String.fromCharCode(92,114,10),String.fromCharCode(13,10));
}
Object.assign(process.env,metadata,{VERCEL:'1',VERCEL_URL:host});
console.log(`Reproducing build with ${Object.keys(metadata).length} public Vercel metadata fields; no settings changed.`);
await build({mode:'passkey'});
