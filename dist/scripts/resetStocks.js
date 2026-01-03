"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("🗑️ Wiping legacy Stock data...");
    try {
        // Delete all stocks (this will also delete linked Holdings due to Cascade if configured, 
        // but check schema. Holdings delete is separate usually, but let's wipe stocks first).
        // Actually schema has: StockHolding -> Stock. If I delete Stock, I might need to delete Holdings first.
        // First delete holdings to be safe
        await prisma.stockHolding.deleteMany({});
        console.log("✅ Cleared StockHoldings");
        // Then delete stocks
        await prisma.stock.deleteMany({});
        console.log("✅ Cleared Stocks");
        console.log("🚀 Database is clean. Restart the server now.");
    }
    catch (e) {
        console.error("Error wiping data:", e);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=resetStocks.js.map