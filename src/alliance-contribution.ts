import type { AllianceMembershipAccount } from './game-state';

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
