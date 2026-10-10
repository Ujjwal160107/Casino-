import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { Interaction } from "discord.js";
import { handleStockInteraction } from "../../src/handlers/stockInteractionHandler";
import { testPrisma, seedUser, resetUser } from "../helpers";

const SYMBOL = "GATE";

/** A submitted Buy modal for `qty` shares of SYMBOL from `userId`. */
function buyModal(userId: string, qty: string) {
  const editReply = vi.fn(async (_p: unknown) => ({}));
  const interaction: any = {
    customId: `stock_buy_modal:${SYMBOL}`,
    user: { id: userId },
    deferred: false,
    replied: false,
    isButton: () => false,
    isModalSubmit: () => true,
    fields: { getTextInputValue: () => qty },
    deferReply: vi.fn(async () => { interaction.deferred = true; }),
    reply: vi.fn(async () => { interaction.replied = true; }),
    followUp: vi.fn(async () => ({})),
    editReply,
  };
  return { interaction: interaction as Interaction, editReply };
}

async function holdingsOf(userId: string) {
  const pf = await testPrisma.portfolio.findUnique({ where: { userId }, include: { holdings: true } });
  return pf?.holdings.reduce((n, h) => n + h.quantity, 0) ?? 0;
}

describe("stock Buy modal gates", () => {
  const jailed = "100000000000000701";
  const banned = "100000000000000702";
  const tempBanExpired = "100000000000000703";
  const ids = [jailed, banned, tempBanExpired];

  beforeEach(async () => {
    for (const id of ids) {
      await testPrisma.portfolio.deleteMany({ where: { userId: id } });
    }
    await testPrisma.stock.deleteMany({ where: { symbol: SYMBOL } });
    await testPrisma.stock.create({
      data: { symbol: SYMBOL, name: "Gate Test", currentPrice: 100, previousPrice: 100, basePrice: 100, volatility: 1, liquidity: 1_000_000 },
    });
    await seedUser(jailed, { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000), wallet: { create: { balance: 10_000 } } });
    await seedUser(banned, { isBanned: true, wallet: { create: { balance: 10_000 } } });
    await seedUser(tempBanExpired, { isBanned: true, banExpiresAt: new Date(Date.now() - 1000), wallet: { create: { balance: 10_000 } } });
  });

  afterAll(async () => {
    for (const id of ids) {
      await testPrisma.portfolio.deleteMany({ where: { userId: id } });
      await resetUser(id);
    }
    await testPrisma.stock.deleteMany({ where: { symbol: SYMBOL } });
  });

  it.each([
    ["jailed", jailed, "jail"],
    ["banned", banned, "banned"],
  ])("refuses a %s player and moves no money", async (_label, id, word) => {
    const { interaction, editReply } = buyModal(id, "10");
    await handleStockInteraction(interaction);

    expect(JSON.stringify(editReply.mock.calls)).toContain(word);
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet?.balance).toBe(10_000);
    expect(await holdingsOf(id)).toBe(0);
  });

  it("lets a player whose temporary ban has expired buy", async () => {
    const { interaction } = buyModal(tempBanExpired, "10");
    await handleStockInteraction(interaction);
    expect(await holdingsOf(tempBanExpired)).toBe(10);
  });
});
