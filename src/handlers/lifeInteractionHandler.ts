import { Interaction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Message, TextChannel } from "discord.js";
import { enroll, claimScholarship, reduceStress, getStressCost, dropout } from "../services/educationService";
import { getGuildConfig } from "../services/guildConfigService";
import { fmtCurrency, formatDuration } from "../utils/format";
import { Mascot, getEmoteUrl } from "../config/branding";
import prisma from "../utils/prisma";
import { logToChannel } from "../utils/discordLogger";

export async function handleLifeInteraction(interaction: Interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
}

async function handleButton(interaction: ButtonInteraction) {
    const { customId, user, guild } = interaction;
    if (!guild) return;

    if (customId.startsWith("enroll_confirm_")) {
        const degreeId = customId.replace("enroll_confirm_", "");

        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await enroll(user.id, guild.id, degreeId);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
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
            const res = await reduceStress(user.id, guild.id, activity);

            let thumb = "";
            switch (activity) {
                case "sports": thumb = Mascot.Emotes.Sports; break;
                case "gym": thumb = Mascot.Emotes.Gym; break;
                case "meditation": thumb = Mascot.Emotes.Meditation; break;
            }

            const embed = new EmbedBuilder()
                .setTitle("Stress Relieved")
                .setDescription(res.msg)
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
    else if (customId === "work_shift") {
        // Import here to avoid circular dependencies if any
        const { getJob, getJobPay, checkPromotion, checkDemotion } = require("../services/jobService");
        const { getWorkGame } = require("../services/minigameService");

        const userData = await prisma.user.findUnique({ where: { discordId_guildId: { discordId: user.id, guildId: guild.id } } });
        if (!userData || !userData.jobId) {
            return interaction.reply({ content: "You don't have a job!", ephemeral: true });
        }

        const job = getJob(userData.jobId);
        if (!job) return interaction.reply({ content: "Invalid job.", ephemeral: true });

        // Cooldown check
        const incomeConfig = await prisma.incomeConfig.findUnique({
            where: { guildId_commandKey: { guildId: guild.id, commandKey: "work" } }
        });

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
        let cooldownSeconds = incomeConfig ? incomeConfig.cooldown : 0; // Default 0 if not set

        // Apply Reductions
        cooldownSeconds = Math.max(0, cooldownSeconds - cooldownRed);
        const cooldownMs = cooldownSeconds * 1000;

        if (now - lastShift < cooldownMs) {
            const remaining = Math.ceil((cooldownMs - (now - lastShift)) / 60000);
            return interaction.reply({ content: `${Mascot.Emotes.Angry} You are tired! You can work again in **${remaining} minutes**.`, ephemeral: true });
        }

        // --- STRESS CHECK ---
        if (userData.jobStress > 80) {
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

                const burnoutEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Alert} BURNOUT!`)
                    .setDescription(`You are too stressed to work well! You collapsed from exhaustion.\n\n**Stress Level:** ${userData.jobStress}/100\n\nUse \`!relax\` to recover before working again.`)
                    .setColor("#E74C3C")
                    .setThumbnail(getEmoteUrl(Mascot.Emotes.Fail));

                return interaction.reply({ embeds: [burnoutEmbed], ephemeral: true });
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

            reply = await interaction.reply({ embeds: [previewEmbed], ephemeral: false, fetchReply: true });

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

            if (reply) {
                await interaction.editReply({ embeds: [embed], components: [row] });
            } else {
                reply = await interaction.reply({ embeds: [embed], components: [row], ephemeral: false, fetchReply: true });
            }

            try {
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
            if (reply) {
                await interaction.editReply({ embeds: [embed], components: [] });
            } else {
                reply = await interaction.reply({ embeds: [embed], ephemeral: false, fetchReply: true });
            }

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
            const promoCheck = await checkPromotion({ ...userData, jobXp: userData.jobXp + 10 });

            const config = await getGuildConfig(guild.id);
            const winEmbed = new EmbedBuilder()
                .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
                .setTitle(`${Mascot.Emotes.JobWorking} Shift Complete`)
                .setDescription(`Great work! You finished your shift as a **${job.title}**.\n\n**Earnings:** ${fmtCurrency(amount, config?.currencyEmoji)}\n(Base Pay + ${streakBonusPct}% Streak Bonus)\n\n**XP Gained:** +10\n**Stress:** +5`)
                .setColor("#2ECC71");

            if (newStreak > 1) {
                winEmbed.addFields({ name: "🔥 Job Streak", value: `${newStreak} Days`, inline: true });
            }

            if (promoCheck.eligible && promoCheck.nextJob) {
                winEmbed.addFields({ name: "🎉 Promotion Available!", value: `You are eligible for **${promoCheck.nextJob.title}**!\nAsk an admin or apply!` });
            } else if (promoCheck.nextJob) {
                winEmbed.setFooter({ text: `Next Job: ${promoCheck.nextJob.title} (Need ${promoCheck.missingXp} more XP)` });
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

            if (userMessage) {
                await (userMessage as Message).reply({ embeds: [winEmbed] });
            } else {
                await interaction.followUp({ embeds: [winEmbed] });
            }

        } else {
            // FAILED
            await prisma.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: {
                    lastShift: new Date(), // Trigger cooldown
                    jobXp: { decrement: 5 }, // -5 XP
                    jobStress: { increment: 10 } // +10 Stress
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
