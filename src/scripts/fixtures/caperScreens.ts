// The worst case of every caper screen (spec 13.3 S11–S15, S25, S27, S28),
// appended to crimeFamilyWorstCases() and read by both layout tests and
// src/scripts/checkV2Payloads.ts. Built from literal views: no DB.
import { MAX_SAFE_BALANCE } from "../../utils/economyConfig";
import { caperRole, type CaperRoleKey } from "../../data/crimeFamilyCatalog";
import type { BriefView, CaperCardView, CaperPlannerView, CaperSeatView } from "../../services/crimeFamily/views";
import {
  buildBrief, buildCaperCard, buildCaperPlanner, buildCaperSeatCard, buildGoCall, buildLobbyMoved, buildPersonalCaperCard,
} from "../../ui/crimeFamily/caperScreens";
import { CPR_IDS } from "../../ui/crimeFamily/ids";
import { buildOpener, type CfPayload } from "../../ui/crimeFamily/kit";
import { jumpLink } from "../../ui/crimeFamily/post";

const OWNER = "12345678901234567890";
const CAPER_ID = "65f0000000000000000000aa";
const GUILD = "11111111111111111111";
const CHANNEL = "22222222222222222222";
const MESSAGE = "33333333333333333333";
const BIG = MAX_SAFE_BALANCE - 1;
const FAMILY_LABEL = "[WXYZ] Velvet Ante Syndicate Ok"; // 24-character name
const NOTE = "N".repeat(200);
const SOON = () => new Date(Date.now() + 3_600_000);

/** The T4 seats in ring order; the owner is the Mastermind. */
const T4_ROLES: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"];
const CREW = T4_ROLES.map((_, i) => (i === 0 ? OWNER : `9876543210987654${String(3300 + i)}`));
/** A 20-digit member holding no seat. */
const OUTSIDER = "98765432109876543399";

function seats(filled: number, ended: boolean): CaperSeatView[] {
  return T4_ROLES.map((role, i) => ({
    role, optional: role === "HACKER", userId: i < filled ? CREW[i] : null, locked: ended || i % 2 === 0,
    passed: i % 2 === 0, leaked: ended, dark: ended && i % 2 === 1, holderId: ended ? CREW[(i + 1) % CREW.length] : null,
    cut: ended ? 0 : BIG, fine: ended ? BIG : 0, jailed: ended,
  }));
}

function cardView(o: Partial<CaperCardView> & Pick<CaperCardView, "status" | "seats">): CaperCardView {
  const filled = o.seats.filter((s) => s.userId !== null);
  return {
    caperId: CAPER_ID, familyLabel: FAMILY_LABEL, tier: 4, outcome: "", plannerId: OWNER, guildId: GUILD, channelId: CHANNEL,
    messageId: MESSAGE, lobbyClosesAt: SOON(), goEndsAt: SOON(), leakAt: SOON(),
    openRoles: o.seats.filter((s) => s.userId === null && s.role !== "MASTERMIND").map((s) => s.role),
    lockedCount: filled.filter((s) => s.locked).length, crewCount: filled.length, roll: 0.9999, patrolChance: 0.5,
    pool: BIG, note: NOTE, ...o,
  };
}

function plannerView(live: boolean): CaperPlannerView {
  return {
    ownerId: OWNER, familyLabel: FAMILY_LABEL, level: 10, tiers: [1, 2, 3, 4].map((tier) => ({ tier, unlocked: true })),
    nextCaperAt: SOON(), startedLast24h: 3, heistCap: 10, duesArrears: 999, underInvestigation: false, investigationThreshold: 8, canPlan: true,
    live: live ? { caperId: CAPER_ID, tier: 4, status: "RUNNING", guildId: GUILD, channelId: CHANNEL, messageId: MESSAGE } : null,
  };
}

function briefView(o: Partial<BriefView> = {}): BriefView {
  const options = [...caperRole("DRIVER").labels].slice(0, 4);
  return {
    caperId: CAPER_ID, ownerId: CREW[3], role: "DRIVER", tell: { userId: CREW[2], label: "Old Rail Road" },
    call: { question: caperRole("DRIVER").call, options, fromUserId: CREW[4] },
    leaked: options[1], dark: false, lockedIndex: null, goEndsAt: SOON(), leakAt: SOON(), ...o,
  };
}

export function caperWorstCases(): { label: string; max: number; payload: CfPayload }[] {
  const jump = jumpLink(GUILD, CHANNEL, MESSAGE);
  return [
    { label: "S11 planner (Capo)", max: 11, payload: buildCaperPlanner(plannerView(false), { art: true, ephemeral: false }) },
    { label: "S11 planner (live crew heist)", max: 9, payload: buildCaperPlanner(plannerView(true), { art: true, ephemeral: true }) },
    { label: "S12 lobby (T4, 1 seat)", max: 14, payload: buildCaperCard(cardView({ status: "LOBBY", seats: seats(1, false) }), { art: true }) },
    { label: "S12 lobby (T4, full)", max: 12, payload: buildCaperCard(cardView({ status: "LOBBY", seats: seats(6, false) }), { art: true }) },
    { label: "S12 cancelled", max: 3, payload: buildCaperCard(cardView({ status: "CANCELLED", outcome: "VOID", seats: seats(6, false) }), { art: true }) },
    { label: "S13 GO (T4, 6 seats)", max: 8, payload: buildCaperCard(cardView({ status: "RUNNING", seats: seats(6, false) }), { art: false }) },
    { label: "S14 brief (open)", max: 10, payload: buildBrief(briefView()) },
    { label: "S14 brief (locked)", max: 10, payload: buildBrief(briefView({ lockedIndex: 3 })) },
    { label: "S14 brief (dark)", max: 6, payload: buildBrief(briefView({ dark: true, leaked: null })) },
    { label: "S15 result (T4 BUST, 6 seats)", max: 8, payload: buildCaperCard(cardView({ status: "RESOLVED", outcome: "BUST", roll: 0.1234, seats: seats(6, true) }), { art: true }) },
    { label: "S25 crew heist card", max: 4, payload: buildCaperSeatCard({ caperId: CAPER_ID, text: "Seated as Safecracker.", jumpUrl: jump }) },
    { label: "S25 lobby (5 open roles)", max: 4, payload: buildPersonalCaperCard(cardView({ status: "LOBBY", seats: seats(1, false) }), CREW[3]) },
    { label: "S25 lobby (no open role)", max: 4, payload: buildPersonalCaperCard(cardView({ status: "LOBBY", seats: seats(6, false) }), OUTSIDER) },
    { label: "S25 seated (GO)", max: 4, payload: buildPersonalCaperCard(cardView({ status: "RUNNING", seats: seats(6, false) }), CREW[2]) },
    { label: "S25 under way (unseated)", max: 2, payload: buildPersonalCaperCard(cardView({ status: "RUNNING", seats: seats(6, false) }), OUTSIDER) },
    { label: "S27 brief opener", max: 4, payload: buildOpener("Your crew heist brief is ready.", { customId: CPR_IDS.openBrief(CAPER_ID, OWNER), label: "Open brief" }) },
    { label: "S28 GO call (6 crew)", max: 4, payload: buildGoCall({ caperId: CAPER_ID, crewIds: CREW, goEndsAt: SOON(), pinched: ["98765432109876543401", "98765432109876543402"] }) },
    { label: "S28 lobby moved", max: 2, payload: buildLobbyMoved(jump) },
  ];
}
