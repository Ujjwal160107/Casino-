"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STARTING_STOCKS = void 0;
exports.initStocks = initStocks;
exports.updateMarket = updateMarket;
exports.getStock = getStock;
exports.getAllStocks = getAllStocks;
exports.getPortfolio = getPortfolio;
exports.buyStock = buyStock;
exports.sellStock = sellStock;
exports.createStock = createStock;
exports.editStock = editStock;
exports.deleteStock = deleteStock;
exports.getStockById = getStockById;
const prisma_1 = __importDefault(require("../utils/prisma"));
const guildConfigService_1 = require("./guildConfigService");
exports.STARTING_STOCKS = [
    { symbol: "CRSH", name: "CasinoCoin", price: 50, volatility: 15 }, // High risk
    { symbol: "TECH", name: "TechGiant Corp", price: 200, volatility: 5 }, // Stable
    { symbol: "GOLD", name: "Solid Gold", price: 1500, volatility: 2 }, // Very stable
    { symbol: "OIL", name: "Big Oil", price: 100, volatility: 8 },
    { symbol: "MEME", name: "DogeRetry", price: 10, volatility: 25 }, // Very high risk
];
/**
 * Initializes the stock market with default stocks for a specific guild if none exist.
 */
async function initStocks(guildId) {
    const count = await prisma_1.default.stock.count({ where: { guildId } });
    if (count === 0) {
        console.log(`Initializing Stock Market for Guild ${guildId}...`);
        for (const s of exports.STARTING_STOCKS) {
            await prisma_1.default.stock.create({
                data: {
                    guildId,
                    symbol: s.symbol,
                    name: s.name,
                    currentPrice: s.price,
                    basePrice: s.price,
                    volatility: s.volatility
                }
            });
        }
    }
}
/**
 * Updates stock prices for all guilds, respecting their individual refresh rates.
 */
async function updateMarket() {
    // 1. Get all guilds that have stocks (optimization: could fetch all configs, but let's go by stocks)
    // Actually, simpler to iterate all GuildConfigs that we have recorded? 
    // Or just distinct guildIds from Stock. 
    // Let's use groupBy to get active guildIds.
    const guildsWithStocks = await prisma_1.default.stock.groupBy({
        by: ['guildId'],
    });
    for (const g of guildsWithStocks) {
        const guildId = g.guildId;
        const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
        const refreshRateMs = (config.stockRefreshRate || 600) * 1000;
        // Find stocks for this guild that need updating
        // We can't do complex date math in "where" easily for "lastUpdate + refreshRate < now" without raw query
        // typically. But we can select stocks where lastUpdate < (Now - Rate)
        const cutoff = new Date(Date.now() - refreshRateMs);
        const stocksToUpdate = await prisma_1.default.stock.findMany({
            where: {
                guildId,
                lastUpdate: { lt: cutoff }
            }
        });
        if (stocksToUpdate.length === 0)
            continue;
        // Global trend factor (Global Bull/Bear market) - affects this guild's batch
        const globalBias = (Math.random() * 2 - 1); // -1% to +1%
        for (const stock of stocksToUpdate) {
            // Random fluctuation between -Volatility and +Volatility
            const percentChange = (Math.random() * (stock.volatility * 2) - stock.volatility) + globalBias;
            // Calculate new price
            let newPrice = Math.floor(stock.currentPrice * (1 + percentChange / 100));
            // Crash/Spike protection (Soft limits relative to base price)
            if (newPrice < stock.basePrice * 0.1)
                newPrice = Math.floor(stock.basePrice * 0.15);
            if (newPrice > stock.basePrice * 5)
                newPrice = Math.floor(newPrice * 0.95);
            // Ensure price never hits 0 or negative
            if (newPrice < 1)
                newPrice = 1;
            await prisma_1.default.stock.update({
                where: { id: stock.id },
                data: { currentPrice: newPrice, lastUpdate: new Date() }
            });
        }
        // console.log(`📈 Updated ${stocksToUpdate.length} stocks for guild ${guildId}`);
    }
}
async function getStock(guildId, symbol) {
    return prisma_1.default.stock.findUnique({
        where: {
            guildId_symbol: {
                guildId,
                symbol: symbol.toUpperCase()
            }
        }
    });
}
async function getAllStocks(guildId) {
    return prisma_1.default.stock.findMany({
        where: { guildId },
        orderBy: { currentPrice: 'desc' }
    });
}
// Helper to resolve User ObjectID from Discord ID
async function getUserObjectId(guildId, discordId) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } }
    });
    return user ? user.id : null;
}
async function getPortfolio(guildId, discordId) {
    const userId = await getUserObjectId(guildId, discordId);
    if (!userId)
        return null;
    return prisma_1.default.portfolio.findUnique({
        where: { userId },
        include: { holdings: { include: { stock: true } } }
    });
}
async function buyStock(guildId, discordId, symbol, quantity) {
    if (quantity <= 0)
        throw new Error("Quantity must be positive.");
    const stock = await getStock(guildId, symbol);
    if (!stock)
        throw new Error(`Stock **${symbol}** not found in this market.`);
    const cost = stock.currentPrice * quantity;
    // Resolve User
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId, guildId } },
        include: { wallet: true }
    });
    if (!user)
        throw new Error("User not found. Try chatting first to register.");
    if (!user.wallet || user.wallet.balance < cost) {
        throw new Error(`Insufficient funds. Cost: ${cost}`);
    }
    const userId = user.id; // User's ObjectID
    // Ensure Portfolio
    let portfolio = await prisma_1.default.portfolio.findUnique({ where: { userId } });
    if (!portfolio) {
        portfolio = await prisma_1.default.portfolio.create({ data: { userId } });
    }
    // Update Wallet
    await prisma_1.default.wallet.update({
        where: { id: user.wallet.id },
        data: { balance: { decrement: cost } }
    });
    // Update Holding
    const holding = await prisma_1.default.stockHolding.findUnique({
        where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } }
    });
    if (holding) {
        const totalCost = (holding.avgBuyPrice * holding.quantity) + cost;
        const totalQty = holding.quantity + quantity;
        const newAvg = Math.floor(totalCost / totalQty);
        await prisma_1.default.stockHolding.update({
            where: { id: holding.id },
            data: { quantity: totalQty, avgBuyPrice: newAvg }
        });
    }
    else {
        await prisma_1.default.stockHolding.create({
            data: {
                portfolioId: portfolio.id,
                stockId: stock.id,
                quantity,
                avgBuyPrice: stock.currentPrice
            }
        });
    }
    return { stock, cost, newQty: (holding ? holding.quantity : 0) + quantity };
}
async function sellStock(guildId, discordId, symbol, quantity) {
    if (quantity <= 0)
        throw new Error("Quantity must be positive.");
    const stock = await getStock(guildId, symbol);
    if (!stock)
        throw new Error(`Stock **${symbol}** not found in this market.`);
    const userId = await getUserObjectId(guildId, discordId);
    if (!userId)
        throw new Error("User not found.");
    const portfolio = await prisma_1.default.portfolio.findUnique({
        where: { userId },
        include: { holdings: true }
    });
    if (!portfolio)
        throw new Error("You don't own any stocks.");
    // Find holding that matches this stock ID
    const holding = await prisma_1.default.stockHolding.findUnique({
        where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } }
    });
    if (!holding || holding.quantity < quantity) {
        throw new Error(`You don't have enough shares (${holding?.quantity || 0}).`);
    }
    const value = stock.currentPrice * quantity;
    // Update Wallet
    const user = await prisma_1.default.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    await prisma_1.default.wallet.update({
        where: { id: user.wallet.id },
        data: { balance: { increment: value } }
    });
    if (holding.quantity === quantity) {
        await prisma_1.default.stockHolding.delete({ where: { id: holding.id } });
    }
    else {
        await prisma_1.default.stockHolding.update({
            where: { id: holding.id },
            data: { quantity: { decrement: quantity } }
        });
    }
    const profit = value - (holding.avgBuyPrice * quantity);
    return { stock, value, profit, remaining: holding.quantity - quantity };
}
// --- ADMIN MANAGEMENT ---
async function createStock(guildId, symbol, name, price, volatility) {
    const exists = await getStock(guildId, symbol);
    if (exists)
        throw new Error(`Stock with symbol ${symbol} already exists.`);
    return prisma_1.default.stock.create({
        data: {
            guildId,
            symbol: symbol.toUpperCase(),
            name,
            currentPrice: price,
            basePrice: price,
            volatility,
            lastUpdate: new Date()
        }
    });
}
async function editStock(stockId, data) {
    return prisma_1.default.stock.update({
        where: { id: stockId },
        data
    });
}
async function deleteStock(stockId) {
    return prisma_1.default.stock.delete({ where: { id: stockId } });
}
async function getStockById(stockId) {
    return prisma_1.default.stock.findUnique({ where: { id: stockId } });
}
//# sourceMappingURL=stockService.js.map