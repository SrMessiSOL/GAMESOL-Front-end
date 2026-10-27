import {PublicKey, TransactionInstruction, SystemProgram} from '@solana/web3.js';
import type {Connection} from '@solana/web3.js';
import {getAssociatedTokenAddressSync, unpackAccount} from '@solana/spl-token';
import {Buffer} from 'buffer';
import type {ShipClass} from './fleet-identity';

export const COSMETIC_SHIPS: readonly ShipClass[] = ['smallCargo','largeCargo','lightFighter','heavyFighter','cruiser','battleship','battlecruiser','bomber','destroyer','deathstar','recycler','espionageProbe','colonyShip','solarSatellite'];
// Prototype devnet prices, in six-decimal test-token units. No gameplay modifiers.
export const SHIP_SKINS = Object.freeze([
  Object.freeze({id:0,name:'Standard',price:0n,hull:'#92999b',trim:'#c6a558'}),
  Object.freeze({id:1,name:'Ion',price:1_000_000n,hull:'#dde8eb',trim:'#22cbbf'}),
  Object.freeze({id:2,name:'Scarlet',price:2_000_000n,hull:'#552d36',trim:'#e5e9ed'}),
  Object.freeze({id:3,name:'Solar',price:3_000_000n,hull:'#e0bb52',trim:'#26353b'}),
]);
export const COSMETIC_DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export type ShipSkinInventory={commander:PublicKey;owned:number;equipped:readonly number[];revision:bigint};
export type ShipSkinStoreSnapshot={commander:PublicKey;inventory:ShipSkinInventory|null;enabled:boolean;balance:bigint;mint:PublicKey|null;treasury:PublicKey|null;payment:PublicKey|null};

export function cosmeticCommandError(kind:'buy'|'equip',error:unknown):string{
  const message=error!==null&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:'';
  if(message.includes('Passkey approval timed out')&&message.includes('No command was submitted')){
    return kind==='buy'?'Approval timed out. No payment was sent. Try again when you are ready.':'Approval timed out. Your equipped livery was not changed.';
  }
  return 'The command could not be confirmed. Refresh your collection before trying again.';
}

export function cosmeticInventoryAddress(program:PublicKey,commander:PublicKey){
  return PublicKey.findProgramAddressSync([Buffer.from('ship_cosmetics'),commander.toBuffer()],program)[0];
}
async function discriminator(name:string){
  return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(name))).subarray(0,8);
}
export async function decodeShipSkins(program:PublicKey,commander:PublicKey,address:PublicKey,owner:PublicKey,data:Uint8Array):Promise<ShipSkinInventory>{
  const bytes=Buffer.from(data);
  if(!owner.equals(program)||!address.equals(cosmeticInventoryAddress(program,commander))||bytes.length!==63
    ||!bytes.subarray(0,8).equals(await discriminator('account:ShipCosmeticInventory'))
    ||!new PublicKey(bytes.subarray(8,40)).equals(commander))throw Error('Invalid on-chain cosmetic inventory.');
  const owned=bytes[40],equipped=[...bytes.subarray(41,55)];
  if((owned&~14)!==0||equipped.some(id=>id>3||(id!==0&&(owned&(1<<id))===0)))throw Error('Invalid cosmetic ownership.');
  return {commander,owned,equipped,revision:bytes.readBigUInt64LE(55)};
}
export function equippedShipSkin(inventory:ShipSkinInventory|null,ship:ShipClass){
  const id=inventory?.equipped[COSMETIC_SHIPS.indexOf(ship)]??0;
  return SHIP_SKINS[id]??SHIP_SKINS[0];
}
export async function readShipSkinInventory(connection:Pick<Connection,'getGenesisHash'|'getAccountInfo'>,program:PublicKey,commander:PublicKey){
  devnet(await connection.getGenesisHash());
  const address=cosmeticInventoryAddress(program,commander);
  const account=await connection.getAccountInfo(address,'confirmed');
  if(!account)return null;
  return decodeShipSkins(program,commander,address,account.owner,account.data);
}
function devnet(genesis:string){if(genesis!==COSMETIC_DEVNET_GENESIS)throw Error('Ship cosmetics are devnet only.');}
export async function readShipSkinStore(connection:Pick<Connection,'getGenesisHash'|'getAccountInfo'>,program:PublicKey,commander:PublicKey):Promise<ShipSkinStoreSnapshot>{
  devnet(await connection.getGenesisHash());
  const inventory=await readShipSkinInventory(connection,program,commander);
  const empty={commander,inventory,enabled:false,balance:0n,mint:null,treasury:null,payment:null};
  const address=PublicKey.findProgramAddressSync([Buffer.from('ship_cosmetic_store')],program)[0];
  const account=await connection.getAccountInfo(address,'confirmed');
  if(!account)return empty;
  const data=account.data;
  if(!account.owner.equals(program)||data.length!==73||!data.subarray(0,8).equals(await discriminator('account:ShipCosmeticStore'))||data[72]>1)throw Error('Invalid cosmetic store configuration.');
  const mint=new PublicKey(data.subarray(8,40)),treasury=new PublicKey(data.subarray(40,72));
  const mintAccount=await connection.getAccountInfo(mint,'confirmed');
  if(!mintAccount?.owner.equals(TOKEN_PROGRAM)||mintAccount.data.length!==82||mintAccount.data[44]!==6||mintAccount.data[45]!==1)throw Error('Unsupported cosmetic payment mint.');
  const payment=getAssociatedTokenAddressSync(mint,commander,true);
  const treasuryAccount=await connection.getAccountInfo(treasury,'confirmed');
  if(!treasuryAccount)throw Error('Cosmetic treasury is unavailable.');
  const recipient=unpackAccount(treasury,treasuryAccount,TOKEN_PROGRAM);
  if(!recipient.mint.equals(mint)||recipient.isFrozen)throw Error('Cosmetic treasury is unavailable.');
  const paymentAccount=await connection.getAccountInfo(payment,'confirmed');
  const source=paymentAccount?unpackAccount(payment,paymentAccount,TOKEN_PROGRAM):null;
  if(source&&(!source.owner.equals(commander)||!source.mint.equals(mint)||source.isFrozen))throw Error('Cosmetic payment account is unavailable.');
  return {commander,inventory,enabled:data[72]===1,balance:source?.amount??0n,mint,treasury,payment};
}

export function cosmeticPurchaseBlock(state:ShipSkinStoreSnapshot,skin:number):string|null{
  if(!Number.isInteger(skin)||skin<1||skin>3)return 'Choose a livery';
  if((state.inventory?.owned??0)&(1<<skin))return 'Owned';
  if(!state.enabled||!state.mint||!state.treasury||!state.payment)return 'Store not available';
  if(state.balance<SHIP_SKINS[skin].price)return 'Insufficient USDC';
  return null;
}

export function createShipCosmeticController({connection,program,commander,send}:{connection:Pick<Connection,'getGenesisHash'|'getAccountInfo'>;program:PublicKey;commander:PublicKey;send:(instructions:TransactionInstruction[])=>Promise<string>}){
  let pending=false;
  const read=()=>readShipSkinStore(connection,program,commander);
  async function buy(skin:number){
    if(pending)throw Error('A cosmetic command is already pending.');pending=true;
    try{
      const fresh=await read(),block=cosmeticPurchaseBlock(fresh,skin);
      if(block==='Owned')return fresh;
      if(block)throw Error(block);
      const ix=await buyShipSkinInstruction(await connection.getGenesisHash(),program,commander,fresh.mint!,fresh.treasury!,fresh.payment!,skin);
      try{await send([ix]);}catch(error){
        // An interrupted wallet response is not evidence that payment failed.
        const recovered=await read().catch(()=>null);
        if(recovered?.inventory&&((recovered.inventory.owned&(1<<skin))!==0))return recovered;
        throw error;
      }
      const confirmed=await read();
      if(!confirmed.inventory||!(confirmed.inventory.owned&(1<<skin)))throw Error('Purchase confirmation is not available yet. Refresh before retrying.');
      return confirmed;
    }finally{pending=false;}
  }
  async function equip(ship:ShipClass,skin:number,expectedRevision:bigint){
    if(pending)throw Error('A cosmetic command is already pending.');pending=true;
    try{
      const fresh=await read();
      if(!fresh.inventory||fresh.inventory.revision!==expectedRevision)throw Error('Your loadout changed. Refresh before equipping.');
      const ix=await equipShipSkinInstruction(await connection.getGenesisHash(),program,fresh.inventory,ship,skin);
      try{await send([ix]);}catch(error){const recovered=await read().catch(()=>null);if(recovered?.inventory?.equipped[COSMETIC_SHIPS.indexOf(ship)]===skin&&recovered.inventory.revision>expectedRevision)return recovered;throw error;}
      const confirmed=await read();
      if(!confirmed.inventory||confirmed.inventory.equipped[COSMETIC_SHIPS.indexOf(ship)]!==skin||confirmed.inventory.revision<=expectedRevision)throw Error('Equipment confirmation is not available yet. Refresh before retrying.');
      return confirmed;
    }finally{pending=false;}
  }
  return {read,buy,equip};
}
export async function equipShipSkinInstruction(genesis:string,program:PublicKey,inventory:ShipSkinInventory,ship:ShipClass,skin:number){
  devnet(genesis);
  const index=COSMETIC_SHIPS.indexOf(ship);
  if(index<0||!Number.isInteger(skin)||skin<0||skin>3||skin!==0&&(inventory.owned&(1<<skin))===0)throw Error('This skin is not owned.');
  const args=Buffer.alloc(10);args[0]=index;args[1]=skin;args.writeBigUInt64LE(inventory.revision,2);
  return new TransactionInstruction({programId:program,keys:[
    {pubkey:inventory.commander,isSigner:true,isWritable:false},
    {pubkey:cosmeticInventoryAddress(program,inventory.commander),isSigner:false,isWritable:true},
  ],data:Buffer.concat([await discriminator('global:equip_ship_cosmetic'),args])});
}
export async function buyShipSkinInstruction(genesis:string,program:PublicKey,commander:PublicKey,mint:PublicKey,treasury:PublicKey,payment:PublicKey,skin:number){
  devnet(genesis);
  if(!Number.isInteger(skin)||skin<1||skin>3)throw Error('Unknown ship skin.');
  const pda=(seed:string)=>PublicKey.findProgramAddressSync([Buffer.from(seed)],program)[0];
  const profile=PublicKey.findProgramAddressSync([Buffer.from('player_profile'),commander.toBuffer()],program)[0];
  const args=Buffer.alloc(9);args[0]=skin;args.writeBigUInt64LE(SHIP_SKINS[skin].price,1);
  const keys=[commander,profile,pda('ship_cosmetic_store'),mint,payment,treasury,cosmeticInventoryAddress(program,commander),TOKEN_PROGRAM,SystemProgram.programId];
  return new TransactionInstruction({programId:program,keys:keys.map((pubkey,i)=>({pubkey,isSigner:i===0,isWritable:[0,4,5,6].includes(i)})),
    data:Buffer.concat([await discriminator('global:buy_ship_cosmetic'),args])});
}
