"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCrime = handleCrime;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const guildConfigService_1 = require("../../services/guildConfigService");
const walletService_1 = require("../../services/walletService");
const jailService_1 = require("../../services/jailService");
const cooldown_1 = require("../../utils/cooldown");
const incomeService_1 = require("../../services/incomeService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const CRIME_EMOTE = "<:fortuna_criminal:1457054253771264276>";
const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";
const CRIMES = [
    { text: "robbed a convenience store", risk: 30, min: 500, max: 2000 },
    { text: "hacked an ATM", risk: 40, min: 1000, max: 3000 },
    { text: "smuggled illegal goods", risk: 50, min: 2000, max: 5000 },
    { text: "stole a car", risk: 60, min: 3000, max: 7000 },
    { text: "robbed a bank", risk: 80, min: 10000, max: 50000 }
];
async function handleCrime(message) {
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    if (user.isJailed) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "You are in Jail!", "You cannot commit crimes while in jail.")]
        });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const incomeConfig = await (0, incomeService_1.getIncomeConfigOrDefault)(message.guildId, "crime");
    // Legacy cooldown key used simple format, but setIncomeCooldown uses command-specific logic. 
    // We'll stick to a simple key for crime but use the configurable duration.
    const cooldownKey = `crime:${message.guildId}:${message.author.id}`;
    const cooldownTime = incomeConfig.cooldown;
    const remaining = (0, cooldown_1.checkDynamicCooldown)(cooldownKey, cooldownTime);
    if (remaining > 0) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Cool Down", `You must wait **${(0, format_1.formatDuration)(remaining * 1000)}** before committing another crime.`)]
        });
    }
    // Pick a random crime scenario
    const scenario = CRIMES[Math.floor(Math.random() * CRIMES.length)];
    // Risk calculation using Dashboard Config
    // If config.successPct is set (e.g. 60%), we succeed if roll <= 60.
    // We ignore the hardcoded scenario risk to allow dashboard control.
    const roll = Math.random() * 100;
    // We use <= because successPct is "Success Rate" (e.g. 75 means 75% success)
    if (roll <= incomeConfig.successPct) {
        // Success - Use Dashboard Configured Payouts
        const amount = Math.floor(Math.random() * (incomeConfig.maxPay - incomeConfig.minPay + 1)) + incomeConfig.minPay;
        await prisma_1.default.wallet.update({
            where: { id: user.wallet.id },
            data: { balance: { increment: amount } }
        });
        const embed = (0, embed_1.successEmbed)(message.author, `${CRIME_EMOTE} Crime Successful`, `You **${scenario.text}** and got away with **${(0, format_1.fmtCurrency)(amount, config.currencyEmoji)}**!`);
        embed.setThumbnail("https://cdn.discordapp.com/emojis/1457054253771264276.png"); // Using emote ID as image if possible, or just ignore if it's external.
        // Actually Discord emote IDs can be used as URLs: https://cdn.discordapp.com/emojis/<id>.png
        return message.reply({ embeds: [embed] });
    }
    else {
        // Failure -> Jail
        const releaseTime = await (0, jailService_1.jailUser)(user.id, message.guildId);
        const fine = config.jailFine;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${POLICE_EMOTE} BUSTED!`)
            .setDescription(`You tried to **${scenario.text}** but the police caught you!`)
            .addFields({ name: "Sentence", value: `You have been sent to jail.\nReleases: <t:${Math.floor(releaseTime.getTime() / 1000)}:R>`, inline: true }, { name: "Bail", value: `${(0, format_1.fmtCurrency)(fine, config.currencyEmoji)}`, inline: true })
            .setColor(0xFF0000)
            .setThumbnail("https://cdn.discordapp.com/emojis/1457053051582939237.png")
            .setFooter({ text: `Use ${config.prefix}bail to pay your way out or wait it out.` });
        return message.reply({ embeds: [embed] });
    }
}
//# sourceMappingURL=crime.js.map