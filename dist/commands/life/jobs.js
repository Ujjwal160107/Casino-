"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleJobs = handleJobs;
const discord_js_1 = require("discord.js");
const jobService_1 = require("../../services/jobService");
const branding_1 = require("../../config/branding");
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const SECTORS = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];
async function handleJobs(message) {
    if (!message.guild)
        return;
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    // State
    let currentView = "MENU";
    let selectedSector = null;
    let currentPage = 0;
    const JOBS_PER_PAGE = 5;
    // --- HELPERS ---
    const getSectorInfo = (sector) => {
        switch (sector) {
            case "tech": return { name: "Technology", emoji: branding_1.Mascot.Emotes.JobTech, desc: "Software, Engineering, AI" };
            case "medical": return { name: "Medical", emoji: branding_1.Mascot.Emotes.JobMedical, desc: "Doctors, Surgery, Health" };
            case "business": return { name: "Business", emoji: branding_1.Mascot.Emotes.JobBusiness, desc: "Finance, Sales, Management" };
            case "legal": return { name: "Legal", emoji: branding_1.Mascot.Emotes.JobLegal, desc: "Law, Justice, Defense" };
            case "service": return { name: "Service", emoji: branding_1.Mascot.Emotes.JobService, desc: "Hospitality, Food, Care" };
            case "trade": return { name: "Skilled Trade", emoji: branding_1.Mascot.Emotes.JobTrade, desc: "Mechanics, Plumbing, Craft" };
            case "freelance": return { name: "Freelance", emoji: branding_1.Mascot.Emotes.JobWorking, desc: "Gig Economy, Self-Employed" };
            default: return { name: sector, emoji: "❓", desc: "Unknown Sector" };
        }
    };
    // --- EMBED GENERATORS ---
    const generateMenuEmbed = () => {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${branding_1.Mascot.Emotes.JobWorking} Career Center`)
            .setDescription(`Welcome to the **${branding_1.Mascot.Name}** Job Board!\n\nSelect a **Career Field** below to browse available positions.\nUse \`${config?.prefix}apply <job_id>\` to start your career.`)
            .setColor(branding_1.Mascot.Colors.Base)
            .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.JobWorking) || null)
            .setFooter({ text: "Choose a path to view details" });
        // Add a concise list of sectors in description for quick reading
        return embed;
    };
    const generateSectorEmbed = (sector, page) => {
        const jobs = (0, jobService_1.getJobsBySector)(sector);
        const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
        const info = getSectorInfo(sector);
        const start = page * JOBS_PER_PAGE;
        const end = start + JOBS_PER_PAGE;
        const displayedJobs = jobs.slice(start, end);
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${info.emoji} ${info.name} Careers`)
            .setDescription(`**${info.desc}**\n\nPage ${page + 1} of ${totalPages}`)
            .setColor(branding_1.Mascot.Colors.Base)
            .setThumbnail((0, branding_1.getEmoteUrl)(info.emoji) || null);
        for (const job of displayedJobs) {
            let reqText = "Degree: None";
            if (job.reqDegrees && job.reqDegrees.length > 0)
                reqText = `Degree: ${job.reqDegrees.join(", ")}`;
            if (job.reqJobId) {
                const prevJob = jobService_1.JOBS.find(j => j.id === job.reqJobId);
                const prevTitle = prevJob ? prevJob.title : job.reqJobId;
                reqText += `\nRequires: ${prevTitle}`;
            }
            embed.addFields({
                name: `${job.title} (\`${job.id}\`)`,
                value: `**${(0, format_1.fmtCurrency)((0, jobService_1.getJobPaySync)(job, config), config?.currencyEmoji)}** / shift ${reqText}`,
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
        const row1 = new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder().setCustomId("sector_tech").setLabel("Tech").setEmoji(branding_1.Mascot.Emotes.JobTech).setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("sector_medical").setLabel("Medical").setEmoji(branding_1.Mascot.Emotes.JobMedical).setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("sector_business").setLabel("Business").setEmoji(branding_1.Mascot.Emotes.JobBusiness).setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("sector_legal").setLabel("Legal").setEmoji(branding_1.Mascot.Emotes.JobLegal).setStyle(discord_js_1.ButtonStyle.Secondary));
        const row2 = new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder().setCustomId("sector_service").setLabel("Service").setEmoji(branding_1.Mascot.Emotes.JobService).setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("sector_trade").setLabel("Trades").setEmoji(branding_1.Mascot.Emotes.JobTrade).setStyle(discord_js_1.ButtonStyle.Secondary), new discord_js_1.ButtonBuilder().setCustomId("sector_freelance").setLabel("Freelance").setEmoji(branding_1.Mascot.Emotes.JobWorking).setStyle(discord_js_1.ButtonStyle.Secondary));
        return [row1, row2];
    };
    const generateSectorComponents = (sector, page) => {
        const jobs = (0, jobService_1.getJobsBySector)(sector);
        const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
        const navRow = new discord_js_1.ActionRowBuilder();
        // Previous
        navRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("jobs_prev")
            .setLabel("⬅️ Prev")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(page === 0));
        // Back to Menu (Center)
        navRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("jobs_back")
            .setLabel("🏠 Main Menu")
            .setStyle(discord_js_1.ButtonStyle.Primary));
        // Next
        navRow.addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("jobs_next")
            .setLabel("Next ➡️")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1));
        return [navRow];
    };
    // --- INITIAL SEND ---
    const reply = await message.reply({
        embeds: [generateMenuEmbed()],
        components: generateMenuComponents()
    });
    // --- COLLECTOR ---
    const collector = reply.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 300000, // 5 minutes
        filter: (i) => i.user.id === message.author.id
    });
    collector.on('collect', async (i) => {
        // Handle Interactions
        if (i.customId.startsWith("sector_")) {
            // Switch to Sector View
            const sectorName = i.customId.replace("sector_", "");
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
            if (currentView === "SECTOR")
                currentPage = Math.max(0, currentPage - 1);
        }
        else if (i.customId === "jobs_next") {
            if (currentView === "SECTOR")
                currentPage++;
        }
        // Update UI
        try {
            if (currentView === "MENU") {
                await i.update({
                    embeds: [generateMenuEmbed()],
                    components: generateMenuComponents()
                });
            }
            else if (currentView === "SECTOR" && selectedSector) {
                await i.update({
                    embeds: [generateSectorEmbed(selectedSector, currentPage)],
                    components: generateSectorComponents(selectedSector, currentPage)
                });
            }
        }
        catch (e) {
            console.error("Failed to update jobs interaction:", e);
        }
    });
    collector.on('end', () => {
        reply.edit({ components: [] }).catch(() => { });
    });
}
//# sourceMappingURL=jobs.js.map