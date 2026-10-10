import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { cancelListing, listItem } from "../../src/services/marketService";
import { seedGeneralShop, seedJobShop } from "../../src/services/shopService";

// A listing carries no meta and cancel/buy/expire recreate the row without it,
// so list-then-cancel reset a Loaded Dice's rollCount or gear durability for free.

const seller = "mkt-item-state-seller";

async function give(catalogKey: string, meta?: object) {
  const item = await testPrisma.shopItem.findFirst({ where: { catalogKey } });
  if (!item) throw new Error(`catalog item ${catalogKey} not seeded`);
  const row = await testPrisma.inventory.create({
    data: { userId: seller, shopItemId: item.id, amount: 1, ...(meta ? { meta } : {}) },
  });
  return { item, row };
}

async function cleanup() {
  await testPrisma.marketListing.deleteMany({ where: { sellerId: seller } });
  await resetUser(seller);
}

describe("listItem refuses rows that carry state", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(seller);
    await seedGeneralShop();
    await seedJobShop();
  });
  afterAll(cleanup);

  it("refuses a rolled Loaded Dice and keeps its rollCount", async () => {
    const { item, row } = await give("loaded_dice_of_ruin", { rollCount: 4 });
    await expect(listItem(seller, item.id, 1, 3_000_000)).rejects.toThrow(/has been used/);
    const after = await testPrisma.inventory.findUnique({ where: { id: row.id } });
    expect((after?.meta as any)?.rollCount).toBe(4);
    expect(await testPrisma.marketListing.count({ where: { sellerId: seller } })).toBe(0);
  });

  it("refuses worn gear and keeps its durability", async () => {
    const { item, row } = await give("work_laptop", { durability: 35 });
    await expect(listItem(seller, item.id, 1, 50_000)).rejects.toThrow(/has been used/);
    const after = await testPrisma.inventory.findUnique({ where: { id: row.id } });
    expect((after?.meta as any)?.durability).toBe(35);
  });

  it("still lists (and returns) a row with no state", async () => {
    const { item } = await give("loaded_dice_of_ruin", {});
    await listItem(seller, item.id, 1, 3_000_000);
    const listing = await testPrisma.marketListing.findFirst({ where: { sellerId: seller } });
    await cancelListing(seller, listing!.id);
    const back = await testPrisma.inventory.findFirst({ where: { userId: seller, shopItemId: item.id } });
    expect(back?.amount).toBe(1);
  });
});
