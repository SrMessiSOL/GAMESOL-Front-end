const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {PublicKey,Keypair}=require('@solana/web3.js');
const {devnetConnection}=require('./ufo-devnet-rpc.cjs');
const program=new PublicKey('J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
const authority=new PublicKey('EhT4UUmsHyd41bZSGzj1W72yu2EptHk8sEvnK7aaNuBu');
const payer=new PublicKey('HAHnFdgoASDzzma7fP9nfKo5nByU1uStYR964QhWnL2X');
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const pd=PublicKey.findProgramAddressSync([program.toBuffer()],loader)[0];
const config=PublicKey.findProgramAddressSync([Buffer.from('game_config')],program)[0];
const root=path.resolve(__dirname,'..');
const release=path.join(root,'.vercel/ufo-active-release-25a1dc5');
const hash='20f9316b06bfd61ea7d011c88a6658b398fd89e11b8b3a8287300ca08b004c15';
async function run(args,url){await new Promise((resolve,reject)=>{
  const p=spawn('wsl.exe',['-d','Ubuntu-22.04','--exec',...args],{windowsHide:true});
  const output=b=>process.stdout.write(b.toString().split(url).join('[devnet RPC]'));
  p.stdout.on('data',output);p.stderr.on('data',output);p.on('error',()=>reject(Error('WSL command failed.')));p.on('exit',code=>code===0?resolve():reject(Error('Devnet command failed.')));
});}
async function main(){
  const {connection:c,url}=await devnetConnection();
  const bytes=fs.readFileSync(path.join(release,'game_state.so'));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('CI artifact checksum mismatch.');
  const [before,game]=await c.getMultipleAccountsInfo([pd,config]);
  if(!before||!before.owner.equals(loader)||before.data.readUInt32LE(0)!==3||before.data[12]!==1||!new PublicKey(before.data.subarray(13,45)).equals(authority))throw Error('Active game upgrade authority mismatch.');
  if(!game||!game.owner.equals(program)||!new PublicKey(game.data.subarray(8,40)).equals(authority))throw Error('Active game admin mismatch.');
  const additionalBytes=Math.max(0,bytes.length+45-before.data.length);
  const extensionRent=Math.max(0,(await c.getMinimumBalanceForRentExemption(before.data.length+additionalBytes))-before.lamports);
  const rent=await c.getMinimumBalanceForRentExemption(bytes.length+37);
  const balance=await c.getBalance(payer);
  const deployed=before.data.subarray(45,45+bytes.length).equals(bytes);
  console.log(JSON.stringify({network:'devnet',program:program.toBase58(),payer:payer.toBase58(),balanceLamports:balance,bufferRentLamports:rent,requiredWithFeeReserveLamports:rent+30000000,additionalBytes,extensionRentLamports:extensionRent,alreadyDeployed:deployed}));
  if(!process.argv.includes('--send'))return;
  if(!deployed){
    const file=path.join(release,'buffer-keypair.json');
    const key=fs.existsSync(file)?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file,'utf8')))):Keypair.generate();
    const existing=await c.getAccountInfo(key.publicKey);
    if(existing&&(!existing.owner.equals(loader)||existing.data[4]!==1||!new PublicKey(existing.data.subarray(5,37)).equals(authority)))throw Error('Resume buffer mismatch.');
    if(rent>8000000000||balance<Math.max(0,rent-(existing?.lamports||0))+30000000)throw Error('Active-game fee payer needs funding.');
    if(extensionRent!==0)throw Error('Active program extension needs additional rent review.');
    if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify([...key.secretKey]),{mode:0o600,flag:'wx'});
    const linux='/mnt/c/solargrid-v9/experiments/passkey-universe/frontend/.vercel/ufo-active-release-25a1dc5';
    if(additionalBytes)await run(['/home/srmessi/.local/share/solana/install/active_release/bin/solana','program','extend',program.toBase58(),String(additionalBytes),'--payer','/home/srmessi/.config/solana/devnet.json','--keypair','/home/srmessi/.config/solana/id.json','--url',url,'--output','json'],url);
    await run(['/home/srmessi/.local/share/solana/install/active_release/bin/solana','program','deploy',`${linux}/game_state.so`,'--program-id',program.toBase58(),'--buffer',`${linux}/buffer-keypair.json`,'--upgrade-authority','/home/srmessi/.config/solana/id.json','--keypair','/home/srmessi/.config/solana/id.json','--fee-payer','/home/srmessi/.config/solana/devnet.json','--url',url,'--max-len',String(bytes.length),'--max-sign-attempts','2','--no-auto-extend','--use-rpc','--output','json'],url);
  }
  const after=await c.getAccountInfo(pd);
  if(!after.data.subarray(45,45+bytes.length).equals(bytes)||!after.data.subarray(13,45).equals(authority.toBuffer()))throw Error('Active deployed binary verification failed.');
  console.log('Verified active-game binary and unchanged authority.');
  await run(['/usr/bin/env',`SOLANA_RPC_URL=${url}`,'/home/srmessi/.local/node-v22.14.0/bin/node','/mnt/c/solargrid-v9/experiments/passkey-universe/frontend/server/configure-ufo-devnet.cjs','--send','--keypair','/home/srmessi/.config/solana/id.json'],url);
}
main().catch(e=>{console.error(/^(CI|Active|Resume|Devnet|WSL)/.test(e.message)?e.message:'Active-game deployment request failed.');process.exitCode=1;});
