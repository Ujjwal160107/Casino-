import { describe, it, expect } from "vitest";
import { marketSaleNotice } from "../../src/services/dmNoticeService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb } from "./helpers";

const sale = {
  sellerId: "s",
  name: "Wooden Rifle",
  amount: 2,
  totalPrice: 100_000,
  fees: { sellerFee: 10_000, sellerPayout: 90_000 },
};

describe("marketSaleNotice", () => {
  it("market thumbnail, quantity, item, price, fee, net, and the market hint", () => {
    const c = marketSaleNotice(sale);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Market));
    const t = containerText(c);
    expect(t).toContain("## Your listing sold!");
    expect(t).toContain(
      `**2× Wooden Rifle** sold for **${fmtCurrency(100_000)}**. After the **${fmtCurrency(10_000)}** fee you received **${fmtCurrency(90_000)}**.`,
    );
    expect(t).toContain("-# List more in `!market`. Manage these DMs with `!settings`.");
    expect(t).not.toContain("delinquent card");
  });

  it("mentions garnishment only when some of the payout went to a delinquent card", () => {
    const t = containerText(marketSaleNotice({ ...sale, garnished: 22_500 }));
    expect(t).toContain(`**${fmtCurrency(22_500)}** went to your delinquent card.`);
    expect(containerText(marketSaleNotice({ ...sale, garnished: 0 }))).not.toContain("delinquent card");
  });
});
