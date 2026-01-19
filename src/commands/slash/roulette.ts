
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";

export const data = new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("Play Roulette")
    .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true))
    .addStringOption(opt => opt.setName("choice").setDescription("Bet choice (red, black, 0-36, etc)").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const amountStr = interaction.options.getString("amount", true);
    const choice = interaction.options.getString("choice", true).toLowerCase();

    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const bet = parseBetAmount(amountStr, user.wallet!.balance);

    if (isNaN(bet) || bet <= 0) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Bet", "Please enter a valid positive number.")], ephemeral: true });

    const { min, max } = getGameBetLimits(config, "roulette");
    if (bet < min) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too Low", `Minimum bet is **${fmtCurrency(min, config.currencyEmoji)}**.`)] });
    if (bet > max) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too High", `Maximum bet is **${fmtCurrency(max, config.currencyEmoji)}**.`)] });
    if (user.wallet!.balance < bet) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", "You don't have enough money.")] });

    const cooldownKey = `game:roulette:${interaction.guildId}:${interaction.user.id}`;
    const cdSeconds = (config.gameCooldowns as Record<string, number> || {})["roulette"] || 0;
    if (cdSeconds > 0) {
        const remaining = checkCooldown(cooldownKey, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(cooldownKey);
            return interaction.reply({ embeds: [errorEmbed(interaction.user, "Cooldown Active", `Please wait <t:${expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining)}:R>.`)] });
        }
    }

    await interaction.deferReply();

    const spinTime = config.rouletteSpinTime || 3;
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Spinning...").setColor(Colors.Yellow).setImage("https://media.tenor.com/7gKkK6W85GgAAAAC/roulette-casino.gif")] });
    await new Promise(r => setTimeout(r, spinTime * 1000));

    const spin = Math.floor(Math.random() * 37);
    const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const isRed = redNumbers.has(spin);
    const isBlack = !isRed && spin !== 0;
    let didWin = false;
    let multiplier = 0;

    if (choice === "red") { didWin = isRed; multiplier = 2; }
    else if (choice === "black") { didWin = isBlack; multiplier = 2; }
    else if (choice === "odd") { didWin = (spin !== 0 && spin % 2 !== 0); multiplier = 2; }
    else if (choice === "even") { didWin = (spin !== 0 && spin % 2 === 0); multiplier = 2; }
    else if (choice === "1-12") { didWin = spin >= 1 && spin <= 12; multiplier = 3; }
    else if (choice === "13-24") { didWin = spin >= 13 && spin <= 24; multiplier = 3; }
    else if (choice === "25-36") { didWin = spin >= 25 && spin <= 36; multiplier = 3; }
    else if (choice === "1-18") { didWin = spin >= 1 && spin <= 18; multiplier = 2; }
    else if (choice === "19-36") { didWin = spin >= 19 && spin <= 36; multiplier = 2; }
    else {
        const num = parseInt(choice);
        if (!isNaN(num) && num >= 0 && num <= 36) { didWin = (spin === num); multiplier = 36; }
    }

    const payout = didWin ? Math.floor(bet * multiplier) : 0;
    const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "roulette", bet, choice, didWin, payout, interaction.guildId!);

    await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
    if (didWin) await updateQuestProgress(user.id, "WIN_ROULETTE").catch(console.error);

    const resultEmbed = new EmbedBuilder()
        .setTitle(didWin ? "Winner!" : "You Lost")
        .setColor(didWin ? Colors.Green : Colors.Red)
        .setDescription(`**Result:** ${spin} (${isRed ? "Red" : (spin === 0 ? "Green" : "Black")})\n**Bet:** ${choice}\n**${didWin ? "Won" : "Lost"}:** ${fmtCurrency(didWin ? actualPayout : bet, config.currencyEmoji)}`)
        .setFooter({ text: `${interaction.user.username}'s Wallet: ${(user.wallet!.balance - bet + actualPayout).toLocaleString('en-US')}` });

    await interaction.editReply({ embeds: [resultEmbed] });
}
