
import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { getBankByUserId } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { balanceEmbed, errorEmbed } from "../../utils/embed";

export const data = new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's balance")
    .addUserOption(opt => opt.setName("user").setDescription("The user to check").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    if (targetUser.bot) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Error", "Bots do not have wallets.")], ephemeral: true });

    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(targetUser.id, interaction.guildId!, targetUser.tag);
    const bank = await getBankByUserId(user.id);

    return interaction.editReply({ embeds: [balanceEmbed(targetUser, user.wallet!.balance, bank?.balance ?? 0, config.currencyEmoji)] });
}
