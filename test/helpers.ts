import Redis from "ioredis";
import { PrismaClient, Prisma, User } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../src/utils/economyConfig";

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
