import type { Resources } from './game-state';

export function marketStorageError(type: number, amount: bigint, resources: Resources | undefined): string | null {
  if (!resources) return 'Checking destination storage. Wait for the world to load.';
  const field = (['metal', 'crystal', 'deuterium'] as const)[type];
  if (!field || amount <= 0n) return 'This resource offer is invalid. Refresh the market.';
  const cap = resources[`${field}Cap`];
  const available = cap > resources[field] ? cap - resources[field] : 0n;
  if (amount <= available) return null;
  return `Not enough ${field} storage. This world has room for ${available.toLocaleString()}, but this order delivers ${amount.toLocaleString()}. Upgrade storage or choose a smaller order. No payment was sent.`;
}
