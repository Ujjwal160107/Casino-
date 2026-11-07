import { Client, ContainerBuilder, type ActionRowBuilder, type ButtonBuilder, type StringSelectMenuBuilder } from "discord.js";
import { Mascot } from "../config/branding";
import { noticeContainer, v2Reply } from "../utils/componentsV2";
import { fmtAmount, fmtCurrency, fmtFortunes } from "../utils/format";
import { CRIME_FAMILY_CONFIG } from "../utils/economyConfig";
import { FAMILY_ROLES, type FamilyRole } from "../data/crimeFamilyCatalog";
import { cfNoticeEmote } from "../utils/crimeFamilyAssets";
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
import type { WarSide } from "./crimeFamily/warMath";

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
 * One Monday DM per cardholder: last week's settlement (if it billed
 * anything) and this week's statement (if above zero). Null when there is nothing to say.
 */
export function cardWeeklyNotice(input: CardWeeklyInput): ContainerBuilder | null {
  const { issued } = input;
  // An idle card settles an empty statement every week (always "paid in
  // full", score +0); that is not news, so only billed statements count.
  const settled = input.settled && input.settled.statementBalance > 0 ? input.settled : undefined;
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

/** One opt-out DM per id, sent in order, each built for its recipient. Never throws. */
export async function notifyMany(
  client: Client,
  type: DmNoticeType,
  ids: readonly string[],
  build: (id: string) => ContainerBuilder,
): Promise<void> {
  for (const id of ids) {
    try {
      await sendOptOutDm(client, id, type, build(id));
    } catch (err) {
      console.error(`notifyMany(${type}) failed for ${id}:`, err);
    }
  }
}

// ---- Crime Families: the `family`, `caper_lobby`, `turf` and `recruit` account notices (spec 13.4). ----

const FAMILY_HINT = `-# ${SETTINGS_HINT}.`;

/** Titles stay text-only; the thumbnail is the notice's cf_ icon. */
function familyNotice(iconKey: string, title: string, body: string): ContainerBuilder {
  return noticeContainer(cfNoticeEmote(iconKey), title, body, FAMILY_HINT);
}

export function familyInviteNotice(v: {
  familyLabel: string; inviterId: string; tag: string; expiresAt: Date; jumpUrl: string | null;
}): ContainerBuilder {
  const expires = Math.floor(v.expiresAt.getTime() / 1000);
  let body =
    `<@${v.inviterId}> invited you to join **${v.familyLabel}**.\n` +
    `Accept with \`!crew accept ${v.tag}\` or decline with \`!crew decline ${v.tag}\`. The invite expires <t:${expires}:R>.`;
  if (v.jumpUrl) body += `\n[See the invite](${v.jumpUrl})`;
  return familyNotice("crest_1", "You're invited to a crime family", body);
}

export type FamilyRoleNoticeKind = "kicked" | "promoted" | "demoted" | "chair_claimed" | "chair_handed";

export function familyRoleNotice(
  kind: FamilyRoleNoticeKind,
  v: { familyLabel: string; role?: FamilyRole; newBossId?: string },
): ContainerBuilder {
  const roleName = v.role ? FAMILY_ROLES[v.role].name : "";
  switch (kind) {
    case "kicked":
      return familyNotice("crest_1", "You were kicked from your family", `You are no longer a member of **${v.familyLabel}**.`);
    case "promoted":
      return familyNotice("crest_1", "You were promoted", `You are now **${roleName}** of **${v.familyLabel}**.`);
    case "demoted":
      return familyNotice("crest_1", "You were demoted", `You are now **${roleName}** of **${v.familyLabel}**.`);
    case "chair_claimed":
      return familyNotice(
        "crest_1",
        "Your chair was claimed",
        `<@${v.newBossId}> claimed the Boss's chair of **${v.familyLabel}** while you were away. You are now a Soldier.`,
      );
    case "chair_handed":
      return familyNotice("crest_1", "Your family has a new Boss", `<@${v.newBossId}> is now the Boss of **${v.familyLabel}**.`);
  }
}

export function familyPaydayNotice(v: { familyLabel: string; gross: number; tax: number; net: number }): ContainerBuilder {
  return familyNotice(
    "vault",
    "Payday!",
    `**${v.familyLabel}** paid out.\n` +
      `**Your share:** ${fmtFortunes(v.gross)}\n` +
      `**Tax:** ${fmtFortunes(v.tax)}\n` +
      `**You received:** ${fmtFortunes(v.net)}`,
  );
}

export function familyMissedPaydayNotice(v: { familyLabel: string; reason: string }): ContainerBuilder {
  return familyNotice("vault", "You missed payday", `**${v.familyLabel}** ran payday without you. You need ${v.reason}.`);
}

export function familyArrearsNotice(v: { familyLabel: string; days: number; owed: number }): ContainerBuilder {
  return familyNotice(
    "vault",
    "Family dues in arrears",
    `**${v.familyLabel}** could not pay its daily dues.\n` +
      `**In arrears:** ${v.days} ${v.days === 1 ? "day" : "days"}\n` +
      `**Owed:** ${fmtFortunes(v.owed)}\n` +
      "Clear it with `!crew deposit <amount>`.",
  );
}

export function familyDisbandedNotice(v: { familyLabel: string; finalNet: number | null; burned: number }): ContainerBuilder {
  let body = `**${v.familyLabel}** has disbanded.`;
  if (v.finalNet !== null) body += `\n**Your final payday:** ${fmtFortunes(v.finalNet)}`;
  body += `\n**Burned:** ${fmtFortunes(v.burned)}`;
  return familyNotice("crest_1", "Your crime family disbanded", body);
}

const relTime = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

// No-confidence vote (amendment 4.7). Ballots are secret: no notice names a choice.

/** To every voter in the snapshot, with the YES/NO row the announcer builds (F19). */
export function familyVoteOpenedNotice(
  v: { familyLabel: string; bossId: string; starterId: string; closesAt: Date; need: number; eligible: number },
  row: ActionRowBuilder<ButtonBuilder>,
): ContainerBuilder {
  const body =
    `<@${v.starterId}> started a no-confidence vote against <@${v.bossId}> in **${v.familyLabel}**.\n` +
    `A pass needs ${v.need} YES of ${v.eligible} eligible voters. Ballots are secret and can change until it closes ${relTime(v.closesAt)}.`;
  return familyNotice("rank_boss", "No-confidence vote opened", body).addActionRowComponents(row);
}

export function familyVoteAgainstYouNotice(v: { familyLabel: string; starterId: string; closesAt: Date }): ContainerBuilder {
  const body = `<@${v.starterId}> started a no-confidence vote against you in **${v.familyLabel}**. It closes ${relTime(v.closesAt)}.`;
  return familyNotice("rank_boss", "A no-confidence vote was opened against you", body);
}

/** `line` is S34's result line: totals only. */
export function familyVoteResultNotice(v: { familyLabel: string; line: string }): ContainerBuilder {
  return familyNotice("rank_boss", "No-confidence vote closed", `**${v.familyLabel}**\n${v.line}`);
}

export function familyNewBossNotice(v: { familyLabel: string }): ContainerBuilder {
  return familyNotice("rank_boss", "You are now the Boss", `You are now the Boss of **${v.familyLabel}**. The family voted the old Boss out.`);
}

// Recruitment (`recruit`, amendment 8.10): the officers' digest and the applicant's answers.

const hours = (seconds: number) => `${seconds / 3600} hours`;

/** Officers' digest of new applications, with the Open inbox row the announcer builds (F19). */
export function recruitDigestNotice(v: { familyLabel: string; count: number }, row: ActionRowBuilder<ButtonBuilder>): ContainerBuilder {
  const title = `${v.count} new application${v.count === 1 ? "" : "s"} to ${v.familyLabel}`;
  const body = `Accept or decline them in the inbox. Applications expire after ${hours(CRIME_FAMILY_CONFIG.applicationTtlSeconds)}.`;
  return familyNotice("crest_1", title, body).addActionRowComponents(row);
}

export function applicationAcceptedNotice(v: { familyLabel: string }): ContainerBuilder {
  return familyNotice("rank_associate", "Application accepted", `You joined **${v.familyLabel}**. Open it with \`!crew\`.`);
}

export function applicationDeclinedNotice(v: { familyLabel: string; reapplyAt: Date }): ContainerBuilder {
  const body = `**${v.familyLabel}** declined your application. You can apply again ${relTime(v.reapplyAt)}.`;
  return familyNotice("rank_associate", "Application declined", body);
}

/** Why a PENDING application closed without an answer: its 72 hours ran out, or its family disbanded. */
export type ApplicationCloseReason = "expired" | "disbanded";

export function applicationExpiredNotice(v: { familyLabel: string; reason: ApplicationCloseReason }): ContainerBuilder {
  if (v.reason === "disbanded") {
    return familyNotice("rank_associate", "Application closed", `**${v.familyLabel}** disbanded, so your application was closed.`);
  }
  const { applicationTtlSeconds: ttl, reapplyAfterWithdrawSeconds: wait } = CRIME_FAMILY_CONFIG;
  const body = `Your application to **${v.familyLabel}** expired after ${hours(ttl)}. You can apply again in ${hours(wait)}.`;
  return familyNotice("rank_associate", "Application expired", body);
}

const jumpLine = (url: string | null, label: string) => (url ? `\n[${label}](${url})` : "");

/** The lobby call, with the Join as… select the announcer builds (G9), so the DM is the member's lobby card in any server. */
export function caperLobbyNotice(
  v: { familyLabel: string; tierName: string; stake: number; closesAt: Date; jumpUrl: string | null },
  row: ActionRowBuilder<StringSelectMenuBuilder>,
): ContainerBuilder {
  const body =
    `**${v.familyLabel}** is planning a **${v.tierName}** crew heist.\n` +
    `**Stake:** ${fmtFortunes(v.stake)}\n` +
    `The lobby closes ${relTime(v.closesAt)}. Pick a role below to join from here.` +
    jumpLine(v.jumpUrl, "Go to the lobby");
  return familyNotice("caper", "Crew Heist lobby open", body).addActionRowComponents(row);
}

/** The GO call, with the Open brief row the announcer builds (G9). */
export function caperGoNotice(v: { tierName: string; goEndsAt: Date; jumpUrl: string | null }, row: ActionRowBuilder<ButtonBuilder>): ContainerBuilder {
  const body = `The **${v.tierName}** crew heist is live.\nGO ends ${relTime(v.goEndsAt)}. Open your brief below.` + jumpLine(v.jumpUrl, "Go to the crew heist");
  return familyNotice("caper", "Crew Heist GO", body).addActionRowComponents(row);
}

// Turf (`turf`): bids, war warnings and results, and racket neglect.

export function turfBidPlacedNotice(v: { racketName: string; bidderLabel: string; amount: number; startsAt: Date }): ContainerBuilder {
  const body =
    `**${v.bidderLabel}** bid ${fmtFortunes(v.amount)} to attack **${v.racketName}**.\n` +
    `The war starts ${relTime(v.startsAt)}. Rally your crew to defend it.`;
  return familyNotice("war", "A bid on your racket", body);
}

export function turfOutbidNotice(v: { racketName: string; amount: number; refunded: number; bidClosesAt: Date }): ContainerBuilder {
  const body =
    `You were outbid on ${v.racketName}: ${fmtFortunes(v.amount)}\n` +
    `Your ${fmtFortunes(v.refunded)} went back to family earnings. Bidding closes ${relTime(v.bidClosesAt)}.`;
  return familyNotice("war", "You were outbid", body);
}

/** The war warning, with the Scout and Hit row the announcer builds (G9, G10): the member's war card in any server. */
export function turfWarSoonNotice(
  v: { racketName: string; side: WarSide; startsAt: Date; channelUrl: string },
  row: ActionRowBuilder<ButtonBuilder>,
): ContainerBuilder {
  const body =
    `Your family is ${v.side === "ATK" ? "attacking" : "defending"} **${v.racketName}**. The war starts ${relTime(v.startsAt)}.\n` +
    "The war board posts in your family's home channel. Scout and hit from the buttons below once it starts, from any server." +
    jumpLine(v.channelUrl || null, "Go to the home channel");
  return familyNotice("war", "Turf war soon", body).addActionRowComponents(row);
}

export function turfWarResultNotice(v: { racketName: string; side: WarSide; won: boolean; summary: string }): ContainerBuilder {
  const body = `${v.summary}\nYou fought on the ${v.side === "ATK" ? "attacking" : "defending"} side.`;
  return familyNotice("war", v.won ? `You won the war on ${v.racketName}` : `The war on ${v.racketName} is over`, body);
}

export function turfNeglectNotice(v: { racketName: string; strikes: number; max: number }): ContainerBuilder {
  const body =
    `Neglect strike ${v.strikes}/${v.max}: play two crew heist seats this week to keep ${v.racketName}.\n` +
    `At ${v.max} strikes the racket goes back to the Street.`;
  return familyNotice("war", "Racket neglected", body);
}

export function turfReleasedNotice(v: { racketName: string }): ContainerBuilder {
  return familyNotice("war", "Racket released", `**${v.racketName}** went back to the Street after too many neglect strikes.`);
}
