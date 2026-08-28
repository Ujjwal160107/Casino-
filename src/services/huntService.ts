import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { addBalance } from "./walletService";
import { ensureUserAndWallet } from "./walletService";
import {
  ANIMAL_CATALOG,
  RIFLE_TIERS,
  RIFLE_PRIORITY,
  AnimalDefinition,
  AnimalRarity,
  PART_VALUES,
  FED_WINDOW_MS,
  getAnimal,
  rollRarity,
  getAnimalsByRarity,
  applyHuntBuffs,
} from "../utils/animalCatalog";
import { isTester } from "../utils/developerAccess";
import { getCraftEffect, unlockCommonRecipesForAnimal } from "./huntCraftService";
import { enqueueReminder } from "./cooldownReminderService";

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

  // Reserve the cooldown atomically BEFORE rolling/creating loot. SET NX keeps the
  // existing hunt:<id> key so status displays that read its TTL keep working.
  if (!isTester(discordId)) {
    const reserved = await redis.set(huntKey, "1", "EX", tier.cooldownSeconds, "NX");
    if (reserved !== "OK") {
      const ttl = await redis.ttl(huntKey);
      const err = new Error("COOLDOWN");
      (err as any).ttl = Math.max(ttl, 0);
      throw err;
    }
    void enqueueReminder(discordId, "hunt", new Date(Date.now() + tier.cooldownSeconds * 1000));
  }

  let weights = { ...tier.weights };
  const rareBoostRow = await getCraftEffect(discordId, `crafted_hunt_rare_boost:${discordId}`, "hunt_rare_boost", (v) => ({ rareBonus: v }));
  const legendaryBoostRow = await getCraftEffect(discordId, `crafted_hunt_legendary_boost:${discordId}`, "hunt_legendary_boost", (v) => ({ legendaryBonus: v }));

  const camouflageActive = await redisService.get<{ active: boolean }>(`hunt_camouflage:${discordId}`);
  const compassActive = await redisService.get<{ mode: "safe" | "risky" }>(`hunt_compass:${discordId}`);

  weights = applyHuntBuffs(weights, {
    camouflage: camouflageActive?.active === true,
    compass: compassActive?.mode,
    rareBonus: rareBoostRow?.rareBonus,
    legendaryBonus: legendaryBoostRow?.legendaryBonus,
  });

  const baitActive = await redisService.get<{ active: boolean }>(`hunt_bait_box:${discordId}`);
  const echoActive = await redisService.get<{ active: boolean }>(`hunt_echo_whistle:${discordId}`);

  // One animal per rarity roll. The rifle decides how many rolls you get.
  let rollCount = randomInt(tier.minRolls, tier.maxRolls);
  if (baitActive?.active) {
    rollCount = Math.max(2, rollCount);
  }
  const grouped: Map<string, { def: AnimalDefinition; count: number; ids: string[] }> = new Map();

  let bestDef: AnimalDefinition | null = null;
  const rarityOrder: AnimalRarity[] = ["Common", "Uncommon", "Rare", "Legendary"];

  for (let i = 0; i < rollCount; i++) {
    const rarity = rollRarity(weights);
    const pool = getAnimalsByRarity(rarity);
    const def = pool[Math.floor(Math.random() * pool.length)];

    if (!bestDef || rarityOrder.indexOf(def.rarity) > rarityOrder.indexOf(bestDef.rarity)) {
      bestDef = def;
    }

    const existing = grouped.get(def.key);
    if (existing) existing.count += 1;
    else grouped.set(def.key, { def, count: 1, ids: [] });
  }

  // Echo repeats your best catch's exact species — echoing a Legendary into a
  // *different* Legendary was a second legendary roll in disguise.
  if (echoActive?.active && bestDef && Math.random() < 0.35) {
    const existing = grouped.get(bestDef.key);
    if (existing) existing.count += 1;
    else grouped.set(bestDef.key, { def: bestDef, count: 1, ids: [] });
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
            // One free fed day, so a fresh catch is never hungry on arrival.
            fedUntil: new Date(Date.now() + FED_WINDOW_MS),
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

  // Cooldown + reminder were reserved up-front (SET NX) before loot creation.
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

export async function getZooAnimals(discordId: string): Promise<CaughtAnimalWithDef[]> {
  const raw = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  return raw.map(mergeWithDef).filter((a): a is CaughtAnimalWithDef => a !== null);
}

export async function getInventoryAnimals(discordId: string): Promise<CaughtAnimalWithDef[]> {
  const raw = await prisma.caughtAnimal.findMany({
    where: { discordId, inZoo: false },
    orderBy: { caughtAt: "desc" },
  });
  return raw.map(mergeWithDef).filter((a): a is CaughtAnimalWithDef => a !== null);
}
