import { Interaction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Message, TextChannel, MessageFlags, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import { enroll, claimScholarship, dropout } from "../services/educationService";
import { fmtCurrency, formatDuration } from "../utils/format";
import { Mascot, getEmoteUrl } from "../config/branding";
import prisma from "../utils/prisma";
import { logToChannel } from "../utils/discordLogger";
import { questBus } from "../services/questEvents";
import { applyRelaxOption, getRelaxSnapshot } from "../services/relaxService";
import { buildRelaxDashboard } from "../commands/life/relax";
import { checkCounterfeitKit, checkCrownOfGreed, checkDevilContract } from "../services/shopBuffs";
import { redisService } from "../services/redisService";
import { getRequiredGearKey } from "../services/jobService";
import { JOB_SHOP_CATALOG } from "../utils/shopCatalog";
import { seedJobShop } from "../services/shopService";
import { getGuildPrefix } from "../utils/guildContext";
import { globalCatalogGuildFilter } from "../utils/globalCatalog";
import { MAX_SAFE_BALANCE } from "../utils/economyConfig";
import {
    ensureDeferredEphemeralReply,
    ensureDeferredUpdate,
    safeDeferReply,
    safeEditReply,
    safeFollowUp,
    safeReply,
    safeUpdate,
} from "../utils/interactionHelpers";

function textContainer(title: string, body: string, color = 0x2ECC71) {
    return new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${title}**`),
            new TextDisplayBuilder().setContent(body),
        );
}

const activeRelaxSelections = new Set<string>();

export async function handleLifeInteraction(interaction: Interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
}

async function handleButton(interaction: ButtonInteraction) {
    const { customId, user, guild } = interaction;
    if (!guild) return;

    if (customId.startsWith("enroll_confirm_")) {
        const parts = customId.split("_");
        // format: enroll_confirm_degreeId_userId
        // parts: ['enroll', 'confirm', degreeId, userId]

        // Backwards compatibility handling or robust parsing
        const degreeId = parts[2];
        const targetUserId = parts[3];
        const paymentMethod = parts[4] === "card" ? "card" : "wallet";

        if (targetUserId && targetUserId !== user.id) {
            await safeReply(interaction, {
                content: `${Mascot.Emotes.Fail} This interaction is not for you.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!await ensureDeferredEphemeralReply(interaction)) return;

        try {
            const result = await enroll(user.id, guild.id, degreeId, paymentMethod);

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.Accept} Enrollment Successful`)
                .setDescription(`You have successfully enrolled in **${result.degree.name}**!`)
                .addFields(
                    { name: "Tuition Paid", value: fmtCurrency(result.degree.tuitionPerSem) },
                    { name: "Payment Method", value: paymentMethod === "card" ? "Fortuna Card" : "Wallet" }
                )
                .setColor("#2ECC71");

            await safeEditReply(interaction, { embeds: [embed] });

        } catch (err: any) {
            await safeEditReply(interaction, { content: `${Mascot.Emotes.Fail} **Enrollment Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("relax:")) {
        const [, ownerId, optionId] = customId.split(":");
        if (ownerId !== user.id) {
            return safeReply(interaction, {
                components: [textContainer("Relax Session", "This relax dashboard belongs to someone else.", 0xE74C3C)],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }

        if (!await ensureDeferredUpdate(interaction)) return;

        const lockKey = `${user.id}:${optionId}`;
        if (activeRelaxSelections.has(lockKey)) {
            return safeEditReply(interaction, {
                components: [textContainer("Relax In Progress", "Your relax activity is already being processed.", 0xF1C40F)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        try {
            activeRelaxSelections.add(lockKey);
            const result = await applyRelaxOption(user.id, user.username, optionId);
            const prefix = await getGuildPrefix(guild.id);
            const dashboard = await buildRelaxDashboard(user.id, guild.id, user.username);

            dashboard.container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**${Mascot.Emotes.Accept} ${result.option.name} complete.**\n` +
                    `Paid ${fmtCurrency(result.cost)}.\n` +
                    `Wallet: ${fmtCurrency(result.previousWalletBalance)} -> ${fmtCurrency(result.walletBalance)}\n` +
                    `Job Stress: ${result.previousJobStress}/100 -> ${result.jobStress}/100\n` +
                    `Education Stress: ${result.previousEducationStress === null ? "Not enrolled" : `${result.previousEducationStress}/100 -> ${result.educationStress}/100`}`,
                ),
            );

            await safeEditReply(interaction, {
                components: [dashboard.container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (err: any) {
            const snapshot = await getRelaxSnapshot(user.id, user.username);
            await safeEditReply(interaction, {
                components: [
                    textContainer(
                        "Relax Failed",
                        `${Mascot.Emotes.Fail} ${err.message}\n\nWallet: ${fmtCurrency(snapshot.walletBalance)}\nJob Stress: ${snapshot.jobStress}/100\nEducation Stress: ${snapshot.hasEducation ? `${snapshot.educationStress}/100` : "Not enrolled"}`,
                        0xE74C3C,
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } finally {
            activeRelaxSelections.delete(lockKey);
        }
    }
    else if (customId.startsWith("claim_scholarship_")) {
        const milestone = parseInt(customId.replace("claim_scholarship_", ""));

        if (!await ensureDeferredEphemeralReply(interaction)) return;

        try {
            const amount = await claimScholarship(user.id, guild.id, milestone);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.MoneyBag} Scholarship Claimed!`)
                .setDescription(`You claimed **${fmtCurrency(amount)}** for reaching **${milestone}% Education XP**!`)
                .setColor("#F1C40F");

            await safeEditReply(interaction, { embeds: [embed] });
        } catch (err: any) {
            await safeEditReply(interaction, { content: `${Mascot.Emotes.Fail} **Claim Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("edu_stress_") || customId.startsWith("stress_") || customId.startsWith("confirm_edu_stress_") || customId.startsWith("confirm_stress_")) {
        const activity = customId.split("_").pop() || "gym";
        const optionByLegacyActivity: Record<string, string> = {
            sports: "quick_break",
            gym: "gym_session",
            meditation: "meditation_retreat",
        };
        const optionId = optionByLegacyActivity[activity] ?? "gym_session";

        if (!await ensureDeferredUpdate(interaction)) {
            if (!await ensureDeferredEphemeralReply(interaction)) return;
        }

        try {
            await applyRelaxOption(user.id, user.username, optionId);
            const dashboard = await buildRelaxDashboard(user.id, guild.id, user.username);
            await safeEditReply(interaction, {
                components: [dashboard.container],
                embeds: [],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (err: any) {
            await safeEditReply(interaction, {
                components: [textContainer("Relax Failed", `${Mascot.Emotes.Fail} ${err.message}`, 0xE74C3C)],
                embeds: [],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }
    else if (customId === "cancel_stress") {
        await safeUpdate(interaction, { content: `${Mascot.Emotes.Decline} Activity cancelled.`, embeds: [], components: [] });
    }
    else if (customId === "dropout_confirm") {
        if (!await ensureDeferredUpdate(interaction)) return;
        try {
            const res = await dropout(user.id, guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Shocked} Dropped Out`)
                .setDescription(`You have dropped out of **${res.degreeName}**.\n\nYour tuition fees are non-refundable. You are now free to enroll in another program.`)
                .setColor("#E74C3C")
                .setThumbnail(getEmoteUrl(Mascot.Emotes.Shocked));

            await safeEditReply(interaction, { embeds: [embed], components: [] });

        } catch (err: any) {
            await safeEditReply(interaction, { content: `${Mascot.Emotes.Fail} **Dropout Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "dropout_cancel") {
        await safeUpdate(interaction, { content: `${Mascot.Emotes.Decline} Dropout cancelled. Phew!`, embeds: [], components: [] });
    }
    // JOB HANDLERS
    else if (customId === "work_resign") {
        if (!await ensureDeferredEphemeralReply(interaction)) return;

        const shockedUrl = getEmoteUrl(Mascot.Emotes.Shocked);
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Alert} Confirm Resignation`)
            .setDescription("Are you sure you want to resign from your job?\n\n**You will lose:**\n- Your current job title\n- Job XP progress\n- Current shift streak")
            .setColor("#E74C3C")
            .setFooter({ text: "This action cannot be undone." });

        if (shockedUrl) embed.setThumbnail(shockedUrl);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("work_resign_confirm").setLabel("Confirm Resignation").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("work_resign_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );

        await safeEditReply(interaction, { embeds: [embed], components: [row] });
    }
    else if (customId.startsWith("work_promote_")) {
        if (!await ensureDeferredEphemeralReply(interaction)) return;

        const requestedNextJobId = customId.replace("work_promote_", "");
        const freshUser = await prisma.user.findUnique({ where: { discordId: user.id } });
        if (!freshUser || !freshUser.jobId) {
            return safeEditReply(interaction, { content: "You don't have a job to promote from." });
        }

        const { checkPromotion: _checkPromo, getJob: _getJob } = require("../services/jobService");
        const promoCheck = await _checkPromo(freshUser, guild.id);

        if (!promoCheck.eligible || !promoCheck.nextJob) {
            const parts: string[] = [];
            if (promoCheck.missingXp > 0) parts.push(`**${promoCheck.missingXp} more XP**`);
            if (promoCheck.missingShifts > 0) parts.push(`**${promoCheck.missingShifts} more shifts**`);
            const missing = parts.length > 0 ? parts.join(" and ") : "requirements not met";
            return safeEditReply(interaction, { content: `You need ${missing} before you can be promoted.` });
        }

        if (promoCheck.nextJob.id !== requestedNextJobId) {
            return safeEditReply(interaction, { content: "This promotion button is outdated. Run `!work` again." });
        }

        const prevJob = _getJob(freshUser.jobId);
        const nextJob = promoCheck.nextJob;

        await prisma.user.update({
            where: { discordId: user.id },
            data: {
                jobId: nextJob.id,
                jobFailStreak: 0,
                // keep jobXp, shiftsWorked, jobStress
            }
        });

                
        const promoEmbed = new EmbedBuilder()
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
            .setTitle(`${Mascot.Emotes.JobPromotion} Promoted!`)
            .setDescription(
                `**${prevJob?.title ?? "Previous Role"}** → **${nextJob.title}**\n\n` +
                `**New Pay:** ${fmtCurrency(nextJob.pay)}/shift\n` +
                `**Sector:** ${nextJob.sector.charAt(0).toUpperCase() + nextJob.sector.slice(1)}\n` +
                `**Level:** ${nextJob.level}`
            )
            .setColor("#F1C40F")
            .setFooter({ text: "Use !work to start your next shift in your new role." });

        logToChannel(interaction.client, {
            guild,
            type: "ECONOMY",
            title: "Job Promotion",
            description: `**${user.username}** promoted from **${prevJob?.title}** to **${nextJob.title}**`,
            color: 0xF1C40F,
            thumbnail: user.displayAvatarURL(),
        }).catch(() => {});

        return safeEditReply(interaction, { embeds: [promoEmbed] });
    }
    else if (customId === "work_resign_confirm") {
        if (!await ensureDeferredUpdate(interaction)) return;
        try {
            await prisma.user.update({
                where: { discordId: user.id },
                data: { jobId: null, jobXp: 0, shiftsWorked: 0, lastShift: null }
            });

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Shocked} Resignation Processed`)
                .setDescription("**You have resigned.**\n\nYou are now unemployed. Your career progress has been reset.")
                .setColor("#95A5A6");

            await safeEditReply(interaction, { embeds: [embed], components: [] });

            // Log resignation
            logToChannel(interaction.client, {
                guild: guild,
                type: "ECONOMY",
                title: "Job Resignation",
                description: `**${user.username}** has resigned from their job.`,
                fields: [
                    { name: "User", value: `<@${user.id}>`, inline: true }
                ],
                thumbnail: user.displayAvatarURL(),
                color: 0xE74C3C
            });
        } catch (e: any) {
            await safeEditReply(interaction, { content: `Error: ${e.message}`, components: [] });
        }
    }
    else if (customId === "work_resign_cancel") {
        await safeUpdate(interaction, { content: `${Mascot.Emotes.Success} Cancelled resignation. Get back to work!`, embeds: [], components: [] });
    }
    else if (customId.startsWith("work_event_choice_")) {
        const parts = customId.split("_"); // work_event_choice_eventId_choiceIdx
        const eventId = parts[3] + "_" + parts[4]; // e.g., tech_crash. WAIT, split limit?
        // ID might contain underscores. Let's start from index 3.
        // Actually event IDs like "tech_crash" have underscores.
        // CustomID: work_event_choice_tech_crash_0
        // Split: ["work", "event", "choice", "tech", "crash", "0"]
        // The last part is index. The middle parts are ID.

        const choiceIdx = parseInt(parts[parts.length - 1]);
        const eventIdParts = parts.slice(3, parts.length - 1);
        const targetEventId = eventIdParts.join("_");

        const { WORK_EVENTS } = require("../services/jobService");
        const event = WORK_EVENTS.find((e: any) => e.id === targetEventId);

        if (!event) {
            return safeUpdate(interaction, { content: "Event expired or invalid.", embeds: [], components: [] });
        }

        const choice = event.choices[choiceIdx];

        // Lucky Tie: +10% success chance on event choices
        const tieData = await redisService.get<{ active: boolean }>(`lucky_tie:${user.id}`);
        const tieBoost = tieData?.active ? 10 : 0;
        let success = Math.random() * 100 < (choice.successChance + tieBoost);

        if (!await ensureDeferredUpdate(interaction)) return;

        const prefix = await getGuildPrefix(guild.id);
        const userData = await prisma.user.findUnique({
            where: { discordId: user.id },
            include: { wallet: true }
        });

        if (!userData || !userData.jobId) return;

        const { getJob, getJobPay, checkPromotion, checkDemotion } = require("../services/jobService");
        const job = getJob(userData.jobId);
        const basePay = await getJobPay(job, guild.id);

        // Emergency Pager: convert critical failure to partial success
        let pagerSaved = false;
        if (!success && choice.critical) {
            const pagerData = await redisService.get<{ active: boolean }>(`emergency_pager:${user.id}`);
            if (pagerData?.active) {
                await redisService.del(`emergency_pager:${user.id}`);
                pagerSaved = true;
            }
        }

        let msg = success ? choice.successMsg : choice.failMsg;
        if (pagerSaved) msg = `Emergency Pager activated! Disaster averted.\n${msg}`;
        let color = success ? "#2ECC71" : pagerSaved ? "#F1C40F" : "#E74C3C";

        // Outcome
        const { xp = 0, money = 0, stress = 0 } = choice.outcome;

        // Apply Outcome
        let earnings = 0;
        let xpGain = 0;
        let stressGain = 0;

        const eventNotes: string[] = [];
        if (tieBoost > 0) eventNotes.push("Lucky Tie: +10% success boost");
        if (pagerSaved) eventNotes.push("Emergency Pager: saved from critical failure");

        const overtimeEventData = await redisService.get<{ gearRisk: boolean }>(`overtime_active:${user.id}`);
        if (overtimeEventData?.gearRisk) {
            await redisService.del(`overtime_active:${user.id}`);
            eventNotes.push("Overtime Contract: high-pressure event triggered extra gear risk");
        }

        // Fetch current sector rep BEFORE applying bonuses (current tier applies to this event)
        const { getSectorReputation: _getEventRep, addSectorReputation: _addEventRep } = require("../services/jobReputationService");
        const eventRepData = await _getEventRep(userData.discordId, job.sector);

        if (success) {
            earnings = Math.floor(basePay * (money || 0));
            earnings = Math.floor(earnings * eventRepData.tier.payBonus); // Apply rep pay bonus
            if (MAX_SAFE_BALANCE && userData.wallet && userData.wallet.balance + earnings > MAX_SAFE_BALANCE) {
                earnings = 0;
                eventNotes.push("⚠️ Wallet Limit Reached! Earned 0 coins.");
            }

            // Focus Headphones XP boost on event success
            let baseXp = xp || 0;
            const focusData = await redisService.get<{ shiftsLeft: number; xpMult: number }>(`focus_headphones:${user.id}`);
            if (focusData && focusData.shiftsLeft > 0 && baseXp > 0) {
                baseXp = Math.floor(baseXp * focusData.xpMult);
                const remaining = focusData.shiftsLeft - 1;
                if (remaining <= 0) {
                    await redisService.del(`focus_headphones:${user.id}`);
                } else {
                    const ttl = await redisService.getInstance().ttl(`focus_headphones:${user.id}`);
                    if (ttl > 0) await redisService.set(`focus_headphones:${user.id}`, { ...focusData, shiftsLeft: remaining }, ttl);
                }
                eventNotes.push(`Focus Headphones: +${baseXp} XP (${remaining} shifts left)`);
            }
            xpGain = baseXp;
            stressGain = pagerSaved ? 2 : (stress || 0);
        } else {
            earnings = 0;
            xpGain = pagerSaved ? 2 : -5;
            stressGain = pagerSaved ? 2 : ((stress || 10) + 15);
            if (pagerSaved) eventNotes.push("Critical failure softened: no pay, +2 XP, +2 Stress");
            else eventNotes.push(`Penalty: No Pay, -5 XP, +${stressGain} Stress`);
        }

        // Gear damage on event failure (3-8 base wear) and overtime-risk events.
        const { getRequiredGearKey: getGearKeyForEvent } = require("../services/jobService");
        const eventGearKey = getGearKeyForEvent(job.sector);
        if (eventGearKey && ((!success && !pagerSaved) || overtimeEventData?.gearRisk)) {
            const { JOB_SHOP_CATALOG: JOB_CAT } = require("../utils/shopCatalog");
            const { seedJobShop: seedJob } = require("../services/shopService");
            await seedJob(guild.id);
            const gearItem = JOB_CAT.find((i: any) => i.key === eventGearKey);
            if (gearItem) {
                const gearInDb = await prisma.shopItem.findFirst({
                    where: globalCatalogGuildFilter({
                        name: { equals: gearItem.name, mode: "insensitive" },
                    }),
                });
                const invRow = gearInDb ? await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: userData.discordId, shopItemId: gearInDb.id } } }) : null;
                if (invRow) {
                    let wear = !success && !pagerSaved ? 3 + Math.floor(Math.random() * 6) : 0;
                    if (overtimeEventData?.gearRisk) wear += 15 + Math.floor(Math.random() * 16);
                    const oilData = await redisService.get<{ shiftsLeft: number }>(`tools_oil:${user.id}`);
                    if (oilData && oilData.shiftsLeft > 0 && wear > 0) {
                        wear = Math.ceil(wear / 2);
                        const oilRemaining = oilData.shiftsLeft - 1;
                        if (oilRemaining <= 0) {
                            await redisService.del(`tools_oil:${user.id}`);
                        } else {
                            const oilTtl = await redisService.getInstance().ttl(`tools_oil:${user.id}`);
                            if (oilTtl > 0) await redisService.set(`tools_oil:${user.id}`, { shiftsLeft: oilRemaining }, oilTtl);
                        }
                        eventNotes.push(`Premium Tools Oil: reduced gear wear (${oilRemaining} shifts left)`);
                    }
                    const currentDurability = (invRow.meta as any)?.durability ?? 100;
                    const newDurability = Math.max(0, currentDurability - wear);
                    const warrantyData = await redisService.get<{ active: boolean }>(`warranty_card:${user.id}`);
                    if (newDurability <= 0 && warrantyData?.active) {
                        await redisService.del(`warranty_card:${user.id}`);
                        eventNotes.push(`Warranty Card protected your **${gearItem.name}**`);
                    } else if (wear > 0) {
                        await prisma.inventory.update({ where: { id: invRow.id }, data: { meta: { ...((invRow.meta as any) ?? {}), durability: newDurability } } });
                        if (newDurability <= 0) eventNotes.push(`**Gear Broken:** ${gearItem.name} — use Repair Coupon`);
                        else eventNotes.push(`Gear Wear: ${gearItem.name} -${wear} (${newDurability}/100)`);
                    }
                }
            }
        }

        // Apply to DB
        await prisma.user.update({
            where: { discordId: userData.discordId },
            data: {
                wallet: { update: { balance: { increment: earnings } } },
                jobXp: { increment: xpGain },
                jobStress: Math.min(100, (userData.jobStress || 0) + stressGain), // Cap at 100
                shiftsWorked: { increment: 1 },
                lastShift: new Date(),
                jobFailStreak: success || pagerSaved ? 0 : undefined // Reset fail streak on success or pager save
            }
        });

        // Grant reputation AFTER DB write — only on success/pager
        if (success || pagerSaved) {
            const eventRepResult = await _addEventRep(userData.discordId, job.sector, 8, "event_success");
            if (eventRepResult.tierChanged) {
                eventNotes.push(`Reputation: **${eventRepResult.tier.name}** tier reached! (${eventRepResult.after} rep)`);
            } else {
                eventNotes.push(`Reputation: +8 (${eventRepResult.after} — ${eventRepResult.tier.name})`);
            }
        }

        if (eventNotes.length > 0) {
            msg += `\n${eventNotes.map(n => `- ${n}`).join("\n")}`;
        }

        // XP/Stress Checks
        let footerText = "";

        // Promotion
        if (xpGain > 0) {
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + xpGain, shiftsWorked: userData.shiftsWorked + 1 }, guild.id);
            if (promoCheck.eligible && promoCheck.nextJob) {
                // Determine if we show celebration or just footer
                // Let's just note it for now, implementation plan says Celebration later
                footerText = `🎉 Promotion Available: ${promoCheck.nextJob.title}`;
            } else if (promoCheck.nextJob) {
                footerText = `Next Job: ${promoCheck.nextJob.title} (${promoCheck.missingXp} xp, ${promoCheck.missingShifts} shifts to go)`;
            }
        }

        // Demotion (check on failure — uses 3-strike system)
        let eventDemoField: { name: string; value: string } | null = null;
        if (xpGain < 0) {
            const prevJobTitle = getJob ? getJob(userData.jobId)?.title ?? "Previous Role" : "Previous Role";
            const demoCheck = await checkDemotion(userData);
            if (demoCheck.demoted) {
                eventDemoField = {
                    name: "🚨 Demoted",
                    value: `**${prevJobTitle}** → **${demoCheck.prevJob?.title ?? "previous role"}**\n${demoCheck.msg}`,
                };
            } else if (demoCheck.msg) {
                eventDemoField = { name: "⚠️ Warning", value: demoCheck.msg };
            }
        }

        const resEmbed = new EmbedBuilder()
            .setTitle(success ? `${Mascot.Emotes.Success} Event Resolved` : pagerSaved ? `${Mascot.Emotes.Alert} Event Saved` : `${Mascot.Emotes.Fail} Event Failed`)
            .setDescription(`**${choice.label}**\n${msg}\n\n**Result:**\n${Mascot.Emotes.MoneyBag} ${fmtCurrency(earnings)}\nXP: ${xpGain > 0 ? '+' : ''}${xpGain}\n${Mascot.Emotes.Alert} +${stressGain} Stress`)
            .setColor(color as any);

        const eventRows: ActionRowBuilder<ButtonBuilder>[] = [];

        if (xpGain > 0) {
            // Re-check promotion to get the object
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + xpGain, shiftsWorked: userData.shiftsWorked + 1 }, guild.id);
            if (promoCheck.eligible && promoCheck.nextJob) {
                resEmbed.addFields({ name: `${Mascot.Emotes.JobPromotion} Promotion Available!`, value: `You are ready for **${promoCheck.nextJob.title}**! Use \`!work\` and click **Promote**.` });
                resEmbed.setColor("#F1C40F");

                eventRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`work_promote_${promoCheck.nextJob.id}`)
                        .setLabel(`Promote → ${promoCheck.nextJob.title}`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(Mascot.Emotes.JobPromotion)
                ));
            } else if (promoCheck.nextJob) {
                const promoParts: string[] = [];
                if (promoCheck.missingXp > 0) promoParts.push(`${promoCheck.missingXp} XP`);
                if (promoCheck.missingShifts > 0) promoParts.push(`${promoCheck.missingShifts} shifts`);
                resEmbed.setFooter({ text: `Progress to ${promoCheck.nextJob.title}: need ${promoParts.join(", ")}` });
            }
        } else if (footerText) {
            resEmbed.setFooter({ text: footerText });
        }

        if (eventDemoField) resEmbed.addFields(eventDemoField);
        if (eventDemoField?.name.startsWith("🚨")) resEmbed.setColor("#E74C3C");

        await safeEditReply(interaction, { embeds: [resEmbed], components: eventRows });

        // Log it
        logToChannel(interaction.client, {
            guild: guild,
            type: "ECONOMY",
            title: success ? "Work Event: Success" : "Work Event: Failed",
            description: `**${user.username}** encountered: ${event.title}`,
            fields: [
                { name: "Choice", value: choice.label, inline: true },
                { name: "Earnings", value: fmtCurrency(earnings), inline: true }
            ],
            thumbnail: user.displayAvatarURL(),
            color: success ? 0x2ECC71 : 0xE74C3C
        });

    }


    // Removed Job Actions as per user request


    else if (customId.startsWith("promote_confirm_")) {
        if (!await ensureDeferredEphemeralReply(interaction)) return;

        try {
            const nextJobId = customId.replace("promote_confirm_", "");
            // Import Job Service Safely
            let jobService;
            try {
                jobService = require("../services/jobService");
            } catch (err) {
                console.error("Failed to require jobService:", err);
                return safeEditReply(interaction, { content: "System Error: Job Service unavailable." });
            }

            const { getJob, getJobAction } = jobService;
            const nextJob = getJob(nextJobId);

            if (!nextJob) {
                return safeEditReply(interaction, { content: `Error: Job definition for '${nextJobId}' not found.` });
            }

            // Fetch config if not already available in this scope
                        const prefix = await getGuildPrefix(guild.id);
            

            // DO NOT AUTO PROMOTE. Tell user to apply.
            const embed = new EmbedBuilder()
                .setTitle(`🎉 Promotion Eligibility Confirmed!`)
                .setDescription(`You have met the requirements for **${nextJob.title}**!`)
                .addFields(
                    { name: "Next Step", value: `To officially secure this position, you must pass the application process.\n\nType the following command:` },
                    { name: "Command", value: `\`${prefix}apply ${nextJob.id}\`` }
                )
                .setColor("#F1C40F") // Gold
                .setThumbnail(getEmoteUrl(Mascot.Emotes.Success));

            await safeEditReply(interaction, { embeds: [embed] });

        } catch (err: any) {
            console.error("Promotion Error:", err);
            await safeEditReply(interaction, { content: `Error: ${err.message}` });
        }
    }
    else if (customId === "work_shift") {
        // Defer immediately to prevent timeout (Unknown Interaction)
        // We use ephemeral: false because the game is intended to be public.
        // This means validation errors will also be public, which is a necessary trade-off to prevent crashes.
        if (!await safeDeferReply(interaction)) return;

        // Import here to avoid circular dependencies if any
        const { getJob, getJobPay, checkPromotion, checkDemotion, getWorkEvent } = require("../services/jobService");
        const { getWorkGame, getWorkGameForUser } = require("../services/minigameService");
        const { getRecentIds, recordRecentId } = require("../services/jobAntiRepeat");

        const userData = await prisma.user.findUnique({
            where: { discordId: user.id },
            include: { wallet: true }
        });
        if (!userData || !userData.jobId) {
            await interaction.deleteReply().catch(() => { });
            return safeFollowUp(interaction, { content: "You don't have a job!", flags: MessageFlags.Ephemeral });
        }

        const job = getJob(userData.jobId);
        if (!job) {
            await interaction.deleteReply().catch(() => { });
            return safeFollowUp(interaction, { content: "Invalid job.", flags: MessageFlags.Ephemeral });
        }

        // Gear check — required equipment must be owned and not broken before shift proceeds
        const gearKey = getRequiredGearKey(job.sector);
        let gearInvRow: { id: string; amount: number; meta: any } | null = null;
        let gearCatalogName = "";
        if (gearKey) {
            await seedJobShop(guild.id);
            const gearCatalogItem = JOB_SHOP_CATALOG.find(i => i.key === gearKey);
            if (gearCatalogItem) {
                gearCatalogName = gearCatalogItem.name;
                const gearInDb = await prisma.shopItem.findFirst({
                    where: globalCatalogGuildFilter({
                        name: { equals: gearCatalogItem.name, mode: "insensitive" },
                    }),
                });
                const invRow = gearInDb
                    ? await prisma.inventory.findUnique({
                        where: { userId_shopItemId: { userId: userData.discordId, shopItemId: gearInDb.id } }
                    })
                    : null;
                if (!invRow || invRow.amount < 1) {
                    const sectorDisplay = job.sector.charAt(0).toUpperCase() + job.sector.slice(1);
                    await interaction.deleteReply().catch(() => { });
                    return safeFollowUp(interaction, {
                        content: `You need a **${gearCatalogItem.name}** to work ${sectorDisplay} jobs. Buy it from the Job Store (\`!shop job\`).`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
                const durability = (invRow.meta as any)?.durability ?? 100;
                if (durability <= 0) {
                    await interaction.deleteReply().catch(() => { });
                    return safeFollowUp(interaction, {
                        content: `Your **${gearCatalogItem.name}** is broken (0/100). Use a **Repair Coupon** before working.`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
                gearInvRow = { id: invRow.id, amount: invRow.amount, meta: invRow.meta };
            }
        }

        // Cooldown check
        const prefix = await getGuildPrefix(guild.id);

        // Check Wallet Limit Check BEFORE shift starts
        if (MAX_SAFE_BALANCE && userData.wallet && userData.wallet.balance >= MAX_SAFE_BALANCE) {
            await interaction.deleteReply().catch(() => { });
            return safeFollowUp(interaction, { content: `${Mascot.Emotes.Fail} Your wallet is full! Deposit money to the bank before working.`, flags: MessageFlags.Ephemeral });
        }

        const cooldownSeconds = 3600;

        // Check Active Effects (Permanent Buffs)
        const activeEffects = await prisma.activeEffect.findMany({
            where: {
                userId: userData.discordId,
                effectType: { in: ["COOLDOWN_REDUCTION", "PAY_MULTIPLIER"] },
                OR: [
                    { expiresAt: { gt: new Date() } },
                    { expiresAt: null }
                ]
            }
        });

        let cooldownRed = 0;
        let payMult = 0;

        for (const eff of activeEffects) {
            if (eff.effectType === "COOLDOWN_REDUCTION") cooldownRed += (eff.value || 0);
            if (eff.effectType === "PAY_MULTIPLIER") payMult += (eff.value || 0);
        }

        const lastShift = userData.lastShift ? new Date(userData.lastShift).getTime() : 0;
        const now = Date.now();

        // Apply Reductions
        const finalCooldown = Math.max(0, cooldownSeconds - cooldownRed);
        const cooldownMs = finalCooldown * 1000;

        const { isTester: _isTesterWork } = require("../utils/developerAccess");
        if (now - lastShift < cooldownMs && !_isTesterWork(user.id, interaction.member)) {
            const canWorkAt = Math.floor((lastShift + cooldownMs) / 1000);
            await interaction.deleteReply().catch(() => { });
            return safeFollowUp(interaction, { content: `${Mascot.Emotes.Angry} You are tired! You can work again <t:${canWorkAt}:R>.`, flags: MessageFlags.Ephemeral });
        }

        // --- STRESS CHECK ---
        const isBurnoutImmune = userData.jobId === "med_chief";
        if (userData.jobStress > 80 && !isBurnoutImmune) {
            // High stress! Risk of burnout.
            if (Math.random() < 0.5) {
                // BURNOUT!
                await prisma.user.update({
                    where: { discordId: userData.discordId },
                    data: {
                        lastShift: new Date(),
                        jobStress: { increment: 5 } // Even more stress
                    }
                });

                

                const burnoutEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Alert} BURNOUT!`)
                    .setDescription(`You are too stressed to work well! You collapsed from exhaustion.\n\n**Stress Level:** ${userData.jobStress}/100\n\nUse \`${prefix}relax\` to recover before working again.`)
                    .setColor("#E74C3C")
                    .setThumbnail(getEmoteUrl(Mascot.Emotes.Fail));

                await interaction.deleteReply().catch(() => { });
                return safeFollowUp(interaction, { embeds: [burnoutEmbed], flags: MessageFlags.Ephemeral });
            }
        }

        // --- WORK EVENT CHECK ---
        // Overtime Contract increases event chance to 60%
        const overtimeFlagData = await redisService.get<{ gearRisk: boolean }>(`overtime_active:${user.id}`);
        const { getSectorReputation: _getRepForEvent } = require("../services/jobReputationService");
        const _repForEvent = await _getRepForEvent(user.id, job.sector);
        const eventChance = (overtimeFlagData?.gearRisk ? 0.60 : 0.30) + _repForEvent.tier.eventChanceBonus;

        const recentEventIds = await getRecentIds(user.id, "event");
        if (Math.random() < eventChance) {
            const event = getWorkEvent(job.sector, recentEventIds);
            if (event) {
                const evEmbed = new EmbedBuilder()
                    .setTitle(event.title)
                    .setDescription(event.description)
                    .setColor("#E67E22") // Orange
                    .setThumbnail(getEmoteUrl(Mascot.Emotes.Think))
                    .setFooter({ text: "Choose wisely..." });

                const rows = event.choices.map((c: any, idx: number) =>
                    new ButtonBuilder().setCustomId(`work_event_choice_${event.id}_${idx}`).setLabel(c.label).setStyle(
                        c.style === 'success' ? ButtonStyle.Success :
                            c.style === 'danger' ? ButtonStyle.Danger :
                                c.style === 'primary' ? ButtonStyle.Primary : ButtonStyle.Secondary
                    )
                );

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(rows);

                await recordRecentId(user.id, "event", event.id);
                return safeEditReply(interaction, { embeds: [evEmbed], components: [row] });
            }
        }

        const game = await getWorkGameForUser(job.sector, user.id);

        // --- PREVIEW LOGIC ---
        let reply: any;
        let isWin = false;
        let userMessage: Message | null = null;

        const embed = new EmbedBuilder()
            .setTitle(game.title)
            .setDescription(`${game.description}\n\nYou have **${game.time}** seconds!`)
            .setColor("#3498DB"); // Blue

        if (game.previewTime && game.previewTime > 0) {
            // Show Preview
            const previewEmbed = new EmbedBuilder()
                .setTitle(game.title)
                .setDescription(game.previewText || game.description)
                .setColor("#3498DB")
                .setFooter({ text: `Memorize this for ${game.previewTime} seconds!` });

            reply = await safeEditReply(interaction, { embeds: [previewEmbed] });

            // Wait
            await new Promise(resolve => setTimeout(resolve, game.previewTime! * 1000));

            // Update to Question
            await safeEditReply(interaction, { embeds: [embed] });
        }

        // --- BUTTON GAME ---
        if (game.type === "button") {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                game.options!.map((opt: string, i: number) =>
                    new ButtonBuilder()
                        .setCustomId(`work_game_${i}_${opt}`)
                        .setLabel(opt)
                        .setStyle(ButtonStyle.Primary)
                )
            );

            // Since we already deferred, we always use editReply
            // If reply was set by preview logic, we edit.
            // If not set, we still edit the deferred message.
            await safeEditReply(interaction, { embeds: [embed], components: [row] });

            try {
                reply = await interaction.fetchReply();

                const i = await reply.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: game.time * 1000,
                    filter: (i: any) => i.user.id === user.id
                });

                const selected = i.customId.split('_').slice(3).join('_'); // work_game_0_Answer -> Answer
                isWin = selected === game.answer;
                await i.deferUpdate(); // Acknowledge button
            } catch (e) {
                isWin = false; // Timeout
            }
        }
        // --- TYPING GAME ---
        else {
            // TYPING GAME
            // We just edit the embed to show the question
            reply = await safeEditReply(interaction, { embeds: [embed], components: [] });

            if (interaction.channel) {
                try {
                    // We listen to the channel the interaction happened in
                    const collected = await (interaction.channel as TextChannel).awaitMessages({
                        filter: (m: Message) => m.author.id === user.id,
                        max: 1,
                        time: game.time * 1000,
                        errors: ['time']
                    });

                    const msg = collected.first();
                    if (msg) {
                        userMessage = msg;
                        isWin = msg.content.trim() === game.answer;
                    }
                } catch (e) {
                    isWin = false;
                }
            }
        }

        // --- Emergency Pager: redirect one shift failure ---
        if (!isWin) {
            const pagerData = await redisService.get<{ active: boolean }>(`emergency_pager:${user.id}`);
            if (pagerData?.active) {
                await redisService.del(`emergency_pager:${user.id}`);
                isWin = true;
            }
        }

        // --- RESULT ---
        if (isWin) {
            // Streak Logic
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const TWO_DAYS = 48 * 60 * 60 * 1000; // 48h buffer to keep streak
            const timeSinceLast = now - lastShift;

            let newStreak = userData.jobStreak;
            if (timeSinceLast > TWO_DAYS) {
                newStreak = 1; // Reset
            } else if (timeSinceLast > ONE_DAY || newStreak === 0) {
                // First shift ever or > 24h since last
                newStreak += 1;
            }
            // else: same day, streak maintained but not increased

            // Payout Calculation
            let amount = await getJobPay(job, guild.id);

            // Apply Gear Bonus
            const gearBonus = Math.floor(amount * payMult);
            amount += gearBonus;

            // Apply Streak Bonus (max 50%)
            const streakBonusPct = Math.min(50, (newStreak - 1) * 5); // 5% per day
            const streakBonus = Math.floor(amount * (streakBonusPct / 100));
            amount += streakBonus;

            // Apply Counterfeit Kit buff if active
            const counterfeitMult = await checkCounterfeitKit(user.id);
            if (counterfeitMult > 1) amount = Math.floor(amount * counterfeitMult);

            // Apply Crown of Greed and Devil Contract income modifiers
            const crownMult = await checkCrownOfGreed(user.id);
            const devilReduction = await checkDevilContract(user.id);
            if (crownMult !== 1) amount = Math.floor(amount * crownMult);
            if (devilReduction !== 1) amount = Math.floor(amount * devilReduction);

            // Fetch current sector reputation (BEFORE granting +5 so current tier applies to this shift)
            const { getSectorReputation: _getShiftRep, addSectorReputation: _addShiftRep } = require("../services/jobReputationService");
            const shiftRepData = await _getShiftRep(user.id, job.sector);
            amount = Math.floor(amount * shiftRepData.tier.payBonus);
            const repStressReduction = shiftRepData.tier.stressReduction;
            const repGearWearReduction = shiftRepData.tier.gearWearReduction;

            // --- Job Store item effects ---
            const jobEffectNotes: string[] = [];

            // Focus Headphones: 2x XP for next N shifts
            const focusData = await redisService.get<{ shiftsLeft: number; xpMult: number }>(`focus_headphones:${user.id}`);
            let xpGain = 10;
            if (focusData && focusData.shiftsLeft > 0) {
                xpGain = Math.floor(10 * focusData.xpMult);
                const remaining = focusData.shiftsLeft - 1;
                if (remaining <= 0) {
                    await redisService.del(`focus_headphones:${user.id}`);
                } else {
                    const ttl = await redisService.getInstance().ttl(`focus_headphones:${user.id}`);
                    if (ttl > 0) await redisService.set(`focus_headphones:${user.id}`, { ...focusData, shiftsLeft: remaining }, ttl);
                }
                jobEffectNotes.push(`Focus Headphones: +${xpGain} XP (${remaining} shifts left)`);
            }

            // Premium Tools Oil flag — consumed only when gear wear is calculated below
            const oilData = await redisService.get<{ shiftsLeft: number }>(`tools_oil:${user.id}`);

            // Lucky Tie: +10% payout bonus on this shift
            const tieData = await redisService.get<{ active: boolean }>(`lucky_tie:${user.id}`);
            if (tieData?.active) {
                const tieBonus = Math.floor(amount * 0.10);
                amount += tieBonus;
                jobEffectNotes.push(`Lucky Tie: +${fmtCurrency(tieBonus)} bonus`);
            }

            // Corporate Blessing: 40% chance of 2-3x payout; on fail +25 stress and extra gear wear
            let corporateBlessingFailed = false;
            const blessingData = await redisService.get<{ active: boolean }>(`corporate_blessing:${user.id}`);
            if (blessingData?.active) {
                await redisService.del(`corporate_blessing:${user.id}`);
                if (Math.random() < 0.40) {
                    const mult = 2 + Math.random();
                    amount = Math.floor(amount * mult);
                    jobEffectNotes.push(`Corporate Blessing: Massive payout! (${mult.toFixed(1)}x)`);
                } else {
                    // Failure: +25 stress, amount unchanged, plus durability damage below
                    corporateBlessingFailed = true;
                    await prisma.user.update({ where: { discordId: user.id }, data: { jobStress: { increment: 25 } } });
                    jobEffectNotes.push(`Corporate Blessing: Failed — +25 stress and extra gear wear`);
                }
            }

            // Overtime Contract flag — consumed in gear wear block below
            const overtimeData = await redisService.get<{ gearRisk: boolean }>(`overtime_active:${user.id}`);

            // Check Wallet Limit (Double check before payout)
            let walletFull = false;
            // userData.wallet is available from the earlier fetch (if we passed it down, but we are in the same scope?
            // Yes, userData is defined at line 501 in the `work_shift` block.
            // Wait, loop back: `userData` at line 501 includes wallet now due to my previous edit?
            // YES.
            if (MAX_SAFE_BALANCE && userData.wallet && userData.wallet.balance + amount > MAX_SAFE_BALANCE) {
                amount = 0;
                walletFull = true;
            }

            // Update User
            await prisma.user.update({
                where: { discordId: user.id },
                data: {
                    wallet: { update: { balance: { increment: amount } } },
                    shiftsWorked: { increment: 1 },
                    jobXp: { increment: xpGain },
                    jobStress: { increment: Math.max(0, 5 - repStressReduction) }, // +5 base, reduced by rep tier
                    jobStreak: newStreak,
                    lastShift: new Date(),
                    jobFailStreak: 0 // Reset fail streak on success
                }
            });

            // Grant reputation AFTER DB write — takes effect on the NEXT shift
            const shiftRepResult = await _addShiftRep(user.id, job.sector, 5, "shift_success");
            if (shiftRepResult.tierChanged) {
                jobEffectNotes.push(`Reputation: **${shiftRepResult.tier.name}** tier reached! (${shiftRepResult.after} rep)`);
            } else {
                jobEffectNotes.push(`Reputation: +5 (${shiftRepResult.after} — ${shiftRepResult.tier.name})`);
            }

            // Check Promotion using actual xpGain (may be boosted by Focus Headphones)
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + xpGain, shiftsWorked: userData.shiftsWorked + 1 }, guild.id);

            // Apply income tax on work shift payout
            const { applyIncomeTax } = await import("../services/taxService");
            const workTax = walletFull ? { net: 0, taxPaid: 0, shielded: false } : await applyIncomeTax(user.id, amount);

            let earningsText = `${fmtCurrency(amount)}\n(Base Pay + ${streakBonusPct}% Streak Bonus)`;
            if (walletFull) {
                earningsText = `~~${fmtCurrency(amount)}~~ 0\n(⚠️ Wallet Limit Reached)`;
            }
            // --- Gear durability wear ---
            if (gearInvRow && gearCatalogName) {
                const currentDurability = (gearInvRow.meta as any)?.durability ?? 100;

                // Base wear: 5-12 per successful shift, reduced by rep tier
                let totalWear = Math.max(0, (5 + Math.floor(Math.random() * 8)) - repGearWearReduction);

                // Overtime Contract: extra 15-30 wear
                if (overtimeData?.gearRisk) {
                    await redisService.del(`overtime_active:${user.id}`);
                    totalWear += 15 + Math.floor(Math.random() * 16);
                }

                // Corporate Blessing failure: extra 20-35 wear
                if (corporateBlessingFailed) {
                    totalWear += 20 + Math.floor(Math.random() * 16);
                }

                // Premium Tools Oil: halve wear, consume a shift
                if (oilData && oilData.shiftsLeft > 0) {
                    totalWear = Math.ceil(totalWear / 2);
                    const oilRemaining = oilData.shiftsLeft - 1;
                    if (oilRemaining <= 0) {
                        await redisService.del(`tools_oil:${user.id}`);
                    } else {
                        const oilTtl = await redisService.getInstance().ttl(`tools_oil:${user.id}`);
                        if (oilTtl > 0) await redisService.set(`tools_oil:${user.id}`, { shiftsLeft: oilRemaining }, oilTtl);
                    }
                    jobEffectNotes.push(`Premium Tools Oil: reduced gear wear (${oilRemaining} shifts left)`);
                }

                // Warranty Card: if wear would bring durability to 0, block all wear
                const projectedDurability = currentDurability - totalWear;
                const warrantyData = await redisService.get<{ active: boolean }>(`warranty_card:${user.id}`);
                if (projectedDurability <= 0 && warrantyData?.active) {
                    await redisService.del(`warranty_card:${user.id}`);
                    jobEffectNotes.push(`Warranty Card protected your **${gearCatalogName}** from breaking`);
                    totalWear = 0;
                }

                if (totalWear > 0) {
                    const newDurability = Math.max(0, currentDurability - totalWear);
                    await prisma.inventory.update({
                        where: { id: gearInvRow.id },
                        data: { meta: { ...((gearInvRow.meta as any) ?? {}), durability: newDurability } },
                    });
                    if (newDurability <= 0) {
                        jobEffectNotes.push(`**Gear Broken:** ${gearCatalogName} hit 0/100 — use a Repair Coupon before next shift`);
                    } else {
                        jobEffectNotes.push(`Gear Wear: ${gearCatalogName} -${totalWear} durability (${newDurability}/100)`);
                    }
                }
            }

            if (jobEffectNotes.length > 0) {
                earningsText += `\n${jobEffectNotes.map(n => `- ${n}`).join("\n")}`;
            }

            const winEmbed = new EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.JobWorking} Shift Complete`)
                .setDescription(`Great work! You finished your shift as a **${job.title}**.\n\n**Earnings:** ${earningsText}\n\n**XP Gained:** +${xpGain}\n**Stress:** +5`)
                .setColor("#2ECC71");

            if (!walletFull) {
                winEmbed.addFields(workTax.shielded
                    ? { name: "Tax", value: "🛡️ Shielded", inline: true }
                    : { name: "Tax (8%)", value: `-${fmtCurrency(workTax.taxPaid)}`, inline: true }
                );
            }

            if (newStreak > 1) {
                winEmbed.addFields({ name: "Job Streak", value: `${newStreak} Days`, inline: true });
            }

            const rows: ActionRowBuilder<ButtonBuilder>[] = [];

            if (promoCheck.eligible && promoCheck.nextJob) {
                winEmbed.addFields({ name: `${Mascot.Emotes.JobPromotion} Promotion Available!`, value: `You are ready for **${promoCheck.nextJob.title}**! Click **Promote** below.` });
                winEmbed.setColor("#F1C40F");

                rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`work_promote_${promoCheck.nextJob.id}`)
                        .setLabel(`Promote → ${promoCheck.nextJob.title}`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(Mascot.Emotes.JobPromotion)
                ));
            } else if (promoCheck.nextJob) {
                const shiftParts: string[] = [];
                if (promoCheck.missingXp > 0) shiftParts.push(`${promoCheck.missingXp} XP`);
                if (promoCheck.missingShifts > 0) shiftParts.push(`${promoCheck.missingShifts} shifts`);
                winEmbed.setFooter({ text: `Progress to ${promoCheck.nextJob.title}: need ${shiftParts.join(", ")}` });
            }

            // Disable buttons on the original game embed
            await safeEditReply(interaction, { components: [] });

            // Create Work Log
            await prisma.workLog.create({
                data: {
                    userId: userData.discordId,
                    jobId: userData.jobId!,
                    shiftType: game.type,
                    success: true,
                    earnings: amount
                }
            });

            // Log Success
            logToChannel(interaction.client, {
                guild: guild,
                type: "ECONOMY",
                title: "Work Shift: Complete",
                description: `**${user.username}** finished a shift as **${job.title}**.`,
                fields: [
                    { name: "User", value: `<@${user.id}>`, inline: true },
                    { name: "Earnings", value: fmtCurrency(amount), inline: true },
                    { name: "Job", value: job.title, inline: true },
                    { name: "Streak", value: `${newStreak}`, inline: true }
                ],
                thumbnail: user.displayAvatarURL(),
                color: 0x2ECC71
            });

            // Update Quest Progress
            questBus.emit("work:complete", { discordId: userData.discordId });

            if (userMessage) {
                await (userMessage as Message).reply({ embeds: [winEmbed], components: rows });
            } else {
                await safeFollowUp(interaction, { embeds: [winEmbed], components: rows });
            }

        } else {
            // FAILED
            await prisma.user.update({
                where: { discordId: user.id },
                data: {
                    lastShift: new Date(), // Trigger cooldown
                    jobXp: { decrement: 5 }, // -5 XP
                    jobStress: Math.min(100, (userData.jobStress || 0) + 10) // +10 Stress, capped at 100
                }
            });

            // Check Demotion (uses 3-strike consecutive failure system)
            const prevJobTitleFail = getJob(userData.jobId)?.title ?? "Previous Role";
            const demoCheck = await checkDemotion(userData);

            const desc = `You messed up the task!\n\n**Correct Answer:** ${game.answer}\n\n**Penalty:**\n- No Pay\n- **-5 Job XP**\n- **+10 Stress**\n\nCome back in **${cooldownSeconds > 0 ? formatDuration(cooldownMs) : "a moment"}**.`;

            const failEmbed = new EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.Fail} Shift Failed`)
                .setDescription(desc)
                .setColor("#E74C3C");

            if (demoCheck.demoted) {
                failEmbed.addFields({
                    name: "🚨 Demoted",
                    value: `**${prevJobTitleFail}** → **${demoCheck.prevJob?.title ?? "previous role"}**\n${demoCheck.msg}`,
                });
            } else if (demoCheck.msg) {
                failEmbed.addFields({ name: "⚠️ Warning", value: demoCheck.msg });
            }

            // Disable buttons on the original game embed
            await safeEditReply(interaction, { components: [] });

            // Create Work Log
            await prisma.workLog.create({
                data: {
                    userId: userData.discordId,
                    jobId: userData.jobId!,
                    shiftType: game.type,
                    success: false,
                    earnings: 0
                }
            });

            // Log Failure
            logToChannel(interaction.client, {
                guild: guild,
                type: "ECONOMY",
                title: "Work Shift: Failed",
                description: `**${user.username}** failed their shift as **${job.title}**.`,
                fields: [
                    { name: "User", value: `<@${user.id}>`, inline: true },
                    { name: "Penalty", value: "No Pay", inline: true },
                    { name: "Job", value: job.title, inline: true }
                ],
                thumbnail: user.displayAvatarURL(),
                color: 0xE74C3C
            });

            if (userMessage) {
                await (userMessage as Message).reply({ embeds: [failEmbed] });
            } else {
                await safeFollowUp(interaction, { embeds: [failEmbed] });
            }
        }
    }
}
