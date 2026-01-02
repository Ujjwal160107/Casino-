
import { PrismaClient, Property, OwnedProperty } from '@prisma/client';

const prisma = new PrismaClient();

export class PropertyService {

    // Helper: Resolve Internal User ID
    private static async resolveUser(discordId: string, guildId: string) {
        let user = await prisma.user.findUnique({
            where: { discordId_guildId: { discordId, guildId } }
        });

        if (!user) {
            // Create if not exists (lazy load, though usually done in middleware)
            // Ideally we throw error, but for safety lets return null or throw
            return null;
        }
        return user;
    }

    // Fetch all available properties for a guild
    static async getAllProperties(guildId: string): Promise<Property[]> {
        return await prisma.property.findMany({
            where: { guildId, isPublic: true },
            orderBy: { price: 'asc' }
        });
    }

    // Get a specific property by key
    static async getPropertyByKey(guildId: string, key: string): Promise<Property | null> {
        return await prisma.property.findUnique({
            where: {
                guildId_key: {
                    guildId,
                    key
                }
            }
        });
    }

    // Fetch properties owned by a user
    static async getOwnedProperties(discordId: string, guildId: string): Promise<(OwnedProperty & { property: Property })[]> {
        const user = await this.resolveUser(discordId, guildId);
        if (!user) return [];

        return await prisma.ownedProperty.findMany({
            where: { userId: user.id },
            include: { property: true }
        });
    }

    // Recalculate dynamic price based on total sold
    // Logic: Base Price * (1 + (Total Sold * 0.05)) -> 5% increase per sale
    static calculateDynamicPrice(basePrice: number, totalSold: number): number {
        const increaseFactor = 0.05;
        return Math.floor(basePrice * (1 + (totalSold * increaseFactor)));
    }

    static async updatePropertyPrice(propertyId: string) {
        const property = await prisma.property.findUnique({ where: { id: propertyId } });
        if (!property) return;

        const newPrice = this.calculateDynamicPrice(property.basePrice, property.totalSold);

        await prisma.property.update({
            where: { id: propertyId },
            data: { price: newPrice }
        });
    }

    // Buy a property
    static async buyProperty(discordId: string, guildId: string, key: string): Promise<{ success: boolean; message: string }> {
        const user = await this.resolveUser(discordId, guildId);
        if (!user) return { success: false, message: "User not found (try sending a message first)." };

        const property = await this.getPropertyByKey(guildId, key);
        if (!property) return { success: false, message: "Property not found." };

        // Check ownership limit
        const existing = await prisma.ownedProperty.findUnique({
            where: { userId_propertyId: { userId: user.id, propertyId: property.id } }
        });

        if (existing) return { success: false, message: "You already own this property." };

        // Check Balance
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
        if (!wallet || wallet.balance < property.price) {
            return { success: false, message: `Insufficient funds. You need ${property.price} coins.` };
        }

        // Transaction
        return await prisma.$transaction(async (tx) => {
            // Deduct money
            await tx.wallet.update({
                where: { userId: user.id },
                data: { balance: { decrement: property.price } }
            });

            // Add to OwnedProperty
            await tx.ownedProperty.create({
                data: {
                    userId: user.id,
                    propertyId: property.id,
                    purchasedPrice: property.price,
                    lastCollected: new Date() // Rent timer starts now
                }
            });

            // Update Property Stats (Total Sold) & Price
            const updatedProperty = await tx.property.update({
                where: { id: property.id },
                data: { totalSold: { increment: 1 } }
            });

            // Recalculate price for next buyer
            // Note: We can't use 'this.updatePropertyPrice' easily inside transaction due to race conditions or simple logic separation, 
            // but we can calculate and set it here.
            const newPrice = this.calculateDynamicPrice(updatedProperty.basePrice, updatedProperty.totalSold);
            await tx.property.update({
                where: { id: property.id },
                data: { price: newPrice }
            });

            return { success: true, message: `Successfully purchased **${property.name}** for ${property.price} coins!` };
        });
    }

    // Sell Property back to system (Instant Cash)
    static async sellPropertySystem(discordId: string, guildId: string, key: string): Promise<{ success: boolean; message: string }> {
        const user = await this.resolveUser(discordId, guildId);
        if (!user) return { success: false, message: "User not found." };

        const property = await this.getPropertyByKey(guildId, key);
        if (!property) return { success: false, message: "Property not found." };

        const owned = await prisma.ownedProperty.findUnique({
            where: { userId_propertyId: { userId: user.id, propertyId: property.id } }
        });

        if (!owned) return { success: false, message: "You do not own this property." };

        // Sell Price Logic: 75% of CURRENT value
        const sellPrice = Math.floor(property.price * 0.75);

        return await prisma.$transaction(async (tx) => {
            // Delete ownership
            await tx.ownedProperty.delete({
                where: { id: owned.id }
            });

            // Add money
            await tx.wallet.update({
                where: { userId: user.id },
                data: { balance: { increment: sellPrice } }
            });

            // Decrease totalSold
            const updatedProperty = await tx.property.update({
                where: { id: property.id },
                data: { totalSold: { decrement: 1 } }
            });

            // Recalculate price
            const newPrice = this.calculateDynamicPrice(updatedProperty.basePrice, updatedProperty.totalSold);
            await tx.property.update({
                where: { id: property.id },
                data: { price: newPrice }
            });

            return { success: true, message: `Sold **${property.name}** for ${sellPrice} coins.` };
        });
    }

    // Collect Rent
    static async collectRent(discordId: string, guildId: string): Promise<{ success: boolean; message: string; totalCollected: number }> {
        const user = await this.resolveUser(discordId, guildId);
        if (!user) return { success: false, message: "User not found.", totalCollected: 0 };

        const ownedProperties = await this.getOwnedProperties(discordId, guildId);
        if (ownedProperties.length === 0) return { success: false, message: "You don't own any properties.", totalCollected: 0 };

        let totalParams = 0;
        const now = new Date();

        // Filter collectable
        const collectable = ownedProperties.filter(p => {
            const collectTime = new Date(p.lastCollected.getTime() + (p.property.incomeCycleHours * 60 * 60 * 1000));
            return now >= collectTime;
        });

        if (collectable.length === 0) {
            return { success: false, message: "No rent due yet.", totalCollected: 0 };
        }

        // Process collection
        await prisma.$transaction(async (tx) => {
            for (const p of collectable) {
                totalParams += p.property.incomePerCycle;
                await tx.ownedProperty.update({
                    where: { id: p.id },
                    data: { lastCollected: now }
                });
            }

            if (totalParams > 0) {
                await tx.wallet.update({
                    where: { userId: user.id },
                    data: { balance: { increment: totalParams } }
                });
            }
        });

        return { success: true, message: `Collected **${totalParams}** coins from ${collectable.length} properties.`, totalCollected: totalParams };
    }

    // Admin: Create Property
    static async createProperty(guildId: string, key: string, name: string, price: number, income: number): Promise<Property> {
        const existing = await this.getPropertyByKey(guildId, key);
        if (existing) {
            throw new Error(`A property with key '${key}' already exists.`);
        }

        return await prisma.property.create({
            data: {
                guildId,
                key: key.toLowerCase(),
                name,
                description: `A lovely ${name}`,
                basePrice: price,
                price: price, // Start at base
                incomePerCycle: income,
                totalSold: 0
            }
        });
    }

    // Admin: Delete Property
    static async deleteProperty(guildId: string, key: string) {
        return await prisma.property.delete({
            where: { guildId_key: { guildId, key } }
        });
    }

    // Admin: Edit Property
    static async editProperty(guildId: string, key: string, data: Partial<Property>) {
        return await prisma.property.update({
            where: { guildId_key: { guildId, key } },
            data
        });
    }
}
