"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        // Lazy connection or init
    }
    getInstance() {
        if (!this.client) {
            this.client = new ioredis_1.default(REDIS_URL, {
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
    async get(key) {
        try {
            const data = await this.getInstance().get(key);
            if (!data)
                return null;
            return JSON.parse(data);
        }
        catch (error) {
            console.error(`Redis get error for key ${key}:`, error);
            return null; // Fallback to DB on error
        }
    }
    /**
     * Set a value in cache with TTL (seconds)
     */
    async set(key, value, ttlSeconds = 300) {
        try {
            const stringValue = JSON.stringify(value);
            await this.getInstance().setex(key, ttlSeconds, stringValue);
        }
        catch (error) {
            console.error(`Redis set error for key ${key}:`, error);
        }
    }
    /**
     * Delete a key
     */
    async del(key) {
        try {
            await this.getInstance().del(key);
        }
        catch (error) {
            console.error(`Redis del error for key ${key}:`, error);
        }
    }
}
exports.redisService = new RedisService();
//# sourceMappingURL=redisService.js.map