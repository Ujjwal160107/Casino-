import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ContainerBuilder,
    EmbedBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import { getDegrees } from "../../services/educationService";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { errorEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getUser } from "../../services/userService";

const EDUCATION_ACCENT_COLOR = 0xF1C40F;
const ITEMS_PER_PAGE = 5;

function separator() {
    return new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small);
}

function buildTextOnlyContainer(title: string, body: string, accentColor = EDUCATION_ACCENT_COLOR) {
    return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${title}**`),
            new TextDisplayBuilder().setContent(body),
        );
}

export async function handleEducation(message: Message, args: string[]) {
    try {
        if (!message.guild) return;
        const guildId = message.guild.id;
        const userId = message.author.id;
        const config = await getGuildConfig(guildId);
        const prefix = config?.prefix || "!";

        const user = await getUser(userId, guildId);

        if (!user) {
            return message.reply({ embeds: [errorEmbed(message.author, "Profile Not Found", `You need to start your journey first. Use \`${prefix}start\` to create a profile!`)] });
        }

        if (user.currentEducation) {
            const edu = user.currentEducation;
            const deg = edu.degree;

            const progress = Math.min(100, Math.round((edu.currentGpa / 6.0) * 100));
            const progressBar = "▓".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));

            const EMOJI_XP = "<:xpfull:1451636569982111765>";
            const EMOJI_XP_EMPTY = "<:xpempty:1451642829427314822>";
            const filledBars = Math.min(10, Math.floor(edu.currentGpa));
            const emptyBars = 10 - filledBars;
            const intProgress = `${EMOJI_XP.repeat(filledBars)}${EMOJI_XP_EMPTY.repeat(Math.max(0, emptyBars))}`;

            const scholarshipMilestones = [
                { level: 9, desc: "1.5x Refund" },
                { level: 10, desc: "2x Refund" },
            ];

            const scholarshipGuide = scholarshipMilestones.map((m) => {
                const isClaimed = edu.scholarshipsClaimed.includes(m.level);
                const isEligible = edu.currentGpa >= m.level;

                let status = `${Mascot.Emotes.Lcok} Locked`;
                if (isClaimed) status = `${Mascot.Emotes.Accept} Claimed`;
                else if (isEligible) status = `${Mascot.Emotes.MoneyBag} Available`;

                return `${status} **${m.level}.0 Int** (${m.desc})`;
            }).join("\n");

            const embed = new EmbedBuilder()
                .setTitle(`Student Dashboard: ${deg.name}`)
                .setDescription(`**Degree Fee Paid**: ${fmtCurrency(deg.tuitionPerSem, config.currencyEmoji)}\n${progressBar} ${progress}% to Graduation`)
                .setColor(edu.stress > 80 ? "#FF0000" : "#3498DB")
                .addFields(
                    { name: "Intelligence", value: `${intProgress} **${edu.currentGpa.toFixed(1)} / 10**\nRequired: 6.0`, inline: true },
                    { name: "Stress", value: `${edu.stress}/100`, inline: true },
                    { name: "Actions", value: `\`${prefix}study\` - Gain Intelligence (+0.5)\n\`${prefix}exam\` - Take Final Exam (Req: 6 Intelligence)` },
                    { name: `${Mascot.Emotes.MoneyBag} Scholarship Guide`, value: scholarshipGuide },
                );

            const thumbUrl = getEmoteUrl(Mascot.Emotes.Teacher);
            if (thumbUrl) embed.setThumbnail(thumbUrl);

            if (edu.stress > 70) {
                embed.setDescription(`${embed.data.description}\n\n${Mascot.Emotes.Alert} **High Stress!** You should visit the Gym, meditate, or play sports to relax!`);
            }

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("edu_stress_sports").setLabel("Sports").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Sports),
                new ButtonBuilder().setCustomId("edu_stress_gym").setLabel("Gym").setStyle(ButtonStyle.Primary).setEmoji(Mascot.Emotes.Gym),
                new ButtonBuilder().setCustomId("edu_stress_meditation").setLabel("Meditation").setStyle(ButtonStyle.Secondary).setEmoji(Mascot.Emotes.Meditation),
            );

            const milestones = [9, 10];
            const currentInt = Math.floor(edu.currentGpa);
            const claimed = edu.scholarshipsClaimed;

            for (const m of milestones) {
                if (currentInt >= m && !claimed.includes(m)) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`claim_scholarship_${m}`)
                            .setLabel(`Claim ${m}.0 Int Scholarship`)
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(Mascot.Emotes.MoneyBag),
                    );
                    break;
                }
            }

            return message.reply({ embeds: [embed], components: [row] });
        }

        const degrees = await getDegrees(guildId);
        const myDegreeIds = new Set(user.degrees.map((d) => d.degreeId));

        if (degrees.length === 0) {
            return message.reply({
                components: [buildTextOnlyContainer("No Degrees Found", "There are no degrees available in this server currently.", 0xE74C3C)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const totalPages = Math.ceil(degrees.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        const buildEducationContainer = (pageIndex: number) => {
            const start = pageIndex * ITEMS_PER_PAGE;
            const pageDegrees = degrees.slice(start, start + ITEMS_PER_PAGE);

            const container = new ContainerBuilder()
                .setAccentColor(EDUCATION_ACCENT_COLOR)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## ${Mascot.Emotes.Graduate} Education & Careers\n` +
                        `> Choose a degree path and enroll from the button on the right.`,
                    ),
                    new TextDisplayBuilder().setContent(`**Intelligence:** ${user.intelligence} | **Discipline:** ${user.discipline}`),
                )
                .addSeparatorComponents(separator());

            pageDegrees.forEach((degree, index) => {
                const isCompleted = myDegreeIds.has(degree.id);
                const hasPrereq = !degree.requiredDegreeId || myDegreeIds.has(degree.requiredDegreeId);
                const hasInt = user.intelligence >= degree.minIntelligence;
                const missing: string[] = [];

                if (!hasPrereq) {
                    missing.push(`Need ${degree.requiredDegree?.name || "Prerequisite Degree"}`);
                }
                if (!hasInt) {
                    missing.push(`Need ${degree.minIntelligence} Int`);
                }

                const isLocked = !isCompleted && missing.length > 0;
                const statusIcon = isCompleted ? Mascot.Emotes.Accept : isLocked ? Mascot.Emotes.Decline : Mascot.Emotes.Accept;
                const statusText = isCompleted ? "Completed" : isLocked ? "Locked" : "Open";
                const reqText = isCompleted ? "None" : isLocked ? missing.join(", ") : "Eligible";
                const buttonLabel = isCompleted ? "Completed" : isLocked ? "Locked" : "Enroll";
                const buttonStyle = isCompleted || isLocked ? ButtonStyle.Secondary : ButtonStyle.Success;
                const disabled = isCompleted || isLocked;
                const displayName = degree.name.includes(degree.type) ? degree.name : `${degree.name} (${degree.type})`;

                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`### ${statusIcon} ${displayName}`),
                            new TextDisplayBuilder().setContent(
                                `**Status:** ${statusText}\n` +
                                `**Degree Fee:** ${fmtCurrency(degree.tuitionPerSem, config.currencyEmoji)}\n` +
                                `**Reqs:** ${reqText}`,
                            ),
                        )
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setCustomId(`enroll_confirm_${degree.id}_${userId}`)
                                .setLabel(buttonLabel)
                                .setStyle(buttonStyle)
                                .setEmoji(disabled ? Mascot.Emotes.Lcok : Mascot.Emotes.Graduate)
                                .setDisabled(disabled),
                        ),
                );

                if (index < pageDegrees.length - 1) {
                    container.addSeparatorComponents(separator());
                }
            });

            return container
                .addSeparatorComponents(separator())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`Page ${pageIndex + 1}/${totalPages} - You can also use \`${prefix}enroll <name>\`.`),
                );
        };

        const buildNavigationRow = (pageIndex: number, disabled = false) => {
            return new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("edu_prev")
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || pageIndex === 0),
                new ButtonBuilder()
                    .setCustomId("edu_next")
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(disabled || pageIndex === totalPages - 1),
            );
        };

        const components = totalPages > 1
            ? [buildEducationContainer(currentPage), buildNavigationRow(currentPage)]
            : [buildEducationContainer(currentPage)];

        const reply = await message.reply({
            components,
            flags: MessageFlags.IsComponentsV2,
        });

        if (totalPages > 1) {
            const collector = reply.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000,
                filter: (i) => i.user.id === message.author.id,
            });

            collector.on("collect", async (i) => {
                if (i.customId === "edu_prev") {
                    currentPage = Math.max(0, currentPage - 1);
                } else if (i.customId === "edu_next") {
                    currentPage = Math.min(totalPages - 1, currentPage + 1);
                } else {
                    return;
                }

                try {
                    await i.update({
                        components: [buildEducationContainer(currentPage), buildNavigationRow(currentPage)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } catch (e) {
                    console.error("Failed to update education interaction:", e);
                }
            });

            collector.on("end", () => {
                reply.edit({
                    components: [buildEducationContainer(currentPage), buildNavigationRow(currentPage, true)],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => { });
            });
        }
    } catch (error) {
        console.error("Education Command Error:", error);
        message.reply({ embeds: [errorEmbed(message.author, "Use Error", "Something went wrong while loading the education dashboard.")] });
    }
}

export async function handleListDegrees(message: Message) {
    if (!message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    const config = await getGuildConfig(guildId);
    const prefix = config?.prefix || "!";

    const user = await getUser(userId, guildId);

    if (!user || user.degrees.length === 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "No Degrees", `You haven't earned any degrees yet. Use \`${prefix}education\` to find a program!`)] });
    }

    const embed = new EmbedBuilder()
        .setDescription(`# ${Mascot.Emotes.Graduate} ${message.author.username}'s Earned Degrees`)
        .setColor("#F1C40F")
        .setThumbnail(message.author.displayAvatarURL());

    const fields = user.degrees.map((ud) => {
        return {
            name: `${Mascot.Emotes.Graduate} ${ud.degree.name}`,
            value: `**GPA:** ${ud.finalGpa.toFixed(1)} | **Obtained:** <t:${Math.floor(ud.obtainedAt.getTime() / 1000)}:D>`,
            inline: false,
        };
    });

    embed.addFields(fields);
    embed.setFooter({ text: `Total Degrees: ${user.degrees.length}` });

    message.reply({ embeds: [embed] });
}
