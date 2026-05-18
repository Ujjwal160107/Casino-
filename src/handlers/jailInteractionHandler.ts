import { ButtonInteraction, Interaction } from "discord.js";
import { payBail, checkJailStatus } from "../services/jailService";
import { ensureUserAndWallet } from "../services/walletService";
import { errorEmbed, successEmbed } from "../utils/embed";

export async function handleJailInteraction(interaction: Interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "pay_bail") return;

    await interaction.deferReply({ ephemeral: true });

    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const status = await checkJailStatus(user.discordId);

    if (!status.isJailed) {
        return interaction.editReply({
            embeds: [errorEmbed(interaction.user, "Not Jailed", "You are not in jail!")]
        });
    }

    const result = await payBail(user.discordId, interaction.guildId!);

    if (result.success) {
        return interaction.editReply({
            embeds: [successEmbed(interaction.user, "Bail Paid", result.message)]
        });
    } else {
        return interaction.editReply({
            embeds: [errorEmbed(interaction.user, "Bail Failed", result.message)]
        });
    }
}
