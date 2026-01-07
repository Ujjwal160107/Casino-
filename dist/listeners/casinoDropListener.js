"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCasinoDropListener = void 0;
const casinoDropService_1 = require("../services/casinoDropService");
const setupCasinoDropListener = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild)
            return;
        // Ensure we don't count command messages? Or do we?
        // Usually, commands shouldn't count towards activity, but user didn't specify.
        // Let's assume ANY message counts.
        try {
            await casinoDropService_1.CasinoDropService.incrementMessageCount(client, message.guild.id, message.channel.id);
        }
        catch (error) {
            console.error("Error in casino drop listener:", error);
        }
    });
};
exports.setupCasinoDropListener = setupCasinoDropListener;
//# sourceMappingURL=casinoDropListener.js.map