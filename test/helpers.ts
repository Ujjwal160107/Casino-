import Redis from "ioredis";
import { PrismaClient, Prisma, User, Family, FamilyInvite, FamilyVote, Racket, TurfCity, War, WarContribution } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../src/utils/economyConfig";
import { CAPO_SLOTS, LEAGUE_RACKET_INCOME, RACKETS, RACKET_CLASSES, type FamilyRole, type LeagueKey } from "../src/data/crimeFamilyCatalog";
import { baselineScores, warWindow, type RacketClass, type ScoreField, type WarSide } from "../src/services/crimeFamily/warMath";
import type { WarBoardRef } from "../src/services/crimeFamily/views";

let _redis: Redis | null = null;
export function testRedis(): Redis {
  if (!_redis) _redis = new Redis(process.env.TEST_REDIS_URL!);
  return _redis;
}

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL! } },
});

export async function seedUser(
  discordId: string,
  overrides: Partial<Prisma.UserCreateInput> = {}
): Promise<User> {
  await resetUser(discordId);
  return testPrisma.user.create({
    data: {
      discordId,
      username: "TestUser",
      wallet: { create: { balance: 0 } },
      ...overrides,
    },
  });
}

export async function resetUser(discordId: string): Promise<void> {
  await testPrisma.userEducation.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.dailyQuest.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.caughtAnimal.deleteMany({ where: { discordId } }).catch(() => {});
  await testPrisma.ownedProperty.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.inventory.deleteMany({ where: { userId: discordId } }).catch(() => {});
  const wallet = await testPrisma.wallet.findUnique({ where: { userId: discordId } }).catch(() => null);
  if (wallet) await testPrisma.transaction.deleteMany({ where: { walletId: wallet.id } }).catch(() => {});
  await testPrisma.wallet.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.user.deleteMany({ where: { discordId } }).catch(() => {});
}

export async function flushTestKeys(pattern: string): Promise<void> {
  const redis = testRedis();
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}

type CfConfigKey = keyof typeof CRIME_FAMILY_CONFIG;
type CfConfigOverrides = Partial<Record<CfConfigKey, unknown>>;

/**
 * The CRIME_FAMILY_CONFIG copy a lazy `require()` sees. Under vitest a lazy
 * require goes through Node (with ts-node), not vitest, and loads a second
 * copy of every module it reaches (test/router/fakeMessage.ts), so
 * routeMessage's lazy require of crew.ts reads this object, not the import.
 */
function nodeCfConfig(): Record<string, unknown> {
  if (!(process as any)[Symbol.for("ts-node.register.instance")]) {
    require("ts-node").register({ transpileOnly: true });
  }
  return require("../src/utils/economyConfig").CRIME_FAMILY_CONFIG;
}

/** Runs fn with CRIME_FAMILY_CONFIG patched in both module copies, then restores every key. */
export async function withCfConfig<T>(overrides: CfConfigOverrides, fn: () => Promise<T>): Promise<T> {
  const targets = [...new Set([CRIME_FAMILY_CONFIG as unknown as Record<string, unknown>, nodeCfConfig()])];
  const saved = targets.map((t) => ({ ...t }));
  try {
    for (const t of targets) Object.assign(t, overrides);
    return await fn();
  } finally {
    targets.forEach((t, i) => {
      for (const k of Object.keys(t)) if (!(k in saved[i])) delete t[k];
      Object.assign(t, saved[i]);
    });
  }
}

// ── Crime Families ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const DISCORD_EPOCH = 1_420_070_400_000n;
let snowflakeSeq = 0;

/** A fresh snowflake whose timestamp is `date` (Discord account age). */
export function snowflakeAt(date: Date): string {
  const increment = BigInt(snowflakeSeq++ & 0xfff);
  const worker = BigInt(process.pid & 0x3ff);
  return (((BigInt(date.getTime()) - DISCORD_EPOCH) << 22n) | (worker << 12n) | increment).toString();
}

export function daysAgo(n: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - n * DAY_MS);
}

export interface SeedEligibleOpts {
  id?: string; // used instead of a generated snowflake
  discordAgeDays?: number;
  fortunaAgeDays?: number;
  shifts?: number;
  wallet?: number;
  heat?: number;
  prepKeys?: string[];
  jailedUntil?: Date;
  ban?: { expiresAt: Date | null };
}

/** A user who passes every family gate by default; returns the user id. */
export async function seedEligibleUser(opts: SeedEligibleOpts = {}): Promise<string> {
  const id = opts.id ?? snowflakeAt(daysAgo(opts.discordAgeDays ?? 400));
  await seedUser(id, {
    createdAt: daysAgo(opts.fortunaAgeDays ?? 400),
    shiftsWorked: opts.shifts ?? 400,
    crimeHeat: opts.heat ?? 0,
    wallet: { create: { balance: opts.wallet ?? 0 } },
    ...(opts.jailedUntil ? { isJailed: true, jailReleaseTime: opts.jailedUntil } : {}),
    ...(opts.ban ? { isBanned: true, banExpiresAt: opts.ban.expiresAt } : {}),
  });
  for (const catalogKey of opts.prepKeys ?? []) {
    const item = await testPrisma.shopItem.upsert({
      where: { catalogKey },
      create: {
        catalogKey, guildId: "global", name: catalogKey, price: 1, description: "test",
        stock: -1, consumable: false, usable: false, itemType: "COLLECTIBLE", effects: [],
      } as any,
      update: {},
    });
    await testPrisma.inventory.upsert({
      where: { userId_shopItemId: { userId: id, shopItemId: item.id } },
      create: { userId: id, shopItemId: item.id, amount: 1 },
      update: { amount: 1 },
    });
  }
  return id;
}

export interface SeedFamilyOpts {
  bossId: string;
  name?: string;
  tag?: string;
  level?: number;
  xp?: number;
  treasury?: number;
  earnings?: number;
  duesArrears?: number;
  lastPaydayAt?: Date;
  homeGuildId?: string;
  homeChannelId?: string;
  bossSince?: Date; // the Boss's firstBossAt (default 30 days ago)
  data?: Partial<Prisma.FamilyUncheckedCreateInput>; // spread into the family create last
  members?: { userId: string; role: FamilyRole; joinedAt?: Date; lastActiveAt?: Date; capers?: number; officerUntil?: Date }[];
}

let familySeq = 0;

/** A family with the Boss in seat 1 (joined 30 days ago) and `members` (never the Boss) in seats 2..n. */
export async function seedFamily(opts: SeedFamilyOpts): Promise<Family> {
  const n = ++familySeq;
  const name = opts.name ?? `Family ${n}`;
  const tag = opts.tag ?? `F${n}`;
  const family = await testPrisma.family.create({
    data: {
      name,
      nameKey: name.toLowerCase().replace(/\s+/g, " "),
      tag,
      tagKey: tag.toUpperCase(),
      bossId: opts.bossId,
      level: opts.level ?? 1,
      xp: opts.xp ?? 0,
      treasury: opts.treasury ?? 0,
      earnings: opts.earnings ?? 0,
      duesArrears: opts.duesArrears ?? 0,
      homeGuildId: opts.homeGuildId ?? "g1",
      homeChannelId: opts.homeChannelId ?? "c-home",
      memberCount: 1 + (opts.members ?? []).length,
      ...(opts.lastPaydayAt ? { lastPaydayAt: opts.lastPaydayAt } : {}),
      ...opts.data,
    },
  });
  await testPrisma.familyMember.create({
    data: {
      familyId: family.id, userId: opts.bossId, role: "BOSS", roleSlot: "BOSS", seat: 1, joinedAt: daysAgo(30),
      bossedOnce: true, firstBossAt: opts.bossSince ?? daysAgo(30),
    },
  });
  let capos = 0;
  for (const [i, m] of (opts.members ?? []).entries()) {
    const roleSlot = m.role === "UNDERBOSS" ? "UNDERBOSS" : m.role === "CAPO" ? CAPO_SLOTS[capos++] : m.userId;
    await testPrisma.familyMember.create({
      data: {
        familyId: family.id, userId: m.userId, role: m.role, roleSlot, seat: i + 2,
        ...(m.joinedAt ? { joinedAt: m.joinedAt } : {}),
        ...(m.lastActiveAt ? { lastActiveAt: m.lastActiveAt } : {}),
        ...(m.capers !== undefined ? { capers: m.capers } : {}),
        ...(m.officerUntil ? { officerUntil: m.officerUntil } : {}),
      },
    });
  }
  return family;
}

/** Empties the family collections (plans 2/3 extend this list). */
export async function resetFamilies(): Promise<void> {
  await testPrisma.familyBallot.deleteMany({});
  await testPrisma.familyVote.deleteMany({});
  await testPrisma.paydayShare.deleteMany({});
  await testPrisma.cfJobRun.deleteMany({});
  await testPrisma.botProcessBoot.deleteMany({});
  await testPrisma.warHit.deleteMany({});
  await testPrisma.warContribution.deleteMany({});
  await testPrisma.war.deleteMany({});
  await testPrisma.racket.deleteMany({});
  await testPrisma.turfCity.deleteMany({});
  await testPrisma.caperCrew.deleteMany({});
  await testPrisma.caper.deleteMany({});
  await testPrisma.familyLedger.deleteMany({});
  await testPrisma.familyInvite.deleteMany({});
  await testPrisma.familyExit.deleteMany({});
  await testPrisma.familyMember.deleteMany({});
  await testPrisma.family.deleteMany({});
}

let sentinelSeq = 0;
/** A unique placeholder for a slot that the seed rewrites to the row id right after create. */
const tmpSlot = () => `seed-${process.pid}-${++sentinelSeq}`;

/** A recruitment application (`kind: "APPLICATION"`); a resolved status rewrites `slot` to the row id. */
export async function seedApplication(o: {
  familyId: string; applicantId: string; status?: string; message?: string;
  createdAt?: Date; resolvedAt?: Date; expiresAt?: Date; inviterId?: string;
}): Promise<FamilyInvite> {
  const status = o.status ?? "PENDING";
  const pending = status === "PENDING";
  const row = await testPrisma.familyInvite.create({
    data: {
      familyId: o.familyId, kind: "APPLICATION", inviterId: o.inviterId ?? "", inviteeId: o.applicantId,
      message: o.message ?? "", status, slot: pending ? "PENDING" : tmpSlot(), guildId: "g1", channelId: "c1",
      expiresAt: o.expiresAt ?? new Date(Date.now() + CRIME_FAMILY_CONFIG.applicationTtlSeconds * 1000),
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      ...(o.resolvedAt ? { resolvedAt: o.resolvedAt } : {}),
    },
  });
  return pending ? row : testPrisma.familyInvite.update({ where: { id: row.id }, data: { slot: row.id } });
}

/** A FamilyVote row only (no ballots); a closed status rewrites `liveSlot` to the row id. */
export async function seedVote(o: {
  familyId: string; bossId: string; starterId: string; eligibleIds: string[]; status?: string;
  closesAt?: Date; createdAt?: Date; cooldownUntil?: Date; closedAt?: Date; announced?: boolean; resultAnnounced?: boolean;
}): Promise<FamilyVote> {
  const status = o.status ?? "OPEN";
  const open = status === "OPEN";
  const row = await testPrisma.familyVote.create({
    data: {
      familyId: o.familyId, bossId: o.bossId, starterId: o.starterId, eligibleIds: o.eligibleIds, status,
      liveSlot: open ? "LIVE" : tmpSlot(),
      closesAt: o.closesAt ?? new Date(Date.now() + CRIME_FAMILY_CONFIG.voteSeconds * 1000),
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      ...(o.cooldownUntil ? { cooldownUntil: o.cooldownUntil } : {}),
      ...(o.closedAt ? { closedAt: o.closedAt } : {}),
      ...(o.announced !== undefined ? { announced: o.announced } : {}),
      ...(o.resultAnnounced !== undefined ? { resultAnnounced: o.resultAnnounced } : {}),
    },
  });
  return open ? row : testPrisma.familyVote.update({ where: { id: row.id }, data: { liveSlot: row.id } });
}

// ── Turf (plan 3) ────────────────────────────────────────────────────────────

/** Upserts one city by [league, number] and sets its status (H2: default Uptown #1). */
export async function seedTurfCity(o: { league?: LeagueKey; number?: number; status?: "OPEN" | "CLOSED" } = {}): Promise<TurfCity> {
  const { league = "GOLD", number = 1, status = "OPEN" } = o;
  return testPrisma.turfCity.upsert({ where: { league_number: { league, number } }, create: { league, number, status }, update: { status } });
}

/** The default test city, Uptown #1, created on demand. */
export function turfCity(): Promise<TurfCity> {
  return seedTurfCity();
}

/**
 * Upserts one racket by [cityId, key] (default: Uptown #1): the definition
 * comes from `RACKETS` at the city's league income; the overrides apply on
 * create and update.
 */
export async function seedRacket(
  key: string,
  o: Partial<{ cityId: string; ownerFamilyId: string; lastPayoutAt: Date; capturedAt: Date; neglectStrikes: number }> = {},
): Promise<Racket> {
  const r = RACKETS.find((d) => d.key === key);
  if (!r) throw new Error(`seedRacket: unknown racket ${key}`);
  const { cityId: askedCity, ...overrides } = o;
  const city = askedCity
    ? await testPrisma.turfCity.findUniqueOrThrow({ where: { id: askedCity } })
    : await turfCity();
  const league = city.league as LeagueKey;
  const data = {
    name: r.name, class: r.class, league, incomePerCycle: LEAGUE_RACKET_INCOME[league][r.class],
    baseDefense: RACKET_CLASSES[r.class].baseline, warDow: r.warDow, warHourUtc: r.warHourUtc, ...overrides,
  };
  return testPrisma.racket.upsert({
    where: { cityId_key: { cityId: city.id, key } }, create: { cityId: city.id, key, ...data }, update: data,
  });
}

/** One racket row by key in a city (default: Uptown #1). */
export async function racketByKey(key: string, cityId?: string): Promise<Racket> {
  return testPrisma.racket.findUniqueOrThrow({ where: { cityId_key: { cityId: cityId ?? (await turfCity()).id, key } } });
}

export interface SeedWarOpts {
  racketKey: string;
  /** The racket's city; default Uptown #1 (H2). */
  cityId?: string;
  status: "BIDDING" | "ARMED" | "ACTIVE" | "SETTLING" | "RESOLVED" | "CANCELLED";
  startsAt?: Date;
  topBid?: number;
  topBidderFamilyId?: string;
  attackerFamilyId?: string;
  defenderFamilyId?: string;
  seed?: string;
  scores?: Partial<Record<ScoreField, number>>;
  lastTickAt?: Date;
  maxTickGapSeconds?: number;
  warnedSoon?: boolean;
  boards?: WarBoardRef[];
}

const MIN_MS = 60_000;
const WAR_START_OFFSET_MS: Record<SeedWarOpts["status"], number> = {
  BIDDING: 24 * 60 * MIN_MS, ARMED: 10 * MIN_MS, ACTIVE: -10 * MIN_MS, SETTLING: -61 * MIN_MS, RESOLVED: -61 * MIN_MS, CANCELLED: -61 * MIN_MS,
};

/** A War row whose window comes from `warWindow(startsAt)`; the racket row (in `o.cityId`, default Uptown #1) is seeded when missing. */
export async function seedWar(o: SeedWarOpts): Promise<War> {
  const now = new Date();
  const cityId = o.cityId ?? (await turfCity()).id;
  const racket = (await testPrisma.racket.findUnique({ where: { cityId_key: { cityId, key: o.racketKey } } }))
    ?? (await seedRacket(o.racketKey, { cityId }));
  const startsAt = o.startsAt ?? new Date(now.getTime() + WAR_START_OFFSET_MS[o.status]);
  const live = o.status === "ACTIVE" || o.status === "SETTLING";
  const topBidderFamilyId = o.topBidderFamilyId ?? "";
  return testPrisma.war.create({
    data: {
      racketId: racket.id,
      racketKey: racket.key,
      cityId: racket.cityId,
      status: o.status,
      ...warWindow(startsAt),
      topBid: o.topBid ?? 0,
      topBidderFamilyId,
      attackerFamilyId: o.attackerFamilyId ?? topBidderFamilyId,
      defenderFamilyId: o.defenderFamilyId ?? "",
      seed: o.seed ?? (live ? "ab".repeat(16) : ""),
      ...(live ? baselineScores(racket.class as RacketClass) : {}),
      ...o.scores,
      ...(o.lastTickAt ? { lastTickAt: o.lastTickAt } : live ? { lastTickAt: now } : {}),
      ...(o.maxTickGapSeconds !== undefined ? { maxTickGapSeconds: o.maxTickGapSeconds } : {}),
      ...(o.warnedSoon !== undefined ? { warnedSoon: o.warnedSoon } : {}),
      ...(o.boards ? { boards: o.boards } : {}),
    },
  });
}

export async function seedContribution(o: {
  warId: string; familyId: string; userId: string; side: WarSide;
  hits?: number; correctHits?: number; points?: number; nextHitAt?: Date; lastScoutSlot?: number;
}): Promise<WarContribution> {
  return testPrisma.warContribution.create({
    data: {
      warId: o.warId, familyId: o.familyId, userId: o.userId, side: o.side,
      hits: o.hits ?? 0, correctHits: o.correctHits ?? 0, points: o.points ?? 0,
      nextHitAt: o.nextHitAt ?? new Date(0), lastScoutSlot: o.lastScoutSlot ?? -1,
    },
  });
}

/** `n` resolved WarHit rows for one member (activity counts, 7.3). */
export async function seedWarHits(userId: string, familyId: string, n: number, o: { state?: "HIT" | "MISS"; createdAt?: Date } = {}): Promise<void> {
  const createdAt = o.createdAt ?? new Date();
  await testPrisma.warHit.createMany({
    data: Array.from({ length: n }, () => ({
      warId: "65f0000000000000000000aa", familyId, userId, side: "ATK", block: "docks", slot: 0,
      deadline: createdAt, state: o.state ?? "HIT", createdAt,
    })),
  });
}

/**
 * The test DB never runs `db push`, so it has no indexes. Builds each model's
 * unique indexes from the Prisma DMMF with Prisma's names (`<Model>_<fields>_key`),
 * so unique backstops and P2002 targets exist in race tests.
 */
export async function ensureUniqueIndexes(models: string[]): Promise<void> {
  for (const model of Prisma.dmmf.datamodel.models.filter((m) => models.includes(m.name))) {
    const dbName = (field: string) => model.fields.find((f) => f.name === field)?.dbName ?? field;
    const uniques = [
      ...model.uniqueIndexes.map((u) => u.fields),
      ...model.fields.filter((f) => f.isUnique).map((f) => [f.name]),
    ];
    for (const fields of uniques) {
      const key = Object.fromEntries(fields.map((f) => [dbName(f), 1]));
      try {
        await testPrisma.$runCommandRaw({
          createIndexes: model.dbName ?? model.name,
          indexes: [{ key, name: `${model.name}_${fields.join("_")}_key`, unique: true }],
        });
      } catch (err) {
        if (!/Code: `?(85|86)\b|IndexOptionsConflict|IndexKeySpecsConflict/.test(String((err as Error)?.message))) throw err;
      }
    }
  }
}
