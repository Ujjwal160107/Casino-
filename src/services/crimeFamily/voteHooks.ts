// The no-confidence vote's entries in the family registries (amendment 4.2,
// 4.3 step 4): an OPEN vote freezes kicks, rank changes, disband and handover,
// and any chair move voids it with no cooldown. Imports only Prisma types and
// the extension types: never familyQueries, chairService, membershipService or
// disbandService (cycle through extensions.ts).
import type { FamilyVote, Prisma } from "@prisma/client";
import type { FamilyHook } from "./extensions";

/** The family's OPEN vote, or null, read through db (a transaction client inside a family transaction). */
export function findOpenVote(db: Prisma.TransactionClient, familyId: string): Promise<FamilyVote | null> {
  return db.familyVote.findFirst({ where: { familyId, status: "OPEN" } });
}

/** Whether the family has an OPEN vote, read through db. */
export async function hasOpenVote(db: Prisma.TransactionClient, familyId: string): Promise<boolean> {
  return (await findOpenVote(db, familyId)) !== null;
}

/**
 * Inside a chair move: the family's OPEN vote (if any) becomes VOID with
 * cooldownUntil = closedAt (no cooldown, A46). resultAnnounced stays false,
 * so the mover's announceVoteResult edits S34.
 */
export async function voidOpenVotesInTx(tx: Prisma.TransactionClient, familyId: string, now: Date): Promise<void> {
  const open = await findOpenVote(tx, familyId);
  if (!open) return;
  await tx.familyVote.updateMany({
    where: { id: open.id, status: "OPEN" },
    data: { status: "VOID", liveSlot: open.id, closedAt: now, cooldownUntil: now },
  });
}

const frozen = (line: string) => async (tx: Prisma.TransactionClient, familyId: string) =>
  (await hasOpenVote(tx, familyId)) ? line : null;

export const VOTE_FAMILY_HOOK: FamilyHook = {
  key: "vote",
  async memberExitBlock(tx, { familyId, kind }) {
    if (kind !== "KICKED") return null;
    return (await hasOpenVote(tx, familyId)) ? "No kicks while a no-confidence vote is open." : null;
  },
  disbandBlock: frozen("No disband while a no-confidence vote is open."),
  rankChangeBlock: frozen("No promotions or demotions while a no-confidence vote is open."),
  handoverBlock: frozen("No handover while a no-confidence vote is open."),
  onChairMove: voidOpenVotesInTx,
};
