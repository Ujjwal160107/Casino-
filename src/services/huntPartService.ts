import prisma from "../utils/prisma";
import { ANIMAL_CATALOG, PART_VALUES, getAnimal } from "../utils/animalCatalog";
import { calculateFees } from "./marketService";
import { questBus } from "./questEvents";

const MAX_ACTIVE_PART_LISTINGS = 5;
const LISTING_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PRICE = 1_000;
const MAX_PRICE = 50_000_000;

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function titleCase(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPartName(partKey: string) {
  return titleCase(partKey);
}

export function speciesPartKey(animalKey: string, part: string) {
  return `${animalKey}_${part}`;
}

export function getPartInfo(partKey: string): { animalKey: string; genericPart: string; animalName: string; baseValue: number } | null {
  for (const animal of ANIMAL_CATALOG) {
    const prefix = `${animal.key}_`;
    if (!partKey.startsWith(prefix)) continue;
    const genericPart = partKey.slice(prefix.length);
    if (!animal.parts.includes(genericPart)) return null;
    return {
      animalKey: animal.key,
      genericPart,
      animalName: animal.name,
      baseValue: PART_VALUES[genericPart] ?? 0,
    };
  }
  return null;
}

export async function getAvailableSpeciesParts(userId: string, animalKey: string) {
  const animal = getAnimal(animalKey);
  if (!animal) throw new Error("Unknown animal type.");

  const caught = await prisma.caughtAnimal.findMany({
    where: { discordId: userId, animalKey, inZoo: false },
    orderBy: { caughtAt: "asc" },
  });

  const counts = new Map<string, number>();
  for (const row of caught) {
    const parts = Array.isArray(row.partsAvailable) ? row.partsAvailable as string[] : [];
    for (const part of parts) {
      const key = speciesPartKey(animalKey, part);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const parts = Array.from(counts.entries()).map(([partKey, amount]) => {
    const info = getPartInfo(partKey);
    return {
      partKey,
      partName: formatPartName(partKey),
      amount,
      baseValue: info?.baseValue ?? 0,
    };
  }).sort((a, b) => a.partName.localeCompare(b.partName));

  return { animal, totalAnimals: caught.length, parts };
}

export async function addHuntParts(userId: string, partKey: string, amount: number, tx: TxClient | typeof prisma = prisma) {
  if (amount <= 0) return;
  await tx.huntPartInventory.upsert({
    where: { userId_partKey: { userId, partKey } },
    create: { userId, partKey, amount },
    update: { amount: { increment: amount } },
  });
}

export async function getHuntParts(userId: string) {
  const rows = await prisma.huntPartInventory.findMany({
    where: { userId, amount: { gt: 0 } },
    orderBy: { partKey: "asc" },
  });

  return rows.map((row) => ({
    ...row,
    name: formatPartName(row.partKey),
  }));
}

export async function getHuntPartMap(userId: string) {
  const rows = await getHuntParts(userId);
  return new Map(rows.map((row) => [row.partKey, row.amount]));
}

export async function storeSpeciesPartsFromAnimals(userId: string, animalKey: string) {
  const animal = getAnimal(animalKey);
  if (!animal) throw new Error("Unknown animal type.");

  const caught = await prisma.caughtAnimal.findMany({
    where: { discordId: userId, animalKey, inZoo: false },
    orderBy: { caughtAt: "asc" },
  });

  if (caught.length === 0) throw new Error("No stored animals of this type are available.");

  const counts = new Map<string, number>();
  for (const row of caught) {
    const parts = Array.isArray(row.partsAvailable) ? row.partsAvailable as string[] : [];
    for (const part of parts) {
      const partKey = speciesPartKey(animalKey, part);
      counts.set(partKey, (counts.get(partKey) ?? 0) + 1);
    }
  }

  if (counts.size === 0) throw new Error("No harvestable parts are left on this animal group.");

  await prisma.$transaction(async (tx) => {
    for (const [partKey, amount] of counts.entries()) {
      await addHuntParts(userId, partKey, amount, tx);
    }

    await tx.caughtAnimal.deleteMany({
      where: { discordId: userId, animalKey, inZoo: false },
    });
  });

  return {
    animalName: animal.name,
    totalAnimals: caught.length,
    parts: Array.from(counts.entries())
      .map(([partKey, amount]) => ({ partKey, partName: formatPartName(partKey), amount }))
      .sort((a, b) => a.partName.localeCompare(b.partName)),
  };
}

export async function listPartFromInventory(userId: string, partKey: string, amount: number, totalPrice: number) {
  if (amount <= 0 || !Number.isInteger(amount)) throw new Error("Quantity must be a positive whole number.");
  if (!Number.isInteger(totalPrice) || totalPrice < MIN_PRICE) throw new Error(`Minimum listing price is **${MIN_PRICE.toLocaleString()}** coins.`);
  if (totalPrice > MAX_PRICE) throw new Error(`Maximum listing price is **${MAX_PRICE.toLocaleString()}** coins.`);

  const info = getPartInfo(partKey);
  if (!info) throw new Error("Unknown animal part.");

  const activeCount = await prisma.huntPartListing.count({ where: { sellerId: userId, expiresAt: { gt: new Date() } } });
  if (activeCount >= MAX_ACTIVE_PART_LISTINGS) {
    throw new Error(`You can only have **${MAX_ACTIVE_PART_LISTINGS}** active animal-part listings.`);
  }

  const inv = await prisma.huntPartInventory.findUnique({ where: { userId_partKey: { userId, partKey } } });
  if (!inv || inv.amount < amount) throw new Error(`You don't have enough **${formatPartName(partKey)}**.`);

  await prisma.$transaction(async (tx) => {
    if (inv.amount === amount) {
      await tx.huntPartInventory.delete({ where: { id: inv.id } });
    } else {
      await tx.huntPartInventory.update({
        where: { id: inv.id },
        data: { amount: { decrement: amount } },
      });
    }

    await tx.huntPartListing.create({
      data: {
        sellerId: userId,
        partKey,
        amount,
        totalPrice,
        expiresAt: new Date(Date.now() + LISTING_DURATION_MS),
      },
    });
  });

  questBus.emit("economy:market_sell", { discordId: userId });
  return { partName: formatPartName(partKey), amount, totalPrice, fees: calculateFees(totalPrice) };
}

export async function listSpeciesPartFromAnimals(userId: string, animalKey: string, partKey: string, amount: number, totalPrice: number) {
  if (amount <= 0 || !Number.isInteger(amount)) throw new Error("Quantity must be a positive whole number.");
  if (!Number.isInteger(totalPrice) || totalPrice < MIN_PRICE) throw new Error(`Minimum listing price is **${MIN_PRICE.toLocaleString()}** coins.`);
  if (totalPrice > MAX_PRICE) throw new Error(`Maximum listing price is **${MAX_PRICE.toLocaleString()}** coins.`);

  const info = getPartInfo(partKey);
  if (!info || info.animalKey !== animalKey) throw new Error("That part does not belong to this animal.");

  const activeCount = await prisma.huntPartListing.count({ where: { sellerId: userId, expiresAt: { gt: new Date() } } });
  if (activeCount >= MAX_ACTIVE_PART_LISTINGS) {
    throw new Error(`You can only have **${MAX_ACTIVE_PART_LISTINGS}** active animal-part listings.`);
  }

  await prisma.$transaction(async (tx) => {
    const animals = await tx.caughtAnimal.findMany({
      where: { discordId: userId, animalKey, inZoo: false },
      orderBy: { caughtAt: "asc" },
    });

    let remaining = amount;
    for (const animal of animals) {
      if (remaining <= 0) break;
      const parts = Array.isArray(animal.partsAvailable) ? [...animal.partsAvailable as string[]] : [];
      let removedFromAnimal = 0;

      for (let i = parts.length - 1; i >= 0 && remaining > 0; i--) {
        if (parts[i] !== info.genericPart) continue;
        parts.splice(i, 1);
        removedFromAnimal++;
        remaining--;
      }

      if (removedFromAnimal === 0) continue;

      if (parts.length === 0) {
        await tx.caughtAnimal.delete({ where: { id: animal.id } });
      } else {
        await tx.caughtAnimal.update({ where: { id: animal.id }, data: { partsAvailable: parts } });
      }
    }

    if (remaining > 0) throw new Error(`You only have **${amount - remaining}** ${formatPartName(partKey)} available.`);

    await tx.huntPartListing.create({
      data: {
        sellerId: userId,
        partKey,
        amount,
        totalPrice,
        expiresAt: new Date(Date.now() + LISTING_DURATION_MS),
      },
    });
  });

  questBus.emit("economy:market_sell", { discordId: userId });
  return { partName: formatPartName(partKey), amount, totalPrice, fees: calculateFees(totalPrice) };
}

export async function listMultipleSpeciesPartsFromAnimals(
  userId: string,
  animalKey: string,
  partKeys: string[],
  amountEach: number,
  totalPriceEach: number,
) {
  if (partKeys.length === 0) throw new Error("Select at least one part.");
  if (partKeys.length > 5) throw new Error("You can list up to 5 part types at once.");
  if (amountEach <= 0 || !Number.isInteger(amountEach)) throw new Error("Quantity must be a positive whole number.");
  if (!Number.isInteger(totalPriceEach) || totalPriceEach < MIN_PRICE) throw new Error(`Minimum listing price is **${MIN_PRICE.toLocaleString()}** coins.`);
  if (totalPriceEach > MAX_PRICE) throw new Error(`Maximum listing price is **${MAX_PRICE.toLocaleString()}** coins.`);

  const uniquePartKeys = Array.from(new Set(partKeys));
  const activeCount = await prisma.huntPartListing.count({ where: { sellerId: userId, expiresAt: { gt: new Date() } } });
  if (activeCount + uniquePartKeys.length > MAX_ACTIVE_PART_LISTINGS) {
    throw new Error(`You can only have **${MAX_ACTIVE_PART_LISTINGS}** active animal-part listings. This would create ${uniquePartKeys.length} listings.`);
  }

  const infos = uniquePartKeys.map((partKey) => {
    const info = getPartInfo(partKey);
    if (!info || info.animalKey !== animalKey) throw new Error(`${formatPartName(partKey)} does not belong to this animal.`);
    return { partKey, info };
  });

  await prisma.$transaction(async (tx) => {
    const animals = await tx.caughtAnimal.findMany({
      where: { discordId: userId, animalKey, inZoo: false },
      orderBy: { caughtAt: "asc" },
    });

    const desired = new Map(infos.map(({ partKey, info }) => [info.genericPart, { partKey, remaining: amountEach }]));

    for (const animal of animals) {
      const animalParts = Array.isArray(animal.partsAvailable) ? [...animal.partsAvailable as string[]] : [];
      let changed = false;

      for (let i = animalParts.length - 1; i >= 0; i--) {
        const target = desired.get(animalParts[i]);
        if (!target || target.remaining <= 0) continue;
        animalParts.splice(i, 1);
        target.remaining--;
        changed = true;
      }

      if (!changed) continue;
      if (animalParts.length === 0) {
        await tx.caughtAnimal.delete({ where: { id: animal.id } });
      } else {
        await tx.caughtAnimal.update({ where: { id: animal.id }, data: { partsAvailable: animalParts } });
      }
    }

    const missing = Array.from(desired.entries()).filter(([, data]) => data.remaining > 0);
    if (missing.length > 0) {
      const first = missing[0];
      throw new Error(`Missing **${formatPartName(speciesPartKey(animalKey, first[0]))}** (${amountEach - first[1].remaining}/${amountEach}).`);
    }

    await Promise.all(uniquePartKeys.map((partKey) =>
      tx.huntPartListing.create({
        data: {
          sellerId: userId,
          partKey,
          amount: amountEach,
          totalPrice: totalPriceEach,
          expiresAt: new Date(Date.now() + LISTING_DURATION_MS),
        },
      }),
    ));
  });

  questBus.emit("economy:market_sell", { discordId: userId });
  return {
    listed: uniquePartKeys.map((partKey) => ({
      partKey,
      partName: formatPartName(partKey),
      amount: amountEach,
      totalPrice: totalPriceEach,
      fees: calculateFees(totalPriceEach),
    })),
  };
}

export async function getHuntPartListings(page: number = 1, pageSize: number = 5) {
  const now = new Date();
  const skip = (page - 1) * pageSize;
  const [listings, total] = await prisma.$transaction([
    prisma.huntPartListing.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.huntPartListing.count({ where: { expiresAt: { gt: now } } }),
  ]);

  return {
    listings: listings.map((listing) => ({ ...listing, partName: formatPartName(listing.partKey) })),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getUserHuntPartListings(userId: string) {
  const rows = await prisma.huntPartListing.findMany({
    where: { sellerId: userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((listing) => ({ ...listing, partName: formatPartName(listing.partKey) }));
}

export async function buyHuntPartListing(buyerId: string, listingId: string) {
  const listing = await prisma.huntPartListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found or already sold.");
  if (new Date() >= listing.expiresAt) throw new Error("This listing has expired.");
  if (listing.sellerId === buyerId) throw new Error("You cannot buy your own listing.");

  const fees = calculateFees(listing.totalPrice);
  const buyerWallet = await prisma.wallet.findUnique({ where: { userId: buyerId } });
  if (!buyerWallet || buyerWallet.balance < fees.buyerTotal) {
    throw new Error(`Insufficient funds. Need **${fees.buyerTotal.toLocaleString()}** coins.`);
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.huntPartListing.deleteMany({ where: { id: listingId } });
    if (deleted.count === 0) throw new Error("Listing was already purchased or cancelled.");

    await tx.wallet.update({
      where: { id: buyerWallet.id },
      data: { balance: { decrement: fees.buyerTotal } },
    });
    await tx.transaction.create({
      data: {
        walletId: buyerWallet.id,
        amount: -fees.buyerTotal,
        type: "market_part_buy",
        meta: { listingId, partKey: listing.partKey, amount: listing.amount, sellerFee: fees.sellerFee, buyerFee: fees.buyerFee },
        isEarned: false,
      },
    });

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
          type: "market_part_sale",
          meta: { listingId, partKey: listing.partKey, amount: listing.amount, sellerFee: fees.sellerFee },
          isEarned: true,
        },
      });
    }

    await addHuntParts(buyerId, listing.partKey, listing.amount, tx);
  });

  questBus.emit("economy:market_buy", { discordId: buyerId });
  return { partName: formatPartName(listing.partKey), amount: listing.amount, fees, sellerId: listing.sellerId, totalPrice: listing.totalPrice };
}

export async function cancelHuntPartListing(userId: string, listingId: string) {
  const listing = await prisma.huntPartListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found.");
  if (listing.sellerId !== userId) throw new Error("You don't own this listing.");

  await prisma.$transaction(async (tx) => {
    await tx.huntPartListing.delete({ where: { id: listingId } });
    await addHuntParts(userId, listing.partKey, listing.amount, tx);
  });

  return { partName: formatPartName(listing.partKey), amount: listing.amount };
}

export async function expireOldHuntPartListings(): Promise<number> {
  const expired = await prisma.huntPartListing.findMany({ where: { expiresAt: { lte: new Date() } } });
  let count = 0;

  for (const listing of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.huntPartListing.delete({ where: { id: listing.id } });
        await addHuntParts(listing.sellerId, listing.partKey, listing.amount, tx);
      });
      count++;
    } catch (err) {
      console.error(`Failed to expire hunt part listing ${listing.id}:`, err);
    }
  }

  return count;
}
