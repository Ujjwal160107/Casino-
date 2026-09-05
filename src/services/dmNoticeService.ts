import { Client, ContainerBuilder } from "discord.js";
import { Mascot } from "../config/branding";
import { noticeContainer, v2Reply } from "../utils/componentsV2";
import { fmtCurrency } from "../utils/format";

// Every DM Fortuna sends a player is built and sent from here, so they all
// share one look (noticeContainer) and one failure policy: a closed DM is a
// normal outcome, never an error that reaches gameplay.

/** Raw send. True only if Discord accepted the message. Never throws. */
export async function sendDm(client: Client, userId: string, container: ContainerBuilder): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    await user.send(v2Reply(container));
    return true;
  } catch {
    return false;
  }
}

const inGuild = (guildName: string | null) => (guildName ? ` in **${guildName}**` : "");

// ---- Security notices: always on, never counted against DM strikes. ----

export function robbedNotice(robberName: string, amount: number, guildName: string | null): ContainerBuilder {
  return noticeContainer(
    Mascot.Emotes.Gun,
    "You've been robbed!",
    `**${robberName}** lifted **${fmtCurrency(amount)}** from your wallet${inGuild(guildName)}.`,
    "-# Wallet money can be robbed. Bank what you don't need with `!deposit`.",
  );
}

export async function notifyRobbed(
  client: Client,
  victimId: string,
  robberName: string,
  amount: number,
  guildName: string | null,
): Promise<void> {
  await sendDm(client, victimId, robbedNotice(robberName, amount, guildName));
}

export function padlockNotice(robberName: string, guildName: string | null): ContainerBuilder {
  return noticeContainer(
    Mascot.Emotes.Lock,
    "Your Padlock just paid for itself.",
    `**${robberName}** tried to rob you${inGuild(guildName)}. The padlock blocked the hit and broke in the process.`,
    "-# Padlocks are single-use. Grab another: `!shop buy padlock`.",
  );
}

export async function notifyPadlockUsed(
  client: Client,
  victimId: string,
  robberName: string,
  guildName: string | null,
): Promise<void> {
  await sendDm(client, victimId, padlockNotice(robberName, guildName));
}

export function taxRaidNotice(seized: number, walletNow: number): ContainerBuilder {
  return noticeContainer(
    Mascot.Emotes.Police,
    "Tax raid",
    "The IRS audited your financial activity.\n" +
      `**Seized:** ${fmtCurrency(seized)}\n` +
      `**Wallet now:** ${fmtCurrency(walletNow)}\n` +
      "Your criminal heat has been reset.",
    "-# Heat builds from crime and robbery. Check it with `!heat`.",
  );
}

export async function notifyTaxRaid(client: Client, discordId: string, seized: number, walletNow: number): Promise<void> {
  await sendDm(client, discordId, taxRaidNotice(seized, walletNow));
}
