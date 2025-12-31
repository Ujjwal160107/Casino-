import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { JOBS, getJob } from "../../services/jobService";
import { getInterview, Question } from "../../services/interviewService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { logToChannel } from "../../utils/discordLogger";

export async function handleApply(message: Message, args: string[]) {
    const jobId = args[0];
    if (!jobId) return message.reply("Usage: `!apply <job_id>`");

    const job = getJob(jobId);
    if (!job) return message.reply("Invalid Job ID. Check `!jobs`.");

    // 1. Checks
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild!.id } },
        include: { degrees: { include: { degree: true } } }
    });

    if (!user) return; // Should not happen if filtered correctly

    // Check if already employed (and not applying for a promotion)
    if (user.jobId && !job.reqJobId) {
        const angryUrl = getEmoteUrl(Mascot.Emotes.Angry);
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Angry} You are already employed!`)
            .setDescription("You are already working! Either resign or get back to work.")
            .setColor("#E74C3C");

        if (angryUrl) embed.setThumbnail(angryUrl);

        return message.reply({ embeds: [embed] });
    }

    // Check Degrees
    if (job.reqDegrees.length > 0) {
        const ownedDegs = user.degrees.map(ud => ud.degree.name);
        const missing = job.reqDegrees.filter(req => !ownedDegs.includes(req));
        if (missing.length > 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "Qualifications Missing", `You are missing required degrees:\n**${missing.join(", ")}**`)] });
        }
    }

    // Check Previous Job Experience
    if (job.reqJobId) {
        if (user.jobId !== job.reqJobId) {
            const reqJob = getJob(job.reqJobId);
            return message.reply({ embeds: [errorEmbed(message.author, "Experience Missing", `You cannot just skip the ladder!\nThis position requires you to be currently working as a **${reqJob?.title || job.reqJobId}**.`)] });
        }
    }

    // Check if already has this job
    if (user.jobId === job.id) {
        return message.reply("You already have this job!");
    }

    // 2. Interview Syle
    const interview = getInterview(job.sector);
    let score = 0;

    const introEmbed = new EmbedBuilder()
        .setTitle(`👔 Interview: ${job.title}`)
        .setDescription(`You are being interviewed for **${job.title}**.\nAnswer **5 Questions** correctly to get the job.\n\nType \`start\` to begin!`)
        .setColor(Mascot.Colors.Base as any)
        .setThumbnail("https://media.discordapp.net/attachments/1093496077363421256/1149712711102713886/interview.png?ex=66e840a4&is=66e6ef24&hm=80c6f220800b462584102c403332766336332133883");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("start_interview").setLabel("Start Interview").setStyle(ButtonStyle.Success)
    );

    const reply = await message.reply({ embeds: [introEmbed], components: [row] });

    try {
        const confirmation = await reply.awaitMessageComponent({ filter: i => i.user.id === message.author.id, time: 30000 });
        await confirmation.deferUpdate();
    } catch {
        return reply.edit({ content: "Interview cancelled (timeout).", embeds: [], components: [] });
    }

    // Loop questions
    for (let i = 0; i < interview.questions.length; i++) {
        const q = interview.questions[i];

        const qEmbed = new EmbedBuilder()
            .setTitle(`Question ${i + 1}/5`)
            .setDescription(q.q)
            .setColor("#3498DB");

        const qRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            q.options.map((opt, idx) =>
                new ButtonBuilder().setCustomId(`ans_${idx}`).setLabel(opt).setStyle(ButtonStyle.Secondary)
            )
        );

        await reply.edit({ embeds: [qEmbed], components: [qRow] });

        try {
            const ans = await reply.awaitMessageComponent({ filter: i => i.user.id === message.author.id, time: 30000 });
            const selectedIdx = parseInt(ans.customId.split("_")[1]);

            if (selectedIdx === q.correctIndex) score++;
            await ans.deferUpdate();
        } catch {
            return reply.edit({ content: "Timeout! Interview failed.", embeds: [], components: [] });
        }
    }

    // Result
    const passed = score >= 4; // Need 4/5
    const resultEmbed = new EmbedBuilder()
        .setTitle(passed ? "🎉 Hired!" : "❌ Rejected")
        .setDescription(passed
            ? `${Mascot.Emotes.Success} Congratulations! You passed the interview (${score}/5).\nYou are now employed as a **${job.title}**!`
            : `${Mascot.Emotes.Fail} Unfortunately, you failed the interview (${score}/5). You need at least 4/5 correct.`
        )
        .setColor(passed ? "#2ECC71" : "#E74C3C");

    // Log the result
    if (message.guild) {
        logToChannel(message.client, {
            guild: message.guild,
            type: "ECONOMY",
            title: passed ? "Job Application: Hired" : "Job Application: Rejected",
            description: passed
                ? `**${message.author.globalName}** has been hired as a **${job.title}**.`
                : `**${message.author.globalName}** failed the interview for **${job.title}**.`,
            fields: [
                { name: "User", value: `<@${message.author.id}>`, inline: true },
                { name: "Score", value: `${score}/5`, inline: true },
                { name: "Job", value: job.title, inline: true }
            ],
            color: passed ? 0x2ECC71 : 0xE74C3C,
            thumbnail: message.author.displayAvatarURL()
        });
    }

    if (passed) {
        await prisma.user.update({
            where: { id: user.id },
            data: {
                jobId: job.id,
                jobXp: 0,
                shiftsWorked: 0,
                lastShift: null
            }
        });
    }

    await reply.edit({ embeds: [resultEmbed], components: [] });
}
