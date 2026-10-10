import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { initQuestListeners, QuestTask } from "../../src/services/questService";
import { takeExam } from "../../src/services/educationService";
import { recordShiftOutcome } from "../../src/services/shiftOutcomeService";

// questService listened for education:exam_pass and work:earn, but nothing
// emitted either, so PASS_EXAM and EARN_WORK quests could never complete — and
// an uncompletable task blocks the whole daily reward.

const id = "quest-emits-1";
let degreeId: string;

function task(key: string): QuestTask {
  return { key: key as QuestTask["key"], description: key, difficulty: "HARD", target: 1, progress: 0, completed: false, reward: 1 };
}

async function questTask(key: string): Promise<QuestTask | undefined> {
  const quest = await testPrisma.dailyQuest.findFirst({ where: { userId: id } });
  return (quest!.tasks as unknown as QuestTask[]).find((t) => t.key === key);
}

/** The listeners are fire-and-forget; wait for the write to land. */
async function eventually(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
}

beforeAll(() => initQuestListeners());

beforeEach(async () => {
  await testPrisma.workLog.deleteMany({ where: { userId: id } });
  await testPrisma.userDegree.deleteMany({ where: { userId: id } });
  await seedUser(id, { wallet: { create: { balance: 0 } } });
  const deg = await testPrisma.degree.create({
    data: { guildId: "global", name: `QuestDeg-${Date.now()}`, type: "BACHELORS", xpRequired: 600 },
  });
  degreeId = deg.id;
  await testPrisma.dailyQuest.create({
    data: {
      userId: id,
      dayKey: `qe-${Date.now()}`,
      tasks: [task("PASS_EXAM"), task("EARN_WORK")] as any,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
});
afterAll(async () => {
  await testPrisma.workLog.deleteMany({ where: { userId: id } });
  await testPrisma.userDegree.deleteMany({ where: { userId: id } });
  await resetUser(id);
  await testPrisma.degree.deleteMany({ where: { name: { startsWith: "QuestDeg-" } } });
});

describe("quest events that had no emitter", () => {
  it("passing an exam completes PASS_EXAM", async () => {
    await testPrisma.userEducation.create({ data: { userId: id, degreeId, educationXp: 600 } });
    const res = await takeExam(id, "g1");
    expect(res.success).toBe(true);
    expect(await eventually(async () => !!(await questTask("PASS_EXAM"))?.completed)).toBe(true);
  });

  it("a 100k+ shift payout completes EARN_WORK", async () => {
    await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 150_000 } });
    await recordShiftOutcome({ discordId: id, jobId: "srv_waiter", shiftType: "button", success: true, earnings: 150_000 });
    expect(await eventually(async () => !!(await questTask("EARN_WORK"))?.completed)).toBe(true);
  });
});
