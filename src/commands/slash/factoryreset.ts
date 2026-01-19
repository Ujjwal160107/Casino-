
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from "discord.js";
import { guildCleanupService } from "../../services/guildCleanupService";

export const factoryResetCommand = {
    data: new SlashCommandBuilder()
        .setName("factoryreset")
        .setDescription("Reset the server's casino data (DANGEROUS).")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId) return;

        // Security Check: Only allow Owner? Or Admin is enough?
        // Command requires Administrator permission by default, but let's double check for safety
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
            return;
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
            .setCustomId('confirm_reset')
            .setLabel('Yes, Delete Everything')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_reset')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(confirmButton, cancelButton);

        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id,
            time: 30000
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'cancel_reset') {
                await i.update({ content: "Factory reset cancelled.", embeds: [], components: [] });
                return;
            }

            if (i.customId === 'confirm_reset') {
                await i.update({
                    content: "🔄 **Factory reset in progress...** Please wait.",
                    embeds: [],
                    components: []
                });

                try {
                    await guildCleanupService.permanentlyDeleteGuild(interaction.guildId!);
                    await i.editReply({ content: "✅ **Factory Reset Complete.** All server data has been wiped." });
                } catch (error) {
                    console.error("Factory reset failed:", error);
                    await i.editReply({ content: "❌ An error occurred while resetting the guild data." });
                }
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await interaction.editReply({ content: "Factory reset cancelled (timeout).", embeds: [], components: [] }).catch(() => { });
            }
        });
    }
};
