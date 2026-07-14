import prisma from "../utils/prisma";
import { Mascot } from "../config/branding";
import { invalidateUserCache } from "./userService";
import { DEGREE_PRICES, RELAX_OPTIONS } from "../utils/economyConfig";
import { GLOBAL_CATALOG_GUILD_ID } from "../utils/globalCatalog";
import { chargeCardPurchaseTx } from "./creditCardService";
import { applyRelaxOption } from "./relaxService";
import { redisService } from "./redisService";
import { STUDY_EVENTS, type StudyEvent } from "../data/studyEvents";

function getStudyEvent(degreeType: string): StudyEvent {
    const eligible = STUDY_EVENTS.filter(e => e.degreeType === degreeType || e.degreeType === "all");
    return eligible[Math.floor(Math.random() * eligible.length)];
}

function resolveEventOutcome(event: StudyEvent): boolean {
    if (event.outcome === "success") return true;
    if (event.outcome === "failure") return false;
    return Math.random() * 100 < (event.successChance ?? 50);
}

function isPositiveEvent(e: StudyEvent): boolean {
    return e.xpMod > 0 && e.outcome !== "failure";
}

function getPositiveStudyEvent(degreeType: string): StudyEvent {
    const eligible = STUDY_EVENTS.filter(
        e => (e.degreeType === degreeType || e.degreeType === "all") && isPositiveEvent(e)
    );
    if (eligible.length === 0) return getStudyEvent(degreeType);
    return eligible[Math.floor(Math.random() * eligible.length)];
}

let degreesSeeded = false;

export async function checkAndSeedDegrees(_guildId?: string) {
    if (degreesSeeded) return;

    const upsertDegree = async (
        catalogKey: string,
        name: string,
        data: {
            type: string;
            tuitionPerSem: number;
            minIntelligence: number;
            intelligenceBoost: number;
            incomeMulti: number;
            xpRequired: number;
            requiredDegreeId?: string | null;
        },
        aliases: string[] = []
    ) => {
        let degree = await prisma.degree.findFirst({
            where: {
                OR: [
                    { catalogKey },
                    { name },
                    ...aliases.map(alias => ({ name: alias })),
                ],
            },
        });
        const payload = {
            catalogKey,
            guildId: GLOBAL_CATALOG_GUILD_ID,
            name,
            type: data.type,
            totalSemesters: 1,
            passGpa: 6.0,
            tuitionPerSem: data.tuitionPerSem,
            intelligenceBoost: data.intelligenceBoost,
            incomeMulti: data.incomeMulti,
            minIntelligence: data.minIntelligence,
            xpRequired: data.xpRequired,
            requiredDegreeId: data.requiredDegreeId ?? null,
        };

        if (degree) {
            return prisma.degree.update({ where: { id: degree.id }, data: payload });
        }

        return prisma.degree.create({ data: payload });
    };

    const hs = await upsertDegree("high_school_diploma", "High School Diploma", {
        type: "HS",
        tuitionPerSem: DEGREE_PRICES.highSchoolDiploma,
        minIntelligence: 0,
        intelligenceBoost: 1,
        incomeMulti: 0.1,
        xpRequired: 600
    });

    await upsertDegree("trade_license", "Trade License (Plumbing)", {
        type: "TRADE",
        tuitionPerSem: DEGREE_PRICES.tradeLicense,
        minIntelligence: 2,
        intelligenceBoost: 1,
        incomeMulti: 0.2,
        xpRequired: 900,
        requiredDegreeId: hs.id
    }, ["Trade License"]);

    await upsertDegree("ba_fine_arts", "BA Fine Arts", {
        type: "BACHELORS",
        tuitionPerSem: DEGREE_PRICES.baFineArts,
        minIntelligence: 4,
        intelligenceBoost: 2,
        incomeMulti: 0.5,
        xpRequired: 1_400,
        requiredDegreeId: hs.id
    }, ["Bachelor of Business / Finance"]);

    await upsertDegree("bs_computer_science", "BS Computer Science", {
        type: "BACHELORS",
        tuitionPerSem: DEGREE_PRICES.bsComputerScience,
        minIntelligence: 5,
        intelligenceBoost: 2,
        incomeMulti: 0.5,
        xpRequired: 1_600,
        requiredDegreeId: hs.id
    });

    const llb = await upsertDegree("llb", "Bachelor of Laws (LLB)", {
        type: "LLB",
        tuitionPerSem: DEGREE_PRICES.llb,
        minIntelligence: 6,
        intelligenceBoost: 3,
        incomeMulti: 1.2,
        xpRequired: 2_200,
        requiredDegreeId: hs.id
    }, ["LLB"]);

    const mbbs = await upsertDegree("mbbs", "MBBS", {
        type: "MBBS",
        tuitionPerSem: DEGREE_PRICES.mbbs,
        minIntelligence: 6,
        intelligenceBoost: 3,
        incomeMulti: 1.5,
        xpRequired: 2_800,
        requiredDegreeId: hs.id
    });

    await upsertDegree("llm", "Master of Laws (LLM)", {
        type: "LLM",
        tuitionPerSem: DEGREE_PRICES.llm,
        minIntelligence: 8,
        intelligenceBoost: 5,
        incomeMulti: 2.0,
        xpRequired: 3_600,
        requiredDegreeId: llb.id
    }, ["LLM"]);

    await upsertDegree("md_phd", "Doctor of Medicine (MD) / Ph.D.", {
        type: "PHD",
        tuitionPerSem: DEGREE_PRICES.mdPhd,
        minIntelligence: 8,
        intelligenceBoost: 5,
        incomeMulti: 2.5,
        xpRequired: 5_000,
        requiredDegreeId: mbbs.id
    }, ["MD / PhD", "Doctor of Medicine (MD)"]);

    degreesSeeded = true;
}

export async function getDegrees(_guildId?: string) {
    await checkAndSeedDegrees();
    return prisma.degree.findMany({
        where: { guildId: GLOBAL_CATALOG_GUILD_ID },
        include: { requiredDegree: true },
        orderBy: { minIntelligence: "asc" },
    });
}

export async function enroll(userId: string, guildId: string, degreeId: string, paymentMethod: "wallet" | "card" = "wallet") {
    const degree = await prisma.degree.findUnique({ where: { id: degreeId } });
    if (!degree) throw new Error("Degree not found.");

    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { wallet: true, currentEducation: { include: { degree: true } }, degrees: true }
    });
    if (!user) throw new Error("User not found.");

    if (user.currentEducation) {
        const edu = user.currentEducation;
        throw new Error(`You are already enrolled in **${edu.degree.name}** (XP ${edu.educationXp}/${edu.degree.xpRequired}). Finish it or drop out.`);
    }

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
                educationXp: 0,
                stress: 0
            },
            include: { degree: true }
        });
    });

    await invalidateUserCache(userId, guildId);
    return result;
}

function migrateGpaToXp(currentGpa: number, xpRequired: number): number {
    if (currentGpa >= 6.0) return xpRequired;
    return Math.ceil((currentGpa / 6.0) * xpRequired);
}

export interface StudyModifiers {
    /** Buff XP already summed in study.ts (multipliers + focus/craft bonuses). */
    bonusXp?: number;
    /** Study Laptop (-6) / Tutor Pass (-10) — applied to this session's stress. */
    stressDelta?: number;
    /** Textbook Bundle rolled a wrong-chapter miss → this session earns 0 XP. */
    wrongChapterHit?: boolean;
    /** Focus Notes → neutralize a negative study event this session. */
    eventImmunity?: boolean;
    /** Lab Kit → 70% chance to re-pick a positive event when one rolls. */
    eventBiasPositive?: boolean;
    /** Lab Kit → +50% magnitude on the rolled event (both directions). */
    eventAmplify?: boolean;
    /** Tutor Pass → force a positive study event this session. */
    guaranteedPositiveEvent?: boolean;
}

export async function study(userId: string, guildId: string, modifiers: StudyModifiers = {}) {
    const {
        bonusXp = 0,
        stressDelta = 0,
        wrongChapterHit = false,
        eventImmunity = false,
        eventBiasPositive = false,
        eventAmplify = false,
        guaranteedPositiveEvent = false,
    } = modifiers;

    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled in any school.");

    const edu = user.currentEducation;

    // Lazy migration: if user has GPA progress but no XP, convert
    if (edu.educationXp === 0 && edu.currentGpa > 0) {
        const migratedXp = migrateGpaToXp(edu.currentGpa, edu.degree.xpRequired);
        await prisma.userEducation.update({ where: { id: edu.id }, data: { educationXp: migratedXp, currentGpa: 0 } });
        edu.educationXp = migratedXp;
    }

    // Check for Textbooks in Inventory (passive UNI_BOOK items)
    const inventory = await prisma.inventory.findMany({
        where: { userId: user.discordId, shopItem: { itemType: "UNI_BOOK" } },
        include: { shopItem: true }
    });

    let extraXp = 0;
    let bookUsedMsg = "";

    const bestBook = inventory.sort((a, b) => (b.shopItem.price - a.shopItem.price))[0];

    if (bestBook) {
        const effect = (bestBook.shopItem.effects as any[])?.find(e => e.type === "STUDY_BOOST");
        if (effect) {
            extraXp = Math.floor((effect.value || 0.2) * 100);
            bookUsedMsg = `\n📚 Used **${bestBook.shopItem.name}** (+${extraXp} XP).`;

            if (bestBook.shopItem.maxUses) {
                const meta = (bestBook.meta as any) || {};
                let usesLeft = meta.usesLeft !== undefined ? meta.usesLeft : bestBook.shopItem.maxUses;
                usesLeft -= 1;

                if (usesLeft <= 0) {
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

    // Textbook Bundle wrong-chapter miss wastes the whole session's XP (stress still applies).
    const xpGain = wrongChapterHit ? 0 : Math.floor(50 + extraXp + bonusXp);
    const stressGain = Math.max(5, 20 - (user.discipline * 0.2));

    let newXp = edu.educationXp + xpGain;
    let newStress = Math.min(100, Math.max(0, edu.stress + stressGain + stressDelta));

    let msg: string;
    if (wrongChapterHit) {
        msg = `📕 **Wrong chapter!** You studied the wrong material — **0 XP** this session. Stress +${stressGain}.`;
    } else {
        msg = `You studied hard! XP: ${edu.educationXp} → **${newXp}** (+${xpGain}). Stress +${stressGain}.`;
        if (bonusXp > 0) msg += ` (Includes +${bonusXp} from buffs!)`;
        msg += bookUsedMsg;
    }

    // Study Events — 25% normally, forced on by Tutor Pass
    if (guaranteedPositiveEvent || Math.random() < 0.25) {
        let event = guaranteedPositiveEvent
            ? getPositiveStudyEvent(edu.degree.type)
            : getStudyEvent(edu.degree.type);

        // Lab Kit positive bias: 70% chance to re-pick a positive event
        if (!guaranteedPositiveEvent && eventBiasPositive && !isPositiveEvent(event) && Math.random() < 0.70) {
            event = getPositiveStudyEvent(edu.degree.type);
        }

        const success = guaranteedPositiveEvent ? true : resolveEventOutcome(event);
        const amp = eventAmplify ? 1.5 : 1.0;

        if (success) {
            const xpMod = Math.round(event.xpMod * amp);
            const stressMod = Math.round(event.stressMod * amp);
            newXp = Math.max(0, newXp + xpMod);
            newStress = Math.max(0, Math.min(100, newStress + stressMod));
            if (event.moneyMod) {
                const money = Math.round(event.moneyMod * amp);
                const wallet = await prisma.wallet.findUnique({ where: { userId: user.discordId } });
                if (wallet) await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: money } } });
                msg += `\n\n${Mascot.Emotes.Success} **${event.title}**\n${event.description}\n✅ Success! (+${xpMod} XP, ${stressMod >= 0 ? '+' : ''}${stressMod} Stress) +${money.toLocaleString()} coins`;
            } else {
                msg += `\n\n${Mascot.Emotes.Success} **${event.title}**\n${event.description}\n✅ Success! (+${xpMod} XP, ${stressMod >= 0 ? '+' : ''}${stressMod} Stress)`;
            }
        } else if (eventImmunity) {
            msg += `\n\n📝 **Focus Notes saved you.** A **${event.title}** setback was neutralized — no XP or stress lost.`;
        } else {
            const xpLoss = Math.round(Math.abs(event.xpMod) * amp);
            const stressAdd = Math.round(Math.abs(event.stressMod) * amp);
            newXp = Math.max(0, newXp - xpLoss);
            newStress = Math.max(0, Math.min(100, newStress + stressAdd));
            msg += `\n\n${Mascot.Emotes.Fail} **${event.title}**\n${event.description}\n❌ Failed! (-${xpLoss} XP, +${stressAdd} Stress)`;
        }
    }

    // Burnout Check
    if (newStress > 90 && Math.random() < 0.25) {
        newXp = Math.max(0, newXp - 100);
        msg += `\n\n${Mascot.Emotes.Alert} **BURNOUT!** You pushed yourself too hard. Lost **100 XP**. Take a break!`;
    }

    await prisma.userEducation.update({
        where: { id: edu.id },
        data: {
            educationXp: newXp,
            stress: newStress,
            lastStudy: new Date()
        }
    });

    await invalidateUserCache(userId, guildId);

    // Scholarship check at 75% and 100% of xpRequired
    let scholarship: { milestone: number, amount: number } | null = null;
    const pct = newXp / edu.degree.xpRequired;
    if (pct >= 1.0 && !edu.scholarshipsClaimed.includes(100)) {
        const amount = edu.degree.tuitionPerSem * edu.currentSemester * 2;
        scholarship = { milestone: 100, amount };
    } else if (pct >= 0.75 && !edu.scholarshipsClaimed.includes(75)) {
        const amount = edu.degree.tuitionPerSem * edu.currentSemester * 1.5;
        scholarship = { milestone: 75, amount };
    }

    return { msg, newXp, newStress, scholarship };
}

export async function takeExam(userId: string, guildId: string): Promise<{ success: boolean; msg: string; finalXp?: number }> {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("Not enrolled.");

    const edu = user.currentEducation;
    const deg = edu.degree;

    // Lazy migration
    if (edu.educationXp === 0 && edu.currentGpa > 0) {
        const migratedXp = migrateGpaToXp(edu.currentGpa, deg.xpRequired);
        await prisma.userEducation.update({ where: { id: edu.id }, data: { educationXp: migratedXp, currentGpa: 0 } });
        edu.educationXp = migratedXp;
    }

    // Check for Redis-based Cheat Sheet (Uni Store item)
    const cheatData = await redisService.get<{ active: boolean }>(`cheat_sheet:${user.discordId}`);
    let cheatXpBonus = 0;
    if (cheatData?.active) {
        await redisService.del(`cheat_sheet:${user.discordId}`);
        if (Math.random() < 0.70) {
            cheatXpBonus = Math.floor(deg.xpRequired * 0.25);
        } else {
            const xpPenalty = Math.floor(edu.educationXp * 0.15);
            const newStress = Math.min(100, edu.stress + 15);
            await prisma.userEducation.update({
                where: { id: edu.id },
                data: { educationXp: Math.max(0, edu.educationXp - xpPenalty), stress: newStress },
            });
            const wallet = await prisma.wallet.findUnique({ where: { userId: user.discordId } });
            if (wallet && wallet.balance > 0) {
                const fine = Math.floor(wallet.balance * 0.10);
                await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: fine } } });
            }
            return {
                success: false,
                msg: `${Mascot.Emotes.Alert} **CAUGHT CHEATING!** You were caught using a cheat sheet.\n\n` +
                    `**Penalties:** -${xpPenalty} XP, +15 stress, -10% wallet balance.\n` +
                    `Your exam attempt has been voided.`,
            };
        }
    }

    // Legacy ActiveEffect-based exam boost
    await prisma.activeEffect.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const boostEffect = await prisma.activeEffect.findFirst({
        where: { userId: user.discordId, effectType: "EXAM_BOOST" }
    });
    const legacyBoost = boostEffect ? Math.floor(boostEffect.value * 100) : 0;

    const effectiveXp = edu.educationXp + cheatXpBonus + legacyBoost;

    if (effectiveXp < deg.xpRequired) {
        let failMsg = `Your education XP (**${edu.educationXp}**) is too low. You need **${deg.xpRequired}** XP to graduate.`;
        if (cheatXpBonus + legacyBoost > 0) failMsg += ` (Even with +${cheatXpBonus + legacyBoost} bonus XP, you failed!)`;
        return { success: false, msg: failMsg };
    }

    // Legacy boost caught risk
    if (boostEffect && Math.random() < 0.05) {
        await prisma.userEducation.delete({ where: { id: edu.id } });
        return { success: false, msg: `${Mascot.Emotes.Alert} **CAUGHT CHEATING!** You were caught using a cheat sheet. You have been **EXPELLED**! Degree failed.` };
    }

    const finalXp = effectiveXp;

    await prisma.$transaction([
        prisma.userEducation.delete({ where: { id: edu.id } }),
        prisma.user.update({
            where: { discordId: user.discordId },
            data: { intelligence: { increment: deg.intelligenceBoost } }
        }),
        prisma.userDegree.upsert({
            where: { userId_degreeId: { userId: user.discordId, degreeId: deg.id } },
            create: {
                userId: user.discordId,
                degreeId: deg.id,
                finalGpa: 0,
                finalXp,
            },
            update: {
                finalGpa: 0,
                finalXp,
                obtainedAt: new Date()
            }
        }),
        ...(boostEffect ? [prisma.activeEffect.delete({ where: { id: boostEffect.id } })] : [])
    ]);

    await invalidateUserCache(userId, guildId);

    const bonusText = deg.intelligenceBoost > 0 ? `\nPermanent Intelligence: **+${deg.intelligenceBoost}**` : "";
    return { success: true, msg: `You have completed your **${deg.name}**! Final XP: **${finalXp}/${deg.xpRequired}**${bonusText}`, finalXp };
}

export async function claimScholarship(userId: string, guildId: string, milestone: number) {
    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } }, wallet: true }
    });

    if (!user || !user.currentEducation) throw new Error("Not enrolled.");
    const edu = user.currentEducation;

    const pct = edu.educationXp / edu.degree.xpRequired;
    const requiredPct = milestone / 100;
    if (pct < requiredPct) throw new Error("XP requirement not met.");
    if (edu.scholarshipsClaimed.includes(milestone)) throw new Error("Scholarship already claimed.");

    let multiplier = 1.5;
    if (milestone === 100) multiplier = 2;

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
