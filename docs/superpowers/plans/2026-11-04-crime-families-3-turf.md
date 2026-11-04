# Crime Families 3 of 3: Turf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Turf (spec section 9): the 10 fixed rackets that pay protection income into family earnings, earnings-only bidding for the one attacker per weekly window, the 60-minute Turf War with scouting, skill-checked hits, baseline defenders and a blackout finish, plus `!turf`, screens S16–S21, the war half of S25, `turf` DMs and the turf jobs, all behind `CRIME_FAMILY_CONFIG.turfEnabled` (rollout stage C).

**Architecture:** Four new collections (`Racket`, `War`, `WarContribution`, `WarHit`) and services in `src/services/crimeFamily/` split by responsibility: pure war math, racket income, bidding, the war state machine and the war actions. Every money or ownership move is one `runFamilyTx` transaction guarded by compare-and-swap. Turf plugs into plan 1 only through its registries (`ACTIVITY_RULES`, `FAMILY_HOOKS`, `LEADERBOARD_SORTS`, `CF_SCHEDULES`, `TURF_ROUTES`, `DM_NOTICE_TYPES`, `crimeFamilyWorstCases()`). Discord side effects (boards, notices, DMs) live in one announce module, which the jobs, handlers and command share.

**Tech Stack:** TypeScript, discord.js 14.25 (ComponentsV2), Prisma 5.22 on MongoDB (replica set, interactive transactions), ioredis, node-cron 4.2.1, Node `crypto` (HMAC-SHA256, `randomInt`, `randomBytes`), vitest with mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` (approved 2026-10-29, Q1–Q4 on defaults). Read section 9 in full, plus 6.4 (leave, kick, disband), 7.1, 7.4, 10.1–10.4, 12.1, 13.1–13.4, 14.1–14.3, 15, 17 (edges 11–18, 28, 31, 32, 43–51, 58, 61, 62, 81, 82) and 18. Asset rules: `DESIGN.md`. **Plan 1:** `docs/superpowers/plans/2026-11-04-crime-families-1-foundation.md`. Its "Seams exported to plans 2 and 3" block fixes every name this plan consumes. Read it first and never redefine anything in it. **Plan 2** (Capers) must be merged first: this plan uses its `addCrimeHeatTx`, its exported `migrateLegacyHeatForUser` and its `caper_lobby` DM type.

**Plan series:** 1 Foundation → 2 Capers → 3 Turf (this plan). The spec cites code at `6b2d836`; line numbers here are against HEAD `c45d257` and may have moved after plans 1 and 2 landed. Re-check every `file:line` before you edit it.

---

## Global Constraints

- `.env` `DATABASE_URL` is the LIVE player database. Never run `npm run dev`, `npm start`, `npm run seed`, `npx prisma db push`, `npx prisma studio`, any `sync:*-emojis` without `--dry-run`, or any `ts-node src/...` not listed here. Allowed: vitest, `npm run typecheck`, `npx prisma validate|format|generate` (no connection), `npm run validate:slash`, `npm run validate:app-emojis`, and `checkV2Payloads.ts` only as `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- `$VT <files>` means `MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' <files>`. DB tests need Redis: `docker start casino-test-redis || docker run -d --rm --name casino-test-redis -p 6381:6379 redis:7-alpine`. Never run two vitest processes at once (they clobber `test/.mongo-uri`).
- Commit directly on `main` and never push (a push deploys). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy gate (spec 19.1): `prisma/` changes in Task 2, not in the last commit, so the owner deploys this plan with `workflow_dispatch` and `run_schema: true`. The four models are new collections, so `db push` cannot fail on existing documents.
- Economy is global per `discordId`. `User` and every existing Prisma model stay unchanged (D31). `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` stay unchanged (D6). No shop buff touches racket income, bids or hits (D20). No money moves between families in a war (D27).
- No module under `src/services/crimeFamily/` imports `isTester` (D34). Plan 1's static test already scans the folder, and Task 13 adds turf cases. Do **not** copy the tester shortcuts at `src/services/propertyService.ts:306`, `:319`.
- Every filter and CAS uses required fields with sentinels: `ownerFamilyId ""` (the Street), `topBidderFamilyId ""`, `defenderFamilyId ""`, `seed ""`, `lastScoutSlot -1`, `choice -1`, status strings, and `now()`-defaulted DateTimes. `War.boards` is the only nullable turf field (`Json?`) and is never filtered. Any future filter on a nullable field needs `OR: [{ f: null }, { f: { isSet: false } }]` (`src/anticheat/claim.ts:59-84`).
- Bids draw **earnings only**: `spendFromVault(..., { earningsOnly: true })`. Refunds return to earnings through `creditEarnings`. The escrow is burned at settlement as a ledger row (`war_bid_burn`, `amount: 0`, `meta.burned`). Hit costs use `debitWalletInTx` (`turf_hit`). Racket income is `creditEarnings(..., "racket_income", ..., { xp })`, which also retries dues arrears (spec 7.4).
- Every turf transaction runs in `runFamilyTx` (3 attempts; settlement 5). Never catch a P2002 inside a transaction. The one P2002 catch in this plan is the `WarContribution` pre-insert, which runs outside any transaction (spec 9.4).
- All Crime Families modules import each other statically. A lazy `require` loads a second module copy under vitest (plan 1 Global Constraints). The only lazy requires are the existing ones in `src/index.ts` and `src/commandRouter.ts`.
- Redis never guards money or uniqueness. Use plan 1's tri-state `setNx`, which fails open, and never `redisService.setIfNotExists`, which fails closed (`src/services/redisService.ts:76-89`).
- Every UI is ComponentsV2 through `cfPayload`, with `allowedMentions: { parse: [] }` everywhere in this plan, no `setAccentColor`, no `content`/`embeds`, and ≤ 40 components (50035 is swallowed by `src/index.ts`). Every new screen gets an entry in `crimeFamilyWorstCases()`, which both the layout test and `checkV2Payloads.ts` read.
- Missing art never breaks a payload. A missing banner omits the MediaGallery and sends no file; a missing thumbnail turns the Section into a TextDisplay (D66). `cf_turf_map.png` and `cf_war_banner.png` exist today, but no code path may require them.
- `cfEmoji` is called only at render time, never in a module-level constant. Buttons and select options get `.setEmoji` only when it returns a value, and labels stay plain text. Hit-call approach buttons never carry an emoji (16.3).
- Handlers ack before any DB or Redis call. The bid modal opener checks only `i.user.id === ownerId` (the router does this) and calls `showModal` with no awaited I/O before it.
- Turf DMs use only `notifyMany(client, "turf", ids, build)` (which calls `sendOptOutDm`). `turf` is an account-group type with no `command` field.
- New jobs are entries in plan 1's `CF_SCHEDULES`, which registers each with `{ timezone: "Etc/UTC", noOverlap: true }`. Nothing is appended to the banking block in `src/scheduler.ts`.
- Vault amounts appear only on ephemeral screens (D59). A public reply (a `!turf bid` refusal, the map, a board, a notice) never shows a family's earnings or treasury. Bid amounts are public: they are the price of a shot.
- Every number in logic comes from `CRIME_FAMILY_CONFIG`, `WAR_RULES`, `RACKETS` or `RACKET_CLASSES`. No money literal goes in a service.
- Emoji upload is owner-only. All 6 turf emojis (`cf_war`, `cf_turf_*`, `cf_block_*`) are already in plan 1's `cf` family; this plan runs no sync, and `src/data/emojis.json` stays `{}`.

## Review Focus

1. **Bid amount text** (`!turf bid <key> <amount>` and the Bid modal). `"2.1m"` is 2,100,000 and `"10,010,000"` is 10,010,000. `"all"`, `"max"`, `"-1"`, `"0"`, `"1e7"`, `"abc"` and `"2.5"` are refused with "Enter an amount like 2.1m or 2,100,000." Below the floor or the minimum raise, the reply names the exact minimum. Tests: Task 5 (`parseBidAmount`, service), Task 12 (command).
2. **Racket key text** (`!turf racket <x>`, `!turf bid <x> …`). `casino_row`, `CASINO_ROW` and the map number `9` resolve. `0`, `11`, `casino` and an empty value reply with the list of keys and numbers. Tests: Task 4 (`resolveRacketKey`), Task 12.
3. **A stale war button** (a board or S25 card from a war that has RESOLVED or CANCELLED, last week's board, or an S19 call answered after the war settled). The reply is "This war is over." or "Too late.", with no debit, no `WarHit` row and no score change. Tests: Task 7.
4. **A press from the wrong person or place**: a member of neither family, a member pressing in a guild other than the family's home guild, an Associate (< 72 h tenure), or anyone pressing for the Street side. The reply is an ephemeral refusal, with no `WarContribution` row and no wallet change. Tests: Task 7, Task 11.
5. **A public bid refusal must not leak the vault**: `!turf bid` with earnings short of the bid replies "Not enough earnings for this bid (bids never use the treasury). Check `!crew vault`." with no amounts. The ephemeral modal path uses the same copy. Tests: Task 5, Task 12.

## Decisions this plan makes (not in the spec, or chosen where it is silent)

| # | Spec ref | Decision | Why |
|---|---|---|---|
| T1 | 15, 17 edge 58, 19.2 | `turfEnabled` (and `enabled`) gate **new** turf only. While either is off: `tickWars` opens no new War rows, a BIDDING war reaching `bidClosesAt` is CANCELLED with its escrow refunded, `tickRackets` does nothing, and `!turf`, the map, racket detail and bids are refused. ARMED, ACTIVE and SETTLING wars run to the end, and their Scout/Hit/answer buttons keep working | A kill switch must never burn a bid without a fight (anti-goal 6) |
| T2 | 9.4 downtime cancel | The tick gap is measured to `min(now, endsAt)`, so downtime that starts after the war ended does not cancel it | Only lost playing time should void a war |
| T3 | 9.4 XP "+5 per correct hit" | Hit XP is awarded at settlement as one `awardFamilyXp` per side (`5 × correct hits`, source `war_hits`), not per hit. A cancelled war awards none | Spec: a cancelled war gets "no ownership change, XP or heat". A per-hit award would write the family document and a ledger row on every hit |
| T4 | 10.4 War wins | `Family.warWins` += 1 for a capturing attacker, and for a defending family only when the defence earns XP (D64) | Staged wars cannot farm the leaderboard |
| T5 | 9.4 raise | A family that already holds the top bid cannot bid again on that war ("You already hold the top bid.") | Raising your own bid only burns more |
| T6 | 9.4, D59 | Bid amounts refuse `all`/`max`/`allin`. A short-earnings refusal carries no amounts | Review Focus 1, 5 |
| T7 | 13.2 debounce, 14.3 | Boards re-render only from the minute `tickWars`, guarded by `setNx("cf:render:war:<warId>", warBoardRefreshSeconds)`. `"held"` skips; `"set"` and `"error"` render. There is no in-process trailing timer: the next tick is the trailing render | "Refreshed once a minute" (S18) with one writer |
| T8 | 13.2 attachments | `War.boards` holds `WarBoardRef[] = { side: "ATK" \| "DEF"; guildId: string; channelId: string; messageId: string; hasBanner: boolean; dead: boolean }`. An edit keeps the gallery only when `hasBanner`, and sends no files | Boards are edited by id without a fetch, so the attachment state must be stored |
| T9 | 13.4 "War in 15 minutes (with jump link)" | The warning links the family's home channel (`channelLink(guildId, channelId)`), because the boards post at start | No board message exists 15 minutes before |
| T10 | 9.4 hit | A miss replies "Missed. No points." and never reveals the weak point | A reveal would make every miss a free scout |
| T11 | 13.1 `racket <key>` | Keys resolve case-insensitively, or by map number 1–10 (`RACKETS` order) | Keys are long; the map numbers its lines |
| T12 | plan 1 P6 | Turf entries are added by editing the array literals in `extensions.ts` (`ACTIVITY_RULES`, `FAMILY_HOOKS`) and `leaderboard.ts` (`LEADERBOARD_SORTS`). `turfHooks.ts` has no top-level calls, and a load-order test pins the resulting import cycle (`extensions → turfHooks → vaultService → familyQueries → extensions`). `RACKETS_SORT` lives in its own `turfLeaderboard.ts`, which imports only `prisma` (and `import type { LeaderboardSort }`), so `extensions.ts` is the only way into `turfHooks.ts` | Registration by side-effect import depends on load order; a call-time-only cycle is safe. A second entry point (`leaderboard → turfHooks`) could evaluate `extensions` while `turfHooks` is still initialising and leave `undefined` in a registry |
| T13 | 15 tickWars step 1 | A War row is created only while `bidOpensAt ≤ now < bidClosesAt` | A row created after its window closed would be cancelled at once |
| T14 | 9.4 contribution row | The `WarContribution` pre-insert runs after the war, side and eligibility checks | A refused press leaves no row |
| T15 | 15 seedRackets | `seedRackets()` runs at every boot whatever the flags are (10 static upserts) | Stage C then only flips a flag |
| T16 | 13.1 `bid <key> <amount>` | `!turf bid` places the bid directly. The S17 Bid button opens the modal | A prefix command already carries the amount |
| T17 | 9.4 hit guard | Arming reads the war guard (`ACTIVE`, `endsAt > now`). The answer's score write `war.updateMany({ id, status: "ACTIVE" })` is the CAS. A hit armed in the last seconds whose war settles first times out with its 25,000 spent | Hits after `endsAt` are refused by their own CAS (spec 15); arming never moves points |
| T18 | 10.4 Rackets sort | The `rk` sort lists only families holding ≥ 1 racket (at most 10). `rankOf` is `null` for a family with none | Ten rackets exist |
| T19 | 17 edge 15 | At capture, if the attacker already holds `racketCap` other rackets, the racket goes to the Street (`ownerFamilyId ""`) and the burn ledger row carries `meta.overCap: true`. The ownership CAS falls back from the defender snapshot to `""` | Spec edge 15; spec 15 step 6 |
| T20 | 13.2 ids | `turf:v:war:<ownerId>` (the S16 War board button) shows the S25 war card ephemerally when the family's war is ACTIVE, otherwise one line with the next war time | The spec names the id but not its screen |

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/services/crimeFamily/warMath.ts` | Pure war and bid math: windows, ISO week, slots, weak points, block results, floors, raises, XP |
| `src/services/crimeFamily/racketService.ts` | Seed rackets, resolve keys, racket-eligible members, collect one racket cycle |
| `src/services/crimeFamily/bidService.ts` | Bid context, blockers, the pair rule, place a bid |
| `src/services/crimeFamily/warService.ts` | The war state machine: open periods, close bidding, warn, activate, tick, settle |
| `src/services/crimeFamily/warActions.ts` | Scout, arm a hit, answer a hit, time out hits, the contribution row |
| `src/services/crimeFamily/turfHooks.ts` | The turf `ActivityRule` and `FamilyHook` entries |
| `src/services/crimeFamily/turfLeaderboard.ts` | The Rackets `LeaderboardSort` (imports only `prisma`, T12) |
| `src/services/crimeFamily/turfQueries.ts` | Read views for S16, S17, S18/S21 and the live war of a family |
| `src/services/crimeFamily/turfJobs.ts` | `tickWars` and `tickRackets` (orchestration only) |
| `src/ui/crimeFamily/turfScreens.ts` | S16–S21, the war half of S25, the bid modal, the hit result |
| `src/ui/crimeFamily/turfAnnounce.ts` | Boards (post, edit, dead-board repost), war result, bid, war-soon and racket DMs |
| `src/commands/economy/turf.ts` | `!turf` subaction table |
| `src/scripts/fixtures/turfScreens.ts` | Worst-case turf payloads appended to `crimeFamilyWorstCases()` |
| `test/crimeFamily/fakeClient.ts` | Fake Discord client (channels + DMs), moved out of plan 1's scheduler test |
| Tests | `test/crimeFamily/{war-math,racket-seed,turf-hooks,turf-views,turf-layout,turf-announce,turf-jobs,turf-handlers,turf-command}.test.ts`, `test/anticheat/{racket-tick,turf-bid,turf-war}.race.test.ts`, `test/dm/turf-notice.test.ts` |

**Modify:** `src/utils/economyConfig.ts`, `prisma/schema.prisma` (append), `test/helpers.ts`, `src/scheduler.ts`, `src/services/crimeFamily/extensions.ts`, `src/services/crimeFamily/leaderboard.ts`, `src/services/crimeFamily/views.ts`, `src/services/crimeFamily/scheduler.ts`, `src/ui/crimeFamily/ids.ts`, `src/ui/crimeFamily/post.ts`, `src/scripts/fixtures/crimeFamilyScreens.ts`, `src/services/dmPrefsService.ts`, `src/services/dmNoticeService.ts`, `src/handlers/turfInteractionHandler.ts`, `src/commandRouter.ts`, `src/slash/registry.ts`, `src/commands/general/help.ts`, `src/commands/general/tutorial.ts`, `test/crimeFamily/scheduler.test.ts`, `test/crimeFamily/progression.test.ts`, `test/dm/prefs.test.ts`, `test/dm/investment-notice.test.ts`, `test/dm/family-notice.test.ts`, `test/slash/registry.test.ts`, `test/anticheat/family-redis-down.test.ts`, `test/anticheat/family-tester.test.ts`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md`.

## Interfaces this plan exports

Nothing comes after this plan. These are the names the tasks below share, fixed here so every task uses the same ones:

```ts
// src/utils/economyConfig.ts
export function isTurfOpen(guildId: string | null | undefined): boolean;   // isCrimeFamilyOpen(guildId) && turfEnabled

// src/services/crimeFamily/warMath.ts
export type WarBlockKey = (typeof WAR_BLOCKS)[number]["key"];               // "docks" | "main" | "alleys"
export type RacketClass = RacketDef["class"];                               // "CORNER" | "DISTRICT" | "CROWN"
export type WarSide = "ATK" | "DEF";
export type ScoreField = "atkDocks" | "atkMain" | "atkAlleys" | "defDocks" | "defMain" | "defAlleys";
export type BlockScores = Record<WarBlockKey, { atk: number; def: number }>;
export function nextWarStart(r: Pick<RacketDef, "warDow" | "warHourUtc">, now: Date): Date;   // strictly after now
export function isoWeekKey(d: Date): string;                                 // "2026-W45"
export function warWindow(startsAt: Date): { periodKey: string; bidOpensAt: Date; bidClosesAt: Date; startsAt: Date; endsAt: Date };
export function slotOf(startsAt: Date, now: Date): number;                   // 0..WAR_RULES.slots-1, clamped
export function slotEndsAt(startsAt: Date, slot: number): Date;
export function weakPoint(seed: string, block: WarBlockKey, slot: number): number;           // 0..3
export function isBlackout(endsAt: Date, now: Date): boolean;
export function scoreField(side: WarSide, block: WarBlockKey): ScoreField;
export function scoresOf(war: Pick<War, ScoreField>): BlockScores;
export function baselineScores(cls: RacketClass): Pick<War, "defDocks" | "defMain" | "defAlleys">;
export function blockResults(s: BlockScores): { block: WarBlockKey; atk: number; def: number; winner: WarSide }[];
export function attackerWins(s: BlockScores): boolean;                       // ≥ 2 of 3 blocks
export function defenceEarnsXp(s: BlockScores): boolean;                     // D64: atk > 0 on ≥ 2 blocks
export function bidFloor(r: Pick<RacketDef, "incomePerCycle">): number;      // bidFloorDays × income
export function minNextBid(top: number, floor: number): number;             // top 0 → floor
export function captureXp(cls: RacketClass): number;                         // captureXp × xpMultiplier

// src/services/crimeFamily/racketService.ts
export function seedRackets(): Promise<void>;
export function resolveRacketKey(raw: string | undefined): RacketDef | null;
export function racketEligibleMembers(familyId: string, now: Date): Promise<{ all: string[]; eligible: string[]; ineligible: string[]; officers: string[] }>;
export type RacketCollect = { status: "minted" | "neglected" | "released" | "skipped"; racketKey: string; racketName: string; familyId: string; cycles: number; strikes: number; amount: number };
export function collectRacket(racketId: string, now: Date, eligibleCount: number): Promise<RacketCollect>;

// src/services/crimeFamily/bidService.ts
export interface BidContext { now: Date; member: { role: FamilyRole; joinedAt: Date } | null; jailed: boolean; family: { id: string; level: number; duesArrears: number; homeChannelId: string } | null; underInvestigation: boolean; racket: { ownerFamilyId: string; class: RacketClass }; war: { status: string; bidClosesAt: Date; topBid: number; topBidderFamilyId: string } | null; held: number; liveBids: number; crownsHeldOrBid: number; pairBlocked: boolean }
export function bidBlockers(ctx: BidContext): string[];                     // pure
export function pairRuleBlocks(db: Prisma.TransactionClient, bidderFamilyId: string, ownerFamilyId: string, now: Date): Promise<boolean>;
export function parseBidAmount(raw: string | undefined): number | null;
export function loadBidContext(db: Prisma.TransactionClient | PrismaClient, familyId: string | null, viewerId: string, racketKey: string, now: Date): Promise<BidContext>;  // shared by placeBid (in tx) and the S17 view
export type BidResult = { warId: string; racketKey: string; racketName: string; amount: number; familyId: string; familyLabel: string; startsAt: Date; bidClosesAt: Date; ownerFamilyId: string; previous: { familyId: string; amount: number } | null };
export function placeBid(input: { racketKey: string; actorId: string; amount: number; now?: Date }): Promise<BidResult>;

// src/services/crimeFamily/warService.ts
export type WarSettlement = { warId: string; racketKey: string; racketName: string; outcome: "CAPTURED" | "HELD" | "CANCELLED"; attackerFamilyId: string; defenderFamilyId: string; blocks: ReturnType<typeof blockResults>; burned: number; refunded: number; overCap: boolean; xp: { familyId: string; xp: number }[]; heated: string[]; contributors: { userId: string; familyId: string; side: WarSide }[] };
export function openWarPeriods(now: Date): Promise<void>;
export function closeBidding(warId: string, now: Date, allowArm: boolean): Promise<"ARMED" | "CANCELLED" | null>;
export function claimWarnSoon(warId: string): Promise<boolean>;
export function activateWar(warId: string, now: Date): Promise<"ACTIVE" | "CANCELLED" | null>;
export function recordWarTick(warId: string, now: Date): Promise<void>;
export function beginSettle(warId: string, now: Date): Promise<boolean>;
export function settleWar(warId: string, now: Date): Promise<WarSettlement | null>;

// src/services/crimeFamily/warActions.ts
export function ensureContribution(warId: string, familyId: string, userId: string, side: WarSide): Promise<WarContribution>;
export type ScoutReport = { warId: string; block: WarBlockKey; approach: string; slotEndsAt: Date };
export function scoutWar(input: { warId: string; userId: string; guildId: string | null; now?: Date }): Promise<ScoutReport>;
export type ArmedHit = { hitId: string; block: WarBlockKey; deadline: Date; slotEndsAt: Date; approaches: readonly string[] };
export function armHit(input: { warId: string; userId: string; guildId: string | null; block: WarBlockKey; now?: Date }): Promise<ArmedHit>;
export function answerHit(input: { hitId: string; userId: string; choice: number; now?: Date }): Promise<{ correct: boolean; points: number; block: WarBlockKey }>;
export function sweepWarHits(now: Date): Promise<number>;

// src/services/crimeFamily/turfHooks.ts
export const WAR_HITS_RULE: ActivityRule; export const TURF_FAMILY_HOOK: FamilyHook;

// src/services/crimeFamily/turfLeaderboard.ts (imports only prisma, T12)
export const RACKETS_SORT: LeaderboardSort;

// src/services/crimeFamily/views.ts (added in Task 2, consumed by test/helpers.ts, Task 8 and Task 9)
export type WarBoardRef = { side: "ATK" | "DEF"; guildId: string; channelId: string; messageId: string; hasBanner: boolean; dead: boolean };   // T8

// src/services/crimeFamily/turfQueries.ts (view types in views.ts)
export function getTurfMapView(now: Date): Promise<TurfMapView>;
export function getRacketDetailView(racketKey: string, viewerId: string, now: Date): Promise<RacketDetailView>;
export function getWarBoardView(warId: string, now: Date): Promise<WarBoardView>;
export function getLiveWarFor(familyId: string): Promise<War | null>;      // ARMED or ACTIVE, attacker or defender

// src/ui/crimeFamily/ids.ts (TURF_IDS, extended from plan 1's viewMap)
TURF_IDS.viewMap(owner) "turf:v:map:<o>"; viewWar(owner) "turf:v:war:<o>"; select(owner) "turf:sel:<o>"; openRacket(key, owner) "turf:open:racket:<k>:<o>";
TURF_IDS.bid(key, owner) "turf:bid:<k>:<o>"; bidModal(key, owner) "turf:modal:bid:<k>:<o>"; scout(warId) "turf:scout:<w>"; hit(warId, block) "turf:hit:<w>:<b>"; hitAnswer(hitId, i) "turf:hx:<h>:<i>"

// src/ui/crimeFamily/post.ts
export function channelLink(guildId: string, channelId: string): string;  // https://discord.com/channels/<g>/<c>

// src/ui/crimeFamily/turfAnnounce.ts
export function syncWarBoards(client: Client, warId: string, now: Date, opts?: { force?: boolean }): Promise<void>;
export function announceWarResult(client: Client, s: WarSettlement, now: Date): Promise<void>;
export function announceBid(client: Client, r: BidResult): Promise<void>;
export function announceWarSoon(client: Client, warId: string, now: Date): Promise<void>;
export function announceRacketCollect(client: Client, out: RacketCollect, members: { all: string[]; ineligible: string[]; officers: string[] }): Promise<void>;

// test/helpers.ts
export function seedRacket(key: string, o?: Partial<{ ownerFamilyId: string; lastPayoutAt: Date; capturedAt: Date; neglectStrikes: number }>): Promise<Racket>;
export function seedWar(o: SeedWarOpts): Promise<War>;
export function seedContribution(o: { warId: string; familyId: string; userId: string; side: WarSide; hits?: number; correctHits?: number; points?: number; nextHitAt?: Date; lastScoutSlot?: number }): Promise<WarContribution>;
export function seedWarHits(userId: string, familyId: string, n: number, o?: { state?: "HIT" | "MISS"; createdAt?: Date }): Promise<void>;
```

---

### Task 1: Turf config keys and the pure war math

**Files:**
- Modify: `src/utils/economyConfig.ts` (`CRIME_FAMILY_CONFIG`, added by plan 1 after `TAX_CONFIG`; add `isTurfOpen` beside `isCrimeFamilyOpen`)
- Create: `src/services/crimeFamily/warMath.ts`
- Test: `test/crimeFamily/war-math.test.ts`

**Interfaces:**
- Consumes: `RACKETS`, `racketDef`, `RACKET_CLASSES`, `WAR_BLOCKS`, `WAR_RULES` (plan 1 catalog; `WAR_RULES = { atkPoints: 10, defPoints: 12, captureXp: 300, hitXp: 5, racketCycleXp: 20, lossHeat: 15, slots: 12, crownCap: 1 }`), `CRIME_FAMILY_CONFIG.{bidFloorDays, warMinutes, scoutSlotSeconds, blackoutSeconds}` (spec 19.2, already in the config).
- Produces: `isTurfOpen`, every `warMath.ts` export in the Interfaces block, and these config keys: `bidOpensBeforeSeconds: 259_200, bidClosesBeforeSeconds: 3_600, bidRaisePct: 10, bidMinRaise: 100_000, warSoonSeconds: 900, pairRuleSeconds: 1_209_600, racketCycleHours: 24, racketEligibleMin: 3, neglectStrikesToRelease: 3, activeCorrectHits: 3, warBoardRefreshSeconds: 50`.

- [ ] **Step 1: Check the plan 1 and plan 2 preconditions**

Run: `grep -nE "export (async )?function (addCrimeHeatTx|migrateLegacyHeatForUser)" src/services/taxService.ts; grep -n "TURF_ROUTES\|caper_lobby" src/handlers/turfInteractionHandler.ts src/services/dmPrefsService.ts; grep -n "turfEnabled" src/utils/economyConfig.ts`
Expected: both tax functions are exported, `TURF_ROUTES` exists (empty), `caper_lobby` is registered, and `turfEnabled: false` is in the config. If plan 2 is missing, stop and report it. If `addCrimeHeatTx` differs from the spec 14.4 signature `(tx, discordId, amount)`, use plan 2's signature and say so in the task report.

- [ ] **Step 2: Write the failing test**

```ts
// test/crimeFamily/war-math.test.ts
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import * as M from "../../src/services/crimeFamily/warMath";
import { RACKETS, racketDef } from "../../src/data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG, isTurfOpen } from "../../src/utils/economyConfig";
import { withCfConfig } from "../helpers";

const at = (s: string) => new Date(s);
const S = (atk: [number, number, number], def: [number, number, number]): M.BlockScores =>
  ({ docks: { atk: atk[0], def: def[0] }, main: { atk: atk[1], def: def[1] }, alleys: { atk: atk[2], def: def[2] } });

describe("war math (9.1, 9.4, 15)", () => {
  it("nextWarStart is the next weekly UTC instant, strictly after now", () => {
    const now = at("2026-11-04T10:00:00Z"); // a Wednesday
    expect(Object.fromEntries(RACKETS.map((r) => [r.key, M.nextWarStart(r, now).toISOString()]))).toEqual({
      docks_numbers: "2026-11-09T18:00:00.000Z", laundromat_front: "2026-11-10T12:00:00.000Z", harbor_customs: "2026-11-10T18:00:00.000Z",
      neon_strip: "2026-11-11T01:00:00.000Z", valet_racket: "2026-11-04T18:00:00.000Z", pawn_row: "2026-11-05T01:00:00.000Z",
      union_kickbacks: "2026-11-05T18:00:00.000Z", racetrack_book: "2026-11-06T12:00:00.000Z", casino_row: "2026-11-07T18:00:00.000Z",
      city_hall: "2026-11-08T12:00:00.000Z",
    });
    expect(M.nextWarStart(racketDef("valet_racket")!, at("2026-11-04T18:00:00Z")).toISOString()).toBe("2026-11-11T18:00:00.000Z");
  });

  it("isoWeekKey follows ISO-8601, including the year boundary", () => {
    expect(M.isoWeekKey(at("2026-11-04T18:00:00Z"))).toBe("2026-W45");
    expect(M.isoWeekKey(at("2026-11-08T12:00:00Z"))).toBe("2026-W45"); // Sunday closes the ISO week
    expect(M.isoWeekKey(at("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(M.isoWeekKey(at("2027-01-04T18:00:00Z"))).toBe("2027-W01");
  });

  it("warWindow opens 72 h before, closes 1 h before and lasts 60 minutes", () => {
    expect(M.warWindow(at("2026-11-04T18:00:00Z"))).toEqual({
      periodKey: "2026-W45", bidOpensAt: at("2026-11-01T18:00:00Z"), bidClosesAt: at("2026-11-04T17:00:00Z"),
      startsAt: at("2026-11-04T18:00:00Z"), endsAt: at("2026-11-04T19:00:00Z"),
    });
  });

  it("slots are 5 minutes, 0..11, clamped; blackout is the last 600 s", () => {
    const s = at("2026-11-04T18:00:00Z");
    expect([0, 299_999, 300_000, 3_599_999, 3_600_000, 9e6].map((ms) => M.slotOf(s, new Date(+s + ms)))).toEqual([0, 0, 1, 11, 11, 11]);
    expect(M.slotEndsAt(s, 4)).toEqual(at("2026-11-04T18:25:00Z"));
    const end = at("2026-11-04T19:00:00Z");
    expect(M.isBlackout(end, at("2026-11-04T18:49:59Z"))).toBe(false);
    expect(M.isBlackout(end, at("2026-11-04T18:50:00Z"))).toBe(true);
  });

  it("weakPoint is HMAC-SHA256(seed, block:slot)[0] mod 4, and uniform", () => {
    const seed = "ab".repeat(16);
    expect(M.weakPoint(seed, "main", 7)).toBe(createHmac("sha256", seed).update("main:7").digest()[0] % 4);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[M.weakPoint(i.toString(16).padStart(32, "0"), "docks", i % 12)]++;
    for (const c of counts) { expect(c).toBeGreaterThan(2_300); expect(c).toBeLessThan(2_700); }
  });

  it("blocks go to the higher score, ties to the defender; 2 of 3 wins (9.4)", () => {
    expect(M.blockResults(S([90, 80, 0], [80, 80, 80])).map((b) => b.winner)).toEqual(["ATK", "DEF", "DEF"]);
    expect(M.attackerWins(S([90, 90, 0], [80, 80, 80]))).toBe(true);
    expect(M.attackerWins(S([90, 80, 0], [80, 80, 80]))).toBe(false);
  });

  it("defence earns XP only when the attacker scored on ≥ 2 blocks (D64)", () => {
    expect(M.defenceEarnsXp(S([10, 10, 0], [30, 30, 30]))).toBe(true);
    expect(M.defenceEarnsXp(S([20, 0, 0], [30, 30, 30]))).toBe(false);
  });

  it("baseline, floor, raise and capture XP come from the catalog", () => {
    expect(M.baselineScores("CROWN")).toEqual({ defDocks: 80, defMain: 80, defAlleys: 80 });
    expect(M.baselineScores("CORNER")).toEqual({ defDocks: 30, defMain: 30, defAlleys: 30 });
    expect(RACKETS.map((r) => M.bidFloor(r))).toEqual([2_100_000, 2_100_000, 4_550_000, 4_550_000, 2_100_000, 2_100_000, 4_550_000, 4_550_000, 9_100_000, 9_100_000]);
    expect(M.minNextBid(0, 9_100_000)).toBe(9_100_000);
    expect(M.minNextBid(9_100_000, 9_100_000)).toBe(10_010_000);
    expect(M.minNextBid(10_010_000, 9_100_000)).toBe(11_011_000);
    expect(M.minNextBid(5_505_500, 4_550_000)).toBe(6_056_050); // floating 5_505_500 * 1.1 would ceil to 6,056,051
    expect([M.captureXp("CORNER"), M.captureXp("DISTRICT"), M.captureXp("CROWN")]).toEqual([300, 450, 600]);
    expect(M.scoreField("DEF", "alleys")).toBe("defAlleys");
  });

  it("isTurfOpen needs enabled, turfEnabled and an allowed guild", async () => {
    expect(CRIME_FAMILY_CONFIG).toMatchObject({ bidOpensBeforeSeconds: 259_200, bidClosesBeforeSeconds: 3_600, bidRaisePct: 10, bidMinRaise: 100_000, warSoonSeconds: 900, racketEligibleMin: 3, neglectStrikesToRelease: 3, activeCorrectHits: 3 });
    await withCfConfig({ enabled: true }, async () => expect(isTurfOpen("g1")).toBe(false));
    await withCfConfig({ enabled: true, turfEnabled: true, allowGuildIds: ["g1"] }, async () => {
      expect(isTurfOpen("g1")).toBe(true);
      expect(isTurfOpen("g2")).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `$VT test/crimeFamily/war-math.test.ts`
Expected: FAIL, cannot resolve `../../src/services/crimeFamily/warMath`.

- [ ] **Step 4: Add the config keys and `isTurfOpen`, then implement `warMath.ts`**

Add the eleven keys under "Produces" to `CRIME_FAMILY_CONFIG`. Then `isTurfOpen(guildId)` = `isCrimeFamilyOpen(guildId) && CRIME_FAMILY_CONFIG.turfEnabled`, reading the config at call time so `withCfConfig` applies. The `warMath.ts` choices the tests leave open:
- `nextWarStart`: `Date.UTC(y, m, d + ((warDow − getUTCDay() + 7) % 7), warHourUtc)`, plus 7 days when ≤ `now`.
- `isoWeekKey`: move to the Thursday of the same week (`d + 3 − ((getUTCDay() + 6) % 7)` days). The ISO year is that Thursday's year, and the week is `1 + floor((thursday − Jan 1 of that year) / 7 days)`. Zero-pad to 2 digits.
- `minNextBid(top, floor)` = `top === 0 ? floor : max(ceil(top × (100 + bidRaisePct) / 100), top + bidMinRaise)`, in integer arithmetic. Never multiply by `1.1`.
- `weakPoint` = `createHmac("sha256", seed).update(\`${block}:${slot}\`).digest()[0] % 4`.
- `slotOf` = `min(slots − 1, max(0, floor((now − startsAt) / (scoutSlotSeconds × 1000))))`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `$VT test/crimeFamily/war-math.test.ts test/crimeFamily/catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/economyConfig.ts src/services/crimeFamily/warMath.ts test/crimeFamily/war-math.test.ts
git commit -m "feat(turf): turf config keys and pure war math"
```

---

### Task 2: Turf models, racket seeding at boot and test helpers

**Files:**
- Modify: `prisma/schema.prisma` (append `Racket`, `War`, `WarContribution`, `WarHit` exactly as spec 14.1)
- Create: `src/services/crimeFamily/racketService.ts` (`seedRackets`, `resolveRacketKey` in this task)
- Modify: `src/scheduler.ts` (in `initScheduler`, next to plan 1's `registerCrimeFamilyJobs(client)` call, before the `"Banking scheduler initialized."` log at `:73`), `test/helpers.ts`, `src/services/crimeFamily/views.ts` (add the `WarBoardRef` type from the Interfaces block, T8; `SeedWarOpts.boards` imports it)
- Test: `test/crimeFamily/racket-seed.test.ts`

**Interfaces:**
- Consumes: `RACKETS`, `RACKET_CLASSES`, `warWindow`, `baselineScores`.
- Produces: `seedRackets`, `resolveRacketKey`, the four Prisma models, the `WarBoardRef` type (`views.ts`), and test helpers `seedRacket`, `seedWar`, `seedContribution`, `seedWarHits` (Interfaces block). Add `"Racket", "War", "WarContribution", "WarHit"` to plan 1's `resetFamilies()`. `SeedWarOpts = { racketKey: string; status: "BIDDING" | "ARMED" | "ACTIVE" | "SETTLING" | "RESOLVED" | "CANCELLED"; startsAt?: Date; topBid?: number; topBidderFamilyId?: string; attackerFamilyId?: string; defenderFamilyId?: string; seed?: string; scores?: Partial<Record<ScoreField, number>>; lastTickAt?: Date; maxTickGapSeconds?: number; warnedSoon?: boolean; boards?: WarBoardRef[] }`. Defaults: `startsAt` is now + 24 h (BIDDING), now + 10 min (ARMED), now − 10 min (ACTIVE) or now − 61 min (any other status). The window comes from `warWindow(startsAt)`. `attackerFamilyId` defaults to `topBidderFamilyId`. ACTIVE and SETTLING default `seed` to `"ab".repeat(16)`, `def*` to the class baseline and `lastTickAt` to now. The racket row is seeded when missing. `seedRacket` upserts by key: the definition comes from `RACKETS` (with `baseDefense` from the class), and the overrides apply on both create and update. `seedContribution` defaults are `hits 0`, `correctHits 0`, `points 0`, `nextHitAt new Date(0)` and `lastScoutSlot -1`. `seedWarHits` writes `n` `WarHit` rows (default state `HIT`, `createdAt` now) with `warId "65f0000000000000000000aa"`. Plan 1's `seedFamily` already defaults `homeGuildId` to `"g1"` and `homeChannelId` to `"c-home"` (plan 1 Task 3), which the bid blocker "Set a home channel first" relies on; do not change it here.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/racket-seed.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedRackets, resolveRacketKey } from "../../src/services/crimeFamily/racketService";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

describe("seedRackets (15) and key resolution", () => {
  it("creates the 10 rackets owned by the Street with their class baselines", async () => {
    await seedRackets();
    const rows = await testPrisma.racket.findMany({ orderBy: { incomePerCycle: "asc" } });
    expect(rows).toHaveLength(10);
    expect(rows.reduce((s, r) => s + r.incomePerCycle, 0)).toBe(6_400_000);
    expect(rows.every((r) => r.ownerFamilyId === "" && r.neglectStrikes === 0)).toBe(true);
    expect(rows.find((r) => r.key === "casino_row")).toMatchObject({ class: "CROWN", baseDefense: 80, warDow: 6, warHourUtc: 18 });
  });

  it("a rerun updates the definition but never ownership, timers or strikes (edge 61)", async () => {
    await seedRackets();
    const when = new Date("2026-10-01T00:00:00Z");
    await testPrisma.racket.update({ where: { key: "pawn_row" }, data: { ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2, name: "Old Name" } });
    await Promise.all([seedRackets(), seedRackets()]);
    expect(await testPrisma.racket.count()).toBe(10);
    expect(await testPrisma.racket.findUnique({ where: { key: "pawn_row" } })).toMatchObject({ name: "Pawn Row Fencing", ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2 });
  });

  it.each([["casino_row", "casino_row"], ["CASINO_ROW", "casino_row"], [" 9 ", "casino_row"], ["1", "docks_numbers"], ["10", "city_hall"],
    ["0", null], ["11", null], ["casino", null], ["", null], [undefined, null]] as const)("resolveRacketKey(%s) = %s", (raw, key) => {
    expect(resolveRacketKey(raw as any)?.key ?? null).toBe(key);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/racket-seed.test.ts`
Expected: FAIL, cannot resolve `racketService`.

- [ ] **Step 3: Append the four models and regenerate**

Copy the models verbatim from spec 14.1. Do not add a relation to `Family`.
Run: `npx prisma validate && npx prisma generate`
Expected: "The schema … is valid" and "Generated Prisma Client". Do not run `db push`.

- [ ] **Step 4: Implement `seedRackets`, `resolveRacketKey`, the boot call and the helpers**

`seedRackets`: for each `RACKETS` entry, `prisma.racket.upsert({ where: { key }, create: { key, name, class, incomePerCycle, baseDefense: RACKET_CLASSES[class].baseline, warDow, warHourUtc }, update: { name, class, incomePerCycle, baseDefense, warDow, warHourUtc } })`. A P2002 from a concurrent first create is caught (no transaction is open) and that key is upserted again once. `resolveRacketKey`: trim; an integer 1–10 → `RACKETS[n − 1]`; otherwise `racketDef(raw.toLowerCase())`.

In `src/scheduler.ts`, add `seedRackets().catch((err) => console.error("[crimeFamily] seedRackets error", err));` (T15), with a static import.

- [ ] **Step 5: Run the test to verify it passes**

Run: `$VT test/crimeFamily/racket-seed.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/services/crimeFamily/racketService.ts src/services/crimeFamily/views.ts src/scheduler.ts test/helpers.ts test/crimeFamily/racket-seed.test.ts
git commit -m "feat(turf): Racket, War, WarContribution and WarHit models; seed rackets at boot"
```

---

### Task 3: Turf registry entries: active members, exit and disband hooks, racket counts and the Rackets sort

**Files:**
- Create: `src/services/crimeFamily/turfHooks.ts`, `src/services/crimeFamily/turfLeaderboard.ts` (`RACKETS_SORT` only; its imports are `prisma` and `import type { LeaderboardSort } from "./leaderboard"`, nothing else, T12)
- Modify: `src/services/crimeFamily/extensions.ts` (add `WAR_HITS_RULE` to the `ACTIVITY_RULES` literal and `TURF_FAMILY_HOOK` to the `FAMILY_HOOKS` literal), `src/services/crimeFamily/leaderboard.ts` (`LEADERBOARD_SORTS` becomes `[xp, RACKETS_SORT, war]`, the S10 button order XP, Rackets, Wars, with `RACKETS_SORT` imported from `./turfLeaderboard`, never from `./turfHooks`), `test/crimeFamily/progression.test.ts` (three plan 1 cases change once `TURF_FAMILY_HOOK` provides `racketsHeld`, because `racketsHeldFor` returns the first provider's map, which holds 0 for a family with no racket: the pinned `sorts` becomes `[{ key: "xp", label: "XP" }, { key: "rk", label: "Rackets" }, { key: "war", label: "War wins" }]`; "ranks the top 10 by XP" expects `rackets: 0` instead of `null`; and "fills rackets from a racketsHeld hook (P23)" is deleted, because a pushed test hook now comes after the turf provider and is never read. `turf-hooks.test.ts` below covers the provider path with real rackets)
- Test: `test/crimeFamily/turf-hooks.test.ts`

**Interfaces:**
- Consumes: `ActivityRule`, `FamilyHook`, `LeaderboardSort` (plan 1), `creditEarnings` (`vaultService.ts`). It never imports `membershipService` or `disbandService` (plan 1's cycle rule).
- Produces:
  - `WAR_HITS_RULE = { key: "war_hits", label: "correct war hits", need: activeCorrectHits, count(uid, since) }`, which counts `WarHit{ userId, state: "HIT", createdAt ≥ since }` (spec 7.3).
  - `TURF_FAMILY_HOOK`, with key `"turf"`:
    - `memberExitBlock`: if the user has a `WarContribution` in an ARMED or ACTIVE war, block with "Members who fought in a live turf war stay until it resolves." For `kind === "KICKED"`, an ACTIVE war with the family as attacker or defender blocks with "No kicks during an active turf war." (6.4).
    - `disbandBlock`: any war with the family as attacker or defender in ARMED, ACTIVE or SETTLING blocks with "Your family is in a turf war; disband after it resolves."
    - `onDisband`: for each BIDDING war with `topBidderFamilyId = family`, CAS `{ id, status: "BIDDING", topBidderFamilyId: family, topBid: <read> }` → `{ topBid: 0, topBidderFamilyId: "" }` (`count === 1`, else `throw new VaultBusy()`), then `creditEarnings(tx, family, topBid, "bid_refund", "system", { warId, reason: "disband" })`. Then `racket.updateMany({ ownerFamilyId: family })` → `{ ownerFamilyId: "", neglectStrikes: 0, lastPayoutAt: now }` (6.4 steps 1 and 4).
    - `disbandPreview`: `returnedToEarnings` = the sum of those top bids.
    - `racketsHeld(ids)`: `groupBy ownerFamilyId` over `ids`, returned as a `Map` with 0 for ids holding none.
  - `RACKETS_SORT` (in `turfLeaderboard.ts`) `= { key: "rk", label: "Rackets", top, rankOf }`: counts per `ownerFamilyId ≠ ""`, ties broken by the family's `createdAt`, and `rankOf` returns `null` for a family holding none (T18).

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/turf-hooks.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { isActiveMember } from "../../src/services/crimeFamily/eligibility";
import { leaveFamily, kickMember } from "../../src/services/crimeFamily/membershipService";
import { disbandFamily, previewDisband } from "../../src/services/crimeFamily/disbandService";
import { getLeaderboard } from "../../src/services/crimeFamily/leaderboard";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution, seedWarHits } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });

describe("turf entries in plan 1's registries", () => {
  it("3 correct hits in 7 days make an active member; misses and old hits do not (7.3, D56)", async () => {
    const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: a, role: "SOLDIER", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedWarHits(a, f.id, 3);
    await seedWarHits(b, f.id, 2); await seedWarHits(b, f.id, 1, { state: "MISS" }); await seedWarHits(b, f.id, 3, { createdAt: daysAgo(8) });
    expect((await isActiveMember(a, new Date())).active).toBe(true);
    expect((await isActiveMember(b, new Date())).active).toBe(false);
  });

  it("leave is refused with a contribution in an ACTIVE war, allowed once it resolves (edge 32)", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    const war = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: f.id });
    await seedContribution({ warId: war.id, familyId: f.id, userId: s, side: "ATK" });
    await expect(leaveFamily(s)).rejects.toThrow("Members who fought in a live turf war stay until it resolves.");
    await testPrisma.war.update({ where: { id: war.id }, data: { status: "RESOLVED" } });
    await expect(leaveFamily(s)).resolves.toBeTruthy();
  });

  it("no kicks during an ACTIVE war, even of a member who never fought (edge 31)", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedWar({ racketKey: "pawn_row", status: "ACTIVE", defenderFamilyId: f.id, topBidderFamilyId: "65f000000000000000000009", topBid: 2_100_000 });
    await expect(kickMember(boss, s)).rejects.toThrow("No kicks during an active turf war.");
  });

  it("disband is refused while a war is ARMED (edge 17)", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "ARM" });
    await seedWar({ racketKey: "valet_racket", status: "ARMED", topBid: 2_100_000, topBidderFamilyId: f.id });
    await expect(disbandFamily(boss, "ARM")).rejects.toThrow("Your family is in a turf war; disband after it resolves.");
  });

  it("disband as top bidder returns the escrow, burns it with the vault and frees owned rackets (6.4, edge 18)", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "TOP", treasury: 1_000, earnings: 0, lastPaydayAt: daysAgo(1) });
    const war = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", topBid: 2_100_000, topBidderFamilyId: f.id });
    await seedRacket("pawn_row", { ownerFamilyId: f.id, neglectStrikes: 2 });
    expect((await previewDisband(f.id)).burnEarnings).toBe(2_100_000);
    await disbandFamily(boss, "TOP");
    expect(await testPrisma.war.findUnique({ where: { id: war.id } })).toMatchObject({ status: "BIDDING", topBid: 0, topBidderFamilyId: "" });
    expect(await testPrisma.racket.findUnique({ where: { key: "pawn_row" } })).toMatchObject({ ownerFamilyId: "", neglectStrikes: 0 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "bid_refund" } })).toMatchObject({ amount: 2_100_000 });
    expect((await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "disband_burn" } }))!.amount).toBe(-2_101_000);
  });

  it("racket counts feed the dashboard and the Rackets sort (10.4, P23)", async () => {
    const a = await seedFamily({ bossId: await seedEligibleUser() });
    const b = await seedFamily({ bossId: await seedEligibleUser() });
    const none = await seedFamily({ bossId: await seedEligibleUser() });
    await seedRacket("pawn_row", { ownerFamilyId: a.id }); await seedRacket("docks_numbers", { ownerFamilyId: a.id }); await seedRacket("valet_racket", { ownerFamilyId: b.id });
    const v = await getLeaderboard("rk", none.id);
    expect(v.rows.map((r) => [r.familyId, r.value, r.rackets])).toEqual([[a.id, 2, 2], [b.id, 1, 1]]);
    expect(v.viewer).toBeNull();
    expect(v.sorts.map((s) => s.key)).toEqual(["xp", "rk", "war"]);
  });

  it("the registry import cycle resolves from either entry point (T12)", async () => {
    vi.resetModules();
    const q = await import("../../src/services/crimeFamily/familyQueries");
    const ext = await import("../../src/services/crimeFamily/extensions");
    expect(ext.ACTIVITY_RULES.map((r) => r.key)).toContain("war_hits");
    expect(typeof q.getMembership).toBe("function");
    vi.resetModules();
    const ext2 = await import("../../src/services/crimeFamily/extensions");
    expect(ext2.FAMILY_HOOKS.map((h) => h.key)).toContain("turf");
    vi.resetModules();
    const lb = await import("../../src/services/crimeFamily/leaderboard");
    const ext3 = await import("../../src/services/crimeFamily/extensions");
    expect(lb.LEADERBOARD_SORTS.every(Boolean) && ext3.ACTIVITY_RULES.every(Boolean) && ext3.FAMILY_HOOKS.every(Boolean)).toBe(true);
    const src = (await import("fs")).readFileSync("src/services/crimeFamily/turfLeaderboard.ts", "utf8");
    expect(src.match(/^import (?!type ).*$/gm)!.every((l) => /utils\/prisma/.test(l))).toBe(true);   // only prisma, so turfHooks is reachable only through extensions
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/turf-hooks.test.ts`
Expected: FAIL, cannot resolve `turfHooks` (and `getLeaderboard("rk")` has no sort, and `turfLeaderboard.ts` does not exist).

- [ ] **Step 3: Implement `turfHooks.ts` and `turfLeaderboard.ts`, and register the entries**

Each block and hook body runs on the `tx` it is given, so plan 1's retries re-check it. Neither module has top-level calls (T12). `leaderboard.ts` imports `RACKETS_SORT` from `./turfLeaderboard`; nothing outside `extensions.ts` imports `./turfHooks`.

- [ ] **Step 4: Run it, plus the plan 1 suites the registries touch**

Run: `$VT test/crimeFamily/turf-hooks.test.ts test/crimeFamily/progression.test.ts test/anticheat/family-disband.race.test.ts test/anticheat/family-membership.race.test.ts test/crimeFamily/eligibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/turfHooks.ts src/services/crimeFamily/turfLeaderboard.ts src/services/crimeFamily/extensions.ts src/services/crimeFamily/leaderboard.ts test/crimeFamily/progression.test.ts test/crimeFamily/turf-hooks.test.ts
git commit -m "feat(turf): war-hit activity, exit/disband hooks, racket counts and the Rackets sort"
```

---

### Task 4: Racket income, neglect strikes and release

**Files:**
- Modify: `src/services/crimeFamily/racketService.ts` (add `racketEligibleMembers`, `collectRacket`)
- Test: `test/anticheat/racket-tick.race.test.ts`

**Interfaces:**
- Consumes: `rentCyclesDue` (`src/services/propertyService.ts:44`, reused unchanged; it caps catch-up at `MAX_BANKED_RENT_CYCLES = 3`, `:37`), `checkMemberEligibility(uid, "racket")`, `listMembers`, `creditEarnings`, `writeLedger`, `runFamilyTx`.
- Produces: `racketEligibleMembers`, `collectRacket`, `RacketCollect` (Interfaces block). `officers` = the Boss and Underboss ids.

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/racket-tick.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { collectRacket, racketEligibleMembers } from "../../src/services/crimeFamily/racketService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWarHits } from "../helpers";

const H = 3600_000;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const racket = (key: string) => testPrisma.racket.findUnique({ where: { key } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War"]));
beforeEach(resetFamilies);

async function owner(o: { level?: number; duesArrears?: number } = {}) {
  const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, ...o, members: [{ userId: a, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, ids: [boss, a, b] };
}

describe("racket cycles (9.3)", () => {
  it("counts racket-eligible members from recent play", async () => {
    const { f, ids } = await owner();
    for (const id of ids.slice(0, 2)) await seedWarHits(id, f.id, 3);
    const m = await racketEligibleMembers(f.id, new Date());
    expect(m.eligible.sort()).toEqual(ids.slice(0, 2).sort());
    expect(m.ineligible).toEqual([ids[2]]);
    expect(m.officers.sort()).toEqual(ids.slice(0, 2).sort());
  });

  it("two ticks in one period mint once and keep the partial cycle", async () => {
    const { f } = await owner();
    const now = new Date();
    const r = await seedRacket("docks_numbers", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 25 * H) });
    const rs = await Promise.allSettled([collectRacket(r.id, now, 3), collectRacket(r.id, now, 3)]);
    expect(rs.map((x: any) => x.value?.status).filter((s) => s === "minted")).toHaveLength(1);
    expect(await fam(f.id)).toMatchObject({ earnings: 300_000, xp: 20 });
    expect((await racket("docks_numbers"))!.lastPayoutAt).toEqual(new Date(+now - H));
    expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: "racket_income" } })).toBe(1);
  });

  it("5 days of downtime bank 3 cycles", async () => {
    const { f } = await owner();
    const now = new Date();
    const r = await seedRacket("casino_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 120 * H) });
    expect(await collectRacket(r.id, now, 5)).toMatchObject({ status: "minted", cycles: 3, amount: 3_900_000 });
    expect(await fam(f.id)).toMatchObject({ earnings: 3_900_000, xp: 60 });
  });

  it("racket income retries dues arrears (7.4)", async () => {
    const { f } = await owner({ level: 1, duesArrears: 1 });
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 25 * H) });
    await collectRacket(r.id, new Date(), 3);
    expect(await fam(f.id)).toMatchObject({ earnings: 260_000, duesArrears: 0 });
  });

  it("fewer than 3 eligible: no mint, a strike, and the third strike releases (D24)", async () => {
    const { f } = await owner();
    const now = new Date();
    const r = await seedRacket("valet_racket", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 25 * H), neglectStrikes: 1 });
    expect(await collectRacket(r.id, now, 2)).toMatchObject({ status: "neglected", strikes: 2, amount: 0 });
    expect((await fam(f.id))!.earnings).toBe(0);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "racket_neglect" } })).toMatchObject({ amount: 0 });
    expect(await collectRacket(r.id, new Date(+now + 24 * H), 2)).toMatchObject({ status: "released", strikes: 3 });
    expect(await racket("valet_racket")).toMatchObject({ ownerFamilyId: "", neglectStrikes: 0 });
  });

  it("3 banked neglected cycles release at once", async () => {
    const { f } = await owner();
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 100 * H) });
    expect(await collectRacket(r.id, new Date(), 0)).toMatchObject({ status: "released", cycles: 3 });
  });

  it("a tick racing a capture mints nothing (edge 44)", async () => {
    const { f } = await owner(); const { f: attacker } = await owner();
    const now = new Date();
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(+now - 25 * H) });
    const delegate = prisma.racket as any; const original = delegate.findUnique; let first = true;
    delegate.findUnique = async (args: any) => {
      const snap = await original.call(delegate, args);
      if (first) { first = false; await testPrisma.racket.update({ where: { id: r.id }, data: { ownerFamilyId: attacker.id, lastPayoutAt: now, capturedAt: now } }); }
      return snap;
    };
    try { expect(await collectRacket(r.id, now, 3)).toMatchObject({ status: "skipped" }); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect([(await fam(f.id))!.earnings, (await fam(attacker.id))!.earnings]).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/racket-tick.race.test.ts`
Expected: FAIL, `collectRacket` is not exported.

- [ ] **Step 3: Implement**

- `racketEligibleMembers`: `listMembers(familyId)`, then `checkMemberEligibility(uid, "racket", { now })` per member.
- `collectRacket(racketId, now, eligibleCount)`:
  1. Read the racket with `prisma.racket.findUnique` (the test interleaves on this read). An empty owner or `cycles === 0` returns `"skipped"`.
  2. Compute `{ cycles, nextCollected } = rentCyclesDue(lastPayoutAt, now, racketCycleHours)`.
  3. Open `runFamilyTx` and CAS `racket.updateMany({ where: { id, ownerFamilyId: <read>, lastPayoutAt: <read> }, data: { lastPayoutAt: nextCollected, neglectStrikes: <0 or increment cycles> } })`. On `count 0`, return `"skipped"`.
  4. With `eligibleCount ≥ racketEligibleMin`, call `creditEarnings(tx, fam, cycles × incomePerCycle, "racket_income", "system", { racketKey, cycles }, { xp: WAR_RULES.racketCycleXp × cycles })`.
  5. Otherwise read the family's `treasury` and `earnings` in `tx` and call `writeLedger(tx, { familyId, actorId: "system", type: "racket_neglect", amount: 0, treasuryAfter, earningsAfter, meta: { racketKey, cycles, strikes } })`. Once strikes reach `neglectStrikesToRelease`, `racket.update({ ownerFamilyId: "", neglectStrikes: 0 })` and return `"released"`.

  The status, the strikes after this cycle and the minted amount are always returned.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/anticheat/racket-tick.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/racketService.ts test/anticheat/racket-tick.race.test.ts
git commit -m "feat(turf): racket cycles into earnings, neglect strikes and release"
```

---

### Task 5: Bidding

**Files:**
- Create: `src/services/crimeFamily/bidService.ts`
- Test: `test/anticheat/turf-bid.race.test.ts`

**Interfaces:**
- Consumes: `spendFromVault(..., { earningsOnly: true })`, `creditEarnings`, `VaultShort`, `requireMembership`, `can(actor, "bid", now)`, `checkJailStatus`, `isUnderInvestigation`, `levelDef(level).racketCap`, `RACKET_CLASSES[cls].minFamilyLevel`, `WAR_RULES.crownCap`, `bidFloor`, `minNextBid`, `parsePositiveAmount` (plan 1, `src/utils/format.ts`), `fmtFortunes`.
- Produces: `BidContext`, `bidBlockers`, `pairRuleBlocks`, `parseBidAmount`, `placeBid`, `BidResult` (Interfaces block). Blocker copy, in this order:
  1. "You are not in a crime family."
  2. "Only the Boss or Underboss can bid."
  3. "You can't bid while jailed."
  4. "Bidding is not open for this racket."
  5. "You already own this racket."
  6. "You already hold the top bid." (T5)
  7. `` `${RACKET_CLASSES[cls].name} rackets need family level ${min}.` ``
  8. "Clear dues arrears first."
  9. "Your family is under investigation."
  10. "Set a home channel first (`!crew home`)."
  11. `` `Racket cap reached (${held + liveBids}/${cap} held or bid).` ``
  12. "Only one Crown racket at a time, held or bid on."
  13. "Blocked: your families shared a Boss or two members in the last 14 days."

  Amount copy:
  - unparseable: "Enter an amount like 2.1m or 2,100,000."
  - first bid low: `` `Bid at least the floor of ${fmt(floor)}.` ``
  - raise low: `` `The top bid is ${fmt(top)}. Bid at least ${fmt(min)}.` ``
  - earnings short: "Not enough earnings for this bid (bids never use the treasury). Check `!crew vault`." (T6)
  - CAS miss: `` `Outbid while you were bidding: top is now ${fmt(top)}.` ``

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/turf-bid.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { placeBid, parseBidAmount } from "../../src/services/crimeFamily/bidService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar } from "../helpers";

const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const war = (id: string) => testPrisma.war.findUnique({ where: { id } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyExit", "Racket", "War"]));
beforeEach(resetFamilies);

async function bidder(o: { level?: number; earnings?: number; treasury?: number; tag?: string } = {}) {
  const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, earnings: 0, ...o, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, boss, ub, s };
}
const bid = (actorId: string, amount: number, racketKey = "docks_numbers") => placeBid({ racketKey, actorId, amount });

describe("bidding (9.4)", () => {
  it.each([["2.1m", 2_100_000], ["10,010,000", 10_010_000], ["all", null], ["max", null], ["-1", null], ["0", null], ["1e7", null], ["abc", null], ["2.5", null]] as const)(
    "parseBidAmount(%s) = %s", (raw, want) => expect(parseBidAmount(raw)).toBe(want));

  it("a first bid at the floor moves earnings into escrow", async () => {
    const { f, boss } = await bidder({ earnings: 3_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await expect(bid(boss, 2_099_999)).rejects.toThrow("Bid at least the floor of 2,100,000.");
    expect(await bid(boss, 2_100_000)).toMatchObject({ warId: w.id, amount: 2_100_000, previous: null });
    expect(await fam(f.id)).toMatchObject({ earnings: 900_000 });
    expect(await war(w.id)).toMatchObject({ topBid: 2_100_000, topBidderFamilyId: f.id });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "bid_escrow" } })).toMatchObject({ amount: -2_100_000 });
  });

  it("never uses the treasury, and says so without amounts (7.5 rule 4, Review Focus 5)", async () => {
    const { f, boss } = await bidder({ earnings: 1_000_000, treasury: 50_000_000 });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const err = await bid(boss, 2_100_000).catch((e) => e);
    expect(err.message).toBe("Not enough earnings for this bid (bids never use the treasury). Check `!crew vault`.");
    expect(await fam(f.id)).toMatchObject({ earnings: 1_000_000, treasury: 50_000_000 });
  });

  it("an outbid refunds the previous escrow to that family's earnings and enforces the raise", async () => {
    const a = await bidder({ earnings: 3_000_000 }); const b = await bidder({ earnings: 5_000_000 });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await bid(a.boss, 2_100_000);
    await expect(bid(a.ub, 2_400_000)).rejects.toThrow("You already hold the top bid.");
    await expect(bid(b.boss, 2_309_999)).rejects.toThrow("The top bid is 2,100,000. Bid at least 2,310,000.");
    expect(await bid(b.boss, 2_310_000)).toMatchObject({ previous: { familyId: a.f.id, amount: 2_100_000 } });
    expect([(await fam(a.f.id))!.earnings, (await fam(b.f.id))!.earnings]).toEqual([3_000_000, 2_690_000]);
  });

  it("two families bidding in the same second: one top bid, the loser keeps its earnings (edge 13)", async () => {
    const a = await bidder({ earnings: 5_000_000 }); const b = await bidder({ earnings: 5_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const rs = await Promise.allSettled([bid(a.boss, 2_100_000), bid(b.boss, 2_100_000)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = rs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason.message).toMatch(/top (bid )?is now|top bid is|Vault busy/);
    const top = (await war(w.id))!;
    const winner = top.topBidderFamilyId === a.f.id ? a : b; const loser = winner === a ? b : a;
    expect([(await fam(winner.f.id))!.earnings, (await fam(loser.f.id))!.earnings]).toEqual([2_900_000, 5_000_000]);
  });

  it("refuses after bidClosesAt, even before the tick arms the war (edge 81)", async () => {
    const { boss } = await bidder({ earnings: 5_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", startsAt: new Date(Date.now() + 30 * 60_000) });
    await expect(bid(boss, 2_100_000)).rejects.toThrow("Bidding is not open for this racket.");
    expect((await war(w.id))!.topBid).toBe(0);
  });

  it("checks owner, rank, jail, class level, arrears, investigation, racket cap and the Crown cap", async () => {
    const o = await bidder({ earnings: 50_000_000, level: 7 });
    await seedRacket("casino_row", { ownerFamilyId: o.f.id });
    for (const k of ["docks_numbers", "harbor_customs", "city_hall", "casino_row"]) await seedWar({ racketKey: k, status: "BIDDING" });
    await expect(bid(o.boss, 9_100_000, "casino_row")).rejects.toThrow("You already own this racket.");
    await expect(bid(o.s, 2_100_000)).rejects.toThrow("Only the Boss or Underboss can bid.");
    await expect(bid(o.boss, 9_100_000, "city_hall")).rejects.toThrow("Only one Crown racket at a time, held or bid on.");
    const young = await bidder({ earnings: 50_000_000, level: 3 });
    await expect(bid(young.boss, 4_550_000, "harbor_customs")).rejects.toThrow("District rackets need family level 4.");
    await bid(young.boss, 2_100_000);                                  // L3 cap 1: one live top bid
    await seedRacket("pawn_row");
    await seedWar({ racketKey: "pawn_row", status: "BIDDING" });
    await expect(bid(young.ub, 2_100_000, "pawn_row")).rejects.toThrow("Racket cap reached (1/1 held or bid).");
    const late = await bidder({ earnings: 50_000_000 });
    await testPrisma.family.update({ where: { id: late.f.id }, data: { duesArrears: 1 } });
    await expect(bid(late.boss, 2_310_000)).rejects.toThrow("Clear dues arrears first.");
    const jailed = await bidder({ earnings: 50_000_000 });
    await testPrisma.user.update({ where: { discordId: jailed.boss }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3600_000) } });
    await expect(bid(jailed.boss, 2_310_000)).rejects.toThrow("You can't bid while jailed.");
    const hot = await bidder({ earnings: 50_000_000 });
    for (const id of [hot.boss, hot.ub, hot.s]) await testPrisma.user.update({ where: { discordId: id }, data: { crimeHeat: 100 } });
    await expect(bid(hot.boss, 2_310_000)).rejects.toThrow("Your family is under investigation.");
  });

  it("the 14-day pair rule blocks shared Bosses or two shared members, both directions (D28)", async () => {
    const owner = await bidder({ earnings: 0 }); const b = await bidder({ earnings: 50_000_000 });
    await seedRacket("docks_numbers", { ownerFamilyId: owner.f.id });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const exit = (userId: string, familyId: string, days: number) => testPrisma.familyExit.create({ data: { userId, familyId, reason: "LEFT", leftAt: daysAgo(days) } });
    await exit(b.boss, owner.f.id, 15);
    expect(await bid(b.boss, 2_100_000)).toBeTruthy();                // 15 days ago: allowed
    const c = await bidder({ earnings: 50_000_000 });
    await exit(owner.boss, c.f.id, 13);                                 // the owner's Boss was in c
    await expect(bid(c.boss, 2_310_000)).rejects.toThrow("Blocked: your families shared a Boss or two members in the last 14 days.");
    const d = await bidder({ earnings: 50_000_000 });
    await exit(d.ub, owner.f.id, 3);
    await expect(bid(d.boss, 2_310_000)).resolves.toBeTruthy();         // one shared member: allowed
    const e = await bidder({ earnings: 50_000_000 });
    await exit(e.ub, owner.f.id, 3); await exit(e.s, owner.f.id, 3);
    await expect(bid(e.boss, 2_800_000)).rejects.toThrow(/shared a Boss or two members/);
  });

  it("a bid racing the top bidder's disband: the escrow is burned once and the new bid stands", async () => {
    const a = await bidder({ earnings: 2_100_000, tag: "AAA" }); const b = await bidder({ earnings: 5_000_000 });
    const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    await bid(a.boss, 2_100_000);
    await testPrisma.family.update({ where: { id: a.f.id }, data: { lastPaydayAt: daysAgo(1) } });
    await Promise.allSettled([disbandFamily(a.boss, "AAA"), bid(b.boss, 2_310_000)]);
    expect(await war(w.id)).toMatchObject({ topBidderFamilyId: b.f.id, topBid: 2_310_000 });
    expect((await testPrisma.familyLedger.findFirst({ where: { familyId: a.f.id, type: "disband_burn" } }))!.amount).toBe(-2_100_000);
    expect((await fam(b.f.id))!.earnings).toBe(2_690_000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/turf-bid.race.test.ts`
Expected: FAIL, cannot resolve `bidService`.

- [ ] **Step 3: Implement `bidService.ts`**

- `parseBidAmount(raw)`: `null` for `all`/`max`/`allin` (case-insensitive) or anything `parsePositiveAmount(raw, Number.MAX_SAFE_INTEGER)` refuses.
- `pairRuleBlocks(db, bidder, owner, now)`:
  - `false` when `owner === ""`.
  - `true` if a `FamilyExit` exists with `leftAt ≥ now − pairRuleSeconds` for either Boss into the other family.
  - `true` if ≥ 2 current members of one family have such an exit from the other, checked both directions.
- `placeBid`:
  1. Racket and floor from the catalog.
  2. `runFamilyTx` with every check re-read inside the callback, so retries re-check.
  3. Build `BidContext` with `loadBidContext(tx, familyId, actorId, racketKey, now)`, which Task 8's S17 view reuses on the global client:
     - `war` is the `BIDDING` row for the racket with `bidClosesAt > now`.
     - `held` = `racket.count({ ownerFamilyId: fam })`.
     - `liveBids` = BIDDING wars with `topBidderFamilyId = fam`, plus ARMED, ACTIVE and SETTLING wars with `attackerFamilyId = fam`, excluding this war.
     - `crownsHeldOrBid` counts the same set filtered to Crown rackets, plus Crown rackets held.
     - The cap blocker fires when `held + liveBids + 1 > cap`.
     - The Crown blocker fires for a Crown racket when `crownsHeldOrBid + 1 > crownCap`.
  4. Throw the first blocker as a `FamilyError`.
  5. Check the amount against `minNextBid`.
  6. `spendFromVault(tx, fam, amount, "bid_escrow", actorId, { warId, racketKey }, { earningsOnly: true })`. A `VaultShort` becomes the short-earnings copy.
  7. If there was a previous top bidder, `creditEarnings(tx, prev, prevBid, "bid_refund", "system", { warId, outbidBy: fam })`.
  8. CAS `war.updateMany({ where: { id, status: "BIDDING", bidClosesAt: { gt: now }, topBid: <read>, topBidderFamilyId: <read> }, data: { topBid: amount, topBidderFamilyId: fam } })`. On `count 0`, re-read and throw the CAS-miss copy.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/anticheat/turf-bid.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/bidService.ts test/anticheat/turf-bid.race.test.ts
git commit -m "feat(turf): earnings-only bidding with escrow, raises, caps and the pair rule"
```

---

### Task 6: The war state machine and settlement

**Files:**
- Create: `src/services/crimeFamily/warService.ts`
- Test: `test/anticheat/turf-war.race.test.ts` (lifecycle block; Task 7 appends the actions block)

**Interfaces:**
- Consumes: `warWindow`, `nextWarStart`, `baselineScores`, `scoresOf`, `blockResults`, `attackerWins`, `defenceEarnsXp`, `captureXp`, `creditEarnings`, `awardFamilyXp`, `writeLedger`, `runFamilyTx`, `levelDef`, `addCrimeHeatTx` and `migrateLegacyHeatForUser` (plan 2, `src/services/taxService.ts`), `randomBytes`.
- Produces: everything under `warService.ts` in the Interfaces block. `WarStatus = "BIDDING" | "ARMED" | "ACTIVE" | "SETTLING" | "RESOLVED" | "CANCELLED"`.

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/turf-war.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { openWarPeriods, closeBidding, claimWarnSoon, activateWar, recordWarTick, beginSettle, settleWar } from "../../src/services/crimeFamily/warService";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution } from "../helpers";

const at = (s: string) => new Date(s);
const M = 60_000;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const war = (id: string) => testPrisma.war.findUnique({ where: { id } });
const heat = async (id: string) => (await testPrisma.user.findUnique({ where: { discordId: id } }))!.crimeHeat;
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

async function family(level = 7, earnings = 0) {
  const boss = await seedEligibleUser(); const a = await seedEligibleUser(); const b = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, level, earnings, homeGuildId: "g1", members: [{ userId: a, role: "SOLDIER", joinedAt: daysAgo(10) }, { userId: b, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, ids: [boss, a, b] };
}

describe("war lifecycle (9.4, 15)", () => {
  it("opens one War per racket per period while its window is open (T13)", async () => {
    await seedRackets();
    const now = at("2026-11-01T18:00:00Z");
    await Promise.all([openWarPeriods(now), openWarPeriods(now)]);
    const rows = await testPrisma.war.findMany({ orderBy: { racketKey: "asc" } });
    expect(rows.map((w) => w.racketKey)).toEqual(["docks_numbers", "harbor_customs", "laundromat_front", "neon_strip", "valet_racket"]);
    expect(rows.find((w) => w.racketKey === "valet_racket")).toMatchObject({ status: "BIDDING", periodKey: "2026-W45", bidOpensAt: at("2026-11-01T18:00:00Z"), bidClosesAt: at("2026-11-04T17:00:00Z"), startsAt: at("2026-11-04T18:00:00Z"), endsAt: at("2026-11-04T19:00:00Z") });
    await testPrisma.war.deleteMany();
    await openWarPeriods(at("2026-11-02T17:30:00Z"));
    expect(await testPrisma.war.count({ where: { racketKey: "docks_numbers" } })).toBe(0);
  });

  it("closing bidding arms with a defender snapshot, cancels with no bid, and refunds when turf is off (T1)", async () => {
    const owner = await family(); const a = await family(); const c = await family();
    await seedRacket("docks_numbers", { ownerFamilyId: owner.f.id });
    const past = new Date(Date.now() + 30 * M);
    const w1 = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", startsAt: past, topBid: 2_100_000, topBidderFamilyId: a.f.id });
    expect(await Promise.all([closeBidding(w1.id, new Date(), true), closeBidding(w1.id, new Date(), true)])).toContain("ARMED");
    expect(await war(w1.id)).toMatchObject({ status: "ARMED", attackerFamilyId: a.f.id, defenderFamilyId: owner.f.id, topBid: 2_100_000 });
    const w2 = await seedWar({ racketKey: "pawn_row", status: "BIDDING", startsAt: past });
    expect(await closeBidding(w2.id, new Date(), true)).toBe("CANCELLED");
    const w3 = await seedWar({ racketKey: "valet_racket", status: "BIDDING", startsAt: past, topBid: 2_100_000, topBidderFamilyId: c.f.id });
    expect(await closeBidding(w3.id, new Date(), false)).toBe("CANCELLED");
    expect((await fam(c.f.id))!.earnings).toBe(2_100_000);
  });

  it("the war-soon CAS fires once", async () => {
    const a = await family();
    const w = await seedWar({ racketKey: "pawn_row", status: "ARMED", topBid: 2_100_000, topBidderFamilyId: a.f.id });
    expect(await Promise.all([claimWarnSoon(w.id), claimWarnSoon(w.id)])).toEqual(expect.arrayContaining([true, false]));
  });

  it("activation seeds a secret and the class baseline for any defender, or cancels when late (D52, D55)", async () => {
    const a = await family();
    const w = await seedWar({ racketKey: "city_hall", status: "ARMED", startsAt: new Date(Date.now() - M), topBid: 9_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "" });
    expect(await activateWar(w.id, new Date())).toBe("ACTIVE");
    const live = (await war(w.id))!;
    expect(live.seed).toMatch(/^[0-9a-f]{32}$/);
    expect([live.defDocks, live.defMain, live.defAlleys, live.atkDocks]).toEqual([80, 80, 80, 0]);
    const d = await family();
    const fw = await seedWar({ racketKey: "harbor_customs", status: "ARMED", startsAt: new Date(Date.now() - M), topBid: 4_550_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    expect(await activateWar(fw.id, new Date())).toBe("ACTIVE");
    const fl = (await war(fw.id))!;
    expect([fl.defDocks, fl.defMain, fl.defAlleys]).toEqual([50, 50, 50]);         // a family defender also starts at the DISTRICT baseline (D52)
    const late = await seedWar({ racketKey: "casino_row", status: "ARMED", startsAt: new Date(Date.now() - 11 * M), topBid: 9_100_000, topBidderFamilyId: a.f.id });
    expect(await activateWar(late.id, new Date())).toBe("CANCELLED");
    expect((await fam(a.f.id))!.earnings).toBe(9_100_000);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: a.f.id, type: "bid_refund" } })).toMatchObject({ amount: 9_100_000 });
  });

  it("ticks keep the largest gap, measured up to endsAt (T2)", async () => {
    const a = await family();
    const now = new Date();
    const w = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", startsAt: new Date(+now - 50 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, lastTickAt: new Date(+now - 2 * M) });
    await recordWarTick(w.id, now);
    expect(await war(w.id)).toMatchObject({ maxTickGapSeconds: 120, lastTickAt: now });
    const ended = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", startsAt: new Date(+now - 76 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, lastTickAt: new Date(+now - 17 * M) });
    await recordWarTick(ended.id, now);
    expect((await war(ended.id))!.maxTickGapSeconds).toBe(60);
  });
});

describe("settlement (9.4, edges 11, 12, 15, 16)", () => {
  it("a capture moves ownership, burns the bid and awards XP once under two settlers", async () => {
    const d = await family(); const a = await family();
    await seedRacket("casino_row", { ownerFamilyId: d.f.id, neglectStrikes: 2 });
    const w = await seedWar({ racketKey: "casino_row", status: "SETTLING", topBid: 9_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 90, atkMain: 90, atkAlleys: 0, defDocks: 80, defMain: 80, defAlleys: 80 } });
    for (const id of a.ids) await seedContribution({ warId: w.id, familyId: a.f.id, userId: id, side: "ATK", hits: 6, correctHits: 6, points: 60 });
    const rs = await Promise.all([settleWar(w.id, new Date()), settleWar(w.id, new Date())]);
    expect(rs.filter(Boolean)).toHaveLength(1);
    expect(rs.find(Boolean)).toMatchObject({ outcome: "CAPTURED", burned: 9_100_000, heated: [] });
    expect(await testPrisma.racket.findUnique({ where: { key: "casino_row" } })).toMatchObject({ ownerFamilyId: a.f.id, neglectStrikes: 0 });
    expect(await fam(a.f.id)).toMatchObject({ warWins: 1, xp: 600 + 18 * 5 });
    expect(await testPrisma.familyLedger.count({ where: { type: "war_bid_burn" } })).toBe(1);
    expect(await war(w.id)).toMatchObject({ status: "RESOLVED", winnerFamilyId: a.f.id });
  });

  it("a held defence: heat for attackers who hit, defence XP only with attacker hits on 2 blocks (D64)", async () => {
    const d = await family(1); const a = await family(1);
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 40, atkMain: 20, atkAlleys: 0, defDocks: 30, defMain: 42, defAlleys: 30 } });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[0], side: "ATK", hits: 4, correctHits: 4, points: 40 });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[1], side: "ATK", hits: 2, correctHits: 2, points: 20 });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[2], side: "ATK", hits: 0, lastScoutSlot: 3 });
    await seedContribution({ warId: w.id, familyId: d.f.id, userId: d.ids[0], side: "DEF", hits: 1, correctHits: 1, points: 12 });
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "HELD" });
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.ownerFamilyId).toBe(d.f.id);
    expect([await heat(a.ids[0]), await heat(a.ids[1]), await heat(a.ids[2])]).toEqual([15, 15, 0]);
    expect(await fam(d.f.id)).toMatchObject({ xp: 305, warWins: 1 });
    expect(await fam(a.f.id)).toMatchObject({ xp: 30, warWins: 0 });
  });

  it("a staged war earns the defender nothing; the Street holds at the baseline (D52, D64, edge 16)", async () => {
    const d = await family(1); const a = await family(7);
    await seedRacket("pawn_row", { ownerFamilyId: d.f.id });
    const staged = await seedWar({ racketKey: "pawn_row", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 10, defDocks: 30, defMain: 30, defAlleys: 30 } });
    await settleWar(staged.id, new Date());
    expect(await fam(d.f.id)).toMatchObject({ xp: 0, warWins: 0 });
    await seedRacket("city_hall");
    const street = await seedWar({ racketKey: "city_hall", status: "SETTLING", topBid: 9_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "", scores: { atkDocks: 80, atkMain: 80, defDocks: 80, defMain: 80, defAlleys: 80 } });
    expect(await settleWar(street.id, new Date())).toMatchObject({ outcome: "HELD", burned: 9_100_000 });
    expect((await testPrisma.racket.findUnique({ where: { key: "city_hall" } }))!.ownerFamilyId).toBe("");
  });

  it("a tick gap over 600 s cancels and refunds: no ownership, XP or heat (D55, edge 12)", async () => {
    const a = await family(1);
    await seedRacket("valet_racket");
    const w = await seedWar({ racketKey: "valet_racket", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, maxTickGapSeconds: 601, scores: { atkDocks: 90, atkMain: 90 } });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[0], side: "ATK", hits: 6, correctHits: 6, points: 60 });
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "CANCELLED", refunded: 2_100_000, xp: [] });
    expect(await fam(a.f.id)).toMatchObject({ earnings: 2_100_000, xp: 0 });
    expect(await heat(a.ids[0])).toBe(0);
    expect((await testPrisma.racket.findUnique({ where: { key: "valet_racket" } }))!.ownerFamilyId).toBe("");
  });

  it("a capture lands when the defender lost the racket meanwhile, and an over-cap capture goes to the Street (T19)", async () => {
    const d = await family(1); const a = await family(1);
    await seedRacket("docks_numbers", { ownerFamilyId: "" });           // neglect released it during the war
    const w = await seedWar({ racketKey: "docks_numbers", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, scores: { atkDocks: 40, atkMain: 40 } });
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "CAPTURED", overCap: false });
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.ownerFamilyId).toBe(a.f.id);
    await seedRacket("pawn_row");
    const w2 = await seedWar({ racketKey: "pawn_row", status: "SETTLING", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "", scores: { atkDocks: 40, atkMain: 40 } });
    expect(await settleWar(w2.id, new Date())).toMatchObject({ outcome: "CAPTURED", overCap: true });
    expect((await testPrisma.racket.findUnique({ where: { key: "pawn_row" } }))!.ownerFamilyId).toBe("");
    const burn = await testPrisma.familyLedger.findFirst({ where: { familyId: a.f.id, type: "war_bid_burn" }, orderBy: { createdAt: "desc" } });
    expect((burn!.meta as any).overCap).toBe(true);
  });

  it("beginSettle moves an ended ACTIVE war to SETTLING once; a SETTLING war left by a crash resumes", async () => {
    const a = await family(1);
    await seedRacket("pawn_row");
    const w = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", startsAt: new Date(Date.now() - 61 * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "" });
    expect(await Promise.all([beginSettle(w.id, new Date()), beginSettle(w.id, new Date())])).toEqual(expect.arrayContaining([true, false]));
    expect(await settleWar(w.id, new Date())).toMatchObject({ outcome: "HELD" });
    expect(await settleWar(w.id, new Date())).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/turf-war.race.test.ts`
Expected: FAIL, cannot resolve `warService`.

- [ ] **Step 3: Implement `warService.ts`**

- `openWarPeriods(now)`: for each `RACKETS` entry with a seeded row, take `w = warWindow(nextWarStart(def, now))`. If `w.bidOpensAt ≤ now < w.bidClosesAt`, call `war.upsert({ where: { racketId_periodKey }, create: { racketId, racketKey, ...w }, update: {} })`. A P2002 from a racing create is caught and ignored (no transaction is open).
- `closeBidding(warId, now, allowArm)`: one `runFamilyTx`. Read the war (`BIDDING`, `bidClosesAt ≤ now`, else `null`) and the racket owner, then CAS `{ id, status: "BIDDING", topBid: <read>, topBidderFamilyId: <read> }`:
  - no bid → `CANCELLED`;
  - a bid with `!allowArm` → `CANCELLED` plus `creditEarnings(..., "bid_refund", "system", { warId, reason: "turf_closed" })`;
  - otherwise → `ARMED` with `attackerFamilyId = topBidderFamilyId` and `defenderFamilyId = racket.ownerFamilyId`.

  `count 0` → `null`.
- `claimWarnSoon(warId)`: CAS `{ id, status: "ARMED", warnedSoon: false }` → `true`.
- `activateWar(warId, now)`:
  - `now > startsAt + warLateCancelSeconds` → `runFamilyTx`: CAS `ARMED → CANCELLED`, then `creditEarnings` of the escrow (`bid_refund`, `{ reason: "late_start" }`).
  - Otherwise CAS `ARMED → ACTIVE` with `seed: randomBytes(16).toString("hex")`, `...baselineScores(class)`, `lastTickAt: now` and `maxTickGapSeconds: 0`.
- `recordWarTick(warId, now)`:
  1. `end = min(now, endsAt)` and `gap = floor((end − lastTickAt) / 1000)`.
  2. CAS `{ id, status: "ACTIVE", lastTickAt: <read> }` → `{ lastTickAt: end, maxTickGapSeconds: max(<read>, gap) }`.
- `beginSettle(warId, now)`: CAS `{ id, status: "ACTIVE", endsAt: { lte: now } }` → `SETTLING`.
- `settleWar(warId, now)`:
  1. Read the war; anything other than `SETTLING` → `null`.
  2. Read the racket and the contributions.
  3. If the attacker lost and the war is not cancelled, run `migrateLegacyHeatForUser(uid)` for each ATK contributor with `hits ≥ 1`. This happens before the transaction.
  4. `runFamilyTx(…, 5)`. Its first write is the CAS `{ id, status: "SETTLING" }` → the final status and `winnerFamilyId`; `count 0` returns `null`.
  5. `maxTickGapSeconds > warLateCancelSeconds` → `CANCELLED` plus a `bid_refund` of `topBid` to the attacker, and nothing else.
  6. Otherwise `RESOLVED`. Write `war_bid_burn`: `amount 0`, `treasuryAfter`/`earningsAfter` read from the attacker, and `meta { burned: topBid, warId, overCap }`.
  7. On a capture:
     - `overCap` = the attacker holds ≥ `levelDef(level).racketCap` other rackets.
     - CAS `racket.updateMany({ where: { id, ownerFamilyId: defenderFamilyId }, data: { ownerFamilyId: overCap ? "" : attacker, capturedAt: now, lastPayoutAt: now, neglectStrikes: 0 } })`. On `count 0`, retry with `ownerFamilyId: ""`; on another `count 0`, throw.
     - `awardFamilyXp(tx, attackerFamilyId, captureXp(cls), "war_capture", "system", { warId })` and `warWins` += 1.
  8. On a held defence by a family where `defenceEarnsXp`: `awardFamilyXp(tx, defenderFamilyId, captureXp(cls), "war_defence", "system", { warId })` and `warWins` += 1 (T4).
  9. Per side with a family, with `n` = that side's `sum(correctHits)`: `awardFamilyXp(tx, sideFamilyId, n * WAR_RULES.hitXp, "war_hits", "system", { warId })` when `n > 0` (T3).
  10. If the attacker lost, `addCrimeHeatTx(tx, uid, WAR_RULES.lossHeat)` for each ATK contributor with `hits ≥ 1`.
  11. Return `WarSettlement`, whose `contributors` list every contribution row.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/anticheat/turf-war.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/warService.ts test/anticheat/turf-war.race.test.ts
git commit -m "feat(turf): war state machine and crash-safe settlement"
```

---

### Task 7: War actions: scout, hit and answer

**Files:**
- Create: `src/services/crimeFamily/warActions.ts`
- Modify: `test/anticheat/turf-war.race.test.ts` (append the actions block)

**Interfaces:**
- Consumes: `getMembership`, `checkMemberEligibility(uid, "war", { now, guildId, expectedGuildId: family.homeGuildId })`, `eligibilityError`, `debitWalletInTx`, `runFamilyTx`, `slotOf`, `slotEndsAt`, `weakPoint`, `scoreField`, `WAR_BLOCKS`, `WAR_RULES`, `crypto.randomInt`.
- Produces: everything under `warActions.ts` in the Interfaces block. Copy:
  - "This war is over." (status not ACTIVE, or `endsAt ≤ now`)
  - "The war has not started yet." (ARMED)
  - "Not your war." (a family that is neither attacker nor defender; nobody acts for the Street)
  - `` `Already scouted this slot, next at <t:${unix(slotEnd)}:R>.` ``
  - "You've used all 6 hits in this war."
  - `` `Next hit <t:${unix(nextHitAt)}:R>.` ``
  - "Not your hit."
  - "Locked in already."
  - "Too late."
  - "Too late: the war is over."

- [ ] **Step 1: Append the failing tests**

```ts
// append to test/anticheat/turf-war.race.test.ts
import { scoutWar, armHit, answerHit, sweepWarHits } from "../../src/services/crimeFamily/warActions";
import { weakPoint, slotOf } from "../../src/services/crimeFamily/warMath";
import { WAR_BLOCKS } from "../../src/data/crimeFamilyCatalog";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
async function liveWar(o: { started?: number } = {}) {
  const d = await family(1); const a = await family(1);
  for (const id of [...a.ids, ...d.ids]) await testPrisma.wallet.update({ where: { userId: id }, data: { balance: 200_000 } });
  await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
  const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", startsAt: new Date(Date.now() - (o.started ?? 10) * M), topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
  return { w, a, d };
}
const right = (seed: string, block: "docks" | "main" | "alleys", startsAt: Date, now = new Date()) => weakPoint(seed, block, slotOf(startsAt, now));

describe("war actions (9.4, edges 45–51)", () => {
  it("scouting is free, once per member per slot, and reveals the current weak point", async () => {
    const { w, a } = await liveWar();
    const rs = await Promise.allSettled([scoutWar({ warId: w.id, userId: a.ids[1], guildId: "g1" }), scoutWar({ warId: w.id, userId: a.ids[1], guildId: "g1" })]);
    const ok = rs.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect((rs.find((r) => r.status === "rejected") as any).reason.message).toMatch(/^Already scouted this slot, next at <t:\d+:R>\.$/);
    const rep = ok[0].value;
    const block = WAR_BLOCKS.find((b) => b.key === rep.block)!;
    expect(rep.approach).toBe(block.approaches[right(w.seed, rep.block, w.startsAt)]);
    expect(await testPrisma.warContribution.count({ where: { warId: w.id } })).toBe(1);
    expect(await wallet(a.ids[1])).toBe(200_000);
  });

  it("a hit costs 25,000, arms a 20 s call and sets the 600 s cooldown; racing presses debit once", async () => {
    const { w, a } = await liveWar();
    const now = new Date();
    const rs = await Promise.allSettled([armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "main", now }), armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "docks", now })]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((rs.find((r) => r.status === "rejected") as any).reason.message).toMatch(/^Next hit <t:\d+:R>\.$|Vault busy/);
    expect(await wallet(a.ids[0])).toBe(175_000);
    const hit = (await testPrisma.warHit.findFirst({ where: { warId: w.id } }))!;
    expect(hit).toMatchObject({ state: "ARMED", side: "ATK", slot: slotOf(w.startsAt, now), deadline: new Date(+now + 20_000) });
    expect(await testPrisma.warContribution.findFirst({ where: { warId: w.id, userId: a.ids[0] } })).toMatchObject({ hits: 1, nextHitAt: new Date(+now + 600_000) });
  });

  it("enforces 6 hits per war and refuses a short wallet with nothing written (edge 46)", async () => {
    const { w, a } = await liveWar();
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.ids[1], side: "ATK", hits: 6 });
    await expect(armHit({ warId: w.id, userId: a.ids[1], guildId: "g1", block: "docks" })).rejects.toThrow("You've used all 6 hits in this war.");
    await testPrisma.wallet.update({ where: { userId: a.ids[2] }, data: { balance: 24_999 } });
    await expect(armHit({ warId: w.id, userId: a.ids[2], guildId: "g1", block: "docks" })).rejects.toThrow("Insufficient funds.");
    expect(await testPrisma.warHit.count({ where: { warId: w.id } })).toBe(0);
    expect(await testPrisma.warContribution.findFirst({ where: { warId: w.id, userId: a.ids[2] } })).toMatchObject({ hits: 0 });
  });

  it("a correct answer scores +10 attacking or +12 defending; a miss scores 0 and reveals nothing (T10)", async () => {
    const { w, a, d } = await liveWar();
    const atk = await armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "docks" });
    const def = await armHit({ warId: w.id, userId: d.ids[0], guildId: "g1", block: "docks" });
    const ok = right(w.seed, "docks", w.startsAt);
    expect(await answerHit({ hitId: atk.hitId, userId: a.ids[0], choice: ok })).toEqual({ correct: true, points: 10, block: "docks" });
    expect(await answerHit({ hitId: def.hitId, userId: d.ids[0], choice: (ok + 1) % 4 })).toEqual({ correct: false, points: 0, block: "docks" });
    expect(await war(w.id)).toMatchObject({ atkDocks: 10, defDocks: 30 });
    expect(await testPrisma.warContribution.findFirst({ where: { userId: a.ids[0] } })).toMatchObject({ correctHits: 1, points: 10 });
    expect((await testPrisma.familyMember.findUnique({ where: { userId: a.ids[0] } }))!.correctHits).toBe(1);
    await expect(answerHit({ hitId: atk.hitId, userId: a.ids[0], choice: ok })).rejects.toThrow("Locked in already.");
    await expect(answerHit({ hitId: def.hitId, userId: a.ids[0], choice: ok })).rejects.toThrow("Not your hit.");
  });

  it("an answer is judged against the arm-time slot (edge 50)", async () => {
    const { w, a } = await liveWar({ started: 24.9 });                    // slot 4 ends in ~6 s
    const armedAt = new Date();
    const h = await armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "alleys", now: armedAt });
    const later = new Date(+armedAt + 10_000);                            // slot 5
    expect(slotOf(w.startsAt, later)).toBe(5);
    expect((await answerHit({ hitId: h.hitId, userId: a.ids[0], choice: weakPoint(w.seed, "alleys", 4), now: later })).correct).toBe(true);
  });

  it("an answer after the deadline is too late, and the sweeper times it out (edge 47)", async () => {
    const { w, a } = await liveWar();
    const now = new Date();
    const h = await armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "main", now });
    await expect(answerHit({ hitId: h.hitId, userId: a.ids[0], choice: 0, now: new Date(+now + 21_000) })).rejects.toThrow("Too late.");
    expect(await sweepWarHits(new Date(+now + 21_000))).toBe(1);
    expect((await testPrisma.warHit.findUnique({ where: { id: h.hitId } }))!.state).toBe("TIMEOUT");
  });

  it("stale buttons: scout and hit after the war ended are refused with nothing written (Review Focus 3)", async () => {
    const { w, a } = await liveWar();
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "RESOLVED" } });
    await expect(scoutWar({ warId: w.id, userId: a.ids[0], guildId: "g1" })).rejects.toThrow("This war is over.");
    await expect(armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "docks" })).rejects.toThrow("This war is over.");
    expect([await wallet(a.ids[0]), await testPrisma.warContribution.count()]).toEqual([200_000, 0]);
  });

  it("an answer that lands after settlement began scores nothing (T17)", async () => {
    const { w, a } = await liveWar();
    const h = await armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "docks" });
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "SETTLING" } });
    await expect(answerHit({ hitId: h.hitId, userId: a.ids[0], choice: right(w.seed, "docks", w.startsAt) })).rejects.toThrow("Too late: the war is over.");
    expect((await war(w.id))!.atkDocks).toBe(0);
    expect((await testPrisma.warHit.findUnique({ where: { id: h.hitId } }))!.state).toBe("ARMED");
  });

  it("wrong family, wrong guild, Associates and hot members are refused before any write (edge 45, 51; Review Focus 4)", async () => {
    const { w, a } = await liveWar();
    const outsider = await family(1);
    await expect(armHit({ warId: w.id, userId: outsider.ids[0], guildId: "g1", block: "docks" })).rejects.toThrow("Not your war.");
    await expect(armHit({ warId: w.id, userId: a.ids[1], guildId: "g-other", block: "docks" })).rejects.toThrow(/Not eligible/);
    const fresh = await seedEligibleUser({ wallet: 200_000 });
    await testPrisma.familyMember.create({ data: { familyId: a.f.id, userId: fresh, role: "SOLDIER", roleSlot: fresh, seat: 9, joinedAt: new Date() } });
    await expect(scoutWar({ warId: w.id, userId: fresh, guildId: "g1" })).rejects.toThrow(/Not eligible/);
    await testPrisma.user.update({ where: { discordId: a.ids[2] }, data: { crimeHeat: 100 } });
    await expect(armHit({ warId: w.id, userId: a.ids[2], guildId: "g1", block: "docks" })).rejects.toThrow(/heat/);
    expect(await testPrisma.warContribution.count({ where: { warId: w.id } })).toBe(0);
    expect(await wallet(a.ids[1])).toBe(200_000);
  });

  it("a member's first scout and first hit racing create one contribution row", async () => {
    const { w, a } = await liveWar();
    const rs = await Promise.allSettled([scoutWar({ warId: w.id, userId: a.ids[0], guildId: "g1" }), armHit({ warId: w.id, userId: a.ids[0], guildId: "g1", block: "main" })]);
    expect(rs.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await testPrisma.warContribution.count({ where: { warId: w.id, userId: a.ids[0] } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/turf-war.race.test.ts`
Expected: the lifecycle block PASSes; the actions block FAILs (cannot resolve `warActions`).

- [ ] **Step 3: Implement `warActions.ts`**

- One shared private step, `warActor(warId, userId, guildId, now)`:
  1. Read the war and refuse with the status copy.
  2. Find the side through `getMembership`.
  3. `checkMemberEligibility(uid, "war", { now, guildId, expectedGuildId: family.homeGuildId })`; failures throw `eligibilityError(failures)`.
  4. Only then `ensureContribution` (T14).
- `ensureContribution`: `warContribution.upsert({ where: { warId_userId }, create: { …, nextHitAt: new Date(0) }, update: {} })`, catching a P2002 and re-reading (no transaction is open). `nextHitAt` is created at the epoch, not `now()`: a row created by a racing first scout a few milliseconds after the hit's `now` must not put that hit on cooldown.
- `scoutWar`: `runFamilyTx` with:
  1. The war guard read (`ACTIVE`, `endsAt > now`).
  2. CAS `warContribution.updateMany({ id, lastScoutSlot: { lt: slot } })` → `{ lastScoutSlot: slot }`.
  3. Block `WAR_BLOCKS[randomInt(0, 3)]` and approach `approaches[weakPoint(seed, block, slot)]`.
- `armHit`: `runFamilyTx` with:
  1. The war guard read (T17).
  2. CAS `warContribution.updateMany({ where: { id, hits: { lt: hitsPerWar }, nextHitAt: { lte: now } }, data: { hits: { increment: 1 }, nextHitAt: now + hitCooldownSeconds } })`. On `count 0`, re-read and throw the cap or cooldown copy.
  3. `debitWalletInTx(tx, uid, hitCost, "turf_hit", { warId, block })`.
  4. `warHit.create({ …, slot, deadline: min(now + hitAnswerSeconds, endsAt) })`.
- `answerHit`: read the hit (`"Not your hit."` when the owner differs) and the war, then compute correctness against `hit.slot`. Then `runFamilyTx`:
  1. CAS `warHit.updateMany({ id, state: "ARMED", deadline: { gte: now } })` → `{ choice, state: HIT|MISS, points }`. On `count 0`, re-read: not ARMED → "Locked in already.", else "Too late."
  2. If correct, `war.updateMany({ where: { id, status: "ACTIVE" }, data: { [scoreField(side, block)]: { increment: points } } })`. On `count 0`, throw "Too late: the war is over." (this rolls the hit back too).
  3. Then the contribution `correctHits`/`points` increments and `familyMember.updateMany({ userId, familyId }, { correctHits: { increment: 1 } })`.
- `sweepWarHits(now)`: `warHit.updateMany({ where: { state: "ARMED", deadline: { lt: now } }, data: { state: "TIMEOUT" } })`, returning `count`.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/anticheat/turf-war.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/warActions.ts test/anticheat/turf-war.race.test.ts
git commit -m "feat(turf): scout, hit and answer with per-slot weak points"
```

---

### Task 8: Turf views, customIds and screens S16–S21 and S25 (war)

**Files:**
- Create: `src/services/crimeFamily/turfQueries.ts`, `src/ui/crimeFamily/turfScreens.ts`, `src/scripts/fixtures/turfScreens.ts`
- Modify: `src/services/crimeFamily/views.ts` (turf view types), `src/ui/crimeFamily/ids.ts` (`TURF_IDS`), `src/ui/crimeFamily/post.ts` (`channelLink`), `src/scripts/fixtures/crimeFamilyScreens.ts` (append `...turfWorstCases()`; S10 fixture view gets 3 sorts and `max: 13`, spec 13.3)
- Test: `test/crimeFamily/turf-views.test.ts`, `test/crimeFamily/turf-layout.test.ts`

**Interfaces:**
- Consumes: `cfPayload`, `thumbSection`, `bannerGallery`, `cfEmoji`, `fmtFortunes`, `RACKET_CLASSES`, `WAR_BLOCKS`, `bidBlockers`, `pairRuleBlocks`, `minNextBid`, `bidFloor`, `nextWarStart`, `isBlackout`, `scoresOf`, `blockResults`.
- Produces: `TURF_IDS` and `channelLink` (Interfaces block). `views.ts` additions:
  - `TurfRacketLine { key: string; name: string; class: RacketClass; income: number; ownerFamilyId: string; ownerLabel: string /* "[TAG] Name" or "the Street" */; strikes: number; war: { id: string; status: WarStatus; topBid: number; topBidderLabel: string | null; bidClosesAt: Date; startsAt: Date } | null; nextWarAt: Date }`
  - `TurfMapView { rackets: TurfRacketLine[] /* RACKETS order */; nextWar: { racketName: string; startsAt: Date } }`
  - `RacketDetailView { line: TurfRacketLine; floor: number; minBid: number; minFamilyLevel: number; viewerIsOfficer: boolean; canBid: boolean; blockers: string[] }`
  - `WarSideView { familyId: string; label: string }`
  - `WarBoardView { warId: string; racketKey: string; racketName: string; racketClass: RacketClass; startsAt: Date; endsAt: Date; attacker: WarSideView; defender: WarSideView; scores: BlockScores; hits: { atk: number; def: number }; top: { atk: { userId: string; points: number }[]; def: { userId: string; points: number }[] }; blackout: boolean }`
  - `WarResultView { board: WarBoardView; outcome: WarSettlement["outcome"]; overCap: boolean; xp: { label: string; xp: number }[]; heated: number }`
  - (`WarBoardRef` already exists from Task 2; this task only consumes it.)

  `turfScreens.ts` (each returns `CfPayload` unless noted; `art: "send"` = gallery + file, `"keep"` = gallery with no file, `"none"` = no gallery):
  - S16 `buildTurfMap(ownerId: string, v: TurfMapView)`. It always sends `cf_turf_map` when present, with `attachments: []`. It holds 10 lines (`<turf emoji> **Name** · owner · income/day · war Ddd HH:00 UTC`, plus `· top bid X` while BIDDING, `· war live` while ACTIVE), the select `TURF_IDS.select` with 10 options (`emoji turf_<class>`, description `"<Class> · <income>/day"`), and the buttons War board `TURF_IDS.viewWar` and Back `CREW_IDS.view("home", ownerId)`.
  - S17 `buildRacketDetail(ownerId: string, v: RacketDetailView, note?: string)`. Its thumbnail is `turf_<class>`, always sent with `attachments: []`. Bid (`TURF_IDS.bid`) is disabled when `!canBid`, and the hint is the first blocker (or `note`). Back is `TURF_IDS.viewMap`.
  - `buildBidModal(racketKey: string, ownerId: string): ModalBuilder`, with one short text input `amount`, label "Bid (earnings only)" and placeholder "e.g. 2.1m".
  - S18 `buildWarBoard(v: WarBoardView, art: "send" | "keep" | "none")`. Scores are `"??"` and the top hitters are replaced by `Hits: <atk> vs <def>` in blackout. The row is Scout (`TURF_IDS.scout`, emoji `role_lookout`) plus three Hit buttons (`TURF_IDS.hit`, emoji `block_<key>`).
  - S19 `buildHitCall(h: ArmedHit, blockName: string)`, ephemeral, with 4 plain-label buttons `TURF_IDS.hitAnswer(hitId, 0..3)`. `buildHitResult(text: string)` is ephemeral (2 components).
  - S20 `buildScoutReport(r: ScoutReport, blockName: string)`, ephemeral (3 components).
  - S21 `buildWarResult(v: WarResultView, art: "keep" | "none")`, with no action row.
  - S25 war `buildWarCard(v: { warId: string; racketName: string; endsAt: Date; jumpUrl: string | null })` (7 components).
  - `turfWorstCases(): { label: string; max: number; payload: CfPayload }[]`: S16 (14), S17 (11), S18 board (13), S18 blackout (13), S19 (8), hit result (2), S20 (3), S21 (6), S25 war (7). Families are 24-char names with 4-char tags, every racket is owned and in a live war, and amounts are near `MAX_SAFE_BALANCE`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/turf-views.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { getTurfMapView, getRacketDetailView, getWarBoardView } from "../../src/services/crimeFamily/turfQueries";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, seedRacket, seedWar, seedContribution } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(async () => { await resetFamilies(); await seedRackets(); });

describe("turf views", () => {
  it("the map lists 10 rackets in catalog order with owners, live bids and the next war", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), name: "Velvet Ante", tag: "VLA" });
    await seedRacket("pawn_row", { ownerFamilyId: f.id });
    await seedWar({ racketKey: "docks_numbers", status: "BIDDING", topBid: 2_100_000, topBidderFamilyId: f.id });
    const v = await getTurfMapView(new Date());
    expect(v.rackets.map((r) => r.key)[0]).toBe("docks_numbers");
    expect(v.rackets.find((r) => r.key === "pawn_row")!.ownerLabel).toBe("[VLA] Velvet Ante");
    expect(v.rackets.find((r) => r.key === "city_hall")!.ownerLabel).toBe("the Street");
    expect(v.rackets.find((r) => r.key === "docks_numbers")!.war).toMatchObject({ status: "BIDDING", topBid: 2_100_000, topBidderLabel: "[VLA] Velvet Ante" });
  });

  it("racket detail gives the minimum bid and the viewer's blockers", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss, level: 1, earnings: 9e6 });
    await seedWar({ racketKey: "harbor_customs", status: "BIDDING" });
    expect(await getRacketDetailView("harbor_customs", boss, new Date())).toMatchObject({ floor: 4_550_000, minBid: 4_550_000, canBid: false, blockers: ["District rackets need family level 4."] });
    const other = await seedFamily({ bossId: await seedEligibleUser(), earnings: 9e6 });
    await seedWar({ racketKey: "pawn_row", status: "BIDDING", topBid: 2_100_000, topBidderFamilyId: other.id });
    expect(await getRacketDetailView("pawn_row", boss, new Date())).toMatchObject({ minBid: 2_310_000, canBid: true, blockers: [] });
  });

  it("the board view ranks hitters and flags the blackout", async () => {
    const a = await seedFamily({ bossId: await seedEligibleUser() });
    const w = await seedWar({ racketKey: "casino_row", status: "ACTIVE", startsAt: new Date(Date.now() - 51 * 60_000), topBid: 9_100_000, topBidderFamilyId: a.id, defenderFamilyId: "" });
    for (const [i, p] of [10, 30, 20].entries()) await seedContribution({ warId: w.id, familyId: a.id, userId: `u${i}`, side: "ATK", hits: 3, correctHits: p / 10, points: p });
    const v = await getWarBoardView(w.id, new Date());
    expect(v).toMatchObject({ blackout: true, defender: { familyId: "", label: "the Street" }, hits: { atk: 9, def: 0 } });
    expect(v.top.atk.map((t) => t.points)).toEqual([30, 20, 10]);
    expect(v.scores.docks).toEqual({ atk: 0, def: 80 });
  });
});
```

```ts
// test/crimeFamily/turf-layout.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const S = await import("../../src/ui/crimeFamily/turfScreens");
const { turfWorstCases } = await import("../../src/scripts/fixtures/turfScreens");

const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); if (n.accessory) f(n.accessory); };
const json = (p: any) => p.components.map((c: any) => c.toJSON());
const text = (p: any) => JSON.stringify(json(p));
const types = (p: any) => { const t: number[] = []; json(p).forEach((c: any) => walk(c, (n) => t.push(n.type))); return t; };
const view = (o: any = {}) => ({ warId: "65f0000000000000000000ab", racketKey: "casino_row", racketName: "Casino Row Protection", racketClass: "CROWN", startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000),
  attacker: { familyId: "a", label: "[VLA] Velvet Ante" }, defender: { familyId: "", label: "the Street" },
  scores: { docks: { atk: 10, def: 80 }, main: { atk: 0, def: 80 }, alleys: { atk: 0, def: 80 } }, hits: { atk: 14, def: 9 },
  top: { atk: [{ userId: "1", points: 10 }], def: [] }, blackout: false, ...o });

beforeAll(() => { for (const k of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${k}`, { id: "1456569047758929931", name: `cf_${k}` }); });

describe("turf screens (13.3)", () => {
  it("registers every turf case in the shared worst-case table", async () => {
    const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
    const labels = crimeFamilyWorstCases().map((c) => c.label);
    for (const c of turfWorstCases()) expect(labels).toContain(c.label);
  });

  it("S18 shows the baseline outside the blackout and ?? with hit counts inside it", () => {
    art.present = true;
    expect(text(S.buildWarBoard(view(), "none"))).toMatch(/80/);
    const dark = text(S.buildWarBoard(view({ blackout: true }), "none"));
    expect(dark).toContain("??"); expect(dark).toContain("Hits: 14 vs 9"); expect(dark).not.toMatch(/\b80\b/);
  });

  it("S18 art modes: send carries the banner file, keep only the gallery, none neither (T8, D66)", () => {
    art.present = true;
    const send = S.buildWarBoard(view(), "send");
    expect(send.files).toHaveLength(1);
    expect(types(send)).toContain(ComponentType.MediaGallery);
    const keep = S.buildWarBoard(view(), "keep");
    expect(keep.files ?? []).toHaveLength(0);
    expect(types(keep)).toContain(ComponentType.MediaGallery);
    expect(types(S.buildWarBoard(view(), "none"))).not.toContain(ComponentType.MediaGallery);
    art.present = false;
    const absent = S.buildWarBoard(view(), "send");
    expect([absent.files ?? [], types(absent).includes(ComponentType.MediaGallery)]).toEqual([[], false]);
  });

  it("S18 buttons carry block emojis; S19 approach buttons are plain text", () => {
    art.present = true;
    const ids: string[] = []; const emojis: any[] = [];
    json(S.buildWarBoard(view(), "none")).forEach((c: any) => walk(c, (n) => { if (n.custom_id) { ids.push(n.custom_id); emojis.push(n.emoji); } }));
    expect(ids).toEqual([TURF_IDS.scout(view().warId), ...["docks", "main", "alleys"].map((b) => TURF_IDS.hit(view().warId, b as any))]);
    expect(emojis.every(Boolean)).toBe(true);
    const call = S.buildHitCall({ hitId: "65f0000000000000000000ac", block: "docks", deadline: new Date(), slotEndsAt: new Date(), approaches: ["Crane", "Warehouse", "Pier 4", "Boathouse"] }, "Docks");
    const labels: any[] = []; json(call).forEach((c: any) => walk(c, (n) => n.custom_id && labels.push([n.label, n.emoji])));
    expect(labels).toEqual([["Crane", undefined], ["Warehouse", undefined], ["Pier 4", undefined], ["Boathouse", undefined]]);
  });

  it("S21 has no action row; S17 always sends its thumbnail and clears old attachments", () => {
    art.present = true;
    const result = S.buildWarResult({ board: view(), outcome: "HELD", overCap: false, xp: [], heated: 2 }, "keep");
    expect(types(result)).not.toContain(ComponentType.ActionRow);
    const c = turfWorstCases().find((x) => x.label.startsWith("S17"))!;
    expect(c.payload.files).toHaveLength(1);
    expect(c.payload.attachments).toEqual([]);
  });

  it("S16 and S21 drop the gallery and send no file when the banner is absent; S16 sends the banner and clears attachments when present (D66, 13.2)", () => {
    art.present = false;
    const mapAbsent = turfWorstCases().find((x) => x.label.startsWith("S16"))!.payload;
    expect([types(mapAbsent).includes(ComponentType.MediaGallery), mapAbsent.files ?? []]).toEqual([false, []]);
    const resultAbsent = S.buildWarResult({ board: view(), outcome: "HELD", overCap: false, xp: [], heated: 0 }, "keep");
    expect([types(resultAbsent).includes(ComponentType.MediaGallery), resultAbsent.files ?? []]).toEqual([false, []]);
    art.present = true;
    const map = turfWorstCases().find((x) => x.label.startsWith("S16"))!.payload;   // also the S17 → S16 Back payload
    expect(map.files).toHaveLength(1);
    expect(map.attachments).toEqual([]);
  });

  it("S16 lists 10 rackets under 2,000 characters with emojis seeded", () => {
    art.present = true;
    const c = turfWorstCases().find((x) => x.label.startsWith("S16"))!;
    const t = json(c.payload).flatMap((x: any) => { const out: string[] = []; walk(x, (n) => typeof n.content === "string" && out.push(n.content)); return out; }).join("");
    expect(t.length).toBeLessThan(2_000);
    const opts: any[] = []; json(c.payload).forEach((x: any) => walk(x, (n) => n.options && opts.push(...n.options)));
    expect(opts).toHaveLength(10);
  });
});
```

`test/crimeFamily/ids-post.test.ts` (plan 1) gains: every `TURF_IDS` builder at max lengths (16-char racket keys, 20-digit owners, 24-char ObjectIds) is ≤ 100 characters and round-trips through `parseCfId`, and `channelLink("1", "2")` is `"https://discord.com/channels/1/2"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/turf-views.test.ts test/crimeFamily/turf-layout.test.ts test/crimeFamily/ids-post.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the views, ids, screens and fixtures**

- `getTurfMapView` iterates `RACKETS` (catalog order) and joins the DB rows by key, with a missing row rendering as the Street, so the map works before the first boot seed. It reads the rackets, their families and the latest non-final war per racket (BIDDING, ARMED or ACTIVE) in at most 3 queries.
- `getRacketDetailView` calls Task 5's `loadBidContext(prisma, familyId | null, viewerId, racketKey, now)` read-only on the global client, then `bidBlockers`. It never re-derives a count.
- `getWarBoardView` takes the top 5 contributors per side by `points` and sums `hits` per side.
- `getLiveWarFor` returns the ARMED or ACTIVE war with the family on either side (wars never overlap, because every racket has its own window).
- Screens follow the 13.3 component lists exactly and render timestamps as `<t:unix:R>`/`<t:unix:F>`.
- Run `checkV2Payloads.ts` in Step 4.

- [ ] **Step 4: Run the tests, plan 1's layout test and the payload audit**

Run: `$VT test/crimeFamily/turf-views.test.ts test/crimeFamily/turf-layout.test.ts test/crimeFamily/ids-post.test.ts test/crimeFamily/layout.test.ts`
Expected: PASS. Plan 1's `layout.test.ts` now also iterates every turf case, with art present and absent.
Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json`
Expected: every line `PASS`, ending "All payloads within Discord limits", and `emojis.json` unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/turfQueries.ts src/services/crimeFamily/views.ts src/ui/crimeFamily/ids.ts src/ui/crimeFamily/post.ts src/ui/crimeFamily/turfScreens.ts src/scripts/fixtures/turfScreens.ts src/scripts/fixtures/crimeFamilyScreens.ts test/crimeFamily/turf-views.test.ts test/crimeFamily/turf-layout.test.ts test/crimeFamily/ids-post.test.ts
git commit -m "feat(turf): turf map, racket detail, war board, hit call, scout report and war result screens"
```

---

### Task 9: The `turf` DM type, notices and the turf announcer

**Files:**
- Modify: `src/services/dmPrefsService.ts` (`turf: { label: "Turf wars", group: "account" }` after `caper_lobby`), `src/services/dmNoticeService.ts` (turf builders in the Crime Families section), `test/dm/prefs.test.ts` and `test/dm/investment-notice.test.ts` (append `"turf"` to the pinned `noticeTypesInGroup("account")` arrays), `test/dm/family-notice.test.ts` (delete plan 2's "the settings panel is 29 components with DMs on and 30 off" case: `turf` makes it 30/31, and `turf-notice.test.ts` below now pins that)
- Create: `src/ui/crimeFamily/turfAnnounce.ts`, `test/crimeFamily/fakeClient.ts` (move `fakeClient` out of `test/crimeFamily/scheduler.test.ts` and import it there)
- Test: `test/dm/turf-notice.test.ts`, `test/crimeFamily/turf-announce.test.ts`

**Interfaces:**
- Consumes: `noticeContainer`, `cfNoticeEmote("war")`, `notifyMany`, `sendToChannel`, `editChannelMessage`, `buildNotice`, `jumpLink`, `channelLink`, `setNx`, `listMembers`, `checkMemberEligibility(uid, "war")`, `getWarBoardView`, the screens.
- Produces: the announcer functions (Interfaces block), and these builders, each a `ContainerBuilder` with a text-only title and the `-# … Manage these DMs with \`!settings\`` hint:
  - `turfBidPlacedNotice(v: { racketName: string; bidderLabel: string; amount: number; startsAt: Date })`
  - `turfOutbidNotice(v: { racketName: string; amount: number; refunded: number; bidClosesAt: Date })`, whose body includes `` `You were outbid on ${racketName}: ${fmt(amount)}` `` (spec moment 3)
  - `turfWarSoonNotice(v: { racketName: string; side: WarSide; startsAt: Date; channelUrl: string })`
  - `turfWarResultNotice(v: { racketName: string; side: WarSide; won: boolean; summary: string })`
  - `turfNeglectNotice(v: { racketName: string; strikes: number; max: number })`, body `` `Neglect strike ${n}/${max}: play two caper seats this week to keep ${racketName}` `` (9.3)
  - `turfReleasedNotice(v: { racketName: string })`
  - `fakeClient(o?: { dead?: boolean; failSend?: Set<string>; failEdit?: Set<string> })` returns plan 1's `{ client, dm, sent, edits }` plus `calls: { op: "send" | "edit"; channelId: string; messageId?: string; payload: any }[]`. `failSend`/`failEdit` hold channel ids that throw `{ code: 50013 }`. Every attempt is pushed to `calls` before it throws, so a failed send still counts.

- [ ] **Step 1: Write the failing tests**

```ts
// test/dm/turf-notice.test.ts
import { describe, it, expect } from "vitest";
import { ComponentType } from "discord.js";
import { DM_NOTICE_TYPES, isCooldownReminderType, noticeTypesInGroup } from "../../src/services/dmPrefsService";
import { turfOutbidNotice, turfNeglectNotice } from "../../src/services/dmNoticeService";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { containerText, containerThumb } from "./helpers";

const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);

describe("turf DM notices (13.4)", () => {
  it("turf is the last account notice, with no command", () => {
    expect(DM_NOTICE_TYPES.turf).toEqual({ label: "Turf wars", group: "account" });
    expect(isCooldownReminderType("turf")).toBe(false);
    expect(noticeTypesInGroup("account").at(-1)).toBe("turf");
  });
  it("the settings panel is 30 components with DMs on and 31 off (13.4)", () => {
    expect(count(buildSettingsPayload("o", { remindersEnabled: true, disabledReminders: [] }).components[0].toJSON())).toBe(30);
    expect(count(buildSettingsPayload("o", { remindersEnabled: false, disabledReminders: [] }).components[0].toJSON())).toBe(31);
  });
  it("outbid and neglect copy carry the facts; the thumbnail falls back to the Gun emote", () => {
    const c = turfOutbidNotice({ racketName: "Casino Row Protection", amount: 10_010_000, refunded: 9_100_000, bidClosesAt: new Date() });
    expect(containerText(c)).toContain("You were outbid on Casino Row Protection: 10,010,000");
    expect(containerThumb(c)).toContain("1456729243399753752");
    expect(containerText(turfNeglectNotice({ racketName: "Pawn Row Fencing", strikes: 2, max: 3 }))).toContain("Neglect strike 2/3: play two caper seats this week to keep Pawn Row Fencing");
  });
});
```

```ts
// test/crimeFamily/turf-announce.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { syncWarBoards, announceWarResult, announceBid } from "../../src/ui/crimeFamily/turfAnnounce";
import { settleWar } from "../../src/services/crimeFamily/warService";
import { fakeClient } from "./fakeClient";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution, flushTestKeys } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:render:war:*"); });

async function sides() {
  const mk = async (ch: string) => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, homeGuildId: "g1", homeChannelId: ch, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    return { f, boss, ub, s };
  };
  return { a: await mk("ch-a"), d: await mk("ch-d") };
}
const boards = async (id: string) => (await testPrisma.war.findUnique({ where: { id } }))!.boards as any[];

describe("turf announcer", () => {
  it("posts one board per family home channel with the banner, then edits without files; the Street gets none", async () => {
    const { a, d } = await sides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient();
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect(c.calls.filter((x) => x.op === "send").map((x) => [x.channelId, x.payload.files?.length])).toEqual([["ch-a", 1], ["ch-d", 1]]);
    expect((await boards(w.id)).map((b) => [b.side, b.hasBanner, b.dead])).toEqual([["ATK", true, false], ["DEF", true, false]]);
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect(c.calls.filter((x) => x.op === "edit").every((x) => !x.payload.files?.length)).toBe(true);
    const street = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "" });
    await syncWarBoards(c.client, street.id, new Date(), { force: true });
    expect((await boards(street.id)).map((b) => b.side)).toEqual(["ATK"]);
  });

  it("a minute refresh is debounced; a dead board gets one repost, then stops (edge 28)", async () => {
    const { a, d } = await sides();
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient();
    await syncWarBoards(c.client, w.id, new Date());
    const n = c.calls.length;
    await syncWarBoards(c.client, w.id, new Date());
    expect(c.calls.length).toBe(n);                                      // held by cf:render:war:<id>
    const broken = fakeClient({ failEdit: new Set(["ch-d"]), failSend: new Set(["ch-d"]) });
    await syncWarBoards(broken.client, w.id, new Date(), { force: true });
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ dead: true });
    const before = broken.calls.length;
    await syncWarBoards(broken.client, w.id, new Date(), { force: true });
    expect(broken.calls.slice(before).every((x) => x.channelId === "ch-a")).toBe(true);
  });

  it("a first post that fails gets one more try on the next sync, then the board is dead (edge 28)", async () => {
    const { a, d } = await sides();
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient({ failSend: new Set(["ch-d"]) });
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ messageId: "", dead: false });
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect(c.calls.filter((x) => x.op === "send" && x.channelId === "ch-d")).toHaveLength(2);
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ dead: true });
  });

  it("a result edits live boards to S21, posts a notice in both home channels and DMs only contributors", async () => {
    const { a, d } = await sides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient();
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.s, side: "ATK", hits: 1 });
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "SETTLING" } });
    const s = (await settleWar(w.id, new Date()))!;
    await announceWarResult(c.client, s, new Date());
    const edits = c.calls.filter((x) => x.op === "edit");
    expect(edits.slice(-2).every((x) => !/"type":1[,}]/.test(JSON.stringify(x.payload.components.map((c: any) => c.toJSON()))))).toBe(true); // no ActionRow
    expect(c.calls.filter((x) => x.op === "send").slice(-2).map((x) => x.channelId).sort()).toEqual(["ch-a", "ch-d"]);
    expect([...c.dm.keys()]).toEqual([a.s]);
  });

  it("a bid DMs the owner's officers; an outbid DMs the outbid family's officers", async () => {
    const { a, d } = await sides();
    const c = fakeClient();
    await announceBid(c.client, { warId: "w", racketKey: "docks_numbers", racketName: "Dockside Numbers", amount: 2_310_000, familyId: a.f.id, familyLabel: "[A] A", startsAt: new Date(), bidClosesAt: new Date(), ownerFamilyId: d.f.id, previous: { familyId: d.f.id, amount: 2_100_000 } });
    expect(Object.fromEntries(c.dm)).toEqual({ [d.boss]: 2, [d.ub]: 2 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/dm/turf-notice.test.ts test/crimeFamily/turf-announce.test.ts`
Expected: FAIL (`DM_NOTICE_TYPES.turf` is undefined; `turfAnnounce` is missing).

- [ ] **Step 3: Implement**

- `syncWarBoards(client, warId, now, { force })`:
  1. Return unless the war is ACTIVE, or `force` is set.
  2. Without `force`, `setNx("cf:render:war:" + warId, warBoardRefreshSeconds) === "held"` → return (T7).
  3. Build the view, then for each side (ATK; DEF only when `defenderFamilyId !== ""`):
     - no ref → post with `"send"` and record `hasBanner = !!payload.files?.length`. If `sendToChannel` returns `null`, record `{ side, guildId, channelId, messageId: "", hasBanner: false, dead: false }`;
     - a `dead` ref → skip;
     - a ref with `messageId === ""` (its first post failed) → one more post with `"send"`. On success fill in `messageId` and `hasBanner`; on another `null` set `dead: true` (spec 17 edge 28: one repost, then DMs only);
     - otherwise edit with `hasBanner ? "keep" : "none"`;
     - an edit that returns `"dead"` → one repost with `"send"`; if that also fails, `dead: true` and `messageId: ""`.
  4. Write `boards` back only when it changed.
- `announceWarResult`:
  1. Edit every live ref to S21.
  2. Post `buildNotice` with "Turf war on <racket>: <label> captured it (2 of 3 blocks)." or "…held it." or "…was called off: downtime." in each family's home channel.
  3. Send `turfWarResultNotice` to each contributor, on their own side.
- `announceBid`: `turfBidPlacedNotice` to the owner's Boss and Underboss (when the owner is a family), and `turfOutbidNotice` to the previous bidder's Boss and Underboss.
- `announceWarSoon`: members of both families that pass `checkMemberEligibility(uid, "war")`, linked with `channelLink(homeGuildId, homeChannelId)` (T9).
- `announceRacketCollect`:
  - `"neglected"` → `turfNeglectNotice` to `ineligible ∪ officers`;
  - `"released"` → `turfReleasedNotice` to `all`;
  - anything else → nothing.

  One DM per user per event.

- [ ] **Step 4: Run them, plus the DM suites and plan 1's scheduler test (moved helper)**

Run: `$VT test/dm test/crimeFamily/turf-announce.test.ts test/crimeFamily/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/dmPrefsService.ts src/services/dmNoticeService.ts src/ui/crimeFamily/turfAnnounce.ts test/crimeFamily/fakeClient.ts test/crimeFamily/scheduler.test.ts test/dm/prefs.test.ts test/dm/investment-notice.test.ts test/dm/family-notice.test.ts test/dm/turf-notice.test.ts test/crimeFamily/turf-announce.test.ts
git commit -m "feat(turf): turf DM notices, war boards and result announcements"
```

---

### Task 10: Turf jobs: `tickWars`, `tickRackets` and the hit sweep

**Files:**
- Create: `src/services/crimeFamily/turfJobs.ts`
- Modify: `src/services/crimeFamily/scheduler.ts`. Append `{ name: "sweepWarHits", run: (_c, now) => sweepWarHits(now).then(() => {}) }` to the existing `"* * * * *"` entry, and append two `CF_SCHEDULES` entries at the end of the array, after every existing entry: `{ cron: "* * * * *", jobs: [tickWars] }` (its own schedule, spec 15) then `{ cron: "5 * * * *", jobs: [tickRackets] }`. The existing minute entry stays first, so `CF_SCHEDULES.find((s) => s.cron === "* * * * *")` still returns it. Each job is wrapped as `{ name, run }`, as plan 1's are.
- Modify: `test/crimeFamily/scheduler.test.ts`. Plan 2's pinned assertion `CF_SCHEDULES.find((s) => s.cron === "* * * * *")!.jobs.map((j) => j.name)` changes from `["sweepInvites", "sweepCapers"]` to `["sweepInvites", "sweepCapers", "sweepWarHits"]`.
- Test: `test/crimeFamily/turf-jobs.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7 and 9.
- Produces:
  - `tickWars(client, now)`, which runs (1) to (7) in this order, each war in its own try/catch logging `[crimeFamily] tickWars <warId> error`:
    1. if `enabled && turfEnabled`, `openWarPeriods`;
    2. BIDDING with `bidClosesAt ≤ now` → `closeBidding(id, now, enabled && turfEnabled)`;
    3. ARMED with `startsAt: { gt: now, lte: now + warSoonSeconds }` (only before the start; after downtime past `startsAt` there is no warning) and a `claimWarnSoon` win → `announceWarSoon`;
    4. ARMED with `startsAt ≤ now` → `activateWar`, and on `"ACTIVE"`, `syncWarBoards(force)`;
    5. ACTIVE → `recordWarTick`, then, if `endsAt > now`, `syncWarBoards`;
    6. ACTIVE with `endsAt ≤ now` → `beginSettle` → `settleWar` → `announceWarResult`;
    7. SETTLING (any age) → `settleWar` → `announceWarResult`.
  - `tickRackets(client, now)`: returns at once unless `enabled && turfEnabled` (T1). It takes `racketEligibleMembers` once per owning family, then `collectRacket`, then `announceRacketCollect`.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/turf-jobs.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { CF_SCHEDULES } from "../../src/services/crimeFamily/scheduler";
import { tickWars, tickRackets } from "../../src/services/crimeFamily/turfJobs";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { seedRackets } from "../../src/services/crimeFamily/racketService";
import { nextWarStart } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import { fakeClient } from "./fakeClient";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWarHits, withCfConfig, flushTestKeys } from "../helpers";

const H = 3600_000;
const ON = { enabled: true, turfEnabled: true };
// Every tick time is relative to a valet_racket start in the future, so seeded users (aged from the real clock) are always old enough.
const base = nextWarStart(racketDef("valet_racket")!, new Date(Date.now() + 73 * H));
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(async () => { await resetFamilies(); await seedRackets(); await flushTestKeys("cf:render:war:*"); });

async function fam(channel: string, earnings = 0) {
  const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, earnings, homeGuildId: "g1", homeChannelId: channel, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, ids: [boss, ub, s], boss };
}

describe("turf jobs (15)", () => {
  it("schedules tickWars on its own minute entry, tickRackets at :05 and the hit sweep with the minute sweepers", () => {
    const names = (cron: string) => CF_SCHEDULES.filter((s) => s.cron === cron).map((s) => s.jobs.map((j) => j.name));
    expect(names("* * * * *")).toEqual(expect.arrayContaining([["tickWars"], expect.arrayContaining(["sweepWarHits"])]));
    expect(names("5 * * * *")).toEqual([["tickRackets"]]);
  });

  it("walks one war through every state once: open, bid, arm, warn, start, settle", async () => {
    await withCfConfig(ON, async () => {
      const owner = await fam("ch-d"); const a = await fam("ch-a", 3_000_000);
      await testPrisma.racket.update({ where: { key: "valet_racket" }, data: { ownerFamilyId: owner.f.id } });
      const c = fakeClient();
      const at = (h: number) => new Date(+base + h * H);
      await tickWars(c.client, at(-72)); await tickWars(c.client, new Date(+at(-72) + 30_000));
      expect(await testPrisma.war.count({ where: { racketKey: "valet_racket" } })).toBe(1);
      await placeBid({ racketKey: "valet_racket", actorId: a.boss, amount: 2_100_000, now: at(-48) });
      await tickWars(c.client, at(-1));
      expect(await testPrisma.war.findFirst({ where: { racketKey: "valet_racket" } })).toMatchObject({ status: "ARMED", defenderFamilyId: owner.f.id });
      await tickWars(c.client, at(-0.25)); await tickWars(c.client, new Date(+at(-0.25) + 60_000));
      expect(c.dm.size).toBe(6);
      expect([...c.dm.values()].every((n) => n === 1)).toBe(true);
      await tickWars(c.client, base);
      expect(c.calls.filter((x) => x.op === "send").map((x) => x.channelId).sort()).toEqual(["ch-a", "ch-d"]);
      for (let m = 1; m <= 60; m++) await tickWars(c.client, new Date(+base + m * 60_000));
      const w = (await testPrisma.war.findFirst({ where: { racketKey: "valet_racket" } }))!;
      expect(w).toMatchObject({ status: "RESOLVED", winnerFamilyId: owner.f.id, maxTickGapSeconds: 60 });
      expect((await testPrisma.racket.findUnique({ where: { key: "valet_racket" } }))!.ownerFamilyId).toBe(owner.f.id);
      expect(await testPrisma.familyLedger.count({ where: { type: "war_bid_burn" } })).toBe(1);
    });
  });

  it("with turf off: no new wars, and a bid war closing is cancelled and refunded (T1)", async () => {
    const a = await fam("ch-a", 3_000_000);
    const c = fakeClient();
    await withCfConfig(ON, async () => {
      await tickWars(c.client, new Date(+base - 72 * H));
      await placeBid({ racketKey: "valet_racket", actorId: a.boss, amount: 2_100_000, now: new Date(+base - 48 * H) });
    });
    await testPrisma.war.deleteMany({ where: { racketKey: { not: "valet_racket" } } });
    await tickWars(c.client, new Date(+base - H));
    expect(await testPrisma.war.findFirst({ where: { racketKey: "valet_racket" } })).toMatchObject({ status: "CANCELLED" });
    expect((await testPrisma.family.findUnique({ where: { id: a.f.id } }))!.earnings).toBe(3_000_000);
    expect(await testPrisma.war.count({ where: { status: "BIDDING" } })).toBe(0);
  });

  it("tickRackets mints for 3 eligible members, strikes and DMs otherwise, and does nothing while turf is off", async () => {
    const rich = await fam("ch-a"); const lazy = await fam("ch-b");
    for (const id of rich.ids) await seedWarHits(id, rich.f.id, 3);
    await seedWarHits(lazy.ids[2], lazy.f.id, 3);
    const old = new Date(Date.now() - 25 * 3600_000);
    await seedRacket("pawn_row", { ownerFamilyId: rich.f.id, lastPayoutAt: old });
    await seedRacket("docks_numbers", { ownerFamilyId: lazy.f.id, lastPayoutAt: old });
    const c = fakeClient();
    await tickRackets(c.client, new Date());
    expect((await testPrisma.family.findUnique({ where: { id: rich.f.id } }))!.earnings).toBe(0);
    await withCfConfig(ON, () => tickRackets(c.client, new Date()));
    expect((await testPrisma.family.findUnique({ where: { id: rich.f.id } }))!.earnings).toBe(300_000);
    expect((await testPrisma.racket.findUnique({ where: { key: "docks_numbers" } }))!.neglectStrikes).toBe(1);
    expect([...c.dm.keys()].sort()).toEqual([lazy.ids[0], lazy.ids[1]].sort()); // officers; the active Soldier is eligible
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/turf-jobs.test.ts`
Expected: FAIL, cannot resolve `turfJobs`.

- [ ] **Step 3: Implement `turfJobs.ts` and the `CF_SCHEDULES` entries**

- [ ] **Step 4: Run it, plus plan 1's scheduler test (which registers every entry with `noOverlap: true`)**

Run: `$VT test/crimeFamily/turf-jobs.test.ts test/crimeFamily/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/turfJobs.ts src/services/crimeFamily/scheduler.ts test/crimeFamily/scheduler.test.ts test/crimeFamily/turf-jobs.test.ts
git commit -m "feat(turf): tickWars, tickRackets and the hit-timeout sweep"
```

---

### Task 11: `turf:` interaction routes

**Files:**
- Modify: `src/handlers/turfInteractionHandler.ts` (fill `TURF_ROUTES`), `src/handlers/crimeFamilyRouter.ts` (the `turf` missing-entry copy becomes `"This button is no longer active."`, as plan 2 Task 12 did for `cpr`; all three prefixes now share that copy, so the per-prefix map collapses to the one string)
- Test: `test/crimeFamily/turf-handlers.test.ts`

**Interfaces:**
- Consumes: `CfRouteEntry`, `rejectPress`, `safeEditReply` (`src/utils/interactionHelpers.ts:91`), `isTurfOpen`, every turf service and screen, `announceBid`, `getMembership`, `getLiveWarFor`, `jumpLink`.
- Produces: `TURF_ROUTES`. Each entry carries only `scope` and `ack`; the router owns the owner check, the ack, error mapping and `touchActivity`.
  - `"v:map"` `{ owner, auto }` → S16.
  - `"v:war"` `{ owner, auto }` → S25 war card or a next-war line (T20).
  - `sel` `{ owner, auto }` → S17 for `i.values[0]`.
  - `"open:racket"` `{ owner, ephemeral }` → S17.
  - `bid` `{ modalOpener, modal }` → `showModal(buildBidModal(key, owner))` as the first await.
  - `"modal:bid"` `{ owner, ephemeral }` → `parseBidAmount` → `placeBid` → S17 with note `` `Bid placed: ${fmt(amount)}.` `` → `void announceBid(i.client, r)`.
  - `scout` `{ shared, ephemeral }` → S20.
  - `hit` `{ shared, ephemeral }` → S19.
  - `hx` `{ shared, update }` → "Hit! +10 on Docks." or "Missed. No points." (T10).

  `v:*`, `sel`, `open:racket` and `modal:bid` refuse with "Turf wars are not open in this server yet." unless `isTurfOpen(i.guildId)`. `scout`, `hit` and `hx` are not flag-gated (T1). A bad block or choice argument gets "This button is no longer active."

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/turf-handlers.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { redisService } from "../../src/services/redisService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { weakPoint, slotOf } from "../../src/services/crimeFamily/warMath";
import { fakeButton, fakeModal, said } from "./fakeInteraction";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, withCfConfig } from "../helpers";

const ON = { enabled: true, turfEnabled: true };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(resetFamilies);

async function liveWar() {
  const boss = await seedEligibleUser({ wallet: 100_000 }); const s = await seedEligibleUser({ wallet: 100_000 });
  const a = await seedFamily({ bossId: boss, homeGuildId: "g1", members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  await seedRacket("docks_numbers");
  const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.id, defenderFamilyId: "" });
  return { w, boss, s, a };
}

describe("turf routes (13.2)", () => {
  it("the Bid button opens its modal before any Prisma or Redis call", async () => {
    const db = vi.spyOn(prisma.familyMember, "findUnique"); const redis = vi.spyOn(redisService, "getInstance");
    const i = fakeButton(TURF_IDS.bid("casino_row", "u1"), { userId: "u1" });
    i.showModal.mockImplementation(async () => { expect(db).not.toHaveBeenCalled(); expect(redis).not.toHaveBeenCalled(); i.order.push("showModal"); });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.order[0]).toBe("showModal");
    db.mockRestore(); redis.mockRestore();
  });

  it("the map is refused while turf is closed", async () => {
    const i = fakeButton(TURF_IDS.viewMap("u1"), { userId: "u1", guildId: "g1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(said(i)).toContain("Turf wars are not open in this server yet.");
  });

  it("Hit → S19 → the right approach scores +10 on the board's war", async () => {
    const { w, s } = await liveWar();
    const hit = fakeButton(TURF_IDS.hit(w.id, "docks"), { userId: s, guildId: "g1" });
    await handleCrimeFamilyInteraction(hit as any);
    const ids = JSON.stringify(hit.editReply.mock.calls).match(/turf:hx:[0-9a-f]{24}:\d/g)!;
    expect(ids).toHaveLength(4);
    const right = weakPoint(w.seed, "docks", slotOf(w.startsAt, new Date()));
    const ans = fakeButton(ids[right], { userId: s, guildId: "g1", ephemeralSource: true });
    await handleCrimeFamilyInteraction(ans as any);
    expect(said(ans)).toContain("+10");
    expect((await testPrisma.war.findUnique({ where: { id: w.id } }))!.atkDocks).toBe(10);
  });

  it("a press from another guild is refused with no debit and no row (Review Focus 4)", async () => {
    const { w, s } = await liveWar();
    const i = fakeButton(TURF_IDS.hit(w.id, "docks"), { userId: s, guildId: "elsewhere" });
    await handleCrimeFamilyInteraction(i as any);
    expect(said(i)).toMatch(/Not eligible/);
    expect(await testPrisma.warContribution.count()).toBe(0);
    expect((await testPrisma.wallet.findUnique({ where: { userId: s } }))!.balance).toBe(100_000);
  });

  it("an unknown block argument and an unknown turf action are inactive buttons", async () => {
    const { w, s } = await liveWar();
    const i = fakeButton(`turf:hit:${w.id}:roof`, { userId: s, guildId: "g1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(said(i)).toContain("This button is no longer active.");
    const gone = fakeButton("turf:nope:u1", { userId: "u1" });
    await handleCrimeFamilyInteraction(gone as any);
    expect(said(gone)).toContain("This button is no longer active.");
  });

  it("the bid modal places the bid and re-renders S17 with a note", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, earnings: 3_000_000 });
      await seedWar({ racketKey: "pawn_row", status: "BIDDING" });
      const i = fakeModal(TURF_IDS.bidModal("pawn_row", boss), { amount: "2.1m" }, { userId: boss, guildId: "g1" });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain("Bid placed: 2,100,000.");
      expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.earnings).toBe(900_000);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/turf-handlers.test.ts`
Expected: FAIL. With `TURF_ROUTES` empty, presses answer "Turf wars open soon."

- [ ] **Step 3: Implement `TURF_ROUTES`**

Respond with `safeEditReply(i, payload)` after the router's ack, as plan 1's crew `v` routes do. `"v:war"` builds the jump link from the viewer's side in `War.boards` (`null` when that board is dead or missing).

- [ ] **Step 4: Run it, plus plan 1's handler test**

Run: `$VT test/crimeFamily/turf-handlers.test.ts test/crimeFamily/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/turfInteractionHandler.ts src/handlers/crimeFamilyRouter.ts test/crimeFamily/turf-handlers.test.ts
git commit -m "feat(turf): turf: routes for map, racket detail, bids, scouting and hits"
```

---

### Task 12: The `!turf` command, aliases, slash spec and help

**Files:**
- Create: `src/commands/economy/turf.ts`
- Modify:
  - `src/commandRouter.ts`: add `racket: "turf"` and `rackets: "turf"` to the `normalizeCommand` alias map (`:145-196`); add `case "turf":` with a lazy `require("./commands/economy/turf")` beside plan 1's `crew` and plan 2's `caper` cases; add `"turf"` to `validCommands` (`:618-623`); do not touch `restrictedInJail` (`:254`).
  - `src/slash/registry.ts`: add a spec after plan 2's `caper` spec.
  - `test/slash/registry.test.ts`.
  - `src/commands/general/help.ts`: a `turf` command in plan 1's `crimefamilies` category.
  - `src/commands/general/tutorial.ts`: one `howToUse` line in the `crimefamilies` lesson: "`{p}turf` shows the 10 rackets; officers bid from earnings, and members scout and hit in the weekly war."
- Test: `test/crimeFamily/turf-command.test.ts`, plus additions to `test/router/crew-jail.test.ts`

**Interfaces:**
- Consumes: `isTurfOpen`, `resolveRacketKey`, `parseBidAmount`, `placeBid`, `announceBid`, `getTurfMapView`, `getLiveWarFor`, `buildTurfMap`, `buildWarCard`, `buildOpener`, `buildNotice`, `errorContainer`, `touchActivity`, `RACKETS`.
- Produces:
  - `handleTurf(message: Message, args: string[]): Promise<unknown>` and `TURF_SUBACTIONS` with keys `map, racket, bid, war`. No subaction means `map`. When `args[0]` is not a subaction and `resolveRacketKey(args[0])` resolves, it dispatches as `racket <args[0]>` (so `!racket casino_row` and `!racket 9` open that racket). Any other first argument replies with the unknown-racket copy.
  - Slash: `{ name: "turf", desc: "Rackets, bids and turf wars", opts: [{ kind: "str", name: "action", desc: "What to do -- leave blank for the turf map", required: false, choices: ["map", "racket", "bid", "war"] }, { kind: "str", name: "racket", desc: "Which racket", required: false, choices: RACKETS.map((r) => r.key) }, { kind: "str", name: "amount", desc: "Bid amount, like 2.1m", required: false }] }`.
  - Help: `{ name: "turf", aliases: ["racket", "rackets"], description: "The 10 rackets, weekly bidding and turf wars.", usage: "{p}turf [racket <key>|bid <key> <amount>|war]", subcommands: ["racket <key|1-10> — a racket's owner, income and bidding window", "bid <key> <amount> — Boss/Underboss: bid from earnings", "war — your family's live war card"], example: "{p}turf bid docks_numbers 2.1m" }`.
  - Copy:
    - closed: "Turf wars are not open in this server yet."
    - unknown racket: `` `Unknown racket. Use a key or number: ${RACKETS.map((r, n) => `${n + 1} ${r.key}`).join(", ")}` ``
    - bid success (public notice): `` `${familyLabel} bid ${fmt(amount)} on ${racketName}. Bidding closes <t:${unix(bidClosesAt)}:R>.` ``
    - wrong guild for `war`: "War actions happen in your family's home server."
    - no live war: `` `No turf war is live for your family. Next war: ${racketName} <t:${unix}:F>.` ``

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/turf-command.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { handleTurf } from "../../src/commands/economy/turf";
import { fakeMessage, replyText } from "../router/fakeMessage";
import { fakeClient } from "./fakeClient";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, seedRacket, seedWar, withCfConfig } from "../helpers";

const ON = { enabled: true, turfEnabled: true };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War"]));
beforeEach(resetFamilies);
async function run(text: string, authorId: string, guildId = "g1") {
  const f = fakeMessage(text, { authorId, guildId });
  Object.assign(f.message, { client: fakeClient().client, channelId: "c1" });
  await handleTurf(f.message, text.split(/\s+/).slice(1));
  return replyText(f.reply.mock.calls[0][0]);
}

describe("!turf (13.1)", () => {
  it("is refused while turf is closed", async () => {
    expect(await run("!turf", await seedEligibleUser())).toContain("Turf wars are not open in this server yet.");
  });

  it("racket <key|n> posts an opener; an unknown key lists keys (Review Focus 2)", async () => {
    await withCfConfig(ON, async () => {
      const u = await seedEligibleUser();
      expect(await run("!turf racket 9", u)).toContain(TURF_IDS.openRacket("casino_row", u));
      expect(await run("!turf racket CASINO_ROW", u)).toContain(TURF_IDS.openRacket("casino_row", u));
      const bad = await run("!turf racket casino", u);
      expect(bad).toContain("Unknown racket.");
      expect(bad).toContain("9 casino_row");
    });
  });

  it("a racket key or number as the first argument opens that racket; anything else lists keys (the racket alias)", async () => {
    await withCfConfig(ON, async () => {
      const u = await seedEligibleUser();
      expect(await run("!racket 9", u)).toContain(TURF_IDS.openRacket("casino_row", u));
      expect(await run("!racket casino_row", u)).toContain(TURF_IDS.openRacket("casino_row", u));
      expect(await run("!racket nowhere", u)).toContain("Unknown racket.");
    });
  });

  it.each(["all", "-1", "1e7", "abc"])("bid %s is refused as an amount (Review Focus 1)", async (amount) => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, earnings: 5_000_000 });
      await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      expect(await run(`!turf bid docks_numbers ${amount}`, boss)).toContain("Enter an amount like 2.1m or 2,100,000.");
    });
  });

  it("bid with short earnings refuses publicly without any vault amount (Review Focus 5)", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, earnings: 1_234_567, treasury: 76_543_210 });
      await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      const t = await run("!turf bid 1 2.1m", boss);
      expect(t).toContain("Not enough earnings for this bid");
      expect(t).not.toMatch(/1,234,567|76,543,210/);
    });
  });

  it("bid places the bid and posts a public notice with the amount", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, tag: "VLA", name: "Velvet Ante", earnings: 5_000_000 });
      await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      expect(await run("!turf bid docks_numbers 2.1m", boss)).toContain("[VLA] Velvet Ante bid 2,100,000 on Dockside Numbers.");
    });
  });

  it("war posts the S25 card in the home guild and refuses elsewhere", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, homeGuildId: "g1" });
      await seedRacket("pawn_row");
      const w = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: f.id, defenderFamilyId: "" });
      expect(await run("!turf war", boss, "g2")).toContain("War actions happen in your family's home server.");
      expect(await run("!turf war", boss, "g1")).toContain(TURF_IDS.scout(w.id));
    });
  });
});
```

Append to `test/router/crew-jail.test.ts`: while jailed, with `ON`, `!turf` routes through `routeMessage` and replies with the map (it contains `TURF_IDS.select(uid)`), and `!rackets` does the same. Append to `test/slash/registry.test.ts`: `["turf", { action: "bid", racket: "casino_row", amount: "9.1m" }, ["bid", "casino_row", "9.1m"]]` and `["turf", {}, []]`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/turf-command.test.ts test/router/crew-jail.test.ts test/slash/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `turf.ts`, the router case and aliases, the slash spec and the help entry**

`handleTurf`: closed → `errorContainer("Turf", <closed copy>)`; `void touchActivity(uid)`; dispatch. `map` posts S16 publicly. `bid` needs membership, and its service errors map to a public one-line `errorContainer` (D59: no amounts reach it, T6). `war` uses `getMembership`, the home-guild check, `getLiveWarFor` and `buildWarCard` with the jump link of the family's board.

- [ ] **Step 4: Run them, the router suites and the slash validator**

Run: `$VT test/crimeFamily/turf-command.test.ts test/router test/slash/registry.test.ts test/general/help-crime-families.test.ts`
Expected: PASS.
Run: `npm run validate:slash`
Expected: "73/100 used" and "All slash command specs are valid."

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/turf.ts src/commandRouter.ts src/slash/registry.ts src/commands/general/help.ts src/commands/general/tutorial.ts test/crimeFamily/turf-command.test.ts test/router/crew-jail.test.ts test/slash/registry.test.ts
git commit -m "feat(turf): !turf command, racket aliases, /turf and help entry"
```

---

### Task 13: Redis-outage and tester guarantees for turf

**Files:**
- Modify: `test/anticheat/family-redis-down.test.ts`, `test/anticheat/family-tester.test.ts` (append turf blocks)

**Interfaces:**
- Consumes: Tasks 4–10; `BOT_DEVELOPER_ID` (`src/utils/developerAccess.ts:3`).
- Produces: tests only. A failure here means fixing the service it names, not the test.

- [ ] **Step 1: Append the tests**

Add any import below that the file does not already have (plan 1's blocks already import `vi`, `redisService`, `testPrisma`, `seedEligibleUser`, `seedFamily`, `resetFamilies` and `daysAgo`).

```ts
// append to test/anticheat/family-redis-down.test.ts
import { scoutWar, armHit, answerHit } from "../../src/services/crimeFamily/warActions";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { collectRacket } from "../../src/services/crimeFamily/racketService";
import { tickWars, tickRackets } from "../../src/services/crimeFamily/turfJobs";
import { weakPoint } from "../../src/services/crimeFamily/warMath";
import { fakeClient } from "../crimeFamily/fakeClient";
import { seedRacket, seedWar, withCfConfig } from "../helpers";

describe("turf with Redis down (spec 18 shape 4, edge 8)", () => {
  const H = 3600_000;
  const balance = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  async function turfSides() {
    const mk = async (ch: string) => {
      const boss = await seedEligibleUser({ wallet: 200_000 }); const ub = await seedEligibleUser({ wallet: 200_000 }); const s = await seedEligibleUser({ wallet: 200_000 });
      const f = await seedFamily({ bossId: boss, level: 1, earnings: 5_000_000, homeGuildId: "g1", homeChannelId: ch, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
      return { f, boss, ub, s };
    };
    return { a: await mk("ch-a"), d: await mk("ch-d") };
  }
  beforeEach(async () => { await resetFamilies(); vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); }); });
  afterEach(() => vi.restoreAllMocks());

  it("scout, arm and answer still work: wallet −25,000, score +10", async () => {
    const { a, d } = await turfSides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    await scoutWar({ warId: w.id, userId: a.s, guildId: "g1" });
    const h = await armHit({ warId: w.id, userId: a.s, guildId: "g1", block: "docks" });
    const slot = (await testPrisma.warHit.findUnique({ where: { id: h.hitId } }))!.slot;
    expect(await answerHit({ hitId: h.hitId, userId: a.s, choice: weakPoint(w.seed, "docks", slot) })).toEqual({ correct: true, points: 10, block: "docks" });
    expect(await balance(a.s)).toBe(175_000);
    expect((await testPrisma.war.findUnique({ where: { id: w.id } }))!.atkDocks).toBe(10);
  });

  it("placeBid moves the escrow out of earnings", async () => {
    const { a } = await turfSides();
    await seedWar({ racketKey: "pawn_row", status: "BIDDING" });
    await placeBid({ racketKey: "pawn_row", actorId: a.boss, amount: 2_100_000 });
    expect((await testPrisma.family.findUnique({ where: { id: a.f.id } }))!.earnings).toBe(2_900_000);
    expect(await testPrisma.war.findFirst({ where: { racketKey: "pawn_row" } })).toMatchObject({ topBid: 2_100_000, topBidderFamilyId: a.f.id });
  });

  it("collectRacket mints one cycle", async () => {
    const { a } = await turfSides();
    const r = await seedRacket("pawn_row", { ownerFamilyId: a.f.id, lastPayoutAt: new Date(Date.now() - 25 * H) });
    expect(await collectRacket(r.id, new Date(), 3)).toMatchObject({ status: "minted", cycles: 1, amount: 300_000 });
    expect((await testPrisma.family.findUnique({ where: { id: a.f.id } }))!.earnings).toBe(5_300_000);
  });

  it("tickWars edits both boards on two consecutive minutes, because setNx 'error' renders (T7)", async () => {
    const { a, d } = await turfSides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id, boards: [
      { side: "ATK", guildId: "g1", channelId: "ch-a", messageId: "m-a", hasBanner: true, dead: false },
      { side: "DEF", guildId: "g1", channelId: "ch-d", messageId: "m-d", hasBanner: true, dead: false },
    ] });
    const c = fakeClient();
    const now = new Date();
    await tickWars(c.client, now);
    await tickWars(c.client, new Date(+now + 60_000));
    const edits = (ch: string) => c.calls.filter((x) => x.op === "edit" && x.channelId === ch).length;
    expect([edits("ch-a"), edits("ch-d")]).toEqual([2, 2]);
    expect(c.calls.filter((x) => x.op === "send")).toHaveLength(0);
  });

  it("tickRackets still sends its neglect DMs", async () => {
    const { a } = await turfSides();                                  // no war hits: nobody is racket-eligible
    await seedRacket("pawn_row", { ownerFamilyId: a.f.id, lastPayoutAt: new Date(Date.now() - 25 * H) });
    const c = fakeClient();
    await withCfConfig({ enabled: true, turfEnabled: true }, () => tickRackets(c.client, new Date()));
    expect((await testPrisma.racket.findUnique({ where: { key: "pawn_row" } }))!.neglectStrikes).toBe(1);
    expect([...c.dm.keys()].sort()).toEqual([a.boss, a.ub, a.s].sort());
  });
});
```

```ts
// append to test/anticheat/family-tester.test.ts (BOT_DEVELOPER_ID is already imported there)
import { armHit } from "../../src/services/crimeFamily/warActions";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { collectRacket } from "../../src/services/crimeFamily/racketService";
import { seedRacket, seedWar, seedContribution } from "../helpers";

describe("turf gives the tester no shortcut (D34)", () => {
  const balance = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  async function testerAtWar() {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 1_000_000 });
    const f = await seedFamily({ bossId: await seedEligibleUser(), level: 1, homeGuildId: "g1", members: [{ userId: BOT_DEVELOPER_ID, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedRacket("docks_numbers");
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: f.id, defenderFamilyId: "" });
    return { f, w };
  }
  beforeEach(async () => {                                            // resetFamilies keeps users; each test re-seeds the tester
    await resetFamilies();
    await testPrisma.wallet.deleteMany({ where: { userId: BOT_DEVELOPER_ID } });
    await testPrisma.user.deleteMany({ where: { discordId: BOT_DEVELOPER_ID } });
  });

  it("a hit debits 25,000 and the 600 s cooldown applies", async () => {
    const { w } = await testerAtWar();
    const now = new Date();
    await armHit({ warId: w.id, userId: BOT_DEVELOPER_ID, guildId: "g1", block: "docks", now });
    expect(await balance(BOT_DEVELOPER_ID)).toBe(975_000);
    await expect(armHit({ warId: w.id, userId: BOT_DEVELOPER_ID, guildId: "g1", block: "main", now: new Date(+now + 599_000) })).rejects.toThrow(/^Next hit <t:\d+:R>\.$/);
    expect(await balance(BOT_DEVELOPER_ID)).toBe(975_000);
  });

  it("a seventh hit is refused with nothing debited", async () => {
    const { f, w } = await testerAtWar();
    await seedContribution({ warId: w.id, familyId: f.id, userId: BOT_DEVELOPER_ID, side: "ATK", hits: 6 });
    await expect(armHit({ warId: w.id, userId: BOT_DEVELOPER_ID, guildId: "g1", block: "docks" })).rejects.toThrow("You've used all 6 hits in this war.");
    expect(await balance(BOT_DEVELOPER_ID)).toBe(1_000_000);
  });

  it("a tester Boss gets no racket cycle early and no bid below the floor", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 1_000_000 });
    const f = await seedFamily({ bossId: BOT_DEVELOPER_ID, earnings: 9_000_000 });
    const r = await seedRacket("pawn_row", { ownerFamilyId: f.id, lastPayoutAt: new Date(Date.now() - 3600_000) });
    expect(await collectRacket(r.id, new Date(), 3)).toMatchObject({ status: "skipped", amount: 0 });
    await seedWar({ racketKey: "valet_racket", status: "BIDDING" });
    await expect(placeBid({ racketKey: "valet_racket", actorId: BOT_DEVELOPER_ID, amount: 2_099_999 })).rejects.toThrow("Bid at least the floor of 2,100,000.");
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.earnings).toBe(9_000_000);
  });
});
```

- [ ] **Step 2: Run them**

Run: `$VT test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts`
Expected: PASS. The static `isTester` scan in the tester file also passes with the new turf files.

- [ ] **Step 3: Commit**

```bash
git add test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts
git commit -m "test(turf): Redis outage and tester parity for scouting, hits, bids and ticks"
```

---

### Task 14: Turf docs

**Files:**
- Modify: `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md` (the "Crime Families" section plan 1 added, and the Money Sinks list)
- Create: `dashboard/public/art/cf-turf-map.png`, `dashboard/public/art/cf-war-banner.png` (byte copies of `src/assets/cf_turf_map.png` and `src/assets/cf_war_banner.png`)

**Interfaces:**
- Consumes: catalog and config values only. Every number in the docs is read off `RACKETS`, `RACKET_CLASSES`, `WAR_RULES`, `WAR_BLOCKS` and `CRIME_FAMILY_CONFIG` (the house docs rule: exhaustive, with exact numbers from source).
- Produces: website sections and a command entry. No runtime code.

- [ ] **Step 1: Write the docs**

- `crime-families.ts` sections:
  - "Rackets": spec 9.1 table, all 10 rows with key, class, income, floor, baseline, war window.
  - "How rackets pay": 9.2–9.3, no collection, the hourly tick, 3 racket-eligible members, neglect strikes and release, the 3-cycle banking cap.
  - "Bidding": the 9.4 bidding table, with floor 7 × income, raise `max(ceil(top × 1.10), top + 100,000)` with the 9.1M → 10.01M → 11.011M example, earnings only, the class levels, racket cap 1/2/3, one Crown, the 14-day pair rule.
  - "The Turf War": 60 minutes; the blocks and their approaches; 5-minute slots; scouting; hits at 25,000, a 600 s cooldown, 6 per war, 20 s to call; points 10/12; baselines 30/50/80; blackout in the last 10 minutes; ties to the defender; 2 of 3 wins; downtime cancels.
  - "Decay and caps": 9.5.
  - The XP rows "with Turf" in 10.2 become exact numbers.
  - The strategy section gains: a scouting rota per slot, calling weak points in chat, saving hits for the blackout, bid late but before the 1-hour close, keeping 3 racket-eligible members, and defending above the baseline only when the attacker is scoring.
- `forBeginners` gains `!turf` as a first command (plans 1 and 2 wrote `!crew` and `!caper`).
- `screenshot` stays plan 2's `/art/cf-caper-t4.png` (spec 19.3).
- `commands.ts`: a `turf` entry, with module `"economy"`, aliases `racket`/`rackets`, `jailBlocked: false`, `interactive: true` and `keyNumbers` Income 300,000 / 650,000 / 1,300,000 a day; Bid floor 2,100,000 – 9,100,000; Hit cost 25,000 (6 per war, 600 s apart); War length 60 minutes.
- `commands.ts` `!settings` (`:77-78` at `c45d257`; plan 2 rewrote the line): the "Account notices" `keyNumbers` value gains "turf wars" right after "caper lobby calls", so it still lists every account-group label in registry order.
- `FORTUNA_V2_ECONOMY.md`: table 9.1, the source S3 (6,400,000/day bot-wide) and sinks K9 and K10.
- Changelog: one entry, "Turf: 10 rackets, weekly bidding and turf wars".

- [ ] **Step 2: Type-check the dashboard**

Run: `cd dashboard && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/content/modules/crime-families.ts dashboard/src/content/commands.ts dashboard/src/app/changelog/page.tsx dashboard/public/art/cf-turf-map.png dashboard/public/art/cf-war-banner.png FORTUNA_V2_ECONOMY.md
git commit -m "docs(turf): rackets, bidding and turf war reference with exact numbers"
```

---

### Task 15: Full verification and the owner hand-off

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `$VT`
Expected: every file passes. Start the Redis container first, or the Redis-dependent suites fail for environmental reasons only.

- [ ] **Step 2: Static checks**

Run: `npx prisma validate && npm run typecheck && npm run validate:slash && npm run validate:app-emojis`
Expected: the schema is valid, there are no type errors, 73/100 slash commands are used, and 87 emojis validate without contacting Discord.

- [ ] **Step 3: Payload audit and tracked-file hygiene**

Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json && (grep -rn "isTester" src/services/crimeFamily || echo "no isTester")`
Expected: "All payloads within Discord limits", `emojis.json` unchanged, and "no isTester".

- [ ] **Step 4: Commit any fix-ups, then report the hand-off to the owner**

The hand-off goes in the final message, not in a file. It states:
- Deploy with `workflow_dispatch` and `run_schema: true`, because `prisma/` changed in Task 2, not in the last commit (spec 19.1). Rackets seed themselves at boot.
- `turfEnabled` stays `false`.
- Stage C is the owner's call after the spec 19.2 gate: 14 days of stage B and at least 4 families at L4+ (a read-only count). Flipping `turfEnabled: true` opens the first BIDDING windows within the next minute for every racket whose window is open, and `tickRackets` starts at the next `:05`.
- No emoji sync is needed beyond plan 1's `cf` family run.
- Turning turf off later cancels and refunds bids at close, and lets live wars finish (T1).

---

## Self-review notes (for the executor)

- **Spec coverage:**
  - 9.1 → Tasks 1, 2.
  - 9.2 → Task 6.
  - 9.3 → Tasks 3, 4, 10.
  - 9.4 bidding → Task 5; war and result → Tasks 6, 7; blackout → Task 8; downtime cancel → Task 6.
  - 9.5 → Tasks 4, 5, 6.
  - 6.4 turf blocks and disband side effects → Task 3.
  - 7.3 active rule → Task 3.
  - 10.2 turf XP and 10.4 Rackets sort → Tasks 3, 6.
  - 12.1 `war`/`racket` gates → Tasks 4, 7 (gates defined by plan 1).
  - 12.2 items 4(b) pair rule, 5 earnings-only bids, 6, 7 (no bids under investigation), 8, 9 (boards once a minute, hits 600 s apart), 11 → Tasks 5, 7, 9, 13 (turf slices; plans 1 and 2 own the rest of the cross-cutting items).
  - 13.1 `!turf` → Task 12.
  - 13.2 `turf:` → Tasks 8, 11.
  - 13.3 S16–S21, S25 war → Task 8.
  - 13.4 turf rows → Tasks 9, 10.
  - 14.1 turf models → Task 2.
  - 14.3 `cf:render:war` → Task 9.
  - 15 `tickWars`, `tickRackets`, `sweepWarHits`, `seedRackets` → Tasks 2, 10.
  - 17 edges 11–18, 28 (war-board repost, Task 9), 31, 32, 43–51, 58, 61, 62, 81, 82 → Tasks 3–10; the turf slices of edges 8 and 52 → Task 13.
  - 18 turf files → Tasks 1, 4–13.
  - 19.2 stage C → Tasks 1, 10, 15.
  - 19.3 turf docs → Task 14.
- **Deliberately not built:**
  - an in-process trailing render timer for boards (T7: the minute tick is the trailing render);
  - per-hit XP writes (T3);
  - a board jump link in the war-soon DM (T9: the board does not exist yet);
  - any emoji upload (owner-only; plan 1 already covers the turf icons).
- **Cross-plan names:** everything consumed from plan 1 is spelled as its Seams block spells it (`runFamilyTx`, `spendFromVault`, `creditEarnings`, `awardFamilyXp`, `writeLedger`, `checkMemberEligibility`, `eligibilityError`, `getMembership`, `requireMembership`, `listMembers`, `isUnderInvestigation`, `can`, `setNx`, `touchActivity`, `notifyMany`, `cfNoticeEmote`, `cfPayload`, `thumbSection`, `bannerGallery`, `buildOpener`, `buildNotice`, `sendToChannel`, `editChannelMessage`, `jumpLink`, `CfRouteTable`, `CF_SCHEDULES`, `crimeFamilyWorstCases`, `withCfConfig`, `seedEligibleUser`, `seedFamily`, `resetFamilies`, `ensureUniqueIndexes`, `daysAgo`). From plan 2: `addCrimeHeatTx`, `migrateLegacyHeatForUser`, and the `caper_lobby` DM type.
- **Plan 1 tests this plan edits:** `test/crimeFamily/progression.test.ts` (sorts, `rackets: 0`, the deleted pushed-hook case, Task 3) and the router's `turf` missing-entry copy (Task 11).
- **Plan 2 tests this plan edits:** `test/crimeFamily/scheduler.test.ts` (the pinned minute-entry job names gain `"sweepWarHits"`, Task 10) and `test/dm/family-notice.test.ts` (the 29/30 settings-panel case is deleted; `test/dm/turf-notice.test.ts` pins 30/31, Task 9).
