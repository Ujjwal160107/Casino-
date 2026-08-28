import Redis from "ioredis";
import { PrismaClient, Prisma, User } from "@prisma/client";

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
