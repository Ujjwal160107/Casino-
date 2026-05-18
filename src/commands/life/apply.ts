import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, Message } from "discord.js";
import { JobDefinition, getJobApplicationStatus, getJobByName } from "../../services/jobService";
import { getInterview } from "../../services/interviewService";
import { Mascot } from "../../config/branding";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { logToChannel } from "../../utils/discordLogger";

export async function handleApply(message: Message, args: string[]) {
    if (!message.guild) return;

    const { getGuildConfig } = require("../../services/guildConfigService");
    const config = await getGuildConfig(message.guild.id);
    const prefix = config?.prefix || "!";
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
        .setDescription(`You are being interviewed for **${job.title}**.\nAnswer **5 questions** correctly to get the job.`)
        .setColor(Mascot.Colors.Base as any)
        .setThumbnail("https://media.discordapp.net/attachments/1093496077363421256/1149712711102713886/interview.png");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("start_interview")
            .setLabel("Start Interview")
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [introEmbed], components: [row] };
}

async function runInterview(reply: Message, source: Message | ButtonInteraction, job: JobDefinition, discordId: string) {
    const interview = getInterview(job.sector);
    const discordUser = "author" in source ? source.author : source.user;
    const guild = "guild" in source ? source.guild : null;
    let score = 0;

    try {
        const confirmation = await reply.awaitMessageComponent({
            filter: (interaction) => interaction.user.id === discordUser.id,
            time: 30000
        });
        await confirmation.deferUpdate();
    } catch {
        return reply.edit({ content: "Interview cancelled (timeout).", embeds: [], components: [] });
    }

    for (let index = 0; index < interview.questions.length; index++) {
        const question = interview.questions[index];
        const questionEmbed = new EmbedBuilder()
            .setTitle(`Question ${index + 1}/5`)
            .setDescription(question.q)
            .setColor("#3498DB");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            question.options.map((option, optionIndex) =>
                new ButtonBuilder()
                    .setCustomId(`ans_${optionIndex}`)
                    .setLabel(option)
                    .setStyle(ButtonStyle.Secondary)
            )
        );

        await reply.edit({ embeds: [questionEmbed], components: [row] });

        try {
            const answer = await reply.awaitMessageComponent({
                filter: (interaction) => interaction.user.id === discordUser.id,
                time: 30000
            });
            const selectedIndex = parseInt(answer.customId.split("_")[1], 10);
            if (selectedIndex === question.correctIndex) score++;
            await answer.deferUpdate();
        } catch {
            return reply.edit({ content: "Timeout! Interview failed.", embeds: [], components: [] });
        }
    }

    const passed = score >= 4;
    const resultEmbed = new EmbedBuilder()
        .setTitle(passed ? "Hired!" : "Rejected")
        .setDescription(passed
            ? `${Mascot.Emotes.Success} Congratulations! You passed the interview (${score}/5).\nYou are now employed as a **${job.title}**.`
            : `${Mascot.Emotes.Fail} You failed the interview (${score}/5). You need at least 4/5 correct.`
        )
        .setColor(passed ? "#2ECC71" : "#E74C3C");

    if (passed) {
        await prisma.user.update({
            where: { discordId },
            data: {
                jobId: job.id,
                jobXp: 0,
                shiftsWorked: 0,
                lastShift: null
            }
        });
    }

    if (guild) {
        logToChannel(source.client, {
            guild,
            type: "ECONOMY",
            title: passed ? "Job Application: Hired" : "Job Application: Rejected",
            description: passed
                ? `**${discordUser.globalName ?? discordUser.username}** has been hired as a **${job.title}**.`
                : `**${discordUser.globalName ?? discordUser.username}** failed the interview for **${job.title}**.`,
            fields: [
                { name: "User", value: `<@${discordUser.id}>`, inline: true },
                { name: "Score", value: `${score}/5`, inline: true },
                { name: "Job", value: job.title, inline: true }
            ],
            color: passed ? 0x2ECC71 : 0xE74C3C,
            thumbnail: discordUser.displayAvatarURL()
        });
    }

    return reply.edit({ embeds: [resultEmbed], components: [] });
}
