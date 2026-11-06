// Pure no-confidence vote math (amendment 4.2): the pass threshold, the
// outcome at close, the cooldown a close writes and the display reason of a
// VOID. No I/O.
import type { FamilyVote } from "@prisma/client";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";

export type VoteStatus = "OPEN" | "PASSED" | "FAILED" | "VOID";
export type VoidReason = "too_few" | "no_heir" | "chair_moved";
type ClosedStatus = Exclude<VoteStatus, "OPEN">;

/** YES ballots a pass needs: ceil(2 × eligible / 3) (29 eligible → 20). */
export function votePassNeed(eligible: number): number {
  return Math.ceil((2 * eligible) / 3);
}

/** The outcome at close, in order: a moved chair, too few voters, too few YES, no heir, else a pass. */
export function decideVote(i: { eligibleAtClose: number; yes: number; heirId: string | null; chairMoved: boolean }): { status: ClosedStatus; voidReason: VoidReason | null } {
  if (i.chairMoved) return { status: "VOID", voidReason: "chair_moved" };
  if (i.eligibleAtClose < CRIME_FAMILY_CONFIG.voteMinEligible) return { status: "VOID", voidReason: "too_few" };
  if (i.yes < votePassNeed(i.eligibleAtClose)) return { status: "FAILED", voidReason: null };
  if (i.heirId === null) return { status: "VOID", voidReason: "no_heir" };
  return { status: "PASSED", voidReason: null };
}

/** A failed vote and one voided for too few voters or no heir block the next for 7 days (A46); a pass or a moved chair do not. */
export function voteCooldownUntil(status: ClosedStatus, voidReason: VoidReason | null, closedAt: Date): Date {
  const cools = status === "FAILED" || (status === "VOID" && voidReason !== "chair_moved");
  return new Date(closedAt.getTime() + (cools ? CRIME_FAMILY_CONFIG.voteCooldownSeconds * 1000 : 0));
}

/** Why a closed vote is VOID, read back from the row (display only); null for any other status. */
export function voidReasonOf(v: Pick<FamilyVote, "status" | "eligibleAtClose" | "cooldownUntil" | "closedAt">): VoidReason | null {
  if (v.status !== "VOID") return null;
  if (v.cooldownUntil.getTime() <= v.closedAt.getTime()) return "chair_moved";
  if (v.eligibleAtClose < CRIME_FAMILY_CONFIG.voteMinEligible) return "too_few";
  return "no_heir";
}
