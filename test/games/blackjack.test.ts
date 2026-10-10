import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { EventEmitter } from "events";
import { testPrisma, seedUser, resetUser } from "../helpers";

vi.mock("../../src/services/walletService", () => ({
  ensureUserAndWallet: async (discordId: string) => {
    const { testPrisma } = await import("../helpers");
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: discordId } });
    return { discordId, wallet };
  },
}));
vi.mock("../../src/services/casinoCooldownService", () => ({
  checkCasinoCooldown: async () => ({ active: false }),
  setCasinoCooldown: vi.fn(async () => {}),
  formatCasinoCooldownMessage: () => "",
  acquireActiveGameLock: async () => true,
  releaseActiveGameLock: vi.fn(async () => {}),
}));
vi.mock("../../src/services/shopBuffs", () => ({
  checkLuckyCoin: async () => 1,
  checkCrownOfGreed: async () => 1,
  recordPotentialSoulLedgerLoss: vi.fn(async () => {}),
  getCurrentLuck: async () => 50,
}));
vi.mock("../../src/utils/guildContext", () => ({ getGuildPrefix: async () => "!" }));
vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => {}) }));

import { handleBlackjack } from "../../src/commands/games/blackjack";

const id = "blackjack-stake";
const BET = 100_000;

// Deals hands until one isn't a natural blackjack (which settles on the spot),
// and returns its collector and message.
async function dealOpenHand() {
  for (let attempt = 0; attempt < 20; attempt++) {
    await seedUser(id, { wallet: { create: { balance: BET } } });
    const collector = Object.assign(new EventEmitter(), { stop: vi.fn() });
    const msg = { edit: vi.fn(async () => ({})), createMessageComponentCollector: vi.fn(() => collector) };
    const message = {
      author: { id, tag: id, toString: () => `<@${id}>`, displayAvatarURL: () => "" },
      guildId: "guild",
      channelId: "chan",
      client: {},
      guild: {},
      reply: vi.fn(async () => msg),
      delete: vi.fn(async () => {}),
    } as any;
    await handleBlackjack(message, [String(BET)]);
    if (msg.createMessageComponentCollector.mock.calls.length) return { collector, msg };
  }
  throw new Error("dealt 20 natural blackjacks in a row");
}

describe("blackjack stake", () => {
  beforeEach(() => resetUser(id));
  afterAll(() => resetUser(id));

  it("is collected even if the wallet is emptied mid-hand", async () => {
    const { collector, msg } = await dealOpenHand();

    // The player spends everything (a transfer, another game) before standing.
    await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 0 } });

    const interaction = {
      customId: `bj:${id}:stand`,
      deferUpdate: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    };
    collector.emit("collect", interaction);
    await vi.waitFor(() => expect(msg.edit).toHaveBeenCalled(), { timeout: 5_000 });

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    const bets = await testPrisma.transaction.findMany({ where: { walletId: wallet!.id, type: "game_bet" } });
    expect(bets.reduce((sum, t) => sum + t.amount, 0)).toBe(-BET);
    expect(wallet!.balance).toBeGreaterThanOrEqual(0);
  });

  it("settles once when Stand is clicked while a Double is being charged", async () => {
    const { collector, msg } = await dealOpenHand();
    await testPrisma.wallet.update({ where: { userId: id }, data: { balance: BET } });

    const click = (action: string) => ({
      customId: `bj:${id}:${action}`,
      deferUpdate: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
    });
    collector.emit("collect", click("double"));
    collector.emit("collect", click("stand"));
    await vi.waitFor(() => expect(msg.edit).toHaveBeenCalled(), { timeout: 5_000 });
    await new Promise((r) => setTimeout(r, 300));

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    const settlements = await testPrisma.transaction.findMany({
      where: { walletId: wallet!.id, type: { in: ["game_win", "game_loss", "game_refund"] } },
    });
    expect(settlements).toHaveLength(1);
  });
});
