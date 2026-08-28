import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser, flushTestKeys } from "../helpers";
import { getNetWorth } from "../../src/services/netWorthService";
import { computeZooPayout } from "../../src/services/zooService";
import { FED_WINDOW_MS, RARITY_INCOME_PER_DAY } from "../../src/utils/animalCatalog";

// netWorthService reported `zooIncomePerHour * 24` — the pre-branch hourly rate
// — which is 600,000/day for a housed Legendary against the real 200,000, and
// counted hungry animals as earning. It feeds `!leaderboard passive`, so the
// stale rate was live and visible. These tests pin the per-day figure to
// RARITY_INCOME_PER_DAY and to what computeZooPayout actually pays.

const id = "zoo-networth-1";

async function giveWorldZoo() {
  const property = await testPrisma.property.upsert({
    where: { key: "world_zoo" },
    create: {
      guildId: "global", key: "world_zoo", name: "World Zoo", description: "test",
      // incomeCycleHours 0 keeps the property itself out of passiveIncomePerDay,
      // so the assertions below are purely the animal half.
      basePrice: 1, price: 1, incomePerCycle: 0, incomeCycleHours: 0, totalSold: 0,
    } as any,
    update: { incomePerCycle: 0, incomeCycleHours: 0 },
  });
  await testPrisma.ownedProperty.create({
    data: { userId: id, propertyId: property.id, purchasedPrice: 1, lastCollected: new Date() },
  });
}

async function house(animalKey: string, opts: { fed: boolean; inZoo?: boolean }) {
  const longAgo = new Date(Date.now() - 40 * 3_600_000);
  return testPrisma.caughtAnimal.create({
    data: {
      discordId: id,
      animalKey,
      partsAvailable: [],
      inZoo: opts.inZoo ?? true,
      caughtAt: opts.fed ? new Date() : longAgo,
      fedUntil: opts.fed ? new Date(Date.now() + FED_WINDOW_MS) : longAgo,
    },
  });
}

describe("net worth passive income uses the daily zoo rate", () => {
  beforeEach(async () => {
    await seedUser(id);
    await giveWorldZoo();
    await flushTestKeys(`networth:${id}`);
  });
  afterAll(() => resetUser(id));

  it("pays a housed, fed Legendary 200,000/day — not the old 600,000", async () => {
    await house("white_tiger", { fed: true });

    const nw = await getNetWorth(id);

    expect(nw.passiveIncomePerDay).toBe(RARITY_INCOME_PER_DAY.Legendary);
    expect(nw.passiveIncomePerDay).toBe(200_000);
  });

  it("counts hungry animals as earning nothing", async () => {
    await house("rabbit", { fed: true });
    await house("fox", { fed: false });

    const nw = await getNetWorth(id);

    expect(nw.passiveIncomePerDay).toBe(RARITY_INCOME_PER_DAY.Common);
  });

  it("ignores unhoused animals, which cannot be fed and never earn", async () => {
    await house("white_tiger", { fed: true, inZoo: false });

    const nw = await getNetWorth(id);

    expect(nw.passiveIncomePerDay).toBe(0);
  });

  it("agrees with what computeZooPayout actually pays out", async () => {
    await house("rabbit", { fed: true });
    await house("black_bear", { fed: true });
    await house("fox", { fed: false });

    const nw = await getNetWorth(id);
    const payout = await computeZooPayout(id, new Date());

    expect(nw.passiveIncomePerDay).toBe(payout.total);
    expect(payout.total).toBe(RARITY_INCOME_PER_DAY.Common + RARITY_INCOME_PER_DAY.Rare);
  });
});
