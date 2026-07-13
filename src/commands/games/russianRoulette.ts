import { Message, Colors, MessageFlags, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { creditGamePayout, debitGameBet } from "../../services/gameService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { Mascot } from "../../config/branding";
import { getGameBetLimits } from "../../utils/gameUtils";
import { getGuildPrefix } from "../../utils/guildContext";

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

// --- Render helpers (Components V2) ---
// Lobby frame rebuilt from state each time a player joins.
function buildLobbyContainer(lobby: RRLobby, prefix: string): ContainerBuilder {
    const hostName = lobby.players.find(p => p.id === lobby.hostId)?.username ?? "Host";
    const playerLines = lobby.players.map((p, i) => `${i + 1}. ${p.username}`).join("\n");
    const body =
        `## ${Mascot.Emotes.Gun} Russian Roulette | Bet: ${fmtCurrency(lobby.betAmount)}\n` +
        `**${hostName}** has loaded the gun!\n\n` +
        `Type \`${prefix}rr join\` to play.\n` +
        `Type \`${prefix}rr start\` to begin immediately.\n\n` +
        `**Players (${lobby.players.length}/6):**\n${playerLines}`;
    return plainContainer(body);
}

// In-game round frame. Turn order persists across every frame like the old embed field did.
function buildRoundContainer(opts: {
    title: string;
    description: string;
    players: RRPlayer[];
    imageUrl?: string;
}): ContainerBuilder {
    const turnOrder = opts.players.map((p, i) => `${i + 1}. ${p.username}`).join(" -> ");
    const container = plainContainer(`## ${opts.title}\n${opts.description}\n\n**Turn Order:** ${turnOrder}`);
    if (opts.imageUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(opts.imageUrl),
            ),
        );
    }
    return container;
}

export async function handleRussianRoulette(message: Message, args: string[]) {
    const prefix = await getGuildPrefix(message.guildId!);
    const sub = args[0]?.toLowerCase();
    const lobby = waitingLobbies.get(message.channelId);

    // --- START ---
    if (sub === "start" || sub === "create") {
        if (lobby) {
            return message.reply(v2Reply(errorContainer("Game Active", "A game is already active in this channel. Join it!")));
        }

        const amountStr = args[1];
        const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.username);
        const bet = parseBetAmount(amountStr, user.wallet!.balance);

        if (isNaN(bet) || bet <= 0) {
            return message.reply(v2Reply(errorContainer("Invalid Bet", "Please specify a valid bet amount.")));
        }
        const { min, max } = getGameBetLimits("russian_roulette");
        if (bet < min) {
            return message.reply(v2Reply(errorContainer("Bet Too Low", `The minimum bet for Russian Roulette is **${fmtCurrency(min)}**.`)));
        }
        if (bet > max) {
            return message.reply(v2Reply(errorContainer("Bet Too High", `The maximum bet for Russian Roulette is **${fmtCurrency(max)}**.`)));
        }
        if (user.wallet!.balance < bet) {
            return message.reply(v2Reply(errorContainer("Insufficient Funds", "You can't afford this bet.")));
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

        const msg = await message.reply(v2Reply(buildLobbyContainer(newLobby, prefix)));
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
            return message.reply(v2Reply(errorContainer("No Lobby", "There is no open lobby in this channel. Start one with `" + prefix + "rr start <amount>`!")));
        }
        if (lobby.players.some(p => p.id === message.author.id)) {
            return message.reply(v2Reply(errorContainer("Already Joined", "You are already in the game.")));
        }
        if (lobby.players.length >= MAX_PLAYERS) {
            return message.reply(v2Reply(errorContainer("Lobby Full", "Maximum 6 players allowed.")));
        }

        const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.username);
        if (user.wallet!.balance < lobby.betAmount) {
            return message.reply(v2Reply(errorContainer("Insufficient Funds", `You need **${fmtCurrency(lobby.betAmount)}** to join.`)));
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

        // Update lobby frame from state
        await lobby.message!.edit({ components: [buildLobbyContainer(lobby, prefix)], flags: MessageFlags.IsComponentsV2 });
        message.delete().catch(() => { }); // Clean up join command
        return;
    }

    // --- FORCE START ---
    if ((sub === "force" || sub === "start") && lobby) {
        if (message.author.id !== lobby.hostId) {
            // Allow start if it's "start" command but check lobby existence handled above
            return message.reply(v2Reply(errorContainer("Not Host", "Only the host can force start.")));
        }
        if (lobby.players.length < MIN_PLAYERS) {
            return message.reply(v2Reply(errorContainer("Not Enough Players", `Need at least ${MIN_PLAYERS} players.`)));
        }
        if (lobby.timeout) clearTimeout(lobby.timeout);
        startGame(message.channelId, message);
        return;
    }

    // Default Help
    const helpContainer = plainContainer(
        `## ${Mascot.Emotes.Gun} Russian Roulette Help\n` +
        `High stakes, one bullet. Survivor takes the dead man's share.\n\n` +
        `\`${prefix}rr start <amount>\` - Host a game\n` +
        `\`${prefix}rr join\` - Join a game\n` +
        `\`${prefix}rr force\` - Start game immediately (Host only)`
    );
    return message.reply(v2Reply(helpContainer));
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

    const container = errorContainer("Game Cancelled", reason + "\nAll bets refunded.");
    if (lobby.message) await lobby.message.reply(v2Reply(container));
}

async function startGame(channelId: string, message: Message) {
    const lobby = waitingLobbies.get(channelId);
    if (!lobby) return;

    lobby.status = "PLAYING";
    const prefix = await getGuildPrefix(message.guildId!);

    // Shuffle players
    const players = lobby.players.sort(() => Math.random() - 0.5);

    // Initial Game Frame
    const startTitle = `${Mascot.Emotes.Rip} Russian Roulette Started`;
    const gameContainer = buildRoundContainer({
        title: startTitle,
        description: `The cylinder is spun... **${players.length}** players stand in a circle.\nThere is **1 bullet** in **6 chambers**.\n\nChecking chamber 1...`,
        players,
    });

    const newMsg = await (message.channel as any).send(v2Reply(gameContainer));
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

        // Update frame with "Thinking..." state
        const suspenseContainer = buildRoundContainer({
            title: startTitle,
            description: status + `\n${Mascot.Emotes.Shocked} *Sweating...*`,
            players,
        });
        await lobby.message!.edit({ components: [suspenseContainer], flags: MessageFlags.IsComponentsV2 });

        await new Promise(r => setTimeout(r, 2500));

        if (isHit) {
            deadPlayer = currentPlayer;
            const deathContainer = buildRoundContainer({
                title: `${Mascot.Emotes.Fail} BANG!`,
                description: `**${currentPlayer.username}** pulled the trigger... **BANG!**\nThey drop to the floor.`,
                players,
                imageUrl: "https://media.tenor.com/tH0-x5aC0HAAAAAC/gun-reload.gif", // Placeholder or just use text
            });
            await lobby.message!.edit({ components: [deathContainer], flags: MessageFlags.IsComponentsV2 });
        } else {
            const safeContainer = buildRoundContainer({
                title: startTitle,
                description: `**${currentPlayer.username}** pulled the trigger... **CLICK!**\nThey sigh in relief. Passing the gun.`,
                players,
            });
            await lobby.message!.edit({ components: [safeContainer], flags: MessageFlags.IsComponentsV2 });

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
                description: `**Eliminated:** ${deadPlayer?.username}\n**Survivors:** ${winners.length}\n**Pot:** ${fmtCurrency(pot)}\n**Win/Person:** ${fmtCurrency(winAmount)}`,
                color: Colors.DarkRed,
                thumbnail: message.guild?.iconURL() || undefined
            }).catch(() => { });
        });

        const winMsg = winners.map(w => `**${w.username}** (+${fmtCurrency(winAmount - lobby.betAmount)})`).join(", ");

        const finalBlocks = [
            `## ${Mascot.Emotes.Rip} Game Over\n**${deadPlayer.username}** is eliminated!\n\nThe survivors split the pot:\n${winMsg}`,
        ];
        const hint = nextStepHint("casino", prefix);
        if (hint) finalBlocks.push(hint);
        const finalContainer = plainContainer(...finalBlocks);

        // Final delay before showing results
        await new Promise(r => setTimeout(r, 1000));
        await lobby.message!.reply(v2Reply(finalContainer));
    } else {
        // Should not happen in 1-bullet fixed logic unless logic fails
        cancelGame(channelId, message, "The gun jammed? (Error)");
    }

    waitingLobbies.delete(channelId);
}
