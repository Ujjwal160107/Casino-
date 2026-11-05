// The war state machine (spec 9.4, 15): open each racket's weekly War row,
// close bidding (ARMED or CANCELLED), the war-soon claim, activation, the
// minute tick that measures downtime, and the crash-safe settlement. Every
// transition is a compare-and-swap on `status`, so a second ticker, a crash
// or a restart resumes without moving money or ownership twice.
import { randomBytes } from "crypto";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { WAR_RULES, levelDef, racketDef, type RacketDef } from "../../data/crimeFamilyCatalog";
import { addCrimeHeatTx, migrateLegacyHeatForUser } from "../taxService";
import { writeLedger } from "./ledger";
import { awardFamilyXp } from "./progression";
import { invalidateUsers, isUniqueViolation, runFamilyTx } from "./tx";
import { creditEarnings } from "./vaultService";
import {
  attackerWins, baselineScores, bidPhase, blockResults, captureXp, defenceEarnsXp, nextWarStart, scoresOf, warWindow, type WarSide,
} from "./warMath";

export type WarStatus = "BIDDING" | "ARMED" | "ACTIVE" | "SETTLING" | "RESOLVED" | "CANCELLED";

export type WarSettlement = {
  warId: string; racketKey: string; racketName: string; outcome: "CAPTURED" | "HELD" | "CANCELLED";
  attackerFamilyId: string; defenderFamilyId: string; blocks: ReturnType<typeof blockResults>;
  burned: number; refunded: number; overCap: boolean; xp: { familyId: string; xp: number }[]; heated: string[];
  contributors: { userId: string; familyId: string; side: WarSide }[];
};

const lateCancelMs = () => CRIME_FAMILY_CONFIG.warLateCancelSeconds * 1000;

function defOf(racketKey: string): RacketDef {
  const def = racketDef(racketKey);
  if (!def) throw new Error(`War on unknown racket ${racketKey}`);
  return def;
}

/**
 * Step 1 of tickWars: a War row per seeded racket for its next start, created
 * only while that window's bidding is open (T13). No transaction is open, so
 * a P2002 from a racing create is caught and ignored.
 */
export async function openWarPeriods(now: Date): Promise<void> {
  const rackets = await prisma.racket.findMany({ select: { id: true, key: true, warDow: true, warHourUtc: true } });
  for (const r of rackets) {
    const startsAt = nextWarStart(r, now);
    if (bidPhase(startsAt, now).phase !== "OPEN") continue;
    const w = warWindow(startsAt);
    try {
      await prisma.war.upsert({
        where: { racketId_periodKey: { racketId: r.id, periodKey: w.periodKey } },
        create: { racketId: r.id, racketKey: r.key, ...w },
        update: {},
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
}

/**
 * Step 2: BIDDING with bidClosesAt ≤ now. A bid arms the war with the defender
 * snapshot (owner, or "" for the Street); no bid cancels it; a bid while turf
 * is off cancels it and refunds the escrow (T1).
 */
export async function closeBidding(warId: string, now: Date, allowArm: boolean): Promise<"ARMED" | "CANCELLED" | null> {
  return runFamilyTx(async (tx) => {
    const war = await tx.war.findFirst({ where: { id: warId, status: "BIDDING", bidClosesAt: { lte: now } } });
    if (!war) return null;
    const racket = await tx.racket.findUnique({ where: { id: war.racketId }, select: { ownerFamilyId: true, updatedAt: true } });
    const hasBid = war.topBidderFamilyId !== "";
    const status = hasBid && allowArm ? "ARMED" : "CANCELLED";
    const { count } = await tx.war.updateMany({
      where: { id: warId, status: "BIDDING", topBid: war.topBid, topBidderFamilyId: war.topBidderFamilyId },
      data: status === "ARMED"
        ? { status, attackerFamilyId: war.topBidderFamilyId, defenderFamilyId: racket?.ownerFamilyId ?? "" }
        : { status },
    });
    if (count !== 1) return null;
    if (status === "ARMED" && racket) {
      // Write the racket so the owner's disband (which releases it) conflicts
      // with this snapshot: Mongo only conflicts write-write, and a racing
      // disband would otherwise leave defenderFamilyId naming a deleted family.
      // Always later than the stored value, as in touchFamily, so Mongo never skips it.
      await tx.racket.update({
        where: { id: war.racketId },
        data: { updatedAt: new Date(Math.max(now.getTime(), racket.updatedAt.getTime() + 1)) },
      });
    }
    if (hasBid && !allowArm) {
      await creditEarnings(tx, war.topBidderFamilyId, war.topBid, "bid_refund", "system", { warId, reason: "turf_closed" });
    }
    return status;
  });
}

/** Step 3: true for the one caller that may send the war-soon warning. */
export async function claimWarnSoon(warId: string): Promise<boolean> {
  const { count } = await prisma.war.updateMany({ where: { id: warId, status: "ARMED", warnedSoon: false }, data: { warnedSoon: true } });
  return count === 1;
}

/**
 * Step 4: ARMED → ACTIVE with a fresh secret seed and the class baseline for
 * any defender (D52), or CANCELLED with the escrow refunded when the war
 * would start more than warLateCancelSeconds late (D55).
 */
export async function activateWar(warId: string, now: Date): Promise<"ACTIVE" | "CANCELLED" | null> {
  const war = await prisma.war.findUnique({ where: { id: warId } });
  if (!war || war.status !== "ARMED") return null;
  if (now.getTime() > war.startsAt.getTime() + lateCancelMs()) {
    return runFamilyTx(async (tx) => {
      const { count } = await tx.war.updateMany({ where: { id: warId, status: "ARMED" }, data: { status: "CANCELLED" } });
      if (count !== 1) return null;
      await creditEarnings(tx, war.attackerFamilyId, war.topBid, "bid_refund", "system", { warId, reason: "late_start" });
      return "CANCELLED" as const;
    });
  }
  const { count } = await prisma.war.updateMany({
    where: { id: warId, status: "ARMED", startsAt: { lte: now } },
    data: {
      status: "ACTIVE", seed: randomBytes(16).toString("hex"), ...baselineScores(defOf(war.racketKey).class),
      lastTickAt: now, maxTickGapSeconds: 0,
    },
  });
  return count === 1 ? "ACTIVE" : null;
}

/** Step 5: writes lastTickAt and keeps the largest gap, measured up to endsAt (T2). */
export async function recordWarTick(warId: string, now: Date): Promise<void> {
  const war = await prisma.war.findUnique({ where: { id: warId } });
  if (!war || war.status !== "ACTIVE") return;
  const end = Math.min(now.getTime(), war.endsAt.getTime());
  const gap = Math.max(0, Math.floor((end - war.lastTickAt.getTime()) / 1000));
  await prisma.war.updateMany({
    where: { id: warId, status: "ACTIVE", lastTickAt: war.lastTickAt },
    data: { lastTickAt: new Date(end), maxTickGapSeconds: Math.max(war.maxTickGapSeconds, gap) },
  });
}

/** Step 6: an ended ACTIVE war → SETTLING; true for the one caller that moved it. */
export async function beginSettle(warId: string, now: Date): Promise<boolean> {
  const { count } = await prisma.war.updateMany({ where: { id: warId, status: "ACTIVE", endsAt: { lte: now } }, data: { status: "SETTLING" } });
  return count === 1;
}

/**
 * Steps 6–7: settles a SETTLING war once (the status CAS is the first write).
 * A downtime gap cancels and refunds with nothing else; otherwise the escrow
 * is burned whatever the result, a capture moves the racket (to the Street
 * when the attacker is over its cap, T19), XP goes per D64/T3/T4, and
 * attackers who hit get heat on a loss. Null when another settler won.
 */
export async function settleWar(warId: string, now: Date): Promise<WarSettlement | null> {
  const war = await prisma.war.findUnique({ where: { id: warId } });
  if (!war || war.status !== "SETTLING") return null;
  const def = defOf(war.racketKey);
  const contributions = await prisma.warContribution.findMany({ where: { warId } });

  const scores = scoresOf(war);
  const cancelled = war.maxTickGapSeconds > CRIME_FAMILY_CONFIG.warLateCancelSeconds;
  const captured = !cancelled && attackerWins(scores);
  const attacker = war.attackerFamilyId;
  const defender = war.defenderFamilyId;
  const heated = cancelled || captured ? [] : contributions.filter((c) => c.side === "ATK" && c.hits >= 1).map((c) => c.userId);
  for (const uid of heated) await migrateLegacyHeatForUser(uid);

  const base = {
    warId, racketKey: war.racketKey, racketName: def.name, attackerFamilyId: attacker, defenderFamilyId: defender,
    blocks: blockResults(scores),
    contributors: contributions.map((c) => ({ userId: c.userId, familyId: c.familyId, side: c.side as WarSide })),
  };

  const settled = await runFamilyTx(async (tx): Promise<WarSettlement | null> => {
    const { count } = await tx.war.updateMany({
      where: { id: warId, status: "SETTLING" },
      data: { status: cancelled ? "CANCELLED" : "RESOLVED", winnerFamilyId: cancelled ? "" : captured ? attacker : defender },
    });
    if (count !== 1) return null;

    if (cancelled) {
      await creditEarnings(tx, attacker, war.topBid, "bid_refund", "system", { warId, reason: "downtime" });
      return { ...base, outcome: "CANCELLED", burned: 0, refunded: war.topBid, overCap: false, xp: [], heated: [] };
    }

    let overCap = false;
    if (captured) {
      const { level } = await tx.family.findUniqueOrThrow({ where: { id: attacker }, select: { level: true } });
      const others = await tx.racket.count({ where: { ownerFamilyId: attacker, id: { not: war.racketId } } });
      overCap = others >= levelDef(level).racketCap;
    }
    const atk = await tx.family.findUniqueOrThrow({ where: { id: attacker }, select: { treasury: true, earnings: true } });
    await writeLedger(tx, {
      familyId: attacker, actorId: "system", type: "war_bid_burn", amount: 0,
      treasuryAfter: atk.treasury, earningsAfter: atk.earnings, meta: { burned: war.topBid, warId, overCap },
    });

    const xp = new Map<string, number>();
    const award = async (familyId: string, amount: number, source: string) => {
      if (amount <= 0) return;
      await awardFamilyXp(tx, familyId, amount, source, "system", { warId });
      xp.set(familyId, (xp.get(familyId) ?? 0) + amount);
    };
    // A defender whose Family row is gone counts as the Street: no XP or warWins to write.
    const defenderLive = defender !== "" && (await tx.family.count({ where: { id: defender } })) > 0;
    const winWar = (familyId: string) => tx.family.update({ where: { id: familyId }, data: { warWins: { increment: 1 } } });

    if (captured) {
      const data = { ownerFamilyId: overCap ? "" : attacker, capturedAt: now, lastPayoutAt: now, neglectStrikes: 0 };
      let moved = (await tx.racket.updateMany({ where: { id: war.racketId, ownerFamilyId: defender }, data })).count;
      if (moved === 0 && defender !== "") moved = (await tx.racket.updateMany({ where: { id: war.racketId, ownerFamilyId: "" }, data })).count;
      if (moved === 0) throw new Error(`settleWar ${warId}: racket ${war.racketKey} is held by neither the defender nor the Street`);
      await award(attacker, captureXp(def.class), "war_capture");
      await winWar(attacker);
    } else if (defenderLive && defenceEarnsXp(scores)) {
      await award(defender, captureXp(def.class), "war_defence");
      await winWar(defender);
    }

    const sides: [WarSide, string][] = [["ATK", attacker], ["DEF", defenderLive ? defender : ""]];
    for (const [side, familyId] of sides) {
      if (familyId === "") continue;
      const correct = contributions.filter((c) => c.side === side).reduce((sum, c) => sum + c.correctHits, 0);
      await award(familyId, correct * WAR_RULES.hitXp, "war_hits");
    }

    for (const uid of heated) await addCrimeHeatTx(tx, uid, WAR_RULES.lossHeat);

    return {
      ...base, outcome: captured ? "CAPTURED" : "HELD", burned: war.topBid, refunded: 0, overCap,
      xp: [...xp].map(([familyId, amount]) => ({ familyId, xp: amount })), heated,
    };
  }, 5);

  if (settled && settled.heated.length > 0) await invalidateUsers(settled.heated);
  return settled;
}
