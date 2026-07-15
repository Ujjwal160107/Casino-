import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("quest reward CAS", () => {
  const id = "quest-race-1";
  let questId: string;
  beforeEach(async () => {
    await seedUser(id);
    const q = await testPrisma.dailyQuest.create({
      data: {
        userId: id, dayKey: "2026-07-14",
        tasks: [{ key: "x", reward: 30000, completed: true, difficulty: "EASY" }],
        completed: true, rewardClaimed: false,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    questId = q.id;
  });
  afterAll(() => resetUser(id));

  it("only one concurrent claim flips rewardClaimed", async () => {
    const claim = () => conditionalClaim(() =>
      testPrisma.dailyQuest.updateMany({
        where: { id: questId, rewardClaimed: false },
        data: { rewardClaimed: true, totalReward: 30000, streakBonus: 0 },
      }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
