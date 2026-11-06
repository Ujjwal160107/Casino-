import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { startVote, voteStartBlock } from "../../src/services/crimeFamily/voteService";
import { claimChair, demoteMember, handOverChair, promoteMember } from "../../src/services/crimeFamily/chairService";
import { kickMember, leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import prisma from "../../src/utils/prisma";
import { testPrisma, seedEligibleUser, seedFamily, seedVote, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyVote", "FamilyBallot"]));
beforeEach(resetFamilies);

const DAY = 86_400_000;
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);
/** Boss + optional Underboss + `capos` Capos + Soldiers up to `size`, everyone joined 10 days ago, at level 10. */
async function voteFamily(o: { size: number; underboss?: boolean; capos?: number; bossSince?: Date; tag?: string }) {
  const boss = await seedEligibleUser({ wallet: 12_000_000 });
  const roles = [...(o.underboss ? ["UNDERBOSS"] : []), ...Array(o.capos ?? 0).fill("CAPO")];
  const ids: string[] = [];
  for (let k = 0; k < o.size - 1; k++) ids.push(await seedEligibleUser({ wallet: 12_000_000 }));
  const f = await seedFamily({ bossId: boss, level: 10, tag: o.tag ?? "VLA", bossSince: o.bossSince,
    members: ids.map((userId, k) => ({ userId, role: (roles[k] ?? "SOLDIER") as any, joinedAt: daysAgo(10) })) });
  return { f, boss, ids };
}
const openVotes = (familyId: string) => testPrisma.familyVote.findMany({ where: { familyId, status: "OPEN" } });

describe("no-confidence vote: start (amendment 4.3)", () => {
  it("edge 1: two Capos start at once → one OPEN vote with the starter's YES; the other is refused", async () => {
    const { f, ids: [, c1, c2] } = await voteFamily({ size: 6, underboss: true, capos: 2 });
    const r = await Promise.allSettled([startVote(c1), startVote(c2)]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("A vote is already open."));
    const open = await openVotes(f.id);
    expect(open).toHaveLength(1);
    expect(await testPrisma.familyBallot.findMany({ where: { voteId: open[0].id } })).toMatchObject([{ userId: open[0].starterId, choice: "YES" }]);
    expect(open[0].eligibleIds.sort()).toEqual([...(await testPrisma.familyMember.findMany({ where: { familyId: f.id, role: { not: "BOSS" } } })).map((m) => m.userId)].sort());
  });

  it("edges 4 and 8: an open vote freezes handover, kick, promote, demote and disband; a Soldier may still leave", async () => {
    const { f, boss, ids: [ub, capo, s1, s2] } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    await startVote(capo);
    await expect(handOverChair(boss, ub)).rejects.toThrow("No handover while a no-confidence vote is open.");
    await expect(kickMember(boss, s1)).rejects.toThrow("No kicks while a no-confidence vote is open.");
    await expect(promoteMember(boss, s1)).rejects.toThrow("No promotions or demotions while a no-confidence vote is open.");
    await expect(demoteMember(boss, capo)).rejects.toThrow("No promotions or demotions while a no-confidence vote is open.");
    await expect(disbandFamily(boss, "VLA")).rejects.toThrow("No disband while a no-confidence vote is open.");
    await expect(leaveFamily(s2)).resolves.toMatchObject({ family: { id: f.id } });
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).bossId).toBe(boss);
  });

  it("edge 10: the Underboss's claim during a vote commits and voids it with no cooldown", async () => {
    const { f, boss, ids: [ub, capo] } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const v = await startVote(capo);
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: daysAgo(8) } });
    await claimChair(f.id, ub);
    const after = await testPrisma.familyVote.findUniqueOrThrow({ where: { id: v.id } });
    expect(after).toMatchObject({ status: "VOID", liveSlot: v.id, resultAnnounced: false });
    expect(+after.cooldownUntil).toBe(+after.closedAt!);
  });

  it("edge 11: handing the chair back and forth never resets the first Boss's grace", async () => {
    const { f, boss, ids: [ub, capo] } = await voteFamily({ size: 6, underboss: true, capos: 1, bossSince: daysAgo(30) });
    const first = (await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).firstBossAt;
    await handOverChair(boss, ub);
    const ubFirst = (await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ub } })).firstBossAt;
    await handOverChair(ub, boss);
    expect(+(await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).firstBossAt).toBe(+first);
    expect(await voteStartBlock(prisma, f.id, capo, new Date())).toBeNull();
    await handOverChair(boss, ub); await handOverChair(ub, boss);
    expect(+(await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ub } })).firstBossAt).toBe(+ubFirst);
  });

  it("edge 12: a demoted officer may start a vote for 7 days", async () => {
    const { f, boss, ids: [ub, c1] } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const t = new Date();
    await demoteMember(boss, c1, t);                                     // Capo → Soldier, officerUntil = t + 7 d
    await demoteMember(boss, ub, t);                                     // Underboss → Capo (a seat is free)
    await demoteMember(boss, ub, t);                                     // Capo → Soldier
    expect(await voteStartBlock(prisma, f.id, c1, new Date(+t + 6 * DAY))).toBeNull();
    expect(await voteStartBlock(prisma, f.id, c1, new Date(+t + 8 * DAY))).toBe("Only the Underboss or a Capo can start a no-confidence vote.");
  });

  it("the Boss's 7-day grace and the 7-day cooldown, each at its boundary", async () => {
    const now = new Date();
    const fresh = await voteFamily({ size: 6, capos: 1, bossSince: new Date(+now - 7 * DAY + 1_000), tag: "AAA" });
    expect(await voteStartBlock(prisma, fresh.f.id, fresh.ids[0], now)).toMatch(/^The Boss has held the chair under 7 days: a vote can open <t:\d+:R>\.$/);
    expect(await voteStartBlock(prisma, fresh.f.id, fresh.ids[0], new Date(+now + 1_000))).toBeNull();
    const cooled = await voteFamily({ size: 6, capos: 1, tag: "BBB" });
    await seedVote({ familyId: cooled.f.id, bossId: cooled.boss, starterId: cooled.ids[0], eligibleIds: cooled.ids, status: "FAILED", closedAt: daysAgo(7), cooldownUntil: new Date(+now + 1_000) });
    expect(await voteStartBlock(prisma, cooled.f.id, cooled.ids[0], now)).toMatch(/^A failed vote blocks another until <t:\d+:R>\.$/);
    expect(await voteStartBlock(prisma, cooled.f.id, cooled.ids[0], new Date(+now + 1_000))).toBeNull();
  });

  it("refuses a snapshot of 2, an Associate Capo and the Boss", async () => {
    const small = await voteFamily({ size: 3, capos: 1, tag: "CCC" });
    expect(await voteStartBlock(prisma, small.f.id, small.ids[0], new Date())).toBe("A vote needs 3 members besides the Boss with 72 hours in the family (you have 2).");
    const { f, boss, ids } = await voteFamily({ size: 6, capos: 1, tag: "DDD" });
    await testPrisma.familyMember.update({ where: { userId: ids[0] }, data: { joinedAt: new Date(Date.now() - 3_600_000) } });
    expect(await voteStartBlock(prisma, f.id, ids[0], new Date())).toBe("You need 72 hours in the family to start a vote.");
    expect(await voteStartBlock(prisma, f.id, boss, new Date())).toBe("Only the Underboss or a Capo can start a no-confidence vote.");
    expect(await openVotes(f.id)).toHaveLength(0);
  });
});
