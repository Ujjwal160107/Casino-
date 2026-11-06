import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { redisService } from "../../src/services/redisService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { rejectPress } from "../../src/utils/interactionHelpers";
import { CREW_IDS, CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, fakeModal, fakeSelect, said } from "./fakeInteraction";
import { inviteMember } from "../../src/services/crimeFamily/membershipService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import {
  announceArrears, announceChairChange, announceDisband, announceInvite, announcePayday, announceRoleChange, resolveInviteCard,
} from "../../src/ui/crimeFamily/announce";
import { leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { fakeClient } from "./fakeClient";
import { applyToFamily } from "../../src/services/crimeFamily/recruitService";
import { testPrisma, seedEligibleUser, seedFamily, seedVote, seedApplication, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyVote", "FamilyBallot"]));
beforeEach(resetFamilies);

describe("crime family interactions", () => {
  it.each([CREW_IDS.createOpen("u1"), CREW_IDS.vault("deposit", "u1"), CREW_IDS.open("rename", "u1"), CREW_IDS.disband("open", "u1")])(
    "%s opens its modal before any Prisma or Redis call", async (id) => {
      const findUnique = prisma.familyMember.findUnique;
      const db = vi.spyOn(prisma.familyMember, "findUnique");
      const redis = vi.spyOn(redisService, "getInstance");
      const i = fakeButton(id, { userId: "u1" });
      i.showModal.mockImplementation(async () => { expect(db).not.toHaveBeenCalled(); expect(redis).not.toHaveBeenCalled(); i.order.push("showModal"); });
      await handleCrimeFamilyInteraction(i as any);
      expect(i.order[0]).toBe("showModal");
      db.mockRestore(); redis.mockRestore();
      // Prisma's model proxy reports findUnique as an own property whose value is undefined,
      // so mockRestore writes undefined back; reinstate the real method for the later tests.
      Object.assign(prisma.familyMember, { findUnique });
    });

  it("refuses another user's panel without any DB call", async () => {
    const i = fakeButton(CREW_IDS.view("vault", "owner"), { userId: "intruder" });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringMatching(/not yours/i) }));
  });

  it("acks before touching Redis", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const redis = vi.spyOn(redisService, "getInstance");
    const i = fakeButton(CREW_IDS.view("vault", boss), { userId: boss });
    i.deferReply.mockImplementation(async () => { expect(redis).not.toHaveBeenCalled(); i.deferred = true; i.ephemeral = true; });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.deferReply).toHaveBeenCalled();
    redis.mockRestore();
  });

  it("rejectPress edits a deferred ephemeral and follows up after deferUpdate", async () => {
    const a = fakeButton("crew:x:u", { userId: "u" }); a.deferred = true; a.ephemeral = true;
    await rejectPress(a as any, "No.");
    expect(a.editReply).toHaveBeenCalledWith({ content: "No." });
    const b = fakeButton("crew:x:u", { userId: "u" }); b.deferred = true;
    await rejectPress(b as any, "No.");
    expect(b.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: "No.", flags: 64 }));
  });

  it("a member who left presses an old Vault button: refused, nothing written", async () => {
    const boss = await seedEligibleUser(); const gone = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const i = fakeButton(CREW_IDS.view("vault", gone), { userId: gone });
    await handleCrimeFamilyInteraction(i as any);
    expect(JSON.stringify(i.editReply.mock.calls)).toMatch(/not in a crime family/);
  });

  it("an Underboss demoted between Payday preview and Confirm is refused and nobody is paid (Review Focus 4)", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 1_000_000, lastPaydayAt: daysAgo(8), members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }] });
    ACTIVITY_RULES.push({ key: "all", label: "all", need: 0, count: async () => 1 });
    try {
      await testPrisma.familyMember.update({ where: { userId: ub }, data: { role: "SOLDIER", roleSlot: ub } });   // demoted after the preview
      const i = fakeButton(CREW_IDS.paydayOk(1_000_000, 2, ub), { userId: ub, ephemeralSource: true });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toMatch(/Boss or Underboss/);
      expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.earnings).toBe(1_000_000);
      expect(await testPrisma.transaction.count({ where: { type: "family_payday", wallet: { userId: { in: [boss, ub] } } } })).toBe(0); // other suites leave payday rows
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("the invite Accept button only works for the invitee", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const boss = await seedEligibleUser();
      const invitee = await seedEligibleUser({ wallet: 2_000_000 }); const other = await seedEligibleUser({ wallet: 2_000_000 });
      const f = await seedFamily({ bossId: boss });
      const inv = await inviteMember({ inviterId: boss, inviteeId: invitee, guildId: "g1", channelId: "c1" });
      const wrong = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: other, guildId: "g1" });
      await handleCrimeFamilyInteraction(wrong as any);
      expect(said(wrong)).toContain("This invite is not for you.");
      expect(await testPrisma.familyMember.findUnique({ where: { userId: other } })).toBeNull();
      const right = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: invitee, guildId: "g1" });
      await handleCrimeFamilyInteraction(right as any);
      expect(await testPrisma.familyMember.findUnique({ where: { userId: invitee } })).toMatchObject({ familyId: f.id, role: "SOLDIER" });
    });
  });
  it("the S2 Caper button opens the planner; an unknown cpr action is no longer active", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const i = fakeButton(CPR_IDS.viewPlan(boss), { userId: boss, guildId: "g1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.deferReply).toHaveBeenCalledTimes(1);
    expect(i.ephemeral).toBe(true);
    expect(said(i)).toContain("How a crew heist works");
    expect(said(i)).toContain(`cpr:plan:${boss}`);
    const gone = fakeButton("cpr:nope:u1", { userId: "u1" });
    await handleCrimeFamilyInteraction(gone as any);
    expect(said(gone)).toContain("This button is no longer active.");
  });
  it("create and invite answers are refused while the feature is closed", async () => {
    const founder = await seedEligibleUser({ wallet: 15_000_000 });
    const press = () => fakeButton(CREW_IDS.createOk("VLA", "Velvet Ante", founder), { userId: founder, guildId: "g1", ephemeralSource: true });
    const off = press();
    await handleCrimeFamilyInteraction(off as any);
    expect(said(off)).toContain("Crime Families are not open in this server yet.");
    await withCfConfig({ enabled: true, allowGuildIds: ["g2"] }, async () => {
      const elsewhere = press();
      await handleCrimeFamilyInteraction(elsewhere as any);
      expect(said(elsewhere)).toContain("Crime Families are not open in this server yet.");
    });
    expect(await testPrisma.family.count()).toBe(0);
    expect(await testPrisma.wallet.findUnique({ where: { userId: founder } })).toMatchObject({ balance: 15_000_000 });
    const boss = await seedEligibleUser(); const invitee = await seedEligibleUser({ wallet: 2_000_000 });
    await seedFamily({ bossId: boss });
    const inv = await inviteMember({ inviterId: boss, inviteeId: invitee, guildId: "g1", channelId: "c1" });
    const acc = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: invitee, guildId: "g1" });
    await handleCrimeFamilyInteraction(acc as any);
    expect(said(acc)).toContain("Crime Families are not open yet.");
    expect(await testPrisma.familyMember.findUnique({ where: { userId: invitee } })).toBeNull();
  });

  it("the S5 pager and a select on page 2 keep the page", async () => {
    const boss = await seedEligibleUser();
    const ids: string[] = [];
    for (let k = 0; k < 19; k++) ids.push(await seedEligibleUser());
    await seedFamily({ bossId: boss, level: 6, members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
    await withCfConfig({ enabled: true }, async () => {
      const pg = fakeButton(CREW_IDS.managePage(1, boss), { userId: boss, ephemeralSource: true });
      await handleCrimeFamilyInteraction(pg as any);
      const page2 = JSON.stringify(pg.editReply.mock.calls.at(-1)![0]);
      expect(page2).toContain(CREW_IDS.manageSelect(1, boss));
      const pick = ids[17];                                                // roster #19: page 2 (index 1)
      const sel = fakeSelect(CREW_IDS.manageSelect(1, boss), [pick], { userId: boss, ephemeralSource: true });
      await handleCrimeFamilyInteraction(sel as any);
      const out = JSON.stringify(sel.editReply.mock.calls.at(-1)![0]);
      expect(out).toContain(CREW_IDS.manageSelect(1, boss));
      expect(out).toContain(CREW_IDS.manage("promote", pick, boss));
    });
  });
});

describe("announcers after a committed action", () => {
  /** Logs each DM into the interaction's `order`, next to its editReply. */
  const logDms = (i: any) => { i.client.users.fetch = vi.fn(async () => ({ send: vi.fn(async () => { i.order.push("dm"); return {}; }) })); return i; };
  const shownBeforeDms = (i: any) => {
    expect(i.order).toContain("dm");
    expect(i.order.indexOf("editReply")).toBeLessThan(i.order.indexOf("dm"));
  };

  it("hand-over shows the result before the members' DMs", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }] });
    const i = logDms(fakeButton(CREW_IDS.confirm("chair", "ok", ub, boss), { userId: boss, ephemeralSource: true }));
    await handleCrimeFamilyInteraction(i);
    expect(said(i)).toContain("is now the Boss");
    shownBeforeDms(i);
  });

  it("payday shows the vault before the paid members' DMs", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    await seedFamily({ bossId: boss, earnings: 1_000_000, lastPaydayAt: daysAgo(8), members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }] });
    ACTIVITY_RULES.push({ key: "all", label: "all", need: 0, count: async () => 1 });
    try {
      const i = logDms(fakeButton(CREW_IDS.paydayOk(1_000_000, 2, boss), { userId: boss, ephemeralSource: true }));
      await handleCrimeFamilyInteraction(i);
      expect(said(i)).toContain("Paid 2 members.");
      shownBeforeDms(i);
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("disband shows the result before the former members' DMs", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    await seedFamily({ bossId: boss, tag: "VLA", members: [{ userId: s, role: "SOLDIER" }] });
    const i = logDms(fakeModal(CREW_IDS.modal("disband", boss), { tag: "VLA" }, { userId: boss }));
    await handleCrimeFamilyInteraction(i);
    expect(said(i)).toContain("has disbanded.");
    shownBeforeDms(i);
  });

  it("every announcer logs its own failure instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const client = {} as any; const bad = null as any;
      await expect(announcePayday(client, bad)).resolves.toEqual({ cardPosted: false });
      await expect(announceChairChange(client, bad, "handed", "a", "b")).resolves.toBeUndefined();
      await expect(announceArrears(client, bad)).resolves.toBeUndefined();
      await expect(announceRoleChange(client, bad, "kicked", "a", null)).resolves.toBeUndefined();
      await expect(announceDisband(client, bad)).resolves.toBeUndefined();
      await expect(announceInvite(client, bad, null)).resolves.toBeUndefined();
      await expect(resolveInviteCard(client, bad, "Declined")).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledTimes(7);
    } finally { error.mockRestore(); }
  });
});

describe("no-confidence vote routes (Review Focus 4)", () => {
  /** Boss + a Capo + 4 Soldiers, everyone joined 10 days ago. */
  async function voteFamily() {
    const boss = await seedEligibleUser();
    const ids: string[] = [];
    for (let k = 0; k < 5; k++) ids.push(await seedEligibleUser());
    const f = await seedFamily({ bossId: boss, level: 5, members: ids.map((userId, k) => ({ userId, role: k === 0 ? "CAPO" as const : "SOLDIER" as const, joinedAt: daysAgo(10) })) });
    return { f, boss, ids };
  }

  it("a DM YES pressed after the close reads 'Voting closed.' and writes no ballot", async () => {
    const { f, boss, ids } = await voteFamily();
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: ids[0], eligibleIds: ids, closesAt: new Date(Date.now() - 1_000) });
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.ballot("yes", v.id), { userId: ids[1] });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain("Voting closed.");
    });
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id } })).toBe(0);
  });

  it("a ballot from a member who left reads 'You can't vote in this one.'", async () => {
    const { f, boss, ids } = await voteFamily();
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: ids[0], eligibleIds: ids });
    await leaveFamily(ids[4]);
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.ballot("no", v.id), { userId: ids[4] });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain("You can't vote in this one.");
    });
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id } })).toBe(0);
  });

  it("a counted ballot replies with the pressed choice and the close, never anyone else's", async () => {
    const { f, boss, ids } = await voteFamily();
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: ids[0], eligibleIds: ids });
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.ballot("no", v.id), { userId: ids[2] });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain("Your ballot: NO. You can change it until <t:");
    });
    expect(await testPrisma.familyBallot.findFirst({ where: { voteId: v.id, userId: ids[2] } })).toMatchObject({ choice: "NO" });
  });

  it("crew:vt:start shows the S25 vote card while a vote is open and S35 otherwise", async () => {
    const { f, boss, ids } = await voteFamily();
    const press = () => fakeButton(CREW_IDS.voteStart(ids[0]), { userId: ids[0], ephemeralSource: true });
    const none = press();
    await handleCrimeFamilyInteraction(none as any);
    expect(said(none)).toContain("Start a no-confidence vote against");
    expect(said(none)).toContain(CREW_IDS.voteOk(ids[0]));
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: ids[0], eligibleIds: ids });
    const open = press();
    await handleCrimeFamilyInteraction(open as any);
    expect(said(open)).toContain("Ballots are secret.");
    expect(said(open)).toContain(CREW_IDS.ballot("yes", v.id));
  });

  it("crew:vt:ok posts S34 once in the home channel and DMs every snapshot id once", async () => {
    const { f, boss, ids } = await voteFamily();
    const c = fakeClient();
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.voteOk(ids[0]), { userId: ids[0], ephemeralSource: true, client: c.client });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain("Vote started. It closes <t:");
    });
    expect(c.calls.filter((x) => x.op === "send")).toEqual([expect.objectContaining({ channelId: "c-home" })]);
    const v = await testPrisma.familyVote.findFirstOrThrow({ where: { familyId: f.id } });
    expect(v).toMatchObject({ announced: true, channelId: "c-home", messageId: "m1" });
    for (const id of ids) expect(c.dm.get(id), id).toBe(1);
    expect(c.dm.get(boss)).toBe(1);
  });
});

describe("recruitment routes (Task 15)", () => {
  const REQ = { netWorth: 10_000_000, shifts: 300, ageDays: 45, heists: 5 };
  it.each([() => CREW_IDS.applyOpen("65f0000000000000000000ff", "u1"), () => CREW_IDS.recruitEdit(REQ, "u1")])(
    "%s opens its modal before any Prisma or Redis call", async (id) => {
      const findUnique = prisma.familyMember.findUnique;
      const db = vi.spyOn(prisma.familyMember, "findUnique");
      const redis = vi.spyOn(redisService, "getInstance");
      const i = fakeButton(id(), { userId: "u1" });
      i.showModal.mockImplementation(async () => { expect(db).not.toHaveBeenCalled(); expect(redis).not.toHaveBeenCalled(); i.order.push("showModal"); });
      await handleCrimeFamilyInteraction(i as any);
      expect(i.order[0]).toBe("showModal");
      db.mockRestore(); redis.mockRestore();
      Object.assign(prisma.familyMember, { findUnique });
    });

  it("the listing modal is pre-filled from its customId (F10)", async () => {
    const i = fakeButton(CREW_IDS.recruitEdit(REQ, "u1"), { userId: "u1" });
    await handleCrimeFamilyInteraction(i as any);
    const modal = JSON.stringify(i.showModal.mock.calls[0][0].toJSON());
    for (const v of ["10000000", "300", "45", "5"]) expect(modal).toContain(`"value":"${v}"`);
  });

  it("apply → inbox → accept seats the applicant once", async () => {
    const boss = await seedEligibleUser(); const p = await seedEligibleUser({ wallet: 1_000_000 });   // family_join needs 1,000,000 net worth
    const f = await seedFamily({ bossId: boss, data: { recruiting: true, recruitPitch: "We run heists every night." } });
    await withCfConfig({ enabled: true }, async () => {
      const m = fakeModal(CREW_IDS.applyModal(f.id, p), { message: "I run heists daily" }, { userId: p });
      await handleCrimeFamilyInteraction(m as any);
      expect(said(m)).toContain("Application sent. Officers see it in their inbox.");
      const app = await testPrisma.familyInvite.findFirstOrThrow({ where: { familyId: f.id, inviteeId: p, kind: "APPLICATION" } });
      const b = fakeButton(CREW_IDS.appAnswer("accept", app.id, boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
      await handleCrimeFamilyInteraction(b as any);
      expect(said(b)).toContain(`Accepted <@${p}>.`);
    });
    expect(await testPrisma.familyMember.count({ where: { userId: p, familyId: f.id } })).toBe(1);
  });

  it("Review Focus 4: stale answers and a demoted officer change nothing", async () => {
    const boss = await seedEligibleUser(); const capo = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }], data: { recruiting: true, recruitPitch: "We run heists every night." } });
    const rows = await Promise.all([
      seedApplication({ familyId: f.id, applicantId: "711", expiresAt: new Date(Date.now() - 1_000) }),
      seedApplication({ familyId: f.id, applicantId: "712", status: "WITHDRAWN", resolvedAt: new Date() }),
      seedApplication({ familyId: f.id, applicantId: "713", status: "DECLINED", resolvedAt: new Date(), inviterId: boss }),
    ]);
    await withCfConfig({ enabled: true }, async () => {
      for (const r of rows) for (const answer of ["accept", "decline"] as const) {
        const b = fakeButton(CREW_IDS.appAnswer(answer, r.id, capo), { userId: capo, ephemeralSource: true });
        await handleCrimeFamilyInteraction(b as any);
        expect(said(b)).toContain("Application no longer pending.");
      }
      await testPrisma.familyMember.update({ where: { userId: capo }, data: { role: "SOLDIER", roleSlot: capo } });
      for (const id of [CREW_IDS.recruit("home", capo), CREW_IDS.recruit("inbox", capo), CREW_IDS.recruit("toggle", capo), CREW_IDS.inboxPage(0, capo)]) {
        const b = fakeButton(id, { userId: capo, ephemeralSource: true });
        await handleCrimeFamilyInteraction(b as any);
        expect(said(b)).toContain("You don't have permission to do that.");
      }
    });
    expect((await Promise.all(rows.map((r) => testPrisma.familyInvite.findUniqueOrThrow({ where: { id: r.id } })))).map((r) => r.status)).toEqual(["PENDING", "WITHDRAWN", "DECLINED"]);
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).recruiting).toBe(true);
  });

  it("a board page past the end clamps (Review Focus 5)", async () => {
    const uid = await seedEligibleUser();
    for (let k = 0; k < 7; k++) await seedFamily({ bossId: await seedEligibleUser(), data: { recruiting: true, recruitPitch: "We run heists every night." } });
    await withCfConfig({ enabled: true }, async () => {
      const b = fakeButton(CREW_IDS.board("lvl", false, 99, uid), { userId: uid, ephemeralSource: true });
      await handleCrimeFamilyInteraction(b as any);
      expect(said(b)).toContain("page 2/2");
    });
  });
});
