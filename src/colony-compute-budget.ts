import { ComputeBudgetProgram, PublicKey, type TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';

const GAME_PROGRAM = new PublicKey('J6rNikvM7XLs6REtbbhMhe8NVd6Nfqa1C7PDfgHSDFkq');
const INITIALIZE_COLONY = Buffer.from([91, 184, 105, 243, 90, 175, 137, 217]);

// Compute-budget instructions must be top-level, not inside Lazor's CPI bundle.
export function colonyComputeBudget(
  commands: TransactionInstruction[],
  wrapped: TransactionInstruction[],
): TransactionInstruction[] {
  if (!commands.some(ix => ix.programId.equals(GAME_PROGRAM)
    && ix.data.subarray(0, 8).equals(INITIALIZE_COLONY))) return wrapped;
  return [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ...wrapped.filter(ix => !ix.programId.equals(ComputeBudgetProgram.programId)
      || ix.data[0] !== 2)];
}
