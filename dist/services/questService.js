"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEST_REWARD = void 0;
exports.getDailyQuest = getDailyQuest;
exports.updateQuestProgress = updateQuestProgress;
exports.claimQuestReward = claimQuestReward;
const prisma_1 = __importDefault(require("../utils/prisma"));
exports.QUEST_REWARD = {
    money: 50000,
    xp: 500
};
async function getDailyQuest(userId, guildId) {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    let quest = await prisma_1.default.dailyQuest.findUnique({
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
async function generateDailyQuests(userId, guildId, dayKey) {
    const tasks = [];
    const possibleTypes = ["WORK", "GAMBLE", "WIN_BLACKJACK", "WIN_COINFLIP", "WIN_SLOTS", "WIN_ROULETTE"];
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
    return await prisma_1.default.dailyQuest.create({
        data: {
            userId,
            guildId,
            dayKey,
            tasks: tasks
        }
    });
}
async function updateQuestProgress(userId, type, amount = 1) {
    const today = new Date().toISOString().split("T")[0];
    const quest = await prisma_1.default.dailyQuest.findUnique({
        where: { userId_dayKey: { userId, dayKey: today } }
    });
    if (!quest || quest.completed)
        return;
    const tasks = quest.tasks;
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
            }
            else if (task.type === type) {
                task.progress += amount;
                updated = true;
            }
            if (task.progress >= task.target) {
                task.progress = task.target;
                task.completed = true;
            }
        }
        if (!task.completed)
            allCompleted = false;
    }
    if (updated) {
        await prisma_1.default.dailyQuest.update({
            where: { id: quest.id },
            data: {
                tasks: tasks,
                completed: allCompleted
            }
        });
    }
}
const guildConfigService_1 = require("./guildConfigService");
async function claimQuestReward(userId) {
    const today = new Date().toISOString().split("T")[0];
    const quest = await prisma_1.default.dailyQuest.findUnique({
        where: { userId_dayKey: { userId, dayKey: today } }
    });
    if (!quest)
        return { success: false, message: "No quest found." };
    if (!quest.completed)
        return { success: false, message: "Quests not completed yet." };
    if (quest.rewardClaimed)
        return { success: false, message: "Reward already claimed." };
    const config = await (0, guildConfigService_1.getGuildConfig)(quest.guildId);
    // Use dynamic config or fallback to defaults (although getGuildConfig should handle defaults, strict typing might miss new fields if client update failed)
    const pay = config.questPay ?? 2500;
    const xpReward = config.questXp ?? 100;
    await prisma_1.default.$transaction([
        prisma_1.default.dailyQuest.update({
            where: { id: quest.id },
            data: { rewardClaimed: true }
        }),
        prisma_1.default.wallet.upsert({
            where: { userId },
            update: { balance: { increment: pay } },
            create: { userId, balance: pay }
        }),
        prisma_1.default.user.update({
            where: { id: userId },
            data: { xp: { increment: xpReward } }
        })
    ]);
    return { success: true, reward: { money: pay, xp: xpReward } };
}
//# sourceMappingURL=questService.js.map