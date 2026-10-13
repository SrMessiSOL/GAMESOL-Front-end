export const MAX_ORDER_QUANTITY = 0xffffffff;

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
