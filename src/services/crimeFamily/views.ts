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
  payday: PaydayPreview;
}

/** S7, and the S6 Payday button and rules hint. */
export interface PaydayPreview {
  familyId: string;
  earnings: number;
  /** Eligible members (N). */
  count: number;
  split: { gross: number; tax: number; net: number };
  eligible: string[];
  /** Each ineligible member's first failing payday gate, e.g. "≥ 7 days in the family (you have 3 days)". */
  ineligible: { userId: string; reason: string }[];
  dueAt: Date;
  /** "Earnings must reach 500,000." | "Payday locked: nobody qualifies yet." | null. */
  lockedReason: string | null;
}
