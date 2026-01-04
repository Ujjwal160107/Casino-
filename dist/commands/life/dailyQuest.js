"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDailyQuest = handleDailyQuest;
const discord_js_1 = require("discord.js");
const path_1 = __importDefault(require("path"));
const guildConfigService_1 = require("../../services/guildConfigService");
const questService_1 = require("../../services/questService");
const walletService_1 = require("../../services/walletService");
const format_1 = require("../../utils/format");
const embed_1 = require("../../utils/embed");
const branding_1 = require("../../config/branding");
async function handleDailyQuest(message, args) {
    if (!message.guild)
        return;
    // Ensure config is loaded
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
    // Resolve user to get internal ObjectId
    const authorDiscordId = message.author.id;
    const user = await (0, walletService_1.ensureUserAndWallet)(authorDiscordId, message.guild.id, message.author.tag);
    const userId = user.id; // This is the ObjectId
    // Get or generate quest
    const quest = await (0, questService_1.getDailyQuest)(userId, message.guild.id);
    const tasks = quest.tasks;
    const imagePath = path_1.default.join(__dirname, "../../assets/daily_quest.jpg");
    const attachment = new discord_js_1.AttachmentBuilder(imagePath, { name: 'daily_quest.jpg' });
    // Build Embed
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(`📜 Daily Quests`)
        .setDescription(`Complete 5 daily missions to earn a **Massive Reward**!`)
        .setColor(quest.completed ? 0x00FF00 : 0xFFAA00);
    // Dynamic Image Positioning
    if (quest.completed) {
        embed.setImage("attachment://daily_quest.jpg");
    }
    else {
        embed.setThumbnail("attachment://daily_quest.jpg");
    }
    let progressText = "";
    tasks.forEach((task, index) => {
        const status = task.completed ? branding_1.Mascot.Emotes.Tick : "⬜";
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
    const rows = [];
    if (quest.completed && !quest.rewardClaimed) {
        embed.addFields({
            name: "🎉 All Quests Completed!",
            value: `Claim your reward:\n${branding_1.Mascot.Emotes.MoneyBag || "💰"} **${(0, format_1.fmtCurrency)(questService_1.QUEST_REWARD.money, config.currencyEmoji)}**\n${branding_1.Mascot.Emotes.Sparks || "✨"} **${questService_1.QUEST_REWARD.xp} XP**`
        });
        const claimRow = new discord_js_1.ActionRowBuilder()
            .addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId("claim_daily_quest")
            .setLabel("Claim Reward")
            .setStyle(discord_js_1.ButtonStyle.Success)
            .setEmoji(branding_1.Mascot.Emotes.Lootbox?.match(/:(\d+)>/)?.[1] || "🎁"));
        rows.push(claimRow);
    }
    else {
        embed.setFooter({ text: "Complete all missions to unlock the reward." });
    }
    const reply = await message.reply({ embeds: [embed], components: rows, files: [attachment] });
    if (quest.completed && !quest.rewardClaimed) {
        const collector = reply.createMessageComponentCollector({
            componentType: discord_js_1.ComponentType.Button,
            time: 60000
        });
        collector.on("collect", async (i) => {
            if (i.user.id !== authorDiscordId) {
                await i.reply({ content: "This is not your quest log!", ephemeral: true });
                return;
            }
            if (i.customId === "claim_daily_quest") {
                const result = await (0, questService_1.claimQuestReward)(userId);
                if (result.success) {
                    const successEmbedObj = (0, embed_1.successEmbed)(message.author, "Reward Claimed!", `You received **${(0, format_1.fmtCurrency)(result.reward.money, config.currencyEmoji)}** and **${result.reward.xp} XP**!`);
                    successEmbedObj.setImage("attachment://daily_quest.jpg");
                    await i.update({
                        embeds: [successEmbedObj],
                        components: [],
                        files: [attachment]
                    });
                }
                else {
                    await i.reply({ content: result.message, ephemeral: true });
                }
            }
        });
    }
}
//# sourceMappingURL=dailyQuest.js.map