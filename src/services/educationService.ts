import prisma from "../utils/prisma";

export async function checkAndSeedDegrees(guildId: string) {
    // 1. High School (Foundation)
    let hs = await prisma.degree.findFirst({ where: { guildId, name: "High School Diploma" } });

    if (hs) {
        // Enforce the new scale on existing record
        hs = await prisma.degree.update({
            where: { id: hs.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, type: "HS", totalSemesters: 1 }
        });
    } else {
        hs = await prisma.degree.create({
            data: { guildId, name: "High School Diploma", type: "HS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 0, intelligenceBoost: 1 }
        });
    }

    // 2. Community College
    let trade = await prisma.degree.findFirst({ where: { guildId, name: "Trade License (Plumbing)" } });
    if (trade) {
        await prisma.degree.update({
            where: { id: trade.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, minIntelligence: 2, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "Trade License (Plumbing)", type: "TRADE", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 500, intelligenceBoost: 1, incomeMulti: 0.2, minIntelligence: 2, requiredDegreeId: hs!.id }
        });
    }

    // 3. Bachelors (CS)
    let bsCS = await prisma.degree.findFirst({ where: { guildId, name: "BS Computer Science" } });
    if (bsCS) {
        bsCS = await prisma.degree.update({
            where: { id: bsCS.id },
            data: { passGpa: 6.0, intelligenceBoost: 2, minIntelligence: 5, totalSemesters: 1 }
        });
    } else {
        bsCS = await prisma.degree.create({
            data: { guildId, name: "BS Computer Science", type: "BACHELORS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 5000, intelligenceBoost: 2, incomeMulti: 0.5, minIntelligence: 5, requiredDegreeId: hs!.id }
        });
    }

    // Bachelors (Arts)
    let baArts = await prisma.degree.findFirst({ where: { guildId, name: "BA Fine Arts" } });
    if (baArts) {
        await prisma.degree.update({
            where: { id: baArts.id },
            data: { passGpa: 6.0, intelligenceBoost: 1, minIntelligence: 4, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "BA Fine Arts", type: "BACHELORS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 4000, intelligenceBoost: 1, incomeMulti: 0.3, minIntelligence: 4, requiredDegreeId: hs!.id }
        });
    }

    // 5. MBBS (New)
    let mbbs = await prisma.degree.findFirst({ where: { guildId, name: "MBBS" } });
    if (mbbs) {
        mbbs = await prisma.degree.update({
            where: { id: mbbs.id },
            data: { passGpa: 6.0, intelligenceBoost: 3, minIntelligence: 6, incomeMulti: 1.5, totalSemesters: 1 }
        });
    } else {
        mbbs = await prisma.degree.create({
            data: { guildId, name: "MBBS", type: "MBBS", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 8000, intelligenceBoost: 3, incomeMulti: 1.5, minIntelligence: 6, requiredDegreeId: hs!.id }
        });
    }

    // 6. Med School (MD)
    const md = await prisma.degree.findFirst({ where: { guildId, name: "Doctor of Medicine (MD)" } });
    if (md) {
        await prisma.degree.update({
            where: { id: md.id },
            data: { passGpa: 6.0, intelligenceBoost: 5, minIntelligence: 8, requiredDegreeId: mbbs.id, totalSemesters: 1 }
        });
    } else {
        await prisma.degree.create({
            data: { guildId, name: "Doctor of Medicine (MD)", type: "MD", totalSemesters: 1, passGpa: 6.0, tuitionPerSem: 15000, intelligenceBoost: 5, incomeMulti: 2.5, minIntelligence: 8, requiredDegreeId: mbbs.id }
        });
    }
}

export async function getDegrees(guildId: string) {
    await checkAndSeedDegrees(guildId);
    return prisma.degree.findMany({ where: { guildId }, include: { requiredDegree: true }, orderBy: { minIntelligence: 'asc' } });
}

export async function enroll(userId: string, guildId: string, degreeId: string) {
    const degree = await prisma.degree.findUnique({ where: { id: degreeId } });
    if (!degree) throw new Error("Degree not found.");

    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
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

    // Pay Tuition (First Sem)
    if (user.wallet!.balance < degree.tuitionPerSem) {
        throw new Error(`Insufficient funds for Degree Fee (${degree.tuitionPerSem}).`);
    }

    return prisma.$transaction(async (tx) => {
        await tx.wallet.update({
            where: { id: user.wallet!.id },
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
}

export async function study(userId: string, guildId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled in any school.");

    const edu = user.currentEducation;

    // RNG Logic
    // Intelligence makes studying more effective.
    // Discipline reduces stress accumulation.

    // 2 Studies = 1 Bar (1 Point). So 1 Study = 0.5 Points.
    const gpaGain = 0.5;
    const stressGain = Math.max(5, 20 - (user.discipline * 0.2));

    let newGpa = Math.min(10.0, edu.currentGpa + gpaGain);
    let newStress = Math.min(100, edu.stress + stressGain);

    let msg = `You studied hard! Intelligence: ${edu.currentGpa.toFixed(1)} -> **${newGpa.toFixed(1)}**. Stress +${stressGain}.`;

    // Random Events
    if (newStress > 90 && Math.random() < 0.2) {
        // Burnout!
        newGpa = Math.max(0, newGpa - 1.0);
        msg = `⚠️ BURNOUT! You overstudied and panicked. Intelligence dropped to **${newGpa.toFixed(1)}**. Chill out!`;
    }

    await prisma.userEducation.update({
        where: { id: edu.id },
        data: {
            currentGpa: newGpa,
            stress: newStress,
            lastStudy: new Date()
        }
    });

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

export async function claimScholarship(userId: string, guildId: string, milestone: number) {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
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

    return amount;
}

export async function dropout(userId: string, guildId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled in any school.");

    const degreeName = user.currentEducation.degree.name;

    // Just delete the enrollment. Tuition is already paid (sunk cost).
    await prisma.userEducation.delete({ where: { id: user.currentEducation.id } });



    return { degreeName };
}

export async function reduceStress(userId: string, guildId: string, activity: "sports" | "gym" | "meditation") {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } }, wallet: true }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled.");

    const edu = user.currentEducation;
    const cost = Math.floor(edu.degree.tuitionPerSem * 0.5);

    if (user.wallet!.balance < cost) {
        throw new Error(`You need **${cost}** coins to go to the ${activity}.`);
    }

    let reduction = 0;
    switch (activity) {
        case "sports": reduction = 25; break;
        case "gym": reduction = 20; break;
        case "meditation": reduction = 15; break;
    }

    // Apply discipline bonus? Maybe simple for now.

    const newStress = Math.max(0, edu.stress - reduction);

    await prisma.$transaction([
        prisma.wallet.update({
            where: { id: user.wallet!.id },
            data: { balance: { decrement: cost } }
        }),
        prisma.userEducation.update({
            where: { id: edu.id },
            data: { stress: newStress }
        })
    ]);

    return {
        newStress,
        cost,
        msg: `**${activity.charAt(0).toUpperCase() + activity.slice(1)}** relieved your stress! Stress: **${edu.stress}** -> **${newStress}** (-${reduction}). Paid **${cost}**.`
    };
}

export async function getStressCost(userId: string, guildId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: userId, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) return 0;
    return Math.floor(user.currentEducation.degree.tuitionPerSem * 0.5);
}
