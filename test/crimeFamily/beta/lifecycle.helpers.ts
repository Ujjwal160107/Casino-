// Beta QA helpers for the family lifecycle suite (LIFE): invariant checks
// over every family, money snapshots and small time/actor shortcuts.
import { expect } from "vitest";
import { CAPO_SLOTS, levelDef } from "../../../src/data/crimeFamilyCatalog";
import { createFamily } from "../../../src/services/crimeFamily/familyService";
import { inviteMember, acceptInvite } from "../../../src/services/crimeFamily/membershipService";
import { testPrisma, seedEligibleUser } from "../../helpers";

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

export const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))?.balance ?? 0;

/** Sum of every wallet in the test DB plus every family's vault. */
export async function moneySnapshot(): Promise<{ wallets: number; vaults: number; total: number }> {
  const wallets = (await testPrisma.wallet.findMany({ select: { balance: true } })).reduce((s, w) => s + w.balance, 0);
  const vaults = (await testPrisma.family.findMany({ select: { treasury: true, earnings: true } })).reduce((s, f) => s + f.treasury + f.earnings, 0);
  return { wallets, vaults, total: wallets + vaults };
}

export const found = (uid: string, name: string, tag: string, now?: Date) =>
  createFamily({ uid, username: "u", name, tag, guildId: "g1", channelId: "c1", now });

export const invite = (inviterId: string, inviteeId: string, now?: Date) =>
  inviteMember({ inviterId, inviteeId, guildId: "g1", channelId: "c1", now });

/** A player who passes family_join (and holds `wallet`, default 2,000,000). */
export const recruit = (walletAmt = 2_000_000) => seedEligibleUser({ wallet: walletAmt });

/** inviter invites a fresh recruit who accepts at `now`. Returns the recruit's id. */
export async function bringIn(inviterId: string, now?: Date, walletAmt?: number): Promise<string> {
  const u = await recruit(walletAmt);
  const inv = await invite(inviterId, u, now);
  await acceptInvite(inv.id, u, now);
  return u;
}

/**
 * The structural invariants every scenario must leave behind:
 * - memberCount == member rows, rows ≤ the level's cap;
 * - one BOSS per family, and it is Family.bossId with roleSlot BOSS;
 * - at most one UNDERBOSS, Capos only in CAPO1..CAPO6, Soldiers' roleSlot == userId;
 * - seats unique and within 1..memberCap; roleSlots unique;
 * - no player in two families (FamilyMember.userId unique), no member row without a family;
 * - no negative wallet, no negative vault bucket.
 */
export async function assertFamilyInvariants(): Promise<void> {
  const families = await testPrisma.family.findMany();
  const members = await testPrisma.familyMember.findMany();
  const famIds = new Set(families.map((f) => f.id));
  for (const m of members) expect(famIds.has(m.familyId), `orphan member row ${m.userId}`).toBe(true);
  const users = members.map((m) => m.userId);
  expect(new Set(users).size, "a player is in two families").toBe(users.length);
  for (const f of families) {
    const rows = members.filter((m) => m.familyId === f.id);
    expect(f.memberCount, `memberCount drift in ${f.tag}`).toBe(rows.length);
    expect(rows.length, `over cap in ${f.tag}`).toBeLessThanOrEqual(levelDef(f.level).memberCap);
    const bosses = rows.filter((m) => m.role === "BOSS");
    expect(bosses.map((b) => b.userId), `boss of ${f.tag}`).toEqual([f.bossId]);
    expect(bosses[0].roleSlot).toBe("BOSS");
    expect(rows.filter((m) => m.role === "UNDERBOSS").length).toBeLessThanOrEqual(1);
    for (const m of rows) {
      if (m.role === "UNDERBOSS") expect(m.roleSlot).toBe("UNDERBOSS");
      if (m.role === "CAPO") expect(CAPO_SLOTS as readonly string[]).toContain(m.roleSlot);
      if (m.role === "SOLDIER") expect(m.roleSlot).toBe(m.userId);
      expect(m.seat).toBeGreaterThanOrEqual(1);
      expect(m.seat).toBeLessThanOrEqual(levelDef(f.level).memberCap);
    }
    expect(new Set(rows.map((m) => m.seat)).size, `seat clash in ${f.tag}`).toBe(rows.length);
    expect(new Set(rows.map((m) => m.roleSlot)).size, `roleSlot clash in ${f.tag}`).toBe(rows.length);
    expect(f.treasury).toBeGreaterThanOrEqual(0);
    expect(f.earnings).toBeGreaterThanOrEqual(0);
  }
  const negative = await testPrisma.wallet.count({ where: { balance: { lt: 0 } } });
  expect(negative, "negative wallet").toBe(0);
}

/** The settled message of every rejected promise. */
export const rejections = (rs: PromiseSettledResult<unknown>[]) =>
  rs.flatMap((r) => (r.status === "rejected" ? [String((r.reason as Error)?.message ?? r.reason)] : []));
export const fulfilled = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === "fulfilled").length;
