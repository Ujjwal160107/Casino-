"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getGuildRoles as fetchGuildRoles, getGuildChannels } from "@/lib/discord";

export async function getIncomeSettings(guildId: string) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });

    // Fetch dynamic income configs for beg, slut, crime
    const incomeConfigs = await prisma.incomeConfig.findMany({
        where: {
            guildId,
            commandKey: { in: ["beg", "slut", "crime"] }
        }
    });

    const [roles, channels, casinoDrops] = await Promise.all([
        fetchGuildRoles(guildId),
        getGuildChannels(guildId),
        prisma.casinoDropConfig.findMany({ where: { guildId } })
    ]);

    const disabledCommands = config?.disabledCommands || [];

    const getCmdConfig = (key: string) => {
        const cmdConfig = incomeConfigs.find(c => c.commandKey === key) || {
            minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50,
            successMessages: [], failMessages: []
        };
        return {
            ...cmdConfig,
            enabled: !disabledCommands.includes(key)
        };
    };

    return {
        rewards: {
            dailyAmount: config?.dailyAmount ?? 1000,
            weeklyAmount: config?.weeklyAmount ?? 5000,
            monthlyAmount: config?.monthlyAmount ?? 20000,
        },
        commands: {
            beg: getCmdConfig("beg"),
            slut: getCmdConfig("slut"),
            crime: getCmdConfig("crime"),
        },
        rob: {
            robSuccessPct: config?.robSuccessPct ?? 60,
            robFinePct: config?.robFinePct ?? 20,
            robCooldown: config?.robCooldown ?? 300,
            robImmuneRoles: config?.robImmuneRoles ?? [],
            jailTime: config?.jailTime ?? 600,
            jailFine: config?.jailFine ?? 1000,
            enabled: !disabledCommands.includes("rob")
        },
        quests: {
            questPay: config?.questPay ?? 2500,
            questXp: config?.questXp ?? 100
        },
        drops: casinoDrops.map(d => ({
            id: d.id,
            type: d.type,
            channelId: d.channelId,
            minAmount: d.minAmount,
            maxAmount: d.maxAmount,
            scheduleTime: d.scheduleTime,
            interval: d.interval,
        })),
        roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color })),
        channels: channels.map(c => ({ id: c.id, name: c.name }))
    };
}

export async function updateIncomeCommand(guildId: string, commandKey: string, data: {
    minPay: number;
    maxPay: number;
    cooldown: number;
    successPct: number;
    failPenaltyPct: number;
    successMessages: string[];
    failMessages: string[];
    jailTime?: number;
    jailFine?: number;
    enabled?: boolean;
}) {
    try {
        // Extract only the allowed fields to prevent "id" or other system fields from being passed
        const { minPay, maxPay, cooldown, successPct, failPenaltyPct, successMessages, failMessages, jailTime, jailFine, enabled } = data;
        const cleanData = { minPay, maxPay, cooldown, successPct, failPenaltyPct, successMessages, failMessages };

        await prisma.incomeConfig.upsert({
            where: { guildId_commandKey: { guildId, commandKey } },
            update: cleanData,
            create: { guildId, commandKey, ...cleanData }
        });

        // If jail settings provided (specifically for crime), update global config
        if (jailTime !== undefined || jailFine !== undefined) {
            await prisma.guildConfig.update({
                where: { guildId },
                data: {
                    ...(jailTime !== undefined && { jailTime }),
                    ...(jailFine !== undefined && { jailFine })
                }
            });
        }

        // Handle Enabled/Disabled Toggle
        if (enabled !== undefined) {
            const config = await prisma.guildConfig.findUnique({ where: { guildId } });
            let disabled = config?.disabledCommands || [];

            if (enabled) {
                // Remove from disabled list
                disabled = disabled.filter(c => c !== commandKey);
            } else {
                // Add to disabled list
                if (!disabled.includes(commandKey)) disabled.push(commandKey);
            }

            await prisma.guildConfig.update({
                where: { guildId },
                data: { disabledCommands: disabled }
            });
        }

        revalidatePath(`/dashboard/${guildId}/general-economy/income`);
        return { success: true };
    } catch (error: any) {
        console.error(`Failed to update ${commandKey} config:`, error);
        return { success: false, error: error.message || "Failed to update command settings" };
    }
}

export async function updateRewardAmounts(guildId: string, data: {
    dailyAmount: number;
    weeklyAmount: number;
    monthlyAmount: number;
}) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: { ...data }
        });
        revalidatePath(`/dashboard/${guildId}/general-economy/income`);
        return { success: true };
    } catch (error) {
        return { success: false, error: "Failed to update reward amounts" };
    }
}

export async function updateRobSettings(guildId: string, data: {
    robSuccessPct: number;
    robFinePct: number;
    robCooldown: number;
    robImmuneRoles: string[];
    jailTime?: number;
    jailFine?: number;
    enabled?: boolean;
}) {
    try {
        const { enabled, ...robData } = data;

        await prisma.guildConfig.update({
            where: { guildId },
            data: { ...robData }
        });

        if (enabled !== undefined) {
            const config = await prisma.guildConfig.findUnique({ where: { guildId } });
            let disabled = config?.disabledCommands || [];

            if (enabled) {
                disabled = disabled.filter(c => c !== "rob");
            } else {
                if (!disabled.includes("rob")) disabled.push("rob");
            }

            await prisma.guildConfig.update({
                where: { guildId },
                data: { disabledCommands: disabled }
            });
        }

        revalidatePath(`/dashboard/${guildId}/general-economy/income`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update rob settings:", error);
        return { success: false, error: "Failed to update rob settings" };
    }
}

export async function updateQuestSettings(guildId: string, data: {
    questPay: number;
    questXp: number;
}) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: { ...data }
        });
        revalidatePath(`/dashboard/${guildId}/general-economy/income`);
        return { success: true };
    } catch (error) {
        console.error("Failed to update quest settings:", error);
        return { success: false, error: "Failed to update quest settings" };
    }
}

export async function updateCasinoDrops(guildId: string, drops: any[]) {
    try {
        await prisma.$transaction(async (tx) => {
            await tx.casinoDropConfig.deleteMany({ where: { guildId } });
            if (drops.length > 0) {
                await tx.casinoDropConfig.createMany({
                    data: drops.map(d => ({
                        guildId,
                        type: d.type,
                        channelId: d.channelId,
                        minAmount: d.minAmount,
                        maxAmount: d.maxAmount,
                        scheduleTime: d.scheduleTime,
                        interval: d.interval,
                        currency: "Coins"
                    }))
                });
            }
        });

        revalidatePath(`/dashboard/${guildId}/general-economy/income`);
        return { success: true, error: null };
    } catch (error) {
        console.error("Failed to update drops:", error);
        return { success: false, error: "Failed to update drop settings" };
    }
}

const EMOTES = {
    FortunaSparkle: "<:fortuna_sparkle:1454885735818858691>",
    FortunaMoney: "<:fortuna_money:1454887481924386899>",
    Lootbox: "<a:lootbox:1456568977751801856>",
    MoneyBag: "<:MoneyBag:1446970451606896781>"
};

function getEmoteUrl(emote: string): string | null {
    if (!emote) return null;
    const isAnimated = emote.startsWith("<a:");
    const match = emote.match(/:(\d+)>/);
    if (match && match[1]) {
        const ext = isAnimated ? "gif" : "png";
        return `https://cdn.discordapp.com/emojis/${match[1]}.${ext}`;
    }
    return null;
}

export async function triggerManualDrop(dropId: string) {
    try {
        const drop = await prisma.casinoDropConfig.findUnique({ where: { id: dropId } });
        if (!drop) throw new Error("Drop config not found");

        const guildConfig = await prisma.guildConfig.findUnique({ where: { guildId: drop.guildId } });
        const currencyEmoji = guildConfig?.currencyEmoji || "🪙";

        // Calculate amount
        const amount = Math.floor(Math.random() * (drop.maxAmount - drop.minAmount + 1)) + drop.minAmount;

        // Construct Embed & Components
        const thumbUrl = getEmoteUrl(EMOTES.Lootbox);

        const embed = {
            title: `${EMOTES.FortunaSparkle} Casino Drop!`,
            description: `${EMOTES.FortunaMoney} A money bag has been dropped! First to claim gets it!\n\n**Amount:** ${currencyEmoji} ${amount.toLocaleString('en-US')}`,
            color: 0xFFD700,
            footer: { text: "Click the button below to claim!" },
            ...(thumbUrl && { thumbnail: { url: thumbUrl } })
        };

        const emojiMatch = EMOTES.MoneyBag.match(/:(\d+)>/);
        const emojiId = emojiMatch ? emojiMatch[1] : "💸";
        const emojiName = "MoneyBag"; // Fallback name

        // Discord Button Component
        const components = [{
            type: 1, // Action Row
            components: [{
                type: 2, // Button
                style: 3, // Success (Green)
                label: "Claim Drop",
                custom_id: `casino_drop_claim_${amount}_${dropId}`,
                emoji: { id: emojiId, name: emojiName }
            }]
        }];

        // Send to Discord via REST
        const DISCORD_API_URL = "https://discord.com/api/v10";
        if (!process.env.DISCORD_BOT_TOKEN) throw new Error("Bot token missing");

        const res = await fetch(`${DISCORD_API_URL}/channels/${drop.channelId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                embeds: [embed],
                components: components
            })
        });

        if (!res.ok) {
            const err = await res.text();
            console.error("Discord API Error:", err);
            throw new Error(`Failed to send drop: ${err}`);
        }

        // Update last dropped
        await prisma.casinoDropConfig.update({
            where: { id: dropId },
            data: { lastDropAt: new Date() }
        });

        revalidatePath(`/dashboard/${drop.guildId}/general-economy/income`);
        return { success: true };
    } catch (error: any) {
        console.error("Trigger drop error:", error);
        return { success: false, error: error.message };
    }
}
