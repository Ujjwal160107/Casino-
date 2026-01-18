import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    Message,
    TextChannel
} from "discord.js";

/**
 * Creates a paginated message with Next/Previous buttons.
 * @param message The original message (to reply to).
 * @param embeds Array of embeds to paginate.
 * @param timeout Duration in ms (default 60000).
 */
export async function sendPaginatedEmbed(message: Message, embeds: EmbedBuilder[], timeout: number = 60000) {
    if (embeds.length === 0) return;

    // If only one embed, just send it without buttons
    if (embeds.length === 1) {
        return message.reply({ embeds: [embeds[0]] });
    }

    let currentPage = 0;

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
        );

    const reply = await message.reply({
        embeds: [embeds[currentPage]],
        components: [row]
    });

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: timeout,
        filter: (i) => i.user.id === message.author.id
    });

    collector.on('collect', async (i) => {
        if (i.customId === 'prev') {
            currentPage = currentPage > 0 ? currentPage - 1 : embeds.length - 1;
        } else if (i.customId === 'next') {
            currentPage = currentPage < embeds.length - 1 ? currentPage + 1 : 0;
        }

        // Update buttons
        const newRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentPage === embeds.length - 1)
            );

        await i.update({
            embeds: [embeds[currentPage]],
            components: [newRow]
        });
    });

    collector.on('end', () => {
        // Disable buttons on timeout
        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );

        reply.edit({ components: [disabledRow] }).catch(() => { });
    });
}
