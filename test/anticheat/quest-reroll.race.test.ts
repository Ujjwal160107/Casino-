import { describe, it, expect, beforeEach, afterAll } from "vitest";
import prisma from "../../src/utils/prisma";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { rerollQuest, QuestTask } from "../../src/services/questService";

// A reroll rewrites the whole tasks JSON. Written without the updatedAt CAS
// that updateQuestProgress uses, it erased progress an event wrote between
// the reroll's read and its write.

const id = "quest-reroll-race-1";

function task(key: string, target: number): QuestTask {
  return { key: key as QuestTask["key"], description: key, difficulty: "EASY", target, progress: 0, completed: false, reward: 1 };
}

async function tasks() {
  const quest = await testPrisma.dailyQuest.findFirst({ where: { userId: id } });
  return quest!.tasks as unknown as QuestTask[];
}

/** Lands a progress write right after the reroll's first quest read. */
async function withProgressAfterFirstRead<T>(fn: () => Promise<T>): Promise<T> {
  // Swapped by hand: vi.restoreAllMocks cannot restore a Prisma delegate method.
  const delegate = prisma.dailyQuest as any;
  const real = delegate.findFirst;
  const wasOwn = Object.prototype.hasOwnProperty.call(delegate, "findFirst");
  let injected = false;
  delegate.findFirst = async (args: unknown) => {
    const quest = await real.call(delegate, args);
    if (!injected && quest) {
      injected = true;
      const t = quest.tasks as QuestTask[];
      await testPrisma.dailyQuest.update({
        where: { id: quest.id },
        data: { tasks: t.map((x, i) => (i === 0 ? { ...x, progress: 3 } : x)) as any },
      });
    }
    return quest;
  };
  try {
    return await fn();
  } finally {
    if (wasOwn) delegate.findFirst = real;
    else delete delegate.findFirst;
  }
}

describe("rerollQuest", () => {
  beforeEach(async () => {
    await seedUser(id, { wallet: { create: { balance: 50_000 } } });
    await testPrisma.dailyQuest.deleteMany({ where: { userId: id } });
    await testPrisma.dailyQuest.create({
      data: {
        userId: id,
        dayKey: "qr-race",
        tasks: [task("GAMBLE_ANY", 10), task("WIN_COINFLIP", 5)] as any,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  });
  afterAll(() => resetUser(id));

  it("keeps progress written between its read and its write", async () => {
    await withProgressAfterFirstRead(() => rerollQuest(id, 1));

    const after = await tasks();
    expect(after[0].progress).toBe(3);
    expect(after[1].key).not.toBe("WIN_COINFLIP");
  });

  it("charges a paid reroll once even when it has to retry", async () => {
    await testPrisma.dailyQuest.updateMany({ where: { userId: id }, data: { rerollsUsed: 1 } });

    await withProgressAfterFirstRead(() => rerollQuest(id, 1));

    expect((await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance).toBe(0);
    const quest = await testPrisma.dailyQuest.findFirst({ where: { userId: id } });
    expect(quest!.rerollsUsed).toBe(2);
    expect((quest!.tasks as unknown as QuestTask[])[0].progress).toBe(3);
  });
});
