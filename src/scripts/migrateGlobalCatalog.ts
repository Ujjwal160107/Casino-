/**
 * One-time migration: dedupe per-guild catalog rows and backfill catalogKey / global guildId.
 * Run before `npx prisma db push` when enabling global unique indexes.
 *
 * Usage: npx ts-node src/scripts/migrateGlobalCatalog.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  GENERAL_SHOP_CATALOG,
  HUNT_SHOP_CATALOG,
  JOB_SHOP_CATALOG,
  UNI_SHOP_CATALOG,
  COCK_SHOP_CATALOG,
  COCK_SYSTEM_ITEMS,
  COSMETICS_SHOP_CATALOG,
} from "../utils/shopCatalog";
import { HUNT_CRAFT_RECIPES } from "../services/huntCraftService";
import { REGULAR_PROPERTY_CATALOG } from "../services/propertyService";
import { ZOO_PROPERTY_DEFS } from "../utils/animalCatalog";
import { GLOBAL_CATALOG_GUILD_ID } from "../utils/globalCatalog";

const prisma = new PrismaClient();

const DEGREE_CATALOG_KEYS: Record<string, string> = {
  "high school diploma": "high_school_diploma",
  "trade license (plumbing)": "trade_license",
  "ba fine arts": "ba_fine_arts",
  "bs computer science": "bs_computer_science",
  "bachelor of laws (llb)": "llb",
  mbbs: "mbbs",
  "master of laws (llm)": "llm",
  "doctor of medicine (md) / ph.d.": "md_phd",
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function buildShopNameToKey(): Map<string, string> {
  const map = new Map<string, string>();
  const all = [
    ...GENERAL_SHOP_CATALOG,
    ...HUNT_SHOP_CATALOG,
    ...JOB_SHOP_CATALOG,
    ...UNI_SHOP_CATALOG,
    ...COCK_SHOP_CATALOG,
    ...COCK_SYSTEM_ITEMS,
    ...COSMETICS_SHOP_CATALOG,
    ...HUNT_CRAFT_RECIPES.map((r) => ({ key: r.key, name: r.name })),
  ];
  for (const item of all) {
    map.set(item.name.toLowerCase(), item.key);
  }
  return map;
}

async function mergeInventory(fromItemId: string, toItemId: string) {
  const rows = await prisma.inventory.findMany({ where: { shopItemId: fromItemId } });
  for (const row of rows) {
    const existing = await prisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: row.userId, shopItemId: toItemId } },
    });
    if (existing) {
      await prisma.inventory.update({
        where: { id: existing.id },
        data: { amount: { increment: row.amount } },
      });
      await prisma.inventory.delete({ where: { id: row.id } });
    } else {
      await prisma.inventory.update({
        where: { id: row.id },
        data: { shopItemId: toItemId },
      });
    }
  }
}

async function migrateShopItems() {
  const nameToKey = buildShopNameToKey();
  const allItems = await prisma.shopItem.findMany();
  const groups = new Map<string, typeof allItems>();

  for (const item of allItems) {
    const key =
      item.catalogKey ??
      nameToKey.get(item.name.toLowerCase()) ??
      `legacy_${slugify(item.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  let merged = 0;
  let updated = 0;

  for (const [catalogKey, items] of groups) {
    const canonical =
      items.find((i) => i.guildId === GLOBAL_CATALOG_GUILD_ID && i.catalogKey === catalogKey) ??
      items.find((i) => i.guildId === GLOBAL_CATALOG_GUILD_ID) ??
      items[0];

    await prisma.shopItem.update({
      where: { id: canonical.id },
      data: { catalogKey, guildId: GLOBAL_CATALOG_GUILD_ID },
    });
    updated++;

    for (const dup of items) {
      if (dup.id === canonical.id) continue;
      await mergeInventory(dup.id, canonical.id);
      await prisma.shopItem.delete({ where: { id: dup.id } });
      merged++;
    }
  }

  console.log(`ShopItem: updated ${updated} canonical rows, removed ${merged} duplicates`);
}

async function mergeOwnedProperties(fromPropertyId: string, toPropertyId: string) {
  const rows = await prisma.ownedProperty.findMany({ where: { propertyId: fromPropertyId } });
  for (const row of rows) {
    const existing = await prisma.ownedProperty.findUnique({
      where: { userId_propertyId: { userId: row.userId, propertyId: toPropertyId } },
    });
    if (existing) {
      await prisma.ownedProperty.delete({ where: { id: row.id } });
    } else {
      await prisma.ownedProperty.update({
        where: { id: row.id },
        data: { propertyId: toPropertyId },
      });
    }
  }

  await prisma.marketListing.updateMany({
    where: { propertyId: fromPropertyId },
    data: { propertyId: toPropertyId },
  });
}

async function migrateProperties() {
  const validKeys = new Set([
    ...REGULAR_PROPERTY_CATALOG.map((p) => p.key),
    ...ZOO_PROPERTY_DEFS.map((p) => p.key),
  ]);
  const allProps = await prisma.property.findMany();
  const groups = new Map<string, typeof allProps>();

  for (const prop of allProps) {
    const key = prop.key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(prop);
  }

  let merged = 0;
  let updated = 0;

  for (const [key, items] of groups) {
    if (!validKeys.has(key) && items.length > 1) {
      console.warn(`Property key "${key}" not in catalog but has ${items.length} rows — merging anyway`);
    }

    const canonical =
      items.find((i) => i.guildId === GLOBAL_CATALOG_GUILD_ID) ?? items[0];

    await prisma.property.update({
      where: { id: canonical.id },
      data: { guildId: GLOBAL_CATALOG_GUILD_ID, key },
    });
    updated++;

    for (const dup of items) {
      if (dup.id === canonical.id) continue;
      await mergeOwnedProperties(dup.id, canonical.id);
      await prisma.property.delete({ where: { id: dup.id } });
      merged++;
    }
  }

  console.log(`Property: updated ${updated} canonical rows, removed ${merged} duplicates`);
}

async function mergeUserDegrees(fromDegreeId: string, toDegreeId: string) {
  const rows = await prisma.userDegree.findMany({ where: { degreeId: fromDegreeId } });
  for (const row of rows) {
    const existing = await prisma.userDegree.findUnique({
      where: { userId_degreeId: { userId: row.userId, degreeId: toDegreeId } },
    });
    if (existing) {
      await prisma.userDegree.delete({ where: { id: row.id } });
    } else {
      await prisma.userDegree.update({
        where: { id: row.id },
        data: { degreeId: toDegreeId },
      });
    }
  }

  await prisma.degree.updateMany({
    where: { requiredDegreeId: fromDegreeId },
    data: { requiredDegreeId: toDegreeId },
  });
}

async function migrateDegrees() {
  const allDegrees = await prisma.degree.findMany();
  const groups = new Map<string, typeof allDegrees>();

  for (const degree of allDegrees) {
    const catalogKey =
      degree.catalogKey ??
      DEGREE_CATALOG_KEYS[degree.name.toLowerCase()] ??
      `legacy_${slugify(degree.name)}`;
    if (!groups.has(catalogKey)) groups.set(catalogKey, []);
    groups.get(catalogKey)!.push(degree);
  }

  let merged = 0;
  let updated = 0;

  for (const [catalogKey, items] of groups) {
    const canonical =
      items.find((i) => i.guildId === GLOBAL_CATALOG_GUILD_ID && i.catalogKey === catalogKey) ??
      items.find((i) => i.guildId === GLOBAL_CATALOG_GUILD_ID) ??
      items[0];

    await prisma.degree.update({
      where: { id: canonical.id },
      data: { catalogKey, guildId: GLOBAL_CATALOG_GUILD_ID },
    });
    updated++;

    for (const dup of items) {
      if (dup.id === canonical.id) continue;
      await mergeUserDegrees(dup.id, canonical.id);
      await prisma.degree.delete({ where: { id: dup.id } });
      merged++;
    }
  }

  console.log(`Degree: updated ${updated} canonical rows, removed ${merged} duplicates`);
}

async function main() {
  console.log("Starting global catalog migration...");
  await migrateShopItems();
  await migrateProperties();
  await migrateDegrees();
  console.log("Migration complete. Run `npx prisma db push` next.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
