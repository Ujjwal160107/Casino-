import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import { getDegrees } from "../../services/educationService";
import { fmtCurrency } from "../../utils/format";
import { errorContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { Mascot } from "../../config/branding";
import { getUser } from "../../services/userService";
import { getGuildPrefix } from "../../utils/guildContext";

const EDUCATION_ACCENT_COLOR = 0xF1C40F;
const ITEMS_PER_PAGE = 5;

function separator() {
    return new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small);
}

function buildTextOnlyContainer(title: string, body: string, accentColor = EDUCATION_ACCENT_COLOR) {
    return new ContainerBuilder()
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
        const prefix = await getGuildPrefix(guildId);
        

        const user = await getUser(userId, guildId);

        if (!user) {
            return message.reply(v2Reply(errorContainer("Profile Not Found", `You need to start your journey first. Use \`${prefix}start\` to create a profile!`)));
        }

        if (user.currentEducation) {
            const edu = user.currentEducation;
            const deg = edu.degree;

            const xpProgress = Math.min(100, Math.round((edu.educationXp / deg.xpRequired) * 100));
            const progressBar = "▓".repeat(Math.floor(xpProgress / 10)) + "░".repeat(10 - Math.floor(xpProgress / 10));

            const EMOJI_XP = "<:xpfull:1451636569982111765>";
            const EMOJI_XP_EMPTY = "<:xpempty:1451642829427314822>";
            const filledBars = Math.min(10, Math.floor((edu.educationXp / deg.xpRequired) * 10));
            const emptyBars = 10 - filledBars;
            const intProgress = `${EMOJI_XP.repeat(filledBars)}${EMOJI_XP_EMPTY.repeat(Math.max(0, emptyBars))}`;

            const scholarshipMilestones = [
                { level: 75, desc: "1.5x Refund" },
                { level: 100, desc: "2x Refund" },
            ];

            const pct = edu.educationXp / deg.xpRequired;
            const scholarshipGuide = scholarshipMilestones.map((m) => {
                const isClaimed = edu.scholarshipsClaimed.includes(m.level);
                const isEligible = pct >= m.level / 100;

                let status = `${Mascot.Emotes.Lock} Locked`;
                if (isClaimed) status = `${Mascot.Emotes.Accept} Claimed`;
                else if (isEligible) status = `${Mascot.Emotes.MoneyBag} Available`;

                return `${status} **${m.level}% XP** (${m.desc})`;
            }).join("\n");

            const container = new ContainerBuilder()
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Graduate} Student Dashboard`),
                            new TextDisplayBuilder().setContent(
                                `**Degree:** ${deg.name}\n` +
                                `**Fee Paid:** ${fmtCurrency(deg.tuitionPerSem)}\n` +
                                `**Graduation:** ${progressBar} ${xpProgress}%`
                            ),
                        )
                        .setThumbnailAccessory((thumbnail) =>
                            thumbnail
                                .setURL(message.author.displayAvatarURL({ size: 256 }))
                                .setDescription(`${message.author.username}'s avatar`),
                        ),
                )
                .addSeparatorComponents(separator())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### Education XP\n${intProgress} **${edu.educationXp} / ${deg.xpRequired}**`,
                    ),
                    new TextDisplayBuilder().setContent(
                        `### Stress\n**${edu.stress}/100**${edu.stress > 70 ? `\n${Mascot.Emotes.Alert} Use \`${prefix}relax\` to recover.` : ""}`,
                    ),
                    new TextDisplayBuilder().setContent(
                        `### Actions\n\`${prefix}study\` - Gain XP (+50 base)\n\`${prefix}exam\` - Take Final Exam`,
                    ),
                    new TextDisplayBuilder().setContent(
                        `### ${Mascot.Emotes.MoneyBag} Scholarship Guide\n${scholarshipGuide}`,
                    ),
                );

            const row = new ActionRowBuilder<ButtonBuilder>();

            const milestones = [75, 100];
            const claimed = edu.scholarshipsClaimed;

            for (const m of milestones) {
                if (pct >= m / 100 && !claimed.includes(m)) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`claim_scholarship_${m}`)
                            .setLabel(`Claim ${m}% XP Scholarship`)
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(Mascot.Emotes.MoneyBag),
                    );
                    break;
                }
            }

            return message.reply({
                components: row.components.length > 0 ? [container, row] : [container],
                flags: MessageFlags.IsComponentsV2,
            });
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
                                `**Degree Fee:** ${fmtCurrency(degree.tuitionPerSem)}\n` +
                                `**XP Required:** ${degree.xpRequired}\n` +
                                `**Reqs:** ${reqText}`,
                            ),
                        )
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setCustomId(`enroll_confirm_${degree.id}_${userId}`)
                                .setLabel(buttonLabel)
                                .setStyle(buttonStyle)
                                .setEmoji(disabled ? Mascot.Emotes.Lock : Mascot.Emotes.Graduate)
                                .setDisabled(disabled),
                        ),
                );

                if (index < pageDegrees.length - 1) {
                    container.addSeparatorComponents(separator());
                }
            });

            container
                .addSeparatorComponents(separator())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`Page ${pageIndex + 1}/${totalPages} - You can also use \`${prefix}enroll <name>\`.`),
                )
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("education", prefix)!));

            return container;
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
        message.reply(v2Reply(errorContainer("Use Error", "Something went wrong while loading the education dashboard.")));
    }
}

export async function handleListDegrees(message: Message) {
    if (!message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    const prefix = await getGuildPrefix(guildId);
    

    const user = await getUser(userId, guildId);

    if (!user || user.degrees.length === 0) {
        return message.reply(v2Reply(errorContainer("No Degrees", `You haven't earned any degrees yet. Use \`${prefix}education\` to find a program!`)));
    }

    const lines = user.degrees.map((ud) => {
        const finalXp = ud.finalXp ?? (ud.finalGpa > 0 ? Math.round((ud.finalGpa / 10) * ud.degree.xpRequired) : 0);
        return `${Mascot.Emotes.Graduate} **${ud.degree.name}** — Final XP **${finalXp}/${ud.degree.xpRequired}** · <t:${Math.floor(ud.obtainedAt.getTime() / 1000)}:D>`;
    });

    return message.reply({
        components: [buildTextOnlyContainer("Earned Degrees", lines.join("\n"), 0xF1C40F)],
        flags: MessageFlags.IsComponentsV2,
    });
}
