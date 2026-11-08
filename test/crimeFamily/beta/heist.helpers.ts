// Beta QA helpers for Crew Heists (internal "caper"): route presses exactly as the
// UI emits them, a money/ledger snapshot, an independent re-implementation of the
// spec 8.5-8.7 settlement math, and the cross-cutting invariants every scenario checks.
import { expect } from "vitest";
import type { Caper, CaperCrew } from "@prisma/client";
import { handleCrimeFamilyInteraction } from "../../../src/handlers/crimeFamilyRouter";
import { CPR_IDS } from "../../../src/ui/crimeFamily/ids";
import { caperTier, type CaperRoleKey } from "../../../src/data/crimeFamilyCatalog";
import { parseAnswers, type CaperAnswers } from "../../../src/services/crimeFamily/intelRing";
import { testPrisma, withCfConfig } from "../../helpers";
import { fakeButton, fakeSelect, said } from "../fakeInteraction";
import { G, CH } from "../caperFixtures";

export { said };

export const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);

export const press = async (i: any) => { await handleCrimeFamilyInteraction(i); return i; };

type Client = unknown;
type Where = { guildId?: string | null; messageId?: string; ephemeralSource?: boolean };

/** The UI's presses, customIds built by CPR_IDS exactly as the cards emit them. */
export const ui = {
  plan: (client: Client, uid: string, tier: string, w: Where = {}) =>
    press(fakeSelect(CPR_IDS.plan(uid), [tier], { userId: uid, guildId: w.guildId === undefined ? G : w.guildId, channelId: CH, client })),
  join: (client: Client, caperId: string, uid: string, role: string, w: Where = {}) =>
    press(fakeSelect(CPR_IDS.join(caperId), [role], { userId: uid, guildId: w.guildId === undefined ? G : w.guildId, messageId: w.messageId, client })),
  leave: (client: Client, caperId: string, uid: string) => press(fakeButton(CPR_IDS.leave(caperId), { userId: uid, guildId: G, client })),
  start: (client: Client, caperId: string, uid: string) => press(fakeButton(CPR_IDS.start(caperId), { userId: uid, guildId: G, client })),
  cancel: (client: Client, caperId: string, uid: string) => press(fakeButton(CPR_IDS.cancel(caperId), { userId: uid, guildId: G, client })),
  brief: (client: Client, caperId: string, uid: string, w: Where = {}) =>
    press(fakeButton(CPR_IDS.brief(caperId), { userId: uid, guildId: w.guildId === undefined ? G : w.guildId, ephemeralSource: w.ephemeralSource, client })),
  share: (client: Client, caperId: string, uid: string) =>
    press(fakeButton(CPR_IDS.share(caperId), { userId: uid, guildId: G, ephemeralSource: true, client })),
  act: (client: Client, caperId: string, uid: string, index: number | string) =>
    press(fakeButton(`cpr:act:${caperId}:${index}`, { userId: uid, guildId: G, ephemeralSource: true, client })),
  raw: (client: Client, customId: string, uid: string, values?: string[]) =>
    press(values ? fakeSelect(customId, values, { userId: uid, guildId: G, client }) : fakeButton(customId, { userId: uid, guildId: G, client })),
};

// ── Money ────────────────────────────────────────────────────────────────────

export type Money = Map<string, { wallet: number; bank: number }>;

export async function money(ids: readonly string[]): Promise<Money> {
  const out: Money = new Map();
  for (const id of ids) {
    const w = await testPrisma.wallet.findUnique({ where: { userId: id } });
    const b = await testPrisma.bank.findUnique({ where: { userId: id } });
    out.set(id, { wallet: w?.balance ?? 0, bank: b?.balance ?? 0 });
  }
  return out;
}

export const liquid = (m: Money, id: string) => (m.get(id)!.wallet + m.get(id)!.bank);

/** Sum of Transaction amounts of `type` on this user's wallet. */
export async function ledgerSum(userId: string, type: string): Promise<number> {
  const w = await testPrisma.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!w) return 0;
  const rows = await testPrisma.transaction.findMany({ where: { walletId: w.id, type } });
  return rows.reduce((s, r) => s + r.amount, 0);
}

export const caperRow = (id: string) => testPrisma.caper.findUniqueOrThrow({ where: { id } });
export const crewOf = (caperId: string) => testPrisma.caperCrew.findMany({ where: { caperId } });
export const answersOf = async (caperId: string): Promise<CaperAnswers> => parseAnswers((await caperRow(caperId)).answers)!;

// ── Independent spec math (8.5-8.7), written from the spec text, not from caperMath ──

export type Expected = {
  outcome: "CLEAN" | "MESSY" | "BUST"; misses: number; pool: number; crewShare: number; vaultCut: number;
  perSeat: Map<string, { cut: number; fine: number; heat: number; passed: boolean }>; xp: number;
};

const LEAK_S = 30;
const isDarkRow = (r: CaperCrew, goEndsAt: Date) => !r.briefOpened || r.briefOpenedAt.getTime() >= goEndsAt.getTime() - LEAK_S * 1000;

export function expectedSettlement(caper: Caper, crew: CaperCrew[]): Expected {
  const tier = caperTier(caper.tier);
  const answers = parseAnswers(caper.answers)!;
  const n = crew.length;
  // Spec 8.5: k counts wrong choices, unlocked seats and dark seats.
  const missed = (r: CaperCrew) => r.choice === -1 || r.choice !== answers.seats[r.role as CaperRoleKey]!.correct || isDarkRow(r, caper.goEndsAt);
  const misses = crew.filter(missed).length;
  const bustAt = n <= 4 ? 2 : 3;
  const q = Math.min(0.6, tier.patrolBase * (1 - caper.edge) + 0.002 * caper.heatSnapshot);
  const outcome = misses >= bustAt ? "BUST" : misses >= 1 ? "MESSY" : caper.roll < q - 1e-9 ? "MESSY" : "CLEAN";
  const pct = { CLEAN: 100, MESSY: 35, BUST: 0 }[outcome];
  const pool = Math.floor((tier.poolPerSeat * n * pct) / 100);
  const crewShare = Math.floor((pool * 80) / 100);
  const vaultCut = Math.floor((pool * 10) / 100);
  const cutPerSeat = Math.floor(crewShare / n);
  const heat = tier.heat[outcome.toLowerCase() as "clean" | "messy" | "bust"];
  const perSeat = new Map<string, { cut: number; fine: number; heat: number; passed: boolean }>();
  for (const r of crew) {
    // Spec 8.6: a seat with no locked choice (unlocked or dark) gets 0.
    const paid = r.choice !== -1 && !isDarkRow(r, caper.goEndsAt);
    perSeat.set(r.userId, {
      cut: paid ? cutPerSeat : 0, fine: outcome === "BUST" ? tier.bustFine : 0, heat,
      passed: r.choice !== -1 && r.choice === answers.seats[r.role as CaperRoleKey]!.correct,
    });
  }
  return { outcome, misses, pool, crewShare, vaultCut, perSeat, xp: tier.xp[outcome.toLowerCase() as "clean" | "messy" | "bust"] };
}

/**
 * Checks a RESOLVED caper against the spec: outcome, pool, every seat's cut/fine,
 * heat, jail, the wallet+bank delta from `before` (taken before the stake), the
 * ledger rows, the vault cut, XP and the members' caper counts.
 */
export async function assertSettledPerSpec(o: {
  caperId: string; before: Money; heatBefore: Map<string, number>; family: { id: string; earnings: number; xp: number };
  capersBefore: Map<string, number>;
}): Promise<Expected> {
  const caper = await caperRow(o.caperId);
  expect(caper.status).toBe("RESOLVED");
  const crew = await crewOf(o.caperId);
  const tier = caperTier(caper.tier);
  const exp = expectedSettlement(caper, crew);
  expect(caper.outcome).toBe(exp.outcome);
  expect(caper.pool).toBe(exp.pool);
  expect(caper.crewShare).toBe(exp.crewShare);
  const after = await money(crew.map((r) => r.userId));
  for (const r of crew) {
    const e = exp.perSeat.get(r.userId)!;
    expect({ role: r.role, cut: r.cut, fine: r.fine, settled: r.settled, liveSlot: r.liveSlot, passed: r.passed })
      .toEqual({ role: r.role, cut: e.cut, fine: e.fine, settled: true, liveSlot: o.caperId, passed: e.passed });
    expect(liquid(after, r.userId) - liquid(o.before, r.userId)).toBe(-r.stake + e.cut - e.fine);
    const user = await testPrisma.user.findUniqueOrThrow({ where: { discordId: r.userId } });
    expect(user.crimeHeat - (o.heatBefore.get(r.userId) ?? 0)).toBe(e.heat);
    if (r.jailed) {
      expect(exp.outcome).toBe("BUST");
      expect(tier.jail).not.toBeNull();
      expect(user.isJailed).toBe(true);
    }
    if (exp.outcome !== "BUST" || !tier.jail) expect(r.jailed).toBe(false);
    expect(await ledgerSum(r.userId, "caper_cut")).toBe(e.cut);
  }
  const fam = await testPrisma.family.findUniqueOrThrow({ where: { id: o.family.id } });
  expect(fam.earnings - o.family.earnings).toBe(exp.vaultCut);
  expect(fam.xp - o.family.xp).toBe(exp.xp);
  for (const r of crew) {
    const m = await testPrisma.familyMember.findUnique({ where: { userId: r.userId } });
    if (m) expect(m.capers - (o.capersBefore.get(r.userId) ?? 0)).toBe(1);
  }
  // Mint audit (11.4): crew cuts plus the vault cut never exceed 90% of the pool.
  const minted = crew.reduce((s, r) => s + r.cut, 0) + exp.vaultCut;
  expect(minted).toBeLessThanOrEqual(Math.floor(exp.pool * 0.9));
  return exp;
}

// ── Invariants ──────────────────────────────────────────────────────────────

/**
 * Cross-cutting invariants for every scenario: one live caper per family, one
 * live seat per user, memberCount == member rows, no negative wallet, every
 * LIVE seat's caper is live, every RESOLVED caper's seats settled and moved off
 * LIVE, every CANCELLED caper's seats refunded, every started seat belongs to a
 * started caper, and every user in at most one family.
 */
export async function assertInvariants(): Promise<void> {
  const capers = await testPrisma.caper.findMany({});
  const crew = await testPrisma.caperCrew.findMany({});
  const live = capers.filter((c) => c.liveSlot === "LIVE");
  const perFamily = new Map<string, number>();
  for (const c of live) perFamily.set(c.familyId, (perFamily.get(c.familyId) ?? 0) + 1);
  for (const [fid, count] of perFamily) expect({ fid, count }).toEqual({ fid, count: 1 });
  for (const c of live) expect(["LOBBY", "RUNNING", "SETTLING"]).toContain(c.status);
  for (const c of capers.filter((x) => x.liveSlot !== "LIVE")) expect(c.liveSlot).toBe(c.id);

  const liveSeats = crew.filter((r) => r.liveSlot === "LIVE");
  const perUser = new Map<string, number>();
  for (const r of liveSeats) perUser.set(r.userId, (perUser.get(r.userId) ?? 0) + 1);
  for (const [uid, count] of perUser) expect({ uid, count }).toEqual({ uid, count: 1 });
  const byId = new Map(capers.map((c) => [c.id, c]));
  for (const r of liveSeats) expect(byId.get(r.caperId)?.liveSlot).toBe("LIVE");

  for (const c of capers) {
    const rows = crew.filter((r) => r.caperId === c.id);
    if (c.status === "RESOLVED") for (const r of rows) expect({ settled: r.settled, slot: r.liveSlot, started: r.started }).toEqual({ settled: true, slot: c.id, started: true });
    if (c.status === "CANCELLED") for (const r of rows) expect({ refunded: r.refunded, slot: r.liveSlot, started: r.started }).toEqual({ refunded: true, slot: c.id, started: false });
    if (c.status === "LOBBY") for (const r of rows) expect(r.started).toBe(false);
    if (c.status === "RUNNING" || c.status === "SETTLING") {
      for (const r of rows) {
        expect(r.started).toBe(true);
        // A running crew is locked in: nobody can leave or be kicked, so every seat is a current member.
        const m = await testPrisma.familyMember.findUnique({ where: { userId: r.userId }, select: { familyId: true } });
        expect({ seat: r.userId, familyId: m?.familyId }).toEqual({ seat: r.userId, familyId: c.familyId });
      }
    }
    // Role and user uniqueness per caper.
    expect(new Set(rows.map((r) => r.role)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.userId)).size).toBe(rows.length);
    if (rows.length > 0 && c.status !== "CANCELLED") expect(rows.length).toBeLessThanOrEqual(caperTier(c.tier).crewMax);
  }

  const families = await testPrisma.family.findMany({});
  for (const f of families) {
    const members = await testPrisma.familyMember.count({ where: { familyId: f.id } });
    expect({ family: f.id, memberCount: f.memberCount }).toEqual({ family: f.id, memberCount: members });
  }
  const members = await testPrisma.familyMember.findMany({ select: { userId: true } });
  expect(new Set(members.map((m) => m.userId)).size).toBe(members.length);
  const negative = await testPrisma.wallet.count({ where: { balance: { lt: 0 } } });
  expect(negative).toBe(0);
}

/** The ids every caper DM, card or GO call payload holds, for worst-case rendering checks. */
export function componentCount(payload: any): number {
  const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? count(n.accessory) : 0);
  const comps = (payload.components ?? []).map((c: any) => (typeof c.toJSON === "function" ? c.toJSON() : c));
  return comps.reduce((s: number, c: any) => s + count(c), 0);
}

export function visibleChars(payload: any): number {
  const chars = (n: any): number => (typeof n.content === "string" ? n.content.length : 0)
    + (n.components ?? []).reduce((s: number, c: any) => s + chars(c), 0) + (n.accessory ? chars(n.accessory) : 0);
  const comps = (payload.components ?? []).map((c: any) => (typeof c.toJSON === "function" ? c.toJSON() : c));
  return comps.reduce((s: number, c: any) => s + chars(c), 0);
}

export function customIds(payload: any): string[] {
  const out: string[] = [];
  const walk = (n: any) => { if (n.custom_id) out.push(n.custom_id); (n.components ?? []).forEach(walk); if (n.accessory) walk(n.accessory); };
  (payload.components ?? []).map((c: any) => (typeof c.toJSON === "function" ? c.toJSON() : c)).forEach(walk);
  return out;
}

/** Discord's ComponentsV2 limits every payload must meet: 40 components, 4000 visible characters, customIds ≤ 100. */
export function assertRenderable(label: string, payload: any): void {
  expect({ label, components: componentCount(payload) <= 40 }).toEqual({ label, components: true });
  expect({ label, chars: visibleChars(payload) <= 4000 }).toEqual({ label, chars: true });
  for (const id of customIds(payload)) expect({ label, id, ok: id.length <= 100 }).toEqual({ label, id, ok: true });
}

export const ROLES_FOR = (tier: 1 | 2 | 3 | 4, n: number): CaperRoleKey[] => {
  const t = caperTier(tier);
  const all: CaperRoleKey[] = [...t.required, t.optional];
  return all.slice(0, n);
};
