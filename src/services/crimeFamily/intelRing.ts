// Pure intel ring rules (spec 8.3): the ring order over filled seats, the
// server-randomised answers, darkness, the leak and one seat's brief. Seat i's
// correct answer is shown only to seat (i + 1) mod n.
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { CAPER_ROLES, caperRole, type CaperRoleKey } from "../../data/crimeFamilyCatalog";
import type { Rng } from "./random";
import type { BriefView } from "./views";

export type CaperAnswers = { order: CaperRoleKey[]; seats: Partial<Record<CaperRoleKey, { options: string[]; correct: number }>> };

const OPTIONS_PER_SEAT = 4;
const ROLE_KEYS = new Set<string>(CAPER_ROLES.map((r) => r.key));

/** The 8.2 role order filtered to the filled seats. */
export function ringOrder(filled: readonly CaperRoleKey[]): CaperRoleKey[] {
  const set = new Set(filled);
  return CAPER_ROLES.map((r) => r.key).filter((k) => set.has(k));
}

/** Per seat in ring order: a Fisher–Yates shuffle of the role's labels, the first 4 kept, then the correct index. */
export function buildAnswers(filled: readonly CaperRoleKey[], rng: Rng): CaperAnswers {
  const order = ringOrder(filled);
  const seats: CaperAnswers["seats"] = {};
  for (const role of order) {
    const labels = [...caperRole(role).labels];
    for (let i = labels.length - 1; i > 0; i--) {
      const j = rng(i + 1);
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
    seats[role] = { options: labels.slice(0, OPTIONS_PER_SEAT), correct: rng(OPTIONS_PER_SEAT) };
  }
  return { order, seats };
}

/** The stored answers, or null when missing or malformed (edge 63). */
export function parseAnswers(json: unknown): CaperAnswers | null {
  if (!json || typeof json !== "object") return null;
  const { order, seats } = json as { order?: unknown; seats?: unknown };
  if (!Array.isArray(order) || order.length === 0 || !seats || typeof seats !== "object") return null;
  const parsed: CaperAnswers = { order: [], seats: {} };
  for (const role of order) {
    if (typeof role !== "string" || !ROLE_KEYS.has(role)) return null;
    const seat = (seats as Record<string, unknown>)[role] as { options?: unknown; correct?: unknown } | undefined;
    if (!seat || !Array.isArray(seat.options) || seat.options.length !== OPTIONS_PER_SEAT) return null;
    if (!seat.options.every((o) => typeof o === "string") || new Set(seat.options).size !== OPTIONS_PER_SEAT) return null;
    if (!Number.isInteger(seat.correct) || (seat.correct as number) < 0 || (seat.correct as number) >= OPTIONS_PER_SEAT) return null;
    const key = role as CaperRoleKey;
    parsed.order.push(key);
    parsed.seats[key] = { options: [...(seat.options as string[])], correct: seat.correct as number };
  }
  return parsed;
}

/** The seats either side of `role` in the ring. */
export function ringNeighbours(order: readonly CaperRoleKey[], role: CaperRoleKey): { prev: CaperRoleKey; next: CaperRoleKey } {
  const i = order.indexOf(role);
  if (i < 0) throw new Error(`Role ${role} is not in the ring`);
  const n = order.length;
  return { prev: order[(i - 1 + n) % n], next: order[(i + 1) % n] };
}

export function leakAtOf(goEndsAt: Date): Date {
  return new Date(goEndsAt.getTime() - CRIME_FAMILY_CONFIG.leakAtSecondsLeft * 1000);
}

/** Dark: the brief was never opened, or first opened at or after leakAt. */
export function isDark(seat: { briefOpened: boolean; briefOpenedAt: Date }, leakAt: Date): boolean {
  return !seat.briefOpened || seat.briefOpenedAt.getTime() >= leakAt.getTime();
}

type BriefSeat = { role: CaperRoleKey; userId: string; briefOpened: boolean; briefOpenedAt: Date; choice: number };

/** One seat's brief: the intel it tells its prev, its own call (answered by next), the leak and darkness. */
export function briefFor(i: { caperId: string; answers: CaperAnswers; role: CaperRoleKey; seats: readonly BriefSeat[]; goEndsAt: Date; now: Date }): BriefView {
  const seatOf = (role: CaperRoleKey): BriefSeat => {
    const seat = i.seats.find((s) => s.role === role);
    if (!seat) throw new Error(`No seat for role ${role}`);
    return seat;
  };
  const answerOf = (role: CaperRoleKey) => {
    const answer = i.answers.seats[role];
    if (!answer) throw new Error(`No answers for role ${role}`);
    return answer;
  };
  const correctLabel = (role: CaperRoleKey) => answerOf(role).options[answerOf(role).correct];

  const { prev, next } = ringNeighbours(i.answers.order, i.role);
  const viewer = seatOf(i.role);
  const leakAt = leakAtOf(i.goEndsAt);
  const leaking = i.now.getTime() >= leakAt.getTime();

  return {
    caperId: i.caperId,
    ownerId: viewer.userId,
    role: i.role,
    tell: { userId: seatOf(prev).userId, label: correctLabel(prev) },
    call: { question: caperRole(i.role).call, options: [...answerOf(i.role).options], fromUserId: seatOf(next).userId },
    leaked: leaking && isDark(seatOf(next), leakAt) ? correctLabel(i.role) : null,
    dark: leaking && isDark(viewer, leakAt),
    lockedIndex: viewer.choice === -1 ? null : viewer.choice,
    goEndsAt: i.goEndsAt,
    leakAt,
  };
}
