import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { sellOne } from "../../src/commands/economy/inventory";
import { listItem } from "../../src/services/marketService";
import { seedCockShop } from "../../src/services/shopService";

// Equipping never consumes the item and cockfights read only the chicken's
// meta, so gear sold or listed away kept fighting on the chicken for free.

const uid = "sold-gear-unequip-user";

async function setup(spursOwned: number) {
  const spurs = await testPrisma.shopItem.findFirst({ where: { catalogKey: "iron_spurs" } });
  const chicken = await testPrisma.shopItem.findFirst({ where: { catalogKey: "chicken" } });
  const slot = await testPrisma.inventory.create({ data: { userId: uid, shopItemId: spurs!.id, amount: spursOwned } });
  const chickenRow = await testPrisma.inventory.create({
    data: {
      userId: uid,
      shopItemId: chicken!.id,
      amount: 1,
      meta: { level: 1, trait: "Brawler", equipment: { weapon: { id: spurs!.id, name: "Iron Spurs" } } },
    },
  });
  return { spurs: spurs!, slot, chickenRow };
}

async function equipment(chickenRowId: string) {
  const row = await testPrisma.inventory.findUnique({ where: { id: chickenRowId } });
  return (row?.meta as any)?.equipment;
}

async function cleanup() {
  await testPrisma.marketListing.deleteMany({ where: { sellerId: uid } });
  await resetUser(uid);
}

describe("selling or listing equipped chicken gear", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(uid);
    await seedCockShop();
  });
  afterAll(cleanup);

  it("Quick Sell of the last unit takes it off the chicken", async () => {
    const { slot, chickenRow } = await setup(1);
    await sellOne(slot.id, uid);
    expect(await equipment(chickenRow.id)).toEqual({});
  });

  it("listing the last unit takes it off the chicken", async () => {
    const { spurs, chickenRow } = await setup(1);
    await listItem(uid, spurs.id, 1, 10_000);
    expect(await equipment(chickenRow.id)).toEqual({});
  });

  it("selling a spare keeps the equipped one on", async () => {
    const { slot, chickenRow } = await setup(2);
    await sellOne(slot.id, uid);
    expect((await equipment(chickenRow.id))?.weapon?.name).toBe("Iron Spurs");
  });
});
