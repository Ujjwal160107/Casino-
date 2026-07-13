import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, TextChannel } from "discord.js";
import { study } from "../../services/educationService";
import { successContainer, errorContainer, infoContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { fmtCurrency } from "../../utils/format";

import prisma from "../../utils/prisma";
import { getStudyGame, Minigame } from "../../services/minigameService";
import { redisService } from "../../services/redisService";
import { isTesterMember } from "../../utils/developerAccess";
import { getGuildPrefix } from "../../utils/guildContext";
import { DEFAULT_STUDY_COOLDOWN_SECONDS } from "../../utils/economyConfig";

function studyEducationNote(prefix: string) {
    return `You can view your education progress using \`${prefix}education\``;
}

function withStudyFooter(prefix: string, text: string) {
    return `${text} · ${studyEducationNote(prefix)}`;
}

// Preview (memorize) frame — matches the classic embed: no thumbnail, just title/desc/footer.
function buildPreviewContainer(game: Minigame, prefix: string) {
    return plainContainer(
        `## ${game.title}\n${game.previewText || "Get ready..."}`,
        withStudyFooter(prefix, `Memorize for ${game.previewTime}s...`)
    );
}

// Real-question frame — mascot "Think" thumbnail via infoContainer default.
function buildQuestionContainer(game: Minigame, prefix: string) {
    return infoContainer(
        "Quick Study Session",
        `${game.description}\n\nYou have **${game.time}** seconds!`,
        { hint: withStudyFooter(prefix, `You have ${game.time} seconds!`) }
    );
}

export async function handleStudy(message: Message, _args: string[] = []) {
    if (!message.guild) return;

    const prefix = await getGuildPrefix(message.guild.id);

    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id },
        include: { currentEducation: { include: { degree: true } } },
    });

    if (!user?.currentEducation) {
        return message.reply(v2Reply(errorContainer("Not Enrolled", `You are not enrolled in any degree. Use \`${prefix}education\` to start your education!`)));
    }

    // DB-Based Cooldown (Dynamic)
    const cooldownSeconds = DEFAULT_STUDY_COOLDOWN_SECONDS;
    const cooldownMs = cooldownSeconds * 1000;
    const lastStudyTime = user.currentEducation.lastStudy ? new Date(user.currentEducation.lastStudy).getTime() : 0;
    const now = Date.now();

    const testerBypass = isTesterMember(message.member);
    if (now - lastStudyTime < cooldownMs && !testerBypass) {
        const remainingMs = cooldownMs - (now - lastStudyTime);
        const expiresAt = Math.floor((now + remainingMs) / 1000);

        const angryUrl = getEmoteUrl(Mascot.Emotes.TeacherAngry);
        const cooldownContainer = errorContainer(
            "Cooldown",
            `You are tired of studying! Try again <t:${expiresAt}:R>.`,
            { hint: studyEducationNote(prefix), thumbnailUrl: angryUrl ?? undefined }
        );
        return message.reply(v2Reply(cooldownContainer));
    }

    // Fetch active Uni Store buffs
    const userId = message.author.id;
    const [studyLaptop, textbookBundle, labKit, calcPro, focusNotes, tutorPass, craftedStudyXp] = await Promise.all([
      redisService.get<{ sessionsLeft: number; xpMult: number }>(`study_laptop:${userId}`),
      redisService.get<{ sessionsLeft: number; xpMult: number }>(`textbook_bundle:${userId}`),
      redisService.get<{ sessionsLeft: number; failReduction: number; xpMult: number }>(`lab_kit:${userId}`),
      redisService.get<{ sessionsLeft: number; failRescue: number; xpMult: number }>(`calculator_pro:${userId}`),
      redisService.get<{ active: boolean; bonusXp: number }>(`focus_notes:${userId}`),
      redisService.get<{ active: boolean; xpMult: number; failReduction: number }>(`tutor_pass:${userId}`),
      redisService.get<{ bonusXp: number }>(`crafted_study_xp:${userId}`),
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

    let isWin = false;
    let reply: Message | null = null;

    // --- PREVIEW PHASE ---
    if (game.previewTime) {
        reply = await message.reply(v2Reply(buildPreviewContainer(game, prefix)));
        await new Promise(r => setTimeout(r, game.previewTime! * 1000));
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

        const questionContainer = buildQuestionContainer(game, prefix).addActionRowComponents(row);

        if (!reply) {
            reply = await message.reply(v2Reply(questionContainer));
        } else {
            await reply.edit(v2Reply(questionContainer));
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
            reply = await message.reply(v2Reply(buildQuestionContainer(game, prefix)));
        } else {
            await reply.edit(v2Reply(buildQuestionContainer(game, prefix)));
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

    // Disable buttons on game message (re-send text-only frame, no action row)
    if (reply) await reply.edit(v2Reply(buildQuestionContainer(game, prefix))).catch(() => { });

    // Fail rescue: if user failed but has active buffs with failReduction, attempt rescue
    let rescued = false;
    if (!isWin && failReduction > 0 && Math.random() < failReduction) {
        isWin = true;
        rescued = true;
    }

    // Result Handling
    if (!isWin) {
        if (tutorPass) await redisService.del(`tutor_pass:${userId}`);

        const failContainer = errorContainer(
            "Study Session Failed",
            `${Mascot.Emotes.Confused} You failed the test!\n\n**Correct Answer:** ${game.answer}`,
            { hint: studyEducationNote(prefix) }
        );

        await message.reply(v2Reply(failContainer));
        return;
    }

    // Success - Execute Study
    try {
        const focusNotesBonus = focusNotes?.bonusXp ?? 0;
        const craftedStudyBonus = craftedStudyXp?.bonusXp ?? 0;
        const bonusXp = Math.floor(50 * (xpMultiplier - 1)) + focusNotesBonus + craftedStudyBonus;
        const res = await study(message.author.id, message.guild!.id, bonusXp);

        const { questBus } = await import("../../services/questEvents");
        questBus.emit("education:study", { discordId: message.author.id });

        // Apply focus_notes bonus XP
        let focusBonus = "";
        if (focusNotes) {
            focusBonus = `\n**Focus Notes:** +${focusNotes.bonusXp} bonus XP applied!`;
            await redisService.del(`focus_notes:${userId}`);
        }
        if (craftedStudyXp) {
            focusBonus += `\nDuck Feather Quill: +${craftedStudyXp.bonusXp} education XP applied!`;
            await redisService.del(`crafted_study_xp:${userId}`);
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

        let resultDesc = res.msg + focusBonus + (rescued ? "\n**Your study items rescued the attempt!**" : "");

        let claimRow: ActionRowBuilder<ButtonBuilder> | null = null;
        if (res.scholarship) {
            resultDesc += `\n\n**Scholarship Unlocked!:** You reached **${res.scholarship.milestone}%** XP!\nReward: **${fmtCurrency(res.scholarship.amount)}**`;
            claimRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_scholarship_${res.scholarship.milestone}`)
                    .setLabel("Claim Scholarship")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(Mascot.Emotes.MoneyBag)
            );
        }

        // Study success is the ONLY spot that gets the next-step tip
        const studyTip = nextStepHint("study", prefix);
        const footerLine = withStudyFooter(prefix, footerText);
        const hintText = studyTip ? `${footerLine}\n${studyTip}` : footerLine;

        const teacherUrl = getEmoteUrl(Mascot.Emotes.Teacher);
        const resultContainer = successContainer(
            "Study Successful!",
            resultDesc,
            { hint: hintText, thumbnailUrl: teacherUrl ?? undefined }
        );
        if (claimRow) resultContainer.addActionRowComponents(claimRow);

        await message.reply(v2Reply(resultContainer));

    } catch (err: any) {
        await message.reply(v2Reply(errorContainer("Study Error", err.message)));
    }
}
