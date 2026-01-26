import prisma from "../utils/prisma";
import { GuildMember } from "discord.js";
import { applyItemEffects, ItemEffect, ItemEffectResult } from "./effectService";
import { logToChannel } from "../utils/discordLogger";
import { Colors } from "discord.js";
import { Mascot } from "../config/branding";

export async function resetShop(guildId: string, category: string = "GENERAL") {
  return prisma.shopItem.deleteMany({
    where: { guildId, category }
  });
}

export async function getShopItems(guildId: string, category: string = "GENERAL") {
  return prisma.shopItem.findMany({ where: { guildId, category } });
}

export async function getShopItemByName(guildId: string, name: string) {
  return prisma.shopItem.findFirst({
    where: {
      guildId,
      name: { equals: name, mode: "insensitive" }
    }
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
      guildId,
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

export async function buyItem(guildId: string, userId: string, identifier: string, member?: GuildMember, byId: boolean = false) {
  let item;

  if (byId) {
    item = await prisma.shopItem.findUnique({
      where: { id: identifier }
    });
  } else {
    item = await prisma.shopItem.findFirst({
      where: {
        guildId,
        name: { equals: identifier, mode: "insensitive" }
      }
    });
  }

  if (!item) throw new Error("Item not found.");
  if (item.stock !== -1 && item.stock <= 0) throw new Error("Out of stock.");

  const res = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { discordId_guildId: { discordId: userId, guildId } },
      include: { wallet: true, bank: true }
    });

    if (!user || !user.wallet || user.wallet.balance < item.price) {
      throw new Error(`You need ${item.price} coins to buy this.`);
    }

    // --- REQUIREMENTS CHECK ---
    const reqs = (item.requirements as any) || {};

    // 1. Minimum Balance
    if (reqs.balance && user.wallet.balance < reqs.balance) {
      throw new Error(`You need a wallet balance of ${reqs.balance} to buy this.`);
    }

    // 2. Minimum Net Worth (Wallet + Bank)
    if (reqs.netWorth) {
      const netWorth = user.wallet.balance + (user.bank?.balance || 0);
      if (netWorth < reqs.netWorth) {
        throw new Error(`You need a net worth of ${reqs.netWorth} to buy this.`);
      }
    }

    // 3. Required Roles (Allow List)
    if (reqs.roles && reqs.roles.length > 0) {
      if (!member) throw new Error("Could not verify role requirements.");
      const hasRole = reqs.roles.some((roleId: string) => member.roles.cache.has(roleId));
      if (!hasRole) {
        throw new Error(`You don't have the required role to buy this.`);
      }
    }

    // 4. Deny Roles (Block List)
    if (reqs.denyRoles && reqs.denyRoles.length > 0) {
      if (member) {
        const hasDenyRole = reqs.denyRoles.some((roleId: string) => member.roles.cache.has(roleId));
        if (hasDenyRole) {
          throw new Error(`You cannot buy this item with your current roles.`);
        }
      }
    }

    // 5. Required Items
    if (reqs.items && reqs.items.length > 0) {
      // Need to check inventory
      // Use filtered check to avoid fetching everything?
      // Or just fetch specific items?
      // Let's simplify and fetch user's inventory count for these items.
      // reqs.items is array of NAMES or IDs? The editor saves NAMES (string input). 
      // Logic: Find ShopItem by name -> Check Inventory.
      // This is expensive if loop.
      // Alternative: Fetch all user inventory and check names.
      const userInv = await tx.inventory.findMany({
        where: { userId: user.id },
        include: { shopItem: true }
      });

      for (const reqItemName of reqs.items) {
        const hasItem = userInv.some(i => i.shopItem.name.toLowerCase() === reqItemName.toLowerCase() && i.amount > 0);
        if (!hasItem) {
          throw new Error(`You need the item "**${reqItemName}**" to buy this.`);
        }
      }
    }

    let metaData: any = {};

    // CHECK: Limit "Chicken" to 1 per person & Generate Trait
    if (item.name.toLowerCase() === "chicken") {
      const existingInfo = await tx.inventory.findUnique({
        where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } }
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

    await tx.wallet.update({
      where: { id: user.wallet.id },
      data: { balance: { decrement: item.price } }
    });

    if (item.stock !== -1) {
      await tx.shopItem.update({
        where: { id: item.id },
        data: { stock: { decrement: 1 } }
      });
    }

    // Always add to inventory
    await tx.inventory.upsert({
      where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
      create: {
        guildId,
        userId: user.id,
        shopItemId: item.id,
        amount: 1,
        meta: metaData
      },
      update: { amount: { increment: 1 } }
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

    // Extract "On Buy" effects to return them, DO NOT apply them inside transaction to wait for Discord API
    const buyEffects = ((item.effects as any) || []).filter((e: any) => e.trigger === "BUY");

    return { item, buyEffects };
  });

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

  return { item: res.item, results };
}

export async function useItem(userId: string, guildId: string, itemName: string, member?: GuildMember) {
  // 1. Check Inventory FIRST to ensure we find the item the user actually has.
  //    This fixes issues where shop items might be hidden/renamed but user still owns them.
  const user = await prisma.user.findUnique({
    where: { discordId_guildId: { discordId: userId, guildId } }
  });

  if (!user) throw new Error("User not found.");

  // We find the inventory item by finding ANY item in their inventory that matches the name
  // This is a bit tricky because we store shopItemId, not name in inventory.
  // So we fetch their inventory and filter in JS (safest) or search shopItems first?
  // Search shopItems first is standard, but if "item not found" is the error, maybe `getShopItemByName` failing?
  // Let's try to find the item in their inventory directly if possible.

  // 1. Fetch Inventory with DETERMINISTIC sorting (Alphabetical)
  // This matches !inv and allows "use by number" to work consistently.
  const inventoryItems = await prisma.inventory.findMany({
    where: { userId: user.id },
    include: { shopItem: true },
    orderBy: { shopItem: { name: 'asc' } }
  });

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
  const shouldConsume = item.consumable || item.usable;
  console.log(`[ShopService] processing consumption for item '${item.name}' (ID: ${item.id}). Usable=${item.usable}, Consumable=${item.consumable} -> Should Consume? ${shouldConsume}`);

  if (shouldConsume) {
    // Robust Fix: Re-fetch inventory to get live amount after potential async delays in effects
    console.log(`[ShopService] Re-fetching inventory item ${inventoryItem.id} for consumption...`);
    const freshInv = await prisma.inventory.findUnique({
      where: { id: inventoryItem.id }
    });

    if (freshInv) {
      console.log(`[ShopService] Fresh Amount: ${freshInv.amount}`);
      if (freshInv.amount <= 1) {
        console.log(`[ShopService] Deleting inventory item ${freshInv.id} (Amount <= 1)`);
        await prisma.inventory.delete({
          where: { id: freshInv.id }
        });
        console.log(`[ShopService] Item deleted.`);
      } else {
        console.log(`[ShopService] Decrementing inventory item ${freshInv.id} (Amount > 1)`);
        await prisma.inventory.update({
          where: { id: freshInv.id },
          data: { amount: { decrement: 1 } }
        });
        console.log(`[ShopService] Item decremented.`);
      }
    } else {
      console.log(`[ShopService] Item ${inventoryItem.id} NOT FOUND during re-fetch. It may have been removed by an effect or concurrent process.`);
    }
  } else {
    console.log(`[ShopService] Item ${item.name} is configured as NOT consumable and NOT usable (logic-wise). Skipping deletion.`);
  }

  return { item, results };
}

export async function getUserInventory(discordId: string, guildId: string) {
  const user = await prisma.user.findUnique({
    where: { discordId_guildId: { discordId, guildId } }
  });

  if (!user) return [];

  return prisma.inventory.findMany({
    where: {
      guildId,
      userId: user.id
    },
    include: { shopItem: true },
    orderBy: {
      shopItem: {
        name: 'asc'
      }
    }
  });
}