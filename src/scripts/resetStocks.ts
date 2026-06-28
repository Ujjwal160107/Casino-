// src/scripts/resetStocks.ts
import { PrismaClient } from "@prisma/client";
import { initGlobalMarket } from "../services/stockService";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Wiping stock data for global migration...");
  try {
    await prisma.stockHolding.deleteMany({});
    console.log("✅ Cleared StockHoldings");
    await prisma.stockEvent.deleteMany({});
    console.log("✅ Cleared StockEvents");
    await prisma.stock.deleteMany({});
    console.log("✅ Cleared Stocks");

    await initGlobalMarket();
    const count = await prisma.stock.count();
    console.log(`🚀 Seeded ${count} global stocks. Migration complete.`);
  } catch (e) {
    console.error("Error during stock migration:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
