// Renders real Crime Families screens with demo families into dashboard/src/content/demo-screens.json,
// which the website's demo chat and heist story render. Pure builders only: no DB, no Discord.
// Run: DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/exportDemoScreens.ts
import * as fs from "fs";
import * as path from "path";
const SRC = path.join(__dirname, "..");
/* eslint-disable @typescript-eslint/no-var-requires */
const { setEmojiRecord } = require(`${SRC}/utils/emojiRegistry`);
const { CF_ASSETS } = require(`${SRC}/utils/crimeFamilyAssets`);
const { FAMILY_LEVELS, caperRole, caperTier, RACKETS, LEAGUE_RACKET_INCOME, WAR_BLOCKS } = require(`${SRC}/data/crimeFamilyCatalog`);
const fam = require(`${SRC}/ui/crimeFamily/familyScreens`);
const kit = require(`${SRC}/ui/crimeFamily/kit`);
const rec = require(`${SRC}/ui/crimeFamily/recruitScreens`);
const vote = require(`${SRC}/ui/crimeFamily/voteScreens`);
const cap = require(`${SRC}/ui/crimeFamily/caperScreens`);
const turf = require(`${SRC}/ui/crimeFamily/turfScreens`);
const dm = require(`${SRC}/services/dmNoticeService`);
const { REQUIREMENTS } = require(`${SRC}/services/crimeFamily/recruitService`);

// cf_ emoji ids encode the key so the renderer can map them to local PNGs.
for (const key of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${key}`, { id: `cf${key}`, name: `cf_${key}` });

const NOW = new Date("2026-11-20T18:00:00Z").getTime();
const at = (min: number) => new Date(NOW + min * 60_000);
const ID = (n: number) => `65f00000000000000000${String(n).padStart(4, "0")}`;

// Demo cast: ids map to names in the renderer.
const P = {
  vinnie: "100000000000000001", rosa: "100000000000000002", sal: "100000000000000003", nico: "100000000000000004",
  mara: "100000000000000005", dex: "100000000000000006", lou: "100000000000000007", kat: "100000000000000008",
  benny: "100000000000000009", ivy: "100000000000000010", tony: "100000000000000011", gio: "100000000000000012",
};
const ME = P.vinnie;
const FAMILY = "Velvet Ante";
const TAG = "VLA";
const LABEL = `[${TAG}] ${FAMILY}`;
const FID = ID(1);

const out: Record<string, { components: unknown[]; files: Record<string, string> }> = {};
function save(name: string, payload: { components: any[]; files?: any[] }) {
  const files: Record<string, string> = {};
  for (const f of payload.files ?? []) files[f.name] = f.name;
  out[name] = { components: payload.components.map((c: any) => (typeof c.toJSON === "function" ? c.toJSON() : c)), files };
}

// ---- Family ----
const roster = [
  { userId: P.vinnie, role: "BOSS" }, { userId: P.rosa, role: "UNDERBOSS" }, { userId: P.sal, role: "CAPO" }, { userId: P.nico, role: "CAPO" },
  { userId: P.mara, role: "SOLDIER" }, { userId: P.dex, role: "SOLDIER" }, { userId: P.lou, role: "SOLDIER" }, { userId: P.kat, role: "SOLDIER" },
  { userId: P.benny, role: "SOLDIER" }, { userId: P.ivy, role: "SOLDIER" }, { userId: P.tony, role: "SOLDIER" },
].map((r) => ({ ...r, associateUntil: null }));

save("create", fam.buildCreateConfirm(ME, { name: FAMILY, tag: TAG, fee: 10_000_000 }));
save("dashboard", fam.buildDashboard({
  familyId: FID, name: FAMILY, tag: TAG, level: 5, xp: 14_200, nextLevelXp: 20_000, memberCount: roster.length, memberCap: 18,
  capos: 2, capoCap: 2, crestKey: "crest_3", roster, duesArrears: 0, nextCaperAt: at(12), underInvestigation: false,
  racketsHeld: 2, showTurf: true, vote: null, recruiting: true,
  viewer: { userId: ME, role: "BOSS", canManage: true, canClaim: false, canStartVote: false, canRecruit: true },
}, { art: true }));

// ---- Recruitment ----
const req = { netWorth: 5_000_000, shifts: 20, ageDays: 14, heists: 3 };
const families = [
  { tag: "VLA", name: "Velvet Ante", level: 5, crestKey: "crest_3", members: 11, cap: 18, active: 11 },
  { tag: "KNG", name: "Kingpin Row", level: 8, crestKey: "crest_4", members: 24, cap: 25, active: 22 },
  { tag: "SNK", name: "Snake Eyes", level: 4, crestKey: "crest_2", members: 13, cap: 16, active: 12 },
  { tag: "BLK", name: "Black Ledger", level: 7, crestKey: "crest_4", members: 19, cap: 23, active: 17 },
  { tag: "DUS", name: "Dust Bowl Six", level: 2, crestKey: "crest_1", members: 7, cap: 12, active: 7 },
  { tag: "ORO", name: "Oro Nero", level: 6, crestKey: "crest_3", members: 15, cap: 20, active: 15 },
];
save("board", rec.buildBoard({
  ownerId: P.gio, sort: "act", qualifyOnly: false, page: 0, pages: 4,
  rows: families.map((f, i) => ({ familyId: ID(10 + i), ...f, req, qualifies: i !== 1 })), emptyReason: null,
}));
const checks = REQUIREMENTS.map((r: any) => ({
  key: r.key, label: r.label, need: (req as any)[r.key], have: ({ netWorth: 18_400_000, shifts: 64, ageDays: 41, heists: 9 } as any)[r.key], ok: true,
}));
const card = {
  ownerId: P.gio, familyId: FID, label: LABEL, tag: TAG, crestKey: "crest_3", level: 5, members: 11, cap: 18, active: 11,
  pitch: "Daily heists, payday every Sunday. We play to win the Silver league.", recruiting: true, checks,
  joinGate: null, pending: 0, appliedAt: null, reapplyAt: null, applyBlock: null,
};
save("familyCard", rec.buildFamilyCard(card));
save("familyCardSent", rec.buildFamilyCard({ ...card, pending: 1, appliedAt: at(0) }, "Application sent. Officers see it in their inbox."));
save("dmAccepted", kit.cfPayload(dm.applicationAcceptedNotice({ familyLabel: LABEL })));

// ---- Crew Heist (tier 2, Payroll Van) ----
const T2 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"];
const crew = [P.vinnie, P.rosa, P.sal, P.gio, P.mara];
function seats(filled: number, phase: "lobby" | "go" | "done") {
  return T2.map((role, i) => ({
    role, optional: role === "MUSCLE", userId: i < filled ? crew[i] : null,
    locked: phase === "done" || (phase === "go" && i < 3), passed: phase === "done", leaked: false, relayed: phase === "done" && i === 3,
    dark: false, holderId: phase === "done" ? crew[(i + 1) % crew.length] : null,
    cut: phase === "done" ? 550_000 + (i === 0 ? 110_000 : 0) : 0, fine: 0, jailed: false,
  }));
}
function caperCard(status: string, filled: number, phase: "lobby" | "go" | "done", extra: object = {}) {
  const s = seats(filled, phase);
  return {
    caperId: ID(50), familyLabel: LABEL, tier: 2, outcome: "", plannerId: ME, guildId: "1", channelId: "2", messageId: "3",
    lobbyClosesAt: at(10), goEndsAt: at(8), leakAt: at(5),
    openRoles: s.filter((x) => x.userId === null && x.role !== "MASTERMIND").map((x) => x.role),
    lockedCount: s.filter((x) => x.userId && x.locked).length, crewCount: s.filter((x) => x.userId).length,
    roll: 0.31, patrolChance: 0.18, pool: 2_750_000, note: "Van leaves the depot at 6. In and out.", seats: s, status, ...extra,
  };
}
save("lobby1", cap.buildCaperCard(caperCard("LOBBY", 1, "lobby"), { art: true }));
save("lobby3", cap.buildCaperCard(caperCard("LOBBY", 3, "lobby"), { art: true }));
save("lobby5", cap.buildCaperCard(caperCard("LOBBY", 5, "lobby"), { art: true }));
save("dmLobby", kit.cfPayload(dm.caperLobbyNotice(
  { familyLabel: LABEL, tierName: caperTier(2).name, stake: caperTier(2).stake, closesAt: at(10), jumpUrl: null },
  cap.joinSelectRow(ID(50), ["SAFECRACKER", "DRIVER", "MUSCLE"]),
)));
save("go", cap.buildCaperCard(caperCard("RUNNING", 5, "go"), { art: false }));
save("goCall", cap.buildGoCall({ caperId: ID(50), crewIds: crew, goEndsAt: at(8), pinched: [] }));
const opts = [...caperRole("DRIVER").labels].slice(0, 4);
const brief = {
  caperId: ID(50), ownerId: P.gio, role: "DRIVER", tell: { userId: P.sal, label: opts[2] },
  call: { question: caperRole("DRIVER").call, options: opts, fromUserId: P.mara },
  leaked: null, dark: false, lockedIndex: null, goEndsAt: at(8), leakAt: at(5), relayed: null, canShare: true, shared: false,
};
save("brief", cap.buildBrief(brief));
save("briefShared", cap.buildBrief({ ...brief, shared: true, canShare: false, relayed: opts[1], lockedIndex: 1 }));
save("dmIntel", kit.cfPayload(dm.caperIntelNotice({ sharerId: P.mara, tierName: caperTier(2).name, goEndsAt: at(8) }, cap.briefRow(ID(50)))));
save("result", cap.buildCaperCard(caperCard("RESOLVED", 5, "done", { outcome: "CLEAN" }), { art: true }));

// ---- Vault and payday ----
const ledger = [
  { type: "racket_income", actorId: "system", amount: 450_000 }, { type: "caper_cut", actorId: P.rosa, amount: 275_000 },
  { type: "deposit", actorId: P.sal, amount: 2_000_000 }, { type: "deposit_tax", actorId: P.sal, amount: -100_000, meta: { burned: 100_000 } },
  { type: "caper_cut", actorId: P.vinnie, amount: 275_000 },
].map((l, i) => ({ at: at(-i * 40), treasuryAfter: 8_400_000, earningsAfter: 11_950_000, meta: null, ...l }));
const payday = {
  familyId: FID, earnings: 11_950_000, count: 11, split: { gross: 1_000_000, tax: 50_000, net: 950_000 },
  eligible: roster.map((r) => r.userId), ineligible: [], dueAt: at(60), lockedReason: null,
};
save("vault", fam.buildVaultPanel(ME, {
  familyId: FID, tag: TAG, treasury: 8_400_000, earnings: 11_950_000, level: 5, duesPerDay: 200_000, duesArrears: 0, arrearsOwed: 0,
  lastPaydayAt: at(-7 * 1440), nextPaydayAt: at(60), ledger, canOfficer: true, payday,
  levelUp: { next: FAMILY_LEVELS[5], blockers: ["Needs 20,000 XP (have 14,200)."], notes: [] },
}));
save("payday", kit.buildNotice(`## Payday: 11 members paid 950,000 each\n**${LABEL}**\n${roster.map((r) => `<@${r.userId}>`).join(" ")}`));

// ---- No-confidence vote ----
const voteView = (closed: boolean) => ({
  voteId: ID(70), familyId: ID(20), familyLabel: "[KNG] Kingpin Row", tag: "KNG", homeChannelId: "1", channelId: "1", messageId: "1",
  bossId: P.tony, starterId: P.kat, status: closed ? "PASSED" : "OPEN", closesAt: at(48 * 60), eligible: 21, need: 14, voted: closed ? 21 : 15,
  heirId: P.kat, result: closed ? { yes: 16, no: 5, newBossId: P.kat, voidReason: null } : null, viewerCanVote: true,
});
save("vote", vote.buildVoteCard(voteView(false)));
save("voteResult", vote.buildVoteCard(voteView(true)));
save("dmNewBoss", kit.cfPayload(dm.familyNewBossNotice({ familyLabel: "[KNG] Kingpin Row" })));

// ---- Turf ----
const city = { id: ID(80), league: "SILVER", number: 1, label: "Midtown #1" };
const owners = ["[VLA] Velvet Ante", "[ORO] Oro Nero", "[BLK] Black Ledger", null, "[SNK] Snake Eyes", "[VLA] Velvet Ante", "[KNG] Kingpin Row", null, "[ORO] Oro Nero", "[BLK] Black Ledger"];
const line = (i: number) => {
  const r = RACKETS[i];
  return {
    racketId: ID(100 + i), cityId: city.id, key: r.key, name: r.name, class: r.class, income: LEAGUE_RACKET_INCOME.SILVER[r.class],
    ownerFamilyId: owners[i] ? ID(200 + i) : null, ownerLabel: owners[i], strikes: 0,
    war: i === 2 ? { id: ID(90), status: "BIDDING", topBid: 6_200_000, topBidderLabel: LABEL, bidClosesAt: at(300), startsAt: at(600) } : null,
    nextWarAt: at(600 + i * 60), bidding: { phase: i === 2 ? "OPEN" : "SOON", nextOpensAt: at(120) },
  };
};
save("turfMap", turf.buildTurfMap(ME, {
  city, viewerLeague: "SILVER", status: null, nav: { prev: null, next: ID(81) },
  rackets: RACKETS.map((_: unknown, i: number) => line(i)), nextWar: { racketName: RACKETS[2].name, startsAt: at(600) },
}));
const hitters = (ids: string[]) => ids.map((userId, i) => ({ userId, points: 48 - i * 7 }));
const board = (atk: number, def: number) => ({
  warId: ID(90), racketKey: RACKETS[2].key, racketName: RACKETS[2].name, racketClass: RACKETS[2].class, startsAt: at(-30), endsAt: at(30),
  attacker: { familyId: FID, label: LABEL }, defender: { familyId: ID(202), label: "[BLK] Black Ledger" },
  scores: { docks: { atk: atk, def: def - 6 }, main: { atk: atk - 12, def }, alleys: { atk: atk + 8, def: def - 14 } },
  hits: { atk: 31, def: 24 }, top: { atk: hitters([P.rosa, P.sal, P.gio, P.mara, P.vinnie]), def: hitters([P.benny, P.ivy, P.lou, P.dex, P.kat]) },
  blackout: false,
});
save("warBoard", turf.buildWarBoard(board(36, 30), "send"));
const docks = WAR_BLOCKS[0];
save("hitCall", turf.buildHitCall({ hitId: ID(91), block: docks.key, deadline: at(1), slotEndsAt: at(5), approaches: docks.approaches }, docks.name));
save("hitResult", turf.buildHitResult(`Hit! +12 to ${docks.name}.`));
save("warResult", turf.buildWarResult({
  board: board(58, 41), outcome: "CAPTURED", overCap: false, xp: [{ label: LABEL, xp: 900 }, { label: "[BLK] Black Ledger", xp: 250 }], heated: 0,
}, "keep"));

// ---- Leaderboard ----
const lb = [
  ["KNG", "Kingpin Row", 8, "crest_4", 25, 4, 182_400], ["BLK", "Black Ledger", 7, "crest_4", 21, 3, 151_900],
  ["VLA", "Velvet Ante", 6, "crest_3", 14, 3, 98_700], ["ORO", "Oro Nero", 6, "crest_3", 15, 2, 91_200],
  ["SNK", "Snake Eyes", 4, "crest_2", 13, 1, 44_800], ["DUS", "Dust Bowl Six", 2, "crest_1", 7, 0, 9_300],
];
save("leaderboard", fam.buildLeaderboard(ME, {
  sort: "xp", sorts: [{ key: "xp", label: "XP" }, { key: "rk", label: "Rackets" }, { key: "war", label: "War wins" }],
  rows: lb.map(([tag, name, level, crestKey, members, rackets, value], i) => ({ rank: i + 1, familyId: ID(300 + i), tag, name, level, crestKey, members, rackets, value })),
  viewer: { rank: 3, value: 98_700 },
}, { art: true }));

const dest = path.join(__dirname, "../../dashboard/src/content/demo-screens.json");
fs.writeFileSync(dest, JSON.stringify({ now: NOW, screens: out }) + "\n");
console.log(`wrote ${Object.keys(out).length} screens to ${dest}`);
