// Registries that plans 2 (Capers) and 3 (Turf) extend. Add an entry here;
// never add a branch to the family services. A hook module must not import
// membershipService or disbandService (they import this file: a cycle).
import { Prisma } from "@prisma/client";
import { CAPER_ACTIVITY_RULE, CAPER_FAMILY_HOOK } from "./caperHooks";
import { TURF_FAMILY_HOOK, WAR_HITS_RULE } from "./turfHooks";

/** One way a member counts as active in the last 7 days (spec 7.3). */
export interface ActivityRule {
  key: string;
  label: string;
  need: number;
  count(userId: string, since: Date): Promise<number>;
}

export const ACTIVITY_RULES: ActivityRule[] = [CAPER_ACTIVITY_RULE, WAR_HITS_RULE];

export type MemberExitKind = "LEFT" | "KICKED";

export interface FamilyHook {
  key: string;
  // Blocks run inside the runFamilyTx callback after touchFamily, so every retry re-checks; a string → FamilyError(string).
  memberExitBlock?(tx: Prisma.TransactionClient, ctx: { familyId: string; userId: string; kind: MemberExitKind }): Promise<string | null>;
  /** Returns the users whose wallets it wrote (a refund), so the caller drops their cached user after the commit. */
  onMemberExit?(tx: Prisma.TransactionClient, ctx: { familyId: string; userId: string; kind: MemberExitKind; now: Date }): Promise<string[] | void>;
  disbandBlock?(tx: Prisma.TransactionClient, familyId: string): Promise<string | null>;
  /** Runs after the blocks, before the final payday. */
  onDisband?(tx: Prisma.TransactionClient, ctx: { familyId: string; now: Date }): Promise<void>;
  /** What onDisband would add to earnings (plan 3 escrow). */
  disbandPreview?(familyId: string): Promise<{ returnedToEarnings: number }>;
  /** Plan 3; with no provider, views show no racket count (P23). */
  racketsHeld?(familyIds: string[]): Promise<Map<string, number>>;
}

export const FAMILY_HOOKS: FamilyHook[] = [CAPER_FAMILY_HOOK, TURF_FAMILY_HOOK];

/** Rackets held per family from the first hook that provides them, or null when none does. */
export async function racketsHeldFor(familyIds: string[]): Promise<Map<string, number> | null> {
  const provider = FAMILY_HOOKS.find((h) => h.racketsHeld);
  return provider?.racketsHeld ? provider.racketsHeld(familyIds) : null;
}
