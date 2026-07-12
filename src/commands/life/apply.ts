import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, Message } from "discord.js";
import { JobDefinition, getJobApplicationStatus, getJobByName } from "../../services/jobService";
import { getInterview, resolveInterviewChoice, evaluateInterview, InterviewResult } from "../../services/interviewService";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { logToChannel } from "../../utils/discordLogger";
import { redisService } from "../../services/redisService";
import { getGuildPrefix } from "../../utils/guildContext";

export async function handleApply(message: Message, args: string[]) {
    if (!message.guild) return;

        const prefix = await getGuildPrefix(message.guild.id);
    
    const jobQuery = args.join(" ").trim();

    if (!jobQuery) return message.reply(`Usage: \`${prefix}apply <job name>\``);

    const job = getJobByName(jobQuery);
    if (!job) return message.reply(`I could not find that job. Check \`${prefix}jobs\` and use the job name.`);

    return startJobApplicationFromMessage(message, job);
}

export async function startJobApplicationFromMessage(message: Message, job: JobDefinition) {
    if (!message.guild) return;

    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id },
        include: { degrees: { include: { degree: true } } }
    });
    if (!user) return;

    const status = getJobApplicationStatus(user, job);
    if (!status.canApply) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Job Locked", status.missing.join("\n"))]
        });
    }

    const reply = await message.reply(buildInterviewIntro(job));
    return runInterview(reply, message, job, user.discordId);
}

export async function startJobApplicationFromInteraction(interaction: ButtonInteraction, job: JobDefinition) {
    if (!interaction.guild) return;

    const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
        include: { degrees: { include: { degree: true } } }
    });
    if (!user) return;

    const status = getJobApplicationStatus(user, job);
    if (!status.canApply) {
        return interaction.reply({
            embeds: [errorEmbed(interaction.user as any, "Job Locked", status.missing.join("\n"))],
            ephemeral: true,
        });
    }

    await interaction.deferReply();
    const reply = await interaction.editReply(buildInterviewIntro(job));
    return runInterview(reply as Message, interaction, job, user.discordId);
}

function buildInterviewIntro(job: JobDefinition) {
    const introEmbed = new EmbedBuilder()
        .setTitle(`Interview: ${job.title}`)
        .setDescription(
            `You are being interviewed for **${job.title}**.\n\n` +
            `Answer **5 workplace scenario questions**.\n` +
            `Each question has choices with different success odds.\n` +
            `Score **60/100 or higher** to get hired.\n\n` +
            `-# Lucky Tie active? Your odds improve on each question.`
        )
        .setColor(Mascot.Colors.Base as any);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("start_interview")
            .setLabel("Start Interview")
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [introEmbed], components: [row] };
}

async function runInterview(reply: Message, source: Message | ButtonInteraction, job: JobDefinition, discordId: string) {
    const { scenarios } = getInterview(job.sector);
    const discordUser = "author" in source ? source.author : source.user;
    const guild = "guild" in source ? source.guild : null;
    const results: InterviewResult[] = [];

    // Check Lucky Tie once for display purposes
    const tieData = await redisService.get<{ active: boolean }>(`lucky_tie:${discordId}`);
    const luckyTieActive = tieData?.active ?? false;

    try {
        const confirmation = await reply.awaitMessageComponent({
            filter: (i) => i.user.id === discordUser.id,
            time: 30000
        });
        await confirmation.deferUpdate();
    } catch {
        return reply.edit({ content: "Interview cancelled (timeout).", embeds: [], components: [] });
    }

    for (let index = 0; index < scenarios.length; index++) {
        const scenario = scenarios[index];

        const questionEmbed = new EmbedBuilder()
            .setTitle(`Question ${index + 1}/${scenarios.length}`)
            .setDescription(scenario.prompt)
            .setColor("#3498DB")
            .setFooter({ text: luckyTieActive ? "Lucky Tie is active — your odds are slightly boosted." : "Choose wisely." });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            scenario.choices.map((choice, i) =>
                new ButtonBuilder()
                    .setCustomId(`ans_${i}`)
                    .setLabel(choice.label.length > 80 ? choice.label.slice(0, 79) + "…" : choice.label)
                    .setStyle(ButtonStyle.Secondary)
            )
        );

        await reply.edit({ embeds: [questionEmbed], components: [row] });

        try {
            const answer = await reply.awaitMessageComponent({
                filter: (i) => i.user.id === discordUser.id,
                time: 35000
            });
            const selectedIndex = parseInt(answer.customId.split("_")[1], 10);
            await answer.deferUpdate();

            const result = await resolveInterviewChoice(scenario, selectedIndex, discordId);
            results.push(result);

            // Brief feedback embed
            const feedbackEmbed = new EmbedBuilder()
                .setTitle(result.success ? "Good answer!" : "Rough answer.")
                .setDescription(
                    result.success
                        ? `${result.choice.successMsg}\n\n+${result.scoreGained} points`
                        : `${result.choice.failMsg}\n\n+0 points`
                )
                .setColor(result.success ? "#2ECC71" : "#E74C3C");

            await reply.edit({ embeds: [feedbackEmbed], components: [] });
            await new Promise(res => setTimeout(res, 2000));
        } catch {
            return reply.edit({ content: "Timeout! Interview failed.", embeds: [], components: [] });
        }
    }

    const session = evaluateInterview(results, luckyTieActive);
    const { totalScore, passed } = session;

    const resultLines = results.map((r, i) =>
        `${r.success ? "✅" : "❌"} Q${i + 1}: ${r.choice.label.slice(0, 40)} (+${r.scoreGained})`
    ).join("\n");

    const resultEmbed = new EmbedBuilder()
        .setTitle(passed ? "Hired!" : "Rejected")
        .setDescription(
            passed
                ? `${Mascot.Emotes.Success} You passed the interview! (**${totalScore}/100**)\nYou are now employed as a **${job.title}**.`
                : `${Mascot.Emotes.Fail} You failed the interview (**${totalScore}/100**). You need at least **60/100** to pass.`
        )
        .addFields({ name: "Your Answers", value: resultLines })
        .setColor(passed ? "#2ECC71" : "#E74C3C");

    if (luckyTieActive) {
        resultEmbed.setFooter({ text: "Lucky Tie was active this interview — your odds were boosted." });
    }

    if (passed) {
        await prisma.user.update({
            where: { discordId },
            data: { jobId: job.id, lastShift: null }
        });
    }

    if (guild) {
        logToChannel(source.client, {
            guild,
            type: "ECONOMY",
            title: passed ? "Job Application: Hired" : "Job Application: Rejected",
            description: passed
                ? `**${discordUser.globalName ?? discordUser.username}** hired as **${job.title}**.`
                : `**${discordUser.globalName ?? discordUser.username}** failed interview for **${job.title}**.`,
            fields: [
                { name: "User", value: `<@${discordUser.id}>`, inline: true },
                { name: "Score", value: `${totalScore}/100`, inline: true },
                { name: "Job", value: job.title, inline: true }
            ],
            color: passed ? 0x2ECC71 : 0xE74C3C,
            thumbnail: discordUser.displayAvatarURL()
        });
    }

    return reply.edit({ embeds: [resultEmbed], components: [] });
}
