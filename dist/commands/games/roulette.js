"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRouletteMenu = handleRouletteMenu;
exports.handleBet = handleBet;
const discord_js_1 = require("discord.js");
const path_1 = __importDefault(require("path"));
const walletService_1 = require("../../services/walletService");
const gameService_1 = require("../../services/gameService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const cooldown_1 = require("../../utils/cooldown");
const branding_1 = require("../../config/branding");
const gameUtils_1 = require("../../utils/gameUtils");
const questService_1 = require("../../services/questService");
async function handleRouletteMenu(message) {
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const eCasino = "<a:casino:1445732641545654383>";
    const eScroll = "<:scroll:1446218234171887760>";
    const eDicesBtn = "<:dices:1446220119733702767>";
    const eBlackCoin = "<:BlackCoin:1446217613632999565>";
    const eRedCoin = "<:redcoin:1446217599439343772>";
    const eDiceSpecific = "<a:dice:1446217848551899300>";
    const parseEmojiId = (str) => str.match(/:(\d+)>/)?.[1] ?? (str.match(/^\d+$/) ? str : str);
    const bannerPath = path_1.default.join(process.cwd(), "src", "assets", "roulette_banner.png");
    const attachment = new discord_js_1.AttachmentBuilder(bannerPath, { name: "roulette_banner.png" });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${eCasino} Roulette Table`)
        .setDescription(`Welcome to ${branding_1.Mascot.Name}'s Casino! Test your luck on the wheel.`)
        .setColor(discord_js_1.Colors.Red)
        .setImage("attachment://roulette_banner.png")
        .setFooter({ text: "Click 'Guide' for rules or 'Play' to start." });
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("roul_guide")
        .setLabel("Guide")
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setEmoji(parseEmojiId(eScroll)), new discord_js_1.ButtonBuilder()
        .setCustomId("roul_play")
        .setLabel("How to Play")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setEmoji(parseEmojiId(eDicesBtn)));
    const sent = await message.reply({ embeds: [embed], components: [row], files: [attachment] });
    const collector = sent.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === message.author.id
    });
    collector.on("collect", async (i) => {
        if (i.customId === "roul_guide") {
            const guideEmbed = new discord_js_1.EmbedBuilder()
                .setTitle(`${eScroll} Roulette Rules`)
                .setColor(discord_js_1.Colors.Blue)
                .setDescription(`**Multipliers:**\n\n` +
                `${eRedCoin} **Red / ${eBlackCoin} Black:**\n` +
                `2x Payout (Win chance ~48.6%)\n\n` +
                `${eDiceSpecific} **Specific Number (0-36):**\n` +
                `35x Payout (Win chance ~2.7%)\n\n` +
                `🔵 **Odd / 🟡 Even:**\n` +
                `2x Payout\n\n` +
                `**House Edge:** The green **0** belongs to the house!`)
                .setFooter({ text: `${branding_1.Mascot.Name} Tips` });
            await i.reply({ embeds: [guideEmbed], ephemeral: true });
        }
        if (i.customId === "roul_play") {
            await i.reply({
                content: `To place a bet, type:\n\`${config.prefix}bet <amount> <choice>\`\n\n**Examples:**\n\`${config.prefix}bet 100 red\`\n\`${config.prefix}bet 500 17\`\n\`${config.prefix}bet 1000 odd\``,
                ephemeral: true
            });
        }
    });
}
async function handleBet(message, args) {
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    let amount = (0, format_1.parseBetAmount)(args[0], user.wallet.balance);
    let choiceRaw = (args[1] || "").toLowerCase();
    // Swap args if amount usage is reversed (flexibility)
    if (isNaN(amount)) {
        amount = (0, format_1.parseBetAmount)(args[1], user.wallet.balance);
        choiceRaw = (args[0] || "").toLowerCase();
    }
    if (isNaN(amount) || amount <= 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Wager", "Please bet a valid positive amount.")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const { min, max } = (0, gameUtils_1.getGameBetLimits)(config, "roulette");
    if (amount < min) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Bet Too Low", `The minimum bet for Roulette is **${(0, format_1.fmtCurrency)(min, emoji)}**.`)]
        });
    }
    if (amount > max) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Bet Too High", `The maximum bet for Roulette is **${(0, format_1.fmtCurrency)(max, emoji)}**.`)]
        });
    }
    const cooldowns = config.gameCooldowns || {};
    const cdSeconds = cooldowns["roulette"] || 0;
    if (cdSeconds > 0) {
        const key = `game:roulette:${message.guildId}:${message.author.id}`;
        const remaining = (0, cooldown_1.checkCooldown)(key, cdSeconds);
        if (remaining > 0) {
            const expire = (0, cooldown_1.getCooldownExpiry)(key);
            const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Cooldown Active", `${branding_1.Mascot.Emotes.Angry} Please wait <t:${ts}:R> before playing Roulette again.`)]
            });
        }
    }
    // ... (validations passed) ...
    if (user.wallet.balance < amount) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Insufficient Funds", "You don't have enough money in your wallet.")] });
    }
    // SPIN ANIMATION
    const spinTime = config.rouletteSpinTime || 3;
    const eCasino = "<a:casino:1445732641545654383>";
    const spinningEmbed = new discord_js_1.EmbedBuilder()
        .setTitle(`${eCasino} The wheel is spinning...`)
        .setDescription(`Rolling the ball... Good luck!`)
        .setColor(discord_js_1.Colors.Yellow)
        .setImage("https://media.tenor.com/7gKkK6W85GgAAAAC/roulette-casino.gif");
    const spinMsg = await message.reply({ embeds: [spinningEmbed] });
    await new Promise(resolve => setTimeout(resolve, spinTime * 1000));
    const spin = Math.floor(Math.random() * 37);
    const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const isRed = redNumbers.has(spin);
    const isBlack = !isRed && spin !== 0;
    let didWin = false;
    let multiplier = 0;
    if (choiceRaw === "red") {
        didWin = isRed;
        multiplier = 2;
    }
    else if (choiceRaw === "black") {
        didWin = isBlack;
        multiplier = 2;
    }
    else if (choiceRaw === "odd") {
        didWin = (spin !== 0 && spin % 2 !== 0);
        multiplier = 2;
    }
    else if (choiceRaw === "even") {
        didWin = (spin !== 0 && spin % 2 === 0);
        multiplier = 2;
    }
    else {
        const numChoice = parseInt(choiceRaw);
        if (!isNaN(numChoice) && numChoice >= 0 && numChoice <= 36) {
            didWin = (spin === numChoice);
            multiplier = 35;
        }
        else {
            // Clean up if error
            await spinMsg.delete().catch(() => { });
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Choice", "Bet on `red`, `black`, `odd`, `even`, or a number `0-36`.")] });
        }
    }
    let payout = didWin ? Math.floor(amount * multiplier) : 0;
    let actualPayout = payout;
    try {
        actualPayout = await (0, gameService_1.placeBetWithTransaction)(user.id, user.wallet.id, "roulette_v1", amount, choiceRaw, didWin, payout, message.guildId);
    }
    catch (e) {
        actualPayout = await (0, gameService_1.placeBetFallback)(user.wallet.id, user.id, "roulette_v1", amount, choiceRaw, didWin, payout, message.guildId);
    }
    payout = actualPayout;
    await (0, questService_1.updateQuestProgress)(user.id, "GAMBLE").catch(console.error);
    if (didWin)
        await (0, questService_1.updateQuestProgress)(user.id, "WIN_ROULETTE").catch(console.error);
    // Cleanup spinning message
    await spinMsg.delete().catch(() => { });
    const eRedCoin = "<:redcoin:1446217599439343772>";
    const eBlackCoin = "<:BlackCoin:1446217613632999565>";
    const displayColor = spin === 0 ? "🟢" : (isRed ? eRedCoin : eBlackCoin);
    const resultEmbed = new discord_js_1.EmbedBuilder()
        .setTitle(didWin ? `${branding_1.Mascot.Emotes.Money} Winner!` : `${branding_1.Mascot.Emotes.Fail} You Lost`)
        .setColor(didWin ? discord_js_1.Colors.Green : discord_js_1.Colors.Red)
        .setDescription(`**Result:** ${displayColor} **${spin}**\n` +
        `**Your Bet:** ${choiceRaw}\n` +
        `**${didWin ? "Won" : "Lost"}:** ${(0, format_1.fmtCurrency)(didWin ? payout : amount, emoji)}`)
        .setFooter({ text: `${branding_1.Mascot.Name} • ${message.author.username}'s Wallet: ${(user.wallet.balance - amount + payout).toLocaleString()}` });
    return message.reply({ content: `<@${message.author.id}>`, embeds: [resultEmbed] });
}
//# sourceMappingURL=roulette.js.map