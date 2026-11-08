import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { disbandFamily, previewDisband } from "../../src/services/crimeFamily/disbandService";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { acceptInvite, expireInvites } from "../../src/services/crimeFamily/membershipService";
import { depositToVault, creditEarnings } from "../../src/services/crimeFamily/vaultService";
import { FAMILY_HOOKS, ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { VaultBusy } from "../../src/services/crimeFamily/tx";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const burnRow = (familyId: string) => testPrisma.familyLedger.findFirst({ where: { familyId, type: "disband_burn" } });
const active = new Set<string>();
const rule = { key: "test", label: "test seats", need: 2, count: async (uid: string) => (active.has(uid) ? 2 : 0) };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(async () => { await resetFamilies(); active.clear(); ACTIVITY_RULES.push(rule); });
afterEach(() => { ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(rule), 1); });

async function disbandFam(o: { earnings: number; treasury: number; lastPaydayAt: Date }) {
  const bossId = await seedEligibleUser(); const s = await seedEligibleUser();
  active.add(bossId); active.add(s);
  const family = await seedFamily({ bossId, name: "Velvet Ante", tag: "VLA", ...o, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { family, bossId, s };
}

describe("disband (6.4)", () => {
  it("is Boss-only and needs the tag (trimmed, any case)", async () => {
    const bossId = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId, tag: "VLA", members: [{ userId: ub, role: "UNDERBOSS" }] });
    await expect(disbandFamily(ub, "VLA")).rejects.toThrow("Only the Boss can disband the family.");
    await expect(disbandFamily(bossId, "VLB")).rejects.toThrow("Type the tag exactly: VLA");
    expect(await testPrisma.family.count()).toBe(1);
    await expect(disbandFamily(bossId, " vla ")).resolves.toMatchObject({ family: { id: f.id } });
  });

  it("pays a final payday when 7 days have passed, without the 500,000 minimum, then burns the rest", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 300_000, treasury: 2_000_000, lastPaydayAt: daysAgo(8) });
    expect(await previewDisband(family.id)).toMatchObject({ finalPayday: { split: { gross: 150_000, tax: 7_500, net: 142_500 } }, burnTreasury: 2_000_000, burnEarnings: 0 });
    const r = await disbandFamily(bossId, "VLA");
    expect(r).toMatchObject({ split: { gross: 150_000, tax: 7_500, net: 142_500 }, burned: 2_000_000 });
    for (const id of [bossId, s]) expect(await wallet(id)).toBe(142_500);
    expect(await burnRow(family.id)).toMatchObject({ amount: -2_000_000 });
  });

  it("burns everything when the last payday was under 7 days ago (D61)", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 300_000, treasury: 2_000_000, lastPaydayAt: daysAgo(6) });
    expect(await previewDisband(family.id)).toMatchObject({ finalPayday: null, burnTreasury: 2_000_000, burnEarnings: 300_000 });
    expect(await disbandFamily(bossId, "VLA")).toMatchObject({ split: null, paid: [], burned: 2_300_000 });
    expect([await wallet(bossId), await wallet(s)]).toEqual([0, 0]);
    expect(await burnRow(family.id)).toMatchObject({ amount: -2_300_000 });
  });

  it("a due final payday with a gross of 0 is no final payday: no payday rows, no paid members", async () => {
    const { family, bossId } = await disbandFam({ earnings: 1, treasury: 500, lastPaydayAt: daysAgo(8) });
    expect(await previewDisband(family.id)).toMatchObject({ finalPayday: null, burnTreasury: 500, burnEarnings: 1 });
    expect(await disbandFamily(bossId, "VLA")).toMatchObject({ split: null, paid: [], burned: 501 });
    expect(await testPrisma.familyLedger.count({ where: { familyId: family.id, type: { in: ["payday", "payday_tax"] } } })).toBe(0);
  });

  it("writes DISBANDED exits (wasBoss for the Boss), closes invites, deletes members and frees the name and tag", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 0, treasury: 0, lastPaydayAt: daysAgo(1) });
    const x = await seedEligibleUser({ wallet: 2_000_000 });
    const inv = await testPrisma.familyInvite.create({ data: { familyId: family.id, inviterId: bossId, inviteeId: x, guildId: "g1", channelId: "c1", expiresAt: new Date(Date.now() + 864e5) } });
    const r = await disbandFamily(bossId, "VLA");
    expect([...r.formerMembers].sort()).toEqual([bossId, s].sort());
    const exits = await testPrisma.familyExit.findMany({ where: { familyId: family.id } });
    expect(Object.fromEntries(exits.map((e) => [e.userId, [e.reason, e.wasBoss]]))).toEqual({ [bossId]: ["DISBANDED", true], [s]: ["DISBANDED", false] });
    await expect(acceptInvite(inv.id, x)).rejects.toThrow("Invite expired.");
    expect((await expireInvites(new Date())).map((i) => i.id)).toEqual([inv.id]);   // the sweeper closes it, and its card, like any expiry
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id } })).toBe(0);
    expect(await testPrisma.family.count()).toBe(0);
    expect(await testPrisma.audit.count({ where: { userId: bossId, type: "family_disband" } })).toBe(1);
    const founder = await seedEligibleUser({ wallet: 15_000_000 });
    await expect(createFamily({ uid: founder, username: "f", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" })).resolves.toMatchObject({ tagKey: "VLA" });
  });

  it("re-checks hook blocks on every attempt and runs onDisband before the final payday", async () => {
    const { family, bossId } = await disbandFam({ earnings: 0, treasury: 0, lastPaydayAt: daysAgo(8) });
    FAMILY_HOOKS.push({ key: "block", disbandBlock: async () => "A crew heist is in its lobby." });
    try { await expect(disbandFamily(bossId, "VLA")).rejects.toThrow("A crew heist is in its lobby."); } finally { FAMILY_HOOKS.pop(); }
    let calls = 0;
    FAMILY_HOOKS.push({ key: "flip", disbandBlock: async () => { if (++calls === 1) throw new VaultBusy(); return "A crew heist is in its lobby."; } });
    try { await expect(disbandFamily(bossId, "VLA")).rejects.toThrow("A crew heist is in its lobby."); } finally { FAMILY_HOOKS.pop(); }
    expect(calls).toBe(2);
    expect(await testPrisma.family.count()).toBe(1);
    FAMILY_HOOKS.push({
      key: "refund",
      disbandPreview: async () => ({ returnedToEarnings: 1_000_000 }),
      onDisband: (tx, c) => creditEarnings(tx, c.familyId, 1_000_000, "bid_refund", "system", {}).then(() => undefined),
    });
    try {
      expect((await previewDisband(family.id)).finalPayday?.split).toEqual({ gross: 500_000, tax: 25_000, net: 475_000 });
      expect((await disbandFamily(bossId, "VLA")).split).toEqual({ gross: 500_000, tax: 25_000, net: 475_000 });
    } finally { FAMILY_HOOKS.pop(); }
  });

  it("a disband racing a deposit: the disband commits; a deposit that won is burned, one that lost charges nothing", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 0, treasury: 500_000, lastPaydayAt: daysAgo(1) });
    await testPrisma.wallet.update({ where: { userId: s }, data: { balance: 2_000_000 } });
    const [d, dep] = await Promise.allSettled([disbandFamily(bossId, "VLA"), depositToVault(s, 1_000_000)]);
    expect(d.status).toBe("fulfilled");
    expect(await testPrisma.family.count()).toBe(0);
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id } })).toBe(0);
    if (dep.status === "fulfilled") {
      expect((await burnRow(family.id))!.amount).toBe(-(500_000 + 950_000));
      expect(await wallet(s)).toBe(1_000_000);
    } else {
      expect(dep.reason.message).toMatch(/not in a crime family|Vault busy, try again\./);
      expect(await wallet(s)).toBe(2_000_000);
      expect((await burnRow(family.id))!.amount).toBe(-500_000);
    }
  });
});
