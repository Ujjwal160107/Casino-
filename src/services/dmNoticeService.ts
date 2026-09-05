import { Client, ContainerBuilder } from "discord.js";
import { Mascot } from "../config/branding";
import { noticeContainer, v2Reply } from "../utils/componentsV2";
import { fmtCurrency } from "../utils/format";
import { isTester } from "../utils/developerAccess";
import {
  CooldownReminderType,
  DM_NOTICE_TYPES,
  DmNoticeType,
  getDmPrefs,
  isNoticeEnabled,
  recordDmDelivered,
  recordDmFailed,
} from "./dmPrefsService";

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

const SETTINGS_HINT = "Manage these DMs with `!settings`";

/** Send and record the outcome against the strike count. Caller has already applied prefs. */
async function deliverCounted(client: Client, discordId: string, container: ContainerBuilder): Promise<void> {
  if (await sendDm(client, discordId, container)) await recordDmDelivered(discordId);
  else await recordDmFailed(discordId);
}

/**
 * Send a DM the player can switch off in `!settings`. Checks the master switch
 * and the per-type toggle, then keeps the closed-DM strike count. Never throws.
 */
export async function sendOptOutDm(
  client: Client,
  discordId: string,
  type: DmNoticeType,
  container: ContainerBuilder,
): Promise<void> {
  try {
    if (isTester(discordId)) return;
    const prefs = await getDmPrefs(discordId);
    if (!isNoticeEnabled(prefs, type)) return;
    await deliverCounted(client, discordId, container);
  } catch (err) {
    console.error(`sendOptOutDm(${type}) failed for ${discordId}:`, err);
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

// ---- Opt-out notices: governed by !settings and the DM strike count. ----

export function cooldownNotice(types: CooldownReminderType[]): ContainerBuilder {
  const hint = `-# ${SETTINGS_HINT} in any server with Fortuna.`;
  if (types.length === 1) {
    const t = DM_NOTICE_TYPES[types[0]];
    return noticeContainer(
      Mascot.Emotes.Cooldown,
      "Cooldown lifted!",
      `Your **${t.label.toLowerCase()}** is ready. Use \`${t.command}\`.`,
      hint,
    );
  }
  const lines = types.map((ty) => `• **${DM_NOTICE_TYPES[ty].label}** — \`${DM_NOTICE_TYPES[ty].command}\``);
  return noticeContainer(Mascot.Emotes.Cooldown, "Cooldowns lifted!", `Ready to use:\n${lines.join("\n")}`, hint);
}

/** The reminder drain has already filtered by prefs, so this only sends and counts. */
export async function notifyCooldownsLifted(
  client: Client,
  discordId: string,
  types: CooldownReminderType[],
): Promise<void> {
  try {
    await deliverCounted(client, discordId, cooldownNotice(types));
  } catch (err) {
    console.error(`notifyCooldownsLifted failed for ${discordId}:`, err);
  }
}
