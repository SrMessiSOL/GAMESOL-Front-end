import type { Resources } from './game-state';

const U64_MAX = (1n << 64n) - 1n;
const saturate = (value: bigint) => value > U64_MAX ? U64_MAX : value;

// Match the program's bounded integer settlement without changing stored state.
export function projectResources(resources: Resources, nowTs: number): Resources {
  if (!Number.isSafeInteger(nowTs) || resources.lastUpdateTs <= 0 || nowTs <= resources.lastUpdateTs) return resources;
  const elapsed = BigInt(Math.min(86400, nowTs - resources.lastUpdateTs));
  const efficiency = resources.energyConsumption === 0n ? 10000n
    : resources.energyProduction * 10000n / resources.energyConsumption;
  const boundedEfficiency = efficiency > 10000n ? 10000n : efficiency;
  const produce = (current: bigint, rate: bigint, cap: bigint) => {
    const gained = saturate(saturate(rate * elapsed) * boundedEfficiency) / 3600n / 10000n;
    const balance = saturate(current + gained);
    return balance > cap ? cap : balance;
  };
  return { ...resources,
    metal: produce(resources.metal, resources.metalHour, resources.metalCap),
    crystal: produce(resources.crystal, resources.crystalHour, resources.crystalCap),
    deuterium: produce(resources.deuterium, resources.deuteriumHour, resources.deuteriumCap),
  };
}
