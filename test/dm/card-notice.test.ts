import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { seedUser, resetUser } from "../helpers";
import { cardWeeklyNotice, notifyCardWeekly } from "../../src/services/dmNoticeService";
import { setNoticeTypeEnabled } from "../../src/services/dmPrefsService";
import type { StatementIssued, StatementSettled } from "../../src/services/creditCardService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

const dueAt = new Date(Date.now() + 7 * 24 * 3_600_000);
const issued: StatementIssued = { userId: "u", tier: "STARTER", statementBalance: 300_000, minimumDue: 75_000, dueAt };
const settledBase = { userId: "u", interestCharged: 0, cardStatus: "ACTIVE", remainingBalance: 0 };
const paidFull: StatementSettled = { ...settledBase, status: "PAID_FULL", scoreDelta: 30 };
const paidMin: StatementSettled = { ...settledBase, status: "PAID_MINIMUM", scoreDelta: 20, remainingBalance: 225_000 };
const missed: StatementSettled = { ...settledBase, status: "MISSED", scoreDelta: -45, interestCharged: 36_000, cardStatus: "DELINQUENT", remainingBalance: 300_000 };
const locked: StatementSettled = { ...missed, scoreDelta: -60, cardStatus: "LOCKED" };

const text = (input: Parameters<typeof cardWeeklyNotice>[0]) => containerText(cardWeeklyNotice(input)!);

describe("cardWeeklyNotice", () => {
  it("returns null when nothing settled and the statement is zero", () => {
    expect(cardWeeklyNotice({ issued: { ...issued, statementBalance: 0, minimumDue: 0 } })).toBeNull();
    expect(cardWeeklyNotice({})).toBeNull();
  });

  it("titles and first block follow last week's outcome", () => {
    const full = text({ settled: paidFull });
    expect(full).toContain("## Card statement paid in full");
    expect(full).toContain("Last week's statement is paid in full. Credit score **+30**.");

    const min = text({ settled: paidMin });
    expect(min).toContain("## Minimum payment received");
    expect(min).toContain(`Credit score **+20**. **${fmtCurrency(225_000)}** rolls forward.`);

    const miss = text({ settled: missed });
    expect(miss).toContain("## Card payment missed");
    expect(miss).toContain(`Credit score **-45**. Interest of **${fmtCurrency(36_000)}** was added. Your card is now **DELINQUENT**.`);
    expect(miss).not.toContain("garnished");

    const lock = text({ settled: locked });
    expect(lock).toContain("Your card is now **LOCKED**. Income is garnished at 25% until the balance clears.");

    expect(text({ issued })).toContain("## New card statement");
  });

  it("statement block appears only for a positive balance and carries the due timestamp", () => {
    const both = text({ issued, settled: paidFull });
    expect(both).toContain(`**New statement:** ${fmtCurrency(300_000)}`);
    expect(both).toContain(`**Minimum due:** ${fmtCurrency(75_000)} by <t:${Math.floor(dueAt.getTime() / 1000)}:R>`);

    const zero = text({ issued: { ...issued, statementBalance: 0, minimumDue: 0 }, settled: paidFull });
    expect(zero).not.toContain("New statement");
  });

  it("uses the Credit emote and points at card pay and settings", () => {
    const c = cardWeeklyNotice({ issued })!;
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Credit));
    expect(containerText(c)).toContain("-# Pay with `!card pay <amount>`. Manage these DMs with `!settings`.");
  });
});

describe("notifyCardWeekly", () => {
  const a = "card-dm-a";
  const b = "card-dm-b";
  beforeEach(async () => {
    await seedUser(a);
    await seedUser(b);
  });
  afterAll(async () => {
    await resetUser(a);
    await resetUser(b);
  });

  it("sends one DM per cardholder, merging settlement and new statement", async () => {
    const { client, sent } = fakeDmClient();
    await notifyCardWeekly(client, {
      issued: [{ ...issued, userId: a }, { ...issued, userId: b }],
      settled: [{ ...paidFull, userId: a }],
    });
    expect(sent.get(a)).toBe(1);
    expect(sent.get(b)).toBe(1);
  });

  it("respects the card toggle", async () => {
    await setNoticeTypeEnabled(a, "card", false);
    const { client, sent } = fakeDmClient();
    await notifyCardWeekly(client, { issued: [{ ...issued, userId: a }], settled: [] });
    expect(sent.get(a)).toBeUndefined();
  });

  it("skips a cardholder with nothing to say", async () => {
    const { client, sent } = fakeDmClient();
    await notifyCardWeekly(client, { issued: [{ ...issued, userId: a, statementBalance: 0, minimumDue: 0 }], settled: [] });
    expect(sent.get(a)).toBeUndefined();
  });
});
