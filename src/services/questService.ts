import prisma from "../utils/prisma";
import { questBus } from "./questEvents";
import { addBalance } from "./walletService";

export type QuestDifficulty = "EASY" | "MEDIUM" | "HARD";

export type QuestKey =
  | "GAMBLE_ANY" | "WIN_COINFLIP" | "WIN_SLOTS" | "WIN_BLACKJACK" | "WIN_ROULETTE" | "HIGH_ROLLER" | "CASINO_GRIND"
  | "WORK_SHIFT" | "WORK_MULTI" | "EARN_WORK"
  | "STUDY" | "STUDY_MULTI" | "PASS_EXAM"
  | "FEED_CHICKEN" | "TRAIN_CHICKEN" | "WIN_COCKFIGHT" | "COCKFIGHT_ANY"
  | "EARN_ANY" | "SPEND_SHOP" | "SELL_MARKET" | "BUY_MARKET" | "DEPOSIT_BANK" | "EARN_BIG"
  | "CLAIM_DAILY" | "CLAIM_WEEKLY" | "USE_CREDIT_CARD" | "PAY_CARD_BILL";

export interface QuestDefinition {
  key: QuestKey;
  description: string;
  difficulty: QuestDifficulty;
  targetRange: [number, number];
  category: "CASINO" | "WORK" | "EDUCATION" | "COCKFIGHT" | "ECONOMY" | "SOCIAL";
  prerequisite?: "HAS_CHICKEN" | "HAS_EDUCATION" | "HAS_CARD";
}

export interface QuestTask {
  key: QuestKey;
  description: string;
  difficulty: QuestDifficulty;
  target: number;
  progress: number;
  completed: boolean;
  reward: number;
}

const DIFFICULTY_REWARDS: Record<QuestDifficulty, number> = {
  EASY: 30_000,
  MEDIUM: 100_000,
  HARD: 300_000,
};

const STREAK_BONUSES: Record<number, number> = {
  2: 0.10, 3: 0.15, 4: 0.20, 5: 0.25, 6: 0.35, 7: 0.50,
};

const QUEST_POOL: QuestDefinition[] = [
  { key: "GAMBLE_ANY", description: "Play any casino game", difficulty: "EASY", targetRange: [3, 5], category: "CASINO" },
  { key: "WIN_COINFLIP", description: "Win a coinflip", difficulty: "EASY", targetRange: [1, 2], category: "CASINO" },
  { key: "WIN_SLOTS", description: "Win at slots", difficulty: "MEDIUM", targetRange: [1, 2], category: "CASINO" },
  { key: "WIN_BLACKJACK", description: "Win at blackjack", difficulty: "MEDIUM", targetRange: [1, 2], category: "CASINO" },
  { key: "WIN_ROULETTE", description: "Win at roulette", difficulty: "MEDIUM", targetRange: [1, 1], category: "CASINO" },
  { key: "HIGH_ROLLER", description: "Place a bet of 500k+", difficulty: "HARD", targetRange: [1, 1], category: "CASINO" },
  { key: "CASINO_GRIND", description: "Play 10 casino games", difficulty: "HARD", targetRange: [10, 10], category: "CASINO" },
  { key: "WORK_SHIFT", description: "Complete a work shift", difficulty: "EASY", targetRange: [1, 2], category: "WORK" },
  { key: "WORK_MULTI", description: "Complete 3 work shifts", difficulty: "MEDIUM", targetRange: [3, 3], category: "WORK" },
  { key: "EARN_WORK", description: "Earn 100k+ from work", difficulty: "MEDIUM", targetRange: [1, 1], category: "WORK" },
  { key: "STUDY", description: "Complete a study session", difficulty: "EASY", targetRange: [1, 2], category: "EDUCATION", prerequisite: "HAS_EDUCATION" },
  { key: "STUDY_MULTI", description: "Study 3 times", difficulty: "MEDIUM", targetRange: [3, 3], category: "EDUCATION", prerequisite: "HAS_EDUCATION" },
  { key: "PASS_EXAM", description: "Pass a final exam", difficulty: "HARD", targetRange: [1, 1], category: "EDUCATION", prerequisite: "HAS_EDUCATION" },
  { key: "FEED_CHICKEN", description: "Feed your chicken", difficulty: "EASY", targetRange: [1, 3], category: "COCKFIGHT", prerequisite: "HAS_CHICKEN" },
  { key: "TRAIN_CHICKEN", description: "Start a training session", difficulty: "EASY", targetRange: [1, 1], category: "COCKFIGHT", prerequisite: "HAS_CHICKEN" },
  { key: "COCKFIGHT_ANY", description: "Participate in a cockfight", difficulty: "EASY", targetRange: [1, 1], category: "COCKFIGHT", prerequisite: "HAS_CHICKEN" },
  { key: "WIN_COCKFIGHT", description: "Win a cockfight", difficulty: "MEDIUM", targetRange: [1, 1], category: "COCKFIGHT", prerequisite: "HAS_CHICKEN" },
  { key: "EARN_ANY", description: "Earn 50k from any source", difficulty: "EASY", targetRange: [1, 1], category: "ECONOMY" },
  { key: "SPEND_SHOP", description: "Buy from any shop", difficulty: "EASY", targetRange: [1, 1], category: "ECONOMY" },
  { key: "DEPOSIT_BANK", description: "Deposit to bank", difficulty: "EASY", targetRange: [1, 1], category: "ECONOMY" },
  { key: "SELL_MARKET", description: "List on the black market", difficulty: "MEDIUM", targetRange: [1, 1], category: "ECONOMY" },
  { key: "BUY_MARKET", description: "Buy from the black market", difficulty: "MEDIUM", targetRange: [1, 1], category: "ECONOMY" },
  { key: "EARN_BIG", description: "Earn 500k from any source", difficulty: "HARD", targetRange: [1, 1], category: "ECONOMY" },
  { key: "CLAIM_DAILY", description: "Claim your daily reward", difficulty: "EASY", targetRange: [1, 1], category: "SOCIAL" },
  { key: "PAY_CARD_BILL", description: "Make a card payment", difficulty: "EASY", targetRange: [1, 1], category: "SOCIAL", prerequisite: "HAS_CARD" },
  { key: "CLAIM_WEEKLY", description: "Claim your weekly reward", difficulty: "MEDIUM", targetRange: [1, 1], category: "SOCIAL" },
  { key: "USE_CREDIT_CARD", description: "Buy with credit card", difficulty: "MEDIUM", targetRange: [1, 1], category: "SOCIAL", prerequisite: "HAS_CARD" },
];

export function getStreakBonus(streak: number): number {
  if (streak < 2) return 0;
  return STREAK_BONUSES[Math.min(streak, 7)] ?? 0.50;
}

async function checkPrerequisite(discordId: string, prereq: string): Promise<boolean> {
  switch (prereq) {
    case "HAS_CHICKEN": {
      const chickenItem = await prisma.shopItem.findFirst({ where: { name: { equals: "Chicken", mode: "insensitive" } } });
      if (!chickenItem) return false;
      const inv = await prisma.inventory.findUnique({ where: { userId_shopItemId: { userId: discordId, shopItemId: chickenItem.id } } });
      return !!(inv && inv.amount >= 1);
    }
    case "HAS_EDUCATION": {
      const edu = await prisma.userEducation.findUnique({ where: { userId: discordId } });
      return !!edu;
    }
    case "HAS_CARD": {
      const card = await prisma.creditCard.findUnique({ where: { userId: discordId } });
      return !!(card && card.status !== "CLOSED");
    }
    default:
      return true;
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function generateTasks(discordId: string): Promise<QuestTask[]> {
  const tasks: QuestTask[] = [];
  const usedKeys = new Set<QuestKey>();

  const pick = async (difficulty: QuestDifficulty): Promise<QuestTask> => {
    const eligible = QUEST_POOL.filter(q => q.difficulty === difficulty && !usedKeys.has(q.key));

    const validQuests: QuestDefinition[] = [];
    for (const q of eligible) {
      if (!q.prerequisite || await checkPrerequisite(discordId, q.prerequisite)) {
        validQuests.push(q);
      }
    }

    const pool = validQuests.length > 0
      ? validQuests
      : QUEST_POOL.filter(q => q.difficulty === difficulty && !q.prerequisite && !usedKeys.has(q.key));

    const quest = pickRandom(pool.length > 0 ? pool : eligible);
    usedKeys.add(quest.key);

    const target = randomInRange(quest.targetRange[0], quest.targetRange[1]);
    return {
      key: quest.key,
      description: quest.description,
      difficulty: quest.difficulty,
      target,
      progress: 0,
      completed: false,
      reward: DIFFICULTY_REWARDS[quest.difficulty],
    };
  };

  tasks.push(await pick("EASY"));
  tasks.push(await pick("EASY"));
  tasks.push(await pick("MEDIUM"));
  tasks.push(await pick("MEDIUM"));
  tasks.push(await pick("HARD"));

  return tasks;
}

export async function getOrCreateDailyQuest(discordId: string) {
  const now = new Date();

  const existing = await prisma.dailyQuest.findFirst({
    where: { userId: discordId, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  const lastQuest = await prisma.dailyQuest.findFirst({
    where: { userId: discordId },
    orderBy: { createdAt: "desc" },
  });

  const user = await prisma.user.findUnique({ where: { discordId } });
  let currentStreak = user?.questStreak ?? 0;

  if (lastQuest) {
    if (!(lastQuest.completed && lastQuest.rewardClaimed)) {
      currentStreak = Math.max(0, currentStreak - 1);
      await prisma.user.update({ where: { discordId }, data: { questStreak: currentStreak } });
    }
  }

  const tasks = await generateTasks(discordId);
  const dayKey = `${now.toISOString().slice(0, 10)}_${now.getTime()}`;

  return prisma.dailyQuest.create({
    data: {
      userId: discordId,
      dayKey,
      tasks: tasks as any,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      assignedAt: now,
    },
  });
}

export async function updateQuestProgress(discordId: string, key: QuestKey, amount: number = 1) {
  const now = new Date();
  const quest = await prisma.dailyQuest.findFirst({
    where: { userId: discordId, expiresAt: { gt: now }, completed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!quest) return;

  const tasks = quest.tasks as unknown as QuestTask[];
  let changed = false;

  for (const task of tasks) {
    if (task.completed) continue;

    let matches = task.key === key;
    if (!matches && key.startsWith("WIN_") && task.key === "GAMBLE_ANY") matches = true;
    if (!matches && key === "GAMBLE_ANY" && task.key === "CASINO_GRIND") matches = true;
    if (!matches && key === "STUDY" && task.key === "STUDY_MULTI") matches = true;
    if (!matches && key === "WORK_SHIFT" && task.key === "WORK_MULTI") matches = true;

    if (matches) {
      task.progress = Math.min(task.target, task.progress + amount);
      if (task.progress >= task.target) task.completed = true;
      changed = true;
    }
  }

  if (!changed) return;

  await prisma.dailyQuest.update({
    where: { id: quest.id },
    data: { tasks: tasks as any, completed: tasks.every(t => t.completed) },
  });
}

export async function claimQuestReward(discordId: string): Promise<{ totalReward: number; streakBonus: number; newStreak: number }> {
  const quest = await prisma.dailyQuest.findFirst({
    where: { userId: discordId, completed: true, rewardClaimed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!quest) throw new Error("No completed quest to claim.");

  const tasks = quest.tasks as unknown as QuestTask[];
  const baseReward = tasks.reduce((sum, t) => sum + t.reward, 0);

  const user = await prisma.user.findUnique({ where: { discordId } });
  const newStreak = (user?.questStreak ?? 0) + 1;
  const bonusPct = getStreakBonus(newStreak);
  const streakBonus = Math.floor(baseReward * bonusPct);
  const totalReward = baseReward + streakBonus;

  await prisma.user.update({
    where: { discordId },
    data: { questStreak: newStreak, lastQuestComplete: new Date() },
  });

  await prisma.dailyQuest.update({
    where: { id: quest.id },
    data: { rewardClaimed: true, totalReward, streakBonus },
  });

  await addBalance(discordId, user?.username ?? "Unknown", totalReward, "quest_reward", { streak: newStreak, bonus: streakBonus }, true);

  return { totalReward, streakBonus, newStreak };
}

export async function rerollQuest(discordId: string, taskIndex: number): Promise<QuestTask> {
  const now = new Date();
  const quest = await prisma.dailyQuest.findFirst({
    where: { userId: discordId, expiresAt: { gt: now }, rewardClaimed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!quest) throw new Error("No active quest.");
  const tasks = quest.tasks as unknown as QuestTask[];
  if (taskIndex < 0 || taskIndex >= tasks.length) throw new Error("Invalid quest index.");
  if (tasks[taskIndex].completed) throw new Error("Cannot reroll a completed quest.");

  const rerolls = quest.rerollsUsed ?? 0;
  if (rerolls >= 3) throw new Error("Max rerolls reached (1 free + 2 paid).");

  if (rerolls >= 1) {
    const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
    if (!wallet || wallet.balance < 50_000) throw new Error("Insufficient funds. Reroll costs **50,000** coins.");
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: 50_000 } } });
  }

  const difficulty = tasks[taskIndex].difficulty;
  const usedKeys = new Set(tasks.map(t => t.key));
  const eligible = QUEST_POOL.filter(q => q.difficulty === difficulty && !usedKeys.has(q.key));

  const validQuests: QuestDefinition[] = [];
  for (const q of eligible) {
    if (!q.prerequisite || await checkPrerequisite(discordId, q.prerequisite)) {
      validQuests.push(q);
    }
  }

  const pool = validQuests.length > 0 ? validQuests : eligible;
  if (pool.length === 0) throw new Error("No alternative quests available.");

  const newDef = pickRandom(pool);
  const target = randomInRange(newDef.targetRange[0], newDef.targetRange[1]);
  const newTask: QuestTask = {
    key: newDef.key,
    description: newDef.description,
    difficulty: newDef.difficulty,
    target,
    progress: 0,
    completed: false,
    reward: DIFFICULTY_REWARDS[newDef.difficulty],
  };

  tasks[taskIndex] = newTask;

  await prisma.dailyQuest.update({
    where: { id: quest.id },
    data: { tasks: tasks as any, rerollsUsed: rerolls + 1 },
  });

  return newTask;
}

// --- Event Bus Listeners ---

export function initQuestListeners() {
  questBus.on("casino:play", ({ discordId, bet }: { discordId: string; bet: number }) => {
    updateQuestProgress(discordId, "GAMBLE_ANY").catch(() => {});
    if (bet >= 500_000) updateQuestProgress(discordId, "HIGH_ROLLER").catch(() => {});
  });
  questBus.on("casino:win", ({ discordId, game }: { discordId: string; game: string }) => {
    updateQuestProgress(discordId, `WIN_${game.toUpperCase()}` as QuestKey).catch(() => {});
  });
  questBus.on("work:complete", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "WORK_SHIFT").catch(() => {});
  });
  questBus.on("work:earn", ({ discordId, amount }: { discordId: string; amount: number }) => {
    if (amount >= 100_000) updateQuestProgress(discordId, "EARN_WORK").catch(() => {});
  });
  questBus.on("education:study", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "STUDY").catch(() => {});
  });
  questBus.on("education:exam_pass", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "PASS_EXAM").catch(() => {});
  });
  questBus.on("cockfight:participate", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "COCKFIGHT_ANY").catch(() => {});
  });
  questBus.on("cockfight:win", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "WIN_COCKFIGHT").catch(() => {});
  });
  questBus.on("cockfight:feed", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "FEED_CHICKEN").catch(() => {});
  });
  questBus.on("cockfight:train", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "TRAIN_CHICKEN").catch(() => {});
  });
  questBus.on("economy:shop_buy", ({ discordId, paymentSource }: { discordId: string; paymentSource?: string }) => {
    updateQuestProgress(discordId, "SPEND_SHOP").catch(() => {});
    if (paymentSource === "card") updateQuestProgress(discordId, "USE_CREDIT_CARD").catch(() => {});
  });
  questBus.on("economy:market_sell", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "SELL_MARKET").catch(() => {});
  });
  questBus.on("economy:market_buy", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "BUY_MARKET").catch(() => {});
  });
  questBus.on("economy:deposit", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "DEPOSIT_BANK").catch(() => {});
  });
  questBus.on("economy:earn", ({ discordId, amount }: { discordId: string; amount: number }) => {
    if (amount >= 50_000) updateQuestProgress(discordId, "EARN_ANY").catch(() => {});
    if (amount >= 500_000) updateQuestProgress(discordId, "EARN_BIG").catch(() => {});
  });
  questBus.on("social:claim_daily", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "CLAIM_DAILY").catch(() => {});
  });
  questBus.on("social:claim_weekly", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "CLAIM_WEEKLY").catch(() => {});
  });
  questBus.on("card:payment", ({ discordId }: { discordId: string }) => {
    updateQuestProgress(discordId, "PAY_CARD_BILL").catch(() => {});
  });
}
