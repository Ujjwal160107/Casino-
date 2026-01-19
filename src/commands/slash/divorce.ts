
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { isMarried, getMarriage, divorce } from "../../services/life/marriageService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";

export const data = new SlashCommandBuilder()
    .setName("divorce")
    .setDescription("Divorce your current spouse");

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;

    if (!await isMarried(interaction.user.id, guildId)) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Not Married", "You are not married!")], ephemeral: true });
    }

    await interaction.deferReply();
    const marriage = await getMarriage(interaction.user.id, guildId);
    if (!marriage) return;

    const spouseRecord = (marriage as any).spouse1.discordId === interaction.user.id ? (marriage as any).spouse2 : (marriage as any).spouse1;
    const spouseId = spouseRecord.discordId;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('confirm_divorce').setLabel('Confirm Divorce').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('cancel_divorce').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const config = await getGuildConfig(guildId);

    const embed = new EmbedBuilder()
        .setTitle("💔 Divorce Request")
        .setDescription(`Are you sure you want to divorce <@${spouseId}>?` + (config.divorceCost > 0 ? `\n\n**Cost:** ${fmtCurrency(config.divorceCost, config.currencyEmoji)}` : ""))
        .setColor("#FF0000");

    const msg = await interaction.editReply({ components: [row], embeds: [embed] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) { await i.reply({ content: "Not your request.", ephemeral: true }); return; }

        if (i.customId === 'confirm_divorce') {
            if (config.divorceCost > 0) {
                const user = await prisma.user.findFirst({ where: { discordId: interaction.user.id, guildId: guildId } });
                if (!user) {
                    await i.reply({ content: "User record not found.", ephemeral: true });
                    return;
                }
                const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
                if (!wallet || wallet.balance < config.divorceCost) {
                    await i.reply({ content: "Insufficient funds for divorce fee.", ephemeral: true });
                    return;
                }
                await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: config.divorceCost } } });
            }

            await divorce(interaction.user.id, guildId);
            await logToChannel(interaction.client, { guild: interaction.guild!, type: "TRADE", title: "Divorce", description: `**${interaction.user.tag}** divorced <@${spouseId}>.`, color: 0x000000 });

            await i.update({ content: null, embeds: [new EmbedBuilder().setTitle("💔 Divorced").setDescription("You are now single.")], components: [] });
        } else {
            await i.update({ content: null, embeds: [new EmbedBuilder().setTitle("Cancelled").setDescription("Divorce cancelled.")], components: [] });
        }
        collector.stop();
    });
}
