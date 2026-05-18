import prisma from "../utils/prisma";
import { Mascot } from "../config/branding";
import { getGuildConfig } from "./guildConfigService";
import { invalidateUserCache } from "./userService";
import { DEGREE_PRICES, RELAX_OPTIONS } from "../utils/economyConfig";
import { chargeCardPurchaseTx } from "./creditCardService";
import { applyRelaxOption } from "./relaxService";

export async function checkAndSeedDegrees(guildId: string) {
    const upsertDegree = async (
        name: string,
        data: {
            type: string;
            tuitionPerSem: number;
            minIntelligence: number;
            intelligenceBoost: number;
            incomeMulti: number;
            requiredDegreeId?: string | null;
        },
        aliases: string[] = []
    ) => {
        let degree = await prisma.degree.findFirst({ where: { guildId, OR: [{ name }, ...aliases.map(alias => ({ name: alias }))] } });
        const payload = {
            name,
            type: data.type,
            totalSemesters: 1,
            passGpa: 6.0,
            tuitionPerSem: data.tuitionPerSem,
            intelligenceBoost: data.intelligenceBoost,
            incomeMulti: data.incomeMulti,
            minIntelligence: data.minIntelligence,
            requiredDegreeId: data.requiredDegreeId ?? null
        };

        if (degree) {
            return prisma.degree.update({ where: { id: degree.id }, data: payload });
        }

        return prisma.degree.create({ data: { guildId, ...payload } });
    };

    const hs = await upsertDegree("High School Diploma", {
        type: "HS",
        tuitionPerSem: DEGREE_PRICES.highSchoolDiploma,
        minIntelligence: 0,
        intelligenceBoost: 1,
        incomeMulti: 0.1
    });

    await upsertDegree("Trade License (Plumbing)", {
        type: "TRADE",
        tuitionPerSem: DEGREE_PRICES.tradeLicense,
        minIntelligence: 2,
        intelligenceBoost: 1,
        incomeMulti: 0.2,
        requiredDegreeId: hs.id
    }, ["Trade License"]);

    await upsertDegree("BA Fine Arts", {
        type: "BACHELORS",
        tuitionPerSem: DEGREE_PRICES.baFineArts,
        minIntelligence: 4,
        intelligenceBoost: 2,
        incomeMulti: 0.5,
        requiredDegreeId: hs.id
    }, ["Bachelor of Business / Finance"]);

    await upsertDegree("BS Computer Science", {
        type: "BACHELORS",
        tuitionPerSem: DEGREE_PRICES.bsComputerScience,
        minIntelligence: 5,
        intelligenceBoost: 2,
        incomeMulti: 0.5,
        requiredDegreeId: hs.id
    });

    const llb = await upsertDegree("Bachelor of Laws (LLB)", {
        type: "LLB",
        tuitionPerSem: DEGREE_PRICES.llb,
        minIntelligence: 6,
        intelligenceBoost: 3,
        incomeMulti: 1.2,
        requiredDegreeId: hs.id
    }, ["LLB"]);

    const mbbs = await upsertDegree("MBBS", {
        type: "MBBS",
        tuitionPerSem: DEGREE_PRICES.mbbs,
        minIntelligence: 6,
        intelligenceBoost: 3,
        incomeMulti: 1.5,
        requiredDegreeId: hs.id
    });

    await upsertDegree("Master of Laws (LLM)", {
        type: "LLM",
        tuitionPerSem: DEGREE_PRICES.llm,
        minIntelligence: 8,
        intelligenceBoost: 5,
        incomeMulti: 2.0,
        requiredDegreeId: llb.id
    }, ["LLM"]);

    await upsertDegree("Doctor of Medicine (MD) / Ph.D.", {
        type: "PHD",
        tuitionPerSem: DEGREE_PRICES.mdPhd,
        minIntelligence: 8,
        intelligenceBoost: 5,
        incomeMulti: 2.5,
        requiredDegreeId: mbbs.id
    }, ["MD / PhD", "Doctor of Medicine (MD)"]);
}

export async function getDegrees(guildId: string) {
    // Optimization: Check if degrees exist before running the expensive seed check
    const count = await prisma.degree.count({ where: { guildId } });
    if (count < 8) {
        await checkAndSeedDegrees(guildId);
    }
    return prisma.degree.findMany({ where: { guildId }, include: { requiredDegree: true }, orderBy: { minIntelligence: 'asc' } });
}

export async function enroll(userId: string, guildId: string, degreeId: string, paymentMethod: "wallet" | "card" = "wallet") {
    const degree = await prisma.degree.findUnique({ where: { id: degreeId } });
    if (!degree) throw new Error("Degree not found.");

    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { wallet: true, currentEducation: true, degrees: true }
    });
    if (!user) throw new Error("User not found.");

    if (user.currentEducation) throw new Error(`You are already enrolled in **${user.currentEducation.degreeId}** (Sem ${user.currentEducation.currentSemester}). Finish it or drop out.`);

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
        if (!hasPrereq) throw new Error("Missing prerequisite degree.");
    }

    if (paymentMethod === "wallet" && (!user.wallet || user.wallet.balance < degree.tuitionPerSem)) {
        throw new Error(`Insufficient funds for Degree Fee (${degree.tuitionPerSem}).`);
    }

    const result = await prisma.$transaction(async (tx) => {
        if (paymentMethod === "card") {
            await chargeCardPurchaseTx(tx, user.discordId, Math.floor(degree.tuitionPerSem), {
                kind: "degree_tuition",
                degreeId: degree.id,
                degreeName: degree.name
            });
        } else {
            await tx.wallet.update({
                where: { id: user.wallet!.id },
                data: { balance: { decrement: degree.tuitionPerSem } }
            });
        }

        return tx.userEducation.create({
            data: {
                userId: user.discordId,
                degreeId: degree.id,
                currentSemester: 1,
                currentGpa: 0.0, // Start fresh (0-10 scale)
                stress: 0
            },
            include: { degree: true }
        });
    });

    await invalidateUserCache(userId, guildId);
    return result;
}

export async function study(userId: string, guildId: string, bonusGpa: number = 0) {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled in any school.");

    const edu = user.currentEducation;

    // RNG Logic
    // Intelligence makes studying more effective.
    // Discipline reduces stress accumulation.

    // Check for Textbooks in Inventory
    const inventory = await prisma.inventory.findMany({
        where: { userId: user.discordId, shopItem: { itemType: "UNI_BOOK" } },
        include: { shopItem: true }
    });

    let extraGpa = 0;
    let bookUsedMsg = "";

    // Prioritize best book? Or just first found. Let's use best.
    const bestBook = inventory.sort((a, b) => (b.shopItem.price - a.shopItem.price))[0];

    if (bestBook) {
        // Apply effect
        const effect = (bestBook.shopItem.effects as any[])?.find(e => e.type === "STUDY_BOOST");
        if (effect) {
            extraGpa = effect.value || 0.2;
            bookUsedMsg = `\n📚 Used **${bestBook.shopItem.name}** (+${extraGpa} Int).`;

            // Decrement Uses
            if (bestBook.shopItem.maxUses) {
                const meta = (bestBook.meta as any) || {};
                let usesLeft = meta.usesLeft !== undefined ? meta.usesLeft : bestBook.shopItem.maxUses;
                usesLeft -= 1;

                if (usesLeft <= 0) {
                    // Break the book
                    await prisma.inventory.delete({ where: { id: bestBook.id } });
                    bookUsedMsg += ` (Broken!)`;
                } else {
                    await prisma.inventory.update({
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
    if (bonusGpa > 0) msg += ` (Includes +${bonusGpa} from interactive bonus!)`;
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

        let icon = event.type === "good" ? Mascot.Emotes.Success : (event.type === "horrible" ? Mascot.Emotes.Alert : Mascot.Emotes.Fail);
        msg += `\n\n${icon} **Event:** ${event.msg} (${event.gpaMod > 0 ? '+' : ''}${event.gpaMod} Int, ${event.stressMod > 0 ? '+' : ''}${event.stressMod} Stress)`;
    }

    // Burnout Check (Separate overriding event)
    if (newStress > 90 && Math.random() < 0.25) {
        newGpa = Math.max(0, newGpa - 1.0);
        msg += `\n\n${Mascot.Emotes.Alert} **BURNOUT!** You pushed yourself too hard. Intelligence dropped by **1.0**. Take a break!`;
    }

    await prisma.userEducation.update({
        where: { id: edu.id },
        data: {
            currentGpa: newGpa,
            stress: newStress,
            lastStudy: new Date()
        }
    });

    await invalidateUserCache(userId, guildId);

    let scholarship: { milestone: number, amount: number } | null = null;
    const floorGpa = Math.floor(newGpa);
    if ([9, 10].includes(floorGpa)) {
        if (!edu.scholarshipsClaimed.includes(floorGpa)) {
            // Eligible!
            let multiplier = 1.5;
            if (floorGpa === 10) multiplier = 2;

            const amount = edu.degree.tuitionPerSem * edu.currentSemester * multiplier;
            scholarship = { milestone: floorGpa, amount };
        }
    }

    return { msg, newGpa, newStress, scholarship };
}

export async function takeExam(userId: string, guildId: string): Promise<{ success: boolean; msg: string; finalGpa?: number }> {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("Not enrolled.");

    const edu = user.currentEducation;
    const deg = edu.degree;
    const PASS_REQ = 6.0;

    // Check for Cheat Sheet / Exam Boost
    // Clean expired first
    await prisma.activeEffect.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    const boostEffect = await prisma.activeEffect.findFirst({
        where: { userId: user.discordId, effectType: "EXAM_BOOST" }
    });

    const boost = boostEffect ? boostEffect.value : 0;
    const effectiveGpa = edu.currentGpa + boost;

    if (effectiveGpa < PASS_REQ) {
        // Failed
        let failMsg = `Your intelligence (**${edu.currentGpa.toFixed(1)}**) is too low. You need **${PASS_REQ.toFixed(1)}** to pass.`;
        if (boost > 0) failMsg += ` (Even with +${boost} form Cheat Sheet, you failed!)`;
        return { success: false, msg: failMsg };
    }

    // Success - Graduate logic
    // Expulsion risk from cheat sheet?
    if (boost > 0 && Math.random() < 0.05) {
        // CAUGHT!
        await prisma.userEducation.delete({ where: { id: edu.id } });
        return { success: false, msg: `${Mascot.Emotes.Alert} **CAUGHT CHEATING!** You were caught using a cheat sheet. You have been **EXPELLED**! Degree failed.` };
    }

    await prisma.$transaction([
        prisma.userEducation.delete({ where: { id: edu.id } }),
        prisma.userDegree.upsert({
            where: { userId_degreeId: { userId: user.discordId, degreeId: deg.id } },
            create: {
                userId: user.discordId,
                degreeId: deg.id,
                finalGpa: edu.currentGpa
            },
            update: {
                finalGpa: edu.currentGpa,
                obtainedAt: new Date() // Update graduation date if re-taking
            }
        }),
        // Remove the boost effect as it is used
        ...(boostEffect ? [prisma.activeEffect.delete({ where: { id: boostEffect.id } })] : [])
    ]);

    await invalidateUserCache(userId, guildId);

    return { success: true, msg: `You have completed your **${deg.name}** with Final Intelligence Score: **${edu.currentGpa.toFixed(1)}**!`, finalGpa: edu.currentGpa };
}

export async function claimScholarship(userId: string, guildId: string, milestone: number) {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } }, wallet: true }
    });

    if (!user || !user.currentEducation) throw new Error("Not enrolled.");
    const edu = user.currentEducation;

    if (edu.currentGpa < milestone) throw new Error("GPA requirement not met.");
    if (edu.scholarshipsClaimed.includes(milestone)) throw new Error("Scholarship already claimed.");

    let multiplier = 1.5;
    if (milestone === 10) multiplier = 2;

    const amount = edu.degree.tuitionPerSem * edu.currentSemester * multiplier;

    await prisma.$transaction([
        prisma.wallet.update({
            where: { id: user.wallet!.id },
            data: { balance: { increment: amount } }
        }),
        prisma.userEducation.update({
            where: { id: edu.id },
            data: { scholarshipsClaimed: { push: milestone } }
        })
    ]);

    await invalidateUserCache(userId, guildId);

    return amount;
}

export async function dropout(userId: string, guildId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled in any school.");

    const degreeName = user.currentEducation.degree.name;

    // Just delete the enrollment. Tuition is already paid (sunk cost).
    await prisma.userEducation.delete({ where: { id: user.currentEducation.id } });

    await invalidateUserCache(userId, guildId);



    return { degreeName };
}

export async function reduceStress(userId: string, guildId: string, activity: "sports" | "gym" | "meditation") {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: true }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled.");

    const optionByLegacyActivity = {
        sports: "quick_break",
        gym: "gym_session",
        meditation: "meditation_retreat",
    } as const;
    const result = await applyRelaxOption(userId, user.username, optionByLegacyActivity[activity]);

    await invalidateUserCache(userId, guildId);

    return {
        newStress: result.educationStress ?? 0,
        cost: result.cost,
        msg: `**${result.option.name}** relieved your stress! Education Stress: **${result.previousEducationStress}** -> **${result.educationStress}**. Paid **${result.cost}**.`
    };
}

export async function getStressCost(userId: string, guildId: string, activity: "sports" | "gym" | "meditation" = "gym") {
    if (activity === "sports") return RELAX_OPTIONS.quick_break.cost;
    if (activity === "gym") return RELAX_OPTIONS.gym_session.cost;
    if (activity === "meditation") return RELAX_OPTIONS.meditation_retreat.cost;

    return RELAX_OPTIONS.gym_session.cost;
}
