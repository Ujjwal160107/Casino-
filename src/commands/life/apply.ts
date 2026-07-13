import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Message, MessageFlags } from "discord.js";
import { JobDefinition, getJobApplicationStatus, getJobByName } from "../../services/jobService";
import { getInterview, resolveInterviewChoice, evaluateInterview, InterviewResult } from "../../services/interviewService";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";
import { successContainer, errorContainer, infoContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
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
        return message.reply(v2Reply(errorContainer("Job Locked", status.missing.join("\n"))));
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
        return interaction.reply(v2Reply(errorContainer("Job Locked", status.missing.join("\n")), undefined, MessageFlags.Ephemeral));
    }

    await interaction.deferReply();
    const reply = await interaction.editReply(buildInterviewIntro(job));
    return runInterview(reply as Message, interaction, job, user.discordId);
}

function buildInterviewIntro(job: JobDefinition) {
    const container = plainContainer(
        `## Interview: ${job.title}\n` +
        `You are being interviewed for **${job.title}**.\n\n` +
        `Answer **5 workplace scenario questions**.\n` +
        `Each question has choices with different success odds.\n` +
        `Score **60/100 or higher** to get hired.\n\n` +
        `-# Lucky Tie active? Your odds improve on each question.`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("start_interview")
            .setLabel("Start Interview")
            .setStyle(ButtonStyle.Success)
    );

    container.addActionRowComponents(row);

    return v2Reply(container);
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
        return reply.edit(v2Reply(errorContainer("Interview Cancelled", "Interview cancelled (timeout).")));
    }

    for (let index = 0; index < scenarios.length; index++) {
        const scenario = scenarios[index];

        const questionContainer = plainContainer(`## Question ${index + 1}/${scenarios.length}\n${scenario.prompt}`);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            scenario.choices.map((choice, i) =>
                new ButtonBuilder()
                    .setCustomId(`ans_${i}`)
                    .setLabel(choice.label.length > 80 ? choice.label.slice(0, 79) + "…" : choice.label)
                    .setStyle(ButtonStyle.Secondary)
            )
        );

        questionContainer.addActionRowComponents(row);

        await reply.edit(v2Reply(questionContainer));

        try {
            const answer = await reply.awaitMessageComponent({
                filter: (i) => i.user.id === discordUser.id,
                time: 35000
            });
            const selectedIndex = parseInt(answer.customId.split("_")[1], 10);
            await answer.deferUpdate();

            const result = await resolveInterviewChoice(scenario, selectedIndex, discordId);
            results.push(result);

            // Brief feedback container
            const feedbackContainer = result.success
                ? successContainer("Good answer!", `${result.choice.successMsg}\n\n+${result.scoreGained} points`)
                : errorContainer("Rough answer.", `${result.choice.failMsg}\n\n+0 points`);

            await reply.edit(v2Reply(feedbackContainer));
            await new Promise(res => setTimeout(res, 2000));
        } catch {
            return reply.edit(v2Reply(errorContainer("Interview Failed", "Timeout! Interview failed.")));
        }
    }

    const session = evaluateInterview(results, luckyTieActive);
    const { totalScore, passed } = session;

    const resultLines = results.map((r, i) =>
        `${r.success ? "✅" : "❌"} Q${i + 1}: ${r.choice.label.slice(0, 40)} (+${r.scoreGained})`
    ).join("\n");

    const resultBody =
        (passed
            ? `${Mascot.Emotes.Success} You passed the interview! (**${totalScore}/100**)\nYou are now employed as a **${job.title}**.`
            : `${Mascot.Emotes.Fail} You failed the interview (**${totalScore}/100**). You need at least **60/100** to pass.`)
        + `\n\n**Your Answers:**\n${resultLines}`;

    let resultContainer;
    if (passed) {
        const prefix = guild ? await getGuildPrefix(guild.id) : undefined;
        resultContainer = successContainer("Hired!", resultBody, { hint: nextStepHint("apply", prefix) });
    } else {
        resultContainer = errorContainer("Rejected", resultBody);
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

    return reply.edit(v2Reply(resultContainer));
}
