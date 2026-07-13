import { Client, ContainerBuilder, Guild, MessageFlags, SectionBuilder, TextChannel, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";

interface LogOptions {
    guild: Guild;
    type: "ADMIN" | "ECONOMY" | "MARKET" | "TRADE" | "MODERATION";
    title: string;
    description: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    thumbnail?: string;
    /** Retained for call-site compatibility; Components V2 has no accent stripe. */
    color?: number;
}

export async function logToChannel(client: Client, options: LogOptions) {
    try {
        const logChannelId = process.env.LOG_CHANNEL_ID;
        if (!logChannelId) return;

        const channel = await client.channels.fetch(logChannelId);
        if (!channel || !channel.isTextBased()) return;

        const heading = `## 📜 ${options.type}: ${options.title}`;
        let body = options.description;
        if (options.fields && options.fields.length) {
            body += "\n" + options.fields.map((f) => `**${f.name}:** ${f.value}`).join("\n");
        }

        const container = new ContainerBuilder();
        if (options.thumbnail) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(heading),
                        new TextDisplayBuilder().setContent(body),
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(options.thumbnail)),
            );
        } else {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(heading),
                new TextDisplayBuilder().setContent(body),
            );
        }

        await (channel as TextChannel)
            .send({ components: [container], flags: MessageFlags.IsComponentsV2 })
            .catch(() => { });
    } catch (err) {
        console.error("Failed to send audit log:", err);
    }
}
