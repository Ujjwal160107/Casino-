import { describe, it, expect, vi } from "vitest";

// imageUtils loads the native canvas binding, which settlement never touches.
vi.mock("../../src/utils/imageUtils", () => ({ generateVsImage: vi.fn(), generateWinnerImage: vi.fn() }));

import { settleCockfight, SideBet } from "../../src/commands/games/cockfight";

const side = (userId: string, amount: number, target: "p1" | "p2"): SideBet =>
  ({ userId, displayName: userId, amount, target, walletId: `w-${userId}` });

describe("settleCockfight", () => {
  it("pays the winning fighter only the duel pot, however much was side-bet", () => {
    const { mainWinnerPayout } = settleCockfight(1_000, [side("a", 5_000, "p1"), side("b", 7_000, "p2")], "p1");
    expect(mainWinnerPayout).toBe(2_000);
  });

  it("never pays a winning side stake out twice", () => {
    const bet = 1_000;
    const sideBets = [side("a", 5_000, "p1"), side("b", 3_000, "p1"), side("c", 7_000, "p2")];
    const { mainWinnerPayout, sidePayouts } = settleCockfight(bet, sideBets, "p1");

    expect(sidePayouts.get("a")!.amount).toBe(7_500);
    expect(sidePayouts.get("b")!.amount).toBe(4_500);
    expect(sidePayouts.has("c")).toBe(false);

    // Everything paid back is the duel pot plus 1.5x of the winning side stakes.
    const paid = mainWinnerPayout + [...sidePayouts.values()].reduce((sum, p) => sum + p.amount, 0);
    expect(paid).toBe(2 * bet + 1.5 * 8_000);
  });
});
