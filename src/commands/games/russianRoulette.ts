import { Message, EmbedBuilder, Colors } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { creditGamePayout, debitGameBet } from "../../services/gameService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { Mascot } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";

// --- Types ---
interface RRPlayer {
    id: string; // Discord ID
    username: string;
    walletId: string;
}

interface RRLobby {
    channelId: string;
    hostId: string;
    betAmount: number;
    players: RRPlayer[];
    status: "WAITING" | "PLAYING";
    timeout: NodeJS.Timeout | null;
    message: Message | null; // The lobby message to edit
}

// --- State ---
const waitingLobbies = new Map<string, RRLobby>(); // Key: Channel ID

// --- Constants ---
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const LOBBY_TIME = 60 * 1000; // 60 seconds to join

export async function handleRussianRoulette(message: Message, args: string[]) {
    const config = await getGuildConfig(message.guildId!);
    const currency = config.currencyEmoji;
    const sub = args[0]?.toLowerCase();
    const lobby = waitingLobbies.get(message.channelId);

    // --- START ---
    if (sub === "start" || sub === "create") {
        if (lobby) {
            return message.reply({ embeds: [errorEmbed(message.author, "Game Active", "A game is already active in this channel. Join it!")] });
        }

        const amountStr = args[1];
        const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.username);
        const bet = parseBetAmount(amountStr, user.wallet!.balance);

        if (isNaN(bet) || bet <= 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Bet", "Please specify a valid bet amount.")] });
        }
        const { min, max } = getGameBetLimits(config, "russian_roulette");
        if (bet < min) {
            return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Russian Roulette is **${fmtCurrency(min, currency)}**.`)] });
        }
        if (bet > max) {
            return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Russian Roulette is **${fmtCurrency(max, currency)}**.`)] });
        }
        if (user.wallet!.balance < bet) {
            return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", "You can't afford this bet.")] });
        }

        await debitGameBet(user.wallet!.id, bet, {
            game: "russian_roulette",
            betAmount: bet,
            guildId: message.guildId!,
            channelId: message.channelId,
            choice: "host"
        });

        // Create Lobby
        const newLobby: RRLobby = {
            channelId: message.channelId,
            hostId: message.author.id,
            betAmount: bet,
            players: [{ id: message.author.id, username: message.author.username, walletId: user.wallet!.id }],
            status: "WAITING",
            message: null,
            timeout: null
        };

        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Gun} Russian Roulette | Bet: ${fmtCurrency(bet, currency)}`)
            .setDescription(`**${message.author.username}** has loaded the gun!\n\nType \`${config.prefix}rr join\` to play.\nType \`${config.prefix}rr start\` to begin immediately.`)
            .addFields({ name: "Players (1/6)", value: `1. ${message.author.username}` })
            .setColor(Colors.DarkRed)
            .setFooter({ text: "Lobby closes in 60s" });

        const msg = await message.reply({ embeds: [embed] });
        newLobby.message = msg;

        // Auto-start timer
        newLobby.timeout = setTimeout(() => {
            const current = waitingLobbies.get(message.channelId);
            if (current && current.status === "WAITING") {
                if (current.players.length >= MIN_PLAYERS) {
                    startGame(message.channelId, message);
                } else {
                    cancelGame(message.channelId, message, "Not enough players joined.");
                }
            }
        }, LOBBY_TIME);

        waitingLobbies.set(message.channelId, newLobby);
        return;
    }

    // --- JOIN ---
    if (sub === "join") {
        if (!lobby || lobby.status !== "WAITING") {
            return message.reply({ embeds: [errorEmbed(message.author, "No Lobby", "There is no open lobby in this channel. Start one with `" + config.prefix + "rr start <amount>`!")] });
        }
        if (lobby.players.some(p => p.id === message.author.id)) {
            return message.reply({ embeds: [errorEmbed(message.author, "Already Joined", "You are already in the game.")] });
        }
        if (lobby.players.length >= MAX_PLAYERS) {
            return message.reply({ embeds: [errorEmbed(message.author, "Lobby Full", "Maximum 6 players allowed.")] });
        }

        const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.username);
        if (user.wallet!.balance < lobby.betAmount) {
            return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", `You need **${fmtCurrency(lobby.betAmount, currency)}** to join.`)] });
        }

        await debitGameBet(user.wallet!.id, lobby.betAmount, {
            game: "russian_roulette",
            betAmount: lobby.betAmount,
            guildId: message.guildId!,
            channelId: message.channelId,
            messageId: lobby.message?.id,
            choice: "join"
        });

        lobby.players.push({ id: message.author.id, username: message.author.username, walletId: user.wallet!.id });

        // Update Embed
        const embed = new EmbedBuilder(lobby.message!.embeds[0].data)
            .setFields({ name: `Players (${lobby.players.length}/6)`, value: lobby.players.map((p, i) => `${i + 1}. ${p.username}`).join("\n") });

        await lobby.message!.edit({ embeds: [embed] });
        message.delete().catch(() => { }); // Clean up join command
        return;
    }

    // --- FORCE START ---
    if ((sub === "force" || sub === "start") && lobby) {
        if (message.author.id !== lobby.hostId) {
            // Allow start if it's "start" command but check lobby existence handled above
            return message.reply({ embeds: [errorEmbed(message.author, "Not Host", "Only the host can force start.")] });
        }
        if (lobby.players.length < MIN_PLAYERS) {
            return message.reply({ embeds: [errorEmbed(message.author, "Not Enough Players", `Need at least ${MIN_PLAYERS} players.`)] });
        }
        if (lobby.timeout) clearTimeout(lobby.timeout);
        startGame(message.channelId, message);
        return;
    }

    // Default Help
    const helpEmbed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Gun} Russian Roulette Help`)
        .setDescription(`High stakes, one bullet. Survivor takes the dead man's share.\n\n` +
            `\`${config.prefix}rr start <amount>\` - Host a game\n` +
            `\`${config.prefix}rr join\` - Join a game\n` +
            `\`${config.prefix}rr force\` - Start game immediately (Host only)`)
        .setColor(Colors.DarkButNotBlack);
    return message.reply({ embeds: [helpEmbed] });
}

async function cancelGame(channelId: string, message: Message, reason: string) {
    const lobby = waitingLobbies.get(channelId);
    if (!lobby) return;

    waitingLobbies.delete(channelId);

    // Refunds
    for (const p of lobby.players) {
        await creditGamePayout(p.walletId, lobby.betAmount, "game_refund", {
            game: "russian_roulette",
            betAmount: lobby.betAmount,
            payout: lobby.betAmount,
            result: "cancelled",
            guildId: message.guildId!,
            channelId,
            messageId: lobby.message?.id
        });
    }

    const embed = errorEmbed(message.author, "Game Cancelled", reason + "\nAll bets refunded.");
    if (lobby.message) await lobby.message.reply({ embeds: [embed] });
}

async function startGame(channelId: string, message: Message) {
    const lobby = waitingLobbies.get(channelId);
    if (!lobby) return;

    lobby.status = "PLAYING";
    const config = await getGuildConfig(message.guildId!);
    const currency = config.currencyEmoji;

    // Shuffle players
    const players = lobby.players.sort(() => Math.random() - 0.5);

    // Initial Game Embed
    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Rip} Russian Roulette Started`)
        .setDescription(`The cylinder is spun... **${players.length}** players stand in a circle.\nThere is **1 bullet** in **6 chambers**.\n\nChecking chamber 1...`)
        .setColor(Colors.Gold)
        .addFields({ name: "Turn Order", value: players.map((p, i) => `${i + 1}. ${p.username}`).join(" -> ") });

    const newMsg = await (message.channel as any).send({ embeds: [embed] });
    lobby.message = newMsg;

    // Game Loop
    let chamber = 1;
    let deadPlayer: RRPlayer | null = null;
    let turnIndex = 0;

    // We loop until someone dies
    // Simulating "Non-spinning" cylinder: Odds are 1/(7-chamber).

    while (!deadPlayer && chamber <= 6) {
        const currentPlayer = players[turnIndex % players.length];

        // Wait for suspense
        await new Promise(r => setTimeout(r, 2500));

        const odds = 1 / (7 - chamber); // 1/6, 1/5, 1/4...
        const roll = Math.random();
        const isHit = roll < odds;

        // Build status string
        let status = `Round ${chamber} | **${currentPlayer.username}** holds the gun...`;

        // Update Embed with "Thinking..." state
        const suspenseEmbed = new EmbedBuilder(embed.data)
            .setDescription(status + `\n${Mascot.Emotes.Shocked} *Sweating...*`)
            .setColor(Colors.Yellow);
        await lobby.message!.edit({ embeds: [suspenseEmbed] });

        await new Promise(r => setTimeout(r, 2500));

        if (isHit) {
            deadPlayer = currentPlayer;
            const deathEmbed = new EmbedBuilder(embed.data)
                .setTitle(`${Mascot.Emotes.Fail} BANG!`)
                .setDescription(`**${currentPlayer.username}** pulled the trigger... **BANG!**\nThey drop to the floor.`)
                .setColor(Colors.Red)
                .setImage("https://media.tenor.com/tH0-x5aC0HAAAAAC/gun-reload.gif"); // Placeholder or just use text
            await lobby.message!.edit({ embeds: [deathEmbed] });
        } else {
            const safeEmbed = new EmbedBuilder(embed.data)
                .setDescription(`**${currentPlayer.username}** pulled the trigger... **CLICK!**\nThey sigh in relief. Passing the gun.`)
                .setColor(Colors.Green);
            await lobby.message!.edit({ embeds: [safeEmbed] });

            chamber++;
            turnIndex++;
        }
    }

    if (deadPlayer) {
        // Payout Logic
        // Winners are everyone except deadPlayer
        const winners = lobby.players.filter(p => p.id !== deadPlayer!.id);
        const pot = lobby.betAmount * lobby.players.length;
        // Dead player lost their bet already (deducted at start).
        // Winners get their bet back + split of dead player's bet.
        // Actually, Pot / Winners.length.

        const winAmount = Math.floor(pot / winners.length);

        for (const w of winners) {
            await creditGamePayout(w.walletId, winAmount, "game_win", {
                game: "russian_roulette",
                betAmount: lobby.betAmount,
                payout: winAmount,
                result: "survived",
                guildId: message.guildId!,
                channelId,
                messageId: lobby.message?.id
            });
        }

        await creditGamePayout(deadPlayer.walletId, 0, "game_loss", {
            game: "russian_roulette",
            betAmount: lobby.betAmount,
            payout: 0,
            result: "eliminated",
            guildId: message.guildId!,
            channelId,
            messageId: lobby.message?.id
        });

        // LOGGING
        await import("../../utils/discordLogger").then(({ logToChannel }) => {
            logToChannel(message.client, {
                guild: message.guild!,
                type: "ECONOMY",
                title: "Russian Roulette Result",
                description: `**Eliminated:** ${deadPlayer?.username}\n**Survivors:** ${winners.length}\n**Pot:** ${fmtCurrency(pot, currency)}\n**Win/Person:** ${fmtCurrency(winAmount, currency)}`,
                color: Colors.DarkRed,
                thumbnail: message.guild?.iconURL() || undefined
            }).catch(() => { });
        });

        const winMsg = winners.map(w => `**${w.username}** (+${fmtCurrency(winAmount - lobby.betAmount, currency)})`).join(", ");

        const finalEmbed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Rip} Game Over`)
            .setDescription(`**${deadPlayer.username}** is eliminated!\n\nThe survivors split the pot:\n${winMsg}`)
            .setColor(Colors.DarkButNotBlack)
            .setTimestamp();

        // Final delay before showing results
        await new Promise(r => setTimeout(r, 1000));
        await lobby.message!.reply({ embeds: [finalEmbed] });
    } else {
        // Should not happen in 1-bullet fixed logic unless logic fails
        cancelGame(channelId, message, "The gun jammed? (Error)");
    }

    waitingLobbies.delete(channelId);
}
