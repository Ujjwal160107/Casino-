import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { fakeButton } from "./harness";

vi.mock("../../src/utils/discordLogger", () => ({ logToChannel: vi.fn(async () => undefined) }));

import { handleLifeInteraction } from "../../src/handlers/lifeInteractionHandler";
import { checkPromotion } from "../../src/services/jobService";

// Promotion only counted shifts, so a General Practitioner with an MBBS but no
// MD was offered (and given) Surgeon, skipping its degree requirement.

const id = "promo-degree-1";
const MBBS = "MBBS";
const MD = "Doctor of Medicine (MD) / Ph.D.";

async function degree(name: string) {
  return (await testPrisma.degree.findFirst({ where: { name } }))
    ?? testPrisma.degree.create({ data: { guildId: "global", name, type: "TEST" } });
}

async function grant(name: string) {
  const d = await degree(name);
  await testPrisma.userDegree.create({ data: { userId: id, degreeId: d.id, finalGpa: 0 } });
}

beforeEach(async () => {
  await testPrisma.userDegree.deleteMany({ where: { userId: id } });
  await seedUser(id, { jobId: "med_general", shiftsWorked: 30 });
  await grant(MBBS);
});
afterAll(async () => {
  await testPrisma.userDegree.deleteMany({ where: { userId: id } });
  await resetUser(id);
});

describe("promotion degree gate", () => {
  it("is not eligible for Surgeon without the MD, however many shifts", async () => {
    const promo = await checkPromotion({ discordId: id, jobId: "med_general", shiftsWorked: 999 });
    expect(promo.nextJob?.id).toBe("med_surgeon");
    expect(promo.eligible).toBe(false);
    expect(promo.missingDegrees).toEqual([MD]);
  });

  it("the promote button does not promote without the MD", async () => {
    const { interaction, shown } = fakeButton("work_promote_med_surgeon", id);
    await handleLifeInteraction(interaction);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user!.jobId).toBe("med_general");
    expect(shown()).toContain("Doctor of Medicine");
  });

  it("promotes once the MD is held", async () => {
    await grant(MD);
    const { interaction } = fakeButton("work_promote_med_surgeon", id);
    await handleLifeInteraction(interaction);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user!.jobId).toBe("med_surgeon");
  });
});
