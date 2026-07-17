import { Prisma } from "@prisma/client";
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

/** Nullable `DateTime?` User columns used as compare-and-swap window guards. */
export type NullableUserDateField = "lastZooClaim" | "lastVote" | "lastLoadedDiceRoll";

/**
 * Build the compare-and-swap `where` fragment that matches a User row only while
 * a nullable timestamp column (`prior`, the value we just read) is unchanged.
 * Pair with `conditionalClaim` (or a direct `count === 1` check) for faucet CAS.
 *
 * Why this exists: Prisma's MongoDB connector filters a *missing* field and an
 * explicit `null` differently. `{ field: null }` matches ONLY documents where
 * the field is an explicit BSON null — NOT documents where the field was never
 * written — even though `findUnique` reads both back as `null`. A never-claimed
 * user's timestamp column is absent (`user.create` never sets it and the column
 * has no default), so a CAS that read `null` and then filtered `{ field: null }`
 * matched zero rows and could never win: the user's FIRST claim was permanently
 * blocked (zoo income stuck on "Already collecting…", first vote reward denied,
 * first loaded-dice roll rejected). Covering the absent case with an
 * `isSet: false` OR-branch makes the CAS match the row we actually read. See the
 * Prisma MongoDB docs: filtering `null` excludes missing fields since 3.11.1.
 */
export function userDateUnchanged(
  field: NullableUserDateField,
  prior: Date | null,
): Prisma.UserWhereInput {
  if (prior !== null) return { [field]: prior } as Prisma.UserWhereInput;
  return {
    OR: [{ [field]: null }, { [field]: { isSet: false } }],
  } as Prisma.UserWhereInput;
}
