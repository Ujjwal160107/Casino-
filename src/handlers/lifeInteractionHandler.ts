import { Interaction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { enroll, claimScholarship, reduceStress, getStressCost } from "../services/educationService";
import { getGuildConfig } from "../services/guildConfigService";
import { fmtCurrency } from "../utils/format";
import { Mascot, getEmoteUrl } from "../config/branding";
import prisma from "../utils/prisma";

export async function handleLifeInteraction(interaction: Interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    }
}

async function handleButton(interaction: ButtonInteraction) {
    const { customId, user, guild } = interaction;
    if (!guild) return;

    if (customId.startsWith("enroll_confirm_")) {
        const degreeId = customId.replace("enroll_confirm_", "");

        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await enroll(user.id, guild.id, degreeId);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Accept} Enrollment Successful`)
                .setDescription(`You have successfully enrolled in **${result.degree.name}**!`)
                .addFields({ name: "Tuition Paid", value: fmtCurrency(result.degree.tuitionPerSem, config.currencyEmoji) })
                .setColor("#2ECC71");

            await interaction.editReply({ embeds: [embed] });

        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Enrollment Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("claim_scholarship_")) {
        const milestone = parseInt(customId.replace("claim_scholarship_", ""));

        await interaction.deferReply({ ephemeral: true });

        try {
            const amount = await claimScholarship(user.id, guild.id, milestone);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.MoneyBag} Scholarship Claimed!`)
                .setDescription(`You have successfully claimed your scholarship of **${fmtCurrency(amount, config.currencyEmoji)}** for reaching Meritfull Performance **${milestone}.0**!`)
                .setColor("#F1C40F");

            await interaction.editReply({ embeds: [embed] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Claim Failed**: ${err.message}` });
        }
    }
    else if (customId.startsWith("stress_")) {
        const activity = customId.replace("stress_", "") as "sports" | "gym" | "meditation";

        // Check if stress is already 0
        const userData = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: user.id, guildId: guild.id } },
            include: { currentEducation: true }
        });

        if (userData?.currentEducation && userData.currentEducation.stress <= 0) {
            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Think} No Stress Detected`)
                .setDescription("You are currently stress free! Why not try studying instead?")
                .setColor("#2ECC71");

            const thumbUrl = getEmoteUrl(Mascot.Emotes.Think);
            if (thumbUrl) embed.setThumbnail(thumbUrl);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const cost = await getStressCost(user.id, guild.id);
            const config = await getGuildConfig(guild.id);

            const embed = new EmbedBuilder()
                .setTitle(`Confirm ${activity.charAt(0).toUpperCase() + activity.slice(1)}`)
                .setDescription(`Do you want to spend **${fmtCurrency(cost, config.currencyEmoji)}** to reduce stress?`)
                .setColor("#3498DB");

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`confirm_stress_${activity}`).setLabel("Confirm").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.Accept),
                new ButtonBuilder().setCustomId("cancel_stress").setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji(Mascot.Emotes.Decline)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Error**: ${err.message}` });
        }
    }
    else if (customId.startsWith("confirm_stress_")) {
        const activity = customId.replace("confirm_stress_", "") as "sports" | "gym" | "meditation";

        // Defer update to replace the confirmation message
        await interaction.deferUpdate();

        try {
            const res = await reduceStress(user.id, guild.id, activity);

            let thumb = "";
            switch (activity) {
                case "sports": thumb = Mascot.Emotes.Sports; break;
                case "gym": thumb = Mascot.Emotes.Gym; break;
                case "meditation": thumb = Mascot.Emotes.Meditation; break;
            }

            const embed = new EmbedBuilder()
                .setTitle("Stress Relieved")
                .setDescription(res.msg)
                .setColor("#2ECC71");

            const thumbUrl = getEmoteUrl(thumb);
            if (thumbUrl) embed.setThumbnail(thumbUrl);

            await interaction.editReply({ embeds: [embed], components: [] });
        } catch (err: any) {
            await interaction.editReply({ content: `${Mascot.Emotes.Fail} **Activity Failed**: ${err.message}`, components: [] });
        }
    }
    else if (customId === "cancel_stress") {
        await interaction.update({ content: `${Mascot.Emotes.Decline} Activity cancelled.`, embeds: [], components: [] });
    }
}
