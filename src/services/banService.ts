import prisma from "../utils/prisma";

type BanFields = { isBanned: boolean; banExpiresAt: Date | null };

/** A ban is active until it expires; one without an expiry is permanent. */
export function isBanActive(user: BanFields | null | undefined, now = new Date()): boolean {
  return !!user?.isBanned && (!user.banExpiresAt || user.banExpiresAt > now);
}

export function banMessage(banExpiresAt: Date | null): string {
  return banExpiresAt
    ? `You are banned from the casino until <t:${Math.floor(banExpiresAt.getTime() / 1000)}:R>.`
    : "You are permanently banned from the casino.";
}

/**
 * Ban gate for paths that skip the command router (buttons, menus, modals).
 * Returns the message to show, or null when the user may act.
 */
export async function activeBanMessage(discordId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { isBanned: true, banExpiresAt: true },
  });
  return isBanActive(user) ? banMessage(user!.banExpiresAt) : null;
}
