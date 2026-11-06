// The recruitment board's writes (amendment 8): the listing (pitch, stat
// requirements, recruiting on or off), applying and withdrawing. Every write is
// one runFamilyTx: an apply touches the family (its 25-pending cap) and the
// applicant's User document (their 3-pending cap, A35).
import type { Family, FamilyInvite, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import { levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { computeNetWorth } from "../netWorthService";
import { parseBidAmount } from "./bidService";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { requireMembership } from "./familyQueries";
import { checkPublicText } from "./names";
import { can, NO_PERMISSION, type FamilyAction } from "./permissions";
import { FamilyError, isUniqueViolation, runFamilyTx, touchFamily, touchUser } from "./tx";

export type BoardSort = "lvl" | "mem" | "act";
export type Requirements = { netWorth: number; shifts: number; ageDays: number; heists: number };
export type ListingInput = { pitch: string; minNetWorth: string; minShifts: string; minAgeDays: string; minHeists: string };
export type RequirementParse = { ok: true; value: number } | { ok: false; reason: string };

const LIMITS = CRIME_FAMILY_CONFIG.recruitLimits;

/** The four listing requirements (amendment 8.2), in display order: the one table the listing, the board and the card render from. */
export const REQUIREMENTS: readonly { key: keyof Requirements; label: string; field: keyof Family; max: number; unit: string }[] = [
  { key: "netWorth", label: "Min net worth", field: "recruitMinNetWorth", max: LIMITS.netWorth, unit: "net worth" },
  { key: "shifts", label: "Min lifetime shifts", field: "recruitMinShifts", max: LIMITS.shifts, unit: "lifetime shifts" },
  { key: "ageDays", label: "Min Fortuna account age", field: "recruitMinAgeDays", max: LIMITS.ageDays, unit: "days on Fortuna" },
  { key: "heists", label: "Min lifetime crew heists", field: "recruitMinHeists", max: LIMITS.heists, unit: "crew heists" },
];

/** The listing modal input of each requirement. */
const INPUT_OF: Readonly<Record<keyof Requirements, keyof ListingInput>> = {
  netWorth: "minNetWorth", shifts: "minShifts", ageDays: "minAgeDays", heists: "minHeists",
};

const NOT_PENDING = "Application no longer pending.";
const DAY_MS = 86_400_000;
const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const secondsAfter = (d: Date, seconds: number) => new Date(d.getTime() + seconds * 1000);

/** A requirement input (F11, F18): blank and 0 are 0; otherwise the bid parser's whole-number rules, at most max. */
export function parseRequirement(raw: string, max: number): RequirementParse {
  const s = raw.trim();
  if (s === "" || s === "0") return { ok: true, value: 0 };
  const value = parseBidAmount(s);
  if (value === null) return { ok: false, reason: "Enter a whole number like 10m or 1,000." };
  if (value > max) return { ok: false, reason: `Max ${fmtFortunes(max)}.` };
  return { ok: true, value };
}

/** Inside a family transaction: the actor is still in familyId with the right to take action. */
async function assertMayInTx(tx: Prisma.TransactionClient, familyId: string, actorId: string, action: FamilyAction, now: Date): Promise<void> {
  const actor = await tx.familyMember.findUnique({ where: { userId: actorId } });
  if (!actor || actor.familyId !== familyId || !can({ role: actor.role as FamilyRole, joinedAt: actor.joinedAt }, action, now)) {
    throw new FamilyError(NO_PERMISSION);
  }
}

/** The listing modal (M2): every input is checked before anything is written; a blank pitch keeps the stored one (F10). */
export async function editListing(actorId: string, input: ListingInput, now: Date = new Date()): Promise<Family> {
  let pitch: string | null = null;
  if (input.pitch.trim() !== "") {
    const checked = checkPublicText(input.pitch, CRIME_FAMILY_CONFIG.pitchChars);
    if (!checked.ok) throw new FamilyError(checked.reason);
    pitch = checked.text;
  }
  const data: Prisma.FamilyUpdateInput = {};
  for (const r of REQUIREMENTS) {
    const parsed = parseRequirement(input[INPUT_OF[r.key]], r.max);
    if (!parsed.ok) throw new FamilyError(`${r.label}: ${parsed.reason}`);
    Object.assign(data, { [r.field]: parsed.value });
  }
  const { family } = await requireMembership(actorId);
  return runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    await assertMayInTx(tx, family.id, actorId, "edit_listing", now);
    return tx.family.update({ where: { id: family.id }, data: { ...data, ...(pitch === null ? {} : { recruitPitch: pitch }), recruitEditedAt: now } });
  });
}

/** Recruiting on or off (S31). Turning it off refuses new applications; pending ones stay reviewable. */
export async function setRecruiting(actorId: string, on: boolean, now: Date = new Date()): Promise<Family> {
  const { family } = await requireMembership(actorId);
  return runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    await assertMayInTx(tx, family.id, actorId, "edit_listing", now);
    const current = await tx.family.findUniqueOrThrow({ where: { id: family.id } });
    if (on && current.recruitPitch === "") throw new FamilyError("Write a pitch first (Edit listing).");
    return tx.family.update({ where: { id: family.id }, data: { recruiting: on } });
  });
}

/** The applicant's live stats for a requirement gate: net worth uncached, so every retry recomputes it. */
async function liveStats(tx: Prisma.TransactionClient, uid: string, now: Date): Promise<Requirements> {
  const [user, heists, { total }] = await Promise.all([
    tx.user.findUnique({ where: { discordId: uid }, select: { shiftsWorked: true, createdAt: true } }),
    tx.caperCrew.count({ where: { userId: uid, started: true } }),
    computeNetWorth(uid),
  ]);
  return {
    netWorth: total,
    shifts: user?.shiftsWorked ?? 0,
    ageDays: user ? Math.floor((now.getTime() - user.createdAt.getTime()) / DAY_MS) : 0,
    heists,
  };
}

/** The first refusal of amendment 8.4 step 2 for this applicant and family, read inside the apply transaction. */
async function applyBlock(tx: Prisma.TransactionClient, family: Family, applicantId: string, now: Date): Promise<string | null> {
  const tag = `[${family.tag}]`;
  if (await tx.familyMember.findUnique({ where: { userId: applicantId }, select: { id: true } })) return "You are already in a family.";
  const gate = await checkMemberEligibility(applicantId, "family_join", { now, familyId: family.id });
  if (!gate.ok) return eligibilityError(gate.failures).message;
  if (!family.recruiting) return `${tag} is not recruiting.`;
  if (family.memberCount >= levelDef(family.level).memberCap) return `${tag} is full.`;
  const have = await liveStats(tx, applicantId, now);
  for (const r of REQUIREMENTS) {
    const need = family[r.field] as number;
    if (have[r.key] < need) return `${tag} needs ${fmtFortunes(need)} ${r.unit} (you have ${fmtFortunes(have[r.key])}).`;
  }
  const mine = await tx.familyInvite.count({ where: { inviteeId: applicantId, kind: "APPLICATION", status: "PENDING" } });
  if (mine >= CRIME_FAMILY_CONFIG.maxPendingApplicationsPerApplicant) {
    return `You have ${CRIME_FAMILY_CONFIG.maxPendingApplicationsPerApplicant} pending applications. Withdraw one first.`;
  }
  const theirs = await tx.familyInvite.count({ where: { familyId: family.id, kind: "APPLICATION", status: "PENDING" } });
  if (theirs >= CRIME_FAMILY_CONFIG.maxPendingApplicationsPerFamily) return `${tag}'s inbox is full. Try again later.`;
  const { reapplyAfterDeclineSeconds: afterDecline, reapplyAfterWithdrawSeconds: afterWithdraw } = CRIME_FAMILY_CONFIG;
  const prior = await tx.familyInvite.findFirst({
    where: {
      familyId: family.id, inviteeId: applicantId, kind: "APPLICATION",
      OR: [
        { status: "DECLINED", resolvedAt: { gte: secondsAfter(now, -afterDecline) } },
        { status: { in: ["WITHDRAWN", "EXPIRED"] }, resolvedAt: { gte: secondsAfter(now, -afterWithdraw) } },
      ],
    },
    orderBy: { resolvedAt: "desc" },
  });
  if (prior?.status === "DECLINED") return `${tag} declined you: you can apply again ${rel(secondsAfter(prior.resolvedAt, afterDecline))}.`;
  if (prior) return `You can apply to ${tag} again ${rel(secondsAfter(prior.resolvedAt, afterWithdraw))}.`;
  return null;
}

/** The apply modal (M1, amendment 8.4): one PENDING application, refused in the spec's order. Applications never post a card (F12). */
export async function applyToFamily(i: {
  applicantId: string; familyId: string; message: string; guildId: string; channelId: string; now?: Date;
}): Promise<FamilyInvite> {
  const now = i.now ?? new Date();
  const checked = checkPublicText(i.message, CRIME_FAMILY_CONFIG.applicationChars);
  if (!checked.ok) throw new FamilyError(checked.reason);
  try {
    return await runFamilyTx(async (tx) => {
      if (!(await tx.family.findUnique({ where: { id: i.familyId }, select: { id: true } }))) throw new FamilyError("That family no longer exists.");
      await touchFamily(tx, i.familyId, now);
      await touchUser(tx, i.applicantId, now);
      const family = await tx.family.findUniqueOrThrow({ where: { id: i.familyId } });
      const block = await applyBlock(tx, family, i.applicantId, now);
      if (block) throw new FamilyError(block);
      return tx.familyInvite.create({
        data: {
          familyId: i.familyId, kind: "APPLICATION", inviterId: "", inviteeId: i.applicantId, message: checked.text,
          status: "PENDING", slot: "PENDING", guildId: i.guildId, channelId: i.channelId,
          expiresAt: secondsAfter(now, CRIME_FAMILY_CONFIG.applicationTtlSeconds),
        },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, "FamilyInvite_familyId_inviteeId_slot_key")) {
      throw new FamilyError("You already have a pending invite or application with this family.");
    }
    throw err;
  }
}

/** S33 withdraw: CAS PENDING → WITHDRAWN (slot = id, so the pair may apply again after the wait). No DM. */
export async function withdrawApplication(appId: string, applicantId: string, now: Date = new Date()): Promise<FamilyInvite> {
  const app = await prisma.familyInvite.findUnique({ where: { id: appId } });
  if (!app || app.inviteeId !== applicantId || app.kind !== "APPLICATION") throw new FamilyError(NOT_PENDING);
  return runFamilyTx(async (tx) => {
    if (await tx.family.findUnique({ where: { id: app.familyId }, select: { id: true } })) await touchFamily(tx, app.familyId, now);
    await touchUser(tx, applicantId, now);
    const { count } = await tx.familyInvite.updateMany({
      where: { id: appId, inviteeId: applicantId, kind: "APPLICATION", status: "PENDING" },
      data: { status: "WITHDRAWN", slot: appId, resolvedAt: now },
    });
    if (count !== 1) throw new FamilyError(NOT_PENDING);
    return tx.familyInvite.findUniqueOrThrow({ where: { id: appId } });
  });
}
