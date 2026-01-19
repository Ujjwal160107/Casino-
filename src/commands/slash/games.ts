
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";
import { Mascot, getEmoteUrl } from "../../config/branding";

// Import helpers from existing commands
import { createDeck, calculateScore, formatHand, getCardEmoji, Card } from "../games/blackjack";
import { getSpinResult } from "../games/slots";

export const data = new SlashCommandBuilder()
    .setName("games")
    .setDescription("Play casino games")
    .addSubcommand(sub =>
        sub.setName("blackjack").setDescription("Play Blackjack")
            .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName("slots").setDescription("Play Slots")
            .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName("roulette").setDescription("Play Roulette")
            .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true))
            .addStringOption(opt => opt.setName("choice").setDescription("Bet choice (red, black, 0-36, etc)").setRequired(true))
    )
    .addSubcommand(sub =>
        sub.setName("coinflip").setDescription("Play Coinflip")
            .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true))
            .addStringOption(opt => opt.setName("side").setDescription("heads or tails").setRequired(true))
    );

async function checkGameReqs(interaction: ChatInputCommandInteraction, gameId: string, amountStr: string) {
    const config = await getGuildConfig(interaction.guildId!);
    const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
    const bet = parseBetAmount(amountStr, user.wallet!.balance);

    if (isNaN(bet) || bet <= 0) {
        await interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Bet", "Please enter a valid positive number.")], ephemeral: true });
        return null;
    }
    const { min, max } = getGameBetLimits(config, gameId);
    if (bet < min) {
        await interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too Low", `Minimum bet is **${fmtCurrency(min, config.currencyEmoji)}**.`)] });
        return null;
    }
    if (bet > max) {
        await interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too High", `Maximum bet is **${fmtCurrency(max, config.currencyEmoji)}**.`)] });
        return null;
    }
    if (user.wallet!.balance < bet) {
        await interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", "You don't have enough money.")] });
        return null;
    }

    const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
    const cdSeconds = cooldowns[gameId] || 0;
    if (cdSeconds > 0) {
        const key = `game:${gameId}:${interaction.guildId}:${interaction.user.id}`;
        const remaining = checkCooldown(key, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(key);
            const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
            await interaction.reply({ embeds: [errorEmbed(interaction.user, "Cooldown Active", `Please wait <t:${ts}:R>.`)] });
            return null;
        }
    }
    return { user, bet, config };
}

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "blackjack") {
        const amountStr = interaction.options.getString("amount", true);
        const reqs = await checkGameReqs(interaction, "blackjack", amountStr);
        if (!reqs) return;
        const { user, bet: amount, config } = reqs;

        // Blackjack Logic
        await interaction.deferReply();
        const deck = createDeck();
        const playerHand: Card[] = [deck.pop()!, deck.pop()!];
        const dealerHand: Card[] = [deck.pop()!, deck.pop()!];
        let playerScore = calculateScore(playerHand);
        let dealerScore = calculateScore(dealerHand);
        let currentBet = amount;
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
            const embed = new EmbedBuilder().setTitle("Blackjack").setColor(gameOver ? (payout > currentBet ? Colors.Green : (payout === currentBet ? Colors.Yellow : Colors.Red)) : Colors.Blue)
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
            const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, interaction.guildId!);
            await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
            if (actualPayout > currentBet) await updateQuestProgress(user.id, "WIN_BLACKJACK").catch(console.error);
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
                const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, interaction.guildId!);
                await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
                if (actualPayout > currentBet) await updateQuestProgress(user.id, "WIN_BLACKJACK").catch(console.error);
                await i.update({ embeds: [getEmbed(true)], components: [] });
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === "time" && !gameOver) {
                gameOver = true;
                payout = 0;
                result = "Timeout. Surrender.";
                await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", false, 0, interaction.guildId!);
                await interaction.editReply({ embeds: [getEmbed(true)], components: [] });
            }
        });
    }

    if (sub === "slots") {
        const amountStr = interaction.options.getString("amount", true);
        const reqs = await checkGameReqs(interaction, "slots", amountStr);
        if (!reqs) return;
        const { user, bet: amount, config } = reqs;
        await interaction.deferReply();

        const { reels, win, multiplier, payout: rawPayout } = getSpinResult();
        const payout = amount * multiplier;
        const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "slots", amount, "spin", win, payout, interaction.guildId!);

        await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
        if (win) await updateQuestProgress(user.id, "WIN_SLOTS").catch(console.error);

        const embed = new EmbedBuilder()
            .setTitle("🎰 Slots")
            .setColor(win ? Colors.Green : Colors.Red)
            .setDescription(`**[ ${reels[0]} | ${reels[1]} | ${reels[2]} ]**\n\n${win ? `**JACKPOT!** Won ${fmtCurrency(actualPayout, config.currencyEmoji)}` : `Lost ${fmtCurrency(amount, config.currencyEmoji)}`}`)
            .setFooter({ text: `${interaction.user.username}'s Wallet: ${(user.wallet!.balance - amount + actualPayout).toLocaleString('en-US')}` });

        if (win) embed.setThumbnail(getEmoteUrl(Mascot.Emotes.Money) || "");
        else embed.setThumbnail(getEmoteUrl(Mascot.Emotes.Fail) || "");

        await interaction.editReply({ embeds: [embed] });
    }

    if (sub === "roulette") {
        const amountStr = interaction.options.getString("amount", true);
        const choice = interaction.options.getString("choice", true).toLowerCase();
        const reqs = await checkGameReqs(interaction, "roulette", amountStr);
        if (!reqs) return;
        const { user, bet: amount, config } = reqs;
        await interaction.deferReply();

        const spinTime = config.rouletteSpinTime || 3;
        const spinMsg = await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Spinning...").setColor(Colors.Yellow).setImage("https://media.tenor.com/7gKkK6W85GgAAAAC/roulette-casino.gif")] });
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
        else if (choice.includes("-") || choice === "1st" || choice === "2nd" || choice === "3rd") {
            // Simplified for brevity, assume complex bets match standard rules or fail safe for now
            if (choice === "1-12") { didWin = spin >= 1 && spin <= 12; multiplier = 3; }
            else if (choice === "13-24") { didWin = spin >= 13 && spin <= 24; multiplier = 3; }
            else if (choice === "25-36") { didWin = spin >= 25 && spin <= 36; multiplier = 3; }
            else if (choice === "1-18") { didWin = spin >= 1 && spin <= 18; multiplier = 2; }
            else if (choice === "19-36") { didWin = spin >= 19 && spin <= 36; multiplier = 2; }
            else { multiplier = 0; } // Unsupported complex bet in slash for now or fallback
        }
        else {
            const num = parseInt(choice);
            if (!isNaN(num) && num >= 0 && num <= 36) { didWin = (spin === num); multiplier = 36; }
        }

        const payout = didWin ? Math.floor(amount * multiplier) : 0;
        const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "roulette", amount, choice, didWin, payout, interaction.guildId!);

        await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
        if (didWin) await updateQuestProgress(user.id, "WIN_ROULETTE").catch(console.error);

        const resultEmbed = new EmbedBuilder()
            .setTitle(didWin ? "Winner!" : "You Lost")
            .setColor(didWin ? Colors.Green : Colors.Red)
            .setDescription(`**Result:** ${spin} (${isRed ? "Red" : (spin === 0 ? "Green" : "Black")})\n**Bet:** ${choice}\n**${didWin ? "Won" : "Lost"}:** ${fmtCurrency(didWin ? actualPayout : amount, config.currencyEmoji)}`)
            .setFooter({ text: `${interaction.user.username}'s Wallet: ${(user.wallet!.balance - amount + actualPayout).toLocaleString('en-US')}` });

        await interaction.editReply({ embeds: [resultEmbed] });
    }

    if (sub === "coinflip") {
        const amountStr = interaction.options.getString("amount", true);
        const side = interaction.options.getString("side", true).toLowerCase();
        if (!["heads", "tails", "h", "t"].includes(side)) {
            return interaction.reply({ content: "Invalid side. Choose heads or tails.", ephemeral: true });
        }
        const reqs = await checkGameReqs(interaction, "coinflip", amountStr);
        if (!reqs) return;
        const { user, bet: amount, config } = reqs;
        await interaction.deferReply();

        const result = Math.random() < 0.5 ? "heads" : "tails";
        const shortSide = side.startsWith("h") ? "heads" : "tails";
        const win = result === shortSide;
        const payout = win ? amount * 2 : 0;

        const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "coinflip", amount, shortSide, win, payout, interaction.guildId!);

        const embed = new EmbedBuilder()
            .setTitle("Coinflip")
            .setColor(win ? Colors.Green : Colors.Red)
            .setDescription(`**Result:** ${result.toUpperCase()}\n**You Chose:** ${shortSide.toUpperCase()}\n**${win ? "Won" : "Lost"}:** ${fmtCurrency(win ? actualPayout : amount, config.currencyEmoji)}`);

        await interaction.editReply({ embeds: [embed] });
    }
}
