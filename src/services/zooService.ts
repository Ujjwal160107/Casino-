import prisma from "../utils/prisma";
import {
  AnimalDefinition,
  AnimalRarity,
  FED_WINDOW_MS,
  RARITY_FEED_COST,
  RARITY_INCOME_PER_DAY,
  RARITY_STACK_LIMIT,
  ZOO_TIERS,
  ZooTier,
  ZooTierKey,
  getAnimal,
} from "../utils/animalCatalog";
import { RuleAnimal, animalState, msUntilDeath, resolveLegalHousing } from "../utils/zooRules";

export const ZOO_CLAIM_WINDOW_MS = 24 * 3_600_000;

function isZooKey(key: string): key is ZooTierKey {
  return key in ZOO_TIERS;
}

/** Single-slot ladder: the active zoo is the biggest one owned. */
export async function getActiveZooKey(discordId: string): Promise<ZooTierKey | null> {
  const owned = await prisma.ownedProperty.findMany({
    where: { userId: discordId },
    include: { property: true },
  });
  let best: ZooTierKey | null = null;
  for (const op of owned) {
    const key = op.property.key;
    if (!isZooKey(key)) continue;
    if (!best || ZOO_TIERS[key].types > ZOO_TIERS[best].types) best = key;
  }
  return best;
}

function toRuleAnimal(row: { id: string; animalKey: string; caughtAt: Date }): RuleAnimal | null {
  const def = getAnimal(row.animalKey);
  if (!def) return null;
  return { id: row.id, animalKey: row.animalKey, rarity: def.rarity, caughtAt: row.caughtAt };
}

/**
 * Delete animals past the 72h starve grace, housed or not. No parts, no sell
 * value — death-as-loot would turn neglect into a parts printer.
 */
export async function purgeDead(discordId: string): Promise<{ animalKey: string; count: number }[]> {
  const now = new Date();
  const rows = await prisma.caughtAnimal.findMany({ where: { discordId } });
  const dead = rows.filter((r) => animalState(r, now) === "dead");
  if (dead.length === 0) return [];

  await prisma.caughtAnimal.deleteMany({ where: { id: { in: dead.map((d) => d.id) } } });

  const counts = new Map<string, number>();
  for (const d of dead) counts.set(d.animalKey, (counts.get(d.animalKey) ?? 0) + 1);
  return [...counts].map(([animalKey, count]) => ({ animalKey, count }));
}

/**
 * Push the zoo back inside its legal set. Over-cap animals go to inventory,
 * keeping their fedUntil — they cannot be fed there, so they die on the normal
 * clock unless the player sells or parts them. This is the whole migration.
 */
export async function enforceHousing(discordId: string): Promise<number> {
  const zooKey = await getActiveZooKey(discordId);
  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  const rules = housed.map(toRuleAnimal).filter((a): a is RuleAnimal => a !== null);

  const { evict } = resolveLegalHousing(rules, zooKey);
  // Rows with an unknown animalKey are not in `rules`; leave them alone.
  if (evict.length === 0) return 0;

  await prisma.caughtAnimal.updateMany({
    where: { id: { in: evict } },
    data: { inZoo: false },
  });
  return evict.length;
}

export interface ZooSlot {
  animalKey: string;
  def: AnimalDefinition;
  count: number;
  fedCount: number;
  hungryCount: number;
  incomePerDay: number;
  feedCostPerDay: number;
  /** Milliseconds until the first animal of this species dies, null if all fed. */
  soonestDeathMs: number | null;
}

export interface ZooStatus {
  slots: ZooSlot[];
  tier: ZooTier | null;
  zooKey: ZooTierKey | null;
  zooName: string | null;
  incomePerDay: number;
  feedBillPerDay: number;
  lastClaim: Date | null;
  nextClaim: Date | null;
  claimable: boolean;
  died: { animalKey: string; count: number }[];
  evicted: number;
}

const ZOO_NAMES: Record<ZooTierKey, string> = {
  mini_zoo: "Mini Zoo",
  city_zoo: "City Zoo",
  world_zoo: "World Zoo",
};

export async function getZooStatus(discordId: string): Promise<ZooStatus> {
  const died = await purgeDead(discordId);
  const evicted = await enforceHousing(discordId);

  const zooKey = await getActiveZooKey(discordId);
  const now = new Date();
  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });

  const bySpecies = new Map<string, typeof housed>();
  for (const a of housed) {
    const list = bySpecies.get(a.animalKey) ?? [];
    list.push(a);
    bySpecies.set(a.animalKey, list);
  }

  const slots: ZooSlot[] = [];
  for (const [animalKey, list] of bySpecies) {
    const def = getAnimal(animalKey);
    if (!def) continue;
    const fed = list.filter((a) => animalState(a, now) === "fed");
    const hungry = list.filter((a) => animalState(a, now) === "hungry");
    slots.push({
      animalKey,
      def,
      count: list.length,
      fedCount: fed.length,
      hungryCount: hungry.length,
      incomePerDay: fed.length * RARITY_INCOME_PER_DAY[def.rarity],
      feedCostPerDay: list.length * RARITY_FEED_COST[def.rarity],
      soonestDeathMs: hungry.length
        ? Math.min(...hungry.map((a) => msUntilDeath(a, now)))
        : null,
    });
  }

  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;
  const nextClaim = lastClaim ? new Date(lastClaim.getTime() + ZOO_CLAIM_WINDOW_MS) : null;

  return {
    slots,
    tier: zooKey ? ZOO_TIERS[zooKey] : null,
    zooKey,
    zooName: zooKey ? ZOO_NAMES[zooKey] : null,
    incomePerDay: slots.reduce((s, x) => s + x.incomePerDay, 0),
    feedBillPerDay: slots.reduce((s, x) => s + x.feedCostPerDay, 0),
    lastClaim,
    nextClaim,
    claimable: !nextClaim || nextClaim.getTime() <= now.getTime(),
    died,
    evicted,
  };
}

/**
 * Move as many units of a species from inventory into the zoo as the type cap,
 * rarity mix and stack allow. Partial success is normal and reported.
 */
export async function houseAnimals(
  discordId: string,
  animalKey: string,
): Promise<{ housed: number; reason: string | null }> {
  const def = getAnimal(animalKey);
  if (!def) return { housed: 0, reason: "That animal doesn't exist." };

  const zooKey = await getActiveZooKey(discordId);
  if (!zooKey) return { housed: 0, reason: "You need to own a zoo before you can house animals." };
  const tier = ZOO_TIERS[zooKey];

  await purgeDead(discordId);
  await enforceHousing(discordId);

  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  const sameSpecies = housed.filter((a) => a.animalKey === animalKey).length;
  const stackRoom = RARITY_STACK_LIMIT[def.rarity] - sameSpecies;
  if (stackRoom <= 0) {
    return {
      housed: 0,
      reason: `Your zoo already holds the maximum **${RARITY_STACK_LIMIT[def.rarity]}x ${def.name}** (${def.rarity} stack limit).`,
    };
  }

  if (sameSpecies === 0) {
    const speciesOfRarity = new Set(
      housed.filter((a) => getAnimal(a.animalKey)?.rarity === def.rarity).map((a) => a.animalKey),
    ).size;
    const allowed = tier.mix[def.rarity];
    if (allowed === 0) {
      return {
        housed: 0,
        reason: `A **${ZOO_NAMES[zooKey]}** cannot house ${def.rarity} animals. Upgrade your zoo first.`,
      };
    }
    if (speciesOfRarity >= allowed) {
      return {
        housed: 0,
        reason: `Your zoo already houses **${allowed}** ${def.rarity} species — the most a **${ZOO_NAMES[zooKey]}** allows. Remove one with \`!zoo remove <name>\`.`,
      };
    }
  }

  const available = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: false },
    orderBy: { caughtAt: "asc" },
    take: stackRoom,
  });
  if (available.length === 0) return { housed: 0, reason: `You have no ${def.name} in your inventory.` };

  await prisma.caughtAnimal.updateMany({
    where: { id: { in: available.map((a) => a.id) } },
    data: { inZoo: true },
  });
  return { housed: available.length, reason: null };
}

/** Remove every unit of a species from the zoo, freeing its slot. */
export async function removeAnimalsByKey(
  discordId: string,
  animalKey: string,
): Promise<{ count: number }> {
  const animals = await prisma.caughtAnimal.findMany({ where: { discordId, animalKey, inZoo: true } });
  if (animals.length === 0) throw new Error("That animal type is not in your zoo.");
  await prisma.caughtAnimal.updateMany({
    where: { discordId, animalKey, inZoo: true },
    data: { inZoo: false },
  });
  return { count: animals.length };
}
