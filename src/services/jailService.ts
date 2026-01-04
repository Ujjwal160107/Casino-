import prisma from "../utils/prisma";
import { getGuildConfig } from "./guildConfigService";
import { ensureUserAndWallet } from "./walletService";
import { getWalletById } from "./walletService";

export async function jailUser(userId: string, guildId: string, durationSeconds?: number) {
    const config = await getGuildConfig(guildId);
    const time = durationSeconds ?? config.jailTime; // Default from config

    const releaseTime = new Date(Date.now() + time * 1000);

    await prisma.user.update({
        where: { id: userId },
        data: {
            isJailed: true,
            jailReleaseTime: releaseTime
        }
    });

    return releaseTime;
}

export async function releaseUser(userId: string) {
    await prisma.user.update({
        where: { id: userId },
        data: {
            isJailed: false,
            jailReleaseTime: null
        }
    });
}

export async function checkJailStatus(userId: string): Promise<{ isJailed: boolean; releaseTime: Date | null }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isJailed: true, jailReleaseTime: true }
    });

    if (!user || !user.isJailed) {
        return { isJailed: false, releaseTime: null };
    }

    // Check if time expired
    if (user.jailReleaseTime && new Date() > user.jailReleaseTime) {
        await releaseUser(userId);
        return { isJailed: false, releaseTime: null };
    }

    return { isJailed: true, releaseTime: user.jailReleaseTime };
}

export async function payBail(userId: string, guildId: string): Promise<{ success: boolean; message: string }> {
    const config = await getGuildConfig(guildId);
    const fine = config.jailFine;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { wallet: true }
    });

    if (!user || !user.wallet) {
        return { success: false, message: "User or wallet not found." };
    }

    if (user.wallet.balance < fine) {
        return { success: false, message: `You need **${fine}** coins to post bail.` };
    }

    // Deduct money and release
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
            where: { id: userId },
            data: { isJailed: false, jailReleaseTime: null }
        })
    ]);

    return { success: true, message: `You paid **${fine}** coins and have been released from jail.` };
}
