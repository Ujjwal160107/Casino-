import { Message, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction, placeBetFallback } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";

import { formatDuration } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { updateQuestProgress } from "../../services/questService";

export type Card = { suit: string; rank: string; value: number };
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const EMOJI_MAP: Record<string, Record<string, string>> = {
    "♠️": {
        "A": "<:3606playingcardspadesace:1457404330503045273>",
        "2": "<:8524playingcardspadestwo:1457404368956690633>",
        "3": "<:1367playingcardspadesthree:1457404324350132385>",
        "4": "<:9806playingcardspadesfour:1457404380830765066>",
        "5": "<:5162playingcardspadesfive:1457404343228829727>",
        "6": "<:4160playingcardspadessix:1457404334529843220>",
        "7": "<:9649playingcardspadesseven:1457404378599133344>",
        "8": "<:5501playingcardspadeseight:1457404347947422003>",
        "9": "<:5071playingcardspadesnine:1457404341693448302>",
        "10": "<:8896playingcardspadesten:1457404373435940935>",
        "J": "<:7377playingcardspadesjack:1457404358231724267>",
        "Q": "<:4328playingcardspadesqueen:1457404338367500481>",
        "K": "<:9846playingcardspadesking:1457404383376576655>"
    },
    "♥️": {
        "A": "<:7039playingcardheartsace:1457404091322859686>",
        "2": "<:7102playingcardheartstwo:1457404094359666770>",
        "3": "<:9383playingcardheartsthree:1457404110214135952>",
        "4": "<:5715playingcardheartsfour:1457404085069287625>",
        "5": "<:8796playingcardheartsfive:1457404108234293269>",
        "6": "<:7193playingcardheartssix:1457404098747039927>",
        "7": "<:5765playingcardheartsseven:1457404087111913573>",
        "8": "<:3572playingcardheartseight:1457404073837072474>",
        "9": "<:5451playingcardheartsnine:1457404083010011259>",
        "10": "<:7963playingcardheartsten:1457404106116436161>",
        "J": "<:5593playingcardheartsjack:1457406307551416412>",
        "Q": "<:4703playingcardheartsqueen:1457404078991872082>",
        "K": "<:7669playingcardheartsking:1457404103570362464>"
    },
    "♦️": {
        "A": "<:1454playingcarddiamondsace:1457404065288945747>",
        "2": "<:7165playingcarddiamondstwo:1457404096817660025>",
        "3": "<:5772playingcarddiamondsthree:1457404089171181711>",
        "4": "<:1497playingcarddiamondsfour:1457404067302346772>",
        "5": "<:4065playingcarddiamondsfive:1457404075829235824>",
        "6": "<:1169playingcarddiamondssix:1457404063191925023>",
        "7": "<:2336playingcarddiamondsseven:1457404069344706642>",
        "8": "<:9921playingcarddiamondseight:1457404115117150431>",
        "9": "<:9976playingcarddiamondsnine:1457404117667282974>",
        "10": "<:2715playingcarddiamondsten:1457404071467290644>",
        "J": "<:9562playingcarddiamondsjack:1457404113221320869>",
        "Q": "<:5305playingcarddiamondsqueen:1457404081231364126>",
        "K": "<:7596playingcarddiamondsking:1457404100990861532>"
    },
    "♣️": {
        "A": "<:2918playingcardclubsace:1457404328733053061>",
        "2": "<:8842playingcardclubstwo:1457404371158569109>",
        "3": "<:4263playingcardclubsthree:1457404336559755570>",
        "4": "<:3948playingcardclubsfour:1457404332466241711>",
        "5": "<:5269playingcardclubsfive:1457404345124655135>",
        "6": "<:7348playingcardclubssix:1457404356168126484>",
        "7": "<:9858playingcardclubsseven:1457404386052411493>",
        "8": "<:8965playingcardclubseight:1457404376175083630>",
        "9": "<:2529playingcardclubsnine:1457404326904467456>",
        "10": "<:7160playingcardclubsten:1457404353911590922>",
        "J": "<:6968playingcardclubsjack:1457404350358884386>",
        "Q": "<:7744playingcardclubsqueen:1457404363730587769>",
        "K": "<:9978playingcardclubsking:1457404388858658936>"
    }
};

export function getCardEmoji(card: Card): string {
    return EMOJI_MAP[card.suit]?.[card.rank] || `\`${card.rank}${card.suit}\``;
}

export function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            let value = parseInt(rank);
            if (["J", "Q", "K"].includes(rank)) value = 10;
            if (rank === "A") value = 11;
            deck.push({ suit, rank, value });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

export function calculateScore(hand: Card[]): number {
    let score = hand.reduce((sum, card) => sum + card.value, 0);
    let aces = hand.filter(card => card.rank === "A").length;
    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }
    return score;
}

export function formatHand(hand: Card[], hideFirst = false): string {
    if (hideFirst) {
        return `**??**   ${hand.slice(1).map(c => getCardEmoji(c)).join("  ")}`;
    }
    return hand.map(c => getCardEmoji(c)).join("  ");
}

export async function handleBlackjack(message: Message, args: string[]) {
    const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
    const bet = parseBetAmount(args[0], user.wallet!.balance);
    if (isNaN(bet) || bet <= 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Bet", "Please enter a valid amount (e.g., 500, 1k, all).")] });
    }
    const amount = bet;
    const config = await getGuildConfig(message.guildId!);
    const { min, max } = getGameBetLimits(config, "blackjack");

    const eCasino = "<a:casino:1445732641545654383>";
    let currencyEmoji = config.currencyEmoji;
    if (/^\d+$/.test(currencyEmoji)) {
        const e = message.guild?.emojis.cache.get(currencyEmoji);
        currencyEmoji = e ? e.toString() : "💰";
    }
    if (currencyEmoji === "1445732360204193824") {
        currencyEmoji = "<a:money:1445732360204193824>";
    }

    if (amount < min) {
        return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Blackjack is **${fmtCurrency(min, currencyEmoji)}**.`)] });
    }
    if (amount > max) {
        return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Blackjack is **${fmtCurrency(max, currencyEmoji)}**.`)] });
    }
    const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
    const cdSeconds = cooldowns["blackjack"] || 0;
    if (cdSeconds > 0) {
        const key = `game:blackjack:${message.guildId}:${message.author.id}`;
        const remaining = checkCooldown(key, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(key);
            const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
            return message.reply({ embeds: [errorEmbed(message.author, "Cooldown Active", `${Mascot.Emotes.Angry} Please wait <t:${ts}:R> before playing Blackjack again.`)] });
        }
    }
    if (user.wallet!.balance < amount) {
        return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You don't have enough money.")] });
    }
    const deck = createDeck();
    const playerHand: Card[] = [deck.pop()!, deck.pop()!];
    const dealerHand: Card[] = [deck.pop()!, deck.pop()!];
    let playerScore = calculateScore(playerHand);
    let dealerScore = calculateScore(dealerHand);
    let gameOver = false;
    let result = "";
    let payout = 0;
    let currentBet = amount;
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
        const embed = new EmbedBuilder().setTitle(`${eCasino} Blackjack Table`).setColor(gameOver ? (payout > currentBet ? Colors.Green : (payout === currentBet ? Colors.Yellow : Colors.Red)) : Colors.Blue).addFields({ name: `Your Hand (${pScore})`, value: formatHand(playerHand), inline: true }, { name: `Dealer's Hand (${dScore})`, value: formatHand(dealerHand, !reveal), inline: true });
        let statusText = `**Bet:** ${fmtCurrency(currentBet, currencyEmoji)}`;
        if (gameOver) {
            statusText += `\n\n**${result}**\n${payout > 0 ? `**Payout:** ${fmtCurrency(payout, currencyEmoji)}` : ""}`;

            const winUrl = getEmoteUrl(Mascot.Emotes.Money);
            const failUrl = getEmoteUrl(Mascot.Emotes.Fail);

            if (payout > currentBet && winUrl) embed.setThumbnail(winUrl);
            else if (payout === 0 && failUrl) embed.setThumbnail(failUrl);

        } else {
            statusText += `\n\n**Hit** - Take another card\n**Stand** - End the game\n**Double Down** - Double your bet, hit once, then stand`;
        }
        embed.setDescription(statusText);
        embed.setFooter({ text: `${Mascot.Name} • ${message.author.username}'s Game` });
        return embed;
    };

    const getRows = (disabled: boolean) => {
        return [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("bj_hit").setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(disabled),
                new ButtonBuilder().setCustomId("bj_stand").setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                new ButtonBuilder().setCustomId("bj_double").setLabel("Double").setStyle(ButtonStyle.Success).setDisabled(disabled || playerHand.length > 2 || user.wallet!.balance < currentBet * 2)
            )
        ];
    };

    if (gameOver) {
        try {
            const actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, message.guildId!);
            payout = actualPayout;
            await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
            if (payout > currentBet) await updateQuestProgress(user.id, "WIN_BLACKJACK").catch(console.error);
        } catch (e) {
            return message.reply({ content: "Transaction failed." });
        }
        return message.reply({ embeds: [getEmbed(true)] });
    }

    const msg = await message.reply({ embeds: [getEmbed(false)], components: getRows(false) });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000, filter: i => i.user.id === message.author.id });

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
                await i.reply({ content: "Insufficient funds to double.", ephemeral: true });
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
                if (dealerScore > 21) {
                    result = "Dealer Busts! You Win!";
                    payout = currentBet * 2;
                } else if (dealerScore > playerScore) {
                    result = "Dealer Wins.";
                    payout = 0;
                } else if (dealerScore < playerScore) {
                    result = "You Win!";
                    payout = currentBet * 2;
                } else {
                    result = "Push.";
                    payout = currentBet;
                }
            }
            let actualPayout;
            try {
                actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, message.guildId!);
            } catch (e) {
                await i.update({ content: `Transaction failed: ${(e as Error).message}`, components: [] });
                return;
            }
            payout = actualPayout;
            await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
            if (payout > currentBet) await updateQuestProgress(user.id, "WIN_BLACKJACK").catch(console.error);

            await i.update({ embeds: [getEmbed(true)], components: [] });
        }
    });

    collector.on("end", async (_, reason) => {
        if (reason === "time" && !gameOver) {
            gameOver = true;
            result = "Game timed out. You surrendered.";
            payout = 0;

            let actualPayout;
            try {
                actualPayout = await placeBetWithTransaction(user.id, user.wallet!.id, "blackjack", currentBet, "blackjack", payout > currentBet, payout, message.guildId!);
            } catch (e) {
                await msg.edit({ content: `Transaction failed: ${(e as Error).message}`, components: [] });
                return;
            }
            payout = actualPayout;
            await updateQuestProgress(user.id, "GAMBLE").catch(console.error);
            // No WIN_BLACKJACK update

            await msg.edit({ embeds: [getEmbed(true)], components: [] });
        }
    });
}
