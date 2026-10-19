const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PublicKey} = require('@solana/web3.js');
const load = require('./frontend-ts-loader.cjs').frontendLoader();
const {dailyCheckInReward} = load('quest-rewards.ts');
const {rewardStorageBlock} = load('command-validation.ts');
const now = 20745 * 86400 + 100;

test('first and missed-day rewards restart at streak one', () => {
  for (const q of [null, {dailyCheckinDay:20740,dailyCheckinStreak:2}])
    assert.equal(JSON.stringify(dailyCheckInReward(q,now)), JSON.stringify({metal:550,crystal:325,deuterium:110}));
});
test('consecutive day increments; claimed day does not quote tomorrow', () => {
  assert.equal(dailyCheckInReward({dailyCheckinDay:20744,dailyCheckinStreak:2},now).metal,650);
  assert.equal(dailyCheckInReward({dailyCheckinDay:20745,dailyCheckinStreak:2},now).metal,600);
});
test('bonus caps at 30 and changes precisely at UTC midnight', () => {
  const q={dailyCheckinDay:20744,dailyCheckinStreak:100};
  assert.equal(JSON.stringify(dailyCheckInReward(q,now)),JSON.stringify({metal:2000,crystal:1050,deuterium:400}));
  const streak={dailyCheckinDay:20744,dailyCheckinStreak:1};
  assert.equal(dailyCheckInReward(streak,20745*86400-1).metal,550);
  assert.equal(dailyCheckInReward(streak,20745*86400).metal,600);
  assert.equal(dailyCheckInReward(streak,20746*86400).metal,550);
});
test('all three storage caps include bonus; exact fit allowed and one over blocked', () => {
  const reward=dailyCheckInReward(null,now);
  const r={metal:450n,crystal:675n,deuterium:890n,metalCap:1000n,crystalCap:1000n,deuteriumCap:1000n};
  assert.equal(rewardStorageBlock(reward,r),null);
  for(const field of ['metal','crystal','deuterium'])
    assert.equal(rewardStorageBlock(reward,{...r,[field]:r[field]+1n}),`Needs ${field} storage`);
  assert.equal(rewardStorageBlock({metal:500,crystal:300,deuterium:100},{...r,metal:451n}),null);
});
test('actual client blocks overflow before account setup, signing or sending', async () => {
  const {GameClient}=load('game-state.ts');
  const key=PublicKey.default,client=new GameClient({}, {wallet:{publicKey:key}});
  client.loadPlanetStateByPda=async()=>({planet:{owner:key.toBase58()},resources:{metal:451n,crystal:0n,deuterium:0n,metalCap:1000n,crystalCap:1000n,deuteriumCap:1000n,lastUpdateTs:0}});
  client.getQuestState=async()=>({dailyCheckinDay:0,dailyCheckinStreak:1});
  client.ensureQuestProgress=()=>assert.fail('No account setup');
  client.prepareVaultSigningForAuthority=()=>assert.fail('No signing');
  client.sendVaultInstruction=()=>assert.fail('No submission');
  await assert.rejects(client.dailyCheckIn(key),/Needs metal storage/);
});
test('both views use shared dynamic reward and UTC reset copy', () => {
  const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8');
  const planet=fs.readFileSync(path.join(__dirname,'../src/PlanetWorld.tsx'),'utf8');
  assert.match(app,/Resets daily at 00:00 UTC/);
  assert.doesNotMatch(app,/Claim once every 24 hours/);
  for(const source of [app,planet]) assert.match(source,/activeQuestDefinitions\(nowTs, questProgress, questState\)/);
  assert.match(planet,/rewardStorageBlock\(quest.reward, resource\)/);
});

test('actual client permits exact fit and rejects already-claimed or unreadable data', async () => {
  const {GameClient}=load('game-state.ts');
  const key=PublicKey.default,client=new GameClient({}, {wallet:{publicKey:key}});
  let quest={dailyCheckinDay:Math.floor(Date.now()/1000/86400)-1,dailyCheckinStreak:1};
  let setup=0,signing=0;
  client.loadPlanetStateByPda=async()=>({planet:{owner:key.toBase58()},resources:{metal:400n,crystal:650n,deuterium:880n,metalCap:1000n,crystalCap:1000n,deuteriumCap:1000n,lastUpdateTs:0}});
  client.getQuestState=async()=>quest;
  client.ensureQuestProgress=async()=>{setup++;};
  client.prepareVaultSigningForAuthority=async()=>{signing++;};
  client.sendVaultInstruction=async()=> 'captured-only';
  assert.equal(await client.dailyCheckIn(key),'captured-only');
  assert.equal(setup,1);assert.equal(signing,1);
  quest={dailyCheckinDay:Math.floor(Date.now()/1000/86400),dailyCheckinStreak:2};
  await assert.rejects(client.dailyCheckIn(key),/already claimed/);
  quest=null;
  await assert.rejects(client.dailyCheckIn(key),/could not be loaded/);
  assert.equal(setup,1);assert.equal(signing,1);
});
