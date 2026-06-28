import prisma from "../utils/prisma";
import { GuildMember } from "discord.js";
import { applyItemEffects, ItemEffect, ItemEffectResult } from "./effectService";
import { logToChannel } from "../utils/discordLogger";
import { Colors } from "discord.js";
import { Mascot } from "../config/branding";
import { GENERAL_SHOP_CATALOG, HUNT_SHOP_CATALOG, JOB_SHOP_CATALOG, UNI_SHOP_CATALOG, COCK_SHOP_CATALOG, COCK_SYSTEM_ITEMS, COSMETICS_SHOP_CATALOG } from "../utils/shopCatalog";
import { RIFLE_PRIORITY } from "../utils/animalCatalog";
import { redisService } from "./redisService";
import { isTester } from "../utils/developerAccess";
import { ensureUserAndWallet } from "./walletService";
import { GLOBAL_CATALOG_GUILD_ID, globalCatalogGuildFilter } from "../utils/globalCatalog";
import type { ShopCatalogItem } from "../utils/shopCatalog";

export async function resetShop(_guildId: string, category: string = "GENERAL") {
  return prisma.shopItem.deleteMany({
    where: globalCatalogGuildFilter({ category }),
  });
}

export async function getShopItems(_guildId: string, category: string = "GENERAL") {
  return prisma.shopItem.findMany({ where: globalCatalogGuildFilter({ category }) });
}

export async function getShopItemByName(_guildId: string, name: string) {
  return prisma.shopItem.findFirst({
    where: {
      ...globalCatalogGuildFilter(),
      name: { equals: name, mode: "insensitive" },
    },
  });
}

export async function createShopItem(
  guildId: string,
  name: string,
  price: number,
  description?: string,
  roleId?: string,
  itemType?: string,
  effects?: ItemEffect[],
  consumable?: boolean,
  category: string = "GENERAL"
) {
  return prisma.shopItem.create({
    data: {
      guildId: GLOBAL_CATALOG_GUILD_ID,
      catalogKey: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      price,
      description: description || "No description",
      roleId,
      stock: -1,
      itemType: itemType || "COLLECTIBLE",
      effects: effects ? (effects as any) : undefined,
      consumable: consumable || false,
      category
    }
  });
}

export async function updateShopItem(
  guildId: string,
  itemId: string,
  data: Partial<{
    name: string;
    price: number;
    description: string;
    stock: number;
    roleId: string;
    itemType: string;
    effects: ItemEffect[];
    consumable: boolean;
    maxUses: number;
    category: string;
  }>
) {
  const updateData: any = { ...data };
  if (data.effects) {
    updateData.effects = data.effects as any;
  }

  return prisma.shopItem.update({
    where: { id: itemId },
    data: updateData
  });
}

export async function deleteShopItem(itemId: string) {
  return prisma.shopItem.delete({ where: { id: itemId } });
}

export async function buyItem(guildId: string, userId: string, identifier: string, member?: GuildMember, byId: boolean = false, paymentSource: "wallet" | "card" = "wallet") {
  const tester = isTester(userId, member);
  if (tester) {
    await ensureUserAndWallet(userId, guildId, member?.user.username ?? "Tester");
  }

  let item;

  if (byId) {
    item = await prisma.shopItem.findUnique({
      where: { id: identifier }
    });
  } else {
    item = await prisma.shopItem.findFirst({
      where: {
        ...globalCatalogGuildFilter(),
        name: { equals: identifier, mode: "insensitive" },
      },
    });
  }

  if (!item) throw new Error("Item not found.");
  if (item.stock !== -1 && item.stock <= 0 && !tester) throw new Error("Out of stock.");

  const res = await prisma.$transaction(async (tx) => {
    const user = await (tx.user.findUnique as any)({
      where: { discordId: userId },
      include: { wallet: true, bank: true }
    });

    if (!user || !user.wallet) {
      throw new Error("User or wallet not found.");
    }

    if (paymentSource === "card" && !tester) {
      const allCatalogs = [...GENERAL_SHOP_CATALOG, ...HUNT_SHOP_CATALOG, ...JOB_SHOP_CATALOG, ...UNI_SHOP_CATALOG, ...COCK_SHOP_CATALOG, ...COSMETICS_SHOP_CATALOG];
      const catalogEntry = allCatalogs.find(c => c.name.toLowerCase() === item.name.toLowerCase());
      if (catalogEntry?.creditBlocked) {
        throw new Error(`**${item.name}** cannot be purchased with a credit card.`);
      }
    } else if (user.wallet.balance < item.price && !tester) {
      throw new Error(`You need ${item.price.toLocaleString("en-US")} coins to buy this.`);
    }

    const reqs = (item.requirements as any) || {};

    if (reqs.balance && user.wallet.balance < reqs.balance && !tester) {
      throw new Error(`You need a wallet balance of ${reqs.balance} to buy this.`);
    }

    if (reqs.netWorth && !tester) {
      const netWorth = user.wallet.balance + (user.bank?.balance || 0);
      if (netWorth < reqs.netWorth) {
        throw new Error(`You need a net worth of ${reqs.netWorth} to buy this.`);
      }
    }

    if (reqs.roles && reqs.roles.length > 0 && !tester) {
      if (!member) throw new Error("Could not verify role requirements.");
      const hasRole = reqs.roles.some((roleId: string) => member.roles.cache.has(roleId));
      if (!hasRole) {
        throw new Error(`You don't have the required role to buy this.`);
      }
    }

    if (reqs.denyRoles && reqs.denyRoles.length > 0 && !tester) {
      if (member) {
        const hasDenyRole = reqs.denyRoles.some((roleId: string) => member.roles.cache.has(roleId));
        if (hasDenyRole) {
          throw new Error(`You cannot buy this item with your current roles.`);
        }
      }
    }

    if (reqs.items && reqs.items.length > 0 && !tester) {
      const userInv = await tx.inventory.findMany({
        where: { userId: user.discordId },
        include: { shopItem: true }
      });

      for (const reqItemName of reqs.items) {
        const hasItem = userInv.some((i: any) => i.shopItem.name.toLowerCase() === reqItemName.toLowerCase() && i.amount > 0);
        if (!hasItem) {
          throw new Error(`You need the item "**${reqItemName}**" to buy this.`);
        }
      }
    }

    let metaData: any = {};

    if (item.name.toLowerCase() === "chicken") {
      const existingInfo = await tx.inventory.findUnique({
        where: { userId_shopItemId: { userId: user.discordId, shopItemId: item.id } }
      });
      if (existingInfo && existingInfo.amount >= 1) {
        throw new Error("You can only hold 1 Chicken at a time!");
      }

      const TRAITS = ["Aggressive", "Tank", "Speedster", "Balanced", "Fierce"];
      const trait = TRAITS[Math.floor(Math.random() * TRAITS.length)];

      metaData = {
        name: `${user.username}'s Chicken`,
        level: 0,
        xp: 0,
        wins: 0,
        strength: 0,
        agility: 0,
        defense: 0,
        trait: trait
      };
    }

    let cardInfo: any = null;

    if (tester) {
      cardInfo = null;
    } else if (paymentSource === "card") {
      const { chargeCardPurchaseTx } = await import("./creditCardService");
      const result = await chargeCardPurchaseTx(tx, userId, item.price, {
        type: "shop_purchase",
        itemName: item.name,
        guildId,
      });
      cardInfo = result.card;
    } else {
      await tx.wallet.update({
        where: { id: user.wallet.id },
        data: { balance: { decrement: item.price } }
      });
      await tx.transaction.create({
        data: {
          walletId: user.wallet.id,
          amount: -item.price,
          type: "shop_buy",
          meta: { itemName: item.name },
          isEarned: false
        }
      });
    }

    if (item.stock !== -1 && !tester) {
      await tx.shopItem.update({
        where: { id: item.id },
        data: { stock: { decrement: 1 } }
      });
    }

    await tx.inventory.upsert({
      where: { userId_shopItemId: { userId: user.discordId, shopItemId: item.id } },
      create: {
        userId: user.discordId,
        shopItemId: item.id,
        amount: 1,
        meta: metaData
      },
      update: { amount: { increment: 1 } }
    });

    const buyEffects = ((item.effects as any) || []).filter((e: any) => e.trigger === "BUY");

    return { item, buyEffects, paymentSource, cardInfo };
  });

  // Quest progress
  const { questBus } = require("./questEvents");
  questBus.emit("economy:shop_buy", { discordId: userId, paymentSource: res.paymentSource });

  // If user just bought a rifle upgrade, clear the hunt cooldown so the new tier takes effect immediately
  const purchasedRifleName = res.item.name.toLowerCase();
  const purchasedRifleIndex = RIFLE_PRIORITY.indexOf(purchasedRifleName as any);
  if (purchasedRifleIndex !== -1) {
    try {
      const redis = redisService.getInstance();
      const huntKey = `hunt:${userId}`;
      const existing = await redis.ttl(huntKey);
      if (existing > 0) {
        // Only clear if user already owns a worse rifle (lower priority = higher index in RIFLE_PRIORITY)
        const inventory = await prisma.inventory.findMany({
          where: { userId },
          include: { shopItem: true },
        });
        const ownedRifleNames = inventory
          .filter((i) => i.shopItem.category === "HUNT" && i.shopItem.itemType === "EQUIPMENT")
          .map((i) => i.shopItem.name.toLowerCase());
        const bestOwnedIndex = Math.min(...ownedRifleNames.map((n) => {
          const idx = RIFLE_PRIORITY.indexOf(n as any);
          return idx === -1 ? 999 : idx;
        }));
        // purchased rifle is better (lower index) than whatever set the cooldown → reset
        if (purchasedRifleIndex < bestOwnedIndex) {
          await redis.del(huntKey);
        }
      }
    } catch {
      // Non-critical
    }
  }

  // Apply Effects AFTER transaction creates the purchase
  // This prevents transaction timeouts if Discord API is slow (e.g. giving roles)
  let results: ItemEffectResult[] = [];
  if (res.buyEffects.length > 0) {
    try {
      results = await applyItemEffects(userId, guildId, res.buyEffects, member);
    } catch (err) {
      console.error("Failed to apply on-buy effects:", err);
      // We don't throw here because the purchase was successful
      results.push({
        message: `${Mascot.Emotes.Fail} Item bought, but some effects failed to apply.`,
        type: "ERROR"
      });
    }
  }

  return {
    item: res.item,
    results,
    cardInfo: res.cardInfo ?? null,
    paymentSource: res.paymentSource,
  };
}

export async function useItem(userId: string, guildId: string, itemName: string, member?: GuildMember) {
  const user = await (prisma.user.findUnique as any)({
    where: { discordId: userId }
  });

  if (!user) throw new Error("User not found.");

  const inventoryItems = await prisma.inventory.findMany({
    where: { userId: user.discordId },
    include: { shopItem: true },
    orderBy: { shopItem: { name: 'asc' } }
  }) as any[];

  let targetInvItem;

  // 2. CHECK: Is input a Number? (Use by Index)
  const index = parseInt(itemName);
  if (!isNaN(index) && index > 0 && index <= inventoryItems.length) {
    // 1-based index
    targetInvItem = inventoryItems[index - 1];
  } else {
    // 3. Search by Name (Exact -> StartsWith/Partial)
    const normalize = (str: string) => str.trim().toLowerCase().replace(/\s+/g, " ");
    const search = normalize(itemName);

    // A. Exact Match
    targetInvItem = inventoryItems.find(i => normalize(i.shopItem.name) === search && i.amount > 0);

    // B. Partial Match (Starts With) - if no exact match
    if (!targetInvItem) {
      targetInvItem = inventoryItems.find(i => normalize(i.shopItem.name).startsWith(search) && i.amount > 0);
    }
  }

  if (!targetInvItem) {
    throw new Error(`You don't own an item matching "**${itemName}**".`);
  }

  const item = targetInvItem.shopItem;

  // 4. STRICT CONSUMABLE CHECK
  // ONLY items marked as "consumable" (Usable toggle) can be used.
  if (!item.usable) {
    throw new Error(`**${item.name}** is not usable.`);
  }

  // Reload inventory item to get a focused object for updates (though targetInvItem is valid)
  const inventoryItem = targetInvItem;

  if (member && member.client) {
    const guild = await member.client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await logToChannel(member.client, {
        guild,
        type: "ECONOMY",
        title: "Item Used",
        description: `<@${userId}> used **${item.name}**`,
        color: Colors.Blue,
        thumbnail: member.user.displayAvatarURL()
      });
    }
  }

  // Apply effects
  const allEffects = (item.effects as any) as ItemEffect[] || [];
  const effectsToApply = allEffects.filter(e => !e.trigger || e.trigger === "USE");
  const results = await applyItemEffects(userId, guildId, effectsToApply, member);

  // Decrease or remove from inventory if consumable OR usable
  if (item.consumable || item.usable) {
    // Robust Fix: Re-fetch inventory to get live amount after potential async delays in effects
    const freshInv = await prisma.inventory.findUnique({
      where: { id: inventoryItem.id }
    });

    if (freshInv) {
      if (freshInv.amount <= 1) {
        await prisma.inventory.delete({
          where: { id: freshInv.id }
        });
      } else {
        await prisma.inventory.update({
          where: { id: freshInv.id },
          data: { amount: { decrement: 1 } }
        });
      }
    }
  }

  return { item, results };
}

export async function getUserInventory(discordId: string, _guildId?: string) {
  return prisma.inventory.findMany({
    where: { userId: discordId },
    include: { shopItem: true },
    orderBy: { shopItem: { name: 'asc' } }
  }) as any;
}

const seededCategories = new Set<string>();

async function upsertCatalogItems(items: ShopCatalogItem[]) {
  for (const item of items) {
    await prisma.shopItem.upsert({
      where: { catalogKey: item.key },
      create: {
        catalogKey: item.key,
        guildId: GLOBAL_CATALOG_GUILD_ID,
        name: item.name,
        price: item.price,
        description: item.description,
        stock: -1,
        itemType: item.itemType,
        effects: item.effects as any,
        consumable: item.consumable,
        usable: item.usable,
        category: item.category,
      },
      update: {
        name: item.name,
        price: item.price,
        description: item.description,
        itemType: item.itemType,
        effects: item.effects as any,
        consumable: item.consumable,
        usable: item.usable,
        category: item.category,
      },
    });
  }
}

export async function seedGeneralShop(_guildId?: string) {
  if (seededCategories.has("GENERAL")) return;
  await upsertCatalogItems(GENERAL_SHOP_CATALOG);
  seededCategories.add("GENERAL");
}

export async function seedJobShop(_guildId?: string) {
  if (seededCategories.has("JOB")) return;
  await upsertCatalogItems(JOB_SHOP_CATALOG);
  seededCategories.add("JOB");
}

export async function seedHuntShop(_guildId?: string) {
  if (seededCategories.has("HUNT")) return;
  await upsertCatalogItems(HUNT_SHOP_CATALOG);
  seededCategories.add("HUNT");
}

export async function seedUniShop(_guildId?: string) {
  if (seededCategories.has("UNI")) return;
  await upsertCatalogItems(UNI_SHOP_CATALOG);
  seededCategories.add("UNI");
}

export async function seedCockShop(_guildId?: string) {
  if (seededCategories.has("COCK")) return;
  await upsertCatalogItems([...COCK_SHOP_CATALOG, ...COCK_SYSTEM_ITEMS]);
  seededCategories.add("COCK");
}

export async function seedCosmeticsShop(_guildId?: string) {
  if (seededCategories.has("COSMETICS")) return;
  await upsertCatalogItems(COSMETICS_SHOP_CATALOG);
  seededCategories.add("COSMETICS");
}
