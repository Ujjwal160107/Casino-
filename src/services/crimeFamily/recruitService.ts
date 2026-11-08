// The recruitment board's writes (amendment 8): the listing (pitch, stat
// requirements, recruiting on or off), applying, withdrawing, accepting through
// the shared join path, declining, and the officers' digest CAS. Every write is
// one runFamilyTx: an apply touches the family (its 25-pending cap) and the
// applicant's User document (their 3-pending cap, A35).
import type { Family, FamilyInvite, FamilyMember, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import { levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { computeNetWorth } from "../netWorthService";
import { isObjectId, parseBidAmount } from "./bidService";
import { checkMemberEligibility, eligibilityError } from "./eligibility";
import { requireMembership } from "./familyQueries";
import { joinFamilyInTx, withSeatRetry } from "./membershipService";
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

/**
 * The listing modal (M2): every input is checked before anything is written; a blank pitch keeps the stored one (F10).
 * `shown` is what M2 pre-filled. Only the requirements the officer changed from `shown` are written, so a stale modal
 * never reverts another officer's newer value; it is refused only when both changed the same requirement.
 */
export async function editListing(actorId: string, input: ListingInput, shown: Requirements, now: Date = new Date()): Promise<Family> {
  let pitch: string | null = null;
  if (input.pitch.trim() !== "") {
    const checked = checkPublicText(input.pitch, CRIME_FAMILY_CONFIG.pitchChars);
    if (!checked.ok) throw new FamilyError(checked.reason);
    pitch = checked.text;
  }
  const data: Prisma.FamilyUpdateInput = {};
  const edited: (typeof REQUIREMENTS)[number][] = [];
  for (const r of REQUIREMENTS) {
    const parsed = parseRequirement(input[INPUT_OF[r.key]], r.max);
    if (!parsed.ok) throw new FamilyError(`${r.label}: ${parsed.reason}`);
    if (parsed.value === shown[r.key]) continue;
    edited.push(r);
    Object.assign(data, { [r.field]: parsed.value });
  }
  const { family } = await requireMembership(actorId);
  return runFamilyTx(async (tx) => {
    await touchFamily(tx, family.id, now);
    await assertMayInTx(tx, family.id, actorId, "edit_listing", now);
    const current = await tx.family.findUniqueOrThrow({ where: { id: family.id } });
    const clash = edited.find((r) => current[r.field] !== shown[r.key]);
    if (clash) throw new FamilyError(`Another officer just changed "${clash.label}". Reopen \`!crew recruit\` to see it.`);
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

/**
 * An applicant's four requirement stats, read through db (a transaction or the
 * client): net worth through `netWorth` (computeNetWorth for a gate, so every
 * retry recomputes; getNetWorth for display, A33).
 */
export async function readApplicantStats(
  db: Prisma.TransactionClient, uid: string, now: Date, netWorth: (uid: string) => Promise<{ total: number }>,
): Promise<Requirements> {
  const [user, heists, { total }] = await Promise.all([
    db.user.findUnique({ where: { discordId: uid }, select: { shiftsWorked: true, createdAt: true } }),
    db.caperCrew.count({ where: { userId: uid, started: true } }),
    netWorth(uid),
  ]);
  return {
    netWorth: total,
    shifts: user?.shiftsWorked ?? 0,
    ageDays: user ? Math.floor((now.getTime() - user.createdAt.getTime()) / DAY_MS) : 0,
    heists,
  };
}

/** A recent decline (7 d) or withdraw/expiry (24 h) of this pair (A44), and when it lifts: the apply refusal and S30's status line. */
export async function reapplyBlock(
  db: Prisma.TransactionClient, familyId: string, applicantId: string, now: Date,
): Promise<{ declined: boolean; at: Date } | null> {
  const { reapplyAfterDeclineSeconds: afterDecline, reapplyAfterWithdrawSeconds: afterWithdraw } = CRIME_FAMILY_CONFIG;
  const prior = await db.familyInvite.findFirst({
    where: {
      familyId, inviteeId: applicantId, kind: "APPLICATION",
      OR: [
        { status: "DECLINED", resolvedAt: { gte: secondsAfter(now, -afterDecline) } },
        { status: { in: ["WITHDRAWN", "EXPIRED"] }, resolvedAt: { gte: secondsAfter(now, -afterWithdraw) } },
      ],
    },
    orderBy: { resolvedAt: "desc" },
  });
  if (!prior) return null;
  const declined = prior.status === "DECLINED";
  return { declined, at: secondsAfter(prior.resolvedAt, declined ? afterDecline : afterWithdraw) };
}

/**
 * The first refusal of amendment 8.4 step 2 for this applicant and family.
 * `stats` is read only when the cheaper gates pass: live inside the apply
 * transaction, cached on S30.
 */
export async function applyBlock(
  db: Prisma.TransactionClient, family: Family, applicantId: string, now: Date, stats: () => Promise<Requirements>,
): Promise<string | null> {
  const tag = `[${family.tag}]`;
  if (await db.familyMember.findUnique({ where: { userId: applicantId }, select: { id: true } })) return "You are already in a family.";
  const gate = await checkMemberEligibility(applicantId, "family_join", { now, familyId: family.id });
  if (!gate.ok) return eligibilityError(gate.failures).message;
  if (!family.recruiting) return `${tag} is not recruiting.`;
  if (family.memberCount >= levelDef(family.level).memberCap) return `${tag} is full.`;
  const have = await stats();
  for (const r of REQUIREMENTS) {
    const need = family[r.field] as number;
    if (have[r.key] < need) return `${tag} needs ${fmtFortunes(need)} ${r.unit} (you have ${fmtFortunes(have[r.key])}).`;
  }
  const mine = await db.familyInvite.count({ where: { inviteeId: applicantId, kind: "APPLICATION", status: "PENDING" } });
  if (mine >= CRIME_FAMILY_CONFIG.maxPendingApplicationsPerApplicant) {
    return `You have ${CRIME_FAMILY_CONFIG.maxPendingApplicationsPerApplicant} pending applications. Withdraw one first.`;
  }
  const theirs = await db.familyInvite.count({ where: { familyId: family.id, kind: "APPLICATION", status: "PENDING" } });
  if (theirs >= CRIME_FAMILY_CONFIG.maxPendingApplicationsPerFamily) return `${tag}'s inbox is full. Try again later.`;
  const reapply = await reapplyBlock(db, family.id, applicantId, now);
  if (reapply?.declined) return `${tag} declined you: you can apply again ${rel(reapply.at)}.`;
  if (reapply) return `You can apply to ${tag} again ${rel(reapply.at)}.`;
  return null;
}

/** The apply modal (M1, amendment 8.4): one PENDING application, refused in the spec's order. Applications never post a card (F12). */
export async function applyToFamily(i: {
  applicantId: string; familyId: string; message: string; guildId: string; channelId: string; now?: Date;
}): Promise<FamilyInvite> {
  const now = i.now ?? new Date();
  const checked = checkPublicText(i.message, CRIME_FAMILY_CONFIG.applicationChars);
  if (!checked.ok) throw new FamilyError(checked.reason);
  if (!isObjectId(i.familyId)) throw new FamilyError("That family no longer exists.");
  try {
    return await runFamilyTx(async (tx) => {
      if (!(await tx.family.findUnique({ where: { id: i.familyId }, select: { id: true } }))) throw new FamilyError("That family no longer exists.");
      await touchFamily(tx, i.familyId, now);
      const family = await tx.family.findUniqueOrThrow({ where: { id: i.familyId } });
      const block = await applyBlock(tx, family, i.applicantId, now, () => readApplicantStats(tx, i.applicantId, now, computeNetWorth));
      if (block) throw new FamilyError(block);
      // After the slow gate reads, so a held apply never blocks a concurrent join; a join that wrote the User meanwhile conflicts and retries this.
      await touchUser(tx, i.applicantId, now);
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
  if (!isObjectId(appId)) throw new FamilyError(NOT_PENDING);
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

/** Reads an application for an officer's answer; anything else reads as no longer pending. */
async function readApplication(appId: string): Promise<FamilyInvite> {
  if (!isObjectId(appId)) throw new FamilyError(NOT_PENDING);
  const app = await prisma.familyInvite.findUnique({ where: { id: appId } });
  if (!app || app.kind !== "APPLICATION") throw new FamilyError(NOT_PENDING);
  return app;
}

/**
 * S32 Accept (amendment 8.5): CAS the application, then the shared join, in one
 * transaction; any refusal rolls the row back to PENDING. The presser is the
 * officer, so a player who joined elsewhere reads as "<@x> is already in a family.".
 */
export async function acceptApplication(
  appId: string, officerId: string, now: Date = new Date(),
): Promise<{ family: Family; member: FamilyMember; application: FamilyInvite }> {
  const app = await readApplication(appId);
  const alreadyInFamily = `<@${app.inviteeId}> is already in a family.`;
  return withSeatRetry(() => runFamilyTx(async (tx) => {
    await assertMayInTx(tx, app.familyId, officerId, "review_apps", now);
    const joined = await tx.familyMember.findUnique({ where: { userId: app.inviteeId }, select: { familyId: true } });
    if (joined && joined.familyId !== app.familyId) throw new FamilyError(alreadyInFamily);
    const { count } = await tx.familyInvite.updateMany({
      where: { id: appId, kind: "APPLICATION", status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", slot: appId, inviterId: officerId, resolvedAt: now },
    });
    if (count !== 1) throw new FamilyError(NOT_PENDING);
    if (joined) throw new FamilyError(alreadyInFamily);
    const { family, member } = await joinFamilyInTx(tx, { familyId: app.familyId, uid: app.inviteeId, inviterId: officerId, now });
    return { family, member, application: await tx.familyInvite.findUniqueOrThrow({ where: { id: appId } }) };
  }), { alreadyInFamily });
}

/**
 * S32 Decline: CAS PENDING and unexpired → DECLINED (slot = id); the applicant may reapply after
 * reapplyAfterDeclineSeconds. Returns the family read in the same transaction, so the applicant's
 * DM never depends on the officer still being a member after the commit.
 */
export async function declineApplication(
  appId: string, officerId: string, now: Date = new Date(),
): Promise<{ family: Family; application: FamilyInvite }> {
  const app = await readApplication(appId);
  return runFamilyTx(async (tx) => {
    await assertMayInTx(tx, app.familyId, officerId, "review_apps", now);
    await touchFamily(tx, app.familyId, now);
    const { count } = await tx.familyInvite.updateMany({
      where: { id: appId, kind: "APPLICATION", status: "PENDING", expiresAt: { gt: now } },
      data: { status: "DECLINED", slot: appId, inviterId: officerId, resolvedAt: now },
    });
    if (count !== 1) throw new FamilyError(NOT_PENDING);
    const family = await tx.family.findUniqueOrThrow({ where: { id: app.familyId } });
    return { family, application: await tx.familyInvite.findUniqueOrThrow({ where: { id: appId } }) };
  });
}

/** Families whose last digest is a window old and that have a PENDING application newer than it (A36). */
export async function familiesDueDigest(now: Date): Promise<string[]> {
  const newest = await prisma.familyInvite.groupBy({
    by: ["familyId"], where: { kind: "APPLICATION", status: "PENDING" }, _max: { createdAt: true },
  });
  if (newest.length === 0) return [];
  const families = await prisma.family.findMany({
    where: { id: { in: newest.map((n) => n.familyId) }, appDigestAt: { lte: secondsAfter(now, -CRIME_FAMILY_CONFIG.appDigestEverySeconds) } },
    select: { id: true, appDigestAt: true },
  });
  const digestAt = new Map(families.map((f) => [f.id, f.appDigestAt]));
  return newest.filter((n) => {
    const at = digestAt.get(n.familyId);
    return at !== undefined && n._max.createdAt !== null && n._max.createdAt > at;
  }).map((n) => n.familyId);
}

/** The digest CAS on appDigestAt: the new applications since the last digest, or 0 when there are none or another run won. */
export async function claimDigest(familyId: string, now: Date): Promise<number> {
  const family = await prisma.family.findUnique({ where: { id: familyId }, select: { appDigestAt: true } });
  if (!family) return 0;
  const since = family.appDigestAt;
  const n = await prisma.familyInvite.count({ where: { familyId, kind: "APPLICATION", status: "PENDING", createdAt: { gt: since } } });
  if (n === 0) return 0;
  const { count } = await prisma.family.updateMany({ where: { id: familyId, appDigestAt: since }, data: { appDigestAt: now } });
  return count === 1 ? n : 0;
}
