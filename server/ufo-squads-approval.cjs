const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {PublicKey, Transaction, VersionedTransaction} = require('@solana/web3.js');
const legacy = require('../.vercel/ufo-tools/node_modules/@sqds/sdk');
const BN = require('../.vercel/ufo-tools/node_modules/bn.js');
const {devnetConnection} = require('./ufo-devnet-rpc.cjs');
const {instructions, validateMultisig} = require('./prepare-ufo-squads-upgrade.cjs');
const root = path.resolve(__dirname, '..');
const member = new PublicKey('5LdLeYrc5zMsPV2sn7amFQwDbYSmvakxZPDmm5YZmPvR');
const ms = new PublicKey('D6UaXodCsKHt9QGwSpJAWrYUGnkPESM6semtumbi2WMH');
const program = new PublicKey('SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu');
const vault = new PublicKey('5Gq1tU4eCbuWyR7TEknwdKsbTxk3H8W4SfkT8Nsbuzs');
const buffer = new PublicKey('6jWfknp2W2p6qwY6vCDZYynBDgTKi97EPLJEWWszL9Fj');
const origin = 'http://127.0.0.1:4318';
const token = crypto.randomBytes(32).toString('hex');
const pending = new Map();
let connection, sdk, inFlight = false;

async function verifyBuffer() {
  const a = await connection.getAccountInfo(buffer);
  const binary = fs.readFileSync(path.join(root, '.vercel/ufo-release-85c2440/game_state.so'));
  if (crypto.createHash('sha256').update(binary).digest('hex') !== '73e565f2b42f3f78fbb2699e1597d7dabac864f38d7ec6f93a65a000b84747b7') throw Error('Buffer artifact checksum changed.');
  if (!a || a.owner.toBase58() !== 'BPFLoaderUpgradeab1e11111111111111111111111' || a.data.readUInt32LE(0) !== 1 || a.data[4] !== 1 || !new PublicKey(a.data.subarray(5,37)).equals(vault) || !a.data.subarray(37).equals(binary)) throw Error('Buffer is not ready for approval.');
}
const proposal = index => legacy.getTxPDA(ms, new BN(index), program)[0];
async function verifyStored(index) {
  const tx = await sdk.getTransaction(proposal(index));
  if (!tx.ms.equals(ms) || !tx.creator.equals(member) || tx.authorityIndex !== 1 || tx.instructionIndex !== 1) throw Error('Unexpected proposal contents.');
  const actual = await sdk.getInstruction(legacy.getIxPDA(proposal(index), new BN(1), program)[0]);
  const expected = instructions(buffer)[index - 1];
  if (!actual.programId.equals(expected.programId) || !Buffer.from(actual.data).equals(expected.data) || actual.keys.length !== expected.keys.length || !actual.keys.every((k,i) => k.pubkey.equals(expected.keys[i].pubkey) && k.isSigner === expected.keys[i].isSigner && k.isWritable === expected.keys[i].isWritable)) throw Error('Proposal instruction differs from reviewed payload.');
  return tx;
}
async function prepare(action) {
  validateMultisig(await connection.getAccountInfo(ms));
  const match = /^(create|approve|execute)-(1|2)$/.exec(action);
  if (!match) throw Error('Unknown action.');
  const [,kind, rawIndex] = match, index = Number(rawIndex);
  if (index === 1) await verifyBuffer();
  if (index === 2) {
    const first = await verifyStored(1);
    if (!first.status.executed) throw Error('Upgrade must be executed and verified first.');
    const live = await connection.getAccountInfo(new PublicKey('2d15oahNV6GMcLKyTRRounteFzrEGRP2AL1zkjV2c4ky'));
    const binary = fs.readFileSync(path.join(root, '.vercel/ufo-release-85c2440/game_state.so'));
    if (!live || !live.data.subarray(45, 45 + binary.length).equals(binary) || !new PublicKey(live.data.subarray(13,45)).equals(vault)) throw Error('Live upgrade verification failed.');
  }
  let ix;
  if (kind === 'create') {
    if (await sdk.getNextTransactionIndex(ms) !== index) throw Error('Proposal index changed; refresh and review.');
    ix = [await sdk.buildCreateTransaction(ms,1,index), await sdk.buildAddInstruction(ms,proposal(index),instructions(buffer)[index-1],1), await sdk.buildActivateTransaction(ms,proposal(index))];
  } else {
    const tx = await verifyStored(index);
    if (kind === 'approve' && !tx.status.active) throw Error('Proposal is not awaiting approval.');
    if (kind === 'execute' && !tx.status.executeReady) throw Error('Proposal is not approved for execution.');
    ix = [kind === 'approve' ? await sdk.buildApproveTransaction(ms,proposal(index)) : await sdk.buildExecuteTransaction(proposal(index),member)];
  }
  const latest = await connection.getLatestBlockhash();
  const transaction = new Transaction({feePayer:member, ...latest}).add(...ix);
  const unsigned = transaction.serialize({requireAllSignatures:false,verifySignatures:false});
  const simulation = await connection.simulateTransaction(new VersionedTransaction(transaction.compileMessage()), {sigVerify:false});
  if (simulation.value.err) throw Error('Transaction simulation failed; no wallet request issued.');
  const id = crypto.randomBytes(24).toString('hex');
  pending.clear(); pending.set(id,{message:transaction.serializeMessage(), latest, expires:Date.now()+120000});
  return {id, action, member:member.toBase58(), proposal:proposal(index).toBase58(), unsigned:unsigned.toString('base64'), simulationPassed:true};
}

async function main() {
  ({connection} = await devnetConnection());
  sdk = new legacy.default({connection, wallet:{publicKey:member,signTransaction:async()=>{throw Error('User signature required.');},signAllTransactions:async()=>{throw Error('User signature required.');}},multisigProgramId:program});
  const server = http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    if (req.headers.host !== '127.0.0.1:4318') {res.writeHead(403);return res.end();}
    if (req.method==='GET' && req.url==='/') {res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(__dirname,'ufo-squads-approval.html'),'utf8').replace('__TOKEN__',token));}
    if (req.method==='GET' && req.url==='/web3.js') {res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(root,'node_modules/@solana/web3.js/lib/index.iife.min.js')));}
    if (req.method!=='POST' || req.headers.origin!==origin || req.headers['x-gamesol-local']!==token || !['/prepare','/submit'].includes(req.url)) {res.writeHead(403);return res.end();}
    if (inFlight) {res.writeHead(409);return res.end();}
    inFlight=true;
    try {
      let body=''; for await(const chunk of req) {body+=chunk;if(body.length>12000)throw Error('Request too large.');}
      const data=JSON.parse(body); let result;
      if(req.url==='/prepare')result=await prepare(data.action);
      else {
        const draft=pending.get(data.id); pending.delete(data.id);
        if(!draft||draft.expires<Date.now())throw Error('Approval request expired.');
        const signed=Transaction.from(Buffer.from(data.signed,'base64'));
        if(!signed.serializeMessage().equals(draft.message)||!signed.verifySignatures()||!signed.feePayer.equals(member))throw Error('Signed transaction differs from reviewed request.');
        const signature=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:2});
        const confirmation=await connection.confirmTransaction({signature,...draft.latest},'confirmed');
        if(confirmation.value.err)throw Error('Transaction failed on devnet.');
        result={signature,confirmed:true};
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:/^(Buffer|Unexpected|Proposal|Upgrade|Live|Unknown|Transaction|Approval|Signed|Request)/.test(e.message)?e.message:'Devnet request failed. No automatic approval was performed.'}));}
    finally{inFlight=false;}
  });
  server.listen(4318,'127.0.0.1',()=>console.log('Local approval page ready: '+origin));
}
if(require.main===module)main().catch(()=>{console.error('Local devnet approval startup failed.');process.exitCode=1;});
