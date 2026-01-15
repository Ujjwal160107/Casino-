import Redis from "ioredis";

const globalForRedis = global as unknown as { redis: Redis };

const redis =
    globalForRedis.redis ||
    new Redis(process.env.REDIS_URL || "redis://localhost:6379");

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export { redis };
