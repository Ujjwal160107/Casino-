import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { checkMemberEligibility, eligibilityError } from "../../src/services/crimeFamily/eligibility";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const gates = async (uid: string, gate: any, opts?: any) => (await checkMemberEligibility(uid, gate, opts)).failures.map((f) => f.gate);
const exit = (userId: string, familyId: string, reason: string, leftAt: Date, wasBoss = false) =>
  testPrisma.familyExit.create({ data: { userId, familyId, reason, leftAt, wasBoss } });
const FAM = "65f000000000000000000001";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("checkMemberEligibility (12.1)", () => {
  it("passes a qualified founder", async () => {
    expect(await gates(await seedEligibleUser({ wallet: 15_000_000 }), "found")).toEqual([]);
  });

  it.each([
    [{ discordAgeDays: 179 }, "discord_age"], [{ fortunaAgeDays: 29 }, "fortuna_age"], [{ shifts: 59 }, "shifts"],
    [{ wallet: 14_999_999 }, "net_worth"], [{ heat: 70 }, "heat"], [{ jailedUntil: new Date(Date.now() + 60_000) }, "jailed"],
    [{ ban: { expiresAt: null } }, "banned"], [{ ban: { expiresAt: new Date(Date.now() + 60_000) } }, "banned"],
  ] as const)("found fails alone on %o", async (opts, gate) => {
    expect(await gates(await seedEligibleUser({ wallet: 15_000_000, ...opts }), "found")).toEqual([gate]);
  });

  it("an expired ban passes", async () => {
    expect(await gates(await seedEligibleUser({ wallet: 15_000_000, ban: { expiresAt: new Date(Date.now() - 1) } }), "found")).toEqual([]);
  });

  it("a stale networth cache cannot clear the gate", async () => {
    const uid = await seedEligibleUser({ wallet: 10 });
    await testRedis().set(`networth:${uid}`, JSON.stringify({ total: 1e12 }), "EX", 600);
    expect(await gates(uid, "family_join")).toContain("net_worth");
  });

  it("applies hop cooldowns (6.6)", async () => {
    const u = await seedEligibleUser({ wallet: 15_000_000 });
    await exit(u, FAM, "LEFT", new Date(Date.now() - 71 * 3600_000));
    expect(await gates(u, "family_join")).toEqual(["hop_cooldown"]);
    const k = await seedEligibleUser({ wallet: 15_000_000 });
    await exit(k, FAM, "KICKED", new Date(Date.now() - 25 * 3600_000));
    expect(await gates(k, "family_join")).toEqual([]);
    const b = await seedEligibleUser({ wallet: 15_000_000 });
    await exit(b, FAM, "DISBANDED", new Date(Date.now() - 25 * 3600_000), true);
    expect(await gates(b, "family_join")).toEqual([]);
    expect(await gates(b, "found")).toEqual(["refound_cooldown"]);
  });

  it("blocks rejoining the same family for 14 days", async () => {
    const u = await seedEligibleUser({ wallet: 2_000_000 });
    await exit(u, FAM, "KICKED", daysAgo(13));
    expect(await gates(u, "family_join", { familyId: FAM })).toEqual(["rejoin_cooldown"]);
    expect(await gates(u, "family_join", { familyId: "65f000000000000000000002" })).toEqual([]);
  });

  it("checks a caper seat's heat, prep item, tenure and guild", async () => {
    const boss = await seedEligibleUser();
    const u = await seedEligibleUser({ wallet: 9_000_000, heat: 60, prepKeys: ["camouflage_kit"] });
    await seedFamily({ bossId: boss, members: [{ userId: u, role: "SOLDIER", joinedAt: daysAgo(4) }] });
    expect(await gates(u, "caper_t2", { role: "LOOKOUT", guildId: "g1", expectedGuildId: "g1" })).toEqual(["heat"]);
    expect(await gates(u, "caper_t1", { role: "MUSCLE", guildId: "g2", expectedGuildId: "g1" })).toEqual(["guild", "prep_item"]);
  });

  it("payday needs 7 days of tenure and an active-member rule", async () => {
    const boss = await seedEligibleUser();
    const u = await seedEligibleUser();
    await seedFamily({ bossId: boss, members: [{ userId: u, role: "SOLDIER", joinedAt: daysAgo(6) }] });
    expect(await gates(u, "payday")).toEqual(["tenure", "active"]);
    ACTIVITY_RULES.push({ key: "t", label: "test seats", need: 2, count: async () => 2 });
    try { expect(await gates(boss, "payday")).toEqual([]); } finally { ACTIVITY_RULES.pop(); }
  });

  it("renders needs with units", async () => {
    const r = await checkMemberEligibility(await seedEligibleUser({ wallet: 15_000_000, shifts: 59 }), "found");
    expect(eligibilityError(r.failures).message).toBe("Not eligible: ≥ 60 shifts (you have 59 shifts)");
  });
});
