const {PublicKey, Keypair, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, AddressLookupTableAccount} = require('@solana/web3.js');
const {TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync} = require('@solana/spl-token');
const {storeTransactionFixture} = require('./store-transaction-fixture.cjs');
const manifest = require('../src/market-lookup-table.json');
const game = new PublicKey(manifest.addresses[0]);
const market = new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
const pda = (seed, key, program = market) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(key ? [key.toBuffer()] : [])], program)[0];

async function planetBuyerFixture(setup, mutate = () => {}, origin = 'https://chained-universe.vercel.app', deferred = false) {
  const f = await storeTransactionFixture(false, inner => {
    const buyer = inner[0].keys[0].pubkey, seller = Keypair.generate().publicKey, planet = Keypair.generate().publicKey;
    const mint = new PublicKey(manifest.antimatterMint), sellerAta = getAssociatedTokenAddressSync(mint, seller, true);
    const keys = [buyer, seller, pda('market_config'), Keypair.generate().publicKey, pda('planet_listing_index', planet),
      pda('seller_counter', seller), mint, getAssociatedTokenAddressSync(mint, buyer, true), sellerAta,
      pda('market_escrow'), new PublicKey(manifest.treasuryAntimatter), pda('market_authority'), TOKEN_PROGRAM_ID,
      game, planet, Keypair.generate().publicKey, pda('planet_ownership', planet, game), pda('player_profile', buyer, game),
      SystemProgram.programId, Keypair.generate().publicKey, Keypair.generate().publicKey];
    inner[0] = new TransactionInstruction({programId: market,
      keys: keys.map((pubkey, index) => ({pubkey, isSigner: index === 0, isWritable: ![11,12,13,18].includes(index)})),
      data: Buffer.from([48,116,122,166,251,1,167,31])});
    if (setup) {
      inner.unshift(createAssociatedTokenAccountInstruction(buyer, sellerAta, seller, mint));
      inner.unshift(new TransactionInstruction({programId: game,
        keys: [{pubkey: new PublicKey(manifest.sponsor), isSigner: true, isWritable: true},
          {pubkey: buyer, isSigner: false, isWritable: true}, {pubkey: SystemProgram.programId, isSigner: false, isWritable: false}],
        data: Buffer.concat([Buffer.from([87,113,100,97,218,156,201,21]), Buffer.alloc(8)])}));
    }
    mutate(inner);
  }, origin, deferred);
  const table = new AddressLookupTableAccount({key: new PublicKey(manifest.table),
    state: {...f.table.state, addresses: manifest.addresses.map(address => new PublicKey(address))}});
  const compressed = new VersionedTransaction(new TransactionMessage({payerKey: f.payer,
    recentBlockhash: PublicKey.default.toBase58(), instructions: f.wrapped}).compileToV0Message([table]));
  return {...f, table, compressed};
}
module.exports = {planetBuyerFixture};
