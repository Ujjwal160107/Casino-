import { Message, EmbedBuilder } from "discord.js";
import { getGuildConfig, updateGuildConfig } from "../../services/guildConfigService";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { logToChannel } from "../../utils/discordLogger";
import { parseSmartAmount } from "../../utils/format";

export async function handleChatMoneyConfig(message: Message, args: string[]) {
    if (!message.guild) return;

    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Permission Denied", "You need Administrator permissions to use this command.")] });
    }

    const subCommand = args[0]?.toLowerCase();

    const config = await getGuildConfig(message.guild.id);
    const prefix = config.prefix || "!";

    if (!subCommand) {
        const embed = new EmbedBuilder()
            .setTitle("💬 Chat Money Configuration")
            .setColor("#00FF00")
            .addFields(
                { name: "Status", value: config.chatMoneyEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "Interval", value: `${config.chatMoneyInterval} seconds`, inline: true },
                { name: "Reward Range", value: `${config.chatMoneyMin} - ${config.chatMoneyMax}`, inline: true },
                { name: "Channels", value: config.chatMoneyChannels.length > 0 ? config.chatMoneyChannels.map(id => `<#${id}>`).join(", ") : "None", inline: false }
            )
            .setFooter({ text: `Use ${prefix}chatmoney help for commands` });
        return message.reply({ embeds: [embed] });
    }

    if (subCommand === "help") {
        const embed = new EmbedBuilder()
            .setTitle("💬 Chat Money Commands")
            .setColor("#0099FF")
            .setDescription(
                `\`${prefix}chatmoney enable\` - Enable the system\n` +
                `\`${prefix}chatmoney disable\` - Disable the system\n` +
                `\`${prefix}chatmoney interval <seconds>\` - Set reward interval\n` +
                `\`${prefix}chatmoney min <amount>\` - Set minimum reward\n` +
                `\`${prefix}chatmoney max <amount>\` - Set maximum reward\n` +
                `\`${prefix}chatmoney channel add <channel_id>\` - Add channel (Max 5)\n` +
                `\`${prefix}chatmoney channel remove <channel_id>\` - Remove channel`
            );
        return message.reply({ embeds: [embed] });
    }

    if (subCommand === "enable") {
        await updateGuildConfig(message.guild.id, { chatMoneyEnabled: true });
        return message.reply({ embeds: [successEmbed(message.author, "Chat Money Enabled", "The chat money system is now active.")] });
    }

    if (subCommand === "disable") {
        await updateGuildConfig(message.guild.id, { chatMoneyEnabled: false });
        return message.reply({ embeds: [successEmbed(message.author, "Chat Money Disabled", "The chat money system has been deactivated.")] });
    }

    if (subCommand === "interval") {
        const input = args[1]?.toLowerCase();
        if (!input) {
            return message.reply({ embeds: [errorEmbed(message.author, "Missing Argument", "Please specify a time (e.g., 60s, 5m, 1h).")] });
        }

        let seconds = 0;
        if (input.endsWith("s")) {
            seconds = parseInt(input.slice(0, -1));
        } else if (input.endsWith("m")) {
            seconds = parseInt(input.slice(0, -1)) * 60;
        } else if (input.endsWith("h")) {
            seconds = parseInt(input.slice(0, -1)) * 3600;
        } else {
            seconds = parseInt(input);
        }

        if (isNaN(seconds) || seconds < 1) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Interval", "Please specify a valid time duration (e.g. 10s, 5m, 1h).")] });
        }

        await updateGuildConfig(message.guild.id, { chatMoneyInterval: seconds });
        return message.reply({ embeds: [successEmbed(message.author, "Interval Updated", `Chat money interval set to **${seconds} seconds**.`)] });
    }

    if (subCommand === "min") {
        const amount = parseSmartAmount(args[1]);
        if (isNaN(amount) || amount < 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please specify a valid amount.")] });
        }
        const config = await getGuildConfig(message.guild.id);
        if (amount > config.chatMoneyMax) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Range", `Minimum cannot be greater than maximum (${config.chatMoneyMax}).`)] });
        }
        await updateGuildConfig(message.guild.id, { chatMoneyMin: amount });
        return message.reply({ embeds: [successEmbed(message.author, "Minimum Updated", `Minimum chat money set to **${amount}**.`)] });
    }

    if (subCommand === "max") {
        const amount = parseSmartAmount(args[1]);
        if (isNaN(amount) || amount < 0) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please specify a valid amount.")] });
        }
        const config = await getGuildConfig(message.guild.id);
        if (amount < config.chatMoneyMin) {
            return message.reply({ embeds: [errorEmbed(message.author, "Invalid Range", `Maximum cannot be less than minimum (${config.chatMoneyMin}).`)] });
        }
        await updateGuildConfig(message.guild.id, { chatMoneyMax: amount });
        return message.reply({ embeds: [successEmbed(message.author, "Maximum Updated", `Maximum chat money set to **${amount}**.`)] });
    }

    if (subCommand === "channel") {
        const action = args[1]?.toLowerCase();
        let channelId = args[2];

        if (message.mentions.channels.size > 0) {
            channelId = message.mentions.channels.first()!.id;
        } else if (!channelId) {
            return message.reply({ embeds: [errorEmbed(message.author, "Missing Channel", "Please mention a channel or provide an ID.")] });
        }

        // Validate channel exists in guild (basic check if we can fetch it, or just trust ID if from mention)
        if (!message.guild.channels.cache.has(channelId)) {
            try {
                await message.guild.channels.fetch(channelId);
            } catch (e) {
                return message.reply({ embeds: [errorEmbed(message.author, "Invalid Channel", "Could not find that channel in this server.")] });
            }
        }

        const config = await getGuildConfig(message.guild.id);
        let currentChannels = config.chatMoneyChannels;

        if (action === "add") {
            if (currentChannels.includes(channelId)) {
                return message.reply({ embeds: [errorEmbed(message.author, "Duplicate", "This channel is already in the list.")] });
            }
            if (currentChannels.length >= 5) {
                return message.reply({ embeds: [errorEmbed(message.author, "Limit Reached", "You can only have up to 5 chat money channels.")] });
            }
            currentChannels.push(channelId);
            await updateGuildConfig(message.guild.id, { chatMoneyChannels: currentChannels });
            return message.reply({ embeds: [successEmbed(message.author, "Channel Added", `Added <#${channelId}> to chat money channels.`)] });
        }

        if (action === "remove") {
            if (!currentChannels.includes(channelId)) {
                return message.reply({ embeds: [errorEmbed(message.author, "Not Found", "This channel is not in the list.")] });
            }
            currentChannels = currentChannels.filter(id => id !== channelId);
            await updateGuildConfig(message.guild.id, { chatMoneyChannels: currentChannels });
            return message.reply({ embeds: [successEmbed(message.author, "Channel Removed", `Removed <#${channelId}> from chat money channels.`)] });
        }

        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Action", `Usage: \`${prefix}chatmoney channel add/remove <channel>\``)] });
    }

    return message.reply({ embeds: [errorEmbed(message.author, "Unknown Subcommand", `Use \`${prefix}chatmoney help\` for a list of commands.`)] });
}
