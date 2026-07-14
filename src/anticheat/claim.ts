import { redisService } from "../services/redisService";

export type CooldownClaim = {
  ok: boolean;
  retryAtUnix?: number;
  release: () => Promise<void>;
};

const NOOP_RELEASE = async () => {};

/**
 * Atomically reserve a lock BEFORE running an action (Redis SET NX EX).
 * ok:true + a working release() when the key was free; ok:false + retryAtUnix
 * when it is already held. Fails OPEN on Redis error (ok:true, no-op release) to
 * match existing cooldown behavior — callers that must never double-run rely on
 * conditionalClaim as the durable guard, not this.
 */
export async function cooldownClaim(
  scope: string,
  discordId: string,
  ttlSeconds: number
): Promise<CooldownClaim> {
  const key = `ac_claim:${scope}:${discordId}`;
  try {
    const redis = redisService.getInstance();
    const res = await redis.set(key, "1", "EX", ttlSeconds, "NX");
    if (res === "OK") {
      return { ok: true, release: async () => { await redisService.del(key); } };
    }
    const ttl = await redis.ttl(key);
    return {
      ok: false,
      retryAtUnix: Math.floor((Date.now() + Math.max(ttl, 0) * 1000) / 1000),
      release: NOOP_RELEASE,
    };
  } catch (err) {
    console.error(`anticheat.cooldownClaim error for ${key}`, err);
    return { ok: true, release: NOOP_RELEASE }; // fail open
  }
}

/**
 * Runs an atomic Mongo conditional update (updateMany with a guard predicate)
 * and returns true iff THIS caller changed exactly one row — i.e. it won the
 * compare-and-swap. Concurrent losers see count 0. This is the authoritative
 * durable guard for state/timestamp faucets.
 */
export async function conditionalClaim(
  run: () => Promise<{ count: number }>
): Promise<boolean> {
  const { count } = await run();
  return count === 1;
}
