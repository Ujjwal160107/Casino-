// The worst case of every Crime Families screen, read by
// test/crimeFamily/layout.test.ts and src/scripts/checkV2Payloads.ts.
// `max` is the spec 13.3 component count. Built from literal views: no DB.
// Plans 2 and 3 append their screens here.
import { MAX_SAFE_BALANCE } from "../../utils/economyConfig";
import { FAMILY_LEVELS, type FamilyRole } from "../../data/crimeFamilyCatalog";
import type { EligibilityResult } from "../../services/crimeFamily/eligibility";
import type { LedgerLine, LedgerType } from "../../services/crimeFamily/ledger";
import type { FamilyDashboardView, InviteView, LeaderboardView, PaydayPreview, VaultView } from "../../services/crimeFamily/views";
import {
  buildClaimNotice, buildClaimResolved, buildConfirm, buildCreateConfirm, buildDashboard, buildDisbandConfirm, buildInviteCard,
  buildInviteResolved, buildLedgerPage, buildLeaderboard, buildLevelUpConfirm, buildManagePanel, buildMyInvites, buildNoFamilyCard,
  buildPaydayPreview, buildVaultPanel,
} from "../../ui/crimeFamily/familyScreens";
import { CREW_IDS } from "../../ui/crimeFamily/ids";
import { buildNotice, buildOpener, type CfPayload } from "../../ui/crimeFamily/kit";
import { caperWorstCases } from "./caperScreens";
import { turfWorstCases } from "./turfScreens";

const OWNER = "12345678901234567890";
const FAMILY_ID = "65f0000000000000000000ff";
const BIG = MAX_SAFE_BALANCE - 1;
const LONG_NAME = "Velvet Ante Syndicate Ok"; // 24 characters
const SOON = () => new Date(Date.now() + 3_600_000);

/** 30 distinct 20-digit member ids; the owner is the first (the Boss). */
const MEMBERS = Array.from({ length: 30 }, (_, i) => (i === 0 ? OWNER : `9876543210987654${String(3200 + i)}`));
/** Boss, Underboss, 6 Capos, 12 Soldiers, then 10 Soldiers inside their 72 h (indexes 20..29). */
const ROLES: FamilyRole[] = ["BOSS", "UNDERBOSS", ...Array<FamilyRole>(6).fill("CAPO"), ...Array<FamilyRole>(22).fill("SOLDIER")];
/** The first 12 members: the screens whose 30-member worst case a later task sets (S6, S7, S28). */
const TWELVE = MEMBERS.slice(0, 12);

function failingResult(n: number): EligibilityResult {
  const checks = Array.from({ length: n }, (_, i) => ({
    gate: `gate_${i}`, need: `≥ ${(15_000_000 + i).toLocaleString("en-US")} net worth in fortunes`, have: `${BIG.toLocaleString("en-US")} net worth`, ok: i % 2 === 0,
  }));
  return { ok: false, checks, failures: checks.filter((c) => !c.ok) };
}

/** S2's worst case: 30 members, 10 Associates, and an Underboss inside its 72 h (F8: listed on its rank line). */
export function dashboardView(): FamilyDashboardView {
  return {
    familyId: FAMILY_ID, name: LONG_NAME, tag: "WXYZ", level: 9, xp: 46_000, nextLevelXp: 60_000, memberCount: 30, memberCap: 30,
    capos: 6, capoCap: 6, crestKey: "crest_3",
    roster: MEMBERS.map((userId, i) => ({ userId, role: ROLES[i], associateUntil: i === 1 || i >= 20 ? SOON() : null })),
    duesArrears: 999, nextCaperAt: SOON(), underInvestigation: true, racketsHeld: 3, showTurf: true,
    viewer: { userId: OWNER, role: "UNDERBOSS", canManage: true, canClaim: true },
  };
}

const LEDGER_TYPES: LedgerType[] = ["deposit", "deposit_tax", "payday", "payday_tax", "caper_cut", "racket_income", "dues_missed", "xp"];

function ledgerLines(n: number): LedgerLine[] {
  return Array.from({ length: n }, (_, i) => {
    const type = LEDGER_TYPES[i % LEDGER_TYPES.length];
    return {
      at: new Date(), type, actorId: MEMBERS[i % MEMBERS.length], amount: -BIG, treasuryAfter: BIG, earningsAfter: BIG,
      meta: type === "xp" ? { xp: 999_999 } : type.endsWith("_tax") ? { burned: BIG } : null,
    };
  });
}

function paydayPreview(locked: boolean): PaydayPreview {
  return {
    familyId: FAMILY_ID, earnings: BIG, count: locked ? 0 : 6,
    split: { gross: 1_000_000, tax: 50_000, net: 950_000 },
    eligible: locked ? [] : TWELVE.slice(0, 6),
    ineligible: (locked ? TWELVE : TWELVE.slice(6)).map((userId) => ({
      userId, reason: "≥ 2 crew heist seats or ≥ 3 correct war hits in 7 days (you have 0 crew heist seats, 0 correct war hits)",
    })),
    dueAt: SOON(),
    lockedReason: locked ? "Payday locked: nobody qualifies yet." : null,
  };
}

function vaultView(locked: boolean): VaultView {
  return {
    familyId: FAMILY_ID, tag: "WXYZ", treasury: BIG, earnings: BIG, level: 9, duesPerDay: 360_000, duesArrears: 999, arrearsOwed: BIG,
    lastPaydayAt: new Date(), nextPaydayAt: SOON(), ledger: ledgerLines(10), canOfficer: true,
    payday: paydayPreview(locked),
    levelUp: { next: FAMILY_LEVELS[9], blockers: ["Needs 60,000 XP (have 46,000).", "Clear dues arrears first."] },
  };
}

function inviteView(i: number): InviteView {
  return {
    inviteId: `65f00000000000000000000${i}`, familyLabel: `[WXY${i}] ${LONG_NAME}`, crestKey: "crest_4",
    inviterId: MEMBERS[i + 1], inviteeId: OWNER, expiresAt: SOON(), memberCount: 11, memberCap: 12,
  };
}

function leaderboardView(): LeaderboardView {
  return {
    sort: "xp",
    sorts: [{ key: "xp", label: "XP" }, { key: "rk", label: "Rackets" }, { key: "war", label: "War wins" }],
    rows: Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1, familyId: FAMILY_ID, tag: `WX${String(i).padStart(2, "0")}`, name: LONG_NAME, level: i === 0 ? 10 : 9,
      crestKey: i === 0 ? "crest_4" : "crest_3", members: 12, rackets: 3, value: BIG,
    })),
    viewer: { rank: 999_999, value: BIG },
  };
}

export function crimeFamilyWorstCases(): { label: string; max: number; payload: CfPayload }[] {
  const dash = dashboardView();
  return [
    { label: "S1 no-family card", max: 13, payload: buildNoFamilyCard(OWNER, failingResult(9), failingResult(10)) },
    { label: "S2 dashboard (claim row, turf, 30 members)", max: 20, payload: buildDashboard(dash, { art: true }) },
    { label: "S2 dashboard (visitor)", max: 20, payload: buildDashboard({ ...dash, viewer: { userId: OWNER, role: null, canManage: false, canClaim: false } }, { art: true }) },
    { label: "S3 create confirm", max: 7, payload: buildCreateConfirm(OWNER, { name: LONG_NAME, tag: "WXYZ", fee: 10_000_000 }) },
    { label: "S4 invite card", max: 9, payload: buildInviteCard(inviteView(1)) },
    { label: "S4 invite resolved", max: 9, payload: buildInviteResolved(inviteView(1), "Expired") },
    { label: "S5 manage (page 2 of 2, one selected)", max: 16, payload: buildManagePanel(OWNER, { ...dash, viewer: { ...dash.viewer, role: "BOSS" } }, MEMBERS[19], 1, `<@${MEMBERS[1]}> is now a Soldier (no Capo seat was free).`) },
    { label: "S6 vault (payday locked, 12 ineligible)", max: 12, payload: buildVaultPanel(OWNER, vaultView(true), "Deposited 25,000,000.") },
    { label: "S6 vault (payday open)", max: 12, payload: buildVaultPanel(OWNER, vaultView(false)) },
    { label: "S7 payday preview (12 members)", max: 6, payload: buildPaydayPreview(OWNER, paydayPreview(false), "Members changed.") },
    { label: "S8 level-up confirm", max: 6, payload: buildLevelUpConfirm(OWNER, vaultView(false)) },
    { label: "S9 log (15 lines)", max: 7, payload: buildLedgerPage(OWNER, { rows: ledgerLines(15), page: 98, pages: 999 }) },
    { label: "S10 leaderboard (3 sorts)", max: 13, payload: buildLeaderboard(OWNER, leaderboardView(), { art: true }) },
    { label: "S22 disband", max: 6, payload: buildDisbandConfirm(OWNER, "WXYZ", { finalPayday: paydayPreview(false), burnTreasury: BIG, burnEarnings: BIG }) },
    { label: "S23 claim notice", max: 4, payload: buildClaimNotice(FAMILY_ID, MEMBERS[1], OWNER) },
    { label: "S23 claim resolved", max: 2, payload: buildClaimResolved(`Chair claimed by <@${MEMBERS[1]}>`) },
    { label: "S24 my invites (5)", max: 7, payload: buildMyInvites(OWNER, [1, 2, 3, 4, 5].map(inviteView)) },
    { label: "S26 confirm (hand over)", max: 6, payload: buildConfirm(OWNER, "chair", MEMBERS[1], "You become a Soldier. They become the Boss and hold every Boss power. This cannot be undone.") },
    { label: "S27 opener", max: 4, payload: buildOpener(`<@${OWNER}>, open your family vault.`, { customId: CREW_IDS.open("vault", OWNER), label: "Open vault" }) },
    { label: "S28 notice", max: 2, payload: buildNotice(`Payday: 12 members paid 950,000 each\n${TWELVE.map((m) => `<@${m}>`).join(" ")}`) },
    { label: "S28 notice with button", max: 4, payload: buildNotice("Your family's crew heist is GO.", { customId: CREW_IDS.view("home", OWNER), label: "Open" }, TWELVE) },
    ...caperWorstCases(),
    ...turfWorstCases(),
  ];
}
