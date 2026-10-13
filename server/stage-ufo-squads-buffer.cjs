const {spawn} = require('node:child_process');
const {devnetConnection} = require('./ufo-devnet-rpc.cjs');
const {PublicKey} = require('@solana/web3.js');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const buffer = new PublicKey('6jWfknp2W2p6qwY6vCDZYynBDgTKi97EPLJEWWszL9Fj');
const vault = new PublicKey('5Gq1tU4eCbuWyR7TEknwdKsbTxk3H8W4SfkT8Nsbuzs');
const pd = new PublicKey('2d15oahNV6GMcLKyTRRounteFzrEGRP2AL1zkjV2c4ky');
const payer = new PublicKey('EhT4UUmsHyd41bZSGzj1W72yu2EptHk8sEvnK7aaNuBu');
async function cli(args, url) {
  await new Promise((resolve,reject)=>{
    const child=spawn('wsl.exe',['-d','Ubuntu-22.04','--exec','/home/srmessi/.local/share/solana/install/active_release/bin/solana','program',...args,'--url',url,'--keypair','/home/srmessi/.config/solana/id.json','--output','json'],{windowsHide:true});
    const write=b=>process.stdout.write(b.toString().split(url).join('[devnet RPC]'));
    child.stdout.on('data',write);child.stderr.on('data',write);
    child.on('error',()=>reject(Error('CLI could not start.')));
    child.on('exit',code=>code===0?resolve():reject(Error('CLI staging failed.')));
  });
}
async function main(){
  const {connection:c,url}=await devnetConnection();
  const binary=fs.readFileSync(path.join(__dirname,'../.vercel/ufo-release-85c2440/game_state.so'));
  if(crypto.createHash('sha256').update(binary).digest('hex')!=='73e565f2b42f3f78fbb2699e1597d7dabac864f38d7ec6f93a65a000b84747b7')throw Error('Artifact mismatch.');
  const [b,before]=await c.getMultipleAccountsInfo([buffer,pd]);
  if(!b||b.owner.toBase58()!=='BPFLoaderUpgradeab1e11111111111111111111111'||b.data.readUInt32LE(0)!==1||b.data[4]!==1||!b.data.subarray(37).equals(binary))throw Error('Uploaded bytes mismatch.');
  if(!before||before.owner.toBase58()!=='BPFLoaderUpgradeab1e11111111111111111111111'||before.data.readUInt32LE(0)!==3||before.data[12]!==1||!new PublicKey(before.data.subarray(13,45)).equals(vault))throw Error('Game authority mismatch.');
  const current=new PublicKey(b.data.subarray(5,37));
  if(!current.equals(vault)&&!current.equals(payer))throw Error('Buffer authority mismatch.');
  const bytes=Math.max(0,binary.length+45-before.data.length);
  const extra=Math.max(0,(await c.getMinimumBalanceForRentExemption(before.data.length+bytes))-before.lamports);
  if(extra!==0)throw Error('Additional storage rent needs a new budget review.');
  if(bytes)await cli(['extend','FJGxh6SKgNoTVzHj98oBsC2oaEy8ovadVJf8rDUNaEHb',String(bytes)],url);
  if(!current.equals(vault))await cli(['set-buffer-authority',buffer.toBase58(),'--buffer-authority','/home/srmessi/.config/solana/id.json','--new-buffer-authority',vault.toBase58()],url);
  const [after,ready]=await c.getMultipleAccountsInfo([pd,buffer]);
  if(!after.data.subarray(45,before.data.length).equals(before.data.subarray(45))||!after.data.subarray(12,45).equals(before.data.subarray(12,45))||after.data.length<binary.length+45||!new PublicKey(ready.data.subarray(5,37)).equals(vault)||!ready.data.subarray(37).equals(binary))throw Error('Staging verification failed.');
  console.log(JSON.stringify({staged:true,gameCodeUnchanged:true,capacityBytes:after.data.length-45,buffer:buffer.toBase58(),bufferAuthority:vault.toBase58()}));
}
main().catch(()=>{console.error('Staging failed or needs review; no automatic upgrade attempted.');process.exitCode=1;});
