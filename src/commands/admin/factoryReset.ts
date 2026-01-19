
import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionsBitField } from "discord.js";
import { guildCleanupService } from "../../services/guildCleanupService";

export async function handleFactoryReset(message: Message) {
    if (!message.guildId) return;

    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("You do not have permission to use this command.");
    }

    const embed = new EmbedBuilder()
        .setTitle("⚠️ Factory Reset Warning")
        .setDescription(
            "Are you sure you want to **ERASE ALL DATA** for this server?\n\n" +
            "This includes (but not limited to):\n" +
            "• Economy balances (Users, Wallets, Banks)\n" +
            "• Store Items & Inventories\n" +
            "• Role Incomes & Jobs\n" +
            "• Settings, Permissions & Configurations\n" +
            "• Audit Logs & History\n\n" +
            "**This action is IRREVERSIBLE.**"
        )
        .setColor("Red")
        .setFooter({ text: "You have 30 seconds to confirm." });

    const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_reset_legacy')
        .setLabel('Yes, Delete Everything')
        .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_reset_legacy')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

    const response = await message.reply({
        embeds: [embed],
        components: [row]
    });

    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === message.author.id,
        time: 30000
    });

    collector.on('collect', async (i) => {
        if (i.customId === 'cancel_reset_legacy') {
            await i.update({ content: "Factory reset cancelled.", embeds: [], components: [] });
            return;
        }

        if (i.customId === 'confirm_reset_legacy') {
            await i.update({
                content: "🔄 **Factory reset in progress...** Please wait.",
                embeds: [],
                components: []
            });

            try {
                await guildCleanupService.permanentlyDeleteGuild(message.guildId!);
                await i.editReply({ content: "✅ **Factory Reset Complete.** All server data has been wiped." });
            } catch (error) {
                console.error("Factory reset failed:", error);
                await i.editReply({ content: "❌ An error occurred while resetting the guild data." });
            }
        }
    });

    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            await response.edit({ content: "Factory reset cancelled (timeout).", embeds: [], components: [] }).catch(() => { });
        }
    });
}
