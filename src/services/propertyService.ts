import prisma from "../utils/prisma";
import { Property, OwnedProperty } from "@prisma/client";
import { ZOO_PROPERTY_DEFS, ZOO_CAPACITY, RARITY_INCOME, getAnimal } from "../utils/animalCatalog";
import { isTester } from "../utils/developerAccess";
import { GLOBAL_CATALOG_GUILD_ID } from "../utils/globalCatalog";

// --- Regular property catalog ---
export const REGULAR_PROPERTY_CATALOG: {
  key: string; name: string; description: string;
  price: number; incomePerCycle: number; incomeCycleHours: number;
}[] = [
  { key: "shack",     name: "Shack",          description: "A humble shack. Everyone starts somewhere.",           price: 1_800_000,   incomePerCycle: 12_000,  incomeCycleHours: 24 },
  { key: "apartment", name: "Apartment",      description: "A cozy apartment in the city.",                        price: 5_400_000,   incomePerCycle: 36_000,  incomeCycleHours: 24 },
  { key: "house",     name: "House",          description: "A comfortable suburban house.",                         price: 16_000_000,  incomePerCycle: 108_000, incomeCycleHours: 24 },
  { key: "mansion",   name: "Mansion",        description: "A grand mansion with staff quarters.",                 price: 47_000_000,  incomePerCycle: 312_000, incomeCycleHours: 24 },
  { key: "island",    name: "Private Island", description: "A secluded private island. Truly endgame wealth.",     price: 126_000_000, incomePerCycle: 840_000, incomeCycleHours: 24 },
];

export const ZOO_KEYS = new Set(Object.keys(ZOO_CAPACITY));

export class PropertyService {

  static async getAllProperties(_guildId?: string): Promise<Property[]> {
    return prisma.property.findMany({
      where: { isPublic: true },
      orderBy: { price: "asc" },
    });
  }

  static async getPropertyByKey(_guildId: string, key: string): Promise<Property | null> {
    return prisma.property.findUnique({
      where: { key },
    });
  }

  static async getOwnedProperties(discordId: string, _guildId?: string): Promise<(OwnedProperty & { property: Property })[]> {
    return prisma.ownedProperty.findMany({
      where: { userId: discordId },
      include: { property: true },
    });
  }

  static calculateDynamicPrice(basePrice: number, totalSold: number): number {
    return Math.floor(basePrice * (1 + totalSold * 0.05));
  }

  static async buyProperty(discordId: string, guildId: string, key: string): Promise<{ success: boolean; message: string }> {
    const property = await this.getPropertyByKey(guildId, key);
    if (!property) return { success: false, message: "Property not found." };

    const existing = await prisma.ownedProperty.findUnique({
      where: { userId_propertyId: { userId: discordId, propertyId: property.id } },
    });
    if (existing) return { success: false, message: "You already own this property." };

    const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
    if (!wallet || wallet.balance < property.price) {
      return { success: false, message: `Insufficient funds. You need ${property.price.toLocaleString()} coins.` };
    }

    return prisma.$transaction(async (tx) => {
      await tx.wallet.update({ where: { userId: discordId }, data: { balance: { decrement: property.price } } });
      await tx.ownedProperty.create({
        data: { userId: discordId, propertyId: property.id, purchasedPrice: property.price, lastCollected: new Date() },
      });
      const updated = await tx.property.update({ where: { id: property.id }, data: { totalSold: { increment: 1 } } });
      const newPrice = this.calculateDynamicPrice(updated.basePrice, updated.totalSold);
      await tx.property.update({ where: { id: property.id }, data: { price: newPrice } });
      return { success: true, message: `Successfully purchased **${property.name}** for ${property.price.toLocaleString()} coins!` };
    });
  }

  static async sellPropertySystem(discordId: string, guildId: string, key: string): Promise<{ success: boolean; message: string }> {
    const property = await this.getPropertyByKey(guildId, key);
    if (!property) return { success: false, message: "Property not found." };

    const owned = await prisma.ownedProperty.findUnique({
      where: { userId_propertyId: { userId: discordId, propertyId: property.id } },
    });
    if (!owned) return { success: false, message: "You do not own this property." };

    const sellPrice = Math.floor(property.price * 0.75);

    return prisma.$transaction(async (tx) => {
      await tx.ownedProperty.delete({ where: { id: owned.id } });
      await tx.wallet.update({ where: { userId: discordId }, data: { balance: { increment: sellPrice } } });
      const updated = await tx.property.update({ where: { id: property.id }, data: { totalSold: { decrement: 1 } } });
      const newPrice = this.calculateDynamicPrice(updated.basePrice, updated.totalSold);
      await tx.property.update({ where: { id: property.id }, data: { price: newPrice } });
      return { success: true, message: `Sold **${property.name}** for ${sellPrice.toLocaleString()} coins.` };
    });
  }

  // Admin (legacy — catalog is code-owned in V2)
  static async createProperty(_guildId: string, key: string, name: string, price: number, income: number): Promise<Property> {
    const existing = await this.getPropertyByKey(_guildId, key);
    if (existing) throw new Error(`Property with key '${key}' already exists.`);
    return prisma.property.create({
      data: {
        guildId: GLOBAL_CATALOG_GUILD_ID,
        key: key.toLowerCase(),
        name,
        description: `A lovely ${name}`,
        basePrice: price,
        price,
        incomePerCycle: income,
        totalSold: 0,
      },
    });
  }

  static async deleteProperty(_guildId: string, key: string) {
    return prisma.property.delete({ where: { key } });
  }

  static async editProperty(_guildId: string, key: string, data: Partial<Property>) {
    return prisma.property.update({ where: { key }, data });
  }
}

// --- Seeding ---

let globalPropertiesSeeded = false;

export async function seedGlobalProperties(_guildId?: string): Promise<void> {
  if (globalPropertiesSeeded) return;

  const allDefs = [
    ...REGULAR_PROPERTY_CATALOG.map(p => ({
      key: p.key, name: p.name, description: p.description,
      price: p.price, incomePerCycle: p.incomePerCycle, incomeCycleHours: p.incomeCycleHours,
    })),
    ...ZOO_PROPERTY_DEFS.map(p => ({
      key: p.key, name: p.name, description: p.description,
      price: p.price, incomePerCycle: 0, incomeCycleHours: 24,
    })),
  ];

  for (const def of allDefs) {
    await prisma.property.upsert({
      where: { key: def.key },
      create: {
        guildId: GLOBAL_CATALOG_GUILD_ID,
        key: def.key,
        name: def.name,
        description: def.description,
        basePrice: def.price,
        price: def.price,
        incomePerCycle: def.incomePerCycle,
        incomeCycleHours: def.incomeCycleHours,
        totalSold: 0,
      },
      update: {
        name: def.name,
        description: def.description,
        basePrice: def.price,
        incomePerCycle: def.incomePerCycle,
        incomeCycleHours: def.incomeCycleHours,
      },
    });
  }

  globalPropertiesSeeded = true;
}

export async function seedZooProperties(guildId?: string): Promise<void> {
  await seedGlobalProperties(guildId);
}

// --- Income Collection ---

export interface CollectIncomeResult {
  propertyBreakdown: { name: string; income: number }[];
  propertyTotal: number;
  zooBreakdown: { name: string; rarity: string; income: number }[];
  zooTotal: number;
  grandTotal: number;
  nothingReady: boolean;
  nextPropertyCollect: Date | null;
  nextZooCollect: Date | null;
}

export async function collectIncome(discordId: string, _guildId: string): Promise<CollectIncomeResult> {
  const now = new Date();
  const result: CollectIncomeResult = {
    propertyBreakdown: [],
    propertyTotal: 0,
    zooBreakdown: [],
    zooTotal: 0,
    grandTotal: 0,
    nothingReady: false,
    nextPropertyCollect: null,
    nextZooCollect: null,
  };

  const allOwned = await prisma.ownedProperty.findMany({
    where: {
      userId: discordId,
      property: { NOT: { key: { in: Array.from(ZOO_KEYS) } } },
    },
    include: { property: true },
  });

  const collectable = allOwned.filter(op => {
    const cycleMs = op.property.incomeCycleHours * 3_600_000;
    return isTester(discordId) || now.getTime() - op.lastCollected.getTime() >= cycleMs;
  });

  const notReady = allOwned.filter(op => !collectable.includes(op));
  if (notReady.length > 0) {
    const earliest = notReady.reduce((min, op) => {
      const next = new Date(op.lastCollected.getTime() + op.property.incomeCycleHours * 3_600_000);
      return next < min ? next : min;
    }, new Date(Date.now() + 99999999999));
    result.nextPropertyCollect = earliest;
  }

  for (const op of collectable) {
    const income = op.property.incomePerCycle;
    result.propertyBreakdown.push({ name: op.property.name, income });
    result.propertyTotal += income;
    await prisma.ownedProperty.update({ where: { id: op.id }, data: { lastCollected: now } });
  }

  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;
  const ZOO_COOLDOWN_MS = 24 * 3_600_000;

  if (lastClaim && now.getTime() - lastClaim.getTime() < ZOO_COOLDOWN_MS && !isTester(discordId)) {
    result.nextZooCollect = new Date(lastClaim.getTime() + ZOO_COOLDOWN_MS);
  } else {
    const zooAnimals = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
    if (zooAnimals.length > 0) {
      const hoursSinceLastClaim = isTester(discordId)
        ? 24
        : lastClaim
          ? Math.min(24, Math.floor((now.getTime() - lastClaim.getTime()) / 3_600_000))
          : 24;

      for (const animal of zooAnimals) {
        const def = getAnimal(animal.animalKey);
        if (!def) continue;
        const income = Math.floor(RARITY_INCOME[def.rarity] * hoursSinceLastClaim);
        result.zooBreakdown.push({ name: def.name, rarity: def.rarity, income });
        result.zooTotal += income;
      }

      if (result.zooTotal > 0) {
        await prisma.user.update({ where: { discordId }, data: { lastZooClaim: now } });
      }
    }
  }

  result.grandTotal = result.propertyTotal + result.zooTotal;
  result.nothingReady = result.grandTotal === 0;

  if (result.grandTotal > 0) {
    await prisma.wallet.update({
      where: { userId: discordId },
      data: { balance: { increment: result.grandTotal } },
    });
    const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
    if (wallet) {
      await prisma.transaction.create({
        data: {
          walletId: wallet.id,
          amount: result.grandTotal,
          type: "property_income",
          meta: { propertyTotal: result.propertyTotal, zooTotal: result.zooTotal },
          isEarned: true,
        },
      });
    }
  }

  return result;
}
