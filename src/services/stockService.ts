// src/services/stockService.ts
import prisma, { runWithRetry } from "../utils/prisma";
import {
  STARTING_STOCKS, RESERVE_STOCKS, TICK_INTERVAL_MS,
} from "../config/stockConfig";
import {
  baselineNoisePct, pickEvent, rollEventMagnitude, resolveForecast,
  applyPct, computeFill,
} from "./stockEngine";

type StockRow = Awaited<ReturnType<typeof prisma.stock.findFirst>>;

export function currentTick(): number {
  return Math.floor(Date.now() / TICK_INTERVAL_MS);
}

/** Seed the global market once if empty. */
export async function initGlobalMarket(): Promise<void> {
  const count = await prisma.stock.count();
  if (count > 0) return;
  console.log("Seeding global Stock Market...");
  for (const s of STARTING_STOCKS) {
    await prisma.stock.create({
      data: {
        symbol: s.symbol,
        name: s.name,
        currentPrice: s.basePrice,
        previousPrice: s.basePrice,
        basePrice: s.basePrice,
        volatility: s.volatility,
        liquidity: s.liquidity,
      },
    });
  }
}

export async function getAllStocks() {
  return prisma.stock.findMany({
    where: { status: { not: "DELISTED" } },
    orderBy: { currentPrice: "desc" },
  });
}

export async function getStock(symbol: string) {
  return prisma.stock.findUnique({ where: { symbol: symbol.toUpperCase() } });
}

export async function getStockById(stockId: string) {
  return prisma.stock.findUnique({ where: { id: stockId } });
}

export async function getActiveForecasts() {
  return prisma.stockEvent.findMany({
    where: { status: "FORECAST" },
    orderBy: { resolveTick: "asc" },
  });
}

export async function getRecentEvents(limit = 10) {
  return prisma.stockEvent.findMany({
    where: { status: { in: ["RESOLVED", "FORECAST"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getPortfolio(discordId: string) {
  const user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) return null;
  return prisma.portfolio.findUnique({
    where: { userId: user.discordId },
    include: { holdings: { include: { stock: true } } },
  });
}

export async function buyStock(discordId: string, symbol: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number.");

  const stock = await getStock(symbol);
  if (!stock) throw new Error(`Stock **${symbol.toUpperCase()}** not found.`);
  if (stock.status !== "ACTIVE") throw new Error(`**${stock.symbol}** is being delisted — you can only sell.`);

  const fill = computeFill(stock.currentPrice, quantity, stock.liquidity, "BUY");

  const user = await prisma.user.findUnique({ where: { discordId }, include: { wallet: true } });
  if (!user) throw new Error("User not found. Try chatting first to register.");
  if (!user.wallet || user.wallet.balance < fill.total) throw new Error(`Insufficient funds. Cost (incl. slippage): ${fill.total}`);

  return runWithRetry(async () => {
    let portfolio = await prisma.portfolio.findUnique({ where: { userId: user.discordId } });
    if (!portfolio) portfolio = await prisma.portfolio.create({ data: { userId: user.discordId } });

    await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { decrement: fill.total } } });

    const holding = await prisma.stockHolding.findUnique({
      where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } },
    });

    let newQty: number;
    if (holding) {
      const totalCost = holding.avgBuyPrice * holding.quantity + fill.total;
      newQty = holding.quantity + quantity;
      const newAvg = Math.round(totalCost / newQty);
      await prisma.stockHolding.update({ where: { id: holding.id }, data: { quantity: newQty, avgBuyPrice: newAvg } });
    } else {
      newQty = quantity;
      await prisma.stockHolding.create({
        data: { portfolioId: portfolio.id, stockId: stock.id, quantity, avgBuyPrice: fill.avgPrice },
      });
    }

    return { stock, avgPrice: fill.avgPrice, cost: fill.total, impactPct: fill.impactPct, newQty };
  });
}

export async function sellStock(discordId: string, symbol: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number.");

  const stock = await getStock(symbol);
  if (!stock) throw new Error(`Stock **${symbol.toUpperCase()}** not found.`);

  const user = await prisma.user.findUnique({ where: { discordId }, include: { wallet: true } });
  if (!user || !user.wallet) throw new Error("User not found.");

  const portfolio = await prisma.portfolio.findUnique({ where: { userId: user.discordId } });
  if (!portfolio) throw new Error("You don't own any stocks.");

  const holding = await prisma.stockHolding.findUnique({
    where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } },
  });
  if (!holding || holding.quantity < quantity) throw new Error(`You don't have enough shares (${holding?.quantity || 0}).`);

  const fill = computeFill(stock.currentPrice, quantity, stock.liquidity, "SELL");

  return runWithRetry(async () => {
    await prisma.wallet.update({ where: { id: user.wallet!.id }, data: { balance: { increment: fill.total } } });

    if (holding.quantity === quantity) {
      await prisma.stockHolding.delete({ where: { id: holding.id } });
    } else {
      await prisma.stockHolding.update({ where: { id: holding.id }, data: { quantity: { decrement: quantity } } });
    }

    const profit = fill.total - holding.avgBuyPrice * quantity;
    return { stock, avgPrice: fill.avgPrice, value: fill.total, impactPct: fill.impactPct, profit, remaining: holding.quantity - quantity };
  });
}

// --- MARKET TICK ENGINE ---

export async function marketTick(): Promise<void> {
  const cutoff = new Date(Date.now() - TICK_INTERVAL_MS);
  const stocks = await prisma.stock.findMany({
    where: { status: { not: "DELISTED" }, lastUpdate: { lt: cutoff } },
  });
  if (stocks.length === 0) return;

  const tick = currentTick();
  for (const stock of stocks) {
    try {
      await processStockTick(stock as NonNullable<StockRow>, tick);
    } catch (err) {
      console.error(`Stock tick failed for ${stock.symbol}:`, err);
    }
  }
}

async function processStockTick(stock: NonNullable<StockRow>, tick: number): Promise<void> {
  let pendingPct = 0;
  let trendTicksLeft = stock.trendTicksLeft;
  let trendPerTick = stock.trendPerTick;
  let busy = false; // a trend or resolved event already moved the price this tick

  // 1. Continue a running multi-tick trend
  if (trendTicksLeft > 0) {
    pendingPct += trendPerTick;
    trendTicksLeft -= 1;
    if (trendTicksLeft === 0) trendPerTick = 0;
    busy = true;
  }

  // 2. Resolve any forecasts due this tick
  const due = await prisma.stockEvent.findMany({
    where: { stockId: stock.id, status: "FORECAST", resolveTick: { lte: tick } },
  });
  for (const ev of due) {
    const hit = resolveForecast(Math.random);
    await prisma.stockEvent.update({ where: { id: ev.id }, data: { status: hit ? "RESOLVED" : "FAKEOUT" } });
    if (!hit) continue;
    busy = true;
    if (ev.durationTicks > 1) {
      // Multi-tick trend (SLUMP): magnitudePct is per-tick. Apply first tick now.
      trendPerTick = ev.magnitudePct;
      trendTicksLeft = ev.durationTicks - 1;
      pendingPct += ev.magnitudePct;
    } else {
      pendingPct += ev.magnitudePct;
    }
  }

  // 3. If nothing is happening, maybe start a new event
  if (!busy && trendTicksLeft === 0) {
    const def = pickEvent(stock.volatility, Math.random);
    if (def) {
      const mag = rollEventMagnitude(def, stock.volatility, Math.random);
      if (def.telegraphed) {
        // Post a forecast for next tick — do NOT move price now
        await prisma.stockEvent.create({
          data: {
            stockId: stock.id, symbol: stock.symbol, type: def.type, direction: def.direction,
            magnitudePct: mag.pct, durationTicks: mag.ticks, telegraphed: true,
            status: "FORECAST", forecastTick: tick, resolveTick: tick + 1,
          },
        });
      } else {
        // Instant event (MINOR_DIP / MINOR_GAIN): apply now and log as resolved
        pendingPct += mag.pct;
        await prisma.stockEvent.create({
          data: {
            stockId: stock.id, symbol: stock.symbol, type: def.type, direction: def.direction,
            magnitudePct: mag.pct, durationTicks: 1, telegraphed: false,
            status: "RESOLVED", forecastTick: tick, resolveTick: tick,
          },
        });
      }
    }
  }

  // 4. Baseline noise always applies
  pendingPct += baselineNoisePct(stock.volatility, Math.random);

  // 5. Compute new price (hard floor at 1, no auto-bounce)
  const newPrice = applyPct(stock.currentPrice, pendingPct);

  // 6. Delisting watch
  const watch = newPrice < stock.basePrice * 0.03 ? stock.delistWatch + 1 : 0;
  let status: string = "ACTIVE";
  if (watch >= 8) status = "DELISTED";
  else if (watch >= 4) status = "DELISTING";

  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      previousPrice: stock.currentPrice,
      currentPrice: newPrice,
      trendTicksLeft, trendPerTick,
      delistWatch: watch, status,
      lastUpdate: new Date(),
    },
  });

  if (status === "DELISTED") {
    await liquidateAndRelist({ ...stock, currentPrice: newPrice });
  }
}

/** Pay out remaining holders at the crashed price, remove the stock, IPO a replacement. */
async function liquidateAndRelist(stock: NonNullable<StockRow>): Promise<void> {
  const holdings = await prisma.stockHolding.findMany({ where: { stockId: stock.id } });
  for (const h of holdings) {
    const pf = await prisma.portfolio.findUnique({ where: { id: h.portfolioId } });
    if (pf) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: pf.userId } });
      if (wallet) {
        const payout = Math.max(1, Math.round(stock.currentPrice)) * h.quantity;
        await runWithRetry(() => prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: payout } } }));
      }
    }
    await prisma.stockHolding.delete({ where: { id: h.id } });
  }
  await prisma.stockEvent.deleteMany({ where: { stockId: stock.id } });
  await prisma.stock.delete({ where: { id: stock.id } });
  await ipoReplacement();
  console.log(`📉 ${stock.symbol} delisted; replacement IPO'd.`);
}

async function ipoReplacement(): Promise<void> {
  const active = await prisma.stock.findMany({ select: { symbol: true } });
  const activeSymbols = new Set(active.map((s) => s.symbol));
  const seed = RESERVE_STOCKS.find((s) => !activeSymbols.has(s.symbol)) ?? STARTING_STOCKS.find((s) => !activeSymbols.has(s.symbol));
  if (!seed) return; // market already full
  await prisma.stock.create({
    data: {
      symbol: seed.symbol, name: seed.name, currentPrice: seed.basePrice, previousPrice: seed.basePrice,
      basePrice: seed.basePrice, volatility: seed.volatility, liquidity: seed.liquidity,
    },
  });
}

// --- ADMIN MANAGEMENT (global) ---

export async function createStock(symbol: string, name: string, price: number, volatility: number, liquidity = 1000) {
  const exists = await getStock(symbol);
  if (exists) throw new Error(`Stock with symbol ${symbol} already exists.`);
  return prisma.stock.create({
    data: {
      symbol: symbol.toUpperCase(), name, currentPrice: price, previousPrice: price,
      basePrice: price, volatility, liquidity, lastUpdate: new Date(),
    },
  });
}

export async function editStock(stockId: string, data: { currentPrice?: number; volatility?: number; liquidity?: number }) {
  return prisma.stock.update({ where: { id: stockId }, data });
}

export async function deleteStock(stockId: string) {
  await prisma.stockHolding.deleteMany({ where: { stockId } });
  await prisma.stockEvent.deleteMany({ where: { stockId } });
  return prisma.stock.delete({ where: { id: stockId } });
}
