import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, TextChannel } from "discord.js";
import { study } from "../../services/educationService";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";

import prisma from "../../utils/prisma"; // Added prisma import
import { getStudyGame } from "../../services/minigameService";

export async function handleStudy(message: Message) {
    if (!message.guild) return;

    // Check Enrollment First
    // Check Enrollment First
    const config = await getGuildConfig(message.guild.id);
    const prefix = config.prefix || "!";

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: message.author.id, guildId: message.guild.id } },
        include: { currentEducation: true }
    });

    if (!user || !user.currentEducation) {
        return message.reply({ embeds: [errorEmbed(message.author, "Not Enrolled", `You are not enrolled in any degree. Use \`${prefix}enroll\` to start your education!`)] });
    }

    // DB-Based Cooldown (Dynamic)
    const cooldownSeconds = config?.studyCooldown ?? 300;
    const cooldownMs = cooldownSeconds * 1000;
    const lastStudyTime = user.currentEducation.lastStudy ? new Date(user.currentEducation.lastStudy).getTime() : 0;
    const now = Date.now();

    if (now - lastStudyTime < cooldownMs) {
        const remainingMs = cooldownMs - (now - lastStudyTime);
        const expiresAt = Math.floor((now + remainingMs) / 1000);

        const embed = new EmbedBuilder()
            .setTitle(`Cooldown`)
            .setDescription(`You are tired of studying! Try again <t:${expiresAt}:R>.`)
            .setColor("#E74C3C"); // Red
        const angryUrl = getEmoteUrl(Mascot.Emotes.TeacherAngry);
        if (angryUrl) embed.setThumbnail(angryUrl);
        return message.reply({ embeds: [embed] });
    }

    // 2. Pick Game
    const game = getStudyGame();

    const embed = new EmbedBuilder()
        .setTitle("🧠 Quick Study Session")
        .setDescription(game.description)
        .setColor(Mascot.Colors.Base as any)
        .setFooter({ text: `You have ${game.time} seconds!` });

    const thinkUrl = getEmoteUrl(Mascot.Emotes.Think);
    if (thinkUrl) embed.setThumbnail(thinkUrl);

    let isWin = false;
    let reply: Message | null = null;

    // --- PREVIEW PHASE ---
    if (game.previewTime) {
        const previewEmbed = new EmbedBuilder()
            .setTitle(game.title)
            .setDescription(game.previewText || "Get ready...")
            .setColor(Mascot.Colors.Base as any)
            .setFooter({ text: `Memorize for ${game.previewTime}s...` });

        reply = await message.reply({ embeds: [previewEmbed] });
        await new Promise(r => setTimeout(r, game.previewTime! * 1000));

        // Show Real Question
        embed.setDescription(`${game.description}\n\nYou have **${game.time}** seconds!`);
        await reply.edit({ embeds: [embed] });
    } else {
        embed.setDescription(`${game.description}\n\nYou have **${game.time}** seconds!`);
    }

    // --- BUTTON GAME ---
    if (game.type === "button") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            game.options!.map((opt, i) =>
                new ButtonBuilder()
                    .setCustomId(`study_${i}_${opt}`)
                    .setLabel(opt)
                    .setStyle(ButtonStyle.Secondary)
            )
        );

        if (!reply) {
            reply = await message.reply({ embeds: [embed], components: [row] });
        } else {
            await reply.edit({ components: [row] });
        }

        try {
            const i = await reply.awaitMessageComponent({
                componentType: ComponentType.Button,
                time: game.time * 1000,
                filter: (i) => i.user.id === message.author.id
            });

            const selected = i.customId.split('_').slice(2).join('_');
            isWin = selected === game.answer;
            await i.deferUpdate();

        } catch (e) {
            isWin = false; // Timeout
        }
    }
    // --- TYPING GAME ---
    else {
        if (!reply) {
            reply = await message.reply({ embeds: [embed] });
        }

        try {
            const channel = message.channel as TextChannel;
            const collected = await channel.awaitMessages({
                filter: (m: Message) => m.author.id === message.author.id,
                max: 1,
                time: game.time * 1000,
                errors: ['time']
            });

            const userMsg = collected.first();
            if (userMsg) {
                isWin = userMsg.content.trim() === game.answer;
            }
        } catch (e) {
            isWin = false; // Timeout
        }
    }

    // Disable buttons on game message
    if (reply) await reply.edit({ components: [] }).catch(() => { });

    // Result Handling
    if (!isWin) {
        const failEmbed = new EmbedBuilder()
            .setTitle("📖 Study Session Failed")
            .setDescription(`${Mascot.Emotes.Confused} You failed the test!\n\n**Correct Answer:** ${game.answer}`)
            .setColor("#E74C3C"); // Red

        // NEW: Reply to USER MESSAGE with result
        await message.reply({ embeds: [failEmbed] });
        return;
    }

    // Success - Execute Study
    try {
        const bonus = 0.5;
        const res = await study(message.author.id, message.guild!.id, bonus);

        const resultEmbed = new EmbedBuilder()
            .setTitle("📚 Study Successful!")
            .setDescription(res.msg)
            .setColor(res.newStress > 80 ? "#E74C3C" : "#2ECC71")
            .setFooter({ text: "Perfect! +0.5 Bonus Int!" });

        const comps: any[] = [];
        if (res.scholarship) {
            resultEmbed.addFields({
                name: "🎉 Scholarship Unlocked!",
                value: `You reached GPA **${res.scholarship.milestone}.0**!\nReward: **${fmtCurrency(res.scholarship.amount, config?.currencyEmoji || "$")}**`
            });
            const claimRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_scholarship_${res.scholarship.milestone}`)
                    .setLabel("Claim Scholarship")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(Mascot.Emotes.MoneyBag)
            );
            comps.push(claimRow);
        }

        const thumb = getEmoteUrl(Mascot.Emotes.Teacher);
        if (thumb) resultEmbed.setThumbnail(thumb);

        // NEW: Reply to USER MESSAGE with result
        await message.reply({ embeds: [resultEmbed], components: comps });

    } catch (err: any) {
        await message.reply({ embeds: [errorEmbed(message.author, "Study Error", err.message)] });
    }
}
