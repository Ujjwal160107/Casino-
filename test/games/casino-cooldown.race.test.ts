import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testRedis, flushTestKeys } from "../helpers";

// Cooldowns and the active-game lock run against the real test Redis; only the
// wallet and the bet itself are stubbed, so we can count how many bets settle.
const placed = vi.hoisted(() => ({ games: [] as string[] }));
vi.mock("../../src/services/walletService", () => ({
  ensureUserAndWallet: async (discordId: string) => ({ discordId, wallet: { id: `w-${discordId}`, balance: 1_000_000 } }),
}));
vi.mock("../../src/services/gameService", () => ({
  placeBetWithTransaction: vi.fn(async (_u: string, _w: string, game: string) => {
    placed.games.push(game);
    return 0;
  }),
}));
vi.mock("../../src/services/shopBuffs", () => ({
  checkLuckyCoin: vi.fn(async () => 1),
  checkCrownOfGreed: async () => 1,
  recordPotentialSoulLedgerLoss: vi.fn(async () => {}),
  getCurrentLuck: async () => 50,
}));
vi.mock("../../src/utils/guildContext", () => ({ getGuildPrefix: async () => "!" }));
vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => {}) }));

import { handleBet } from "../../src/commands/games/roulette";
import { handleSlots } from "../../src/commands/games/slots";
import { checkLuckyCoin } from "../../src/services/shopBuffs";

const id = "casino-cooldown-race";

function fakeMessage() {
  return {
    author: { id, tag: id, toString: () => `<@${id}>`, displayAvatarURL: () => "" },
    guildId: "guild",
    channelId: "chan",
    client: {},
    guild: {},
    reply: vi.fn(async () => ({ delete: vi.fn(async () => {}) })),
    delete: vi.fn(async () => {}),
  } as any;
}

describe("roulette and slots under spam", () => {
  beforeEach(async () => {
    placed.games = [];
    await flushTestKeys(`casino_*${id}`);
  });
  afterAll(async () => {
    await flushTestKeys(`casino_*${id}`);
    await testRedis().quit();
  });

  it("only one of several roulette bets sent during a spin is played", async () => {
    await Promise.all([1, 2, 3].map(() => handleBet(fakeMessage(), ["10000", "red"])));
    expect(placed.games.filter((g) => g === "roulette")).toHaveLength(1);
  });

  it("an invalid roulette choice is refused before a Lucky Coin is spent", async () => {
    vi.mocked(checkLuckyCoin).mockClear();
    await handleBet(fakeMessage(), ["10000", "purple"]);
    expect(checkLuckyCoin).not.toHaveBeenCalled();
    expect(placed.games).toHaveLength(0);
  });

  it("only one of several spammed slot spins is played", async () => {
    await Promise.all([1, 2, 3].map(() => handleSlots(fakeMessage(), ["10000"])));
    expect(placed.games.filter((g) => g === "slots")).toHaveLength(1);
  });
});
