import { redisService } from "./redisService";

const MAX_RECENT = 8;
const TTL_SECONDS = 4 * 3600; // 4 hours

function redisKey(discordId: string, type: "event" | "task"): string {
  return `job_recent_${type}:${discordId}`;
}

export async function getRecentIds(discordId: string, type: "event" | "task"): Promise<string[]> {
  try {
    const data = await redisService.get<string[]>(redisKey(discordId, type));
    return data ?? [];
  } catch {
    return [];
  }
}

export async function recordRecentId(discordId: string, type: "event" | "task", id: string): Promise<void> {
  try {
    const recent = await getRecentIds(discordId, type);
    const updated = [id, ...recent.filter(r => r !== id)].slice(0, MAX_RECENT);
    await redisService.set(redisKey(discordId, type), updated, TTL_SECONDS);
  } catch {
    // Non-critical — anti-repeat is best-effort
  }
}

/**
 * Filters a pool of items, preferring items not in recent list.
 * Falls back to full pool if all items are recent.
 */
export function filterByRecent<T extends { id: string }>(pool: T[], recentIds: string[]): T[] {
  const fresh = pool.filter(item => !recentIds.includes(item.id));
  return fresh.length > 0 ? fresh : pool;
}
