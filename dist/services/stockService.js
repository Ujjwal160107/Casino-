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
const prisma_1 = __importDefault(require("../utils/prisma"));
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
 * Updates all stock prices based on their volatility.
 * Random Walk: New Price = Old Price * (1 + Random(-Vol, +Vol)%)
 * Updates ALL stocks across ALL guilds.
 */
async function updateMarket() {
    const stocks = await prisma_1.default.stock.findMany();
    // Global trend factor (Global Bull/Bear market) - affects everyone slightly
    const globalBias = (Math.random() * 2 - 1); // -1% to +1%
    for (const stock of stocks) {
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
    // console.log("📈 Stock Market Updated (Global)");
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
async function getPortfolio(userId) {
    return prisma_1.default.portfolio.findUnique({
        where: { userId },
        include: { holdings: { include: { stock: true } } }
    });
}
async function buyStock(guildId, userId, symbol, quantity) {
    if (quantity <= 0)
        throw new Error("Quantity must be positive.");
    const stock = await getStock(guildId, symbol);
    if (!stock)
        throw new Error(`Stock **${symbol}** not found in this market.`);
    const cost = stock.currentPrice * quantity;
    // Check balance
    const user = await prisma_1.default.user.findUnique({ where: { id: userId }, include: { wallet: true } });
    if (!user || !user.wallet || user.wallet.balance < cost) {
        throw new Error(`Insufficient funds. Cost: ${cost}`);
    }
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
async function sellStock(guildId, userId, symbol, quantity) {
    if (quantity <= 0)
        throw new Error("Quantity must be positive.");
    // We need to find the stock ensuring it belongs to this guild, 
    // although for selling, we care more that the user OWNS it.
    // However, prices should come from the current guild's market.
    const stock = await getStock(guildId, symbol);
    if (!stock)
        throw new Error(`Stock **${symbol}** not found in this market.`);
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
//# sourceMappingURL=stockService.js.map