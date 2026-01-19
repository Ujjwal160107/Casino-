
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    User,
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Message
} from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { generateVsImage, generateWinnerImage } from "../../utils/imageUtils";
import { checkCooldown, getCooldownExpiry, setCooldown } from "../../utils/cooldown";
import { parseBetAmount } from "../../utils/format";
import { calculateTotalStats, calculateCombatScore, getWinChance, getGameBetLimits } from "../../utils/gameUtils";
import { GameConfig } from "../../config/gameConfig";
import { Mascot } from "../../config/branding";

const EMOJI_CHICKEN = GameConfig.Emojis.Chicken;
const EMOJI_TICK = GameConfig.Emojis.Tick;
const EMOJI_RIP = GameConfig.Emojis.Rip;

export const data = new SlashCommandBuilder()
    .setName("cockfight")
    .setDescription("Challenge another user to a cockfight")
    .addUserOption(opt => opt.setName("user").setDescription("The user to challenge").setRequired(true))
    .addStringOption(opt => opt.setName("amount").setDescription("Bet amount").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const config = await getGuildConfig(interaction.guildId!);

    const targetUser = interaction.options.getUser("user", true);
    const amountStr = interaction.options.getString("amount", true);
    const betAmount = parseBetAmount(amountStr);

    if (targetUser.id === interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Error", "You cannot fight yourself.")], ephemeral: true });
    }
    if (targetUser.bot) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Error", "You cannot fight a bot.")], ephemeral: true });
    }
    if (isNaN(betAmount) || betAmount <= 0) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Invalid Amount", "Please enter a valid positive integer.")], ephemeral: true });
    }

    const { min, max } = getGameBetLimits(config, "cockfight");
    if (betAmount < min) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too Low", `Minimum bet is **${min}**.`)] });
    if (betAmount > max) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Bet Too High", `Maximum bet is **${max}**.`)] });

    const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
    const cdSeconds = cooldowns["cockfight"] || 0;
    if (cdSeconds > 0) {
        const key = `game:cockfight:${interaction.guildId}:${interaction.user.id}`;
        const remaining = checkCooldown(key, cdSeconds);
        if (remaining > 0) {
            const expire = getCooldownExpiry(key);
            const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
            return interaction.reply({ embeds: [errorEmbed(interaction.user, "Cooldown Active", `Wait <t:${ts}:R>.`)], ephemeral: true });
        }
    }

    const shopItem = await prisma.shopItem.findFirst({
        where: { guildId: interaction.guildId!, name: { equals: "Chicken", mode: "insensitive" } }
    });

    if (!shopItem) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Configuration Error", "Chicken item not found in shop.")], ephemeral: true });

    const invChallenger = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: (await getUserId(interaction.user.id, interaction.guildId!)), shopItemId: shopItem.id } }
    });

    if (!invChallenger || invChallenger.amount < 1) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Missing Item", `You need a ${EMOJI_CHICKEN} **Chicken**!`)] });
    }
    const challengerMeta = (invChallenger.meta as any) || {};
    if (challengerMeta.training) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Busy", "Your chicken is training!")] });
    if (challengerMeta.injured) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Injured", "Your chicken is injured!")] });

    const invTarget = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: (await getUserId(targetUser.id, interaction.guildId!)), shopItemId: shopItem.id } }
    });

    if (!invTarget || invTarget.amount < 1) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Opponent Missing Item", `${targetUser.username} needs a chicken!`)] });
    }
    const targetMeta = (invTarget.meta as any) || {};
    if (targetMeta.training) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Busy", `${targetUser.username}'s chicken is training!`)] });
    if (targetMeta.injured) return interaction.reply({ embeds: [errorEmbed(interaction.user, "Injured", `${targetUser.username}'s chicken is injured!`)] });

    const challengerWallet = await prisma.wallet.findUnique({ where: { userId: (await getUserId(interaction.user.id, interaction.guildId!)) } });
    if ((challengerWallet?.balance || 0) < betAmount) {
        return interaction.reply({ embeds: [errorEmbed(interaction.user, "Insufficient Funds", `You need **${betAmount}**.`)] });
    }

    const acceptEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle(`${EMOJI_CHICKEN} Cock Fight Challenge`)
        .setDescription(`${interaction.user} has challenged ${targetUser} to a **Cock Fight**!\n\n**Bet:** ${betAmount}\n**Requirement:** Both lose their Chicken on defeat.`)
        .setFooter({ text: "Click Accept to start! Expires in 30s." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("cf_accept").setLabel("Accept").setStyle(ButtonStyle.Success).setEmoji(EMOJI_TICK),
        new ButtonBuilder().setCustomId("cf_deny").setLabel("Deny").setStyle(ButtonStyle.Danger)
    );

    const reply = await interaction.reply({ content: `${targetUser}`, embeds: [acceptEmbed], components: [row], fetchReply: true });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    let gameStarted = false;

    collector.on("collect", async (i: ButtonInteraction) => {
        if (i.user.id !== targetUser.id) {
            await i.reply({ content: "This challenge is not for you.", ephemeral: true });
            return;
        }

        if (i.customId === "cf_deny") {
            await i.update({ content: "Challenge denied.", components: [], embeds: [] });
            collector.stop("denied");
            return;
        }

        if (i.customId === "cf_accept") {
            if (gameStarted) return;

            const cdSeconds = (config.gameCooldowns as Record<string, number> || {})["cockfight"] || 0;
            if (cdSeconds > 0) {
                const key = `game:cockfight:${interaction.guildId}:${targetUser.id}`;
                const expiry = getCooldownExpiry(key);
                if (expiry && expiry > Date.now()) {
                    await i.reply({ content: "You are on cooldown.", ephemeral: true });
                    return;
                }
            }

            gameStarted = true;
            try { await i.deferUpdate(); } catch { gameStarted = false; return; }

            const targetDbId = await getUserId(targetUser.id, interaction.guildId!);
            const targetWallet = await prisma.wallet.findUnique({ where: { userId: targetDbId } });
            if ((targetWallet?.balance || 0) < betAmount) {
                await i.followUp({ content: "You don't have enough money!", ephemeral: true });
                return;
            }

            await i.editReply({ components: [] });
            collector.stop("accepted");
            await runCockFight(interaction.guildId!, reply, interaction.user, targetUser, betAmount, shopItem.id);
        }
    });
}

async function getUserId(discordId: string, guildId: string): Promise<string> {
    let user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user) user = await prisma.user.create({ data: { discordId, guildId, username: "Unknown", wallet: { create: {} }, bank: { create: {} } } });
    return user.id;
}

const FIGHT_MOVES = ["{attacker} pecks {defender}!", "{attacker} flutters!", "{attacker} scratches {defender}!"];
const CRITICAL_MOVES = ["**CRITICAL HIT!** {attacker} devastates {defender}!"];
const MISS_MOVES = ["{attacker} misses!", "{defender} dodges!"];

async function runCockFight(guildId: string, gameMsg: Message, p1: User, p2: User, bet: number, chickenItemId: string) {
    const p1Id = await getUserId(p1.id, guildId);
    const p2Id = await getUserId(p2.id, guildId);

    await prisma.$transaction([
        prisma.wallet.update({ where: { userId: p1Id }, data: { balance: { decrement: bet } } }),
        prisma.wallet.update({ where: { userId: p2Id }, data: { balance: { decrement: bet } } })
    ]);

    let pot = bet * 2;
    const sideBets: { userId: string, username: string, amount: number, target: "p1" | "p2" }[] = [];
    const config = await getGuildConfig(guildId);
    const betTimeSeconds = config.cockfightBetTime || 60;

    const vsImage = await generateVsImage(p1.displayAvatarURL({ extension: "png", size: 256 }), p2.displayAvatarURL({ extension: "png", size: 256 }));

    const bettingEmbed = new EmbedBuilder()
        .setColor("#FFFF00")
        .setTitle(`${EMOJI_CHICKEN} Betting Phase!`)
        .setDescription(`**${p1.username}** vs **${p2.username}**\n**Main Pot:** ${pot}\nSide Bets Open for ${betTimeSeconds}s.`)
        .setImage("attachment://vs.png")
        .addFields({ name: `${p1.username}`, value: "No bets.", inline: true }, { name: `${p2.username}`, value: "No bets.", inline: true });

    const betRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`bet_p1`).setLabel(`Bet on ${p1.username}`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`bet_p2`).setLabel(`Bet on ${p2.username}`).setStyle(ButtonStyle.Primary)
    );

    await gameMsg.edit({ embeds: [bettingEmbed], components: [betRow], files: [vsImage] });

    let bettingClosed = false;
    const betCollector = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: betTimeSeconds * 1000 });

    betCollector.on("collect", async (i: ButtonInteraction) => {
        if (i.user.id === p1.id || i.user.id === p2.id) { await i.reply({ content: "Fighters cannot bet.", ephemeral: true }); return; }
        const target = i.customId === "bet_p1" ? "p1" : "p2";
        const modal = new ModalBuilder().setCustomId(`modal_bet_${i.id}`).setTitle(`Bet on ${target === "p1" ? p1.username : p2.username}`);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Amount").setStyle(TextInputStyle.Short).setRequired(true)));
        await i.showModal(modal);

        try {
            const submit = await i.awaitModalSubmit({ time: 30000 });
            if (bettingClosed) { await submit.reply({ content: "Bets closed!", ephemeral: true }); return; }
            const amount = parseInt(submit.fields.getTextInputValue("amount"));
            if (isNaN(amount) || amount <= 0) { await submit.reply({ content: "Invalid amount.", ephemeral: true }); return; }

            const bettorDbId = await getUserId(submit.user.id, guildId);
            const bettorWallet = await prisma.wallet.findUnique({ where: { userId: bettorDbId } });
            if (!bettorWallet || bettorWallet.balance < amount) { await submit.reply({ content: "Insufficient funds.", ephemeral: true }); return; }
            if (sideBets.some(b => b.userId === submit.user.id)) { await submit.reply({ content: "Already bet!", ephemeral: true }); return; }

            await prisma.wallet.update({ where: { userId: bettorDbId }, data: { balance: { decrement: amount } } });
            sideBets.push({ userId: submit.user.id, username: submit.user.username, amount, target });
            pot += amount;
            await submit.reply({ content: `Bet **${amount}** placed.`, ephemeral: true });

            const p1Total = sideBets.filter(b => b.target === "p1").reduce((a, b) => a + b.amount, 0);
            const p2Total = sideBets.filter(b => b.target === "p2").reduce((a, b) => a + b.amount, 0);
            if (!bettingClosed) {
                bettingEmbed.setFields(
                    { name: `${p1.username} (Total: ${p1Total})`, value: `${sideBets.filter(b => b.target === "p1").length} bets`, inline: true },
                    { name: `${p2.username} (Total: ${p2Total})`, value: `${sideBets.filter(b => b.target === "p2").length} bets`, inline: true }
                );
                bettingEmbed.setDescription(`**Main Pot:** ${pot}\nSide Bets Open...`);
                await gameMsg.edit({ embeds: [bettingEmbed] }).catch(() => { });
            }
        } catch { }
    });

    betCollector.on("end", async () => {
        bettingClosed = true;
        const p1Inv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: p1Id, shopItemId: chickenItemId } } });
        const p2Inv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: p2Id, shopItemId: chickenItemId } } });

        const p1Meta = (p1Inv?.meta as any) || {};
        const p2Meta = (p2Inv?.meta as any) || {};

        const getEquipList = (meta: any) => meta.equipment ? Object.values(meta.equipment).map((e: any) => e.name) : (meta.equippedItemName ? [meta.equippedItemName] : []);
        const p1Stats = calculateTotalStats({ str: p1Meta.strength || 0, agi: p1Meta.agility || 0, def: p1Meta.defense || 0 }, p1Meta.trait, getEquipList(p1Meta));
        const p2Stats = calculateTotalStats({ str: p2Meta.strength || 0, agi: p2Meta.agility || 0, def: p2Meta.defense || 0 }, p2Meta.trait, getEquipList(p2Meta));

        const p1Score = calculateCombatScore(p1Meta.level || 0, p1Stats);
        const p2Score = calculateCombatScore(p2Meta.level || 0, p2Stats);
        const winChance = getWinChance(p1Score, p2Score);
        const winnerIsP1 = Math.random() < (winChance / 100);

        const winnerUser = winnerIsP1 ? p1 : p2;
        const loserUser = winnerIsP1 ? p2 : p1;
        const displayWinChance = winnerIsP1 ? winChance : (100 - winChance);

        await gameMsg.edit({ components: [] });
        const totalRounds = 3 + Math.floor(Math.random() * 3);
        let logText = "";

        await gameMsg.edit({ embeds: [new EmbedBuilder().setColor("#FFA500").setTitle("FIGHT STARTED!").setDescription(`**${p1.username}** vs **${p2.username}**`)] });
        await new Promise(r => setTimeout(r, 2000));

        for (let i = 1; i <= totalRounds; i++) {
            const moveRoll = Math.random();
            let moveText = moveRoll > 0.85 ? CRITICAL_MOVES[0] : (moveRoll < 0.1 ? MISS_MOVES[0] : FIGHT_MOVES[Math.floor(Math.random() * FIGHT_MOVES.length)]);
            moveText = moveText.replace(/{attacker}/g, `**${Math.random() > 0.5 ? p1.username : p2.username}**`).replace(/{defender}/g, `**${Math.random() > 0.5 ? p2.username : p1.username}**`);
            logText += `**Round ${i}:** ${moveText}\n`;
            await gameMsg.edit({ embeds: [new EmbedBuilder().setColor("#FFA500").setTitle("Fighting...").setDescription(logText).setImage("attachment://vs.png")] });
            await new Promise(r => setTimeout(r, 2000));
        }

        const payoutOps: any[] = [];
        const winningSideBets = sideBets.filter(b => b.target === (winnerIsP1 ? "p1" : "p2"));
        let sideWinnersText = "";
        for (const b of winningSideBets) {
            const wId = await getUserId(b.userId, guildId);
            const payout = Math.floor(b.amount * 1.5);
            payoutOps.push(prisma.wallet.update({ where: { userId: wId }, data: { balance: { increment: payout } } }));
            sideWinnersText += `<@${b.userId}>: +${payout}\n`;
        }

        const wId = await getUserId(winnerUser.id, guildId);
        if (pot > 0) payoutOps.push(prisma.wallet.update({ where: { userId: wId }, data: { balance: { increment: pot } } }));

        let newXp = ((winnerIsP1 ? p1Meta.xp : p2Meta.xp) || 0) + 50;
        let newLevel = winnerIsP1 ? (p1Meta.level || 0) : (p2Meta.level || 0);
        let requiredXp = (newLevel + 1) * 100;
        while (newXp >= requiredXp) { newXp -= requiredXp; newLevel++; requiredXp = (newLevel + 1) * 100; }

        payoutOps.push(prisma.inventory.update({
            where: { userId_shopItemId: { userId: wId, shopItemId: chickenItemId } },
            data: { meta: { ...(winnerIsP1 ? p1Meta : p2Meta), level: newLevel, xp: newXp, wins: ((winnerIsP1 ? p1Meta.wins : p2Meta.wins) || 0) + 1 } }
        }));

        const lId = await getUserId(loserUser.id, guildId);
        const loserMeta = winnerIsP1 ? p2Meta : p1Meta;
        const isDead = Math.random() < 0.05;
        let deathMsg = "";

        if (isDead) {
            payoutOps.push(prisma.inventory.delete({ where: { userId_shopItemId: { userId: lId, shopItemId: chickenItemId } } }));
            deathMsg = `${EMOJI_RIP} **DIED!**`;
        } else {
            const newLoserMeta = JSON.parse(JSON.stringify(loserMeta));
            delete newLoserMeta.equipment;
            newLoserMeta.injured = { endTime: Date.now() + 7200000 };
            payoutOps.push(prisma.inventory.update({ where: { userId_shopItemId: { userId: lId, shopItemId: chickenItemId } }, data: { meta: newLoserMeta } }));
            deathMsg = "**Injured** (2h)";
        }

        await prisma.$transaction(payoutOps);
        const winnerImage = await generateWinnerImage(winnerUser.displayAvatarURL({ extension: "png", size: 256 }), winnerUser.username);
        const resultEmbed = new EmbedBuilder()
            .setColor(winnerIsP1 ? "#00FF00" : "#FF0000")
            .setTitle(`${EMOJI_CHICKEN} Result`)
            .setDescription(`${winnerUser} Wins!\n${loserUser}: ${deathMsg}\n\n**Main Pot:** ${pot}\n**Odds:** ${displayWinChance.toFixed(1)}%`)
            .addFields({ name: "Side Winners", value: sideWinnersText || "None" })
            .setImage("attachment://winner.png");

        const cdSeconds = (config.gameCooldowns as Record<string, number> || {})["cockfight"] || 0;
        if (cdSeconds > 0) {
            setCooldown(`game:cockfight:${guildId}:${p1.id}`, cdSeconds);
            setCooldown(`game:cockfight:${guildId}:${p2.id}`, cdSeconds);
        }

        await gameMsg.edit({ embeds: [resultEmbed], components: [], files: [winnerImage] });
    });
}
