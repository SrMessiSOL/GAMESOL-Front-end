const {Connection, PublicKey} = require('@solana/web3.js');
const {BorshAccountsCoder} = require('@coral-xyz/anchor');
const {unpackAccount} = require('@solana/spl-token');
const {decoder} = require('./read-devnet-game-checkpoint.cjs');
const manifest = require('../src/market-lookup-table.json');
const pk = name => ({name, type: 'publicKey'});
const field = (name, type) => ({name, type});
// Schemas match the checked-in Anchor state definitions, not inferred byte offsets.
const coder = new BorshAccountsCoder({version: '0.1.0', name: 'checkpoint', instructions: [], accounts: [
  {name: 'PlanetOwnershipRegistry', type: {kind: 'struct', fields: [pk('planet'), pk('authority'), pk('ownerIndex'), field('bump','u8')]}},
  {name: 'PlanetOwnerIndex', type: {kind: 'struct', fields: [pk('authority'), field('slot','u32'), pk('planet'), field('active','bool'), field('bump','u8')]}},
  {name: 'PlanetListingIndex', type: {kind: 'struct', fields: [pk('planet'), pk('listing'), pk('seller'), field('active','bool'), field('bump','u8')]}},
  {name: 'PlayerProfile', type: {kind: 'struct', fields: [pk('authority'), field('planetCount','u32'), field('bump','u8')]}},
  {name: 'PlanetCoordinates', type: {kind: 'struct', fields: [field('galaxy','u16'), field('system','u16'), field('position','u8'), pk('planet'), pk('authority'), field('debrisMetal','u64'), field('debrisCrystal','u64'), field('bump','u8')]}},
]});

async function checkpoint() {
  const rpc = new Connection('https://chained-universe.vercel.app/api/solana-rpc', 'finalized');
  if (await rpc.getGenesisHash() !== manifest.genesis) throw Error('Devnet required.');
  const game = decoder(), market = new PublicKey('6hPzaemT1siozGVM7MUHvjFK79WNGCrKruEBMEKA1DjA');
  const planet = new PublicKey('CyKmBAd6FttU8szoaUEao1cY7iUQGEhZGCJaAW7wgkFD');
  const pda = (program, seed, ...keys) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...keys.map(key => key instanceof PublicKey ? key.toBuffer() : key)], program)[0];
  const listingIndex = pda(market, 'planet_listing_index', planet);
  const signatures = await rpc.getSignaturesForAddress(listingIndex, {limit: 3}, 'finalized');
  const minContextSlot = signatures[0]?.slot || 0;
  const indexAccount = await rpc.getAccountInfo(listingIndex, {commitment: 'finalized', minContextSlot});
  if (!indexAccount?.owner.equals(market)) throw Error('Listing index owner mismatch.');
  const preliminary = coder.decode('PlanetListingIndex', indexAccount.data);
  const galaxy = Buffer.alloc(2), system = Buffer.alloc(2); galaxy.writeUInt16LE(9); system.writeUInt16LE(427);
  const entries = [
    {name: 'planet', key: planet, owner: game.program},
    {name: 'registry', key: pda(game.program, 'planet_ownership', planet), owner: game.program, type: 'PlanetOwnershipRegistry'},
    {name: 'coordinates', key: pda(game.program, 'planet_coords', galaxy, system, Buffer.from([1])), owner: game.program, type: 'PlanetCoordinates'},
    {name: 'listingIndex', key: listingIndex, owner: market, type: 'PlanetListingIndex'},
    {name: 'listingExists', key: preliminary.listing},
  ];
  const wallets = {original: 'G6tRKz9XQpL5eFPnV3aqz3nJXhy8DQkUAfaz7aL27s6r', newAccount: 'Fv9xRN5wqkQMWUqgDL7LPfXmhWkXnZS9ttcXW9oyRvdd'};
  for (const [label, address] of Object.entries(wallets)) {
    const wallet = new PublicKey(address);
    entries.push({name: `${label}Profile`, key: pda(game.program, 'player_profile', wallet), owner: game.program, type: 'PlayerProfile'});
    for (let slot = 0; slot < 4; slot++) {
      const seed = Buffer.alloc(4); seed.writeUInt32LE(slot);
      entries.push({name: `${label}Index${slot}`, key: pda(game.program, 'planet_owner_index', wallet, seed), owner: game.program, type: 'PlanetOwnerIndex', optional: true});
    }
  }
  for (const [name, key] of Object.entries({originalAM: 'H7nXhtcLC6Ts9MvHK4YczYdtXjMM4DZMUHTjMDdzRLuX', newAccountAM: '2vLpr4zaoZEXm84xY7Pq6LzKf9FV7JybF7kbmKtDcLKw', treasuryAM: manifest.treasuryAntimatter, escrowAM: pda(market, 'market_escrow').toBase58()})) entries.push({name, key: new PublicKey(key), token: true});
  const snapshot = await rpc.getMultipleAccountsInfoAndContext(entries.map(entry => entry.key), {commitment: 'finalized', minContextSlot});
  const result = {network: 'devnet', slot: snapshot.context.slot, signatures};
  entries.forEach((entry, index) => {
    const account = snapshot.value[index];
    if (entry.name === 'listingExists') {result[entry.name] = Boolean(account); return;}
    if (!account && entry.optional) {result[entry.name] = null; return;}
    if (!account || entry.owner && !account.owner.equals(entry.owner)) throw Error(`Account verification failed: ${entry.name}`);
    if (entry.token) {
      const token = unpackAccount(entry.key, account);
      if (token.mint.toBase58() !== manifest.antimatterMint) throw Error('Wrong token mint.');
      result[entry.name] = token.amount.toString();
    } else if (entry.type) result[entry.name] = coder.decode(entry.type, account.data);
    else {const state = game.deserializePlanetState(account.data); result.planet = {authority: state.authority, player: state.player, activeMissions: state.activeMissions};}
  });
  if (!result.listingIndex.listing.equals(preliminary.listing)) throw Error('Listing changed during preparation; rerun the read-only checkpoint.');
  return result;
}
module.exports = {checkpoint};
if (require.main === module) checkpoint().then(value => console.log(JSON.stringify(value))).catch(error => {console.error(error.message); process.exitCode = 1;});
