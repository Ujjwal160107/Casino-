import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { fakeButton } from "./harness";

vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => undefined) }));

import { handleLifeInteraction } from "../../src/handlers/lifeInteractionHandler";

// Resigning (and being re-hired) cleared lastShift, which reset the 1h shift
// cooldown: work -> resign -> re-apply -> work again immediately.

const id = "resign-cooldown-1";

beforeEach(async () => {
  await seedUser(id, { jobId: "srv_waiter", lastShift: new Date() });
});
afterAll(() => resetUser(id));

describe("work_resign_confirm", () => {
  it("keeps lastShift so the shift cooldown survives a resignation", async () => {
    const before = (await testPrisma.user.findUnique({ where: { discordId: id } }))!.lastShift;
    const { interaction } = fakeButton("work_resign_confirm", id);
    await handleLifeInteraction(interaction);

    const after = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(after!.jobId).toBeNull();
    expect(after!.lastShift?.getTime()).toBe(before!.getTime());
  });
});
