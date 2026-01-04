"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLifeInteraction = handleLifeInteraction;
const discord_js_1 = require("discord.js");
const educationService_1 = require("../services/educationService");
const guildConfigService_1 = require("../services/guildConfigService");
const format_1 = require("../utils/format");
const branding_1 = require("../config/branding");
const prisma_1 = __importDefault(require("../utils/prisma"));
const discordLogger_1 = require("../utils/discordLogger");
const questService_1 = require("../services/questService");
async function handleLifeInteraction(interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
}
async function handleButton(interaction) {
    const { customId, user, guild } = interaction;
    if (!guild)
        return;
    if (customId.startsWith("enroll_confirm_")) {
        const parts = customId.split("_");
        // format: enroll_confirm_degreeId_userId
        // parts: ['enroll', 'confirm', degreeId, userId]
        // Backwards compatibility handling or robust parsing
        const degreeId = parts[2];
        const targetUserId = parts[3];
        if (targetUserId && targetUserId !== user.id) {
            return interaction.reply({ content: `${branding_1.Mascot.Emotes.Fail} This interaction is not for you.`, ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false });
        try {
            const result = await (0, educationService_1.enroll)(user.id, guild.id, degreeId);
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setTitle(`${branding_1.Mascot.Emotes.Accept} Enrollment Successful`)
                .setDescription(`You have successfully enrolled in **${result.degree.name}**!`)
                .addFields({ name: "Tuition Paid", value: (0, format_1.fmtCurrency)(result.degree.tuitionPerSem, config.currencyEmoji) })
                .setColor("#2ECC71");
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Enrollment Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("claim_scholarship_")) {
        const milestone = parseInt(customId.replace("claim_scholarship_", ""));
        await interaction.deferReply({ ephemeral: true });
        try {
            const amount = await (0, educationService_1.claimScholarship)(user.id, guild.id, milestone);
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.MoneyBag} Scholarship Claimed!`)
                .setDescription(`You have successfully claimed your scholarship of **${(0, format_1.fmtCurrency)(amount, config.currencyEmoji)}** for reaching Meritfull Performance **${milestone}.0**!`)
                .setColor("#F1C40F");
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Claim Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("stress_")) {
        const activity = customId.replace("stress_", "");
        // Check if stress is already 0
        const userData = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
            include: { currentEducation: true }
        });
        if (userData?.currentEducation && userData.currentEducation.stress <= 0) {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Think} No Stress Detected`)
                .setDescription("You are currently stress free! Why not try studying instead?")
                .setColor("#2ECC71");
            const thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
            if (thumbUrl)
                embed.setThumbnail(thumbUrl);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        try {
            const cost = await (0, educationService_1.getStressCost)(user.id, guild.id, activity);
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`Confirm ${activity.charAt(0).toUpperCase() + activity.slice(1)}`)
                .setDescription(`Do you want to spend **${(0, format_1.fmtCurrency)(cost, config.currencyEmoji)}** to reduce stress?`)
                .setColor("#3498DB");
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId(`confirm_stress_${activity}`).setLabel("Confirm").setStyle(discord_js_1.ButtonStyle.Success).setEmoji(branding_1.Mascot.Emotes.Accept), new discord_js_1.ButtonBuilder().setCustomId("cancel_stress").setLabel("Cancel").setStyle(discord_js_1.ButtonStyle.Danger).setEmoji(branding_1.Mascot.Emotes.Decline));
            await interaction.editReply({ embeds: [embed], components: [row] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Error**: ${err.message}` });
        }
    }
    else if (customId.startsWith("confirm_stress_")) {
        const activity = customId.replace("confirm_stress_", "");
        // Defer update to replace the confirmation message
        await interaction.deferUpdate();
        try {
            const { reduceJobStress } = require("../services/jobService");
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id); // Fetch config for currency
            const res = await reduceJobStress(user.id, guild.id, activity);
            let thumb = "";
            switch (activity) {
                case "sports":
                    thumb = branding_1.Mascot.Emotes.Sports;
                    break;
                case "gym":
                    thumb = branding_1.Mascot.Emotes.Gym;
                    break;
                case "meditation":
                    thumb = branding_1.Mascot.Emotes.Meditation;
                    break;
            }
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("Stress Relieved")
                .setDescription(`**${activity.charAt(0).toUpperCase() + activity.slice(1)}** relieved your stress!\nStress: **${res.newStress}/100** (-${res.reduction})\nPaid: **${(0, format_1.fmtCurrency)(res.cost, config.currencyEmoji)}**`)
                .setColor("#2ECC71");
            const thumbUrl = (0, branding_1.getEmoteUrl)(thumb);
            if (thumbUrl)
                embed.setThumbnail(thumbUrl);
            await interaction.editReply({ embeds: [embed], components: [] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Activity Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "cancel_stress") {
        await interaction.update({ content: `${branding_1.Mascot.Emotes.Decline} Activity cancelled.`, embeds: [], components: [] });
    }
    else if (customId === "dropout_confirm") {
        await interaction.deferUpdate();
        try {
            const res = await (0, educationService_1.dropout)(user.id, guild.id);
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Shocked} Dropped Out`)
                .setDescription(`You have dropped out of **${res.degreeName}**.\n\nYour tuition fees are non-refundable. You are now free to enroll in another program.`)
                .setColor("#E74C3C")
                .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Shocked));
            await interaction.editReply({ embeds: [embed], components: [] });
        }
        catch (err) {
            await interaction.editReply({ content: `${branding_1.Mascot.Emotes.Fail} **Dropout Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "dropout_cancel") {
        await interaction.update({ content: `${branding_1.Mascot.Emotes.Decline} Dropout cancelled. Phew!`, embeds: [], components: [] });
    }
    // JOB HANDLERS
    else if (customId === "work_resign") {
        await interaction.deferReply({ ephemeral: true });
        const shockedUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Shocked);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.Alert} Confirm Resignation`)
            .setDescription("Are you sure you want to resign from your job?\n\n**You will lose:**\n- Your current job title\n- Job XP progress\n- Current shift streak")
            .setColor("#E74C3C")
            .setFooter({ text: "This action cannot be undone." });
        if (shockedUrl)
            embed.setThumbnail(shockedUrl);
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("work_resign_confirm").setLabel("Confirm Resignation").setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId("work_resign_cancel").setLabel("Cancel").setStyle(discord_js_1.ButtonStyle.Secondary));
        await interaction.editReply({ embeds: [embed], components: [row] });
    }
    else if (customId === "work_resign_confirm") {
        await interaction.deferUpdate();
        try {
            await prisma_1.default.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: { jobId: null, jobXp: 0, shiftsWorked: 0, lastShift: null }
            });
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Shocked} Resignation Processed`)
                .setDescription("**You have resigned.**\n\nYou are now unemployed. Your career progress has been reset.")
                .setColor("#95A5A6");
            await interaction.editReply({ embeds: [embed], components: [] });
            // Log resignation
            (0, discordLogger_1.logToChannel)(interaction.client, {
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
        }
        catch (e) {
            await interaction.editReply({ content: `Error: ${e.message}`, components: [] });
        }
    }
    else if (customId === "work_resign_cancel") {
        await interaction.update({ content: `${branding_1.Mascot.Emotes.Success} Cancelled resignation. Get back to work!`, embeds: [], components: [] });
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
        const event = WORK_EVENTS.find((e) => e.id === targetEventId);
        if (!event) {
            return interaction.update({ content: "Event expired or invalid.", embeds: [], components: [] });
        }
        const choice = event.choices[choiceIdx];
        const success = Math.random() * 100 < choice.successChance;
        await interaction.deferUpdate();
        const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
        const userData = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId: guild.id } } });
        if (!userData || !userData.jobId)
            return;
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
        }
        else {
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
            }
            else {
                earnings = 0;
                xpGain = -5;
                stressGain = (stress || 10) + 15; // Extra stress (Total 25+)
                msg += `\n(Penalty: No Pay, -5 XP, +${stressGain} Stress)`;
            }
        }
        // Apply to DB
        await prisma_1.default.user.update({
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
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + xpGain });
            if (promoCheck.eligible && promoCheck.nextJob) {
                // Determine if we show celebration or just footer
                // Let's just note it for now, implementation plan says Celebration later
                footerText = `🎉 Promotion Available: ${promoCheck.nextJob.title}`;
            }
            else if (promoCheck.nextJob) {
                footerText = `Next Job: ${promoCheck.nextJob.title} (${promoCheck.missingXp} XP to go)`;
            }
        }
        // Demotion
        if (xpGain < 0) {
            const demoCheck = await checkDemotion({ ...userData, jobXp: userData.jobXp + xpGain });
            if (demoCheck.demoted) {
                msg += `\n\n🚨 **DEMOTED** to ${demoCheck.prevJob?.title}`;
            }
        }
        const resEmbed = new discord_js_1.EmbedBuilder()
            .setTitle(success ? `${branding_1.Mascot.Emotes.Success} Event Resolved` : `${branding_1.Mascot.Emotes.Fail} Event Failed`)
            .setDescription(`**${choice.label}**\n${msg}\n\n**Result:**\n${branding_1.Mascot.Emotes.MoneyBag} ${(0, format_1.fmtCurrency)(earnings, config.currencyEmoji)}\nXP: ${xpGain > 0 ? '+' : ''}${xpGain}\n${branding_1.Mascot.Emotes.Alert} +${stressGain} Stress`)
            .setColor(color);
        const eventRows = [];
        if (xpGain > 0) {
            // Re-check promotion to get the object
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + xpGain });
            if (promoCheck.eligible && promoCheck.nextJob) {
                resEmbed.addFields({ name: `${branding_1.Mascot.Emotes.JobPromotion} Promotion Available!`, value: `You have qualified for **${promoCheck.nextJob.title}**!` });
                resEmbed.setColor("#F1C40F");
                eventRows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setCustomId(`promote_confirm_${promoCheck.nextJob.id}`)
                    .setLabel(`Check Eligibility: ${promoCheck.nextJob.title}`)
                    .setStyle(discord_js_1.ButtonStyle.Success)
                    .setEmoji(branding_1.Mascot.Emotes.JobPromotion) // Use custom emoji for button too? Or keeps arrow? Button was "⬆️" before. User said NO DEFAULT EMOJIS.
                ));
            }
            else if (promoCheck.nextJob) {
                resEmbed.setFooter({ text: `Next Job: ${promoCheck.nextJob.title} (${promoCheck.missingXp} XP to go)` });
            }
        }
        else if (footerText) {
            resEmbed.setFooter({ text: footerText });
        }
        await interaction.editReply({ embeds: [resEmbed], components: eventRows });
        // Log it
        (0, discordLogger_1.logToChannel)(interaction.client, {
            guild: guild,
            type: "ECONOMY",
            title: success ? "Work Event: Success" : "Work Event: Failed",
            description: `**${user.username}** encountered: ${event.title}`,
            fields: [
                { name: "Choice", value: choice.label, inline: true },
                { name: "Earnings", value: (0, format_1.fmtCurrency)(earnings, config.currencyEmoji), inline: true }
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
            }
            catch (err) {
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
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`🎉 Promotion Eligibility Confirmed!`)
                .setDescription(`You have met the requirements for **${nextJob.title}**!`)
                .addFields({ name: "Next Step", value: `To officially secure this position, you must pass the application process.\n\nType the following command:` }, { name: "Command", value: `\`${prefix}apply ${nextJob.id}\`` })
                .setColor("#F1C40F") // Gold
                .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Success));
            await interaction.editReply({ embeds: [embed] });
        }
        catch (err) {
            console.error("Promotion Error:", err);
            // If already deferred, use editReply
            try {
                await interaction.editReply({ content: `Error: ${err.message}` });
            }
            catch (e) { }
        }
    }
    else if (customId === "work_shift") {
        // Import here to avoid circular dependencies if any
        const { getJob, getJobPay, checkPromotion, checkDemotion, getWorkEvent } = require("../services/jobService");
        const { getWorkGame } = require("../services/minigameService");
        const userData = await prisma_1.default.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId: guild.id } } });
        if (!userData || !userData.jobId) {
            return interaction.reply({ content: "You don't have a job!", ephemeral: true });
        }
        const job = getJob(userData.jobId);
        if (!job)
            return interaction.reply({ content: "Invalid job.", ephemeral: true });
        // Cooldown check
        const incomeConfig = await prisma_1.default.incomeConfig.findUnique({
            where: { guildId_commandKey: { guildId: guild.id, commandKey: "work" } }
        });
        // Check Active Effects (Permanent Buffs)
        const activeEffects = await prisma_1.default.activeEffect.findMany({
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
            if (eff.effectType === "COOLDOWN_REDUCTION")
                cooldownRed += (eff.value || 0);
            if (eff.effectType === "PAY_MULTIPLIER")
                payMult += (eff.value || 0);
        }
        const lastShift = userData.lastShift ? new Date(userData.lastShift).getTime() : 0;
        const now = Date.now();
        let cooldownSeconds = incomeConfig ? incomeConfig.cooldown : 0; // Default 0 if not set
        // Apply Reductions
        cooldownSeconds = Math.max(0, cooldownSeconds - cooldownRed);
        const cooldownMs = cooldownSeconds * 1000;
        if (now - lastShift < cooldownMs) {
            const remaining = Math.ceil((cooldownMs - (now - lastShift)) / 60000);
            return interaction.reply({ content: `${branding_1.Mascot.Emotes.Angry} You are tired! You can work again in **${remaining} minutes**.`, ephemeral: true });
        }
        // --- STRESS CHECK ---
        const isBurnoutImmune = userData.jobId === "med_chief";
        if (userData.jobStress > 80 && !isBurnoutImmune) {
            // High stress! Risk of burnout.
            if (Math.random() < 0.5) {
                // BURNOUT!
                await prisma_1.default.user.update({
                    where: { id: userData.id },
                    data: {
                        lastShift: new Date(),
                        jobStress: { increment: 5 } // Even more stress
                    }
                });
                const burnoutEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Alert} BURNOUT!`)
                    .setDescription(`You are too stressed to work well! You collapsed from exhaustion.\n\n**Stress Level:** ${userData.jobStress}/100\n\nUse \`!relax\` to recover before working again.`)
                    .setColor("#E74C3C")
                    .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Fail));
                return interaction.reply({ embeds: [burnoutEmbed], ephemeral: true });
            }
        }
        // --- WORK EVENT CHECK ---
        // getWorkEvent imported at block start
        // 20% Chance for Event (if not high stress burnout)
        if (Math.random() < 0.20) {
            const event = getWorkEvent(job.sector);
            if (event) {
                const evEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(event.title)
                    .setDescription(event.description)
                    .setColor("#E67E22") // Orange
                    .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think))
                    .setFooter({ text: "Choose wisely..." });
                const rows = event.choices.map((c, idx) => new discord_js_1.ButtonBuilder().setCustomId(`work_event_choice_${event.id}_${idx}`).setLabel(c.label).setStyle(c.style === 'success' ? discord_js_1.ButtonStyle.Success :
                    c.style === 'danger' ? discord_js_1.ButtonStyle.Danger :
                        c.style === 'primary' ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary));
                const row = new discord_js_1.ActionRowBuilder().addComponents(rows);
                return interaction.reply({ embeds: [evEmbed], components: [row] });
            }
        }
        const game = getWorkGame();
        // --- PREVIEW LOGIC ---
        let reply;
        let isWin = false;
        let userMessage = null;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(game.title)
            .setDescription(`${game.description}\n\nYou have **${game.time}** seconds!`)
            .setColor("#3498DB"); // Blue
        if (game.previewTime && game.previewTime > 0) {
            // Show Preview
            const previewEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(game.title)
                .setDescription(game.previewText || game.description)
                .setColor("#3498DB")
                .setFooter({ text: `Memorize this for ${game.previewTime} seconds!` });
            reply = await interaction.reply({ embeds: [previewEmbed], ephemeral: false, fetchReply: true });
            // Wait
            await new Promise(resolve => setTimeout(resolve, game.previewTime * 1000));
            // Update to Question
            await interaction.editReply({ embeds: [embed] });
        }
        // --- BUTTON GAME ---
        if (game.type === "button") {
            const row = new discord_js_1.ActionRowBuilder().addComponents(game.options.map((opt, i) => new discord_js_1.ButtonBuilder()
                .setCustomId(`work_game_${i}_${opt}`)
                .setLabel(opt)
                .setStyle(discord_js_1.ButtonStyle.Primary)));
            if (reply) {
                await interaction.editReply({ embeds: [embed], components: [row] });
            }
            else {
                reply = await interaction.reply({ embeds: [embed], components: [row], ephemeral: false, fetchReply: true });
            }
            try {
                const i = await reply.awaitMessageComponent({
                    componentType: discord_js_1.ComponentType.Button,
                    time: game.time * 1000,
                    filter: (i) => i.user.id === user.id
                });
                const selected = i.customId.split('_').slice(3).join('_'); // work_game_0_Answer -> Answer
                isWin = selected === game.answer;
                await i.deferUpdate(); // Acknowledge button
            }
            catch (e) {
                isWin = false; // Timeout
            }
        }
        // --- TYPING GAME ---
        else {
            if (reply) {
                await interaction.editReply({ embeds: [embed], components: [] });
            }
            else {
                reply = await interaction.reply({ embeds: [embed], ephemeral: false, fetchReply: true });
            }
            if (interaction.channel) {
                try {
                    // We listen to the channel the interaction happened in
                    const collected = await interaction.channel.awaitMessages({
                        filter: (m) => m.author.id === user.id,
                        max: 1,
                        time: game.time * 1000,
                        errors: ['time']
                    });
                    const msg = collected.first();
                    if (msg) {
                        userMessage = msg;
                        isWin = msg.content.trim() === game.answer;
                    }
                }
                catch (e) {
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
            }
            else if (timeSinceLast > ONE_DAY || newStreak === 0) {
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
            await prisma_1.default.user.update({
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
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + 10 });
            const config = await (0, guildConfigService_1.getGuildConfig)(guild.id);
            const winEmbed = new discord_js_1.EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${branding_1.Mascot.Emotes.JobWorking} Shift Complete`)
                .setDescription(`Great work! You finished your shift as a **${job.title}**.\n\n**Earnings:** ${(0, format_1.fmtCurrency)(amount, config?.currencyEmoji)}\n(Base Pay + ${streakBonusPct}% Streak Bonus)\n\n**XP Gained:** +10\n**Stress:** +5`)
                .setColor("#2ECC71");
            if (newStreak > 1) {
                winEmbed.addFields({ name: "Job Streak", value: `${newStreak} Days`, inline: true });
            }
            const rows = [];
            if (promoCheck.eligible && promoCheck.nextJob) {
                winEmbed.addFields({ name: `${branding_1.Mascot.Emotes.JobPromotion} Promotion Available!`, value: `You have qualified for **${promoCheck.nextJob.title}**!` });
                winEmbed.setColor("#F1C40F"); // Gold
                rows.push(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setCustomId(`promote_confirm_${promoCheck.nextJob.id}`)
                    .setLabel(`Check Eligibility: ${promoCheck.nextJob.title}`)
                    .setStyle(discord_js_1.ButtonStyle.Success)
                    .setEmoji(branding_1.Mascot.Emotes.JobPromotion)));
            }
            else if (promoCheck.nextJob) {
                winEmbed.setFooter({ text: `Next Job: ${promoCheck.nextJob.title} (Need ${promoCheck.missingXp} more XP)` });
            }
            // Disable buttons on the original game embed
            await interaction.editReply({ components: [] });
            // Create Work Log
            await prisma_1.default.workLog.create({
                data: {
                    guildId: guild.id,
                    userId: userData.id, // Use internal DB ID
                    jobId: userData.jobId,
                    shiftType: game.type,
                    success: true,
                    earnings: amount
                }
            });
            // Log Success
            (0, discordLogger_1.logToChannel)(interaction.client, {
                guild: guild,
                type: "ECONOMY",
                title: "Work Shift: Complete",
                description: `**${user.username}** finished a shift as **${job.title}**.`,
                fields: [
                    { name: "User", value: `<@${user.id}>`, inline: true },
                    { name: "Earnings", value: (0, format_1.fmtCurrency)(amount, config?.currencyEmoji), inline: true },
                    { name: "Job", value: job.title, inline: true },
                    { name: "Streak", value: `${newStreak}`, inline: true }
                ],
                thumbnail: user.displayAvatarURL(),
                color: 0x2ECC71
            });
            // Update Quest Progress
            await (0, questService_1.updateQuestProgress)(userData.id, "WORK").catch(console.error);
            if (userMessage) {
                await userMessage.reply({ embeds: [winEmbed], components: rows });
            }
            else {
                await interaction.followUp({ embeds: [winEmbed], components: rows });
            }
        }
        else {
            // FAILED
            await prisma_1.default.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: {
                    lastShift: new Date(), // Trigger cooldown
                    jobXp: { decrement: 5 }, // -5 XP
                    jobStress: Math.min(100, (userData.jobStress || 0) + 10) // +10 Stress, capped at 100
                }
            });
            // Check Demotion (using updated XP estimate)
            const demoCheck = await checkDemotion({ ...userData, jobXp: Math.max(0, userData.jobXp - 5) });
            let desc = `You messed up the task!\n\n**Correct Answer:** ${game.answer}\n\n**Penalty:**\n- No Pay\n- **-5 Job XP**\n- **+10 Stress**\n\nCome back in **${cooldownSeconds > 0 ? (0, format_1.formatDuration)(cooldownMs) : "a moment"}**.`;
            if (demoCheck.demoted) {
                desc += `\n\n${branding_1.Mascot.Emotes.Alert} **DEMOTED!**\n${demoCheck.msg}`;
            }
            const failEmbed = new discord_js_1.EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${branding_1.Mascot.Emotes.Fail} Shift Failed`)
                .setDescription(desc)
                .setColor("#E74C3C");
            // Disable buttons on the original game embed
            await interaction.editReply({ components: [] });
            // Create Work Log
            await prisma_1.default.workLog.create({
                data: {
                    guildId: guild.id,
                    userId: userData.id,
                    jobId: userData.jobId,
                    shiftType: game.type,
                    success: false,
                    earnings: 0
                }
            });
            // Log Failure
            (0, discordLogger_1.logToChannel)(interaction.client, {
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
                await userMessage.reply({ embeds: [failEmbed] });
            }
            else {
                await interaction.followUp({ embeds: [failEmbed] });
            }
        }
    }
}
//# sourceMappingURL=lifeInteractionHandler.js.map