import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { EventEmitter } from "events";
import { testPrisma, seedUser, resetUser } from "../helpers";

vi.mock("../../src/services/walletService", () => ({
  ensureUserAndWallet: async (discordId: string) => ({ discordId }),
}));
vi.mock("../../src/utils/guildContext", () => ({ getGuildPrefix: async () => "!" }));

import { handleChicken } from "../../src/commands/games/chicken";

const id = "chicken-training-stale";
const COST = 500; // level 0 training

let chickenItemId = "";
let collector: EventEmitter;

function fakeMessage() {
  collector = new EventEmitter();
  Object.assign(collector, { stop: vi.fn() });
  const reply = { edit: vi.fn(async () => ({})), createMessageComponentCollector: () => collector };
  return {
    author: { id, username: id, displayAvatarURL: () => "" },
    member: null,
    guildId: "guild",
    reply: vi.fn(async () => reply),
  } as any;
}

function click(customId: string) {
  return { customId, user: { id }, update: vi.fn(async () => {}), reply: vi.fn(async () => {}) };
}

const chickenMeta = async () =>
  (await testPrisma.inventory.findUnique({ where: { userId_shopItemId: { userId: id, shopItemId: chickenItemId } } }))!.meta as any;

// A cockfight lost after the menu opened: the stored chicken is now injured.
async function loseAFight() {
  const meta = await chickenMeta();
  await testPrisma.inventory.update({
    where: { userId_shopItemId: { userId: id, shopItemId: chickenItemId } },
    data: { meta: { ...meta, injured: { endTime: Date.now() + 3_600_000, recoveryHours: 2 } } },
  });
}

describe("chicken training never writes back a stale chicken", () => {
  beforeEach(async () => {
    const item = await testPrisma.shopItem.findFirst({ where: { guildId: "global", name: "Chicken" } })
      ?? await testPrisma.shopItem.create({ data: { guildId: "global", name: "Chicken", price: 1 } });
    chickenItemId = item.id;
    await seedUser(id, { wallet: { create: { balance: 10_000 } } });
  });
  afterAll(() => resetUser(id));

  it("Pay & Start refuses a chicken injured since the prompt opened", async () => {
    await testPrisma.inventory.create({ data: { userId: id, shopItemId: chickenItemId, amount: 1, meta: { level: 0 } } });
    await handleChicken(fakeMessage(), ["train", "strength"]);
    await loseAFight();

    const confirm = click("train_confirm");
    collector.emit("collect", confirm);
    await vi.waitFor(() => expect(confirm.update).toHaveBeenCalled(), { timeout: 5_000 });

    const meta = await chickenMeta();
    expect(meta.injured).toBeDefined();
    expect(meta.training).toBeUndefined();
    expect((await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance).toBe(10_000);
  });

  it("Wake Up keeps an injury the chicken took while the view was open", async () => {
    await testPrisma.inventory.create({
      data: {
        userId: id, shopItemId: chickenItemId, amount: 1,
        meta: { level: 0, xp: 0, training: { stat: "strength", endTime: Date.now() + 600_000, cost: COST } },
      },
    });
    await handleChicken(fakeMessage(), []);
    await loseAFight();

    const wake = click("train_wakeup");
    collector.emit("collect", wake);
    await vi.waitFor(() => expect(wake.update).toHaveBeenCalled(), { timeout: 5_000 });

    const meta = await chickenMeta();
    expect(meta.injured).toBeDefined();
    expect(meta.training).toBeUndefined();
    expect(meta.xp).toBe(10);
  });
});
