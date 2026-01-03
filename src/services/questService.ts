import prisma from "../utils/prisma";
// Force restart
import { User } from "@prisma/client";

export type QuestType = "WORK" | "GAMBLE" | "WIN_BLACKJACK" | "WIN_COINFLIP" | "WIN_SLOTS" | "WIN_ROULETTE";

interface QuestTask {
    id: string;
    type: QuestType;
    description: string;
    target: number;
    progress: number;
    completed: boolean;
}

export const QUEST_REWARD = {
    money: 50000,
    xp: 500
};

export async function getDailyQuest(userId: string, guildId: string) {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    let quest = await prisma.dailyQuest.findUnique({
        where: {
            userId_dayKey: {
                userId,
                dayKey: today
            }
        }
    });

    if (!quest) {
        quest = await generateDailyQuests(userId, guildId, today);
    }

    return quest;
}

async function generateDailyQuests(userId: string, guildId: string, dayKey: string) {
    const tasks: QuestTask[] = [];
    const possibleTypes: QuestType[] = ["WORK", "GAMBLE", "WIN_BLACKJACK", "WIN_COINFLIP", "WIN_SLOTS", "WIN_ROULETTE"];

    for (let i = 0; i < 5; i++) {
        const type = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
        let target = 1;
        let description = "";

        switch (type) {
            case "WORK":
                target = Math.floor(Math.random() * 3) + 1; // 1-3 times
                description = `Work ${target} time${target > 1 ? "s" : ""}`;
                break;
            case "GAMBLE":
                target = Math.floor(Math.random() * 5) + 3; // 3-7 times
                description = `Play any casino game ${target} times`;
                break;
            case "WIN_BLACKJACK":
                target = Math.floor(Math.random() * 2) + 1;
                description = `Win Blackjack ${target} time${target > 1 ? "s" : ""}`;
                break;
            case "WIN_COINFLIP":
                target = Math.floor(Math.random() * 3) + 1;
                description = `Win Coinflip ${target} time${target > 1 ? "s" : ""}`;
                break;
            case "WIN_SLOTS":
                target = Math.floor(Math.random() * 2) + 1;
                description = `Win Slots ${target} time${target > 1 ? "s" : ""}`;
                break;
            case "WIN_ROULETTE":
                target = Math.floor(Math.random() * 2) + 1;
                description = `Win Roulette ${target} time${target > 1 ? "s" : ""}`;
                break;
        }

        tasks.push({
            id: i.toString(),
            type,
            description,
            target,
            progress: 0,
            completed: false
        });
    }

    return await prisma.dailyQuest.create({
        data: {
            userId,
            guildId,
            dayKey,
            tasks: tasks as any
        }
    });
}

export async function updateQuestProgress(userId: string, type: QuestType, amount: number = 1) {
    const today = new Date().toISOString().split("T")[0];
    const quest = await prisma.dailyQuest.findUnique({
        where: { userId_dayKey: { userId, dayKey: today } }
    });

    if (!quest || quest.completed) return;

    const tasks = quest.tasks as unknown as QuestTask[];
    let updated = false;
    let allCompleted = true;

    for (const task of tasks) {
        if (!task.completed && (task.type === type || (task.type === "GAMBLE" && type.startsWith("WIN_")) || (task.type === "GAMBLE" && type === "GAMBLE"))) {
            // Note: If type is specific WIN_X, it counts for GAMBLE tasks too?
            // Let's refine logic: 
            // If task is GAMBLE, any game counts. 
            // If task is specific (e.g. WIN_BLACKJACK), only that counts.

            if (task.type === "GAMBLE") {
                task.progress += amount;
                updated = true;
            } else if (task.type === type) {
                task.progress += amount;
                updated = true;
            }

            if (task.progress >= task.target) {
                task.progress = task.target;
                task.completed = true;
            }
        }
        if (!task.completed) allCompleted = false;
    }

    if (updated) {
        await prisma.dailyQuest.update({
            where: { id: quest.id },
            data: {
                tasks: tasks as any,
                completed: allCompleted
            }
        });
    }
}

export async function claimQuestReward(userId: string) {
    const today = new Date().toISOString().split("T")[0];
    const quest = await prisma.dailyQuest.findUnique({
        where: { userId_dayKey: { userId, dayKey: today } }
    });

    if (!quest) return { success: false, message: "No quest found." };
    if (!quest.completed) return { success: false, message: "Quests not completed yet." };
    if (quest.rewardClaimed) return { success: false, message: "Reward already claimed." };

    await prisma.$transaction([
        prisma.dailyQuest.update({
            where: { id: quest.id },
            data: { rewardClaimed: true }
        }),
        prisma.wallet.upsert({
            where: { userId },
            update: { balance: { increment: QUEST_REWARD.money } },
            create: { userId, balance: QUEST_REWARD.money }
        }),
        prisma.user.update({
            where: { id: userId },
            data: { xp: { increment: QUEST_REWARD.xp } }
        })
    ]);

    return { success: true, reward: QUEST_REWARD };
}
