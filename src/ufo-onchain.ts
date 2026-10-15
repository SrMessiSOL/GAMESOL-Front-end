import { Connection, Ed25519Program, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { GAME_STATE_PROGRAM_ID } from './game-state';
export type UfoLootItem = { kind: number; doctrine: number; trait: string };
export type UfoChainState = { commander: string; nonce: bigint; owner: string; asset: string; doctrine: number; route: number; status: number; stage: number; mistakes: number; booster: boolean; nextActionAt: number; lastStarted: number; completed: bigint; equipped: number; loot: UfoLootItem[] };
export type UfoAttestation = { proof: { owner: string; asset: string; nonce: string; doctrine: number; route: number; accessory: number[]; hair: number[]; expires: number }; message: string; signature: string; attestor: string };
export const ufoPda = (seed: string, address?: string) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...(address ? [new PublicKey(address).toBuffer()] : [])], GAME_STATE_PROGRAM_ID)[0];
const disc = Buffer.from([112,169,20,1,26,146,19,32]);
export const UFO_ROLES = ['Commander', 'Engineer', 'Navigator', 'Escort', 'Biologist', 'Quartermaster', 'Envoy'];
export const UFO_BOOSTERS = ['', 'Repair kit', 'Survey scanner', 'Convoy beacon', 'Sample capsule', 'Supply manifest', 'Contact relay'];
const bodyLoot = ['', 'Engineer hull decal', 'Stellar chart banner', 'Escort wing decal', 'Ecosystem expedition badge', 'Convoy command banner', 'First-contact insignia'];
export const lootName = (item: UfoLootItem) => item.kind === 0 ? bodyLoot[item.doctrine] || 'Commander decal' : `${item.trait} ${item.kind === 1 ? 'insignia' : 'commander crest'}`;
const text = (data: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, data.indexOf(0) < 0 ? data.length : data.indexOf(0)));
export function decodeUfoLoadout(data: Buffer): UfoChainState {
  if (data.length < 211 || !data.subarray(0,8).equals(disc)) throw new Error('Invalid on-chain UFO loadout.');
  const count = data.readUInt32LE(207);
  if (count > 24 || data.length < 211 + count * 34) throw new Error('Invalid on-chain cosmetic inventory.');
  const loot = Array.from({length: count}, (_, index) => { const offset = 211 + index * 34; return {kind: data[offset], doctrine: data[offset+1], trait: text(data.subarray(offset+2,offset+34))}; });
  return { commander: new PublicKey(data.subarray(8,40)).toBase58(), nonce: data.readBigUInt64LE(40), owner: new PublicKey(data.subarray(48,80)).toBase58(), asset: new PublicKey(data.subarray(80,112)).toBase58(), doctrine: data[112], route: data[113], status: data[178], stage: data[179], mistakes: data[180], booster: data[181] === 1, nextActionAt: Number(data.readBigInt64LE(182)), lastStarted: Number(data.readBigInt64LE(190)), completed: data.readBigUInt64LE(198), equipped: data[206], loot };
}
export async function fetchUfoLoadout(connection: Connection, commander: string) {
  const account = await connection.getAccountInfo(ufoPda('ufo_loadout',commander),'confirmed');
  if (!account) return null;
  if (!account.owner.equals(GAME_STATE_PROGRAM_ID)) throw new Error('Invalid UFO account owner.');
  const state = decodeUfoLoadout(account.data);
  if (state.commander !== commander) throw new Error('UFO loadout belongs to another commander.');
  return state;
}
export type CommanderIdentity = { commander: string; nonce: bigint; owner: string; asset: string; verifiedAt: bigint };
export async function fetchCommanderIdentity(connection: Connection, commander: string): Promise<CommanderIdentity | null> {
  const account = await connection.getAccountInfo(ufoPda('commander_identity', commander), 'confirmed');
  if (!account) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('account:CommanderIdentity'));
  const data = account.data;
  if (!account.owner.equals(GAME_STATE_PROGRAM_ID) || data.length !== 120
    || !data.subarray(0, 8).equals(Buffer.from(hash).subarray(0, 8))
    || !new PublicKey(data.subarray(8, 40)).equals(new PublicKey(commander))) {
    throw new Error('Invalid on-chain commander identity.');
  }
  return { commander, nonce: data.readBigUInt64LE(40), owner: new PublicKey(data.subarray(48, 80)).toBase58(),
    asset: new PublicKey(data.subarray(80, 112)).toBase58(), verifiedAt: data.readBigInt64LE(112) };
}

export async function commanderIdentityInstructions(commander: string, action: 'set' | 'clear', attestation?: UfoAttestation) {
  const player = new PublicKey(commander);
  const identity = { pubkey: ufoPda('commander_identity', commander), isSigner: false, isWritable: true };
  if (action === 'clear') return [new TransactionInstruction({ programId: GAME_STATE_PROGRAM_ID,
    keys: [{ pubkey: player, isSigner: true, isWritable: false }, identity],
    data: await instructionData('clear_commander_identity', Buffer.alloc(0)) })];
  if (!attestation) throw new Error('Missing commander ownership proof.');
  const proof = proofData(attestation);
  const expected = Buffer.concat([Buffer.from('gamesol:commander:devnet:v1'), GAME_STATE_PROGRAM_ID.toBuffer(),
    new PublicKey('53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb').toBuffer(), player.toBuffer(), proof]);
  if (!Buffer.from(attestation.message, 'base64').equals(expected)) throw new Error('Ownership proof does not authorize this commander selection.');
  return [Ed25519Program.createInstructionWithPublicKey({ publicKey: new PublicKey(attestation.attestor).toBytes(),
    message: expected, signature: Buffer.from(attestation.signature, 'base64') }), new TransactionInstruction({
    programId: GAME_STATE_PROGRAM_ID, keys: [{ pubkey: player, isSigner: true, isWritable: true },
      { pubkey: ufoPda('player_profile', commander), isSigner: false, isWritable: false },
      { pubkey: ufoPda('ufo_config'), isSigner: false, isWritable: false }, identity,
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: await instructionData('set_commander_identity', proof) })];
}
async function instructionData(name: string, bytes: Buffer) {
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`global:${name}`));
  return Buffer.concat([Buffer.from(hash).subarray(0,8),bytes]);
}
export async function isUfoSessionBundle(instructions: TransactionInstruction[], commander: PublicKey): Promise<boolean> {
  if (instructions.length < 2 || instructions.length > 3) return false;
  const [verification] = instructions;
  const action = instructions[instructions.length - 1];
  if (!verification.programId.equals(Ed25519Program.programId) || verification.keys.length
    || !action.programId.equals(GAME_STATE_PROGRAM_ID) || !action.keys[0]?.pubkey.equals(commander)
    || !action.keys[0]?.isSigner) return false;
  const names = ['start_ufo_expedition', 'advance_ufo_expedition', 'claim_ufo_loot', 'set_commander_identity'];
  const discriminators = await Promise.all(names.map(name => instructionData(name, Buffer.alloc(0))));
  const kind = discriminators.findIndex(bytes => action.data.subarray(0, 8).equals(bytes));
  if (kind < 0 || action.data.length !== (kind === 1 ? 156 : 154)
    || (kind === 1 && (action.data[154] > 2 || action.data[155] > 1))) return false;
  if (instructions.length === 3) {
    const rent = instructions[1];
    if ((kind !== 0 && kind !== 3) || !rent.programId.equals(GAME_STATE_PROGRAM_ID) || rent.data.length !== 16
      || !rent.data.subarray(0, 8).equals(await instructionData('sponsor_account_rent', Buffer.alloc(0)))
      || rent.keys.length !== 3 || !rent.keys[0].isSigner || !rent.keys[1].pubkey.equals(commander)
      || !rent.keys[2].pubkey.equals(SystemProgram.programId)) return false;
  }
  const data = Buffer.from(verification.data);
  const message = Buffer.concat([Buffer.from(kind === 3 ? 'gamesol:commander:devnet:v1' : 'gamesol:ufo:devnet:v1'), GAME_STATE_PROGRAM_ID.toBuffer(),
    new PublicKey('53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb').toBuffer(), commander.toBuffer(), action.data.subarray(8, 154)]);
  return data.length === 112 + message.length && data[0] === 1 && data[1] === 0
    && data.readUInt16LE(2) === 48 && data.readUInt16LE(4) === 65535
    && data.readUInt16LE(6) === 16 && data.readUInt16LE(8) === 65535
    && data.readUInt16LE(10) === 112 && data.readUInt16LE(12) === message.length && data.readUInt16LE(14) === 65535
    && data.subarray(16, 48).equals(new PublicKey('9XEL6rVQ2GK85ic1j2Nf6kykybsAtsP8nYzNnNCMun4a').toBuffer())
    && data.subarray(112).equals(message);
}
export function proofData(attestation: UfoAttestation) {
  const p = attestation.proof; const nonce = Buffer.alloc(8); nonce.writeBigUInt64LE(BigInt(p.nonce)); const expires = Buffer.alloc(8); expires.writeBigInt64LE(BigInt(p.expires));
  if (p.accessory.length !== 32 || p.hair.length !== 32 || ![...p.accessory,...p.hair].every(v => Number.isInteger(v) && v >= 0 && v <= 255)) throw new Error('Invalid UFO trait attestation.');
  return Buffer.concat([new PublicKey(p.owner).toBuffer(),new PublicKey(p.asset).toBuffer(),nonce,Buffer.from([p.doctrine,p.route]),Buffer.from(p.accessory),Buffer.from(p.hair),expires]);
}
export async function ufoInstructions(commander: string, action: 'start'|'advance'|'claim'|'equip'|'abort', attestation?: UfoAttestation, choice = 0, booster = false) {
  if (!Number.isInteger(choice) || choice < 0 || choice > 255 || (action === 'advance' && choice > 2)) throw new Error('Invalid UFO command choice.');
  const player = new PublicKey(commander);
  const keys = [{pubkey:player,isSigner:true,isWritable:action==='start'}];
  if (action==='start') keys.push({pubkey:ufoPda('player_profile',commander),isSigner:false,isWritable:false});
  if (['start','advance','claim'].includes(action)) keys.push({pubkey:ufoPda('ufo_config'),isSigner:false,isWritable:false});
  keys.push({pubkey:ufoPda('ufo_loadout',commander),isSigner:false,isWritable:true});
  if (action==='start') {
    if (!attestation) throw new Error('Missing ownership proof.');
    keys.push({pubkey:ufoPda('ufo_asset_use',attestation.proof.asset),isSigner:false,isWritable:true},{pubkey:ufoPda('ufo_owner_use',attestation.proof.owner),isSigner:false,isWritable:true});
  }
  if (['start','advance','claim'].includes(action)) keys.push({pubkey:SYSVAR_INSTRUCTIONS_PUBKEY,isSigner:false,isWritable:false});
  if (action==='start') keys.push({pubkey:SystemProgram.programId,isSigner:false,isWritable:false});
  const names = {start:'start_ufo_expedition',advance:'advance_ufo_expedition',claim:'claim_ufo_loot',equip:'equip_ufo_loot',abort:'abort_ufo_expedition'};
  const privileged = ['start','advance','claim'].includes(action);
  if (privileged && !attestation) throw new Error('Missing ownership proof.');
  const data = await instructionData(names[action],Buffer.concat([privileged ? proofData(attestation!) : Buffer.alloc(0),action==='advance' ? Buffer.from([choice,booster ? 1 : 0]) : action==='equip' ? Buffer.from([choice]) : Buffer.alloc(0)]));
  const instruction = new TransactionInstruction({programId:GAME_STATE_PROGRAM_ID,keys,data});
  if (!privileged) return [instruction];
  const expected = Buffer.concat([Buffer.from('gamesol:ufo:devnet:v1'),GAME_STATE_PROGRAM_ID.toBuffer(),new PublicKey('53UVubjHQpC4RmUnDGU1PV3f2bYFk6GcWb3SgtYFMHTb').toBuffer(),player.toBuffer(),proofData(attestation!)]);
  if (!Buffer.from(attestation!.message,'base64').equals(expected)) throw new Error('Ownership attestation belongs to another game account.');
  return [Ed25519Program.createInstructionWithPublicKey({publicKey:new PublicKey(attestation!.attestor).toBytes(),message:expected,signature:Buffer.from(attestation!.signature,'base64')}),instruction];
}
