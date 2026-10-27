import {PublicKey} from '@solana/web3.js';
import type {Connection} from '@solana/web3.js';
import type {ShipClass} from './fleet-identity';
import {COSMETIC_DEVNET_GENESIS,COSMETIC_SHIPS,cosmeticInventoryAddress,decodeShipSkins,type ShipSkinInventory} from './ship-cosmetics';

export const MAX_TRAVEL_COSMETIC_OWNERS=32;
export type TravelCosmeticInventories=ReadonlyMap<string,ShipSkinInventory>;
export async function readTravelCosmetics(connection:Pick<Connection,'getGenesisHash'|'getMultipleAccountsInfo'>,program:PublicKey,owners:readonly string[]):Promise<TravelCosmeticInventories>{
  if(await connection.getGenesisHash()!==COSMETIC_DEVNET_GENESIS)return new Map();
  const commanders:PublicKey[]=[];
  for(const owner of [...new Set(owners)].sort()){
    try{const key=new PublicKey(owner);if(key.toBase58()===owner)commanders.push(key);}catch{/* Unknown owners use Standard. */}
    if(commanders.length===MAX_TRAVEL_COSMETIC_OWNERS)break;
  }
  if(!commanders.length)return new Map();
  const addresses=commanders.map(owner=>cosmeticInventoryAddress(program,owner));
  const accounts=await connection.getMultipleAccountsInfo(addresses,'confirmed');
  const records=new Map<string,ShipSkinInventory>();
  await Promise.all(commanders.map(async(owner,i)=>{
    const account=accounts[i];if(!account)return;
    try{records.set(owner.toBase58(),await decodeShipSkins(program,owner,addresses[i],account.owner,account.data));}catch{/* Invalid records never supply a skin. */}
  }));
  return records;
}

export function travelShipSkin(records:TravelCosmeticInventories,owner:string|undefined,ship:ShipClass|undefined):number{
  if(!owner||!ship)return 0;
  const record=records.get(owner);
  if(!record||record.commander.toBase58()!==owner)return 0;
  const index=COSMETIC_SHIPS.indexOf(ship),skin=record.equipped[index];
  return index>=0&&Number.isInteger(skin)&&skin>0&&skin<=3&&(record.owned&(1<<skin))!==0?skin:0;
}
