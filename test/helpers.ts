import Redis from "ioredis";
import { PrismaClient, Prisma, User, Family } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../src/utils/economyConfig";
import { CAPO_SLOTS, type FamilyRole } from "../src/data/crimeFamilyCatalog";

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
  members?: { userId: string; role: FamilyRole; joinedAt?: Date; lastActiveAt?: Date; capers?: number }[];
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
      ...(opts.lastPaydayAt ? { lastPaydayAt: opts.lastPaydayAt } : {}),
    },
  });
  await testPrisma.familyMember.create({
    data: { familyId: family.id, userId: opts.bossId, role: "BOSS", roleSlot: "BOSS", seat: 1, joinedAt: daysAgo(30) },
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
      },
    });
  }
  return family;
}

/** Empties the family collections (plans 2/3 extend this list). */
export async function resetFamilies(): Promise<void> {
  await testPrisma.familyLedger.deleteMany({});
  await testPrisma.familyInvite.deleteMany({});
  await testPrisma.familyExit.deleteMany({});
  await testPrisma.familyMember.deleteMany({});
  await testPrisma.family.deleteMany({});
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
