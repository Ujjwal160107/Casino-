import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import { JOBS, JobDefinition, getJob, getJobPaySync, getJobsBySector } from "../../services/jobService";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { jailUser } from "../../services/jailService";
import { checkDynamicCooldown } from "../../utils/cooldown";
import { getIncomeConfigOrDefault } from "../../services/incomeService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";
import prisma from "../../utils/prisma";

const CRIME_EMOTE = "<:fortuna_criminal:1457054253771264276>";
const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";

const CRIMES = [
    { text: "robbed a convenience store", risk: 30, min: 500, max: 2000 },
    { text: "hacked an ATM", risk: 40, min: 1000, max: 3000 },
    { text: "smuggled illegal goods", risk: 50, min: 2000, max: 5000 },
    { text: "stole a car", risk: 60, min: 3000, max: 7000 },
    { text: "robbed a bank", risk: 80, min: 10000, max: 50000 }
];

export const data = new SlashCommandBuilder()
    .setName("life")
    .setDescription("Life simulation commands")
    .addSubcommand(sub => sub.setName("work").setDescription("View job status or start work"))
    .addSubcommand(sub => sub.setName("crime").setDescription("Commit a crime"))
    .addSubcommand(sub => sub.setName("jobs").setDescription("Browse available jobs"))
    .addSubcommand(sub => sub.setName("education").setDescription("View education status or programs"))
    .addSubcommand(sub => sub.setName("degrees").setDescription("View earned degrees"));

export async function execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const config = await getGuildConfig(interaction.guildId!);

    if (sub === "work") {
        await interaction.deferReply();
        const user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId! } }
        });

        if (!user) return interaction.editReply("User not found.");

        // 1. Unemployed View
        if (!user.jobId) {
            const embed = new EmbedBuilder()
                .setTitle("Employment Status: Unemployed")
                .setDescription(`You currently do not have a job.\nUse \`/life jobs\` to browse available careers and apply!`)
                .setColor("#95A5A6")
                .setThumbnail("https://media.discordapp.net/attachments/1093496077363421256/1149712711102713886/interview.png");

            return interaction.editReply({ embeds: [embed] });
        }

        // 2. Employed View
        const job = getJob(user.jobId);
        if (!job) return interaction.editReply("Error: Invalid job ID.");

        const nextLevelJob = JOBS.find(j => j.reqJobId === job.id);
        let promoText = "You are at the top of the ladder!";
        let progress = 100;

        if (nextLevelJob) {
            let shiftsReq = 20;
            if (config?.jobShiftReqs) {
                const reqs = config.jobShiftReqs as Record<string, number>;
                if (reqs[nextLevelJob.id]) shiftsReq = reqs[nextLevelJob.id];
            }
            progress = Math.min((user.shiftsWorked / shiftsReq) * 100, 100);
            promoText = `Next Promotion: **${nextLevelJob.title}**\nProgress: ${Math.round(progress)}% (${user.shiftsWorked}/${shiftsReq} shifts)`;
        }

        const embed = new EmbedBuilder()
            .setAuthor({ name: `${interaction.user.username}'s Job Dashboard`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle(`${job.emoji} ${job.title}`)
            .setDescription(`**Position:** ${job.title}\n**Sector:** ${job.sector}`)
            .setColor(Mascot.Colors.Base as any)
            .addFields(
                { name: "Salary", value: fmtCurrency(getJobPaySync(job, config), config?.currencyEmoji), inline: true },
                { name: "Shifts Worked", value: user.shiftsWorked.toString(), inline: true },
                { name: "XP", value: user.jobXp.toString(), inline: true },
                { name: `${user.jobStress ?? 0 < 30 ? "Check" : "Alert"} Stress`, value: `${user.jobStress ?? 0}/100`, inline: true },
                { name: "Career Progress", value: promoText }
            )
            .setFooter({ text: "Use the buttons below to work or manage employment." });

        const thumb = getEmoteUrl(Mascot.Emotes.JobWorking);
        if (thumb) embed.setThumbnail(thumb);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("work_shift").setLabel("Start Shift").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.JobWorking),
            new ButtonBuilder().setCustomId("work_resign").setLabel("Resign").setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    if (sub === "crime") {
        await interaction.deferReply();
        const user = await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);

        if (user.isJailed) {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "You are in Jail!", "You cannot commit crimes while in jail.")] });
        }

        const incomeConfig = await getIncomeConfigOrDefault(interaction.guildId!, "crime");
        const cooldownKey = `crime:${interaction.guildId}:${interaction.user.id}`;
        const remaining = checkDynamicCooldown(cooldownKey, incomeConfig.cooldown);

        if (remaining > 0) {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Cool Down", `You must wait **${formatDuration(remaining * 1000)}**.`)] });
        }

        const scenario = CRIMES[Math.floor(Math.random() * CRIMES.length)];
        const roll = Math.random() * 100;

        if (roll <= incomeConfig.successPct) {
            const amount = Math.floor(Math.random() * (incomeConfig.maxPay - incomeConfig.minPay + 1)) + incomeConfig.minPay;
            await prisma.wallet.update({
                where: { id: user.wallet!.id },
                data: { balance: { increment: amount } }
            });
            const embed = successEmbed(interaction.user, `${CRIME_EMOTE} Crime Successful`, `You **${scenario.text}** and got away with **${fmtCurrency(amount, config.currencyEmoji)}**!`);
            embed.setThumbnail("https://cdn.discordapp.com/emojis/1457054253771264276.png");
            return interaction.editReply({ embeds: [embed] });
        } else {
            const releaseTime = await jailUser(user.id, interaction.guildId!);
            const fine = config.jailFine;
            const embed = new EmbedBuilder()
                .setTitle(`${POLICE_EMOTE} BUSTED!`)
                .setDescription(`You tried to **${scenario.text}** but the police caught you!`)
                .addFields(
                    { name: "Sentence", value: `You have been sent to jail.\nReleases: <t:${Math.floor(releaseTime.getTime() / 1000)}:R>`, inline: true },
                    { name: "Bail", value: `${fmtCurrency(fine, config.currencyEmoji)}`, inline: true }
                )
                .setColor(0xFF0000)
                .setThumbnail("https://cdn.discordapp.com/emojis/1457053051582939237.png")
                .setFooter({ text: `Use /jail bail to pay your way out.` });
            return interaction.editReply({ embeds: [embed] });
        }
    }

    if (sub === "jobs") {
        await interaction.deferReply();
        // Jobs Menu Logic - duplicated from jobs.ts but adapted for interaction
        const SECTORS: JobDefinition['sector'][] = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];
        const JOBS_PER_PAGE = 5;
        let currentView: "MENU" | "SECTOR" = "MENU";
        let selectedSector: JobDefinition['sector'] | null = null;
        let currentPage = 0;

        const getSectorInfo = (sector: string) => {
            // Simply map for now, assuming standard ones
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

    if (sub === "education") {
        await interaction.deferReply();
        const user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId! } },
            include: { currentEducation: { include: { degree: true } } }
        });

        if (!user) return interaction.editReply("User not found (try /start).");

        if (user.currentEducation) {
            const edu = user.currentEducation;
            const deg = edu.degree;
            const progress = Math.min(100, Math.round((edu.currentGpa / 6.0) * 100));
            const embed = new EmbedBuilder()
                .setTitle(`Student Dashboard: ${deg.name}`)
                .setDescription(`**Degree Fee Paid**: ${fmtCurrency(deg.tuitionPerSem, config?.currencyEmoji)}\n${progress}% to Graduation`)
                .setColor(edu.stress > 80 ? 0xFF0000 : 0x3498DB)
                .addFields(
                    { name: "Intelligence", value: `${edu.currentGpa.toFixed(1)} / 6.0`, inline: true },
                    { name: "Stress", value: `${edu.stress}/100`, inline: true }
                );
            if (edu.stress > 70) embed.setDescription(embed.data.description + `\n\n${Mascot.Emotes.Alert} **High Stress!**`);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("edu_stress_sports").setLabel("Sports").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Sports),
                new ButtonBuilder().setCustomId("edu_stress_gym").setLabel("Gym").setStyle(ButtonStyle.Primary).setEmoji(Mascot.Emotes.Gym),
                new ButtonBuilder().setCustomId("edu_stress_meditation").setLabel("Meditation").setStyle(ButtonStyle.Secondary).setEmoji(Mascot.Emotes.Meditation)
            );
            return interaction.editReply({ embeds: [embed], components: [row] });
        } else {
            // Listing logic (simplified for slash, full version is complex)
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("Education").setDescription("You are not enrolled. Use `/life enroll` (coming soon) or check `!education` for the full list.")] });
        }
    }

    if (sub === "degrees") {
        await interaction.deferReply();
        const user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId! } },
            include: { degrees: { include: { degree: true } } }
        });

        if (!user || user.degrees.length === 0) {
            return interaction.editReply({ embeds: [errorEmbed(interaction.user, "No Degrees", "You haven't earned any degrees yet.")] });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Graduate} Earned Degrees`)
            .setColor(0xF1C40F);

        for (const ud of user.degrees) {
            embed.addFields({ name: `🎓 ${ud.degree.name}`, value: `**GPA:** ${ud.finalGpa.toFixed(1)}`, inline: false });
        }
        return interaction.editReply({ embeds: [embed] });
    }
}
