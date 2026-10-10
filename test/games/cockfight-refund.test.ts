import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { EventEmitter } from "events";
import { testPrisma, seedUser, resetUser } from "../helpers";

const render = vi.hoisted(() => ({ fail: false }));
vi.mock("../../src/utils/imageUtils", () => ({
  generateVsImage: vi.fn(async () => {
    if (render.fail) throw new Error("canvas exploded");
    return { name: "vs.png" };
  }),
  generateWinnerImage: vi.fn(async () => ({ name: "winner.png" })),
}));
vi.mock("../../src/utils/guildContext", () => ({ getGuildPrefix: async () => "!" }));

import { runCockFight } from "../../src/commands/games/cockfight";
import { acquireActiveGameLock, releaseActiveGameLock } from "../../src/services/casinoCooldownService";

const p1Id = "cockfight-refund-p1";
const p2Id = "cockfight-refund-p2";
const BET = 10_000;

function fighter(discordId: string, walletId: string) {
  const user = { id: discordId, displayAvatarURL: () => "https://example.invalid/a.png" } as any;
  return { user, member: null, displayName: discordId, discordId, walletId };
}

async function balances() {
  const [a, b] = await Promise.all([
    testPrisma.wallet.findUnique({ where: { userId: p1Id } }),
    testPrisma.wallet.findUnique({ where: { userId: p2Id } }),
  ]);
  return [a!.balance, b!.balance];
}

async function setup(editImpl: (n: number) => Promise<unknown>) {
  const w1 = await testPrisma.wallet.findUnique({ where: { userId: p1Id } });
  const w2 = await testPrisma.wallet.findUnique({ where: { userId: p2Id } });
  const collector = new EventEmitter();
  let edits = 0;
  const gameMsg = {
    id: "game-msg",
    edit: vi.fn(() => editImpl(++edits)),
    createMessageComponentCollector: () => collector,
  } as any;
  const originalMsg = { id: "orig-msg", channelId: "chan", guild: { id: "guild" } } as any;
  return { collector, gameMsg, originalMsg, p1: fighter(p1Id, w1!.id), p2: fighter(p2Id, w2!.id) };
}

describe("cockfight refunds a fight that cannot finish", () => {
  beforeEach(async () => {
    render.fail = false;
    await releaseActiveGameLock("cockfight", p1Id);
    await releaseActiveGameLock("cockfight", p2Id);
    await seedUser(p1Id, { wallet: { create: { balance: 50_000 } } });
    await seedUser(p2Id, { wallet: { create: { balance: 50_000 } } });
  });
  afterAll(async () => { await resetUser(p1Id); await resetUser(p2Id); });

  it("hands both entries back when the matchup image fails to render", async () => {
    render.fail = true;
    const { gameMsg, originalMsg, p1, p2 } = await setup(async () => ({}));

    await runCockFight(originalMsg, gameMsg, p1, p2, BET, "000000000000000000000000");

    expect(await balances()).toEqual([50_000, 50_000]);
  });

  it("frees both fighters' game locks when one can't pay the entry", async () => {
    await testPrisma.wallet.update({ where: { userId: p2Id }, data: { balance: BET - 1 } });
    const { gameMsg, originalMsg, p1, p2 } = await setup(async () => ({}));
    expect(await acquireActiveGameLock("cockfight", p1Id)).toBe(true);
    expect(await acquireActiveGameLock("cockfight", p2Id)).toBe(true);

    await runCockFight(originalMsg, gameMsg, p1, p2, BET, "000000000000000000000000");

    expect(await balances()).toEqual([50_000, BET - 1]);
    // Otherwise both stay locked out of cockfights until the 5-minute TTL.
    expect(await acquireActiveGameLock("cockfight", p1Id)).toBe(true);
    expect(await acquireActiveGameLock("cockfight", p2Id)).toBe(true);
  });

  it("hands both entries back when the fight throws after betting closes", async () => {
    // Edit 1 opens betting, edit 2 closes it (caught); edit 3 starts the fight and fails.
    const { collector, gameMsg, originalMsg, p1, p2 } = await setup(async (n) => {
      if (n === 3) throw new Error("Unknown Message");
      return {};
    });

    await runCockFight(originalMsg, gameMsg, p1, p2, BET, "000000000000000000000000");
    expect(await balances()).toEqual([50_000 - BET, 50_000 - BET]);

    collector.emit("end", new Map(), "time");
    await vi.waitFor(async () => expect(await balances()).toEqual([50_000, 50_000]), { timeout: 5_000 });
  });
});
