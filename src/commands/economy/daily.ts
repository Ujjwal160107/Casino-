import { Message } from "discord.js";
import { TIME_GATED_REWARDS } from "../../utils/economyConfig";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { addBalance } from "../../services/walletService";
import { checkCounterfeitKit, checkCrownOfGreed, checkDevilContract } from "../../services/shopBuffs";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency } from "../../utils/format";

export async function handleDaily(message: Message) {
    const reward = TIME_GATED_REWARDS.daily;
    const cooldown = await checkCooldown(message.author.id, reward.commandName);

    if (cooldown.active && cooldown.expiresAt) {
        return message.reply(v2Reply(errorContainer("Daily Cooldown", `You already claimed your daily reward. Come back ${formatDiscordRelativeTime(cooldown.expiresAt)}.`)));
    }

    const reserved = await setCooldown(message.author.id, reward.commandName, reward.cooldownSeconds);
    if (reserved.active && reserved.expiresAt) {
        return message.reply(v2Reply(errorContainer("Daily Cooldown", `You already claimed your daily reward. Come back ${formatDiscordRelativeTime(reserved.expiresAt)}.`)));
    }

    const counterfeitMult = await checkCounterfeitKit(message.author.id);
    const crownMult = await checkCrownOfGreed(message.author.id);
    const devilReduction = await checkDevilContract(message.author.id);
    const amount = Math.floor(reward.amount * counterfeitMult * crownMult * devilReduction);
    const result = await addBalance(message.author.id, message.author.username, amount, "daily_reward", { command: reward.commandName }, true);
    const { questBus } = require("../../services/questEvents");
    questBus.emit("social:claim_daily", { discordId: message.author.id });
    const capNotice = result.capped ? "\n\nYour wallet is at the maximum balance limit, so only part of the reward could be added." : "";

    const container = successContainer(
        "Daily Reward Claimed!",
        `You claimed **${fmtCurrency(result.appliedAmount)}** from your daily reward.${capNotice}\n**Wallet:** ${fmtCurrency(result.newBalance)}`,
        { hint: nextStepHint("daily") }
    );

    return message.reply(v2Reply(container));
}
