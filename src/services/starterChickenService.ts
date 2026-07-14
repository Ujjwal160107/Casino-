import prisma from "../utils/prisma";
import { GLOBAL_CATALOG_GUILD_ID } from "../utils/globalCatalog";
import { COCK_SYSTEM_ITEMS } from "../utils/shopCatalog";
import {
  createStarterChickenMeta,
  STARTER_CHICKEN_ITEM_KEY,
  StarterChickenMeta,
} from "../utils/chickenConfig";

type RandomSource = () => number;

const STARTER_CHICKEN_CATALOG = (() => {
  const item = COCK_SYSTEM_ITEMS.find((entry) => entry.key === STARTER_CHICKEN_ITEM_KEY);
  if (!item) throw new Error("The starter Chicken catalog item is missing.");
  return item;
})();
let chickenCatalogPromise: Promise<{ id: string }> | null = null;

async function ensureStarterChickenCatalog(): Promise<{ id: string }> {
  if (!chickenCatalogPromise) {
    chickenCatalogPromise = prisma.shopItem.upsert({
      where: { catalogKey: STARTER_CHICKEN_ITEM_KEY },
      create: {
        catalogKey: STARTER_CHICKEN_CATALOG.key,
        guildId: GLOBAL_CATALOG_GUILD_ID,
        name: STARTER_CHICKEN_CATALOG.name,
        price: STARTER_CHICKEN_CATALOG.price,
        description: STARTER_CHICKEN_CATALOG.description,
        stock: -1,
        itemType: STARTER_CHICKEN_CATALOG.itemType,
        effects: STARTER_CHICKEN_CATALOG.effects as any,
        consumable: STARTER_CHICKEN_CATALOG.consumable,
        usable: STARTER_CHICKEN_CATALOG.usable,
        category: STARTER_CHICKEN_CATALOG.category,
      },
      update: {
        name: STARTER_CHICKEN_CATALOG.name,
        price: STARTER_CHICKEN_CATALOG.price,
        description: STARTER_CHICKEN_CATALOG.description,
        itemType: STARTER_CHICKEN_CATALOG.itemType,
        effects: STARTER_CHICKEN_CATALOG.effects as any,
        consumable: STARTER_CHICKEN_CATALOG.consumable,
        usable: STARTER_CHICKEN_CATALOG.usable,
        category: STARTER_CHICKEN_CATALOG.category,
      },
      select: { id: true },
    }).catch((error) => {
      chickenCatalogPromise = null;
      throw error;
    });
  }
  return chickenCatalogPromise;
}

export type StarterChickenResult = {
  created: boolean;
  meta: StarterChickenMeta | null;
};

/**
 * Guarantees that an account has one active chicken. The inventory unique key
 * makes this safe across concurrent commands and bot processes.
 */
export async function ensureStarterChicken(
  discordId: string,
  username: string,
  random: RandomSource = Math.random,
): Promise<StarterChickenResult> {
  const chickenItem = await ensureStarterChickenCatalog();
  const existing = await prisma.inventory.findUnique({
    where: { userId_shopItemId: { userId: discordId, shopItemId: chickenItem.id } },
    select: { id: true, amount: true, meta: true },
  });

  if (existing && existing.amount > 0) {
    return { created: false, meta: null };
  }

  const meta = createStarterChickenMeta(username, random);
  try {
    await prisma.inventory.upsert({
      where: { userId_shopItemId: { userId: discordId, shopItemId: chickenItem.id } },
      create: { userId: discordId, shopItemId: chickenItem.id, amount: 1, meta },
      update: { amount: 1, meta },
    });
    return { created: true, meta };
  } catch (error: any) {
    // Another request may have created the chicken between the read and upsert.
    if (error?.code !== "P2002") throw error;
    return { created: false, meta: null };
  }
}

/**
 * Runs once at startup to provision legacy accounts without delaying bot ready.
 * New accounts are provisioned directly by ensureUserAndWallet.
 */
export async function backfillStarterChickens(batchSize = 100): Promise<number> {
  let lastDiscordId: string | undefined;
  let created = 0;

  while (true) {
    const users = await prisma.user.findMany({
      where: lastDiscordId ? { discordId: { gt: lastDiscordId } } : undefined,
      orderBy: { discordId: "asc" },
      take: batchSize,
      select: { discordId: true, username: true },
    });
    if (users.length === 0) break;

    for (let index = 0; index < users.length; index += 20) {
      const results = await Promise.all(
        users.slice(index, index + 20).map((user) => ensureStarterChicken(user.discordId, user.username)),
      );
      created += results.filter((result) => result.created).length;
    }
    lastDiscordId = users[users.length - 1].discordId;
  }

  return created;
}
