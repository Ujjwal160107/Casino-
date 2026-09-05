import { Client, ContainerBuilder } from "discord.js";
import { Mascot } from "../config/branding";
import { noticeContainer, v2Reply } from "../utils/componentsV2";
import { fmtAmount, fmtCurrency } from "../utils/format";
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
import type { StatementIssued, StatementSettled } from "./creditCardService";
import type { MaturedInvestment } from "./bankingService";

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
  try {
    await sendDm(client, victimId, robbedNotice(robberName, amount, guildName));
  } catch (err) {
    console.error(`notifyRobbed failed for ${victimId}:`, err);
  }
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
  try {
    await sendDm(client, victimId, padlockNotice(robberName, guildName));
  } catch (err) {
    console.error(`notifyPadlockUsed failed for ${victimId}:`, err);
  }
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
  try {
    await sendDm(client, discordId, taxRaidNotice(seized, walletNow));
  } catch (err) {
    console.error(`notifyTaxRaid failed for ${discordId}:`, err);
  }
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

export type CardWeeklyInput = { issued?: StatementIssued; settled?: StatementSettled };

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * One Monday DM per cardholder: last week's settlement (if any) and this
 * week's statement (if above zero). Null when there is nothing to say.
 */
export function cardWeeklyNotice(input: CardWeeklyInput): ContainerBuilder | null {
  const { issued, settled } = input;
  const hasStatement = !!issued && issued.statementBalance > 0;
  if (!settled && !hasStatement) return null;

  let title = "New card statement";
  const blocks: string[] = [];

  if (settled) {
    switch (settled.status) {
      case "PAID_FULL":
        title = "Card statement paid in full";
        blocks.push(`Last week's statement is paid in full. Credit score **${signed(settled.scoreDelta)}**.`);
        break;
      case "PAID_MINIMUM":
        title = "Minimum payment received";
        blocks.push(
          `You paid the minimum on last week's statement. Credit score **${signed(settled.scoreDelta)}**. ` +
            `**${fmtCurrency(settled.remainingBalance)}** rolls forward.`,
        );
        break;
      case "MISSED": {
        title = "Card payment missed";
        let line =
          `You missed last week's minimum. Credit score **${signed(settled.scoreDelta)}**. ` +
          `Interest of **${fmtCurrency(settled.interestCharged)}** was added to your balance. Your card is now **${settled.cardStatus}**.`;
        if (settled.cardStatus === "LOCKED") line += " Income is garnished at 25% until the balance clears.";
        blocks.push(line);
        break;
      }
    }
  }

  if (issued && hasStatement) {
    const dueUnix = Math.floor(issued.dueAt.getTime() / 1000);
    blocks.push(
      `**New statement:** ${fmtCurrency(issued.statementBalance)}\n` +
        `**Minimum due:** ${fmtCurrency(issued.minimumDue)} by <t:${dueUnix}:R>`,
    );
  }

  return noticeContainer(
    Mascot.Emotes.Credit,
    title,
    blocks.join("\n\n"),
    `-# Pay with \`!card pay <amount>\`. ${SETTINGS_HINT}.`,
  );
}

/** Groups the Monday cron's results by cardholder and sends one opt-out DM each. */
export async function notifyCardWeekly(
  client: Client,
  result: { issued: StatementIssued[]; settled: StatementSettled[] },
): Promise<void> {
  const byUser = new Map<string, CardWeeklyInput>();
  for (const s of result.settled) byUser.set(s.userId, { ...byUser.get(s.userId), settled: s });
  for (const i of result.issued) byUser.set(i.userId, { ...byUser.get(i.userId), issued: i });

  for (const [discordId, input] of byUser) {
    try {
      const container = cardWeeklyNotice(input);
      if (container) await sendOptOutDm(client, discordId, "card", container);
    } catch (err) {
      console.error(`notifyCardWeekly failed for ${discordId}:`, err);
    }
  }
}

export type MarketSale = {
  sellerId: string;
  name: string;
  amount: number;
  totalPrice: number;
  fees: { sellerFee: number; sellerPayout: number };
  /** Part of the payout taken by a delinquent card. Only item sales garnish today. */
  garnished?: number;
};

export function marketSaleNotice(sale: MarketSale): ContainerBuilder {
  let body =
    `**${sale.amount}× ${sale.name}** sold for **${fmtCurrency(sale.totalPrice)}**. ` +
    `After the **${fmtCurrency(sale.fees.sellerFee)}** fee you received **${fmtCurrency(sale.fees.sellerPayout)}**.`;
  const garnished = sale.garnished ?? 0;
  if (garnished > 0) body += `\n**${fmtCurrency(garnished)}** went to your delinquent card.`;
  return noticeContainer(Mascot.Emotes.Market, "Your listing sold!", body, `-# List more in \`!market\`. ${SETTINGS_HINT}.`);
}

export async function notifyMarketSale(client: Client, sale: MarketSale): Promise<void> {
  try {
    await sendOptOutDm(client, sale.sellerId, "market", marketSaleNotice(sale));
  } catch (err) {
    console.error(`notifyMarketSale failed for ${sale.sellerId}:`, err);
  }
}

// ---- Investment maturity: the per-minute cron's matured FDs/RDs. ----

// interestEarned is what the deposit earned; payout is what the bank cap let
// through. Anything missing between them is money the player never received.
const investmentShortfall = (m: MaturedInvestment) =>
  Math.max(0, m.investment.amount + (m.investment.interestEarned ?? 0) - m.payout);

export function investmentMaturedNotice(matured: MaturedInvestment[]): ContainerBuilder {
  // interestEarned lives only on the row (m.interest is the post-cap figure);
  // payout and durationDays come from the wrapper.
  const lines = matured.map((m) => {
    const inv = m.investment;
    const days = `${m.durationDays} day${m.durationDays === 1 ? "" : "s"}`;
    return `• **${inv.type}** — ${fmtCurrency(inv.amount)} locked for ${days} → paid **${fmtCurrency(m.payout)}** (+${fmtAmount(inv.interestEarned ?? 0)} interest)`;
  });
  const lost = matured.reduce((sum, m) => sum + investmentShortfall(m), 0);
  let body = lines.join("\n");
  if (lost > 0) body += `\n\nYour bank was full, so ${fmtAmount(lost)} of this payout was lost.`;
  return noticeContainer(
    Mascot.Emotes.Bank,
    "Investment matured!",
    body,
    `-# See your history in \`!bank invest\`. ${SETTINGS_HINT}.`,
  );
}

/** Groups the per-minute cron's matured deposits by player and sends one opt-out DM each. */
export async function notifyInvestmentsMatured(client: Client, matured: MaturedInvestment[]): Promise<void> {
  const byUser = new Map<string, MaturedInvestment[]>();
  for (const m of matured) {
    const list = byUser.get(m.investment.userId) ?? [];
    list.push(m);
    byUser.set(m.investment.userId, list);
  }

  for (const [discordId, list] of byUser) {
    try {
      await sendOptOutDm(client, discordId, "investment", investmentMaturedNotice(list));
    } catch (err) {
      console.error(`notifyInvestmentsMatured failed for ${discordId}:`, err);
    }
  }
}
