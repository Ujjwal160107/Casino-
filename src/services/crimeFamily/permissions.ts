// The spec 6.3 permission table: which stored role may take which family
// action. Associate status is derived from tenure (P20). Callers re-read the
// actor's row from the DB on every press; a customId never carries a role.
import type { FamilyRole } from "../../data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";

export type FamilyAction =
  | "view" | "deposit" | "invite" | "kick" | "promote" | "demote" | "handover" | "plan_caper" | "take_seat"
  | "payday" | "level_up" | "bid" | "war_act" | "set_home" | "rename" | "disband" | "claim_chair" | "manage"
  | "start_vote" | "cast_vote" | "edit_listing" | "review_apps";

/** The one permission refusal every family service uses. */
export const NO_PERMISSION = "You don't have permission to do that.";

export const ROLE_RANK: Readonly<Record<FamilyRole, number>> = { BOSS: 4, UNDERBOSS: 3, CAPO: 2, SOLDIER: 1 };

const ALL: readonly FamilyRole[] = ["BOSS", "UNDERBOSS", "CAPO", "SOLDIER"];
const CAPO_UP: readonly FamilyRole[] = ["BOSS", "UNDERBOSS", "CAPO"];
const UNDERBOSS_UP: readonly FamilyRole[] = ["BOSS", "UNDERBOSS"];
const BOSS_ONLY: readonly FamilyRole[] = ["BOSS"];

/** The role columns of spec 6.3. */
const ROLE_ACTIONS: Readonly<Record<FamilyAction, readonly FamilyRole[]>> = {
  view: ALL,
  deposit: ALL,
  invite: CAPO_UP,
  kick: CAPO_UP,
  promote: UNDERBOSS_UP,
  demote: UNDERBOSS_UP,
  handover: BOSS_ONLY,
  plan_caper: CAPO_UP,
  take_seat: ALL,
  payday: UNDERBOSS_UP,
  level_up: UNDERBOSS_UP,
  bid: UNDERBOSS_UP,
  war_act: ALL,
  set_home: BOSS_ONLY,
  rename: BOSS_ONLY,
  disband: BOSS_ONLY,
  claim_chair: ["UNDERBOSS"],
  manage: CAPO_UP,
  start_vote: ["UNDERBOSS", "CAPO"],
  cast_vote: ["UNDERBOSS", "CAPO", "SOLDIER"],
  edit_listing: UNDERBOSS_UP,
  review_apps: CAPO_UP,
};

/** The only actions the Associate column removes from a non-Boss role (P20). */
const ASSOCIATE_BLOCKED: ReadonlySet<FamilyAction> = new Set(["take_seat", "war_act"]);

const ROLE_UP: Readonly<Record<FamilyRole, FamilyRole | null>> = { SOLDIER: "CAPO", CAPO: "UNDERBOSS", UNDERBOSS: null, BOSS: null };
const ROLE_DOWN: Readonly<Record<FamilyRole, FamilyRole | null>> = { UNDERBOSS: "CAPO", CAPO: "SOLDIER", SOLDIER: null, BOSS: null };

/** The role a promotion gives; null when promotion cannot move it (the chair moves only by handover or claim). */
export function nextRoleUp(role: FamilyRole): FamilyRole | null {
  return ROLE_UP[role];
}

/** The role a demotion gives; null when nothing is below it (or it is the Boss). */
export function nextRoleDown(role: FamilyRole): FamilyRole | null {
  return ROLE_DOWN[role];
}

/** Tenure under 72 h. A pure date test: display callers skip it for the BOSS row (P20). */
export function isAssociate(joinedAt: Date, now: Date): boolean {
  return joinedAt.getTime() > now.getTime() - CRIME_FAMILY_CONFIG.associateSeconds * 1000;
}

/**
 * Whether actor may take action now. Kick, promote and demote also need the
 * target: kick and demote only reach ranks below the actor, and a promotion
 * may only lift the target to a rank still below the actor.
 */
export function can(actor: { role: FamilyRole; joinedAt: Date }, action: FamilyAction, now: Date, target?: { role: FamilyRole }): boolean {
  if (!ROLE_ACTIONS[action].includes(actor.role)) return false;
  if (actor.role !== "BOSS" && ASSOCIATE_BLOCKED.has(action) && isAssociate(actor.joinedAt, now)) return false;
  if (!target) return true;
  const actorRank = ROLE_RANK[actor.role];
  switch (action) {
    case "kick":
      return ROLE_RANK[target.role] < actorRank;
    case "promote": {
      const next = nextRoleUp(target.role);
      return next !== null && ROLE_RANK[next] < actorRank;
    }
    case "demote":
      return ROLE_RANK[target.role] < actorRank && nextRoleDown(target.role) !== null;
    default:
      return true;
  }
}

/**
 * start_vote by rank, or for voteOfficerGraceSeconds after a demotion out of
 * Underboss or Capo (A41). Never the Boss, even one still inside an
 * officerUntil from before the chair moved to them. Tenure is checked apart.
 */
export function mayStartVote(member: { role: FamilyRole; joinedAt: Date; officerUntil: Date }, now: Date): boolean {
  return member.role !== "BOSS" && (can(member, "start_vote", now) || member.officerUntil > now);
}
