// Family progression (spec 10.1, 10.2): XP awards and the paid level-up.
// XP is never spent; a level needs both its XP and its fee, burned from the
// vault earnings-first.
import type { Family, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import { levelDef, type FamilyLevelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { writeLedger } from "./ledger";
import { can } from "./permissions";
import { FamilyError, runFamilyTx } from "./tx";
import { spendFromVault } from "./vaultService";

const ONLY_OFFICERS = "Only the Boss or Underboss can level up.";
const LEVEL_CHANGED = "Level changed.";

/** The level after `level`, or null at the max level. */
export function nextLevelDef(level: number): FamilyLevelDef | null {
  return level >= CRIME_FAMILY_CONFIG.maxLevel ? null : levelDef(level + 1);
}

/** Pure: why the family cannot level up now; empty when it can. */
export function levelUpBlockers(family: Pick<Family, "level" | "xp" | "duesArrears">): string[] {
  const next = nextLevelDef(family.level);
  if (!next) return ["Max level."];
  const blockers: string[] = [];
  if (family.xp < next.xpToReach) blockers.push(`Needs ${fmtFortunes(next.xpToReach)} XP (have ${fmtFortunes(family.xp)}).`);
  if (family.duesArrears > 0) blockers.push("Clear dues arrears first.");
  return blockers;
}

/** XP from a caper, racket cycle or war (10.2), with an `xp` ledger row (P13). */
export async function awardFamilyXp(
  tx: Prisma.TransactionClient, familyId: string, xp: number, source: string, actorId: string, meta: Record<string, unknown> = {},
): Promise<void> {
  const family = await tx.family.update({ where: { id: familyId }, data: { xp: { increment: xp } } });
  await writeLedger(tx, {
    familyId, actorId, type: "xp", amount: 0, treasuryAfter: family.treasury, earningsAfter: family.earnings, meta: { ...meta, xp, source },
  });
}

/** The actor must still be the family's Boss or Underboss, re-read on every call and every retry. */
async function assertLevelUpActor(db: Prisma.TransactionClient, familyId: string, actorId: string, now: Date): Promise<void> {
  const member = await db.familyMember.findUnique({ where: { userId: actorId } });
  if (!member || member.familyId !== familyId || !can({ role: member.role as FamilyRole, joinedAt: member.joinedAt }, "level_up", now)) {
    throw new FamilyError(ONLY_OFFICERS);
  }
}

/**
 * Spec 10.1: CAS on the expected level, the XP threshold and no arrears,
 * then burn the fee earnings-first. `expectedLevel` is the level S8 showed.
 */
export async function levelUp(
  familyId: string, actorId: string, expectedLevel: number, now: Date = new Date(),
): Promise<{ family: Family; level: number; fee: number; fromTreasury: number; fromEarnings: number }> {
  await assertLevelUpActor(prisma, familyId, actorId, now);
  const current = await prisma.family.findUnique({ where: { id: familyId } });
  if (!current) throw new FamilyError("That family no longer exists.");
  const blockers = levelUpBlockers(current);
  if (blockers.length > 0) throw new FamilyError(blockers[0]);

  return runFamilyTx(async (tx) => {
    await assertLevelUpActor(tx, familyId, actorId, now);
    const next = nextLevelDef(expectedLevel);
    const { count } = next
      ? await tx.family.updateMany({
        where: { id: familyId, level: expectedLevel, xp: { gte: next.xpToReach }, duesArrears: 0 },
        data: { level: next.level },
      })
      : { count: 0 };
    if (count !== 1 || !next) {
      const fresh = await tx.family.findUnique({ where: { id: familyId } });
      if (!fresh) throw new FamilyError("That family no longer exists.");
      if (fresh.level !== expectedLevel) throw new FamilyError(LEVEL_CHANGED);
      throw new FamilyError(levelUpBlockers(fresh)[0] ?? LEVEL_CHANGED);
    }
    const spent = await spendFromVault(tx, familyId, next.fee, "level_fee", actorId, { to: next.level });
    const family = await tx.family.findUniqueOrThrow({ where: { id: familyId } });
    return { family, level: next.level, fee: next.fee, ...spent };
  });
}
