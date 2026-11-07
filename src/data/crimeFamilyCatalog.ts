// Static Crime Families data: caper tiers and roles, rackets, war blocks,
// family levels, eligibility gates and name rules. Numbers are copied from
// docs/superpowers/specs/2026-10-28-crime-families-heists-design.md (8.1–8.3,
// 9.1, 9.4, 10.1, 12.1, 6.2, 16.2). Tunable flags and money knobs live in
// CRIME_FAMILY_CONFIG (src/utils/economyConfig.ts).
import { CRIME_PREP_WHITELIST } from "./crimePrepWhitelist";

// ── Family roles ─────────────────────────────────────────────────────────────

export type FamilyRole = "BOSS" | "UNDERBOSS" | "CAPO" | "SOLDIER";

/** Display names and rank emoji keys. ASSOCIATE is derived (tenure < 72 h), never stored. */
export const FAMILY_ROLES: Readonly<Record<FamilyRole | "ASSOCIATE", { name: string; emojiKey: string }>> = {
  BOSS: { name: "Boss", emojiKey: "rank_boss" },
  UNDERBOSS: { name: "Underboss", emojiKey: "rank_underboss" },
  CAPO: { name: "Capo", emojiKey: "rank_capo" },
  SOLDIER: { name: "Soldier", emojiKey: "rank_soldier" },
  ASSOCIATE: { name: "Associate", emojiKey: "rank_associate" },
};

/** Capo role slots, filled lowest free first (amendment 3.2). The cap is a count check (capoCapFor), not the slot list. */
export const CAPO_SLOTS = ["CAPO1", "CAPO2", "CAPO3", "CAPO4", "CAPO5", "CAPO6"] as const;

// ── Names and tags (6.2) ─────────────────────────────────────────────────────

export const FAMILY_NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9 '\-]{1,22}[A-Za-z0-9]$/;
export const FAMILY_TAG_RULE = /^[A-Z0-9]{2,4}$/;

/** Matched as substrings after lowercasing and stripping non-alphanumerics. "street" is the NPC racket owner. */
export const FAMILY_NAME_DENYLIST: readonly string[] = [
  "fortuna", "admin", "staff", "mod", "discord", "police", "cops", "street", "everyone", "here",
];

/** Lowercase slurs, matched the same way as the denylist (spec 21.9). */
export const FAMILY_NAME_SLURS: readonly string[] = [
  "nigger", "nigga", "faggot", "retard", "tranny", "kike", "chink", "wetback", "gook", "raghead", "towelhead", "beaner",
];

/** Impersonation words refused as whole words in a recruitment pitch or application message (amendment 8.6). */
export const PITCH_DENYLIST: readonly string[] = ["fortuna", "admin", "staff", "mod", "moderator", "discord"];

// ── Caper roles (8.2, 8.3) ───────────────────────────────────────────────────

export type CaperRoleKey = "MASTERMIND" | "LOOKOUT" | "SAFECRACKER" | "DRIVER" | "MUSCLE" | "HACKER";

export interface CaperRoleDef {
  key: CaperRoleKey;
  name: string;
  emojiKey: string;
  prepKeys: readonly string[];
  call: string;
  labels: readonly string[];
}

/** In seat order: the intel ring follows this order (8.3). */
export const CAPER_ROLES: readonly CaperRoleDef[] = [
  {
    key: "MASTERMIND", name: "Mastermind", emojiKey: "role_mastermind",
    prepKeys: ["business_briefcase", "legal_case_file", "blackmarket_resume", "corporate_blessing"],
    call: "Which floor holds the cash",
    labels: ["Basement", "Ground Floor", "Mezzanine", "2nd Floor", "3rd Floor", "Roof Office"],
  },
  {
    key: "LOOKOUT", name: "Lookout", emojiKey: "role_lookout",
    prepKeys: ["hunting_permit", "camouflage_kit", "lucky_coin", "rabbit_foot_charm", "fox_tail_talisman"],
    call: "Which guard shift change to wait for",
    labels: ["9:00 PM", "10:15 PM", "11:30 PM", "12:45 AM", "2:00 AM", "3:15 AM"],
  },
  {
    key: "SAFECRACKER", name: "Safecracker", emojiKey: "role_safecracker",
    prepKeys: ["mechanic_toolkit", "thief_gloves", "lab_kit", "calculator_pro", "cheat_sheet"],
    call: "Which dial colour opens it",
    labels: ["Crimson", "Amber", "Jade", "Cobalt", "Violet", "Ivory"],
  },
  {
    key: "DRIVER", name: "Driver", emojiKey: "role_driver",
    prepKeys: ["iron_spurs", "guard_vest", "arctic_wolf_spirit_charm"],
    call: "Which escape route is clear",
    labels: ["Harbor Bypass", "Canal Street", "Old Rail Road", "Market Alley", "Bridge Ramp", "Tunnel 9"],
  },
  {
    key: "MUSCLE", name: "Muscle", emojiKey: "role_muscle",
    prepKeys: ["wooden_rifle", "iron_rifle", "sniper_rifle", "wolf_fang_dagger"],
    call: "Which door is unguarded",
    labels: ["Loading Bay", "Staff Door", "Fire Exit", "Skylight", "Kitchen Door", "Side Gate"],
  },
  {
    key: "HACKER", name: "Hacker", emojiKey: "role_hacker",
    prepKeys: ["counterfeit_kit", "eclipse_mask", "python_skin_cloak", "komodo_venom_flask"],
    call: "Which camera feed to loop",
    labels: ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05", "CAM-06"],
  },
];

export function caperRole(key: CaperRoleKey): CaperRoleDef {
  const role = CAPER_ROLES.find((r) => r.key === key);
  if (!role) throw new Error(`Unknown caper role ${key}`);
  return role;
}

/** Every prep whitelist item belongs to exactly one caper role (8.2). */
function assertRolePartition(): void {
  const owners = new Map<string, number>();
  for (const role of CAPER_ROLES) for (const k of role.prepKeys) owners.set(k, (owners.get(k) ?? 0) + 1);
  for (const item of CRIME_PREP_WHITELIST) {
    if (owners.get(item.key) !== 1) throw new Error(`Prep item ${item.key} must belong to exactly one caper role`);
  }
  const known = new Set(CRIME_PREP_WHITELIST.map((i) => i.key));
  for (const k of owners.keys()) if (!known.has(k)) throw new Error(`Caper role prep key ${k} is not in CRIME_PREP_WHITELIST`);
}
assertRolePartition();

// ── Caper tiers (8.1) ────────────────────────────────────────────────────────

export interface CaperTierDef {
  tier: 1 | 2 | 3 | 4;
  key: string;
  name: string;
  levelToPlan: number;
  crewMin: number;
  crewMax: number;
  required: readonly CaperRoleKey[];
  optional: CaperRoleKey;
  poolPerSeat: number;
  stake: number;
  bustFine: number;
  jail: { chance: number; seconds: number } | null;
  heat: { clean: number; messy: number; bust: number };
  heatCeiling: number;
  patrolBase: number;
  seatGate: { shifts: number; fortunaAgeDays: number; netWorth: number };
  xp: { clean: number; messy: number; bust: number };
  bannerKey: string;
}

export const CAPER_TIERS: readonly CaperTierDef[] = [
  {
    tier: 1, key: "pawnshop", name: "Pawnshop Back Room", levelToPlan: 1, crewMin: 3, crewMax: 4,
    required: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], optional: "DRIVER",
    poolPerSeat: 350_000, stake: 50_000, bustFine: 150_000, jail: null,
    heat: { clean: 20, messy: 30, bust: 40 }, heatCeiling: 70, patrolBase: 0.10,
    seatGate: { shifts: 20, fortunaAgeDays: 14, netWorth: 2_000_000 },
    xp: { clean: 150, messy: 60, bust: 20 }, bannerKey: "caper_t1",
  },
  {
    tier: 2, key: "payroll", name: "Payroll Van", levelToPlan: 3, crewMin: 4, crewMax: 5,
    required: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"], optional: "MUSCLE",
    poolPerSeat: 550_000, stake: 100_000, bustFine: 300_000, jail: { chance: 0.2, seconds: 1200 },
    heat: { clean: 25, messy: 35, bust: 45 }, heatCeiling: 60, patrolBase: 0.15,
    seatGate: { shifts: 60, fortunaAgeDays: 30, netWorth: 8_000_000 },
    xp: { clean: 225, messy: 90, bust: 30 }, bannerKey: "caper_t2",
  },
  {
    tier: 3, key: "racetrack", name: "Racetrack Cashier Cage", levelToPlan: 5, crewMin: 5, crewMax: 6,
    required: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"], optional: "HACKER",
    poolPerSeat: 850_000, stake: 175_000, bustFine: 500_000, jail: { chance: 0.35, seconds: 2700 },
    heat: { clean: 30, messy: 40, bust: 50 }, heatCeiling: 50, patrolBase: 0.20,
    seatGate: { shifts: 150, fortunaAgeDays: 30, netWorth: 20_000_000 },
    xp: { clean: 300, messy: 120, bust: 40 }, bannerKey: "caper_t3",
  },
  {
    tier: 4, key: "diamond", name: "Diamond Exchange Vault", levelToPlan: 8, crewMin: 5, crewMax: 6,
    required: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"], optional: "HACKER",
    poolPerSeat: 1_200_000, stake: 300_000, bustFine: 750_000, jail: { chance: 0.5, seconds: 3600 },
    heat: { clean: 40, messy: 50, bust: 60 }, heatCeiling: 40, patrolBase: 0.25,
    seatGate: { shifts: 300, fortunaAgeDays: 45, netWorth: 40_000_000 },
    xp: { clean: 375, messy: 150, bust: 50 }, bannerKey: "caper_t4",
  },
];

export function caperTier(n: number): CaperTierDef {
  const tier = CAPER_TIERS.find((t) => t.tier === n);
  if (!tier) throw new Error(`Unknown caper tier ${n}`);
  return tier;
}

/** Integer percent arithmetic for the caper pool (8.6). */
export const CAPER_OUTCOME_PCT = { CLEAN: 100, MESSY: 35, BUST: 0 } as const;
export const CAPER_SPLIT_PCT = { crew: 80, vault: 10 } as const;

// ── Rackets (9.1) ────────────────────────────────────────────────────────────

export type RacketClass = "CORNER" | "DISTRICT" | "CROWN";

export interface RacketDef {
  key: string;
  name: string;
  class: RacketClass;
  incomePerCycle: number;
  warDow: number; // 0 = Sunday (getUTCDay)
  warHourUtc: number;
}

export const RACKET_CLASSES: Readonly<Record<RacketClass, { name: string; baseline: number; minFamilyLevel: number; xpMultiplier: number; emojiKey: string }>> = {
  CORNER: { name: "Corner", baseline: 30, minFamilyLevel: 1, xpMultiplier: 1, emojiKey: "turf_corner" },
  DISTRICT: { name: "District", baseline: 50, minFamilyLevel: 4, xpMultiplier: 1.5, emojiKey: "turf_district" },
  CROWN: { name: "Crown", baseline: 80, minFamilyLevel: 7, xpMultiplier: 2, emojiKey: "turf_crown" },
};

export const RACKETS: readonly RacketDef[] = [
  { key: "docks_numbers", name: "Dockside Numbers", class: "CORNER", incomePerCycle: 300_000, warDow: 1, warHourUtc: 18 },
  { key: "laundromat_front", name: "Laundromat Front", class: "CORNER", incomePerCycle: 300_000, warDow: 2, warHourUtc: 12 },
  { key: "harbor_customs", name: "Harbor Customs Skim", class: "DISTRICT", incomePerCycle: 650_000, warDow: 2, warHourUtc: 18 },
  { key: "neon_strip", name: "Neon Strip Clubs", class: "DISTRICT", incomePerCycle: 650_000, warDow: 3, warHourUtc: 1 },
  { key: "valet_racket", name: "Valet Parking Racket", class: "CORNER", incomePerCycle: 300_000, warDow: 3, warHourUtc: 18 },
  { key: "pawn_row", name: "Pawn Row Fencing", class: "CORNER", incomePerCycle: 300_000, warDow: 4, warHourUtc: 1 },
  { key: "union_kickbacks", name: "Construction Union Kickbacks", class: "DISTRICT", incomePerCycle: 650_000, warDow: 4, warHourUtc: 18 },
  { key: "racetrack_book", name: "Racetrack Bookmaking", class: "DISTRICT", incomePerCycle: 650_000, warDow: 5, warHourUtc: 12 },
  { key: "casino_row", name: "Casino Row Protection", class: "CROWN", incomePerCycle: 1_300_000, warDow: 6, warHourUtc: 18 },
  { key: "city_hall", name: "City Hall Contracts", class: "CROWN", incomePerCycle: 1_300_000, warDow: 0, warHourUtc: 12 },
];

export function racketDef(key: string): RacketDef | undefined {
  return RACKETS.find((r) => r.key === key);
}

// ── Wars (9.4) ───────────────────────────────────────────────────────────────

export const WAR_BLOCKS: readonly { key: "docks" | "main" | "alleys"; name: string; emojiKey: string; approaches: readonly string[] }[] = [
  { key: "docks", name: "Docks", emojiKey: "block_docks", approaches: ["Crane", "Warehouse", "Pier 4", "Boathouse"] },
  { key: "main", name: "Main Street", emojiKey: "block_main", approaches: ["Bank Steps", "Diner", "Bus Stop", "Hotel Lobby"] },
  { key: "alleys", name: "Back Alleys", emojiKey: "block_alleys", approaches: ["Fire Escape", "Dumpster Row", "Cellar Door", "Laundry Line"] },
];

export const WAR_RULES = { atkPoints: 10, defPoints: 12, captureXp: 300, hitXp: 5, racketCycleXp: 20, lossHeat: 15, slots: 12, crownCap: 1 } as const;

// ── Family levels (10.1) ─────────────────────────────────────────────────────

export interface FamilyLevelDef {
  level: number;
  xpToReach: number;
  fee: number;
  memberCap: number;
  racketCap: number;
  tierUnlocked: 1 | 2 | 3 | 4 | null;
  caperCooldownSeconds: number;
  crestKey: "crest_1" | "crest_2" | "crest_3" | "crest_4";
}

export const FAMILY_LEVELS: readonly FamilyLevelDef[] = [
  { level: 1, xpToReach: 0, fee: 0, memberCap: 10, racketCap: 1, tierUnlocked: 1, caperCooldownSeconds: 10_800, crestKey: "crest_1" },
  { level: 2, xpToReach: 1_000, fee: 2_000_000, memberCap: 12, racketCap: 1, tierUnlocked: null, caperCooldownSeconds: 10_800, crestKey: "crest_1" },
  { level: 3, xpToReach: 3_000, fee: 4_000_000, memberCap: 14, racketCap: 1, tierUnlocked: 2, caperCooldownSeconds: 10_800, crestKey: "crest_1" },
  { level: 4, xpToReach: 6_000, fee: 6_000_000, memberCap: 16, racketCap: 2, tierUnlocked: null, caperCooldownSeconds: 9_900, crestKey: "crest_2" },
  { level: 5, xpToReach: 10_000, fee: 10_000_000, memberCap: 18, racketCap: 2, tierUnlocked: 3, caperCooldownSeconds: 9_900, crestKey: "crest_2" },
  { level: 6, xpToReach: 16_000, fee: 14_000_000, memberCap: 20, racketCap: 2, tierUnlocked: null, caperCooldownSeconds: 9_000, crestKey: "crest_2" },
  { level: 7, xpToReach: 24_000, fee: 20_000_000, memberCap: 23, racketCap: 3, tierUnlocked: null, caperCooldownSeconds: 9_000, crestKey: "crest_3" },
  { level: 8, xpToReach: 34_000, fee: 28_000_000, memberCap: 25, racketCap: 3, tierUnlocked: 4, caperCooldownSeconds: 9_000, crestKey: "crest_3" },
  { level: 9, xpToReach: 46_000, fee: 38_000_000, memberCap: 28, racketCap: 3, tierUnlocked: null, caperCooldownSeconds: 7_200, crestKey: "crest_3" },
  { level: 10, xpToReach: 60_000, fee: 50_000_000, memberCap: 30, racketCap: 3, tierUnlocked: null, caperCooldownSeconds: 7_200, crestKey: "crest_4" },
];

export function levelDef(level: number): FamilyLevelDef {
  const def = FAMILY_LEVELS.find((l) => l.level === level);
  if (!def) throw new Error(`Unknown family level ${level}`);
  return def;
}

// ── Eligibility gates (12.1) ─────────────────────────────────────────────────

export type GateKey = "found" | "family_join" | "caper_t1" | "caper_t2" | "caper_t3" | "caper_t4" | "war" | "racket" | "payday";

export interface GateDef {
  discordAgeDays: number;
  fortunaAgeDays: number | null;
  shifts: number;
  netWorth: number | null;
  tenureSeconds: number | null;
  heatBelow: number | null;
  notJailed: boolean;
  notInFamily: boolean;
  activeMember: boolean;
  hop: "join" | "found" | null;
  prepItem: boolean;
}

const MEMBER_TENURE_SECONDS = 259_200; // 72 h
const PAYDAY_TENURE_SECONDS = 604_800; // 7 d

/** caper_t<n> is built from CAPER_TIERS[n-1] so the two tables cannot drift. */
function caperGate(tier: CaperTierDef): GateDef {
  return {
    discordAgeDays: 90, fortunaAgeDays: tier.seatGate.fortunaAgeDays, shifts: tier.seatGate.shifts, netWorth: tier.seatGate.netWorth,
    tenureSeconds: MEMBER_TENURE_SECONDS, heatBelow: tier.heatCeiling, notJailed: true, notInFamily: false, activeMember: false,
    hop: null, prepItem: true,
  };
}

export const ELIGIBILITY_GATES: Readonly<Record<GateKey, GateDef>> = {
  found: {
    discordAgeDays: 180, fortunaAgeDays: 30, shifts: 60, netWorth: 15_000_000, tenureSeconds: null, heatBelow: 70,
    notJailed: true, notInFamily: true, activeMember: false, hop: "found", prepItem: false,
  },
  family_join: {
    discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: 1_000_000, tenureSeconds: null, heatBelow: null,
    notJailed: true, notInFamily: false, activeMember: false, hop: "join", prepItem: false,
  },
  caper_t1: caperGate(caperTier(1)),
  caper_t2: caperGate(caperTier(2)),
  caper_t3: caperGate(caperTier(3)),
  caper_t4: caperGate(caperTier(4)),
  war: {
    discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: null, tenureSeconds: MEMBER_TENURE_SECONDS, heatBelow: 100,
    notJailed: true, notInFamily: false, activeMember: false, hop: null, prepItem: false,
  },
  racket: {
    discordAgeDays: 90, fortunaAgeDays: null, shifts: 20, netWorth: null, tenureSeconds: MEMBER_TENURE_SECONDS, heatBelow: null,
    notJailed: false, notInFamily: false, activeMember: true, hop: null, prepItem: false,
  },
  payday: {
    discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: null, tenureSeconds: PAYDAY_TENURE_SECONDS, heatBelow: null,
    notJailed: false, notInFamily: false, activeMember: true, hop: null, prepItem: false,
  },
};
