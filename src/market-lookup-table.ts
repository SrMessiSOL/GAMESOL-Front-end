import { AddressLookupTableAccount, AddressLookupTableProgram, Connection, PublicKey } from '@solana/web3.js';
import manifest from './market-lookup-table.json';

let cached: Promise<AddressLookupTableAccount> | null = null;
export function fetchMarketLookupTable(connection: Connection, sponsor: PublicKey): Promise<AddressLookupTableAccount> {
  if (sponsor.toBase58() !== manifest.sponsor) throw new Error('Market table sponsor mismatch.');
  cached ||= (async () => {
    if (await connection.getGenesisHash() !== manifest.genesis) throw new Error('Market compression is devnet-only.');
    const key = new PublicKey(manifest.table);
    const account = await connection.getAccountInfo(key, 'confirmed');
    if (!account?.owner.equals(AddressLookupTableProgram.programId)) throw new Error('Market transaction table is unavailable.');
    const table = new AddressLookupTableAccount({ key, state: AddressLookupTableAccount.deserialize(account.data) });
    if (!table.isActive() || table.state.authority || table.state.addresses.length !== manifest.addresses.length
      || table.state.addresses.some((address, index) => address.toBase58() !== manifest.addresses[index])) throw new Error('Market transaction table failed verification.');
    return table;
  })().catch(error => { cached = null; throw error; });
  return cached;
}
