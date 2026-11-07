// Caper test fixtures: a seated crew, a seeded lobby or run (direct writes, no
// wallet debit), a scripted RNG, scoped Transaction counts and a fake Discord client.
import type { Caper, Family } from "@prisma/client";
import { vi } from "vitest";
import { PermissionFlagsBits, type Client } from "discord.js";
import { caperRole, caperTier, type CaperRoleKey } from "../../src/data/crimeFamilyCatalog";
import { buildAnswers, type CaperAnswers } from "../../src/services/crimeFamily/intelRing";
import type { Rng } from "../../src/services/crimeFamily/random";
import { testPrisma, seedEligibleUser, seedFamily, daysAgo } from "../helpers";
import { fakeDmClient } from "../dm/helpers";
import { fakeRest } from "./fakeClient";

export const G = "g1";
export const CH = "c1";

type Tier = 1 | 2 | 3 | 4;
type Ids = Record<CaperRoleKey, string>;

/** Returns values[i] % max in order; throws once the script runs out. */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  return (max) => {
    if (i >= values.length) throw new Error("rng exhausted");
    return values[i++] % max;
  };
}

/** Transaction rows of `type` on these users' wallets only (resetFamilies keeps Transaction rows). */
export async function txCount(type: string, userIds: readonly string[]): Promise<number> {
  const wallets = await testPrisma.wallet.findMany({ where: { userId: { in: [...userIds] } }, select: { id: true } });
  return testPrisma.transaction.count({ where: { type, walletId: { in: wallets.map((w) => w.id) } } });
}

/** A raw write: Prisma stamps @updatedAt itself on every update. */
export async function setCaperUpdatedAt(caperId: string, at: Date): Promise<void> {
  await testPrisma.$runCommandRaw({
    update: "Caper",
    updates: [{ q: { _id: { $oid: caperId } }, u: { $set: { updatedAt: { $date: at.toISOString() } } } }],
  });
}

/**
 * One eligible user per role, each owning the role's first prep item; the
 * Mastermind is the Boss, or a Capo under a separate unseated Boss (same
 * wallet, no prep item). Everyone else is a Soldier. The family is off its caper cooldown.
 */
export async function caperCrew(o: {
  tier?: Tier; roles: CaperRoleKey[]; plannerRank?: "BOSS" | "CAPO"; plannerId?: string; wallet?: number; joinedDaysAgo?: number;
}): Promise<{ family: Family; bossId: string; ids: Ids }> {
  const tier = caperTier(o.tier ?? 1);
  const wallet = o.wallet ?? tier.seatGate.netWorth + 1_000_000;
  const joinedAt = daysAgo(o.joinedDaysAgo ?? 10);
  const ids = {} as Ids;
  for (const role of o.roles) {
    ids[role] = await seedEligibleUser({
      ...(role === "MASTERMIND" && o.plannerId ? { id: o.plannerId } : {}),
      wallet, prepKeys: [caperRole(role).prepKeys[0]],
    });
  }
  const capoPlanner = (o.plannerRank ?? "BOSS") === "CAPO";
  const bossId = capoPlanner ? await seedEligibleUser({ wallet }) : ids.MASTERMIND;
  const members = o.roles
    .filter((role) => ids[role] !== bossId)
    .map((role) => ({ userId: ids[role], role: role === "MASTERMIND" ? ("CAPO" as const) : ("SOLDIER" as const), joinedAt }));
  const seeded = await seedFamily({ bossId, level: tier.levelToPlan, homeGuildId: G, homeChannelId: CH, members });
  // nextCaperAt defaults to the insert time, after a `now` the test took before seeding: start the family off cooldown.
  const family = await testPrisma.family.update({ where: { id: seeded.id }, data: { nextCaperAt: daysAgo(1) } });
  return { family, bossId, ids };
}

/** A LOBBY caper with one unstarted seat per role (stake recorded, no wallet debit). */
export async function seedLobby(o: {
  tier?: Tier; roles: CaperRoleKey[]; plannerRank?: "BOSS" | "CAPO"; now?: Date;
}): Promise<{ caper: Caper; family: Family; bossId: string; ids: Ids }> {
  const tier = caperTier(o.tier ?? 1);
  const now = o.now ?? new Date();
  const { family, bossId, ids } = await caperCrew({ tier: tier.tier, roles: o.roles, plannerRank: o.plannerRank });
  const caper = await testPrisma.caper.create({
    data: {
      familyId: family.id, tier: tier.tier, status: "LOBBY", liveSlot: "LIVE", plannerId: ids.MASTERMIND, guildId: G, channelId: CH,
      lobbyClosesAt: new Date(now.getTime() + 600_000),
    },
  });
  for (const role of o.roles) {
    await testPrisma.caperCrew.create({ data: { caperId: caper.id, familyId: family.id, userId: ids[role], role, stake: tier.stake } });
  }
  return { caper, family, bossId, ids };
}

/**
 * A RUNNING (or SETTLING) caper: wallets default to 0 (stakes were paid at
 * join), answers from a fixed script, every seat started and opened (except
 * `dark`), each choice right, wrong or none.
 */
export async function seedRunning(o: {
  tier?: Tier; roles: CaperRoleKey[]; picks?: Partial<Record<CaperRoleKey, "right" | "wrong" | "none">>; dark?: CaperRoleKey[];
  shared?: CaperRoleKey[]; startedAt?: Date; goEndsAt?: Date; edge?: number; heatSnapshot?: number; status?: "RUNNING" | "SETTLING"; wallet?: number;
}): Promise<{ caper: Caper; family: Family; bossId: string; ids: Ids; answers: CaperAnswers }> {
  const tier = caperTier(o.tier ?? 1);
  const startedAt = o.startedAt ?? new Date(Date.now() - 60_000);
  const goEndsAt = o.goEndsAt ?? new Date(startedAt.getTime() + 120_000);
  const { family, bossId, ids } = await caperCrew({ tier: tier.tier, roles: o.roles, wallet: o.wallet ?? 0 });
  const answers = buildAnswers(o.roles, scriptedRng(Array.from({ length: 100 }, (_, i) => i)));
  const caper = await testPrisma.caper.create({
    data: {
      familyId: family.id, tier: tier.tier, status: o.status ?? "RUNNING", liveSlot: "LIVE", plannerId: ids.MASTERMIND, guildId: G, channelId: CH,
      lobbyClosesAt: startedAt, startedAt, goEndsAt, answers, edge: o.edge ?? 0, heatSnapshot: o.heatSnapshot ?? 0,
    },
  });
  const dark = new Set(o.dark ?? []);
  const shared = new Set(o.shared ?? []);
  for (const role of o.roles) {
    const correct = answers.seats[role]!.correct;
    const pick = o.picks?.[role] ?? "right";
    const choice = pick === "right" ? correct : pick === "wrong" ? (correct + 1) % 4 : -1;
    await testPrisma.caperCrew.create({
      data: {
        caperId: caper.id, familyId: family.id, userId: ids[role], role, stake: tier.stake, started: true, startedAt,
        briefOpened: !dark.has(role), briefOpenedAt: new Date(startedAt.getTime() + 1_000), choice,
        ...(shared.has(role) ? { sharedIntel: true, sharedAt: new Date(startedAt.getTime() + 2_000) } : {}),
      },
    });
  }
  return { caper, family, bossId, ids, answers };
}

export type BotPerm = "ViewChannel" | "SendMessages" | "ReadMessageHistory" | "AttachFiles";

/**
 * No family code reads guild membership (amendment 5.2): the guild cache holds only
 * `{ id: G, name }` for the trade log. `lastDm` is each user's last DM payload.
 */
export function fakeCaperClient(o: { missingPerms?: Record<string, BotPerm[]> } = {}) {
  const dm = fakeDmClient();
  const sent: { channelId: string; payload: any }[] = [];
  const edits: { channelId: string; messageId: string; payload: any }[] = [];
  const editFailures: unknown[] = [];   // each edit call shifts one: a present value is thrown instead of editing
  const sendFailures: unknown[] = [];   // same for send
  let n = 0;
  // The cached channel: only pickLobbyChannel reads it (guild and permissions); posts and edits go through `rest`.
  const make = (id: string) => {
    const missing = (o.missingPerms?.[id] ?? []).map((k) => PermissionFlagsBits[k]);   // bigints, the contract in Task 12
    return { id, guildId: G, isTextBased: () => true, permissionsFor: (_botId: string) => ({ has: (p: bigint) => !missing.includes(p) }) };
  };
  const channels = new Map<string, ReturnType<typeof make>>();
  const channel = (id: string) => { if (!channels.has(id)) channels.set(id, make(id)); return channels.get(id)!; };
  const rest = fakeRest({
    send: async (channelId, payload) => {
      const f = sendFailures.shift(); if (f) throw f;
      const m = { id: `m${++n}` }; sent.push({ channelId, payload }); return m;
    },
    edit: async (channelId, messageId, payload) => {
      const f = editFailures.shift(); if (f) throw f;
      edits.push({ channelId, messageId, payload }); return { id: messageId };
    },
  });
  const client = {
    user: { id: "bot" },
    options: {},
    rest,
    channels: { fetch: vi.fn(async (id: string) => channel(id)) },
    users: (dm.client as any).users,
    guilds: { cache: new Map([[G, { id: G, name: "Guild" }]]) },
  } as unknown as Client;
  return { client, channel, rest, sent, edits, editFailures, sendFailures, dms: dm.sent, lastDm: dm.last };
}
