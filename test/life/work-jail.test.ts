import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { testPrisma, testRedis, seedUser, resetUser, flushTestKeys } from "../helpers";
import { fakeButton } from "./harness";

vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => undefined) }));

import { handleLifeInteraction } from "../../src/handlers/lifeInteractionHandler";
import { WORK_EVENTS } from "../../src/data/workEvents";

// The router blocks `work` while jailed, but the Start Shift and work-event
// buttons on an older message skipped that check: jailed players kept working.

const id = "work-jail-1";
const START = 1_000;
const event = WORK_EVENTS.find((e) => e.sector === "all" && e.choices.some((c) => (c.outcome.money ?? 0) > 0))!;
const payingChoice = event.choices.findIndex((c) => (c.outcome.money ?? 0) > 0);

beforeEach(async () => {
  await flushTestKeys(`*${id}*`);
  await seedUser(id, {
    jobId: "srv_waiter",
    isJailed: true,
    jailReleaseTime: new Date(Date.now() + 60 * 60 * 1000),
    wallet: { create: { balance: START } },
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await flushTestKeys(`*${id}*`);
  await resetUser(id);
  await testRedis().quit();
});

describe("work buttons while jailed", () => {
  it("Start Shift refuses a jailed player", async () => {
    const { interaction, shown } = fakeButton("work_shift", id);
    await handleLifeInteraction(interaction);
    expect(shown()).toContain("jailed");
    expect(await testRedis().exists(`ac_claim:work_active:${id}`)).toBe(0);
  });

  it("a work-event choice pays nothing to a jailed player", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // every roll succeeds
    const { interaction } = fakeButton(`work_event_choice_${event.id}_${payingChoice}`, id);
    await handleLifeInteraction(interaction);
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(START);
  });
});
