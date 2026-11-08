// Shared harness for governance-ui.beta.test.ts: router presses as a real
// player would make them (customIds exactly as the UI emits them), payload
// layout checks against Discord's limits, and the family invariants checked
// after every multi-player scenario.
import { expect, vi } from "vitest";
import { ComponentType } from "discord.js";
import { handleCrimeFamilyInteraction } from "../../../src/handlers/crimeFamilyRouter";
import { fakeButton, fakeModal, fakeSelect, type FakeOpts } from "../fakeInteraction";
import { testPrisma, seedEligibleUser, seedFamily, daysAgo, withCfConfig } from "../../helpers";
import type { FamilyRole } from "../../../src/data/crimeFamilyCatalog";

type Opts = Omit<FakeOpts, "userId">;

async function run<T>(i: T): Promise<T> {
  await withCfConfig({ enabled: true }, () => handleCrimeFamilyInteraction(i as any));
  return i;
}

/** A button press through the real router (ephemeral source unless the opts say otherwise). */
export const press = (customId: string, userId: string, o: Opts = {}) => run(fakeButton(customId, { userId, ephemeralSource: true, ...o }));
/** A modal submit through the real router. */
export const submit = (customId: string, fields: Record<string, string>, userId: string, o: Opts = {}) => run(fakeModal(customId, fields, { userId, ...o }));
/** A select pick through the real router. */
export const pick = (customId: string, values: string[], userId: string, o: Opts = {}) => run(fakeSelect(customId, values, { userId, ephemeralSource: true, ...o }));

/** The last screen a route rendered (editReply payload). */
export function lastScreen(i: any): any {
  const calls = i.editReply.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : undefined;
}

const toJson = (c: any) => (typeof c?.toJSON === "function" ? c.toJSON() : c);

function visit(n: any, f: (x: any) => void): void {
  if (!n || typeof n !== "object") return;
  f(n);
  for (const c of n.components ?? []) visit(c, f);
  if (n.accessory) visit(n.accessory, f);
}

/** Discord's numbers for a ComponentsV2 payload: components (accessories count), visible characters, every customId. */
export function layoutOf(payload: any): { components: number; chars: number; ids: string[]; texts: string[] } {
  const json = (payload.components ?? []).map(toJson);
  let components = 0; let chars = 0; const ids: string[] = []; const texts: string[] = [];
  for (const root of json) {
    visit(root, (n) => {
      components++;
      if (typeof n.content === "string") { chars += n.content.length; texts.push(n.content); }
      if (n.custom_id) ids.push(n.custom_id);
      if (n.type === ComponentType.StringSelect) for (const o of n.options ?? []) if (o.value) expect(o.value.length).toBeLessThanOrEqual(100);
    });
  }
  return { components, chars, ids, texts };
}

/** ≤ 40 components, ≤ 4000 characters, customIds ≤ 100 and unique, never a ping. */
export function expectFits(payload: any, label: string): void {
  const l = layoutOf(payload);
  expect(l.components, `${label}: components`).toBeLessThanOrEqual(40);
  expect(l.chars, `${label}: characters`).toBeLessThanOrEqual(4000);
  for (const id of l.ids) expect(id.length, `${label}: ${id}`).toBeLessThanOrEqual(100);
  expect(new Set(l.ids).size, `${label}: duplicate customIds`).toBe(l.ids.length);
  const mentions = payload.allowedMentions ?? payload.allowed_mentions;
  expect(mentions?.parse, `${label}: allowedMentions`).toEqual([]);
}

/** Boss + `roles` (in order) + Soldiers up to `size`, all joined 10 days ago and active now. */
export async function governanceFamily(o: { size: number; roles?: FamilyRole[]; level?: number; tag?: string; bossSince?: Date; data?: Record<string, unknown>; wallet?: number }) {
  const boss = await seedEligibleUser({ wallet: o.wallet ?? 0 });
  const ids: string[] = [];
  for (let k = 0; k < o.size - 1; k++) ids.push(await seedEligibleUser({ wallet: o.wallet ?? 0 }));
  const f = await seedFamily({
    bossId: boss, level: o.level ?? 10, tag: o.tag, bossSince: o.bossSince, data: o.data as any,
    members: ids.map((userId, k) => ({ userId, role: o.roles?.[k] ?? "SOLDIER", joinedAt: daysAgo(10) })),
  });
  return { f, boss, ids };
}

/**
 * The membership and vote invariants of every family in the DB: memberCount
 * matches the rows, exactly one BOSS row and it is Family.bossId, unique seats
 * and role slots, at most one OPEN vote, ballots only from the snapshot and at
 * most one per voter, and no ballot by the targeted Boss.
 */
export async function expectFamilyInvariants(): Promise<void> {
  for (const f of await testPrisma.family.findMany()) {
    const members = await testPrisma.familyMember.findMany({ where: { familyId: f.id } });
    expect(f.memberCount, `[${f.tag}] memberCount`).toBe(members.length);
    expect(members.filter((m) => m.role === "BOSS").map((m) => m.userId), `[${f.tag}] boss`).toEqual([f.bossId]);
    expect(new Set(members.map((m) => m.seat)).size, `[${f.tag}] seats`).toBe(members.length);
    expect(new Set(members.map((m) => m.roleSlot)).size, `[${f.tag}] role slots`).toBe(members.length);
    const votes = await testPrisma.familyVote.findMany({ where: { familyId: f.id } });
    expect(votes.filter((v) => v.status === "OPEN").length, `[${f.tag}] open votes`).toBeLessThanOrEqual(1);
    for (const v of votes) {
      const ballots = await testPrisma.familyBallot.findMany({ where: { voteId: v.id } });
      expect(new Set(ballots.map((b) => b.userId)).size).toBe(ballots.length);
      for (const b of ballots) {
        expect(v.eligibleIds, `[${f.tag}] ballot outside the snapshot`).toContain(b.userId);
        expect(b.userId).not.toBe(v.bossId);
      }
    }
  }
}

/** Silences and counts console.error for the duration of fn. */
export async function countErrors(fn: () => Promise<unknown>): Promise<number> {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}
