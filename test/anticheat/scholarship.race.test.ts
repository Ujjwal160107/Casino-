import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("scholarship CAS", () => {
  const id = "scholar-race-1";
  let eduId: string;
  let degreeId: string;
  beforeEach(async () => {
    await seedUser(id);
    const deg = await testPrisma.degree.create({
      data: { guildId: "global", name: "TestDeg", type: "BACHELORS", tuitionPerSem: 1000, xpRequired: 600 },
    });
    degreeId = deg.id;
    const edu = await testPrisma.userEducation.create({
      data: { userId: id, degreeId: deg.id, educationXp: 600, currentSemester: 1, scholarshipsClaimed: [] },
    });
    eduId = edu.id;
  });
  afterAll(async () => {
    await resetUser(id);
    await testPrisma.degree.deleteMany({ where: { id: degreeId } }).catch(() => {});
  });

  it("only one concurrent claim pushes the milestone", async () => {
    const claim = () => conditionalClaim(() =>
      testPrisma.userEducation.updateMany({
        where: { id: eduId, NOT: { scholarshipsClaimed: { has: 100 } } },
        data: { scholarshipsClaimed: { push: 100 } },
      }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
    const edu = await testPrisma.userEducation.findUnique({ where: { id: eduId } });
    expect(edu?.scholarshipsClaimed).toEqual([100]);
  });
});
