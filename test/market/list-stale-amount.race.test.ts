import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { listItem } from "../../src/services/marketService";
import { listPartFromInventory } from "../../src/services/huntPartService";
import { seedGeneralShop } from "../../src/services/shopService";

// Listing checked the amount outside its transaction and then decremented
// unconditionally. A competing write landing between the two (another listing,
// a sale, a use) produced negative stacks or listed more than was owned.
// The race is made deterministic by committing the competing write right
// before the listing transaction starts.

const seller = "mkt-stale-amount-seller";
const PART = "rabbit_fur";

function injectBeforeTransaction(competingWrite: () => Promise<unknown>) {
  const realTx = prisma.$transaction.bind(prisma);
  vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (arg: any, opts?: any) => {
    await competingWrite();
    return realTx(arg, opts);
  }) as any);
}

async function cleanup() {
  await testPrisma.marketListing.deleteMany({ where: { sellerId: seller } });
  await testPrisma.huntPartListing.deleteMany({ where: { sellerId: seller } });
  await testPrisma.huntPartInventory.deleteMany({ where: { userId: seller } });
  await resetUser(seller);
}

describe("listing re-checks the amount inside the transaction", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(seller);
    await seedGeneralShop();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(cleanup);

  it("listItem refuses when units vanish after the check", async () => {
    const shield = await testPrisma.shopItem.findFirst({ where: { catalogKey: "tax_shield" } });
    const inv = await testPrisma.inventory.create({ data: { userId: seller, shopItemId: shield!.id, amount: 3 } });

    injectBeforeTransaction(() =>
      testPrisma.inventory.update({ where: { id: inv.id }, data: { amount: { decrement: 2 } } }));

    await expect(listItem(seller, shield!.id, 2, 10_000)).rejects.toThrow(/enough/);
    const row = await testPrisma.inventory.findUnique({ where: { id: inv.id } });
    expect(row?.amount).toBe(1);
    expect(await testPrisma.marketListing.count({ where: { sellerId: seller } })).toBe(0);
  });

  it("listPartFromInventory refuses when parts vanish after the check", async () => {
    const inv = await testPrisma.huntPartInventory.create({ data: { userId: seller, partKey: PART, amount: 3 } });

    injectBeforeTransaction(() =>
      testPrisma.huntPartInventory.update({ where: { id: inv.id }, data: { amount: { decrement: 2 } } }));

    await expect(listPartFromInventory(seller, PART, 2, 10_000)).rejects.toThrow(/enough/);
    const row = await testPrisma.huntPartInventory.findUnique({ where: { id: inv.id } });
    expect(row?.amount).toBe(1);
    expect(await testPrisma.huntPartListing.count({ where: { sellerId: seller } })).toBe(0);
  });

  it("still lists the whole stack and removes the emptied row", async () => {
    const inv = await testPrisma.huntPartInventory.create({ data: { userId: seller, partKey: PART, amount: 2 } });
    await listPartFromInventory(seller, PART, 2, 10_000);
    expect(await testPrisma.huntPartInventory.findUnique({ where: { id: inv.id } })).toBeNull();
    expect(await testPrisma.huntPartListing.count({ where: { sellerId: seller } })).toBe(1);
  });
});
