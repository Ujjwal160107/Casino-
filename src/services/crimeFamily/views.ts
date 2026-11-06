// View types passed from the family services to the UI builders (types only).
// Each later view type is added by the task that first produces it.
import type { CaperRoleKey, FamilyLevelDef, FamilyRole } from "../../data/crimeFamilyCatalog";
import type { LedgerLine } from "./ledger";
import type { WarSettlement, WarStatus } from "./warService";
import type { BidPhase, BlockScores, RacketClass } from "./warMath";

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
  /** Capos seated and the Capo cap for this size (amendment 3.2); capos may exceed capoCap (grandfathered). */
  capos: number;
  capoCap: number;
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
  heistCap: number; // heistCapFor(memberCount)
  duesArrears: number;
  underInvestigation: boolean;
  investigationThreshold: number; // investigationThresholdFor(memberCount)
  canPlan: boolean;
  live: { caperId: string; tier: number; status: string; guildId: string; channelId: string; messageId: string } | null;
}

/** T8: one home-channel war board, stored in `War.boards` so it is edited by id without a fetch. */
/** `reposted` is set once the board's one repost (edge 28) is spent; absent on refs stored before it existed. */
export type WarBoardRef = {
  side: "ATK" | "DEF"; guildId: string; channelId: string; messageId: string; hasBanner: boolean; dead: boolean; reposted?: boolean;
};

/** S16, S17: one racket as the map shows it. */
export interface TurfRacketLine {
  key: string;
  name: string;
  class: RacketClass;
  income: number;
  ownerFamilyId: string;
  /** "[TAG] Name" or "the Street". */
  ownerLabel: string;
  strikes: number;
  /** The racket's latest BIDDING, ARMED or ACTIVE war. */
  war: { id: string; status: WarStatus; topBid: number; topBidderLabel: string | null; bidClosesAt: Date; startsAt: Date } | null;
  nextWarAt: Date;
  /** The nextWarAt bid window at view time: what S17 shows when there is no live war. */
  bidding: { phase: BidPhase; nextOpensAt: Date };
}

/** S16: the 10 rackets in `RACKETS` order and the soonest war. */
export interface TurfMapView {
  rackets: TurfRacketLine[];
  nextWar: { racketName: string; startsAt: Date };
}

/** S17: one racket and whether the viewer may bid on it now. */
export interface RacketDetailView {
  line: TurfRacketLine;
  floor: number;
  minBid: number;
  minFamilyLevel: number;
  viewerIsOfficer: boolean;
  canBid: boolean;
  blockers: string[];
}

export interface WarSideView {
  familyId: string;
  label: string;
}

/** S18 (and S21's board half): one war's live board. */
export interface WarBoardView {
  warId: string;
  racketKey: string;
  racketName: string;
  racketClass: RacketClass;
  startsAt: Date;
  endsAt: Date;
  attacker: WarSideView;
  defender: WarSideView;
  scores: BlockScores;
  hits: { atk: number; def: number };
  /** The top 5 scorers per side, most points first. */
  top: { atk: { userId: string; points: number }[]; def: { userId: string; points: number }[] };
  blackout: boolean;
}

/** S21: the settled war. */
export interface WarResultView {
  board: WarBoardView;
  outcome: WarSettlement["outcome"];
  overCap: boolean;
  xp: { label: string; xp: number }[];
  heated: number;
}
