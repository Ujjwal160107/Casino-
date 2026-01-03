"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rank = void 0;
const levelService_1 = require("../../services/levelService");
const imageService_1 = require("../../services/imageService");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const rank = async (client, message, args) => {
    const targetUser = message.mentions.users.first() || message.author;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId: message.guildId } },
    });
    if (!user) {
        return message.reply("User not found in database. They need to chat to gain XP first!");
    }
    const currentXp = user.xp;
    const currentLevel = user.level;
    const xpForNext = levelService_1.LevelService.getXpForNextLevel(currentLevel);
    const rankCount = await prisma_1.default.user.count({
        where: {
            guildId: message.guildId,
            OR: [
                { level: { gt: currentLevel } },
                { level: currentLevel, xp: { gt: currentXp } }
            ]
        }
    });
    const rankPosition = rankCount + 1;
    try {
        const attachment = await (0, imageService_1.generateRankCard)({
            username: targetUser.username,
            level: currentLevel,
            currentXp: currentXp,
            requiredXp: xpForNext,
            rank: rankPosition,
            avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 })
        }, 'classic' // Hardcoded default, removing theme dependancy
        );
        message.reply({ files: [attachment] });
    }
    catch (error) {
        console.error("Rank Image Error:", error);
        message.reply("Failed to generate rank card.");
    }
};
exports.rank = rank;
//# sourceMappingURL=rank.js.map