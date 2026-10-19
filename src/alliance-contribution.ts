import type { AllianceMembershipAccount } from './game-state';

export const ALLIANCE_BUILDING_MAX_LEVEL = 25;

type Contribution = { period: number; id: number; metal: bigint; crystal: bigint; deuterium: bigint; antimatter: bigint };
type Balances = { metal: bigint; crystal: bigint; deuterium: bigint; antimatter: bigint };

export function allianceContributionBlock(membership: AllianceMembershipAccount | null, mission: Contribution,
  balances: Balances | undefined, nowTs: number): string | null {
  if (!membership || membership.role === 0) return 'Join an alliance';
  if (allianceContributionCompleted(membership, mission.period, mission.id, nowTs)) return 'COMPLETED';
  if (!balances) return 'Checking resources';
  for (const field of ['metal', 'crystal', 'deuterium', 'antimatter'] as const) {
    if (balances[field] < mission[field]) return `Needs ${field === 'antimatter' ? 'AM' : field}`;
  }
  return null;
}

export function allianceInfrastructureBlock(leader: boolean, level: number, treasury: Balances | null,
  cost: Balances): string | null {
  if (!leader) return 'LEADER ONLY';
  if (!treasury) return 'Checking treasury';
  if (!Number.isInteger(level) || level < 0) return 'Checking infrastructure';
  if (level >= ALLIANCE_BUILDING_MAX_LEVEL) return 'Maximum level';
  for (const field of ['metal', 'crystal', 'deuterium', 'antimatter'] as const) {
    if (treasury[field] < cost[field]) return `Needs ${field === 'antimatter' ? 'AM' : field}`;
  }
  return null;
}

export function allianceContributionCompleted(
  membership: AllianceMembershipAccount | null,
  period: number,
  missionId: number,
  nowTs: number,
): boolean {
  if (!membership || !Number.isInteger(missionId) || missionId < 0 || missionId > 63) return false;
  const day = Math.floor(nowTs / 86400);
  const date = new Date(nowTs * 1000);
  const epoch = period === 1 ? day : period === 2 ? Math.floor((day + 3) / 7)
    : date.getUTCFullYear() * 12 + date.getUTCMonth();
  const savedEpoch = period === 1 ? membership.dailyEpoch : period === 2 ? membership.weeklyEpoch : membership.monthlyEpoch;
  const mask = period === 1 ? membership.dailyClaimedMask : period === 2 ? membership.weeklyClaimedMask : membership.monthlyClaimedMask;
  return period >= 1 && period <= 3 && savedEpoch === epoch && (mask & (1n << BigInt(missionId))) !== 0n;
}
