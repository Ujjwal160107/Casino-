import prisma from "../utils/prisma";
import { getGuildConfig } from "./guildConfigService";

export class LevelService {
    static getXpForLevel(level: number): number {
        // Example formula: 100 * level^2 or something linear/exponential
        // Let's use a common one: 50 * (level ^ 2) - 50 * level (Example)
        // Or simpler: Level * 1000? 
        // dailyQuest gives 50,000 XP? That's huge.
        // Let's look at dailyQuest again. QUEST_REWARD = { money: 50000 } no XP yet.
        // I will set it to 1000 XP per level base * multiplier.
        // For now, let's use: Base 100 * level.
        return 100 * Math.pow(level, 1.5);
    }

    static async addXp(discordId: string, guildId: string, amount: number) {
        const user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId, guildId } }
        });

        if (!user) return null;

        let newXp = user.xp + amount;
        let newLevel = user.level;
        let leveledUp = false;

        // Calculate if level up
        // Simple iterative check (safe for small jumps)
        let needed = Math.floor(100 * Math.pow(newLevel + 1, 1.5)); // Scaling

        while (newXp >= needed) {
            newXp -= needed;
            newLevel++;
            leveledUp = true;
            needed = Math.floor(100 * Math.pow(newLevel + 1, 1.5));
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { xp: newXp, level: newLevel }
        });

        return { leveledUp, newLevel };
    }
}
