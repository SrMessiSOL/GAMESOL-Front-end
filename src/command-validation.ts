import type { Resources } from './game-state';
import type { StorePack } from './store-catalog';

export const MAX_ORDER_QUANTITY = 0xffffffff;

export function defenseProductionBlock(index: number, quantity: number, online = 0): string | null {
  if (!Number.isInteger(index) || index < 0 || index >= 8) return 'Unavailable';
  if (!isWholeQuantity(quantity)) return 'Invalid quantity';
  if (index === 6 || index === 7) {
    if (online > 0) return 'Field online';
    if (quantity !== 1) return 'One shield dome only';
  }
  return null;
}

export function rewardStorageBlock(reward: {metal: number; crystal: number; deuterium: number}, resources: Resources | undefined): string | null {
  if (!resources) return 'Checking storage';
  for (const field of ['metal', 'crystal', 'deuterium'] as const) {
    if (!Number.isSafeInteger(reward[field]) || reward[field] < 0) return 'Invalid reward';
    if (resources[field] + BigInt(reward[field]) > resources[`${field}Cap`]) return `Needs ${field} storage`;
  }
  return null;
}

export function storePackBlock(pack: StorePack, resources: Resources | undefined): string | null {
  if (pack.shieldSeconds) return 'Shield packs unavailable';
  return rewardStorageBlock(pack.reward, resources);
}

export function constructionBlockReason({ buildingIdx, level, freeFields, constructionBusy, productionBusy, researchBusy }: {
  buildingIdx: number; level: number; freeFields: number; constructionBusy: boolean; productionBusy: boolean; researchBusy: boolean;
}): string | null {
  if (constructionBusy) return 'Construction active';
  if (freeFields <= 0) return 'No free building fields';
  if (level >= 255) return 'Maximum level reached';
  if (buildingIdx === 7 && productionBusy) return 'Production active';
  if (buildingIdx === 11 && researchBusy) return 'Research active';
  return null;
}

export function assertCommandInteger(label: string, value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Check ${label}: enter a whole number from ${min.toLocaleString()} to ${max.toLocaleString()}. Nothing was submitted.`);
  }
}

export function assertResourceAmount(label: string, value: bigint | number, minimum = 0n) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`Check ${label}: enter an exact whole amount. Nothing was submitted.`);
  }
  const amount = BigInt(value);
  if (amount < minimum || amount > 0xffffffffffffffffn) {
    throw new Error(`Check ${label}: the amount is outside the supported range. Nothing was submitted.`);
  }
}

export function samePlanetCoordinates(source: { galaxy: number; system: number; position: number }, target: { galaxy: number; system: number; position: number }) {
  return source.galaxy === target.galaxy && source.system === target.system && source.position === target.position;
}

export function isWholeQuantity(value: string | number, min = 1, max = MAX_ORDER_QUANTITY) {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max;
}

export function formatUsdc(amount: bigint) {
  const absolute = amount < 0n ? -amount : amount;
  const units = (absolute / 1_000_000n).toLocaleString('en-US');
  const fraction = (absolute % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${amount < 0n ? '-' : ''}${units}${fraction ? `.${fraction}` : ''}`;
}

export function storePurchaseEligibility({ enabled, purchased, balance, price, pending = false }: {
  enabled: boolean; purchased: boolean; balance: bigint; price: bigint; pending?: boolean;
}) {
  if (pending) return { allowed: false, label: 'Processing' };
  if (!enabled) return { allowed: false, label: 'Store unavailable' };
  if (purchased) return { allowed: false, label: 'Purchased' };
  if (balance < price) return { allowed: false, label: 'Insufficient USDC' };
  return { allowed: true, label: 'Review purchase' };
}
