// View types passed from the family services to the UI builders (types only).
// Each later view type is added by the task that first produces it.
import type { FamilyLevelDef, FamilyRole } from "../../data/crimeFamilyCatalog";
import type { LedgerLine } from "./ledger";

/** S2: the family dashboard as one viewer sees it. */
export interface FamilyDashboardView {
  familyId: string;
  name: string;
  tag: string;
  level: number;
  xp: number;
  nextLevelXp: number | null;
  memberCount: number;
  memberCap: number;
  crestKey: FamilyLevelDef["crestKey"];
  /** Rank desc, then joinedAt asc. associateUntil is always null for the BOSS row (P20). */
  roster: { userId: string; role: FamilyRole; associateUntil: Date | null }[];
  duesArrears: number;
  nextCaperAt: Date;
  underInvestigation: boolean;
  /** Null when no FAMILY_HOOKS entry provides racketsHeld (P23). */
  racketsHeld: number | null;
  showTurf: boolean;
  viewer: { userId: string; role: FamilyRole | null; canManage: boolean; canClaim: boolean };
}

/** S6: the vault as an officer or member sees it (the only screen with vault amounts, D59). */
export interface VaultView {
  familyId: string;
  tag: string;
  treasury: number;
  earnings: number;
  level: number;
  duesPerDay: number;
  duesArrears: number;
  /** duesArrears × duesPerLevel × level: what clearing the arrears costs now. */
  arrearsOwed: number;
  lastPaydayAt: Date;
  nextPaydayAt: Date;
  /** The newest vaultLedgerLines rows. */
  ledger: LedgerLine[];
  /** Whether the viewer may run Payday and Level up (Boss or Underboss). */
  canOfficer: boolean;
}
