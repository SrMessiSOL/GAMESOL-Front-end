const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PublicKey } = require('@solana/web3.js');
const { devnetConnection } = require('./ufo-devnet-rpc.cjs');

// Reuse the shipped decoder instead of introducing another account layout.
function decoder() {
  const filename = path.join(__dirname, '../src/game-state.ts');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const functions = new Set(['readU8', 'readU16', 'readU32', 'readU64', 'readI16', 'readI64', 'readPubkeyRaw', 'readFixedString', 'deserializeMission', 'deserializePlanetState', 'derivePlanetStatePda']);
  const constants = new Set(['PLANET_STATE_DISCRIMINATOR', 'MAX_PLANET_NAME_LEN', 'MAX_MISSION_COLONY_NAME_LEN', 'MAX_MISSIONS']);
  const declarations = source.statements.filter(node =>
    ts.isFunctionDeclaration(node) && functions.has(node.name?.text) ||
    ts.isVariableStatement(node) && node.declarationList.declarations.some(item => constants.has(item.name.getText(source)))
  ).map(node => node.getText(source));
  const code = ts.transpileModule(declarations.join('\n') + '\nmodule.exports = { deserializePlanetState, derivePlanetStatePda };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const program = new PublicKey('J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, PublicKey, GAME_STATE_PROGRAM_ID: program }, { filename });
  return { ...module.exports, program };
}

async function main() {
  const { connection } = await devnetConnection();
  const { deserializePlanetState, derivePlanetStatePda, program } = decoder();
  const commander = new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  const address = derivePlanetStatePda(commander, 0);
  const account = await connection.getAccountInfo(address, 'confirmed');
  if (!account || !account.owner.equals(program)) throw new Error('Planet account owner mismatch');
  const state = deserializePlanetState(Buffer.from(account.data));
  if (!state.authority.equals(commander)) throw new Error('Commander mismatch');
  console.log(JSON.stringify({
    network: 'devnet', account: address.toBase58(), programOwned: true,
    coordinates: `${state.galaxy}:${state.system}:${state.position}`,
    shipyard: state.shipyard, researchLab: state.researchLab,
    lightFighter: state.lightFighter, rocketLauncher: state.rocketLauncher,
    energyTechnology: state.energyTech,
    activeMissions: state.activeMissions,
    productionQueueFree: state.shipBuildItem === 255 && state.defenseBuildItem === 255,
    research: { item: state.researchQueueItem, targetLevel: state.researchQueueTarget,
      finishAtUtc: state.researchFinishTs > 0 ? new Date(state.researchFinishTs * 1000).toISOString() : null,
      minutesRemaining: Math.max(0, Math.ceil((state.researchFinishTs - Date.now() / 1000) / 60)) },
  }, null, 2));
}

if (require.main === module) main().catch(() => { console.error('Devnet checkpoint read failed; no transaction was sent.'); process.exitCode = 1; });
