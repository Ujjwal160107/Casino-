// The recruitment board's reads (amendment 8.3): the applicant's stats, the
// board (S29), a family's card (S30), the officers' panel (S31) and inbox
// (S32), and the applicant's own applications (S33). No writes. Displayed
// net worth is the 600 s getNetWorth cache (A33): these screens never gate.
import type { Family, Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { FAMILY_LEVELS, levelDef, type FamilyRole } from "../../data/crimeFamilyCatalog";
import { computeNetWorth, getNetWorth } from "../netWorthService";
import { checkMemberEligibility } from "./eligibility";
import { familyLabel, requireMembership } from "./familyQueries";
import { can, NO_PERMISSION } from "./permissions";
import { applyBlock, readApplicantStats, reapplyBlock, REQUIREMENTS, type BoardSort, type Requirements } from "./recruitService";
import { FamilyError } from "./tx";
import type { BoardView, FamilyCardView, InboxView, MyApplicationsView, RecruitPanelView, ReqCheck } from "./views";

export type { BoardSort } from "./recruitService";
export type ApplicantStats = Requirements;

const BOARD_ORDER: Readonly<Record<BoardSort, Prisma.FamilyOrderByWithRelationInput[]>> = {
  lvl: [{ level: "desc" }, { memberCount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  mem: [{ memberCount: "desc" }, { level: "desc" }, { id: "asc" }],
  act: [{ activeMembers: "desc" }, { memberCount: "desc" }, { id: "asc" }],
};

const NOBODY_RECRUITING = "No family is recruiting right now.";
const NOTHING_FITS = "No recruiting family's requirements fit you yet.";

const clampPage = (page: number, pages: number) => Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

/** A player's four requirement stats; `cached` reads net worth through the display cache. */
export async function applicantStats(uid: string, now: Date, opts: { cached: boolean }): Promise<ApplicantStats> {
  return readApplicantStats(prisma, uid, now, opts.cached ? getNetWorth : computeNetWorth);
}

const requirementsOf = (f: Family): Requirements =>
  Object.fromEntries(REQUIREMENTS.map((r) => [r.key, f[r.field] as number])) as Requirements;

function reqChecks(f: Family, have: Requirements): ReqCheck[] {
  return REQUIREMENTS.map((r) => {
    const need = f[r.field] as number;
    return { key: r.key, label: r.label, need, have: have[r.key], ok: have[r.key] >= need };
  });
}

const qualifies = (f: Family, have: Requirements) => REQUIREMENTS.every((r) => have[r.key] >= (f[r.field] as number));

/** S29: recruiting families with a free seat; "I qualify" adds the join gate and one lte filter per requirement. */
export async function getBoardView(viewerId: string, sort: BoardSort, qualifyOnly: boolean, page: number, now: Date): Promise<BoardView> {
  const order = BOARD_ORDER[sort] ?? BOARD_ORDER.lvl;
  const base = { ownerId: viewerId, sort: BOARD_ORDER[sort] ? sort : "lvl" as BoardSort, qualifyOnly };
  const notFull: Prisma.FamilyWhereInput = {
    recruiting: true,
    OR: FAMILY_LEVELS.map((l) => ({ level: l.level, memberCount: { lt: l.memberCap } })),
  };
  const stats = await applicantStats(viewerId, now, { cached: true });
  let where = notFull;
  if (qualifyOnly) {
    const gate = await checkMemberEligibility(viewerId, "family_join", { now });
    if (!gate.ok) return { ...base, page: 0, pages: 1, rows: [], emptyReason: gate.failures[0].need };
    where = { ...notFull, AND: REQUIREMENTS.map((r) => ({ [r.field]: { lte: stats[r.key] } })) };
  }
  const size = CRIME_FAMILY_CONFIG.boardPageSize;
  const pages = pageCount(await prisma.family.count({ where }), size);
  const at = clampPage(page, pages);
  const families = await prisma.family.findMany({ where, orderBy: order, skip: at * size, take: size });
  return {
    ...base,
    page: at,
    pages,
    rows: families.map((f) => {
      const level = levelDef(f.level);
      return {
        familyId: f.id, tag: f.tag, name: f.name, level: f.level, crestKey: level.crestKey,
        members: f.memberCount, cap: level.memberCap, active: f.activeMembers, req: requirementsOf(f), qualifies: qualifies(f, stats),
      };
    }),
    emptyReason: families.length > 0 ? null : qualifyOnly ? NOTHING_FITS : NOBODY_RECRUITING,
  };
}

/** S30: the family's listing against the viewer's cached stats, and whether Apply is open. */
export async function getFamilyCardView(familyId: string, viewerId: string, now: Date): Promise<FamilyCardView> {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new FamilyError("That family no longer exists.");
  const [stats, gate, pending, applied, reapply] = await Promise.all([
    applicantStats(viewerId, now, { cached: true }),
    checkMemberEligibility(viewerId, "family_join", { now, familyId }),
    prisma.familyInvite.count({ where: { inviteeId: viewerId, kind: "APPLICATION", status: "PENDING" } }),
    prisma.familyInvite.findFirst({ where: { familyId, inviteeId: viewerId, kind: "APPLICATION", status: "PENDING" } }),
    reapplyBlock(prisma, familyId, viewerId, now),
  ]);
  const first = gate.failures[0];
  const block = (await applyBlock(prisma, family, viewerId, now, async () => stats))
    ?? (applied ? `You already applied to [${family.tag}].` : null);
  const level = levelDef(family.level);
  return {
    ownerId: viewerId, familyId, label: familyLabel(family), tag: family.tag, crestKey: level.crestKey, level: family.level,
    members: family.memberCount, cap: level.memberCap, active: family.activeMembers, pitch: family.recruitPitch, recruiting: family.recruiting,
    checks: reqChecks(family, stats),
    joinGate: first ? `${first.need} (you have ${first.have})` : null,
    pending,
    appliedAt: applied?.createdAt ?? null,
    reapplyAt: reapply?.at ?? null,
    applyBlock: block,
  };
}

/** The officer's family and whether they may edit the listing; refused unless they may review applications. */
async function requireReviewer(officerId: string, now: Date): Promise<{ family: Family; canEdit: boolean }> {
  const { family, member } = await requireMembership(officerId);
  const actor = { role: member.role as FamilyRole, joinedAt: member.joinedAt };
  if (!can(actor, "review_apps", now)) throw new FamilyError(NO_PERMISSION);
  return { family, canEdit: can(actor, "edit_listing", now) };
}

const pendingOf = (familyId: string) => ({ familyId, kind: "APPLICATION", status: "PENDING" });

/** S31. */
export async function getRecruitPanelView(officerId: string, now: Date): Promise<RecruitPanelView> {
  const { family, canEdit } = await requireReviewer(officerId, now);
  const pending = await prisma.familyInvite.count({ where: pendingOf(family.id) });
  return {
    ownerId: officerId, tag: family.tag, recruiting: family.recruiting, pitch: family.recruitPitch,
    req: requirementsOf(family), pending, canEdit,
  };
}

/** S32: PENDING applications oldest first, inboxPageSize a page, page clamped. */
export async function getInboxView(officerId: string, page: number, now: Date): Promise<InboxView> {
  const { family } = await requireReviewer(officerId, now);
  const size = CRIME_FAMILY_CONFIG.inboxPageSize;
  const total = await prisma.familyInvite.count({ where: pendingOf(family.id) });
  const pages = pageCount(total, size);
  const at = clampPage(page, pages);
  const apps = await prisma.familyInvite.findMany({
    where: pendingOf(family.id), orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: at * size, take: size,
  });
  const rows = await Promise.all(apps.map(async (a) => ({
    appId: a.id, applicantId: a.inviteeId, createdAt: a.createdAt, expiresAt: a.expiresAt, message: a.message,
    checks: reqChecks(family, await applicantStats(a.inviteeId, now, { cached: true })),
  })));
  return { ownerId: officerId, tag: family.tag, page: at, pages, total, rows };
}

/** S33: the viewer's PENDING applications (at most maxPendingApplicationsPerApplicant) with each family's label. */
export async function getMyApplicationsView(uid: string, _now: Date): Promise<MyApplicationsView> {
  const apps = await prisma.familyInvite.findMany({
    where: { inviteeId: uid, kind: "APPLICATION", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: CRIME_FAMILY_CONFIG.maxPendingApplicationsPerApplicant,
  });
  const families = await prisma.family.findMany({ where: { id: { in: apps.map((a) => a.familyId) } }, select: { id: true, tag: true, name: true } });
  const labels = new Map(families.map((f) => [f.id, familyLabel(f)]));
  return {
    ownerId: uid,
    rows: apps.flatMap((a) => {
      const label = labels.get(a.familyId);
      return label ? [{ appId: a.id, familyLabel: label, createdAt: a.createdAt, expiresAt: a.expiresAt }] : [];
    }),
  };
}
