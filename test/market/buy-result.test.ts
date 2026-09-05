import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { buyListing } from "../../src/services/marketService";
import { buyHuntPartListing, formatPartName } from "../../src/services/huntPartService";

const seller = "mkt-seller-1";
const buyer = "mkt-buyer-1";
const ITEM_NAME = "Test Widget";
const future = () => new Date(Date.now() + 3_600_000);

async function cleanup() {
  await testPrisma.marketListing.deleteMany({ where: { sellerId: seller } });
  await testPrisma.huntPartListing.deleteMany({ where: { sellerId: seller } });
  await testPrisma.huntPartInventory.deleteMany({ where: { userId: buyer } });
  const items = await testPrisma.shopItem.findMany({ where: { name: ITEM_NAME } });
  for (const item of items) {
    await testPrisma.inventory.deleteMany({ where: { shopItemId: item.id } });
    await testPrisma.shopItem.delete({ where: { id: item.id } });
  }
}

describe("buy results carry what the seller notice needs", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(seller);
    await seedUser(buyer, { wallet: { create: { balance: 1_000_000 } } });
  });
  afterAll(async () => {
    await cleanup();
    await resetUser(seller);
    await resetUser(buyer);
  });

  it("buyListing reports the sale price and the garnished amount (zero for a clean seller)", async () => {
    const item = await testPrisma.shopItem.create({ data: { guildId: "global", name: ITEM_NAME, price: 1 } });
    const listing = await testPrisma.marketListing.create({
      data: { sellerId: seller, shopItemId: item.id, amount: 2, totalPrice: 100_000, expiresAt: future() },
    });

    const result = await buyListing(buyer, listing.id);

    expect(result).toMatchObject({ sellerId: seller, itemName: ITEM_NAME, amount: 2, totalPrice: 100_000, garnished: 0 });
    expect(result.fees.sellerPayout).toBe(90_000);
  });

  it("buyHuntPartListing reports the sale price", async () => {
    const listing = await testPrisma.huntPartListing.create({
      data: { sellerId: seller, partKey: "rabbit_fur", amount: 3, totalPrice: 30_000, expiresAt: future() },
    });

    const result = await buyHuntPartListing(buyer, listing.id);

    expect(result).toMatchObject({ sellerId: seller, amount: 3, totalPrice: 30_000 });
    expect(result.partName).toBe(formatPartName("rabbit_fur"));
  });
});
