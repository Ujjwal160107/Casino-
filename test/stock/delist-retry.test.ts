import { describe, it, expect, afterAll } from "vitest";
import { marketTick } from "../../src/services/stockService";
import { RESERVE_STOCKS, STARTING_STOCKS } from "../../src/config/stockConfig";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("interrupted delisting", () => {
  const holder = "100000000000000801";
  const SYMBOL = "STRD";

  afterAll(async () => {
    await testPrisma.portfolio.deleteMany({ where: { userId: holder } });
    await resetUser(holder);
    const seeded = [...STARTING_STOCKS, ...RESERVE_STOCKS].map((s) => s.symbol);
    await testPrisma.stock.deleteMany({ where: { symbol: { in: [SYMBOL, ...seeded] } } });
  });

  it("pays out holders of a stock left DELISTED by a failed liquidation", async () => {
    await seedUser(holder, { wallet: { create: { balance: 0 } } });
    // The state processStockTick leaves when liquidateAndRelist throws after
    // the status flip: DELISTED, holders still holding, row still present.
    const stock = await testPrisma.stock.create({
      data: { symbol: SYMBOL, name: "Stranded", currentPrice: 2, previousPrice: 3, basePrice: 100,
        volatility: 1, liquidity: 1000, status: "DELISTED", delistWatch: 8 },
    });
    const pf = await testPrisma.portfolio.create({ data: { userId: holder } });
    await testPrisma.stockHolding.create({ data: { portfolioId: pf.id, stockId: stock.id, quantity: 50, avgBuyPrice: 90 } });

    await marketTick();

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: holder } });
    expect(wallet?.balance).toBe(2 * 50);
    expect(await testPrisma.stockHolding.count({ where: { stockId: stock.id } })).toBe(0);
    expect(await testPrisma.stock.findUnique({ where: { symbol: SYMBOL } })).toBeNull();
  });
});
