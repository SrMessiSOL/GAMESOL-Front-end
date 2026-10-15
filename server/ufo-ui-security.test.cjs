const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
test('UFO utility checks account identity across asynchronous proof building and account unmount',()=>{
  const source=read('UfoExpeditions.tsx');
  assert.match(source,/identityRef\.current = '';.*\}, \[identity\]/);
  assert.match(source,/nft\.link\?\.selectedAsset/);
  assert.match(source,/const instructions = await ufoInstructions[\s\S]*?identityRef\.current !== expected[\s\S]*?await run/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|Math\.random/);
});
test('cosmetic inventory decoder and equipment come from a program-owned commander account',()=>{
  const source=read('ufo-onchain.ts');
  assert.match(source,/account\.owner\.equals\(GAME_STATE_PROGRAM_ID\)/);
  assert.match(source,/state\.commander !== commander/);
  assert.match(source,/count > 24/);
  assert.match(read('UfoExpeditions.tsx'),/loadout\.loot\.map/);
});
test('ownership refresh does not revoke a still-connected wallet utility message',()=>{
  const source=read('CryptoUfos.tsx');
  const refresh=source.slice(source.indexOf('const refresh ='),source.indexOf('const assign ='));
  const utility=source.slice(source.indexOf('const signOwnership ='),source.indexOf('const verifyUtility ='));
  assert.match(utility,/verificationRevision\.current/);
  assert.doesNotMatch(utility,/\brevision\.current/);
  assert.match(refresh,/invalidateVerification\(\)/);
  // Epoch changes are in the wallet account-change handler, not the periodic readOwner call.
  const readOwner=source.slice(source.indexOf('const readOwner ='),source.indexOf('const connect ='));
  assert.doesNotMatch(readOwner,/verificationRevision\.current/);
});
test('Lazor session forwarding executes ownership precompiles outside the CPI wrapper',()=>{
  const source=read('player-funded-session.ts');
  assert.match(source,/instructions = instructions\.filter\(instruction => !instruction\.programId\.equals\(Ed25519Program\.programId\)\)/);
  assert.match(source,/sendSponsored\(rpc, \[\.\.\.precompiles, \.\.\.wrapped\], \[sessionKeypair\]/);
  assert.match(read('game-state.ts'),/sendUfoInstructions[\s\S]*?commander\.equals\(this\.provider\.wallet\.publicKey\)[\s\S]*?execute\(instructions, 'session'\)/);
});
test('UFO issuer targets the existing LazorKit game instead of the legacy public program', () => {
  const { PROGRAM } = require('./ufo-attestations.cjs');
  assert.equal(PROGRAM.toBase58(),'J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
});
