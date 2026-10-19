const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {Connection, PublicKey} = require('@solana/web3.js');
const {frontendLoader} = require('./frontend-ts-loader.cjs');
const load = frontendLoader();
const {GameClient} = load('game-state.ts');
const {preflightCommand} = load('command-preflight.ts');
const manifest = require('../src/alliance-lookup-table.json');

// Capture real client instructions, but prohibit signing and submission.
async function main() {
  const rpc = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'confirmed');
  assert.equal(await rpc.getGenesisHash(), manifest.genesis);
  const wallet = new PublicKey('G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r');
  const newcomer = new PublicKey('Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd');
  const home = new PublicKey('GmuTW6QrgNgbYUnu19j19prg2GQXc1Li7VhvynHx1bk4');
  const other = new PublicKey('9pNkMopmGczUVkTFYP73zRZpKQPZTtuSpZdz7A21H4JN');
  const payer = new PublicKey(manifest.sponsor);
  let captured;
  function clientFor(owner) {
    const client = new GameClient(rpc, {connection: rpc, wallet: {publicKey: owner,
      signTransaction: () => assert.fail('No signing'), signAllTransactions: () => assert.fail('No signing')},
    sendAndConfirm: () => assert.fail('No submission')});
    client.gameplayVaultExecutor = {vaultPublicKey: owner, payerPublicKey: payer, execute: () => assert.fail('No execution')};
    client.prepareVaultSigningForAuthority = async () => owner;
    for (const method of ['ensureQuestState', 'ensureQuestProgress', 'ensureQuestRewardTargets']) client[method] = async () => {};
    client.sendInstruction = client.sendVaultInstruction = async instructions => { captured = instructions; return 'simulation-only'; };
    return client;
  }
  const client = clientFor(wallet), fresh = clientFor(newcomer);
  const quest = await client.getQuestState(wallet);
  assert(quest);
  console.log(JSON.stringify({questState: quest}, (_, value) => typeof value === 'bigint' ? value.toString() : value));
  const cases = [
    ['Default duplicate colony-ship reward', () => client.claimQuest(home, 0, 20), 'QuestAlreadyClaimed'],
    ['Default duplicate daily check-in', () => client.claimQuest(home, 1, 0), 'DailyCheckInAlreadyClaimed'],
    ['Default duplicate monthly reward', () => client.claimQuest(home, 3, 1), 'QuestAlreadyClaimed'],
    ['NewAccount duplicate establish-command reward', () => fresh.claimQuest(other, 0, 0), 'QuestAlreadyClaimed'],
    ['NewAccount incomplete colony-ship objective', () => fresh.claimQuest(other, 0, 20), 'QuestRequirementsNotMet'],
    ['quest ID outside program range', () => client.claimQuest(home, 0, 255), 'InvalidQuest'],
    ['invalid period bypassing client integer guard', async () => {
      await client.claimQuest(home, 0, 20); captured[0].data[8] = 4;
    }, 'InvalidQuest'],
    ['another commander planet substituted in claim', async () => {
      await client.claimQuest(home, 0, 20); captured[0].keys[4].pubkey = other;
    }, 'Unauthorized'],
  ];
  const results = [];
  for (const [name, prepare, expected] of cases) {
    captured = null;
    await prepare(); assert(captured?.length);
    const keys = [...new Map(captured.flatMap(ix => ix.keys.map(key => [key.pubkey.toBase58(), key.pubkey]))).values()];
    const snapshot = async () => (await rpc.getMultipleAccountsInfo(keys)).map(a => a && ({lamports: a.lamports,
      owner: a.owner.toBase58(), hash: createHash('sha256').update(a.data).digest('hex')}));
    const before = await snapshot();
    let rejection;
    try { await preflightCommand(rpc, payer, captured); } catch (error) { rejection = error; }
    assert(rejection, `${name} unexpectedly accepted`);
    const guard = rejection.logs?.find(line => line.includes('Error Code:'));
    assert(guard?.includes(`Error Code: ${expected}.`), JSON.stringify({name, guard, logs: rejection.logs}));
    assert.deepEqual(await snapshot(), before);
    results.push({name, expected, guard, recordsUnchanged: true});
  }
  console.log(JSON.stringify({network: 'devnet', slot: await rpc.getSlot('confirmed'), submitted: false,
    signatureVerification: false, boundary: 'Unsigned program-rule checks, not wallet authentication or live claims', results}, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
