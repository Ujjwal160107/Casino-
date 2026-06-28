import prisma from "../utils/prisma";

export const STARTING_STOCKS = [
    { symbol: "CRSH", name: "CasinoCoin", price: 50, volatility: 15 }, // High risk
    { symbol: "TECH", name: "TechGiant Corp", price: 200, volatility: 5 }, // Stable
    { symbol: "GOLD", name: "Solid Gold", price: 1500, volatility: 2 }, // Very stable
    { symbol: "OIL", name: "Big Oil", price: 100, volatility: 8 },
    { symbol: "MEME", name: "DogeRetry", price: 10, volatility: 25 }, // Very high risk
];

/**
 * Initializes the stock market with default stocks for a specific guild if none exist.
 */
export async function initStocks(guildId: string) {
    const count = await prisma.stock.count({ where: { guildId } });
    if (count === 0) {
        console.log(`Initializing Stock Market for Guild ${guildId}...`);
        for (const s of STARTING_STOCKS) {
            await prisma.stock.create({
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
export async function updateMarket() {
    // 1. Get all guilds that have stocks (optimization: could fetch all configs, but let's go by stocks)
    // Actually, simpler to iterate guild settings that we have recorded?
    // Or just distinct guildIds from Stock. 
    // Let's use groupBy to get active guildIds.

    const guildsWithStocks = await prisma.stock.groupBy({
        by: ['guildId'],
    });

    for (const g of guildsWithStocks) {
        const guildId = g.guildId;
        const refreshRateMs = 3600 * 1000;

        // Find stocks for this guild that need updating
        // We can't do complex date math in "where" easily for "lastUpdate + refreshRate < now" without raw query
        // typically. But we can select stocks where lastUpdate < (Now - Rate)

        const cutoff = new Date(Date.now() - refreshRateMs);

        const stocksToUpdate = await prisma.stock.findMany({
            where: {
                guildId,
                lastUpdate: { lt: cutoff }
            }
        });

        if (stocksToUpdate.length === 0) continue;

        // Global trend factor (Global Bull/Bear market) - affects this guild's batch
        const globalBias = (Math.random() * 2 - 1); // -1% to +1%

        for (const stock of stocksToUpdate) {
            // Random fluctuation between -Volatility and +Volatility
            const percentChange = (Math.random() * (stock.volatility * 2) - stock.volatility) + globalBias;

            // Calculate new price
            let newPrice = Math.floor(stock.currentPrice * (1 + percentChange / 100));

            // Crash/Spike protection (Soft limits relative to base price)
            if (newPrice < stock.basePrice * 0.1) newPrice = Math.floor(stock.basePrice * 0.15);
            if (newPrice > stock.basePrice * 5) newPrice = Math.floor(newPrice * 0.95);

            // Ensure price never hits 0 or negative
            if (newPrice < 1) newPrice = 1;

            await prisma.stock.update({
                where: { id: stock.id },
                data: { currentPrice: newPrice, lastUpdate: new Date() }
            });
        }
        // console.log(`📈 Updated ${stocksToUpdate.length} stocks for guild ${guildId}`);
    }
}

export async function getStock(guildId: string, symbol: string) {
    return prisma.stock.findUnique({
        where: {
            guildId_symbol: {
                guildId,
                symbol: symbol.toUpperCase()
            }
        }
    });
}

export async function getAllStocks(guildId: string) {
    return prisma.stock.findMany({
        where: { guildId },
        orderBy: { currentPrice: 'desc' }
    });
}

// Helper to resolve user discordId
async function getUserDiscordId(discordId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId }
    });
    return user ? user.discordId : null;
}

export async function getPortfolio(guildId: string, discordId: string) {
    const userId = await getUserDiscordId(discordId);
    if (!userId) return null;

    return prisma.portfolio.findUnique({
        where: { userId },
        include: { holdings: { include: { stock: true } } }
    });
}

export async function buyStock(guildId: string, discordId: string, symbol: string, quantity: number) {
    if (quantity <= 0) throw new Error("Quantity must be positive.");

    const stock = await getStock(guildId, symbol);
    if (!stock) throw new Error(`Stock **${symbol}** not found in this market.`);

    const cost = stock.currentPrice * quantity;

    // Resolve User
    const user = await prisma.user.findUnique({
        where: { discordId },
        include: { wallet: true }
    });

    if (!user) throw new Error("User not found. Try chatting first to register.");
    if (!user.wallet || user.wallet.balance < cost) {
        throw new Error(`Insufficient funds. Cost: ${cost}`);
    }

    const userId = user.discordId; // User's ObjectID

    // Ensure Portfolio
    let portfolio = await prisma.portfolio.findUnique({ where: { userId } });
    if (!portfolio) {
        portfolio = await prisma.portfolio.create({ data: { userId } });
    }

    // Update Wallet
    await prisma.wallet.update({
        where: { id: user.wallet.id },
        data: { balance: { decrement: cost } }
    });

    // Update Holding
    const holding = await prisma.stockHolding.findUnique({
        where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } }
    });

    if (holding) {
        const totalCost = (holding.avgBuyPrice * holding.quantity) + cost;
        const totalQty = holding.quantity + quantity;
        const newAvg = Math.floor(totalCost / totalQty);

        await prisma.stockHolding.update({
            where: { id: holding.id },
            data: { quantity: totalQty, avgBuyPrice: newAvg }
        });
    } else {
        await prisma.stockHolding.create({
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

export async function sellStock(guildId: string, discordId: string, symbol: string, quantity: number) {
    if (quantity <= 0) throw new Error("Quantity must be positive.");

    const stock = await getStock(guildId, symbol);
    if (!stock) throw new Error(`Stock **${symbol}** not found in this market.`);

    const userId = await getUserDiscordId(discordId);
    if (!userId) throw new Error("User not found.");

    const portfolio = await prisma.portfolio.findUnique({
        where: { userId },
        include: { holdings: true }
    });

    if (!portfolio) throw new Error("You don't own any stocks.");

    // Find holding that matches this stock ID
    const holding = await prisma.stockHolding.findUnique({
        where: { portfolioId_stockId: { portfolioId: portfolio.id, stockId: stock.id } }
    });

    if (!holding || holding.quantity < quantity) {
        throw new Error(`You don't have enough shares (${holding?.quantity || 0}).`);
    }

    const value = stock.currentPrice * quantity;

    // Update Wallet
    const user = await prisma.user.findUnique({ where: { discordId: userId }, include: { wallet: true } });
    await prisma.wallet.update({
        where: { id: user!.wallet!.id },
        data: { balance: { increment: value } }
    });

    if (holding.quantity === quantity) {
        await prisma.stockHolding.delete({ where: { id: holding.id } });
    } else {
        await prisma.stockHolding.update({
            where: { id: holding.id },
            data: { quantity: { decrement: quantity } }
        });
    }

    const profit = value - (holding.avgBuyPrice * quantity);
    return { stock, value, profit, remaining: holding.quantity - quantity };
}


// --- ADMIN MANAGEMENT ---

export async function createStock(guildId: string, symbol: string, name: string, price: number, volatility: number) {
    const exists = await getStock(guildId, symbol);
    if (exists) throw new Error(`Stock with symbol ${symbol} already exists.`);

    return prisma.stock.create({
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

export async function editStock(stockId: string, data: { currentPrice?: number, volatility?: number }) {
    return prisma.stock.update({
        where: { id: stockId },
        data
    });
}

export async function deleteStock(stockId: string) {
    return prisma.stock.delete({ where: { id: stockId } });
}

export async function getStockById(stockId: string) {
    return prisma.stock.findUnique({ where: { id: stockId } });
}
