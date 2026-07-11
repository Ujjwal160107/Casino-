import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureBankingUser } from "../../services/bankService";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { ROB_CONFIG, MAX_SAFE_BALANCE, DEFAULT_JAIL_TIME_SECONDS } from "../../utils/economyConfig";
import { checkJailStatus, jailUser } from "../../services/jailService";
import {
    checkThiefGloves,
    checkPadlock,
    applyLuckToChance,
    checkEclipseMask,
    checkDemonicVulnerability,
    checkCrownOfGreed,
    recordPotentialSoulLedgerLoss,
} from "../../services/shopBuffs";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";
import { redisService } from "../../services/redisService";

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

    const jail = await checkJailStatus(message.author.id);
    if (jail.isJailed) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Incarcerated", `You cannot rob while jailed. Use \`,bail\` or wait for release.`)]
        });
    }

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
            embeds: [errorEmbed(message.author, "Robbery Blocked!", `**${targetUser.displayName}** has a **Padlock** active — their wallet is protected. Your attempt was foiled.`)]
        });
    }

    const craftedDefense = await redisService.get<{ active: boolean }>(`crafted_rob_defense:${targetUser.id}`);
    if (craftedDefense?.active) {
        await redisService.del(`crafted_rob_defense:${targetUser.id}`);
        return message.reply({
            embeds: [errorEmbed(message.author, "Robbery Blocked!", `**${targetUser.displayName}** had Crocodile Hide Armor active. It blocked your robbery attempt.`)]
        });
    }

    // Pre-fetch all item states before success roll
    const [eclipseActive, demonicVuln] = await Promise.all([
        checkEclipseMask(message.author.id),       // consumed here regardless of outcome
        checkDemonicVulnerability(targetUser.id),   // not consumed, just checked
    ]);

    // Compute final success chance
    let successChance: number = ROB_CONFIG.successRate;
    successChance = await applyLuckToChance(message.author.id, successChance, 0.05);
    if (demonicVuln) successChance += 0.05;   // demonic vulnerability makes target easier to rob
    if (eclipseActive) successChance += 0.12; // eclipse mask bonus
    successChance = Math.min(0.85, Math.max(0.05, successChance));

    const success = Math.random() < successChance;

    // Rolled once regardless of outcome: on success it's the steal %, on
    // failure it's used to derive a fine that's guaranteed to exceed what
    // this specific attempt would have stolen.
    const percent = randomFloat(ROB_CONFIG.stealPctMin, ROB_CONFIG.stealPctMax);

    if (success) {
        const thiefMult = await checkThiefGloves(message.author.id);
        // Eclipse loot bonus (+15% on success)
        const eclipseLootMult = eclipseActive ? 1.15 : 1;
        // Demonic vulnerability optional loot boost (up to +10%)
        const demonicLootMult = demonicVuln ? 1.05 : 1;
        const craftedRobBoost = await redisService.get<{ multiplier: number }>(`crafted_rob_boost:${message.author.id}`);
        const craftedRobMult = craftedRobBoost?.multiplier ?? 1;
        const robMult = thiefMult * eclipseLootMult * demonicLootMult * craftedRobMult;
        if (craftedRobBoost) await redisService.del(`crafted_rob_boost:${message.author.id}`);
        // NOTE: Crown of Greed does NOT apply to rob proceeds (PvP transfer)

        const result = await prisma.$transaction(async (tx) => {
            const [robber, victim] = await Promise.all([
                tx.user.findUnique({ where: { discordId: message.author.id }, include: { wallet: true } }),
                tx.user.findUnique({ where: { discordId: targetUser.id }, include: { wallet: true } })
            ]);

            if (!robber?.wallet) throw new Error("Robber wallet not found.");
            if (!victim?.wallet || victim.wallet.balance <= 0) throw new Error("Target has no money.");

            const requestedSteal = Math.floor(victim.wallet.balance * percent * robMult);
            const availableSpace = Math.max(0, MAX_SAFE_BALANCE - robber.wallet.balance);
            const robAmount = Math.min(requestedSteal, availableSpace);
            if (robAmount <= 0) throw new Error("Your wallet is at the maximum balance limit.");

            await tx.wallet.update({ where: { id: victim.wallet.id }, data: { balance: { decrement: robAmount } } });
            await tx.transaction.create({ data: { walletId: victim.wallet.id, amount: -robAmount, type: "robbed_by", meta: { robber: robber.discordId, percent } } });
            const updatedWallet = await tx.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { increment: robAmount } } });
            await tx.transaction.create({ data: { walletId: robber.wallet.id, amount: robAmount, type: "rob_win", meta: { victim: victim.discordId, percent }, isEarned: true } });

            return { robAmount, updatedWallet, percent };
        });

        return message.reply({
            embeds: [successEmbed(message.author, "Robbery Successful!", `Stole **${fmtCurrency(result.robAmount)}** from **${targetUser.displayName}**!\nWallet: **${fmtCurrency(result.updatedWallet.balance)}**${craftedRobBoost ? "\n\nWolf Fang Dagger boosted the loot." : ""}`)]
        });
    }

    // Failure path — fine is a multiple of what this attempt would have
    // stolen, so getting caught always costs more than succeeding would
    // have earned.
    const victimForFine = await prisma.wallet.findUnique({ where: { userId: targetUser.id } });
    const hypotheticalSteal = Math.floor((victimForFine?.balance ?? 0) * percent);
    const basePenalty = Math.max(ROB_CONFIG.failFineMinimum, Math.floor(hypotheticalSteal * ROB_CONFIG.failFineMultiplier));
    const crownLoss = await checkCrownOfGreed(message.author.id);

    const result = await prisma.$transaction(async (tx) => {
        const robber = await tx.user.findUnique({ where: { discordId: message.author.id }, include: { wallet: true } });
        if (!robber?.wallet) throw new Error("Wallet not found.");

        let penalty = Math.floor(basePenalty * crownLoss);
        // Eclipse mask extra penalty on failure
        if (eclipseActive) {
            const extraPenalty = randomInt(300_000, 900_000);
            penalty += extraPenalty;
        }
        const actualPenalty = Math.min(penalty, robber.wallet.balance);
        const updatedWallet = actualPenalty > 0
            ? await tx.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { decrement: actualPenalty } } })
            : robber.wallet;

        if (actualPenalty > 0) {
            await tx.transaction.create({ data: { walletId: robber.wallet.id, amount: -actualPenalty, type: "rob_fine", meta: { victim: targetUser.id, requestedPenalty: basePenalty } } });
        }

        return { actualPenalty, updatedWallet };
    });

    await recordPotentialSoulLedgerLoss(message.author.id, result.actualPenalty);
    const releaseTime = await jailUser(message.author.id, message.guildId!, DEFAULT_JAIL_TIME_SECONDS);

    const eclipseNote = eclipseActive ? "\n\nThe Eclipse Mask's backlash added an extra penalty." : "";
    return message.reply({
        embeds: [errorEmbed(message.author, "Caught!", `The robbery failed and cost you **${fmtCurrency(result.actualPenalty)}**.${eclipseNote}\nYou've been thrown in jail — released ${formatDiscordRelativeTime(releaseTime)}.\nWallet: **${fmtCurrency(result.updatedWallet.balance)}**`)]
    });
}
