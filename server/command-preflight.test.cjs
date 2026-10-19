const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const web3 = require('@solana/web3.js');
const path = require('node:path');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports, require, Error, BigInt, WeakMap});
  return exports;
}
const {preflightCommand, commandPreflightMessage} = load('command-preflight.ts');
const {assertCommandInteger, assertResourceAmount, constructionBlockReason, rewardStorageBlock, storePackBlock} = load('command-validation.ts');
const payer = web3.Keypair.generate().publicKey;
const instruction = web3.SystemProgram.transfer({fromPubkey:payer,toPubkey:web3.Keypair.generate().publicKey,lamports:1});
const genesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
function rpc(overrides={}) {
  return {getGenesisHash:async()=>genesis,getLatestBlockhash:async()=>({blockhash:web3.PublicKey.default.toBase58()}),
    simulateTransaction:async()=>({value:{err:null,logs:[]}}),...overrides};
}
for (const [code, words] of [
  ['ResourceCapExceeded',/storage/],['InsufficientMetal',/metal/],['InsufficientCrystal',/crystal/],
  ['InsufficientDeuterium',/deuterium/],['InsufficientUsdc',/USDC/],['InsufficientAntimatter',/ANTIMATTER/],
  ['QueueBusy',/construction/],['ResearchQueueBusy',/research/],['ShipyardQueueBusy',/ship or defense/],
  ['NoFields',/fields/],['TechLocked',/requirements/],['LabTooLow',/requirements/],['ShipyardTooLow',/requirements/],
  ['BuildNotFinished',/progress/],['NoShipBuild',/no queued/],['MissionInFlight',/not arrived/],
  ['NoMissionSlot',/mission slot/],['ExceedsCargo',/capacity/],['MissingColonyShip',/Colony Ship/],
  ['NewPlayerProtected',/shield/],['CannotAttackOwnPlanet',/another commander/],['AttackCooldown',/cooldown/],
  ['QuestAlreadyClaimed',/already/],['WrongQuestRewardPlanet',/planet/],['QuestRequirementsNotMet',/requirements/],
  ['StorePackAlreadyPurchased',/already/],['StoreDisabled',/unavailable/],['NoAccelerationNeeded',/acceleration/],
  ['AllianceTreasuryNotEnoughResources',/treasury/],['AllianceFull',/member slots/],['NotInAlliance',/Join/],
  ['AllianceLeaderRequired',/leader/],['AllianceJoinRequestNotFound',/pending/],['PlanetHasActiveMissions',/missions/],
  ['HomeworldNotSellable',/homeworld/],['AlreadyFilled',/no longer/],['VaultAuthorizationExpired',/authorization/],
]) test(`${code} becomes a friendly pre-signing blocker`,()=>{
  const result = commandPreflightMessage([`Program log: AnchorError. Error Code: ${code}. Error Number: 6000.`]);
  assert.match(result, words); assert.match(result,/Nothing was submitted\.$/); assert(!result.includes(code));
});
test('unknown diagnostics are not exposed as raw backend text',()=>{
  assert(!commandPreflightMessage(['Error Code: SecretInternalDetail.']).includes('SecretInternalDetail'));
});
test('deployed byte-handler ship errors still show prerequisites rather than a raw custom code',()=>{
  assert.match(commandPreflightMessage(['ProgramError occurred. Error Code: Custom(6020). Error Number: 6020.']),/requirements/);
});
test('successful eligibility check is unsigned and never submits or changes instructions',async()=>{
  let simulated=0;
  const input=[instruction];
  await preflightCommand(rpc({simulateTransaction:async(tx,options)=>{
    simulated++;
    assert.equal(options.sigVerify,false); assert.equal(options.commitment,'confirmed');
    assert(tx.signatures.every(signature=>signature.every(byte=>byte===0)));
    const compiled=tx.message.compiledInstructions;
    assert.equal(compiled[0].programIdIndex,tx.message.staticAccountKeys.findIndex(key=>key.equals(instruction.programId)));
    assert.equal(compiled.length,2);
    assert.equal(tx.message.staticAccountKeys[compiled[1].programIdIndex].toBase58(),web3.ComputeBudgetProgram.programId.toBase58());
    return {value:{err:null,logs:[]}};
  },sendRawTransaction:()=>assert.fail('must never submit')}),payer,input);
  assert.equal(simulated,1); assert.equal(input.length,1);
});
test('program rejection fails closed with friendly message and diagnostic logs',async()=>{
  await assert.rejects(preflightCommand(rpc({simulateTransaction:async()=>({value:{err:{InstructionError:[0,{Custom:6066}]},logs:['Error Code: ResourceCapExceeded.']}})}),payer,[instruction]),error=>{
    assert.match(error.message,/storage/); assert.equal(error.logs[0],'Error Code: ResourceCapExceeded.'); return true;
  });
});
test('network lookup, blockhash, and simulation failures all fail closed',async()=>{
  for (const method of ['getGenesisHash','getLatestBlockhash','simulateTransaction']) {
    await assert.rejects(preflightCommand(rpc({[method]:async()=>{throw new Error('raw internal RPC error');}}),payer,[instruction]),/devnet check could not be completed/);
  }
});
test('mainnet is rejected before blockhash or simulation calls',async()=>{
  await assert.rejects(preflightCommand(rpc({getGenesisHash:async()=> 'mainnet',getLatestBlockhash:()=>assert.fail('wrong network')}),payer,[instruction]),/devnet check/);
});
test('empty instructions fail before network calls',async()=>{
  await assert.rejects(preflightCommand(rpc({getGenesisHash:()=>assert.fail('empty')}),payer,[]),/No game action/);
});
test('an oversized command fails closed, including after attempted compression',async()=>{
  const large=new web3.TransactionInstruction({programId:web3.SystemProgram.programId,keys:[],data:Buffer.alloc(1400)});
  let tables=0;
  await assert.rejects(preflightCommand(rpc({simulateTransaction:()=>assert.fail('oversized')}),payer,[large],async()=>{tables++;return [];}),/too large/);
  assert.equal(tables,1);
});
test('existing explicit compute budget and instruction positions are preserved',async()=>{
  const budget=web3.ComputeBudgetProgram.setComputeUnitLimit({units:200000});
  await preflightCommand(rpc({simulateTransaction:async tx=>{
    assert.equal(tx.message.compiledInstructions.length,2);
    assert.deepEqual(Buffer.from(tx.message.compiledInstructions[0].data),instruction.data);
    return {value:{err:null,logs:[]}};
  }}),payer,[instruction,budget]);
});
test('lookup tables are only loaded when necessary',async()=>{
  await preflightCommand(rpc(),payer,[instruction],()=>assert.fail('unnecessary lookup'));
});
test('an otherwise valid large command is checked using the existing lookup addresses',async()=>{
  const addresses=Array.from({length:40},()=>web3.Keypair.generate().publicKey);
  const table=new web3.AddressLookupTableAccount({key:web3.Keypair.generate().publicKey,state:{
    deactivationSlot:0xffffffffffffffffn,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,authority:undefined,addresses}});
  const large=new web3.TransactionInstruction({programId:web3.SystemProgram.programId,
    keys:addresses.map(pubkey=>({pubkey,isSigner:false,isWritable:true})),data:Buffer.alloc(20)});
  let simulated=0;
  await preflightCommand(rpc({simulateTransaction:async tx=>{
    simulated++; assert(tx.serialize().length<=1232); assert.equal(tx.message.addressTableLookups.length,1);
    return {value:{err:null,logs:[]}};
  }}),payer,[large],async()=>[table]);
  assert.equal(simulated,1);
});
test('numeric validation rejects fractional, non-finite, wrapped and unsafe quantities',()=>{
  for (const value of [-1,0,1.5,NaN,Infinity,0x100000000,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>assertCommandInteger('quantity',value,1,0xffffffff),/Check quantity/);
  }
  assert.doesNotThrow(()=>assertCommandInteger('quantity',0xffffffff,1,0xffffffff));
  for (const value of [-1n,0x10000000000000000n,1.5,NaN,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>assertResourceAmount('metal',value),/Check metal/);
  }
  assert.doesNotThrow(()=>assertResourceAmount('metal',0xffffffffffffffffn));
});
test('construction field, level and cross-queue limits are shared eligibility rules',()=>{
  const eligible={buildingIdx:0,level:1,freeFields:1,constructionBusy:false,productionBusy:false,researchBusy:false};
  assert.equal(constructionBlockReason(eligible),null);
  assert.match(constructionBlockReason({...eligible,freeFields:0}),/fields/);
  assert.match(constructionBlockReason({...eligible,level:255}),/Maximum/);
  assert.match(constructionBlockReason({...eligible,constructionBusy:true}),/Construction/);
  assert.match(constructionBlockReason({...eligible,buildingIdx:7,productionBusy:true}),/Production/);
  assert.match(constructionBlockReason({...eligible,buildingIdx:11,researchBusy:true}),/Research/);
  assert.equal(constructionBlockReason({...eligible,productionBusy:true,researchBusy:true}),null);
});
test('store and quest rewards use exact remaining capacity and reject unavailable state',()=>{
  const reward={metal:1000,crystal:500,deuterium:250};
  const resources={metal:9000n,crystal:9500n,deuterium:9750n,metalCap:10000n,crystalCap:10000n,deuteriumCap:10000n};
  assert.equal(rewardStorageBlock(reward,resources),null);
  for(const field of ['metal','crystal','deuterium']) assert.match(rewardStorageBlock(reward,{...resources,[field]:resources[field]+1n}),/storage/);
  assert.match(rewardStorageBlock(reward,undefined),/Checking/);
  assert.match(storePackBlock({reward,shieldSeconds:21600},resources),/unavailable/);
});
test('actual client field check rejects before vault setup or submission',async()=>{
  const {GameClient}=require('./frontend-ts-loader.cjs').frontendLoader()('game-state.ts');
  const client=new GameClient({}, {wallet:{publicKey:payer}});
  client.loadPlanetStateByPda=async()=>({planet:{metalMine:1,maxFields:10,usedFields:10,buildFinishTs:0,shipBuildItem:255,defenseBuildItem:255},research:{queueItem:255}});
  client.prepareVaultSigningForAuthority=()=>assert.fail('must not prepare signing');
  client.sendVaultInstruction=()=>assert.fail('must not submit');
  await assert.rejects(client.startBuild(payer,0),/No free building fields/);
});
test('unaffordable store order is rejected before quest-account initialization can request a signature',async()=>{
  const {GameClient}=require('./frontend-ts-loader.cjs').frontendLoader()('game-state.ts');
  const client=new GameClient({}, {wallet:{publicKey:payer}});
  client.loadPlanetStateByPda=async()=>({resources:{metal:0n,crystal:0n,deuterium:0n,metalCap:10000n,crystalCap:10000n,deuteriumCap:10000n,lastUpdateTs:Math.floor(Date.now()/1000),metalHour:0n,crystalHour:0n,deuteriumHour:0n,energyProduction:0n,energyConsumption:0n}});
  client.getStoreConfig=async()=>({enabled:true,usdcMint:payer.toBase58()});
  client.findUserTokenAccountForMint=async()=>{throw new Error('Insufficient USDC');};
  client.ensureQuestProgress=()=>assert.fail('must not initialize before checking funds');
  client.ensureQuestRewardTargets=()=>assert.fail('must not initialize before checking funds');
  await assert.rejects(client.purchaseStorePack(payer,1,0),/Insufficient USDC/);
});

const sessionSource=fs.readFileSync(path.join(__dirname,'../src/player-funded-session.ts'),'utf8');
const ast=ts.createSourceFile('session.ts',sessionSource,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='executeWithPlayerSession');
const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function executor(extra={}) {
  const exports={}; const trace=[];
  const mock={exports,Buffer,Error,PublicKey:web3.PublicKey,Ed25519Program:web3.Ed25519Program,
    IS_DEVNET:true,env:{},refreshPlayerFundedSession:async()=>({active:true}),
    readStoredSession:()=>({walletPda:payer.toBase58(),sessionPda:payer.toBase58(),active:true}),
    keypairFromStored:()=>({publicKey:payer}),connection:()=>rpc(),
    lazorClient:()=>({execute:async()=>({instructions:[instruction]})}),getSponsorPayer:async()=>payer,
    resolvePasskeyWallet:async()=>({client:{prepareExecute:()=>assert.fail('must not prepare approval')}}),
    takeLatestBlockhash:async()=>({blockhash:payer.toBase58()}),isPlanetPurchaseBundle:()=>false,
    withPreparationTimeout:p=>p,preflightCommand:async()=>{trace.push('check');throw new Error('blocked before wallet');},
    freshPasskeySlot:()=>assert.fail('must not request approval slot'),
    requestPasskeySignature:()=>assert.fail('must not open portal'),sendSponsored:()=>assert.fail('must not submit'),
    fetchMarketLookupTable:async()=>({}),...extra};
  vm.runInNewContext(code,mock); return {execute:exports.executeWithPlayerSession,trace};
}
test('actual passkey command stops before preparing or opening Lazor on rejection',async()=>{
  const {execute,trace}=executor();
  await assert.rejects(execute({smartWallet:payer.toBase58()},[instruction],'passkey'),/blocked before wallet/);
  assert.deepEqual(trace,['check']);
});
test('actual session command checks the wrapped instructions before submission',async()=>{
  const {execute,trace}=executor();
  await assert.rejects(execute({smartWallet:payer.toBase58()},[instruction],'session'),/blocked before wallet/);
  assert.deepEqual(trace,['check']);
});
test('new planet purchase is checked inside preparation before opening Lazor',async()=>{
  const {execute,trace}=executor({isPlanetPurchaseBundle:()=>true,runPlanetPurchase:async(_wallet,_intent,actions)=>actions.prepare()});
  await assert.rejects(execute({smartWallet:payer.toBase58()},[instruction],'passkey'),/blocked before wallet/);
  assert.deepEqual(trace,['check']);
});
test('already pending planet purchase recovery is not rechecked as a fresh purchase',async()=>{
  const {execute,trace}=executor({isPlanetPurchaseBundle:()=>true,runPlanetPurchase:async()=> 'recovered-existing-signature'});
  assert.equal(await execute({smartWallet:payer.toBase58()},[instruction],'passkey'),'recovered-existing-signature');
  assert.deepEqual(trace,[]);
});
