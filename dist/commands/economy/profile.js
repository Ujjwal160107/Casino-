"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfileEmbed = getProfileEmbed;
exports.handleProfile = handleProfile;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const walletService_1 = require("../../services/walletService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const branding_1 = require("../../config/branding");
const jobService_1 = require("../../services/jobService");
const stockService_1 = require("../../services/stockService");
const propertyService_1 = require("../../services/propertyService");
async function getProfileEmbed(targetUser, guildId) {
    // 1. Fetch Comprehensive Data
    let userDb = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        include: {
            wallet: true,
            bank: true,
            loans: true,
            degrees: { include: { degree: true } },
            inventory: { include: { shopItem: true } },
            workLogs: false
        }
    });
    if (!userDb) {
        await (0, walletService_1.ensureUserAndWallet)(targetUser.id, guildId, targetUser.username);
        userDb = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: targetUser.id, guildId } },
            include: {
                wallet: true,
                bank: true,
                loans: true,
                degrees: { include: { degree: true } },
                inventory: { include: { shopItem: true } },
                workLogs: false
            }
        });
        if (!userDb)
            throw new Error("Failed to initialize user.");
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const emoji = config.currencyEmoji;
    // 2. Financials
    const walletBal = userDb.wallet?.balance || 0;
    const bankBal = userDb.bank?.balance || 0;
    const loanDebt = userDb.loans.reduce((sum, loan) => sum + (loan.status === "ACTIVE" ? loan.totalRepayment : 0), 0);
    // Stock Portfolio
    const portfolio = await (0, stockService_1.getPortfolio)(guildId, targetUser.id);
    let stockValue = 0;
    if (portfolio) {
        stockValue = portfolio.holdings.reduce((sum, h) => sum + (h.stock.currentPrice * h.quantity), 0);
    }
    // Inventory Value
    const invValue = userDb.inventory.reduce((sum, item) => sum + (item.shopItem.price * item.amount), 0);
    // Net Worth
    const netWorth = walletBal + bankBal + stockValue + invValue - loanDebt;
    // 3. Career & Education
    let jobDisplay = "Unemployed";
    let salaryDisplay = "0";
    if (userDb.jobId) {
        const job = (0, jobService_1.getJob)(userDb.jobId);
        if (job) {
            const pay = await (0, jobService_1.getJobPay)(job, guildId);
            jobDisplay = `${job.emoji} ${job.title} (${job.sector})`;
            salaryDisplay = (0, format_1.fmtCurrency)(pay, emoji);
        }
    }
    const degrees = userDb.degrees.map(d => d.degree.name).join("\n") || "No Degrees";
    // 4. Chicken Stats
    const chickenItem = userDb.inventory.find(i => i.shopItem.name.toLowerCase() === "chicken");
    let chickenDisplay = "No Chicken";
    if (chickenItem) {
        const meta = chickenItem.meta || {};
        const level = meta.level || 0;
        const wins = meta.wins || 0;
        const name = meta.name || "Chicken";
        chickenDisplay = `${branding_1.Mascot.Emotes.Chicken} **${name}** (Lvl ${level} | ${wins} Wins)`;
    }
    // 5. Property Stats
    const ownedProperties = await propertyService_1.PropertyService.getOwnedProperties(targetUser.id, guildId);
    const propertyCount = ownedProperties.length;
    const totalPropertyIncome = ownedProperties.reduce((sum, p) => sum + p.property.incomePerCycle, 0);
    // 6. Construct Embed
    return new discord_js_1.EmbedBuilder()
        .setColor(branding_1.Mascot.Colors.Base)
        .setTitle(`${branding_1.Mascot.Emotes.Success} User Profile: ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`**Level ${userDb.level}** • **${userDb.xp} XP**\nCredit Score: **${userDb.creditScore}**`)
        .addFields({
        name: `${branding_1.Mascot.Emotes.MoneyBag} Wealth`,
        value: `
**Wallet:** ${(0, format_1.fmtCurrency)(walletBal, emoji)}
**Bank:** ${(0, format_1.fmtCurrency)(bankBal, emoji)}
**Stocks:** ${(0, format_1.fmtCurrency)(stockValue, emoji)}
**Net Worth:** ${(0, format_1.fmtCurrency)(netWorth, emoji)}
`,
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.JobWorking} Career`,
        value: `
**Job:** ${jobDisplay}
**Salary:** ${salaryDisplay}/shift
**Shifts:** ${userDb.shiftsWorked}
**Stress:** ${userDb.jobStress}%
`,
        inline: true
    }, {
        name: `${branding_1.Mascot.Emotes.Graduate} Education`,
        value: degrees,
        inline: false
    }, {
        name: `${branding_1.Mascot.Emotes.Graph} Assets & Liabilities`,
        value: `
**Inventory Value:** ${(0, format_1.fmtCurrency)(invValue, emoji)}
**Active Debt:** ${(0, format_1.fmtCurrency)(loanDebt, emoji)}
**Properties:** ${propertyCount} (Inc: ${(0, format_1.fmtCurrency)(totalPropertyIncome, emoji)})
**Chicken:** ${chickenDisplay}
`,
        inline: false
    })
        .setFooter({ text: `${branding_1.Mascot.Name} System • ID: ${targetUser.id}` });
}
async function handleProfile(message, args) {
    const targetUser = message.mentions.users.first() || message.author;
    const guildId = message.guildId;
    try {
        const embed = await getProfileEmbed(targetUser, guildId);
        // Interactive Buttons
        const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId("prof_refresh").setLabel("Refresh").setStyle(discord_js_1.ButtonStyle.Secondary).setEmoji("🔄"));
        const reply = await message.reply({ embeds: [embed], components: [row] });
        // Refresh Collector
        const collector = reply.createMessageComponentCollector({ componentType: discord_js_1.ComponentType.Button, time: 60000 });
        collector.on("collect", async (i) => {
            // Allow only the original command author to control? Or maybe the target user too?
            // Usually author.
            if (i.user.id !== message.author.id)
                return i.reply({ content: "Not your session.", ephemeral: true });
            if (i.customId === "prof_refresh") {
                try {
                    const newEmbed = await getProfileEmbed(targetUser, guildId);
                    await i.update({ embeds: [newEmbed] });
                }
                catch (err) {
                    await i.reply({ content: "Failed to refresh.", ephemeral: true });
                }
            }
        });
        collector.on("end", () => {
            reply.edit({ components: [] }).catch(() => { });
        });
    }
    catch (e) {
        console.error("Profile Error:", e);
        message.reply({ embeds: [new discord_js_1.EmbedBuilder().setColor("Red").setTitle("Error").setDescription("Failed to load profile.")] });
    }
}
//# sourceMappingURL=profile.js.map