const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {Connection, PublicKey, TransactionInstruction} = require('@solana/web3.js');
const load = require('./frontend-ts-loader.cjs').frontendLoader();
const {GameClient} = load('game-state.ts');
const {preflightCommand} = load('command-preflight.ts');
const manifest = require('../src/alliance-lookup-table.json');

async function main() {
  const rpc = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'confirmed');
  assert.equal(await rpc.getGenesisHash(), manifest.genesis);
  const owner = new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  const home = new PublicKey('GmuTW6QrgNgbYUnu19j19prg2GQXc1Li7VhvynHx1bk4');
  const colony = new PublicKey('CyKmBAd6FttU8szoaUEao1cY7iUQGEhZGCJaAW7wgkFD');
  const foreign = new PublicKey('9pNkMopmGczUVkTFYP73zRZpKQPZTtuSpZdz7A21H4JN');
  const payer = new PublicKey(manifest.sponsor);
  const client = new GameClient(rpc, {connection: rpc, wallet: {publicKey: owner,
    signTransaction: () => assert.fail('No signing'), signAllTransactions: () => assert.fail('No signing')},
  sendAndConfirm: () => assert.fail('No submission')});
  client.gameplayVaultExecutor = {vaultPublicKey: owner, payerPublicKey: payer, execute: () => assert.fail('No execution')};
  client.prepareVaultSigningForAuthority = async () => owner;
  for (const method of ['ensureQuestState', 'ensureQuestProgress', 'ensureQuestRewardTargets']) client[method] = async () => {};
  let captured;
  client.sendInstruction = client.sendVaultInstruction = async instructions => { captured = instructions; return 'simulation-only'; };
  const initialStoreState = await client.getStorePurchaseState(owner);
  const clone = ix => new TransactionInstruction({programId: ix.programId, keys: ix.keys.map(key => ({...key})), data: Buffer.from(ix.data)});
  const store = async (period, id) => {
    await client.purchaseStorePack(home, 1, 0);
    assert.equal(captured.length, 1, 'Existing purchase state must need no rent setup');
    const ix = clone(captured[0]); ix.data[8] = period; ix.data[9] = id; return ix;
  };
  const quest = async (planet, period, id) => {
    await client.claimQuest(planet, period, id); assert.equal(captured.length, 1); return clone(captured[0]);
  };
  const results = [];
  async function check(name, instructions, expected) {
    const keys = [...new Map([payer, ...instructions.flatMap(ix => ix.keys.map(key => key.pubkey))].map(key => [key.toBase58(), key])).values()];
    const snapshot = async () => (await rpc.getMultipleAccountsInfo(keys)).map(a => a && ({lamports: a.lamports,
      owner: a.owner.toBase58(), hash: createHash('sha256').update(a.data).digest('hex')}));
    const before = await snapshot(); let error;
    try { await preflightCommand(rpc, payer, instructions); } catch (caught) { error = caught; }
    const guard = error?.logs?.find(line => line.includes('Error Code:'));
    const code = guard?.match(/Error Code: ([^.]+)\./)?.[1] ?? null;
    if (expected === null) assert(!error, JSON.stringify({name, message:error?.message, logs:error?.logs}));
    else if (expected) assert.equal(code, expected, JSON.stringify({name, message:error?.message, logs:error?.logs}));
    else assert(!error || code, JSON.stringify({name, message:error?.message}));
    assert.deepEqual(await snapshot(), before, `${name}: accounts changed`);
    const lastInstruction = error?.logs?.filter(line => line.includes('Instruction:')).at(-1);
    const result = {name, allowed:!error, code, guard, lastInstruction, recordsUnchanged:true}; results.push(result); return result;
  }

  for (const period of [1, 2]) {
    const ix = await store(period, 0);
    await check(`period ${period} pack fits and can transfer test USDC in simulation`, [ix], null);
    await check(`period ${period} same pack twice in one atomic bundle`, [clone(ix),clone(ix)], 'StorePackAlreadyPurchased');
  }
  await check('daily and weekly same pack ID have independent limits', [await store(1,0),await store(2,0)], null);
  const colonyPack = await store(1,0); colonyPack.keys[3].pubkey = colony;
  await check('same-owner colony can receive an otherwise eligible pack', [clone(colonyPack)], null);
  await check('pack limit follows commander across planets', [await store(1,0),clone(colonyPack)], 'StorePackAlreadyPurchased');
  await check('monthly metal delivery exceeds current capacity', [await store(3,0)], 'ResourceCapExceeded');
  await check('monthly crystal delivery exceeds current capacity', [await store(3,1)], 'ResourceCapExceeded');
  await check('monthly deuterium delivery exceeds current capacity', [await store(3,2)], 'ResourceCapExceeded');
  await check('invalid raw store period', [await store(4,0)], 'InvalidStorePack');
  await check('invalid raw store ID', [await store(1,255)], 'InvalidStorePack');
  for (const period of [1,2,3]) await check(`period ${period} unsupported shield`, [await store(period,16)], 'InvalidStorePack');
  const wrongPlanet = await store(1,0); wrongPlanet.keys[3].pubkey = foreign;
  await check('store delivery cannot target another commander', [wrongPlanet], 'Unauthorized');
  const wrongTreasury = await store(1,0); wrongTreasury.keys[6].pubkey = wrongTreasury.keys[5].pubkey;
  await check('store payment cannot redirect treasury to buyer', [wrongTreasury], 'InvalidUsdcAccount');
  const wrongMint = await store(1,0); wrongMint.keys[4].pubkey = new PublicKey('FAeZLeqohcxNBpwGrbYBLj2TavFqt4353mT6qY6Z7YFh');
  await check('AM mint cannot substitute configured USDC mint', [wrongMint], 'InvalidUsdcMint');
  const wrongSource = await store(1,0); wrongSource.keys[5].pubkey = wrongSource.keys[6].pubkey;
  await check('buyer cannot pay with treasury token account', [wrongSource], 'ConstraintTokenOwner');

  const tutorial = await quest(home,0,10);
  await check('unclaimed tutorial objective is eligible', [tutorial], null);
  await check('unclaimed tutorial twice in atomic bundle rolls back', [clone(tutorial),clone(tutorial)], 'QuestAlreadyClaimed');
  await check('tutorial replay cannot switch to another owned planet', [clone(tutorial),await quest(colony,0,10)], 'QuestAlreadyClaimed');
  let boundQuest = null;
  for (let id=0;id<12;id++) {
    const result = await check(`monthly quest ${id} on same-owner colony`, [await quest(colony,3,id)], undefined);
    if (result.code === 'WrongQuestRewardPlanet') {boundQuest=id; break;}
  }
  assert.notEqual(boundQuest,null,'No eligible same-owner reward-target rejection found; gate remains untested');
  await check(`monthly quest ${boundQuest} on bound homeworld`, [await quest(home,3,boundQuest)], null);
  // These deliveries fit individually and together but leave little fuel room.
  // All transfers and credits exist only inside unsigned simulation.
  const fill = [];
  for (const [period,id] of [[1,0],[1,1],[1,2],[1,3],[1,4],[2,0],[2,1],[2,2],[2,3]]) fill.push(await store(period,id));
  await check('virtual deliveries fit before quest-capacity test', fill.map(clone), null);
  const recurringOverflow = await check('monthly reward rejects after virtual storage fill', [...fill.map(clone),await quest(home,3,boundQuest)], 'ResourceCapExceeded');
  assert(recurringOverflow.lastInstruction?.includes('ClaimQuestVault'), 'The quest, not a preceding store pack, must reject overflow');
  await check('tutorial reward still fits near capacity', [...fill.map(clone),clone(tutorial)], null);
  const tutorialOverflow = await check('second distinct tutorial reward exceeds remaining storage', [...fill.map(clone),clone(tutorial),await quest(home,0,12)], 'ResourceCapExceeded');
  assert(tutorialOverflow.lastInstruction?.includes('ClaimQuestVault'));
  const report = {network:'devnet',slot:await rpc.getSlot('confirmed'),submitted:false,signatureVerification:false,initialStoreState,
    boundary:'Unsigned simulations only, including virtual token transfers and atomic rollback; not signed settlement, live races or observed reset boundaries',results};
  const json = JSON.stringify(report,(_, value)=>typeof value==='bigint'?value.toString():value,2);
  if (process.argv.includes('--report')) require('node:fs').writeFileSync(require('node:path').join(__dirname,'../docs/store-quest-edges-devnet-2026-10-19.json'),json+'\n');
  console.log(json);
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
