import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { CENSUS_STEPS, activeMembersByFamily, runTurfCensus, type CensusStep } from "../../src/services/crimeFamily/census";
import { testPrisma, seedEligibleUser, seedFamily, seedWarHits, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "CfJobRun"]));
beforeEach(resetFamilies);

const since = () => daysAgo(7);
/** n started seats for uid in familyId, each in its own RESOLVED run, startedAt 1 day ago. */
async function seats(uid: string, familyId: string, n: number, started = true) {
  for (let k = 0; k < n; k++) {
    const at = daysAgo(1);
    const c = await testPrisma.caper.create({ data: { familyId, tier: 1, status: "RESOLVED", liveSlot: `${uid}-${k}`, plannerId: uid, guildId: "g1", channelId: "c1", lobbyClosesAt: at, startedAt: at } });
    await testPrisma.caperCrew.create({ data: { caperId: c.id, familyId, userId: uid, role: "LOOKOUT", stake: 0, started, startedAt: at, liveSlot: c.id } });
  }
}

describe("active-member census (A22, amendment 6.4 steps 1-2)", () => {
  it("2 started seats in this family count; 2 seats from a previous family do not", async () => {
    const a = await seedEligibleUser(); const b = await seedEligibleUser();
    const old = await seedFamily({ bossId: await seedEligibleUser() });
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: a, role: "SOLDIER" }, { userId: b, role: "SOLDIER" }] });
    await seats(a, f.id, 2);
    await seats(b, old.id, 2);                                           // b played them for another family
    expect((await activeMembersByFamily(since(), new Date())).get(f.id)).toBe(1);
  });

  it("3 HIT war hits count; 2 do not; MISS never counts", async () => {
    const [a, b, c] = [await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser()];
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [a, b, c].map((userId) => ({ userId, role: "SOLDIER" as const })) });
    await seedWarHits(a, f.id, 3);
    await seedWarHits(b, f.id, 2);
    await seedWarHits(c, f.id, 5, { state: "MISS" });
    expect((await activeMembersByFamily(since(), new Date())).get(f.id)).toBe(1);
  });

  it("a banned member, an ex-member and unstarted (VOID) seats never count", async () => {
    const banned = await seedEligibleUser({ ban: { expiresAt: new Date(Date.now() + 86_400_000) } });
    const ex = await seedEligibleUser(); const idle = await seedEligibleUser();
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: banned, role: "SOLDIER" }, { userId: idle, role: "SOLDIER" }] });
    await seats(banned, f.id, 2);
    await seats(ex, f.id, 2);                                            // no member row
    await seats(idle, f.id, 2, false);
    expect((await activeMembersByFamily(since(), new Date())).get(f.id) ?? 0).toBe(0);
  });

  it("runTurfCensus writes activeMembers and censusAt on every family, then skips the rest of the UTC day", async () => {
    const a = await seedEligibleUser();
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: a, role: "SOLDIER" }] });
    const g = await seedFamily({ bossId: await seedEligibleUser() });
    await seats(a, f.id, 2);
    const now = new Date();
    await withCfConfig({ enabled: true }, async () => {
      expect(await runTurfCensus(now)).toEqual({ status: "ran", notices: [] });
      expect(await runTurfCensus(now)).toEqual({ status: "skipped", notices: [] });                 // same UTC day
    });
    expect(await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ activeMembers: 1, censusAt: now });
    expect(await testPrisma.family.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ activeMembers: 0, censusAt: now });
  });

  it("a step that throws leaves dayKey unset and the next run reruns every step; notices come back in step order", async () => {
    const calls: string[] = [];
    const boom: CensusStep = { key: "boom", run: async () => { calls.push("boom"); throw new Error("boom"); } };
    const note: CensusStep = { key: "note", run: async () => { calls.push("note"); return [{ type: "turf", userIds: ["1"], build: () => ({}) as any }]; } };
    const now = new Date();
    await withCfConfig({ enabled: true }, async () => {
      CENSUS_STEPS.push(boom);
      await expect(runTurfCensus(now)).rejects.toThrow("boom");
      CENSUS_STEPS.splice(CENSUS_STEPS.indexOf(boom), 1);
      expect((await testPrisma.cfJobRun.findUniqueOrThrow({ where: { key: "turf_census" } })).dayKey).toBe("");
      CENSUS_STEPS.push(note);
      const r = await runTurfCensus(now);
      CENSUS_STEPS.splice(CENSUS_STEPS.indexOf(note), 1);
      expect(r.status).toBe("ran");
      expect(r.notices.map((n) => n.userIds)).toEqual([["1"]]);
    });
    expect(calls).toEqual(["boom", "note"]);
  });

  it("two processes racing the same day: one 'ran', the other 'skipped' with no notices (A29)", async () => {
    const now = new Date();
    const r = await withCfConfig({ enabled: true }, () => Promise.all([runTurfCensus(now), runTurfCensus(now)]));
    expect(r.filter((x) => x.status === "ran")).toHaveLength(1);
    expect(r.find((x) => x.status === "skipped")!.notices).toEqual([]);
  });

  it("disabled → skipped", async () => {
    expect(await withCfConfig({ enabled: false }, () => runTurfCensus(new Date()))).toEqual({ status: "skipped", notices: [] });
  });
});
