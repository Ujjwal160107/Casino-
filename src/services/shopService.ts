import prisma from "../utils/prisma";
import { GuildMember } from "discord.js";
import { applyItemEffects, ItemEffect } from "./effectService";
import { logToChannel } from "../utils/discordLogger";
import { Colors } from "discord.js";

export async function getShopItems(guildId: string) {
  return prisma.shopItem.findMany({ where: { guildId } });
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
  consumable?: boolean
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
      consumable: consumable || false
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

export async function buyItem(guildId: string, userId: string, itemName: string, member?: GuildMember) {
  const item = await prisma.shopItem.findFirst({
    where: {
      guildId,
      name: { equals: itemName, mode: "insensitive" }
    }
  });

  if (!item) throw new Error("Item not found.");
  if (item.stock !== -1 && item.stock <= 0) throw new Error("Out of stock.");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { discordId_guildId: { discordId: userId, guildId } },
      include: { wallet: true }
    });

    if (!user || !user.wallet || user.wallet.balance < item.price) {
      throw new Error(`You need ${item.price} coins to buy this.`);
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

    return item;
  });
}

export async function useItem(userId: string, guildId: string, itemName: string, member?: GuildMember) {
  const item = await getShopItemByName(guildId, itemName);
  if (!item) throw new Error("Item not found.");

  if (!item.consumable && !item.effects) {
    throw new Error("This item cannot be used.");
  }

  const user = await prisma.user.findUnique({
    where: { discordId_guildId: { discordId: userId, guildId } }
  });

  if (!user) throw new Error("User not found.");

  const inventoryItem = await prisma.inventory.findUnique({
    where: { userId_shopItemId: { userId: user.id, shopItemId: item.id } },
    include: { shopItem: true }
  });

  if (!inventoryItem || inventoryItem.amount <= 0) {
    throw new Error("You don't own this item.");
  }

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
  const effects = (item.effects as any) as ItemEffect[] || [];
  const results = await applyItemEffects(userId, guildId, effects, member);

  // Decrease or remove from inventory if consumable
  if (item.consumable) {
    if (inventoryItem.amount === 1) {
      await prisma.inventory.delete({
        where: { id: inventoryItem.id }
      });
    } else {
      await prisma.inventory.update({
        where: { id: inventoryItem.id },
        data: { amount: { decrement: 1 } }
      });
    }
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
    include: { shopItem: true }
  });
}