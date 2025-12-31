import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { Mascot } from "../../config/branding";

export async function handleResetAdminSettings(message: Message) {
    if (!message.member?.permissions.has("Administrator") && message.author.id !== message.guild?.ownerId) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Only Administrators/Owner can use this command.")] });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("confirm_reset_admin")
            .setLabel("CONFIRM RESET")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(Mascot.Emotes.Alert),
        new ButtonBuilder()
            .setCustomId("cancel_reset_admin")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
    );

    const reply = await message.reply({
        content: `**${Mascot.Emotes.Alert} DANGER ZONE**\nAre you sure you want to reset **ALL Admin Access Settings**?\n\n**This will:**\n- Enable all disabled commands.\n- Remove all Granular Permission overrides.\n- Clear Casino Channel whitelist.\n\n**This will NOT affect:**\n- Currency, Economy Configs, Taxes, or Cooldowns.`,
        components: [row]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === message.author.id,
        time: 15000
    });

    collector.on("collect", async (interaction) => {
        if (interaction.customId === "cancel_reset_admin") {
            await interaction.update({ content: "Reset cancelled.", components: [] });
            return;
        }

        if (interaction.customId === "confirm_reset_admin") {
            const guildId = message.guildId!;

            await prisma.guildConfig.update({
                where: { guildId },
                data: {
                    disabledCommands: [],
                    casinoChannels: []
                }
            });

            await prisma.commandPermission.deleteMany({
                where: { guildId }
            });

            await interaction.update({
                embeds: [successEmbed(message.author, "Settings Reset", `${Mascot.Emotes.Accept} All admin access settings, permissions, and restrictions have been reset to default.`)],
                components: []
            });
        }
    });

    collector.on("end", (_, reason) => {
        if (reason === "time") {
            reply.edit({ components: [] }).catch(() => { });
        }
    });
}