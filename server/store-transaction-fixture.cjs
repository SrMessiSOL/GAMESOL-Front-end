const crypto = require('node:crypto');
const { LazorKitClient } = require('@lazorkit/wallet');
const { AddressLookupTableAccount, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const manifest = require('../src/ufo-lookup-table.json');
const program = new PublicKey(manifest.addresses[0]);
const discriminator = name => crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const pda = (seed, owner) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(owner ? [owner.toBuffer()] : [])], program)[0];

// Packet-layout fixture only: synthetic signatures are never submitted.
async function storeTransactionFixture(sponsoredRent, mutateInner, topOrigin = 'https://chained-universe.vercel.app', deferred = false) {
  const payer = new PublicKey(manifest.sponsor);
  const wallet = Keypair.generate().publicKey;
  const config = Buffer.alloc(88);
  config[0] = 5; config[3] = 1; config[4] = 16;
  const client = new LazorKitClient({ getAccountInfo: async () => ({ data: config }) });
  const owner = client.findVault(wallet)[0];
  const inner = [new TransactionInstruction({ programId: program, keys: [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: pda('store_config'), isSigner: false, isWritable: false },
    { pubkey: pda('store_purchase_state', owner), isSigner: false, isWritable: true },
    { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), isSigner: false, isWritable: false },
    { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('79yUJWLDkkaWSHR6cfXYD8MxvxcUC9XnnimYKyHfGBGd'), isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: pda('quest_progress', owner), isSigner: false, isWritable: true },
    { pubkey: pda('quest_reward_targets', owner), isSigner: false, isWritable: true },
  ], data: Buffer.concat([discriminator('purchase_store_pack'), Buffer.from([1, 2])]) })];
  if (sponsoredRent) inner.unshift(new TransactionInstruction({ programId: program, keys: [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data: Buffer.concat([discriminator('sponsor_account_rent'), Buffer.alloc(8)]) }));
  if (mutateInner) mutateInner(inner);
  const authorityPda = Keypair.generate().publicKey;
  const publicKeyBytes = Buffer.concat([Buffer.from([2]), Buffer.alloc(32)]);
  const prepared = deferred ? await client.authorizePrepare({payer, walletPda: wallet,
    authorityPda, publicKeyBytes, slotOverride: 100n, instructions: inner, expiryOffset: 300}) : await client.prepareExecute({ payer, walletPda: wallet,
    secp256r1: { credentialIdHash: Buffer.alloc(32), publicKeyBytes, authorityPda, slotOverride: 100n }, instructions: inner });
  const json = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: Buffer.from(prepared.challenge).toString('base64url'), origin: 'https://portal.lazorkit.com', crossOrigin: true, topOrigin }));
  const response = { signature: Buffer.alloc(64), authenticatorData: Buffer.alloc(37), clientDataJsonHash: crypto.createHash('sha256').update(json).digest(), clientDataJson: json };
  const authorization = deferred ? {...prepared.finalize(response), deferredPayload: prepared.deferredPayload} : null;
  const wrapped = deferred ? await client.executeDeferredFromPayload({payer, deferredPayload: authorization.deferredPayload}) : client.finalizeExecute(prepared, response);
  const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: wrapped.instructions }).compileToV0Message());
  const table = new AddressLookupTableAccount({ key: new PublicKey(manifest.table), state: { deactivationSlot: 18446744073709551615n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: manifest.addresses.map(address => new PublicKey(address)) } });
  const compressed = new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: wrapped.instructions }).compileToV0Message([table]));
  const authorizationTransaction = authorization && new VersionedTransaction(new TransactionMessage({payerKey: payer,
    recentBlockhash: PublicKey.default.toBase58(), instructions: authorization.instructions}).compileToV0Message());
  return { transaction, compressed, table, payer, inner, wrapped: wrapped.instructions, authorizationTransaction, deferredPayload: authorization?.deferredPayload };
}

module.exports = { storeTransactionFixture };
if (require.main === module) (async () => {
  for (const rent of [false, true]) {
    const f = await storeTransactionFixture(rent);
    try { console.log(JSON.stringify({ sponsoredRent: rent, bytes: f.transaction.serialize().length })); }
    catch { console.log(JSON.stringify({ sponsoredRent: rent, exceedsSerializationLimit: true })); }
    console.log(JSON.stringify({ sponsoredRent: rent, compressedBytes: f.compressed.serialize().length }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
