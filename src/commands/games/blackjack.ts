import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, ContainerBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder, MessageFlags } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { placeBetWithTransaction } from "../../services/gameService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { checkCasinoCooldown, setCasinoCooldown, formatCasinoCooldownMessage, acquireActiveGameLock, releaseActiveGameLock } from "../../services/casinoCooldownService";
import { formatDuration } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { questBus } from "../../services/questEvents";
import { checkLuckyCoin, checkCrownOfGreed, recordPotentialSoulLedgerLoss, getCurrentLuck } from "../../services/shopBuffs";
import { getGuildPrefix } from "../../utils/guildContext";

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

function drawDealerCardWithLuck(deck: Card[], dealerScore: number, luck: number): Card {
    if (dealerScore >= 12 && dealerScore <= 16) {
        const luckDelta = (luck - 50) / 100;
        const impactChance = Math.abs(luckDelta) * 0.08;

        if (Math.random() < impactChance) {
            if (luckDelta > 0) {
                const bustIdx = deck.findIndex(c => c.value + dealerScore > 21);
                if (bustIdx !== -1) return deck.splice(bustIdx, 1)[0];
            } else {
                const safeIdx = deck.findIndex(c => c.value + dealerScore <= 21);
                if (safeIdx !== -1) return deck.splice(safeIdx, 1)[0];
            }
        }
    }
    return deck.pop()!;
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
        return message.reply(v2Reply(errorContainer("Invalid Bet", "Please enter a valid amount (e.g., 500, 1k, all).")));
    }
    const amount = bet;
    const prefix = await getGuildPrefix(message.guildId!);
    const { min, max } = getGameBetLimits("blackjack");

    const eCasino = "<a:casino:1456568719374553138>";

    if (amount < min) {
        return message.reply(v2Reply(errorContainer("Bet Too Low", `The minimum bet for Blackjack is **${fmtCurrency(min)}**.`)));
    }
    if (amount > max) {
        return message.reply(v2Reply(errorContainer("Bet Too High", `The maximum bet for Blackjack is **${fmtCurrency(max)}**.`)));
    }
    const cd = await checkCasinoCooldown("blackjack", message.author.id);
    if (cd.active) {
        const msg = cd.unavailable
            ? "Casino cooldown service is temporarily unavailable. Try again soon."
            : formatCasinoCooldownMessage("blackjack", cd.availableAtUnix!);
        const cdMsg = await message.reply(v2Reply(errorContainer("Cooldown Active", msg)));
        setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
        return;
    }

    if (user.wallet!.balance < amount) {
        return message.reply(v2Reply(errorContainer("Insufficient Funds", "You don't have enough money.")));
    }

    // Active-game lock acquired AFTER all validation — so failed checks never lock the user out
    const lockAcquired = await acquireActiveGameLock("blackjack", message.author.id);
    if (!lockAcquired) {
        const cdMsg = await message.reply(v2Reply(errorContainer("Game In Progress", "You already have an active Blackjack game. Finish it first.")));
        setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
        return;
    }

    const luckyCoinMultiplier = await checkLuckyCoin(message.author.id);
    const hasLuckyCoin = luckyCoinMultiplier > 1;
    const crownMult = await checkCrownOfGreed(message.author.id);
    const luck = await getCurrentLuck(message.author.id);

    // Applies Crown of Greed to gross payout: boosts profit on win, increases stake on loss
    function applyCrown(stake: number, grossPayout: number): { adjustedStake: number; adjustedPayout: number } {
      if (grossPayout > stake) {
        // Win: boost net profit portion
        const netProfit = grossPayout - stake;
        return { adjustedStake: stake, adjustedPayout: stake + Math.floor(netProfit * crownMult) };
      } else if (grossPayout === stake) {
        // Push: no change
        return { adjustedStake: stake, adjustedPayout: grossPayout };
      } else {
        // Loss: increase effective stake (loss amount)
        const adjustedStake = Math.min(Math.floor(stake * crownMult), user.wallet!.balance);
        return { adjustedStake, adjustedPayout: 0 };
      }
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
            result = `Blackjack! You win!${hasLuckyCoin ? " 🪙 Lucky Coin active!" : ""}`;
            payout = Math.ceil(currentBet * 2.5 * luckyCoinMultiplier);
        }
    }
    const getContainer = (reveal: boolean) => {
        const pScore = calculateScore(playerHand);
        const dScore = reveal ? calculateScore(dealerHand) : calculateScore(dealerHand.slice(1));

        let body = `## ${eCasino} Blackjack Table\n`;
        body += `**Your Hand (${pScore})**\n${formatHand(playerHand)}\n`;
        body += `**Dealer's Hand (${dScore})**\n${formatHand(dealerHand, !reveal)}\n\n`;
        body += `**Bet:** ${fmtCurrency(currentBet)}`;

        let thumbUrl: string | undefined;
        if (gameOver) {
            body += `\n\n**${result}**\n${payout > 0 ? `**Payout:** ${fmtCurrency(payout)}` : ""}`;

            const winUrl = getEmoteUrl(Mascot.Emotes.Money);
            const failUrl = getEmoteUrl(Mascot.Emotes.Fail);

            if (payout > currentBet && winUrl) thumbUrl = winUrl;
            else if (payout === 0 && failUrl) thumbUrl = failUrl;

        } else {
            body += `\n\n**Hit** - Take another card\n**Stand** - End the game\n**Double Down** - Double your bet, hit once, then stand`;
            if (hasLuckyCoin) body += `\n\n🪙 **Lucky Coin active!** Wins pay **${(luckyCoinMultiplier * 100).toFixed(0)}%** more.`;
        }

        const container = new ContainerBuilder();
        if (thumbUrl) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
            );
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
        }

        if (gameOver) {
            const hint = nextStepHint("casino", prefix);
            if (hint) {
                container.addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
                );
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(hint));
            }
        }
        return container;
    };

    const getRows = (disabled: boolean) => {
        return [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`bj:${message.author.id}:hit`).setLabel("Hit").setStyle(ButtonStyle.Primary).setDisabled(disabled),
                new ButtonBuilder().setCustomId(`bj:${message.author.id}:stand`).setLabel("Stand").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
                new ButtonBuilder().setCustomId(`bj:${message.author.id}:double`).setLabel("Double").setStyle(ButtonStyle.Success).setDisabled(disabled || playerHand.length > 2 || user.wallet!.balance < currentBet * 2)
            )
        ];
    };

    if (gameOver) {
        try {
            const { adjustedStake: cs1, adjustedPayout: cp1 } = applyCrown(currentBet, payout);
            if (cp1 === 0 && currentBet > 300_000) await recordPotentialSoulLedgerLoss(user.discordId, cs1);
            const actualPayout = await placeBetWithTransaction(user.discordId, user.wallet!.id, "blackjack", cs1, "blackjack", cp1 > cs1, cp1, message.guildId!);
            payout = actualPayout;
            await releaseActiveGameLock("blackjack", user.discordId);
            await setCasinoCooldown("blackjack", user.discordId, message.guildId!);
            questBus.emit("casino:play", { discordId: user.discordId, bet: amount });
            if (payout > currentBet) questBus.emit("casino:win", { discordId: user.discordId, game: "blackjack" });
        } catch (e) {
            return message.reply(v2Reply(errorContainer("Transaction Failed", "Transaction failed.")));
        }
        return message.reply(v2Reply(getContainer(true)));
    }

    const dealContainer = getContainer(false);
    for (const row of getRows(false)) dealContainer.addActionRowComponents(row);
    const msg = await message.reply(v2Reply(dealContainer));
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

    collector.on("collect", async (i) => {
        if (!i.customId.startsWith(`bj:${message.author.id}:`)) {
            await i.reply({ content: "This game isn't yours.", ephemeral: true });
            return;
        }

        const action = i.customId.split(":").pop();
        if (action === "hit") {
            playerHand.push(deck.pop()!);
            playerScore = calculateScore(playerHand);
            if (playerScore > 21) {
                gameOver = true;
                result = "Bust! You went over 21.";
                payout = 0;
                collector.stop();
            }
        } else if (action === "stand") {
            gameOver = true;
            collector.stop();
        } else if (action === "double") {
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
            const updateContainer = getContainer(false);
            for (const row of getRows(false)) updateContainer.addActionRowComponents(row);
            await i.update({ components: [updateContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            if (playerScore <= 21) {
                while (dealerScore < 17) {
                    dealerHand.push(drawDealerCardWithLuck(deck, dealerScore, luck));
                    dealerScore = calculateScore(dealerHand);
                }
                if (dealerScore > 21) {
                    result = `Dealer Busts! You Win!${hasLuckyCoin ? " 🪙 Lucky Coin!" : ""}`;
                    payout = Math.floor(currentBet * 2 * luckyCoinMultiplier);
                } else if (dealerScore > playerScore) {
                    result = "Dealer Wins.";
                    payout = 0;
                } else if (dealerScore < playerScore) {
                    result = `You Win!${hasLuckyCoin ? " 🪙 Lucky Coin!" : ""}`;
                    payout = Math.floor(currentBet * 2 * luckyCoinMultiplier);
                } else {
                    result = "Push.";
                    payout = currentBet;
                }
            }

            await i.deferUpdate();

            let actualPayout;
            try {
                const { adjustedStake: cs2, adjustedPayout: cp2 } = applyCrown(currentBet, payout);
                if (cp2 === 0 && currentBet > 300_000) await recordPotentialSoulLedgerLoss(user.discordId, cs2);
                actualPayout = await placeBetWithTransaction(user.discordId, user.wallet!.id, "blackjack", cs2, "blackjack", cp2 > cs2, cp2, message.guildId!);
            } catch (e) {
                await msg.edit(v2Reply(errorContainer("Transaction Failed", (e as Error).message)));
                return;
            }
            payout = actualPayout;
            await releaseActiveGameLock("blackjack", user.discordId);
            await setCasinoCooldown("blackjack", user.discordId, message.guildId!);
            questBus.emit("casino:play", { discordId: user.discordId, bet: amount });
            if (payout > currentBet) questBus.emit("casino:win", { discordId: user.discordId, game: "blackjack" });

            import("../../utils/discordLogger").then(({ logToChannel }) => {
                logToChannel(message.client, {
                    guild: message.guild!,
                    type: "ECONOMY",
                    title: "Blackjack Game",
                    description: `**User:** ${message.author.toString()}\n**Result:** ${result}\n**Bet:** ${fmtCurrency(currentBet)}\n**Payout:** ${fmtCurrency(payout)}`,
                    color: payout > currentBet ? 0x00FF00 : (payout === currentBet ? 0xFFFF00 : 0xFF0000),
                    thumbnail: message.author.displayAvatarURL()
                }).catch(() => { });
            });

            await msg.edit({ components: [getContainer(true)], flags: MessageFlags.IsComponentsV2 });
        }
    });

    collector.on("end", async (_, reason) => {
        if (reason === "time" && !gameOver) {
            gameOver = true;
            result = "Game timed out. You surrendered.";
            payout = 0;

            let actualPayout;
            try {
                const { adjustedStake: cs3, adjustedPayout: cp3 } = applyCrown(currentBet, payout);
                if (cp3 === 0 && currentBet > 300_000) await recordPotentialSoulLedgerLoss(user.discordId, cs3);
                actualPayout = await placeBetWithTransaction(user.discordId, user.wallet!.id, "blackjack", cs3, "blackjack", cp3 > cs3, cp3, message.guildId!);
            } catch (e) {
                await msg.edit(v2Reply(errorContainer("Transaction Failed", (e as Error).message)));
                return;
            }
            payout = actualPayout;
            await releaseActiveGameLock("blackjack", user.discordId);
            await setCasinoCooldown("blackjack", user.discordId, message.guildId!);
            questBus.emit("casino:play", { discordId: user.discordId, bet: amount });
            // No WIN_BLACKJACK update

            await msg.edit({ components: [getContainer(true)], flags: MessageFlags.IsComponentsV2 });
        }
    });
}
