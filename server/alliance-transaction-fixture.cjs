const crypto = require('node:crypto');
const { PublicKey, SystemProgram, TransactionInstruction, AddressLookupTableAccount, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const { storeTransactionFixture } = require('./store-transaction-fixture.cjs');
const manifest = require('../src/ufo-lookup-table.json');
const allianceManifest = require('../src/alliance-lookup-table.json');
const program = new PublicKey(manifest.addresses[0]);
const pda = (seed, owner) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(owner ? [owner.toBuffer()] : [])], program)[0];
const string = value => { const bytes = Buffer.from(value); const length = Buffer.alloc(4); length.writeUInt32LE(bytes.length); return Buffer.concat([length, bytes]); };

// Synthetic passkey packet only. Nothing here signs or submits a transaction.
async function allianceTransactionFixture(rent = true, mutate) {
  const fixture = await storeTransactionFixture(rent, inner => {
    const owner = inner.at(-1).keys[0].pubkey;
    const alliance = pda('alliance', owner);
    const am = new PublicKey('FAeZLeqohcxNBpwGrbYBLj2TavFqt4353mT6qY6Z7YFh');
    const usdc = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    const keys = [owner, pda('player_profile', owner), alliance, pda('alliance_metadata', alliance),
      pda('alliance_membership', owner), pda('game_config'), pda('store_config'), am,
      getAssociatedTokenAddressSync(am, owner, true), new PublicKey(allianceManifest.treasuryAntimatter),
      usdc, getAssociatedTokenAddressSync(usdc, owner, true), new PublicKey(allianceManifest.treasuryUsdc),
      TOKEN_PROGRAM_ID, SystemProgram.programId].map((pubkey, index) => ({ pubkey, isSigner: index === 0,
        isWritable: [0, 2, 3, 4, 7, 8, 9, 11, 12].includes(index) }));
    inner[inner.length - 1] = new TransactionInstruction({ programId: program, keys,
      data: Buffer.concat([crypto.createHash('sha256').update('global:create_alliance').digest().subarray(0, 8),
        string('GAMESOL Devnet QA'), string('TST'), string('')]) });
    mutate?.(inner);
  });
  const table = new AddressLookupTableAccount({ key: new PublicKey(allianceManifest.table), state: {
    deactivationSlot: 18446744073709551615n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0,
    authority: undefined, addresses: allianceManifest.addresses.map(x => new PublicKey(x)),
  } });
  const compressed = new VersionedTransaction(new TransactionMessage({ payerKey: fixture.payer,
    recentBlockhash: PublicKey.default.toBase58(), instructions: fixture.wrapped }).compileToV0Message([table]));
  return { ...fixture, oldCompressed: fixture.compressed, compressed, table };
}

module.exports = { allianceTransactionFixture };
if (require.main === module) (async () => {
  for (const rent of [false, true]) {
    const f = await allianceTransactionFixture(rent);
    let bytes;
    try { bytes = f.transaction.serialize().length; } catch { bytes = 'over serialization limit'; }
    console.log({ rent, bytes, compressed: f.compressed.serialize().length });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
