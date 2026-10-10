import { describe, it, expect, vi } from "vitest";

// blackjack.ts pulls in services that connect on load; createDeck needs none.
vi.mock("../../src/services/walletService", () => ({}));
vi.mock("../../src/services/gameService", () => ({}));
vi.mock("../../src/services/casinoCooldownService", () => ({}));
vi.mock("../../src/services/shopBuffs", () => ({}));
vi.mock("../../src/utils/prisma", () => ({ default: {} }));

import { createDeck } from "../../src/commands/games/blackjack";

describe("createDeck", () => {
  it("is a full 52-card deck", () => {
    const deck = createDeck();
    expect(new Set(deck.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });

  it("deals the card built last first no more often than chance", () => {
    // The deck is built in a fixed order and dealt from the end, so a shuffle
    // that leaves cards near their start makes the first card dealt predictable.
    // Uniform: 20000/52 ≈ 385 (sd ≈ 20). The old random-comparator sort gave ≈ 570.
    const runs = 20_000;
    let lastStayed = 0;
    for (let i = 0; i < runs; i++) {
      const top = createDeck()[51];
      if (top.rank === "A" && top.suit === "♣️") lastStayed++;
    }
    expect(lastStayed).toBeLessThan(500);
  });
});
