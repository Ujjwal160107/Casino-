import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";

// applyTransferTax runs between transferAnyFunds' balance check and its debit.
// Spending the wallet inside it reproduces a second command (another transfer,
// a bet) committing in that window, which is the real double-spend.
const spendDuringTax = vi.hoisted(() => ({ walletId: "" }));
vi.mock("../../src/services/taxService", () => ({
  applyTransferTax: async (_from: string, amount: number) => {
    const { testPrisma } = await import("../helpers");
    await testPrisma.wallet.update({ where: { id: spendDuringTax.walletId }, data: { balance: 0 } });
    return { net: amount, taxPaid: 0, shielded: false };
  },
}));

import { transferAnyFunds } from "../../src/services/transferService";

describe("transfer race", () => {
  const from = "transfer-race-from";
  const to = "transfer-race-to";
  beforeEach(async () => {
    await seedUser(from, { wallet: { create: { balance: 1_000_000 } } });
    await seedUser(to);
  });
  afterAll(async () => { await resetUser(from); await resetUser(to); });

  it("refuses a transfer when the wallet was spent after the balance check", async () => {
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: from } });
    spendDuringTax.walletId = wallet!.id;

    await expect(transferAnyFunds(wallet!.id, to, 1_000_000, from, "guild")).rejects.toThrow("Insufficient funds.");

    expect((await testPrisma.wallet.findUnique({ where: { userId: from } }))!.balance).toBe(0);
    expect((await testPrisma.wallet.findUnique({ where: { userId: to } }))!.balance).toBe(0);
  });
});
