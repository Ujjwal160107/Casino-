import { getGuildSettings } from "../../services/guildSettingsService";
import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureBankingUser } from "../../services/bankService";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { ROB_CONFIG, MAX_SAFE_BALANCE, DEFAULT_JAIL_TIME_SECONDS, TAX_CONFIG } from "../../utils/economyConfig";
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
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency } from "../../utils/format";
import { redisService } from "../../services/redisService";
import { notifyRobbed, notifyPadlockUsed } from "../../services/dmNoticeService";
import { applyEconomyPenalty } from "../../services/penaltyService";
import { addCrimeHeat } from "../../services/taxService";
import { resolvePlayerTarget } from "../../utils/playerTarget";

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
    return Math.random() * (max - min) + min;
}

export async function handleRob(message: Message, args: string[]) {
    if (!message.guild) {
        return message.reply(v2Reply(errorContainer("Server Only", "Robbing only works inside a server.")));
    }

    // The economy is global, so without these two gates a player could rob
    // anyone who has ever used the bot -- by user ID, from a server the victim
    // has never joined. Robbing is now confined to people you actually share
    // this server with, and only where the server allows it at all.
    const settings = await getGuildSettings(message.guild.id);
    const prefix = settings.prefix || "!";
    if (!settings.robEnabled) {
        return message.reply(v2Reply(errorContainer(
            "Robbing Disabled",
            `Robbing is turned off in this server. An admin can allow it with \`${prefix}setrob on\`.`,
        )));
    }

    const resolved = await resolvePlayerTarget(message, args[0], { verb: "Rob", bot: "Bots are broke." });
    if ("error" in resolved) {
        return message.reply(v2Reply(errorContainer("Error", resolved.error)));
    }
    const target = resolved;
    if (target.id === message.author.id) return message.reply(v2Reply(errorContainer("Error", "You cannot rob yourself.")));

    // A single-member REST fetch, which works without the privileged
    // GuildMembers intent -- only the bulk member list needs that. Also gives
    // the server nickname, which members.cache cannot supply any more.
    const targetMember = await message.guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
        return message.reply(v2Reply(errorContainer(
            "Not In This Server",
            `**${target.name}** isn't in this server. You can only rob people you share a server with.`,
        )));
    }
    target.name = targetMember.displayName;

    const jail = await checkJailStatus(message.author.id);
    if (jail.isJailed) {
        return message.reply(
            v2Reply(errorContainer("Incarcerated", `You cannot rob while jailed. Use \`/bail\` or wait for release.`))
        );
    }

    // Checked before the cooldown is reserved: an empty wallet has nothing to
    // steal, and finding that out mid-robbery burned the cooldown on an error.
    const targetWallet = await prisma.wallet.findUnique({ where: { userId: target.id } });
    if (!targetWallet || targetWallet.balance <= 0) {
        return message.reply(v2Reply(errorContainer("Nothing to Steal", `**${target.name}** has nothing in their wallet.`)));
    }

    const cooldown = await checkCooldown(message.author.id, "rob");
    if (cooldown.active && cooldown.expiresAt) {
        return message.reply(
            v2Reply(errorContainer("Cooldown", `Wait ${formatDiscordRelativeTime(cooldown.expiresAt)}.`))
        );
    }

    const reserved = await setCooldown(message.author.id, "rob", ROB_CONFIG.cooldownSeconds);
    if (reserved.active && reserved.expiresAt) {
        return message.reply(
            v2Reply(errorContainer("Cooldown", `Wait ${formatDiscordRelativeTime(reserved.expiresAt)}.`))
        );
    }

    await ensureBankingUser(message.author.id, message.author.username);
    await ensureBankingUser(target.id, target.name);

    const victimPadlocked = await checkPadlock(target.id);
    if (victimPadlocked) {
        void notifyPadlockUsed(
            message.client,
            target.id,
            message.member?.displayName ?? message.author.username,
            message.guild?.name ?? null,
        );
        return message.reply(
            v2Reply(errorContainer("Robbery Blocked!", `**${target.name}** has a **Padlock** active — their wallet is protected. Your attempt was foiled.`))
        );
    }

    const craftedDefense = await redisService.get<{ active: boolean }>(`crafted_rob_defense:${target.id}`);
    if (craftedDefense?.active) {
        await redisService.del(`crafted_rob_defense:${target.id}`);
        return message.reply(
            v2Reply(errorContainer("Robbery Blocked!", `**${target.name}** had Crocodile Hide Armor active. It blocked your robbery attempt.`))
        );
    }

    // Pre-fetch all item states before success roll
    const [eclipseActive, demonicVuln] = await Promise.all([
        checkEclipseMask(message.author.id),       // consumed here regardless of outcome
        checkDemonicVulnerability(target.id),   // not consumed, just checked
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
                tx.user.findUnique({ where: { discordId: target.id }, include: { wallet: true } })
            ]);

            if (!robber?.wallet) throw new Error("Robber wallet not found.");
            // The victim can empty their wallet after the pre-check: an
            // expected outcome, so reply with it instead of throwing.
            if (!victim?.wallet || victim.wallet.balance <= 0) {
                return { blocked: `**${target.name}** emptied their wallet before you could grab anything.` };
            }

            const requestedSteal = Math.floor(victim.wallet.balance * percent * robMult);
            const availableSpace = Math.max(0, MAX_SAFE_BALANCE - robber.wallet.balance);
            const robAmount = Math.min(requestedSteal, availableSpace);
            if (robAmount <= 0) {
                return {
                    blocked: availableSpace <= 0
                        ? "Your wallet is at the maximum balance limit."
                        : `**${target.name}** had too little in their wallet to steal.`,
                };
            }

            await tx.wallet.update({ where: { id: victim.wallet.id }, data: { balance: { decrement: robAmount } } });
            await tx.transaction.create({ data: { walletId: victim.wallet.id, amount: -robAmount, type: "robbed_by", meta: { robber: robber.discordId, percent } } });
            const updatedWallet = await tx.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { increment: robAmount } } });
            await tx.transaction.create({ data: { walletId: robber.wallet.id, amount: robAmount, type: "rob_win", meta: { victim: victim.discordId, percent }, isEarned: true } });

            return { robAmount, updatedWallet, percent };
        });

        if ("blocked" in result) {
            return message.reply(v2Reply(errorContainer("Nothing to Steal", result.blocked)));
        }

        void notifyRobbed(
            message.client,
            target.id,
            message.member?.displayName ?? message.author.username,
            result.robAmount,
            message.guild?.name ?? null,
        );

        const heat = await addCrimeHeat(message.author.id, TAX_CONFIG.robSuccessHeatGain);

        return message.reply(
            v2Reply(
                successContainer(
                    "Robbery Successful!",
                    `Stole **${fmtCurrency(result.robAmount)}** from **${target.name}**!\nWallet: **${fmtCurrency(result.updatedWallet.balance)}**\nHeat: **${heat}**${craftedRobBoost ? "\n\nWolf Fang Dagger boosted the loot." : ""}`,
                    { hint: nextStepHint("rob_success") },
                ),
            ),
        );
    }

    // Failure path — fine is a multiple of what this attempt would have
    // stolen, so getting caught always costs more than succeeding would
    // have earned.
    const victimForFine = await prisma.wallet.findUnique({ where: { userId: target.id } });
    const hypotheticalSteal = Math.floor((victimForFine?.balance ?? 0) * percent);
    const basePenalty = Math.max(ROB_CONFIG.failFineMinimum, Math.floor(hypotheticalSteal * ROB_CONFIG.failFineMultiplier));
    const crownLoss = await checkCrownOfGreed(message.author.id);

    let penalty = Math.floor(basePenalty * crownLoss);
    // Eclipse mask extra penalty on failure
    if (eclipseActive) {
        const extraPenalty = randomInt(300_000, 900_000);
        penalty += extraPenalty;
    }

    const result = await applyEconomyPenalty(
        message.author.id,
        message.author.username,
        penalty,
        "rob_fine",
        { command: "rob", victim: target.id, basePenalty, eclipseBacklash: eclipseActive },
        message.guildId ?? undefined,
    );

    await recordPotentialSoulLedgerLoss(message.author.id, result.totalPenalty);
    const releaseTime = await jailUser(message.author.id, message.guildId!, DEFAULT_JAIL_TIME_SECONDS);
    const heat = await addCrimeHeat(message.author.id, TAX_CONFIG.robFailureHeatGain);

    const eclipseNote = eclipseActive ? "\n\nThe Eclipse Mask's backlash added an extra penalty." : "";
    return message.reply(
        v2Reply(
            errorContainer(
                "Caught!",
                `The robbery failed and cost you **${fmtCurrency(result.totalPenalty)}**.${eclipseNote}\nYou've been thrown in jail — released ${formatDiscordRelativeTime(releaseTime)}.\nWallet: **${fmtCurrency(result.newWalletBalance)}**\nBank: **${fmtCurrency(result.newBankBalance)}${result.newBankBalance < 0 ? " (Debt)" : ""}**\nHeat: **${heat}**`,
            ),
        ),
    );
}
