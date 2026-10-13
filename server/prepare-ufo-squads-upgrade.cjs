const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Connection, PublicKey, Keypair, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY} = require('@solana/web3.js');
const {PROGRAM, DEVNET_GENESIS} = require('./ufo-attestations.cjs');

const MULTISIG = new PublicKey('D6UaXodCsKHt9QGwSpJAWrYUGnkPESM6semtumbi2WMH');
const SQUADS = new PublicKey('SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu');
const MEMBER = new PublicKey('5LdLeYrc5zMsPV2sn7amFQwDbYSmvakxZPDmm5YZmPvR');
const VAULT = new PublicKey('5Gq1tU4eCbuWyR7TEknwdKsbTxk3H8W4SfkT8Nsbuzs');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const ATTESTOR = new PublicKey('9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a');
const HASH = '73e565f2b42f3f78fbb2699e1597d7dabac864f38d7ec6f93a65a000b84747b7';
const root = path.resolve(__dirname, '..');
const release = path.join(root, '.vercel', 'ufo-release-85c2440');
const disc = name => crypto.createHash('sha256').update(name).digest().subarray(0, 8);
const pda = seed => PublicKey.findProgramAddressSync([Buffer.from(seed)], PROGRAM)[0];
const programData = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], LOADER)[0];
const meta = (pubkey, isWritable = false, isSigner = false) => ({pubkey, isWritable, isSigner});
const serialize = ix => ({programId: ix.programId.toBase58(), keys: ix.keys.map(k => ({...k, pubkey: k.pubkey.toBase58()})), data: ix.data.toString('base64')});

function instructions(buffer) {
  const upgrade = new TransactionInstruction({programId: LOADER, data: Buffer.from([3, 0, 0, 0]), keys: [
    meta(programData, true), meta(PROGRAM, true), meta(new PublicKey(buffer), true), meta(VAULT, true),
    meta(SYSVAR_RENT_PUBKEY), meta(SYSVAR_CLOCK_PUBKEY), meta(VAULT, false, true),
  ]});
  const activate = new TransactionInstruction({programId: PROGRAM, keys: [meta(VAULT, true, true), meta(pda('game_config')), meta(pda('ufo_config'), true), meta(SystemProgram.programId)],
    data: Buffer.concat([disc('global:configure_ufo'), ATTESTOR.toBuffer(), Buffer.from([1])])});
  return [upgrade, activate];
}

function validateMultisig(account) {
  if (!account || !account.owner.equals(SQUADS) || account.data.length < 90 || !account.data.subarray(0, 8).equals(disc('account:Ms'))) throw Error('Squads v3 account mismatch.');
  const d = account.data;
  if (d.readUInt16LE(8) !== 1 || d.readUInt32LE(54) !== 1 || !new PublicKey(d.subarray(58, 90)).equals(MEMBER)) throw Error('Multisig membership changed; review required.');
  return d.readUInt32LE(12);
}

async function main() {
  if (process.argv.includes('--send')) throw Error('Preparation only: signing and sending are not supported.');
  const c = new Connection('https://api.devnet.solana.com', 'confirmed');
  if (await c.getGenesisHash() !== DEVNET_GENESIS) throw Error('Devnet required.');
  const binary = fs.readFileSync(path.join(release, 'game_state.so'));
  if (crypto.createHash('sha256').update(binary).digest('hex') !== HASH) throw Error('CI artifact checksum mismatch.');
  const [ms, pd, game, vault] = await c.getMultipleAccountsInfo([MULTISIG, programData, pda('game_config'), VAULT]);
  const transactionIndex = validateMultisig(ms);
  if (!pd || !pd.owner.equals(LOADER) || pd.data.length < 45 || pd.data.readUInt32LE(0) !== 3 || pd.data[12] !== 1 || !new PublicKey(pd.data.subarray(13, 45)).equals(VAULT)) throw Error('Upgrade authority changed.');
  if (!game || !game.owner.equals(PROGRAM) || !game.data.subarray(0, 8).equals(disc('account:GameConfig')) || !new PublicKey(game.data.subarray(8, 40)).equals(VAULT)) throw Error('Game admin changed.');
  const capacity = pd.data.length - 45;
  const additionalBytes = Math.max(0, binary.length - capacity);
  const configRent = await c.getMinimumBalanceForRentExemption(41);
  const bufferRent = await c.getMinimumBalanceForRentExemption(binary.length + 37);
  const extendRent = Math.max(0, (await c.getMinimumBalanceForRentExemption(Math.max(pd.data.length, binary.length + 45))) - pd.lamports);
  const index = process.argv.indexOf('--buffer');
  if (index >= 0 && process.argv.includes('--plan-buffer')) throw Error('Choose an uploaded buffer or a local planned buffer, not both.');
  let buffer = index >= 0 ? new PublicKey(process.argv[index + 1]) : null;
  let plannedBufferKeypairPath = null;
  if (process.argv.includes('--plan-buffer')) {
    plannedBufferKeypairPath = path.join(release, 'buffer-keypair.json');
    const key = fs.existsSync(plannedBufferKeypairPath)
      ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(plannedBufferKeypairPath, 'utf8'))))
      : Keypair.generate();
    if (!fs.existsSync(plannedBufferKeypairPath)) fs.writeFileSync(plannedBufferKeypairPath, JSON.stringify(Array.from(key.secretKey)), {mode: 0o600, flag: 'wx'});
    buffer = key.publicKey;
  }
  let bufferVerified = false;
  if (buffer && !plannedBufferKeypairPath) {
    const a = await c.getAccountInfo(buffer);
    if (!a || !a.owner.equals(LOADER) || a.data.length !== binary.length + 37 || a.data.readUInt32LE(0) !== 1 || a.data[4] !== 1 || !new PublicKey(a.data.subarray(5, 37)).equals(VAULT) || !a.data.subarray(37).equals(binary)) throw Error('Uploaded buffer must exactly match CI bytes and be controlled by the Squads vault.');
    bufferVerified = true;
  }
  const result = {network: 'devnet', preparationOnly: true, multisig: MULTISIG.toBase58(), squadsProgram: SQUADS.toBase58(), authorityIndex: 1, member: MEMBER.toBase58(), vault: VAULT.toBase58(), program: PROGRAM.toBase58(), programData: programData.toBase58(), transactionIndexObserved: transactionIndex,
    artifact: {commit: '85c2440', ci: 'https://github.com/SrMessiSOL/GAMESOL/actions/runs/38314519277', sha256: HASH, bytes: binary.length},
    buffer: buffer?.toBase58() || null, plannedBufferKeypairPath,
    prerequisites: {bufferUploadedAndVerified: bufferVerified, bufferRentLamports: bufferRent, additionalProgramBytes: additionalBytes, extendRentLamports: extendRent, configRentLamports: configRent, vaultLamports: vault?.lamports || 0, memberWalletLocated: false, executionSimulated: false},
    executionOrder: ['Upload and checksum-verify buffer; hand buffer authority to this vault.', 'Extend ProgramData capacity if required, using an explicitly approved fee payer.', 'Execute the upgrade through Squads v3, preserving existing authority.', 'Verify deployed bytes; execute configure_ufo through Squads in a later slot.', 'Rehearse direct and Lazor CPI gameplay before production frontend rollout.'],
    instructions: buffer ? instructions(buffer).map(serialize) : [{action: 'upgrade', blockedBy: 'No verified uploaded buffer address supplied.'}, {action: 'configure_ufo', ...serialize(instructions(PROGRAM)[1])}],
  };
  fs.writeFileSync(path.join(release, 'squads-upgrade-plan.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {instructions, validateMultisig, serialize};
if (require.main === module) main().catch(e => {console.error(e.message); process.exitCode = 1;});
