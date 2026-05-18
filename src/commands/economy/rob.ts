import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureBankingUser } from "../../services/bankService";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { ROB_CONFIG, MAX_SAFE_BALANCE } from "../../utils/economyConfig";
import { checkLuckyCoin, checkThiefGloves, checkPadlock } from "../../services/shopBuffs";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

export async function handleRob(message: Message, args: string[]) {
    const targetUser = message.mentions.members?.first();
    if (!targetUser) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Mention a user to rob.")] });
    if (targetUser.id === message.author.id) return message.reply({ embeds: [errorEmbed(message.author, "Error", "You cannot rob yourself.")] });
    if (targetUser.user.bot) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Bots are broke.")] });

    const cooldown = await checkCooldown(message.author.id, "rob");
    if (cooldown.active && cooldown.expiresAt) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Cooldown", `Wait ${formatDiscordRelativeTime(cooldown.expiresAt)}.`)]
        });
    }

    const reserved = await setCooldown(message.author.id, "rob", ROB_CONFIG.cooldownSeconds);
    if (reserved.active && reserved.expiresAt) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Cooldown", `Wait ${formatDiscordRelativeTime(reserved.expiresAt)}.`)]
        });
    }

    await ensureBankingUser(message.author.id, message.author.username);
    await ensureBankingUser(targetUser.id, targetUser.user.username);

    const victimPadlocked = await checkPadlock(targetUser.id);
    if (victimPadlocked) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Robbery Blocked!", `🔒 **${targetUser.displayName}** has a **Padlock** active — their wallet is protected. Your attempt was foiled.`)]
        });
    }

    const success = Math.random() < ROB_CONFIG.successRate;

    if (success) {
        const [luckyCoinMult, thiefMult] = await Promise.all([
            checkLuckyCoin(message.author.id),
            checkThiefGloves(message.author.id),
        ]);
        const robMult = luckyCoinMult * thiefMult;

        const result = await prisma.$transaction(async (tx) => {
            const [robber, victim] = await Promise.all([
                tx.user.findUnique({ where: { discordId: message.author.id }, include: { wallet: true } }),
                tx.user.findUnique({ where: { discordId: targetUser.id }, include: { wallet: true } })
            ]);

            if (!robber?.wallet) throw new Error("Robber wallet not found.");
            if (!victim?.wallet || victim.wallet.balance <= 0) throw new Error("Target has no money.");

            const percent = randomFloat(ROB_CONFIG.stealPctMin, ROB_CONFIG.stealPctMax);
            const requestedSteal = Math.floor(victim.wallet.balance * percent * robMult);
            const capSteal = Math.min(requestedSteal, ROB_CONFIG.stealCap);
            const availableSpace = Math.max(0, MAX_SAFE_BALANCE - robber.wallet.balance);
            const robAmount = Math.min(capSteal, availableSpace);
            if (robAmount <= 0) throw new Error("Your wallet is at the global safety cap.");

            await tx.wallet.update({ where: { id: victim.wallet.id }, data: { balance: { decrement: robAmount } } });
            await tx.transaction.create({ data: { walletId: victim.wallet.id, amount: -robAmount, type: "robbed_by", meta: { robber: robber.discordId, percent } } });
            const updatedWallet = await tx.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { increment: robAmount } } });
            await tx.transaction.create({ data: { walletId: robber.wallet.id, amount: robAmount, type: "rob_win", meta: { victim: victim.discordId, percent }, isEarned: true } });

            return { robAmount, updatedWallet, percent };
        });

        return message.reply({
            embeds: [successEmbed(message.author, "Robbery Successful!", `Stole **${fmtCurrency(result.robAmount)}** from **${targetUser.displayName}**!\nGlobal Wallet: **${fmtCurrency(result.updatedWallet.balance)}**`)]
        });
    }

    const penalty = randomInt(ROB_CONFIG.failPenaltyMin, ROB_CONFIG.failPenaltyMax);
    const result = await prisma.$transaction(async (tx) => {
        const robber = await tx.user.findUnique({ where: { discordId: message.author.id }, include: { wallet: true } });
        if (!robber?.wallet) throw new Error("Wallet not found.");

        const actualPenalty = Math.min(penalty, robber.wallet.balance);
        const updatedWallet = actualPenalty > 0
            ? await tx.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { decrement: actualPenalty } } })
            : robber.wallet;

        if (actualPenalty > 0) {
            await tx.transaction.create({ data: { walletId: robber.wallet.id, amount: -actualPenalty, type: "rob_fine", meta: { victim: targetUser.id, requestedPenalty: penalty } } });
        }

        return { actualPenalty, updatedWallet };
    });

    return message.reply({
        embeds: [errorEmbed(message.author, "Caught!", `The robbery failed and cost you **${fmtCurrency(result.actualPenalty)}**.\nGlobal Wallet: **${fmtCurrency(result.updatedWallet.balance)}**`)]
    });
}
