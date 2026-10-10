import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { testPrisma, testRedis, seedUser, resetUser, flushTestKeys } from "../helpers";
import { fakeButton } from "./harness";

vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => undefined) }));

import { handleLifeInteraction } from "../../src/handlers/lifeInteractionHandler";
import { WORK_EVENTS } from "../../src/data/workEvents";
import { seedJobShop } from "../../src/services/shopService";
import { JOB_SHOP_CATALOG } from "../../src/utils/shopCatalog";
import { questBus } from "../../src/services/questEvents";

// Work-event choice buttons paid a shift with no owner check, no one-time
// claim and no cooldown: anyone could click someone's event, and the same
// event could be clicked (or replayed) again and again.

const owner = "work-event-owner";
const bystander = "work-event-bystander";
const START = 1_000;
const event = WORK_EVENTS.find((e) => e.sector === "all" && e.choices.some((c) => (c.outcome.money ?? 0) > 0))!;
const payingChoice = event.choices.findIndex((c) => (c.outcome.money ?? 0) > 0);

/** Shows an event and clicks a paying choice as its owner. */
async function playPayingEvent() {
  const buttons = await showEvent();
  const ticket = JSON.parse((await testRedis().get(`work_event_ticket:${owner}`))!);
  const shownEvent = WORK_EVENTS.find((e) => e.id === ticket.eventId)!;
  const idx = shownEvent.choices.findIndex((c) => (c.outcome.money ?? 0) > 0);
  return buttons.find((b) => b.endsWith(`:${idx}`))!;
}

async function balance(id: string) {
  return (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
}

async function giveUniform(id: string) {
  await seedJobShop("g-life");
  const name = JOB_SHOP_CATALOG.find((i) => i.key === "service_uniform")!.name;
  const item = await testPrisma.shopItem.findFirst({ where: { name } });
  await testPrisma.inventory.create({ data: { userId: id, shopItemId: item!.id, amount: 1, meta: { durability: 100 } } });
}

/** Runs Start Shift with every roll forced low, so an event is shown. Returns its choice button ids. */
async function showEvent(): Promise<string[]> {
  const { interaction, shown } = fakeButton("work_shift", owner);
  await handleLifeInteraction(interaction);
  return [...shown().matchAll(/work_evt:[^"\\]+/g)].map((m) => m[0]);
}

beforeEach(async () => {
  await flushTestKeys(`*work-event-*`);
  await testPrisma.workLog.deleteMany({ where: { userId: { in: [owner, bystander] } } });
  for (const id of [owner, bystander]) {
    await seedUser(id, { jobId: "srv_waiter", wallet: { create: { balance: START } } });
  }
  await giveUniform(owner);
  vi.spyOn(Math, "random").mockReturnValue(0); // event always rolls, choice always succeeds
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await flushTestKeys(`*work-event-*`);
  await testPrisma.workLog.deleteMany({ where: { userId: { in: [owner, bystander] } } });
  await resetUser(owner);
  await resetUser(bystander);
  await testRedis().quit();
});

describe("work event choices", () => {
  it("a replayed legacy event button pays nothing", async () => {
    const { interaction } = fakeButton(`work_event_choice_${event.id}_${payingChoice}`, owner);
    await handleLifeInteraction(interaction);
    expect(await balance(owner)).toBe(START);
  });

  it("showing an event starts the shift cooldown", async () => {
    const buttons = await showEvent();
    expect(buttons.length).toBeGreaterThan(0);
    const user = await testPrisma.user.findUnique({ where: { discordId: owner } });
    expect(user!.lastShift).not.toBeNull();
  });

  it("a bystander cannot resolve someone else's event", async () => {
    const [button] = await showEvent();
    const { interaction } = fakeButton(button, bystander);
    await handleLifeInteraction(interaction);
    expect(await balance(owner)).toBe(START);
    expect(await balance(bystander)).toBe(START);
  });

  it("a double-clicked event pays exactly once", async () => {
    const paying = await playPayingEvent();
    await Promise.all([
      handleLifeInteraction(fakeButton(paying, owner).interaction),
      handleLifeInteraction(fakeButton(paying, owner).interaction),
    ]);
    const paidOnce = await balance(owner);
    expect(paidOnce).toBeGreaterThan(START);

    // ...and the same button stays dead afterwards.
    await handleLifeInteraction(fakeButton(paying, owner).interaction);
    expect(await balance(owner)).toBe(paidOnce);
  });

  // Event shifts paid out through their own path and skipped the income tax,
  // the work log and the work:complete quest event that minigame shifts get.
  it("an event shift is taxed, logged and counted for quests like any shift", async () => {
    const emit = vi.spyOn(questBus, "emit");
    const paying = await playPayingEvent();
    await handleLifeInteraction(fakeButton(paying, owner).interaction);

    const log = await testPrisma.workLog.findFirst({ where: { userId: owner } });
    expect(log).toMatchObject({ shiftType: "event", success: true });
    expect(log!.earnings).toBeGreaterThan(0);

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: owner } });
    const tax = await testPrisma.transaction.findFirst({ where: { walletId: wallet!.id, type: "income_tax" } });
    expect(tax).not.toBeNull();
    expect(wallet!.balance).toBe(START + log!.earnings + tax!.amount);

    expect(emit).toHaveBeenCalledWith("work:complete", { discordId: owner });
  });
});
