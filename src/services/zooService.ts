import prisma from "../utils/prisma";
import {
  AnimalDefinition,
  AnimalRarity,
  FED_WINDOW_MS,
  RARITY_FEED_COST,
  RARITY_FEED_KEY,
  RARITY_INCOME_PER_DAY,
  RARITY_STACK_LIMIT,
  ZOO_TIERS,
  ZooTier,
  ZooTierKey,
  getAnimal,
} from "../utils/animalCatalog";
import { RuleAnimal, animalState, feedBill, msUntilDeath, resolveLegalHousing } from "../utils/zooRules";
import { addBalance } from "./walletService";
import { getCraftEffect } from "./huntCraftService";
import { conditionalClaim, userDateUnchanged } from "../anticheat/claim";
import { isTester } from "../utils/developerAccess";

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
  // A row whose animalKey no longer resolves (renamed/retired in the catalog)
  // must be left alone, never deleted by accident — mirrors the same guard in
  // enforceHousing (unknown keys drop out of `rules`) and getZooStatus
  // (`if (!def) continue`).
  const dead = rows.filter((r) => getAnimal(r.animalKey) && animalState(r, now) === "dead");
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

  // Self-heal: the stackRoom check above reads then writes with nothing in
  // between, so two concurrent calls for the same species (e.g. a
  // double-clicked "Send to zoo" button) can both pass it against the same
  // stale count and each house up to stackRoom units, overshooting the stack
  // limit. Re-count after the write and evict the newest excess — oldest
  // survives, matching resolveLegalHousing's own tiebreak — so the limit
  // holds even under the race.
  const nowHoused = await prisma.caughtAnimal.findMany({
    where: { discordId, animalKey, inZoo: true },
    orderBy: { caughtAt: "desc" },
  });
  const overLimit = nowHoused.length - RARITY_STACK_LIMIT[def.rarity];
  if (overLimit > 0) {
    const excess = nowHoused.slice(0, overLimit);
    await prisma.caughtAnimal.updateMany({
      where: { id: { in: excess.map((a) => a.id) } },
      data: { inZoo: false },
    });
  }

  // The count is re-read rather than derived from the self-heal above,
  // because a concurrent call's own self-heal can run between this call's
  // self-heal and this return and evict some of the rows this call just
  // housed (or vice versa) — a locally computed excess set is a snapshot
  // that a concurrent call can invalidate. Ask the database the actual
  // question — of the ids this call housed, how many are inZoo: true right
  // now — so the answer is true regardless of interleaving.
  const stillHoused = await prisma.caughtAnimal.count({
    where: { id: { in: available.map((a) => a.id) }, inZoo: true },
  });
  return { housed: stillHoused, reason: null };
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

export interface FeedResult {
  fed: number;
  spent: { rarity: AnimalRarity; units: number }[];
  missing: { rarity: AnimalRarity; units: number }[];
}

/**
 * Spend up to `units` of a rarity's feed. The `amount: { gte: units }` filter
 * makes this a compare-and-set: two concurrent feeds cannot both spend the
 * same last unit.
 */
async function spendFeed(discordId: string, rarity: AnimalRarity, units: number): Promise<number> {
  if (units <= 0) return 0;
  const item = await prisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY[rarity] } });
  if (!item) return 0;

  const row = await prisma.inventory.findUnique({
    where: { userId_shopItemId: { userId: discordId, shopItemId: item.id } },
  });
  const affordable = Math.min(units, row?.amount ?? 0);
  if (affordable <= 0) return 0;

  const taken = await prisma.inventory.updateMany({
    where: { userId: discordId, shopItemId: item.id, amount: { gte: affordable } },
    data: { amount: { decrement: affordable } },
  });
  if (taken.count === 0) return 0;

  await prisma.inventory.deleteMany({ where: { userId: discordId, shopItemId: item.id, amount: { lte: 0 } } });
  return affordable;
}

async function feedRows(
  discordId: string,
  rows: { id: string; animalKey: string; fedUntil: Date | null; caughtAt: Date }[],
): Promise<FeedResult> {
  const now = new Date();
  const hungry = rows
    .filter((r) => animalState(r, now) === "hungry")
    .map((r) => ({ row: r, def: getAnimal(r.animalKey) }))
    .filter((x): x is { row: typeof rows[number]; def: AnimalDefinition } => x.def !== undefined);

  if (hungry.length === 0) return { fed: 0, spent: [], missing: [] };

  const bill = feedBill(hungry.map((h) => ({ rarity: h.def.rarity })));
  const spent: FeedResult["spent"] = [];
  const missing: FeedResult["missing"] = [];
  const fedUntil = new Date(now.getTime() + FED_WINDOW_MS);
  let fed = 0;

  // bill.lines is cheapest-first, so a player who can't cover everything keeps
  // the most animals alive.
  for (const line of bill.lines) {
    const got = await spendFeed(discordId, line.rarity, line.units);
    if (got > 0) {
      const ids = hungry
        .filter((h) => h.def.rarity === line.rarity)
        .slice(0, got)
        .map((h) => h.row.id);
      await prisma.caughtAnimal.updateMany({ where: { id: { in: ids } }, data: { fedUntil } });
      spent.push({ rarity: line.rarity, units: got });
      fed += got;
    }
    if (got < line.units) missing.push({ rarity: line.rarity, units: line.units - got });
  }

  return { fed, spent, missing };
}

/** Feed every hungry animal of one species. Housed animals only. */
export async function feedSpecies(discordId: string, animalKey: string): Promise<FeedResult> {
  await purgeDead(discordId);
  const rows = await prisma.caughtAnimal.findMany({ where: { discordId, animalKey, inZoo: true } });
  return feedRows(discordId, rows);
}

/** Feed every hungry housed animal. Same per-animal cost as feeding one by one. */
export async function feedAll(discordId: string): Promise<FeedResult> {
  await purgeDead(discordId);
  const rows = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  return feedRows(discordId, rows);
}

export async function claimZooIncome(
  discordId: string,
  username: string,
): Promise<{ claimed: number; fedAnimals: number; hungryAnimals: number }> {
  const zooKey = await getActiveZooKey(discordId);
  if (!zooKey) {
    const err = new Error("You need to own a zoo to collect zoo income.");
    (err as any).code = "NO_ZOO";
    throw err;
  }

  await purgeDead(discordId);
  await enforceHousing(discordId);

  const now = new Date();
  const user = await prisma.user.findUnique({ where: { discordId } });
  const lastClaim = user?.lastZooClaim ?? null;

  if (lastClaim && now.getTime() - lastClaim.getTime() < ZOO_CLAIM_WINDOW_MS && !isTester(discordId)) {
    const hoursLeft = Math.ceil((lastClaim.getTime() + ZOO_CLAIM_WINDOW_MS - now.getTime()) / 3_600_000);
    const err = new Error(`Come back in **${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}** to collect zoo income.`);
    (err as any).code = "TOO_SOON";
    throw err;
  }

  const housed = await prisma.caughtAnimal.findMany({ where: { discordId, inZoo: true } });
  let gross = 0;
  let fedAnimals = 0;
  for (const a of housed) {
    const def = getAnimal(a.animalKey);
    if (!def) continue;
    if (animalState(a, now) !== "fed") continue;
    gross += RARITY_INCOME_PER_DAY[def.rarity];
    fedAnimals++;
  }

  if (gross === 0) {
    const err = new Error(
      housed.length === 0
        ? "Your zoo is empty. Catch animals with `!hunt` and house them first."
        : "Every animal in your zoo is hungry — they earn nothing. Feed them with `!zoo feed <animal>`.",
    );
    (err as any).code = "NOTHING_TO_CLAIM";
    throw err;
  }

  const zooBoost = await getCraftEffect(
    discordId,
    `crafted_zoo_boost:${discordId}`,
    "zoo_boost",
    (v) => ({ multiplier: v }),
  );
  const total = Math.floor(gross * (zooBoost?.multiplier ?? 1));

  // Reserve the 24h window atomically BEFORE crediting. userDateUnchanged also
  // matches a never-written lastZooClaim; a plain `{ lastZooClaim: null }`
  // filter would not, permanently blocking first-ever claims.
  const claimed = await conditionalClaim(() =>
    prisma.user.updateMany({
      where: { discordId, ...userDateUnchanged("lastZooClaim", lastClaim) },
      data: { lastZooClaim: now },
    }),
  );
  if (!claimed) {
    const err = new Error("Already collecting — try again in a moment.");
    (err as any).code = "TOO_SOON";
    throw err;
  }

  await addBalance(discordId, username, total, "zoo_income", { fedAnimals });
  return { claimed: total, fedAnimals, hungryAnimals: housed.length - fedAnimals };
}
