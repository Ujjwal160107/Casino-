import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ledger = vi.hoisted(() => ({ credits: [] as { walletId: string; amount: number; type: string }[] }));

vi.mock("../../src/services/walletService", () => ({
  ensureUserAndWallet: async (discordId: string) => ({ discordId, wallet: { id: `w-${discordId}`, balance: 1_000_000 } }),
}));
vi.mock("../../src/services/gameService", () => ({
  debitGameBet: vi.fn(async () => 0),
  creditGamePayout: vi.fn(async (walletId: string, amount: number, type: string) => {
    ledger.credits.push({ walletId, amount, type });
    return 0;
  }),
}));
vi.mock("../../src/utils/guildContext", () => ({ getGuildPrefix: async () => "!" }));
vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => {}) }));

import { handleRussianRoulette } from "../../src/commands/games/russianRoulette";

function fakeMessage(authorId: string, channel: any) {
  const sent = () => ({ id: "m", edit: vi.fn(async () => ({})), reply: vi.fn(async () => ({})) });
  return {
    author: { id: authorId, username: authorId },
    guildId: "guild",
    channelId: "rr-channel",
    channel,
    client: {},
    guild: { iconURL: () => null },
    reply: vi.fn(async () => sent()),
    delete: vi.fn(async () => {}),
  } as any;
}

describe("russian roulette force start", () => {
  beforeEach(() => {
    ledger.credits = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("forcing a game that is already running does not run it again", async () => {
    const channel = { send: vi.fn(async () => ({ id: "game", edit: vi.fn(async () => ({})), reply: vi.fn(async () => ({})) })) };

    await handleRussianRoulette(fakeMessage("host", channel), ["start", "50000"]);
    await handleRussianRoulette(fakeMessage("guest", channel), ["join"]);
    await handleRussianRoulette(fakeMessage("host", channel), ["force"]);
    await handleRussianRoulette(fakeMessage("host", channel), ["force"]);

    // Six chambers at most, two suspense waits each, then the result delay.
    await vi.advanceTimersByTimeAsync(6 * 5_000 + 2_000);

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(ledger.credits.filter((c) => c.type === "game_win")).toHaveLength(1);
  });
});
