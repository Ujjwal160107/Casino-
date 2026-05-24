import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, TextChannel } from "discord.js";
import { study } from "../../services/educationService";
import { errorEmbed } from "../../utils/embed";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";

import prisma from "../../utils/prisma";
import { getStudyGame } from "../../services/minigameService";
import { redisService } from "../../services/redisService";

export async function handleStudy(message: Message) {
    if (!message.guild) return;

    // Check Enrollment First
    // Check Enrollment First
    const config = await getGuildConfig(message.guild.id);
    const prefix = config.prefix || "!";

    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id },
        include: { currentEducation: true }
    });

    if (!user || !user.currentEducation) {
        return message.reply({ embeds: [errorEmbed(message.author, "Not Enrolled", `You are not enrolled in any degree. Use \`${prefix}education\` to start your education!`)] });
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

    // Fetch active Uni Store buffs
    const userId = message.author.id;
    const [studyLaptop, textbookBundle, labKit, calcPro, focusNotes, tutorPass] = await Promise.all([
      redisService.get<{ sessionsLeft: number; xpMult: number }>(`study_laptop:${userId}`),
      redisService.get<{ sessionsLeft: number; xpMult: number }>(`textbook_bundle:${userId}`),
      redisService.get<{ sessionsLeft: number; failReduction: number; xpMult: number }>(`lab_kit:${userId}`),
      redisService.get<{ sessionsLeft: number; failRescue: number; xpMult: number }>(`calculator_pro:${userId}`),
      redisService.get<{ active: boolean; bonusXp: number }>(`focus_notes:${userId}`),
      redisService.get<{ active: boolean; xpMult: number; failReduction: number }>(`tutor_pass:${userId}`),
    ]);

    let xpMultiplier = 1.0;
    let failReduction = 0;
    if (studyLaptop) xpMultiplier *= studyLaptop.xpMult;
    if (textbookBundle) xpMultiplier *= textbookBundle.xpMult;
    if (labKit) { xpMultiplier *= labKit.xpMult; failReduction += labKit.failReduction; }
    if (calcPro) { xpMultiplier *= calcPro.xpMult; failReduction += calcPro.failRescue; }
    if (tutorPass) { xpMultiplier *= tutorPass.xpMult; failReduction += tutorPass.failReduction; }
    xpMultiplier = Math.min(xpMultiplier, 2.0);

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

    // Fail rescue: if user failed but has active buffs with failReduction, attempt rescue
    let rescued = false;
    if (!isWin && failReduction > 0 && Math.random() < failReduction) {
        isWin = true;
        rescued = true;
    }

    // Result Handling
    if (!isWin) {
        if (tutorPass) await redisService.del(`tutor_pass:${userId}`);

        const failEmbed = new EmbedBuilder()
            .setTitle("📖 Study Session Failed")
            .setDescription(`${Mascot.Emotes.Confused} You failed the test!\n\n**Correct Answer:** ${game.answer}`)
            .setColor("#E74C3C");

        await message.reply({ embeds: [failEmbed] });
        return;
    }

    // Success - Execute Study
    try {
        const focusNotesBonus = focusNotes?.bonusXp ?? 0;
        const bonusXp = Math.floor(50 * (xpMultiplier - 1)) + focusNotesBonus;
        const res = await study(message.author.id, message.guild!.id, bonusXp);

        const { questBus } = await import("../../services/questEvents");
        questBus.emit("education:study", { discordId: message.author.id });

        // Apply focus_notes bonus XP
        let focusBonus = "";
        if (focusNotes) {
            focusBonus = `\n📝 **Focus Notes:** +${focusNotes.bonusXp} bonus XP applied!`;
            await redisService.del(`focus_notes:${userId}`);
        }

        // Decrement session-based buffs (only after successful study)
        const decrementBuff = async (key: string, data: { sessionsLeft: number; [k: string]: any } | null) => {
            if (!data) return;
            const current = await redisService.get<typeof data>(key);
            if (!current) return;
            const remaining = current.sessionsLeft - 1;
            if (remaining <= 0) { await redisService.del(key); return; }
            const ttl = await redisService.getInstance().ttl(key);
            if (ttl > 0) await redisService.set(key, { ...current, sessionsLeft: remaining }, ttl);
        };

        await Promise.all([
            decrementBuff(`study_laptop:${userId}`, studyLaptop),
            decrementBuff(`textbook_bundle:${userId}`, textbookBundle),
            decrementBuff(`lab_kit:${userId}`, labKit),
            decrementBuff(`calculator_pro:${userId}`, calcPro),
        ]);
        if (tutorPass) await redisService.del(`tutor_pass:${userId}`);

        // Build result message
        let footerText = bonusXp > 0 ? `Perfect! +${bonusXp} Bonus XP!` : "Perfect study session!";
        if (xpMultiplier > 1.0) footerText += ` (${xpMultiplier.toFixed(2)}x buff)`;
        if (rescued) footerText = bonusXp > 0 ? `Rescued by buff! +${bonusXp} Bonus XP!` : "Rescued by buff!";

        const resultEmbed = new EmbedBuilder()
            .setTitle("📚 Study Successful!")
            .setDescription(res.msg + focusBonus + (rescued ? "\n✨ **Your study items rescued the attempt!**" : ""))
            .setColor(res.newStress > 80 ? "#E74C3C" : "#2ECC71")
            .setFooter({ text: footerText });

        const comps: any[] = [];
        if (res.scholarship) {
            resultEmbed.addFields({
                name: "🎉 Scholarship Unlocked!",
                value: `You reached **${res.scholarship.milestone}%** XP!\nReward: **${fmtCurrency(res.scholarship.amount, config?.currencyEmoji || "$")}**`
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

        await message.reply({ embeds: [resultEmbed], components: comps });

    } catch (err: any) {
        await message.reply({ embeds: [errorEmbed(message.author, "Study Error", err.message)] });
    }
}
