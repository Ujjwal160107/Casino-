
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getSpinResult } from "../games/slots";

export const data = new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Play Slots")
    .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const amountStr = interaction.options.getString("amount", true);
    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const bet = parseBetAmount(amountStr, user.wallet!.balance);

    if (isNaN(bet) || bet <= 0) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Bet", "Please enter a valid positive number.")], ephemeral: true });

    const { min, max } = getGameBetLimits(config, "slots");
    if (bet < min) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too Low", `Minimum bet is **${fmtCurrency(min, config.currencyEmoji)}**.`)] });
    if (bet > max) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too High", `Maximum bet is **${fmtCurrency(max, config.currencyEmoji)}**.`)] });
    if (user.wallet!.balance < bet) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", "You don't have enough money.")] });

    const cooldownKey = `game:slots:${interaction.guildId}:${interaction.user.id}`;
    const cdSeconds = (config.gameCooldowns as Record<string, number> || {})["slots"] || 0;
    if (cdSeconds > 0) {
        const remaining = checkCooldown(cooldownKey, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(cooldownKey);
            return interaction.reply({ embeds: [errorEmbed(interaction.user, "Cooldown Active", `Please wait <t:${expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining)}:R>.`)] });
        }
    }

    await interaction.deferReply();
    const { reels, win, multiplier, payout: rawPayout } = getSpinResult();
    const payout = bet * multiplier;
    const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "slots", bet, "spin", win, payout, interaction.guildId!);

    await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
    if (win) await updateQuestProgress(user.id, "WIN_SLOTS").catch(console.error);

    const embed = new EmbedBuilder()
        .setTitle("🎰 Slots")
        .setColor(win ? Colors.Green : Colors.Red)
        .setDescription(`**[ ${reels[0]} | ${reels[1]} | ${reels[2]} ]**\n\n${win ? `**JACKPOT!** Won ${fmtCurrency(actualPayout, config.currencyEmoji)}` : `Lost ${fmtCurrency(bet, config.currencyEmoji)}`}`)
        .setFooter({ text: `${interaction.user.username}'s Wallet: ${(user.wallet!.balance - bet + actualPayout).toLocaleString('en-US')}` });

    if (win) embed.setThumbnail(getEmoteUrl(Mascot.Emotes.Money) || "");
    else embed.setThumbnail(getEmoteUrl(Mascot.Emotes.Fail) || "");

    await interaction.editReply({ embeds: [embed] });
}
