// Founding a family, moving its home channel and the moderator's force
// rename. Task 9 adds the Boss's paid rename here.
import type { Family } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { debitWalletInTx } from "../walletService";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { getFamilyByTag, requireMembership } from "./familyQueries";
import { writeLedger } from "./ledger";
import { checkFamilyName, checkFamilyTag } from "./names";
import { can, NO_PERMISSION } from "./permissions";
import { FamilyError, isUniqueViolation, runFamilyTx } from "./tx";
import { utcDayKey } from "./vaultService";
import type { FamilyRole } from "../../data/crimeFamilyCatalog";

/**
 * Spec 6.1: burns the creation fee and seats the founder as Boss in one
 * transaction. The unique indexes on nameKey, tagKey and FamilyMember.userId
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
  try {
    return await runFamilyTx(async (tx) => {
      await debitWalletInTx(tx, input.uid, fee, "family_create", { tag: tag.tag });
      const family = await tx.family.create({
        data: {
          name: name.name, nameKey: name.nameKey, tag: tag.tag, tagKey: tag.tagKey, bossId: input.uid,
          homeGuildId: input.guildId, homeChannelId: input.channelId, duesDayKey: utcDayKey(now),
        },
      });
      await tx.familyMember.create({
        data: { familyId: family.id, userId: input.uid, role: "BOSS", roleSlot: "BOSS", seat: 1, joinedAt: now, lastActiveAt: now },
      });
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
}

/** The Boss moves the family's home channel (`!crew home`). */
export async function setHomeChannel(bossId: string, guildId: string, channelId: string): Promise<Family> {
  const { family, member } = await requireMembership(bossId);
  if (!can({ role: member.role as FamilyRole, joinedAt: member.joinedAt }, "set_home", new Date())) throw new FamilyError(NO_PERMISSION);
  const { count } = await prisma.family.updateMany({ where: { id: family.id, bossId }, data: { homeGuildId: guildId, homeChannelId: channelId } });
  if (count === 0) throw new FamilyError(NO_PERMISSION);
  return prisma.family.findUniqueOrThrow({ where: { id: family.id } });
}

/** Moderator rename (`crew-forcerename <TAG> <name>`): the name rules apply; no fee, no cooldown. */
export async function forceRenameFamily(tag: string, rawName: string, adminId: string): Promise<Family> {
  const family = await getFamilyByTag(tag);
  if (!family) throw new FamilyError("No family with that tag.");
  const name = checkFamilyName(rawName);
  if (!name.ok) throw new FamilyError(name.reason);
  try {
    return await runFamilyTx(async (tx) => {
      const updated = await tx.family.update({ where: { id: family.id }, data: { name: name.name, nameKey: name.nameKey } });
      await tx.audit.create({
        data: { userId: adminId, type: "family_forcerename", meta: { tag: family.tag, from: family.name, to: name.name } },
      });
      return updated;
    });
  } catch (err) {
    if (isUniqueViolation(err, "Family_nameKey_key")) throw new FamilyError("Name taken.");
    throw err;
  }
}
