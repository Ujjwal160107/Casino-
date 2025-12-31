import { Interaction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Message, TextChannel } from "discord.js";
import { enroll, claimScholarship, reduceStress, getStressCost, dropout } from "../services/educationService";
import { getGuildConfig } from "../services/guildConfigService";
import { fmtCurrency, formatDuration } from "../utils/format";
import { Mascot, getEmoteUrl } from "../config/branding";
import prisma from "../utils/prisma";

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
        } catch (e: any) {
            await interaction.editReply({ content: `Error: ${e.message}`, components: [] });
        }
    }
    else if (customId === "work_resign_cancel") {
        await interaction.update({ content: `${Mascot.Emotes.Success} Cancelled resignation. Get back to work!`, embeds: [], components: [] });
    }
    else if (customId === "work_shift") {
        // Import here to avoid circular dependencies if any
        const { getJob } = require("../services/jobService");
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

        const lastShift = userData.lastShift ? new Date(userData.lastShift).getTime() : 0;
        const now = Date.now();
        const cooldownSeconds = incomeConfig ? incomeConfig.cooldown : 0; // Default 0 if not set
        const cooldownMs = cooldownSeconds * 1000;

        if (now - lastShift < cooldownMs) {
            const remaining = Math.ceil((cooldownMs - (now - lastShift)) / 60000);
            return interaction.reply({ content: `${Mascot.Emotes.Angry} You are tired! You can work again in **${remaining} minutes**.`, ephemeral: true });
        }

        const game = getWorkGame();

        // --- PREVIEW LOGIC ---
        let reply: any;
        let isWin = false;

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
                        isWin = msg.content.trim() === game.answer;
                    }
                } catch (e) {
                    isWin = false;
                }
            }
        }

        // --- RESULT ---
        if (isWin) {
            // Pay Salary
            const amount = job.pay;
            await prisma.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: {
                    wallet: { update: { balance: { increment: amount } } },
                    shiftsWorked: { increment: 1 },
                    jobXp: { increment: 10 },
                    lastShift: new Date()
                }
            });

            const config = await getGuildConfig(guild.id);
            const winEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.JobWorking} Shift Complete`)
                .setDescription(`Great work! You finished your shift as a **${job.title}**.\n\n**Earnings:** ${fmtCurrency(amount, config?.currencyEmoji)}\n**XP Gained:** 10 XP`)
                .setColor("#2ECC71");

            await interaction.editReply({ embeds: [winEmbed], components: [] });

        } else {
            // FAILED
            // Should we record lastShift? If we don't, they can spam retry until win.
            // If we do, they lose an hour of work. "Dank Memer" usually penalizes or sets cooldown.
            // Let's set the cooldown to be safe.

            await prisma.user.update({
                where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
                data: { lastShift: new Date() } // Trigger cooldown
            });

            const failEmbed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Fail} Shift Failed`)
                .setDescription(`You messed up the task!\n\n**Correct Answer:** ${game.answer}\n\nYour boss is unhappy. No pay this shift. Come back in **${cooldownSeconds > 0 ? formatDuration(cooldownMs) : "a moment"}**.`)
                .setColor("#E74C3C");

            await interaction.editReply({ embeds: [failEmbed], components: [] });
        }
    }
}
