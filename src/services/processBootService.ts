// Process boots (spec A30). Every bot process writes one row when it is ready,
// so any shard can tell whether some process restarted since a moment (a
// crew heist RUNNING across a restart is voided).
import prisma from "../utils/prisma";

/** One BotProcessBoot row for this process (shardIds [] when unsharded). */
export async function recordProcessBoot(client: { shard?: { ids: number[] } | null }, now: Date = new Date()): Promise<void> {
  await prisma.botProcessBoot.create({ data: { shardIds: client.shard?.ids ?? [], bootedAt: now } });
}

/** Whether any process booted after `since`. */
export async function bootedSince(since: Date): Promise<boolean> {
  return (await prisma.botProcessBoot.count({ where: { bootedAt: { gt: since } } })) > 0;
}
