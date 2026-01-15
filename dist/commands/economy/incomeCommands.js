"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncome = handleIncome;
const discord_js_1 = require("discord.js");
const branding_1 = require("../../config/branding");
const walletService_1 = require("../../services/walletService");
const incomeService_1 = require("../../services/incomeService");
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const discordLogger_1 = require("../../utils/discordLogger");
const branding_2 = require("../../config/branding");
const path_1 = __importDefault(require("path"));
const BEG_MESSAGES = [
    "A sketchy looking dude gave you **{amount}** because he thought you were one of his dealers.",
    "You found **{amount}** on the floor provided by the government.",
    "A nice old lady gave you **{amount}** and called you 'sweetie'.",
    "You did a backflip for **{amount}**. Worth it.",
    "Someone mistook you for a trash can and threw **{amount}** at you.",
    "You sang a song so bad they paid you **{amount}** to stop.",
    "You found **{amount}** in a fountain. Dreams do come true.",
    "A pigeon dropped **{amount}** on your head. Lucky?",
    "You begged for hours and finally got **{amount}**. Time is money?",
    "A time traveler gave you **{amount}** and said 'invest in doge'."
];
const BEG_FAIL_MESSAGES = [
    "You begged a cop and he fined you **{amount}** for loitering.",
    "Someone stole your begging cup. You lost **{amount}** replacing it.",
    "You tripped and dropped **{amount}** into a sewer.",
    "A stray dog peed on your leg. You spent **{amount}** on soap.",
    "You tried to beg from a statue. Passersby laughed and stole **{amount}**.",
    "You asked a mime for money. He invisibly robbed you of **{amount}**.",
    "You begged the wrong mafia boss. You paid **{amount}** for 'protection'."
];
const SLUT_MESSAGES = [
    "You did 'favors' for a stranger and earned **{amount}**.",
    "You posted feet pics and made **{amount}**.",
    "You sold your bath water for **{amount}**. Weirdo.",
    "You danced on a mailbox and someone threw **{amount}** at you.",
    "You worked the corner and made **{amount}**.",
    "You let someone call you 'mommy' for an hour and earned **{amount}**.",
    "You streamed on OnlyFans for 10 minutes and made **{amount}**.",
    "You sold a jar of your farts for **{amount}**. Capitalism, baby.",
    "You dated a discord mod and he gave you **{amount}** for Nitro.",
    "You wore a maid outfit to Walmart and strangers gave you **{amount}**.",
    "You sold your used socks to a sniffing enthusiast for **{amount}**.",
    "You whispered 'UWU' in a stranger's ear and they paid you **{amount}** to leave.",
    "You accidentally became a sugar baby and got **{amount}** allowance.",
    "You sold 'premium' snaps that were just pictures of your elbow for **{amount}**.",
    "You pretended to be an e-girl and scammed a simp for **{amount}**."
];
const SLUT_FAIL_MESSAGES = [
    "You tried to seduce a cop and got fined **{amount}**.",
    "Your 'client' ran off without paying. You lost **{amount}** on cab fare.",
    "You broke a heel running from the shame. Replacement cost: **{amount}**.",
    "You got caught by your mom! She took **{amount}** as punishment."
];
function getRandomMessage(messages, amount) {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    return msg.replace("{amount}", amount);
}
async function handleIncome(message) {
    const [cmd] = message.content.slice(1).split(/\s+/);
    const commandKey = cmd.toLowerCase();
    if (!["work", "beg", "slut"].includes(commandKey)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Unknown", "Use: !work, !beg or !slut")] });
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
            let description = `You earned **${(0, format_1.fmtCurrency)(res.amount, emoji)}**!`;
            // Use custom messages if available, otherwise fallback
            if (res.messages && res.messages.success && res.messages.success.length > 0) {
                description = getRandomMessage(res.messages.success, (0, format_1.fmtCurrency)(res.amount, emoji));
            }
            else if (commandKey === "beg") {
                description = getRandomMessage(BEG_MESSAGES, (0, format_1.fmtCurrency)(res.amount, emoji));
            }
            else if (commandKey === "slut") {
                description = getRandomMessage(SLUT_MESSAGES, (0, format_1.fmtCurrency)(res.amount, emoji));
            }
            const branded = (0, embed_1.successEmbed)(message.author, `${commandKey.toUpperCase()} SUCCESS`, description);
            const files = [];
            if (commandKey === "beg") {
                const thumbPath = path_1.default.join(process.cwd(), "src", "assets", "beg_thumbnail.png");
                const attachment = new discord_js_1.AttachmentBuilder(thumbPath, { name: "beg_thumbnail.png" });
                files.push(attachment);
                branded.setThumbnail("attachment://beg_thumbnail.png");
            }
            else {
                const moneyUrl = (0, branding_1.getEmoteUrl)(branding_2.Mascot.Emotes.Money);
                if (moneyUrl)
                    branded.setThumbnail(moneyUrl);
            }
            return message.reply({ embeds: [branded], files });
        }
        else {
            await (0, discordLogger_1.logToChannel)(message.client, {
                guild: message.guild,
                type: "ECONOMY",
                title: `Income Failed (${commandKey})`,
                description: `**User:** ${message.author.tag}\n**Penalty:** ${(0, format_1.fmtCurrency)(Math.abs(res.amount), emoji)}`,
                color: 0xFF0000
            });
            let description = `You lost **${(0, format_1.fmtCurrency)(Math.abs(res.amount), emoji)}**!`;
            // Use custom messages if available, otherwise fallback
            if (res.messages && res.messages.fail && res.messages.fail.length > 0) {
                description = getRandomMessage(res.messages.fail, (0, format_1.fmtCurrency)(Math.abs(res.amount), emoji));
            }
            else if (commandKey === "beg") {
                description = getRandomMessage(BEG_FAIL_MESSAGES, (0, format_1.fmtCurrency)(Math.abs(res.amount), emoji));
            }
            else if (commandKey === "slut") {
                description = getRandomMessage(SLUT_FAIL_MESSAGES, (0, format_1.fmtCurrency)(Math.abs(res.amount), emoji));
            }
            const branded = (0, embed_1.errorEmbed)(message.author, `${commandKey.toUpperCase()} FAILED`, description);
            const files = [];
            if (commandKey === "beg") {
                const thumbPath = path_1.default.join(process.cwd(), "src", "assets", "beg_thumbnail.png");
                const attachment = new discord_js_1.AttachmentBuilder(thumbPath, { name: "beg_thumbnail.png" });
                files.push(attachment);
                branded.setThumbnail("attachment://beg_thumbnail.png");
            }
            return message.reply({
                embeds: [branded],
                files
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