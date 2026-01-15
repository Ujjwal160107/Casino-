"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndSeedDegrees = checkAndSeedDegrees;
exports.getDegrees = getDegrees;
exports.enroll = enroll;
exports.study = study;
exports.takeExam = takeExam;
exports.claimScholarship = claimScholarship;
exports.dropout = dropout;
exports.reduceStress = reduceStress;
exports.getStressCost = getStressCost;
const prisma_1 = __importDefault(require("../utils/prisma"));
const branding_1 = require("../config/branding");
const guildConfigService_1 = require("./guildConfigService");
const userService_1 = require("./userService");
async function checkAndSeedDegrees(guildId) {
    // 1. High School (Foundation)
    let hs = await prisma_1.default.degree.findFirst({ where: { guildId, name: "High School Diploma" } });
    if (hs) {
        // Enforce the new scale on existing record
        hs = await prisma_1.default.degree.update({
            where: { id: hs.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, type: "HS", totalSemesters: 1 }
        });
    }
    else {
        hs = await prisma_1.default.degree.create({
            data: { guildId, name: "High School Diploma", type: "HS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 0, intelligenceBoost: 1 }
        });
    }
    // 2. Community College
    let trade = await prisma_1.default.degree.findFirst({ where: { guildId, name: "Trade License (Plumbing)" } });
    if (trade) {
        await prisma_1.default.degree.update({
            where: { id: trade.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, minIntelligence: 2, totalSemesters: 1 }
        });
    }
    else {
        await prisma_1.default.degree.create({
            data: { guildId, name: "Trade License (Plumbing)", type: "TRADE", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 500, intelligenceBoost: 1, incomeMulti: 0.2, minIntelligence: 2, requiredDegreeId: hs.id }
        });
    }
    // 3. Bachelors (CS)
    let bsCS = await prisma_1.default.degree.findFirst({ where: { guildId, name: "BS Computer Science" } });
    if (bsCS) {
        bsCS = await prisma_1.default.degree.update({
            where: { id: bsCS.id },
            data: { passGpa: 6.0, intelligenceBoost: 2, minIntelligence: 5, totalSemesters: 1 }
        });
    }
    else {
        bsCS = await prisma_1.default.degree.create({
            data: { guildId, name: "BS Computer Science", type: "BACHELORS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 5000, intelligenceBoost: 2, incomeMulti: 0.5, minIntelligence: 5, requiredDegreeId: hs.id }
        });
    }
    // Bachelors (Arts)
    let baArts = await prisma_1.default.degree.findFirst({ where: { guildId, name: "BA Fine Arts" } });
    if (baArts) {
        await prisma_1.default.degree.update({
            where: { id: baArts.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, minIntelligence: 4, totalSemesters: 1 }
        });
    }
    else {
        await prisma_1.default.degree.create({
            data: { guildId, name: "BA Fine Arts", type: "BACHELORS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 4000, intelligenceBoost: 1, incomeMulti: 0.3, minIntelligence: 4, requiredDegreeId: hs.id }
        });
    }
    // 5. MBBS (New)
    let mbbs = await prisma_1.default.degree.findFirst({ where: { guildId, name: "MBBS" } });
    if (mbbs) {
        mbbs = await prisma_1.default.degree.update({
            where: { id: mbbs.id },
            data: { passGpa: 6.0, intelligenceBoost: 3, minIntelligence: 6, incomeMulti: 1.5, totalSemesters: 1 }
        });
    }
    else {
        mbbs = await prisma_1.default.degree.create({
            data: { guildId, name: "MBBS", type: "MBBS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 8000, intelligenceBoost: 3, incomeMulti: 1.5, minIntelligence: 6, requiredDegreeId: hs.id }
        });
    }
    // 6. Med School (MD)
    const md = await prisma_1.default.degree.findFirst({ where: { guildId, name: "Doctor of Medicine (MD)" } });
    if (md) {
        await prisma_1.default.degree.update({
            where: { id: md.id },
            data: { passGpa: 6.0, intelligenceBoost: 5, minIntelligence: 8, requiredDegreeId: mbbs.id, totalSemesters: 1 }
        });
    }
    else {
        await prisma_1.default.degree.create({
            data: { guildId, name: "Doctor of Medicine (MD)", type: "MD", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 15000, intelligenceBoost: 5, incomeMulti: 2.5, minIntelligence: 8, requiredDegreeId: mbbs.id }
        });
    }
    // 7. Law (LLB)
    let llb = await prisma_1.default.degree.findFirst({ where: { guildId, name: "Bachelor of Laws (LLB)" } });
    if (llb) {
        llb = await prisma_1.default.degree.update({
            where: { id: llb.id },
            data: { passGpa: 6.0, intelligenceBoost: 3, minIntelligence: 6, incomeMulti: 1.5, totalSemesters: 1 }
        });
    }
    else {
        llb = await prisma_1.default.degree.create({
            data: { guildId, name: "Bachelor of Laws (LLB)", type: "LLB", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 8000, intelligenceBoost: 3, incomeMulti: 1.5, minIntelligence: 6, requiredDegreeId: hs.id }
        });
    }
    // 8. Law (LLM)
    const llm = await prisma_1.default.degree.findFirst({ where: { guildId, name: "Master of Laws (LLM)" } });
    if (llm) {
        await prisma_1.default.degree.update({
            where: { id: llm.id },
            data: { passGpa: 6.0, intelligenceBoost: 5, minIntelligence: 8, requiredDegreeId: llb.id, totalSemesters: 1 }
        });
    }
    else {
        await prisma_1.default.degree.create({
            data: { guildId, name: "Master of Laws (LLM)", type: "LLM", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 15000, intelligenceBoost: 5, incomeMulti: 2.5, minIntelligence: 8, requiredDegreeId: llb.id }
        });
    }
}
async function getDegrees(guildId) {
    // Optimization: Check if degrees exist before running the expensive seed check
    const count = await prisma_1.default.degree.count({ where: { guildId } });
    if (count < 8) {
        await checkAndSeedDegrees(guildId);
    }
    return prisma_1.default.degree.findMany({ where: { guildId }, include: { requiredDegree: true }, orderBy: { minIntelligence: 'asc' } });
}
async function enroll(userId, guildId, degreeId) {
    const degree = await prisma_1.default.degree.findUnique({ where: { id: degreeId } });
    if (!degree)
        throw new Error("Degree not found.");
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { wallet: true, currentEducation: true, degrees: true }
    });
    if (!user)
        throw new Error("User not found.");
    if (user.currentEducation)
        throw new Error(`You are already enrolled in **${user.currentEducation.degreeId}** (Sem ${user.currentEducation.currentSemester}). Finish it or drop out.`);
    // Check if already completed
    if (user.degrees.some(d => d.degreeId === degreeId)) {
        throw new Error("You already have this degree.");
    }
    // Check Int
    if (user.intelligence < degree.minIntelligence) {
        throw new Error(`You are not smart enough! Req: ${degree.minIntelligence} Int. (You: ${user.intelligence})`);
    }
    // Check Prereqs
    if (degree.requiredDegreeId) {
        const hasPrereq = user.degrees.some(d => d.degreeId === degree.requiredDegreeId);
        if (!hasPrereq)
            throw new Error("Missing prerequisite degree.");
    }
    // Pay Tuition (First Sem)
    if (user.wallet.balance < degree.tuitionPerSem) {
        throw new Error(`Insufficient funds for Degree Fee (${degree.tuitionPerSem}).`);
    }
    const result = await prisma_1.default.$transaction(async (tx) => {
        await tx.wallet.update({
            where: { id: user.wallet.id },
            data: { balance: { decrement: degree.tuitionPerSem } }
        });
        return tx.userEducation.create({
            data: {
                userId: user.id,
                degreeId: degree.id,
                currentSemester: 1,
                currentGpa: 0.0, // Start fresh (0-10 scale)
                stress: 0
            },
            include: { degree: true }
        });
    });
    await (0, userService_1.invalidateUserCache)(userId, guildId);
    return result;
}
async function study(userId, guildId, bonusGpa = 0) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });
    if (!user || !user.currentEducation)
        throw new Error("You are not enrolled in any school.");
    const edu = user.currentEducation;
    // RNG Logic
    // Intelligence makes studying more effective.
    // Discipline reduces stress accumulation.
    // Check for Textbooks in Inventory
    const inventory = await prisma_1.default.inventory.findMany({
        where: { userId: user.id, guildId, shopItem: { itemType: "UNI_BOOK" } },
        include: { shopItem: true }
    });
    let extraGpa = 0;
    let bookUsedMsg = "";
    // Prioritize best book? Or just first found. Let's use best.
    const bestBook = inventory.sort((a, b) => (b.shopItem.price - a.shopItem.price))[0];
    if (bestBook) {
        // Apply effect
        const effect = bestBook.shopItem.effects?.find(e => e.type === "STUDY_BOOST");
        if (effect) {
            extraGpa = effect.value || 0.2;
            bookUsedMsg = `\n📚 Used **${bestBook.shopItem.name}** (+${extraGpa} Int).`;
            // Decrement Uses
            if (bestBook.shopItem.maxUses) {
                const meta = bestBook.meta || {};
                let usesLeft = meta.usesLeft !== undefined ? meta.usesLeft : bestBook.shopItem.maxUses;
                usesLeft -= 1;
                if (usesLeft <= 0) {
                    // Break the book
                    await prisma_1.default.inventory.delete({ where: { id: bestBook.id } });
                    bookUsedMsg += ` (Broken!)`;
                }
                else {
                    await prisma_1.default.inventory.update({
                        where: { id: bestBook.id },
                        data: { meta: { ...meta, usesLeft } }
                    });
                    bookUsedMsg += ` (${usesLeft} uses left)`;
                }
            }
        }
    }
    // 2 Studies = 1 Bar (1 Point). So 1 Study = 0.5 Points.
    const gpaGain = 0.5 + extraGpa + bonusGpa;
    const stressGain = Math.max(5, 20 - (user.discipline * 0.2));
    let newGpa = Math.min(10.0, edu.currentGpa + gpaGain);
    let newStress = Math.min(100, edu.stress + stressGain);
    let msg = `You studied hard! Intelligence: ${edu.currentGpa.toFixed(1)} -> **${newGpa.toFixed(1)}**. Stress +${stressGain}.`;
    if (bonusGpa > 0)
        msg += ` (Includes +${bonusGpa} from interactive bonus!)`;
    msg += bookUsedMsg;
    // Random Events (15% chance)
    if (Math.random() < 0.15) {
        const events = [
            { type: "good", msg: "💡 You found a fantastic video tutorial on the topic!", gpaMod: 0.3, stressMod: -5 },
            { type: "good", msg: "🧘 You felt incredibly focused today.", gpaMod: 0.2, stressMod: -10 },
            { type: "bad", msg: "📉 The professor assigned a surprise 10-page essay.", gpaMod: 0, stressMod: 15 },
            { type: "bad", msg: "🔊 Your roommates were partying while you studied.", gpaMod: -0.1, stressMod: 10 },
            { type: "horrible", msg: "💻 Your laptop crashed and you lost your notes!", gpaMod: -0.5, stressMod: 20 }
        ];
        const event = events[Math.floor(Math.random() * events.length)];
        // Apply mods
        newGpa = Math.max(0, Math.min(10, newGpa + event.gpaMod));
        newStress = Math.max(0, Math.min(100, newStress + event.stressMod));
        let icon = event.type === "good" ? branding_1.Mascot.Emotes.Success : (event.type === "horrible" ? branding_1.Mascot.Emotes.Alert : branding_1.Mascot.Emotes.Fail);
        msg += `\n\n${icon} **Event:** ${event.msg} (${event.gpaMod > 0 ? '+' : ''}${event.gpaMod} Int, ${event.stressMod > 0 ? '+' : ''}${event.stressMod} Stress)`;
    }
    // Burnout Check (Separate overriding event)
    if (newStress > 90 && Math.random() < 0.25) {
        newGpa = Math.max(0, newGpa - 1.0);
        msg += `\n\n${branding_1.Mascot.Emotes.Alert} **BURNOUT!** You pushed yourself too hard. Intelligence dropped by **1.0**. Take a break!`;
    }
    await prisma_1.default.userEducation.update({
        where: { id: edu.id },
        data: {
            currentGpa: newGpa,
            stress: newStress,
            lastStudy: new Date()
        }
    });
    await (0, userService_1.invalidateUserCache)(userId, guildId);
    let scholarship = null;
    const floorGpa = Math.floor(newGpa);
    if ([9, 10].includes(floorGpa)) {
        if (!edu.scholarshipsClaimed.includes(floorGpa)) {
            // Eligible!
            let multiplier = 1.5;
            if (floorGpa === 10)
                multiplier = 2;
            const amount = edu.degree.tuitionPerSem * edu.currentSemester * multiplier;
            scholarship = { milestone: floorGpa, amount };
        }
    }
    return { msg, newGpa, newStress, scholarship };
}
async function takeExam(userId, guildId) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });
    if (!user || !user.currentEducation)
        throw new Error("Not enrolled.");
    const edu = user.currentEducation;
    const deg = edu.degree;
    const PASS_REQ = 6.0;
    // Check for Cheat Sheet / Exam Boost
    // Clean expired first
    await prisma_1.default.activeEffect.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const boostEffect = await prisma_1.default.activeEffect.findFirst({
        where: { userId: user.id, guildId, effectType: "EXAM_BOOST" }
    });
    const boost = boostEffect ? boostEffect.value : 0;
    const effectiveGpa = edu.currentGpa + boost;
    if (effectiveGpa < PASS_REQ) {
        // Failed
        let failMsg = `Your intelligence (**${edu.currentGpa.toFixed(1)}**) is too low. You need **${PASS_REQ.toFixed(1)}** to pass.`;
        if (boost > 0)
            failMsg += ` (Even with +${boost} form Cheat Sheet, you failed!)`;
        return { success: false, msg: failMsg };
    }
    // Success - Graduate logic
    // Expulsion risk from cheat sheet?
    if (boost > 0 && Math.random() < 0.05) {
        // CAUGHT!
        await prisma_1.default.userEducation.delete({ where: { id: edu.id } });
        return { success: false, msg: `${branding_1.Mascot.Emotes.Alert} **CAUGHT CHEATING!** You were caught using a cheat sheet. You have been **EXPELLED**! Degree failed.` };
    }
    await prisma_1.default.$transaction([
        prisma_1.default.userEducation.delete({ where: { id: edu.id } }),
        prisma_1.default.userDegree.upsert({
            where: { userId_degreeId: { userId: user.id, degreeId: deg.id } },
            create: {
                userId: user.id,
                degreeId: deg.id,
                finalGpa: edu.currentGpa
            },
            update: {
                finalGpa: edu.currentGpa,
                obtainedAt: new Date() // Update graduation date if re-taking
            }
        }),
        // Remove the boost effect as it is used
        ...(boostEffect ? [prisma_1.default.activeEffect.delete({ where: { id: boostEffect.id } })] : [])
    ]);
    await (0, userService_1.invalidateUserCache)(userId, guildId);
    return { success: true, msg: `You have completed your **${deg.name}** with Final Intelligence Score: **${edu.currentGpa.toFixed(1)}**!`, finalGpa: edu.currentGpa };
}
async function claimScholarship(userId, guildId, milestone) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } }, wallet: true }
    });
    if (!user || !user.currentEducation)
        throw new Error("Not enrolled.");
    const edu = user.currentEducation;
    if (edu.currentGpa < milestone)
        throw new Error("GPA requirement not met.");
    if (edu.scholarshipsClaimed.includes(milestone))
        throw new Error("Scholarship already claimed.");
    let multiplier = 1.5;
    if (milestone === 10)
        multiplier = 2;
    const amount = edu.degree.tuitionPerSem * edu.currentSemester * multiplier;
    await prisma_1.default.$transaction([
        prisma_1.default.wallet.update({
            where: { id: user.wallet.id },
            data: { balance: { increment: amount } }
        }),
        prisma_1.default.userEducation.update({
            where: { id: edu.id },
            data: { scholarshipsClaimed: { push: milestone } }
        })
    ]);
    await (0, userService_1.invalidateUserCache)(userId, guildId);
    return amount;
}
async function dropout(userId, guildId) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });
    if (!user || !user.currentEducation)
        throw new Error("You are not enrolled in any school.");
    const degreeName = user.currentEducation.degree.name;
    // Just delete the enrollment. Tuition is already paid (sunk cost).
    await prisma_1.default.userEducation.delete({ where: { id: user.currentEducation.id } });
    await (0, userService_1.invalidateUserCache)(userId, guildId);
    return { degreeName };
}
async function reduceStress(userId, guildId, activity) {
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } }, wallet: true }
    });
    if (!user || !user.currentEducation)
        throw new Error("You are not enrolled.");
    const edu = user.currentEducation;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    let cost = 500;
    if (activity === "sports")
        cost = config.sportsCost;
    if (activity === "gym")
        cost = config.gymCost;
    if (activity === "meditation")
        cost = config.meditationCost;
    if (user.wallet.balance < cost) {
        throw new Error(`You need **${cost}** coins to go to the ${activity}.`);
    }
    let reduction = 0;
    switch (activity) {
        case "sports":
            reduction = 25;
            break;
        case "gym":
            reduction = 20;
            break;
        case "meditation":
            reduction = 15;
            break;
    }
    const newStress = Math.max(0, edu.stress - reduction);
    const result = await prisma_1.default.$transaction([
        prisma_1.default.wallet.update({
            where: { id: user.wallet.id },
            data: { balance: { decrement: cost } }
        }),
        prisma_1.default.userEducation.update({
            where: { id: edu.id },
            data: { stress: newStress }
        })
    ]);
    await (0, userService_1.invalidateUserCache)(userId, guildId);
    return {
        newStress,
        cost,
        msg: `**${activity.charAt(0).toUpperCase() + activity.slice(1)}** relieved your stress! Stress: **${edu.stress}** -> **${newStress}** (-${reduction}). Paid **${cost}**.`
    };
}
async function getStressCost(userId, guildId, activity = "gym") {
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    if (activity === "sports")
        return config.sportsCost;
    if (activity === "gym")
        return config.gymCost;
    if (activity === "meditation")
        return config.meditationCost;
    return 0;
}
//# sourceMappingURL=educationService.js.map