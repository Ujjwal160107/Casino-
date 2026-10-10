import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { buyListing } from "../../src/services/marketService";
import { buyHuntPartListing } from "../../src/services/huntPartService";

// Market buys checked the buyer's balance outside the transaction and then
// decremented unconditionally, so spending the coins elsewhere in between let
// the buy go through on a negative wallet. The competing spend is committed
// right before the buy transaction starts to make the race deterministic.

const seller = "mkt-stale-bal-seller";
const buyer = "mkt-stale-bal-buyer";
const ITEM_NAME = "Stale Balance Widget";
const future = () => new Date(Date.now() + 3_600_000);

function drainBuyerBeforeTransaction() {
  const realTx = prisma.$transaction.bind(prisma);
  vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (arg: any, opts?: any) => {
    await testPrisma.wallet.update({ where: { userId: buyer }, data: { balance: 0 } });
    return realTx(arg, opts);
  }) as any);
}

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

describe("market buys debit the buyer with a guarded update", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(seller);
    await seedUser(buyer, { wallet: { create: { balance: 1_000_000 } } });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await cleanup();
    await resetUser(seller);
    await resetUser(buyer);
  });

  it("buyListing rolls back when the buyer can no longer pay", async () => {
    const item = await testPrisma.shopItem.create({ data: { guildId: "global", name: ITEM_NAME, price: 1 } });
    const listing = await testPrisma.marketListing.create({
      data: { sellerId: seller, shopItemId: item.id, amount: 1, totalPrice: 100_000, expiresAt: future() },
    });

    drainBuyerBeforeTransaction();
    await expect(buyListing(buyer, listing.id)).rejects.toThrow(/Insufficient funds/);

    expect((await testPrisma.wallet.findUnique({ where: { userId: buyer } }))?.balance).toBe(0);
    expect((await testPrisma.wallet.findUnique({ where: { userId: seller } }))?.balance).toBe(0);
    expect(await testPrisma.marketListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });

  it("buyHuntPartListing rolls back when the buyer can no longer pay", async () => {
    const listing = await testPrisma.huntPartListing.create({
      data: { sellerId: seller, partKey: "rabbit_fur", amount: 3, totalPrice: 30_000, expiresAt: future() },
    });

    drainBuyerBeforeTransaction();
    await expect(buyHuntPartListing(buyer, listing.id)).rejects.toThrow(/Insufficient funds/);

    expect((await testPrisma.wallet.findUnique({ where: { userId: buyer } }))?.balance).toBe(0);
    expect(await testPrisma.huntPartListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
    expect(await testPrisma.huntPartInventory.count({ where: { userId: buyer } })).toBe(0);
  });
});
