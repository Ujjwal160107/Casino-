
import { Message, PermissionsBitField, TextChannel } from "discord.js";
import { CasinoDropService } from "../../services/casinoDropService";
import { parseSmartAmount } from "../../utils/format";

export const drop = async (message: Message, args: string[]) => {
    // !drop <amount> [channel]

    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("You need Administrator permissions to use this.");
    }

    if (args.length < 1) {
        return message.reply("Usage: `!drop <amount|min-max> [channel]`\nExample: `!drop 100-500` or `!drop 1k`");
    }

    const amountArg = args[0];
    let amount = 0;

    if (amountArg.includes("-")) {
        const [minStr, maxStr] = amountArg.split("-");
        const min = parseSmartAmount(minStr);
        const max = parseSmartAmount(maxStr);

        if (isNaN(min) || isNaN(max) || min <= 0 || max < min) {
            return message.reply("Invalid range. Format: `min-max` (e.g., `100-500`)");
        }
        amount = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
        amount = parseSmartAmount(amountArg);
    }

    if (isNaN(amount) || amount <= 0) return message.reply("Invalid amount.");

    let targetChannel = message.channel as TextChannel;
    if (args[1]) {
        const cid = args[1].replace(/[<#>]/g, "");
        const ch = message.guild?.channels.cache.get(cid);
        if (ch && ch instanceof TextChannel) {
            targetChannel = ch;
        } else {
            return message.reply("Invalid channel.");
        }
    }

    await CasinoDropService.spawnDrop(message.client, message.guild!.id, targetChannel.id, amount);
    message.delete().catch(() => { }); // Delete command message for cleaner look
};
