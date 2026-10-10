import { describe, it, expect, vi } from "vitest";
import { ComponentType } from "discord.js";

// hunt.ts imports services that open Redis/Mongo connections on load; the
// card builder itself needs none of them.
vi.mock("../../src/services/huntService", () => ({ hunt: vi.fn() }));
vi.mock("../../src/services/shopService", () => ({ seedHuntShop: vi.fn() }));
vi.mock("../../src/services/huntCraftService", () => ({ buildHuntCraftPayload: vi.fn() }));
vi.mock("../../src/utils/prisma", () => ({ default: {} }));

import { buildHuntResultPayload, reattachMedia, removeHuntGroups } from "../../src/commands/games/hunt";
import { getAnimal } from "../../src/utils/animalCatalog";

const group = (key: string, count: number) => ({ animalKey: key, count, def: getAnimal(key)!, ids: [] });

function resultCard(...keys: string[]) {
  const payload = buildHuntResultPayload("owner", keys.map((k) => group(k, 1)), "wooden rifle", [], true);
  return payload.components[0].toJSON();
}

const text = (container: any) => JSON.stringify(container);
const types = (container: any) => container.components.map((c: any) => c.type);

describe("removeHuntGroups", () => {
  it("drops the sold animal's block and keeps the others", () => {
    const card = removeHuntGroups(resultCard("rabbit", "squirrel"), (key) => key === "rabbit");

    expect(text(card)).not.toContain("hunt_sell:rabbit:owner");
    expect(text(card)).not.toContain("**Rabbit**");
    expect(text(card)).toContain("hunt_sell:squirrel:owner");
    expect(text(card)).toContain("**Squirrel**");
  });

  it("never leaves two dividers in a row or one right under the header", () => {
    for (const removed of ["rabbit", "squirrel"]) {
      const kinds = types(removeHuntGroups(resultCard("rabbit", "squirrel"), (key) => key === removed));
      expect(kinds[1]).not.toBe(ComponentType.Separator);
      kinds.forEach((kind: number, i: number) => {
        if (kind === ComponentType.Separator) expect(kinds[i + 1]).not.toBe(ComponentType.Separator);
      });
    }
  });

  it("keeps the header, next-hunt line and Sell All row when every animal is gone", () => {
    const card = removeHuntGroups(resultCard("rabbit", "squirrel"), () => true);

    expect(text(card)).toContain("## Hunt Results");
    expect(text(card)).toContain("Next hunt");
    expect(text(card)).toContain("hunt_sell_all:owner");
    expect(text(card)).not.toContain("hunt_sell:");
  });
});

describe("reattachMedia", () => {
  it("points thumbnails back at the message's own attachments", () => {
    const card = {
      type: ComponentType.Container,
      components: [{
        type: ComponentType.Section,
        components: [],
        accessory: {
          type: ComponentType.Thumbnail,
          media: { url: "https://cdn.discordapp.com/attachments/1/2/hunt_rabbit_rabbit.png?ex=abc&is=def", proxy_url: "x", width: 64 },
        },
      }],
    } as any;

    const fixed = reattachMedia(card, [{ url: "https://cdn.discordapp.com/attachments/1/2/hunt_rabbit_rabbit.png?ex=zzz", name: "hunt_rabbit_rabbit.png" }]);

    expect(fixed.components[0].accessory.media).toEqual({ url: "attachment://hunt_rabbit_rabbit.png" });
  });
});
