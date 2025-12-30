import prisma from "../utils/prisma";
import { GuildMember, Client, Colors } from "discord.js";
import { logToChannel } from "../utils/discordLogger";
import { Mascot } from "../config/branding";

export type EffectType =
    | "ROLE_PERMANENT"
    | "ROLE_TEMPORARY"
    | "XP_MULTIPLIER"
    | "CUSTOM_MESSAGE"
    | "MONEY"
    | "LEVEL_BOOST"
    | "STAT_BOOST"
    | "DEATH_SAVE";

export interface ItemEffect {
    type: EffectType;
    roleId?: string;
    duration?: number;
    multiplier?: number;
    message?: string;
    amount?: number;
    levels?: number;
}

export interface ItemEffectResult {
    message: string;
    type: EffectType | "ERROR";
}

export async function applyItemEffects(
    userId: string,
    guildId: string,
    effects: ItemEffect[],
    member?: GuildMember
): Promise<ItemEffectResult[]> {
    const results: ItemEffectResult[] = [];

    for (const effect of effects) {
        try {
            const result = await applyEffect(userId, guildId, effect, member);
            results.push(result);
        } catch (err: any) {
            results.push({
                message: `${Mascot.Emotes.Fail} Failed to apply ${effect.type}: ${err.message}`,
                type: "ERROR"
            });
        }
    }

    return results;
}

async function applyEffect(
    userId: string,
    guildId: string,
    effect: ItemEffect,
    member?: GuildMember
): Promise<ItemEffectResult> {
    const client = member?.client;

    switch (effect.type) {
        case "ROLE_PERMANENT":
            if (!effect.roleId || !member) throw new Error("Missing role ID or member");
            await member.roles.add(effect.roleId);

            if (client) {
                await logEffectAction(client, guildId, "ROLE_PERMANENT", `Granted permanent role <@&${effect.roleId}> to <@${userId}>`);
            }

            return {
                message: `${Mascot.Emotes.Accept} Granted permanent role <@&${effect.roleId}>`,
                type: "ROLE_PERMANENT"
            };

        case "ROLE_TEMPORARY":
            if (!effect.roleId || !member || !effect.duration) {
                throw new Error("Missing role ID, member, or duration");
            }
            await member.roles.add(effect.roleId);
            const expiresAt = new Date(Date.now() + effect.duration * 1000);

            await prisma.activeEffect.create({
                data: {
                    userId: (await getUser(userId, guildId)).id,
                    guildId,
                    effectType: "TEMP_ROLE",
                    value: 0,
                    expiresAt,
                    meta: { roleId: effect.roleId }
                }
            });

            if (client) {
                await logEffectAction(client, guildId, "ROLE_TEMPORARY", `Granted temporary role <@&${effect.roleId}> to <@${userId}> for ${formatDuration(effect.duration)}`);
            }

            return {
                message: `${Mascot.Emotes.Accept} Granted temporary role <@&${effect.roleId}> for ${formatDuration(effect.duration)}`,
                type: "ROLE_TEMPORARY"
            };

        case "XP_MULTIPLIER":
            if (!effect.multiplier || !effect.duration) {
                throw new Error("Missing multiplier or duration");
            }

            const user = await getUser(userId, guildId);
            const xpExpiresAt = new Date(Date.now() + effect.duration * 1000);

            await prisma.activeEffect.create({
                data: {
                    userId: user.id,
                    guildId,
                    effectType: "XP_MULTIPLIER",
                    value: effect.multiplier,
                    expiresAt: xpExpiresAt,
                }
            });

            if (client) {
                await logEffectAction(client, guildId, "XP_MULTIPLIER", `Activated ${effect.multiplier}x XP Multiplier for <@${userId}> for ${formatDuration(effect.duration)}`);
            }

            return {
                message: `⚡ ${effect.multiplier}x XP Multiplier activated for ${formatDuration(effect.duration)}!`,
                type: "XP_MULTIPLIER"
            };

        case "CUSTOM_MESSAGE":
            return {
                message: effect.message || "✨ Item used successfully!",
                type: "CUSTOM_MESSAGE"
            };

        case "MONEY":
            if (!effect.amount) throw new Error("Missing amount");

            const targetUser = await prisma.user.findUnique({
                where: { discordId_guildId: { discordId: userId, guildId } },
                include: { wallet: true }
            });

            if (!targetUser?.wallet) throw new Error("User wallet not found");

            await prisma.wallet.update({
                where: { id: targetUser.wallet.id },
                data: { balance: { increment: effect.amount } }
            });

            await prisma.transaction.create({
                data: {
                    walletId: targetUser.wallet.id,
                    amount: effect.amount,
                    type: "item_reward",
                    meta: { source: "shop_item" },
                    isEarned: true
                }
            });

            if (client) {
                await logEffectAction(client, guildId, "MONEY", `Granted ${effect.amount} coins to <@${userId}>`);
            }

            return {
                message: `💰 Received ${effect.amount.toLocaleString()} coins!`,
                type: "MONEY"
            };

        case "LEVEL_BOOST":
            if (!effect.levels) throw new Error("Missing levels");

            const boostedUser = await prisma.user.findUnique({
                where: { discordId_guildId: { discordId: userId, guildId } }
            });

            if (!boostedUser) throw new Error("User not found");

            await prisma.user.update({
                where: { id: boostedUser.id },
                data: { level: { increment: effect.levels } }
            });

            if (client) {
                await logEffectAction(client, guildId, "LEVEL_BOOST", `Boosted <@${userId}> by ${effect.levels} levels`);
            }

            return {
                message: `📈 Level boost! +${effect.levels} levels!`,
                type: "LEVEL_BOOST"
            };

        case "STAT_BOOST":
            const statName = (effect as any).stat;
            const statAmount = (effect as any).amount || 1;

            if (!statName) throw new Error("Missing stat name");

            const shopItem = await prisma.shopItem.findFirst({ where: { name: { equals: "Chicken", mode: "insensitive" }, guildId } });
            if (!shopItem) throw new Error("Chicken item not configured");

            const chickenInv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: (await getUser(userId, guildId)).id, shopItemId: shopItem.id } } });
            if (!chickenInv || chickenInv.amount < 1) throw new Error("You do not own a chicken to boost.");

            const meta = (chickenInv.meta as any) || {};
            meta[statName] = (meta[statName] || 0) + statAmount;

            await prisma.inventory.update({
                where: { id: chickenInv.id },
                data: { meta }
            });

            if (client) await logEffectAction(client, guildId, "STAT_BOOST", `Boosted ${statName} by ${statAmount} for <@${userId}>`);

            return {
                message: `💪 **${statName.toUpperCase()}** increased by ${statAmount}!`,
                type: "STAT_BOOST"
            };

        case "DEATH_SAVE":
            const dsUser = await getUser(userId, guildId);
            const dsDuration = effect.duration || 86400;
            const dsExpires = new Date(Date.now() + dsDuration * 1000);

            await prisma.activeEffect.create({
                data: {
                    userId: dsUser.id,
                    guildId,
                    effectType: "DEATH_SAVE",
                    value: 1,
                    expiresAt: dsExpires
                }
            });

            if (client) await logEffectAction(client, guildId, "DEATH_SAVE", `Granted Death Save to <@${userId}>`);

            return {
                message: `🛡️ **Death Save** active! Your chicken will survive the next death (expires in ${formatDuration(dsDuration)}).`,
                type: "DEATH_SAVE"
            };

        default:
            throw new Error(`Unknown effect type: ${effect.type}`);
    }
}

async function logEffectAction(client: Client, guildId: string, type: string, description: string) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    await logToChannel(client, {
        guild,
        type: "ECONOMY",
        title: `Item Effect: ${type}`,
        description: description,
        color: Colors.Purple
    });
}

async function getUser(discordId: string, guildId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } }
    });
    if (!user) throw new Error("User not found");
    return user;
}

export async function getActiveEffects(userId: string, guildId: string) {
    const user = await getUser(userId, guildId);

    await cleanExpiredEffects(user.id);

    return prisma.activeEffect.findMany({
        where: {
            userId: user.id,
            guildId,
            OR: [
                { expiresAt: { gt: new Date() } },
                { expiresAt: null }
            ]
        },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getXPMultiplier(userId: string, guildId: string): Promise<number> {
    try {
        const user = await getUser(userId, guildId);
        await cleanExpiredEffects(user.id);

        const xpEffects = await prisma.activeEffect.findMany({
            where: {
                userId: user.id,
                guildId,
                effectType: "XP_MULTIPLIER",
                OR: [
                    { expiresAt: { gt: new Date() } },
                    { expiresAt: null }
                ]
            }
        });

        if (xpEffects.length === 0) return 1;

        return xpEffects.reduce((total, effect) => total * effect.value, 1);
    } catch {
        return 1;
    }
}

export async function cleanExpiredEffects(userId?: string) {
    const where: any = {
        expiresAt: { lt: new Date(), not: null }
    };

    if (userId) {
        where.userId = userId;
    }

    return prisma.activeEffect.deleteMany({ where });
}

export async function removeTemporaryRoles(client: Client) {
    const expiredRoleEffects = await prisma.activeEffect.findMany({
        where: {
            effectType: "TEMP_ROLE",
            expiresAt: { lt: new Date() }
        },
        include: { user: true }
    });

    for (const effect of expiredRoleEffects) {
        try {
            const roleId = (effect.meta as any)?.roleId;
            if (roleId) {
                const guild = await client.guilds.fetch(effect.guildId).catch(() => null);
                if (guild) {
                    const member = await guild.members.fetch(effect.user.discordId).catch(() => null);
                    if (member) {
                        await member.roles.remove(roleId).catch(err =>
                            console.error(`Failed to remove expired role ${roleId} from user ${effect.user.discordId}:`, err)
                        );
                        console.log(`✅ Removed expired role ${roleId} from ${member.user.tag}`);
                    }
                }
            }
        } catch (err) {
            console.error(`Error processing expired role effect ${effect.id}:`, err);
        }

        await prisma.activeEffect.delete({ where: { id: effect.id } });
    }
}

function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

export function formatTimeRemaining(expiresAt: Date): string {
    const now = Date.now();
    const remaining = expiresAt.getTime() - now;

    if (remaining <= 0) return "Expired";

    const seconds = Math.floor(remaining / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}
