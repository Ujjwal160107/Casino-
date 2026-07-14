import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { addBalance } from "./walletService";
import { ensureUserAndWallet } from "./walletService";
import {
  ANIMAL_CATALOG,
  RIFLE_TIERS,
  RIFLE_PRIORITY,
  RARITY_INCOME,
  RARITY_QUANTITIES,
  ZOO_CAPACITY,
  AnimalDefinition,
  AnimalRarity,
  PART_VALUES,
  getAnimal,
  rollRarity,
  getAnimalsByRarity,
} from "../utils/animalCatalog";
import { isTester } from "../utils/developerAccess";
import { getCraftEffect, unlockCommonRecipesForAnimal } from "./huntCraftService";
import { enqueueReminder } from "./cooldownReminderService";
import { conditionalClaim } from "../anticheat/claim";

export interface CaughtAnimalWithDef {
  id: string;
  discordId: string;
  animalKey: string;
  partsAvailable: string[];
  inZoo: boolean;
  caughtAt: Date;
  def: AnimalDefinition;
}

// Grouped result for OWO-style display: one entry per unique species with a count
export interface HuntGroup {
  animalKey: string;
  count: number;
  def: AnimalDefinition;
  // representative ids for sell/parts operations (all units of this species caught this hunt)
  ids: string[];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mergeWithDef(raw: { id: string; discordId: string; animalKey: string; partsAvailable: any; inZoo: boolean; caughtAt: Date }): CaughtAnimalWithDef | null {
  const def = getAnimal(raw.animalKey);
  if (!def) return null;
  return { ...raw, partsAvailable: raw.partsAvailable as string[], def };
}

export async function hunt(
  discordId: string,
  username: string,
  guildId: string
): Promise<{ groups: HuntGroup[]; rifleName: string; newlyUnlockedRecipes: string[] }> {
  await ensureUserAndWallet(discordId, guildId, username);

  const inventory = await prisma.inventory.findMany({
    where: { userId: discordId },
    include: { shopItem: true },
  });

  const huntItems = inventory.filter(
    (i) => i.shopItem.category === "HUNT" && i.shopItem.itemType === "EQUIPMENT"
  );

  let rifleName: string | null = null;
  for (const priority of RIFLE_PRIORITY) {
    const found = huntItems.find((i) => i.shopItem.name.toLowerCase() === priority);
    if (found) {
      rifleName = priority;
      break;
    }
  }

  if (!rifleName) throw new Error("NO_RIFLE");

  const tier = RIFLE_TIERS[rifleName];
  const huntKey = `hunt:${discordId}`;
  const redis = redisService.getInstance();
  const ttl = await redis.ttl(huntKey);

  if (ttl > 0 && !isTester(discordId)) {
    const err = new Error("COOLDOWN");
    (err as any).ttl = ttl;
    throw err;
  }

  const weights = { ...tier.weights };
  const rareBoostRow = await getCraftEffect(discordId, `crafted_hunt_rare_boost:${discordId}`, "hunt_rare_boost", (v) => ({ rareBonus: v }));
  const legendaryBoostRow = await getCraftEffect(discordId, `crafted_hunt_legendary_boost:${discordId}`, "hunt_legendary_boost", (v) => ({ legendaryBonus: v }));
  if (rareBoostRow?.rareBonus) {
    weights.Rare = Math.min(0.40, weights.Rare + rareBoostRow.rareBonus);
    weights.Common = Math.max(0, weights.Common - rareBoostRow.rareBonus);
  }
  if (legendaryBoostRow?.legendaryBonus) {
    weights.Legendary = Math.min(0.20, weights.Legendary + legendaryBoostRow.legendaryBonus);
    weights.Common = Math.max(0, weights.Common - legendaryBoostRow.legendaryBonus);
  }

  const camouflageActive = await redisService.get<{ active: boolean }>(`hunt_camouflage:${discordId}`);
  if (camouflageActive?.active) {
    weights.Rare = Math.min(0.40, weights.Rare + 0.10);
    weights.Legendary = Math.min(0.20, weights.Legendary + 0.05);
    weights.Common = Math.max(0, weights.Common - 0.15);
  }

  const compassActive = await redisService.get<{ mode: "safe" | "risky" }>(`hunt_compass:${discordId}`);
  if (compassActive?.mode === "risky") {
    weights.Rare = Math.min(0.40, weights.Rare + 0.08);
    weights.Legendary = Math.min(0.20, weights.Legendary + 0.04);
    weights.Common = Math.max(0, weights.Common - 0.12);
  } else if (compassActive?.mode === "safe") {
    weights.Uncommon = weights.Uncommon + 0.15;
    weights.Common = Math.max(0, weights.Common - 0.15);
  }

  const baitActive = await redisService.get<{ active: boolean }>(`hunt_bait_box:${discordId}`);
  const echoActive = await redisService.get<{ active: boolean }>(`hunt_echo_whistle:${discordId}`);

  // Roll a number of distinct rarity outcomes based on rifle tier
  // Each rarity outcome produces a random species + OWO-style quantity
  let rarityCount = randomInt(tier.minAnimals, tier.maxAnimals);
  if (baitActive?.active) {
    rarityCount = Math.max(2, rarityCount);
  }
  const grouped: Map<string, { def: AnimalDefinition; count: number; ids: string[] }> = new Map();

  for (let i = 0; i < rarityCount; i++) {
    const rarity = rollRarity(weights);
    const pool = getAnimalsByRarity(rarity);
    const def = pool[Math.floor(Math.random() * pool.length)];
    const qty = randomInt(RARITY_QUANTITIES[rarity].min, RARITY_QUANTITIES[rarity].max);

    const existing = grouped.get(def.key);
    if (existing) {
      existing.count += qty;
    } else {
      grouped.set(def.key, { def, count: qty, ids: [] });
    }
  }

  if (echoActive?.active && grouped.size > 0 && Math.random() < 0.35) {
    const rarityOrder: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];
    let bestRarity: AnimalRarity = "Common";
    for (const entry of grouped.values()) {
      if (rarityOrder.indexOf(entry.def.rarity) > rarityOrder.indexOf(bestRarity)) {
        bestRarity = entry.def.rarity;
      }
    }
    const pool = getAnimalsByRarity(bestRarity);
    const def = pool[Math.floor(Math.random() * pool.length)];
    const qty = randomInt(RARITY_QUANTITIES[bestRarity].min, RARITY_QUANTITIES[bestRarity].max);
    const existing = grouped.get(def.key);
    if (existing) {
      existing.count += qty;
    } else {
      grouped.set(def.key, { def, count: qty, ids: [] });
    }
  }

  // Create DB records for all caught animals
  for (const [animalKey, entry] of grouped) {
    const created = await Promise.all(
      Array.from({ length: entry.count }).map(() =>
        prisma.caughtAnimal.create({
          data: {
            discordId,
            animalKey,
            partsAvailable: [...entry.def.parts],
            inZoo: false,
          },
        })
      )
    );
    entry.ids = created.map((c) => c.id);
  }

  // Unlock Common/Uncommon recipes for each species caught
  const allNewlyUnlocked: string[] = [];
  for (const [animalKey] of grouped) {
    const names = await unlockCommonRecipesForAnimal(discordId, animalKey);
    allNewlyUnlocked.push(...names);
  }

  if (!isTester(discordId)) {
    await redis.set(huntKey, "1", "EX", tier.cooldownSeconds);
    void enqueueReminder(discordId, "hunt", new Date(Date.now() + tier.cooldownSeconds * 1000));
  }
  if (rareBoostRow) {
    await redisService.del(`crafted_hunt_rare_boost:${discordId}`);
    await prisma.activeEffect.deleteMany({ where: { userId: discordId, effectType: "hunt_rare_boost" } });
  }
  if (legendaryBoostRow) {
    await redisService.del(`crafted_hunt_legendary_boost:${discordId}`);
    await prisma.activeEffect.deleteMany({ where: { userId: discordId, effectType: "hunt_legendary_boost" } });
  }
  if (camouflageActive?.active) {
    await redisService.del(`hunt_camouflage:${discordId}`);
  }
  if (compassActive?.mode) {
    await redisService.del(`hunt_compass:${discordId}`);
  }
  if (baitActive?.active) {
    await redisService.del(`hunt_bait_box:${discordId}`);
  }
  if (echoActive?.active) {
    await redisService.del(`hunt_echo_whistle:${discordId}`);
  }

  const groups: HuntGroup[] = Array.from(grouped.values()).map((e) => ({
    animalKey: e.def.key,
    count: e.count,
    def: e.def,
    ids: e.ids,
  }));

  return { groups, rifleName, newlyUnlockedRecipes: allNewlyUnlocked };
}

// Sell ALL units of a species from non-zoo inventory
export async function sellAnimalsByKey(
  discordId: string,
  animalKey: string,
  username: string
): Promise<{ earned: number; count: number }> {
  const animals = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: false },
  });
  if (animals.length === 0) throw new Error("No animals of that type in your inventory.");

  const def = getAnimal(animalKey);
  if (!def) throw new Error("Unknown animal type.");

  const earned = def.sellValue * animals.length;
  await addBalance(discordId, username, earned, "animal_sell", { animalKey, count: animals.length });
  await prisma.caughtAnimal.deleteMany({ where: { discordId, animalKey, inZoo: false } });
  return { earned, count: animals.length };
}

export async function sellAllInventoryAnimals(
  discordId: string,
  username: string
): Promise<{ earned: number; count: number; summary: Record<string, number> }> {
  const animals = await prisma.caughtAnimal.findMany({
    where: { discordId, inZoo: false },
  });
  if (animals.length === 0) throw new Error("No hunted animals in your inventory.");

  let earned = 0;
  const summary: Record<string, number> = {};
  for (const animal of animals) {
    const def = getAnimal(animal.animalKey);
    if (!def) continue;
    earned += def.sellValue;
    summary[def.name] = (summary[def.name] ?? 0) + 1;
  }

  if (earned <= 0) throw new Error("No sellable hunted animals found.");
  await addBalance(discordId, username, earned, "animal_sell_all", { count: animals.length, summary });
  await prisma.caughtAnimal.deleteMany({ where: { discordId, inZoo: false } });
  return { earned, count: animals.length, summary };
}

// Keep backward-compat single-id sell (used by legacy paths)
export async function sellAnimal(discordId: string, animalId: string, username: string): Promise<number> {
  const animal = await prisma.caughtAnimal.findFirst({ where: { id: animalId, discordId, inZoo: false } });
  if (!animal) throw new Error("Animal not found in your inventory.");

  const def = getAnimal(animal.animalKey);
  if (!def) throw new Error("Unknown animal type.");

  await addBalance(discordId, username, def.sellValue, "animal_sell", { animalKey: animal.animalKey });
  await prisma.caughtAnimal.delete({ where: { id: animalId } });
  return def.sellValue;
}

// Sell parts for ALL units of a species not in zoo
export async function sellAllPartsByKey(
  discordId: string,
  animalKey: string,
  username: string
): Promise<{ totalEarned: number; partsSummary: Record<string, number> }> {
  const animals = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: false },
  });
  if (animals.length === 0) throw new Error("No animals of that type in your inventory.");

  const partsSummary: Record<string, number> = {};
  let totalEarned = 0;

  for (const animal of animals) {
    const parts = animal.partsAvailable as string[];
    for (const part of parts) {
      const val = PART_VALUES[part] ?? 0;
      totalEarned += val;
      partsSummary[part] = (partsSummary[part] ?? 0) + 1;
    }
  }

  if (totalEarned > 0) {
    await addBalance(discordId, username, totalEarned, "parts_sell", {
      animalKey,
      count: animals.length,
    });
  }
  await prisma.caughtAnimal.deleteMany({ where: { discordId, animalKey, inZoo: false } });
  return { totalEarned, partsSummary };
}

// Legacy single-id parts sell
export async function sellAllParts(
  discordId: string,
  animalId: string,
  username: string
): Promise<{ totalEarned: number; parts: string[] }> {
  const animal = await prisma.caughtAnimal.findFirst({ where: { id: animalId, discordId, inZoo: false } });
  if (!animal) throw new Error("Animal not found in your inventory.");

  const parts = animal.partsAvailable as string[];
  if (parts.length === 0) throw new Error("This animal has no parts left.");

  let totalEarned = 0;
  for (const part of parts) totalEarned += PART_VALUES[part] ?? 0;

  if (totalEarned > 0) {
    await addBalance(discordId, username, totalEarned, "parts_sell", { animalKey: animal.animalKey, parts });
  }
  await prisma.caughtAnimal.delete({ where: { id: animalId } });
  return { totalEarned, parts };
}

/**
 * Send ALL non-zoo units of a species to the zoo.
 * Zoo capacity = max distinct animal types (not total units).
 */
export async function addAnimalsByKeyToZoo(
  discordId: string,
  animalKey: string,
  guildId: string
): Promise<{ count: number }> {
  const animals = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: false },
  });
  if (animals.length === 0) throw new Error("No animals of that type in your inventory.");

  const ownedZoos = await prisma.ownedProperty.findMany({
    where: { userId: discordId },
    include: { property: true },
  });
  const zooProps = ownedZoos.filter((op) => Object.keys(ZOO_CAPACITY).includes(op.property.key));
  if (zooProps.length === 0) throw new Error("You need to own a zoo property to house animals.");

  // Zoos are a single-slot upgrade ladder — capacity is the biggest zoo owned,
  // not the sum. (max, so legacy multi-owners are handled before migration.)
  const maxSlots = zooProps.reduce((max, op) => Math.max(max, ZOO_CAPACITY[op.property.key] ?? 0), 0);

  // Count distinct animal types already in zoo
  const existingTypes = await prisma.caughtAnimal.groupBy({
    by: ["animalKey"],
    where: { discordId, inZoo: true },
  });
  const distinctTypesInZoo = new Set(existingTypes.map((r) => r.animalKey));

  // If this species is already in the zoo, we can add more units without consuming a slot
  const isNewType = !distinctTypesInZoo.has(animalKey);
  if (isNewType && distinctTypesInZoo.size >= maxSlots) {
    throw new Error(
      `Your zoo is full! It can hold **${maxSlots}** different animal types. Remove a type to make room.`
    );
  }

  await prisma.caughtAnimal.updateMany({
    where: { discordId, animalKey, inZoo: false },
    data: { inZoo: true },
  });

  return { count: animals.length };
}

// Legacy single-id zoo add
export async function addAnimalToZoo(discordId: string, animalId: string, guildId: string): Promise<void> {
  const animal = await prisma.caughtAnimal.findFirst({ where: { id: animalId, discordId, inZoo: false } });
  if (!animal) throw new Error("Animal not found in your inventory.");

  const ownedZoos = await prisma.ownedProperty.findMany({
    where: { userId: discordId },
    include: { property: true },
  });
  const zooProps = ownedZoos.filter((op) => Object.keys(ZOO_CAPACITY).includes(op.property.key));
  if (zooProps.length === 0) throw new Error("You need to own a zoo property to house animals.");

  const maxSlots = zooProps.reduce((max, op) => Math.max(max, ZOO_CAPACITY[op.property.key] ?? 0), 0);
  const existingTypes = await prisma.caughtAnimal.groupBy({
    by: ["animalKey"],
    where: { discordId, inZoo: true },
  });
  const distinctTypesInZoo = new Set(existingTypes.map((r) => r.animalKey));

  const isNewType = !distinctTypesInZoo.has(animal.animalKey);
  if (isNewType && distinctTypesInZoo.size >= maxSlots) {
    throw new Error(`Your zoo is full! It can hold ${maxSlots} different animal types.`);
  }

  await prisma.caughtAnimal.update({ where: { id: animalId }, data: { inZoo: true } });
}

// Remove ALL units of a species from the zoo (frees the slot)
export async function removeAnimalsByKey(discordId: string, animalKey: string): Promise<{ count: number }> {
  const animals = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: true },
  });
  if (animals.length === 0) throw new Error("That animal type is not in your zoo.");
  await prisma.caughtAnimal.updateMany({
    where: { discordId, animalKey, inZoo: true },
    data: { inZoo: false },
  });
  return { count: animals.length };
}

// Legacy single-id remove
export async function removeAnimalFromZoo(discordId: string, animalId: string): Promise<void> {
  const animal = await prisma.caughtAnimal.findFirst({ where: { id: animalId, discordId, inZoo: true } });
  if (!animal) throw new Error("Animal not found in your zoo.");
  await prisma.caughtAnimal.update({ where: { id: animalId }, data: { inZoo: false } });
}

export interface ZooSlot {
  animalKey: string;
  count: number;
  def: AnimalDefinition;
  incomePerHour: number; // per-unit rate × count
}

export async function getZooAnimals(discordId: string): Promise<CaughtAnimalWithDef[]> {
  const raw = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  return raw.map(mergeWithDef).filter((a): a is CaughtAnimalWithDef => a !== null);
}

export async function getZooSlots(discordId: string): Promise<ZooSlot[]> {
  const grouped = await prisma.caughtAnimal.groupBy({
    by: ["animalKey"],
    where: { discordId, inZoo: true },
    _count: { animalKey: true },
  });

  return grouped
    .map((row) => {
      const def = getAnimal(row.animalKey);
      if (!def) return null;
      const count = row._count.animalKey;
      return {
        animalKey: row.animalKey,
        count,
        def,
        incomePerHour: RARITY_INCOME[def.rarity] * count,
      };
    })
    .filter((s): s is ZooSlot => s !== null);
}

export async function getInventoryAnimals(discordId: string): Promise<CaughtAnimalWithDef[]> {
  const raw = await prisma.caughtAnimal.findMany({
    where: { discordId, inZoo: false },
    orderBy: { caughtAt: "desc" },
  });
  return raw.map(mergeWithDef).filter((a): a is CaughtAnimalWithDef => a !== null);
}

export async function claimZooIncome(
  discordId: string,
  username: string
): Promise<{ claimed: number; hoursSinceLastClaim: number }> {
  const slots = await getZooSlots(discordId);
  if (slots.length === 0) throw new Error("No animals in your zoo to generate income.");

  const ratePerHour = slots.reduce((sum, s) => sum + s.incomePerHour, 0);

  const user = await prisma.user.findUnique({ where: { discordId } });
  const resolvedClaim: Date =
    user?.lastZooClaim ??
    (await prisma.caughtAnimal
      .findFirst({ where: { discordId, inZoo: true }, orderBy: { caughtAt: "asc" } })
      .then((a) => a?.caughtAt ?? new Date()));

  const hoursSinceLastClaim = Math.floor((Date.now() - resolvedClaim.getTime()) / 3_600_000);
  const cappedHours = isTester(discordId) ? 24 : Math.min(hoursSinceLastClaim, 24);

  if (cappedHours < 1 && !isTester(discordId)) {
    const nextMs = resolvedClaim.getTime() + 3_600_000;
    const minutesLeft = Math.ceil((nextMs - Date.now()) / 60_000);
    const err = new Error(`Come back in **${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}** to collect income.`);
    (err as any).code = "TOO_SOON";
    throw err;
  }

  const zooBoost = await getCraftEffect(discordId, `crafted_zoo_boost:${discordId}`, "zoo_boost", (v) => ({ multiplier: v }));
  const totalIncome = Math.floor(ratePerHour * cappedHours * (zooBoost?.multiplier ?? 1));

  // Reserve the claim window atomically BEFORE crediting. Advancing lastZooClaim
  // from the exact value we read is the CAS; concurrent claims lose (count 0).
  const claimed = await conditionalClaim(() =>
    prisma.user.updateMany({
      where: { discordId, lastZooClaim: user?.lastZooClaim ?? null },
      data: { lastZooClaim: new Date() },
    })
  );
  if (!claimed) {
    const err = new Error("Already collecting — try again in a moment.");
    (err as any).code = "TOO_SOON";
    throw err;
  }

  await addBalance(discordId, username, totalIncome, "zoo_income", {
    hours: cappedHours,
    slotCount: slots.length,
  });

  return { claimed: totalIncome, hoursSinceLastClaim: cappedHours };
}

export async function getZooStatus(
  discordId: string,
  guildId: string
): Promise<{
  slots: ZooSlot[];
  maxSlots: number;
  ratePerHour: number;
  hoursPending: number;
  lastClaim: Date | null;
  zooName: string | null;
  zooKey: string | null;
}> {
  const slots = await getZooSlots(discordId);

  const ownedZoos = await prisma.ownedProperty.findMany({
    where: { userId: discordId },
    include: { property: true },
  });
  const zooProps = ownedZoos.filter((op) => Object.keys(ZOO_CAPACITY).includes(op.property.key));
  // Single-slot upgrade ladder: the active zoo is the biggest one owned.
  const activeZoo = zooProps.reduce<typeof zooProps[number] | null>(
    (best, op) =>
      (ZOO_CAPACITY[op.property.key] ?? 0) > (best ? ZOO_CAPACITY[best.property.key] ?? 0 : -1) ? op : best,
    null,
  );
  const maxSlots = activeZoo ? ZOO_CAPACITY[activeZoo.property.key] ?? 0 : 0;

  const zooBoost = await getCraftEffect(discordId, `crafted_zoo_boost:${discordId}`, "zoo_boost", (v) => ({ multiplier: v }));
  const ratePerHour = Math.floor(slots.reduce((sum, s) => sum + s.incomePerHour, 0) * (zooBoost?.multiplier ?? 1));

  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;

  let hoursPending = 0;
  if (slots.length > 0) {
    if (lastClaim) {
      hoursPending = Math.min(24, Math.floor((Date.now() - lastClaim.getTime()) / 3_600_000));
    } else {
      const oldest = await prisma.caughtAnimal.findFirst({
        where: { discordId, inZoo: true },
        orderBy: { caughtAt: "asc" },
      });
      if (oldest) {
        hoursPending = Math.min(24, Math.floor((Date.now() - oldest.caughtAt.getTime()) / 3_600_000));
      }
    }
  }

  return {
    slots,
    maxSlots,
    ratePerHour,
    hoursPending,
    lastClaim,
    zooName: activeZoo?.property.name ?? null,
    zooKey: activeZoo?.property.key ?? null,
  };
}
