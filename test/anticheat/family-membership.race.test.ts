import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createFamily, forceRenameFamily } from "../../src/services/crimeFamily/familyService";
import { inviteMember, acceptInvite, declineInvite, leaveFamily, kickMember, expireInvites } from "../../src/services/crimeFamily/membershipService";
import {
  promoteMember, demoteMember, handOverChair, claimChair, autoHandover, markClaimNotice, clearClaimNotice,
} from "../../src/services/crimeFamily/chairService";
import { FAMILY_HOOKS } from "../../src/services/crimeFamily/extensions";
import prisma from "../../src/utils/prisma";
import { FamilyError, VaultBusy } from "../../src/services/crimeFamily/tx";
import type { FamilyRole } from "../../src/data/crimeFamilyCatalog";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const todayKey = () => new Date().toISOString().slice(0, 10);

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const create = (uid: string, name = "Velvet Ante", tag = "VLA") => createFamily({ uid, username: "u", name, tag, guildId: "g1", channelId: "c1" });

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("createFamily (6.1)", () => {
  it("burns 10,000,000 and seats the founder as Boss", async () => {
    const uid = await seedEligibleUser({ wallet: 15_000_000 });
    const fam = await create(uid);
    expect(await wallet(uid)).toBe(5_000_000);
    expect(fam).toMatchObject({ level: 1, nameKey: "velvet ante", tagKey: "VLA", bossId: uid, homeGuildId: "g1", homeChannelId: "c1", duesDayKey: todayKey() });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: uid } })).toMatchObject({ role: "BOSS", roleSlot: "BOSS", seat: 1 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: fam.id } })).toMatchObject({ type: "create_fee", amount: 0, meta: { paid: 10_000_000 } });
    expect(await testPrisma.audit.count({ where: { userId: uid, type: "family_create" } })).toBe(1);
  });

  it("refuses a failing gate before any debit", async () => {
    const uid = await seedEligibleUser({ wallet: 15_000_000, shifts: 59 });
    await expect(create(uid)).rejects.toThrow(/shifts/i);
    expect(await wallet(uid)).toBe(15_000_000);
  });

  it("forceRenameFamily applies the name rules and maps a taken name", async () => {
    await seedFamily({ bossId: await seedEligibleUser(), name: "Taken Name", tag: "TKN" });
    const f = await seedFamily({ bossId: await seedEligibleUser(), tag: "VLA" });
    await expect(forceRenameFamily("VLA", "Velvet  Ante", "admin")).rejects.toThrow("No double spaces.");
    await expect(forceRenameFamily("VLA", "taken name", "admin")).rejects.toThrow("Name taken.");
    expect(await forceRenameFamily("vla", "Fresh Name", "admin")).toMatchObject({ id: f.id, name: "Fresh Name", nameKey: "fresh name" });
  });

  it("forceRenameFamily refuses a family disbanded after the tag read with a FamilyError, not a P2025", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), tag: "VLA" });
    const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (fn: any, opts: any) => {
      await testPrisma.familyMember.deleteMany({ where: { familyId: f.id } });   // the disband lands between the read and the write
      await testPrisma.family.deleteMany({ where: { id: f.id } });
      return original(fn, opts);
    }) as any);
    try {
      const err = await forceRenameFamily("VLA", "Fresh Name", "admin-race").catch((e) => e);
      expect(err).toBeInstanceOf(FamilyError);
      expect(err.message).toBe("No family with that tag.");
      expect(await testPrisma.audit.count({ where: { userId: "admin-race", type: "family_forcerename" } })).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it("one user double-creating gets one family and one debit", async () => {
    const uid = await seedEligibleUser({ wallet: 25_000_000 });
    await Promise.allSettled([create(uid, "Alpha Crew", "ALP"), create(uid, "Beta Crew", "BET")]);
    expect(await testPrisma.family.count()).toBe(1);
    expect(await wallet(uid)).toBe(15_000_000);
  });

  it("two users racing for one name: one family, the loser keeps their money", async () => {
    const a = await seedEligibleUser({ wallet: 15_000_000 });
    const b = await seedEligibleUser({ wallet: 15_000_000 });
    const rs = await Promise.allSettled([create(a, "Velvet Ante", "VLA"), create(b, "velvet ante", "VLB")]);
    expect(rs.filter((r) => r.status === "rejected").map((r: any) => r.reason.message)).toEqual(["Name or tag taken."]);
    expect([await wallet(a), await wallet(b)].sort((x, y) => x - y)).toEqual([5_000_000, 15_000_000]);
  });
});

const invite = (inviterId: string, inviteeId: string, now?: Date) => inviteMember({ inviterId, inviteeId, guildId: "g1", channelId: "c1", now });
const joiner = () => seedEligibleUser({ wallet: 2_000_000 });          // passes family_join
async function famWith(members: { role: FamilyRole; joinedAt?: Date }[] = []) {
  const bossId = await seedEligibleUser();
  const rows = [];
  for (const m of members) rows.push({ userId: await joiner(), joinedAt: daysAgo(10), ...m });
  const family = await seedFamily({ bossId, members: rows });
  return { family, bossId, ids: rows.map((r) => r.userId) };
}
const pending = (familyId: string) => testPrisma.familyInvite.count({ where: { familyId, status: "PENDING" } });
const inviteRow = (id: string) => testPrisma.familyInvite.findUnique({ where: { id } });
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);

describe("invites (6.4)", () => {
  it("creates a 24 h PENDING invite; Soldiers cannot invite", async () => {
    const now = new Date();
    const { family, bossId, ids: [soldier] } = await famWith([{ role: "SOLDIER" }]);
    const t = await joiner();
    const inv = await invite(bossId, t, now);
    expect(inv).toMatchObject({ familyId: family.id, inviterId: bossId, inviteeId: t, status: "PENDING", slot: "PENDING", guildId: "g1", channelId: "c1" });
    expect(+inv.expiresAt).toBe(+now + 86_400_000);
    await expect(invite(soldier, await joiner())).rejects.toThrow("You don't have permission to do that.");
  });

  it("a Boss who founded a minute ago can invite at once (P20)", async () => {
    const founder = await seedEligibleUser({ wallet: 15_000_000 });
    await createFamily({ uid: founder, username: "f", name: "Fresh Crew", tag: "FRS", guildId: "g1", channelId: "c1" });
    await expect(invite(founder, await joiner())).resolves.toMatchObject({ status: "PENDING" });
  });

  it("refuses self, a member of this family and a member of another family, with no row", async () => {
    const { bossId, ids: [mine] } = await famWith([{ role: "SOLDIER" }]);
    const other = await famWith();
    await expect(invite(bossId, bossId)).rejects.toThrow("You can't invite yourself.");
    await expect(invite(bossId, mine)).rejects.toThrow(`<@${mine}> is already in your family.`);
    await expect(invite(bossId, other.bossId)).rejects.toThrow(`<@${other.bossId}> is already in a crime family.`);
    expect(await testPrisma.familyInvite.count()).toBe(0);
  });

  it("refuses a second pending invite to the same player", async () => {
    const { bossId } = await famWith();
    const t = await joiner();
    await invite(bossId, t);
    await expect(invite(bossId, t)).rejects.toThrow("Already invited.");
    expect(await testPrisma.familyInvite.count()).toBe(1);
  });

  it("holds the pending cap of 5 under 6 concurrent invites", async () => {
    const { family, bossId } = await famWith();
    const targets = await Promise.all(Array.from({ length: 6 }, joiner));
    const rs = await Promise.allSettled(targets.map((t) => invite(bossId, t)));
    const n = await pending(family.id);
    expect(n).toBeLessThanOrEqual(5);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(n);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Too many pending invites (max 5)."));
    while ((await pending(family.id)) < 5) await invite(bossId, await joiner());
    await expect(invite(bossId, await joiner())).rejects.toThrow("Too many pending invites (max 5).");
  });

  it("holds the inviter's 3-per-7-days and the family's 5-per-7-days accepted caps", async () => {
    const { family, bossId, ids: [capo] } = await famWith([{ role: "CAPO", joinedAt: daysAgo(30) }]);
    const accepted = (inviterId: string, n: number, at: Date) => testPrisma.familyInvite.createMany({ data: Array.from({ length: n }, (_, k) => ({
      familyId: family.id, inviterId, inviteeId: `old-${inviterId}-${k}`, status: "ACCEPTED", slot: `s-${inviterId}-${k}`, guildId: "g1", channelId: "c1", expiresAt: at, resolvedAt: at })) });
    await accepted(capo, 3, daysAgo(6));
    await expect(invite(capo, await joiner())).rejects.toThrow("You can bring in 3 members per 7 days.");
    await accepted(bossId, 2, daysAgo(6));
    await expect(invite(bossId, await joiner())).rejects.toThrow("Your family can take 5 new members per 7 days.");
    await testPrisma.familyInvite.updateMany({ where: { familyId: family.id, status: "ACCEPTED" }, data: { resolvedAt: daysAgo(8) } });
    await expect(invite(capo, await joiner())).resolves.toMatchObject({ status: "PENDING" });
  });
});

describe("accept (6.4)", () => {
  it("seats the invitee as a Soldier in the lowest free seat", async () => {
    const { family, bossId } = await famWith();
    const u = await joiner();
    const inv = await invite(bossId, u);
    expect((await acceptInvite(inv.id, u)).member).toMatchObject({ familyId: family.id, role: "SOLDIER", roleSlot: u, seat: 2 });
    expect(await inviteRow(inv.id)).toMatchObject({ status: "ACCEPTED", slot: inv.id });
  });

  it("only the invitee may accept", async () => {
    const { bossId } = await famWith();
    const inv = await invite(bossId, await joiner());
    await expect(acceptInvite(inv.id, await joiner())).rejects.toThrow("This invite is not for you.");
  });

  it("an expired invite is refused and stays PENDING for the sweeper", async () => {
    const now = new Date();
    const { bossId } = await famWith();
    const u = await joiner();
    const inv = await invite(bossId, u, daysAgo(2, now));
    await expect(acceptInvite(inv.id, u, now)).rejects.toThrow("Invite expired.");
    expect((await inviteRow(inv.id))!.status).toBe("PENDING");
  });

  it("a failing join gate rolls the invite back to PENDING and names the gate", async () => {
    const { bossId } = await famWith();
    const u = await seedEligibleUser({ wallet: 2_000_000, shifts: 19 });
    const inv = await invite(bossId, u);
    await expect(acceptInvite(inv.id, u)).rejects.toThrow("Not eligible: ≥ 20 shifts (you have 19 shifts)");
    expect((await inviteRow(inv.id))!.status).toBe("PENDING");
    expect(await testPrisma.familyMember.findUnique({ where: { userId: u } })).toBeNull();
  });

  it("accepting two families at once yields one membership; the other invite stays PENDING", async () => {
    const a = await famWith(); const b = await famWith();
    const u = await joiner();
    const ia = await invite(a.bossId, u); const ib = await invite(b.bossId, u);
    const rs = await Promise.allSettled([acceptInvite(ia.id, u), acceptInvite(ib.id, u)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("You are already in a family."));
    expect(await testPrisma.familyMember.count({ where: { userId: u } })).toBe(1);
    expect((await testPrisma.familyInvite.findMany({ where: { inviteeId: u } })).map((i) => i.status).sort()).toEqual(["ACCEPTED", "PENDING"]);
  });

  it("two invitees racing for the last seat: one joins, the other gets 'Family is full.'", async () => {
    const { family, bossId } = await famWith([{ role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }]); // 5 of 6
    const a = await joiner(); const b = await joiner();
    const invs = [await invite(bossId, a), await invite(bossId, b)];
    const rs = await Promise.allSettled([acceptInvite(invs[0].id, a), acceptInvite(invs[1].id, b)]);
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id } })).toBe(6);
    const lost = rs.findIndex((r) => r.status === "rejected");
    expect((rs[lost] as PromiseRejectedResult).reason.message).toBe("Family is full.");
    expect((await inviteRow(invs[lost].id))!.status).toBe("PENDING");
  });

  it("decline marks DECLINED with slot = id, once", async () => {
    const { bossId } = await famWith();
    const u = await joiner();
    const inv = await invite(bossId, u);
    expect(await declineInvite(inv.id, u)).toMatchObject({ status: "DECLINED", slot: inv.id });
    await expect(declineInvite(inv.id, u)).rejects.toThrow("Invite expired.");
  });
});

describe("leave and kick (6.4)", () => {
  it("leave deletes the row, writes FamilyExit LEFT and deletes the leaver's pending invites", async () => {
    const { family, ids: [capo] } = await famWith([{ role: "CAPO" }]);
    await invite(capo, await joiner());
    await leaveFamily(capo);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: capo } })).toBeNull();
    expect(await testPrisma.familyExit.findFirst({ where: { userId: capo } })).toMatchObject({ familyId: family.id, reason: "LEFT", wasBoss: false });
    expect(await testPrisma.familyInvite.count({ where: { inviterId: capo } })).toBe(0);
  });

  it("a Boss with members cannot leave; a solo Boss is pointed to disband", async () => {
    const { bossId } = await famWith([{ role: "SOLDIER" }]);
    await expect(leaveFamily(bossId)).rejects.toThrow("Hand over the chair first (`!crew handover <user>`).");
    const solo = await famWith();
    await expect(leaveFamily(solo.bossId)).rejects.toThrow("You're the only member. Leaving would disband the family: use `!crew disband`.");
  });

  it("a hook's memberExitBlock refuses leave and kick, inside the transaction", async () => {
    const { bossId, ids: [s] } = await famWith([{ role: "SOLDIER" }]);
    const kinds: string[] = [];
    FAMILY_HOOKS.push({ key: "t", memberExitBlock: async (tx, ctx) => { await tx.family.findUnique({ where: { id: ctx.familyId } }); kinds.push(ctx.kind); return "You are seated in a live crew heist."; } });
    try {
      await expect(leaveFamily(s)).rejects.toThrow("You are seated in a live crew heist.");
      await expect(kickMember(bossId, s)).rejects.toThrow("You are seated in a live crew heist.");
    } finally { FAMILY_HOOKS.pop(); }
    expect(kinds).toEqual(["LEFT", "KICKED"]);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: s } })).not.toBeNull();
  });

  it("a retried leave re-runs the block", async () => {
    const { ids: [s] } = await famWith([{ role: "SOLDIER" }]);
    let calls = 0;
    FAMILY_HOOKS.push({ key: "t", memberExitBlock: async () => { if (++calls === 1) throw new VaultBusy(); return "Blocked now."; } });
    try { await expect(leaveFamily(s)).rejects.toThrow("Blocked now."); } finally { FAMILY_HOOKS.pop(); }
    expect(calls).toBe(2);
  });

  it("kick follows the rank table, writes FamilyExit KICKED and runs onMemberExit inside the transaction", async () => {
    const { ids: [capo, capo2, s1, s2] } = await famWith([{ role: "CAPO" }, { role: "CAPO" }, { role: "SOLDIER" }, { role: "SOLDIER" }]);
    const kinds: string[] = [];
    FAMILY_HOOKS.push({ key: "t", onMemberExit: async (_tx, ctx) => { kinds.push(ctx.kind); } });
    try {
      await expect(kickMember(capo, capo2)).rejects.toThrow("You don't have permission to do that.");
      await kickMember(capo, s1);
    } finally { FAMILY_HOOKS.pop(); }
    expect(kinds).toEqual(["KICKED"]);
    expect(await testPrisma.familyExit.findFirst({ where: { userId: s1 } })).toMatchObject({ reason: "KICKED" });
    FAMILY_HOOKS.push({ key: "t", onMemberExit: async () => { throw new FamilyError("hook failed"); } });
    try { await expect(kickMember(capo, s2)).rejects.toThrow("hook failed"); } finally { FAMILY_HOOKS.pop(); }
    expect(await testPrisma.familyMember.findUnique({ where: { userId: s2 } })).not.toBeNull();
  });

  it("expireInvites moves past-due PENDING to EXPIRED with slot = id, once", async () => {
    const now = new Date();
    const { bossId } = await famWith();
    const inv = await invite(bossId, await joiner(), daysAgo(2, now));
    const [a, b] = await Promise.all([expireInvites(now), expireInvites(now)]);
    expect(a.length + b.length).toBe(1);
    expect(await inviteRow(inv.id)).toMatchObject({ status: "EXPIRED", slot: inv.id });
  });
});

describe("ranks (6.3)", () => {
  const member = (userId: string) => testPrisma.familyMember.findUniqueOrThrow({ where: { userId } });

  it("promotions fill CAPO1, CAPO2, CAPO3, then 'Capo seats are full.'", async () => {
    const { bossId, ids } = await famWith([{ role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }]);
    for (const [k, id] of ids.slice(0, 3).entries()) {
      expect(await promoteMember(bossId, id)).toMatchObject({ newRole: "CAPO" });
      expect(await member(id)).toMatchObject({ role: "CAPO", roleSlot: `CAPO${k + 1}` });
    }
    await expect(promoteMember(bossId, ids[3])).rejects.toThrow("Capo seats are full.");
    expect(await member(ids[3])).toMatchObject({ role: "SOLDIER", roleSlot: ids[3] });
  });

  it("three concurrent Soldier → Capo promotions take CAPO1..3 once each", async () => {
    const { bossId, ids } = await famWith([{ role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }]);
    const rs = await Promise.allSettled(ids.map((id) => promoteMember(bossId, id)));
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await Promise.all(ids.map(member))).map((r) => r.roleSlot).sort()).toEqual(["CAPO1", "CAPO2", "CAPO3"]);
  });

  it("two concurrent promotions to Underboss: one wins; the other reads 'The Underboss seat is taken.'", async () => {
    const { family, bossId, ids } = await famWith([{ role: "CAPO" }, { role: "CAPO" }]);
    const rs = await Promise.allSettled(ids.map((id) => promoteMember(bossId, id)));
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rs.filter((r) => r.status === "rejected").map((r: any) => r.reason.message)).toEqual(["The Underboss seat is taken."]);
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id, role: "UNDERBOSS" } })).toBe(1);
  });

  it("an Underboss can promote Soldier → Capo but not Capo → Underboss", async () => {
    const { ids: [ub, capo, s] } = await famWith([{ role: "UNDERBOSS" }, { role: "CAPO" }, { role: "SOLDIER" }]);
    await expect(promoteMember(ub, capo)).rejects.toThrow("You don't have permission to do that.");
    expect(await promoteMember(ub, s)).toMatchObject({ newRole: "CAPO" });
    expect(await member(s)).toMatchObject({ role: "CAPO", roleSlot: "CAPO2" });
    expect(await member(capo)).toMatchObject({ role: "CAPO", roleSlot: "CAPO1" });
  });

  it("demote Capo → Soldier sets roleSlot to the member's uid", async () => {
    const { bossId, ids: [capo] } = await famWith([{ role: "CAPO" }]);
    expect(await demoteMember(bossId, capo)).toMatchObject({ newRole: "SOLDIER" });
    expect(await member(capo)).toMatchObject({ role: "SOLDIER", roleSlot: capo });
  });
});

describe("the chair (6.7)", () => {
  const member = (userId: string) => testPrisma.familyMember.findUniqueOrThrow({ where: { userId } });
  const bossOf = async (id: string) => (await testPrisma.family.findUniqueOrThrow({ where: { id } })).bossId;

  it("handover moves bossId and makes the old Boss a Soldier with roleSlot = old uid", async () => {
    const { family, bossId, ids: [capo] } = await famWith([{ role: "CAPO" }]);
    expect(await handOverChair(bossId, capo)).toMatchObject({ oldBossId: bossId, newBossId: capo });
    expect(await bossOf(family.id)).toBe(capo);
    expect(await member(bossId)).toMatchObject({ role: "SOLDIER", roleSlot: bossId });
    expect(await member(capo)).toMatchObject({ role: "BOSS", roleSlot: "BOSS" });
  });

  it("claim works after 7 days of Boss inactivity and is refused at 6 ('The Boss is still active.')", async () => {
    const { family, bossId, ids: [ub] } = await famWith([{ role: "UNDERBOSS" }]);
    await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: daysAgo(6) } });
    await expect(claimChair(family.id, ub)).rejects.toThrow("The Boss is still active.");
    await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: daysAgo(7.01) } });
    expect(await claimChair(family.id, ub)).toMatchObject({ oldBossId: bossId, newBossId: ub });
    expect(await member(bossId)).toMatchObject({ role: "SOLDIER", roleSlot: bossId });
    expect(await member(ub)).toMatchObject({ role: "BOSS", roleSlot: "BOSS" });
  });

  it("autoHandover at 14 days seats the heir as BOSS; nobody qualified → null and nothing changes", async () => {
    const now = new Date();
    const bossId = await seedEligibleUser(); const ub = await seedEligibleUser(); const capo = await seedEligibleUser();
    const f = await seedFamily({ bossId, members: [
      { userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(20), lastActiveAt: daysAgo(9) },
      { userId: capo, role: "CAPO", joinedAt: daysAgo(20), lastActiveAt: daysAgo(1) },
    ] });
    await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: daysAgo(13, now) } });
    expect(await autoHandover(f.id, now)).toBeNull();
    await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: daysAgo(14.01, now) } });
    expect(await autoHandover(f.id, now)).toMatchObject({ oldBossId: bossId, newBossId: capo });
    expect(await member(capo)).toMatchObject({ role: "BOSS", roleSlot: "BOSS" });
    expect(await member(bossId)).toMatchObject({ role: "SOLDIER", roleSlot: bossId });

    const lone = await seedEligibleUser(); const idle = await seedEligibleUser();
    const g = await seedFamily({ bossId: lone, members: [{ userId: idle, role: "UNDERBOSS", joinedAt: daysAgo(20), lastActiveAt: daysAgo(8) }] });
    await testPrisma.familyMember.update({ where: { userId: lone }, data: { lastActiveAt: daysAgo(15, now) } });
    expect(await autoHandover(g.id, now)).toBeNull();
    expect(await bossOf(g.id)).toBe(lone);
    expect(await member(idle)).toMatchObject({ role: "UNDERBOSS", roleSlot: "UNDERBOSS" });
  });

  it("claim vs a returning Boss: the in-transaction re-read sees the return → 'The Boss is back.'", async () => {
    const bossId = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(20) }] });
    await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: daysAgo(8) } });
    // claimChair's pre-check reads the Boss with prisma.familyMember.findUnique({ where: { userId: family.bossId } }) on the
    // global client; the in-transaction re-read uses tx.familyMember.findUnique, a different delegate the patch does not touch.
    const delegate = prisma.familyMember as any;
    const original = delegate.findUnique;
    let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.userId === bossId) {
        first = false;
        await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: new Date() } });
      }
      return snapshot;                                   // stale: still 8 days ago
    };
    try { await expect(claimChair(f.id, ub)).rejects.toThrow("The Boss is back."); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.bossId).toBe(bossId);
  });

  it("markClaimNotice is true once per inactivity episode; clearClaimNotice opens the next one", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser() });
    expect(await markClaimNotice(f.id, f.bossId)).toBe(true);
    expect(await markClaimNotice(f.id, f.bossId)).toBe(false);
    expect(await clearClaimNotice(f.id, f.bossId)).toBe(true);
    expect(await clearClaimNotice(f.id, f.bossId)).toBe(false);
    expect(await markClaimNotice(f.id, f.bossId)).toBe(true);
  });
});
