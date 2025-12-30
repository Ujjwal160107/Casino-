"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCoinflip = handleCoinflip;
const discord_js_1 = require("discord.js");
const walletService_1 = require("../../services/walletService");
const gameService_1 = require("../../services/gameService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const cooldown_1 = require("../../utils/cooldown");
const branding_1 = require("../../config/branding");
async function handleCoinflip(message, args) {
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const amountStr = args[0];
    const choiceRaw = (args[1] || "").toLowerCase();
    if (!amountStr || !choiceRaw) {
        return message.reply({
            embeds: [
                (0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${config.prefix}cf <amount> <heads|tails>\``),
            ],
        });
    }
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    const amount = (0, format_1.parseBetAmount)(amountStr, user.wallet.balance);
    if (isNaN(amount) || amount <= 0) {
        return message.reply({
            embeds: [
                (0, embed_1.errorEmbed)(message.author, "Invalid Wager", "Please bet a valid positive amount."),
            ],
        });
    }
    const emoji = config.currencyEmoji;
    let choice;
    if (["heads", "head", "h"].includes(choiceRaw))
        choice = "heads";
    else if (["tails", "tail", "t"].includes(choiceRaw))
        choice = "tails";
    else {
        return message.reply({
            embeds: [
                (0, embed_1.errorEmbed)(message.author, "Invalid Choice", "Please choose `heads` or `tails`."),
            ],
        });
    }
    const cooldowns = config.gameCooldowns || {};
    const cdSeconds = cooldowns["cf"] || 0;
    if (cdSeconds > 0) {
        const key = `game:cf:${message.guildId}:${message.author.id}`;
        const remaining = (0, cooldown_1.checkCooldown)(key, cdSeconds);
        if (remaining > 0) {
            const expire = (0, cooldown_1.getCooldownExpiry)(key);
            const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Cooldown Active", `${branding_1.Mascot.Emotes.Angry} Please wait <t:${ts}:R> before flipping again.`)]
            });
        }
    }
    if (!user.wallet || user.wallet.balance < amount) {
        return message.reply({
            embeds: [
                (0, embed_1.errorEmbed)(message.author, "Insufficient Funds", "You don't have enough money."),
            ],
        });
    }
    const isHeads = Math.random() < 0.5;
    const result = isHeads ? "heads" : "tails";
    const didWin = choice === result;
    let payout = didWin ? amount * 2 : 0;
    let actualPayout = payout;
    try {
        actualPayout = await (0, gameService_1.placeBetWithTransaction)(user.id, user.wallet.id, "coinflip", amount, choice, didWin, payout, message.guildId);
    }
    catch (e) {
        actualPayout = await (0, gameService_1.placeBetFallback)(user.wallet.id, user.id, "coinflip", amount, choice, didWin, payout, message.guildId);
    }
    payout = actualPayout;
    const finalWalletBalance = user.wallet.balance - amount + payout;
    const finalWalletBalanceIntl = finalWalletBalance.toLocaleString("en-US");
    let footerIconURL;
    if (typeof emoji === "string") {
        const match = emoji.match(/\d{17,20}/);
        if (match) {
            footerIconURL = `https://cdn.discordapp.com/emojis/${match[0]}.gif?quality=lossless`;
        }
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(didWin ? "You Won!" : "You Lost")
        .setColor(didWin ? discord_js_1.Colors.Green : discord_js_1.Colors.Red)
        .setDescription(`**You Bet:** ${(0, format_1.fmtCurrency)(amount, emoji)} on \`${choice.toUpperCase()}\`\n` +
        `**The Coin Flipped:** 🪙 \`${result.toUpperCase()}\`\n\n` +
        (didWin
            ? `**Payout:** ${(0, format_1.fmtCurrency)(payout, emoji)}`
            : `**Lost:** ${(0, format_1.fmtCurrency)(amount, emoji)}`))
        .setFooter({
        text: `${branding_1.Mascot.Name} • ${message.author.username}'s Wallet: ${finalWalletBalanceIntl}`,
        iconURL: footerIconURL,
    });
    if (didWin) {
        embed.setThumbnail("https://media.tenor.com/d6Jd-9w8eJkAAAAC/success-kid-hell-yeah.gif");
    }
    else {
        const failUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Fail);
        // Only set fail thumbnail if not overriden or if specific logic applies (User said "where thumbnail... exist dont use it").
        // Coinflip loss didn't have a thumbnail before. So adding one is "enhancement" or "keeping it normal"?
        // "where thumbnail emojis already exist dont use it there keep it normal there"
        // Coinflips normally don't have a LOSS thumbnail. Adding one might be good.
        // Actually, let's Stick to the requested pattern: Use thumbnails for branding. 
        if (failUrl)
            embed.setThumbnail(failUrl);
    }
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=coinflip.js.map