import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { buyStock, sellStock, marketTick } from "../../src/services/stockService";
import { computeFill } from "../../src/services/stockEngine";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";
import { RESERVE_STOCKS, STARTING_STOCKS } from "../../src/config/stockConfig";
import { testPrisma, seedUser, resetUser } from "../helpers";

const SYMBOL = "FILL";
const trader = "100000000000000901";
const LIQUIDITY = 10_000;

async function walletOf(id: string) {
  return (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
}

async function giveShares(id: string, stockId: string, quantity: number) {
  const pf = await testPrisma.portfolio.upsert({ where: { userId: id }, create: { userId: id }, update: {} });
  await testPrisma.stockHolding.create({ data: { portfolioId: pf.id, stockId, quantity, avgBuyPrice: 100 } });
}

/** Let a price change commit between the trade's own reads and its
 *  transaction -- what a market tick landing mid-trade looks like. */
function tickLandsBeforeTransaction(newPrice: number) {
  const real = prisma.$transaction.bind(prisma) as (...a: unknown[]) => Promise<unknown>;
  vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
    await testPrisma.stock.update({ where: { symbol: SYMBOL }, data: { currentPrice: newPrice } });
    return real(...args);
  }) as any);
}

describe("stock trade fills", () => {
  let stockId: string;

  beforeEach(async () => {
    await testPrisma.portfolio.deleteMany({ where: { userId: trader } });
    await testPrisma.stock.deleteMany({ where: { symbol: SYMBOL } });
    const stock = await testPrisma.stock.create({
      data: { symbol: SYMBOL, name: "Fill Test", currentPrice: 100, previousPrice: 100, basePrice: 100, volatility: 1, liquidity: LIQUIDITY },
    });
    stockId = stock.id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await testPrisma.portfolio.deleteMany({ where: { userId: trader } });
    await resetUser(trader);
    const seeded = [...STARTING_STOCKS, ...RESERVE_STOCKS].map((s) => s.symbol);
    await testPrisma.stock.deleteMany({ where: { symbol: { in: [SYMBOL, ...seeded] } } });
  });

  it("buys at the price current inside the transaction", async () => {
    await seedUser(trader, { wallet: { create: { balance: 10_000 } } });
    tickLandsBeforeTransaction(200);

    const res = await buyStock(trader, SYMBOL, 10);

    const expected = computeFill(200, 10, LIQUIDITY, "BUY").total;
    expect(res.cost).toBe(expected);
    expect(await walletOf(trader)).toBe(10_000 - expected);
  });

  it("sells at the price current inside the transaction", async () => {
    await seedUser(trader, { wallet: { create: { balance: 0 } } });
    await giveShares(trader, stockId, 10);
    tickLandsBeforeTransaction(10); // a crash lands mid-sale

    await sellStock(trader, SYMBOL, 10);

    expect(await walletOf(trader)).toBe(computeFill(10, 10, LIQUIDITY, "SELL").total);
  });

  it("caps a sale's credit at MAX_SAFE_BALANCE", async () => {
    await seedUser(trader, { wallet: { create: { balance: MAX_SAFE_BALANCE - 10 } } });
    await giveShares(trader, stockId, 100);

    await sellStock(trader, SYMBOL, 100);

    expect(await walletOf(trader)).toBe(MAX_SAFE_BALANCE);
  });

  it("caps a delisting payout at MAX_SAFE_BALANCE", async () => {
    await seedUser(trader, { wallet: { create: { balance: MAX_SAFE_BALANCE - 10 } } });
    await giveShares(trader, stockId, 100);
    await testPrisma.stock.update({ where: { id: stockId }, data: { status: "DELISTED", currentPrice: 5 } });

    await marketTick();

    expect(await walletOf(trader)).toBe(MAX_SAFE_BALANCE);
  });
});
