"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupChatMoneyListener = void 0;
const guildConfigService_1 = require("../services/guildConfigService");
const walletService_1 = require("../services/walletService");
const prisma_1 = __importDefault(require("../utils/prisma"));
const discordLogger_1 = require("../utils/discordLogger");
// Small in-memory cache to prevent database spam for rapid messages from same user
// Key: guildId-userId, Value: timestamp of last check/award
const cooldownCache = new Map();
const setupChatMoneyListener = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild)
            return;
        try {
            const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
            if (!config || !config.chatMoneyEnabled)
                return;
            // Check channel whitelist
            if (!config.chatMoneyChannels.includes(message.channel.id))
                return;
            const userId = message.author.id;
            const guildId = message.guild.id;
            const cacheKey = `${guildId}-${userId}`;
            const now = Date.now();
            const intervalMs = config.chatMoneyInterval * 1000;
            // Memory Cache Check (Optimization)
            const lastCheck = cooldownCache.get(cacheKey);
            if (lastCheck && (now - lastCheck < intervalMs)) {
                return;
            }
            // Database Check (Source of Truth)
            // We need to fetch user to see lastChatMoney
            // using ensureUserAndWallet to make sure they have a wallet
            const user = await (0, walletService_1.ensureUserAndWallet)(userId, guildId, message.author.username);
            if (user.lastChatMoney) {
                const lastDbTime = user.lastChatMoney.getTime();
                if (now - lastDbTime < intervalMs) {
                    cooldownCache.set(cacheKey, lastDbTime); // Sync cache
                    return;
                }
            }
            // Award Money
            const amount = Math.floor(Math.random() * (config.chatMoneyMax - config.chatMoneyMin + 1)) + config.chatMoneyMin;
            // Perform update
            // We use depositToWallet logic manually or call separate updates to avoid race conditions with time check? 
            // Better to do a transaction or sequential updates.
            // Using depositToWallet is safe enough. 
            // We explicitly set earned=true (though depositToWallet default is false, we should ideally pass true or use a specific type)
            // But requirement says "silently added".
            // depositToWallet signature: (walletId: string, amount: number, meta: any = {}, earned = false, guildId?: string)
            await (0, walletService_1.depositToWallet)(user.wallet.id, amount, { source: "chat_money", channelId: message.channel.id }, true, guildId);
            // Update lastChatMoney
            await prisma_1.default.user.update({
                where: { id: user.id },
                data: { lastChatMoney: new Date() }
            });
            // Update cache
            cooldownCache.set(cacheKey, now);
            // Log
            if (config.logChannelId) {
                // We construct a silent log
                // logToChannel signature: (client: Client, log: LogData)
                // We shouldn't await this to avoid slowing down the bot? actually logs are fire-and-forget usually or fast
                (0, discordLogger_1.logToChannel)(client, {
                    guild: message.guild,
                    type: "ECONOMY",
                    title: "Chat Money Earned",
                    description: `**User:** ${message.author.toString()} (${message.author.tag})\n**Amount:** ${config.currencyEmoji}${amount}\n**Channel:** ${message.channel.toString()}`,
                    color: 0x00FF00
                }).catch(e => console.error("Failed to log chat money:", e));
            }
        }
        catch (error) {
            console.error("Error processing chat money:", error);
        }
    });
};
exports.setupChatMoneyListener = setupChatMoneyListener;
//# sourceMappingURL=chatMoneyListener.js.map