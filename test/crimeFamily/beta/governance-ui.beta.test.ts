// Crime Families beta (GOV): the no-confidence vote, the recruitment board and
// the UI/routing surface, played as hostile players through the real services
// and the real router with customIds exactly as the UI emits them. Confirmed
// bugs are `it.fails("BUG-GOV-<n>: …")`; everything else is regression cover.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Message } from "discord.js";
import prisma from "../../../src/utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../../src/utils/economyConfig";
import { RACKETS } from "../../../src/data/crimeFamilyCatalog";
import { checkFamilyName, checkPublicText } from "../../../src/services/crimeFamily/names";
import { castBallot, closeVote, getVoteView, startVote, voteStartBlock } from "../../../src/services/crimeFamily/voteService";
import { sweepVotes } from "../../../src/services/crimeFamily/voteSweeper";
import { claimChair } from "../../../src/services/crimeFamily/chairService";
import { acceptApplication, applyToFamily, declineApplication, withdrawApplication } from "../../../src/services/crimeFamily/recruitService";
import { joinFamilyInTx } from "../../../src/services/crimeFamily/membershipService";
import { sweepInvites } from "../../../src/services/crimeFamily/scheduler";
import * as netWorth from "../../../src/services/netWorthService";
import { sendApplicationDigests } from "../../../src/ui/crimeFamily/recruitAnnounce";
import { buildVoteCard } from "../../../src/ui/crimeFamily/voteScreens";
import { literal } from "../../../src/ui/crimeFamily/recruitScreens";
import { CREW_IDS } from "../../../src/ui/crimeFamily/ids";
import { CREW_SUBACTIONS, handleCrew } from "../../../src/commands/economy/crew";
import { CAPER_SUBACTIONS } from "../../../src/commands/economy/caper";
import { TURF_SUBACTIONS } from "../../../src/commands/economy/turf";
import { buildArgs, SPEC_BY_NAME } from "../../../src/slash/registry";
import { CATEGORIES } from "../../../src/commands/general/help";
import { routeMessage } from "../../../src/commandRouter";
import { fakeClient } from "../fakeClient";
import { said } from "../fakeInteraction";
import { fakeDmClient } from "../../dm/helpers";
import { fakeMessage, replyText } from "../../router/fakeMessage";
import { visibleText } from "../visibleText";
import {
  testPrisma, seedEligibleUser, seedFamily, seedApplication, seedVote, resetFamilies, ensureUniqueIndexes, withCfConfig, daysAgo,
} from "../../helpers";
import {
  countErrors, expectFamilyInvariants, expectFits, governanceFamily, lastScreen, layoutOf, pick, press, submit,
} from "./governance-ui.helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyVote", "FamilyBallot"]));
beforeEach(resetFamilies);

const H = 3_600_000;
const DAY = 24 * H;
const at = (d: Date, ms: number) => new Date(d.getTime() + ms);
const PITCH = "We run heists every night.";
const LIM = CRIME_FAMILY_CONFIG.pitchChars;
const family = (id: string) => testPrisma.family.findUniqueOrThrow({ where: { id } });

// ═════════════════════════════════════════════════════════════════════════════
// (1) The no-confidence vote
// ═════════════════════════════════════════════════════════════════════════════

describe("GOV vote: who may start, and when", () => {
  it("through the router: the Underboss, a Capo and a demoted officer in grace may start; a Soldier and the Boss never", async () => {
    const { f, boss, ids } = await governanceFamily({ size: 7, roles: ["UNDERBOSS", "CAPO", "SOLDIER"] });
    const [ub, capo, demoted, s1] = ids;
    await testPrisma.familyMember.update({ where: { userId: demoted }, data: { officerUntil: at(new Date(), DAY) } });
    for (const who of [boss, s1]) {
      const confirm = await press(CREW_IDS.voteStart(who), who);
      expect(said(confirm)).toMatch(/Only the Underboss or a Capo can start a no-confidence vote\./);
      const ok = await press(CREW_IDS.voteOk(who), who);
      expect(said(ok)).toContain("Only the Underboss or a Capo can start a no-confidence vote.");
    }
    expect(await testPrisma.familyVote.count()).toBe(0);
    for (const who of [ub, capo, demoted]) expect(await voteStartBlock(prisma, f.id, who, new Date())).toBeNull();
    const ok = await press(CREW_IDS.voteOk(demoted), demoted, { client: fakeClient().client });
    expect(said(ok)).toContain("Vote started.");
    const v = await testPrisma.familyVote.findFirstOrThrow({ where: { familyId: f.id } });
    expect(v.starterId).toBe(demoted);
    expect(v.eligibleIds).not.toContain(boss);
    expect([...v.eligibleIds].sort()).toEqual([...ids].sort());
    await expectFamilyInvariants();
  });

  it("voter tenure: 72 h in the family at the start puts a member in the snapshot; 71 h 59 m does not, and their YES is refused", async () => {
    const { f, ids: [, capo, s1, s2] } = await governanceFamily({ size: 5, roles: ["UNDERBOSS", "CAPO"] });
    const now = new Date();
    const young = await seedEligibleUser(); const old = await seedEligibleUser();
    for (const [userId, joinedAt, seat] of [[young, at(now, -72 * H + 60_000), 6], [old, at(now, -72 * H - 60_000), 7]] as const) {
      await testPrisma.familyMember.create({ data: { familyId: f.id, userId, role: "SOLDIER", roleSlot: userId, seat, joinedAt } });
    }
    await testPrisma.family.update({ where: { id: f.id }, data: { memberCount: 7 } });
    const v = await startVote(capo, now);
    expect(v.eligibleIds).toContain(old);
    expect(v.eligibleIds).not.toContain(young);
    await expect(castBallot(v.id, young, "YES", at(now, 1_000))).rejects.toThrow("You can't vote in this one.");
    await expect(castBallot(v.id, old, "YES", at(now, 1_000))).resolves.toBeTruthy();
    expect([s1, s2].every((id) => v.eligibleIds.includes(id))).toBe(true);
  });

  it("a pass seats the Underboss and gives the new Boss a fresh 7-day protection; no cooldown is written", async () => {
    const { f, boss, ids: [ub, c1, c2, s1, s2] } = await governanceFamily({ size: 7, roles: ["UNDERBOSS", "CAPO", "CAPO"] });
    const t0 = new Date();
    const v = await startVote(c1, t0);
    for (const id of [ub, c2, s1, s2]) await castBallot(v.id, id, "YES", at(t0, H));
    const closed = await closeVote(v.id, v.closesAt);
    expect(closed).toMatchObject({ status: "PASSED", newBossId: ub, yes: 5, eligibleAtClose: 6 });
    expect(+closed!.cooldownUntil).toBe(+closed!.closedAt);
    expect((await family(f.id)).bossId).toBe(ub);
    expect((await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).role).toBe("SOLDIER");
    const fresh = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ub } });
    expect(fresh).toMatchObject({ role: "BOSS", bossedOnce: true });
    expect(+fresh.firstBossAt).toBe(+v.closesAt);
    expect(await voteStartBlock(prisma, f.id, c1, at(v.closesAt, 7 * DAY - 1_000))).toMatch(/The Boss has held the chair under 7 days/);
    expect(await voteStartBlock(prisma, f.id, c1, at(v.closesAt, 7 * DAY + 1_000))).toBeNull();
    await expectFamilyInvariants();
  });

  it("the 7-day cooldown after a FAILED vote holds to the second, for every officer, then lifts", async () => {
    const { f, ids: [ub, c1, s1, s2] } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const t0 = new Date();
    const v = await startVote(c1, t0);
    for (const id of [ub, s1, s2]) await castBallot(v.id, id, "NO", at(t0, H));
    const closed = await closeVote(v.id, v.closesAt);
    expect(closed).toMatchObject({ status: "FAILED", yes: 1, no: 3 });
    for (const who of [ub, c1]) {
      expect(await voteStartBlock(prisma, f.id, who, at(v.closesAt, 7 * DAY - 1_000))).toMatch(/A failed vote blocks another until/);
      expect(await voteStartBlock(prisma, f.id, who, at(v.closesAt, 7 * DAY + 1_000))).toBeNull();
    }
  });

  it("stale S35: Start pressed after another officer opened a vote reads 'A vote is already open.'; someone else's S35 is not theirs", async () => {
    const { f, ids: [ub, capo] } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    await startVote(capo);
    const stale = await press(CREW_IDS.voteOk(ub), ub);
    expect(said(stale)).toContain("A vote is already open.");
    const intruder = await press(CREW_IDS.voteOk(ub), capo);
    expect(said(intruder)).toContain("This panel is not yours.");
    expect(await testPrisma.familyVote.count({ where: { familyId: f.id } })).toBe(1);
  });

  it("two officers press Start at once through the router: one vote, one S34 post (no pings), one DM per snapshot voter", async () => {
    const { f, boss, ids } = await governanceFamily({ size: 8, roles: ["UNDERBOSS", "CAPO", "CAPO"] });
    const c = fakeClient();
    const [a, b] = await Promise.all([
      press(CREW_IDS.voteOk(ids[1]), ids[1], { client: c.client }),
      press(CREW_IDS.voteOk(ids[2]), ids[2], { client: c.client }),
    ]);
    const texts = [said(a), said(b)];
    expect(texts.filter((t) => t.includes("Vote started.")).length).toBe(1);
    expect(texts.filter((t) => /A vote is already open\.|Vault busy, try again\./.test(t)).length).toBe(1);
    const posts = c.calls.filter((x) => x.op === "send");
    expect(posts).toHaveLength(1);
    expectFits(posts[0].payload, "S34 posted");
    for (const id of ids) expect(c.dm.get(id), id).toBe(1);
    expect(c.dm.get(boss)).toBe(1);
    expect(await testPrisma.familyVote.count({ where: { familyId: f.id } })).toBe(1);
  });
});

describe("GOV vote: ballots, the freeze and the close", () => {
  it("a secret, changeable ballot through the router: YES → NO → YES leaves one ballot; replies are ephemeral and name only the pressed choice", async () => {
    const { ids: [, capo, s1] } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const v = await startVote(capo);
    for (const choice of ["yes", "no", "yes"] as const) {
      const i = await press(CREW_IDS.ballot(choice, v.id), s1, { ephemeralSource: false, guildId: null });
      expect(i.deferReply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
      expect(said(i)).toContain(`Your ballot: ${choice.toUpperCase()}.`);
      expect(said(i)).not.toContain(capo);
    }
    expect(await testPrisma.familyBallot.findMany({ where: { voteId: v.id, userId: s1 } })).toMatchObject([{ choice: "YES" }]);
    const card = buildVoteCard((await getVoteView(v.id, null, new Date()))!);
    expect(visibleText(card)).not.toContain(s1);
    expect(visibleText(card)).toContain("2 of 5 have voted.");
  });

  it("the freeze through the real buttons: kick, promote, demote, handover and disband are refused while open; a Soldier may leave; the Boss may not", async () => {
    const { f, boss, ids: [ub, capo, s1, s2, s3] } = await governanceFamily({ size: 7, roles: ["UNDERBOSS", "CAPO"] });
    await startVote(capo);
    const expectRefused = async (i: any, line: string) => expect(said(i)).toContain(line);
    await expectRefused(await press(CREW_IDS.confirm("kick", "ok", s1, boss), boss), "No kicks while a no-confidence vote is open.");
    await expectRefused(await press(CREW_IDS.confirm("kick", "ok", s1, capo), capo), "No kicks while a no-confidence vote is open.");
    await expectRefused(await press(CREW_IDS.rank("promote", s1, "SOLDIER", boss), boss), "No promotions or demotions while a no-confidence vote is open.");
    await expectRefused(await press(CREW_IDS.rank("demote", capo, "CAPO", boss), boss), "No promotions or demotions while a no-confidence vote is open.");
    await expectRefused(await press(CREW_IDS.rank("demote", capo, "CAPO", ub), ub), "No promotions or demotions while a no-confidence vote is open.");
    await expectRefused(await press(CREW_IDS.confirm("chair", "ok", ub, boss), boss), "No handover while a no-confidence vote is open.");
    await expectRefused(await submit(CREW_IDS.modal("disband", boss), { tag: f.tag }, boss), "No disband while a no-confidence vote is open.");
    await expectRefused(await press(CREW_IDS.confirm("leave", "ok", "0", boss), boss), "Hand over the chair first");
    const left = await press(CREW_IDS.confirm("leave", "ok", "0", s3), s3);
    expect(said(left)).toContain("You left");
    expect((await family(f.id)).bossId).toBe(boss);
    expect(await testPrisma.familyMember.count({ where: { familyId: f.id } })).toBe(6);
    expect((await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: capo } })).role).toBe("CAPO");
    expect(await testPrisma.familyMember.findUnique({ where: { userId: s2 } })).not.toBeNull();
    await expectFamilyInvariants();
  });

  it("heir order on a pass with no Underboss: the earliest-joined ACTIVE Capo; with no active Capo, the active Soldier with the most heists", async () => {
    const boss = await seedEligibleUser();
    const [c1, c2, s1, s2, s3] = [await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser()];
    const f = await seedFamily({ bossId: boss, level: 10, members: [
      { userId: c1, role: "CAPO", joinedAt: daysAgo(20), lastActiveAt: daysAgo(9) },   // earliest Capo, but inactive
      { userId: c2, role: "CAPO", joinedAt: daysAgo(15) },
      { userId: s1, role: "SOLDIER", joinedAt: daysAgo(12), capers: 4 },
      { userId: s2, role: "SOLDIER", joinedAt: daysAgo(11), capers: 9 },
      { userId: s3, role: "SOLDIER", joinedAt: daysAgo(10), capers: 9 },
    ] });
    const t0 = new Date();
    const v = await startVote(c2, t0);
    for (const id of [s1, s2, s3]) await castBallot(v.id, id, "YES", at(t0, H));
    expect(await closeVote(v.id, v.closesAt)).toMatchObject({ status: "PASSED", newBossId: c2 });

    await resetFamilies();
    const boss2 = await seedEligibleUser();
    const [k1, t1, t2, t3] = [await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser()];
    await seedFamily({ bossId: boss2, level: 10, members: [
      { userId: k1, role: "CAPO", joinedAt: daysAgo(20), lastActiveAt: daysAgo(9) },
      { userId: t1, role: "SOLDIER", joinedAt: daysAgo(12), capers: 4 },
      { userId: t2, role: "SOLDIER", joinedAt: daysAgo(11), capers: 9 },
      { userId: t3, role: "SOLDIER", joinedAt: daysAgo(10), capers: 9 },
    ] });
    const v2 = await startVote(k1, t0);
    for (const id of [t1, t2, t3]) await castBallot(v2.id, id, "YES", at(t0, H));
    expect(await closeVote(v2.id, v2.closesAt)).toMatchObject({ status: "PASSED", newBossId: t2 });
    await expectFamilyInvariants();
    expect(await testPrisma.family.findUnique({ where: { id: f.id } })).toBeNull();   // the first scenario was reset away
  });

  it("members joining and leaving during the vote: joiners never count or vote; a leaver's YES drops from both sides of the count", async () => {
    const { f, ids: [ub, capo, s1, s2, s3] } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const t0 = new Date();
    const v = await startVote(capo, t0);   // snapshot: ub, capo, s1, s2, s3 → 5 eligible, need 4
    await castBallot(v.id, s1, "YES", at(t0, H));
    await castBallot(v.id, s2, "YES", at(t0, H));
    const joiner = await seedEligibleUser({ wallet: 2_000_000 });
    await prisma.$transaction((tx) => joinFamilyInTx(tx, { familyId: f.id, uid: joiner, inviterId: "", now: at(t0, 2 * H) }));
    await expect(castBallot(v.id, joiner, "YES", at(t0, 3 * H))).rejects.toThrow("You can't vote in this one.");
    let view = (await getVoteView(v.id, joiner, at(t0, 3 * H)))!;
    expect(view).toMatchObject({ eligible: 5, need: 4, voted: 3, viewerCanVote: false });
    await testPrisma.familyMember.delete({ where: { userId: s2 } });   // s2 leaves (a plain leave is allowed)
    await testPrisma.family.update({ where: { id: f.id }, data: { memberCount: { decrement: 1 } } });
    view = (await getVoteView(v.id, null, at(t0, 4 * H)))!;
    expect(view).toMatchObject({ eligible: 4, need: 3, voted: 2 });
    await castBallot(v.id, s3, "NO", at(t0, 5 * H));
    const closed = await closeVote(v.id, v.closesAt);
    expect(closed).toMatchObject({ status: "FAILED", yes: 2, no: 1, eligibleAtClose: 4 });
    expect(ub).toBeTruthy();
  });

  it("the sweeper closing a vote races last-second ballots: the stored tally equals the counted ballots, the chair moves at most once, the result posts once", async () => {
    const { f, boss, ids } = await governanceFamily({ size: 10, roles: ["UNDERBOSS", "CAPO", "CAPO"] });
    const [ub, c1, c2, ...soldiers] = ids;
    const t0 = new Date();
    const v = await startVote(c1, t0);
    await testPrisma.familyVote.update({ where: { id: v.id }, data: { announced: true } });   // the start was announced (BUG-GOV-2 covers the other case)
    await castBallot(v.id, c2, "YES", at(t0, H));
    await castBallot(v.id, soldiers[0], "YES", at(t0, H));
    const c = fakeClient();
    const close = v.closesAt;
    const racing = await Promise.allSettled([
      ...soldiers.slice(1).map((id) => castBallot(v.id, id, "YES", at(close, -1))),
      castBallot(v.id, ub, "YES", at(close, -1)),
      sweepVotes(c.client as any, close),
      sweepVotes(c.client as any, close),
    ]);
    for (const r of racing) if (r.status === "rejected") expect(r.reason.message).toMatch(/^(Voting closed\.|Vault busy, try again\.)$/);
    const after = await testPrisma.familyVote.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.status).not.toBe("OPEN");
    const ballots = await testPrisma.familyBallot.findMany({ where: { voteId: v.id } });
    expect(after.yes).toBe(ballots.filter((b) => b.choice === "YES").length);
    expect(after.no).toBe(ballots.filter((b) => b.choice === "NO").length);
    expect((await family(f.id)).bossId).toBe(after.status === "PASSED" ? ub : boss);
    expect(c.calls.filter((x) => x.op === "send")).toHaveLength(1);
    for (const id of [boss, ...ids]) expect(c.dm.get(id) ?? 0, id).toBe(after.status === "PASSED" && id === ub ? 2 : 1);   // + "You are now the Boss"
    await expect(castBallot(v.id, soldiers[1], "NO", at(close, 1_000))).rejects.toThrow("Voting closed.");
    await expectFamilyInvariants();
  });

  it("announce-once: a router start racing two sweeps posts S34 once and DMs each voter once", async () => {
    const { ids, boss } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const c = fakeClient();
    const started = press(CREW_IDS.voteOk(ids[1]), ids[1], { client: c.client });
    const later = new Date(Date.now() + 61_000);
    await Promise.all([started, sweepVotes(c.client as any, later), sweepVotes(c.client as any, later)]);
    await sweepVotes(c.client as any, later);
    expect(c.calls.filter((x) => x.op === "send")).toHaveLength(1);
    for (const id of [boss, ...ids]) expect(c.dm.get(id), id).toBe(1);
  });

  it("a storm of ballots from a 30-member family: every ballot either counts or is refused, and the counts never drift", async () => {
    const { ids } = await governanceFamily({ size: 30, roles: ["UNDERBOSS", "CAPO", "CAPO", "CAPO", "CAPO", "CAPO", "CAPO"] });
    const v = await startVote(ids[1]);
    const voters = ids.filter((id) => id !== ids[1]);
    const r = await Promise.allSettled(voters.map((id) => castBallot(v.id, id, "YES")));
    const ok = r.filter((x) => x.status === "fulfilled").length;
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toBe("Vault busy, try again.");
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id } })).toBe(ok + 1);
    await expectFamilyInvariants();
  });

  it("BUG-GOV-1: a ballot storm refuses ballots with the vault's 'Vault busy, try again.' (no vault is involved; the vote is lost unless the voter presses again)", async () => {
    const { ids } = await governanceFamily({ size: 30, roles: ["UNDERBOSS", "CAPO", "CAPO", "CAPO", "CAPO", "CAPO", "CAPO"] });
    const v = await startVote(ids[1]);
    const voters = ids.filter((id) => id !== ids[1]);
    const refusals: string[] = [];
    for (const choice of ["YES", "NO", "YES"] as const) {   // three rounds: everyone presses at once (the start DM lands for all 28 together)
      const r = await Promise.allSettled(voters.map((id) => castBallot(v.id, id, choice)));
      for (const x of r) if (x.status === "rejected") refusals.push(x.reason.message);
    }
    expect(refusals).toEqual([]);
  });

  it("BUG-GOV-2: a vote that reaches its close while its start is still unannounced gets a second S34 and 'vote opened' DMs with dead buttons after the result", async () => {
    const { f, boss, ids } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const now = new Date();
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: ids[1], eligibleIds: ids, createdAt: at(now, -49 * H), closesAt: at(now, -H), announced: false });
    const c = fakeClient();
    await sweepVotes(c.client as any, now);
    expect((await testPrisma.familyVote.findUniqueOrThrow({ where: { id: v.id } })).status).not.toBe("OPEN");
    expect(c.calls.filter((x) => x.op === "send")).toHaveLength(1);   // the result card, once
    const lastDm = JSON.stringify(c.dmLast.get(ids[2]));
    expect(lastDm).not.toContain("No-confidence vote opened");
    expect(c.dm.get(ids[2])).toBe(1);                                    // the result DM only
  });

  it("BUG-GOV-3: S34 voided by a claim still reads 'closes in 47 hours' above 'Void: the chair changed hands.'", async () => {
    const { f, ids: [ub, capo] } = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const v = await startVote(capo);
    await testPrisma.familyMember.update({ where: { userId: f.bossId }, data: { lastActiveAt: daysAgo(8) } });
    await claimChair(f.id, ub);
    const card = buildVoteCard((await getVoteView(v.id, null, new Date()))!);
    const text = visibleText(card);
    expect(text).toContain("Void: the chair changed hands.");
    expect(text).not.toContain(`closes <t:${Math.floor(v.closesAt.getTime() / 1000)}:R>`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (2) Recruitment
// ═════════════════════════════════════════════════════════════════════════════

const listing = (o: Partial<Record<"pitch" | "nw" | "shifts" | "age" | "heists", string>> = {}) =>
  ({ pitch: "", nw: "0", shifts: "0", age: "0", heists: "0", ...o });
/** The requirements an unedited listing shows: what M2's customId carries for a fresh family. */
const NO_REQ = { netWorth: 0, shifts: 0, ageDays: 0, heists: 0 };

describe("GOV recruitment: the listing", () => {
  it("the Boss and the Underboss edit the listing through M2; a Capo (even forging the modal) cannot; shorthand amounts parse", async () => {
    const { f, boss, ids: [ub, capo] } = await governanceFamily({ size: 4, roles: ["UNDERBOSS", "CAPO"], level: 3 });
    let i = await submit(CREW_IDS.recruitModal(NO_REQ, boss), listing({ pitch: PITCH, nw: "1.5m", shifts: "5k", age: "30", heists: "1,000" }), boss);
    expect(said(i)).toContain("Listing saved.");
    expect(await family(f.id)).toMatchObject({ recruitPitch: PITCH, recruitMinNetWorth: 1_500_000, recruitMinShifts: 5_000, recruitMinAgeDays: 30, recruitMinHeists: 1_000 });
    i = await submit(CREW_IDS.recruitModal({ netWorth: 1_500_000, shifts: 5_000, ageDays: 30, heists: 1_000 }, ub), listing({ nw: "10b" }), ub);
    expect(said(i)).toContain("Listing saved.");
    expect(await family(f.id)).toMatchObject({ recruitPitch: PITCH, recruitMinNetWorth: 10_000_000_000, recruitMinShifts: 0 });
    i = await submit(CREW_IDS.recruitModal(NO_REQ, capo), listing({ pitch: "Capo hijacks the pitch", nw: "0" }), capo);
    expect(said(i)).toContain("You don't have permission to do that.");
    i = await press(CREW_IDS.recruit("on", capo), capo);
    expect(said(i)).toContain("You don't have permission to do that.");
    expect((await family(f.id)).recruitPitch).toBe(PITCH);
  });

  it.each([
    ["nw", "-5", "Min net worth: Enter a whole number like 10m or 1,000."],
    ["nw", "NaN", "Min net worth: Enter a whole number like 10m or 1,000."],
    ["nw", "Infinity", "Min net worth: Enter a whole number like 10m or 1,000."],
    ["nw", "1e20", "Min net worth: "],
    ["nw", "10.5b", "Min net worth: Max 10,000,000,000."],
    ["nw", "1.5", "Min net worth: Enter a whole number like 10m or 1,000."],
    ["shifts", "5001", "Min lifetime shifts: Max 5,000."],
    ["age", "731", "Min Fortuna account age: Max 730."],
    ["heists", "all", "Min lifetime crew heists: Enter a whole number like 10m or 1,000."],
    ["pitch", "@everyone join now please", "No mentions or pings."],
    ["pitch", "join <@123456789012345678> crew", "No mentions or pings."],
    ["pitch", "come to discord.gg/abcdef now", "No links or invites."],
    ["pitch", "[free money](https://x.y) here", "No links or invites."],
    ["pitch", "Official Fortuna staff family", "Don't use Fortuna, staff or Discord names."],
    ["pitch", "short", "Write 10–150 characters."],
  ])("a refused M2 field writes nothing: %s = %j", async (key, value, line) => {
    const { f, boss } = await governanceFamily({ size: 2 });
    const before = await family(f.id);
    const i = await submit(CREW_IDS.recruitModal(NO_REQ, boss), listing({ pitch: PITCH, [key]: value }), boss);
    expect(said(i)).toContain(line);
    const after = await family(f.id);
    expect(after).toMatchObject({ recruitPitch: before.recruitPitch, recruitMinNetWorth: 0, recruitEditedAt: before.recruitEditedAt });
  });

  it("recruiting cannot turn on without a pitch; on puts the family on the board, off takes it off while pending applications stay answerable", async () => {
    const { f, boss } = await governanceFamily({ size: 2, wallet: 2_000_000 });
    let i = await press(CREW_IDS.recruit("on", boss), boss);
    expect(said(i)).toContain("Write a pitch first (Edit listing).");
    await submit(CREW_IDS.recruitModal(NO_REQ, boss), listing({ pitch: PITCH }), boss);
    i = await press(CREW_IDS.recruit("on", boss), boss);
    expect((await family(f.id)).recruiting).toBe(true);
    const viewer = await seedEligibleUser({ wallet: 2_000_000 });
    expect(said(await press(CREW_IDS.board("lvl", false, 0, viewer), viewer))).toContain(`[${f.tag}]`);
    const app = await seedApplication({ familyId: f.id, applicantId: viewer });
    await press(CREW_IDS.recruit("off", boss), boss);
    expect((await family(f.id)).recruiting).toBe(false);
    expect(said(await press(CREW_IDS.board("lvl", false, 0, viewer), viewer))).not.toContain(`[${f.tag}]`);
    const accept = await press(CREW_IDS.appAnswer("accept", app.id, boss), boss, { client: fakeClient().client });
    expect(said(accept)).toContain(`Accepted <@${viewer}>.`);
    await expectFamilyInvariants();
  });

  it("BUG-GOV-4: a stale S31 toggle does the opposite of its label (two officers, or a double click, turn recruiting back off)", async () => {
    const { f, boss, ids: [ub] } = await governanceFamily({ size: 3, roles: ["UNDERBOSS"], data: { recruitPitch: PITCH } });
    // Both officers have S31 open showing "Recruiting off"; each presses it to turn recruiting ON.
    await press(CREW_IDS.recruit("on", boss), boss);
    await press(CREW_IDS.recruit("on", ub), ub);
    expect((await family(f.id)).recruiting).toBe(true);
  });

  it("BUG-GOV-5: Edit listing on a stale S31 pre-fills old requirements and silently reverts another officer's newer ones", async () => {
    const { f, boss, ids: [ub] } = await governanceFamily({ size: 3, roles: ["UNDERBOSS"], data: { recruitPitch: PITCH } });
    const staleReq = { netWorth: 0, shifts: 0, ageDays: 0, heists: 0 };   // what the Boss's S31 showed when it rendered
    await submit(CREW_IDS.recruitModal(staleReq, ub), listing({ nw: "50m", shifts: "300" }), ub);   // the Underboss raises the bar
    const opener = await press(CREW_IDS.recruitEdit(staleReq, boss), boss);               // the Boss presses Edit on the old panel
    const modal = opener.showModal.mock.calls[0][0].toJSON();
    const inputs = modal.components.map((row: any) => row.components[0]);
    const prefilled = Object.fromEntries(inputs.map((x: any) => [x.custom_id, x.value ?? ""]));
    await submit(modal.custom_id, { ...prefilled, pitch: "We run heists every single night." }, boss);   // only the pitch changed
    expect(await family(f.id)).toMatchObject({ recruitMinNetWorth: 50_000_000, recruitMinShifts: 300 });
  });
});

describe("GOV recruitment: applying, caps and timings", () => {
  async function board(n: number, data: Record<string, unknown> = {}) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(await governanceFamily({ size: 1, level: 3, data: { recruiting: true, recruitPitch: PITCH, ...data } }));
    return out;
  }

  it("each requirement alone refuses the apply with both numbers; meeting them all applies", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ recruitMinNetWorth: 2_000_000 }, "needs 2,000,000 net worth (you have 1,500,000)"],
      [{ recruitMinShifts: 401 }, "needs 401 lifetime shifts (you have 400)"],
      [{ recruitMinAgeDays: 401 }, "needs 401 days on Fortuna (you have 400)"],
      [{ recruitMinHeists: 1 }, "needs 1 crew heists (you have 0)"],
    ];
    const p = await seedEligibleUser({ wallet: 1_500_000 });
    for (const [data, line] of cases) {
      const [{ f }] = await board(1, data);
      const i = await submit(CREW_IDS.applyModal(f.id, p), { message: "I am reliable" }, p);
      expect(said(i)).toContain(`[${f.tag}] ${line}.`);
    }
    const [{ f }] = await board(1, { recruitMinNetWorth: 1_500_000, recruitMinShifts: 400, recruitMinAgeDays: 400 });
    expect(said(await submit(CREW_IDS.applyModal(f.id, p), { message: "I am reliable" }, p))).toContain("Application sent.");
    expect(await testPrisma.familyInvite.count({ where: { inviteeId: p, status: "PENDING" } })).toBe(1);
  });

  it("3 pending per applicant through the router; a withdraw frees a slot but that family waits 24 hours; a forged withdraw of another player's app is refused", async () => {
    const fams = await board(4);
    const p = await seedEligibleUser({ wallet: 2_000_000 });
    const other = await seedEligibleUser({ wallet: 2_000_000 });
    for (const { f } of fams.slice(0, 3)) expect(said(await submit(CREW_IDS.applyModal(f.id, p), { message: "hire me" }, p))).toContain("Application sent.");
    expect(said(await submit(CREW_IDS.applyModal(fams[3].f.id, p), { message: "hire me" }, p))).toContain("You have 3 pending applications. Withdraw one first.");
    const mine = await testPrisma.familyInvite.findMany({ where: { inviteeId: p, status: "PENDING" } });
    expect(said(await pick(CREW_IDS.withdraw(other), [mine[0].id], other))).toContain("Application no longer pending.");
    expect(said(await pick(CREW_IDS.withdraw(p), [mine[0].id], other))).toContain("This panel is not yours.");
    const wd = await pick(CREW_IDS.withdraw(p), [mine[0].id], p);
    expect(said(wd)).toContain("Application withdrawn. You can apply there again in 24 hours.");
    const back = fams.find(({ f }) => f.id === mine[0].familyId)!.f;
    expect(said(await submit(CREW_IDS.applyModal(back.id, p), { message: "again" }, p))).toContain(`You can apply to [${back.tag}] again <t:`);
    expect(said(await submit(CREW_IDS.applyModal(fams[3].f.id, p), { message: "hire me" }, p))).toContain("Application sent.");
    expect(await testPrisma.familyInvite.count({ where: { inviteeId: p, status: "PENDING" } })).toBe(3);
  });

  it("decline: 7-day wait to the second; expiry after 72 h DMs the applicant once and costs a 24-hour wait", async () => {
    const [{ f, boss }] = await board(1);
    const p = await seedEligibleUser({ wallet: 2_000_000 });
    const t0 = new Date();
    const app = await applyToFamily({ applicantId: p, familyId: f.id, message: "first try", guildId: "g1", channelId: "c1", now: t0 });
    expect(+app.expiresAt - +t0).toBe(72 * H);
    await declineApplication(app.id, boss, at(t0, H));
    await expect(applyToFamily({ applicantId: p, familyId: f.id, message: "again", guildId: "g1", channelId: "c1", now: at(t0, H + 7 * DAY - 1_000) })).rejects.toThrow(`[${f.tag}] declined you: you can apply again`);
    const again = await applyToFamily({ applicantId: p, familyId: f.id, message: "again", guildId: "g1", channelId: "c1", now: at(t0, H + 7 * DAY + 1_000) });
    const c = fakeClient();
    await sweepInvites(c.client as any, at(again.expiresAt, -1_000));
    expect((await testPrisma.familyInvite.findUniqueOrThrow({ where: { id: again.id } })).status).toBe("PENDING");
    await sweepInvites(c.client as any, again.expiresAt);
    await sweepInvites(c.client as any, at(again.expiresAt, 60_000));
    expect((await testPrisma.familyInvite.findUniqueOrThrow({ where: { id: again.id } })).status).toBe("EXPIRED");
    expect(c.dm.get(p)).toBe(1);
    expect(JSON.stringify(c.dmLast.get(p))).toContain("expired after 72 hours. You can apply again in 24 hours.");
    await expect(applyToFamily({ applicantId: p, familyId: f.id, message: "x", guildId: "g1", channelId: "c1", now: at(again.expiresAt, 23 * H) })).rejects.toThrow(`You can apply to [${f.tag}] again`);
    await expect(applyToFamily({ applicantId: p, familyId: f.id, message: "x", guildId: "g1", channelId: "c1", now: at(again.expiresAt, 24 * H + 1_000) })).resolves.toBeTruthy();
  });

  it("accept and decline by Capo and up through the join path: a Soldier, another family's Capo and a forged appId are refused; one seat per applicant", async () => {
    const { f, boss, ids: [capo, soldier] } = await governanceFamily({ size: 3, roles: ["CAPO"], level: 3, data: { recruiting: true, recruitPitch: PITCH } });
    const rival = await governanceFamily({ size: 2, roles: ["CAPO"], level: 3 });
    const p = await seedEligibleUser({ wallet: 2_000_000 });
    const app = await applyToFamily({ applicantId: p, familyId: f.id, message: "hire me", guildId: "g1", channelId: "c1" });
    expect(said(await press(CREW_IDS.appAnswer("accept", app.id, soldier), soldier))).toContain("You don't have permission to do that.");
    expect(said(await press(CREW_IDS.appAnswer("accept", app.id, rival.ids[0]), rival.ids[0]))).toContain("You don't have permission to do that.");
    expect(said(await press(CREW_IDS.appAnswer("decline", app.id, rival.boss), rival.boss))).toContain("You don't have permission to do that.");
    expect(said(await press(CREW_IDS.appAnswer("accept", app.id, capo), soldier))).toContain("This panel is not yours.");
    const c = fakeClient();
    const [a, b] = await Promise.all([
      press(CREW_IDS.appAnswer("accept", app.id, capo), capo, { client: c.client }),
      press(CREW_IDS.appAnswer("decline", app.id, boss), boss, { client: c.client }),
    ]);
    const outcomes = [said(a), said(b)];
    expect(outcomes.filter((t) => /Accepted|Declined/.test(t)).length).toBe(1);
    expect(outcomes.filter((t) => /Application no longer pending\.|Vault busy, try again\./.test(t)).length).toBe(1);
    expect(c.dm.get(p)).toBe(1);
    const member = await testPrisma.familyMember.findUnique({ where: { userId: p } });
    const status = (await testPrisma.familyInvite.findUniqueOrThrow({ where: { id: app.id } })).status;
    expect(member ? status === "ACCEPTED" : status === "DECLINED").toBe(true);
    await expectFamilyInvariants();
  });

  it("officer digests: Boss, Underboss and Capos (an Associate Capo too) get one DM per 6 hours; Soldiers never; the button opens their own inbox", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const capo = await seedEligibleUser(); const newCapo = await seedEligibleUser(); const soldier = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, level: 3, members: [
      { userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: capo, role: "CAPO", joinedAt: daysAgo(10) },
      { userId: newCapo, role: "CAPO", joinedAt: daysAgo(1) }, { userId: soldier, role: "SOLDIER", joinedAt: daysAgo(10) },
    ], data: { recruiting: true, recruitPitch: PITCH, appDigestAt: daysAgo(1) } });
    const t0 = new Date();
    await seedApplication({ familyId: f.id, applicantId: await seedEligibleUser(), createdAt: t0 });
    await seedApplication({ familyId: f.id, applicantId: await seedEligibleUser(), createdAt: t0 });
    const c = fakeClient();
    await Promise.all([sendApplicationDigests(c.client as any, at(t0, 1_000)), sendApplicationDigests(c.client as any, at(t0, 1_000))]);
    await seedApplication({ familyId: f.id, applicantId: await seedEligibleUser(), createdAt: at(t0, H) });
    await sendApplicationDigests(c.client as any, at(t0, 5 * H));
    expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 1, [ub]: 1, [capo]: 1, [newCapo]: 1 });
    expect(JSON.stringify(c.dmLast.get(capo))).toContain("2 new applications to");
    expect(JSON.stringify(c.dmLast.get(capo))).toContain(CREW_IDS.recruit("inbox", capo));
    await sendApplicationDigests(c.client as any, at(t0, 6 * H + 2_000));
    expect(c.dm.get(boss)).toBe(2);
    expect(JSON.stringify(c.dmLast.get(boss))).toContain("1 new application to");
    const dmPress = await press(CREW_IDS.recruit("inbox", capo), capo, { guildId: null, ephemeralSource: false });
    expect(said(dmPress)).toContain("3 pending");
  });

  it("board: sorts, the I qualify filter and forged page values all clamp to a real page", async () => {
    const viewer = await seedEligibleUser({ wallet: 2_000_000 });
    for (let k = 0; k < 8; k++) {
      await governanceFamily({ size: 1 + (k % 3), level: 1 + (k % 4), data: { recruiting: true, recruitPitch: PITCH, recruitMinShifts: k === 7 ? 5_000 : 0, activeMembers: k } });
    }
    for (const page of ["-5", "NaN", "Infinity", "1e9", "1.7", "-2"]) {
      const i = await press(`crew:bd:lvl:0:${page}:${viewer}`, viewer);
      expect(said(i), page).toMatch(/page [12]\/2/);
      expectFits(lastScreen(i), `board page ${page}`);
    }
    const q = await press(CREW_IDS.board("act", true, 0, viewer), viewer);
    expect(said(q)).toContain("I qualify: on");
    expect(said(q)).toContain("page 1/2");
    expect(said(await press(CREW_IDS.board("act", true, 1, viewer), viewer))).toContain("page 2/2");
    expect(said(await press(CREW_IDS.board("act", true, 1, viewer), viewer))).not.toContain("5,000 shifts");
    const garbage = await press(`crew:bd:zzz:1:0:${viewer}`, viewer);
    expect(said(garbage)).toContain("Sort: Level");
  });

  it("BUG-GOV-6: an apply racing an accept elsewhere leaves a PENDING application from a player who is already a member", async () => {
    const a = await governanceFamily({ size: 1, level: 3, data: { recruiting: true, recruitPitch: PITCH } });
    const c = await governanceFamily({ size: 1, level: 3, data: { recruiting: true, recruitPitch: PITCH } });
    const p = await seedEligibleUser({ wallet: 5_000_000 });
    const app = await seedApplication({ familyId: a.f.id, applicantId: p });
    let entered!: () => void; const inside = new Promise<void>((r) => { entered = r; });
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const real = netWorth.computeNetWorth;
    // Holds the apply transaction open after it read "not in a family" (the stats read), while family A accepts.
    const spy = vi.spyOn(netWorth, "computeNetWorth").mockImplementation(async (uid: string) => {
      if (uid === p) { entered(); await gate; }
      return real(uid);
    });
    const applying = applyToFamily({ applicantId: p, familyId: c.f.id, message: "pick me", guildId: "g1", channelId: "c1" }).catch((e) => e);
    await inside;
    spy.mockImplementation(real);
    await acceptApplication(app.id, a.boss);
    release();
    await applying;
    spy.mockRestore();
    expect((await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: p } })).familyId).toBe(a.f.id);
    expect(await testPrisma.familyInvite.count({ where: { inviteeId: p, status: "PENDING" } })).toBe(0);
  });
});

describe("GOV recruitment: the free-text rule and rendering", () => {
  it("per-word slur filter (A37): spaced letters, punctuation and zero-width inside a word are caught; cross-word false positives pass", () => {
    for (const bad of ["you are a n i g g e r lol", "hey n.i.g.g.e.r ok", "a ni​gger here", "TOTAL F-A-G-G-O-T", "what a retard move"]) {
      expect(checkPublicText(bad, LIM), bad).toEqual({ ok: false, reason: "That text is not allowed." });
    }
    for (const fine of ["don't be a nerd here", "we go ok every night", "we are tardy sometimes", "so much inky ink", "where there is a will"]) {
      expect(checkPublicText(fine, LIM).ok, fine).toBe(true);
    }
  });

  it("BUG-GOV-7: homoglyph, accented and full-width slurs pass the filter (the fold strips every non-ASCII letter) and render as the slur", () => {
    for (const bad of ["you are a nіgger lol", "you are a nïgger lol", "you are a ｎｉｇｇｅｒ lol"]) {
      expect(checkPublicText(bad, LIM).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("BUG-GOV-8: leetspeak and split slurs pass the pitch filter and the family-name filter", () => {
    for (const bad of ["you are a n1gg3r lol", "you are a nig ger lol", "you are a n igger lol", "hey f4gg0t lol"]) {
      expect(checkPublicText(bad, LIM).ok, bad).toBe(false);
    }
    for (const name of ["N1gger Mob", "Fagg0t Crew"]) expect(checkFamilyName(name).ok, name).toBe(false);
  });

  it("markdown and mention injection render literally on S30, S31 and S32 (headings, fences, quotes, lists, spoilers, timestamps, slash mentions)", async () => {
    const pitch = "# BIG ```x``` > q ||s|| -# sub <t:0:R> </crew:1> **b** __u__ ~~s~~ *i* `c` 1. one - two \\**live** \\# x \\";
    const checked = checkPublicText(pitch, LIM);
    expect(checked.ok).toBe(true);
    const { f, boss, ids: [capo] } = await governanceFamily({ size: 2, roles: ["CAPO"], level: 3, data: { recruiting: true, recruitPitch: (checked as any).text } });
    const p = await seedEligibleUser({ wallet: 2_000_000 });
    await applyToFamily({ applicantId: p, familyId: f.id, message: "> quote ```fence``` # head <t:0:F> ||spoil|| [x] -# s", guildId: "g1", channelId: "c1" });
    // A character is live markdown when an even number of backslashes (zero included) stands before it.
    const unescaped = (s: string, ch: string) => [...s].some((c, k) => {
      if (c !== ch) return false;
      let n = 0;
      while (k - 1 - n >= 0 && s[k - 1 - n] === "\\") n++;
      return n % 2 === 0;
    });
    const card = lastScreen(await press(CREW_IDS.familyCard(f.id, p), p));
    const panel = lastScreen(await press(CREW_IDS.recruit("home", boss), boss));
    const inbox = lastScreen(await press(CREW_IDS.recruit("inbox", capo), capo));
    for (const [label, payload] of [["S30", card], ["S31", panel], ["S32", inbox]] as const) {
      expectFits(payload, label);
      const t = layoutOf(payload).texts.find((x) => x.includes("BIG") || x.includes("quote"))!;
      expect(t, label).toBeTruthy();
      const free = label === "S32" ? t.split("\n> ")[1].split("\n")[0] : t.split("\n")[0];
      for (const ch of ["#", "<", "*", "_", "~", "|", "`"]) expect(unescaped(free, ch), `${label} ${ch}: ${free}`).toBe(false);
      expect(free.startsWith(">"), label).toBe(false);
    }
    expect(literal("\\")).toBe("\\\\");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// (3) UI and routing
// ═════════════════════════════════════════════════════════════════════════════

describe("GOV UI: every vote and recruitment screen at its real worst case", () => {
  it("built from a 30-member L10 family with 25 escape-heavy 200-character applications: S2, S29–S35, S25 and the DMs fit Discord", async () => {
    const roles = ["UNDERBOSS", ...Array(6).fill("CAPO")] as any[];
    const worstPitch = checkPublicText("*_~|#<\\`>".repeat(17).slice(0, 150), LIM);
    expect(worstPitch.ok).toBe(true);
    const { f, boss, ids } = await governanceFamily({ size: 30, roles, data: { recruiting: true, recruitPitch: (worstPitch as any).text,
      recruitMinNetWorth: 10_000_000_000, recruitMinShifts: 5_000, recruitMinAgeDays: 730, recruitMinHeists: 1_000, name: "Velvet Ante Syndicate Ok" } });
    await testPrisma.family.update({ where: { id: f.id }, data: { level: 10, memberCount: 30 } });
    const msg = checkPublicText("*_~|#<\\`>".repeat(23).slice(0, 200), CRIME_FAMILY_CONFIG.applicationChars);
    expect(msg.ok).toBe(true);
    const applicants: string[] = [];
    for (let k = 0; k < 25; k++) {
      const a = await seedEligibleUser();
      applicants.push(a);
      await seedApplication({ familyId: f.id, applicantId: a, message: (msg as any).text, createdAt: at(new Date(), -k * 60_000) });
    }
    for (let k = 0; k < 6; k++) {
      await governanceFamily({ size: 2, level: 9, data: { recruiting: true, recruitPitch: PITCH, name: `Velvet Ante Syndicate O${k}`,
        recruitMinNetWorth: 10_000_000_000, recruitMinShifts: 5_000, recruitMinAgeDays: 730, recruitMinHeists: 1_000 } });
    }
    const screens: [string, any][] = [];
    screens.push(["S2 Underboss", lastScreen(await press(CREW_IDS.view("home", ids[0]), ids[0]))]);
    for (let page = 0; page < 5; page++) screens.push([`S32 page ${page + 1}`, lastScreen(await press(CREW_IDS.inboxPage(page, ids[0]), ids[0]))]);
    screens.push(["S31", lastScreen(await press(CREW_IDS.recruit("home", boss), boss))]);
    screens.push(["S29", lastScreen(await press(CREW_IDS.board("lvl", false, 0, applicants[0]), applicants[0]))]);
    screens.push(["S30", lastScreen(await press(CREW_IDS.familyCard(f.id, applicants[0]), applicants[0]))]);
    screens.push(["S33", lastScreen(await press(CREW_IDS.myApps(applicants[0]), applicants[0]))]);
    screens.push(["S35", lastScreen(await press(CREW_IDS.voteStart(ids[1]), ids[1]))]);
    const c = fakeClient();
    await press(CREW_IDS.voteOk(ids[1]), ids[1], { client: c.client });
    screens.push(["S34", c.calls.find((x) => x.op === "send")!.payload]);
    screens.push(["S25", lastScreen(await press(CREW_IDS.voteStart(ids[2]), ids[2]))]);
    for (const [label, payload] of screens) {
      expect(payload, label).toBeTruthy();
      expectFits(payload, label);
    }
    const inbox = layoutOf(screens[1][1]);
    expect(inbox.ids.filter((x) => x.startsWith("crew:ap:accept:"))).toHaveLength(5);
    for (const id of [ids[2], boss]) {
      const dm = c.dmLast.get(id) as any;
      expect(layoutOf(dm).components, `DM ${id}`).toBeLessThanOrEqual(40);
      expect(layoutOf(dm).chars).toBeLessThanOrEqual(4000);
    }
  });
});

describe("GOV routing: ownership, stale and forged customIds", () => {
  it("every owner-scoped vote and recruitment button, select and modal refuses another player before any write", async () => {
    const { f, boss, ids: [ub] } = await governanceFamily({ size: 3, roles: ["UNDERBOSS"], data: { recruitPitch: PITCH } });
    const owner = ub; const intruder = boss;
    const buttons = [
      CREW_IDS.voteStart(owner), CREW_IDS.voteOk(owner), CREW_IDS.voteCancel(owner), CREW_IDS.open("vote", owner),
      CREW_IDS.board("lvl", false, 0, owner), CREW_IDS.myApps(owner), CREW_IDS.familyCard(f.id, owner), CREW_IDS.applyOpen(f.id, owner),
      CREW_IDS.recruit("home", owner), CREW_IDS.recruit("on", owner), CREW_IDS.recruit("inbox", owner),
      CREW_IDS.recruitEdit({ netWorth: 0, shifts: 0, ageDays: 0, heists: 0 }, owner), CREW_IDS.appAnswer("accept", f.id, owner), CREW_IDS.inboxPage(1, owner),
    ];
    for (const id of buttons) {
      const i = await press(id, intruder);
      expect(said(i), id).toContain("This panel is not yours.");
      expect(i.showModal).not.toHaveBeenCalled();
    }
    for (const id of [CREW_IDS.boardSelect(owner), CREW_IDS.withdraw(owner)]) expect(said(await pick(id, [f.id], intruder)), id).toContain("This panel is not yours.");
    for (const [id, fields] of [[CREW_IDS.recruitModal(NO_REQ, owner), listing({ pitch: "Hijacked by the Boss" })], [CREW_IDS.applyModal(f.id, owner), { message: "x" }]] as const) {
      expect(said(await submit(id, fields, intruder)), id).toContain("This panel is not yours.");
    }
    expect(await family(f.id)).toMatchObject({ recruiting: false, recruitPitch: PITCH });
    expect(await testPrisma.familyVote.count()).toBe(0);
  });

  it("unknown actions and truncated ids read 'This button is no longer active.'; a ballot on a vote of another family is refused", async () => {
    const a = await governanceFamily({ size: 6, roles: ["UNDERBOSS", "CAPO"] });
    const b = await governanceFamily({ size: 2 });
    for (const id of [`crew:vt:zzz:${a.ids[0]}`, `crew:rc:zzz:${a.ids[0]}`, `crew:zzz:${a.ids[0]}`]) {
      expect(said(await press(id, a.ids[0])), id).toContain("This button is no longer active.");
    }
    const v = await startVote(a.ids[1]);
    expect(said(await press(CREW_IDS.ballot("yes", v.id), b.boss, { ephemeralSource: false }))).toContain("You can't vote in this one.");
    expect(said(await press(CREW_IDS.ballot("no", v.id), a.boss, { ephemeralSource: false }))).toContain("You can't vote in this one.");
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id } })).toBe(1);
  });

  it("BUG-GOV-9: a malformed id in a shared or select customId crashes into 'Something went wrong.' and an error log instead of a clean refusal", async () => {
    const uid = await seedEligibleUser();
    let replies: string[] = [];
    const errors = await countErrors(async () => {
      replies = [
        said(await press(CREW_IDS.ballot("yes", "not-an-object-id"), uid, { ephemeralSource: false })),
        said(await press(CREW_IDS.familyCard("zzz", uid), uid)),
        said(await pick(CREW_IDS.boardSelect(uid), ["zzz"], uid)),
        said(await press(CREW_IDS.appAnswer("accept", "zzz", uid), uid)),
      ];
    });
    for (const r of replies) expect(r).not.toContain("Something went wrong.");
    expect(errors).toBe(0);
  });
});

describe("GOV commands: slash options, prefix aliases and help numbers", () => {
  const fakeSlash = (values: Record<string, string>) => ({
    options: { getString: (n: string) => values[n] ?? null, getInteger: () => null, getUser: () => null },
  }) as any;

  it("/crew offers exactly the 24 subactions !crew handles, and each choice serialises to that handler", () => {
    const spec = SPEC_BY_NAME.get("crew")!;
    const choices = (spec.opts![0] as any).choices as string[];
    expect(choices).toHaveLength(24);
    expect([...choices].sort()).toEqual(Object.keys(CREW_SUBACTIONS).sort());
    for (const action of choices) expect(buildArgs(fakeSlash({ action, target: "VLA" }), spec).args).toEqual([action, "VLA"]);
    const heist = SPEC_BY_NAME.get("heist")!;
    for (const c of (heist.opts![0] as any).choices) expect(Object.keys(CAPER_SUBACTIONS)).toContain(c);
    const turf = SPEC_BY_NAME.get("turf")!;
    for (const c of (turf.opts![0] as any).choices) expect(Object.keys(TURF_SUBACTIONS)).toContain(c);
    const rackets = (turf.opts![1] as any).choices as string[];
    expect(rackets.length).toBeLessThanOrEqual(25);
    expect(rackets).toEqual(RACKETS.map((r) => r.key));
    for (const spec2 of [spec, heist, turf]) for (const o of spec2.opts ?? []) expect(((o as any).choices ?? []).length).toBeLessThanOrEqual(25);
  });

  it("!heist, !caper, !capers and !crewheist reach the heist handler; !mob reaches !crew", async () => {
    const author = await seedEligibleUser();
    for (const alias of ["heist", "caper", "capers", "crewheist", "Caper", "HEIST"]) {
      const m = fakeMessage(`!${alias} zzz`, { authorId: author, guildId: "g1" });
      await withCfConfig({ enabled: true }, () => routeMessage({} as any, m.message, "!"));
      expect(replyText(m.reply.mock.calls[0]?.[0]), alias).toContain("Usage: !heist [plan <1-4> | join <role> | leave | start | cancel | brief]");
    }
    const mob = fakeMessage("!mob zzz", { authorId: author, guildId: "g1" });
    await withCfConfig({ enabled: true }, () => routeMessage({} as any, mob.message, "!"));
    expect(replyText(mob.reply.mock.calls[0]?.[0])).toContain("Usage: `!crew [dashboard | create");
  });

  it("help and tutorial numbers match CRIME_FAMILY_CONFIG and the catalog", () => {
    const cat = CATEGORIES.find((c) => c.id === "crimefamilies")!;
    const all = JSON.stringify(cat);
    const n = (x: number) => x.toLocaleString("en-US");
    expect(all).toContain(`create — found a family (${n(CRIME_FAMILY_CONFIG.createFee)} from your wallet)`);
    expect(all).toContain(`rename — rename the family (${n(CRIME_FAMILY_CONFIG.renameFee)} from the vault, Boss)`);
    expect(all).toContain(`(Capo needs ${n(CRIME_FAMILY_CONFIG.capoMinNetWorth)} net worth)`);
    expect(all).toContain(`(${Math.round(CRIME_FAMILY_CONFIG.vaultTaxRate * 100)}% tax)`);
    expect(all).toContain(`inactive ${CRIME_FAMILY_CONFIG.claimChairAfterSeconds / 86_400} days`);
    expect(all).toContain(`a ${CRIME_FAMILY_CONFIG.lobbySeconds / 60}-minute lobby and a ${CRIME_FAMILY_CONFIG.goSeconds}-second GO`);
    expect(all).toContain("up to 30 members");
    expect(all).toContain("vote [start]");
    expect(all).toContain("board [TAG]");
    expect(all).toContain("recruit — your family's listing and applications (Capo and up)");
  });

  it("BUG-GOV-10: `!crew constructor` gets no reply at all and `!crew __proto__` crashes ('Something went wrong.'): CREW_SUBACTIONS is indexed without an own-property check", async () => {
    const outcomes: string[] = [];
    const errors = await countErrors(async () => {
      for (const sub of ["constructor", "__proto__"]) {
        const dm = fakeDmClient();
        const reply = vi.fn(async (_p: unknown) => ({ id: "r" }));
        const message = { guildId: "g1", channelId: "c1", author: { id: "u1", bot: false }, client: dm.client, reply, content: `!crew ${sub}` } as unknown as Message;
        await withCfConfig({ enabled: true }, () => handleCrew(message, [sub], "!"));
        outcomes.push(reply.mock.calls.length ? replyText(reply.mock.calls[0][0]) : "(no reply)");
      }
    });
    for (const o of outcomes) expect(o).toContain("Usage: `!crew [");
    expect(errors).toBe(0);
  });
});
