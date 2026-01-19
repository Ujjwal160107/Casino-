
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import { getJobsBySector, getJobPaySync, JobDefinition } from "../../services/jobService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("jobs")
    .setDescription("Browse available jobs");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId!);
    const SECTORS: JobDefinition['sector'][] = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];
    const JOBS_PER_PAGE = 5;
    let currentView: "MENU" | "SECTOR" = "MENU";
    let selectedSector: JobDefinition['sector'] | null = null;
    let currentPage = 0;

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

    const generateMenuEmbed = () => new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.JobWorking} Career Center`)
        .setDescription(`Welcome to the **${Mascot.Name}** Job Board!\n\nSelect a **Career Field** below.`)
        .setColor(Mascot.Colors.Base as any);

    const generateSectorEmbed = (sector: JobDefinition['sector'], page: number) => {
        const jobs = getJobsBySector(sector);
        const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
        const info = getSectorInfo(sector);
        const start = page * JOBS_PER_PAGE;
        const displayedJobs = jobs.slice(start, start + JOBS_PER_PAGE);

        const embed = new EmbedBuilder()
            .setTitle(`${info.emoji} ${info.name} Careers`)
            .setDescription(`**${info.desc}**\n\nPage ${page + 1} of ${totalPages}`)
            .setColor(Mascot.Colors.Base as any);

        for (const job of displayedJobs) {
            embed.addFields({
                name: `${job.title} (\`${job.id}\`)`,
                value: `**${fmtCurrency(getJobPaySync(job, config), config?.currencyEmoji)}** / shift`,
                inline: false
            });
        }
        if (displayedJobs.length === 0) embed.setDescription("No jobs available.");
        return embed;
    };

    const generateMenuComponents = () => {
        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("sector_tech").setLabel("Tech").setEmoji(Mascot.Emotes.JobTech).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sector_medical").setLabel("Medical").setEmoji(Mascot.Emotes.JobMedical).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sector_business").setLabel("Business").setEmoji(Mascot.Emotes.JobBusiness).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sector_legal").setLabel("Legal").setEmoji(Mascot.Emotes.JobLegal).setStyle(ButtonStyle.Secondary),
        );
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("sector_service").setLabel("Service").setEmoji(Mascot.Emotes.JobService).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sector_trade").setLabel("Trades").setEmoji(Mascot.Emotes.JobTrade).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("sector_freelance").setLabel("Freelance").setEmoji(Mascot.Emotes.JobWorking).setStyle(ButtonStyle.Secondary),
        );
        return [row1, row2];
    };

    const generateSectorComponents = (sector: JobDefinition['sector'], page: number) => {
        const jobs = getJobsBySector(sector);
        const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
        const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("jobs_prev").setLabel("⬅️ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId("jobs_back").setLabel("🏠 Main Menu").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("jobs_next").setLabel("Next ➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
        );
        return [navRow];
    };

    const sentMsg = await interaction.editReply({ embeds: [generateMenuEmbed()], components: generateMenuComponents() });

    const collector = sentMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000,
        filter: (i) => i.user.id === interaction.user.id
    });

    collector.on('collect', async (i: ButtonInteraction) => {
        if (i.customId.startsWith("sector_")) {
            currentView = "SECTOR";
            selectedSector = i.customId.replace("sector_", "") as any;
            currentPage = 0;
        } else if (i.customId === "jobs_back") {
            currentView = "MENU";
            selectedSector = null;
        } else if (i.customId === "jobs_prev" && currentView === "SECTOR") {
            currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === "jobs_next" && currentView === "SECTOR") {
            currentPage++;
        }

        if (currentView === "MENU") {
            await i.update({ embeds: [generateMenuEmbed()], components: generateMenuComponents() });
        } else if (currentView === "SECTOR" && selectedSector) {
            await i.update({ embeds: [generateSectorEmbed(selectedSector, currentPage)], components: generateSectorComponents(selectedSector, currentPage) });
        }
    });
}
