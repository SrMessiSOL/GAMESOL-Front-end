export type StorePeriod = 1 | 2 | 3;

export type StorePack = {
  period: StorePeriod;
  id: number;
  group: "Daily" | "Weekly" | "Monthly";
  title: string;
  hint: string;
  priceUsdc: bigint;
  reward: { metal: number; crystal: number; deuterium: number };
  shieldSeconds?: number;
};

export const STORE_PACKS: StorePack[] = [
  { period: 1, id: 0, group: "Daily", title: "Daily Metal Cache", hint: "Focused metal refill for one active session.", priceUsdc: 1_000_000n, reward: { metal: 3000, crystal: 0, deuterium: 0 } },
  { period: 1, id: 1, group: "Daily", title: "Daily Crystal Cache", hint: "Focused crystal refill for one active session.", priceUsdc: 1_000_000n, reward: { metal: 0, crystal: 2000, deuterium: 0 } },
  { period: 1, id: 2, group: "Daily", title: "Daily Deuterium Cache", hint: "Focused fuel refill for one active session.", priceUsdc: 1_000_000n, reward: { metal: 0, crystal: 0, deuterium: 750 } },
  { period: 1, id: 3, group: "Daily", title: "Daily Supply Drop", hint: "Metal, crystal, and deuterium together.", priceUsdc: 3_000_000n, reward: { metal: 3000, crystal: 2000, deuterium: 750 } },
  { period: 1, id: 4, group: "Daily", title: "Daily Logistics Crate", hint: "A modest boost without skipping progression.", priceUsdc: 5_000_000n, reward: { metal: 8000, crystal: 5000, deuterium: 2000 } },
  { period: 1, id: 5, group: "Daily", title: "Daily Builder Cache", hint: "Extra daily materials for active builders.", priceUsdc: 7_500_000n, reward: { metal: 14000, crystal: 9000, deuterium: 3500 } },
  { period: 1, id: 16, group: "Daily", title: "Daily Defense Shield", hint: "Adds 6 hours of attack protection, capped on-chain.", priceUsdc: 1_000_000n, reward: { metal: 0, crystal: 0, deuterium: 0 }, shieldSeconds: 6 * 60 * 60 },
  { period: 2, id: 0, group: "Weekly", title: "Weekly Metal Reserve", hint: "Focused weekly metal for construction queues.", priceUsdc: 5_000_000n, reward: { metal: 35000, crystal: 0, deuterium: 0 } },
  { period: 2, id: 1, group: "Weekly", title: "Weekly Crystal Reserve", hint: "Focused weekly crystal for research and ships.", priceUsdc: 5_000_000n, reward: { metal: 0, crystal: 24000, deuterium: 0 } },
  { period: 2, id: 2, group: "Weekly", title: "Weekly Deuterium Reserve", hint: "Focused weekly fuel for fleet activity.", priceUsdc: 5_000_000n, reward: { metal: 0, crystal: 0, deuterium: 10000 } },
  { period: 2, id: 3, group: "Weekly", title: "Weekly Foundry Pack", hint: "Balanced material to keep queues moving.", priceUsdc: 15_000_000n, reward: { metal: 35000, crystal: 24000, deuterium: 10000 } },
  { period: 2, id: 4, group: "Weekly", title: "Weekly Expansion Pack", hint: "Supports fleet and building momentum.", priceUsdc: 30_000_000n, reward: { metal: 80000, crystal: 55000, deuterium: 25000 } },
  { period: 2, id: 5, group: "Weekly", title: "Weekly War Chest", hint: "Heavier weekly support for active commanders.", priceUsdc: 45_000_000n, reward: { metal: 140000, crystal: 90000, deuterium: 40000 } },
  { period: 2, id: 16, group: "Weekly", title: "Weekly Defense Shield", hint: "Adds 24 hours of attack protection, capped on-chain.", priceUsdc: 5_000_000n, reward: { metal: 0, crystal: 0, deuterium: 0 }, shieldSeconds: 24 * 60 * 60 },
  { period: 3, id: 0, group: "Monthly", title: "Monthly Metal Reserve", hint: "Focused monthly metal for large construction.", priceUsdc: 20_000_000n, reward: { metal: 180000, crystal: 0, deuterium: 0 } },
  { period: 3, id: 1, group: "Monthly", title: "Monthly Crystal Reserve", hint: "Focused monthly crystal for research growth.", priceUsdc: 20_000_000n, reward: { metal: 0, crystal: 125000, deuterium: 0 } },
  { period: 3, id: 2, group: "Monthly", title: "Monthly Deuterium Reserve", hint: "Focused monthly fuel for fleet operations.", priceUsdc: 20_000_000n, reward: { metal: 0, crystal: 0, deuterium: 60000 } },
  { period: 3, id: 3, group: "Monthly", title: "Monthly Sector Pack", hint: "A larger but capped monthly resource bundle.", priceUsdc: 60_000_000n, reward: { metal: 180000, crystal: 125000, deuterium: 60000 } },
  { period: 3, id: 4, group: "Monthly", title: "Monthly Command Pack", hint: "Strong monthly support for established planets.", priceUsdc: 100_000_000n, reward: { metal: 400000, crystal: 275000, deuterium: 140000 } },
  { period: 3, id: 5, group: "Monthly", title: "Monthly Builder Pack", hint: "Deep resource support for long build plans.", priceUsdc: 150_000_000n, reward: { metal: 700000, crystal: 450000, deuterium: 220000 } },
  { period: 3, id: 6, group: "Monthly", title: "Monthly Fleet Pack", hint: "Large support for active shipyard cycles.", priceUsdc: 200_000_000n, reward: { metal: 1000000, crystal: 650000, deuterium: 320000 } },
  { period: 3, id: 7, group: "Monthly", title: "Monthly Research Pack", hint: "Premium monthly support for research-heavy players.", priceUsdc: 250_000_000n, reward: { metal: 1350000, crystal: 900000, deuterium: 450000 } },
  { period: 3, id: 8, group: "Monthly", title: "Monthly Empire Pack", hint: "A high-cap monthly bundle for mature accounts.", priceUsdc: 300_000_000n, reward: { metal: 1750000, crystal: 1150000, deuterium: 600000 } },
  { period: 3, id: 9, group: "Monthly", title: "Monthly Deep Space Pack", hint: "Largest monthly resource support before caps.", priceUsdc: 400_000_000n, reward: { metal: 2500000, crystal: 1700000, deuterium: 850000 } },
  { period: 3, id: 16, group: "Monthly", title: "Monthly Defense Shield", hint: "Adds 3 days of attack protection, capped on-chain.", priceUsdc: 12_500_000n, reward: { metal: 0, crystal: 0, deuterium: 0 }, shieldSeconds: 3 * 24 * 60 * 60 },
];
