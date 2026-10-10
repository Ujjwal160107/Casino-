import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { fakeButton } from "./harness";

vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => undefined) }));

import { handleLifeInteraction } from "../../src/handlers/lifeInteractionHandler";

// The dropout prompt is public and dropout acts on whoever clicks. With an
// owner-less customId, a bystander clicking someone else's prompt dropped out
// of THEIR OWN degree.

const owner = "dropout-owner";
const bystander = "dropout-bystander";
let degreeId: string;

async function enrolled(id: string) {
  return !!(await testPrisma.userEducation.findUnique({ where: { userId: id } }));
}

beforeEach(async () => {
  const deg = await testPrisma.degree.create({
    data: { guildId: "global", name: `DropoutDeg-${Date.now()}`, type: "BACHELORS", tuitionPerSem: 1000, xpRequired: 600 },
  });
  degreeId = deg.id;
  for (const id of [owner, bystander]) {
    await seedUser(id);
    await testPrisma.userEducation.create({ data: { userId: id, degreeId } });
  }
});
afterAll(async () => {
  await resetUser(owner);
  await resetUser(bystander);
  await testPrisma.degree.deleteMany({ where: { name: { startsWith: "DropoutDeg-" } } });
});

describe("dropout_confirm ownership", () => {
  it("a bystander clicking an owner-less (legacy) prompt keeps their degree", async () => {
    const { interaction } = fakeButton("dropout_confirm", bystander);
    await handleLifeInteraction(interaction);
    expect(await enrolled(bystander)).toBe(true);
  });

  it("a bystander clicking someone else's prompt changes nobody's enrollment", async () => {
    const { interaction, shown } = fakeButton(`dropout_confirm:${owner}`, bystander);
    await handleLifeInteraction(interaction);
    expect(await enrolled(bystander)).toBe(true);
    expect(await enrolled(owner)).toBe(true);
    expect(shown()).toContain("not for you");
  });

  it("the owner can still drop out from their own prompt", async () => {
    const { interaction } = fakeButton(`dropout_confirm:${owner}`, owner);
    await handleLifeInteraction(interaction);
    expect(await enrolled(owner)).toBe(false);
    expect(await enrolled(bystander)).toBe(true);
  });
});
