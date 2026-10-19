import { ALLIANCE_BUILDING_MAX_LEVEL } from './alliance-contribution';

export type AllianceUpgradeQuote = {
  expectedLevel: number;
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  antimatter: bigint;
};

export function allianceUpgradeQuote(buildingId: number, treasury: {
  logisticsHub: number; researchGrid: number; defenseCoordination: number; tradeNetwork: number;
}): AllianceUpgradeQuote {
  if (!Number.isInteger(buildingId) || buildingId < 0 || buildingId > 3) throw new Error('Invalid alliance building.');
  const expectedLevel = [treasury.logisticsHub, treasury.researchGrid, treasury.defenseCoordination, treasury.tradeNetwork][buildingId];
  if (!Number.isInteger(expectedLevel) || expectedLevel < 0 || expectedLevel >= ALLIANCE_BUILDING_MAX_LEVEL) throw new Error('Alliance infrastructure is already at maximum level. Nothing was submitted.');
  const level = BigInt(expectedLevel + 1);
  const bases = [[5000n, 2000n, 1000n, 50000000n], [2000n, 5000n, 2000n, 75000000n], [4000n, 4000n, 1500n, 60000000n], [3000n, 3000n, 3000n, 100000000n]];
  const costs = bases[buildingId].map((base, index) => {
    const value = base * (index === 3 ? level : level * level);
    const bps = Math.min(9000, index === 2 ? treasury.defenseCoordination * 150 : treasury.tradeNetwork * 100);
    return value - value * BigInt(bps) / 10000n;
  });
  return { expectedLevel, metal: costs[0], crystal: costs[1], deuterium: costs[2], antimatter: costs[3] };
}
