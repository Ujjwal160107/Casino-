import prisma from '../utils/prisma';
import { getXPMultiplier } from './effectService';

const COOLDOWN_SECONDS = 60;
const xpCooldowns = new Map<string, number>();

export class LevelService {
    static calculateLevel(xp: number): number {
        // Basic calculation (not currently heavily used if getXpForNextLevel handles thresholds)
        // Can be improved based on formula: 5x^2 + 50x + 100
        // Inverse is complex, keeping basic return for now or implementing if needed
        return 0;
    }

    static getXpForNextLevel(level: number): number {
        return 5 * (level * level) + 50 * level + 100;
    }

    static async addXp(userId: string, guildId: string, amount: number, bypassCooldown: boolean = false) {
        const now = Date.now();
        const key = `${userId}-${guildId}`;
        const lastXp = xpCooldowns.get(key) || 0;

        if (!bypassCooldown && now - lastXp < COOLDOWN_SECONDS * 1000) {
            return null;
        }

        if (!bypassCooldown) {
            xpCooldowns.set(key, now);
        }

        const multiplier = await getXPMultiplier(userId, guildId);
        const finalAmount = Math.floor(amount * multiplier);

        let user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId: userId, guildId } },
        });

        if (!user) {
            return;
        }

        let newXp = user.xp + finalAmount;
        let newLevel = user.level;
        let leveledUp = false;
        let requiredXp = this.getXpForNextLevel(newLevel);

        while (newXp >= requiredXp) {
            newXp -= requiredXp;
            newLevel++;
            leveledUp = true;
            requiredXp = this.getXpForNextLevel(newLevel);
        }

        const updatedUser = await prisma.user.update({
            where: { discordId_guildId: { discordId: userId, guildId } },
            data: {
                xp: newXp,
                level: newLevel,
            },
        });

        return { leveledUp, newLevel, user: updatedUser, xpGained: finalAmount };
    }
}