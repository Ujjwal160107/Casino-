import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { jailUser } from "../../services/jailService";
import { checkDynamicCooldown } from "../../utils/cooldown";
import { getIncomeConfigOrDefault } from "../../services/incomeService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { errorEmbed, successEmbed } from "../../utils/embed";

const CRIME_EMOTE = "<:fortuna_criminal:1457054253771264276>";
const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";

const CRIMES = [
    { text: "robbed a convenience store", risk: 30, min: 500, max: 2000 },
    { text: "hacked an ATM", risk: 40, min: 1000, max: 3000 },
    { text: "smuggled illegal goods", risk: 50, min: 2000, max: 5000 },
    { text: "stole a car", risk: 60, min: 3000, max: 7000 },
    { text: "robbed a bank", risk: 80, min: 10000, max: 50000 }
];

export async function handleCrime(message: Message) {
    const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);

    if (user.isJailed) {
        return message.reply({
            embeds: [errorEmbed(message.author, "You are in Jail!", "You cannot commit crimes while in jail.")]
        });
    }

    const config = await getGuildConfig(message.guildId!);
    const incomeConfig = await getIncomeConfigOrDefault(message.guildId!, "crime");

    // Legacy cooldown key used simple format, but setIncomeCooldown uses command-specific logic. 
    // We'll stick to a simple key for crime but use the configurable duration.
    const cooldownKey = `crime:${message.guildId}:${message.author.id}`;
    const cooldownTime = incomeConfig.cooldown;

    const remaining = checkDynamicCooldown(cooldownKey, cooldownTime);
    if (remaining > 0) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Cool Down", `You must wait **${formatDuration(remaining * 1000)}** before committing another crime.`)]
        });
    }

    // Pick a random crime scenario
    const scenario = CRIMES[Math.floor(Math.random() * CRIMES.length)];

    // Risk calculation using Dashboard Config
    // If config.successPct is set (e.g. 60%), we succeed if roll <= 60.
    // We ignore the hardcoded scenario risk to allow dashboard control.
    const roll = Math.random() * 100;

    // We use <= because successPct is "Success Rate" (e.g. 75 means 75% success)
    if (roll <= incomeConfig.successPct) {
        // Success - Use Dashboard Configured Payouts
        const amount = Math.floor(Math.random() * (incomeConfig.maxPay - incomeConfig.minPay + 1)) + incomeConfig.minPay;

        await prisma.wallet.update({
            where: { id: user.wallet!.id },
            data: { balance: { increment: amount } }
        });

        const embed = successEmbed(
            message.author,
            `${CRIME_EMOTE} Crime Successful`,
            `You **${scenario.text}** and got away with **${fmtCurrency(amount, config.currencyEmoji)}**!`
        );
        embed.setThumbnail("https://cdn.discordapp.com/emojis/1457054253771264276.png"); // Using emote ID as image if possible, or just ignore if it's external.
        // Actually Discord emote IDs can be used as URLs: https://cdn.discordapp.com/emojis/<id>.png

        return message.reply({ embeds: [embed] });

    } else {
        // Failure -> Jail
        const releaseTime = await jailUser(user.id, message.guildId!);
        const fine = config.jailFine;

        const embed = new EmbedBuilder()
            .setTitle(`${POLICE_EMOTE} BUSTED!`)
            .setDescription(`You tried to **${scenario.text}** but the police caught you!`)
            .addFields(
                { name: "Sentence", value: `You have been sent to jail.\nReleases: <t:${Math.floor(releaseTime.getTime() / 1000)}:R>`, inline: true },
                { name: "Bail", value: `${fmtCurrency(fine, config.currencyEmoji)}`, inline: true }
            )
            .setColor(0xFF0000)
            .setThumbnail("https://cdn.discordapp.com/emojis/1457053051582939237.png")
            .setFooter({ text: `Use ${config.prefix}bail to pay your way out or wait it out.` });

        return message.reply({ embeds: [embed] });
    }
}
