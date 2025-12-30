"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncome = handleIncome;
const branding_1 = require("../../config/branding");
const walletService_1 = require("../../services/walletService");
const incomeService_1 = require("../../services/incomeService");
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const discordLogger_1 = require("../../utils/discordLogger");
const branding_2 = require("../../config/branding");
async function handleIncome(message) {
    const [cmd] = message.content.slice(1).split(/\s+/);
    const commandKey = cmd.toLowerCase();
    if (!["work", "crime", "beg", "slut"].includes(commandKey)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Unknown", "Use: !work, !crime, !beg or !slut")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    try {
        const res = await (0, incomeService_1.runIncomeCommand)({
            commandKey,
            discordId: message.author.id,
            guildId: message.guildId ?? null,
            userId: user.id,
            walletId: user.wallet.id
        });
        if (res.success) {
            await (0, discordLogger_1.logToChannel)(message.client, {
                guild: message.guild,
                type: "ECONOMY",
                title: `Income Success (${commandKey})`,
                description: `**User:** ${message.author.tag}\n**Amount:** ${(0, format_1.fmtCurrency)(res.amount, emoji)}`,
                color: 0x00FF00
            });
            const branded = (0, embed_1.successEmbed)(message.author, `${commandKey.toUpperCase()} SUCCESS`, `You earned **${(0, format_1.fmtCurrency)(res.amount, emoji)}**!`);
            const moneyUrl = (0, branding_1.getEmoteUrl)(branding_2.Mascot.Emotes.Money);
            if (moneyUrl)
                branded.setThumbnail(moneyUrl);
            return message.reply({ embeds: [branded] });
        }
        else {
            await (0, discordLogger_1.logToChannel)(message.client, {
                guild: message.guild,
                type: "ECONOMY",
                title: `Income Failed (${commandKey})`,
                description: `**User:** ${message.author.tag}\n**Penalty:** ${(0, format_1.fmtCurrency)(Math.abs(res.amount), emoji)}`,
                color: 0xFF0000
            });
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, `${commandKey.toUpperCase()} FAILED`, `You lost **${(0, format_1.fmtCurrency)(Math.abs(res.amount), emoji)}**!`)]
            });
        }
    }
    catch (err) {
        // Cooldown or other errors
        const isCooldown = err.message.toLowerCase().includes("wait");
        if (isCooldown) {
            const branded = (0, embed_1.errorEmbed)(message.author, "Cooldown Active", err.message);
            const angryUrl = (0, branding_1.getEmoteUrl)(branding_2.Mascot.Emotes.Angry);
            if (angryUrl)
                branded.setThumbnail(angryUrl);
            return message.reply({ embeds: [branded] });
        }
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", err.message)] });
    }
}
//# sourceMappingURL=incomeCommands.js.map