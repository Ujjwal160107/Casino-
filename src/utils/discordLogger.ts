import { Client, EmbedBuilder, TextChannel, Colors, Guild } from "discord.js";

interface LogOptions {
    guild: Guild;
    type: "ADMIN" | "ECONOMY" | "MARKET" | "TRADE" | "MODERATION";
    title: string;
    description: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    thumbnail?: string;
    color?: number;
}

export async function logToChannel(client: Client, options: LogOptions) {
    try {
        const logChannelId = process.env.LOG_CHANNEL_ID;
        if (!logChannelId) return;

        const channel = await client.channels.fetch(logChannelId);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setTitle(`📜 ${options.type}: ${options.title}`)
            .setDescription(options.description)
            .setColor(options.color || Colors.Blue)
            .setTimestamp()
            .setFooter({ text: "Casino Audit Log" });

        if (options.fields) {
            embed.addFields(options.fields);
        }

        if (options.thumbnail) {
            embed.setThumbnail(options.thumbnail);
        }

        if (!options.color) {
            switch (options.type) {
                case "ADMIN": embed.setColor(Colors.Red); break;
                case "ECONOMY": embed.setColor(Colors.Green); break;
                case "MARKET": embed.setColor(Colors.Gold); break;
                case "TRADE": embed.setColor(Colors.Aqua); break;
                case "MODERATION": embed.setColor(Colors.DarkOrange); break;
            }
        }

        await (channel as TextChannel).send({ embeds: [embed] }).catch(() => { });
    } catch (err) {
        console.error("Failed to send audit log:", err);
    }
}
