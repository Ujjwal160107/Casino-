import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser, flushTestKeys } from "../helpers";
import { seedJobShop, seedUniShop } from "../../src/services/shopService";
import { useInventoryItem } from "../../src/services/shopItemEffects";

// Every `use` entry point ran the handler first and decremented afterwards from
// a stale read, so two concurrent uses of the last unit both resolved.

const uid = "item-use-race-user";

async function giveItem(catalogKey: string, amount: number) {
  const item = await testPrisma.shopItem.findFirst({ where: { catalogKey } });
  return testPrisma.inventory.create({ data: { userId: uid, shopItemId: item!.id, amount } });
}

async function cleanup() {
  await flushTestKeys(`*${uid}*`);
  await resetUser(uid);
}

describe("useInventoryItem claims the unit before resolving", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(uid);
    await seedJobShop();
    await seedUniShop();
  });
  afterAll(cleanup);

  it("resolves the last unit only once under concurrent use", async () => {
    const slot = await giveItem("warranty_card", 1);
    const results = await Promise.all([
      useInventoryItem(slot, "warranty_card", uid, "g"),
      useInventoryItem(slot, "warranty_card", uid, "g"),
    ]);
    expect(results.filter((r) => r?.success).length).toBe(1);
    expect(await testPrisma.inventory.findUnique({ where: { id: slot.id } })).toBeNull();
  });

  it("gives the unit back when the handler says the use didn't happen", async () => {
    // No damaged gear: Repair Coupon succeeds with shouldConsume:false.
    const slot = await giveItem("repair_coupon", 1);
    const result = await useInventoryItem(slot, "repair_coupon", uid, "g");
    expect(result?.shouldConsume).toBe(false);
    const row = await testPrisma.inventory.findUnique({ where: { id: slot.id } });
    expect(row?.amount).toBe(1);
  });

  it("lets only one of two concurrent Scholarship Letters resolve", async () => {
    const slot = await giveItem("scholarship_letter", 2);
    const results = await Promise.all([
      useInventoryItem(slot, "scholarship_letter", uid, "g"),
      useInventoryItem(slot, "scholarship_letter", uid, "g"),
    ]);
    expect(results.filter((r) => r?.success).length).toBe(1);
    const row = await testPrisma.inventory.findUnique({ where: { id: slot.id } });
    expect(row?.amount).toBe(1);
  });
});
