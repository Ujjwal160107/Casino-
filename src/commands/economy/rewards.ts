
import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { fmtCurrency, formatDuration } from "../../utils/format";

type RewardType = "daily" | "weekly" | "monthly";

const REWARD_CONFIG = {
    daily: {
        amountField: "dailyAmount",
        lastField: "lastDaily",
        interval: 86400000,
        name: "Daily",
    },
    weekly: {
        amountField: "weeklyAmount",
        lastField: "lastWeekly",
        interval: 7 * 86400000,
        name: "Weekly",
    },
    monthly: {
        amountField: "monthlyAmount",
        lastField: "lastMonthly",
        interval: 30 * 86400000,
        name: "Monthly",
    },
} as const;

export async function handleReward(message: Message, type: RewardType) {
    const { author, guildId } = message;
    if (!guildId) return;

    const config = await getGuildConfig(guildId);
    const rewardConfig = REWARD_CONFIG[type];

    const user = await ensureUserAndWallet(author.id, guildId, author.username);

    const lastClaim = user[rewardConfig.lastField as keyof typeof user] as Date | null;
    const now = Date.now();

    if (lastClaim && now - lastClaim.getTime() < rewardConfig.interval) {
        const timeLeft = rewardConfig.interval - (now - lastClaim.getTime());
        const timeString = formatDuration(timeLeft);

        return message.reply({
            embeds: [errorEmbed(author, "Cooldown", `You have already claimed your ${rewardConfig.name} reward.\nCome back in **${timeString}**.`)]
        });
    }

    const amount = config[rewardConfig.amountField as keyof typeof config] as number;

    let retries = 3;
    while (retries > 0) {
        try {
            await prisma.$transaction([
                prisma.user.update({
                    where: { id: user.id },
                    data: { [rewardConfig.lastField]: new Date() },
                }),
                prisma.wallet.update({
                    where: { id: user.wallet!.id },
                    data: { balance: { increment: amount } },
                }),
                prisma.transaction.create({
                    data: {
                        walletId: user.wallet!.id,
                        amount: amount,
                        type: `${type}_reward`,
                        meta: { source: "system" },
                        isEarned: true
                    }
                })
            ]);
            break; // Success
        } catch (error: any) {
            if (error.code === 'P2034' && retries > 1) {
                retries--;
                await new Promise(r => setTimeout(r, 200)); // Wait 200ms before retry
                continue;
            }
            throw error; // associated with other errors or out of retries
        }
    }

    return message.reply({
        embeds: [successEmbed(author, `${rewardConfig.name} Reward Claimed!`, `You claimed your ${rewardConfig.name} reward of **${fmtCurrency(amount, config.currencyEmoji)}**!`)]
    });
}
