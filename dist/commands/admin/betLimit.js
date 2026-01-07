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
    const validGames = ["blackjack", "roulette", "slots", "coinflip", "cockfight"];
    // Helper to normalize game name
    const normalizeGame = (input) => {
        if (!input)
            return null;
        input = input.toLowerCase();
        if (input === "bj")
            return "blackjack";
        if (input === "roul")
            return "roulette";
        if (input === "cf")
            return "cockfight";
        if (input === "slot")
            return "slots";
        if (validGames.includes(input))
            return input;
        return null;
    };
    // View Mode (All)
    if (args.length === 0) {
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
        for (const game of validGames) {
            const limits = (0, gameUtils_1.getGameBetLimits)(config, game);
            desc += `**${game.charAt(0).toUpperCase() + game.slice(1)}**\nMin: \`${limits.min}\` | Max: \`${limits.max}\`\n\n`;
        }
        embed.setDescription(desc);
        return message.reply({ embeds: [embed] });
    }
    // Check if first arg is a game for Specific View Mode
    // If arg[0] is game and NO arg[1] (or arg[1] is not amount/min/max properly?)
    // Actually standard syntax is: set-bet-limit min <game> <amount>
    // New requested syntax: bet-limit <game>
    const possibleGame = normalizeGame(args[0]);
    if (possibleGame && args.length === 1) {
        const limits = (0, gameUtils_1.getGameBetLimits)(config, possibleGame);
        const maxDisplay = limits.max === Infinity ? "Infinity" : limits.max;
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle(`${currencyEmoji} ${possibleGame.charAt(0).toUpperCase() + possibleGame.slice(1)} Limits`)
            .setColor(discord_js_1.Colors.Blue)
            .setDescription(`**Min:** \`${limits.min}\`\n**Max:** \`${maxDisplay}\``);
        return message.reply({ embeds: [embed] });
    }
    // Set Mode
    const type = args[0].toLowerCase(); // min or max
    const gameRaw = args[1]?.toLowerCase();
    const amountRaw = args[2];
    if (!["min", "max"].includes(type)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", `Usage:\n\`${prefix}bet-limit\` (View All)\n\`${prefix}bet-limit <game>\` (View Game)\n\`${prefix}bet-limit max|min <game> <amount|infinity>\` (Set Limit)`)] });
    }
    const game = normalizeGame(gameRaw);
    if (!game) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Game", `Supported games: ${validGames.map(g => `\`${g}\``).join(", ")}`)] });
    }
    let amount = parseInt(amountRaw);
    if (["infinity", "inf", "unlimited", "none"].includes(amountRaw.toLowerCase())) {
        amount = -1;
    }
    if (isNaN(amount) || (amount < 0 && amount !== -1)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", "Please provide a valid positive number or 'infinity'.")] });
    }
    // Update Config
    const currentLimits = config.gameBetLimits || {};
    if (!currentLimits[game])
        currentLimits[game] = {}; // Use normalized key
    if (type === "min") {
        currentLimits[game].min = amount;
    }
    else {
        currentLimits[game].max = amount;
    }
    await (0, guildConfigService_1.updateGuildConfig)(message.guildId, { gameBetLimits: currentLimits });
    const displayAmount = amount === -1 ? "Infinity" : amount;
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(discord_js_1.Colors.Green)
        .setDescription(`${EMOJI_TICK} Successfully set **${game}** **${type}** bet limit to **${displayAmount}**.`);
    return message.reply({ embeds: [embed] });
}
//# sourceMappingURL=betLimit.js.map