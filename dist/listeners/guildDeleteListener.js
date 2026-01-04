"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guildDeleteListener = void 0;
const guildCleanupService_1 = require("../services/guildCleanupService");
const guildDeleteListener = (client) => {
    client.on("guildDelete", async (guild) => {
        console.log(`[GuildDelete] Bot left guild: ${guild.name} (${guild.id})`);
        await guildCleanupService_1.guildCleanupService.softDeleteGuild(guild.id);
    });
};
exports.guildDeleteListener = guildDeleteListener;
//# sourceMappingURL=guildDeleteListener.js.map