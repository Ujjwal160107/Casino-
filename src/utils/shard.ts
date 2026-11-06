// The one process that runs scheduled jobs (spec A29). discord.js sets
// client.shard only under a ShardingManager, so an unsharded bot is its own
// job shard; under sharding, the process that holds shard 0 is.

/** Whether this process runs the scheduled jobs: unsharded, or holding shard 0. */
export function isJobShard(client: { shard?: { ids: number[] } | null }): boolean {
  return !client.shard || client.shard.ids.includes(0);
}
