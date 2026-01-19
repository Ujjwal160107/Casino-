
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors, Message } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";

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
const LOBBY_TIME = 60 * 1000;

export const data = new SlashCommandBuilder()
    .setName("russianroulette")
    .setDescription("Play Russian Roulette")
    .addSubcommand(sub => sub.setName("start").setDescription("Start a new game lobby").addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true)))
    .addSubcommand(sub => sub.setName("join").setDescription("Join an existing lobby"))
    .addSubcommand(sub => sub.setName("force").setDescription("Force start the game (Host only)"));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const sub = interaction.options.getSubcommand();
    const config = await getGuildConfig(interaction.guildId);
    const currency = config.currencyEmoji;
    const lobby = waitingLobbies.get(interaction.channelId);

    if (sub === "start") {
        if (lobby) {
            return interaction.reply({ embeds: [errorEmbed(interaction.user, "Game Active", "A game is already active here. Join it!")], ephemeral: true });
        }
        const amountStr = interaction.options.getString("amount", true);
        const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId, interaction.user.username);
        const bet = parseBetAmount(amountStr, user.wallet!.balance);

        if (isNaN(bet) || bet <= 0) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Bet", "Please specify a valid amount.")], ephemeral: true });
        if (user.wallet!.balance < bet) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", "You can't afford this bet.")], ephemeral: true });

        await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { decrement: bet } } });

        const newLobby: RRLobby = {
            channelId: interaction.channelId,
            hostId: interaction.user.id,
            betAmount: bet,
            players: [{ id: interaction.user.id, username: interaction.user.username, walletId: user.wallet!.id }],
            status: "WAITING",
            message: null,
            timeout: null
        };

        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Gun} Russian Roulette | Bet: ${fmtCurrency(bet, currency)}`)
            .setDescription(`**${interaction.user.username}** has loaded the gun!\n\nUse \`/russianroulette join\` to play.\nUse \`/russianroulette force\` to start immediately.`)
            .addFields({ name: "Players (1/6)", value: `1. ${interaction.user.username}` })
            .setColor(Colors.DarkRed)
            .setFooter({ text: "Lobby closes in 60s" });

        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        newLobby.message = msg;

        newLobby.timeout = setTimeout(() => {
            const current = waitingLobbies.get(interaction.channelId);
            if (current && current.status === "WAITING") {
                if (current.players.length >= MIN_PLAYERS) startGame(interaction.channelId, interaction.guildId!);
                else cancelGame(interaction.channelId, "Not enough players joined.");
            }
        }, LOBBY_TIME);

        waitingLobbies.set(interaction.channelId, newLobby);
        return;
    }

    if (sub === "join") {
        if (!lobby || lobby.status !== "WAITING") return interaction.reply({ embeds: [errorEmbed(interaction.user, "No Lobby", "There is no open lobby. Start one!")], ephemeral: true });
        if (lobby.players.some(p => p.id === interaction.user.id)) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Already Joined", "You are already in the game.")], ephemeral: true });
        if (lobby.players.length >= MAX_PLAYERS) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Lobby Full", "Maximum 6 players allowed.")], ephemeral: true });

        const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId, interaction.user.username);
        if (user.wallet!.balance < lobby.betAmount) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", `You need **${fmtCurrency(lobby.betAmount, currency)}**.`)] });

        await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { decrement: lobby.betAmount } } });
        lobby.players.push({ id: interaction.user.id, username: interaction.user.username, walletId: user.wallet!.id });

        const embed = new EmbedBuilder(lobby.message!.embeds[0].data)
            .setFields({ name: `Players (${lobby.players.length}/6)`, value: lobby.players.map((p, i) => `${i + 1}. ${p.username}`).join("\n") });

        await lobby.message!.edit({ embeds: [embed] });
        await interaction.reply({ content: "Joined!", ephemeral: true });
        return;
    }

    if (sub === "force") {
        if (!lobby) return interaction.reply({ embeds: [errorEmbed(interaction.user, "No Lobby", "No active lobby.")], ephemeral: true });
        if (interaction.user.id !== lobby.hostId) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Not Host", "Only the host can force start.")], ephemeral: true });
        if (lobby.players.length < MIN_PLAYERS) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Not Enough Players", `Need at least ${MIN_PLAYERS} players.`)] });

        if (lobby.timeout) clearTimeout(lobby.timeout);
        startGame(interaction.channelId, interaction.guildId);
        await interaction.deferReply({ ephemeral: true });
        await interaction.deleteReply(); // Just ack
        return;
    }
}

async function cancelGame(channelId: string, reason: string) {
    const lobby = waitingLobbies.get(channelId);
    if (!lobby) return;
    waitingLobbies.delete(channelId);

    for (const p of lobby.players) {
        await prisma.wallet.update({ where: { id: p.walletId }, data: { balance: { increment: lobby.betAmount } } });
    }
    const embed = errorEmbed({ username: "System" } as any, "Game Cancelled", reason + "\nAll bets refunded.");
    if (lobby.message) await lobby.message.reply({ embeds: [embed] });
}

async function startGame(channelId: string, guildId: string) {
    const lobby = waitingLobbies.get(channelId);
    if (!lobby) return;
    lobby.status = "PLAYING";
    const players = lobby.players.sort(() => Math.random() - 0.5);

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Rip} Russian Roulette Started`)
        .setDescription(`The cylinder is spun... **${players.length}** players stand in a circle.\nThere is **1 bullet** in **6 chambers**.\n\nChecking chamber 1...`)
        .setColor(Colors.Gold)
        .addFields({ name: "Turn Order", value: players.map((p, i) => `${i + 1}. ${p.username}`).join(" -> ") });

    const newMsg = await (lobby.message!.channel as any).send({ embeds: [embed] });
    lobby.message = newMsg;

    let chamber = 1;
    let deadPlayer: RRPlayer | null = null;
    let turnIndex = 0;

    while (!deadPlayer && chamber <= 6) {
        const currentPlayer = players[turnIndex % players.length];
        await new Promise(r => setTimeout(r, 2500));
        const odds = 1 / (7 - chamber);
        const isHit = Math.random() < odds;

        const suspenseEmbed = new EmbedBuilder(embed.data).setDescription(`Round ${chamber} | **${currentPlayer.username}** holds the gun...\n${Mascot.Emotes.Shocked} *Sweating...*`).setColor(Colors.Yellow);
        await lobby.message!.edit({ embeds: [suspenseEmbed] });

        await new Promise(r => setTimeout(r, 2500));

        if (isHit) {
            deadPlayer = currentPlayer;
            const deathEmbed = new EmbedBuilder(embed.data).setTitle(`${Mascot.Emotes.Fail} BANG!`).setDescription(`**${currentPlayer.username}** pulled the trigger... **BANG!**\nThey drop to the floor.`).setColor(Colors.Red);
            await lobby.message!.edit({ embeds: [deathEmbed] });
        } else {
            const safeEmbed = new EmbedBuilder(embed.data).setDescription(`**${currentPlayer.username}** pulled the trigger... **CLICK!**\nThey sigh in relief. Passing the gun.`).setColor(Colors.Green);
            await lobby.message!.edit({ embeds: [safeEmbed] });
            chamber++;
            turnIndex++;
        }
    }

    if (deadPlayer) {
        const winners = lobby.players.filter(p => p.id !== deadPlayer!.id);
        const pot = lobby.betAmount * lobby.players.length;
        const winAmount = Math.floor(pot / winners.length);
        const config = await getGuildConfig(guildId);

        for (const w of winners) {
            await prisma.wallet.update({ where: { id: w.walletId }, data: { balance: { increment: winAmount } } });
        }

        const winMsg = winners.map(w => `**${w.username}** (+${fmtCurrency(winAmount - lobby.betAmount, config.currencyEmoji)})`).join(", ");
        const finalEmbed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Rip} Game Over`)
            .setDescription(`**${deadPlayer.username}** is eliminated!\n\nThe survivors split the pot:\n${winMsg}`)
            .setColor(Colors.DarkButNotBlack)
            .setTimestamp();

        await new Promise(r => setTimeout(r, 1000));
        await lobby.message!.reply({ embeds: [finalEmbed] });
    } else {
        cancelGame(channelId, "The gun jammed? (Error)");
    }
    waitingLobbies.delete(channelId);
}
