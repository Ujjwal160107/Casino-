import {
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    User,
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    GuildMember,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder
} from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";
import { generateVsImage, generateWinnerImage } from "../../utils/imageUtils";
import { checkCooldown, getCooldownExpiry, setCooldown } from "../../utils/cooldown";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { calculateTotalStats, calculateCombatScore, getWinChance, getGameBetLimits } from "../../utils/gameUtils";
import { GameConfig } from "../../config/gameConfig";
import { Mascot } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { creditGamePayout, debitGameBet } from "../../services/gameService";


const EMOJI_CHICKEN = GameConfig.Emojis.Chicken;
const EMOJI_TICK = GameConfig.Emojis.Tick;
const EMOJI_WIN = GameConfig.Emojis.Win;
const EMOJI_RIP = GameConfig.Emojis.Rip;
const COCKFIGHT_ACCENT = 0xFFA500;
const COCKFIGHT_FLAGS = MessageFlags.IsComponentsV2 as const;

type FighterKey = "p1" | "p2";
type SideBet = { userId: string; displayName: string; amount: number; target: FighterKey; walletId: string };
type FighterProfile = { user: User; member: GuildMember | null; displayName: string; discordId: string; walletId: string };

function getDisplayName(member: GuildMember | null | undefined, user: User): string {
    return member?.displayName || user.username;
}

async function fetchMemberDisplay(message: Message, user: User): Promise<GuildMember | null> {
    if (!message.guild) return null;
    const cached = message.guild.members.cache.get(user.id);
    if (cached) return cached;
    return message.guild.members.fetch(user.id).catch(() => null);
}

function buildContainer(title: string, body: string, accent = COCKFIGHT_ACCENT) {
    return new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}`),
            new TextDisplayBuilder().setContent(body)
        );
}

function addImageSection(container: ContainerBuilder, title: string, body: string, attachmentName: string, description: string) {
    return container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${title}`),
                new TextDisplayBuilder().setContent(body)
            )
            .setThumbnailAccessory(
                new ThumbnailBuilder()
                    .setURL(`attachment://${attachmentName}`)
                    .setDescription(description)
            )
    );
}

function buildAcceptRow(fightId: string, disabled = false) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`cockfight:${fightId}:accept`)
            .setLabel("Accept Fight")
            .setStyle(ButtonStyle.Success)
            .setEmoji(EMOJI_TICK)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`cockfight:${fightId}:deny`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

function buildSideBetRow(fightId: string, p1Name: string, p2Name: string, disabled = false) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`cockfight:${fightId}:bet:p1`)
            .setLabel(`Bet on ${p1Name.slice(0, 60)}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`cockfight:${fightId}:bet:p2`)
            .setLabel(`Bet on ${p2Name.slice(0, 60)}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
    );
}




export async function handleCockFight(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;
    const config = await getGuildConfig(message.guild.id);

    const targetUser = message.mentions.users.first();
    // Allow finding any argument that looks like a number/amount (including 10k, 1e5)
    // Or simpler: find first arg that is NOT a mention.
    const rawAmount = args.find(a => !a.startsWith("<@"));

    if (!targetUser || !rawAmount) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}cockfight @user <amount>\`\nMin Bet logic applies.`)]
        });
    }

    if (targetUser.id === message.author.id) {
        return message.reply({ embeds: [errorEmbed(message.author, "Error", "You cannot fight yourself.")] });
    }

    if (targetUser.bot) {
        return message.reply({ embeds: [errorEmbed(message.author, "Error", "You cannot fight a bot.")] });
    }

    const betAmount = parseBetAmount(rawAmount);

    if (!Number.isInteger(betAmount) || betAmount <= 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please enter a valid positive integer (e.g. 100, 10k, 1e5).")] });
    }

    const { min, max } = getGameBetLimits(config, "cockfight");
    if (betAmount < min) {
        return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Cockfight is **${fmtCurrency(min, config.currencyEmoji)}**.`)] });
    }
    if (betAmount > max) {
        return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Cockfight is **${fmtCurrency(max, config.currencyEmoji)}**.`)] });
    }

    // Cooldown Check for Challenger
    const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
    const cdSeconds = cooldowns["cockfight"] || 0;
    if (cdSeconds > 0) {
        const key = `game:cockfight:${message.guild.id}:${message.author.id}`;
        const expiry = getCooldownExpiry(key);
        if (expiry && expiry > Date.now()) {
            const ts = Math.floor(expiry / 1000);
            return message.reply({
                embeds: [errorEmbed(message.author, "Cooldown Active", `<:cooldown:1454025354631970826> You are on cooldown. Wait <t:${ts}:R>.`)]
            });
        }
    }

    const shopItem = await prisma.shopItem.findFirst({
        where: {
            guildId: message.guild.id,
            name: { equals: "Chicken", mode: "insensitive" }
        }
    });

    if (!shopItem) {
        return message.reply({ embeds: [errorEmbed(message.author, "Configuration Error", "There is no item named **Chicken** in the shop. An admin must add it first.")] });
    }

    const challengerMember = await fetchMemberDisplay(message, message.author);
    const targetMember = await fetchMemberDisplay(message, targetUser);
    const challengerName = getDisplayName(challengerMember, message.author);
    const targetName = getDisplayName(targetMember, targetUser);
    const challenger = await ensureUserAndWallet(message.author.id, message.guild.id, challengerName);
    const target = await ensureUserAndWallet(targetUser.id, message.guild.id, targetName);

    const invChallenger = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: challenger.discordId, shopItemId: shopItem.id } }
    });

    if (!invChallenger || invChallenger.amount < 1) {
        return message.reply({ embeds: [errorEmbed(message.author, "Missing Item", `You need a ${EMOJI_CHICKEN} **Chicken** to fight!`)] });
    }

    const challengerMeta = (invChallenger.meta as any) || {};
    if (challengerMeta.training) {
        const endTime = Math.floor(challengerMeta.training.endTime / 1000);
        return message.reply({
            embeds: [errorEmbed(message.author, "Busy", `Your chicken is training! Come back <t:${endTime}:R>.`)]
        });
    }
    if (challengerMeta.injured) {
        return message.reply({ embeds: [errorEmbed(message.author, "Injured", `Your chicken is injured! Heal it via \`${config.prefix}chicken\`.`)] });
    }

    const invTarget = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: target.discordId, shopItemId: shopItem.id } }
    });

    if (!invTarget || invTarget.amount < 1) {
        return message.reply({ embeds: [errorEmbed(message.author, "Opponent Missing Item", `${targetName} needs a ${EMOJI_CHICKEN} **Chicken** to fight!`)] });
    }

    const targetMeta = (invTarget.meta as any) || {};
    if (targetMeta.training) {
        const endTime = Math.floor(targetMeta.training.endTime / 1000);
        return message.reply({
            embeds: [errorEmbed(message.author, "Busy", `**${targetName}**'s chicken is training! Ends <t:${endTime}:R>.`)]
        });
    }
    if (targetMeta.injured) {
        return message.reply({ embeds: [errorEmbed(message.author, "Injured", `**${targetName}**'s chicken is injured!`)] });
    }

    if (!challenger.wallet || challenger.wallet.balance < betAmount) {
        return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", `You only have **${fmtCurrency(challenger.wallet?.balance ?? 0, config.currencyEmoji)}** in your wallet.`)] });
    }

    if (!target.wallet || target.wallet.balance < betAmount) {
        return message.reply({ embeds: [errorEmbed(message.author, "Opponent Funds", `${targetName} needs **${fmtCurrency(betAmount, config.currencyEmoji)}** in their wallet to accept.`)] });
    }

    const fightId = `${message.id}:${message.author.id}:${targetUser.id}`;
    const challengeContainer = buildContainer(
        `${EMOJI_CHICKEN} Cockfight Challenge`,
        [
            `${message.author} challenged ${targetUser} to a **Cockfight**.`,
            `Challenger: **${challengerName}**`,
            `Opponent: **${targetName}**`,
            `Bet: **${fmtCurrency(betAmount, config.currencyEmoji)}**`,
            "Requirement: the losing chicken can be injured or lost by the existing fight rules.",
            "The opponent must accept within 30 seconds."
        ].join("\n")
    );

    const reply = await message.reply({
        components: [challengeContainer, buildAcceptRow(fightId)],
        flags: COCKFIGHT_FLAGS
    });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    let gameStarted = false;

    collector.on("collect", async (i: ButtonInteraction) => {
        if (!i.customId.startsWith(`cockfight:${fightId}:`)) return;
        if (i.user.id !== targetUser.id) {
            await i.reply({ content: "This fight isn't yours.", ephemeral: true });
            return;
        }

        const action = i.customId.split(":").pop();
        if (action === "deny") {
            await i.update({
                components: [buildContainer("Cockfight Cancelled", `${targetName} denied the challenge.`, 0xE74C3C), buildAcceptRow(fightId, true)],
                flags: COCKFIGHT_FLAGS
            });
            collector.stop("denied");
            return;
        }

        if (action === "accept") {
            if (gameStarted) return;

            // Cooldown Check for Acceptor
            const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
            const cdSeconds = cooldowns["cockfight"] || 0;
            if (cdSeconds > 0) {
                const key = `game:cockfight:${message.guild!.id}:${targetUser.id}`;

                const existingExpiry = getCooldownExpiry(key);
                if (existingExpiry && existingExpiry > Date.now()) {
                    const ts = Math.floor(existingExpiry / 1000);
                    await i.reply({ content: `<:cooldown:1454025354631970826> You are on cooldown! Wait <t:${ts}:R>.`, ephemeral: true });
                    return;
                }
            }

            gameStarted = true;

            try {
                await i.deferUpdate();
            } catch (e) {
                gameStarted = false;
                return;
            }

            const latestTarget = await ensureUserAndWallet(targetUser.id, message.guild!.id, targetName);
            if (!latestTarget.wallet || latestTarget.wallet.balance < betAmount) {
                await i.followUp({ content: "You don't have enough money in your wallet to accept!", ephemeral: true });
                gameStarted = false;
                return;
            }

            collector.stop("accepted");

            await runCockFight(
                message,
                reply,
                { user: message.author, member: challengerMember, displayName: challengerName, discordId: challenger.discordId, walletId: challenger.wallet!.id },
                { user: targetUser, member: targetMember, displayName: targetName, discordId: target.discordId, walletId: latestTarget.wallet.id },
                betAmount,
                shopItem.id
            );
        }
    });

    collector.on("end", (collected: any, reason: string) => {
        if (reason === "time") {
            reply.edit({
                components: [buildContainer("Cockfight Expired", "The challenge expired with no wallet changes.", 0x95A5A6), buildAcceptRow(fightId, true)]
            }).catch(() => { });
        }
    });
}

// ... Rest of the file (helper functions) ...
// Since I cannot write partial updates easily without rewriting the whole file in `write_to_file`, I must include the rest of the file content.
// I'll assume the original helpers are correct and just append them.
const FIGHT_MOVES = [
    "{attacker} pecks {defender} right in the eye!",
    "{attacker} flutters wildly, confusing {defender}!",
    "{attacker} lands a solid scratch on {defender}'s beak!",
    "{attacker} summons ancient chicken energy against {defender}!",
    "{attacker} attempts a flying kick at {defender}!",
    "{attacker} clucks menacingly, lowering {defender}'s morale!",
    "{defender} slips on a loose feather, taking damage!",
    "{attacker} unleashes a flurry of pecks!",
];

const CRITICAL_MOVES = [
    "CRITICAL HIT! {attacker} tears a hole in the fabric of space-time!",
    "BOOM! {attacker} lands a devastating spur strike!",
    "{attacker} moves so fast they disappear, reappearing behind {defender}!",
];

const MISS_MOVES = [
    "{attacker} misses completely!",
    "{defender} dodges the attack effortlessly!",
    "{attacker} trips over their own feet!",
];

async function runCockFight(
    originalMsg: Message,
    gameMsg: Message,
    p1: FighterProfile,
    p2: FighterProfile,
    bet: number,
    chickenItemId: string
) {
    const guildId = originalMsg.guild!.id;
    const channelId = originalMsg.channelId;
    const config = await getGuildConfig(guildId);
    const { min, max } = getGameBetLimits(config, "cockfight");
    const fightId = `${originalMsg.id}:${p1.user.id}:${p2.user.id}`;
    let p1BetDebited = false;
    let settled = false;

    try {
        await debitGameBet(p1.walletId, bet, {
            game: "cockfight",
            betAmount: bet,
            guildId,
            channelId,
            messageId: gameMsg.id,
            choice: "fighter_entry"
        });
        p1BetDebited = true;
        await debitGameBet(p2.walletId, bet, {
            game: "cockfight",
            betAmount: bet,
            guildId,
            channelId,
            messageId: gameMsg.id,
            choice: "fighter_entry"
        });
    } catch (error) {
        if (p1BetDebited) {
            await creditGamePayout(p1.walletId, bet, "game_refund", {
                game: "cockfight",
                betAmount: bet,
                payout: bet,
                result: "entry_cancelled",
                guildId,
                channelId,
                messageId: gameMsg.id
            }).catch(() => { });
        }
        await gameMsg.edit({
            components: [buildContainer("Cockfight Cancelled", "A fighter no longer had enough wallet funds. No fight was started.", 0xE74C3C), buildAcceptRow(fightId, true)],
            flags: COCKFIGHT_FLAGS
        }).catch(() => { });
        return;
    }

    let pot = bet * 2;
    const sideBets: SideBet[] = [];

    const betTimeSeconds = config.cockfightBetTime || 60; // Default 60s
    const betTimeMs = betTimeSeconds * 1000;

    // --- GENERATE VS IMAGE ---
    const vsImage = await generateVsImage(
        p1.user.displayAvatarURL({ extension: "png", size: 256 }),
        p2.user.displayAvatarURL({ extension: "png", size: 256 })
    );

    function buildBettingContainer() {
        const p1Total = sideBets.filter(b => b.target === "p1").reduce((a, b) => a + b.amount, 0);
        const p2Total = sideBets.filter(b => b.target === "p2").reduce((a, b) => a + b.amount, 0);
        let p1List = sideBets.filter(b => b.target === "p1").map(b => `${b.displayName} (${fmtCurrency(b.amount, config.currencyEmoji)})`).join("\n") || "No bets yet.";
        let p2List = sideBets.filter(b => b.target === "p2").map(b => `${b.displayName} (${fmtCurrency(b.amount, config.currencyEmoji)})`).join("\n") || "No bets yet.";
        if (p1List.length > 900) p1List = `${p1List.slice(0, 890)}...`;
        if (p2List.length > 900) p2List = `${p2List.slice(0, 890)}...`;

        const container = buildContainer(
            `${EMOJI_CHICKEN} Cockfight Betting`,
            [
                `Fight: **${p1.displayName}** vs **${p2.displayName}**`,
                `Main pot: **${fmtCurrency(pot, config.currencyEmoji)}**`,
                `Side bets close in **${betTimeSeconds}s**.`,
                "You can place one side bet. Fighters cannot side bet."
            ].join("\n"),
            0xF1C40F
        );
        addImageSection(
            container,
            "Arena Matchup",
            [
                `**${p1.displayName}** side total: **${fmtCurrency(p1Total, config.currencyEmoji)}**`,
                p1List,
                "",
                `**${p2.displayName}** side total: **${fmtCurrency(p2Total, config.currencyEmoji)}**`,
                p2List
            ].join("\n"),
            "vs.png",
            "Cockfight matchup"
        );
        return container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    }

    await gameMsg.edit({
        components: [buildBettingContainer(), buildSideBetRow(fightId, p1.displayName, p2.displayName)],
        files: [vsImage],
        flags: COCKFIGHT_FLAGS
    });

    let bettingClosed = false;
    const betCollector = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: betTimeMs });

    betCollector.on("collect", async (i: ButtonInteraction) => {
        if (!i.customId.startsWith(`cockfight:${fightId}:bet:`)) return;
        if (i.user.id === p1.user.id || i.user.id === p2.user.id) {
            await i.deferReply({ ephemeral: true });
            await i.editReply({ content: "You are fighting! You cannot place side bets." });
            return;
        }

        const target = i.customId.endsWith(":p1") ? "p1" : "p2";
        const targetName = target === "p1" ? p1.displayName : p2.displayName;

        const modal = new ModalBuilder()
            .setCustomId(`cockfight_modal:${fightId}:${target}:${i.id}`)
            .setTitle(`Bet on ${targetName}`);

        const input = new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Amount to Bet")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("100")
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await i.showModal(modal);

        try {
            const submit = await i.awaitModalSubmit({ time: 30000 });

            if (bettingClosed) {
                await submit.reply({ content: "Bets are closed!", ephemeral: true });
                return;
            }

            await submit.deferReply({ ephemeral: true });

            const member = await fetchMemberDisplay(originalMsg, submit.user);
            const displayName = getDisplayName(member, submit.user);
            const user = await ensureUserAndWallet(submit.user.id, guildId, displayName);
            const amount = parseBetAmount(submit.fields.getTextInputValue("amount"), user.wallet?.balance ?? 0);

            if (!Number.isInteger(amount) || amount <= 0) {
                await submit.editReply({ content: "Invalid amount." });
                return;
            }
            if (amount < min) {
                await submit.editReply({ content: `The minimum Cockfight bet is **${fmtCurrency(min, config.currencyEmoji)}**.` });
                return;
            }
            if (amount > max) {
                await submit.editReply({ content: `The maximum Cockfight bet is **${fmtCurrency(max, config.currencyEmoji)}**.` });
                return;
            }

            if (sideBets.some(b => b.userId === submit.user.id)) {
                await submit.editReply({ content: `${Mascot.Emotes.Decline} You have already placed a bet! You cannot switch sides or add more.` });
                return;
            }

            if (!user.wallet || user.wallet.balance < amount) {
                await submit.editReply({ content: `Insufficient funds. Needed **${fmtCurrency(amount, config.currencyEmoji)}** but you have **${fmtCurrency(user.wallet?.balance ?? 0, config.currencyEmoji)}**.` });
                return;
            }

            // Re-check closed just in case
            if (bettingClosed) {
                await submit.editReply({ content: "Bets closed while you were typing!" });
                return;
            }

            try {
                await debitGameBet(user.wallet.id, amount, {
                    game: "cockfight",
                    betAmount: amount,
                    guildId,
                    channelId,
                    messageId: gameMsg.id,
                    choice: `side_${target}`
                });
            } catch (err) {
                await submit.editReply({ content: "Transaction failed. Please try again." });
                return;
            }

            sideBets.push({ userId: submit.user.id, displayName, amount, target, walletId: user.wallet.id });
            pot += amount;

            await submit.editReply({ content: `Placed bet of **${fmtCurrency(amount, config.currencyEmoji)}** on **${targetName}**!` });

            if (!bettingClosed) {
                await gameMsg.edit({
                    components: [buildBettingContainer(), buildSideBetRow(fightId, p1.displayName, p2.displayName)],
                    flags: COCKFIGHT_FLAGS
                }).catch(() => { });
            }

        } catch (e: any) {
            console.error("Side bet error:", e);
            // If interaction timed out, we can't reply. 
            // If it was a logic error after defer, we can editReply.
            // Check if it's a timeout error
            if (e.code === 'InteractionCollectorError') {
                // User didn't submit in time.
                // We can't reply to 'i' anymore if showModal was called? 
                // Actually showModal answers 'i'. The timeout is on 'awaitModalSubmit'.
                // There is no interaction to reply to for the ERROR strictly speaking, except 'i' which is done.
                return;
            }
            // Try to notify if possible
            // We don't have access to 'submit' variable here easily unless we scope it out, but it might be undefined if awaitModalSubmit failed.
        }
    });

    betCollector.on("end", async (collected: any, reason: string) => {
        if (settled) return;
        bettingClosed = true;
        const p1Id = p1.discordId;
        const p1Inv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: p1Id, shopItemId: chickenItemId } } });
        const p1Meta = (p1Inv?.meta as any) || {};
        const p1Level = p1Meta.level || 0;

        const p2Id = p2.discordId;
        const p2Inv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: p2Id, shopItemId: chickenItemId } } });
        const p2Meta = (p2Inv?.meta as any) || {};
        const p2Level = p2Meta.level || 0;

        // Helper to get equipment list
        const getEquipList = (meta: any) => {
            const list: string[] = [];
            if (meta.equipment) {
                // New Format
                Object.values(meta.equipment).forEach((e: any) => list.push(e.name));
            } else if (meta.equippedItemName) {
                // Legacy Format
                list.push(meta.equippedItemName);
            }
            return list;
        };

        const p1Equips = getEquipList(p1Meta);
        const p2Equips = getEquipList(p2Meta);

        const p1Stats = calculateTotalStats({ str: p1Meta.strength || 0, agi: p1Meta.agility || 0, def: p1Meta.defense || 0 }, p1Meta.trait, p1Equips);
        const p2Stats = calculateTotalStats({ str: p2Meta.strength || 0, agi: p2Meta.agility || 0, def: p2Meta.defense || 0 }, p2Meta.trait, p2Equips);

        const p1Score = calculateCombatScore(p1Level, p1Stats);
        const p2Score = calculateCombatScore(p2Level, p2Stats);

        const winChancePercent = getWinChance(p1Score, p2Score);
        const p1Chance = winChancePercent / 100;

        const rng = Math.random();
        const winnerIsP1 = rng < p1Chance;

        const winner = winnerIsP1 ? p1 : p2;
        const loser = winnerIsP1 ? p2 : p1;
        const winnerKey = winnerIsP1 ? "p1" : "p2";
        const winnerLevel = winnerIsP1 ? p1Level : p2Level;

        // Use the calculated win chance for display (if P1 won, it's p1Chance, else it's 100 - p1Chance)
        const displayWinChance = winnerIsP1 ? winChancePercent : (100 - winChancePercent);

        // --- SIMULATION START ---
        await gameMsg.edit({
            components: [buildBettingContainer(), buildSideBetRow(fightId, p1.displayName, p2.displayName, true)],
            flags: COCKFIGHT_FLAGS
        }).catch(() => { });
        const totalRounds = 3 + Math.floor(Math.random() * 3); // 3 to 6 rounds
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        let logText = "";

        await gameMsg.edit({
            components: [
                addImageSection(
                    buildContainer(`${EMOJI_CHICKEN} Fight Started`, `**${p1.displayName}** vs **${p2.displayName}**\n\nThe chickens enter the ring...`),
                    "Arena",
                    "The mascot arena art stays on-screen while the fight runs.",
                    "vs.png",
                    "Cockfight matchup"
                )
            ],
            flags: COCKFIGHT_FLAGS
        });
        await delay(2000);

        for (let i = 1; i <= totalRounds; i++) {
            const isP1Attacking = Math.random() > 0.5;
            const attacker = isP1Attacking ? p1.displayName : p2.displayName;
            const defender = isP1Attacking ? p2.displayName : p1.displayName;

            // Stats for flavor text logic
            const attStats = isP1Attacking ? p1Stats : p2Stats;
            const defStats = isP1Attacking ? p2Stats : p1Stats;

            const defenderDodgeChance = defStats.agi * 0.02; // 2% per agility

            let moveText = "";
            const moveRoll = Math.random();
            // Miss chance = base 10% + dodge chance
            if (moveRoll < (0.10 + defenderDodgeChance)) moveText = MISS_MOVES[Math.floor(Math.random() * MISS_MOVES.length)];
            else if (moveRoll > 0.85) moveText = CRITICAL_MOVES[Math.floor(Math.random() * CRITICAL_MOVES.length)];
            else moveText = FIGHT_MOVES[Math.floor(Math.random() * FIGHT_MOVES.length)];

            moveText = moveText.replace(/{attacker}/g, `**${attacker}**`).replace(/{defender}/g, `**${defender}**`);
            logText += `**Round ${i}:** ${moveText}\n`;

            const roundContainer = addImageSection(
                buildContainer(`${EMOJI_CHICKEN} Fight in Progress`, logText),
                `Round ${i}/${totalRounds}`,
                "Fighting...",
                "vs.png",
                "Cockfight matchup"
            );
            await gameMsg.edit({ components: [roundContainer], flags: COCKFIGHT_FLAGS });
            await delay(2500);
        }
        // --- SIMULATION END ---

        const winningSideBets = sideBets.filter(b => b.target === winnerKey);
        const sidePayoutRatio = 1.5;

        const payoutOps: any[] = [];
        const mainWinnerPayout = pot;
        const sideWinnersDetails: string[] = [];
        const payoutMap = new Map<string, { amount: number; walletId: string; displayName: string }>();

        for (const b of winningSideBets) {
            const payout = Math.floor(b.amount * sidePayoutRatio);
            const current = payoutMap.get(b.userId);
            payoutMap.set(b.userId, {
                amount: (current?.amount ?? 0) + payout,
                walletId: b.walletId,
                displayName: b.displayName
            });
            sideWinnersDetails.push(`${b.displayName}: +${fmtCurrency(payout, config.currencyEmoji)}`);
        }

        settled = true;
        for (const [, payoutInfo] of payoutMap.entries()) {
            await creditGamePayout(payoutInfo.walletId, payoutInfo.amount, "game_win", {
                game: "cockfight",
                betAmount: payoutInfo.amount,
                payout: payoutInfo.amount,
                result: "side_bet_win",
                guildId,
                channelId,
                messageId: gameMsg.id
            });
        }

        if (mainWinnerPayout > 0) {
            await creditGamePayout(winner.walletId, mainWinnerPayout, "game_win", {
                game: "cockfight",
                betAmount: bet,
                payout: mainWinnerPayout,
                result: "fighter_win",
                guildId,
                channelId,
                messageId: gameMsg.id
            });
        }

        await creditGamePayout(loser.walletId, 0, "game_loss", {
            game: "cockfight",
            betAmount: bet,
            payout: 0,
            result: "fighter_loss",
            guildId,
            channelId,
            messageId: gameMsg.id
        });

        for (const b of sideBets.filter(b => b.target !== winnerKey)) {
            await creditGamePayout(b.walletId, 0, "game_loss", {
                game: "cockfight",
                betAmount: b.amount,
                payout: 0,
                result: "side_bet_loss",
                guildId,
                channelId,
                messageId: gameMsg.id
            });
        }

        const XP_PER_WIN = 50;
        const wId = winner.discordId;

        let newLevel = winnerIsP1 ? p1Level : p2Level;
        let newXp = ((winnerIsP1 ? p1Meta.xp : p2Meta.xp) || 0) + XP_PER_WIN;
        let newWins = ((winnerIsP1 ? p1Meta.wins : p2Meta.wins) || 0) + 1;

        let requiredXp = (newLevel + 1) * 100;
        let leveledUp = false;

        while (newXp >= requiredXp) {
            newXp -= requiredXp;
            newLevel++;
            leveledUp = true;
            requiredXp = (newLevel + 1) * 100;
        }

        // --- UPDATE WINNER (FIXED: DO NOT BREAK EQUIPMENT) ---
        payoutOps.push(prisma.inventory.update({
            where: { userId_shopItemId: { userId: wId, shopItemId: chickenItemId } },
            data: {
                meta: {
                    ...((winnerIsP1 ? p1Meta : p2Meta) as any), // Keep existing meta (including equipment)
                    level: newLevel,
                    wins: newWins,
                    xp: newXp,
                    training: (winnerIsP1 ? p1Meta.training : p2Meta.training) // Keep training status if any (though shouldn't fight if training)
                }
            }
        }));

        const lId = loser.discordId;
        // DEATH MECHANIC UPDATE:
        // 5% Chance of Permadeath. 95% Chance of Injury.
        // Equipment is broken (Cleared) on Injury.

        const loserLevel = winnerIsP1 ? p2Level : p1Level;
        const levelDiff = Math.max(0, winnerLevel - loserLevel);

        let deathChance = 0.05; // Base 5%
        if (levelDiff > 0) {
            deathChance += (levelDiff * 0.02); // +2% per level difference
        }
        deathChance = Math.min(deathChance, 0.50); // Cap at 50%

        const isDeadRoll = Math.random() < deathChance;
        let survivedByEffect = false;
        let usedDeathSave = false;

        if (isDeadRoll) {
            // Check for Death Save
            const activeDeathSave = await prisma.activeEffect.findFirst({
                where: {
                    userId: lId,
                    effectType: "DEATH_SAVE",
                    OR: [
                        { expiresAt: { gt: new Date() } },
                        { expiresAt: null }
                    ]
                }
            });

            if (activeDeathSave) {
                await prisma.activeEffect.delete({ where: { id: activeDeathSave.id } });
                survivedByEffect = true;
                usedDeathSave = true;
            }
        }

        const actuallyDead = isDeadRoll && !survivedByEffect;

        if (!actuallyDead) {
            // INJURED STATE (95% or Saved by Effect)
            const loserMeta = winnerIsP1 ? p2Meta : p1Meta;
            const newLoserMeta = JSON.parse(JSON.stringify(loserMeta));

            // Break Item (Clear Equipment)
            delete newLoserMeta.equippedItem;
            delete newLoserMeta.equippedItemName;
            delete newLoserMeta.equipment; // Clear new format too

            // Apply Injury (2 Hours)
            newLoserMeta.injured = {
                endTime: Date.now() + (2 * 60 * 60 * 1000)
            };

            payoutOps.push(prisma.inventory.update({
                where: { userId_shopItemId: { userId: lId, shopItemId: chickenItemId } },
                data: { meta: newLoserMeta }
            }));
        } else {
            // PERMADEATH (5%)
            payoutOps.push(prisma.inventory.delete({
                where: { userId_shopItemId: { userId: lId, shopItemId: chickenItemId } }
            }));
        }

        await prisma.$transaction(payoutOps);

        let deathMessage = "";
        if (actuallyDead) {
            deathMessage = `${EMOJI_RIP} **CRITICAL FAILURE!** ${loser.displayName}'s chicken has died (Permadeath).`;
        } else if (usedDeathSave) {
            deathMessage = `🛡️ **SAVED!** ${loser.displayName}'s chicken was saved from death by a **Death Save** effect!\n<:clinic:1453972244610154507> It is now injured for 2 hours (Equipment Broken).`;
        } else {
            deathMessage = `<:clinic:1453972244610154507> **INJURED!** ${loser.displayName}'s chicken survives but is hospitalized for 2 hours.\n<:alert_sign:1451625691664875610> **Equipment Broken!**`;
        }

        const EMOJI_XP = "<:xpfull:1451636569982111765>";
        const EMOJI_XP_EMPTY = "<:xpempty:1451642829427314822>";
        const filledBars = Math.floor((newXp / requiredXp) * 10);
        const emptyBars = 10 - filledBars;
        const progressBar = `${EMOJI_XP.repeat(filledBars)}${EMOJI_XP_EMPTY.repeat(emptyBars)}`;

        let sideWinnersText = sideWinnersDetails.length > 0 ? sideWinnersDetails.join("\n") : "None";
        if (sideWinnersText.length > 1024) sideWinnersText = sideWinnersText.slice(0, 1020) + "...";

        // Generate Winner Image
        const winnerImage = await generateWinnerImage(winner.user.displayAvatarURL({ extension: "png", size: 256 }), winner.displayName);

        const resultContainer = buildContainer(
            `${EMOJI_CHICKEN} Cockfight Result`,
            [
                `${winnerIsP1 ? Mascot.Emotes.Money : Mascot.Emotes.Fail} **${winner.displayName}** wins.`,
                deathMessage,
                "",
                "**Battle Stats:**",
                `- Winner level: **${winnerLevel}** ${leveledUp ? `-> **${newLevel}** (level up)` : `(XP +${XP_PER_WIN})`}`,
                `- Progress: ${progressBar}`,
                `- Win chance: **${displayWinChance.toFixed(1)}%**`,
                `- Main payout: **${fmtCurrency(mainWinnerPayout, config.currencyEmoji)}**`,
                `- Total pot: **${fmtCurrency(pot, config.currencyEmoji)}**`,
                `- Side ROI: **${sidePayoutRatio.toFixed(2)}x**`
            ].join("\n"),
            winnerIsP1 ? 0x2ECC71 : 0xE74C3C
        );
        addImageSection(resultContainer, "Winner Banner", `Side winners:\n${sideWinnersText}`, "winner.png", "Cockfight winner");

        // LOGGING
        const logColor = winnerIsP1 ? 0x00FF00 : 0xFF0000;
        await import("../../utils/discordLogger").then(({ logToChannel }) => {
            logToChannel(p1.user.client, {
                guild: originalMsg.guild!,
                type: "ECONOMY",
                title: "Cockfight Result",
                description: `**Winner:** ${winner.displayName}\n**Loser:** ${loser.displayName}\n**Pot:** ${fmtCurrency(pot, config.currencyEmoji)}\n**Outcome:** ${actuallyDead ? "DEATH" : "INJURY"}\n**Winner Level:** ${newLevel}`,
                color: logColor,
                thumbnail: winner.user.displayAvatarURL()
            }).catch(() => { });
        });

        // Set Cooldowns for NEXT fight
        const cooldowns = (config.gameCooldowns as Record<string, number>) || {};
        const cdSeconds = cooldowns["cockfight"] || 0;
        if (cdSeconds > 0) {
            setCooldown(`game:cockfight:${guildId}:${p1.user.id}`, cdSeconds);
            setCooldown(`game:cockfight:${guildId}:${p2.user.id}`, cdSeconds);
        }

        await gameMsg.edit({ components: [resultContainer], files: [winnerImage], flags: COCKFIGHT_FLAGS });
    });
}
