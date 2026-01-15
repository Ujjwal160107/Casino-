"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CasinoDropService = void 0;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../utils/prisma"));
const walletService_1 = require("./walletService");
const branding_1 = require("../config/branding");
const guildConfigService_1 = require("./guildConfigService");
const discordLogger_1 = require("../utils/discordLogger");
exports.CasinoDropService = {
    // Spawn a drop in a specific channel
    spawnDrop: async (client, guildId, channelId, amount, dropId) => {
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel)
                return;
            const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
            const currencyEmoji = config.currencyEmoji;
            const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Lootbox);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.FortunaSparkle} Casino Drop!`)
                .setDescription(`${branding_1.Mascot.Emotes.FortunaMoney} A money bag has been dropped! First to claim gets it!\n\n**Amount:** ${currencyEmoji} ${amount.toLocaleString('en-US')}`)
                .setColor("#FFD700")
                .setFooter({ text: "Click the button below to claim!", iconURL: client.user?.displayAvatarURL() });
            if (thumbUrl)
                embed.setThumbnail(thumbUrl);
            const emojiMatch = branding_1.Mascot.Emotes.MoneyBag.match(/:(\d+)>/);
            const emojiId = emojiMatch ? emojiMatch[1] : "💸";
            const claimButton = new discord_js_1.ButtonBuilder()
                .setCustomId(`casino_drop_claim_${amount}_${dropId || "manual"}`)
                .setLabel("Claim Drop")
                .setStyle(discord_js_1.ButtonStyle.Success)
                .setEmoji(emojiId);
            const row = new discord_js_1.ActionRowBuilder().addComponents(claimButton);
            await channel.send({ embeds: [embed], components: [row] });
            // Update last drop time if it's a config-based drop
            if (dropId && dropId !== "manual") {
                await prisma_1.default.casinoDropConfig.update({
                    where: { id: dropId },
                    data: { lastDropAt: new Date(), messageCounter: 0 }
                }).catch(() => { });
            }
        }
        catch (error) {
            console.error("Error spawning casino drop:", error);
        }
    },
    // Handle claim button interaction
    handleClaim: async (interaction) => {
        const customId = interaction.customId;
        if (!customId.startsWith("casino_drop_claim_"))
            return;
        const parts = customId.split("_");
        const amount = parseInt(parts[3]);
        const dropId = parts[4] || "manual";
        // Immediate lock to prevent double claiming (race condition mitigation)
        try {
            // Disable button immediately
            const disabledButton = new discord_js_1.ButtonBuilder()
                .setCustomId("claimed")
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(discord_js_1.ButtonStyle.Secondary)
                .setDisabled(true);
            const row = new discord_js_1.ActionRowBuilder().addComponents(disabledButton);
            await interaction.update({ components: [row] });
        }
        catch (e) {
            return; // Already updated/claimed
        }
        // Award money
        try {
            const user = await (0, walletService_1.ensureUserAndWallet)(interaction.user.id, interaction.guildId, interaction.user.username);
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            await (0, walletService_1.depositToWallet)(user.wallet.id, amount, { source: "casino_drop", dropId }, true, interaction.guildId);
            const claimEmbed = new discord_js_1.EmbedBuilder()
                .setColor("#00FF00")
                .setDescription(`${branding_1.Mascot.Emotes.Success} **${interaction.user.username}** claimed the drop of **${config.currencyEmoji} ${amount.toLocaleString('en-US')}**!`);
            await interaction.followUp({ embeds: [claimEmbed] });
            // LOGGING
            if (interaction.guild) {
                await (0, discordLogger_1.logToChannel)(interaction.client, {
                    guild: interaction.guild,
                    type: "ECONOMY",
                    title: "Casino Drop Claimed",
                    description: `**User:** ${interaction.user.toString()}\n**Amount:** ${config.currencyEmoji} ${amount.toLocaleString('en-US')}\n**Channel:** ${interaction.channel?.toString()}`,
                    color: 0x00FF00,
                    thumbnail: interaction.user.displayAvatarURL()
                });
            }
        }
        catch (e) {
            console.error("Failed to award drop money:", e);
            await interaction.followUp({ content: "Failed to process reward. Contact admin.", ephemeral: true });
            return;
        }
    },
    // Check and trigger scheduled/interval drops
    processDrops: async (client) => {
        const now = new Date();
        const currentHm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // "13:00"
        const configs = await prisma_1.default.casinoDropConfig.findMany();
        for (const config of configs) {
            try {
                let shouldDrop = false;
                if (config.type === "SCHEDULED" && config.scheduleTime === currentHm) {
                    // Check if already dropped today? 
                    // Simple check: if lastDropAt is today, skip.
                    const lastDrop = config.lastDropAt;
                    if (!lastDrop || lastDrop.getDate() !== now.getDate()) {
                        shouldDrop = true;
                    }
                }
                else if (config.type === "INTERVAL" && config.interval) {
                    const lastDrop = config.lastDropAt || config.createdAt;
                    const nextDrop = new Date(lastDrop.getTime() + config.interval * 60000);
                    if (now >= nextDrop)
                        shouldDrop = true;
                }
                else if (config.type === "RANDOM" && config.minInterval && config.maxInterval) {
                    // Logic: If (now - lastDrop) > random_interval, drop.
                    // But "random_interval" needs to be consistent or recalculated?
                    // Easier approach: If (now - lastDrop) > maxInterval, force drop. 
                    // Or calculate dynamic next drop time and store it?
                    // For now, let's use a simple randomized check if minInterval passed? No that's too frequent.
                    // Better: Store nextDrop time in DB? Or just check if (now - lastDrop) > random(min, max).
                    // But random changes every check.
                    // Proper way: When a drop happens, Calculate Next Drop Time and store it.
                    // Since we don't have NextDropTime column, we'll use a deterministic approach or add column.
                    // Let's stick to: If (now - lastDrop) > set_interval.
                    // Wait, user said "Random but configured - drop money every time after 30 min to 1 hour".
                    // We can just check if lastDrop was > 30 mins ago. AND Math.random() < probability?
                    // Or standard approach: average interval.
                    // Only robust way without new column: 
                    // Just use average? No.
                    // Let's rely on simple (now - last) > random(min, max)? No that re-rolls every minute.
                    // Let's just pick a random time between min and max relative to last drop?
                    // We need persistance. 
                    // Hack: Use `interval` column to store the *next* required duration?
                    // When drop occurs: set `interval` = random(min, max).
                    // Then check if (now - lastDrop) > `interval`.
                    const lastDrop = config.lastDropAt || config.createdAt;
                    const requiredMinutes = config.interval || config.minInterval;
                    // Assumption: For RANDOM type, we store the *next wait time* in `interval` during the previous drop handling.
                    const diffMinutes = (now.getTime() - lastDrop.getTime()) / 60000;
                    if (diffMinutes >= requiredMinutes)
                        shouldDrop = true;
                }
                if (shouldDrop) {
                    // Calculate amount
                    const amount = Math.floor(Math.random() * (config.maxAmount - config.minAmount + 1)) + config.minAmount;
                    await exports.CasinoDropService.spawnDrop(client, config.guildId, config.channelId, amount, config.id);
                    // Post-drop updates
                    let nextInterval = config.interval;
                    if (config.type === "RANDOM") {
                        nextInterval = Math.floor(Math.random() * (config.maxInterval - config.minInterval + 1)) + config.minInterval;
                    }
                    await prisma_1.default.casinoDropConfig.update({
                        where: { id: config.id },
                        data: {
                            lastDropAt: now,
                            interval: nextInterval // Update for next random wait
                        }
                    });
                }
            }
            catch (e) {
                console.error(`Error processing drop config ${config.id}:`, e);
            }
        }
    },
    // Handle message count drops
    incrementMessageCount: async (client, guildId, channelId) => {
        // Find configs for this channel with MESSAGE_COUNT type
        const configs = await prisma_1.default.casinoDropConfig.findMany({
            where: {
                guildId,
                channelId, // User said "drop channel set". Does message count apply to messages in THAT channel or ANY?
                // "Automatic drop after set number of messages in the channel" -> implies specific channel.
                type: "MESSAGE_COUNT"
            }
        });
        for (const config of configs) {
            if (!config.messageCount)
                continue;
            // Optimistic update to avoid reading too much?
            // We already have the config.
            const newCount = config.messageCounter + 1;
            if (newCount >= config.messageCount) {
                const amount = Math.floor(Math.random() * (config.maxAmount - config.minAmount + 1)) + config.minAmount;
                await exports.CasinoDropService.spawnDrop(client, guildId, channelId, amount, config.id);
                await prisma_1.default.casinoDropConfig.update({
                    where: { id: config.id },
                    data: { messageCounter: 0, lastDropAt: new Date() }
                });
            }
            else {
                // To reduce DB writes, maybe update probability? Or just update every time (easiest logic, but heavy on high traffic)
                // For now, update every time.
                await prisma_1.default.casinoDropConfig.update({
                    where: { id: config.id },
                    data: { messageCounter: newCount }
                });
            }
        }
    }
};
//# sourceMappingURL=casinoDropService.js.map