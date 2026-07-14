import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("property collect CAS", () => {
  const id = "prop-race-1";
  let opId: string;
  let propId: string;
  beforeEach(async () => {
    await seedUser(id);
    const prop = await testPrisma.property.create({
      data: { guildId: "global", key: "test_farm_race", name: "Farm", description: "d",
        basePrice: 1000, price: 1000, incomePerCycle: 50000, incomeCycleHours: 24 },
    });
    propId = prop.id;
    const op = await testPrisma.ownedProperty.create({
      data: { userId: id, propertyId: prop.id, purchasedPrice: 1000,
        lastCollected: new Date(Date.now() - 48 * 3_600_000) },
    });
    opId = op.id;
  });
  afterAll(async () => {
    await resetUser(id);
    await testPrisma.property.deleteMany({ where: { id: propId } }).catch(() => {});
  });

  it("only one concurrent collect advances lastCollected", async () => {
    const op = await testPrisma.ownedProperty.findUnique({ where: { id: opId } });
    const prior = op!.lastCollected;
    const now = new Date();
    const claim = () => conditionalClaim(() =>
      testPrisma.ownedProperty.updateMany({ where: { id: opId, lastCollected: prior }, data: { lastCollected: now } }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
