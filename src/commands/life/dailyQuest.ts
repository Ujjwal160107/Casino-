import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, AttachmentBuilder } from "discord.js";
import path from "path";
import { getGuildConfig } from "../../services/guildConfigService";
import { getDailyQuest, claimQuestReward, QUEST_REWARD } from "../../services/questService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { Mascot } from "../../config/branding";

export async function handleDailyQuest(message: Message, args: string[]) {
    if (!message.guild) return;

    // Ensure config is loaded
    const config = await getGuildConfig(message.guild.id);

    // Resolve user to get internal ObjectId
    const authorDiscordId = message.author.id;
    const user = await ensureUserAndWallet(authorDiscordId, message.guild.id, message.author.tag);
    const userId = user.id; // This is the ObjectId

    // Get or generate quest
    const quest = await getDailyQuest(userId, message.guild.id);
    const tasks = quest.tasks as any[];

    const imagePath = path.join(__dirname, "../../assets/daily_quest.jpg");
    const attachment = new AttachmentBuilder(imagePath, { name: 'daily_quest.jpg' });

    // Build Embed
    const embed = new EmbedBuilder()
        .setTitle(`📜 Daily Quests`)
        .setDescription(`Complete 5 daily missions to earn a **Massive Reward**!`)
        .setColor(quest.completed ? 0x00FF00 : 0xFFAA00);

    // Dynamic Image Positioning
    if (quest.completed) {
        embed.setImage("attachment://daily_quest.jpg");
    } else {
        embed.setThumbnail("attachment://daily_quest.jpg");
    }

    let progressText = "";
    tasks.forEach((task, index) => {
        const status = task.completed ? Mascot.Emotes.Tick : "⬜";
        const progressPercent = Math.min(100, Math.round((task.progress / task.target) * 100));
        // Simple progress bar
        const barLength = 10;
        const filled = Math.round((progressPercent / 100) * barLength);
        const bar = "█".repeat(filled) + "░".repeat(barLength - filled);

        progressText += `**${index + 1}. ${task.description}**\n${status} \`${bar}\` ${task.progress}/${task.target}\n\n`;
    });

    embed.addFields({ name: "Your Missions", value: progressText });

    if (quest.rewardClaimed) {
        embed.setFooter({ text: "You have already claimed today's reward! Come back tomorrow." });
        return message.reply({ embeds: [embed], files: [attachment] });
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    if (quest.completed && !quest.rewardClaimed) {
        embed.addFields({
            name: "🎉 All Quests Completed!",
            value: `Claim your reward:\n${Mascot.Emotes.MoneyBag || "💰"} **${fmtCurrency(QUEST_REWARD.money, config.currencyEmoji)}**\n${Mascot.Emotes.Sparks || "✨"} **${QUEST_REWARD.xp} XP**`
        });

        const claimRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("claim_daily_quest")
                    .setLabel("Claim Reward")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(Mascot.Emotes.Lootbox?.match(/:(\d+)>/)?.[1] || "🎁")
            );
        rows.push(claimRow);
    } else {
        embed.setFooter({ text: "Complete all missions to unlock the reward." });
    }

    const reply = await message.reply({ embeds: [embed], components: rows, files: [attachment] });

    if (quest.completed && !quest.rewardClaimed) {
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on("collect", async (i) => {
            if (i.user.id !== authorDiscordId) {
                await i.reply({ content: "This is not your quest log!", ephemeral: true });
                return;
            }

            if (i.customId === "claim_daily_quest") {
                const result = await claimQuestReward(userId);
                if (result.success) {
                    const successEmbedObj = successEmbed(message.author, "Reward Claimed!", `You received **${fmtCurrency(result.reward!.money, config.currencyEmoji)}** and **${result.reward!.xp} XP**!`);
                    successEmbedObj.setImage("attachment://daily_quest.jpg");

                    await i.update({
                        embeds: [successEmbedObj],
                        components: [],
                        files: [attachment]
                    });
                } else {
                    await i.reply({ content: result.message, ephemeral: true });
                }
            }
        });
    }
}
