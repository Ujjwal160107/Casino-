import { Client, Guild } from "discord.js";
import { guildCleanupService } from "../services/guildCleanupService";

export const guildDeleteListener = (client: Client) => {
    client.on("guildDelete", async (guild: Guild) => {
        console.log(`[GuildDelete] Bot left guild: ${guild.name} (${guild.id})`);
        await guildCleanupService.softDeleteGuild(guild.id);
    });
};
