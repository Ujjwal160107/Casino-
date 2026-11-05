// The family creation fee and vault deposits debit the wallet; each drops the
// payer's getUser cache after the commit, so no reader shows the old balance.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { depositToVault } from "../../src/services/crimeFamily/vaultService";
import { testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, flushTestKeys } from "../helpers";

const cache = (id: string) => testRedis().set(`user:${id}`, "{}", "EX", 300);
const cached = async (id: string) => (await testRedis().exists(`user:${id}`)) === 1;

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("user:*"); });

describe("family wallet writes drop the user cache", () => {
  it("the creation fee", async () => {
    const founder = await seedEligibleUser({ wallet: 30_000_000 });
    const other = await seedEligibleUser();
    await cache(founder); await cache(other);
    await createFamily({ uid: founder, username: "f", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" });
    expect([await cached(founder), await cached(other)]).toEqual([false, true]);
  });

  it("a vault deposit", async () => {
    const boss = await seedEligibleUser({ wallet: 1_000_000 });
    const other = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    await cache(boss); await cache(other);
    await depositToVault(boss, 100_000);
    expect([await cached(boss), await cached(other)]).toEqual([false, true]);
  });
});
