const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Keypair}=require('@solana/web3.js');

function main() {
  if (!process.argv.includes('--prepare')) throw new Error('Use --prepare only after explicit devnet attestor approval.');
  const directory=path.resolve(__dirname,'../.vercel');
  const filename=path.join(directory,'ufo-attestor.devnet.json');
  fs.mkdirSync(directory,{recursive:true});
  let issuer;
  if (fs.existsSync(filename)) issuer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(filename,'utf8'))));
  else { issuer=Keypair.generate(); fs.writeFileSync(filename,JSON.stringify([...issuer.secretKey]),{flag:'wx',mode:0o600}); }
  console.log(`Devnet-only UFO attestor: ${issuer.publicKey.toBase58()}`);
  if (process.argv.includes('--publish')) {
    const result=spawnSync('vercel.cmd',['env','add','GAMESOL_UFO_ATTESTOR_KEY','production','--sensitive','--scope','srmessisols-projects'],{
      cwd:path.resolve(__dirname,'..'),shell:true,encoding:'utf8',input:Buffer.from(issuer.secretKey).toString('base64')+'\n',timeout:60000,
    });
    // Never echo CLI input, command traces or secrets, even after a failure.
    if (result.status!==0) throw new Error('Vercel issuer setup failed; no existing environment variable was overwritten.');
    console.log('Sensitive issuer configuration saved in the existing Vercel project. On-chain activation is still required.');
  }
}
if (require.main===module) { try { main(); } catch(error) { console.error(error.message); process.exitCode=1; } }
