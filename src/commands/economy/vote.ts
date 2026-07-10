import { Message, EmbedBuilder, Colors } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed } from "../../utils/embed";
import { GLOBAL_CURRENCY_EMOJI, Mascot } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import fetch from "node-fetch";
import { getGuildPrefix } from "../../utils/guildContext";

const TOPGG_BOT_ID = "1371816936857669702";
const VOTE_LINK = `https://top.gg/bot/${TOPGG_BOT_ID}?s=0825a328ae527`;
const REVIEW_LINK = `https://top.gg/bot/${TOPGG_BOT_ID}#reviews`; // Assuming this is correct based on user request
const VOTE_REWARD = 5_000;

export async function handleVote(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;

    const user = await ensureUserAndWallet(message.author.id, message.guild.id, message.author.username);
    const wallet = user.wallet!;
    const prefix = await getGuildPrefix(message.guild.id);
    const voteReward = VOTE_REWARD;
    const now = new Date();
    const cooldown = 12 * 60 * 60 * 1000; // 12 Hours

    // Handle Reminder Toggle
    if (args[0]?.toLowerCase() === "reminder" || args[0]?.toLowerCase() === "remind") {
        const newState = !user.voteReminder;
        await prisma.user.update({
            where: { discordId: user.discordId },
            data: { voteReminder: newState }
        });
        return message.reply({
            embeds: [errorEmbed(message.author, "Reminder Settings", `Vote reminders are now **${newState ? "ENABLED" : "DISABLED"}**.`)]
        });
    }

    // Check if user has voted recently (local DB cooldown)
    if (user.lastVote) {
        const diff = now.getTime() - user.lastVote.getTime();
        if (diff < cooldown) {
            const readyAt = new Date(user.lastVote.getTime() + cooldown);
            return message.reply({
                embeds: [errorEmbed(message.author, "Already Voted", `You can vote again <t:${Math.floor(readyAt.getTime() / 1000)}:R>.`)]
            });
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
            return message.reply({ embeds: [errorEmbed(message.author, "API Error", "Could not verify vote status with Top.gg. Please try again later.")] });
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
        // Grant Reward
        await prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: voteReward } }
        });

        await prisma.user.update({
            where: { discordId: user.discordId },
            data: { lastVote: now }
        });

        await prisma.transaction.create({
            data: {
                walletId: wallet.id,
                amount: voteReward,
                type: "vote_reward",
                isEarned: true,
                meta: { source: "top.gg" }
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`${Mascot.Emotes.Success} Vote Verified!`)
            .setDescription(`Thank you for voting for **Fortuna**!\n\nYou have received **${voteReward.toLocaleString()} ${GLOBAL_CURRENCY_EMOJI}**.`)
            .setColor(Colors.Green)
            .setFooter({ text: "Vote again in 12 hours!" });

        return message.reply({ embeds: [embed] });

    } else {
        // Show Vote Links (Default State)
        const embed = new EmbedBuilder()
            .setTitle(`🗳️ Vote for ${message.client.user?.username || "Us"}`)
            .setDescription(
                `Support the bot and earn **${voteReward.toLocaleString()} ${GLOBAL_CURRENCY_EMOJI}** every 12 hours!\n\n` +
                `**[Click Here to Vote](${VOTE_LINK})**\n` +
                `If you're enjoying Fortuna, please consider leaving a review!\n` +
                `**[Leave a Review](${REVIEW_LINK})**\n\n` +
                `**Instructions:**\n` +
                `1. Click the link above and vote.\n` +
                `2. Come back here and run \`${prefix}vote\` again to claim your reward!`
            )
            .setColor(Colors.Gold)
            .setThumbnail(message.client.user?.displayAvatarURL() || "")
            .setFooter({ text: "Rewards available every 12 hours." });

        if (!topggToken && process.env.NODE_ENV !== "development") {
            embed.addFields({ name: "⚠️ Config Warning", value: "Top.gg Token not configured. Automatic verification unavailable." });
        }

        return message.reply({ embeds: [embed] });
    }
}
