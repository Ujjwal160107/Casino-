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

    // Deduct money and release
    // Deduct money and release
    let retries = 3;
    while (retries > 0) {
        try {
            await prisma.$transaction([
                prisma.wallet.update({
                    where: { id: user.wallet.id },
                    data: { balance: { decrement: fine } }
                }),
                prisma.transaction.create({
                    data: {
                        walletId: user.wallet.id,
                        amount: -fine,
                        type: "jail_bail",
                        meta: { fine }
                    }
                }),
                prisma.user.update({
                    where: { discordId },
                    data: { isJailed: false, jailReleaseTime: null }
                })
            ]);
            break; // Success
        } catch (error: any) {
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
