import type { QuestStateAccount } from './game-state';

export function dailyCheckInReward(
  quest: Pick<QuestStateAccount, 'dailyCheckinDay' | 'dailyCheckinStreak'> | null | undefined,
  nowTs: number,
) {
  const day = Math.floor(nowTs / 86_400);
  const previousDay = quest?.dailyCheckinDay;
  // A claimed card shows today's earned reward, not tomorrow's possible bonus.
  const streak = previousDay === day ? quest!.dailyCheckinStreak
    : previousDay === day - 1 ? quest!.dailyCheckinStreak + 1 : 1;
  const bonus = Math.min(streak, 30) * 50;
  return { metal: 500 + bonus, crystal: 300 + Math.floor(bonus / 2), deuterium: 100 + Math.floor(bonus / 5) };
}
