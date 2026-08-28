import prisma from "../utils/prisma";
import { GuildMember } from "discord.js";
import { applyItemEffects, ItemEffect, ItemEffectResult, ItemEffectSource } from "./effectService";
import { logToChannel } from "../utils/discordLogger";
import { Colors } from "discord.js";
import { Mascot } from "../config/branding";
import { GENERAL_SHOP_CATALOG, HUNT_SHOP_CATALOG, JOB_SHOP_CATALOG, UNI_SHOP_CATALOG, COCK_SHOP_CATALOG, COCK_SYSTEM_ITEMS, COSMETICS_SHOP_CATALOG, SHOP_CATALOG } from "../utils/shopCatalog";
import { RIFLE_PRIORITY } from "../utils/animalCatalog";
import { redisService } from "./redisService";
import { isTester } from "../utils/developerAccess";
import { ensureUserAndWallet } from "./walletService";
import { GLOBAL_CATALOG_GUILD_ID, globalCatalogGuildFilter } from "../utils/globalCatalog";
import type { ShopCatalogItem } from "../utils/shopCatalog";
import { LOADED_DICE_ITEM_KEY } from "../utils/loadedDiceConfig";
import { STARTER_CHICKEN_ITEM_KEY } from "../utils/chickenConfig";

function getItemEffectSource(item: { catalogKey?: string | null; name: string; emoji?: string | null }): ItemEffectSource {
  const catalog = SHOP_CATALOG.find((entry) => entry.key === item.catalogKey || entry.name.toLowerCase() === item.name.toLowerCase());
  return {
    key: item.catalogKey ?? catalog?.key,
    name: item.name,
    emojiKey: catalog?.asset ?? item.catalogKey ?? undefined,
    emoji: item.emoji ?? undefined,
  };
}

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

/** Hard ceiling on one bulk purchase, so a fat-fingered `!buy 99999999 x` can't drain a wallet. */
export const MAX_BULK_QUANTITY = 100;

/**
 * Which items may be bought more than one at a time.
 *
 * Deliberately narrow: plain stackable consumables with nothing that fires on
 * purchase. A zoo needs up to 38 feed units a day, so buying feed one command
 * at a time is not a usable upkeep economy — but bulk must not silently
 * multiply a BUY effect (which is applied once per purchase, not once per
 * unit) or blow past a catalog `maxStack`. Anything the catalog doesn't know
 * about (an admin-created ShopItem) stays one-at-a-time by default.
 */
export function isBulkBuyable(catalogKey: string | null | undefined): boolean {
  const catalog = SHOP_CATALOG.find((c) => c.key === catalogKey);
  if (!catalog) return false;
  if (!catalog.consumable) return false;
  if (catalog.maxStack !== undefined) return false;
  return !(catalog.effects ?? []).some((e) => e.trigger === "BUY");
}

export async function buyItem(guildId: string, userId: string, identifier: string, member?: GuildMember, byId: boolean = false, paymentSource: "wallet" | "card" = "wallet", quantity: number = 1) {
  const tester = isTester(userId, member);
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty < 1) throw new Error("Quantity must be a whole number of at least 1.");
  if (qty > MAX_BULK_QUANTITY) throw new Error(`You can buy at most **${MAX_BULK_QUANTITY}** of an item in one command.`);
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
  if (item.catalogKey === STARTER_CHICKEN_ITEM_KEY || item.name.toLowerCase() === "chicken") {
    throw new Error("Every player receives a chicken automatically. Use `chicken` to view yours.");
  }
  if (qty > 1 && !isBulkBuyable(item.catalogKey)) {
    throw new Error(`**${item.name}** can only be bought one at a time.`);
  }
  if (item.stock !== -1 && item.stock < qty && !tester) {
    throw new Error(item.stock <= 0 ? "Out of stock." : `Only **${item.stock}** left in stock.`);
  }

  const totalPrice = item.price * qty;

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
    } else if (user.wallet.balance < totalPrice && !tester) {
      throw new Error(
        qty > 1
          ? `You need ${totalPrice.toLocaleString("en-US")} coins to buy ${qty}x ${item.name}.`
          : `You need ${totalPrice.toLocaleString("en-US")} coins to buy this.`,
      );
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

    const isLoadedDice = item.catalogKey === LOADED_DICE_ITEM_KEY
      || item.name.toLowerCase() === "loaded dice of ruin";

    if (isLoadedDice) {
      const existingDice = await tx.inventory.findUnique({
        where: { userId_shopItemId: { userId: user.discordId, shopItemId: item.id } },
      });
      if (existingDice && existingDice.amount > 0) {
        throw new Error("You can only own one Loaded Dice of Ruin at a time.");
      }
      metaData = {
        rollCount: 0,
        acquiredAt: new Date().toISOString(),
      };
    }

    let cardInfo: any = null;

    if (tester) {
      cardInfo = null;
    } else if (paymentSource === "card") {
      const { chargeCardPurchaseTx } = await import("./creditCardService");
      const result = await chargeCardPurchaseTx(tx, userId, totalPrice, {
        type: "shop_purchase",
        itemName: item.name,
        quantity: qty,
        guildId,
      });
      cardInfo = result.card;
    } else {
      await tx.wallet.update({
        where: { id: user.wallet.id },
        data: { balance: { decrement: totalPrice } }
      });
      await tx.transaction.create({
        data: {
          walletId: user.wallet.id,
          amount: -totalPrice,
          type: "shop_buy",
          meta: { itemName: item.name, quantity: qty },
          isEarned: false
        }
      });
    }

    if (item.stock !== -1 && !tester) {
      await tx.shopItem.update({
        where: { id: item.id },
        data: { stock: { decrement: qty } }
      });
    }

    await tx.inventory.upsert({
      where: { userId_shopItemId: { userId: user.discordId, shopItemId: item.id } },
      create: {
        userId: user.discordId,
        shopItemId: item.id,
        amount: qty,
        meta: metaData
      },
      update: { amount: { increment: qty } }
    });

    // Applied once per purchase, not once per unit — which is exactly why
    // isBulkBuyable refuses bulk on any item that has one.
    const buyEffects = ((item.effects as any) || []).filter((e: any) => e.trigger === "BUY");

    return { item, buyEffects, paymentSource, cardInfo };
  });

  // Quest progress. Dynamic `import`, not `require`: the same deferred-load
  // trick the creditCardService import below uses, and the only form that
  // resolves under both ts-node (CJS) and the vitest/vite ESM loader — a bare
  // `require` here made buyItem untestable.
  const { questBus } = await import("./questEvents");
  questBus.emit("economy:shop_buy", { discordId: userId, paymentSource: res.paymentSource });

  // If user just bought a rifle upgrade, clear the hunt cooldown so the new tier takes effect immediately
  let rifle: { isNewBest: boolean; cooldownCleared: boolean; activeRifleName: string } | null = null;
  const purchasedRifleName = res.item.name.toLowerCase();
  const purchasedRifleIndex = RIFLE_PRIORITY.indexOf(purchasedRifleName as any);
  if (purchasedRifleIndex !== -1) {
    try {
      // Inventory already contains the just-bought rifle (upserted in the
      // transaction above), so exclude that one copy to compare against what
      // the player owned BEFORE this purchase.
      const inventory = await prisma.inventory.findMany({
        where: { userId },
        include: { shopItem: true },
      });
      const ownedBeforeIndices = inventory
        .filter((i) => i.shopItem.category === "HUNT" && i.shopItem.itemType === "EQUIPMENT")
        .flatMap((i) => {
          const idx = RIFLE_PRIORITY.indexOf(i.shopItem.name.toLowerCase() as any);
          if (idx === -1) return [];
          const countBefore = i.shopItemId === res.item.id ? i.amount - qty : i.amount;
          return countBefore > 0 ? [idx] : [];
        });
      const bestBeforeIndex = ownedBeforeIndices.length > 0 ? Math.min(...ownedBeforeIndices) : Infinity;
      // Lower index = better rifle; hunts always auto-use the best owned rifle.
      const isNewBest = purchasedRifleIndex < bestBeforeIndex;
      const activeRifleName = RIFLE_PRIORITY[Math.min(purchasedRifleIndex, bestBeforeIndex)];

      let cooldownCleared = false;
      if (isNewBest) {
        const redis = redisService.getInstance();
        const huntKey = `hunt:${userId}`;
        if ((await redis.ttl(huntKey)) > 0) {
          await redis.del(huntKey);
          cooldownCleared = true;
          // The queued "hunt ready" DM is now stale — the cooldown no longer exists.
          const { cancelReminder } = await import("./cooldownReminderService");
          await cancelReminder(userId, "hunt");
        }
      }
      rifle = { isNewBest, cooldownCleared, activeRifleName };
    } catch (err) {
      // Non-critical — the purchase itself succeeded.
      console.error("Rifle purchase hunt-cooldown reset failed:", err);
    }
  }

  // Apply Effects AFTER transaction creates the purchase
  // This prevents transaction timeouts if Discord API is slow (e.g. giving roles)
  let results: ItemEffectResult[] = [];
  if (res.buyEffects.length > 0) {
    try {
      results = await applyItemEffects(userId, guildId, res.buyEffects, member, getItemEffectSource(res.item));
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
    rifle,
    quantity: qty,
    totalPrice,
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

  if (item.catalogKey === LOADED_DICE_ITEM_KEY || item.name.toLowerCase() === "loaded dice of ruin") {
    throw new Error("The Loaded Dice of Ruin is rolled with the `roll` command, not `use`.");
  }

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
  const results = await applyItemEffects(userId, guildId, effectsToApply, member, getItemEffectSource(item));

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
