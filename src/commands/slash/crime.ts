
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { jailUser } from "../../services/jailService";
import { getIncomeConfigOrDefault } from "../../services/incomeService";
import { checkDynamicCooldown } from "../../utils/cooldown";
import { getGuildConfig } from "../../services/guildConfigService";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { fmtCurrency, formatDuration } from "../../utils/format";
import prisma from "../../utils/prisma";

const CRIME_EMOTE = "<:fortuna_criminal:1457054253771264276>";
const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";
const CRIMES = [
    { text: "robbed a convenience store", risk: 30, min: 500, max: 2000 },
    { text: "hacked an ATM", risk: 40, min: 1000, max: 3000 },
    { text: "smuggled illegal goods", risk: 50, min: 2000, max: 5000 },
    { text: "stole a car", risk: 60, min: 3000, max: 7000 },
    { text: "robbed a bank", risk: 80, min: 10000, max: 50000 }
];

export const data = new SlashCommandBuilder()
    .setName("crime")
    .setDescription("Commit a crime");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);

    if (user.isJailed) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "You are in Jail!", "You cannot commit crimes while in jail.")] });

    const incomeConfig = await getIncomeConfigOrDefault(interaction.guildId!, "crime");
    const cooldownKey = `crime:${interaction.guildId}:${interaction.user.id}`;
    const remaining = checkDynamicCooldown(cooldownKey, incomeConfig.cooldown);

    if (remaining > 0) return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Cool Down", `You must wait **${formatDuration(remaining * 1000)}**.`)] });

    const scenario = CRIMES[Math.floor(Math.random() * CRIMES.length)];
    const roll = Math.random() * 100;

    if (roll <= incomeConfig.successPct) {
        const amount = Math.floor(Math.random() * (incomeConfig.maxPay - incomeConfig.minPay + 1)) + incomeConfig.minPay;
        await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { increment: amount } } });
        const embed = successEmbed(interaction.user, `${CRIME_EMOTE} Crime Successful`, `You **${scenario.text}** and got away with **${fmtCurrency(amount, config.currencyEmoji)}**!`);
        embed.setThumbnail("https://cdn.discordapp.com/emojis/1457054253771264276.png");
        return interaction.editReply({ embeds: [embed] });
    } else {
        const releaseTime = await jailUser(user.id, interaction.guildId!);
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
            .setFooter({ text: `Use /jail bail to pay your way out.` });
        return interaction.editReply({ embeds: [embed] });
    }
}
