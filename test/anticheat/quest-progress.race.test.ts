import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { updateQuestProgress, QuestTask } from "../../src/services/questService";

// casino:play and casino:win fire back-to-back and each read-modify-wrote the
// whole tasks JSON, so one update erased the other's progress. A casino win
// was also counted twice towards GAMBLE_ANY (once via play, once via WIN_*).

const id = "quest-progress-race-1";

function task(key: string, target: number): QuestTask {
  return { key: key as QuestTask["key"], description: key, difficulty: "EASY", target, progress: 0, completed: false, reward: 1 };
}

async function progress() {
  const quest = await testPrisma.dailyQuest.findFirst({ where: { userId: id } });
  return Object.fromEntries((quest!.tasks as unknown as QuestTask[]).map((t) => [t.key, t.progress]));
}

beforeEach(async () => {
  await seedUser(id);
  await testPrisma.dailyQuest.create({
    data: {
      userId: id,
      dayKey: "qp-race",
      tasks: [task("GAMBLE_ANY", 10), task("WIN_COINFLIP", 5), task("CASINO_GRIND", 10)] as any,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
});
afterAll(() => resetUser(id));

describe("updateQuestProgress", () => {
  it("a coinflip win counts once towards GAMBLE_ANY", async () => {
    // What coinflip emits for a win: casino:play, then casino:win.
    await updateQuestProgress(id, "GAMBLE_ANY");
    await updateQuestProgress(id, "WIN_COINFLIP");
    expect(await progress()).toEqual({ GAMBLE_ANY: 1, WIN_COINFLIP: 1, CASINO_GRIND: 1 });
  });

  it("back-to-back play + win events do not erase each other", async () => {
    await Promise.all([updateQuestProgress(id, "GAMBLE_ANY"), updateQuestProgress(id, "WIN_COINFLIP")]);
    expect(await progress()).toEqual({ GAMBLE_ANY: 1, WIN_COINFLIP: 1, CASINO_GRIND: 1 });
  });

  it("several concurrent plays all land", async () => {
    await Promise.all(Array.from({ length: 5 }, () => updateQuestProgress(id, "GAMBLE_ANY")));
    expect((await progress()).GAMBLE_ANY).toBe(5);
  });
});
