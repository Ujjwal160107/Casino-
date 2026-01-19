
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { createDeck, calculateScore, formatHand, Card } from "../games/blackjack";

export const data = new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play Blackjack against the dealer")
    .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const amountStr = interaction.options.getString("amount", true);
    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const bet = parseBetAmount(amountStr, user.wallet!.balance);

    if (isNaN(bet) || bet <= 0) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Bet", "Please enter a valid positive number.")], ephemeral: true });
    }
    const { min, max } = getGameBetLimits(config, "blackjack");
    if (bet < min) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too Low", `Minimum bet is **${fmtCurrency(min, config.currencyEmoji)}**.`)] });
    if (bet > max) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too High", `Maximum bet is **${fmtCurrency(max, config.currencyEmoji)}**.`)] });
    if (user.wallet!.balance < bet) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", "You don't have enough money.")] });

    const cooldownKey = `game:blackjack:${interaction.guildId}:${interaction.user.id}`;
    const cdSeconds = (config.gameCooldowns as Record<string, number> || {})["blackjack"] || 0;
    if (cdSeconds > 0) {
        const remaining = checkCooldown(cooldownKey, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(cooldownKey);
            return interaction.reply({ embeds: [errorEmbed(interaction.user, "Cooldown Active", `Please wait <t:${expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining)}:R>.`)] });
        }
    }

    await interaction.deferReply();
    const deck = createDeck();
    const playerHand: Card[] = [deck.pop()!, deck.pop()!];
    const dealerHand: Card[] = [deck.pop()!, deck.pop()!];
    let playerScore = calculateScore(playerHand);
    let dealerScore = calculateScore(dealerHand);
    let currentBet = bet;
    let gameOver = false;
    let result = "";
    let payout = 0;

    if (playerScore === 21) {
        gameOver = true;
        if (dealerScore === 21) {
            result = "Push (Both have BJ)";
            payout = currentBet;
        } else {
            result = "Blackjack! You win!";
            payout = Math.ceil(currentBet * 2.5);
        }
    }

    const getEmbed = (reveal: boolean) => {
        const pScore = calculateScore(playerHand);
        const dScore = reveal ? calculateScore(dealerHand) : calculateScore(dealerHand.slice(1));
        const embed = new EmbedBuilder().setTitle("Blackjack")
            .setColor(gameOver ? (payout > currentBet ? Colors.Green : (payout === currentBet ? Colors.Yellow : Colors.Red)) : Colors.Blue)
            .addFields({ name: `Your Hand (${pScore})`, value: formatHand(playerHand), inline: true }, { name: `Dealer's Hand (${dScore})`, value: formatHand(dealerHand, !reveal), inline: true })
            .setDescription(`**Bet:** ${fmtCurrency(currentBet, config.currencyEmoji)}\n${gameOver ? `\n**${result}**` : ""}`)
            .setFooter({ text: `${interaction.user.username}'s Game` });
        if (gameOver) {
            if (payout > currentBet) embed.setThumbnail(getEmoteUrl(Mascot.Emotes.Money) || "");
            else if (payout === 0) embed.setThumbnail(getEmoteUrl(Mascot.Emotes.Fail) || "");
        }
        return embed;
    };

    const getRows = (disabled: boolean) => [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("bj_hit").setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("bj_stand").setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId("bj_double").setLabel("Double").setStyle(ButtonStyle.Success).setDisabled(disabled || playerHand.length > 2 || user.wallet!.balance < currentBet * 2)
        )
    ];

    if (gameOver) {
        await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, interaction.guildId!);
        await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
        if (payout > currentBet) await updateQuestProgress(user.id, "WIN_BLACKJACK").catch(console.error);
        return interaction.editReply({ embeds: [getEmbed(true)] });
    }

    const msg = await interaction.editReply({ embeds: [getEmbed(false)], components: getRows(false) });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000, filter: i => i.user.id === interaction.user.id });

    collector.on("collect", async (i) => {
        const action = i.customId;
        if (action === "bj_hit") {
            playerHand.push(deck.pop()!);
            playerScore = calculateScore(playerHand);
            if (playerScore > 21) {
                gameOver = true;
                result = "Bust! You went over 21.";
                payout = 0;
                collector.stop();
            }
        } else if (action === "bj_stand") {
            gameOver = true;
            collector.stop();
        } else if (action === "bj_double") {
            if (user.wallet!.balance < currentBet * 2) {
                await i.reply({ content: "Insufficient funds.", ephemeral: true });
                return;
            }
            currentBet *= 2;
            playerHand.push(deck.pop()!);
            playerScore = calculateScore(playerHand);
            if (playerScore > 21) {
                result = "Bust! You went over 21.";
                payout = 0;
            }
            gameOver = true;
            collector.stop();
        }

        if (!gameOver) {
            await i.update({ embeds: [getEmbed(false)], components: getRows(false) });
        } else {
            if (playerScore <= 21) {
                while (dealerScore < 17) {
                    dealerHand.push(deck.pop()!);
                    dealerScore = calculateScore(dealerHand);
                }
                if (dealerScore > 21) { result = "Dealer Busts! You Win!"; payout = currentBet * 2; }
                else if (dealerScore > playerScore) { result = "Dealer Wins."; payout = 0; }
                else if (dealerScore < playerScore) { result = "You Win!"; payout = currentBet * 2; }
                else { result = "Push."; payout = currentBet; }
            }
            await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, interaction.guildId!);
            await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
            if (payout > currentBet) await updateQuestProgress(user.id, "WIN_BLACKJACK").catch(console.error);
            await i.update({ embeds: [getEmbed(true)], components: [] });
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === "time" && !gameOver) {
            await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", false, 0, interaction.guildId!);
            await interaction.editReply({ embeds: [getEmbed(true).setDescription("**Timeout** - Surrender.")], components: [] });
        }
    });
}
