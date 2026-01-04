"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guildCreateListener = void 0;
const guildCleanupService_1 = require("../services/guildCleanupService");
const guildCreateListener = (client) => {
    client.on("guildCreate", async (guild) => {
        console.log(`[GuildCreate] Bot joined guild: ${guild.name} (${guild.id})`);
        // Check if there's a pending deletion and restore it
        await guildCleanupService_1.guildCleanupService.restoreGuild(guild.id);
    });
};
exports.guildCreateListener = guildCreateListener;
//# sourceMappingURL=guildCreateListener.js.map