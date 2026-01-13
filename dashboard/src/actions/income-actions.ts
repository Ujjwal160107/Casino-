"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getGuildRoles as fetchGuildRoles } from "@/lib/discord";

export async function getIncomeSettings(guildId: string) {
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });

    // Fetch dynamic income configs for beg, slut, crime
    const incomeConfigs = await prisma.incomeConfig.findMany({
        where: {
            guildId,
            commandKey: { in: ["beg", "slut", "crime"] }
        }
    });

    const roles = await fetchGuildRoles(guildId);

    const getCmdConfig = (key: string) => incomeConfigs.find(c => c.commandKey === key) || {
        minPay: 10, maxPay: 50, cooldown: 60, successPct: 100, failPenaltyPct: 50,
        successMessages: [], failMessages: []
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
            jailFine: config?.jailFine ?? 1000
        },
        quests: {
            questPay: config?.questPay ?? 2500,
            questXp: config?.questXp ?? 100
        },
        roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color }))
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
}) {
    try {
        // Extract only the allowed fields to prevent "id" or other system fields from being passed
        const { minPay, maxPay, cooldown, successPct, failPenaltyPct, successMessages, failMessages, jailTime, jailFine } = data;
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
}) {
    try {
        await prisma.guildConfig.update({
            where: { guildId },
            data: { ...data }
        });
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
