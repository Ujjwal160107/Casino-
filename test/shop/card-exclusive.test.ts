import { describe, it, expect, beforeEach } from "vitest";
import { CARD_TIERS, cardTierMeets, formatCardTierName } from "../../src/utils/economyConfig";
import { SHOP_CATALOG, getCardExclusiveItems } from "../../src/utils/shopCatalog";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { buyItem, seedCosmeticsShop, seedGeneralShop } from "../../src/services/shopService";
import { TESTER_IDS } from "../../src/utils/developerAccess";

describe("cardTierMeets", () => {
  it("accepts the same tier and anything above it", () => {
    expect(cardTierMeets("GOLD", "GOLD")).toBe(true);
    expect(cardTierMeets("BLACK", "STARTER")).toBe(true);
    expect(cardTierMeets("PLATINUM", "GOLD")).toBe(true);
  });

  it("rejects a lower tier", () => {
    expect(cardTierMeets("STARTER", "GOLD")).toBe(false);
    expect(cardTierMeets("GOLD", "BLACK")).toBe(false);
  });

  it("ranks an unknown tier as Starter, like getCardTierConfig", () => {
    expect(cardTierMeets("MYSTERY", "STARTER")).toBe(true);
    expect(cardTierMeets("MYSTERY", "GOLD")).toBe(false);
  });
});

describe("formatCardTierName", () => {
  it("title-cases the enum value", () => {
    expect(formatCardTierName("GOLD")).toBe("Gold");
    expect(formatCardTierName("STARTER")).toBe("Starter");
  });
});

describe("card-exclusive catalog invariants", () => {
  const gated = SHOP_CATALOG.filter((item) => item.requiresCardTier);

  it("gates exactly the agreed eight items", () => {
    expect(gated.map((item) => item.key).sort()).toEqual([
      "celestial_halo",
      "celestial_harp",
      "crown_of_greed",
      "demonic_harp",
      "emperors_throne",
      "platinum_crown",
      "royal_cape",
      "void_wings",
    ]);
  });

  it("never combines a card gate with a credit block", () => {
    for (const item of gated) expect(item.creditBlocked, item.key).toBeFalsy();
  });

  it("keeps every gated price inside its tier's weekly spend cap and credit limit", () => {
    for (const item of gated) {
      const tier = CARD_TIERS[item.requiresCardTier!];
      expect(item.price, item.key).toBeLessThanOrEqual(tier.weeklySpendCap);
      expect(item.price, item.key).toBeLessThanOrEqual(tier.creditLimit);
    }
  });

  it("lists exclusives per tier in catalog order", () => {
    expect(getCardExclusiveItems("STARTER").map((i) => i.name)).toEqual(["Celestial Harp", "Demonic Harp"]);
    expect(getCardExclusiveItems("GOLD").map((i) => i.name)).toEqual(["Crown of Greed", "Royal Cape"]);
    expect(getCardExclusiveItems("PLATINUM").map((i) => i.name)).toEqual(["Platinum Crown", "Void Wings"]);
    expect(getCardExclusiveItems("BLACK").map((i) => i.name)).toEqual(["Celestial Halo", "Emperor's Throne"]);
  });
});

describe("buyItem enforces the card gate", () => {
  const id = "shop-card-exclusive";
  const GUILD = "test-guild";

  async function reset() {
    const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
    if (card) {
      await testPrisma.cardTransaction.deleteMany({ where: { cardId: card.id } });
      await testPrisma.cardStatement.deleteMany({ where: { cardId: card.id } });
      await testPrisma.creditCard.delete({ where: { id: card.id } });
    }
    await testPrisma.bank.deleteMany({ where: { userId: id } });
    await resetUser(id);
  }

  async function giveCard(tier: "STARTER" | "GOLD") {
    const cfg = CARD_TIERS[tier];
    await testPrisma.creditCard.create({
      data: {
        userId: id,
        tier,
        status: "ACTIVE",
        creditLimit: cfg.creditLimit,
        weeklyInterestPct: cfg.weeklyInterestPct,
        weeklySpendCap: cfg.weeklySpendCap,
        weeklyWithdrawCap: cfg.weeklyWithdrawCap,
      },
    });
  }

  beforeEach(async () => {
    await reset();
    await seedUser(id, { wallet: { create: { balance: 50_000_000 } } });
    await seedGeneralShop(GUILD);
    await seedCosmeticsShop(GUILD);
  });

  it("refuses a wallet purchase of a card-exclusive item, even with the coins", async () => {
    await expect(buyItem(GUILD, id, "Celestial Harp")).rejects.toThrow(/card-exclusive/);
  });

  it("refuses a credit purchase when the card tier is too low", async () => {
    await giveCard("STARTER");
    await expect(buyItem(GUILD, id, "Royal Cape", undefined, false, "card")).rejects.toThrow(/needs a \*\*GOLD\*\* Fortuna Card/);
  });

  it("charges the card and hands over the item when the tier qualifies", async () => {
    await giveCard("GOLD");

    const purchase = await buyItem(GUILD, id, "Royal Cape", undefined, false, "card");

    expect(purchase.cardInfo?.currentBalance).toBe(2_500_000);
    const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
    const txs = await testPrisma.cardTransaction.findMany({ where: { cardId: card!.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("PURCHASE");
    const inv = await testPrisma.inventory.findFirst({ where: { userId: id }, include: { shopItem: true } });
    expect(inv?.shopItem.name).toBe("Royal Cape");
    expect(inv?.amount).toBe(1);
  });

  it("still refuses credit-blocked items on a card", async () => {
    await giveCard("GOLD");
    await expect(buyItem(GUILD, id, "Mystery Box", undefined, false, "card")).rejects.toThrow(/cannot be purchased with a credit card/);
  });

  it("lets testers buy a gated item from the wallet", async () => {
    TESTER_IDS.add(id);
    try {
      const purchase = await buyItem(GUILD, id, "Celestial Harp");
      expect(purchase.item.name).toBe("Celestial Harp");
    } finally {
      TESTER_IDS.delete(id);
    }
  });
});
