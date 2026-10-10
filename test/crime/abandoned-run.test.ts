import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, testRedis, seedUser, resetUser, flushTestKeys } from "../helpers";
import { startCrimeRun, getCrimeRun } from "../../src/services/crimeRunService";
import { settleAbandonedCrimeRun } from "../../src/services/crimeService";
import { CRIME_MINIGAME_CATALOG } from "../../src/data/crimeMinigameCatalog";
import { getCrimeByKey } from "../../src/data/crimeCatalog";
import { redisService } from "../../src/services/redisService";

// Never answering a stage used to cost nothing: the run just expired, with no
// fine and no jail roll. An abandoned run is now settled as a failure the next
// time the player opens `crime`.

const id = "crime-abandon-1";
const crimeKey = Object.keys(CRIME_MINIGAME_CATALOG).find((k) => getCrimeByKey(k)?.tier === "petty")!;
const START = 10_000_000;

async function wallet() {
  return (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
}

beforeEach(async () => {
  await flushTestKeys(`crime_*:${id}`);
  // A fine can open a bank row (debt overflow), which blocks the user delete.
  await testPrisma.bank.deleteMany({ where: { userId: id } });
  await seedUser(id, { wallet: { create: { balance: START } } });
});
afterAll(async () => {
  await flushTestKeys(`crime_*:${id}`);
  await testPrisma.bank.deleteMany({ where: { userId: id } });
  await resetUser(id);
  await testRedis().quit();
});

describe("abandoned crime run settlement", () => {
  it("fines a run whose stage timer ran out, exactly once", async () => {
    const { run } = await startCrimeRun(id, crimeKey, "g1");
    await redisService.set(`crime_run:${id}`, { ...run, stageStartedAt: Date.now() - 60 * 60 * 1000 }, 900);

    const [a, b] = await Promise.all([
      settleAbandonedCrimeRun(id, "u", "g1"),
      settleAbandonedCrimeRun(id, "u", "g1"),
    ]);
    const settled = [a, b].filter(Boolean);
    expect(settled).toHaveLength(1);
    expect(settled[0]!.success).toBe(false);
    expect(await wallet()).toBe(START - settled[0]!.appliedAmount);
    expect(settled[0]!.appliedAmount).toBeGreaterThan(0);
    expect(await getCrimeRun(id)).toBeNull();
  });

  it("leaves a run that is still inside its stage timer alone", async () => {
    await startCrimeRun(id, crimeKey, "g1");
    expect(await settleAbandonedCrimeRun(id, "u", "g1")).toBeNull();
    expect(await getCrimeRun(id)).not.toBeNull();
    expect(await wallet()).toBe(START);
  });

  it("keeps the run around past the 1h crime cooldown so it can be settled", async () => {
    await startCrimeRun(id, crimeKey, "g1");
    expect(await testRedis().ttl(`crime_run:${id}`)).toBeGreaterThan(3600);
  });
});
