"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetBetLimit = handleSetBetLimit;
const discord_js_1 = require("discord.js");
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const gameConfig_1 = require("../../config/gameConfig");
const branding_1 = require("../../config/branding");
const gameUtils_1 = require("../../utils/gameUtils");
async function handleSetBetLimit(message, args) {
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const prefix = config.prefix || "!";
    const EMOJI_TICK = gameConfig_1.GameConfig.Emojis.Tick || "✅";
    // Helper to get currency emoji
    let currencyEmoji = config.currencyEmoji;
    if (/^\d+$/.test(currencyEmoji)) {
        const e = message.guild?.emojis.cache.get(currencyEmoji);
        currencyEmoji = e ? e.toString() : "💰";
    }
    if (currencyEmoji === "1445732360204193824") {
        currencyEmoji = "<a:money:1445732360204193824>";
    }
    // View Mode
    if (args.length === 0) {
        const games = ["blackjack", "roulette", "slots", "coinflip", "cockfight"];
        const embed = new discord_js_1.EmbedBuilder()
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
            .setTitle(`${currencyEmoji} Game Bet Limits`)
            .setColor(discord_js_1.Colors.Blue)
            .setDescription(`Here are the current bet limits for each game.`)
            .setFooter({ text: `${branding_1.Mascot.Name} • Admin Config` })
            .setThumbnail(message.guild?.iconURL() || null);
        const globalMin = config.minBet || 100;
        const globalMax = config.maxBet || 100000;
        let desc = `**Global Defaults:**\nMin: **${globalMin}** | Max: **${globalMax}**\n\n`;
        for (const game of games) {
            const limits = (0, gameUtils_1.getGameBetLimits)(config, game);
            desc += `**${game.charAt(0).toUpperCase() + game.slice(1)}**\nMin: \`${limits.min}\` | Max: \`${limits.max}\`\n\n`;
        }
        embed.setDescription(desc);
        return message.reply({ embeds: [embed] });
    }
    // Set Mode
    const type = args[0].toLowerCase(); // min or max
    const gameRaw = args[1]?.toLowerCase();
    const amountRaw = args[2];
    if (!["min", "max"].includes(type)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage: \`${prefix}set-bet-limit max|min <game> <amount>\`\nExample: \`${prefix}set-bet-limit max blackjack 5000\``)] });
    }
    const validGames = ["blackjack", "roulette", "slots", "coinflip", "cockfight"];
    const game = validGames.find(g => g === gameRaw || (g === "bj" && gameRaw === "blackjack") || (g === "cf" && gameRaw === "cockfight"));
    if (!gameRaw || !validGames.includes(gameRaw)) {
        // Here also use prefix if needed, but errorEmbed title "Invalid Game" is fine.
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Game", `Supported games: ${validGames.map(g => `\`${g}\``).join(", ")}`)] });
    }
    const amount = parseInt(amountRaw);
    if (isNaN(amount) || amount < 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", "Please provide a valid positive number.")] });
    }
    // Update Config
    const currentLimits = config.gameBetLimits || {};
    if (!currentLimits[gameRaw])
        currentLimits[gameRaw] = {};
    if (type === "min") {
        currentLimits[gameRaw].min = amount;
    }
    else {
        currentLimits[gameRaw].max = amount;
    }
    await (0, guildConfigService_1.updateGuildConfig)(message.guildId, { gameBetLimits: currentLimits });
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_js_1.Colors.Green)
        .setDescription(`${EMOJI_TICK} Successfully set **${gameRaw}** **${type}** bet limit to **${amount}**.`);
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=betLimit.js.map