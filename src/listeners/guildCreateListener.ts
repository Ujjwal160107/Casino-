import { Client, Guild } from "discord.js";
import { guildCleanupService } from "../services/guildCleanupService";

export const guildCreateListener = (client: Client) => {
    client.on("guildCreate", async (guild: Guild) => {
        console.log(`[GuildCreate] Bot joined guild: ${guild.name} (${guild.id})`);
        // Check if there's a pending deletion and restore it
        await guildCleanupService.restoreGuild(guild.id);
    });
};
