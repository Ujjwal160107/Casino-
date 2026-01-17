
import { Client, TextChannel, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ButtonInteraction } from "discord.js";
import prisma from "../utils/prisma";
import { ensureUserAndWallet, depositToWallet } from "./walletService";
import { fmtCurrency } from "../utils/format";
import { Mascot, getEmoteUrl } from "../config/branding";
import { getGuildConfig } from "./guildConfigService";
import { logToChannel } from "../utils/discordLogger";

export const CasinoDropService = {
    // Spawn a drop in a specific channel
    spawnDrop: async (client: Client, guildId: string, channelId: string, amount: number, dropId?: string) => {
        try {
            const channel = await client.channels.fetch(channelId) as TextChannel;
            if (!channel) return;

            const config = await getGuildConfig(guildId);
            const currencyEmoji = config.currencyEmoji;

            const thumbUrl = getEmoteUrl(Mascot.Emotes.Lootbox);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.FortunaSparkle} Casino Drop!`)
                .setDescription(`${Mascot.Emotes.FortunaMoney} A money bag has been dropped! First to claim gets it!\n\n**Amount:** ${currencyEmoji} ${amount.toLocaleString('en-US')}`)
                .setColor("#FFD700")
                .setFooter({ text: "Click the button below to claim!", iconURL: client.user?.displayAvatarURL() });

            if (thumbUrl) embed.setThumbnail(thumbUrl);

            const emojiMatch = Mascot.Emotes.MoneyBag.match(/:(\d+)>/);
            const emojiId = emojiMatch ? emojiMatch[1] : "💸";

            // NEW: Fetch drop expiration from config (default 60s if not set)
            const dropExpiration = config.dropExpiration || 60;
            const expiresAt = Date.now() + (dropExpiration * 1000);

            const claimButton = new ButtonBuilder()
                .setCustomId(`casino_drop_claim_${amount}_${dropId || "manual"}_${expiresAt}`)
                .setLabel("Claim Drop")
                .setStyle(ButtonStyle.Success)
                .setEmoji(emojiId);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton);

            await channel.send({ embeds: [embed], components: [row] });

            // Update last drop time if it's a config-based drop
            if (dropId && dropId !== "manual") {
                await prisma.casinoDropConfig.update({
                    where: { id: dropId },
                    data: { lastDropAt: new Date(), messageCounter: 0 }
                }).catch(() => { });
            }

        } catch (error) {
            console.error("Error spawning casino drop:", error);
        }
    },

    // Handle claim button interaction
    handleClaim: async (interaction: ButtonInteraction) => {
        const customId = interaction.customId;
        if (!customId.startsWith("casino_drop_claim_")) return;

        const parts = customId.split("_");
        // Format: casino_drop_claim_AMOUNT_DROPID_EXPIRESAT
        const amount = parseInt(parts[3]);
        const dropId = parts[4];
        const expiresAt = parts[5] ? parseInt(parts[5]) : null;

        // Check Expiration
        if (expiresAt && Date.now() > expiresAt) {
            try {
                const expiredButton = new ButtonBuilder()
                    .setCustomId("expired")
                    .setLabel("Drop Expired")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(expiredButton);
                await interaction.update({ components: [row] });
                await interaction.followUp({ content: "Too slow! This drop has expired.", ephemeral: true });
                return;
            } catch (e) {
                return; // Already replied?
            }
        }

        // Immediate lock to prevent double claiming (race condition mitigation)
        try {
            // Disable button immediately
            const disabledButton = new ButtonBuilder()
                .setCustomId("claimed")
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(disabledButton);

            await interaction.update({ components: [row] });
        } catch (e) {
            return; // Already updated/claimed
        }

        // Award money
        try {
            const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.username);
            const config = await getGuildConfig(interaction.guildId!);

            await depositToWallet(user.wallet!.id, amount, { source: "casino_drop", dropId }, true, interaction.guildId!);

            const claimEmbed = new EmbedBuilder()
                .setColor("#00FF00")
                .setDescription(`${Mascot.Emotes.Success} **${interaction.user.username}** claimed the drop of **${config.currencyEmoji} ${amount.toLocaleString('en-US')}**!`);

            await interaction.followUp({ embeds: [claimEmbed] });

            // LOGGING
            if (interaction.guild) {
                await logToChannel(interaction.client, {
                    guild: interaction.guild,
                    type: "ECONOMY",
                    title: "Casino Drop Claimed",
                    description: `**User:** ${interaction.user.toString()}\n**Amount:** ${config.currencyEmoji} ${amount.toLocaleString('en-US')}\n**Channel:** ${interaction.channel?.toString()}`,
                    color: 0x00FF00,
                    thumbnail: interaction.user.displayAvatarURL()
                });
            }

        } catch (e) {
            console.error("Failed to award drop money:", e);
            await interaction.followUp({ content: "Failed to process reward. Contact admin.", ephemeral: true });
            return;
        }
    },

    // Check and trigger scheduled/interval drops
    processDrops: async (client: Client) => {
        const now = new Date();
        const currentHm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // "13:00"

        const configs = await prisma.casinoDropConfig.findMany();

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
                } else if (config.type === "INTERVAL" && config.interval) {
                    const lastDrop = config.lastDropAt || config.createdAt;
                    const nextDrop = new Date(lastDrop.getTime() + config.interval * 60000);
                    if (now >= nextDrop) shouldDrop = true;
                } else if (config.type === "RANDOM" && config.minInterval && config.maxInterval) {
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
                    const requiredMinutes = config.interval || config.minInterval!;
                    // Assumption: For RANDOM type, we store the *next wait time* in `interval` during the previous drop handling.

                    const diffMinutes = (now.getTime() - lastDrop.getTime()) / 60000;
                    if (diffMinutes >= requiredMinutes) shouldDrop = true;
                }

                if (shouldDrop) {
                    // Calculate amount
                    const amount = Math.floor(Math.random() * (config.maxAmount - config.minAmount + 1)) + config.minAmount;

                    await CasinoDropService.spawnDrop(client, config.guildId, config.channelId, amount, config.id);

                    // Post-drop updates
                    let nextInterval = config.interval;
                    if (config.type === "RANDOM") {
                        nextInterval = Math.floor(Math.random() * (config.maxInterval! - config.minInterval! + 1)) + config.minInterval!;
                    }

                    await prisma.casinoDropConfig.update({
                        where: { id: config.id },
                        data: {
                            lastDropAt: now,
                            interval: nextInterval // Update for next random wait
                        }
                    });
                }
            } catch (e) {
                console.error(`Error processing drop config ${config.id}:`, e);
            }
        }
    },

    // Handle message count drops
    incrementMessageCount: async (client: Client, guildId: string, channelId: string) => {
        // Find configs for this channel with MESSAGE_COUNT type
        const configs = await prisma.casinoDropConfig.findMany({
            where: {
                guildId,
                channelId, // User said "drop channel set". Does message count apply to messages in THAT channel or ANY?
                // "Automatic drop after set number of messages in the channel" -> implies specific channel.
                type: "MESSAGE_COUNT"
            }
        });

        for (const config of configs) {
            if (!config.messageCount) continue;

            // Optimistic update to avoid reading too much?
            // We already have the config.
            const newCount = config.messageCounter + 1;

            if (newCount >= config.messageCount) {
                const amount = Math.floor(Math.random() * (config.maxAmount - config.minAmount + 1)) + config.minAmount;
                await CasinoDropService.spawnDrop(client, guildId, channelId, amount, config.id);

                await prisma.casinoDropConfig.update({
                    where: { id: config.id },
                    data: { messageCounter: 0, lastDropAt: new Date() }
                });
            } else {
                // To reduce DB writes, maybe update probability? Or just update every time (easiest logic, but heavy on high traffic)
                // For now, update every time.
                await prisma.casinoDropConfig.update({
                    where: { id: config.id },
                    data: { messageCounter: newCount }
                });
            }
        }
    }
};
