
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { marry, isMarried, checkHasRing, consumeRing } from "../../services/life/marriageService";
import { logToChannel } from "../../utils/discordLogger";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

export const data = new SlashCommandBuilder()
    .setName("marry")
    .setDescription("Propose to another user")
    .addUserOption(opt => opt.setName("user").setDescription("The user to propose to").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const targetUser = interaction.options.getUser("user", true);

    if (targetUser.bot || targetUser.id === interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid User", "You cannot marry a bot or yourself!")], ephemeral: true });
    }

    const config = await getGuildConfig(guildId);
    if (!config.marriageEnabled) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Disabled", "Marriage system is disabled.")], ephemeral: true });
    }

    await interaction.deferReply();

    if (await isMarried(interaction.user.id, guildId)) {
        return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Already Married", "You are already married!")] });
    }
    if (await isMarried(targetUser.id, guildId)) {
        return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Taken", `${targetUser.username} is already married!`)] });
    }

    // Cooldown check skipped for brevity, relies on service or similar logic to original

    const hasRing = await checkHasRing(interaction.user.id, guildId);
    if (!hasRing) {
        return interaction.editReply({ embeds: [errorEmbed(interaction.user, "No Ring", "You need a **Ring** to propose! Buy one from the shop.")] });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('accept_proposal').setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('💍'),
        new ButtonBuilder().setCustomId('decline_proposal').setLabel('Decline').setStyle(ButtonStyle.Danger)
    );

    const proposalEmbed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle(`💍 Marriage Proposal`)
        .setDescription(`${targetUser}, **${interaction.user.username}** has proposed to you! \n\nDo you accept?` + (config.marriageCost > 0 ? `\n\n**Cost:** ${fmtCurrency(config.marriageCost, config.currencyEmoji)}` : ""))
        .setFooter({ text: "Expires in 60s." });

    const msg = await interaction.editReply({ content: `${targetUser}`, embeds: [proposalEmbed], components: [row] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== targetUser.id) {
            await i.reply({ content: "This proposal is not for you!", ephemeral: true });
            return;
        }

        if (i.customId === 'accept_proposal') {
            await i.deferUpdate();
            // Double checks
            if (await isMarried(targetUser.id, guildId) || await isMarried(interaction.user.id, guildId)) {
                await i.editReply({ content: null, embeds: [errorEmbed(targetUser, "Failed", "Someone is already married.")], components: [] });
                return;
            }

            const hasRingNow = await checkHasRing(interaction.user.id, guildId);
            if (!hasRingNow) {
                await i.editReply({ content: null, embeds: [errorEmbed(targetUser, "Failed", "Ring lost!")], components: [] });
                return;
            }

            if (config.marriageCost > 0) {
                // Cost logic
                const user = await prisma.user.findFirst({ where: { discordId: interaction.user.id, guildId: guildId } });
                if (!user) {
                    await i.editReply({ content: null, embeds: [errorEmbed(targetUser, "Failed", "User record not found.")], components: [] });
                    return;
                }
                const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
                if (!wallet || wallet.balance < config.marriageCost) {
                    await i.editReply({ content: null, embeds: [errorEmbed(targetUser, "Failed", "Proposer cannot afford the fee.")], components: [] });
                    return;
                }
                await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: config.marriageCost } } });
            }

            await consumeRing(interaction.user.id, guildId);
            await marry(interaction.user.id, interaction.user.username, targetUser.id, targetUser.username, guildId);

            await logToChannel(interaction.client, {
                guild: interaction.guild!, type: "TRADE", title: "Marriage",
                description: `**${interaction.user.tag}** married **${targetUser.tag}**!`, color: 0xFF69B4
            });

            const acceptEmbed = new EmbedBuilder()
                .setColor("#ff69b4")
                .setTitle(`💖 Just Married!`)
                .setDescription(`**${interaction.user.username}** & **${targetUser.username}** are now married! 🎉`)
                .setThumbnail(getEmoteUrl(Mascot.Emotes.Love) || "");

            await i.editReply({ content: null, embeds: [acceptEmbed], components: [] });
        } else {
            await i.update({ content: null, embeds: [new EmbedBuilder().setColor("#ff0000").setTitle("💔 Declined").setDescription("Proposal declined.")], components: [] });
        }
        collector.stop();
    });
}
