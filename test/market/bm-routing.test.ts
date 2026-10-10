import { describe, it, expect, vi } from "vitest";
import { handleBlackMarketInteraction } from "../../src/commands/economy/market";

// Black Market buttons on ephemeral replies were dead: the only collector was
// bound to the hub message. They are now routed by customId from index.ts.

function fakeInteraction(customId: string, userId: string): any {
  return {
    customId,
    user: { id: userId },
    replied: false,
    deferred: false,
    reply: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    isStringSelectMenu: () => false,
  };
}

describe("handleBlackMarketInteraction", () => {
  it("refuses someone else's button, taking the owner from the customId", async () => {
    const interaction = fakeInteraction("bm_browse:2:owner-1", "intruder");
    expect(await handleBlackMarketInteraction(interaction)).toBe(true);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: "Not yours." }));
  });

  it("handles a button that lives on an ephemeral reply (purchase cancel)", async () => {
    const interaction = fakeInteraction("bm_buy_cancel:owner-1", "owner-1");
    expect(await handleBlackMarketInteraction(interaction)).toBe(true);
    expect(interaction.update).toHaveBeenCalled();
  });

  it("leaves ids it doesn't own to the next router", async () => {
    const interaction = fakeInteraction("bm_unknown:owner-1", "owner-1");
    expect(await handleBlackMarketInteraction(interaction)).toBe(false);
  });
});
