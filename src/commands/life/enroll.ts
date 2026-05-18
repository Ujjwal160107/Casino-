import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleEnroll(message: Message, args: string[]) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);
    const prefix = config?.prefix || "!";

    const nameQuery = args.join(" ").toLowerCase();
    if (!nameQuery) {
        // Using Confused emote for invalid usage
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}enroll <degree name>\``)] });
    }

    try {
        const degrees = await prisma.degree.findMany({ where: { guildId: message.guild.id } });
        const degree = degrees.find(d => d.name.toLowerCase().includes(nameQuery));

        if (!degree) {
            return message.reply({ embeds: [errorEmbed(message.author, "Degree Not Found", "Could not find a degree with that name.")] });
        }

        const user = await prisma.user.findUnique({
            where: { discordId: message.author.id },
            include: { currentEducation: { include: { degree: true } } }
        });

        if (user?.currentEducation) {
            const embed = errorEmbed(message.author, "Already Enrolled", `You are already studying **${user.currentEducation.degree.name}**. Please complete it first!`);
            const angryUrl = getEmoteUrl(Mascot.Emotes.Angry);
            if (angryUrl) embed.setThumbnail(angryUrl);
            return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`Enrollment Confirmation`)
            .setDescription(`Are you sure you want to enroll in **${degree.name}**?`)
            .addFields(
                { name: "Tuition Fee", value: fmtCurrency(degree.tuitionPerSem, config.currencyEmoji), inline: true },
                { name: "Duration", value: `${degree.totalSemesters} Semesters`, inline: true }
            )
            .setColor("#F1C40F")
            .setFooter({ text: `${Mascot.Name} • Education` });

        const thumbUrl = getEmoteUrl(Mascot.Emotes.Think);
        if (thumbUrl) embed.setThumbnail(thumbUrl);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`enroll_confirm_${degree.id}_${message.author.id}`)
                .setLabel("Confirm Payment")
                .setStyle(ButtonStyle.Success)
                .setEmoji(Mascot.Emotes.Success)
            ,
            new ButtonBuilder()
                .setCustomId(`enroll_confirm_${degree.id}_${message.author.id}_card`)
                .setLabel("Pay With Card")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("💳")
        );

        message.reply({ embeds: [embed], components: [row] }); // Note: Attachment handling for footer icon needs thought, or just remove attachment ref if not attaching.
        // For now, let's stick to simple embeds without dynamic attachments per command to avoid complexity, 
        // OR add the file if we want the footer icon to work. 
        // The implementation plan didn't strictly mandate checking the attachment logic in every command, but to be safe:
        // message.reply({ embeds: [embed], components: [row], files: [Mascot.Images.Main] })

    } catch (err: any) {
        message.reply({ embeds: [errorEmbed(message.author, "Error", err.message)] });
    }
}

import { enroll, takeExam } from "../../services/educationService";
// successEmbed, errorEmbed already imported abov

// ... (handleEnroll stays same)

export async function handleExam(message: Message) {
    if (!message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    try {
        const res = await takeExam(userId, guildId);

        if (res.success) {
            return message.reply({ embeds: [successEmbed(message.author, "🎓 GRADUATED!", res.msg)] });
        } else {
            const embed = errorEmbed(message.author, "Exam Failed", res.msg);
            const sadUrl = getEmoteUrl(Mascot.Emotes.TeacherSad);
            if (sadUrl) embed.setThumbnail(sadUrl);
            return message.reply({ embeds: [embed] });
        }

    } catch (err: any) {
        return message.reply({ embeds: [errorEmbed(message.author, "Error", err.message)] });
    }
}
