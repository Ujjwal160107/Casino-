
import { Message, EmbedBuilder, PermissionsBitField, TextChannel } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";

export const setupDrop = async (message: Message, args: string[]) => {
    // Usage: !setup-drop <type> <channel> <minAmount-maxAmount> [params...]
    // Types: scheduled, interval, message, random
    // Params:
    //   scheduled: HH:MM
    //   interval: minutes
    //   message: count
    //   random: minInterval-maxInterval (minutes)

    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("You need Administrator permissions to use this.");
    }

    if (args.length < 3) {
        const embed = new EmbedBuilder()
            .setTitle("Setup Casino Drops")
            .setDescription("Usage: `!setup-drop <type> <channel> <min-max> [params]`\n\n" +
                "**Types & Params:**\n" +
                "`scheduled` - `HH:MM` (e.g. `13:00`)\n" +
                "`interval` - `minutes` (e.g. `60`)\n" +
                "`message` - `count` (e.g. `100`)\n" +
                "`random` - `min-max` minutes (e.g. `30-60`)\n\n" +
                "**Example:**\n" +
                "`!setup-drop scheduled #general 1000-5000 18:00`\n" +
                "`!setup-drop message #chat 100-500 50`"
            );
        return message.reply({ embeds: [embed] });
    }

    const type = args[0].toUpperCase();
    const channelMention = args[1];
    const amountRange = args[2];
    const param = args[3];

    const channelId = channelMention.replace(/[<#>]/g, "");
    const channel = message.guild?.channels.cache.get(channelId);

    if (!channel || !(channel instanceof TextChannel)) {
        return message.reply("Invalid channel.");
    }

    const [minStr, maxStr] = amountRange.split("-");
    const minAmount = parseInt(minStr);
    const maxAmount = maxStr ? parseInt(maxStr) : minAmount;

    if (isNaN(minAmount) || isNaN(maxAmount)) {
        return message.reply("Invalid amount range. Use format `min-max` or just `amount`.");
    }

    // Validate Type and Param
    const data: any = {
        guildId: message.guild!.id,
        channelId: channelId,
        type: "",
        minAmount,
        maxAmount,
        currency: "Coins" // Default for now
    };

    if (type === "SCHEDULED") {
        if (!param || !/^\d{2}:\d{2}$/.test(param)) return message.reply("Invalid time format. Use HH:MM (24h).");
        data.type = "SCHEDULED";
        data.scheduleTime = param;
    } else if (type === "INTERVAL") {
        const minutes = parseInt(param);
        if (isNaN(minutes)) return message.reply("Invalid interval minutes.");
        data.type = "INTERVAL";
        data.interval = minutes;
    } else if (type === "MESSAGE") {
        const count = parseInt(param);
        if (isNaN(count)) return message.reply("Invalid message count.");
        data.type = "MESSAGE_COUNT";
        data.messageCount = count;
    } else if (type === "RANDOM") {
        const [minInt, maxInt] = param.split("-");
        const minI = parseInt(minInt);
        const maxI = maxInt ? parseInt(maxInt) : minI;
        if (isNaN(minI) || isNaN(maxI)) return message.reply("Invalid interval range. Use `min-max`.");
        data.type = "RANDOM";
        data.minInterval = minI;
        data.maxInterval = maxI;
        data.interval = minI; // Set initial interval
    } else {
        return message.reply("Invalid type. Valid types: `scheduled`, `interval`, `message`, `random`.");
    }

    try {
        await prisma.casinoDropConfig.create({ data });
        message.reply(`✅ **Casino Drop Configured!**\nType: ${data.type}\nChannel: <#${channelId}>\nAmount: ${minAmount}-${maxAmount}`);
    } catch (e) {
        console.error(e);
        message.reply("Failed to save configuration.");
    }
};
