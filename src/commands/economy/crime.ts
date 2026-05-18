import { Message } from "discord.js";
import { GRINDING_COMMANDS } from "../../utils/economyConfig";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { addBalance, removeBalance } from "../../services/walletService";
import { checkLuckyCoin } from "../../services/shopBuffs";
import { addCrimeHeat, getHeatLevel } from "../../services/taxService";
import { TAX_CONFIG } from "../../utils/economyConfig";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";

const CRIME_WIN_MESSAGES = [
    "You cracked a luxury safe and escaped with **{amount}**.",
    "You ran a counterfeit coupon empire and cleared **{amount}**.",
    "You lifted a briefcase from the wrong VIP and found **{amount}** inside.",
    "You hacked a shady terminal and skimmed **{amount}**.",
    "You made the perfect getaway and pocketed **{amount}**."
];

const CRIME_FINE_MESSAGES = [
    "You tripped an alarm and paid **{amount}** to make the problem disappear.",
    "You got caught on camera and settled it for **{amount}**.",
    "Security had receipts. The fine cost you **{amount}**.",
    "Your getaway plan collapsed and cleanup cost **{amount}**.",
    "The job went sideways. Damage control drained **{amount}**."
];

const CRIME_LOSS_MESSAGES = [
    "You found the vault, but it was already empty.",
    "You dressed for the heist and forgot the plan.",
    "You panicked at the worst possible moment and ran.",
    "The target was too hot, so you walked away with nothing.",
    "You spent the night casing the place and learned absolutely nothing useful."
];

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomMessage(messages: string[], amount?: number) {
    const message = messages[Math.floor(Math.random() * messages.length)];
    return amount === undefined ? message : message.replace("{amount}", fmtCurrency(amount));
}

export async function handleCrime(message: Message) {
    const config = GRINDING_COMMANDS.crime;
    const cooldown = await checkCooldown(message.author.id, config.commandName);

    if (cooldown.active && cooldown.expiresAt) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Cooldown Active", `You can commit another crime ${formatDiscordRelativeTime(cooldown.expiresAt)}.`)]
        });
    }

    const reserved = await setCooldown(message.author.id, config.commandName, config.cooldownSeconds);
    if (reserved.active && reserved.expiresAt) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Cooldown Active", `You can commit another crime ${formatDiscordRelativeTime(reserved.expiresAt)}.`)]
        });
    }

    const won = Math.random() < config.winRate;

    if (won) {
        const luckyCoinMult = await checkLuckyCoin(message.author.id);
        const amount = Math.floor(randomInt(config.payoutMin, config.payoutMax) * luckyCoinMult);
        const result = await addBalance(message.author.id, message.author.username, amount, "crime_income", { command: "crime" }, true);
        const capNotice = result.capped ? "\n\nYour wallet hit the global safety cap, so part of this payout was withheld." : "";

        await addCrimeHeat(message.author.id);
        const heat = await getHeatLevel(message.author.id);

        const embed = successEmbed(
            message.author,
            "Crime Successful",
            `${randomMessage(CRIME_WIN_MESSAGES, result.appliedAmount)}${capNotice}`
        ).addFields({ name: "Global Wallet", value: fmtCurrency(result.newBalance), inline: true });

        if (heat >= TAX_CONFIG.raidHeatThreshold * 0.7) {
            embed.addFields({ name: "🌡️ Heat", value: "Your activity is drawing attention...", inline: true });
        }

        return message.reply({ embeds: [embed] });
    }

    const fine = randomInt(config.fineMin, config.fineMax);
    const result = await removeBalance(message.author.id, fine, "crime_fine", { command: "crime" });
    const baseDescription = result.removedAmount > 0
        ? randomMessage(CRIME_FINE_MESSAGES, result.removedAmount)
        : randomMessage(CRIME_LOSS_MESSAGES);
    const description = result.removedAmount < fine
        ? `${baseDescription}\n\nYou could not cover the full ${fmtCurrency(fine)} penalty, so your wallet was drained to zero.`
        : baseDescription;

    const embed = errorEmbed(message.author, "Crime Failed", description)
        .addFields({ name: "Global Wallet", value: fmtCurrency(result.newBalance), inline: true });

    return message.reply({ embeds: [embed] });
}
