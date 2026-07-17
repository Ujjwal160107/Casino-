import prisma from "../utils/prisma";
import { MAX_SAFE_BALANCE } from "../utils/economyConfig";
import {
  getLoadedDiceCondition,
  getLoadedDiceRollConfig,
  loadedDiceShatters,
  LOADED_DICE_COOLDOWN_MS,
  LOADED_DICE_FINAL_ROLL,
  LOADED_DICE_ITEM_KEY,
  LOADED_DICE_REWARD_POOLS,
  LoadedDiceRewardCategory,
  randomLoadedDiceCash,
  selectLoadedDiceRewardCategory,
} from "../utils/loadedDiceConfig";
import { SHOP_CATALOG } from "../utils/shopCatalog";
import { invalidateUserCache } from "./userService";
import { questBus } from "./questEvents";
import { withTransactionRetry } from "./walletService";
import { userDateUnchanged } from "../anticheat/claim";
import {
  seedCockShop,
  seedCosmeticsShop,
  seedGeneralShop,
  seedHuntShop,
  seedJobShop,
  seedUniShop,
} from "./shopService";

export type LoadedDiceErrorCode = "USER_NOT_FOUND" | "NO_DICE" | "COOLDOWN" | "ROLL_IN_PROGRESS";

export class LoadedDiceError extends Error {
  constructor(
    public readonly code: LoadedDiceErrorCode,
    message: string,
    public readonly availableAt: Date | null = null,
  ) {
    super(message);
    this.name = "LoadedDiceError";
  }
}

export interface LoadedDiceStatus {
  owned: boolean;
  completedRolls: number;
  nextRollNumber: number;
  condition: string;
  lastRolledAt: Date | null;
  nextRollAt: Date | null;
  canRoll: boolean;
}

export type LoadedDiceReward =
  | {
      kind: "CASH";
      amount: number;
      requestedAmount: number;
      capped: boolean;
    }
  | {
      kind: "ITEM";
      itemKey: string;
      itemName: string;
      shopValue: number;
    };

export interface LoadedDiceRollResult {
  rollNumber: number;
  category: LoadedDiceRewardCategory;
  reward: LoadedDiceReward;
  shattered: boolean;
  completedRolls: number;
  conditionBefore: string;
  conditionAfter: string | null;
  nextRollAt: Date;
}

type RandomSource = () => number;

const CATALOG_BY_KEY = new Map(SHOP_CATALOG.map((item) => [item.key, item]));
let prizeCatalogPromise: Promise<void> | null = null;

async function ensurePrizeCatalog(): Promise<void> {
  if (!prizeCatalogPromise) {
    prizeCatalogPromise = (async () => {
      await seedGeneralShop();
      await seedHuntShop();
      await seedJobShop();
      await seedUniShop();
      await seedCockShop();
      await seedCosmeticsShop();
    })().catch((error) => {
      prizeCatalogPromise = null;
      throw error;
    });
  }
  await prizeCatalogPromise;
}

function parseCompletedRolls(meta: unknown): number {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;
  const value = Number((meta as Record<string, unknown>).rollCount);
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, LOADED_DICE_FINAL_ROLL - 1);
}

function nextRollAt(lastRolledAt: Date | null): Date | null {
  return lastRolledAt ? new Date(lastRolledAt.getTime() + LOADED_DICE_COOLDOWN_MS) : null;
}

async function findLoadedDiceShopItem(client: any) {
  return client.shopItem.findFirst({
    where: {
      OR: [
        { catalogKey: LOADED_DICE_ITEM_KEY },
        { name: { equals: "Loaded Dice of Ruin", mode: "insensitive" } },
      ],
    },
  });
}

export async function getLoadedDiceStatus(discordId: string, now = new Date()): Promise<LoadedDiceStatus> {
  const [user, shopItem] = await Promise.all([
    prisma.user.findUnique({ where: { discordId } }),
    findLoadedDiceShopItem(prisma),
  ]);

  if (!user) {
    return {
      owned: false,
      completedRolls: 0,
      nextRollNumber: 1,
      condition: getLoadedDiceCondition(0),
      lastRolledAt: null,
      nextRollAt: null,
      canRoll: false,
    };
  }

  const inventory = shopItem
    ? await prisma.inventory.findUnique({
        where: { userId_shopItemId: { userId: discordId, shopItemId: shopItem.id } },
      })
    : null;
  const completedRolls = inventory?.amount ? parseCompletedRolls(inventory.meta) : 0;
  const lastRolledAt = user.lastLoadedDiceRoll ? new Date(user.lastLoadedDiceRoll) : null;
  const availableAt = nextRollAt(lastRolledAt);
  const owned = !!inventory && inventory.amount > 0;

  return {
    owned,
    completedRolls,
    nextRollNumber: Math.min(completedRolls + 1, LOADED_DICE_FINAL_ROLL),
    condition: getLoadedDiceCondition(completedRolls),
    lastRolledAt,
    nextRollAt: availableAt,
    canRoll: owned && (!availableAt || availableAt.getTime() <= now.getTime()),
  };
}

function isUniqueReward(itemKey: string): boolean {
  const catalogItem = CATALOG_BY_KEY.get(itemKey);
  if (!catalogItem) return false;
  return catalogItem.maxStack === 1 || (!catalogItem.consumable && catalogItem.itemType !== "CONSUMABLE");
}

async function grantItemReward(
  tx: any,
  discordId: string,
  category: LoadedDiceRewardCategory,
  random: RandomSource,
): Promise<LoadedDiceReward | null> {
  const configuredKeys = [...LOADED_DICE_REWARD_POOLS[category].itemKeys];
  const shopItems = await tx.shopItem.findMany({
    where: { catalogKey: { in: configuredKeys } },
  });
  const shopByKey = new Map<string, any>(shopItems.map((item: any) => [item.catalogKey, item]));
  const inventory = shopItems.length > 0
    ? await tx.inventory.findMany({
        where: { userId: discordId, shopItemId: { in: shopItems.map((item: any) => item.id) } },
      })
    : [];
  const ownedByShopItemId = new Map<string, number>(
    inventory.map((entry: any) => [entry.shopItemId, entry.amount]),
  );
  const eligibleKeys = configuredKeys.filter((itemKey) => {
    const shopItem = shopByKey.get(itemKey);
    if (!shopItem) return false;
    if (!isUniqueReward(itemKey)) return true;
    return (ownedByShopItemId.get(shopItem.id) ?? 0) < 1;
  });

  if (eligibleKeys.length === 0) return null;
  const selectedKey = eligibleKeys[Math.floor(Math.min(Math.max(random(), 0), 1 - Number.EPSILON) * eligibleKeys.length)];
  const selectedShopItem = shopByKey.get(selectedKey);
  const catalogItem = CATALOG_BY_KEY.get(selectedKey);
  if (!selectedShopItem || !catalogItem) return null;

  await tx.inventory.upsert({
    where: { userId_shopItemId: { userId: discordId, shopItemId: selectedShopItem.id } },
    create: { userId: discordId, shopItemId: selectedShopItem.id, amount: 1, meta: {} },
    update: { amount: { increment: 1 } },
  });

  return {
    kind: "ITEM",
    itemKey: selectedKey,
    itemName: catalogItem.name,
    shopValue: catalogItem.price,
  };
}

async function grantCashReward(
  tx: any,
  user: any,
  category: LoadedDiceRewardCategory,
  random: RandomSource,
  requestedOverride?: number,
): Promise<LoadedDiceReward> {
  const requestedAmount = requestedOverride ?? randomLoadedDiceCash(category, random());
  const availableSpace = Math.max(0, MAX_SAFE_BALANCE - user.wallet.balance);
  const amount = Math.min(requestedAmount, availableSpace);
  const capped = amount < requestedAmount;

  if (amount > 0) {
    await tx.wallet.update({
      where: { id: user.wallet.id },
      data: { balance: { increment: amount } },
    });
    await tx.transaction.create({
      data: {
        walletId: user.wallet.id,
        amount,
        type: "loaded_dice_reward",
        meta: { category, requestedAmount, capped },
        isEarned: true,
      },
    });
  }

  return { kind: "CASH", amount, requestedAmount, capped };
}

async function grantReward(
  tx: any,
  user: any,
  category: LoadedDiceRewardCategory,
  random: RandomSource,
): Promise<LoadedDiceReward> {
  const pool = LOADED_DICE_REWARD_POOLS[category];
  if (random() < pool.itemChance) {
    const itemReward = await grantItemReward(tx, user.discordId, category, random);
    if (itemReward) return itemReward;

    const fallbackCandidates = pool.itemKeys
      .map((itemKey) => CATALOG_BY_KEY.get(itemKey))
      .filter((item): item is NonNullable<typeof item> => !!item);
    if (fallbackCandidates.length > 0) {
      const fallback = fallbackCandidates[
        Math.floor(Math.min(Math.max(random(), 0), 1 - Number.EPSILON) * fallbackCandidates.length)
      ];
      return grantCashReward(tx, user, category, random, Math.floor(fallback.price * 0.8));
    }
  }
  return grantCashReward(tx, user, category, random);
}

export async function rollLoadedDice(
  discordId: string,
  now = new Date(),
  random: RandomSource = Math.random,
): Promise<LoadedDiceRollResult> {
  await ensurePrizeCatalog();
  const result = await withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true },
    });
    if (!user?.wallet) {
      throw new LoadedDiceError("USER_NOT_FOUND", "Your Fortuna profile or wallet could not be found.");
    }

    const shopItem = await findLoadedDiceShopItem(tx);
    const inventory = shopItem
      ? await tx.inventory.findUnique({
          where: { userId_shopItemId: { userId: discordId, shopItemId: shopItem.id } },
        })
      : null;
    if (!inventory || inventory.amount <= 0) {
      throw new LoadedDiceError("NO_DICE", "You do not own a Loaded Dice of Ruin.");
    }

    const previousRollAt = user.lastLoadedDiceRoll ? new Date(user.lastLoadedDiceRoll) : null;
    const availableAt = nextRollAt(previousRollAt);
    if (availableAt && availableAt.getTime() > now.getTime()) {
      throw new LoadedDiceError("COOLDOWN", "Your Loaded Dice is not ready yet.", availableAt);
    }

    const claim = await tx.user.updateMany({
      // userDateUnchanged matches an absent lastLoadedDiceRoll too — a plain
      // `{ lastLoadedDiceRoll: null }` filter would not, so a player's first-ever
      // roll always failed with "already claimed" (Prisma/Mongo null vs. missing).
      where: {
        discordId,
        ...userDateUnchanged("lastLoadedDiceRoll", previousRollAt),
      },
      data: { lastLoadedDiceRoll: now },
    });
    if (claim.count !== 1) {
      const latest = await tx.user.findUnique({ where: { discordId } });
      const latestAvailableAt = nextRollAt(latest?.lastLoadedDiceRoll ? new Date(latest.lastLoadedDiceRoll) : now);
      throw new LoadedDiceError(
        "ROLL_IN_PROGRESS",
        "Another roll has already claimed this die's daily turn.",
        latestAvailableAt,
      );
    }

    const previousRolls = parseCompletedRolls(inventory.meta);
    const rollNumber = Math.min(previousRolls + 1, LOADED_DICE_FINAL_ROLL);
    const category = selectLoadedDiceRewardCategory(rollNumber, random());
    const reward = await grantReward(tx, user, category, random);

    // The player always keeps the granted reward. Shattering is checked only afterward.
    const shattered = loadedDiceShatters(rollNumber, random());
    const existingMeta = inventory.meta && typeof inventory.meta === "object" && !Array.isArray(inventory.meta)
      ? inventory.meta as Record<string, unknown>
      : {};

    if (shattered) {
      await tx.inventory.delete({ where: { id: inventory.id } });
    } else {
      await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          amount: 1,
          meta: {
            ...existingMeta,
            rollCount: rollNumber,
            lastRolledAt: now.toISOString(),
          },
        },
      });
    }

    await tx.audit.create({
      data: {
        userId: discordId,
        type: "loaded_dice_roll",
        meta: {
          rollNumber,
          category,
          reward,
          shattered,
        },
      },
    });

    return {
      rollNumber,
      category,
      reward,
      shattered,
      completedRolls: shattered ? 0 : rollNumber,
      conditionBefore: getLoadedDiceCondition(previousRolls),
      conditionAfter: shattered ? null : getLoadedDiceCondition(rollNumber),
      nextRollAt: new Date(now.getTime() + LOADED_DICE_COOLDOWN_MS),
    } satisfies LoadedDiceRollResult;
  }));

  if (result.reward.kind === "CASH" && result.reward.amount > 0) {
    questBus.emit("economy:earn", { discordId, amount: result.reward.amount });
    await invalidateUserCache(discordId, "");
    try {
      const { applyGarnishment } = await import("./creditCardService");
      const { garnished } = await applyGarnishment(discordId, result.reward.amount);
      if (garnished > 0) {
        await withTransactionRetry(() => prisma.wallet.update({
          where: { userId: discordId },
          data: { balance: { decrement: garnished } },
        }));
      }
    } catch {
      // Card debt processing is non-critical; the successful roll remains committed.
    }
  }

  return result;
}

export function getLoadedDiceRarePlusChance(rollNumber: number): number {
  const weights = getLoadedDiceRollConfig(rollNumber).categoryWeights;
  return weights.RARE + weights.EPIC + weights.MYTHIC;
}
