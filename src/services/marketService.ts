import prisma from "../utils/prisma";
import { addBalance } from "./walletService";
import { applyGarnishment } from "./creditCardService";
import { questBus } from "./questEvents";
import { findCatalogEntry } from "./shopService";
import { unequipChickenGear } from "./shopItemEffects";

const SELLER_FEE_PCT = 10;
const BUYER_FEE_PCT = 5;
const MAX_ACTIVE_LISTINGS = 5;
const LISTING_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PRICE = 1_000;
const MAX_PRICE = 50_000_000;

export function calculateFees(listedPrice: number) {
  const buyerFee = Math.ceil(listedPrice * BUYER_FEE_PCT / 100);
  const sellerFee = Math.floor(listedPrice * SELLER_FEE_PCT / 100);
  return {
    listedPrice,
    buyerTotal: listedPrice + buyerFee,
    sellerPayout: listedPrice - sellerFee,
    buyerFee,
    sellerFee,
    totalSink: buyerFee + sellerFee,
  };
}

type ResaleRow = { meta: unknown; shopItem: { name: string; catalogKey?: string | null } };

/**
 * Why an owned row can't be resold — listed on the Black Market or quick sold
 * for wallet cash — or null. One rule for both exits so they can't drift apart.
 */
export function resaleBlockReason(row: ResaleRow): string | null {
  // Card-exclusive items are earned on credit; reselling them for wallet coins
  // would hand them to players with no card at all, or turn credit into cash.
  if (findCatalogEntry(row.shopItem)?.requiresCardTier) {
    return `**${row.shopItem.name}** is card-exclusive and cannot be resold.`;
  }
  // Unique rows (the chicken: level/trait meta) are non-transferable. Selling
  // one destroys it, and the starter chicken is then regranted with a new trait.
  const meta = row.meta as any;
  if (meta?.level !== undefined || meta?.trait !== undefined) {
    return `**${row.shopItem.name}** is unique and cannot be resold.`;
  }
  return null;
}

export async function listItem(discordId: string, shopItemId: string, amount: number, totalPrice: number) {
  if (amount <= 0) throw new Error("Amount must be positive.");
  if (!Number.isInteger(totalPrice) || totalPrice < MIN_PRICE) throw new Error(`Minimum listing price is **${MIN_PRICE.toLocaleString()}** coins.`);
  if (totalPrice > MAX_PRICE) throw new Error(`Maximum listing price is **${MAX_PRICE.toLocaleString()}** coins.`);

  const activeCount = await prisma.marketListing.count({ where: { sellerId: discordId } });
  if (activeCount >= MAX_ACTIVE_LISTINGS) {
    throw new Error(`You can only have **${MAX_ACTIVE_LISTINGS}** active listings. Cancel one to list more.`);
  }

  const inventoryItem = await prisma.inventory.findUnique({
    where: { userId_shopItemId: { userId: discordId, shopItemId } },
    include: { shopItem: true },
  });

  if (!inventoryItem || inventoryItem.amount < amount) {
    throw new Error("You don't have enough of this item.");
  }

  const blocked = resaleBlockReason(inventoryItem);
  if (blocked) throw new Error(blocked);

  const itemName = inventoryItem.shopItem?.name ?? "Unknown";

  await prisma.$transaction(async (tx) => {
    // The amount read above is stale by now (a concurrent listing, sale or use
    // may have taken units), so the decrement itself must be guarded.
    const taken = await tx.inventory.updateMany({
      where: { id: inventoryItem.id, amount: { gte: amount } },
      data: { amount: { decrement: amount } },
    });
    if (taken.count !== 1) throw new Error("You don't have enough of this item.");
    const emptied = await tx.inventory.deleteMany({ where: { id: inventoryItem.id, amount: { lte: 0 } } });
    // Listed the last one: it can't stay on the chicken.
    if (emptied.count > 0) await unequipChickenGear(discordId, inventoryItem.shopItem, tx);

    await tx.marketListing.create({
      data: {
        sellerId: discordId,
        shopItemId,
        amount,
        totalPrice,
        expiresAt: new Date(Date.now() + LISTING_DURATION_MS),
      },
    });
  });

  questBus.emit("economy:market_sell", { discordId });
  return { itemName, amount, totalPrice, fees: calculateFees(totalPrice) };
}

export async function buyListing(buyerDiscordId: string, listingId: string) {
  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    include: { shopItem: true },
  });

  if (!listing) throw new Error("Listing not found or already sold.");
  if (new Date() >= listing.expiresAt) throw new Error("This listing has expired.");
  if (listing.sellerId === buyerDiscordId) throw new Error("You cannot buy your own listing.");
  if (!listing.shopItemId || !listing.shopItem) throw new Error("Invalid listing.");

  const fees = calculateFees(listing.totalPrice);
  const buyerWallet = await prisma.wallet.findUnique({ where: { userId: buyerDiscordId } });
  if (!buyerWallet || buyerWallet.balance < fees.buyerTotal) {
    throw new Error(`Insufficient funds. Need **${fees.buyerTotal.toLocaleString()}** (${listing.totalPrice.toLocaleString()} + ${fees.buyerFee.toLocaleString()} fee). You have **${(buyerWallet?.balance ?? 0).toLocaleString()}**.`);
  }

  const itemName = listing.shopItem.name;

  await prisma.$transaction(async (tx) => {
    // Race condition protection: atomic delete with count check
    const deleted = await tx.marketListing.deleteMany({
      where: { id: listingId },
    });
    if (deleted.count === 0) throw new Error("Listing was already purchased or cancelled.");

    // Deduct from buyer (full price + buyer fee). The balance read above is
    // stale by now, so the debit itself is guarded; a miss rolls the sale back.
    const debited = await tx.wallet.updateMany({
      where: { id: buyerWallet.id, balance: { gte: fees.buyerTotal } },
      data: { balance: { decrement: fees.buyerTotal } },
    });
    if (debited.count !== 1) throw new Error(`Insufficient funds. Need **${fees.buyerTotal.toLocaleString()}** coins.`);

    await tx.transaction.create({
      data: {
        walletId: buyerWallet.id,
        amount: -fees.buyerTotal,
        type: "market_buy",
        meta: { listingId, itemName, sellerFee: fees.sellerFee, buyerFee: fees.buyerFee },
        isEarned: false,
      },
    });

    // Credit seller (listed price - seller fee)
    const sellerWallet = await tx.wallet.findUnique({ where: { userId: listing.sellerId } });
    if (sellerWallet) {
      await tx.wallet.update({
        where: { id: sellerWallet.id },
        data: { balance: { increment: fees.sellerPayout } },
      });
      await tx.transaction.create({
        data: {
          walletId: sellerWallet.id,
          amount: fees.sellerPayout,
          type: "market_sale",
          meta: { listingId, itemName, sellerFee: fees.sellerFee },
          isEarned: true,
        },
      });
    }

    // Transfer item to buyer
    const existingInv = await tx.inventory.findUnique({
      where: { userId_shopItemId: { userId: buyerDiscordId, shopItemId: listing.shopItemId! } },
    });
    if (existingInv) {
      await tx.inventory.update({
        where: { id: existingInv.id },
        data: { amount: { increment: listing.amount } },
      });
    } else {
      await tx.inventory.create({
        data: {
          userId: buyerDiscordId,
          shopItemId: listing.shopItemId!,
          amount: listing.amount,
        },
      });
    }
  });

  // Garnishment: apply AFTER transaction succeeds (seller payout is earned income)
  let garnished = 0;
  try {
    garnished = (await applyGarnishment(listing.sellerId, fees.sellerPayout)).garnished;
    if (garnished > 0) {
      await prisma.wallet.update({
        where: { userId: listing.sellerId },
        data: { balance: { decrement: garnished } },
      });
    }
  } catch { /* Card service unavailable — skip */ }

  questBus.emit("economy:market_buy", { discordId: buyerDiscordId });
  return { itemName, amount: listing.amount, fees, sellerId: listing.sellerId, totalPrice: listing.totalPrice, garnished };
}

export async function cancelListing(discordId: string, listingId: string) {
  const listing = await prisma.marketListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found.");
  if (listing.sellerId !== discordId) throw new Error("You don't own this listing.");

  await prisma.$transaction(async (tx) => {
    if (listing.shopItemId) {
      const existingInv = await tx.inventory.findUnique({
        where: { userId_shopItemId: { userId: discordId, shopItemId: listing.shopItemId } },
      });
      if (existingInv) {
        await tx.inventory.update({
          where: { id: existingInv.id },
          data: { amount: { increment: listing.amount } },
        });
      } else {
        await tx.inventory.create({
          data: {
            userId: discordId,
            shopItemId: listing.shopItemId,
            amount: listing.amount,
          },
        });
      }
    }

    await tx.marketListing.delete({ where: { id: listingId } });
  });

  return { success: true };
}

export async function getListings(page: number = 1, pageSize: number = 5) {
  const now = new Date();
  const skip = (page - 1) * pageSize;
  const [listings, total] = await prisma.$transaction([
    prisma.marketListing.findMany({
      where: { expiresAt: { gt: now } },
      include: { shopItem: true, seller: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.marketListing.count({ where: { expiresAt: { gt: now } } }),
  ]);
  return { listings, total, totalPages: Math.ceil(total / pageSize) };
}

export async function getUserListings(discordId: string) {
  return prisma.marketListing.findMany({
    where: { sellerId: discordId },
    include: { shopItem: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUserInventoryForSale(discordId: string) {
  const items = await prisma.inventory.findMany({
    where: { userId: discordId, amount: { gte: 1 } },
    include: { shopItem: true },
  });
  // Leave out anything listItem would refuse (chickens, card-exclusives, ...)
  return items.filter((i) => !resaleBlockReason(i));
}

export async function expireOldListings(): Promise<number> {
  const now = new Date();
  const expired = await prisma.marketListing.findMany({
    where: { expiresAt: { lte: now } },
  });

  let count = 0;
  for (const listing of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        if (listing.shopItemId) {
          const existingInv = await tx.inventory.findUnique({
            where: { userId_shopItemId: { userId: listing.sellerId, shopItemId: listing.shopItemId } },
          });
          if (existingInv) {
            await tx.inventory.update({
              where: { id: existingInv.id },
              data: { amount: { increment: listing.amount } },
            });
          } else {
            await tx.inventory.create({
              data: {
                userId: listing.sellerId,
                shopItemId: listing.shopItemId,
                amount: listing.amount,
              },
            });
          }
        }
        await tx.marketListing.delete({ where: { id: listing.id } });
      });
      count++;
    } catch (e) {
      console.error(`Failed to expire listing ${listing.id}:`, e);
    }
  }
  return count;
}
