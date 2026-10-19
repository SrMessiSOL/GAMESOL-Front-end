// Sequential, non-signing regression batch. Never invoke wallet or deployment scripts here.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(root, 'docs', 'test-runs', stamp);
fs.mkdirSync(directory, {recursive: true});
const devnet = process.argv.includes('--devnet');
const jobs = devnet ? [
  ['planet-market-replay', ['T25', 'T35'], ['server/check-planet-market-guards.cjs']],
  ['alliance-permissions', ['T18'], ['server/check-alliance-permission-guards.cjs']],
  ['alliance-infrastructure', ['T20', 'T21'], ['server/check-alliance-infrastructure-guards.cjs']],
] : [
  ['frozen-scope', [], ['server/testing-scope.cjs']],
  ['frontend-regressions', ['T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12', 'T13', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T22', 'T23', 'T24', 'T25', 'T27', 'T28', 'T29', 'T33', 'T35'],
    ['--test', '--test-concurrency=1', ...['server', 'api'].flatMap(folder => fs.readdirSync(path.join(root, folder)).filter(file => file.endsWith('.test.cjs')).sort().map(file => `${folder}/${file}`))]],
];
const report = {startedAt: new Date().toISOString(), mode: devnet ? 'unsigned-devnet-simulations' : 'local-automated', submitted: false, signed: false, results: []};
for (const [name, checklist, args] of jobs) {
  const result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024});
  const log = `${result.stdout || ''}\n${result.stderr || ''}`;
  fs.writeFileSync(path.join(directory, `${name}.log`), log);
  const tests = /(?:# |ℹ )tests (\d+)/.exec(log)?.[1];
  report.results.push({name, checklist, exitCode: result.status, passed: result.status === 0, tests: tests ? Number(tests) : null, error: result.error?.code || null, log: `${name}.log`});
  console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}${tests ? ` (${tests} tests)` : ''}`);
}
report.finishedAt = new Date().toISOString();
report.boundary = 'These results do not close a checklist family, prove wallet authentication, or certify signed settlement/UI/device coverage. Failures require diagnosis; historical state fixtures can become stale.';
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Evidence: ${directory}`);
process.exitCode = report.results.every(result => result.passed) ? 0 : 1;
