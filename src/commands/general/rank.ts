import { Message } from 'discord.js';
import { LevelService } from '../../services/levelService';
import { generateRankCard } from '../../services/imageService';
import prisma from '../../utils/prisma';

export const rank = async (client: any, message: Message, args: string[]) => {
    const targetUser = message.mentions.users.first() || message.author;
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guildId! } },
    });
    if (!user) {
        return message.reply("User not found in database. They need to chat to gain XP first!");
    }
    const currentXp = user.xp;
    const currentLevel = user.level;
    const xpForNext = LevelService.getXpForNextLevel(currentLevel);
    const rankCount = await prisma.user.count({
        where: {
            guildId: message.guildId!,
            OR: [
                { level: { gt: currentLevel } },
                { level: currentLevel, xp: { gt: currentXp } }
            ]
        }
    });
    const rankPosition = rankCount + 1;
    try {
        const attachment = await generateRankCard(
            {
                username: targetUser.username,
                level: currentLevel,
                currentXp: currentXp,
                requiredXp: xpForNext,
                rank: rankPosition,
                avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 })
            },
            'classic' // Hardcoded default, removing theme dependancy
        );
        message.reply({ files: [attachment] });
    } catch (error) {
        console.error("Rank Image Error:", error);
        message.reply("Failed to generate rank card.");
    }
};