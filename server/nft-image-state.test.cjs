const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/CryptoUfos.tsx'), 'utf8');
const ast = ts.createSourceFile('reader.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'NftImage');
const code = ts.transpileModule(`${component.getText(ast)}\nexports.renderImage = NftImage;`, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX},
}).outputText;

for (const [complete, naturalWidth, expectedLoaded] of [[true, 256, true], [false, 0, false], [true, 0, false]]) {
  test(`artwork mount reconciles cached image complete=${complete}, width=${naturalWidth}`, () => {
    const states = [], effects = [];
    let cursor = 0;
    const target = {exports: {}};
    vm.runInNewContext(code, {
      exports: target.exports, require, LoaderCircle: () => null,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useRef: initial => ({current: initial === null ? {complete, naturalWidth} : initial}),
      useEffect: callback => effects.push(callback),
      window: {clearTimeout() {}},
    });
    const props = {asset: {image: '/real-nft', name: 'Real UFO'}};
    target.exports.renderImage(props);
    effects.shift()();
    assert.equal(states[1], expectedLoaded);
    cursor = 0;
    const result = target.exports.renderImage(props);
    assert.equal(Boolean(result.props.children[1]), !expectedLoaded);
  });
}
