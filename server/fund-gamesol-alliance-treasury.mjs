import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  GameClient,
  derivePlanetStatePda,
} from "../src/game-state.ts";

const ALLIANCE = new PublicKey("9LvA7BWBL7N4mVFi6RzUxxpBhD4gxch2YceatakNzeqK");
const CLAIM_COST = { metal: 100n, crystal: 50n, deuterium: 25n };
const MISSIONS = [
  { period: 1, id: 0, metal: 1_000n, crystal: 0n, deuterium: 0n },
  { period: 1, id: 1, metal: 0n, crystal: 1_000n, deuterium: 0n },
  { period: 1, id: 2, metal: 0n, crystal: 0n, deuterium: 500n },
  { period: 2, id: 0, metal: 10_000n, crystal: 6_000n, deuterium: 0n },
  { period: 2, id: 1, metal: 0n, crystal: 8_000n, deuterium: 3_000n },
  { period: 2, id: 2, metal: 6_000n, crystal: 0n, deuterium: 5_000n },
];

function max(a, b) { return a > b ? a : b; }
function amountsFor(mission, deficits) {
  return {
    metal: max(mission.metal, deficits.metal),
    crystal: max(mission.crystal, deficits.crystal),
    deuterium: max(mission.deuterium, deficits.deuterium),
    antimatter: 0n,
  };
}

async function main() {
  const shouldSend = process.argv.includes("--send");
  const provider = anchor.AnchorProvider.env();
  const payer = provider.wallet.payer;
  if (!payer) throw new Error("ANCHOR_WALLET must point to the test actor keypair.");
  const client = new GameClient(provider.connection, provider);
  client.setPreferVaultSigning(false);

  const [membership, treasury] = await Promise.all([
    client.getAllianceMembership(payer.publicKey),
    client.getAllianceTreasury(ALLIANCE),
  ]);
  if (!membership || membership.alliance !== ALLIANCE.toBase58() || membership.role === 0) {
    throw new Error(
      `The fee payer ${payer.publicKey.toBase58()} is not an active member of the expected test alliance; `
      + `membership=${membership ? `${membership.alliance}/role-${membership.role}` : "missing"}.`,
    );
  }
  if (!treasury || treasury.alliance !== ALLIANCE.toBase58()) {
    throw new Error("The expected alliance treasury is missing or mismatched.");
  }

  const deficits = {
    metal: max(0n, CLAIM_COST.metal - treasury.metal),
    crystal: max(0n, CLAIM_COST.crystal - treasury.crystal),
    deuterium: max(0n, CLAIM_COST.deuterium - treasury.deuterium),
  };
  if (deficits.metal === 0n && deficits.crystal === 0n && deficits.deuterium === 0n) {
    console.log("Alliance treasury already covers the G6:S175 claim cost.");
    return;
  }

  const planetPda = derivePlanetStatePda(payer.publicKey, 0);
  const planet = await client.getPlanetStateByPda(planetPda);
  if (!planet || planet.planet.galaxy !== 6 || planet.planet.system !== 175) {
    throw new Error("The expected G6:S175 test homeworld is missing or mismatched.");
  }

  const slot = await provider.connection.getSlot("confirmed");
  const now = await provider.connection.getBlockTime(slot);
  if (!now) throw new Error("Unable to read Solana cluster time.");
  const dailyEpoch = Math.floor(now / 86_400);
  const weeklyEpoch = Math.floor((dailyEpoch + 3) / 7);
  const dailyMask = membership.dailyEpoch === dailyEpoch ? membership.dailyClaimedMask : 0n;
  const weeklyMask = membership.weeklyEpoch === weeklyEpoch ? membership.weeklyClaimedMask : 0n;
  const elapsed = BigInt(Math.min(86_400, Math.max(0, now - planet.resources.lastUpdateTs)));
  const efficiency = planet.resources.energyConsumption === 0n
    ? 10_000n
    : (planet.resources.energyProduction * 10_000n / planet.resources.energyConsumption > 10_000n
      ? 10_000n
      : planet.resources.energyProduction * 10_000n / planet.resources.energyConsumption);
  const settle = (current, rate, cap) => {
    const produced = rate * elapsed * efficiency / 3_600n / 10_000n;
    const total = current + produced;
    return total < cap ? total : cap;
  };
  const projected = {
    metal: settle(planet.resources.metal, planet.resources.metalHour, planet.resources.metalCap),
    crystal: settle(planet.resources.crystal, planet.resources.crystalHour, planet.resources.crystalCap),
    deuterium: settle(planet.resources.deuterium, planet.resources.deuteriumHour, planet.resources.deuteriumCap),
  };

  const candidates = MISSIONS.map((mission) => ({
    mission,
    amounts: amountsFor(mission, deficits),
    claimed: ((mission.period === 1 ? dailyMask : weeklyMask) & (1n << BigInt(mission.id))) !== 0n,
  })).filter(({ claimed, amounts }) =>
    !claimed
      && projected.metal >= amounts.metal
      && projected.crystal >= amounts.crystal
      && projected.deuterium >= amounts.deuterium,
  ).sort((a, b) => {
    const totalA = a.amounts.metal + a.amounts.crystal + a.amounts.deuterium;
    const totalB = b.amounts.metal + b.amounts.crystal + b.amounts.deuterium;
    return totalA < totalB ? -1 : totalA > totalB ? 1 : 0;
  });
  const selected = candidates[0];
  if (!selected) {
    const quest = await client.getQuestState(payer.publicKey);
    if (!quest || quest.dailyCheckinDay !== dailyEpoch) {
      if (!shouldSend) {
        console.log("No deposit mission is affordable yet, but today's real daily check-in will bridge the gap.");
        console.log("Dry run only. Re-run with --send to claim it and fund the alliance treasury.");
        return;
      }
      const checkInSignature = await client.dailyCheckIn(planetPda);
      console.log(`Daily check-in claimed: ${checkInSignature}`);
      return main();
    }
    throw new Error(
      `No unclaimed resource-deposit mission can cover the treasury deficit from this planet. `
      + `Deficit M/C/D: ${deficits.metal}/${deficits.crystal}/${deficits.deuterium}; `
      + `settled planet M/C/D: ${projected.metal}/${projected.crystal}/${projected.deuterium}; `
      + `daily mask ${dailyMask}, weekly mask ${weeklyMask}.`,
    );
  }

  console.log(
    `Selected period ${selected.mission.period}, mission ${selected.mission.id}; `
    + `deposit M/C/D ${selected.amounts.metal}/${selected.amounts.crystal}/${selected.amounts.deuterium}.`,
  );
  if (!shouldSend) {
    console.log("Dry run only. Re-run with --send to deposit the real devnet resources.");
    return;
  }
  const signature = await client.depositAllianceResources(
    planetPda,
    selected.mission.period,
    selected.mission.id,
    selected.amounts,
  );
  const updated = await client.getAllianceTreasury(ALLIANCE);
  if (!updated
    || updated.metal < CLAIM_COST.metal
    || updated.crystal < CLAIM_COST.crystal
    || updated.deuterium < CLAIM_COST.deuterium) {
    throw new Error("Deposit confirmed but the alliance treasury still cannot cover the claim.");
  }
  console.log(`Alliance treasury funded: ${signature}`);
  console.log(`Treasury M/C/D: ${updated.metal}/${updated.crystal}/${updated.deuterium}`);
}

main().catch((error) => {
  console.error(error);
  if (error?.logs) console.error(error.logs.join("\n"));
  process.exit(1);
});
