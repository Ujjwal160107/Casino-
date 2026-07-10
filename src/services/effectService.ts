import prisma from "../utils/prisma";
import { globalCatalogGuildFilter } from "../utils/globalCatalog";
import { GuildMember, Client, Colors } from "discord.js";
import { logToChannel } from "../utils/discordLogger";
import { Mascot } from "../config/branding";

export type EffectType =
    | "ROLE_PERMANENT"
    | "ROLE_TEMPORARY"
    | "REMOVE_ROLE"
    | "STAT_BOOST"
    | "DEATH_SAVE"
    | "STRESS_REDUCE"
    | "EXAM_BOOST"
    | "PAY_MULTIPLIER"
    | "COOLDOWN_REDUCTION"
    | "STRESS_REDUCTION"
    | "XP_MULTIPLIER"
    | "LEVEL_BOOST"
    | "MONEY"
    | "CUSTOM_MESSAGE";

export interface ItemEffect {
    type: EffectType;
    roleId?: string;
    duration?: number;
    multiplier?: number;
    message?: string;
    amount?: number;
    levels?: number;
    value?: number;
    trigger?: "BUY" | "USE";
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

        case "REMOVE_ROLE":
            if (!effect.roleId || !member) throw new Error("Missing role ID or member");
            await member.roles.remove(effect.roleId);

            if (client) {
                await logEffectAction(client, guildId, "REMOVE_ROLE", `Removed role <@&${effect.roleId}> from <@${userId}>`);
            }

            return {
                message: `${Mascot.Emotes.Accept} Removed role <@&${effect.roleId}>`,
                type: "REMOVE_ROLE"
            };

        case "ROLE_TEMPORARY":
            if (!effect.roleId || !member || !effect.duration) {
                throw new Error("Missing role ID, member, or duration");
            }
            await member.roles.add(effect.roleId);
            const expiresAt = new Date(Date.now() + effect.duration * 1000);

            await getUser(userId);
            await prisma.activeEffect.create({
                data: {
                    userId,
                    effectType: "TEMP_ROLE",
                    value: 0,
                    expiresAt,
                    meta: { roleId: effect.roleId, guildId }
                }
            });

            if (client) {
                await logEffectAction(client, guildId, "ROLE_TEMPORARY", `Granted temporary role <@&${effect.roleId}> to <@${userId}> for ${formatDuration(effect.duration)}`);
            }

            return {
                message: `${Mascot.Emotes.Accept} Granted temporary role <@&${effect.roleId}> for ${formatDuration(effect.duration)}`,
                type: "ROLE_TEMPORARY"
            };



        case "CUSTOM_MESSAGE":
            return {
                message: effect.message || "✨ Item used successfully!",
                type: "CUSTOM_MESSAGE"
            };

        case "MONEY":
            if (!effect.amount) throw new Error("Missing amount");

            const targetUser = await prisma.user.findUnique({
                where: { discordId: userId },
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
                message: `💰 Received ${effect.amount.toLocaleString('en-US')} coins!`,
                type: "MONEY"
            };



        case "STAT_BOOST":
            const statName = (effect as any).stat;
            const statAmount = (effect as any).amount || 1;

            if (!statName) throw new Error("Missing stat name");

            const shopItem = await prisma.shopItem.findFirst({
                where: globalCatalogGuildFilter({
                    name: { equals: "Chicken", mode: "insensitive" },
                }),
            });
            if (!shopItem) throw new Error("Chicken item not configured");

            const chickenInv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId, shopItemId: shopItem.id } } });
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
            await getUser(userId);
            const dsDuration = effect.duration || 86400;
            const dsExpires = new Date(Date.now() + dsDuration * 1000);

            await prisma.activeEffect.create({
                data: {
                    userId,
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

        case "PAY_MULTIPLIER":
        case "COOLDOWN_REDUCTION": {
            await getUser(userId);
            const duration = effect.duration || 86400;
            const exp = new Date(Date.now() + duration * 1000);

            await prisma.activeEffect.create({
                data: {
                    userId,
                    effectType: effect.type,
                    value: effect.value || 0,
                    expiresAt: exp
                }
            });

            if (client) await logEffectAction(client, guildId, effect.type, `Activated ${effect.type} (${effect.value}) for <@${userId}> for ${formatDuration(duration)}`);

            return {
                message: `${Mascot.Emotes.Success} **Boost Activated!**\n\n**Effect:** ${effect.type === "PAY_MULTIPLIER" ? "+" + ((effect.value || 0) * 100).toFixed(0) + "% Pay" : "-" + ((effect.value || 0) / 60).toFixed(1) + "m Cooldown"}\n**Duration:** ${formatDuration(duration)}`,
                type: "CUSTOM_MESSAGE"
            };
        }

        case "STRESS_REDUCTION":
        case "STRESS_REDUCE":
            const stressAmount = effect.amount || effect.value || 10;
            const stressUser = await prisma.user.findUnique({
                where: { discordId: userId }
            });

            if (!stressUser || stressUser.jobStress <= 0) {
                return {
                    message: `${Mascot.Emotes.Think} You are already chill! usage canceled.`,
                    type: "ERROR"
                };
            }

            const oldStress = stressUser.jobStress;
            const newStress = Math.max(0, oldStress - stressAmount);

            await prisma.user.update({
                where: { discordId: userId },
                data: { jobStress: newStress }
            });

            if (client) await logEffectAction(client, guildId, "STRESS_REDUCTION", `Reduced stress for <@${userId}> by ${stressAmount}`);

            return {
                message: `😌 **Relief!** Your job stress went down by ${stressAmount}. (Stress: ${newStress}%)`,
                type: "STRESS_REDUCE"
            };

        case "EXAM_BOOST":
            const examBoostDuration = effect.duration || 3600;
            const examBoostValue = effect.value || 1;

            await getUser(userId);

            await prisma.activeEffect.create({
                data: {
                    userId,
                    effectType: "EXAM_BOOST",
                    value: examBoostValue,
                    expiresAt: new Date(Date.now() + examBoostDuration * 1000)
                }
            });

            if (client) await logEffectAction(client, guildId, "EXAM_BOOST", `Granted Exam Boost (+${examBoostValue}) to <@${userId}>`);

            return {
                message: `🤓 **Cheat Sheet Active!** You have +${examBoostValue} effective Intelligence for the next ${formatDuration(examBoostDuration)} (or until exam).`,
                type: "EXAM_BOOST"
            };

        case "XP_MULTIPLIER": {
            await getUser(userId);
            const duration = effect.duration || 3600;
            const exp = new Date(Date.now() + duration * 1000);

            await prisma.activeEffect.create({
                data: {
                    userId,
                    effectType: "XP_MULTIPLIER",
                    value: effect.multiplier || 1.5,
                    expiresAt: exp
                }
            });

            if (client) await logEffectAction(client, guildId, "XP_MULTIPLIER", `Activated XP Multiplier (${effect.multiplier}x) for <@${userId}>`);

            return {
                message: `⚡ **XP Boost Active!** earning ${effect.multiplier}x XP for ${formatDuration(duration)}.`,
                type: "XP_MULTIPLIER"
            };
        }

        case "LEVEL_BOOST": {
            await getUser(userId);
            const levels = effect.levels || 1;

            await prisma.user.update({
                where: { discordId: userId },
                data: { level: { increment: levels } }
            });

            if (client) await logEffectAction(client, guildId, "LEVEL_BOOST", `Granted +${levels} levels to <@${userId}>`);

            return {
                message: `📈 **Leveled Up!** You gained +${levels} levels!`,
                type: "LEVEL_BOOST"
            };
        }

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

async function getUser(discordId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId }
    });
    if (!user) throw new Error("User not found");
    return user;
}

export async function getActiveEffects(userId: string, _guildId?: string) {
    await getUser(userId);
    await cleanExpiredEffects(userId);

    return prisma.activeEffect.findMany({
        where: {
            userId,
            OR: [
                { expiresAt: { gt: new Date() } },
                { expiresAt: null }
            ]
        },
        orderBy: { createdAt: 'desc' }
    });
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
            const guildId = (effect.meta as any)?.guildId;
            if (roleId && guildId) {
                const guild = await client.guilds.fetch(guildId).catch(() => null);
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
