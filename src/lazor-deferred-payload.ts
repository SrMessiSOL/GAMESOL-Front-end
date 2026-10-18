import { LazorKitClient } from '@lazorkit/wallet';
import { PublicKey } from '@solana/web3.js';

type DeferredPayload = Parameters<LazorKitClient['executeDeferredFromPayload']>[0]['deferredPayload'];

export function serializeDeferredPayload(payload: DeferredPayload): string {
  return JSON.stringify({
    walletPda: payload.walletPda.toBase58(), deferredExecPda: payload.deferredExecPda.toBase58(),
    compactInstructions: payload.compactInstructions.map(ix => ({...ix, data: Array.from(ix.data)})),
    remainingAccounts: payload.remainingAccounts.map(meta => ({...meta, pubkey: meta.pubkey.toBase58()})),
  });
}

export function deserializeDeferredPayload(raw: string, wallet: string): DeferredPayload {
  if (raw.length > 16_000) throw new Error('Invalid saved purchase size.');
  const value = JSON.parse(raw);
  if (value.walletPda !== wallet || !Array.isArray(value.compactInstructions) || value.compactInstructions.length < 1
    || value.compactInstructions.length > 3 || !Array.isArray(value.remainingAccounts) || value.remainingAccounts.length > 64) {
    throw new Error('Invalid saved purchase account.');
  }
  const byte = (n: unknown): n is number => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255;
  return {
    walletPda: new PublicKey(value.walletPda), deferredExecPda: new PublicKey(value.deferredExecPda),
    compactInstructions: value.compactInstructions.map((ix: {programIdIndex: number; accountIndexes: number[]; data: number[]}) => {
      if (!byte(ix.programIdIndex) || !Array.isArray(ix.accountIndexes) || ix.accountIndexes.length > 64
        || !ix.accountIndexes.every(byte) || !Array.isArray(ix.data) || ix.data.length > 128 || !ix.data.every(byte)) {
        throw new Error('Invalid saved purchase instructions.');
      }
      return {...ix, data: Uint8Array.from(ix.data)};
    }),
    remainingAccounts: value.remainingAccounts.map((meta: {pubkey: string; isSigner: boolean; isWritable: boolean}) => {
      if (typeof meta.isSigner !== 'boolean' || typeof meta.isWritable !== 'boolean') throw new Error('Invalid saved purchase permissions.');
      return {...meta, pubkey: new PublicKey(meta.pubkey)};
    }),
  };
}
