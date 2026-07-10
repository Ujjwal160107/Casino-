/** Sentinel guildId for backend-owned global catalog rows (shop, properties, degrees). */
export const GLOBAL_CATALOG_GUILD_ID = "global";

export function globalCatalogGuildFilter<T extends Record<string, unknown>>(extra?: T) {
  return { guildId: GLOBAL_CATALOG_GUILD_ID, ...extra };
}
