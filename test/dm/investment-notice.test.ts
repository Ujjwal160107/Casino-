import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { seedUser, resetUser } from "../helpers";
import { investmentMaturedNotice, notifyInvestmentsMatured } from "../../src/services/dmNoticeService";
import { DM_NOTICE_TYPES, noticeTypesInGroup, setNoticeTypeEnabled } from "../../src/services/dmPrefsService";
import type { MaturedInvestment } from "../../src/services/bankingService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

// The per-minute cron matures FDs/RDs silently. This DM is how a player learns
// what a deposit paid; it is an opt-out account notice like card and market.

function matured(
  userId: string,
  over: Partial<{ type: string; amount: number; interestEarned: number; payout: number; days: number }> = {},
): MaturedInvestment {
  const amount = over.amount ?? 365_000;
  const interestEarned = over.interestEarned ?? 1000;
  const payout = over.payout ?? amount + interestEarned;
  const now = new Date();
  const investment = {
    id: "inv", userId, type: over.type ?? "FD", amount, interestRate: 10,
    startDate: now, maturityDate: now, status: "COMPLETED",
    completedAt: now, interestEarned, payout, updatedAt: now,
  };
  return {
    id: "inv", type: investment.type, principal: amount,
    interest: Math.max(0, payout - amount), payout,
    durationDays: over.days ?? 10, capped: payout < amount + interestEarned,
    investment,
    bank: { id: "bank", userId, balance: payout, createdAt: now, updatedAt: now },
  } as unknown as MaturedInvestment;
}

describe("investment registry entry", () => {
  it("is an account notice with no command, listed after card and market", () => {
    expect(DM_NOTICE_TYPES.investment).toEqual({ label: "Investment payouts", group: "account" });
    expect(noticeTypesInGroup("account")).toEqual(["card", "market", "investment"]);
  });
});

describe("investmentMaturedNotice", () => {
  it("bank thumbnail and one line per deposit: principal, days, payout, interest", () => {
    const c = investmentMaturedNotice([
      matured("u"),
      matured("u", { type: "RD", amount: 50_000, interestEarned: 54, days: 1 }),
    ]);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Bank));
    const t = containerText(c);
    expect(t).toContain("## Investment matured!");
    expect(t).toContain(`**FD** — ${fmtCurrency(365_000)} locked for 10 days → paid **${fmtCurrency(366_000)}** (+1,000 interest)`);
    expect(t).toContain(`**RD** — ${fmtCurrency(50_000)} locked for 1 day → paid **${fmtCurrency(50_054)}** (+54 interest)`);
    expect(t).not.toContain("bank was full");
    expect(t).toContain("`!bank invest`");
    expect(t).toContain("`!settings`");
  });

  it("adds the shortfall line only when the bank cap cut the payout", () => {
    const t = containerText(investmentMaturedNotice([matured("u", { payout: 365_500 })]));
    expect(t).toContain("Your bank was full, so 500 of this payout was lost.");
  });
});

describe("notifyInvestmentsMatured", () => {
  const a = "invest-dm-a";
  const b = "invest-dm-b";
  beforeEach(async () => {
    await seedUser(a);
    await seedUser(b);
  });
  afterAll(async () => {
    await resetUser(a);
    await resetUser(b);
  });

  it("sends one DM per player covering all their deposits", async () => {
    const { client, sent } = fakeDmClient();
    await notifyInvestmentsMatured(client, [matured(a), matured(a, { type: "RD" }), matured(b)]);
    expect(sent.get(a)).toBe(1);
    expect(sent.get(b)).toBe(1);
  });

  it("respects the investment toggle", async () => {
    await setNoticeTypeEnabled(a, "investment", false);
    const { client, sent } = fakeDmClient();
    await notifyInvestmentsMatured(client, [matured(a)]);
    expect(sent.get(a)).toBeUndefined();
  });

  it("does nothing for an empty batch", async () => {
    const { client, sent } = fakeDmClient();
    await notifyInvestmentsMatured(client, []);
    expect(sent.size).toBe(0);
  });
});
