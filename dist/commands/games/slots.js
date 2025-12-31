"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSlots = handleSlots;
const discord_js_1 = require("discord.js");
const branding_1 = require("../../config/branding");
const walletService_1 = require("../../services/walletService");
const gameService_1 = require("../../services/gameService");
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const cooldown_1 = require("../../utils/cooldown");
const gameUtils_1 = require("../../utils/gameUtils");
const CHERRY = "<:cherri:1446428169786622053>";
const BANANA = "<:banano:1446428190837968989>";
const GRAPES = "<:graps:1446428294483542040>";
const MELON = "<:watermelon2:1446428567402709115>";
const BELL = "<:Bel:1446428665176129716>";
const GEM = "<:Gemm:1446428771266592819>";
const SEVEN = "<:sevenn:1446428916867661846>";
const SYMBOLS = [CHERRY, BANANA, GRAPES, MELON, BELL, GEM, SEVEN];
const MULTIPLIERS = {
    [CHERRY]: 2,
    [BANANA]: 2,
    [GRAPES]: 3,
    [MELON]: 3,
    [BELL]: 5,
    [GEM]: 10,
    [SEVEN]: 20
};
async function handleSlots(message, args) {
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const user = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    const bet = (0, format_1.parseBetAmount)(args[0], user.wallet.balance);
    if (isNaN(bet) || bet <= 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Bet", `Usage: \`${config.prefix}slots <amount>\``)] });
    }
    const amount = bet;
    const emoji = config.currencyEmoji;
    const { min, max } = (0, gameUtils_1.getGameBetLimits)(config, "slots");
    if (amount < min) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Bet Too Low", `The minimum bet for Slots is **${(0, format_1.fmtCurrency)(min, emoji)}**.`)]
        });
    }
    if (amount > max) {
        return message.reply({
            embeds: [(0, embed_1.errorEmbed)(message.author, "Bet Too High", `The maximum bet for Slots is **${(0, format_1.fmtCurrency)(max, emoji)}**.`)]
        });
    }
    const cooldowns = config.gameCooldowns || {};
    const cdSeconds = cooldowns["slots"] || 0;
    if (cdSeconds > 0) {
        const key = `game:slots:${message.guildId}:${message.author.id}`;
        const remaining = (0, cooldown_1.checkCooldown)(key, cdSeconds);
        if (remaining > 0) {
            const expire = (0, cooldown_1.getCooldownExpiry)(key);
            const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Cooldown Active", `${branding_1.Mascot.Emotes.Angry} Please wait <t:${ts}:R> before playing Slots again.`)]
            });
        }
    }
    if (user.wallet.balance < amount) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Insufficient Funds", "You don't have enough money.")] });
    }
    const reel1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const reel2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const reel3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    let win = false;
    let payout = 0;
    let multiplier = 0;
    if (reel1 === reel2 && reel2 === reel3) {
        win = true;
        multiplier = MULTIPLIERS[reel1];
        payout = amount * multiplier;
    }
    let actualPayout = payout;
    try {
        actualPayout = await (0, gameService_1.placeBetWithTransaction)(user.id, user.wallet.id, "slots", amount, "spin", win, payout, message.guildId);
    }
    catch (e) {
        actualPayout = await (0, gameService_1.placeBetFallback)(user.wallet.id, user.id, "slots", amount, "spin", win, payout, message.guildId);
    }
    payout = actualPayout;
    const eTitle = "<a:casino:1445732641545654383>";
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`${eTitle} Slots`)
        .setColor(win ? discord_js_1.Colors.Green : discord_js_1.Colors.Red)
        .setDescription(`**[ ${reel1} | ${reel2} | ${reel3} ]**\n\n` +
        (win
            ? `**JACKPOT!** You won **${(0, format_1.fmtCurrency)(payout, emoji)}**! (x${multiplier})`
            : `Better luck next time... You lost **${(0, format_1.fmtCurrency)(amount, emoji)}**.`))
        .setFooter({ text: `${branding_1.Mascot.Name} • ${message.author.username}'s Wallet: ${(user.wallet.balance - amount + payout).toLocaleString()}` });
    if (win) {
        const url = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
        if (url)
            embed.setThumbnail(url);
    }
    else {
        const url = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Fail);
        if (url)
            embed.setThumbnail(url);
    }
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=slots.js.map