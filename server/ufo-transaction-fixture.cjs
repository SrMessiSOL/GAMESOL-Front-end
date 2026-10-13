const crypto = require('node:crypto');
const { LazorKitClient } = require('@lazorkit/wallet');
const { Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, Ed25519Program, TransactionInstruction, TransactionMessage, VersionedTransaction, AddressLookupTableAccount } = require('@solana/web3.js');
const game = require('./ufo-attestations.cjs').PROGRAM;
const manifest = require('../src/ufo-lookup-table.json');
const discriminator = name => crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const pda = (seed, key) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(key ? [key.toBuffer()] : [])], game)[0];

async function ufoTransactionFixture(action = 'start', protocolFees = true) {
  const sponsor = { publicKey: new PublicKey(manifest.sponsor) };
  const session = Keypair.generate();
  const commander = Keypair.generate().publicKey;
  const owner = Keypair.generate().publicKey;
  const asset = Keypair.generate().publicKey;
  const configData = Buffer.alloc(88);
  configData[0] = 5; configData[3] = 1; configData[4] = 16;
  const client = new LazorKitClient({ getAccountInfo: async () => protocolFees ? { data: configData } : null });
  const proof = Buffer.concat([owner.toBuffer(), asset.toBuffer(), Buffer.alloc(8), Buffer.from([4, 2]), Buffer.alloc(64), Buffer.alloc(8)]);
  const message = Buffer.concat([Buffer.from('gamesol:ufo:devnet:v1'), game.toBuffer(), new PublicKey('53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb').toBuffer(), commander.toBuffer(), proof]);
  const precompile = Ed25519Program.createInstructionWithPublicKey({ publicKey: new PublicKey('9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a').toBytes(), signature: Buffer.alloc(64), message });
  const keys = [{ pubkey: commander, isSigner: true, isWritable: action === 'start' }];
  if (action === 'start') keys.push({ pubkey: pda('player_profile', commander), isSigner: false, isWritable: false });
  keys.push({ pubkey: pda('ufo_config'), isSigner: false, isWritable: false }, { pubkey: pda('ufo_loadout', commander), isSigner: false, isWritable: true });
  if (action === 'start') keys.push({ pubkey: pda('ufo_asset_use', asset), isSigner: false, isWritable: true }, { pubkey: pda('ufo_owner_use', owner), isSigner: false, isWritable: true });
  keys.push({ pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false });
  if (action === 'start') keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
  const names = { start: 'start_ufo_expedition', advance: 'advance_ufo_expedition', claim: 'claim_ufo_loot' };
  const inner = [new TransactionInstruction({ programId: game, keys, data: Buffer.concat([discriminator(names[action]), proof, ...(action === 'advance' ? [Buffer.from([0, 1])] : [])]) })];
  if (action === 'start') inner.unshift(new TransactionInstruction({ programId: game, keys: [{ pubkey: sponsor.publicKey, isSigner: true, isWritable: true }, { pubkey: commander, isSigner: false, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }], data: Buffer.concat([discriminator('sponsor_account_rent'), Buffer.alloc(8)]) }));
  const wrapped = await client.execute({ payer: sponsor.publicKey, walletPda: commander, signer: { type: 'session', sessionPda: client.findSession(commander, session.publicKey.toBytes())[0], sessionKeyPubkey: session.publicKey }, instructions: inner });
  const instructions = [precompile, ...wrapped.instructions];
  const table = new AddressLookupTableAccount({ key: new PublicKey(manifest.table), state: { deactivationSlot: 18446744073709551615n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: manifest.addresses.map(address => new PublicKey(address)) } });
  const compile = tables => new VersionedTransaction(new TransactionMessage({ payerKey: sponsor.publicKey, recentBlockhash: PublicKey.default.toBase58(), instructions }).compileToV0Message(tables));
  return { sponsor, session, instructions, table, plain: compile([]), compressed: compile([table]) };
}

module.exports = { ufoTransactionFixture };
