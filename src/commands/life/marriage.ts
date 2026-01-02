
import { Message, User, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { marry, divorce, getMarriage, isMarried, checkHasRing, consumeRing } from "../../services/life/marriageService";

export async function handleMarry(message: Message, args: string[]) {
    if (message.mentions.users.size === 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid Usage", "You must mention someone to marry!")] });
    }

    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return message.reply({ embeds: [errorEmbed(message.author, "Invalid User", "You cannot marry a bot or yourself!")] });
    }

    // Double check if users exist in DB (usually handled, but good to ensure)
    // ... (Assuming user existence checks are done or Prisma will throw/create)

    // Check if already married
    // FIX: Pass guildId
    if (await isMarried(message.author.id, message.guildId!)) {
        return message.reply({ embeds: [errorEmbed(message.author, "Already Married", "You are already married! Divorce first if you want to remarry.")] });
    }
    if (await isMarried(target.id, message.guildId!)) {
        return message.reply({ embeds: [errorEmbed(message.author, "Taken", `${target.username} is already married!`)] });
    }

    // Check for Ring
    // FIX: Pass guildId
    const hasRing = await checkHasRing(message.author.id, message.guildId!);
    if (!hasRing) {
        return message.reply({ embeds: [errorEmbed(message.author, "No Ring", "You need a **Ring** to propose! Buy one from the shop.")] });
    }

    // Send Proposal
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('accept_proposal')
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💍'), // Or check for custom emote
            new ButtonBuilder()
                .setCustomId('decline_proposal')
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
        );

    const proposalEmbed = new EmbedBuilder()
        .setColor("#ff69b4") // Pink/Romance color
        .setTitle(`💍 Marriage Proposal`)
        .setDescription(`${target}, **${message.author.username}** has proposed to you! \n\nDo you accept their hand in marriage?`)
        .setImage("attachment://marriage_proposal.png")
        .setFooter({ text: "You have 60 seconds to answer." });

    // We need to attach the local file
    const msg = await message.reply({
        content: `${target}`,
        embeds: [proposalEmbed],
        components: [row],
        files: ["./assets/marriage_proposal.png"]
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== target.id) {
            await i.reply({ content: "This proposal is not for you!", ephemeral: true });
            return;
        }

        if (i.customId === 'accept_proposal') {
            // Re-check ring just in case they dropped it? Unlikely in 60s but safe.
            // FIX: Pass guildId
            const stillHasRing = await checkHasRing(message.author.id, message.guildId!);
            if (!stillHasRing) {
                await i.update({ content: " Proposal Failed", embeds: [errorEmbed(target, "Proposal Failed", "The proposer lost the ring!")], components: [] });
                return;
            }

            // FIX: Pass guildId and usernames for creation
            await consumeRing(message.author.id, message.guildId!);
            await marry(message.author.id, message.author.username, target.id, target.username, message.guildId!);

            const acceptEmbed = new EmbedBuilder()
                .setColor("#ff69b4")
                .setTitle(`💖 Just Married! 💖`)
                .setDescription(`Congratulations! **${message.author.username}** and **${target.username}** are now married! 🎉`)
                .setThumbnail(getEmoteUrl(Mascot.Emotes.Love) || "") // Use a happy emote
            // Image removed as per user request
            // Actually user asked for "marriage acceptance or decline embed"
            // Let's use a nice description.

            await i.update({ content: null, embeds: [acceptEmbed], components: [], files: [], attachments: [] });
        } else {
            const declineEmbed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("💔 Proposal Declined")
                .setDescription(`${target.username} has declined the proposal.`);

            await i.update({ content: null, embeds: [declineEmbed], components: [], files: [], attachments: [] });
        }
        collector.stop();
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            // Edit to show timeout
            const timeoutEmbed = new EmbedBuilder()
                .setColor("#808080")
                .setTitle("Proposal Expired")
                .setDescription("The proposal timed out.");
            await msg.edit({ content: null, embeds: [timeoutEmbed], components: [] }).catch(() => { });
        }
    });
}

export async function handleDivorce(message: Message) {
    const married = await isMarried(message.author.id, message.guildId!);
    if (!married) {
        return message.reply({ embeds: [errorEmbed(message.author, "Not Married", "You are not married!")] });
    }

    const marriage = await getMarriage(message.author.id, message.guildId!);
    if (!marriage) return; // Should be handled by isMarried check

    // Identify Spouse
    const spouseRecord = (marriage as any).spouse1.discordId === message.author.id ? (marriage as any).spouse2 : (marriage as any).spouse1;
    const spouseId = spouseRecord.discordId;

    // Warning confirmation?
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_divorce')
                .setLabel('Accept Divorce')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_divorce')
                .setLabel('Decline')
                .setStyle(ButtonStyle.Secondary)
        );

    const confirmEmbed = errorEmbed(message.author, "Divorce Request", `**${message.author.username}** wants to divorce you. Do you accept?`);
    confirmEmbed.setDescription(`<@${spouseId}>, **${message.author.username}** has requested a divorce.\n\nDo you agree to end this marriage?`);

    const msg = await message.reply({ content: `<@${spouseId}>`, embeds: [confirmEmbed], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== spouseId) {
            await i.reply({ content: "This divorce request is not for you!", ephemeral: true });
            return;
        }

        if (i.customId === 'confirm_divorce') {
            await divorce(message.author.id, message.guildId!);
            const divorcedEmbed = new EmbedBuilder()
                .setColor("#000000")
                .setTitle("💔 Divorced")
                .setDescription(`**${message.author.username}** and <@${spouseId}> are now divorced.`);
            await i.update({ content: null, embeds: [divorcedEmbed], components: [] });
        } else {
            const cancelEmbed = new EmbedBuilder()
                .setColor(Mascot.Colors.Success as any) // Or some neutral color
                .setTitle("Divorce Cancelled")
                .setDescription("The divorce request was declined. You are still married.");
            await i.update({ content: null, components: [], embeds: [cancelEmbed] });
        }
        collector.stop();
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
                .setColor("#808080")
                .setTitle("Divorce Request Expired")
                .setDescription("The divorce request timed out.");
            await msg.edit({ content: null, embeds: [timeoutEmbed], components: [] }).catch(() => { });
        }
    });
}

export async function handleFamily(message: Message) {
    const marriage = await getMarriage(message.author.id, message.guildId!);
    if (!marriage) {
        return message.reply({ embeds: [errorEmbed(message.author, "Not Married", "You are single!")] });
    }

    // Determined spouse from the included relation
    // Note: getMarriage includes spouse1 and spouse2 objects
    const spouseRecord = (marriage as any).spouse1.discordId === message.author.id ? (marriage as any).spouse2 : (marriage as any).spouse1;

    let spouseUser: User | null = null;
    try {
        spouseUser = await message.client.users.fetch(spouseRecord.discordId);
    } catch (e) {
        // User might have left
    }

    const spouseName = spouseUser ? spouseUser.username : spouseRecord.username;

    const embed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle(`Family of ${message.author.username}`)
        .addFields(
            { name: "💍Partner", value: spouseName, inline: true },
            { name: "❤️Affection", value: `${marriage.affection}`, inline: true },
            { name: "📅Married Since", value: `<t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:R>`, inline: true }
        );

    if (spouseUser) {
        embed.setThumbnail(spouseUser.displayAvatarURL());
    }

    message.reply({ embeds: [embed] });
}
