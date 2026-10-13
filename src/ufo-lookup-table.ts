import { AddressLookupTableAccount, AddressLookupTableProgram, Connection, PublicKey } from '@solana/web3.js';
import manifest from './ufo-lookup-table.json';

let cached: Promise<AddressLookupTableAccount> | null = null;

export function fetchUfoLookupTable(connection: Connection, sponsor: PublicKey): Promise<AddressLookupTableAccount> {
  if (sponsor.toBase58() !== manifest.sponsor) throw new Error('The UFO transaction table belongs to another sponsor.');
  if (!cached) {
    cached = (async () => {
      if (await connection.getGenesisHash() !== manifest.genesis) throw new Error('UFO expeditions are restricted to devnet.');
      const key = new PublicKey(manifest.table);
      const account = await connection.getAccountInfo(key, 'confirmed');
      if (!account || !account.owner.equals(AddressLookupTableProgram.programId)) throw new Error('UFO transaction table is unavailable.');
      const table = new AddressLookupTableAccount({ key, state: AddressLookupTableAccount.deserialize(account.data) });
      if (!table.isActive() || table.state.authority || table.state.addresses.length !== manifest.addresses.length
        || table.state.addresses.some((address, index) => address.toBase58() !== manifest.addresses[index])) {
        throw new Error('UFO transaction table failed verification.');
      }
      return table;
    })().catch(error => { cached = null; throw error; });
  }
  return cached;
}
