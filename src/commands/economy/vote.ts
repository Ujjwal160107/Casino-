import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { errorContainer, successContainer, infoContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { GLOBAL_CURRENCY_EMOJI, Mascot } from "../../config/branding";
import { ensureUserAndWallet, addBalance } from "../../services/walletService";
import fetch from "node-fetch";
import { getGuildPrefix } from "../../utils/guildContext";
import { enqueueReminder, setReminderTypeEnabled, getReminderPrefs } from "../../services/cooldownReminderService";
import { conditionalClaim, userDateUnchanged } from "../../anticheat/claim";

const TOPGG_BOT_ID = "1371816936857669702";
const VOTE_LINK = `https://top.gg/bot/${TOPGG_BOT_ID}?s=0825a328ae527`;
const REVIEW_LINK = `https://top.gg/bot/${TOPGG_BOT_ID}#reviews`; // Assuming this is correct based on user request
const VOTE_REWARD = 100_000;

export async function handleVote(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;

    const user = await ensureUserAndWallet(message.author.id, message.guild.id, message.author.username);
    const prefix = await getGuildPrefix(message.guild.id);
    const voteReward = VOTE_REWARD;
    const now = new Date();
    const cooldown = 12 * 60 * 60 * 1000; // 12 Hours

    // Handle Reminder Toggle
    if (args[0]?.toLowerCase() === "reminder" || args[0]?.toLowerCase() === "remind") {
        const prefs = await getReminderPrefs(user.discordId);
        const currentlyOn = prefs.remindersEnabled && !prefs.disabledReminders.includes("vote");
        const newState = await setReminderTypeEnabled(user.discordId, "vote", !currentlyOn);
        return message.reply(v2Reply(
            errorContainer("Reminder Settings", `Vote reminders are now **${newState ? "ENABLED" : "DISABLED"}**. Manage all reminders with \`${prefix}settings\`.`)
        ));
    }

    // Check if user has voted recently (local DB cooldown)
    if (user.lastVote) {
        const diff = now.getTime() - user.lastVote.getTime();
        if (diff < cooldown) {
            const readyAt = new Date(user.lastVote.getTime() + cooldown);
            return message.reply(v2Reply(
                errorContainer("Already Voted", `You can vote again <t:${Math.floor(readyAt.getTime() / 1000)}:R>.`)
            ));
        }
    }

    // If verification requested (e.g. !vote check or automatic)
    // For now, let's make !vote just show info, and !vote claim to try claiming?
    // User requested "users can get money from votes... amount is configurable...".
    // Usually standard flow: User votes -> comes back -> types !vote.

    // Check Top.gg API
    let hasVoted = false;
    const topggToken = process.env.TOPGG_TOKEN;

    if (topggToken) {
        try {
            const res = await fetch(`https://top.gg/api/bots/${TOPGG_BOT_ID}/check?userId=${message.author.id}`, {
                headers: { 'Authorization': topggToken }
            });
            const data: any = await res.json();
            if (data.voted === 1) {
                hasVoted = true;
            }
        } catch (err) {
            console.error("Top.gg API Error:", err);
            // Fallback? If API fails, we probably shouldn't give money to prevent exploit, or just warn.
            return message.reply(v2Reply(
                errorContainer("API Error", "Could not verify vote status with Top.gg. Please try again later.")
            ));
        }
    } else {
        // Dev mode / No token: Assume true or warn?
        // Warn user
        if (process.env.NODE_ENV === "development") {
            hasVoted = true; // Auto-pass in dev
        } else {
            // We can't verify without token.
            // But we display the link anyway.
        }
    }

    if (hasVoted) {
        // Reserve the vote window atomically BEFORE crediting. Concurrent !vote
        // calls all read the same stale lastVote; only one CAS can flip it.
        const claimed = await conditionalClaim(() =>
            prisma.user.updateMany({
                // userDateUnchanged matches an absent lastVote too — a plain
                // `{ lastVote: null }` filter would not, blocking first-time voters
                // from ever claiming (Prisma/Mongo null vs. missing field).
                where: { discordId: user.discordId, ...userDateUnchanged("lastVote", user.lastVote ?? null) },
                data: { lastVote: now },
            })
        );

        if (!claimed) {
            const readyAt = new Date(now.getTime() + cooldown);
            return message.reply(v2Reply(
                errorContainer("Already Claimed", `You already claimed this vote reward. Come back <t:${Math.floor(readyAt.getTime() / 1000)}:R>.`)
            ));
        }

        void enqueueReminder(user.discordId, "vote", new Date(now.getTime() + cooldown));

        // Credit through addBalance so caps + logging + garnishment apply uniformly.
        await addBalance(user.discordId, message.author.username, voteReward, "vote_reward", { source: "top.gg" }, true);

        const container = successContainer(
            `${Mascot.Emotes.Success} Vote Verified!`,
            `Thank you for voting for **Fortuna**!\n\nYou have received **${voteReward.toLocaleString()} ${GLOBAL_CURRENCY_EMOJI}**.`,
            { hint: nextStepHint("vote") }
        );

        return message.reply(v2Reply(container));

    } else {
        // Show Vote Links (Default State)
        const configWarning = (!topggToken && process.env.NODE_ENV !== "development")
            ? `\n\n**Config Warning:** Top.gg Token not configured. Automatic verification unavailable.`
            : "";

        const container = infoContainer(
            `Vote for ${message.client.user?.username || "Us"}`,
            `Support the bot and earn **${voteReward.toLocaleString()} ${GLOBAL_CURRENCY_EMOJI}** every 12 hours!\n\n` +
            `**[Click Here to Vote](${VOTE_LINK})**\n` +
            `If you're enjoying Fortuna, please consider leaving a review!\n` +
            `**[Leave a Review](${REVIEW_LINK})**\n\n` +
            `**Instructions:**\n` +
            `1. Click the link above and vote.\n` +
            `2. Come back here and run \`${prefix}vote\` again to claim your reward!` +
            configWarning,
            { thumbnailUrl: message.client.user?.displayAvatarURL() || undefined }
        );

        return message.reply(v2Reply(container));
    }
}
