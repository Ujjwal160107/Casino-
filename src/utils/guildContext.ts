import { getGuildSettings } from "../services/guildSettingsService";

export const DEFAULT_PREFIX = "!";

export async function getGuildPrefix(guildId: string): Promise<string> {
  const settings = await getGuildSettings(guildId);
  return settings.prefix?.trim() || DEFAULT_PREFIX;
}
