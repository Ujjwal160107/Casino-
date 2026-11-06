import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { acceptApplication, applyToFamily, declineApplication, editListing, withdrawApplication } from "../../src/services/crimeFamily/recruitService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { containerText } from "../dm/helpers";
import { announceDisband } from "../../src/ui/crimeFamily/announce";
import { fakeClient } from "../crimeFamily/fakeClient";
import { acceptInvite, acceptInviteByTag, declineInviteByTag, inviteMember, listPendingInvites } from "../../src/services/crimeFamily/membershipService";
import { redisService } from "../../src/services/redisService";
import { testPrisma, seedEligibleUser, seedFamily, seedApplication, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "User"]));
beforeEach(resetFamilies);

const HOUR = 3_600_000;
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()[\]]/g, "\\$&")}|Vault busy, try again\\.)$`);
const PITCH = "We run heists every night and pay on time.";
/** An applicant who passes the family_join gate (its 1,000,000 net worth included). */
const seedApplicant = (o: Parameters<typeof seedEligibleUser>[0] = {}) => seedEligibleUser({ wallet: 1_000_000, ...o });
let tagSeq = 0;
/** A recruiting family (Boss + `size - 1` Soldiers) with optional requirements. */
async function recruiting(o: { size?: number; level?: number; req?: Partial<Record<"recruitMinNetWorth" | "recruitMinShifts" | "recruitMinAgeDays" | "recruitMinHeists", number>>; on?: boolean } = {}) {
  const boss = await seedEligibleUser();
  const ids: string[] = [];
  for (let k = 0; k < (o.size ?? 1) - 1; k++) ids.push(await seedEligibleUser());
  const tag = `R${++tagSeq}`;
  const f = await seedFamily({ bossId: boss, tag, level: o.level ?? 1, members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
    data: { recruiting: o.on ?? true, recruitPitch: PITCH, ...o.req } });
  return { f, boss, ids, tag };
}
const apply = (applicantId: string, familyId: string, message = "I run heists daily") => applyToFamily({ applicantId, familyId, message, guildId: "g1", channelId: "c1" });
const pending = (where: object) => testPrisma.familyInvite.count({ where: { kind: "APPLICATION", status: "PENDING", ...where } });

describe("applications (amendment 8.4)", () => {
  it("edge 1: four parallel applies never leave more than 3 PENDING; retrying the busy ones fills to exactly 3", async () => {
    const p = await seedApplicant();
    const fams = await Promise.all([0, 1, 2, 3].map(() => recruiting()));
    const r = await Promise.allSettled(fams.map(({ f }) => apply(p, f.id)));
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("You have 3 pending applications. Withdraw one first."));
    expect(await pending({ inviteeId: p })).toBeLessThanOrEqual(3);
    for (const [k, x] of r.entries()) {
      if (x.status === "rejected" && /busy/.test(x.reason.message)) await apply(p, fams[k].f.id).catch((e) => expect(e.message).toBe("You have 3 pending applications. Withdraw one first."));
    }
    expect(await pending({ inviteeId: p })).toBe(3);
  });

  it("edge 2: 26 parallel applicants never leave more than 25 PENDING; retrying the busy ones fills to exactly 25", async () => {
    const { f, tag } = await recruiting();
    const ps: string[] = [];
    for (let k = 0; k < 26; k++) ps.push(await seedApplicant());
    const full = `[${tag}]'s inbox is full. Try again later.`;
    const r = await Promise.allSettled(ps.map((p) => apply(p, f.id)));
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR(full));
    expect(await pending({ familyId: f.id })).toBeLessThanOrEqual(25);
    for (const [k, x] of r.entries()) {
      if (x.status === "rejected" && /busy/.test(x.reason.message)) await apply(ps[k], f.id).catch((e) => expect(e.message).toBe(full));
    }
    expect(await pending({ familyId: f.id })).toBe(25);
  });

  it("edge 7: reapply waits: 7 days after a decline, 24 hours after a withdraw or expiry", async () => {
    const { f, tag } = await recruiting();
    const p = await seedApplicant();
    const prior = (status: string, ago: number) => seedApplication({ familyId: f.id, applicantId: p, status, resolvedAt: new Date(Date.now() - ago) });
    const clear = () => testPrisma.familyInvite.deleteMany({ where: { inviteeId: p } });
    await prior("DECLINED", 6 * 24 * HOUR);
    await expect(apply(p, f.id)).rejects.toThrow(new RegExp(`^\\[${tag}\\] declined you: you can apply again <t:\\d+:R>\\.$`));
    await clear(); await prior("DECLINED", 7 * 24 * HOUR);
    await expect(apply(p, f.id)).resolves.toMatchObject({ status: "PENDING" });
    for (const status of ["WITHDRAWN", "EXPIRED"]) {
      await clear(); await prior(status, 2 * HOUR);
      await expect(apply(p, f.id)).rejects.toThrow(new RegExp(`^You can apply to \\[${tag}\\] again <t:\\d+:R>\\.$`));
      await clear(); await prior(status, 24 * HOUR);
      await expect(apply(p, f.id)).resolves.toMatchObject({ status: "PENDING" });
    }
  });

  it("a withdraw racing an apply to the same family never leaves two PENDING rows", async () => {
    const { f, tag } = await recruiting();
    const p = await seedApplicant();
    const a = await apply(p, f.id);
    const r = await Promise.allSettled([withdrawApplication(a.id, p), apply(p, f.id)]);
    expect(await pending({ familyId: f.id, inviteeId: p })).toBeLessThanOrEqual(1);
    const [w, again] = r;
    if (w.status === "fulfilled" && again.status === "rejected") {
      expect(again.reason.message).toMatch(new RegExp(`^(You already have a pending invite or application with this family\\.|You can apply to \\[${tag}\\] again <t:\\d+:R>\\.|Vault busy, try again\\.)$`));
    }
  });

  it("requirements are read uncached: a stale 50M display cache does not pass a live 1M", async () => {
    const { f, tag } = await recruiting({ req: { recruitMinNetWorth: 10_000_000 } });
    const p = await seedEligibleUser({ wallet: 1_000_000 });
    await redisService.set(`networth:${p}`, { total: 50_000_000 }, 600);
    await expect(apply(p, f.id)).rejects.toThrow(`[${tag}] needs 10,000,000 net worth (you have 1,000,000).`);
    expect(await pending({ inviteeId: p })).toBe(0);
  });

  it("a full family and a closed listing refuse; a refused listing edit writes nothing; a Capo cannot edit", async () => {
    const full = await recruiting({ size: 10, level: 1 });                // L1 cap 10
    const closed = await recruiting({ on: false });
    const p = await seedApplicant();
    await expect(apply(p, full.f.id)).rejects.toThrow(`[${full.tag}] is full.`);
    await expect(apply(p, closed.f.id)).rejects.toThrow(`[${closed.tag}] is not recruiting.`);
    const before = (await testPrisma.family.findUniqueOrThrow({ where: { id: closed.f.id } })).recruitEditedAt;
    const input = { pitch: "", minNetWorth: "abc", minShifts: "", minAgeDays: "", minHeists: "" };
    await expect(editListing(closed.boss, input)).rejects.toThrow(/net worth: Enter a whole number like 10m or 1,000\.$/i);
    await expect(editListing(closed.boss, { ...input, minNetWorth: "", pitch: "visit discord.gg/abc now" })).rejects.toThrow("No links or invites.");
    expect(+(await testPrisma.family.findUniqueOrThrow({ where: { id: closed.f.id } })).recruitEditedAt).toBe(+before);
    const capo = await seedEligibleUser();
    await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }] });
    await expect(editListing(capo, { ...input, minNetWorth: "", pitch: PITCH })).rejects.toThrow("You don't have permission to do that.");
  });

  it("Review Focus 1: an application never passes through the invite paths", async () => {
    const { f, tag } = await recruiting();
    const p = await seedApplicant();
    const a = await apply(p, f.id);
    await expect(acceptInvite(a.id, p)).rejects.toThrow("Invite expired.");
    await expect(acceptInviteByTag(p, tag)).rejects.toThrow("You have no pending invite from that family.");
    await expect(declineInviteByTag(p, tag)).rejects.toThrow("You have no pending invite from that family.");
    expect(await listPendingInvites(p)).toEqual([]);
    expect(await testPrisma.familyInvite.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: "PENDING", kind: "APPLICATION" });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: p } })).toBeNull();
  });

  it("edge 8: inviting a player who already applied points the officer to the inbox", async () => {
    const { f, boss } = await recruiting();
    const p = await seedApplicant();
    await apply(p, f.id);
    await expect(inviteMember({ inviterId: boss, inviteeId: p, guildId: "g1", channelId: "c1" })).rejects.toThrow(`<@${p}> already applied: accept it in the inbox.`);
  });

  it("accepting an invite withdraws the joiner's other PENDING applications", async () => {
    const a = await recruiting(); const b = await recruiting();
    const inviter = await recruiting();
    const p = await seedApplicant();
    const [x, y] = [await apply(p, a.f.id), await apply(p, b.f.id)];
    const inv = await inviteMember({ inviterId: inviter.boss, inviteeId: p, guildId: "g1", channelId: "c1" });
    await acceptInvite(inv.id, p);
    for (const id of [x.id, y.id]) expect(await testPrisma.familyInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "WITHDRAWN", slot: id });
  });

  it("founding a family withdraws the founder's PENDING applications", async () => {
    const a = await recruiting();
    const p = await seedApplicant({ wallet: 15_000_000 });
    const x = await apply(p, a.f.id);
    await createFamily({ uid: p, username: "p", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" });
    expect(await testPrisma.familyInvite.findUniqueOrThrow({ where: { id: x.id } })).toMatchObject({ status: "WITHDRAWN", slot: x.id });
    expect(await pending({ familyId: a.f.id })).toBe(0);
  });
});

/** An officer (Capo) seated in a recruiting family; the officer is returned with the family. */
async function withOfficer(o: Parameters<typeof recruiting>[0] = {}) {
  const r = await recruiting(o);
  const capo = await seedEligibleUser();
  await testPrisma.familyMember.create({ data: { familyId: r.f.id, userId: capo, role: "CAPO", roleSlot: "CAPO1", seat: (o.size ?? 1) + 1, joinedAt: daysAgo(10) } });
  await testPrisma.family.update({ where: { id: r.f.id }, data: { memberCount: { increment: 1 } } });
  return { ...r, capo };
}
const row = (id: string) => testPrisma.familyInvite.findUniqueOrThrow({ where: { id } });
const NOT_PENDING = "Application no longer pending.";

describe("accept and decline (amendment 8.5)", () => {
  it("edge 3: two officers accept one application at once → one member row", async () => {
    const { f, boss, capo } = await withOfficer();
    const p = await seedApplicant();
    const a = await apply(p, f.id);
    const r = await Promise.allSettled([acceptApplication(a.id, boss), acceptApplication(a.id, capo)]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR(NOT_PENDING));
    if (r.every((x) => x.status === "rejected")) await acceptApplication(a.id, boss);   // both busy: the retry seats once
    expect(await testPrisma.familyMember.count({ where: { userId: p } })).toBe(1);
    expect(await row(a.id)).toMatchObject({ status: "ACCEPTED", slot: a.id });
  });

  it("edge 4: two families accept the same player at once → one membership, honest refusal text, counts match rows", async () => {
    const A = await withOfficer(); const B = await withOfficer();
    const p = await seedApplicant();
    const [x, y] = [await apply(p, A.f.id), await apply(p, B.f.id)];
    const r = await Promise.allSettled([acceptApplication(x.id, A.boss), acceptApplication(y.id, B.boss)]);
    for (const z of r) if (z.status === "rejected") expect(z.reason.message).toMatch(BUSY_OR(`<@${p}> is already in a family.`));
    expect(await testPrisma.familyMember.count({ where: { userId: p } })).toBe(1);
    const statuses = [(await row(x.id)).status, (await row(y.id)).status].sort();
    expect(statuses.filter((s) => s === "ACCEPTED")).toHaveLength(1);
    expect(statuses.every((s) => ["ACCEPTED", "PENDING", "WITHDRAWN"].includes(s))).toBe(true);
    for (const fam of [A.f, B.f]) {
      const after = await testPrisma.family.findUniqueOrThrow({ where: { id: fam.id } });
      expect(after.memberCount).toBe(await testPrisma.familyMember.count({ where: { familyId: fam.id } }));
    }
  });

  it("edges 5 and 6: a full family and a jailed applicant roll the row back to PENDING", async () => {
    const full = await withOfficer({ size: 9, level: 1 });                // 9 + the Capo = 10 = the L1 cap
    const p = await seedApplicant();
    const a = await seedApplication({ familyId: full.f.id, applicantId: p });
    await expect(acceptApplication(a.id, full.boss)).rejects.toThrow("Family is full.");
    expect(await row(a.id)).toMatchObject({ status: "PENDING", slot: "PENDING" });
    const open = await withOfficer();
    const jailed = await seedApplicant({ jailedUntil: new Date(Date.now() + HOUR) });
    const b = await seedApplication({ familyId: open.f.id, applicantId: jailed });
    await expect(acceptApplication(b.id, open.boss)).rejects.toThrow(/jailed/);
    expect(await row(b.id)).toMatchObject({ status: "PENDING" });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: jailed } })).toBeNull();
  });

  it("stale answers: expired, withdrawn or already answered → 'Application no longer pending.'", async () => {
    const { f, boss } = await withOfficer();
    const p = await seedApplicant();
    const expired = await seedApplication({ familyId: f.id, applicantId: p, expiresAt: new Date(Date.now() - 1_000) });
    await expect(acceptApplication(expired.id, boss)).rejects.toThrow(NOT_PENDING);
    await testPrisma.familyInvite.delete({ where: { id: expired.id } });
    const a = await apply(p, f.id);
    await declineApplication(a.id, boss);
    await expect(acceptApplication(a.id, boss)).rejects.toThrow(NOT_PENDING);
    await expect(declineApplication(a.id, boss)).rejects.toThrow(NOT_PENDING);
    expect(await row(a.id)).toMatchObject({ status: "DECLINED", inviterId: boss });
  });

  it("edge 11: disband with 25 PENDING applications expires them all and DMs each applicant once", async () => {
    const { f, boss, tag } = await withOfficer();
    for (let k = 0; k < 25; k++) await apply(await seedApplicant(), f.id);
    const r = await disbandFamily(boss, tag);
    expect(r.expiredApplications).toHaveLength(25);
    expect(await testPrisma.familyInvite.count({ where: { kind: "APPLICATION", status: "EXPIRED" } })).toBe(25);
    const c = fakeClient();
    await announceDisband(c.client as any, r);
    for (const a of r.expiredApplications) {
      expect(c.dm.get(a.inviteeId)).toBe(1);
      const text = containerText((c.dmLast.get(a.inviteeId) as any).components[0]);
      expect(text).toContain(`**[${tag}] `);
      expect(text).toContain("disbanded, so your application was closed.");
      expect(text).not.toMatch(/expired after|apply again/);
    }
  });

  it("the weekly caps count both kinds", async () => {
    const { f, boss, capo } = await withOfficer();                         // L1: 5 joins per 7 days
    for (let k = 0; k < 4; k++) await seedApplication({ familyId: f.id, applicantId: `9${k}`, status: "ACCEPTED", resolvedAt: daysAgo(1), inviterId: boss });
    await testPrisma.familyInvite.updateMany({ where: { familyId: f.id }, data: { kind: "INVITE" } });
    const [p1, p2] = [await seedApplicant(), await seedApplicant()];
    const [a1, a2] = [await apply(p1, f.id), await apply(p2, f.id)];
    await acceptApplication(a1.id, capo);
    await expect(acceptApplication(a2.id, capo)).rejects.toThrow("Your family can take 5 new members per 7 days.");
    const other = await withOfficer();
    for (let k = 0; k < 3; k++) await seedApplication({ familyId: other.f.id, applicantId: `8${k}`, status: "ACCEPTED", resolvedAt: daysAgo(1), inviterId: other.capo });
    const a3 = await apply(await seedApplicant(), other.f.id);
    await expect(acceptApplication(a3.id, other.capo)).rejects.toThrow("You can bring in 3 members per 7 days.");
  });
});
