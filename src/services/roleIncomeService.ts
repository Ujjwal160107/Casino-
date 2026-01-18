
import { Client, GuildMember } from "discord.js";
import prisma from "../utils/prisma";

/**
 * Sets or updates a role income configuration.
 * (Kept for backward compatibility with potential bot commands)
 */
export async function setRoleIncome(guildId: string, roleId: string, amount: number, cooldownSeconds: number = 86400, incomeType: string = "COLLECTIBLE") {
    return await prisma.roleIncome.upsert({
        where: {
            guildId_roleId: {
                guildId,
                roleId
            }
        },
        update: {
            amount,
            cooldown: cooldownSeconds,
            incomeType
        },
        create: {
            guildId,
            roleId,
            amount,
            cooldown: cooldownSeconds,
            incomeType
        }
    });
}

export async function getRoleIncomes(guildId: string) {
    return await prisma.roleIncome.findMany({ where: { guildId } });
}

/**
 * Claims collectible role incomes for a user.
 * Triggered by /collect command.
 */
export async function claimRoleIncome(discordId: string, guildId: string, roleIds: string[]) {
    const user = await prisma.user.findUnique({ where: { discordId_guildId: { discordId, guildId } } });
    if (!user) throw new Error("User profile not found.");

    // Fetch all potential incomes for the user's roles
    const allIncomes = await prisma.roleIncome.findMany({
        where: {
            guildId,
            roleId: { in: roleIds },
            incomeType: "COLLECTIBLE"
        }
    });

    if (allIncomes.length === 0) {
        return { totalClaimed: 0, details: [], status: [], message: "No collectible role income configured for your roles." };
    }

    // Fetch existing claims
    const claims = await prisma.roleIncomeClaim.findMany({
        where: {
            userId: user.id,
            roleIncomeId: { in: allIncomes.map(i => i.id) }
        }
    });

    const results = [];
    const status = []; // To hold next claim info for all roles
    let totalPayout = 0;
    const now = new Date();

    for (const income of allIncomes) {
        const claim = claims.find(c => c.roleIncomeId === income.id);
        let canClaim = true;
        let nextClaimAt = now;

        if (claim) {
            const cooldownEnds = new Date(claim.claimedAt.getTime() + income.cooldown * 1000);
            if (now < cooldownEnds) {
                canClaim = false;
                nextClaimAt = cooldownEnds;
            }
        }

        status.push({
            roleId: income.roleId,
            amount: income.amount,
            nextClaimAt,
            canClaim
        });

        if (canClaim) {
            await prisma.$transaction([
                prisma.bank.update({
                    where: { userId: user.id },
                    data: { balance: { increment: income.amount } }
                }),
                prisma.roleIncomeClaim.upsert({
                    where: {
                        userId_roleIncomeId: {
                            userId: user.id,
                            roleIncomeId: income.id
                        }
                    },
                    update: { claimedAt: now },
                    create: {
                        userId: user.id,
                        roleIncomeId: income.id,
                        claimedAt: now
                    }
                })
            ]);

            totalPayout += income.amount;
            results.push({ roleId: income.roleId, amount: income.amount });
            // Update status for this just-claimed item to show next cooldown
            const updatedStatus = status.find(s => s.roleId === income.roleId);
            if (updatedStatus) {
                updatedStatus.canClaim = false;
                updatedStatus.nextClaimAt = new Date(now.getTime() + income.cooldown * 1000);
            }
        }
    }

    return { totalClaimed: totalPayout, details: results, status };
}

/**
 * Processes automatic role income distribution.
 * To be run by a scheduler.
 */
export async function processAutomaticRoleIncomes(client: Client) {
    try {
        const autoIncomes = await prisma.roleIncome.findMany({
            where: { incomeType: "AUTOMATIC" }
        });

        if (autoIncomes.length === 0) return;

        // Group by Guild to fetch guild only once, but simple loop is fine for MVP
        // Optimization: Parallelize by income?

        for (const income of autoIncomes) {
            try {
                const guild = client.guilds.cache.get(income.guildId);
                if (!guild) continue;

                // We need to fetch/find the role
                const role = guild.roles.cache.get(income.roleId);
                if (!role) continue;

                // Ensure members are cached
                // Depending on intent, this might be empty.
                // Assuming the bot is properly set up with intents.
                if (role.members.size === 0) {
                    try {
                        await guild.members.fetch(); // Only fetch if we suspect cache miss? Expensive.
                    } catch (e) {
                        console.warn(`Failed to fetch members for guild ${guild.name}`);
                    }
                }

                if (role.members.size === 0) continue;

                const claims = await prisma.roleIncomeClaim.findMany({
                    where: { roleIncomeId: income.id }
                });

                const claimMap = new Map(claims.map(c => [c.userId, c])); // UserId is ObjectId
                const now = new Date();
                const cooldownMs = income.cooldown * 1000;

                // Identify eligible discord IDs
                const eligibleDiscordIds = role.members.map(m => m.id);

                // Fetch User ObjectIds for these Discord IDs
                const dbUsers = await prisma.user.findMany({
                    where: {
                        discordId: { in: eligibleDiscordIds },
                        guildId: income.guildId
                    },
                    select: { id: true, discordId: true }
                });

                const userMap = new Map(dbUsers.map(u => [u.discordId, u.id]));
                const usersToPay: string[] = [];

                for (const [discordId, dbUserId] of userMap) {
                    const claim = claimMap.get(dbUserId);
                    if (!claim) {
                        usersToPay.push(dbUserId);
                    } else {
                        const timeSince = now.getTime() - claim.claimedAt.getTime();
                        if (timeSince >= cooldownMs) {
                            usersToPay.push(dbUserId);
                        }
                    }
                }

                if (usersToPay.length === 0) continue;

                console.log(`[RoleIncome] Auto-paying ${income.amount} to ${usersToPay.length} users in ${guild.name}`);

                // Execute Payouts
                // Note: Prisma transaction limits? 
                // If too many users, split chunks?
                const chunkSize = 50;
                for (let i = 0; i < usersToPay.length; i += chunkSize) {
                    const chunk = usersToPay.slice(i, i + chunkSize);

                    await prisma.$transaction(async (tx) => {
                        await tx.bank.updateMany({
                            where: { userId: { in: chunk } },
                            data: { balance: { increment: income.amount } }
                        });

                        for (const userId of chunk) {
                            const existingClaim = claims.find(c => c.userId === userId);
                            if (existingClaim) {
                                await tx.roleIncomeClaim.update({
                                    where: { id: existingClaim.id },
                                    data: { claimedAt: now }
                                });
                            } else {
                                await tx.roleIncomeClaim.create({
                                    data: {
                                        userId,
                                        roleIncomeId: income.id,
                                        claimedAt: now
                                    }
                                });
                            }
                        }
                    });
                }
            } catch (err) {
                console.error(`[RoleIncome] Error processing income ${income.id}:`, err);
            }
        }
    } catch (error) {
        console.error("[RoleIncome] Fatal error:", error);
    }
}