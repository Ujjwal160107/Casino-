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
import { globalCatalogGuildFilter } from "../../utils/globalCatalog";
import { errorEmbed } from "../../utils/embed";
import { generateVsImage, generateWinnerImage } from "../../utils/imageUtils";
import { checkCasinoCooldown, setCasinoCooldown, formatCasinoCooldownMessage, acquireActiveGameLock, releaseActiveGameLock } from "../../services/casinoCooldownService";
import { fmtCurrency, parseBetAmount } from "../../utils/format";
import { calculateTotalStats, calculateCombatScore, getWinChance, getGameBetLimits } from "../../utils/gameUtils";
import { GameConfig } from "../../config/gameConfig";
import { Mascot } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { creditGamePayout, debitGameBet } from "../../services/gameService";
import { seedCockShop } from "../../services/shopService";
import { questBus } from "../../services/questEvents";
import { redisService } from "../../services/redisService";
import { getGuildPrefix } from "../../utils/guildContext";
import { GAME_UI_TIMINGS } from "../../utils/economyConfig";


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
    const prefix = await getGuildPrefix(message.guild.id);
    await seedCockShop(message.guild.id);

    const targetUser = message.mentions.users.first();
    // Allow finding any argument that looks like a number/amount (including 10k, 1e5)
    // Or simpler: find first arg that is NOT a mention.
    const rawAmount = args.find(a => !a.startsWith("<@"));

    if (!targetUser || !rawAmount) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}cockfight @user <amount>\`\nMin Bet logic applies.`)]
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

    const { min, max } = getGameBetLimits("cockfight");
    if (betAmount < min) {
        return message.reply({ embeds: [errorEmbed(message.author, "Bet Too Low", `The minimum bet for Cockfight is **${fmtCurrency(min)}**.`)] });
    }
    if (betAmount > max) {
        return message.reply({ embeds: [errorEmbed(message.author, "Bet Too High", `The maximum bet for Cockfight is **${fmtCurrency(max)}**.`)] });
    }

    // Cooldown Check for Challenger
    const challengerCd = await checkCasinoCooldown("cockfight", message.author.id);
    if (challengerCd.active) {
        const msg = challengerCd.unavailable
            ? "Casino cooldown service is temporarily unavailable. Try again soon."
            : formatCasinoCooldownMessage("cockfight", challengerCd.availableAtUnix!);
        const cdMsg = await message.reply({ embeds: [errorEmbed(message.author, "Cooldown Active", msg)] });
        setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
        return;
    }

    const shopItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
            name: { equals: "Chicken", mode: "insensitive" },
        }),
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
    if (challengerMeta.critical) {
        return message.reply({ embeds: [errorEmbed(message.author, "Critical", `Your chicken is in **critical condition**! Use \`${prefix}use phoenix serum\` to save it.`)] });
    }
    if (challengerMeta.training) {
        const endTime = Math.floor(challengerMeta.training.endTime / 1000);
        return message.reply({
            embeds: [errorEmbed(message.author, "Busy", `Your chicken is training! Come back <t:${endTime}:R>.`)]
        });
    }
    if (challengerMeta.injured) {
        return message.reply({ embeds: [errorEmbed(message.author, "Injured", `Your chicken is injured! Heal it via \`${prefix}chicken\` or \`${prefix}use feather bandage\`.`)] });
    }

    const invTarget = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: target.discordId, shopItemId: shopItem.id } }
    });

    if (!invTarget || invTarget.amount < 1) {
        return message.reply({ embeds: [errorEmbed(message.author, "Opponent Missing Item", `${targetName} needs a ${EMOJI_CHICKEN} **Chicken** to fight!`)] });
    }

    const targetMeta = (invTarget.meta as any) || {};
    if (targetMeta.critical) {
        return message.reply({ embeds: [errorEmbed(message.author, "Critical", `**${targetName}**'s chicken is in critical condition!`)] });
    }
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
        return message.reply({ embeds: [errorEmbed(message.author, "Insufficient Funds", `You only have **${fmtCurrency(challenger.wallet?.balance ?? 0)}** in your wallet.`)] });
    }

    if (!target.wallet || target.wallet.balance < betAmount) {
        return message.reply({ embeds: [errorEmbed(message.author, "Opponent Funds", `${targetName} needs **${fmtCurrency(betAmount)}** in their wallet to accept.`)] });
    }

    // Active-game lock acquired AFTER all validation — so failed checks never lock the user out
    const challengerLockAcquired = await acquireActiveGameLock("cockfight", message.author.id);
    if (!challengerLockAcquired) {
        const cdMsg = await message.reply({ embeds: [errorEmbed(message.author, "Game In Progress", "You already have an active Cockfight challenge. Wait for it to resolve.")] });
        setTimeout(() => { cdMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 12_000);
        return;
    }

    const fightId = `${message.id}:${message.author.id}:${targetUser.id}`;
    const challengeContainer = buildContainer(
        `${EMOJI_CHICKEN} Cockfight Challenge`,
        [
            `${message.author} challenged ${targetUser} to a **Cockfight**.`,
            ``,
            `**${challengerName}**'s Chicken:`,
            formatChickenStats(challengerMeta, challengerMeta.level || 0),
            ``,
            `**${targetName}**'s Chicken:`,
            formatChickenStats(targetMeta, targetMeta.level || 0),
            ``,
            `Bet: **${fmtCurrency(betAmount)}**`,
            `⚠️ Loser's chicken will be injured (2h) with equipment broken. Small permadeath chance.`,
            `The opponent must accept within 30 seconds.`
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
            await releaseActiveGameLock("cockfight", message.author.id);
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
            const acceptorCd = await checkCasinoCooldown("cockfight", targetUser.id);
            if (acceptorCd.active) {
                const msg = acceptorCd.unavailable
                    ? "Casino cooldown service is temporarily unavailable. Try again soon."
                    : formatCasinoCooldownMessage("cockfight", acceptorCd.availableAtUnix!);
                await i.reply({ content: msg, ephemeral: true });
                return;
            }

            // Active-game lock for acceptor
            const acceptorLockAcquired = await acquireActiveGameLock("cockfight", targetUser.id);
            if (!acceptorLockAcquired) {
                await i.reply({ content: "You already have an active Cockfight. Finish it first.", ephemeral: true });
                return;
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
            // Release challenger lock — acceptor never accepted, so no acceptor lock to release
            releaseActiveGameLock("cockfight", message.author.id).catch(() => {});
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

const SPUR_MOVES = [
    "{attacker}'s **Iron Spurs** slash deep into {defender}!",
    "{attacker} strikes with razor-sharp spurs!",
    "The glint of iron spurs flashes as {attacker} lunges!",
];

const VEST_BLOCKS = [
    "{defender}'s **Guard Vest** absorbs the blow!",
    "The reinforced vest deflects {attacker}'s strike!",
    "{defender} barely feels it through their armored vest!",
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

function getEquipList(meta: any): string[] {
    const list: string[] = [];
    if (meta.equipment) {
        Object.values(meta.equipment).forEach((e: any) => list.push(e.name));
    } else if (meta.equippedItemName) {
        list.push(meta.equippedItemName);
    }
    return list;
}

function hasEquipment(meta: any, name: string): boolean {
    if (!meta.equipment) return false;
    return Object.values(meta.equipment).some((e: any) => e.name?.toLowerCase() === name.toLowerCase());
}

function formatChickenStats(meta: any, level: number): string {
    const equips = getEquipList(meta);
    const equipStr = equips.length > 0 ? equips.join(", ") : "None";
    return [
        `Lv.**${level}** | W:**${meta.wins || 0}** | Trait: **${meta.trait || "?"}**`,
        `STR:**${meta.strength || 0}** AGI:**${meta.agility || 0}** DEF:**${meta.defense || 0}**`,
        `Gear: ${equipStr}`,
    ].join("\n");
}

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
    const prefix = await getGuildPrefix(guildId);
    const { min, max } = getGameBetLimits("cockfight");
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

    const betTimeSeconds = GAME_UI_TIMINGS.cockfightBetSeconds; // Default 60s
    const betTimeMs = betTimeSeconds * 1000;

    // --- GENERATE VS IMAGE ---
    const vsImage = await generateVsImage(
        p1.user.displayAvatarURL({ extension: "png", size: 256 }),
        p2.user.displayAvatarURL({ extension: "png", size: 256 })
    );

    function buildBettingContainer() {
        const p1Total = sideBets.filter(b => b.target === "p1").reduce((a, b) => a + b.amount, 0);
        const p2Total = sideBets.filter(b => b.target === "p2").reduce((a, b) => a + b.amount, 0);
        let p1List = sideBets.filter(b => b.target === "p1").map(b => `${b.displayName} (${fmtCurrency(b.amount)})`).join("\n") || "No bets yet.";
        let p2List = sideBets.filter(b => b.target === "p2").map(b => `${b.displayName} (${fmtCurrency(b.amount)})`).join("\n") || "No bets yet.";
        if (p1List.length > 900) p1List = `${p1List.slice(0, 890)}...`;
        if (p2List.length > 900) p2List = `${p2List.slice(0, 890)}...`;

        const container = buildContainer(
            `${EMOJI_CHICKEN} Cockfight Betting`,
            [
                `Fight: **${p1.displayName}** vs **${p2.displayName}**`,
                `Main pot: **${fmtCurrency(pot)}**`,
                `Side bets close in **${betTimeSeconds}s**.`,
                "You can place one side bet. Fighters cannot side bet."
            ].join("\n"),
            0xF1C40F
        );
        addImageSection(
            container,
            "Arena Matchup",
            [
                `**${p1.displayName}** side total: **${fmtCurrency(p1Total)}**`,
                p1List,
                "",
                `**${p2.displayName}** side total: **${fmtCurrency(p2Total)}**`,
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
                await submit.editReply({ content: `The minimum Cockfight bet is **${fmtCurrency(min)}**.` });
                return;
            }
            if (amount > max) {
                await submit.editReply({ content: `The maximum Cockfight bet is **${fmtCurrency(max)}**.` });
                return;
            }

            if (sideBets.some(b => b.userId === submit.user.id)) {
                await submit.editReply({ content: `${Mascot.Emotes.Decline} You have already placed a bet! You cannot switch sides or add more.` });
                return;
            }

            if (!user.wallet || user.wallet.balance < amount) {
                await submit.editReply({ content: `Insufficient funds. Needed **${fmtCurrency(amount)}** but you have **${fmtCurrency(user.wallet?.balance ?? 0)}**.` });
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

            await submit.editReply({ content: `Placed bet of **${fmtCurrency(amount)}** on **${targetName}**!` });

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

        const p1Equips = getEquipList(p1Meta);
        const p2Equips = getEquipList(p2Meta);

        const p1Stats = calculateTotalStats({ str: p1Meta.strength || 0, agi: p1Meta.agility || 0, def: p1Meta.defense || 0 }, p1Meta.trait, p1Equips);
        const p2Stats = calculateTotalStats({ str: p2Meta.strength || 0, agi: p2Meta.agility || 0, def: p2Meta.defense || 0 }, p2Meta.trait, p2Equips);

        const [p1CraftedDefense, p2CraftedDefense] = await Promise.all([
            redisService.get<{ reduction: number }>(`crafted_cock_defense:${p1Id}`),
            redisService.get<{ reduction: number }>(`crafted_cock_defense:${p2Id}`),
        ]);

        const p1Score = Math.floor(calculateCombatScore(p1Level, p1Stats) * (p1CraftedDefense ? 1.08 : 1));
        const p2Score = Math.floor(calculateCombatScore(p2Level, p2Stats) * (p2CraftedDefense ? 1.08 : 1));
        if (p1CraftedDefense) await redisService.del(`crafted_cock_defense:${p1Id}`);
        if (p2CraftedDefense) await redisService.del(`crafted_cock_defense:${p2Id}`);

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

            const attMeta = isP1Attacking ? p1Meta : p2Meta;
            const defMeta = isP1Attacking ? p2Meta : p1Meta;
            const attStats = isP1Attacking ? p1Stats : p2Stats;
            const defStats = isP1Attacking ? p2Stats : p1Stats;

            const defenderDodgeChance = defStats.agi * 0.02;
            const attackerHasSpurs = hasEquipment(attMeta, "Iron Spurs");
            const defenderHasVest = hasEquipment(defMeta, "Guard Vest");

            let moveText = "";
            const moveRoll = Math.random();
            if (moveRoll < (0.10 + defenderDodgeChance)) {
                moveText = MISS_MOVES[Math.floor(Math.random() * MISS_MOVES.length)];
            } else if (defenderHasVest && Math.random() < 0.20) {
                moveText = VEST_BLOCKS[Math.floor(Math.random() * VEST_BLOCKS.length)];
            } else if (attackerHasSpurs && Math.random() < 0.30) {
                moveText = SPUR_MOVES[Math.floor(Math.random() * SPUR_MOVES.length)];
            } else if (moveRoll > 0.85) {
                moveText = CRITICAL_MOVES[Math.floor(Math.random() * CRITICAL_MOVES.length)];
            } else {
                moveText = FIGHT_MOVES[Math.floor(Math.random() * FIGHT_MOVES.length)];
            }

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
            sideWinnersDetails.push(`${b.displayName}: +${fmtCurrency(payout)}`);
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
        const loserLevel = winnerIsP1 ? p2Level : p1Level;
        const levelDiff = Math.max(0, winnerLevel - loserLevel);
        const winnerStats = winnerIsP1 ? p1Stats : p2Stats;
        const loserStats = winnerIsP1 ? p2Stats : p1Stats;
        const winnerTotalStats = winnerStats.str + winnerStats.agi + winnerStats.def;
        const loserTotalStats = loserStats.str + loserStats.agi + loserStats.def;

        // Death roll: 5% base + 2% per level diff, cap 50%
        let deathChance = 0.05 + (levelDiff * 0.02);
        deathChance = Math.min(deathChance, 0.50);
        const isDeadRoll = Math.random() < deathChance;

        // Extreme damage: enemy stats >= 3x loser stats
        const extremeDamage = winnerTotalStats >= loserTotalStats * 3 && winnerTotalStats > 0;

        // Critical state triggers on death roll OR extreme damage
        const isCritical = isDeadRoll || extremeDamage;

        let survivedByEffect = false;
        let usedDeathSave = false;

        if (isCritical) {
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

        // Calculate injury recovery time: base 2h + (enemyLevel * 20min) + (enemyTotalStats * 5min), cap 12h
        const recoveryMs = Math.min(
            12 * 60 * 60 * 1000,
            (2 * 60 * 60 * 1000) + (winnerLevel * 20 * 60 * 1000) + (winnerTotalStats * 5 * 60 * 1000)
        );
        const recoveryHours = recoveryMs / (60 * 60 * 1000);

        let equipmentSaved = false;
        if (isCritical && !survivedByEffect) {
            // CRITICAL STATE: 24h window, only Phoenix Serum can save
            const loserMetaCopy = JSON.parse(JSON.stringify(winnerIsP1 ? p2Meta : p1Meta));

            // Break equipment
            delete loserMetaCopy.equippedItem;
            delete loserMetaCopy.equippedItemName;
            delete loserMetaCopy.equipment;

            // Set critical state with 24h deadline
            loserMetaCopy.critical = {
                endTime: Date.now() + (24 * 60 * 60 * 1000),
                reason: isDeadRoll ? "death_roll" : "extreme_damage",
            };
            delete loserMetaCopy.injured;

            payoutOps.push(prisma.inventory.update({
                where: { userId_shopItemId: { userId: lId, shopItemId: chickenItemId } },
                data: { meta: loserMetaCopy }
            }));
        } else {
            // Normal injury (or saved from critical by Death Save effect)
            const loserMetaCopy = JSON.parse(JSON.stringify(winnerIsP1 ? p2Meta : p1Meta));

            const loserHasVest = hasEquipment(loserMetaCopy, "Guard Vest");
            equipmentSaved = loserHasVest && Math.random() < 0.50;

            if (!equipmentSaved) {
                delete loserMetaCopy.equippedItem;
                delete loserMetaCopy.equippedItemName;
                delete loserMetaCopy.equipment;
            }

            loserMetaCopy.injured = {
                endTime: Date.now() + recoveryMs,
                recoveryHours: Math.round(recoveryHours * 10) / 10,
            };
            delete loserMetaCopy.critical;

            payoutOps.push(prisma.inventory.update({
                where: { userId_shopItemId: { userId: lId, shopItemId: chickenItemId } },
                data: { meta: loserMetaCopy }
            }));
        }

        await prisma.$transaction(payoutOps);

        // Coin heal cost scales: 50k per 2h of recovery
        const coinHealCost = Math.floor(50_000 * (recoveryHours / 2));

        let deathMessage = "";
        if (isCritical && !survivedByEffect) {
            deathMessage = [
                `${EMOJI_RIP} **CRITICAL CONDITION!** ${loser.displayName}'s chicken is dying!`,
                `⏰ You have **24 hours** to save it with \`${prefix}use phoenix serum\``,
                `💀 If the timer expires, your chicken is **permanently lost**.`,
                `💥 Equipment destroyed.`,
            ].join("\n");
        } else if (usedDeathSave) {
            deathMessage = [
                `🛡️ **SAVED!** ${loser.displayName}'s chicken was saved from critical by a **Death Save** effect!`,
                `<:clinic:1453972244610154507> Injured for **${recoveryHours.toFixed(1)}h**. Coin heal: **${fmtCurrency(coinHealCost)}**`,
                `-# Or use \`${prefix}use feather bandage\` for instant heal`,
            ].join("\n");
        } else {
            const vestNote = equipmentSaved
                ? "\n🛡️ **Guard Vest protected equipment!**"
                : "\n💥 Equipment broken!";
            deathMessage = [
                `<:clinic:1453972244610154507> **INJURED!** ${loser.displayName}'s chicken is hospitalized for **${recoveryHours.toFixed(1)}h**.${vestNote}`,
                `-# Coin heal: **${fmtCurrency(coinHealCost)}** | \`${prefix}use feather bandage\` | \`${prefix}use phoenix serum\``,
            ].join("\n");
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
                `- Main payout: **${fmtCurrency(mainWinnerPayout)}**`,
                `- Total pot: **${fmtCurrency(pot)}**`,
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
                description: `**Winner:** ${winner.displayName}\n**Loser:** ${loser.displayName}\n**Pot:** ${fmtCurrency(pot)}\n**Outcome:** ${(isCritical && !survivedByEffect) ? "CRITICAL" : "INJURY"}\n**Winner Level:** ${newLevel}`,
                color: logColor,
                thumbnail: winner.user.displayAvatarURL()
            }).catch(() => { });
        });

        // Quest progress
        questBus.emit("cockfight:participate", { discordId: p1.discordId });
        questBus.emit("cockfight:participate", { discordId: p2.discordId });
        questBus.emit("cockfight:win", { discordId: winner.discordId });

        // Release active locks and set cooldowns for both players
        await releaseActiveGameLock("cockfight", p1.user.id);
        await releaseActiveGameLock("cockfight", p2.user.id);
        await setCasinoCooldown("cockfight", p1.user.id, guildId);
        await setCasinoCooldown("cockfight", p2.user.id, guildId);

        await gameMsg.edit({ components: [resultContainer], files: [winnerImage], flags: COCKFIGHT_FLAGS });
    });
}
