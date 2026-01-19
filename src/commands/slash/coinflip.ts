
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { getGameBetLimits } from "../../utils/gameUtils";

export const data = new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Play Coinflip")
    .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true))
    .addStringOption(opt => opt.setName("side").setDescription("heads or tails").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const amountStr = interaction.options.getString("amount", true);
    const side = interaction.options.getString("side", true).toLowerCase();

    if (!["heads", "tails", "h", "t"].includes(side)) return interaction.reply({ content: "Invalid side. Choose heads or tails.", ephemeral: true });

    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const bet = parseBetAmount(amountStr, user.wallet!.balance);

    if (isNaN(bet) || bet <= 0) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Bet", "Please enter a valid positive number.")], ephemeral: true });

    const { min, max } = getGameBetLimits(config, "coinflip");
    if (bet < min) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too Low", `Minimum bet is **${fmtCurrency(min, config.currencyEmoji)}**.`)] });
    if (bet > max) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too High", `Maximum bet is **${fmtCurrency(max, config.currencyEmoji)}**.`)] });
    if (user.wallet!.balance < bet) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", "You don't have enough money.")] });

    const cooldownKey = `game:coinflip:${interaction.guildId}:${interaction.user.id}`;
    const cdSeconds = (config.gameCooldowns as Record<string, number> || {})["coinflip"] || 0;
    if (cdSeconds > 0) {
        const remaining = checkCooldown(cooldownKey, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(cooldownKey);
            return interaction.reply({ embeds: [errorEmbed(interaction.user, "Cooldown Active", `Please wait <t:${expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining)}:R>.`)] });
        }
    }

    await interaction.deferReply();
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const shortSide = side.startsWith("h") ? "heads" : "tails";
    const win = result === shortSide;
    const payout = win ? bet * 2 : 0;
    const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "coinflip", bet, shortSide, win, payout, interaction.guildId!);

    const embed = new EmbedBuilder()
        .setTitle("Coinflip")
        .setColor(win ? Colors.Green : Colors.Red)
        .setDescription(`**Result:** ${result.toUpperCase()}\n**You Chose:** ${shortSide.toUpperCase()}\n**${win ? "Won" : "Lost"}:** ${fmtCurrency(win ? actualPayout : bet, config.currencyEmoji)}`);

    await interaction.editReply({ embeds: [embed] });
}
