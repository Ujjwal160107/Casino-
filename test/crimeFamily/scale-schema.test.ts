// test/crimeFamily/scale-schema.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { testPrisma, seedEligibleUser, seedFamily, seedApplication, seedVote, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";
import { CRIME_FAMILY_CONFIG as C } from "../../src/utils/economyConfig";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyVote", "FamilyBallot", "PaydayShare", "CfJobRun"]));
beforeEach(resetFamilies);

describe("scale schema defaults (Appendix A)", () => {
  it("a seeded family counts its members and marks its Boss's first chair", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER" }] });
    expect(f.memberCount).toBe(2);
    expect(f.recruiting).toBe(false);
    const b = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } });
    expect(b.bossedOnce).toBe(true);
    expect(+b.firstBossAt).toBeLessThan(+daysAgo(29));
    const m = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: s } });
    expect(m.bossedOnce).toBe(false);
    expect(+m.officerUntil).toBeLessThanOrEqual(Date.now());
  });
  it("invites default to kind INVITE; applications and votes seed with their sentinels", async () => {
    const boss = await seedEligibleUser(); const f = await seedFamily({ bossId: boss });
    const a = await seedApplication({ familyId: f.id, applicantId: "777" });
    expect(a).toMatchObject({ kind: "APPLICATION", status: "PENDING", slot: "PENDING", inviterId: "" });
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: "1", eligibleIds: ["1", "2", "3"] });
    expect(v).toMatchObject({ status: "OPEN", liveSlot: "LIVE", announced: false, resultAnnounced: false, reposted: false });
    await expect(seedVote({ familyId: f.id, bossId: boss, starterId: "2", eligibleIds: [] })).rejects.toMatchObject({ code: "P2002" });
  });
  it("adds the scale config keys", () => {
    expect(C).toMatchObject({ heistCapMin: 4, heistCapDivisor: 3, capoPerMembers: 5, capoMinNetWorth: 10_000_000, investigationDivisor: 4,
      joinsPerFamilyPer7dMin: 5, joinsPerFamilyDivisor: 3, paydayShareResumeSeconds: 60, voteSeconds: 172_800, voteMinEligible: 3,
      applicationTtlSeconds: 259_200, maxPendingApplicationsPerApplicant: 3, maxPendingApplicationsPerFamily: 25,
      reapplyAfterDeclineSeconds: 604_800, reapplyAfterWithdrawSeconds: 86_400, appDigestEverySeconds: 21_600,
      boardPageSize: 6, inboxPageSize: 5, managePageSize: 15 });
    expect(C.recruitLimits).toEqual({ netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 });
  });
});
