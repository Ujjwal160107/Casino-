import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { getAnimal, RARITY_INCOME_PER_DAY } from "../utils/animalCatalog";
import { animalState } from "../utils/zooRules";

export interface NetWorthBreakdown {
  wallet: number;
  bank: number;
  investments: number;
  stocks: number;
  properties: number;
  animals: number;
  items: number;
  passiveIncomePerDay: number;
  total: number;
}

const CACHE_TTL_SECONDS = 600;
const COMPUTE_CHUNK = 10;

const cacheKey = (discordId: string) => `networth:${discordId}`;

async function computeNetWorth(discordId: string): Promise<NetWorthBreakdown> {
  const breakdown: NetWorthBreakdown = {
    wallet: 0, bank: 0, investments: 0, stocks: 0,
    properties: 0, animals: 0, items: 0,
    passiveIncomePerDay: 0, total: 0,
  };

  const safely = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) {
      console.error(`netWorth ${label} failed for ${discordId}:`, err);
    }
  };

  await Promise.all([
    safely("wallet", async () => {
      const w = await prisma.wallet.findUnique({ where: { userId: discordId } });
      breakdown.wallet = w?.balance ?? 0;
    }),
    safely("bank", async () => {
      const b = await prisma.bank.findUnique({ where: { userId: discordId } });
      breakdown.bank = b?.balance ?? 0;
    }),
    safely("investments", async () => {
      const list = await prisma.investment.findMany({ where: { userId: discordId, status: "ACTIVE" } });
      breakdown.investments = list.reduce((s, i) => s + (i.amount || 0), 0);
    }),
    safely("stocks", async () => {
      const portfolio = await prisma.portfolio.findUnique({
        where: { userId: discordId },
        include: { holdings: { include: { stock: true } } },
      });
      breakdown.stocks = (portfolio?.holdings ?? []).reduce(
        (s, h) => s + h.quantity * (h.stock?.currentPrice ?? 0), 0);
    }),
    safely("properties", async () => {
      const owned = await prisma.ownedProperty.findMany({
        where: { userId: discordId },
        include: { property: true },
      });
      breakdown.properties = owned.reduce((s, o) => s + (o.property?.price ?? 0), 0);
      breakdown.passiveIncomePerDay += owned.reduce((s, o) => {
        const p = o.property;
        if (!p || !p.incomeCycleHours) return s;
        return s + p.incomePerCycle * Math.floor(24 / p.incomeCycleHours);
      }, 0);
    }),
    safely("animals", async () => {
      const now = new Date();
      const caught = await prisma.caughtAnimal.findMany({ where: { discordId } });
      for (const c of caught) {
        const def = getAnimal(c.animalKey);
        if (!def) continue;
        breakdown.animals += def.sellValue ?? 0;
        // Exactly what computeZooPayout pays: RARITY_INCOME_PER_DAY per HOUSED
        // and FED animal, nothing for a hungry one. The old
        // `zooIncomePerHour * 24` reported 3x the real rate and counted hungry
        // animals as earning, which fed a wrong `!leaderboard passive` sort.
        if (c.inZoo && animalState(c, now) === "fed") {
          breakdown.passiveIncomePerDay += RARITY_INCOME_PER_DAY[def.rarity];
        }
      }
    }),
    safely("items", async () => {
      const inv = await prisma.inventory.findMany({
        where: { userId: discordId },
        include: { shopItem: true },
      });
      breakdown.items = inv.reduce((s, i) => s + i.amount * (i.shopItem?.price ?? 0), 0);
    }),
  ]);

  breakdown.total =
    breakdown.wallet + breakdown.bank + breakdown.investments +
    breakdown.stocks + breakdown.properties + breakdown.animals + breakdown.items;
  return breakdown;
}

export async function getNetWorth(discordId: string): Promise<NetWorthBreakdown> {
  const cached = await redisService.get<NetWorthBreakdown>(cacheKey(discordId));
  if (cached) return cached;
  const fresh = await computeNetWorth(discordId);
  await redisService.set(cacheKey(discordId), fresh, CACHE_TTL_SECONDS);
  return fresh;
}

export async function getNetWorthMany(discordIds: string[]): Promise<Map<string, NetWorthBreakdown>> {
  const result = new Map<string, NetWorthBreakdown>();
  const misses: string[] = [];

  for (const id of discordIds) {
    const cached = await redisService.get<NetWorthBreakdown>(cacheKey(id));
    if (cached) result.set(id, cached);
    else misses.push(id);
  }

  for (let i = 0; i < misses.length; i += COMPUTE_CHUNK) {
    const chunk = misses.slice(i, i + COMPUTE_CHUNK);
    const computed = await Promise.all(chunk.map(async (id) => [id, await computeNetWorth(id)] as const));
    for (const [id, breakdown] of computed) {
      result.set(id, breakdown);
      await redisService.set(cacheKey(id), breakdown, CACHE_TTL_SECONDS);
    }
  }

  return result;
}
