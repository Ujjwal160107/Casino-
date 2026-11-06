import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { castBallot, claimVoteAnnouncement, closeVote, startVote, voteStartBlock } from "../../src/services/crimeFamily/voteService";
import { autoHandover, claimChair, demoteMember, handOverChair, promoteMember } from "../../src/services/crimeFamily/chairService";
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

const vote = (id: string) => testPrisma.familyVote.findUniqueOrThrow({ where: { id } });
const roleOf = async (uid: string) => (await testPrisma.familyMember.findUnique({ where: { userId: uid } }))?.role ?? null;
const bossOf = async (familyId: string) => (await testPrisma.family.findUniqueOrThrow({ where: { id: familyId } })).bossId;
/** An OPEN vote seeded `ageMs` ago with every non-Boss member in the snapshot (the starter's YES included). */
async function openOn(f: { id: string }, boss: string, starter: string, eligibleIds: string[], ageMs = 0) {
  const createdAt = new Date(Date.now() - ageMs);
  const v = await seedVote({ familyId: f.id, bossId: boss, starterId: starter, eligibleIds, createdAt, closesAt: new Date(+createdAt + 2 * DAY) });
  await testPrisma.familyBallot.create({ data: { voteId: v.id, familyId: f.id, userId: starter, choice: "YES", castAt: createdAt } });
  return v;
}
async function ballots(v: { id: string }, voters: string[], choice: "YES" | "NO") {
  for (const u of voters) await castBallot(v.id, u, choice);
}

describe("no-confidence vote: ballots and the close (amendment 4.3 steps 2-4)", () => {
  it("edge 2: a ballot racing the close is either counted or refused 'Voting closed.'; a ballot at closesAt is refused", async () => {
    const { f, boss, ids } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const v = await openOn(f, boss, ids[1], ids);
    const at = v.closesAt;
    const [b, c] = await Promise.allSettled([castBallot(v.id, ids[2], "NO", new Date(+at - 1)), closeVote(v.id, at)]);
    if (b.status === "rejected") expect(b.reason.message).toMatch(BUSY_OR("Voting closed."));
    if (c.status === "rejected") expect(c.reason.message).toMatch(BUSY_OR("never"));
    if (c.status === "rejected" || c.value === null) await closeVote(v.id, at);   // a busy close is retried by the next sweep
    const closed = await vote(v.id);
    expect(closed.status).not.toBe("OPEN");
    expect(closed.no).toBe(b.status === "fulfilled" ? 1 : 0);
    await expect(castBallot(v.id, ids[3], "YES", at)).rejects.toThrow("Voting closed.");
  });

  it("edge 3: two closes in parallel close once and move the chair once", async () => {
    const { f, boss, ids } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const v = await openOn(f, boss, ids[1], ids);
    await ballots(v, ids.slice(2, 5), "YES");                            // 4 of 5 YES ≥ ceil(10/3) = 4
    const r = await Promise.allSettled([closeVote(v.id, v.closesAt), closeVote(v.id, v.closesAt)]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("never"));
    const rows = r.filter((x) => x.status === "fulfilled" && x.value !== null);
    expect(rows).toHaveLength(1);
    expect(await vote(v.id)).toMatchObject({ status: "PASSED", newBossId: ids[0], yes: 4, no: 0, eligibleAtClose: 5 });
    expect(await bossOf(f.id)).toBe(ids[0]);
    expect(await roleOf(boss)).toBe("SOLDIER");
    expect(await testPrisma.familyMember.count({ where: { familyId: f.id, role: "BOSS" } })).toBe(1);
  });

  it("edge 5: with the Underboss gone the earliest-joined active Capo takes the chair; with no heir the vote is VOID no_heir", async () => {
    const a = await voteFamily({ size: 6, underboss: true, capos: 2, tag: "AAA" });
    const v = await openOn(a.f, a.boss, a.ids[1], a.ids);
    await testPrisma.familyMember.update({ where: { userId: a.ids[2] }, data: { joinedAt: daysAgo(20) } });   // the elder Capo
    await leaveFamily(a.ids[0]);                                         // the Underboss leaves
    await ballots(v, a.ids.slice(2), "YES");
    await closeVote(v.id, v.closesAt);
    expect(await vote(v.id)).toMatchObject({ status: "PASSED", newBossId: a.ids[2] });
    const b = await voteFamily({ size: 4, capos: 1, tag: "BBB" });
    const w = await openOn(b.f, b.boss, b.ids[0], b.ids);
    await ballots(w, b.ids.slice(1), "YES");
    await testPrisma.familyMember.updateMany({ where: { familyId: b.f.id, role: { not: "BOSS" } }, data: { lastActiveAt: daysAgo(30) } });
    const closed = (await closeVote(w.id, w.closesAt))!;
    expect(closed).toMatchObject({ status: "VOID", newBossId: "" });
    expect(+closed.cooldownUntil - +closed.closedAt!).toBe(7 * DAY);
    expect(await bossOf(b.f.id)).toBe(b.boss);
  });

  it("edges 6 and 14: 3 eligible at open, one leaves → VOID too_few with a 7-day cooldown", async () => {
    const { f, boss, ids } = await voteFamily({ size: 4, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    await leaveFamily(ids[2]);
    const closed = (await closeVote(v.id, v.closesAt))!;
    expect(closed).toMatchObject({ status: "VOID", eligibleAtClose: 2 });
    expect(+closed.cooldownUntil - +closed.closedAt!).toBe(7 * DAY);
  });

  it("edge 7: a member who joined after the start cannot vote", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    const late = await seedEligibleUser();
    await testPrisma.familyMember.create({ data: { familyId: f.id, userId: late, role: "SOLDIER", roleSlot: late, seat: 6, joinedAt: daysAgo(10) } });
    await expect(castBallot(v.id, late, "YES")).rejects.toThrow("You can't vote in this one.");
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id, userId: late } })).toBe(0);
  });

  it("edge 9: a pass against a Boss inactive for 7 days still moves the chair to the vote's heir", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, underboss: true, capos: 1 });
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: daysAgo(8) } });
    const v = await openOn(f, boss, ids[1], ids);
    await ballots(v, ids.slice(2), "YES");
    await closeVote(v.id, v.closesAt);
    expect(await bossOf(f.id)).toBe(ids[0]);
  });

  it("edge 15: automatic succession during an open vote voids it with no cooldown", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, underboss: true, capos: 1 });
    const v = await openOn(f, boss, ids[1], ids);
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: daysAgo(15) } });
    expect(await autoHandover(f.id, new Date())).not.toBeNull();
    const after = await vote(v.id);
    expect(after).toMatchObject({ status: "VOID", resultAnnounced: false });
    expect(+after.cooldownUntil).toBe(+after.closedAt!);
  });

  it("a changed ballot counts once with its last choice; 20 YES of 29 passes and 19 fails", async () => {
    const pass = await voteFamily({ size: 30, underboss: true, capos: 6, tag: "PAS" });
    const v = await openOn(pass.f, pass.boss, pass.ids[1], pass.ids);
    await ballots(v, pass.ids.slice(2, 21), "YES");                      // the starter + 19 = 20 YES
    await castBallot(v.id, pass.ids[21], "YES"); await castBallot(v.id, pass.ids[21], "NO");
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id, userId: pass.ids[21] } })).toBe(1);
    expect(await closeVote(v.id, v.closesAt)).toMatchObject({ status: "PASSED", yes: 20, no: 1, eligibleAtClose: 29 });
    const newBoss = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: pass.ids[0] } });
    expect(newBoss.bossedOnce).toBe(true);
    const fail = await voteFamily({ size: 30, underboss: true, capos: 6, tag: "FAL" });
    const w = await openOn(fail.f, fail.boss, fail.ids[1], fail.ids);
    await ballots(w, fail.ids.slice(2, 20), "YES");                      // 19 YES
    expect(await closeVote(w.id, w.closesAt)).toMatchObject({ status: "FAILED", yes: 19, newBossId: "" });
    expect(await bossOf(fail.f.id)).toBe(fail.boss);
  });

  it("ballot races: the same member pressing YES and NO at once leaves one ballot", async () => {
    const { f, boss, ids } = await voteFamily({ size: 6, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    const r = await Promise.allSettled([castBallot(v.id, ids[1], "YES"), castBallot(v.id, ids[1], "NO"), castBallot(v.id, ids[2], "YES")]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("never"));
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id, userId: ids[1] } })).toBeLessThanOrEqual(1);
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id } })).toBeLessThanOrEqual(3);
  });

  it("the announcement CASes: 'start' is won once in two parallel calls; 'result' is refused while OPEN", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    expect((await Promise.all([claimVoteAnnouncement(v.id, "start"), claimVoteAnnouncement(v.id, "start")])).filter(Boolean)).toHaveLength(1);
    expect(await claimVoteAnnouncement(v.id, "result")).toBe(false);
    await closeVote(v.id, v.closesAt);
    expect((await Promise.all([claimVoteAnnouncement(v.id, "result"), claimVoteAnnouncement(v.id, "result")])).filter(Boolean)).toHaveLength(1);
  });
});
