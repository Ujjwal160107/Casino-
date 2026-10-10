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
    await testPrisma.stock.deleteMany({ where: { symbol: { in: [SYMBOL, "FLOR", ...seeded] } } });
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

  it("delists a stock whose 3% line is below the price floor", async () => {
    // BUST's shape: base 15, so 3% is 0.45 and a price of 1 never got "below"
    // it. Low volatility keeps any single tick's move under +50%, so the
    // price stays rounded to 1 and this tick is its 8th distressed one.
    await testPrisma.stock.create({
      data: { symbol: "FLOR", name: "Floor", currentPrice: 1, previousPrice: 1, basePrice: 15,
        volatility: 1, liquidity: 200, status: "DELISTING", delistWatch: 7,
        lastUpdate: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    await marketTick();

    expect(await testPrisma.stock.findUnique({ where: { symbol: "FLOR" } })).toBeNull();
  });
});
