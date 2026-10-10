import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { claimScholarship, dropout, enroll } from "../../src/services/educationService";

// Claimed scholarship milestones lived only on UserEducation, which dropout
// deletes, so enroll -> study to 75%/100% -> claim -> dropout -> re-enroll
// claimed the same milestones again every cycle (~+25M per cycle on MD/PhD).

const id = "scholar-dropout-1";
const TUITION = 1_000;
let degreeId: string;

async function wallet() {
  return (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
}

async function enrollAtXp(xp: number) {
  await enroll(id, "g1", degreeId);
  await testPrisma.userEducation.update({ where: { userId: id }, data: { educationXp: xp } });
}

beforeEach(async () => {
  await seedUser(id, { intelligence: 100, wallet: { create: { balance: 100_000 } } });
  const deg = await testPrisma.degree.create({
    data: { guildId: "global", name: `ScholarDeg-${Date.now()}`, type: "BACHELORS", tuitionPerSem: TUITION, xpRequired: 600 },
  });
  degreeId = deg.id;
});
afterAll(async () => {
  await resetUser(id);
  await testPrisma.degree.deleteMany({ where: { name: { startsWith: "ScholarDeg-" } } });
});

describe("scholarship milestones survive dropout", () => {
  it("cannot re-claim a milestone after dropping out and re-enrolling", async () => {
    await enrollAtXp(600);
    expect(await claimScholarship(id, "g1", 75)).toBe(TUITION * 1.5);
    await dropout(id, "g1");

    await enrollAtXp(600);
    const before = await wallet();
    await expect(claimScholarship(id, "g1", 75)).rejects.toThrow(/already claimed/i);
    expect(await wallet()).toBe(before);

    // The 100% milestone was never claimed, so it is still available.
    expect(await claimScholarship(id, "g1", 100)).toBe(TUITION * 2);
  });

  it("re-enrolling starts with the milestones already claimed for that degree", async () => {
    await enrollAtXp(600);
    await claimScholarship(id, "g1", 75);
    await dropout(id, "g1");
    await enroll(id, "g1", degreeId);
    const edu = await testPrisma.userEducation.findUnique({ where: { userId: id } });
    expect(edu!.scholarshipsClaimed).toEqual([75]);
  });

  it("works for a user document written before the field existed", async () => {
    await testPrisma.$runCommandRaw({
      update: "User",
      updates: [{ q: { _id: id }, u: { $unset: { scholarshipClaims: "" } } }],
    });
    await enrollAtXp(600);
    expect(await claimScholarship(id, "g1", 75)).toBe(TUITION * 1.5);
    await dropout(id, "g1");
    await enrollAtXp(600);
    await expect(claimScholarship(id, "g1", 75)).rejects.toThrow(/already claimed/i);
  });

  it("pays a milestone once under concurrent claims", async () => {
    await enrollAtXp(600);
    const before = await wallet();
    const results = await Promise.allSettled([claimScholarship(id, "g1", 75), claimScholarship(id, "g1", 75)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await wallet()).toBe(before + TUITION * 1.5);
  });

  it("a pre-fix enrollment's claims are carried over on dropout", async () => {
    // Claimed before the user-level record existed: only the enrollment knows.
    await enrollAtXp(600);
    await testPrisma.userEducation.update({ where: { userId: id }, data: { scholarshipsClaimed: [75] } });
    await testPrisma.$runCommandRaw({
      update: "User",
      updates: [{ q: { _id: id }, u: { $unset: { scholarshipClaims: "" } } }],
    });
    await dropout(id, "g1");
    await enrollAtXp(600);
    await expect(claimScholarship(id, "g1", 75)).rejects.toThrow(/already claimed/i);
  });
});
