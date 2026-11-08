// Founding a family, moving its home channel and the moderator's force
// rename, and the Boss's paid rename.
import type { Family } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { debitWalletInTx } from "../walletService";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { getFamilyByTag, requireMembership } from "./familyQueries";
import { writeLedger } from "./ledger";
import { withdrawPendingApplications } from "./membershipService";
import { checkFamilyName, checkFamilyTag } from "./names";
import { can, NO_PERMISSION } from "./permissions";
import { FamilyError, invalidateUsers, isUniqueViolation, runFamilyTx, touchUser } from "./tx";
import { spendFromVault, utcDayKey } from "./vaultService";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";

/**
 * Spec 6.1: burns the creation fee and seats the founder as Boss in one
 * transaction, withdrawing the founder's PENDING applications. The unique indexes on nameKey, tagKey and FamilyMember.userId
 * are the backstops; their P2002 is mapped here, outside the transaction.
 */
export async function createFamily(input: {
  uid: string; username: string; name: string; tag: string; guildId: string; channelId: string; now?: Date;
}): Promise<Family> {
  const now = input.now ?? new Date();
  const name = checkFamilyName(input.name);
  if (!name.ok) throw new FamilyError(name.reason);
  const tag = checkFamilyTag(input.tag);
  if (!tag.ok) throw new FamilyError(tag.reason);

  const eligibility = await checkMemberEligibility(input.uid, "found", { now });
  if (!eligibility.ok) throw eligibilityError(eligibility.failures);

  const fee = CRIME_FAMILY_CONFIG.createFee;
  let family: Family;
  try {
    family = await runFamilyTx(async (tx) => {
      await touchUser(tx, input.uid, now);   // conflicts with the founder's concurrent apply or join (A35)
      await debitWalletInTx(tx, input.uid, fee, "family_create", { tag: tag.tag });
      const family = await tx.family.create({
        data: {
          name: name.name, nameKey: name.nameKey, tag: tag.tag, tagKey: tag.tagKey, bossId: input.uid,
          homeGuildId: input.guildId, homeChannelId: input.channelId, duesDayKey: utcDayKey(now),
        },
      });
      await tx.familyMember.create({
        data: { familyId: family.id, userId: input.uid, role: "BOSS", roleSlot: "BOSS", seat: 1, joinedAt: now, lastActiveAt: now,
          bossedOnce: true, firstBossAt: now },
      });
      await withdrawPendingApplications(tx, input.uid, now);
      await writeLedger(tx, {
        familyId: family.id, actorId: input.uid, type: "create_fee", amount: 0, treasuryAfter: 0, earningsAfter: 0, meta: { paid: fee },
      });
      await tx.audit.create({
        data: { guildId: input.guildId, userId: input.uid, type: "family_create", meta: { familyId: family.id, name: name.name, tag: tag.tag, paid: fee } },
      });
      return family;
    });
  } catch (err) {
    if (isUniqueViolation(err, "Family_nameKey_key") || isUniqueViolation(err, "Family_tagKey_key")) throw new FamilyError("Name or tag taken.");
    if (isUniqueViolation(err, "FamilyMember_userId_key")) throw new FamilyError("You are already in a family.");
    throw err;
  }
  await invalidateUsers([input.uid]);
  return family;
}

/** The Boss moves the family's home channel (`!crew home`). */
export async function setHomeChannel(bossId: string, guildId: string, channelId: string): Promise<Family> {
  const { family, member } = await requireMembership(bossId);
  if (!can({ role: member.role as FamilyRole, joinedAt: member.joinedAt }, "set_home", new Date())) throw new FamilyError(NO_PERMISSION);
  const { count } = await prisma.family.updateMany({ where: { id: family.id, bossId }, data: { homeGuildId: guildId, homeChannelId: channelId } });
  if (count === 0) throw new FamilyError(NO_PERMISSION);
  return prisma.family.findUniqueOrThrow({ where: { id: family.id } });
}

/**
 * Spec 6.2: the Boss renames the family once per renameCooldownSeconds,
 * paying renameFee earnings-first. A taken name aborts the transaction, so
 * nothing is charged; its P2002 is mapped here, outside.
 */
export async function renameFamily(bossId: string, rawName: string, now: Date = new Date()): Promise<Family> {
  const { family } = await requireMembership(bossId);
  if (family.bossId !== bossId) throw new FamilyError(NO_PERMISSION);
  const name = checkFamilyName(rawName);
  if (!name.ok) throw new FamilyError(name.reason);
  const renamableBefore = new Date(now.getTime() - CRIME_FAMILY_CONFIG.renameCooldownSeconds * 1000);
  try {
    return await runFamilyTx(async (tx) => {
      const current = await tx.family.findUnique({ where: { id: family.id } });
      if (!current || current.bossId !== bossId) throw new FamilyError(NO_PERMISSION);
      const { count } = await tx.family.updateMany({
        where: { id: family.id, bossId, lastRenamedAt: { lte: renamableBefore } },
        data: { name: name.name, nameKey: name.nameKey, lastRenamedAt: now },
      });
      if (count !== 1) throw new FamilyError("You can rename once every 30 days.");
      await spendFromVault(tx, family.id, CRIME_FAMILY_CONFIG.renameFee, "rename_fee", bossId, { from: current.name, to: name.name });
      return tx.family.findUniqueOrThrow({ where: { id: family.id } });
    });
  } catch (err) {
    if (isUniqueViolation(err, "Family_nameKey_key")) throw new FamilyError("Name taken.");
    throw err;
  }
}

/** Moderator rename (`crew-forcerename <TAG> <name>`): the name rules apply; no fee, no cooldown. */
export async function forceRenameFamily(tag: string, rawName: string, adminId: string): Promise<Family> {
  const family = await getFamilyByTag(tag);
  if (!family) throw new FamilyError("No family with that tag.");
  const name = checkFamilyName(rawName);
  if (!name.ok) throw new FamilyError(name.reason);
  try {
    return await runFamilyTx(async (tx) => {
      // updateMany: a disband since the tag read is a refusal, not a raw P2025.
      const { count } = await tx.family.updateMany({ where: { id: family.id }, data: { name: name.name, nameKey: name.nameKey } });
      if (count === 0) throw new FamilyError("No family with that tag.");
      await tx.audit.create({
        data: { userId: adminId, type: "family_forcerename", meta: { tag: family.tag, from: family.name, to: name.name } },
      });
      return tx.family.findUniqueOrThrow({ where: { id: family.id } });
    });
  } catch (err) {
    if (isUniqueViolation(err, "Family_nameKey_key")) throw new FamilyError("Name taken.");
    throw err;
  }
}
