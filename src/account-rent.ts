import type { Connection } from '@solana/web3.js';

export async function accountRentTotal(connection: Connection, spaces: number[]): Promise<number> {
  if (spaces.some(space => !Number.isSafeInteger(space) || space < 0)) throw new Error('Invalid account size for rent.');
  const sizes = [...new Set(spaces)];
  const quotes = await Promise.all(sizes.map(space => connection.getMinimumBalanceForRentExemption(space, 'confirmed')));
  if (quotes.some(lamports => !Number.isSafeInteger(lamports) || lamports <= 0)) throw new Error('Account rent quote is unavailable.');
  const bySize = new Map(sizes.map((space, index) => [space, quotes[index]]));
  const total = spaces.reduce((sum, space) => sum + bySize.get(space)!, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Account rent total is too large.');
  return total;
}
