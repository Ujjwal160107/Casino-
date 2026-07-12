import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

class RedisService {
    private client: Redis | null = null;
    private isConnected = false;

    constructor() {
        // Lazy connection or init
    }

    public getInstance(): Redis {
        if (!this.client) {
            this.client = new Redis(REDIS_URL, {
                // Retry strategy
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
            });

            this.client.on("connect", () => {
                console.log("Redis connected!");
                this.isConnected = true;
            });

            this.client.on("error", (err) => {
                console.error("Redis connection error:", err);
                this.isConnected = false;
            });
        }
        return this.client;
    }

    /**
     * Get a value from cache and parse it as JSON
     */
    public async get<T>(key: string): Promise<T | null> {
        try {
            const data = await this.getInstance().get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (error) {
            console.error(`Redis get error for key ${key}:`, error);
            return null; // Fallback to DB on error
        }
    }

    /**
     * Set a value in cache with TTL (seconds)
     */
    public async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
        try {
            const stringValue = JSON.stringify(value);
            await this.getInstance().setex(key, ttlSeconds, stringValue);
        } catch (error) {
            console.error(`Redis set error for key ${key}:`, error);
        }
    }

    /**
     * Delete a key
     */
    public async del(key: string): Promise<void> {
        try {
            await this.getInstance().del(key);
        } catch (error) {
            console.error(`Redis del error for key ${key}:`, error);
        }
    }

    /**
     * Atomically set a key only if it doesn't exist (SET NX EX).
     * Returns true if the key was set (claim acquired), false if it already existed.
     * Fails open (returns true) on Redis errors, consistent with get/set above.
     */
    public async setIfNotExists(key: string, value: any, ttlSeconds: number): Promise<boolean> {
        try {
            const res = await this.getInstance().set(key, JSON.stringify(value), "EX", ttlSeconds, "NX");
            return res === "OK";
        } catch (error) {
            console.error(`Redis setnx error for key ${key}:`, error);
            return true;
        }
    }
}

export const redisService = new RedisService();
