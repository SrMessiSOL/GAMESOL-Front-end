const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Read-only rehearsal of the real frontend clients. Never loads browser state,
// credentials or environment files. Wallet methods must be supplied by the test.
function frontendLoader() {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(__dirname, '../src', filename);
    if (!filename.endsWith('.ts')) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports:{}};
    cache.set(filename,module);
    const code = ts.transpileModule(fs.readFileSync(filename,'utf8'),{
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
      transformers:{before:[context=>{
        const visit=node=>ts.isMetaProperty(node) && node.keywordToken===ts.SyntaxKind.ImportKeyword
          ? ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('env',ts.factory.createObjectLiteralExpression())])
          : ts.visitEachChild(node,visit,context);
        return file=>ts.visitNode(file,visit);
      }]},
    }).outputText;
    const localRequire=name=>name.startsWith('.') ? load(path.resolve(path.dirname(filename),name)) : require(name);
    vm.runInNewContext(code,{module,exports:module.exports,require:localRequire,Buffer,console,TextEncoder,TextDecoder,
      URL,Date,Math,Error,BigInt,WeakMap,Map,Set,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,fetch,crypto:globalThis.crypto}, {filename});
    return module.exports;
  }
  return load;
}
module.exports={frontendLoader};
