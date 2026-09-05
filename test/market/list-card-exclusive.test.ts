import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { listItem } from "../../src/services/marketService";
import { seedCosmeticsShop, seedGeneralShop } from "../../src/services/shopService";

// The purchase gate is airtight, but a resale would hand a gated item to a
// player with no card at all. Listing must refuse them.

const seller = "mkt-card-excl-seller";
const GUILD = "test-guild";

async function giveItem(name: string) {
  const item = await testPrisma.shopItem.findFirst({ where: { name } });
  if (!item) throw new Error(`catalog item ${name} not seeded`);
  await testPrisma.inventory.upsert({
    where: { userId_shopItemId: { userId: seller, shopItemId: item.id } },
    create: { userId: seller, shopItemId: item.id, amount: 1 },
    update: { amount: 1 },
  });
  return item;
}

async function cleanup() {
  await testPrisma.marketListing.deleteMany({ where: { sellerId: seller } });
  await resetUser(seller);
}

describe("listItem refuses card-exclusive items", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(seller);
    await seedGeneralShop(GUILD);
    await seedCosmeticsShop(GUILD);
  });
  afterAll(cleanup);

  it("blocks a gated cosmetic and leaves the inventory untouched", async () => {
    const cape = await giveItem("Royal Cape");
    await expect(listItem(seller, cape.id, 1, 2_500_000)).rejects.toThrow(/card-exclusive/);
    const inv = await testPrisma.inventory.findUnique({
      where: { userId_shopItemId: { userId: seller, shopItemId: cape.id } },
    });
    expect(inv?.amount).toBe(1);
    expect(await testPrisma.marketListing.count({ where: { sellerId: seller } })).toBe(0);
  });

  it("still lists an ordinary item", async () => {
    const shield = await giveItem("Tax Shield");
    await listItem(seller, shield.id, 1, 10_000);
    expect(await testPrisma.marketListing.count({ where: { sellerId: seller } })).toBe(1);
  });
});
