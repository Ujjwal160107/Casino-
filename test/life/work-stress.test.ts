import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { createRequire } from "module";
import { resolve } from "path";
import { testPrisma, testRedis, seedUser, resetUser, flushTestKeys } from "../helpers";
import { fakeButton } from "./harness";

vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => undefined) }));

import { handleLifeInteraction } from "../../src/handlers/lifeInteractionHandler";
import { seedJobShop } from "../../src/services/shopService";
import { JOB_SHOP_CATALOG } from "../../src/utils/shopCatalog";

// Burnout (+5) and the shift-success path (+5, +25 on a failed Corporate
// Blessing) incremented jobStress with no cap, unlike the fail/event branches,
// so stress climbed past 100.

const id = "work-stress-1";

// The handler require()s minigameService at click time; patch that (Node-cache)
// instance so the shift plays a one-button game the fake player answers right.
const nodeRequire = createRequire(import.meta.url);
const minigames = nodeRequire(resolve(__dirname, "../../src/services/minigameService.ts"));
const realGetWorkGameForUser = minigames.getWorkGameForUser;
const winnableGame = { type: "button", title: "T", description: "D", answer: "A", options: ["A"], time: 5 };
const answerA = { awaitMessageComponent: async () => ({ customId: "work_game_0_A", deferUpdate: async () => undefined }) };

async function stress() {
  return (await testPrisma.user.findUnique({ where: { discordId: id } }))!.jobStress;
}

beforeEach(async () => {
  await flushTestKeys(`*${id}*`);
  await testPrisma.workLog.deleteMany({ where: { userId: id } });
  await seedUser(id, { jobId: "srv_waiter", jobStress: 98, wallet: { create: { balance: 1_000 } } });
  await seedJobShop("g-life");
  const name = JOB_SHOP_CATALOG.find((i) => i.key === "service_uniform")!.name;
  const item = await testPrisma.shopItem.findFirst({ where: { name } });
  await testPrisma.inventory.create({ data: { userId: id, shopItemId: item!.id, amount: 1, meta: { durability: 100 } } });
  minigames.getWorkGameForUser = async () => winnableGame;
});
afterEach(() => {
  vi.restoreAllMocks();
  minigames.getWorkGameForUser = realGetWorkGameForUser;
});
afterAll(async () => {
  await flushTestKeys(`*${id}*`);
  await testPrisma.workLog.deleteMany({ where: { userId: id } });
  await resetUser(id);
  await testRedis().quit();
});

describe("jobStress stays within 0..100", () => {
  it("burnout caps stress at 100", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // burnout rolls (< 0.5)
    await handleLifeInteraction(fakeButton("work_shift", id).interaction);
    expect(await stress()).toBe(100);
  });

  it("a won shift with a failed Corporate Blessing caps stress at 100", async () => {
    await testRedis().set(`corporate_blessing:${id}`, JSON.stringify({ active: true }), "EX", 60);
    vi.spyOn(Math, "random").mockReturnValue(0.6); // no burnout, no event, blessing fails
    await handleLifeInteraction(fakeButton("work_shift", id, answerA).interaction);

    const log = await testPrisma.workLog.findFirst({ where: { userId: id } });
    expect(log?.success).toBe(true); // the shift really was won
    expect(await stress()).toBe(100);
  });
});
