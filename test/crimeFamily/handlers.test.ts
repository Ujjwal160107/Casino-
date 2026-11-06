import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { redisService } from "../../src/services/redisService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { rejectPress } from "../../src/utils/interactionHelpers";
import { CREW_IDS, CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, fakeModal, said } from "./fakeInteraction";
import { inviteMember } from "../../src/services/crimeFamily/membershipService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import {
  announceArrears, announceChairChange, announceDisband, announceInvite, announcePayday, announceRoleChange, resolveInviteCard,
} from "../../src/ui/crimeFamily/announce";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
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
