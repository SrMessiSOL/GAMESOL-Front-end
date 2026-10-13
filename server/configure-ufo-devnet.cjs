const fs=require('node:fs');
const crypto=require('node:crypto');
const {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction,sendAndConfirmTransaction}=require('@solana/web3.js');
const {PROGRAM,DEVNET_GENESIS}=require('./ufo-attestations.cjs');
const ATTESTOR=new PublicKey('9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a');
const pda=seed=>PublicKey.findProgramAddressSync([Buffer.from(seed)],PROGRAM)[0];

async function main() {
  const rpc=new Connection('https://api.devnet.solana.com','confirmed');
  if(await rpc.getGenesisHash()!==DEVNET_GENESIS)throw new Error('Refusing a non-devnet network.');
  const gameConfig=await rpc.getAccountInfo(pda('game_config'));
  if(!gameConfig||!gameConfig.owner.equals(PROGRAM)||gameConfig.data.length<40)throw new Error('Game admin configuration unavailable.');
  const admin=new PublicKey(gameConfig.data.subarray(8,40));
  const enabled=!process.argv.includes('--disable');
  const data=Buffer.concat([crypto.createHash('sha256').update('global:configure_ufo').digest().subarray(0,8),ATTESTOR.toBuffer(),Buffer.from([enabled?1:0])]);
  const keys=[{pubkey:admin,isSigner:true,isWritable:true},{pubkey:pda('game_config'),isSigner:false,isWritable:false},
    {pubkey:pda('ufo_config'),isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}];
  const instruction=new TransactionInstruction({programId:PROGRAM,keys,data});
  console.log(JSON.stringify({network:'devnet',program:PROGRAM.toBase58(),admin:admin.toBase58(),requiresGovernance:!PublicKey.isOnCurve(admin.toBytes()),attestor:ATTESTOR.toBase58(),enabled,config:pda('ufo_config').toBase58(),instruction:{data:data.toString('base64'),keys:keys.map(item=>({...item,pubkey:item.pubkey.toBase58()}))}}));
  if(!process.argv.includes('--send'))return;
  if(!PublicKey.isOnCurve(admin.toBytes()))throw new Error('Game admin is program-controlled. Submit through its verified governance executor; direct keypair signing is impossible.');
  const index=process.argv.indexOf('--keypair');
  if(index<0||!process.argv[index+1])throw new Error('Explicit local game-admin keypair path required. Never paste key contents.');
  const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[index+1],'utf8'))));
  if(!signer.publicKey.equals(admin))throw new Error('The supplied wallet is not the existing game admin.');
  const transaction=new Transaction().add(instruction);
  const latest=await rpc.getLatestBlockhash();transaction.recentBlockhash=latest.blockhash;transaction.feePayer=admin;transaction.sign(signer);
  const simulation=await rpc.simulateTransaction(transaction);
  if(simulation.value.err)throw new Error(`UFO config simulation failed: ${JSON.stringify(simulation.value.err)}. No transaction sent.`);
  const signature=await sendAndConfirmTransaction(rpc,transaction,[signer],{commitment:'finalized'});
  console.log(JSON.stringify({signature,finalized:true}));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
