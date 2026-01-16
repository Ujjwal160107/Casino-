import { Interaction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Message, TextChannel } from "discord.js";
import { enroll, claimScholarship, reduceStress, getStressCost, dropout } from "../services/educationService";
import { getGuildConfig } from "../services/guildConfigService";
import { fmtCurrency, formatDuration } from "../utils/format";
import { Mascot, getEmoteUrl } from "../config/branding";
import prisma from "../utils/prisma";
import { logToChannel } from "../utils/discordLogger";
import { updateQuestProgress } from "../services/questService";

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

        if (targetUserId && targetUserId !== user.id) {
            return interaction.reply({ content: `${Mascot.Emotes.Fail} This interaction is not for you.`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: false });

        try {
            const result = await enroll(user.id, guild.id, degreeId);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.Accept} Enrollment Successful`)
                .setDescription(`You have successfully enrolled in **${result.degree.name}**!`)
                .addFields({ name: "Tuition Paid", value: fmtCurrency(result.degree.tuitionPerSem, config.currencyEmoji) })
                .setColor("#2ECC71");

            await interaction.editReply({ embeds: [embed] });

        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Enrollment Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("claim_scholarship_")) {
        const milestone = parseInt(customId.replace("claim_scholarship_", ""));

        await interaction.deferReply({ ephemeral: true });

        try {
            const amount = await claimScholarship(user.id, guild.id, milestone);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.MoneyBag} Scholarship Claimed!`)
                .setDescription(`You have successfully claimed your scholarship of **${fmtCurrency(amount, config.currencyEmoji)}** for reaching Meritfull Performance **${milestone}.0**!`)
                .setColor("#F1C40F");

            await interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Claim Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("edu_stress_")) {
        const activity = customId.replace("edu_stress_", "") as "sports" | "gym" | "meditation";

        // Check if stress is already 0
        const userData = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
            include: { currentEducation: true }
        });

        if (userData?.currentEducation && userData.currentEducation.stress <= 0) {
            return interaction.reply({
                content: `${Mascot.Emotes.Think} You are currently stress free! Why not try studying instead?`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const cost = await getStressCost(user.id, guild.id, activity);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`Confirm ${activity.charAt(0).toUpperCase() + activity.slice(1)} (Education)`)
                .setDescription(`Do you want to spend **${fmtCurrency(cost, config.currencyEmoji)}** to reduce your **Education Stress**?`)
                .setColor("#3498DB");

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`confirm_edu_stress_${activity}`).setLabel("Confirm").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Accept),
                new ButtonBuilder().setCustomId("cancel_stress").setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji(Mascot.Emotes.Decline)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Error**: ${err.message}` });
        }
    }
    else if (customId.startsWith("confirm_edu_stress_")) {
        const activity = customId.replace("confirm_edu_stress_", "") as "sports" | "gym" | "meditation";
        await interaction.deferUpdate();

        try {
            const config = await getGuildConfig(guild.id);
            const res = await reduceStress(user.id, guild.id, activity);

            const embed = new EmbedBuilder()
                .setTitle("Stress Relieved (Education)")
                .setDescription(`**${activity.charAt(0).toUpperCase() + activity.slice(1)}** relieved your stress!\nStress: **${res.newStress}/100** (-${res.newStress < 0 ? 0 : 15})\nPaid: **${fmtCurrency(res.cost, config.currencyEmoji)}**`) // Note: generic calc for display, real val used logic
                // Actually the service returns the new stress and msg.
                .setDescription(res.msg)
                .setColor("#2ECC71");

            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Activity Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId.startsWith("stress_")) {
        const activity = customId.replace("stress_", "") as "sports" | "gym" | "meditation";

        // Check if stress is already 0
        const userData = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
            include: { currentEducation: true }
        });

        if (userData?.currentEducation && userData.currentEducation.stress <= 0) {
            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Think} No Stress Detected`)
                .setDescription("You are currently stress free! Why not try studying instead?")
                .setColor("#2ECC71");

            const thumbUrl = getEmoteUrl(Mascot.Emotes.Think);
            if (thumbUrl) embed.setThumbnail(thumbUrl);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const cost = await getStressCost(user.id, guild.id, activity);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`Confirm ${activity.charAt(0).toUpperCase() + activity.slice(1)}`)
                .setDescription(`Do you want to spend **${fmtCurrency(cost, config.currencyEmoji)}** to reduce stress?`)
                .setColor("#3498DB");

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`confirm_stress_${activity}`).setLabel("Confirm").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Accept),
                new ButtonBuilder().setCustomId("cancel_stress").setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji(Mascot.Emotes.Decline)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Error**: ${err.message}` });
        }
    }
    else if (customId.startsWith("confirm_stress_")) {
        const activity = customId.replace("confirm_stress_", "") as "sports" | "gym" | "meditation";

        // Defer update to replace the confirmation message
        await interaction.deferUpdate();

        try {
            const { reduceJobStress } = require("../services/jobService");
            const config = await getGuildConfig(guild.id); // Fetch config for currency
            const res = await reduceJobStress(user.id, guild.id, activity);

            let thumb = "";
            switch (activity) {
                case "sports": thumb = Mascot.Emotes.Sports; break;
                case "gym": thumb = Mascot.Emotes.Gym; break;
                case "meditation": thumb = Mascot.Emotes.Meditation; break;
            }

            const embed = new EmbedBuilder()
                .setTitle("Stress Relieved")
                .setDescription(`**${activity.charAt(0).toUpperCase() + activity.slice(1)}** relieved your stress!\nStress: **${res.newStress}/100** (-${res.reduction})\nPaid: **${fmtCurrency(res.cost, config.currencyEmoji)}**`)
                .setColor("#2ECC71");

            const thumbUrl = getEmoteUrl(thumb);
            if (thumbUrl) embed.setThumbnail(thumbUrl);

            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Activity Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "cancel_stress") {
        await interaction.update({ content: `${Mascot.Emotes.Decline} Activity cancelled.`, embeds: [], components: [] });
    }
    else if (customId === "dropout_confirm") {
        await interaction.deferUpdate();
        try {
            const res = await dropout(user.id, guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Shocked} Dropped Out`)
                .setDescription(`You have dropped out of **${res.degreeName}**.\n\nYour tuition fees are non-refundable. You are now free to enroll in another program.`)
                .setColor("#E74C3C")
                .setThumbnail(getEmoteUrl(Mascot.Emotes.Shocked));

            await interaction.editReply({ embeds: [embed], components: [] });

        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Dropout Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "dropout_cancel") {
        await interaction.update({ content: `${Mascot.Emotes.Decline} Dropout cancelled. Phew!`, embeds: [], components: [] });
    }
    // JOB HANDLERS
    else if (customId === "work_resign") {
        await interaction.deferReply({ ephemeral: true });

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

        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    else if (customId === "work_resign_confirm") {
        await interaction.deferUpdate();
        try {
            await prisma.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: { jobId: null, jobXp: 0, shiftsWorked: 0, lastShift: null }
            });

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Shocked} Resignation Processed`)
                .setDescription("**You have resigned.**\n\nYou are now unemployed. Your career progress has been reset.")
                .setColor("#95A5A6");

            await interaction.editReply({ embeds: [embed], components: [] });

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
            await interaction.editReply({ content: `Error: ${e.message}`, components: [] });
        }
    }
    else if (customId === "work_resign_cancel") {
        await interaction.update({ content: `${Mascot.Emotes.Success} Cancelled resignation. Get back to work!`, embeds: [], components: [] });
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
            return interaction.update({ content: "Event expired or invalid.", embeds: [], components: [] });
        }

        const choice = event.choices[choiceIdx];
        const success = Math.random() * 100 < choice.successChance;

        await interaction.deferUpdate();

        const config = await getGuildConfig(guild.id);
        const userData = await prisma.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId: guild.id } } });

        if (!userData || !userData.jobId) return;

        // Import job here
        const { getJob, getJobPay, checkPromotion, checkDemotion } = require("../services/jobService");
        const job = getJob(userData.jobId);
        const basePay = await getJobPay(job, guild.id);

        let msg = success ? choice.successMsg : choice.failMsg;
        let color = success ? "#2ECC71" : "#E74C3C";

        // Outcome
        const { xp = 0, money = 0, stress = 0 } = choice.outcome;

        // Apply Outcome
        let earnings = 0;
        let xpGain = 0;
        let stressGain = 0;

        if (success) {
            earnings = Math.floor(basePay * (money || 0));
            xpGain = xp || 0;
            stressGain = stress || 0;
        } else {
            // Fail usually gives stress, maybe small money? Check definitions.
            // My definitions only have one outcome object. I should maybe have successOutcome and failOutcome?
            // For now, let's assume the defined outcome is for SUCCESS, and FAIL applies penalties.
            // OR the defined outcome is applied differently?
            // "outcome: { xp: 50, money: 2.0, stress: 20 }" logic:
            // "Success chance 40%". If success -> Get outcome. If allow fail?

            // Let's refine the logic:
            // IF SUCCESS: Apply outcome as positive benefit (XP+, Money+, Stress+ (if high stress event)).
            // IF FAIL: Apply outcome as PENALTY?

            // Checking the definitions:
            // { label: "Hotfix", successChance: 40, outcome: { xp: 50, money: 2.0, stress: 20 } }
            // Logic: Success = You get +50 XP, 2.0x Pay, +20 Stress.
            // Fail = You fail. What happens? Standard fail penalty?

            // Let's standardize:
            // SUCCESS: Gain `money` * JobPay, Gain `xp`, Gain `stress`.
            // FAIL: Gain 0 Money, Lose `xp` (or 0), Gain `stress` * 2?

            if (success) {
                earnings = Math.floor(basePay * (money || 0));
                xpGain = xp || 10;
                stressGain = stress || 5;
            } else {
                earnings = 0;
                xpGain = -5;
                stressGain = (stress || 10) + 15; // Extra stress (Total 25+)
                msg += `\n(Penalty: No Pay, -5 XP, +${stressGain} Stress)`;
            }
        }

        // Apply to DB
        await prisma.user.update({
            where: { id: userData.id },
            data: {
                wallet: { update: { balance: { increment: earnings } } },
                jobXp: { increment: xpGain },
                jobStress: Math.min(100, (userData.jobStress || 0) + stressGain), // Cap at 100
                shiftsWorked: { increment: 1 },
                lastShift: new Date()
            }
        });

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

        // Demotion
        if (xpGain < 0) {
            const demoCheck = await checkDemotion({ ...userData, jobXp: userData.jobXp + xpGain });
            if (demoCheck.demoted) {
                msg += `\n\n🚨 **DEMOTED** to ${demoCheck.prevJob?.title}`;
            }
        }

        const resEmbed = new EmbedBuilder()
            .setTitle(success ? `${Mascot.Emotes.Success} Event Resolved` : `${Mascot.Emotes.Fail} Event Failed`)
            .setDescription(`**${choice.label}**\n${msg}\n\n**Result:**\n${Mascot.Emotes.MoneyBag} ${fmtCurrency(earnings, config.currencyEmoji)}\nXP: ${xpGain > 0 ? '+' : ''}${xpGain}\n${Mascot.Emotes.Alert} +${stressGain} Stress`)
            .setColor(color as any);

        const eventRows: ActionRowBuilder<ButtonBuilder>[] = [];

        if (xpGain > 0) {
            // Re-check promotion to get the object
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + xpGain, shiftsWorked: userData.shiftsWorked + 1 }, guild.id);
            if (promoCheck.eligible && promoCheck.nextJob) {
                resEmbed.addFields({ name: `${Mascot.Emotes.JobPromotion} Promotion Available!`, value: `You have qualified for **${promoCheck.nextJob.title}**!` });
                resEmbed.setColor("#F1C40F");

                eventRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`promote_confirm_${promoCheck.nextJob.id}`)
                        .setLabel(`Check Eligibility: ${promoCheck.nextJob.title}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji(Mascot.Emotes.JobPromotion)
                ));
            } else if (promoCheck.nextJob) {
                resEmbed.setFooter({ text: `Next Job: ${promoCheck.nextJob.title} (${promoCheck.missingXp} xp, ${promoCheck.missingShifts} shifts to go)` });
            }
        } else if (footerText) {
            resEmbed.setFooter({ text: footerText });
        }

        await interaction.editReply({ embeds: [resEmbed], components: eventRows });

        // Log it
        logToChannel(interaction.client, {
            guild: guild,
            type: "ECONOMY",
            title: success ? "Work Event: Success" : "Work Event: Failed",
            description: `**${user.username}** encountered: ${event.title}`,
            fields: [
                { name: "Choice", value: choice.label, inline: true },
                { name: "Earnings", value: fmtCurrency(earnings, config.currencyEmoji), inline: true }
            ],
            thumbnail: user.displayAvatarURL(),
            color: success ? 0x2ECC71 : 0xE74C3C
        });

    }


    // Removed Job Actions as per user request


    else if (customId.startsWith("promote_confirm_")) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const nextJobId = customId.replace("promote_confirm_", "");
            // Import Job Service Safely
            let jobService;
            try {
                jobService = require("../services/jobService");
            } catch (err) {
                console.error("Failed to require jobService:", err);
                return interaction.editReply({ content: "System Error: Job Service unavailable." });
            }

            const { getJob, getJobAction } = jobService;
            const nextJob = getJob(nextJobId);

            if (!nextJob) {
                return interaction.editReply({ content: `Error: Job definition for '${nextJobId}' not found.` });
            }

            // Fetch config if not already available in this scope
            const { getGuildConfig } = require("../services/guildConfigService");
            const config = await getGuildConfig(guild.id);
            const prefix = config?.prefix || "!";

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

            await interaction.editReply({ embeds: [embed] });

        } catch (err: any) {
            console.error("Promotion Error:", err);
            // If already deferred, use editReply
            try { await interaction.editReply({ content: `Error: ${err.message}` }); } catch (e) { }
        }
    }
    else if (customId === "work_shift") {
        // Defer immediately to prevent timeout (Unknown Interaction)
        // We use ephemeral: false because the game is intended to be public.
        // This means validation errors will also be public, which is a necessary trade-off to prevent crashes.
        await interaction.deferReply({ ephemeral: false });

        // Import here to avoid circular dependencies if any
        const { getJob, getJobPay, checkPromotion, checkDemotion, getWorkEvent } = require("../services/jobService");
        const { getWorkGame } = require("../services/minigameService");

        const userData = await prisma.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId: guild.id } } });
        if (!userData || !userData.jobId) {
            await interaction.deleteReply().catch(() => { });
            return interaction.followUp({ content: "You don't have a job!", ephemeral: true });
        }

        const job = getJob(userData.jobId);
        if (!job) {
            await interaction.deleteReply().catch(() => { });
            return interaction.followUp({ content: "Invalid job.", ephemeral: true });
        }

        // Cooldown check
        const config = await getGuildConfig(guild.id);
        const cooldownSeconds = config.jobCooldown ?? 3600;

        // Check Active Effects (Permanent Buffs)
        const activeEffects = await prisma.activeEffect.findMany({
            where: {
                userId: userData.id,
                guildId: guild.id,
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

        if (now - lastShift < cooldownMs) {
            const canWorkAt = Math.floor((lastShift + cooldownMs) / 1000);
            await interaction.deleteReply().catch(() => { });
            return interaction.followUp({ content: `${Mascot.Emotes.Angry} You are tired! You can work again <t:${canWorkAt}:R>.`, ephemeral: true });
        }

        // --- STRESS CHECK ---
        const isBurnoutImmune = userData.jobId === "med_chief";
        if (userData.jobStress > 80 && !isBurnoutImmune) {
            // High stress! Risk of burnout.
            if (Math.random() < 0.5) {
                // BURNOUT!
                await prisma.user.update({
                    where: { id: userData.id },
                    data: {
                        lastShift: new Date(),
                        jobStress: { increment: 5 } // Even more stress
                    }
                });

                const config = await getGuildConfig(guild.id);
                const prefix = config?.prefix || "!";

                const burnoutEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Alert} BURNOUT!`)
                    .setDescription(`You are too stressed to work well! You collapsed from exhaustion.\n\n**Stress Level:** ${userData.jobStress}/100\n\nUse \`${prefix}relax\` to recover before working again.`)
                    .setColor("#E74C3C")
                    .setThumbnail(getEmoteUrl(Mascot.Emotes.Fail));

                await interaction.deleteReply().catch(() => { });
                return interaction.followUp({ embeds: [burnoutEmbed], ephemeral: true });
            }
        }

        // --- WORK EVENT CHECK ---
        // getWorkEvent imported at block start


        // 20% Chance for Event (if not high stress burnout)
        if (Math.random() < 0.20) {
            const event = getWorkEvent(job.sector);
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

                return interaction.editReply({ embeds: [evEmbed], components: [row] });
            }
        }

        const game = getWorkGame();

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

            reply = await interaction.editReply({ embeds: [previewEmbed] }); // Removed fetchReply as editReply returns Message or boolean/APIMessage

            // Wait
            await new Promise(resolve => setTimeout(resolve, game.previewTime! * 1000));

            // Update to Question
            await interaction.editReply({ embeds: [embed] });
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
            reply = await interaction.editReply({ embeds: [embed], components: [row] });

            try {
                // If reply is not a message (failed edit?), fallback to fetchReply?
                // editReply returns Message if successful in d.js v14?
                // Actually editReply resolves to Message.
                if (!reply) reply = await interaction.fetchReply();

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
            reply = await interaction.editReply({ embeds: [embed], components: [] });

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

            // Update User
            await prisma.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: {
                    wallet: { update: { balance: { increment: amount } } },
                    shiftsWorked: { increment: 1 },
                    jobXp: { increment: 10 },
                    jobStress: { increment: 5 }, // +5 Stress on success
                    jobStreak: newStreak,
                    lastShift: new Date()
                }
            });

            // Check Promotion
            // We use the UPDATED jobXp (add 10 to current)
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + 10, shiftsWorked: userData.shiftsWorked + 1 }, guild.id);

            const config = await getGuildConfig(guild.id);
            const winEmbed = new EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.JobWorking} Shift Complete`)
                .setDescription(`Great work! You finished your shift as a **${job.title}**.\n\n**Earnings:** ${fmtCurrency(amount, config?.currencyEmoji)}\n(Base Pay + ${streakBonusPct}% Streak Bonus)\n\n**XP Gained:** +10\n**Stress:** +5`)
                .setColor("#2ECC71");

            if (newStreak > 1) {
                winEmbed.addFields({ name: "Job Streak", value: `${newStreak} Days`, inline: true });
            }

            const rows: ActionRowBuilder<ButtonBuilder>[] = [];

            if (promoCheck.eligible && promoCheck.nextJob) {
                winEmbed.addFields({ name: `${Mascot.Emotes.JobPromotion} Promotion Available!`, value: `You have qualified for **${promoCheck.nextJob.title}**!` });
                winEmbed.setColor("#F1C40F"); // Gold

                rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`promote_confirm_${promoCheck.nextJob.id}`)
                        .setLabel(`Check Eligibility: ${promoCheck.nextJob.title}`)
                        .setStyle(ButtonStyle.Success)
                        .setEmoji(Mascot.Emotes.JobPromotion)
                ));
            } else if (promoCheck.nextJob) {
                winEmbed.setFooter({ text: `Next Job: ${promoCheck.nextJob.title} (Need ${promoCheck.missingXp} xp, ${promoCheck.missingShifts} shifts)` });
            }

            // Disable buttons on the original game embed
            await interaction.editReply({ components: [] });

            // Create Work Log
            await prisma.workLog.create({
                data: {
                    guildId: guild.id,
                    userId: userData.id, // Use internal DB ID
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
                    { name: "Earnings", value: fmtCurrency(amount, config?.currencyEmoji), inline: true },
                    { name: "Job", value: job.title, inline: true },
                    { name: "Streak", value: `${newStreak}`, inline: true }
                ],
                thumbnail: user.displayAvatarURL(),
                color: 0x2ECC71
            });

            // Update Quest Progress
            await updateQuestProgress(userData.id, "WORK").catch(console.error);

            if (userMessage) {
                await (userMessage as Message).reply({ embeds: [winEmbed], components: rows });
            } else {
                await interaction.followUp({ embeds: [winEmbed], components: rows });
            }

        } else {
            // FAILED
            await prisma.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: {
                    lastShift: new Date(), // Trigger cooldown
                    jobXp: { decrement: 5 }, // -5 XP
                    jobStress: Math.min(100, (userData.jobStress || 0) + 10) // +10 Stress, capped at 100
                }
            });

            // Check Demotion (using updated XP estimate)
            const demoCheck = await checkDemotion({ ...userData, jobXp: Math.max(0, userData.jobXp - 5) });

            let desc = `You messed up the task!\n\n**Correct Answer:** ${game.answer}\n\n**Penalty:**\n- No Pay\n- **-5 Job XP**\n- **+10 Stress**\n\nCome back in **${cooldownSeconds > 0 ? formatDuration(cooldownMs) : "a moment"}**.`;

            if (demoCheck.demoted) {
                desc += `\n\n${Mascot.Emotes.Alert} **DEMOTED!**\n${demoCheck.msg}`;
            }

            const failEmbed = new EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.Fail} Shift Failed`)
                .setDescription(desc)
                .setColor("#E74C3C");

            // Disable buttons on the original game embed
            await interaction.editReply({ components: [] });

            // Create Work Log
            await prisma.workLog.create({
                data: {
                    guildId: guild.id,
                    userId: userData.id,
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
                await interaction.followUp({ embeds: [failEmbed] });
            }
        }
    }
}
