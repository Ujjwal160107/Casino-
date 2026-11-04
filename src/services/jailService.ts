import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma";
import { DEFAULT_JAIL_FINE, DEFAULT_JAIL_TIME_SECONDS } from "../utils/economyConfig";

export async function jailUser(discordId: string, _guildId: string, durationSeconds?: number) {
    const time = durationSeconds ?? DEFAULT_JAIL_TIME_SECONDS;

    const releaseTime = new Date(Date.now() + time * 1000);

    await prisma.user.update({
        where: { discordId },
        data: {
            isJailed: true,
            jailReleaseTime: releaseTime
        }
    });

    return releaseTime;
}

/**
 * Jails a user inside the caller's transaction. A longer sentence already
 * being served is never shortened; an expired one is replaced.
 */
export async function jailUserTx(tx: Prisma.TransactionClient, discordId: string, seconds: number, now: Date = new Date()): Promise<Date> {
    const user = await tx.user.findUnique({
        where: { discordId },
        select: { isJailed: true, jailReleaseTime: true }
    });
    const fresh = new Date(now.getTime() + seconds * 1000);
    const serving = user?.isJailed && user.jailReleaseTime && user.jailReleaseTime > now ? user.jailReleaseTime : null;
    const release = serving && serving > fresh ? serving : fresh;

    await tx.user.update({
        where: { discordId },
        data: { isJailed: true, jailReleaseTime: release }
    });

    return release;
}

export async function releaseUser(discordId: string) {
    await prisma.user.update({
        where: { discordId },
        data: {
            isJailed: false,
            jailReleaseTime: null
        }
    });
}

export async function checkJailStatus(discordId: string): Promise<{ isJailed: boolean; releaseTime: Date | null }> {
    const user = await prisma.user.findUnique({
        where: { discordId },
        select: { isJailed: true, jailReleaseTime: true }
    });

    if (!user || !user.isJailed) {
        return { isJailed: false, releaseTime: null };
    }

    // Check if time expired
    if (user.jailReleaseTime && new Date() > user.jailReleaseTime) {
        await releaseUser(discordId);
        return { isJailed: false, releaseTime: null };
    }

    return { isJailed: true, releaseTime: user.jailReleaseTime };
}

/** Thrown inside the bail transaction to roll back the release when the wallet can't cover it. */
class InsufficientBailError extends Error {}

export async function payBail(discordId: string, _guildId: string): Promise<{ success: boolean; message: string }> {
    const fine = DEFAULT_JAIL_FINE;

    const user = await prisma.user.findUnique({
        where: { discordId },
        include: { wallet: true }
    });

    if (!user || !user.wallet) {
        return { success: false, message: "User or wallet not found." };
    }

    if (user.wallet.balance < fine) {
        return { success: false, message: `You need **${fine}** coins to post bail.` };
    }

    // Release and charge inside one transaction, each guarded on the state we
    // checked above: only the call that flips isJailed true -> false pays, so a
    // double-click (or a P2034 retry after the other click committed) cannot
    // charge the fine twice or bail out a player who is already free.
    let retries = 3;
    while (retries > 0) {
        try {
            const outcome = await prisma.$transaction(async (tx) => {
                const released = await tx.user.updateMany({
                    where: { discordId, isJailed: true },
                    data: { isJailed: false, jailReleaseTime: null }
                });
                if (released.count !== 1) return "not_jailed" as const;

                const charged = await tx.wallet.updateMany({
                    where: { id: user.wallet!.id, balance: { gte: fine } },
                    data: { balance: { decrement: fine } }
                });
                if (charged.count !== 1) throw new InsufficientBailError();

                await tx.transaction.create({
                    data: {
                        walletId: user.wallet!.id,
                        amount: -fine,
                        type: "jail_bail",
                        meta: { fine }
                    }
                });
                return "paid" as const;
            });
            if (outcome === "not_jailed") return { success: false, message: "You are not in jail!" };
            break; // Success
        } catch (error: any) {
            if (error instanceof InsufficientBailError) {
                return { success: false, message: `You need **${fine}** coins to post bail.` };
            }
            if (error.code === 'P2034' && retries > 1) {
                retries--;
                await new Promise(res => setTimeout(res, 200)); // Backoff
                continue;
            }
            throw error; // Re-throw other errors or if retries exhausted
        }
    }

    return { success: true, message: `You paid **${fine}** coins and have been released from jail.` };
}
