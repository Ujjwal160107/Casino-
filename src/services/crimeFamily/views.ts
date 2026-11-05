// View types passed from the family services to the UI builders (types only).
// Each later view type is added by the task that first produces it.
import type { CaperRoleKey, FamilyLevelDef, FamilyRole } from "../../data/crimeFamilyCatalog";
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
  /** The next level and why it cannot be bought yet (empty when it can). */
  levelUp: { next: FamilyLevelDef | null; blockers: string[] };
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

/** S10: the top families by one sort, and the viewer's family rank. No vault amounts (10.4). */
export interface LeaderboardView {
  sort: string;
  sorts: { key: string; label: string }[];
  rows: {
    rank: number;
    familyId: string;
    tag: string;
    name: string;
    level: number;
    crestKey: FamilyLevelDef["crestKey"];
    members: number;
    /** Null when no FAMILY_HOOKS entry provides racketsHeld (P23). */
    rackets: number | null;
    value: number;
  }[];
  viewer: { rank: number; value: number } | null;
}

/** S4 and S24: one pending invite. */
export interface InviteView {
  inviteId: string;
  familyLabel: string;
  crestKey: string;
  inviterId: string;
  inviteeId: string;
  expiresAt: Date;
  memberCount: number;
  memberCap: number;
}

/** S14: one seat's caper brief (spec 8.3). Only the viewer's own seat is ever rendered. */
export interface BriefView {
  caperId: string;
  ownerId: string;
  role: CaperRoleKey;
  /** The intel this seat holds: its ring predecessor's correct answer. */
  tell: { userId: string; label: string };
  /** This seat's own call; the answer is held by its ring successor. */
  call: { question: string; options: string[]; fromUserId: string };
  /** From leakAt, this seat's own correct label when its intel holder is dark. */
  leaked: string | null;
  /** From leakAt, whether this seat itself went dark (it cannot lock). */
  dark: boolean;
  lockedIndex: number | null;
  goEndsAt: Date;
  leakAt: Date;
}

/** One seat of a caper card, in tierRoles order; an open seat has userId null. */
export interface CaperSeatView {
  role: CaperRoleKey;
  optional: boolean;
  userId: string | null;
  locked: boolean;
  passed: boolean;
  leaked: boolean;
  /** Shown only once the caper has left RUNNING. */
  dark: boolean;
  /** The seat's ring successor: the holder of this seat's intel. */
  holderId: string | null;
  cut: number;
  fine: number;
  jailed: boolean;
}

/** S12, S13, S15 and the cancelled card: one shared caper card, built from the DB. */
export interface CaperCardView {
  caperId: string;
  familyLabel: string;
  tier: number;
  status: "LOBBY" | "RUNNING" | "SETTLING" | "RESOLVED" | "CANCELLED";
  outcome: "" | "CLEAN" | "MESSY" | "BUST" | "CANCELLED" | "VOID";
  plannerId: string;
  guildId: string;
  channelId: string;
  messageId: string;
  lobbyClosesAt: Date;
  goEndsAt: Date;
  leakAt: Date;
  /** tierRoles order. */
  seats: CaperSeatView[];
  openRoles: CaperRoleKey[];
  lockedCount: number;
  crewCount: number;
  roll: number;
  patrolChance: number;
  pool: number;
  note: string | null;
}

/** S11: the caper planner as one member sees it. */
export interface CaperPlannerView {
  ownerId: string;
  familyLabel: string;
  level: number;
  tiers: { tier: number; unlocked: boolean }[];
  nextCaperAt: Date;
  startedLast24h: number;
  duesArrears: number;
  underInvestigation: boolean;
  canPlan: boolean;
  live: { caperId: string; tier: number; status: string; guildId: string; channelId: string; messageId: string } | null;
}
