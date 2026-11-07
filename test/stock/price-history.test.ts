import { describe, it, expect, afterAll } from "vitest";
import { marketTick } from "../../src/services/stockService";
import { testPrisma } from "../helpers";

// The website's live stock chart reads one StockPricePoint per stock per tick.
describe("stock price history", () => {
  const SYMBOL = "HIST";

  afterAll(async () => {
    await testPrisma.stockPricePoint.deleteMany({ where: { symbol: { in: [SYMBOL, "OLDP"] } } });
    await testPrisma.stock.deleteMany({ where: { symbol: SYMBOL } });
  });

  it("records the new price on every tick and prunes points older than 7 days", async () => {
    await testPrisma.stockPricePoint.create({ data: { symbol: "OLDP", price: 5, at: new Date(Date.now() - 8 * 24 * 3600 * 1000) } });
    await testPrisma.stock.create({
      data: { symbol: SYMBOL, name: "History", currentPrice: 100, previousPrice: 100, basePrice: 100,
        volatility: 1, liquidity: 1000, lastUpdate: new Date(Date.now() - 2 * 3600 * 1000) },
    });

    await marketTick();

    const stock = await testPrisma.stock.findUnique({ where: { symbol: SYMBOL } });
    const points = await testPrisma.stockPricePoint.findMany({ where: { symbol: SYMBOL } });
    expect(points).toHaveLength(1);
    expect(points[0].price).toBe(stock!.currentPrice);
    expect(await testPrisma.stockPricePoint.count({ where: { symbol: "OLDP" } })).toBe(0);
  });
});
