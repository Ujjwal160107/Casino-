import { describe, it, expect } from "vitest";
import { CARD_TIERS, cardTierMeets, formatCardTierName } from "../../src/utils/economyConfig";
import { SHOP_CATALOG, getCardExclusiveItems } from "../../src/utils/shopCatalog";

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
