import { Message } from "discord.js";
import { TIME_GATED_REWARDS } from "../../utils/economyConfig";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { addBalance } from "../../services/walletService";
import { checkCounterfeitKit, checkCrownOfGreed, checkDevilContract } from "../../services/shopBuffs";
import { applyIncomeTax } from "../../services/taxService";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency } from "../../utils/format";

export async function handleMonthly(message: Message) {
    const reward = TIME_GATED_REWARDS.monthly;
    const cooldown = await checkCooldown(message.author.id, reward.commandName);

    if (cooldown.active && cooldown.expiresAt) {
        return message.reply(
            v2Reply(errorContainer("Monthly Cooldown", `You already claimed your monthly reward. Come back ${formatDiscordRelativeTime(cooldown.expiresAt)}.`))
        );
    }

    const reserved = await setCooldown(message.author.id, reward.commandName, reward.cooldownSeconds);
    if (reserved.active && reserved.expiresAt) {
        return message.reply(
            v2Reply(errorContainer("Monthly Cooldown", `You already claimed your monthly reward. Come back ${formatDiscordRelativeTime(reserved.expiresAt)}.`))
        );
    }

    const counterfeitMult = await checkCounterfeitKit(message.author.id);
    const crownMult = await checkCrownOfGreed(message.author.id);
    const devilReduction = await checkDevilContract(message.author.id);
    const amount = Math.floor(reward.amount * counterfeitMult * crownMult * devilReduction);
    const result = await addBalance(message.author.id, message.author.username, amount, "monthly_reward", { command: reward.commandName }, true);
    const capNotice = result.capped ? "\n\nYour wallet is at the maximum balance limit, so only part of the reward could be added." : "";

    const tax = await applyIncomeTax(message.author.id, result.appliedAmount);
    const taxLine = tax.shielded
      ? "**Tax:** 🛡️ Shielded"
      : `**Tax (8%):** -${fmtCurrency(tax.taxPaid)}`;

    return message.reply(
        v2Reply(
            successContainer(
                "Monthly Reward Claimed!",
                `You claimed **${fmtCurrency(result.appliedAmount)}** from your monthly reward.${capNotice}\n\n${taxLine}\n**Wallet:** ${fmtCurrency(result.newBalance - tax.taxPaid)}`,
                { hint: nextStepHint("monthly") }
            )
        )
    );
}
