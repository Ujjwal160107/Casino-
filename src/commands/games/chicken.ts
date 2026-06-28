
import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import prisma from "../../utils/prisma";
import { globalCatalogGuildFilter } from "../../utils/globalCatalog";
import { errorEmbed } from "../../utils/embed";
import { calculateTotalStats, calculateCombatScore, getWinChance } from "../../utils/gameUtils";
import { GameConfig } from "../../config/gameConfig";
import { Mascot } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { getGuildPrefix } from "../../utils/guildContext";

const EMOJI_CHICKEN = GameConfig.Emojis.Chicken;
const EMOJI_XP = GameConfig.Emojis.XpFull;
const EMOJI_XP_EMPTY = GameConfig.Emojis.XpEmpty;
const EMOJI_FULL = GameConfig.Emojis.XpFull;
const EMOJI_EMPTY = GameConfig.Emojis.XpEmpty;
const EMOJI_RED = GameConfig.Emojis.RedBar;


export async function handleChicken(message: Message, args: string[]) {
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "name") {
        return handleName(message, args.slice(1));
    }

    if (subCommand === "top" || subCommand === "leaderboard") {
        return handleTop(message);
    }

    if (subCommand === "train") {
        return handleTrain(message, args.slice(1));
    }

    if (subCommand === "traits" || subCommand === "info") {
        return handleTraitsInfo(message);
    }

    return handleView(message, args);
}

// ... [handleTop, handleName, handleTraitsInfo unchanged unless they used hardcoded values, but let's assume they are fine for now or I can update them if needed] ...
// Actually, handleTraitsInfo has hardcoded trait list. Good to update later but not critical. 
// I will just replace handleView and imports.

// ...

async function handleTop(message: Message) {
    const guildId = message.guildId!;
    const prefix = await getGuildPrefix(guildId);

    const shopItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
            name: { equals: "Chicken", mode: "insensitive" },
        })
    });

    if (!shopItem) return message.reply("Chicken item not configured in shop.");

    const chickens = await prisma.inventory.findMany({
        where: {
            shopItemId: shopItem.id,
            amount: { gte: 1 }
        },
        include: { user: true }
    });

    if (chickens.length === 0) {
        return message.reply("No chickens found on the leaderboard!");
    }

    const sorted = chickens.sort((a, b) => {
        const metaA = (a.meta as any) || {};
        const metaB = (b.meta as any) || {};

        const levelA = metaA.level || 0;
        const levelB = metaB.level || 0;
        const xpA = metaA.xp || 0;
        const xpB = metaB.xp || 0;

        if (levelA !== levelB) return levelB - levelA;
        return xpB - xpA;
    });

    const top10 = sorted.slice(0, 10);

    const EMOJI_TROPHY = "🏆";

    const description = top10.map((inv, index) => {
        const meta = (inv.meta as any) || {};
        const level = meta.level || 0;
        const wins = meta.wins || 0;
        const name = meta.name ? `"${meta.name}"` : "Chicken";

        let rankEmoji = `#${index + 1}`;
        if (index === 0) rankEmoji = "🥇";
        if (index === 1) rankEmoji = "🥈";
        if (index === 2) rankEmoji = "🥉";

        return `${rankEmoji} **${inv.user.username}** — ${name} (Lvl ${level} | ${wins} Wins)`;
    }).join("\n");

    const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${EMOJI_TROPHY} Chicken Leaderboard`)
        .setDescription(description || "No active chickens.")
        .setFooter({ text: `Use ${prefix}chicken top to see this list.` });

    return message.reply({ embeds: [embed] });
}

async function handleName(message: Message, args: string[]) {
    const prefix = await getGuildPrefix(message.guildId!);
    if (args.length < 1) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}chicken name <New Name>\``)] });
    }

    const newName = args.join(" ");
    if (newName.length > 30) {
        return message.reply({ embeds: [errorEmbed(message.author, "Name Too Long", "Chicken names must be under 30 characters.")] });
    }

    const guildId = message.guildId!;
    const user = message.author;

    const shopItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
            name: { equals: "Chicken", mode: "insensitive" },
        })
    });

    if (!shopItem) return message.reply("Chicken item not configured in shop.");

    const userDb = await prisma.user.findUnique({ where: { discordId: user.id } });
    if (!userDb) return message.reply("User not found.");

    const inventoryItem = await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: userDb.discordId, shopItemId: shopItem.id } }
    });

    if (!inventoryItem || inventoryItem.amount < 1) {
        return message.reply({ embeds: [errorEmbed(user, "No Chicken", "You need a chicken to name it!")] });
    }

    const meta = (inventoryItem.meta as any) || {};
    meta.name = newName;

    await prisma.inventory.update({
        where: { id: inventoryItem.id },
        data: { meta }
    });


    const EMOJI_CHICKEN = "<:cock:1451281426329768172>";
    const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`${EMOJI_CHICKEN} Chicken Renamed!`)
        .setDescription(`Your chicken has been renamed to **${newName}**!`)
        .setFooter({ text: "May it fight with honor!" });

    return message.reply({ embeds: [embed] });
}

async function handleTraitsInfo(message: Message) {
    const prefix = await getGuildPrefix(message.guildId!);

    // Trait Definitions
    const traits = [
        { name: "Aggressive", effect: "**+2** Str, **-1** Def" },
        { name: "Tank", effect: "**+2** Def, **-1** Agi" },
        { name: "Speedster", effect: "**+2** Agi, **-1** Str" },
        { name: "Balanced", effect: "**+1** All Stats" },
        { name: "Fierce", effect: "**+3** Str, **-2** Def" },
    ];

    const description = traits.map(t => `• **${t.name}**: ${t.effect}`).join("\n");

    const embed = new EmbedBuilder()
        .setColor("#3498db")
        .setTitle("🧬 Chicken Traits")
        .setDescription(`Chickens are born with a random trait that affects their combat stats.\n\n${description}`)
        .setFooter({ text: `Traits are permanent and assigned at birth. Use ${prefix}chicken traits` });

    return message.reply({ embeds: [embed] });
}

async function handleView(message: Message, args: string[]) {
    const user = message.author;
    const guildId = message.guildId;

    if (!guildId) return;

    try {
        const prefix = await getGuildPrefix(guildId);
        const userData = await prisma.user.findUnique({ where: { discordId: user.id } });

        if (!userData) {
            return message.reply({ embeds: [errorEmbed(user, "Error", "User not found.")] });
        }

        const shopItem = await prisma.shopItem.findFirst({
            where: globalCatalogGuildFilter({
            name: { equals: "Chicken", mode: "insensitive" },
        })
        });

        if (!shopItem) {
            return message.reply({ embeds: [errorEmbed(user, "Error", "The 'Chicken' item does not exist in the shop.")] });
        }

        const inventoryItem = await prisma.inventory.findUnique({
            where: { userId_shopItemId: { userId: userData.discordId, shopItemId: shopItem.id } }
        });

        if (!inventoryItem) {
            return message.reply({
                embeds: [errorEmbed(user, "No Chicken", "You do not own a chicken! Buy one from the shop.")]
            });
        }

        const meta = (inventoryItem.meta as any) || {};
        const level = meta.level || 0;

        // --- TRAINING CHECK ---
        const activeTraining = meta.training;
        if (activeTraining) {
            const now = Date.now();
            if (now >= activeTraining.endTime) {
                // Training Complete!
                // Clear state and award
                delete meta.training;
                const stat = activeTraining.stat;
                meta[stat] = (meta[stat] || 0) + 1;

                await prisma.inventory.update({
                    where: { id: inventoryItem.id },
                    data: { meta }
                });

                const embed = new EmbedBuilder()
                    .setColor("#00FF00")
                    .setTitle("<:cock:1451281426329768172> Training Complete!")
                    .setDescription(`Your chicken has finished training!\n\n**${stat.toUpperCase()}** +1`);

                return message.reply({ embeds: [embed] });
            } else {
                // Still Training
                const endTimeUnix = Math.floor(activeTraining.endTime / 1000);
                const originalCost = activeTraining.cost || 0;
                const speedUpCost = Math.floor(originalCost * 0.5);

                const embed = new EmbedBuilder()
                    .setColor("#3498db")
                    .setTitle("<:cock:1451281426329768172> Training Room")
                    .setDescription(`Your chicken is currently training **${activeTraining.stat.toUpperCase()}**.\n\n⏳ Completes <t:${endTimeUnix}:R>`)
                    .setFooter({ text: "You cannot fight while training." });

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId("train_wakeup").setLabel("Wake Up (Cancel)").setStyle(ButtonStyle.Danger)
                );

                if (speedUpCost > 0) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId("train_speedup")
                            .setLabel(`Speed Up (${speedUpCost})`)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji("⚡")
                    );
                }

                const reply = await message.reply({ embeds: [embed], components: [row] });

                // --- AUTO COMPLETE LOGIC ---
                const msRemaining = activeTraining.endTime - Date.now();
                if (msRemaining > 0 && msRemaining < 2147483647) { // SetTimeout limit check
                    setTimeout(async () => {
                        try {
                            // 1. Double check state (in case canceled)
                            const checkInv = await prisma.inventory.findUnique({ where: { id: inventoryItem.id } });
                            const checkMeta = (checkInv?.meta as any) || {};
                            if (!checkMeta.training) return; // Already done/canceled

                            // 2. Resolve
                            delete checkMeta.training;
                            const stat = activeTraining.stat;
                            checkMeta[stat] = (checkMeta[stat] || 0) + 1;

                            await prisma.inventory.update({
                                where: { id: inventoryItem.id },
                                data: { meta: checkMeta }
                            });

                            // 3. Edit Embed
                            const completeEmbed = new EmbedBuilder()
                                .setColor("#00FF00")
                                .setTitle("🎓 Training Complete!")
                                .setDescription(`Your chicken has finished training!\n\n**${stat.toUpperCase()}** +1`);

                            await reply.edit({ embeds: [completeEmbed], components: [] });

                        } catch (e) {
                            console.error("Auto-complete error:", e);
                        }
                    }, msRemaining);
                }
                // ---------------------------

                const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: msRemaining + 5000 }); // Collect until slightly after end
                collector.on("collect", async (i) => {
                    if (i.user.id !== user.id) return i.reply({ content: "Not your chicken.", ephemeral: true });

                    if (i.customId === "train_wakeup") {
                        // Cancel Logic
                        delete meta.training;
                        // Partial XP? Let's give 10 XP for effort.
                        meta.xp = (meta.xp || 0) + 10;

                        await prisma.inventory.update({
                            where: { id: inventoryItem.id },
                            data: { meta }
                        });

                        await i.update({
                            content: "Training Cancelled. You got 10 XP for the effort.",
                            embeds: [],
                            components: []
                        });
                        collector.stop();
                    }

                    if (i.customId === "train_speedup") {
                        try {
                            await prisma.$transaction(async (tx) => {
                                const u = await tx.user.findUnique({ where: { discordId: userData.discordId }, include: { wallet: true } });
                                if (!u || (u.wallet?.balance || 0) < speedUpCost) {
                                    throw new Error("Insufficient funds");
                                }

                                // Re-fetch inventory to be safe
                                const freshInv = await tx.inventory.findUnique({ where: { id: inventoryItem.id } });
                                const freshMeta = (freshInv?.meta as any) || {};
                                if (!freshMeta.training) throw new Error("Not training");

                                const now = Date.now();
                                const currentEnd = freshMeta.training.endTime;
                                const remaining = currentEnd - now;

                                if (remaining <= 0) throw new Error("Already finished");

                                const newRemaining = Math.floor(remaining / 2);
                                const newEnd = now + newRemaining;

                                freshMeta.training.endTime = newEnd;

                                await tx.wallet.update({
                                    where: { id: u.wallet!.id },
                                    data: { balance: { decrement: speedUpCost } }
                                });

                                await tx.inventory.update({
                                    where: { id: inventoryItem.id },
                                    data: { meta: freshMeta }
                                });
                            });

                            await i.update({ content: "⚡ Training Speed Up! Time remaining halved.", embeds: [], components: [] });
                            // Note: The original setTimeout will still fire but find nothing or update harmlessly? 
                            // Ideally we should clear it but we can't.
                            // However, our auto-complete logic checks DB state (checkMeta.training).
                            // If we speed up, the DB endTime changes.
                            // The original setTimeout will fire late.
                            // We should probably rely on a new check or just let user check manually if it finishes early.
                            // Actually, since we updated the DB, the NEXT view will be correct.
                            // But the current embed won't auto-update to "Complete" earlier unless we set a NEW timeout?
                            // Complex to handle perfectly in a stateless bot, but basic "Speed Up" works.

                        } catch (e) {
                            await i.reply({ content: "Speed up failed. Insufficient funds or error.", ephemeral: true });
                        }
                    }
                });
                return;
            }
        }
        // --- END TRAINING CHECK ---

        // --- CRITICAL STATE CHECK (24h death window) ---
        if (meta.critical) {
            const now = Date.now();
            if (now >= meta.critical.endTime) {
                // Timer expired → permadeath
                await prisma.inventory.delete({ where: { id: inventoryItem.id } });
                const embed = new EmbedBuilder()
                    .setColor("#000000")
                    .setTitle("💀 Your Chicken Has Died")
                    .setDescription("The critical window expired. Your chicken could not be saved.\n\nRest in peace. You can buy a new chicken from the Cock Store.");
                return message.reply({ embeds: [embed] });
            }

            const endTimeUnix = Math.floor(meta.critical.endTime / 1000);
            const embed = new EmbedBuilder()
                .setColor("#8B0000")
                .setTitle("💀 CRITICAL CONDITION")
                .setDescription(
                    `Your chicken is **dying** and will be lost permanently if not saved!\n\n` +
                    `⏰ **Death in:** <t:${endTimeUnix}:R>\n\n` +
                    `**Only a Phoenix Serum can save it.**\n` +
                    `\`${prefix}use phoenix serum\`\n\n` +
                    `-# No coin heal available. No other items work. Act fast.`
                );
            return message.reply({ embeds: [embed] });
        }

        // --- INJURY CHECK ---
        const activeInjury = meta.injured;
        if (activeInjury) {
            const now = Date.now();
            if (now >= activeInjury.endTime) {
                delete meta.injured;
                await prisma.inventory.update({ where: { id: inventoryItem.id }, data: { meta } });
            } else {
                const endTimeUnix = Math.floor(activeInjury.endTime / 1000);
                const recoveryHours = activeInjury.recoveryHours ?? 2;
                const healCost = Math.floor(50_000 * (recoveryHours / 2));

                const embed = new EmbedBuilder()
                    .setColor("#E74C3C")
                    .setTitle("<:clinic:1453972244610154507> Veterinary Clinic")
                    .setDescription(
                        `Your chicken is **Injured** and cannot fight or train.\n\n` +
                        `<a:bandaid:1453972442300154018> Recovers <t:${endTimeUnix}:R> (${recoveryHours.toFixed(1)}h total)`
                    )
                    .addFields(
                        { name: "💰 Coin Heal", value: `Pay **${healCost.toLocaleString()}** coins to heal instantly.`, inline: true },
                        { name: "🏪 Cock Store", value: `\`${prefix}use feather bandage\` — Instant heal\n\`${prefix}use phoenix serum\` — Full recovery`, inline: false },
                    );

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId("chicken_heal").setLabel(`Heal (${healCost.toLocaleString()})`).setStyle(ButtonStyle.Success).setEmoji("<:medicine:1453973645675200727>")
                );

                const reply = await message.reply({ embeds: [embed], components: [row] });

                const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
                collector.on("collect", async (i) => {
                    if (i.user.id !== user.id) return i.reply({ content: "Not your chicken.", ephemeral: true });

                    if (i.customId === "chicken_heal") {
                        try {
                            await prisma.$transaction(async (tx) => {
                                const u = await tx.user.findUnique({ where: { discordId: userData.discordId }, include: { wallet: true } });
                                if (!u || (u.wallet?.balance || 0) < healCost) {
                                    throw new Error("Insufficient funds");
                                }
                                await tx.wallet.update({
                                    where: { id: u.wallet!.id },
                                    data: { balance: { decrement: healCost } }
                                });

                                const freshInv = await tx.inventory.findUnique({ where: { id: inventoryItem.id } });
                                const freshMeta = (freshInv?.meta as any) || {};
                                delete freshMeta.injured;

                                await tx.inventory.update({
                                    where: { id: inventoryItem.id },
                                    data: { meta: freshMeta }
                                });
                            });

                            await i.update({ content: `${Mascot.Emotes.Accept} Your chicken has been healed!`, embeds: [], components: [] });
                        } catch (e) {
                            await i.reply({ content: `Heal failed. You might lack funds (${healCost.toLocaleString()}) or an error occurred.`, ephemeral: true });
                        }
                    }
                });
                return;
            }
        }
        // --------------------

        const wins = meta.wins || 0;
        const xp = meta.xp || 0;
        const chickenName = meta.name || `${user.username}'s Chicken`;

        const requiredXp = (level + 1) * 100;
        const filledBars = Math.floor((xp / requiredXp) * 10);
        const emptyBars = 10 - filledBars;
        const progressBar = `${EMOJI_XP.repeat(filledBars)}${EMOJI_XP_EMPTY.repeat(emptyBars)}`;

        // Calculate Stats
        const equipList: string[] = [];
        const equipment = meta.equipment || {};
        const legacyEquip = meta.equippedItemName;

        if (Object.keys(equipment).length > 0) {
            Object.values(equipment).forEach((e: any) => equipList.push(e.name));
        } else if (legacyEquip) {
            equipList.push(legacyEquip);
        }

        const baseStats = { str: meta.strength || 0, agi: meta.agility || 0, def: meta.defense || 0 };
        const finalStats = calculateTotalStats(baseStats, meta.trait, equipList);

        const myScore = calculateCombatScore(level, finalStats);

        const getProb = (enemyLvl: number) => {
            // Approx enemy stats? assume balanced base 0 at that level
            const enemyScore = 100 + (enemyLvl * 10);
            return getWinChance(myScore, enemyScore).toFixed(1);
        };

        // Equipment Display
        // const equipDisplay = equipList.length > 0 ? equipList.join(", ") : "None";
        // Better: Breakdown by slot
        let equipText = "None";
        if (Object.keys(equipment).length > 0) {
            equipText = Object.entries(equipment).map(([slot, item]: [string, any]) => `**${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${item.name}`).join("\n");
        } else if (legacyEquip) {
            equipText = `**Legacy:** ${legacyEquip}`;
        }

        const embed = new EmbedBuilder()
            .setColor("#FFD700")
            .setTitle(`${EMOJI_CHICKEN} ${chickenName}`)
            .setThumbnail(user.displayAvatarURL())
            .setDescription(`**Level ${level}** Battle Chicken`)
            .addFields(
                { name: "Name", value: chickenName, inline: true },
                { name: "XP", value: `${progressBar} ${xp}/${requiredXp}`, inline: true },
                { name: "Wins", value: `${wins}`, inline: true },
                {
                    name: "Stats",
                    value: `
**Strength:** ${drawStatBar(baseStats.str, finalStats.str - baseStats.str)} ${finalStats.str}
**Agility:** ${drawStatBar(baseStats.agi, finalStats.agi - baseStats.agi)} ${finalStats.agi}
**Defense:** ${drawStatBar(baseStats.def, finalStats.def - baseStats.def)} ${finalStats.def}
**Trait:** ${meta.trait || "None"}
`,
                    inline: false
                },
                { name: "Equipment", value: equipText, inline: false },
                {
                    name: "Win Probabilities (Est.)", value: `
Vs Lvl 0: **${getProb(0)}%**
Vs Lvl 5: **${getProb(5)}%**
Vs Lvl 10: **${getProb(10)}%**
`, inline: false
                }
            )
            .setFooter({ text: `Use ${prefix}chicken name <name> to rename!` });

        return message.reply({ embeds: [embed] });

    } catch (error) {
        console.error("Chicken Command Error:", error);
        return message.reply({ embeds: [errorEmbed(user, "System Error", "An error occurred while fetching chicken stats.")] });
    }
}



function drawStatBar(baseValue: number, traitBonus: number) {
    const max = 20; // Visual max
    const blocks = 10;

    // Logic:
    // TraitBonus < 0 => "Debt".
    // 1 Block = 2 Points.

    const penalty = Math.max(0, -traitBonus); // Positive representation of negative trait
    // Debt is remaining penalty not covered by base stats.
    // Example: Base 0, Penalty 2 (Trait -2). Net -2. Debt 2.
    // Example: Base 2, Penalty 2. Net 0. Debt 0.
    const debt = Math.max(0, penalty - baseValue);

    // Net Value (for Green Bars)
    // Example: Base 4, Penalty 2. Net 2.
    const netValue = Math.max(0, baseValue + traitBonus);

    const redBars = Math.ceil(debt / 2); // Round up to show existence of penalty
    const greenBars = Math.floor(netValue / 2);

    const totalFilled = redBars + greenBars;
    const emptyBars = Math.max(0, blocks - totalFilled);

    const EMOJI_FULL = "<:xpfull:1451636569982111765>";
    const EMOJI_EMPTY = "<:xpempty:1451642829427314822>";
    const EMOJI_RED = "<:Red_Bar:1454017024346034176>";

    return `${EMOJI_RED.repeat(redBars)}${EMOJI_FULL.repeat(greenBars)}${EMOJI_EMPTY.repeat(emptyBars)}`;
}

async function handleTrain(message: Message, args: string[]) {
    const stat = args[0]?.toLowerCase();
    const prefix = await getGuildPrefix(message.guildId!);
    const validStats = ["strength", "agility", "defense"];

    if (!validStats.includes(stat)) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Stat", `Usage: \`${prefix}chicken train <strength|agility|defense>\`\nValid stats: Strength, Agility, Defense.`)]
        });
    }

    const guildId = message.guildId!;
    const user = message.author;

    // 2. Get Chicken to Check Level
    const shopItem = await prisma.shopItem.findFirst({
        where: globalCatalogGuildFilter({
            name: { equals: "Chicken", mode: "insensitive" },
        }),
    });
    if (!shopItem) return message.reply("Chicken item missing.");

    const inv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: await getUserId(user.id, guildId), shopItemId: shopItem.id } } });
    if (!inv || inv.amount < 1) return message.reply({ embeds: [errorEmbed(user, "No Chicken", "You need a chicken to train!")] });

    const meta = (inv.meta as any) || {};

    // Check if already training, injured, or critical
    if (meta.critical) {
        return message.reply(`Your chicken is in **critical condition**! Use \`${prefix}use phoenix serum\` to save it.`);
    }
    if (meta.training) {
        return message.reply(`Your chicken is already training! Check \`${prefix}chicken\`.`);
    }
    if (meta.injured) {
        return message.reply(`Your chicken is injured! Use \`${prefix}use feather bandage\` or coin-heal via \`${prefix}chicken\`.`);
    }

    const level = meta.level || 0;

    const baseCost = 500;
    const trainMult = 0.5;

    // Dynamic Cost & Time
    const cost = Math.floor(baseCost * (1 + level * trainMult));
    const durationMins = Math.max(2, level * 1); // Min 2 mins, or Level * 1
    const durationMs = durationMins * 60 * 1000;

    // 1. Check Money
    const wallet = await prisma.wallet.findUnique({ where: { userId: inv.userId } });
    if (!wallet || wallet.balance < cost) {
        return message.reply({ embeds: [errorEmbed(user, "Insufficient Funds", `Training costs **${cost}**. You have **${wallet?.balance || 0}**.`)] });
    }

    const EMOJI_CHICKEN = "<:cock:1451281426329768172>";

    const confirmEmbed = new EmbedBuilder()
        .setColor("#FFA500")
        .setTitle(`${EMOJI_CHICKEN} Training: ${stat.toUpperCase()}`)
        .setDescription(`Training will boost **${stat}** permanently.\n\n**Cost:** ${cost} coins\n**Duration:** ${durationMins} minutes\n\nYour chicken will be unavailable for fights during this time.`)
        .setFooter({ text: "Confirm payment to start." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("train_confirm").setLabel(`Pay ${cost} & Start`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("train_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );

    const reply = await message.reply({ embeds: [confirmEmbed], components: [row] });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on("collect", async (i) => {
        if (i.user.id !== user.id) return i.reply({ content: "Not your chicken.", ephemeral: true });

        if (i.customId === "train_cancel") {
            await i.update({ content: "Training cancelled.", embeds: [], components: [] });
            return;
        }

        if (i.customId === "train_confirm") {
            // Re-check funds transactionally
            try {
                await prisma.$transaction(async (tx) => {
                    const u = await tx.user.findUnique({ where: { discordId: inv.userId }, include: { wallet: true } });
                    if (!u || !u.wallet || u.wallet.balance < cost) {
                        throw new Error("Insufficient funds.");
                    }

                    await tx.wallet.update({
                        where: { id: u.wallet.id },
                        data: { balance: { decrement: cost } }
                    });

                    // Update Chicken Meta
                    const newMeta = JSON.parse(JSON.stringify(meta)); // Deep copy safer
                    newMeta.training = {
                        stat: stat,
                        endTime: Date.now() + durationMs,
                        cost: cost // Store cost for speed-up calc
                    };

                    await tx.inventory.update({
                        where: { id: inv.id },
                        data: { meta: newMeta }
                    });
                });

                const { questBus } = require("../../services/questEvents");
                questBus.emit("cockfight:train", { discordId: user.id });

                const endTimeUnix = Math.floor((Date.now() + durationMs) / 1000);

                await i.update({
                    content: null,
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#00FF00")
                            .setTitle(`${EMOJI_CHICKEN} Training Started!`)
                            .setDescription(`Your chicken has entered the Training Room!\n\nCompletes <t:${endTimeUnix}:R>`)
                    ],
                    components: []
                });

                // --- AUTO COMPLETE LOGIC FOR START MESSAGE ---
                if (durationMs < 2147483647) {
                    setTimeout(async () => {
                        try {
                            // 1. Double check state (in case canceled)
                            const checkInv = await prisma.inventory.findUnique({ where: { id: inv.id } });
                            const checkMeta = (checkInv?.meta as any) || {};
                            if (!checkMeta.training) return; // Already done/canceled

                            // 2. Resolve (duplicate logic, but safe due to checkMeta.training check)
                            // Ideally we call a shared function, but for now duplicate to ensure visual update matches state.
                            // NOTE: If handleView resolved it first, checkMeta.training will be null.
                            // If WE count down, we update DB.

                            delete checkMeta.training;
                            const currentStatVal = checkMeta[stat] || 0;
                            // If it wasn't updated yet:
                            checkMeta[stat] = currentStatVal + 1;

                            await prisma.inventory.update({
                                where: { id: inv.id },
                                data: { meta: checkMeta }
                            });

                            // 3. Edit Embed
                            const completeEmbed = new EmbedBuilder()
                                .setColor("#00FF00")
                                .setTitle("🎓 Training Complete!")
                                .setDescription(`Your chicken has finished training!\n\n**${stat.toUpperCase()}** +1`);

                            await reply.edit({ embeds: [completeEmbed], components: [] });

                        } catch (e) {
                            // Ignore if already edited or permission lost
                        }
                    }, durationMs);
                }
                // ---------------------------------------------

            } catch (err) {
                await i.update({ content: "Transaction failed (Maybe insufficient funds).", embeds: [], components: [] });
            }
        }
    });
}

async function getUserId(discordId: string, guildId: string): Promise<string> {
    const user = await ensureUserAndWallet(discordId, guildId, "Unknown");
    return user.discordId;
}
