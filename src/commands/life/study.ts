import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { study } from "../../services/educationService";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";

export async function handleStudy(message: Message) {
    if (!message.guild) return;

    // Cooldown: Configurable
    const config = await getGuildConfig(message.guild.id);
    const cooldownTime = config?.studyCooldown ?? 300;

    // Cooldown Key
    const cooldownKey = `study:${message.author.id}`;
    const cd = checkCooldown(cooldownKey, cooldownTime);
    if (cd > 0) {
        const expiresAt = getCooldownExpiry(cooldownKey);
        const embed = new EmbedBuilder()
            .setTitle(`Cooldown`)
            .setDescription(`You are tired of studying! Try again <t:${Math.floor(expiresAt! / 1000)}:R>.`)
            .setColor("#E74C3C");

        const angryUrl = getEmoteUrl(Mascot.Emotes.TeacherAngry);
        if (angryUrl) embed.setThumbnail(angryUrl);

        return message.reply({ embeds: [embed] });
    }

    try {
        const res = await study(message.author.id, message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle(`Study Session`)
            .setDescription(res.msg)
            .setColor(res.newStress > 80 ? "#E74C3C" : "#2ECC71");

        const components: any[] = []; // Explicit any to avoid complexity with builders

        if (res.scholarship) {
            embed.setColor("#F1C40F"); // Gold
            embed.addFields({
                name: "🎉 Scholarship Unlocked!",
                value: `You reached GPA **${res.scholarship.milestone}.0**!\nReward: **${fmtCurrency(res.scholarship.amount, config?.currencyEmoji || "$")}**`
            });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_scholarship_${res.scholarship.milestone}`)
                    .setLabel("Claim Scholarship")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(Mascot.Emotes.MoneyBag)
            );
            components.push(row);
        }

        const thinkUrl = getEmoteUrl(Mascot.Emotes.Teacher);
        if (thinkUrl) embed.setThumbnail(thinkUrl);

        message.reply({ embeds: [embed], components });

    } catch (err: any) {
        message.reply({ embeds: [errorEmbed(message.author, "Study Failed", err.message)] });
    }
}
