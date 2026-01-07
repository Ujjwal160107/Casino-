"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drop = void 0;
const discord_js_1 = require("discord.js");
const casinoDropService_1 = require("../../services/casinoDropService");
const format_1 = require("../../utils/format");
const drop = async (message, args) => {
    // !drop <amount> [channel]
    if (!message.member?.permissions.has(discord_js_1.PermissionsBitField.Flags.Administrator)) {
        return message.reply("You need Administrator permissions to use this.");
    }
    if (args.length < 1) {
        return message.reply("Usage: `!drop <amount|min-max> [channel]`\nExample: `!drop 100-500` or `!drop 1k`");
    }
    const amountArg = args[0];
    let amount = 0;
    if (amountArg.includes("-")) {
        const [minStr, maxStr] = amountArg.split("-");
        const min = (0, format_1.parseSmartAmount)(minStr);
        const max = (0, format_1.parseSmartAmount)(maxStr);
        if (isNaN(min) || isNaN(max) || min <= 0 || max < min) {
            return message.reply("Invalid range. Format: `min-max` (e.g., `100-500`)");
        }
        amount = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    else {
        amount = (0, format_1.parseSmartAmount)(amountArg);
    }
    if (isNaN(amount) || amount <= 0)
        return message.reply("Invalid amount.");
    let targetChannel = message.channel;
    if (args[1]) {
        const cid = args[1].replace(/[<#>]/g, "");
        const ch = message.guild?.channels.cache.get(cid);
        if (ch && ch instanceof discord_js_1.TextChannel) {
            targetChannel = ch;
        }
        else {
            return message.reply("Invalid channel.");
        }
    }
    await casinoDropService_1.CasinoDropService.spawnDrop(message.client, message.guild.id, targetChannel.id, amount);
    message.delete().catch(() => { }); // Delete command message for cleaner look
};
exports.drop = drop;
//# sourceMappingURL=drop.js.map