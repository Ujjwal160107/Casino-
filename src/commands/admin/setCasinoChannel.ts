import { Message, PermissionsBitField, ChannelType } from "discord.js";
import { updateGuildConfig, getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

export async function handleSetCasinoChannel(message: Message, args: string[]) {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }

    const channel = message.mentions.channels.first() || message.guild?.channels.cache.get(args[0]);

    // If no argument provided, maybe they want to clear or view? 
    // For now, let's enforce adding/setting one.
    if (!channel || channel.type !== ChannelType.GuildText) {
        // Special case: "clear" or "reset"
        if (args[0]?.toLowerCase() === "clear") {
            await updateGuildConfig(message.guildId!, {
                casinoChannels: []
            });
            return message.reply({
                embeds: [successEmbed(message.author, "Configuration Updated", "Cleared all designated casino channels.")]
            });
        }

        const config = await getGuildConfig(message.guildId!);
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Channel", `Please mention a valid text channel or provide its ID.\nUsage: \`${config.prefix}set-casino-channel #casino\``)]
        });
    }

    // Toggle logic or add logic?
    // "set" implies overriding or adding. Let's make it add to list for now, or replace?
    // User said "setting up ... casino channel" singular.
    // Ideally we support multiple. Let's ADD it to the list if not present, or maybe just REPLACE if they want single.
    // "set" usually implies singular? 
    // Let's implement ADD logic but call it "Casino Channel Update".
    // Actually simplicity: Let's fetch current, check if in, if so remove, if not add (Toggle).

    const config = await getGuildConfig(message.guildId!);
    let channels = config.casinoChannels || [];

    if (channels.includes(channel.id)) {
        channels = channels.filter(id => id !== channel.id);
        await updateGuildConfig(message.guildId!, { casinoChannels: channels });
        return message.reply({
            embeds: [successEmbed(message.author, "Configuration Updated", `Removed ${channel.toString()} from casino channels.`)]
        });
    } else {
        channels.push(channel.id);
        await updateGuildConfig(message.guildId!, { casinoChannels: channels });
        return message.reply({
            embeds: [successEmbed(message.author, "Configuration Updated", `Added ${channel.toString()} to designated casino channels.`)]
        });
    }
}
