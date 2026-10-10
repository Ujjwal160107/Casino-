import { describe, it, expect } from "vitest";
import { buildMyListingsContainer } from "../../src/commands/economy/market";

// Discord caps a ComponentsV2 message at 40 components, nested ones included.
// My Listings holds up to 5 item + 5 part listings and used to hit 53, so the
// reply was rejected (50035) and the player saw nothing.

function countComponents(node: any): number {
  let n = 1;
  for (const child of node.components ?? []) n += countComponents(child);
  if (node.accessory) n += countComponents(node.accessory);
  return n;
}

const future = new Date(Date.now() + 3_600_000);

describe("My Listings layout", () => {
  it("fits a full board (5 items + 5 parts) under the 40-component cap", () => {
    const listings = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`, amount: 1, totalPrice: 10_000, expiresAt: future, shopItem: { name: `Item ${i}` },
    })) as any;
    const parts = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, amount: 2, totalPrice: 20_000, expiresAt: future, partName: `Part ${i}`,
    })) as any;

    const json = buildMyListingsContainer("owner-1", listings, parts).toJSON();
    expect(countComponents(json)).toBeLessThanOrEqual(40);
    // Every listing still gets its own Cancel button.
    const ids = JSON.stringify(json).match(/bm_(part_)?cancel:/g) ?? [];
    expect(ids.length).toBe(10);
  });
});
