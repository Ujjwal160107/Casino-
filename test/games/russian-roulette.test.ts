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
import { debitGameBet } from "../../src/services/gameService";

/** Holds the next join's debit open until `land()`, like a slow DB write. */
function holdNextDebit() {
  let land: (() => void) | undefined;
  vi.mocked(debitGameBet).mockImplementationOnce(() => new Promise<number>((r) => { land = () => r(0); }));
  return () => {
    expect(land).toBeDefined();
    land!();
  };
}

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

describe("russian roulette", () => {
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

  it("refunds every stake when the lobby timer starts a game that cannot run", async () => {
    const channel = { send: vi.fn(async () => { throw new Error("Missing Access"); }) };

    await handleRussianRoulette(fakeMessage("host", channel), ["start", "50000"]);
    await handleRussianRoulette(fakeMessage("guest", channel), ["join"]);

    // The 60s lobby timer starts the game; the opening send is rejected.
    await vi.advanceTimersByTimeAsync(61_000);

    expect(ledger.credits.filter((c) => c.type === "game_win")).toHaveLength(0);
    expect(ledger.credits.filter((c) => c.type === "game_refund").map((c) => c.walletId).sort())
      .toEqual(["w-guest", "w-host"]);
  });

  it("refunds a join whose debit lands after the lobby timed out", async () => {
    const channel = { send: vi.fn() };
    await handleRussianRoulette(fakeMessage("host", channel), ["start", "50000"]);

    const land = holdNextDebit();
    const join = handleRussianRoulette(fakeMessage("late", channel), ["join"]);
    await vi.advanceTimersByTimeAsync(61_000); // only the host had joined: cancelled
    land();
    await join;

    expect(ledger.credits.filter((c) => c.type === "game_refund").map((c) => c.walletId).sort())
      .toEqual(["w-host", "w-late"]);
  });

  it("refunds a join whose debit lands after the game started, and keeps it out of the pot", async () => {
    const channel = { send: vi.fn(async () => ({ id: "game", edit: vi.fn(async () => ({})), reply: vi.fn(async () => ({})) })) };
    await handleRussianRoulette(fakeMessage("host", channel), ["start", "50000"]);
    await handleRussianRoulette(fakeMessage("guest", channel), ["join"]);

    const land = holdNextDebit();
    const join = handleRussianRoulette(fakeMessage("late", channel), ["join"]);
    await vi.advanceTimersByTimeAsync(0);
    await handleRussianRoulette(fakeMessage("host", channel), ["force"]);
    land();
    await join;
    await vi.advanceTimersByTimeAsync(6 * 5_000 + 2_000);

    expect(ledger.credits.filter((c) => c.walletId === "w-late").map((c) => c.type)).toEqual(["game_refund"]);
    // Two real players: the one survivor takes the two-stake pot.
    expect(ledger.credits.filter((c) => c.type === "game_win").map((c) => c.amount)).toEqual([100_000]);
  });
});
