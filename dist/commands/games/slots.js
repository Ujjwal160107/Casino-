"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEVEN = exports.GEM = exports.BELL = exports.MELON = exports.GRAPES = exports.BANANA = exports.CHERRY = void 0;
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
const questService_1 = require("../../services/questService");
exports.CHERRY = "<:cherri:1446428169786622053>";
exports.BANANA = "<:banano:1446428190837968989>";
exports.GRAPES = "<:graps:1446428294483542040>";
exports.MELON = "<:watermelon2:1446428567402709115>";
exports.BELL = "<:Bel:1446428665176129716>";
exports.GEM = "<:Gemm:1446428771266592819>";
exports.SEVEN = "<:sevenn:1446428916867661846>";
const SYMBOLS = [exports.CHERRY, exports.BANANA, exports.GRAPES, exports.MELON, exports.BELL, exports.GEM, exports.SEVEN];
// Probabilities for each tier (cumulative check)
// 2x: 15%, 3x: 7%, 5x: 4%, 10x: 1.5%, 20x: 0.5%
// Total Win Chance: ~28%
const PROBABILITIES = [
    { chance: 0.005, multiplier: 20, symbols: [exports.SEVEN] },
    { chance: 0.015, multiplier: 10, symbols: [exports.GEM] },
    { chance: 0.040, multiplier: 5, symbols: [exports.BELL] },
    { chance: 0.070, multiplier: 3, symbols: [exports.GRAPES, exports.MELON] },
    { chance: 0.150, multiplier: 2, symbols: [exports.CHERRY, exports.BANANA] }
];
function getSpinResult() {
    const roll = Math.random();
    let cumulative = 0;
    for (const tier of PROBABILITIES) {
        cumulative += tier.chance;
        if (roll < cumulative) {
            // WINNER
            const symbol = tier.symbols[Math.floor(Math.random() * tier.symbols.length)];
            return {
                reels: [symbol, symbol, symbol],
                win: true,
                multiplier: tier.multiplier,
                payout: 0 // Calculated later based on bet
            };
        }
    }
    // LOSER - Generate 3 reels that NOT all match
    // We pick random symbols until we get a non-win state
    let r1, r2, r3;
    do {
        r1 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        r2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        r3 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    } while (r1 === r2 && r2 === r3);
    return {
        reels: [r1, r2, r3],
        win: false,
        multiplier: 0,
        payout: 0
    };
}
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
    // Use new Probability Logic
    const result = getSpinResult();
    const reel1 = result.reels[0];
    const reel2 = result.reels[1];
    const reel3 = result.reels[2];
    let win = result.win;
    let multiplier = result.multiplier;
    let payout = amount * multiplier;
    let actualPayout = payout;
    try {
        actualPayout = await (0, gameService_1.placeBetWithTransaction)(user.id, user.wallet.id, "slots", amount, "spin", win, payout, message.guildId);
    }
    catch (e) {
        actualPayout = await (0, gameService_1.placeBetFallback)(user.wallet.id, user.id, "slots", amount, "spin", win, payout, message.guildId);
    }
    payout = actualPayout;
    await (0, questService_1.updateQuestProgress)(user.id, "GAMBLE").catch(console.error);
    if (win)
        await (0, questService_1.updateQuestProgress)(user.id, "WIN_SLOTS").catch(console.error);
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