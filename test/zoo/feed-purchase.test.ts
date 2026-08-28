import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { buyItem, isBulkBuyable, MAX_BULK_QUANTITY, seedHuntShop } from "../../src/services/shopService";
import { parseBuyQuantity } from "../../src/commands/economy/shop";
import { feedAll } from "../../src/services/zooService";
import { RARITY_FEED_COST, RARITY_FEED_KEY, RARITY_STACK_LIMIT, ZOO_TIERS } from "../../src/utils/animalCatalog";
import { HUNT_SHOP_CATALOG } from "../../src/utils/shopCatalog";

// The upkeep half of the care economy has to be BUYABLE. A full World Zoo eats
// 4x4 + 4x3 + 3x3 + 1x1 = 38 feed units a day; before this, `buyItem` had no
// quantity parameter and bought exactly one unit per invocation, so keeping a
// zoo alive meant 38 separate commands a day and in practice nothing was ever
// fed, every zoo earned 0, and purgeDead deleted the collections.

const id = "zoo-feed-buy";

async function giveWorldZoo() {
  const property = await testPrisma.property.upsert({
    where: { key: "world_zoo" },
    create: {
      guildId: "global", key: "world_zoo", name: "World Zoo", description: "test",
      basePrice: 1, price: 1, incomePerCycle: 0, incomeCycleHours: 24, totalSold: 0,
    } as any,
    update: {},
  });
  await testPrisma.ownedProperty.create({
    data: { userId: id, propertyId: property.id, purchasedPrice: 1, lastCollected: new Date() },
  });
}

async function houseHungry(animalKey: string, n: number) {
  const longAgo = new Date(Date.now() - 40 * 3_600_000);
  for (let i = 0; i < n; i++) {
    await testPrisma.caughtAnimal.create({
      data: { discordId: id, animalKey, partsAvailable: [], inZoo: true, caughtAt: longAgo, fedUntil: longAgo },
    });
  }
}

describe("parseBuyQuantity", () => {
  it("reads a leading count", () => {
    expect(parseBuyQuantity(["10", "Feed", "Sack"])).toEqual({ quantity: 10, name: "Feed Sack" });
  });

  it("reads a trailing count, which is how players actually type it", () => {
    expect(parseBuyQuantity(["Feed", "Sack", "10"])).toEqual({ quantity: 10, name: "Feed Sack" });
  });

  it("defaults to one and leaves the name alone", () => {
    expect(parseBuyQuantity(["Feed", "Sack"])).toEqual({ quantity: 1, name: "Feed Sack" });
    expect(parseBuyQuantity(["Wooden", "Rifle"])).toEqual({ quantity: 1, name: "Wooden Rifle" });
  });

  it("never eats a lone token as a count, so `!buy 10` is a name, not a quantity", () => {
    expect(parseBuyQuantity(["10"])).toEqual({ quantity: 1, name: "10" });
  });

  it("is unambiguous against the real catalog: no item name starts or ends with a number", () => {
    const numeric = /^\d+$/;
    for (const item of HUNT_SHOP_CATALOG) {
      const words = item.name.split(" ");
      expect(numeric.test(words[0])).toBe(false);
      expect(numeric.test(words[words.length - 1])).toBe(false);
    }
  });
});

describe("isBulkBuyable", () => {
  it("allows every feed item", () => {
    for (const rarity of ["Common", "Uncommon", "Rare", "Legendary"] as const) {
      expect(isBulkBuyable(RARITY_FEED_KEY[rarity])).toBe(true);
    }
  });

  it("refuses equipment, one-of-a-kind items and anything with an on-buy effect", () => {
    expect(isBulkBuyable("wooden_rifle")).toBe(false);       // EQUIPMENT, not consumable
    expect(isBulkBuyable("hunting_permit")).toBe(false);     // COLLECTIBLE
    expect(isBulkBuyable("loaded_dice_of_ruin")).toBe(false); // maxStack 1
    expect(isBulkBuyable(null)).toBe(false);                  // unknown / admin-made item
  });
});

describe("buying feed in bulk", () => {
  beforeEach(async () => {
    await seedUser(id, { wallet: { create: { balance: 5_000_000 } } });
    await seedHuntShop();
  });
  afterAll(() => resetUser(id));

  it("buys a full World Zoo's daily feed bill in one command", async () => {
    // The spec's §7 World Zoo line: 4x4 Common + 4x3 Uncommon + 3x3 Rare + 1 Legendary.
    const mix = ZOO_TIERS.world_zoo.mix;
    const units = {
      Common: mix.Common * RARITY_STACK_LIMIT.Common,
      Uncommon: mix.Uncommon * RARITY_STACK_LIMIT.Uncommon,
      Rare: mix.Rare * RARITY_STACK_LIMIT.Rare,
      Legendary: mix.Legendary * RARITY_STACK_LIMIT.Legendary,
    };
    expect(units.Common + units.Uncommon + units.Rare + units.Legendary).toBe(38);

    let commands = 0;
    let spent = 0;
    for (const rarity of ["Common", "Uncommon", "Rare", "Legendary"] as const) {
      const name = HUNT_SHOP_CATALOG.find((i) => i.key === RARITY_FEED_KEY[rarity])!.name;
      const purchase = await buyItem("guild", id, name, undefined, false, "wallet", units[rarity]) as any;
      commands++;
      spent += purchase.totalPrice;
      expect(purchase.quantity).toBe(units[rarity]);
      expect(purchase.totalPrice).toBe(RARITY_FEED_COST[rarity] * units[rarity]);
    }

    // Four commands for a whole day of upkeep, not thirty-eight.
    expect(commands).toBe(4);
    expect(spent).toBe(369_000); // spec §7 World Zoo feed/day
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(5_000_000 - 369_000);
  });

  it("lands the whole stack in one inventory row and records the real total", async () => {
    await buyItem("guild", id, "Feed Sack", undefined, false, "wallet", 16);

    const item = await testPrisma.shopItem.findUnique({ where: { catalogKey: RARITY_FEED_KEY.Common } });
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: id, shopItemId: item!.id } },
    });
    expect(inv!.amount).toBe(16);

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    const txns = await testPrisma.transaction.findMany({ where: { walletId: wallet!.id, type: "shop_buy" } });
    expect(txns).toHaveLength(1);
    expect(txns[0].amount).toBe(-(1_500 * 16));
  });

  it("feeds a full zoo with what one bulk purchase bought", async () => {
    await giveWorldZoo();
    await houseHungry("rabbit", 4);
    await houseHungry("squirrel", 4);
    await buyItem("guild", id, "Feed Sack", undefined, false, "wallet", 8);

    const result = await feedAll(id);
    expect(result.fed).toBe(8);
    expect(result.missing).toEqual([]);
  });

  it("refuses to bulk-buy something that isn't a plain consumable", async () => {
    await expect(buyItem("guild", id, "Wooden Rifle", undefined, false, "wallet", 3))
      .rejects.toThrow(/one at a time/i);
  });

  it("rejects a nonsense quantity instead of charging for it", async () => {
    await expect(buyItem("guild", id, "Feed Sack", undefined, false, "wallet", 0)).rejects.toThrow(/at least 1/i);
    await expect(buyItem("guild", id, "Feed Sack", undefined, false, "wallet", -5)).rejects.toThrow(/at least 1/i);
    await expect(buyItem("guild", id, "Feed Sack", undefined, false, "wallet", MAX_BULK_QUANTITY + 1))
      .rejects.toThrow(/at most/i);

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(5_000_000);
  });

  it("charges for the whole stack, not one unit, when the wallet is short", async () => {
    await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 4_000 } });
    await expect(buyItem("guild", id, "Feed Sack", undefined, false, "wallet", 10)).rejects.toThrow(/need/i);

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(4_000);
  });
});
