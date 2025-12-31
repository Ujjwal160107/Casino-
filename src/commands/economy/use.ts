import { Message, TextChannel, EmbedBuilder } from "discord.js";
import { useItem } from "../../services/shopService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleUse(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;

    const itemName = args.join(" ");

    if (!itemName) {
        const config = await getGuildConfig(message.guild.id);
        return message.reply({
            embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${config.prefix}use <item_name>\``)]
        });
    }

    try {
        const { item, results } = await useItem(
            message.author.id,
            message.guildId!,
            itemName,
            message.member
        );

        const customMessages = results
            .filter(r => r.type === "CUSTOM_MESSAGE")
            .map(r => r.message);

        const otherEffects = results
            .filter(r => r.type !== "CUSTOM_MESSAGE")
            .map(r => r.message);

        // If only custom messages (passive items), show them in a clean embed and return
        if (customMessages.length > 0 && otherEffects.length === 0) {
            const embed = new EmbedBuilder()
                .setColor("#3498DB") // Blue for info
                .setDescription(customMessages.join("\n"));

            return message.reply({ embeds: [embed] });
        }

        // If mixed or just effects
        if (customMessages.length > 0) {
            await (message.channel as TextChannel).send(customMessages.join("\n"));
        }

        const embed = successEmbed(
            message.author,
            `Used: ${item.name}`,
            otherEffects.length > 0 ? otherEffects.join("\n") : "✨ Item used successfully!"
        );

        return message.reply({ embeds: [embed] });
    } catch (err: any) {
        return message.reply({
            embeds: [errorEmbed(message.author, "Error", err.message || "Failed to use item.")]
        });
    }
}
