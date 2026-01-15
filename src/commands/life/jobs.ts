import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, InteractionCollector, ButtonInteraction } from "discord.js";
import { JOBS, JobDefinition, getJobsBySector, getJobPaySync } from "../../services/jobService";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";

const SECTORS: JobDefinition['sector'][] = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];

export async function handleJobs(message: Message) {
    if (!message.guild) return;
    const config = await getGuildConfig(message.guild.id);

    // State
    let currentView: "MENU" | "SECTOR" = "MENU";
    let selectedSector: JobDefinition['sector'] | null = null;
    let currentPage = 0;
    const JOBS_PER_PAGE = 5;

    // --- HELPERS ---

    const getSectorInfo = (sector: string) => {
        switch (sector) {
            case "tech": return { name: "Technology", emoji: Mascot.Emotes.JobTech, desc: "Software, Engineering, AI" };
            case "medical": return { name: "Medical", emoji: Mascot.Emotes.JobMedical, desc: "Doctors, Surgery, Health" };
            case "business": return { name: "Business", emoji: Mascot.Emotes.JobBusiness, desc: "Finance, Sales, Management" };
            case "legal": return { name: "Legal", emoji: Mascot.Emotes.JobLegal, desc: "Law, Justice, Defense" };
            case "service": return { name: "Service", emoji: Mascot.Emotes.JobService, desc: "Hospitality, Food, Care" };
            case "trade": return { name: "Skilled Trade", emoji: Mascot.Emotes.JobTrade, desc: "Mechanics, Plumbing, Craft" };
            case "freelance": return { name: "Freelance", emoji: Mascot.Emotes.JobWorking, desc: "Gig Economy, Self-Employed" };
            default: return { name: sector, emoji: "❓", desc: "Unknown Sector" };
        }
    };

    // --- EMBED GENERATORS ---

    const generateMenuEmbed = () => {
        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.JobWorking} Career Center`)
            .setDescription(`Welcome to the **${Mascot.Name}** Job Board!\n\nSelect a **Career Field** below to browse available positions.\nUse \`${config?.prefix}apply <job_id>\` to start your career.`)
            .setColor(Mascot.Colors.Base as any)
            .setThumbnail(getEmoteUrl(Mascot.Emotes.JobWorking) || null)
            .setFooter({ text: "Choose a path to view details" });

        // Add a concise list of sectors in description for quick reading
        return embed;
    };

    const generateSectorEmbed = (sector: JobDefinition['sector'], page: number) => {
        const jobs = getJobsBySector(sector);
        const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
        const info = getSectorInfo(sector);

        const start = page * JOBS_PER_PAGE;
        const end = start + JOBS_PER_PAGE;
        const displayedJobs = jobs.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle(`${info.emoji} ${info.name} Careers`)
            .setDescription(`**${info.desc}**\n\nPage ${page + 1} of ${totalPages}`)
            .setColor(Mascot.Colors.Base as any)
            .setThumbnail(getEmoteUrl(info.emoji) || null);

        for (const job of displayedJobs) {
            let reqText = "Degree: None";
            if (job.reqDegrees && job.reqDegrees.length > 0) reqText = `Degree: ${job.reqDegrees.join(", ")}`;

            if (job.reqJobId) {
                const prevJob = JOBS.find(j => j.id === job.reqJobId);
                const prevTitle = prevJob ? prevJob.title : job.reqJobId;
                reqText += `\nRequires: ${prevTitle}`;
            }

            embed.addFields({
                name: `${job.title} (\`${job.id}\`)`,
                value: `**${fmtCurrency(getJobPaySync(job, config), config?.currencyEmoji)}** / shift ${reqText}`,
                inline: false
            });
        }

        if (displayedJobs.length === 0) {
            embed.setDescription("No jobs available in this sector yet.");
        }

        return embed;
    };

    // --- COMPONENT GENERATORS ---

    const generateMenuComponents = () => {
        // Create rows of buttons (Max 5 per row)
        // Row 1: Tech, Med, Biz, Legal
        // Row 2: Service, Trade, Freelance

        const row1 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder().setCustomId("sector_tech").setLabel("Tech").setEmoji(Mascot.Emotes.JobTech).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("sector_medical").setLabel("Medical").setEmoji(Mascot.Emotes.JobMedical).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("sector_business").setLabel("Business").setEmoji(Mascot.Emotes.JobBusiness).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("sector_legal").setLabel("Legal").setEmoji(Mascot.Emotes.JobLegal).setStyle(ButtonStyle.Secondary),
            );

        const row2 = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder().setCustomId("sector_service").setLabel("Service").setEmoji(Mascot.Emotes.JobService).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("sector_trade").setLabel("Trades").setEmoji(Mascot.Emotes.JobTrade).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("sector_freelance").setLabel("Freelance").setEmoji(Mascot.Emotes.JobWorking).setStyle(ButtonStyle.Secondary),
            );

        return [row1, row2];
    };

    const generateSectorComponents = (sector: JobDefinition['sector'], page: number) => {
        const jobs = getJobsBySector(sector);
        const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);

        const navRow = new ActionRowBuilder<ButtonBuilder>();

        // Previous
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId("jobs_prev")
                .setLabel("⬅️ Prev")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0)
        );

        // Back to Menu (Center)
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId("jobs_back")
                .setLabel("🏠 Main Menu")
                .setStyle(ButtonStyle.Primary)
        );

        // Next
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId("jobs_next")
                .setLabel("Next ➡️")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );

        return [navRow];
    };

    // --- INITIAL SEND ---

    const reply = await message.reply({
        embeds: [generateMenuEmbed()],
        components: generateMenuComponents()
    });

    // --- COLLECTOR ---

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
        filter: (i) => i.user.id === message.author.id
    });

    collector.on('collect', async (i: ButtonInteraction) => {
        // Handle Interactions
        if (i.customId.startsWith("sector_")) {
            // Switch to Sector View
            const sectorName = i.customId.replace("sector_", "") as JobDefinition['sector'];
            if (SECTORS.includes(sectorName)) {
                currentView = "SECTOR";
                selectedSector = sectorName;
                currentPage = 0;
            }
        }
        else if (i.customId === "jobs_back") {
            // Switch to Menu
            currentView = "MENU";
            selectedSector = null;
            currentPage = 0;
        }
        else if (i.customId === "jobs_prev") {
            if (currentView === "SECTOR") currentPage = Math.max(0, currentPage - 1);
        }
        else if (i.customId === "jobs_next") {
            if (currentView === "SECTOR") currentPage++;
        }

        // Update UI
        try {
            if (currentView === "MENU") {
                await i.update({
                    embeds: [generateMenuEmbed()],
                    components: generateMenuComponents()
                });
            } else if (currentView === "SECTOR" && selectedSector) {
                await i.update({
                    embeds: [generateSectorEmbed(selectedSector, currentPage)],
                    components: generateSectorComponents(selectedSector, currentPage)
                });
            }
        } catch (e) {
            console.error("Failed to update jobs interaction:", e);
        }
    });

    collector.on('end', () => {
        reply.edit({ components: [] }).catch(() => { });
    });
}
