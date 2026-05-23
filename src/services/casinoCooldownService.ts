import { redisService } from "./redisService";
import { isTester } from "../utils/developerAccess";

// ---------------------------------------------------------------------------
// Cooldown durations (seconds)
// ---------------------------------------------------------------------------

export const CASINO_COOLDOWNS: Record<string, { normal: number; premium: number }> = {
  coinflip:  { normal: 20 * 60, premium: 8 * 60 },
  slots:     { normal: 25 * 60, premium: 10 * 60 },
  blackjack: { normal: 30 * 60, premium: 12 * 60 },
  roulette:  { normal: 30 * 60, premium: 12 * 60 },
  cockfight: { normal: 45 * 60, premium: 18 * 60 },
};

export const GAME_DISPLAY_NAMES: Record<string, string> = {
  coinflip:  "Coinflip",
  slots:     "Slots",
  blackjack: "Blackjack",
  roulette:  "Roulette",
  cockfight: "Cockfight",
};

// Active-game lock TTL — long enough to cover the longest interactive game plus buffer
const ACTIVE_LOCK_TTL = 5 * 60; // 5 minutes

// Redis key builders
function cdKey(gameKey: string, discordId: string)     { return `casino_cd:${gameKey}:${discordId}`; }
function lastKey(discordId: string)                    { return `casino_last:${discordId}`; }
function activeLockKey(gameKey: string, discordId: string) { return `casino_active:${gameKey}:${discordId}`; }

// ---------------------------------------------------------------------------
// Premium stub — TODO: replace with real entitlement check
// ---------------------------------------------------------------------------

// TODO: Wire to real entitlement system (Patreon / website subscription / Discord role)
export async function isPremiumUser(_discordId: string, _guildId?: string): Promise<boolean> {
  return false;
}

// ---------------------------------------------------------------------------
// Cooldown check/set — fail-closed on Redis error
// ---------------------------------------------------------------------------

export type CooldownCheckResult =
  | { active: true;  availableAtUnix: number; remainingSeconds: number; unavailable?: false }
  | { active: false; unavailable?: false }
  | { active: true;  unavailable: true };

export async function checkCasinoCooldown(gameKey: string, discordId: string): Promise<CooldownCheckResult> {
  // Testers bypass all casino cooldowns
  if (isTester(discordId)) return { active: false };

  try {
    const ttl = await redisService.getInstance().ttl(cdKey(gameKey, discordId));
    if (ttl > 0) {
      return {
        active: true,
        availableAtUnix: Math.floor((Date.now() + ttl * 1000) / 1000),
        remainingSeconds: ttl,
      };
    }
    return { active: false };
  } catch (err) {
    console.error(`casinoCooldownService: checkCasinoCooldown error for ${gameKey}/${discordId}`, err);
    // Fail closed — treat as active to prevent spam during Redis outage
    return { active: true, unavailable: true };
  }
}

export async function getCasinoCooldownDuration(gameKey: string, discordId: string, guildId?: string): Promise<number> {
  const durations = CASINO_COOLDOWNS[gameKey];
  if (!durations) return 0;
  const premium = await isPremiumUser(discordId, guildId);
  return premium ? durations.premium : durations.normal;
}

export async function setCasinoCooldown(gameKey: string, discordId: string, guildId?: string): Promise<void> {
  try {
    const duration = await getCasinoCooldownDuration(gameKey, discordId, guildId);
    if (duration <= 0) return;
    const redis = redisService.getInstance();
    await redis.set(cdKey(gameKey, discordId), "1", "EX", duration);
    // Track most recently played game for Bandage
    await redis.set(lastKey(discordId), gameKey, "EX", duration);
  } catch (err) {
    // Log loudly — a failed cooldown set after a completed game is a real economy issue
    console.error(`casinoCooldownService [CRITICAL]: setCasinoCooldown failed for ${gameKey}/${discordId}`, err);
  }
}

// ---------------------------------------------------------------------------
// Active-game lock — prevents multiple pending interactive games
// ---------------------------------------------------------------------------

/**
 * Attempts to acquire the active-game lock for a user.
 * Returns true if lock was acquired (game may start), false if already locked.
 * Fails closed on Redis error (returns false = block the game).
 */
export async function acquireActiveGameLock(gameKey: string, discordId: string): Promise<boolean> {
  if (isTester(discordId)) return true; // Testers always get the lock
  try {
    const redis = redisService.getInstance();
    // NX = only set if key does not exist; returns "OK" or null
    const result = await redis.set(activeLockKey(gameKey, discordId), "1", "EX", ACTIVE_LOCK_TTL, "NX");
    return result === "OK";
  } catch (err) {
    console.error(`casinoCooldownService: acquireActiveGameLock error for ${gameKey}/${discordId}`, err);
    return false; // Fail closed
  }
}

/**
 * Releases the active-game lock for a user.
 * Should be called when the game resolves OR when the collector times out.
 */
export async function releaseActiveGameLock(gameKey: string, discordId: string): Promise<void> {
  try {
    await redisService.getInstance().del(activeLockKey(gameKey, discordId));
  } catch (err) {
    console.error(`casinoCooldownService: releaseActiveGameLock error for ${gameKey}/${discordId}`, err);
  }
}

// ---------------------------------------------------------------------------
// Bandage: clear most recently played (active) cooldown, fall back to longest active
// ---------------------------------------------------------------------------

/**
 * Clears the casino cooldown for the most recently played game that still has an active cooldown.
 * If `casino_last` points to an expired cooldown, falls back to the longest remaining active cooldown.
 * Returns the game key that was cleared, or null if nothing was active.
 */
export async function clearLastCasinoCooldown(discordId: string): Promise<string | null> {
  try {
    const redis = redisService.getInstance();
    const lastGame = await redis.get(lastKey(discordId));

    // Check if last game still has an active cooldown
    if (lastGame) {
      const ttl = await redis.ttl(cdKey(lastGame, discordId));
      if (ttl > 0) {
        await redis.del(cdKey(lastGame, discordId));
        await redis.del(lastKey(discordId));
        return lastGame;
      }
      // Last game's cooldown expired — clean up the tracker and fall through
      await redis.del(lastKey(discordId));
    }

    // Fall back: find the game with the longest remaining cooldown
    const gameKeys = Object.keys(CASINO_COOLDOWNS);
    let bestGame: string | null = null;
    let bestTtl = 0;
    for (const gk of gameKeys) {
      const ttl = await redis.ttl(cdKey(gk, discordId));
      if (ttl > bestTtl) { bestTtl = ttl; bestGame = gk; }
    }

    if (bestGame && bestTtl > 0) {
      await redis.del(cdKey(bestGame, discordId));
      return bestGame;
    }

    return null;
  } catch (err) {
    console.error(`casinoCooldownService: clearLastCasinoCooldown error for ${discordId}`, err);
    return null;
  }
}

export function formatCasinoCooldownMessage(gameKey: string, availableAtUnix: number): string {
  const name = GAME_DISPLAY_NAMES[gameKey] ?? gameKey;
  return `You can play **${name}** again <t:${availableAtUnix}:R>.`;
}
