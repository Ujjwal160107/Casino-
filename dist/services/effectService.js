"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyItemEffects = applyItemEffects;
exports.getActiveEffects = getActiveEffects;
exports.getXPMultiplier = getXPMultiplier;
exports.cleanExpiredEffects = cleanExpiredEffects;
exports.removeTemporaryRoles = removeTemporaryRoles;
exports.formatTimeRemaining = formatTimeRemaining;
const prisma_1 = __importDefault(require("../utils/prisma"));
const discord_js_1 = require("discord.js");
const discordLogger_1 = require("../utils/discordLogger");
const branding_1 = require("../config/branding");
async function applyItemEffects(userId, guildId, effects, member) {
    const results = [];
    for (const effect of effects) {
        try {
            const result = await applyEffect(userId, guildId, effect, member);
            results.push(result);
        }
        catch (err) {
            results.push({
                message: `${branding_1.Mascot.Emotes.Fail} Failed to apply ${effect.type}: ${err.message}`,
                type: "ERROR"
            });
        }
    }
    return results;
}
async function applyEffect(userId, guildId, effect, member) {
    const client = member?.client;
    switch (effect.type) {
        case "ROLE_PERMANENT":
            if (!effect.roleId || !member)
                throw new Error("Missing role ID or member");
            await member.roles.add(effect.roleId);
            if (client) {
                await logEffectAction(client, guildId, "ROLE_PERMANENT", `Granted permanent role <@&${effect.roleId}> to <@${userId}>`);
            }
            return {
                message: `${branding_1.Mascot.Emotes.Accept} Granted permanent role <@&${effect.roleId}>`,
                type: "ROLE_PERMANENT"
            };
        case "ROLE_TEMPORARY":
            if (!effect.roleId || !member || !effect.duration) {
                throw new Error("Missing role ID, member, or duration");
            }
            await member.roles.add(effect.roleId);
            const expiresAt = new Date(Date.now() + effect.duration * 1000);
            await prisma_1.default.activeEffect.create({
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
                message: `${branding_1.Mascot.Emotes.Accept} Granted temporary role <@&${effect.roleId}> for ${formatDuration(effect.duration)}`,
                type: "ROLE_TEMPORARY"
            };
        case "XP_MULTIPLIER":
            if (!effect.multiplier || !effect.duration) {
                throw new Error("Missing multiplier or duration");
            }
            const user = await getUser(userId, guildId);
            const xpExpiresAt = new Date(Date.now() + effect.duration * 1000);
            await prisma_1.default.activeEffect.create({
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
            if (!effect.amount)
                throw new Error("Missing amount");
            const targetUser = await prisma_1.default.user.findUnique({
                where: { discordId_guildId: { discordId: userId, guildId } },
                include: { wallet: true }
            });
            if (!targetUser?.wallet)
                throw new Error("User wallet not found");
            await prisma_1.default.wallet.update({
                where: { id: targetUser.wallet.id },
                data: { balance: { increment: effect.amount } }
            });
            await prisma_1.default.transaction.create({
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
            if (!effect.levels)
                throw new Error("Missing levels");
            const boostedUser = await prisma_1.default.user.findUnique({
                where: { discordId_guildId: { discordId: userId, guildId } }
            });
            if (!boostedUser)
                throw new Error("User not found");
            await prisma_1.default.user.update({
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
            const statName = effect.stat;
            const statAmount = effect.amount || 1;
            if (!statName)
                throw new Error("Missing stat name");
            const shopItem = await prisma_1.default.shopItem.findFirst({ where: { name: { equals: "Chicken", mode: "insensitive" }, guildId } });
            if (!shopItem)
                throw new Error("Chicken item not configured");
            const chickenInv = await prisma_1.default.inventory.findUnique({ where: { userId_shopItemId: { userId: (await getUser(userId, guildId)).id, shopItemId: shopItem.id } } });
            if (!chickenInv || chickenInv.amount < 1)
                throw new Error("You do not own a chicken to boost.");
            const meta = chickenInv.meta || {};
            meta[statName] = (meta[statName] || 0) + statAmount;
            await prisma_1.default.inventory.update({
                where: { id: chickenInv.id },
                data: { meta }
            });
            if (client)
                await logEffectAction(client, guildId, "STAT_BOOST", `Boosted ${statName} by ${statAmount} for <@${userId}>`);
            return {
                message: `💪 **${statName.toUpperCase()}** increased by ${statAmount}!`,
                type: "STAT_BOOST"
            };
        case "DEATH_SAVE":
            const dsUser = await getUser(userId, guildId);
            const dsDuration = effect.duration || 86400;
            const dsExpires = new Date(Date.now() + dsDuration * 1000);
            await prisma_1.default.activeEffect.create({
                data: {
                    userId: dsUser.id,
                    guildId,
                    effectType: "DEATH_SAVE",
                    value: 1,
                    expiresAt: dsExpires
                }
            });
            if (client)
                await logEffectAction(client, guildId, "DEATH_SAVE", `Granted Death Save to <@${userId}>`);
            return {
                message: `🛡️ **Death Save** active! Your chicken will survive the next death (expires in ${formatDuration(dsDuration)}).`,
                type: "DEATH_SAVE"
            };
        case "STRESS_REDUCE":
            const stressAmount = effect.amount || effect.value || 10;
            const stressUser = await prisma_1.default.user.findUnique({
                where: { discordId_guildId: { discordId: userId, guildId } },
                include: { currentEducation: true }
            });
            if (!stressUser || !stressUser.currentEducation) {
                // If not enrolled, maybe it just relaxes them? But stress is on Education model.
                throw new Error("You need to be a student to have stress!");
            }
            const oldStress = stressUser.currentEducation.stress;
            const newStress = Math.max(0, oldStress - stressAmount);
            await prisma_1.default.userEducation.update({
                where: { id: stressUser.currentEducation.id },
                data: { stress: newStress }
            });
            if (client)
                await logEffectAction(client, guildId, "STRESS_REDUCE", `Reduced stress for <@${userId}> by ${stressAmount}`);
            return {
                message: `😌 **Relief!** Your stress went down by ${stressAmount}. (Stress: ${newStress}%)`,
                type: "STRESS_REDUCE"
            };
        case "EXAM_BOOST":
            const examBoostDuration = effect.duration || 3600; // 1 hour default
            const examBoostValue = effect.value || 1;
            const ebUser = await getUser(userId, guildId);
            await prisma_1.default.activeEffect.create({
                data: {
                    userId: ebUser.id,
                    guildId,
                    effectType: "EXAM_BOOST",
                    value: examBoostValue,
                    expiresAt: new Date(Date.now() + examBoostDuration * 1000)
                }
            });
            if (client)
                await logEffectAction(client, guildId, "EXAM_BOOST", `Granted Exam Boost (+${examBoostValue}) to <@${userId}>`);
            return {
                message: `🤓 **Cheat Sheet Active!** You have +${examBoostValue} effective Intelligence for the next ${formatDuration(examBoostDuration)} (or until exam).`,
                type: "EXAM_BOOST"
            };
        default:
            throw new Error(`Unknown effect type: ${effect.type}`);
    }
}
async function logEffectAction(client, guildId, type, description) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild)
        return;
    await (0, discordLogger_1.logToChannel)(client, {
        guild,
        type: "ECONOMY",
        title: `Item Effect: ${type}`,
        description: description,
        color: discord_js_1.Colors.Purple
    });
}
async function getUser(discordId, guildId) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } }
    });
    if (!user)
        throw new Error("User not found");
    return user;
}
async function getActiveEffects(userId, guildId) {
    const user = await getUser(userId, guildId);
    await cleanExpiredEffects(user.id);
    return prisma_1.default.activeEffect.findMany({
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
async function getXPMultiplier(userId, guildId) {
    try {
        const user = await getUser(userId, guildId);
        await cleanExpiredEffects(user.id);
        const xpEffects = await prisma_1.default.activeEffect.findMany({
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
        if (xpEffects.length === 0)
            return 1;
        return xpEffects.reduce((total, effect) => total * effect.value, 1);
    }
    catch {
        return 1;
    }
}
async function cleanExpiredEffects(userId) {
    const where = {
        expiresAt: { lt: new Date(), not: null }
    };
    if (userId) {
        where.userId = userId;
    }
    return prisma_1.default.activeEffect.deleteMany({ where });
}
async function removeTemporaryRoles(client) {
    const expiredRoleEffects = await prisma_1.default.activeEffect.findMany({
        where: {
            effectType: "TEMP_ROLE",
            expiresAt: { lt: new Date() }
        },
        include: { user: true }
    });
    for (const effect of expiredRoleEffects) {
        try {
            const roleId = effect.meta?.roleId;
            if (roleId) {
                const guild = await client.guilds.fetch(effect.guildId).catch(() => null);
                if (guild) {
                    const member = await guild.members.fetch(effect.user.discordId).catch(() => null);
                    if (member) {
                        await member.roles.remove(roleId).catch(err => console.error(`Failed to remove expired role ${roleId} from user ${effect.user.discordId}:`, err));
                        console.log(`✅ Removed expired role ${roleId} from ${member.user.tag}`);
                    }
                }
            }
        }
        catch (err) {
            console.error(`Error processing expired role effect ${effect.id}:`, err);
        }
        await prisma_1.default.activeEffect.delete({ where: { id: effect.id } });
    }
}
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}
function formatTimeRemaining(expiresAt) {
    const now = Date.now();
    const remaining = expiresAt.getTime() - now;
    if (remaining <= 0)
        return "Expired";
    const seconds = Math.floor(remaining / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}
//# sourceMappingURL=effectService.js.map