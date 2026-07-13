import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
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
import { JOBS, JobDefinition, getJob, getJobApplicationStatus, getJobsBySector, getJobPaySync } from "../../services/jobService";
import { Mascot } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import prisma from "../../utils/prisma";
import { startJobApplicationFromInteraction } from "./apply";
import { getGuildPrefix } from "../../utils/guildContext";

const SECTORS: JobDefinition["sector"][] = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];
const JOBS_PER_PAGE = 5;

function jobsId(action: string, ownerId: string, detail?: string) {
    return detail ? `jobs:${action}:${detail}:${ownerId}` : `jobs:${action}:${ownerId}`;
}

function parseJobsId(customId: string) {
    const [, action, maybeDetail, maybeOwner] = customId.split(":");
    return maybeOwner
        ? { action, detail: maybeDetail, ownerId: maybeOwner }
        : { action, detail: null as string | null, ownerId: maybeDetail ?? null };
}

function separator() {
    return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function getSectorInfo(sector: JobDefinition["sector"]) {
    switch (sector) {
        case "tech": return { name: "Technology", emoji: Mascot.Emotes.JobTech, desc: "Software, engineering, and AI." };
        case "medical": return { name: "Medical", emoji: Mascot.Emotes.JobMedical, desc: "Healthcare, surgery, and hospital leadership." };
        case "business": return { name: "Business", emoji: Mascot.Emotes.JobBusiness, desc: "Sales, finance, and management." };
        case "legal": return { name: "Legal", emoji: Mascot.Emotes.JobLegal, desc: "Law, advocacy, and firm leadership." };
        case "service": return { name: "Service", emoji: Mascot.Emotes.JobService, desc: "Hospitality and food service." };
        case "trade": return { name: "Skilled Trade", emoji: Mascot.Emotes.JobTrade, desc: "Mechanics and hands-on licensed work." };
        case "freelance": return { name: "Freelance", emoji: Mascot.Emotes.JobWorking, desc: "Flexible no-degree gig work." };
    }
}

function formatRequirement(job: JobDefinition) {
    const requirements: string[] = [];
    if (job.reqDegrees.length > 0) requirements.push(`Degree: ${job.reqDegrees.join(", ")}`);
    if (job.reqJobId) {
        const previousJob = JOBS.find((item) => item.id === job.reqJobId);
        requirements.push(`Requires job: ${previousJob?.title ?? job.reqJobId}`);
    }
    if (job.reqShifts) requirements.push(`Shifts: ${job.reqShifts}`);
    return requirements.length ? requirements.join("\n") : "No degree required";
}

function buildMenuContainer(prefix: string, ownerId: string) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.JobWorking} Career Center`),
            new TextDisplayBuilder().setContent(`Browse V2 jobs by field. Apply with the job buttons or \`${prefix}apply <job name>\`.`),
        )
        .addSeparatorComponents(separator());

    for (const sector of SECTORS) {
        const info = getSectorInfo(sector);
        const jobs = getJobsBySector(sector);
        container
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### ${info.emoji} ${info.name}\n${info.desc}\nJobs: **${jobs.length}**`,
                        ),
                    )
                    .setButtonAccessory(
                        new ButtonBuilder()
                            .setCustomId(jobsId("sector", ownerId, sector))
                            .setLabel("Browse")
                            .setEmoji(info.emoji)
                            .setStyle(ButtonStyle.Secondary),
                    ),
            )
            .addSeparatorComponents(separator());
    }

    return container;
}

function buildSectorContainer(sector: JobDefinition["sector"], page: number, prefix: string, user: any, ownerId: string) {
    const jobs = getJobsBySector(sector);
    const totalPages = Math.max(1, Math.ceil(jobs.length / JOBS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const info = getSectorInfo(sector);
    const displayedJobs = jobs.slice(safePage * JOBS_PER_PAGE, safePage * JOBS_PER_PAGE + JOBS_PER_PAGE);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${info.emoji} ${info.name} Careers`),
            new TextDisplayBuilder().setContent(`${info.desc}\nPage **${safePage + 1}** of **${totalPages}**`),
        )
        .addSeparatorComponents(separator());

    if (displayedJobs.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent("No jobs available in this field yet."));
    } else {
        for (const job of displayedJobs) {
            const status = getJobApplicationStatus(user, job);
            const buttonLabel = status.canApply ? "Apply" : status.label;
            const buttonStyle = status.canApply ? ButtonStyle.Success : ButtonStyle.Secondary;
            const requirementText = status.canApply ? formatRequirement(job) : `${formatRequirement(job)}\nStatus: ${status.missing.join(", ")}`;

            container
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                [
                                    `### ${job.emoji} ${job.title}`,
      `Pay per shift: **${fmtCurrency(getJobPaySync(job))}**`,
                                    `Requirement: **${requirementText}**`,
                                    `Career tier: **${job.careerTier}**`,
                                ].join("\n"),
                            ),
                        )
                        .setButtonAccessory(
                            new ButtonBuilder()
                                .setCustomId(jobsId("apply", ownerId, job.id))
                                .setLabel(buttonLabel)
                                .setStyle(buttonStyle)
                                .setEmoji(status.canApply ? Mascot.Emotes.Accept : Mascot.Emotes.Lock)
                                .setDisabled(!status.canApply),
                        ),
                )
                .addSeparatorComponents(separator());
        }
    }

    return { container, totalPages, safePage };
}

function buildSectorRow(ownerId: string, page: number, totalPages: number) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(jobsId("prev", ownerId))
            .setLabel("Prev")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(jobsId("menu", ownerId))
            .setLabel("Main Menu")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(jobsId("next", ownerId))
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1),
    );
}

export async function handleJobs(message: Message) {
    if (!message.guild) return;

    const prefix = await getGuildPrefix(message.guild.id);
    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id },
        include: { degrees: { include: { degree: true } } }
    });
    if (!user) return;

    let currentView: "MENU" | "SECTOR" = "MENU";
    let selectedSector: JobDefinition["sector"] | null = null;
    let currentPage = 0;

    const render = (): any => {
        if (currentView === "MENU" || !selectedSector) {
            return {
                components: [buildMenuContainer(prefix, message.author.id)],
                flags: MessageFlags.IsComponentsV2,
            };
        }

        const sectorPayload = buildSectorContainer(selectedSector, currentPage, prefix, user, message.author.id);
        currentPage = sectorPayload.safePage;
        return {
            components: [
                sectorPayload.container,
                buildSectorRow(message.author.id, currentPage, sectorPayload.totalPages),
            ],
            flags: MessageFlags.IsComponentsV2,
        };
    };

    const reply = await message.reply(render());

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000,
        filter: (interaction) => interaction.user.id === message.author.id,
    });

    collector.on("collect", async (interaction: ButtonInteraction) => {
        const parsed = parseJobsId(interaction.customId);
        if (parsed.ownerId && parsed.ownerId !== interaction.user.id) {
            await interaction.reply({
                content: "This jobs browser belongs to another user.",
                ephemeral: true,
            });
            return;
        }

        if (parsed.action === "sector" && parsed.detail && SECTORS.includes(parsed.detail as JobDefinition["sector"])) {
            currentView = "SECTOR";
            selectedSector = parsed.detail as JobDefinition["sector"];
            currentPage = 0;
        } else if (parsed.action === "menu") {
            currentView = "MENU";
            selectedSector = null;
            currentPage = 0;
        } else if (parsed.action === "prev") {
            currentPage = Math.max(0, currentPage - 1);
        } else if (parsed.action === "next") {
            currentPage += 1;
        } else if (parsed.action === "apply" && parsed.detail) {
            const job = getJob(parsed.detail);
            if (!job) {
                await interaction.reply({ content: "That job is no longer available.", ephemeral: true });
                return;
            }
            await startJobApplicationFromInteraction(interaction, job);
            return;
        }

        await interaction.update(render());
    });

    collector.on("end", () => {
        reply.edit({ components: [currentView === "MENU" || !selectedSector ? buildMenuContainer(prefix, message.author.id) : buildSectorContainer(selectedSector, currentPage, prefix, user, message.author.id).container] }).catch(() => { });
    });
}
