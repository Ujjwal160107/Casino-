import { describe, it, expect } from "vitest";
import { buildItemInfoCard } from "../../src/commands/economy/shop";
import { getCatalogItem } from "../../src/utils/shopCatalog";

// Builder-only: the item detail card is the one place a shopper learns an
// item is card-exclusive, so its buttons and hints are pinned here.

const cape = getCatalogItem("royal_cape")!;   // GOLD-exclusive
const shield = getCatalogItem("tax_shield")!; // ordinary item

function render(item: typeof cape, card: { status: string; tier: string } | null) {
  const payload = buildItemInfoCard(item, "u", card);
  const [container, row] = payload.components as any[];
  return {
    text: JSON.stringify(container.toJSON()),
    buttons: row.toJSON().components as Array<{ custom_id: string; disabled?: boolean }>,
  };
}

describe("buildItemInfoCard for a card-exclusive item", () => {
  it("hides the wallet button and disables credit when the shopper has no card", () => {
    const { text, buttons } = render(cape, null);
    expect(text).toContain("Gold Card exclusive");
    expect(buttons.map((b) => b.custom_id)).toEqual(["shop_buy_card:royal_cape:u"]);
    expect(buttons[0].disabled).toBe(true);
    expect(text).toContain("Requires an active **Gold** Fortuna Card");
  });

  it("tells a lower-tier holder to upgrade", () => {
    const { text, buttons } = render(cape, { status: "ACTIVE", tier: "STARTER" });
    expect(buttons[0].disabled).toBe(true);
    expect(text).toContain("Your **Starter** card doesn't qualify");
  });

  it("treats a non-active card like no card", () => {
    const { text, buttons } = render(cape, { status: "LOCKED", tier: "BLACK" });
    expect(buttons[0].disabled).toBe(true);
    expect(text).toContain("Requires an active **Gold** Fortuna Card");
  });

  it("enables credit when the card qualifies", () => {
    const { buttons } = render(cape, { status: "ACTIVE", tier: "PLATINUM" });
    expect(buttons[0].disabled).toBeFalsy();
  });
});

describe("buildItemInfoCard for an ordinary item", () => {
  it("keeps the wallet button and offers credit to an active card", () => {
    const { text, buttons } = render(shield, { status: "ACTIVE", tier: "STARTER" });
    expect(buttons.map((b) => b.custom_id)).toEqual(["shop_buy:tax_shield:u", "shop_buy_card:tax_shield:u"]);
    expect(text).not.toContain("Card exclusive");
  });

  it("keeps the wallet button and the apply hint without a card", () => {
    const { text, buttons } = render(shield, null);
    expect(buttons.map((b) => b.custom_id)).toEqual(["shop_buy:tax_shield:u"]);
    expect(text).toContain("Credit purchases require an **ACTIVE** Fortuna Card");
  });
});
