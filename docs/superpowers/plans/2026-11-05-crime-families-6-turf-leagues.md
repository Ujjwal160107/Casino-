# Crime Families 6: Turf Leagues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split turf into three leagues (Bronze L1–3, Silver L4–6, Gold L7–10), each with as many 10-racket cities as `max(1, ceil(active families / 40))`, placed and rebalanced by the daily census, with per-league racket income that keeps per-family and per-player income flat as the bot grows.

**Architecture:** A city is the old 10-racket map: `Racket` and `War` rows gain a `cityId`, `Racket.key` stops being unique (`@@unique([cityId, key])`), and every racket is addressed by its id or by `(cityId, key)`. League data and every league rule are pure (`TURF_LEAGUES`, `LEAGUE_RACKET_INCOME`, `leagueOf` in the catalog; `citiesFor`, `pickPlacementCity`, `planRebalance`, `nextCensusAt` in `leagueRules.ts`). The city map changes only inside the daily census: plan 4's `CENSUS_STEPS` registry gains three turf entries (cities, placement, rebalance), each a `runFamilyTx` per family or city with a CAS. The league-changing level-up plugs into the shipped `FAMILY_HOOKS` registry (`TURF_FAMILY_HOOK` gains `levelUpBlock`, `levelUpNotes`, `onLevelUp`), the way disband already handles turf, so `progression.ts` never learns about cities.

**Tech Stack:** TypeScript, discord.js 14.25 (ComponentsV2), Prisma 5.22 on MongoDB (replica set, interactive transactions), node-cron 4.2.1, vitest with mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-11-05-crime-families-scale-design.md` (the amendment; it wins where the two differ). Read sections 0 (A5, A22–A27, A43), 2.6, 6 (all of it), 7.4 (the turf rows), 10.1, 10.4, 10.5, 11.1, 12, 13 and Appendices A (`Family`, `Racket`, `War`, `TurfCity`) and B (`tickWars`, `runTurfCensus`, `seedTurf`). The old spec `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` still governs every turf rule the amendment does not mention (9.1–9.5 war mechanics, 13.3 S16–S21, 15). The code is the truth where it differs from either spec.

**Plan series and scope:** 1 Foundation → 2 Capers → 3 Turf (shipped) → 4 Families at scale (`docs/superpowers/plans/2026-11-05-crime-families-4-scale-families.md`) → 5 Global play (`docs/superpowers/plans/2026-11-05-crime-families-5-global-play.md`) → **6 Turf leagues (this plan)**. Plans 4 and 5 are executed before this one. This plan builds amendment §6, the league half of §2.6 (leaderboard), §10's league rows and §12's league rows, and nothing else: no sizes, Capos, vote, recruitment, sharding seams, cross-server play or relay. Line numbers below are against `main` at `9e8e472`; plans 4 and 5 edit most of these files (the rename, the REST seam, the census, the guild locks), so re-find each cited function by name before you edit it.

---

## Global Constraints

- `.env` `DATABASE_URL` is the LIVE player database. Never run `npm run dev`, `npm start`, `npm run seed`, `npx prisma db push`, `npx prisma studio`, any `sync:*-emojis` without `--dry-run`, or any `ts-node src/...` not listed here, and never read `.env`. Allowed: vitest, `npm run typecheck`, `npx prisma validate|format|generate` (no connection), `npm run validate:slash`, `npm run validate:app-emojis`, `npm run gen:pixel-assets -- --set cf --check`, and `checkV2Payloads.ts` only as `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- `$VT <files>` means `MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' <files>`. DB tests need Redis on 6381: `docker start casino-test-redis || docker run -d --rm --name casino-test-redis -p 6381:6379 redis:7-alpine`. Never run two vitest processes at once (they clobber `test/.mongo-uri`).
- Commit directly on `main`; never push (only the owner pushes, and a push deploys). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy gate: every `prisma/` change lands in Task 2 and nowhere else, so the owner deploys with `workflow_dispatch` and `run_schema: true`. Nothing is deployed in the family collections: dropping `Racket.key @unique` and adding `@@unique([cityId, key])` happen on empty collections, so no migration and no `--accept-data-loss`.
- **Copy rule (A8).** Player-visible text says "Crew Heist"/"crew heist(s)" and `!heist`; internal names keep "caper". New copy in this plan says "league", "city" and "census"; city names are exactly "Low Town #n", "Midtown #n", "Uptown #n" (A26) and league names "Bronze", "Silver", "Gold".
- `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` never change. `src/data/emojis.json` stays `{}`. No emoji upload and no new art: league icons reuse `crest_1`/`crest_2`/`crest_3` (A26), the city DMs reuse the `war` notice icon, S16 keeps the `turf_map` banner and the class icons `turf_corner|district|crown`.
- No module under `src/services/crimeFamily/` imports `isTester` (`test/anticheat/family-tester.test.ts` scans the folder). No tester bypass on any family, city or placement state.
- Every new filtered field is required with a default or sentinel: `Family.cityId ""`, `TurfCity.status "OPEN"`, `TurfCity.surplusDayKey ""`, `Racket.openedPeriodKey ""`. `Family.cityPlacedAt` is read only with `cityId ≠ ""`; `TurfCity.closedAt` only with `status "CLOSED"`. Nothing deployed lacks a new field, so no `isSet` guard is needed now; any later backfill filter on a nullable field needs `OR: [{ f: null }, { f: { isSet: false } }]` (`src/anticheat/claim.ts:59-84`).
- Every city, placement, move, racket-release and closure write runs in `runFamilyTx` (`src/services/crimeFamily/tx.ts:40`) behind a CAS (`updateMany` + `count === 1`) or a unique index, and gets a race test under `test/anticheat/`. Never catch a P2002 inside a transaction. The P2002s this plan maps, always outside the transaction: `TurfCity_league_number_key`, `Racket_cityId_key_key`, `War_racketId_periodKey_key`.
- Redis guards no money, uniqueness or placement; this plan adds no Redis key.
- Every UI is ComponentsV2 through `cfPayload` with `allowedMentions: { parse: [] }`, ≤ 40 components (50035 is swallowed by `src/index.ts`). Every new or changed screen and DM container gets a worst-case entry in `src/scripts/fixtures/{turfScreens,crimeFamilyScreens}.ts` whose `max` is the amendment's §6.8/§11.3 count (S16 20, S17 11, S8 6, S10 13).
- Every DM goes through `notifyMany` (`src/services/dmNoticeService.ts:315`) with type `turf`; no new DM type. Services never DM: census steps return `CensusNotice[]` (plan 4) and the job sends them through `announceCensusNotices`; the level-up DM is sent by the route after the commit.
- Every channel post or edit stays in `sendToChannel`/`editChannelMessage` (`src/ui/crimeFamily/post.ts`, REST-backed after plan 4 Task 3). New jobs are entries in plan 4's `CENSUS_STEPS` or `CF_SCHEDULES`, so they register only on the job shard (`startCrimeFamilyJobs`).
- Every number comes from `CRIME_FAMILY_CONFIG` (`src/utils/economyConfig.ts:200-268`), the catalog or `leagueRules.ts`; no literal in a service.
- `!turf` and `/turf` keep their names and options (slash stays at 73 of 100; the `/turf racket` choices stay the 10 keys). Vault amounts appear only on ephemeral screens (old D59).

## Review Focus

1. **Stale map buttons after a city change.** A member keeps an S16 drawn before the census moved the family, then picks a racket from its select or presses Bid on the S17 it opens. Expected: S17 opens that racket read-only with the line `**City:** Midtown #1 (Silver league)` (exact markdown; `said()` is the raw JSON payload) and the hint "This racket is in Midtown #1. Your family plays in Midtown #2."; a bid submitted from its modal is refused with the same line, nothing is debited. A `turf:city:<id>` press for a city that has since closed shows the viewer's own city instead. Tests: Task 2 (bid), Task 5 (pager).
2. **`!turf racket` and `!turf bid` with no city.** An unplaced family's officer types `!turf racket 9` and `!turf bid casino_row 9.1m`; a non-member types `!turf racket 9`. Expected: the racket resolves in the city the family would join (non-member: Low Town #1); the bid is refused with "Your family has no city yet: it gets one at the daily census once 3 members are active (next <t:…:R>)." and no earnings move. Test: Task 2.
3. **A level-up confirmed after turf changed.** S8 was opened while the family held no bid; the Boss then wins a top bid and presses Confirm on the old S8. Expected: "Finish your turf first: a family can't move up to the Silver league while it holds a top bid or fights in a turf war.", the level and vault are unchanged, no `level_fee` row. Test: Task 4.
4. **A census while turf is switched off.** `enabled: true`, `turfEnabled: false`. Expected: `activeMembers` is written (plan 4's step), but no city opens, closes or counts surplus, no family is placed or moved and no DM is sent; the first census after `turfEnabled` turns on places every active family. Test: Task 3.
5. **A reopened city's racket during this week's window.** A city closed (its BIDDING wars without a bid were CANCELLED) and reopens before those wars' start. Expected: S17 says "**Bidding:** closed, no bids this week · next window opens <t:…:R>" (never "open, no bids yet"), a bid is refused with "Bidding is not open for this racket.", and next week's window opens normally. Test: Task 3.

## Decisions this plan makes (not in the spec, or chosen where it is silent)

| # | Spec ref | Decision | Why |
|---|---|---|---|
| H1 | 6.3, 6.7 | Task 2 moves every racket lookup from `key` to `racketId` or `(cityId, key)` in one commit (schema, seed, war periods, bids, views, ids, `!turf`, test helpers) | The schema drops `Racket.key @unique` and the seed creates three cities; any interim key-only read would pick an arbitrary city's racket and war |
| H2 | 6.7 | Test helpers default to Uptown #1 (`GOLD`, number 1): `seedRacket(key, o)` and `seedWar(o)` create it on demand; `seedFamily` leaves `cityId ""` (as production does) and tests that bid place a family with `data: { cityId: (await turfCity()).id }` | Gold income equals the old `RACKETS` income (300k / 650k / 1.3M), so every existing income, floor and bid figure in plan 3's tests still holds |
| H3 | 6.8 | League buttons use a new id `turf:lg:<BRONZE\|SILVER\|GOLD>:<ownerId>` (≤ 32 characters), resolved at press time; a disabled ◀ or ▶ carries `turf:city:prev:<ownerId>` / `turf:city:next:<ownerId>` | With only `turf:city:<cityId>` the Gold button and ◀ (or both disabled arrows) can carry the same customId, which Discord rejects (50035, swallowed) |
| H4 | 6.6 | The league move is three optional `FamilyHook` methods implemented by `TURF_FAMILY_HOOK`: `levelUpBlock` (inside the level-up transaction, before the CAS), `onLevelUp` (after the fee; releases rackets, writes `league_move`, clears `cityId`, returns DM lines) and `levelUpNotes` (S8 lines) | Disband already reaches turf through `FAMILY_HOOKS` (`disbandService.ts:54-58`); `progression.ts` stays turf-agnostic and a later system adds an entry, not a branch |
| H5 | 6.9 | The league-move DM ("League move") goes to every member right after the level-up, naming the new league, the released rackets and the next census; the census placement that follows sends nothing | Until the census the family has no city to name (A23); 6.9 says first placement by the census sends nothing |
| H6 | 6.4 step 5, 6.10 edge 3, 6.11 | The rebalance stop rule is exactly A43's (`full − empty ≥ cityRebalanceSlack` and (`full > avg + slack` or `empty < avg − slack`)); for 41 Gold families it ends at Uptown #1 = 22, #2 = 19, and the race test pins that | §6.11's "20 or 21" contradicts A43's ±2 rule; A43 is the decision, and stopping at ±2 saves DMs and moves |
| H7 | 6.4 step 5 | New config key `cityRebalanceSlack: 2` | "No literal in a service"; §11.1 names `familiesPerCity` and `citySurplusDaysToClose` but the ±2 is a number too |
| H8 | 6.6 | `nextCensusAt(now)` = the next 00:10 UTC strictly after `now` (the first `10 * * * *` run of a UTC day, when `runTurfCensus` claims the day); a test ties it to the `CF_SCHEDULES` cron string | Every "next census <t:R>" line uses one pure function; a failed 00:10 run that reruns at 01:10 is shown an hour early, which is acceptable |
| H9 | 6.8 | The bid modal's title is "Place a bid" | The opener may do no I/O before `showModal` (plan 3's handler test), and `turf:modal:bid:<racketId>:<ownerId>` carries an id, not a name |
| H10 | 6.8 | `viewerCity(uid)`: a placed family's own city when its `cityId` names an OPEN city (no league check, as H18: placement and the level-up keep a family's city in its league, and H2's test families bid in Uptown #1 whatever their level); an unplaced family's `placementTarget` in its league (read-only); a non-member's Low Town #1. A pager press on an unknown or CLOSED city id renders the viewer's city | One resolver for `!turf`, S16, `!turf racket` and `!turf bid`; a stale button never errors |
| H11 | 6.3, A27 | City #1 of each league never closes (only the highest-numbered of ≥ 2 OPEN cities can close, and `target ≥ 1`), so Low Town #1 is always a valid default; `seedTurf` creates it at boot and views throw "The turf map is not ready yet." only before the first seed | Follows from A27; no fallback branch for a state the rules cannot produce |
| H12 | 6.3 | Surplus is counted on every OPEN city of the league by one `updateMany` guarded by `surplusDayKey ≠ today`, and reset on all of them at a census where `open ≤ target`; a reopened city starts at 0 | "open > target at 14 consecutive censuses" is a league fact; storing it on every open city lets the next-highest close at once if the surplus persists |
| H13 | 6.4, 6.6 | `src/services/crimeFamily/turfStake.ts` (a leaf) answers "does this family have turf at stake": rackets owned, top bids in BIDDING wars, sides of ARMED/ACTIVE/SETTLING wars; used by the hook, the rebalance and its in-transaction re-check | Only `extensions.ts` may import `turfHooks.ts` (T12), and the census and the hook must agree on one definition |
| H14 | 6.4 step 4 | The placement CAS also requires the family's level to be inside the league's range (`level: { gte, lte }`) | A league-changing level-up racing the placement leaves `cityId ""` either way, so without the level filter the stale placement would put a Silver family in Low Town |
| H15 | 6.8 | `soonestWar(now)` (pure, `warMath.ts`) replaces `getTurfMapView(now).nextWar` in `warCardScreen` (`src/handlers/turfInteractionHandler.ts:62`) | The weekly schedule is identical in every city; the war card needs no city lookup |
| H16 | 6.8 S17 | When the racket's War row for the upcoming period is CANCELLED while its window is open (a city reopened this week), `TurfRacketLine.bidding` reports `CLOSED` with next week's `nextOpensAt` | Otherwise S17 says "open, no bids yet" while every bid is refused (Review Focus 5) |
| H17 | 6.6 | Refusal copy: "Finish your turf first: a family can't move up to the <League> league while it holds a top bid or fights in a turf war." | The spec gives only the prefix |
| H18 | 6.6 | No league check in `bidBlockers`: the city check is enough, because placement (H14) and the level-up (which clears `cityId` in the same transaction) keep a family's city in its league | A guard for a state no write path produces (YAGNI) |
| H19 | 6.8 S16 | S16's header is `## <Turf> · Uptown #2 (Gold)` with a second line `-# Gold league rackets pay 300,000 / 650,000 / 1,300,000 a day (Corner / District / Crown). Win a racket's weekly war to take it.`; an unplaced family adds a third line with the census sentence | The spec's "income lines per league", in one existing text component (S16 stays at 20) |
| H20 | 12 | League copy goes into the changelog's v2.2 Turf entry (`dashboard/src/app/changelog/page.tsx:50-134`), not v2.1 (plan 4 Task 16 leaves leagues to this entry) | Amendment §12 names v2.1, but turf lives in the v2.2 entry |

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/services/crimeFamily/leagueRules.ts` | Pure league math: cities per league, which city a family joins, the rebalance plan, the next census time |
| `src/services/crimeFamily/turfStake.ts` | Whether a family has turf at stake (rackets, top bids, live wars), singly and in bulk |
| `src/services/crimeFamily/turfCities.ts` | The city map's rows: create or reopen a city with its 10 rackets, and the boot `seedTurf` |
| `src/services/crimeFamily/turfCensus.ts` | The three turf census steps: size each league's cities (open, surplus, close), place unplaced families, rebalance |
| Tests | `test/crimeFamily/league-math.test.ts`, `test/crimeFamily/turf-cities.test.ts`, `test/crimeFamily/turf-league-ui.test.ts`, `test/anticheat/turf-league.race.test.ts` |

**Modify:** `prisma/schema.prisma` (`Family :749-776`, `Racket :900-916`, `War :918-951`, `FamilyLedger` type comment), `src/utils/economyConfig.ts`, `src/data/crimeFamilyCatalog.ts` (`:178-212`, rackets and classes), `src/services/crimeFamily/{racketService,bidService,warService,warMath,turfQueries,turfHooks,turfLeaderboard,progression,vaultService,extensions,ledger,census,scheduler,views}.ts`, `src/services/dmNoticeService.ts`, `src/ui/crimeFamily/{ids,turfScreens,familyScreens,recruitScreens,turfAnnounce}.ts`, `src/handlers/{turfInteractionHandler,crewInteractionHandler}.ts`, `src/commands/economy/turf.ts`, `src/scripts/fixtures/{turfScreens,crimeFamilyScreens}.ts`, `test/helpers.ts` and the tests each task names, `src/commands/general/{help,tutorial}.ts`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md`.

## Interfaces consumed from plans 4 and 5 (exactly as they name them)

```ts
// plan 4 — src/services/crimeFamily/census.ts
export type CensusNotice = { type: DmNoticeType; userIds: string[]; build: (userId: string) => ContainerBuilder };
export interface CensusStep { key: string; run(now: Date): Promise<CensusNotice[] | void> }
export const CENSUS_STEPS: CensusStep[];        // [ACTIVE_MEMBERS_STEP]; this plan appends TURF_CENSUS_STEPS
export function runTurfCensus(now: Date): Promise<{ status: "ran" | "skipped"; notices: CensusNotice[] }>;
// plan 4 — src/ui/crimeFamily/announce.ts (reused unchanged) and the CF_SCHEDULES "10 * * * *" runTurfCensus entry
export function announceCensusNotices(client: Client, notices: CensusNotice[]): Promise<void>;
// plan 4 — src/services/crimeFamily/scheduler.ts (this plan swaps seedRackets → seedTurf inside it)
export function startCrimeFamilyJobs(client: Client): void;
// plan 4 — schema fields this plan reads: Family.activeMembers, Family.censusAt, Family.memberCount; CfJobRun
// plan 4 — test/helpers.ts: seedFamily({ ..., data?: Partial<Prisma.FamilyUncheckedCreateInput> })
// plan 4 — src/services/crimeFamily/ledger.ts: writeLedger(tx, row): Promise<string>
// plan 4 — src/handlers/crewRouteKit.ts: show, showThenAnnounce, notice
// plan 4 — src/ui/crimeFamily/recruitScreens.ts: buildBoard(v: BoardView), buildFamilyCard(v: FamilyCardView, note?) (F17: plan 6 appends the league)
// plan 5 — src/ui/crimeFamily/turfScreens.ts: export function warActionRow(warId: string) (unchanged here)
// plan 5 — src/services/dmNoticeService.ts: turfWarSoonNotice(v, row) carries warActionRow (unchanged here; the new turf notices sit beside it)
// plan 5 — src/services/crimeFamily/warActions.ts: scoutWar/armHit take no guild (unchanged here)
// plan 5 — src/data/crimeFamilyCatalog.ts: GateDef has no guild row (unchanged here; Task 2 edits only the racket blocks)
// plan 5 — docs: the cross-server war lines in help.ts, crime-families.ts, commands.ts, FORTUNA_V2_ECONOMY.md and the v2.2 changelog item (Task 6 keeps them)
```

## Interfaces this plan exports

```ts
// src/data/crimeFamilyCatalog.ts
export type LeagueKey = "BRONZE" | "SILVER" | "GOLD";
export interface LeagueDef { key: LeagueKey; name: "Bronze" | "Silver" | "Gold"; minLevel: number; maxLevel: number; cityName: "Low Town" | "Midtown" | "Uptown"; crestKey: "crest_1" | "crest_2" | "crest_3" }
export const TURF_LEAGUES: readonly LeagueDef[];                       // Bronze 1–3 Low Town crest_1; Silver 4–6 Midtown crest_2; Gold 7–10 Uptown crest_3
export const LEAGUE_RACKET_INCOME: Readonly<Record<LeagueKey, Readonly<Record<RacketClass, number>>>>;
export function leagueOf(level: number): LeagueDef;                    // throws "Unknown family level N" like levelDef
export function leagueDef(key: string): LeagueDef;                     // throws "Unknown league X"
export function cityLabel(league: string, number: number): string;    // "Uptown #2"
export interface RacketDef { key: string; name: string; class: RacketClass; warDow: number; warHourUtc: number }   // incomePerCycle removed (Task 2)
// RACKET_CLASSES entries lose minFamilyLevel (Task 2)

// src/services/crimeFamily/leagueRules.ts
export function citiesFor(activeFamilies: number): number;             // max(1, ceil(n / familiesPerCity 40))
export type CitySize = { cityId: string; number: number; size: number };
export function pickPlacementCity(cities: CitySize[]): CitySize | null; // fewest, ties to the lowest number
export type RebalanceFamily = { familyId: string; cityId: string; placedAt: Date; movable: boolean };
export type RebalanceMove = { familyId: string; from: string; to: string };
export function planRebalance(cities: { cityId: string; number: number }[], families: RebalanceFamily[]): RebalanceMove[];
export function nextCensusAt(now: Date): Date;                         // next 00:10 UTC strictly after now (H8)

// src/services/crimeFamily/turfStake.ts
export type TurfStake = { rackets: number; topBids: number; liveWars: number };
export function turfStake(db: Prisma.TransactionClient | PrismaClient, familyId: string): Promise<TurfStake>;
export function familiesWithStake(db: Prisma.TransactionClient | PrismaClient, cityIds: string[]): Promise<Set<string>>;

// src/services/crimeFamily/turfCities.ts
export function seedCityRackets(city: { id: string; league: string }): Promise<void>;   // upsert the 10 by [cityId, key]; never owner, timers, strikes, openedPeriodKey
export function ensureCity(league: LeagueKey, number: number): Promise<TurfCity>;        // upsert by [league, number] + seedCityRackets; P2002 retried once outside any tx
export function seedTurf(): Promise<void>;                             // city #1 per league, then seedCityRackets for every city

// src/services/crimeFamily/turfQueries.ts
export type TurfCityRef = { id: string; league: LeagueKey; number: number; label: string };
export type ViewerCity = { city: TurfCityRef; placed: boolean; family: { id: string; level: number } | null };
export const TURF_NOT_READY: string;                                   // "The turf map is not ready yet."
export function openCities(league?: LeagueKey): Promise<TurfCity[]>;  // OPEN, number asc
export function citySizes(cityIds: string[]): Promise<Map<string, number>>;   // placed families with activeMembers ≥ racketEligibleMin
export function placementTarget(league: LeagueKey): Promise<TurfCityRef>;
export function viewerCity(viewerId: string): Promise<ViewerCity>;    // H10
export function racketInCity(cityId: string, key: string): Promise<Racket | null>;
export function getTurfMapView(viewerId: string, cityId: string | null, now: Date): Promise<TurfMapView>;
export function getRacketDetailView(racketId: string, viewerId: string, now: Date): Promise<RacketDetailView>;

// src/services/crimeFamily/warMath.ts
export function bidFloor(r: { incomePerCycle: number }): number;      // reads the Racket row now
export function soonestWar(now: Date): { racketName: string; startsAt: Date };   // H15

// src/services/crimeFamily/bidService.ts
export function isObjectId(s: string): boolean;                       // /^[0-9a-f]{24}$/i, checked before any findUnique on an id from a customId
export function noCityLine(now: Date): string;                         // "Your family has no city yet: it gets one at the daily census once 3 members are active (next <t:…:R>)."
export interface BidContext { /* existing */ family: { id; level; duesArrears; homeChannelId; cityId: string } | null; familyCityLabel: string | null;
  racket: { id: string; ownerFamilyId: string; class: RacketClass; cityId: string; cityLabel: string; incomePerCycle: number } }
export function loadBidContext(db: Db, familyId: string | null, viewerId: string, racketId: string, now: Date): Promise<BidContext>;
export function placeBid(input: { racketId: string; actorId: string; amount: number; now?: Date }): Promise<BidResult>;   // BidResult gains racketId

// src/services/crimeFamily/turfCensus.ts
export function syncLeagueCities(league: LeagueKey, now: Date): Promise<{ target: number; opened: number[]; closed: number[]; cleared: string[] }>;   // cleared = families a closure unplaced
export function closeCityIfIdle(cityId: string, now: Date): Promise<{ closed: boolean; cleared: string[] }>;
export function placeUnplaced(league: LeagueKey, now: Date, only?: string[]): Promise<{ familyId: string; cityId: string }[]>;   // the placements that committed
export function rebalanceLeague(league: LeagueKey, now: Date): Promise<{ familyId: string; cityId: string }[]>;
export const TURF_CENSUS_STEPS: CensusStep[];                          // [turf_cities, turf_placement, turf_rebalance]

// src/services/crimeFamily/extensions.ts — FamilyHook gains
levelUpBlock?(db: Prisma.TransactionClient | PrismaClient, ctx: { familyId: string; from: number; to: number }): Promise<string | null>;
levelUpNotes?(familyId: string, ctx: { from: number; to: number; now: Date }): Promise<string[]>;
onLevelUp?(tx: Prisma.TransactionClient, ctx: { familyId: string; from: number; to: number; now: Date }): Promise<string[] | void>;

// src/services/crimeFamily/progression.ts
export type LevelUpResult = { family: Family; level: number; fee: number; fromTreasury: number; fromEarnings: number; notes: string[] };
export function levelUp(familyId: string, actorId: string, expectedLevel: number, now?: Date): Promise<LevelUpResult>;
export function levelUpPreview(family: Family, now: Date): Promise<{ next: FamilyLevelDef | null; blockers: string[]; notes: string[] }>;

// src/services/dmNoticeService.ts
export function turfCityMovedNotice(v: { cityLabel: string }): ContainerBuilder;
export function turfLeagueMoveNotice(v: { leagueName: string; lines: string[]; nextCensusAt: Date }): ContainerBuilder;

// src/ui/crimeFamily/ids.ts — TURF_IDS changes and additions
openRacket / bid / bidModal: (racketId: string, owner: string) => string;    // turf:open:racket:<racketId>:<owner> (≤ 62), turf:bid:… (≤ 54), turf:modal:bid:… (≤ 60)
city: (cityId: string, owner: string) => string;                        // turf:city:<cityId>:<owner> (≤ 55)
cityEdge: (edge: "prev" | "next", owner: string) => string;             // turf:city:<prev|next>:<owner>, only on a disabled arrow (H3)
league: (league: LeagueKey, owner: string) => string;                   // turf:lg:<league>:<owner> (H3)
// select(owner) unchanged; its option values become racket ids

// src/ui/crimeFamily/turfAnnounce.ts (next to the other turf DMs)
export function announceLevelUp(client: Client, familyId: string, from: number, to: number, notes: string[], now: Date): Promise<void>;   // never throws

// test/helpers.ts
export function seedTurfCity(o?: { league?: LeagueKey; number?: number; status?: "OPEN" | "CLOSED" }): Promise<TurfCity>;   // upsert; default GOLD 1 (H2)
export function turfCity(): Promise<TurfCity>;                         // seedTurfCity() with the defaults
export function seedRacket(key: string, o?: Partial<{ cityId: string; ownerFamilyId: string; lastPayoutAt: Date; capturedAt: Date; neglectStrikes: number }>): Promise<Racket>;
export function racketByKey(key: string, cityId?: string): Promise<Racket>;   // findUniqueOrThrow by [cityId ?? turfCity().id, key]
// SeedWarOpts gains cityId?: string (default: turfCity()); seedWar writes War.cityId; resetFamilies also empties turfCity
```

View types (`src/services/crimeFamily/views.ts`): `TurfRacketLine` gains `racketId: string` and `cityId: string` (its `income` is the row's); `TurfMapView` (Task 2 adds `city`, Task 5 `viewerLeague`, `status` and `nav`) becomes `{ city: TurfCityRef; viewerLeague: LeagueKey | null; status: string | null; nav: { prev: string | null; next: string | null }; rackets: TurfRacketLine[]; nextWar: { racketName: string; startsAt: Date } }`; `RacketDetailView` replaces `minFamilyLevel` with `city: TurfCityRef`; `VaultView.levelUp` gains `notes: string[]`; `LeaderboardView` rows are unchanged (the league is derived from `level` in the UI).

---
### Task 1: League data and the pure league rules

**Files:**
- Modify: `src/data/crimeFamilyCatalog.ts` (after `racketDef`, `:210-212`), `src/utils/economyConfig.ts` (`CRIME_FAMILY_CONFIG`, next to `racketEligibleMin`, `:251`)
- Create: `src/services/crimeFamily/leagueRules.ts`, `test/crimeFamily/league-math.test.ts`

**Interfaces:**
- Consumes: `FAMILY_LEVELS`, `RACKETS`, `RACKET_CLASSES`, `WAR_RULES.crownCap`, `CRIME_FAMILY_CONFIG.racketEligibleMin`.
- Produces: `LeagueKey`, `LeagueDef`, `TURF_LEAGUES`, `LEAGUE_RACKET_INCOME`, `leagueOf`, `leagueDef`, `cityLabel` (catalog); `citiesFor`, `CitySize`, `pickPlacementCity`, `RebalanceFamily`, `RebalanceMove`, `planRebalance`, `nextCensusAt` (`leagueRules.ts`); config keys `familiesPerCity: 40`, `citySurplusDaysToClose: 14`, `cityRebalanceSlack: 2` (H7). `RACKETS[*].incomePerCycle` and `RACKET_CLASSES[*].minFamilyLevel` stay until Task 2 replaces their readers.
  - `TURF_LEAGUES` (A26): `{ key: "BRONZE", name: "Bronze", minLevel: 1, maxLevel: 3, cityName: "Low Town", crestKey: "crest_1" }`, `{ key: "SILVER", name: "Silver", minLevel: 4, maxLevel: 6, cityName: "Midtown", crestKey: "crest_2" }`, `{ key: "GOLD", name: "Gold", minLevel: 7, maxLevel: 10, cityName: "Uptown", crestKey: "crest_3" }`.
  - `LEAGUE_RACKET_INCOME` (A25): `BRONZE { CORNER: 100_000, DISTRICT: 200_000, CROWN: 300_000 }`, `SILVER { CORNER: 200_000, DISTRICT: 450_000, CROWN: 850_000 }`, `GOLD { CORNER: 300_000, DISTRICT: 650_000, CROWN: 1_300_000 }`.
  - `cityLabel(league, n)` = `` `${leagueDef(league).cityName} #${n}` ``.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/league-math.test.ts
import { describe, it, expect } from "vitest";
import { FAMILY_LEVELS, LEAGUE_RACKET_INCOME, RACKETS, TURF_LEAGUES, WAR_RULES, cityLabel, leagueDef, leagueOf, type RacketClass } from "../../src/data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG as C } from "../../src/utils/economyConfig";
import { citiesFor, nextCensusAt, pickPlacementCity, planRebalance, type RebalanceFamily } from "../../src/services/crimeFamily/leagueRules";
import { CF_SCHEDULES } from "../../src/services/crimeFamily/scheduler";

const t = (iso: string) => new Date(iso);
/** n families in one city, placed one minute apart (index 0 oldest). */
const fams = (cityId: string, n: number, movable = true, from = 0): RebalanceFamily[] =>
  Array.from({ length: n }, (_, i) => ({ familyId: `${cityId}-${from + i}`, cityId, placedAt: new Date(Date.UTC(2026, 10, 1, 0, from + i)), movable }));
const sizes = (cities: string[], f: RebalanceFamily[], moves: { familyId: string; to: string }[]) => {
  const at = new Map(f.map((x) => [x.familyId, x.cityId]));
  for (const m of moves) at.set(m.familyId, m.to);
  return cities.map((c) => [...at.values()].filter((v) => v === c).length);
};

describe("leagues (A5, A25, A26)", () => {
  it("maps levels 1–10 onto Bronze, Silver and Gold", () => {
    expect(FAMILY_LEVELS.map((l) => leagueOf(l.level).key)).toEqual(["BRONZE", "BRONZE", "BRONZE", "SILVER", "SILVER", "SILVER", "GOLD", "GOLD", "GOLD", "GOLD"]);
    expect(() => leagueOf(11)).toThrow("Unknown family level 11");
    expect(TURF_LEAGUES.map((l) => [l.cityName, l.crestKey])).toEqual([["Low Town", "crest_1"], ["Midtown", "crest_2"], ["Uptown", "crest_3"]]);
    expect(cityLabel("GOLD", 2)).toBe("Uptown #2");
    expect(() => leagueDef("PLATINUM")).toThrow("Unknown league PLATINUM");
  });

  it("each league's city pays 1.8M / 4.3M / 6.4M a day", () => {
    const cityTotal = (k: keyof typeof LEAGUE_RACKET_INCOME) => RACKETS.reduce((s, r) => s + LEAGUE_RACKET_INCOME[k][r.class as RacketClass], 0);
    expect([cityTotal("BRONZE"), cityTotal("SILVER"), cityTotal("GOLD")]).toEqual([1_800_000, 4_300_000, 6_400_000]);
  });

  it("each league's best holding equals the old maximum at its levels: 300k, 1.3M, 2.6M", () => {
    const best = (lg: (typeof TURF_LEAGUES)[number]) => {
      const cap = FAMILY_LEVELS.find((l) => l.level === lg.maxLevel)!.racketCap;
      const inc = LEAGUE_RACKET_INCOME[lg.key];
      const crowns = Math.min(WAR_RULES.crownCap, cap);
      return crowns * inc.CROWN + (cap - crowns) * Math.max(inc.DISTRICT, inc.CORNER);
    };
    expect(TURF_LEAGUES.map(best)).toEqual([300_000, 1_300_000, 2_600_000]);
  });
});

describe("cities and placement (6.3, 6.4)", () => {
  it.each([[0, 1], [1, 1], [40, 1], [41, 2], [80, 2], [81, 3], [4000, 100]])("citiesFor(%i) = %i", (n, want) => expect(citiesFor(n)).toBe(want));

  it("places into the emptiest city, ties to the lowest number; none when no city is open", () => {
    expect(pickPlacementCity([{ cityId: "a", number: 1, size: 5 }, { cityId: "b", number: 2, size: 3 }, { cityId: "c", number: 3, size: 3 }])?.cityId).toBe("b");
    expect(pickPlacementCity([])).toBeNull();
  });

  it("the next census is the next 00:10 UTC (H8), matching the census cron", () => {
    expect(nextCensusAt(t("2026-11-06T00:05:00Z"))).toEqual(t("2026-11-06T00:10:00Z"));
    expect(nextCensusAt(t("2026-11-06T00:10:00Z"))).toEqual(t("2026-11-07T00:10:00Z"));
    expect(nextCensusAt(t("2026-11-06T13:00:00Z"))).toEqual(t("2026-11-07T00:10:00Z"));
    expect(CF_SCHEDULES.find((s) => s.jobs.some((j) => j.name === "runTurfCensus"))?.cron).toBe("10 * * * *");
  });
});

describe("rebalance (A43, H6)", () => {
  const two = [{ cityId: "u1", number: 1 }, { cityId: "u2", number: 2 }];

  it("41 families in two cities end at 22 / 19, moving the most recently placed", () => {
    const f = [...fams("u1", 40), ...fams("u2", 1, true, 40)];
    const moves = planRebalance(two, f);
    expect(sizes(["u1", "u2"], f, moves)).toEqual([22, 19]);
    expect(moves.map((m) => m.familyId)).toEqual(Array.from({ length: 18 }, (_, i) => `u1-${39 - i}`));
    expect(moves.every((m) => m.from === "u1" && m.to === "u2")).toBe(true);
  });

  it("never moves a family with turf at stake; a full city of them stays full", () => {
    expect(planRebalance(two, [...fams("u1", 30, false), ...fams("u2", 0)])).toEqual([]);
    const f = [...fams("u1", 28, false), ...fams("u1", 2, true, 28)];
    expect(sizes(["u1", "u2"], f, planRebalance(two, f))).toEqual([28, 2]);
  });

  it("stops with every city within ±slack of the average, or with no movable family left above it", () => {
    const three = [...two, { cityId: "u3", number: 3 }];
    for (const [a, b, c] of [[60, 0, 0], [45, 30, 5], [10, 10, 11], [0, 0, 7]]) {
      const f = [...fams("u1", a), ...fams("u2", b, true, 100), ...fams("u3", c, true, 200)];
      const out = sizes(["u1", "u2", "u3"], f, planRebalance(three, f));
      const avg = (a + b + c) / 3;
      expect(out.reduce((s, x) => s + x, 0)).toBe(a + b + c);
      expect(Math.max(...out) - Math.min(...out) < C.cityRebalanceSlack || out.every((x) => Math.abs(x - avg) <= C.cityRebalanceSlack)).toBe(true);
    }
  });

  it("adds the league config keys", () => {
    expect(C).toMatchObject({ familiesPerCity: 40, citySurplusDaysToClose: 14, cityRebalanceSlack: 2 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/league-math.test.ts`
Expected: FAIL: `leagueRules` does not exist and `leagueOf` is not exported.

- [ ] **Step 3: Add the catalog entries and config keys**

Per Interfaces, in the catalog's "Rackets (9.1)" block after `racketDef`, with a `// ── Leagues (amendment 6.2, 6.5) ──` header. `leagueOf` finds the league whose `[minLevel, maxLevel]` holds `level` and otherwise throws `Unknown family level ${level}` (the `levelDef` message).

- [ ] **Step 4: Implement `leagueRules.ts`**

Header comment: "Pure league math (amendment 6.3–6.4): how many cities a league needs, which city a family joins, the rebalance plan and the next census. No I/O." Imports only `CRIME_FAMILY_CONFIG`.
- `citiesFor(n)` = `Math.max(1, Math.ceil(n / familiesPerCity))`.
- `pickPlacementCity` sorts a copy by `size` asc then `number` asc.
- `planRebalance` throws `cityRebalanceSlack must be at least 2` when the key is below 2 (a gap of 1 would swap one family back and forth forever).
- `nextCensusAt(now)`: `Date.UTC(y, m, d, 0, 10)` of `now`'s UTC day; if that is `≤ now`, the same time one day later.
- `planRebalance(cities, families)` simulates on copies and returns the moves in order; it never mutates its input. `families` holds only placed active families of OPEN cities of one league:

```ts
const s = cityRebalanceSlack;
const avg = families.length / cities.length;
// each city's families, newest placement first
loop:
  empty = city with fewest families (ties: lowest number)
  full  = city with most families among those holding a movable family (ties: highest number); none → stop
  if (size(full) - size(empty) < s || !(size(full) > avg + s || size(empty) < avg - s)) stop
  move full's most recently placed movable family to empty: push { familyId, from: full, to: empty }; it becomes empty's newest
```
The loop ends because each move lowers the sum of squared city sizes (a gap of at least 2 closes by 2).

- [ ] **Step 5: Run the test to verify it passes**

Run: `$VT test/crimeFamily/league-math.test.ts test/crimeFamily/catalog.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/crimeFamilyCatalog.ts src/utils/economyConfig.ts src/services/crimeFamily/leagueRules.ts test/crimeFamily/league-math.test.ts
git commit -m "feat(turf): league data, per-league racket income and the pure league rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cities: the schema, the seed, per-city war periods, and every racket addressed by its city

One commit (H1). After it, each league has city #1 with its 10 rackets at the league's income, wars open per city once per racket per week, a family bids only in its own city, and every turf id, view and command names a racket by id. Nothing places a family yet (Task 3), so outside tests no family can bid: turf is behind `turfEnabled` anyway.

**Files:**
- Modify:
  - `prisma/schema.prisma`: `Family` (`:749-776`) gains `cityId String @default("") // "" = unplaced (sentinel); set only by the census`, `cityPlacedAt DateTime @default(now()) // rewritten at every placement or move; read only with cityId ≠ ""`, `@@index([cityId])`, `@@index([level, activeMembers])`; `Racket` (`:900-916`): `key` loses `@unique`, adds `cityId String @db.ObjectId`, `league String // BRONZE|SILVER|GOLD, the city's`, `openedPeriodKey String @default("") // periodKey of the last War opened for it (one write per week)`, `@@unique([cityId, key])`, `@@index([cityId])`, `@@index([key, openedPeriodKey])`; `War` (`:918-951`) adds `cityId String @db.ObjectId // the racket's, written at upsert` and `@@index([cityId, status])`; new `model TurfCity` exactly as amendment §6.7; the `FamilyLedger.type` comment gains `league_move` (Task 4 writes it).
  - `src/data/crimeFamilyCatalog.ts:182-207`: `RacketDef` and `RACKETS` lose `incomePerCycle`; `RACKET_CLASSES` loses `minFamilyLevel` (A25).
  - `src/services/crimeFamily/racketService.ts:1-33`: `upsertRacket` and `seedRackets` go (replaced by `turfCities.ts`); header comment says "resolve racket keys, count racket-eligible members and collect one racket's due cycles".
  - `src/services/crimeFamily/scheduler.ts` (`startCrimeFamilyJobs`, plan 4 F14): `seedRackets()` → `seedTurf()` with the log tag `[crimeFamily] seedTurf error`.
  - `src/services/crimeFamily/warService.ts:36-57`: `openWarPeriods` per Interfaces below.
  - `src/services/crimeFamily/warMath.ts:115-117`: `bidFloor(r: { incomePerCycle: number })`; add `soonestWar` (H15).
  - `src/services/crimeFamily/bidService.ts` (`BidContext` `:17-29`, `BidResult` `:31-34`, `bidBlockers` `:48-67` with the class line at `:57-58`, `loadBidContext` `:122-160`, `placeBid` `:164-212` with the floor read at `:168`): `BidContext`, `bidBlockers`, `loadBidContext`, `placeBid`, `noCityLine`, `BidResult.racketId`.
  - `src/services/crimeFamily/turfQueries.ts`: the city reads, `racketLines(cityId, …)`, `getTurfMapView(viewerId, cityId, now)`, `getRacketDetailView(racketId, …)`.
  - `src/services/crimeFamily/views.ts:178-210`: `TurfRacketLine` gains `racketId`, `cityId`; `TurfMapView` gains `city: TurfCityRef`; `RacketDetailView.minFamilyLevel` → `city: TurfCityRef`.
  - `src/ui/crimeFamily/ids.ts:84-87`: `openRacket`, `bid`, `bidModal` take `racketId`.
  - `src/ui/crimeFamily/turfScreens.ts`: S16 group headers are just `**Corner**`/`**District**`/`**Crown**` (`:51-55`), select option values are `line.racketId` (`:74`); S17's last detail line (`:116`) is `` `**City:** ${v.city.label} (${leagueDef(v.city.league).name} league)` ``, its Bid id is `TURF_IDS.bid(line.racketId, ownerId)` and its Back is `TURF_IDS.viewMap(ownerId)` (unchanged until Task 5); `buildBidModal(racketId, ownerId)` with title "Place a bid" (H9).
  - `src/handlers/turfInteractionHandler.ts`: `racketScreen(uid, racketId, note)`; `v:map` calls `getTurfMapView(i.user.id, null, now)`; `sel`, `open:racket`, `bid`, `modal:bid` read a racket id; `bidSubmitRoute` calls `placeBid({ racketId, … })`; `warCardScreen` uses `soonestWar(now)` (`:62`).
  - `src/commands/economy/turf.ts:35-61`: `map` → `getTurfMapView(ctx.uid, null, now)`; `racket` and `bid` resolve the key with `racketOf` (unchanged) and then `racketInCity((await viewerCity(ctx.uid)).city.id, def.key)` (null → `FamilyError(TURF_NOT_READY)`); `bid` calls `placeBid({ racketId: r.id, … })`.
  - `src/scripts/fixtures/turfScreens.ts:23-42`: `line(i)` takes `income: LEAGUE_RACKET_INCOME.GOLD[r.class]`, `racketId: \`65f0000000000000000001${String(i).padStart(2, "0")}\``, `cityId: CITY.id`; `mapView()` gains `city: CITY`; `detailView()` replaces `minFamilyLevel: 4` with `city: CITY`, where `CITY = { id: "65f0000000000000000000c1", league: "GOLD", number: 999, label: "Uptown #999" }`; `max` values unchanged here.
  - `test/helpers.ts`: per Interfaces (`seedTurfCity`, `turfCity`, `seedRacket`, `seedWar`, `racketByKey`), and `resetFamilies` also empties `turfCity` (after `racket`).
  - Tests that address rackets by key (H2 keeps their figures): `test/crimeFamily/{racket-seed,turf-jobs,turf-views,turf-command,turf-handlers,turf-hooks,turf-layout,catalog,ids-post,sharding}.test.ts`, `test/anticheat/{turf-bid,turf-war,racket-tick}.race.test.ts`, `test/anticheat/{family-redis-down,family-tester}.test.ts`, `test/router/crew-jail.test.ts`.
- Create: `src/services/crimeFamily/turfCities.ts`, `test/crimeFamily/turf-cities.test.ts`

**Interfaces:**
- Consumes: Task 1's catalog and `nextCensusAt`; plan 4's `startCrimeFamilyJobs`, `seedFamily({ data })`.
- Produces (signatures in the top Interfaces block): `seedCityRackets`, `ensureCity`, `seedTurf`; `TurfCityRef`, `ViewerCity`, `TURF_NOT_READY`, `openCities`, `citySizes`, `placementTarget`, `viewerCity`, `racketInCity`, `getTurfMapView`, `getRacketDetailView`; `bidFloor(row)`, `soonestWar`; `noCityLine`, the city-aware `BidContext`/`loadBidContext`/`placeBid`; the renamed `TURF_IDS`; the helpers. Details:
  - `seedCityRackets(city)`: for each `RACKETS` def, `racket.upsert({ where: { cityId_key: { cityId: city.id, key } }, create: { cityId, key, ...def }, update: def })` with `def = { name, class, league: city.league, incomePerCycle: LEAGUE_RACKET_INCOME[league][class], baseDefense: RACKET_CLASSES[class].baseline, warDow, warHourUtc }`; a P2002 (no transaction is open) is caught and the upsert run once more (the old `seedRackets` pattern).
  - `ensureCity(league, number)`: `turfCity.upsert({ where: { league_number: { league, number } }, create: { league, number }, update: {} })` (P2002 retried once), then `seedCityRackets`; returns the city.
  - `seedTurf()`: `ensureCity(key, 1)` for each `TURF_LEAGUES` entry, then `seedCityRackets` for every other `TurfCity` row (OPEN or CLOSED, so a reopened city's definitions are current).
  - `openWarPeriods(now)`: reads the OPEN city ids once (`turfCity.findMany({ where: { status: "OPEN" } })`); per `RACKETS` def: `startsAt = nextWarStart(def, now)`, skip unless `bidPhase(...).phase === "OPEN"`, `w = warWindow(startsAt)`; `racket.findMany({ where: { key: def.key, cityId: { in: open }, openedPeriodKey: { not: w.periodKey } } })`; for each: the existing `war.upsert` with `create: { racketId, racketKey, cityId: r.cityId, ...w }` (P2002 ignored), then `racket.updateMany({ where: { id: r.id, openedPeriodKey: { not: w.periodKey } }, data: { openedPeriodKey: w.periodKey } })`.
  - `soonestWar(now)`: the `RACKETS` def with the smallest `nextWarStart(def, now)`, as `{ racketName, startsAt }`.
  - `noCityLine(now)` = `` `Your family has no city yet: it gets one at the daily census once ${racketEligibleMin} members are active (next <t:${unix(nextCensusAt(now))}:R>).` ``
  - `bidBlockers(ctx)`: after the not-in-family return and before every existing check: `family.cityId === ""` → `noCityLine(ctx.now)`; else `family.cityId !== racket.cityId` → `` `This racket is in ${racket.cityLabel}. Your family plays in ${ctx.familyCityLabel}.` ``. The class-level line (`:57-58`) goes; no league check (H18).
  - `loadBidContext(db, familyId, viewerId, racketId, now)`: the racket by id (`id, key, class, cityId, league, incomePerCycle, ownerFamilyId`; a missing row or a non-ObjectId id → `FamilyError("Unknown racket.")`), its city's label, the war `findFirst({ where: { racketId, status: "BIDDING", bidClosesAt: { gt: now } } })`, the family's `cityId` in the `family` select, and `familyCityLabel` (the family's city's label when `cityId ≠ ""`, else null). Reads stay sequential (one session).
  - `placeBid({ racketId, actorId, amount, now })`: `floor = bidFloor(ctx.racket)` read inside the transaction (the `const floor = bidFloor(def)` at `:168` moves after `loadBidContext`); escrow and ledger meta keep `racketKey: ctx.racket.key`; `BidResult` gains `racketId`.
  - `openCities(league?)`: `turfCity.findMany({ where: { status: "OPEN", ...(league ? { league } : {}) }, orderBy: { number: "asc" } })`.
  - `citySizes(cityIds)`: `family.groupBy({ by: ["cityId"], where: { cityId: { in: cityIds }, activeMembers: { gte: racketEligibleMin } }, _count: { _all: true } })`, with every asked id present (0 when absent).
  - `placementTarget(league)`: `pickPlacementCity` over `openCities(league)` and `citySizes`; none open → `FamilyError(TURF_NOT_READY)`.
  - `viewerCity(uid)` (H10): the member's family `{ id, level, cityId }`; its city when `cityId` names an OPEN city, with no league check (H18; `placed: true`); otherwise `placementTarget(leagueOf(level).key)` (`placed: false`); a non-member gets `turfCity.findUnique({ where: { league_number: { league: "BRONZE", number: 1 } } })` (`placed: false`, `family: null`; missing → `TURF_NOT_READY`).
  - `racketLines(cityId, now, racketIds?)`: rows `racket.findMany({ where: { cityId, …ids } })` sorted in `RACKETS` order; live wars `war.findMany({ where: { cityId, status: { in: LIVE_STATUSES }, …ids as racketId } })`, latest per `racketId`; `income: row.incomePerCycle`. The "no row yet renders as the Street" fallback goes (a city is always created with its 10 rows).
  - `getTurfMapView(viewerId, cityId, now)`: the asked city when `cityId` is an ObjectId of an OPEN city, else `viewerCity(viewerId).city`; `{ city, rackets: racketLines(city.id, now), nextWar: soonestWar(now) }`.
  - `getRacketDetailView(racketId, viewerId, now)`: as today, from `loadBidContext(prisma, …, racketId, now)`, `racketLines(racket.cityId, now, [racketId])`, `floor = bidFloor(racket)`, and `city` (the racket's).
  - `isObjectId(s)` = `/^[0-9a-f]{24}$/i.test(s)`, exported from `bidService.ts` (which `turfQueries.ts` already imports) and used by both before any `findUnique` on an id from a customId (Prisma throws on a malformed ObjectId).
  - Test helpers: `seedTurfCity({ league = "GOLD", number = 1, status = "OPEN" })` upserts by `[league, number]` and sets `status`; `turfCity()` = `seedTurfCity()`; `seedRacket(key, o)` upserts by `[cityId, key]` in `o.cityId ?? (await turfCity()).id` with that city's league income (overrides apply on create and update, `cityId` excluded from the data); `seedWar(o)` finds or seeds the racket in `o.cityId ?? turfCity()` and writes `cityId`; `racketByKey(key, cityId?)` = `racket.findUniqueOrThrow({ where: { cityId_key: { cityId: cityId ?? (await turfCity()).id, key } } })`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/turf-cities.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { ensureCity, seedCityRackets, seedTurf } from "../../src/services/crimeFamily/turfCities";
import { openWarPeriods } from "../../src/services/crimeFamily/warService";
import { getTurfMapView, viewerCity } from "../../src/services/crimeFamily/turfQueries";
import { nextWarStart } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import { testPrisma, seedEligibleUser, seedFamily, seedTurfCity, resetFamilies, ensureUniqueIndexes } from "../helpers";

const H = 3600_000;
beforeAll(() => ensureUniqueIndexes(["TurfCity", "Racket", "War", "Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("seedTurf (amendment 6.3, Appendix B)", () => {
  it("creates city #1 of each league with its 10 rackets at the league's income, all with the Street", async () => {
    await seedTurf();
    const cities = await testPrisma.turfCity.findMany({ orderBy: { league: "asc" } });
    expect(cities.map((c) => [c.league, c.number, c.status])).toEqual([["BRONZE", 1, "OPEN"], ["GOLD", 1, "OPEN"], ["SILVER", 1, "OPEN"]]);
    for (const [league, total] of [["BRONZE", 1_800_000], ["SILVER", 4_300_000], ["GOLD", 6_400_000]] as const) {
      const city = cities.find((c) => c.league === league)!;
      const rows = await testPrisma.racket.findMany({ where: { cityId: city.id } });
      expect(rows).toHaveLength(10);
      expect(rows.reduce((s, r) => s + r.incomePerCycle, 0)).toBe(total);
      expect(rows.every((r) => r.league === league && r.ownerFamilyId === "" && r.openedPeriodKey === "")).toBe(true);
    }
  });

  it("a rerun (twice at once) updates definitions but never ownership, timers, strikes or the opened period", async () => {
    await seedTurf();
    const gold = await testPrisma.turfCity.findUniqueOrThrow({ where: { league_number: { league: "GOLD", number: 1 } } });
    const when = new Date("2026-10-01T00:00:00Z");
    const where = { cityId_key: { cityId: gold.id, key: "pawn_row" } };
    await testPrisma.racket.update({ where, data: { ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2, openedPeriodKey: "2026-W40", name: "Old Name", incomePerCycle: 1 } });
    await Promise.all([seedTurf(), seedTurf()]);
    expect(await testPrisma.racket.count()).toBe(30);
    expect(await testPrisma.racket.findUnique({ where })).toMatchObject({
      name: "Pawn Row Fencing", incomePerCycle: 300_000, ownerFamilyId: "65f000000000000000000001", lastPayoutAt: when, capturedAt: when, neglectStrikes: 2, openedPeriodKey: "2026-W40",
    });
  });

  it("ensureCity twice at once makes one city with one set of rackets", async () => {
    await Promise.all([ensureCity("SILVER", 2), ensureCity("SILVER", 2)]);
    const c = await testPrisma.turfCity.findMany({ where: { league: "SILVER", number: 2 } });
    expect(c).toHaveLength(1);
    expect(await testPrisma.racket.count({ where: { cityId: c[0].id } })).toBe(10);
  });
});

describe("openWarPeriods per city (6.7)", () => {
  it("opens each racket's war once per week in every OPEN city and none in a CLOSED one", async () => {
    await seedTurf();
    const closed = await seedTurfCity({ league: "GOLD", number: 2, status: "CLOSED" });
    await seedCityRackets(closed);
    const valet = racketDef("valet_racket")!;
    const inWindow = new Date(+nextWarStart(valet, new Date(Date.now() + 73 * H)) - 48 * H);
    const upsert = vi.spyOn(prisma.war, "upsert");
    await openWarPeriods(inWindow);
    const valetUpserts = upsert.mock.calls.filter(([a]) => a.create.racketKey === "valet_racket").length;
    expect(valetUpserts).toBe(3);
    await openWarPeriods(new Date(+inWindow + 60_000));
    expect(upsert.mock.calls.filter(([a]) => a.create.racketKey === "valet_racket").length).toBe(3);   // second tick writes nothing
    upsert.mockRestore();
    const wars = await testPrisma.war.findMany({ where: { racketKey: "valet_racket" } });
    expect(wars).toHaveLength(3);
    expect(wars.some((w) => w.cityId === closed.id)).toBe(false);
    const rows = await testPrisma.racket.findMany({ where: { key: "valet_racket", cityId: { not: closed.id } } });
    expect(rows.every((r) => r.openedPeriodKey === wars[0].periodKey)).toBe(true);
  });
});

describe("the viewer's city (H10)", () => {
  it("a placed family sees its city; an unplaced one the city it would join; a non-member Low Town #1", async () => {
    await seedTurf();
    const s2 = await ensureCity("SILVER", 2);
    const placed = await seedEligibleUser(); const unplaced = await seedEligibleUser(); const stranger = await seedEligibleUser();
    await seedFamily({ bossId: placed, level: 5, data: { cityId: s2.id, activeMembers: 3 } });
    for (let k = 0; k < 2; k++) await seedFamily({ bossId: await seedEligibleUser(), level: 4, data: { cityId: (await testPrisma.turfCity.findFirstOrThrow({ where: { league: "SILVER", number: 1 } })).id, activeMembers: 3 } });
    await seedFamily({ bossId: unplaced, level: 6 });
    expect(await viewerCity(placed)).toMatchObject({ placed: true, city: { id: s2.id, label: "Midtown #2" } });
    expect(await viewerCity(unplaced)).toMatchObject({ placed: false, city: { id: s2.id } });   // #2 holds 1 active family, #1 holds 2
    expect(await viewerCity(stranger)).toMatchObject({ placed: false, family: null, city: { league: "BRONZE", number: 1, label: "Low Town #1" } });
    const view = await getTurfMapView(stranger, null, new Date());
    expect(view.city.label).toBe("Low Town #1");
    expect(view.rackets.map((r) => r.income)).toEqual(view.rackets.map((r) => ({ CORNER: 100_000, DISTRICT: 200_000, CROWN: 300_000 })[r.class]));
  });
});
```

In `test/anticheat/turf-bid.race.test.ts`: `bidder()` passes `data: { cityId: (await turfCity()).id }` to `seedFamily`; `bid(actorId, amount, key = "docks_numbers", cityId?: string)` becomes `placeBid({ racketId: (await seedRacket(key, cityId ? { cityId } : {})).id, actorId, amount })` (`seedRacket` with no owner override re-upserts the definition only). Replace the class-level case (`:76-77`) with:

```ts
  it("a family bids only in its own city; an unplaced family is told when the census runs (6.6)", async () => {
    const home = await bidder({ earnings: 50_000_000, level: 3 });
    await seedWar({ racketKey: "harbor_customs", status: "BIDDING" });
    expect(await bid(home.boss, 4_550_000, "harbor_customs")).toMatchObject({ amount: 4_550_000 });   // no class gate inside a city (A25)
    const away = await bidder({ earnings: 50_000_000 });
    const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
    await testPrisma.family.update({ where: { id: away.f.id }, data: { cityId: u2.id } });
    await expect(bid(away.boss, 2_100_000)).rejects.toThrow("This racket is in Uptown #1. Your family plays in Uptown #2.");
    const none = await bidder({ earnings: 50_000_000 });
    await testPrisma.family.update({ where: { id: none.f.id }, data: { cityId: "" } });
    await expect(bid(none.boss, 2_100_000)).rejects.toThrow(/^Your family has no city yet: it gets one at the daily census once 3 members are active \(next <t:\d+:R>\)\.$/);
    expect((await fam(none.f.id))!.earnings).toBe(50_000_000);
  });

  it("two families in different cities bid on the same key: two rackets, two wars, both bids stand (edge 10)", async () => {
    const a = await bidder({ earnings: 5_000_000 }); const b = await bidder({ earnings: 5_000_000 });
    const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
    await testPrisma.family.update({ where: { id: b.f.id }, data: { cityId: u2.id } });
    const w1 = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
    const w2 = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: u2.id });
    await Promise.all([bid(a.boss, 2_100_000), bid(b.boss, 2_100_000, "docks_numbers", u2.id)]);
    expect([(await war(w1.id))!.topBidderFamilyId, (await war(w2.id))!.topBidderFamilyId]).toEqual([a.f.id, b.f.id]);
  });
```
In the existing "checks owner, rank, jail…" case, drop the `young` District refusal: `young`'s first bid is `bid(young.boss, 4_550_000, "harbor_customs")`, which now succeeds and replaces its `docks_numbers` bid as the one live top bid of its L3 cap of 1, then the `pawn_row` bid still expects "Racket cap reached (1/1 held or bid)."; rename the case "checks owner, rank, jail, arrears, investigation, racket cap and the Crown cap".

Add to `test/crimeFamily/turf-command.test.ts` (Review Focus 2): a non-member's `!turf racket 9` posts the opener whose customId is `TURF_IDS.openRacket(<Low Town #1 casino_row id>, uid)`; an unplaced L1 family's officer's `!turf bid casino_row 9.1m` replies with the `noCityLine` text and no `bid_escrow` ledger row exists.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/turf-cities.test.ts test/anticheat/turf-bid.race.test.ts`
Expected: FAIL: `turfCities` does not exist; `seedTurfCity` is not exported.

- [ ] **Step 3: Write the schema and the helpers**

Per Files and Interfaces. Run `npx prisma format && npx prisma validate && npx prisma generate`.

- [ ] **Step 4: Implement `turfCities.ts` and swap the boot seed**

Header comment: "The city map's rows (amendment 6.3): a city and its 10 rackets, created or refreshed by upsert, never touching ownership, timers, strikes or the opened period." `startCrimeFamilyJobs` calls `seedTurf()`; `test/crimeFamily/sharding.test.ts` mocks `../../src/services/crimeFamily/turfCities` `seedTurf` instead of `racketService` `seedRackets`.

- [ ] **Step 5: Move wars, bids and views to cities**

Per Interfaces: `warMath.ts`, `warService.openWarPeriods`, `bidService.ts`, `turfQueries.ts`, `views.ts`, the catalog removals. Then `npm run typecheck` lists every remaining key-based reader; fix each in `ids.ts`, `turfScreens.ts`, `turfInteractionHandler.ts`, `turf.ts` and the fixture as listed in Files.

- [ ] **Step 6: Move the existing turf tests to cities**

Mechanical, keeping every figure (H2): `testPrisma.racket.findUnique/update({ where: { key: K } })` → `{ where: { cityId_key: { cityId: (await turfCity()).id, key: K } } }` or `(await racketByKey(K)).id`; `seedRackets()` → `seedTurf()` and, where a test then reads by key, the Gold city (`racketByKey(K)` reads Uptown #1, which `seedTurf` creates); `war.count/findFirst({ where: { racketKey: K } })` after `seedTurf` adds `cityId: (await turfCity()).id` (three cities each open a war); families that bid get `data: { cityId: (await turfCity()).id }`; `placeBid({ racketKey })` → `placeBid({ racketId })`; `getTurfMapView(now)` → `getTurfMapView(viewerId, (await turfCity()).id, now)`; `getRacketDetailView(key, …)` → `getRacketDetailView((await racketByKey(key)).id, …)`; `TURF_IDS.openRacket|bid|bidModal(key, …)` → the racket id. H2 test families bid in Uptown #1 whatever their level (an L1 family placed there is `placed: true` in `viewerCity`, which has no league check, H10/H18).

Beyond the mechanical edits:
  - (a) Tests that render the map or resolve a racket by key through a command never seeded before, and now need the cities (the "no row renders as the Street" fallback is gone and `viewerCity` throws `TURF_NOT_READY` before any seed): add `await seedTurf()` to the `beforeEach` of `test/router/crew-jail.test.ts` (`:67-76`, `!turf`/`!rackets` by a non-member) and of `test/crimeFamily/turf-command.test.ts` (`:36-50`, `!turf racket 9`, `!racket casino_row`).
  - (b) A non-member's or an unplaced family's opener resolves Low Town #1, not `racketByKey`'s Uptown #1 default: `turf-command.test.ts:37-38,48-49` expect `TURF_IDS.openRacket((await racketByKey("casino_row", (await testPrisma.turfCity.findFirstOrThrow({ where: { league: "BRONZE", number: 1 } })).id)).id, u)`.
  - (c) `turf-views.test.ts:21-25` (the District class line is gone, A25): the L1 boss's family (kept as `f`) is seeded with `data: { cityId: (await turfCity()).id }` and harbor_customs gives `{ floor: 4_550_000, minBid: 4_550_000, canBid: true, blockers: [] }`; the pawn_row case stays as written; then, after `testPrisma.family.update({ where: { id: f.id }, data: { cityId: "" } })`, harbor_customs gives `canBid: false` and `blockers[0]` matching `/^Your family has no city yet: it gets one at the daily census once 3 members are active/` (`noCityLine`).

`racket-seed.test.ts` keeps only its `resolveRacketKey` table (the seed cases moved to `turf-cities.test.ts`). `catalog.test.ts:43` (the 6,400,000 sum) goes (now in `league-math.test.ts`) and `:49` drops `minFamilyLevel: 7`. `ids-post.test.ts` checks `TURF_IDS.openRacket(<24 hex>, <20 digits>)` is 62 characters, `bid` 54 and `bidModal` 60. `turf-layout.test.ts:79` passes `city: { id: "c", league: "GOLD", number: 1, label: "Uptown #1" }` instead of `minFamilyLevel: 1`.

- [ ] **Step 7: Run the turf suites**

Run: `$VT test/crimeFamily test/anticheat test/router && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/data/crimeFamilyCatalog.ts src/services/crimeFamily src/ui/crimeFamily/ids.ts src/ui/crimeFamily/turfScreens.ts src/handlers/turfInteractionHandler.ts src/commands/economy/turf.ts src/scripts/fixtures/turfScreens.ts test
git commit -m "feat(turf): league cities of 10 rackets, per-city war periods, and bids and views addressed by racket id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The turf census: open, count and close cities, place unplaced families, rebalance

**Files:**
- Create: `src/services/crimeFamily/turfStake.ts`, `src/services/crimeFamily/turfCensus.ts`, `test/anticheat/turf-league.race.test.ts`
- Modify:
  - `src/services/crimeFamily/census.ts` (plan 4 Task 14): `CENSUS_STEPS = [ACTIVE_MEMBERS_STEP, ...TURF_CENSUS_STEPS]` (`import { TURF_CENSUS_STEPS } from "./turfCensus"`; `turfCensus.ts` imports only the `CensusStep`/`CensusNotice` types from `census.ts`, so no runtime cycle).
  - `src/services/dmNoticeService.ts` (turf block, `:427-465`): `turfCityMovedNotice`.
  - `src/services/crimeFamily/turfQueries.ts` (`racketLines`): H16.
  - `src/scripts/fixtures/turfScreens.ts`: a DM entry `{ label: "DM turf city moved", max: 8, payload: cfPayload(turfCityMovedNotice({ cityLabel: "Midtown #9999" })) }`.

**Interfaces:**
- Consumes: Task 1's `citiesFor`, `pickPlacementCity`, `planRebalance`; Task 2's `ensureCity`, `openCities`, `citySizes`, `cityLabel`; plan 4's `CensusStep`, `CensusNotice`, `runTurfCensus`, `utcDayKey` (`vaultService.ts:22`), `listMembers` (`familyQueries.ts:49`).
- Produces: `TurfStake`, `turfStake`, `familiesWithStake` (`turfStake.ts`; imports only `@prisma/client` types); `syncLeagueCities`, `closeCityIfIdle`, `placeUnplaced`, `rebalanceLeague`, `TURF_CENSUS_STEPS` (`turfCensus.ts`); `turfCityMovedNotice(v: { cityLabel })` = `familyNotice("war", "New city", \`The league opened or closed a city; your family now plays in **${v.cityLabel}**.\`)`. Details:
  - `turfStake(db, familyId)`: `rackets = racket.count({ ownerFamilyId: familyId })`, `topBids = war.count({ status: "BIDDING", topBidderFamilyId: familyId })`, `liveWars = war.count({ status: { in: ["ARMED", "ACTIVE", "SETTLING"] }, OR: [{ attackerFamilyId: familyId }, { defenderFamilyId: familyId }] })`. `familiesWithStake(db, cityIds)`: the owners of rackets in those cities, the top bidders of their BIDDING wars and both sides of their ARMED/ACTIVE/SETTLING wars, as one `Set` (two queries).
  - `touchCity(tx, cityId, now)` (private): reads the city; `false` unless OPEN; else `turfCity.update({ data: { updatedAt: new Date(Math.max(+now, +city.updatedAt + 1)) } })` (the `closeBidding` touch, `warService.ts:79-86`), `true`.
  - A league's **active families** are `family.count({ where: { level: { gte: minLevel, lte: maxLevel }, activeMembers: { gte: racketEligibleMin } } })` (`@@index([level, activeMembers])`).
  - `syncLeagueCities(league, now)`: `target = citiesFor(active)`; while OPEN < target: reopen the lowest-numbered CLOSED city (`turfCity.updateMany({ where: { id, status: "CLOSED" }, data: { status: "OPEN", openedAt: now, surplusDays: 0, surplusDayKey: "" } })`), else `ensureCity(league, max + 1)`. Then, with `today = utcDayKey(now)`: when OPEN > target, `turfCity.updateMany({ where: { league, status: "OPEN", surplusDayKey: { not: today } }, data: { surplusDays: { increment: 1 }, surplusDayKey: today } })` (H12) and, while OPEN > target, re-read the highest-numbered OPEN city and stop unless `surplusDays ≥ citySurplusDaysToClose` and `closeCityIfIdle(it.id, now).closed`; when OPEN ≤ target, `updateMany({ where: { league, status: "OPEN", surplusDays: { not: 0 } }, data: { surplusDays: 0, surplusDayKey: today } })`. Returns the target, the numbers opened and closed, and `cleared` (every closure's cleared family ids, concatenated).
  - `closeCityIfIdle(cityId, now)` (A27), one `runFamilyTx`: CAS `turfCity.updateMany({ where: { id, status: "OPEN" }, data: { status: "CLOSED", closedAt: now, surplusDays: 0, surplusDayKey: "" } })` (count 0 → `{ closed: false, cleared: [] }`); `war.updateMany({ where: { cityId, status: "BIDDING", topBidderFamilyId: "" }, data: { status: "CANCELLED" } })`; re-read `racket.count({ cityId, ownerFamilyId: { not: "" } })` and `war.count({ cityId, status: { in: ["BIDDING", "ARMED", "ACTIVE", "SETTLING"] } })`; either non-zero → throw a private `CityBusy` (rolls back; caught outside the transaction → `{ closed: false, cleared: [] }`); `cleared = family.findMany({ where: { cityId }, select: { id } })` ids, then `family.updateMany({ where: { cityId }, data: { cityId: "" } })`; `{ closed: true, cleared }`.
  - `placeUnplaced(league, now, only?)` (6.4 step 4): OPEN cities and their `citySizes`; candidates `family.findMany({ where: { level: range, activeMembers: { gte: racketEligibleMin }, ...(only ? { id: { in: only } } : {}) }, orderBy: [{ activeMembers: "desc" }, { createdAt: "asc" }], select: { id, cityId } })` whose `cityId` is not one of those OPEN ids; for each, `pickPlacementCity` over the running sizes and one `runFamilyTx`: CAS `family.updateMany({ where: { id, cityId: <read>, level: { gte, lte } }, data: { cityId: target, cityPlacedAt: now } })` (H14; count 0 → skip) and `touchCity` (false → `CityBusy`, skip); on success the target's size goes up by one. Returns the placements that committed (`{ familyId, cityId }`, the `rebalanceLeague` shape); sends nothing itself (6.9: a first placement is silent; the closure re-placement below is a move and is announced by its step). Each family's transaction sits in its own `try`: a non-`CityBusy` error is logged as `[crimeFamily] census place <familyId> error` and the loop goes on (that family waits for the next census), so one contended family never fails the day.
  - `rebalanceLeague(league, now)` (6.4 step 5): placed active families of the league's OPEN cities (`select: { id, cityId, cityPlacedAt }`), `movable = !familiesWithStake(prisma, openIds).has(id)`, `planRebalance`; each move is one `runFamilyTx`: `turfStake(tx, familyId)` all zero (else skip), CAS `family.updateMany({ where: { id, cityId: from }, data: { cityId: to, cityPlacedAt: now } })`, `touchCity(tx, to, now)`. Returns the moves that committed; a move's error is logged (`[crimeFamily] census move <familyId> error`) and skipped like a placement's.
  - `TURF_CENSUS_STEPS`: `{ key: "turf_cities" }`, `{ key: "turf_placement" }`, `{ key: "turf_rebalance" }`; each returns at once unless `CRIME_FAMILY_CONFIG.turfEnabled` (Review Focus 4) and otherwise runs its function for each `TURF_LEAGUES` entry in order; the rebalance step returns one `CensusNotice` per moved family: `{ type: "turf", userIds: (await listMembers(familyId)).map((m) => m.userId), build: () => turfCityMovedNotice({ cityLabel }) }`. The `turf_cities` step does the same for a closure (6.9: "The league opened or closed a city; your family now plays in <city>."): per league, when `syncLeagueCities` returns a non-empty `cleared`, it calls `placeUnplaced(league, now, cleared)` at once and returns one such notice per placement, so a family displaced by a closure is told where it went while `turf_placement` stays silent for first placements. (Steps take only `now`, so the cleared set never crosses steps. If the census crashes between a closure's commit and that re-placement, the rerun's `turf_placement` places the family without the notice: a rare, money-free degradation that needs no extra field.)
  - H16 in `racketLines`: also read `war.findMany({ where: { cityId, status: "CANCELLED", periodKey: { in: <each line's warWindow(nextWarAt).periodKey> } }, select: { racketId, periodKey } })`; a line whose own upcoming period has a CANCELLED row while `bidding.phase === "OPEN"` gets `bidding = { phase: "CLOSED", nextOpensAt: warWindow(new Date(+nextWarAt + 7 × 86_400_000)).bidOpensAt }`.

- [ ] **Step 1: Write the failing race tests**

```ts
// test/anticheat/turf-league.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { syncLeagueCities, closeCityIfIdle, placeUnplaced, rebalanceLeague, TURF_CENSUS_STEPS } from "../../src/services/crimeFamily/turfCensus";
import { CENSUS_STEPS, runTurfCensus } from "../../src/services/crimeFamily/census";
import { seedTurf } from "../../src/services/crimeFamily/turfCities";
import { placeBid } from "../../src/services/crimeFamily/bidService";
import { getRacketDetailView } from "../../src/services/crimeFamily/turfQueries";
import { nextWarStart } from "../../src/services/crimeFamily/warMath";
import { racketDef } from "../../src/data/crimeFamilyCatalog";
import {
  testPrisma, seedEligibleUser, seedFamily, seedTurfCity, seedRacket, seedWar, seedWarHits, racketByKey, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig,
} from "../helpers";

const ON = { enabled: true, turfEnabled: true };
const DAY = 86_400_000;
const T0 = new Date("2026-11-10T00:10:00Z");
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War", "CfJobRun"]));
beforeEach(async () => { await resetFamilies(); await seedTurf(); });

const city = (league: string, number: number) => testPrisma.turfCity.findUniqueOrThrow({ where: { league_number: { league, number } } });
/** n bare Gold families (activeMembers 3) in cityId ("" = unplaced), placed one minute apart. */
async function gold(n: number, cityId: string, o: { level?: number; from?: number } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(await seedFamily({ bossId: await seedEligibleUser(), level: o.level ?? 8, earnings: 50_000_000,
      data: { cityId, activeMembers: 3, cityPlacedAt: new Date(+T0 - DAY + ((o.from ?? 0) + i) * 60_000) } }));
  }
  return out;
}
/** A family whose 3 members each have 3 correct war hits this week (so plan 4's step counts it active). */
async function liveFamily(level: number) {
  const ids = [await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser()];
  const f = await seedFamily({ bossId: ids[0], level, members: ids.slice(1).map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
  for (const id of ids) await seedWarHits(id, f.id, 3, { createdAt: new Date(+T0 - DAY) });
  return f;
}
const sizesOf = async (league: string) => {
  const open = await testPrisma.turfCity.findMany({ where: { league, status: "OPEN" }, orderBy: { number: "asc" } });
  return Promise.all(open.map((c) => testPrisma.family.count({ where: { cityId: c.id, activeMembers: { gte: 3 } } })));
};

describe("cities per league (6.3, A27)", () => {
  it("the 41st active Gold family opens Uptown #2, is placed there, and the rebalance ends at 22 / 19 (edge 3, H6)", async () => {
    await withCfConfig(ON, async () => {
      await gold(40, (await city("GOLD", 1)).id);
      await gold(1, "", { from: 40 });
      expect(await syncLeagueCities("GOLD", T0)).toMatchObject({ target: 2, opened: [2] });
      expect(await testPrisma.racket.count({ where: { cityId: (await city("GOLD", 2)).id } })).toBe(10);
      expect(await placeUnplaced("GOLD", T0)).toHaveLength(1);
      expect(await sizesOf("GOLD")).toEqual([40, 1]);
      expect(await rebalanceLeague("GOLD", T0)).toHaveLength(18);
      expect(await sizesOf("GOLD")).toEqual([22, 19]);
    });
  });

  it("a city with an owned racket never closes; it closes on the first eligible census after release (edge 4)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      const [owner] = await gold(1, u2.id);
      await seedRacket("pawn_row", { cityId: u2.id, ownerFamilyId: owner.id });
      await gold(29, (await city("GOLD", 1)).id, { from: 1 });
      for (let d = 0; d < 15; d++) expect((await syncLeagueCities("GOLD", new Date(+T0 + d * DAY))).closed).toEqual([]);
      expect(await city("GOLD", 2)).toMatchObject({ status: "OPEN", surplusDays: 15 });
      await testPrisma.racket.updateMany({ where: { cityId: u2.id }, data: { ownerFamilyId: "" } });
      const sync = await syncLeagueCities("GOLD", new Date(+T0 + 15 * DAY));
      expect(sync).toMatchObject({ closed: [2], cleared: [owner.id] });
      expect(await testPrisma.family.count({ where: { cityId: u2.id } })).toBe(0);
      expect(await placeUnplaced("GOLD", new Date(+T0 + 15 * DAY))).toEqual([{ familyId: owner.id, cityId: (await city("GOLD", 1)).id }]);
    });
  });

  it("a family displaced by a closure is re-placed by the cities step and told its new city; first placements stay silent (6.9)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      await testPrisma.turfCity.update({ where: { id: u2.id }, data: { surplusDays: 20 } });
      const [moved] = await gold(1, u2.id);
      await gold(29, (await city("GOLD", 1)).id, { from: 1 });
      await gold(1, "", { from: 30 });                                          // unplaced: placed later, silently
      const cities = TURF_CENSUS_STEPS.find((s) => s.key === "turf_cities")!;
      const notices = (await cities.run(T0)) ?? [];
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ type: "turf", userIds: [moved.bossId] });
      expect(JSON.stringify(notices[0].build(moved.bossId))).toContain("New city");
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: moved.id } })).cityId).toBe((await city("GOLD", 1)).id);
      const placement = TURF_CENSUS_STEPS.find((s) => s.key === "turf_placement")!;
      expect((await placement.run(T0)) ?? []).toEqual([]);
      expect(await testPrisma.family.count({ where: { cityId: "", level: 8 } })).toBe(0);
    });
  });

  it("surplus counts once per UTC day and resets when the league needs its cities again (H12)", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "SILVER", number: 2 });
      await syncLeagueCities("SILVER", T0); await syncLeagueCities("SILVER", new Date(+T0 + 3_600_000));
      expect((await city("SILVER", 2)).surplusDays).toBe(1);
      await withCfConfig({ familiesPerCity: 1 }, async () => {
        await seedFamily({ bossId: await seedEligibleUser(), level: 5, data: { activeMembers: 3 } });
        await seedFamily({ bossId: await seedEligibleUser(), level: 5, data: { activeMembers: 3 } });
        await syncLeagueCities("SILVER", new Date(+T0 + DAY));
      });
      expect((await city("SILVER", 2)).surplusDays).toBe(0);
    });
  });

  it("a bid racing a closure: either the bid stands and the city stays open, or the city closes and the bid is refused (edge 5)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      const [f] = await gold(1, u2.id, { level: 7 });
      await testPrisma.familyMember.updateMany({ where: { familyId: f.id }, data: { joinedAt: daysAgo(10) } });
      const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: u2.id });
      const [closed, bid] = await Promise.allSettled([closeCityIfIdle(u2.id, new Date()), placeBid({ racketId: w.racketId, actorId: f.bossId, amount: 2_100_000 })]);
      const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
      const c = await testPrisma.turfCity.findUniqueOrThrow({ where: { id: u2.id } });
      if (bid.status === "fulfilled") expect([c.status, war.status, war.topBidderFamilyId, (closed as PromiseFulfilledResult<{ closed: boolean }>).value.closed]).toEqual(["OPEN", "BIDDING", f.id, false]);
      else expect([c.status, war.status, war.topBid]).toEqual(["CLOSED", "CANCELLED", 0]);
    });
  });

  it("a reopened city's racket says bidding is closed this week and refuses bids (Review Focus 5, H16)", async () => {
    await withCfConfig(ON, async () => {
      const u2 = await seedTurfCity({ league: "GOLD", number: 2 });
      const [f] = await gold(1, u2.id, { level: 7 });
      const startsAt = nextWarStart(racketDef("docks_numbers")!, new Date(Date.now() + 73 * 3_600_000));   // on the real schedule
      const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: u2.id, startsAt });
      expect(await closeCityIfIdle(u2.id, new Date())).toMatchObject({ closed: true, cleared: [f.id] });
      await testPrisma.turfCity.update({ where: { id: u2.id }, data: { status: "OPEN" } });
      await testPrisma.family.update({ where: { id: f.id }, data: { cityId: u2.id } });
      const view = await getRacketDetailView(w.racketId, f.bossId, new Date(+startsAt - 48 * 3_600_000));   // inside the window
      expect(view.line.bidding.phase).toBe("CLOSED");
      await expect(placeBid({ racketId: w.racketId, actorId: f.bossId, amount: 2_100_000 })).rejects.toThrow("Bidding is not open for this racket.");
    });
  });
});

describe("placement and rebalance (6.4)", () => {
  it("a double placement run places each family once and the rebalance evens it out", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "GOLD", number: 2 });
      await gold(8, "");
      await Promise.all([placeUnplaced("GOLD", T0), placeUnplaced("GOLD", T0)]);
      expect(await testPrisma.family.count({ where: { cityId: "" } })).toBe(0);
      await rebalanceLeague("GOLD", T0);
      const s = await sizesOf("GOLD");
      expect(s.reduce((a, b) => a + b, 0)).toBe(8);
      expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(2);
    });
  });

  it("never moves a family holding a racket or a top bid", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "GOLD", number: 2 });
      const fams = await gold(6, (await city("GOLD", 1)).id);
      await seedRacket("casino_row", { ownerFamilyId: fams[5].id });
      await seedWar({ racketKey: "city_hall", status: "BIDDING", topBid: 9_100_000, topBidderFamilyId: fams[4].id });
      const moved = (await rebalanceLeague("GOLD", T0)).map((m) => m.familyId);
      expect(moved).not.toContain(fams[5].id); expect(moved).not.toContain(fams[4].id);
      expect(moved.length).toBeGreaterThan(0);
    });
  });

  it("a movable family that wins a top bid while its move is planned is either moved (bid refused) or keeps the bid (edge 12)", async () => {
    await withCfConfig(ON, async () => {
      await seedTurfCity({ league: "GOLD", number: 2 });
      const fams = await gold(5, (await city("GOLD", 1)).id);
      const f = fams[4];                                                         // most recently placed: the one move
      await testPrisma.familyMember.updateMany({ where: { familyId: f.id }, data: { joinedAt: daysAgo(10) } });
      const w = await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      const [moves, bid] = await Promise.allSettled([rebalanceLeague("GOLD", T0), placeBid({ racketId: w.racketId, actorId: f.bossId, amount: 2_100_000 })]);
      const now = await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } });
      const war = await testPrisma.war.findUniqueOrThrow({ where: { id: w.id } });
      if (bid.status === "fulfilled") expect([now.cityId, war.topBidderFamilyId]).toEqual([(await city("GOLD", 1)).id, f.id]);
      else expect([now.cityId, war.topBid, now.earnings]).toEqual([(await city("GOLD", 2)).id, 0, 50_000_000]);
      expect(moves.status).toBe("fulfilled");
    });
  });

  it("10 parallel bids on the 10 rackets of one city all commit: placement never makes the city a hot spot", async () => {
    await withCfConfig(ON, async () => {
      const fams = await gold(10, (await city("GOLD", 1)).id, { level: 7 });
      for (const f of fams) await testPrisma.familyMember.updateMany({ where: { familyId: f.id }, data: { joinedAt: daysAgo(10) } });
      const keys = ["docks_numbers", "laundromat_front", "harbor_customs", "neon_strip", "valet_racket", "pawn_row", "union_kickbacks", "racetrack_book", "casino_row", "city_hall"];
      const wars = await Promise.all(keys.map((k) => seedWar({ racketKey: k, status: "BIDDING" })));
      const rs = await Promise.allSettled(wars.map((w, i) => placeBid({ racketId: w.racketId, actorId: fams[i].bossId, amount: 9_100_000 })));
      expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    });
  });
});

describe("the census runs the turf steps once a day (6.4 steps 1–5)", () => {
  it("turf off: activeMembers are counted but no city, placement or move happens (Review Focus 4); turf on: the next day places", async () => {
    await withCfConfig({ enabled: true, turfEnabled: false, familiesPerCity: 1 }, async () => {
      const a = await liveFamily(2); const b = await liveFamily(3);
      expect((await runTurfCensus(T0)).status).toBe("ran");
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: a.id } })).activeMembers).toBe(3);
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE" } })).toBe(1);
      expect(await testPrisma.family.count({ where: { id: { in: [a.id, b.id] }, cityId: { not: "" } } })).toBe(0);
    });
    await withCfConfig({ ...ON, familiesPerCity: 1 }, async () => {
      expect((await runTurfCensus(new Date(+T0 + DAY))).status).toBe("ran");
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE", status: "OPEN" } })).toBe(2);
      expect(await sizesOf("BRONZE")).toEqual([1, 1]);
      expect((await runTurfCensus(new Date(+T0 + DAY + 3_600_000))).status).toBe("skipped");   // edge 1
    });
  });

  it("a crash after a city opened reruns next hour: the city is found, not doubled, and placement finishes (edge 2)", async () => {
    await withCfConfig({ ...ON, familiesPerCity: 1 }, async () => {
      await liveFamily(1); await liveFamily(1);
      const boom = { key: "boom", run: async () => { throw new Error("crash"); } };
      CENSUS_STEPS.splice(2, 0, boom);                                           // after turf_cities, before placement
      await expect(runTurfCensus(T0)).rejects.toThrow("crash");
      CENSUS_STEPS.splice(CENSUS_STEPS.indexOf(boom), 1);
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE" } })).toBe(2);
      expect((await runTurfCensus(new Date(+T0 + 3_600_000))).status).toBe("ran");
      expect(await testPrisma.turfCity.count({ where: { league: "BRONZE" } })).toBe(2);
      expect(await sizesOf("BRONZE")).toEqual([1, 1]);
    });
  });

  it("a rebalance move DMs every member of the moved family through the census notices", async () => {
    await withCfConfig({ ...ON, familiesPerCity: 2 }, async () => {
      const fams = [];
      for (let i = 0; i < 5; i++) fams.push(await liveFamily(8));
      const u1 = await city("GOLD", 1);
      for (const f of fams) await testPrisma.family.update({ where: { id: f.id }, data: { cityId: u1.id } });
      const { notices } = await runTurfCensus(T0);
      expect(await sizesOf("GOLD")).toEqual([3, 1, 1]);                          // 3 cities; 5 → 4 → 3, then the ±2 rule stops
      expect(notices.filter((n) => n.type === "turf")).toHaveLength(2);
      expect(notices.every((n) => n.userIds.length === 3)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/turf-league.race.test.ts`
Expected: FAIL: `turfCensus` does not exist.

- [ ] **Step 3: Implement `turfStake.ts`, `turfCensus.ts` and the notice**

Per Interfaces. `turfCensus.ts` header: "The turf census steps (amendment 6.3–6.4, A22–A27, A43): each league's cities are opened, counted as surplus and closed, unplaced active families placed, and movable families rebalanced. Each write is one runFamilyTx behind a CAS; a rerun after a crash repeats only what did not commit." Append the steps to `CENSUS_STEPS` in `census.ts`.

- [ ] **Step 4: Implement H16 in `racketLines`**

Per Interfaces.

- [ ] **Step 5: Run the census, turf and layout suites**

Run: `$VT test/anticheat/turf-league.race.test.ts test/crimeFamily/census.test.ts test/crimeFamily/turf-cities.test.ts test/crimeFamily/turf-views.test.ts test/crimeFamily/turf-layout.test.ts test/crimeFamily/layout.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/crimeFamily/turfStake.ts src/services/crimeFamily/turfCensus.ts src/services/crimeFamily/census.ts src/services/crimeFamily/turfQueries.ts src/services/dmNoticeService.ts src/scripts/fixtures/turfScreens.ts test/anticheat/turf-league.race.test.ts
git commit -m "feat(turf): the daily census opens, closes and rebalances league cities and places active families

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The league-changing level-up (hooks, S8 lines, the release, the DM)

**Files:**
- Modify:
  - `src/services/crimeFamily/extensions.ts:20-33`: `FamilyHook` gains `levelUpBlock?`, `levelUpNotes?`, `onLevelUp?` (signatures in the top Interfaces block), each with a one-line comment ("runs inside the level-up transaction before the level CAS; a string → FamilyError", "S8 lines for the level about to be bought", "runs after the fee; returns lines for the members' DM").
  - `src/services/crimeFamily/turfHooks.ts`: `TURF_FAMILY_HOOK` implements the three; header comment gains "a league-changing level-up releases its rackets (amendment 6.6)". It imports `turfStake` (Task 3), `writeLedger`, `leagueOf`, `nextCensusAt`; still never `membershipService` or `disbandService`.
  - `src/services/crimeFamily/progression.ts:50-82`: `levelUp` returns `LevelUpResult`; new `levelUpPreview`.
  - `src/services/crimeFamily/vaultService.ts:225`: `levelUp: await levelUpPreview(family, now)`.
  - `src/services/crimeFamily/views.ts:49`: `levelUp: { next: FamilyLevelDef | null; blockers: string[]; notes: string[] }`.
  - `src/services/crimeFamily/ledger.ts:6-8`: `LedgerType` gains `"league_move"`; `src/ui/crimeFamily/familyScreens.ts` `LEDGER_LABELS` gains `league_move: "League move"`.
  - `src/ui/crimeFamily/familyScreens.ts:281-301` (`buildLevelUpConfirm`): after the level line and before the blockers, `v.levelUp.notes` one per line (S8 stays 6 components).
  - `src/services/dmNoticeService.ts`: `turfLeagueMoveNotice`.
  - `src/ui/crimeFamily/turfAnnounce.ts`: `announceLevelUp`.
  - `src/handlers/crewInteractionHandler.ts:240-245` (`levelRoute`): `showThenAnnounce(i, vaultScreen(uid, …), () => announceLevelUp(i.client, family.id, Number(level), result.level, result.notes, new Date()))`.
  - `src/scripts/fixtures/crimeFamilyScreens.ts`: `{ label: "S8 level-up confirm (league move, 3 released)", max: 6, … }` with `vaultView(false)`'s `levelUp.notes` set to the two Task-4 lines naming Construction Union Kickbacks, Racetrack Bookmaking and Casino Row Protection; every other `vaultView` gets `notes: []`. `src/scripts/fixtures/turfScreens.ts`: `{ label: "DM turf league move", max: 8, payload: cfPayload(turfLeagueMoveNotice({ leagueName: "Silver", lines: ["Released to the Street: Construction Union Kickbacks, Racetrack Bookmaking, Casino Row Protection."], nextCensusAt: new Date() })) }`.
- Test: `test/anticheat/turf-league.race.test.ts` (new `describe`), `test/crimeFamily/progression.test.ts`, `test/crimeFamily/layout.test.ts`

**Interfaces:**
- Consumes: `turfStake` (Task 3), `nextCensusAt`, `leagueOf` (Task 1), `listMembers`, `notifyMany`, plan 4's `showThenAnnounce` and `writeLedger`.
- Produces: the three hook methods, `LevelUpResult`, `levelUpPreview`, `turfLeagueMoveNotice`, `announceLevelUp`, `LedgerType "league_move"`. Details:
  - `levelUpBlock(db, { familyId, from, to })`: `null` unless `leagueOf(from).key !== leagueOf(to).key`; then, when `turfStake` shows `topBids + liveWars > 0`, `` `Finish your turf first: a family can't move up to the ${leagueOf(to).name} league while it holds a top bid or fights in a turf war.` `` (H17).
  - `levelUpNotes(familyId, { from, to, now })`: `[]` within a league; else, when the family owns rackets, `` `Moving up to the ${to.name} league releases ${names.join(", ")} to the Street.` `` (names in `RACKETS` order), then always `` `Your family gets a ${to.name} city at the next census (<t:${unix(nextCensusAt(now))}:R>).` ``.
  - `onLevelUp(tx, { familyId, from, to, now })`: nothing within a league; else the owned rackets (`racket.findMany({ where: { ownerFamilyId: familyId }, select: { id, key, name } })`) → `racket.updateMany({ where: { id: { in }, ownerFamilyId: familyId }, data: { ownerFamilyId: "", neglectStrikes: 0, lastPayoutAt: now } })` (the partial cycle is forfeited, as at a capture); `family.update({ data: { cityId: "" } })`; `writeLedger(tx, { familyId, actorId: "system", type: "league_move", amount: 0, treasuryAfter, earningsAfter, meta: { from: <league key>, to: <league key>, released: [keys] } })`; returns `` [`Released to the Street: ${names.join(", ")}.`] `` when any were released, else `[]`.
  - `levelUp` (`progression.ts:54-82`): inside the transaction, after `assertLevelUpActor` and before the level CAS, read `fresh = tx.family.findUnique({ where: { id: familyId }, select: { level: true } })`; only when `fresh?.level === expectedLevel && nextLevelDef(expectedLevel)` run every `FAMILY_HOOKS` `levelUpBlock?.(tx, { familyId, from: expectedLevel, to: expectedLevel + 1 })` (the first string → `FamilyError`). Otherwise skip the hooks and fall through to the CAS, whose existing failure path (`:70-76`) answers "Level changed." / "Max level." / "That family no longer exists.", so a stale `crew:lvl:ok:<L>` never reaches a hook with the wrong `from` and `leagueOf(11)` is never called. After `spendFromVault`, every `onLevelUp?.(tx, { …, now })`; their lines concatenate into `notes`.
  - `levelUpPreview(family, now)`: `next = nextLevelDef(family.level)`; `{ next, blockers: [...levelUpBlockers(family), ...(next ? hook blocks read on prisma : [])], notes: next ? hook notes : [] }`. At max level no hook runs (an L10 family's `leagueOf(11)` would throw and crash S6/S8 through `getVaultView`), so it returns `{ next: null, blockers: ["Max level."], notes: [] }`.
  - `turfLeagueMoveNotice({ leagueName, lines, nextCensusAt })` = `familyNotice("war", "League move", [\`Your family moved up to the **${leagueName}** league.\`, ...lines, \`It gets a ${leagueName} city at the next census <t:${unix}:R>.\`].join("\n"))`.
  - `announceLevelUp(client, familyId, from, to, notes, now)`: inside `safely("announceLevelUp", …)`; returns unless `leagueOf(from).key !== leagueOf(to).key`; `notifyMany(client, "turf", (await listMembers(familyId)).map((m) => m.userId), () => turfLeagueMoveNotice({ leagueName: leagueOf(to).name, lines: notes, nextCensusAt: nextCensusAt(now) }))` (H5).

- [ ] **Step 1: Write the failing tests**

Add to `test/anticheat/turf-league.race.test.ts` (it already imports the helpers; add `levelUp` from `progression`, `announceLevelUp` from `turfAnnounce`, `fakeClient` from `../crimeFamily/fakeClient`):

```ts
describe("league-changing level-ups (6.6)", () => {
  /** A Bronze L3 family ready for L4: 6,000 XP, 10,000,000 earnings, placed in Low Town #1 and active. */
  async function ready(o: { level?: number; xp?: number } = {}) {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, level: o.level ?? 3, xp: o.xp ?? 6_000, earnings: 10_000_000, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }],
      data: { cityId: (await city(leagueOfLevel(o.level ?? 3), 1)).id, activeMembers: 3 } });
    return { f, boss, s };
  }
  const leagueOfLevel = (l: number) => (l <= 3 ? "BRONZE" : l <= 6 ? "SILVER" : "GOLD");

  it("L3 → L4 with a held racket: Street, league_move row, unplaced, then placed in Midtown by the census (edge 6)", async () => {
    await withCfConfig(ON, async () => {
      const { f, boss } = await ready();
      const low = await city("BRONZE", 1);
      await seedRacket("pawn_row", { cityId: low.id, ownerFamilyId: f.id, neglectStrikes: 2 });
      const r = await levelUp(f.id, boss, 3, T0);
      expect(r).toMatchObject({ level: 4, notes: ["Released to the Street: Pawn Row Fencing."] });
      expect(await racketByKey("pawn_row", low.id)).toMatchObject({ ownerFamilyId: "", neglectStrikes: 0, lastPayoutAt: T0 });
      expect(await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ level: 4, cityId: "" });
      expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "league_move" } }))
        .toMatchObject({ amount: 0, meta: { from: "BRONZE", to: "SILVER", released: ["pawn_row"] } });
      await placeUnplaced("SILVER", new Date(+T0 + DAY));
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).cityId).toBe((await city("SILVER", 1)).id);
    });
  });

  it.each([
    ["defending in an ARMED war (edge 7)", async (fid: string) => { await seedRacket("pawn_row", { cityId: (await city("BRONZE", 1)).id, ownerFamilyId: fid }); await seedWar({ racketKey: "pawn_row", status: "ARMED", cityId: (await city("BRONZE", 1)).id, defenderFamilyId: fid, attackerFamilyId: "65f0000000000000000000a9", topBid: 2_100_000 }); }],
    ["holding a top bid (Review Focus 3)", async (fid: string) => { await seedWar({ racketKey: "docks_numbers", status: "BIDDING", cityId: (await city("BRONZE", 1)).id, topBid: 700_000, topBidderFamilyId: fid }); }],
  ] as const)("is refused while %s: no fee, no level, no release", async (_n, arrange) => {
    await withCfConfig(ON, async () => {
      const { f, boss } = await ready();
      await arrange(f.id);
      await expect(levelUp(f.id, boss, 3, T0)).rejects.toThrow("Finish your turf first: a family can't move up to the Silver league while it holds a top bid or fights in a turf war.");
      expect(await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ level: 3, earnings: 10_000_000 });
      expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: { in: ["level_fee", "league_move"] } } })).toBe(0);
    });
  });

  it("a level-up inside a league keeps the city and the rackets", async () => {
    await withCfConfig(ON, async () => {
      const { f, boss } = await ready({ level: 2, xp: 3_000 });
      await seedRacket("pawn_row", { cityId: (await city("BRONZE", 1)).id, ownerFamilyId: f.id });
      expect((await levelUp(f.id, boss, 2, T0)).notes).toEqual([]);
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).cityId).toBe((await city("BRONZE", 1)).id);
      expect((await racketByKey("pawn_row", (await city("BRONZE", 1)).id)).ownerFamilyId).toBe(f.id);
    });
  });

  it("a level-up racing a placement never leaves a Silver family in a Bronze city (H14)", async () => {
    await withCfConfig(ON, async () => {
      const { f, boss } = await ready();
      await testPrisma.family.update({ where: { id: f.id }, data: { cityId: "" } });
      await Promise.allSettled([placeUnplaced("BRONZE", T0), levelUp(f.id, boss, 3, T0)]);
      const after = await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } });
      if (after.level === 4) expect(after.cityId).toBe("");
      else expect(after.cityId).toBe((await city("BRONZE", 1)).id);
    });
  });

  it("a Silver L6 family that times its level-up to Gold's 41st slot lands in a shared city, not an empty one (edge 11)", async () => {
    await withCfConfig(ON, async () => {
      await gold(40, (await city("GOLD", 1)).id);
      const { f, boss } = await ready({ level: 6, xp: 24_000 });
      await testPrisma.family.update({ where: { id: f.id }, data: { earnings: 50_000_000 } });
      await levelUp(f.id, boss, 6, T0);
      await syncLeagueCities("GOLD", new Date(+T0 + DAY)); await placeUnplaced("GOLD", new Date(+T0 + DAY)); await rebalanceLeague("GOLD", new Date(+T0 + DAY));
      const mine = (await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).cityId;
      expect(await testPrisma.family.count({ where: { cityId: mine } })).toBeGreaterThanOrEqual(19);
      expect(await sizesOf("GOLD")).toEqual([22, 19]);
    });
  });

  it("the league-move DM reaches every member once, naming the league and the released rackets (H5)", async () => {
    const { f } = await ready();
    const c = fakeClient();
    await announceLevelUp(c.client as any, f.id, 3, 4, ["Released to the Street: Pawn Row Fencing."], T0);
    await announceLevelUp(c.client as any, f.id, 2, 3, [], T0);                  // same league: no DM
    expect(c.dm.size).toBe(2);
    expect([...c.dm.values()].every((n) => n === 1)).toBe(true);
  });
});
```

Add to `test/crimeFamily/progression.test.ts`: `levelUpPreview` for the same L3 family holding Pawn Row Fencing returns `notes` `["Moving up to the Silver league releases Pawn Row Fencing to the Street.", "Your family gets a Silver city at the next census (<t:…:R>)."]` (match the second with a regex) and, once it holds a top bid, the H17 line as its last blocker; for an L1 family `notes` is `[]`; for an L10 family it returns `{ next: null, blockers: ["Max level."], notes: [] }` without throwing; and `levelUp(f.id, boss, 3, T0)` on an L3 family already raised to L4 with XP enough for L5 (a stale S8, with a top bid held so the Bronze→Silver hook would refuse if it ran) rejects with "Level changed." and writes nothing. Add to `test/crimeFamily/layout.test.ts`: the S8 fixture's visible text contains "releases" and "next census" and counts ≤ 6.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/turf-league.race.test.ts test/crimeFamily/progression.test.ts`
Expected: FAIL: `levelUp(...).notes` is undefined; `announceLevelUp` is not exported.

- [ ] **Step 3: Add the hook methods and implement them in `TURF_FAMILY_HOOK`**

Per Interfaces.

- [ ] **Step 4: Run the hooks from `levelUp`, `levelUpPreview` and the vault view**

Per Interfaces; `LEDGER_LABELS` and S8 per Files.

- [ ] **Step 5: Add the DM, the announcer, the route call and the fixtures**

Per Interfaces and Files.

- [ ] **Step 6: Run the suites**

Run: `$VT test/anticheat/turf-league.race.test.ts test/crimeFamily/progression.test.ts test/crimeFamily/layout.test.ts test/crimeFamily/handlers.test.ts test/crimeFamily/turf-hooks.test.ts test/anticheat/family-disband.race.test.ts && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 7: Commit**

```bash
git add src/services/crimeFamily/extensions.ts src/services/crimeFamily/turfHooks.ts src/services/crimeFamily/progression.ts src/services/crimeFamily/vaultService.ts src/services/crimeFamily/views.ts src/services/crimeFamily/ledger.ts src/ui/crimeFamily/familyScreens.ts src/services/dmNoticeService.ts src/ui/crimeFamily/turfAnnounce.ts src/handlers/crewInteractionHandler.ts src/scripts/fixtures test/anticheat/turf-league.race.test.ts test/crimeFamily/progression.test.ts test/crimeFamily/layout.test.ts
git commit -m "feat(turf): a league-changing level-up releases rackets to the Street and waits for the census

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: League screens: the S16 city header and pager, S17's city, the league on S10, S29 and S30

**Files:**
- Modify:
  - `src/services/crimeFamily/views.ts` (`TurfMapView`): gains `viewerLeague: LeagueKey | null`, `status: string | null`, `nav: { prev: string | null; next: string | null }`.
  - `src/services/crimeFamily/turfQueries.ts`: `getTurfMapView` fills them; new `leagueCityFor`.
  - `src/ui/crimeFamily/ids.ts` (`TURF_IDS`): `city`, `cityEdge`, `league` (H3).
  - `src/ui/crimeFamily/turfScreens.ts` (`buildTurfMap`, `:47-86`; `buildRacketDetail`'s Back): the header (H19), the status line and the city row.
  - `src/handlers/turfInteractionHandler.ts` (`TURF_ROUTES`, `:100-113`): `city` and `lg` routes.
  - `src/ui/crimeFamily/familyScreens.ts:323-331` (`leaderboardLine`): `` `L${row.level} ${leagueOf(row.level).name}` `` (amendment §2.6: "L8 Gold").
  - `src/ui/crimeFamily/recruitScreens.ts` (plan 4 Task 14, F17): S29's row and S30's header read `` `L${level} · ${leagueOf(level).name}` ``.
  - `src/services/crimeFamily/turfLeaderboard.ts:9`: comment "Every family holding ≥ 1 racket in any city, ranked." (the "at most 10 exist" note goes).
  - `src/scripts/fixtures/turfScreens.ts`: S16 entries per Step 1.
  - `test/crimeFamily/ids-post.test.ts` (`all` gains the three ids), `test/crimeFamily/turf-layout.test.ts`, `test/crimeFamily/progression.test.ts:51-` (the leaderboard line), `test/crimeFamily/recruit-board.test.ts` (plan 4; the level text).
- Create: `test/crimeFamily/turf-league-ui.test.ts`

**Interfaces:**
- Consumes: Task 2's `viewerCity`, `openCities`, `noCityLine`, `TURF_IDS.openRacket|bid`; `leagueDef`, `leagueOf`, `LEAGUE_RACKET_INCOME`.
- Produces: `TURF_IDS.city(cityId, owner)` = `cfId("turf", "city", cityId, owner)`, `TURF_IDS.cityEdge(edge, owner)` = `cfId("turf", "city", edge, owner)`, `TURF_IDS.league(key, owner)` = `cfId("turf", "lg", key, owner)`; `leagueCityFor(viewerId: string, league: LeagueKey): Promise<string>` (the viewer's own city when `league` is its family's league, else the league's lowest-numbered OPEN city). Details:
  - `getTurfMapView`: `viewerLeague` = the family's `leagueOf(level).key` or null; `status` = `noCityLine(now)` when the viewer has a family and `viewerCity(...).placed` is false, else null; `nav` = the ids of the OPEN cities of the shown city's league just below and above it by number (null at the ends).
  - S16 (`buildTurfMap`), 20 components: the header text is `` `## ${cfLabel("war", "Turf")} · ${v.city.label} (${lg.name})\n-# ${lg.name} league rackets pay ${fmt(inc.CORNER)} / ${fmt(inc.DISTRICT)} / ${fmt(inc.CROWN)} a day (Corner / District / Crown). Win a racket's weekly war to take it.` `` plus `` `\n-# ${v.status}` `` when set (H19); after the existing `War board`/`Back` row a new row: `◀ City` (`TURF_IDS.city(nav.prev, owner)`, or `cityEdge("prev", owner)` disabled), `City ▶` (same with `next`), then `Bronze`, `Silver`, `Gold` (`TURF_IDS.league(key, owner)`, emoji `crest_1|2|3`, `ButtonStyle.Primary` for `viewerLeague`, else Secondary).
  - S17's Back: `TURF_IDS.city(v.line.cityId, ownerId)` (back to the racket's own city).
  - Routes: `city: gated("auto", (i, [cityId]) => show(i, buildTurfMap(uid, await getTurfMapView(uid, cityId, now))))` (a non-ObjectId or CLOSED id falls back to the viewer's city inside `getTurfMapView`, H10); `lg: gated("auto", (i, [key]) => …)`: an unknown key → `FamilyError(INACTIVE)`; else `getTurfMapView(uid, await leagueCityFor(uid, key), now)`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/turf-league-ui.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { buildTurfMap } from "../../src/ui/crimeFamily/turfScreens";
import { getTurfMapView } from "../../src/services/crimeFamily/turfQueries";
import { ensureCity, seedTurf } from "../../src/services/crimeFamily/turfCities";
import { fakeButton, fakeSelect, said } from "./fakeInteraction";
import { visibleText } from "./visibleText";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, racketByKey, withCfConfig } from "../helpers";

const ON = { enabled: true, turfEnabled: true };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War"]));
beforeEach(async () => { await resetFamilies(); await seedTurf(); });
const ids = (p: any) => JSON.stringify(p.components).match(/"custom_id":"[^"]+"/g) ?? [];

async function member(level: number, cityId: string) {
  const boss = await seedEligibleUser();
  await seedFamily({ bossId: boss, level, homeGuildId: "g1", data: { cityId, activeMembers: 3 } });
  return boss;
}

describe("S16 city header and pager (6.8)", () => {
  it("names the city and league, prices the league's rackets, and pages between the league's cities", async () => {
    const u1 = await testPrisma.turfCity.findFirstOrThrow({ where: { league: "GOLD", number: 1 } });
    const u2 = await ensureCity("GOLD", 2);
    const uid = await member(8, u2.id);
    const p = buildTurfMap(uid, await getTurfMapView(uid, null, new Date()));
    const t = visibleText(p);
    expect(t).toContain("Turf · Uptown #2 (Gold)");
    expect(t).toContain("Gold league rackets pay 300,000 / 650,000 / 1,300,000 a day (Corner / District / Crown).");
    const all = ids(p);
    expect(new Set(all).size).toBe(all.length);                                  // H3: no duplicate customIds
    expect(all).toContain(`"custom_id":"${TURF_IDS.city(u1.id, uid)}"`);
    expect(all).toContain(`"custom_id":"${TURF_IDS.cityEdge("next", uid)}"`);
    expect(all).toContain(`"custom_id":"${TURF_IDS.league("GOLD", uid)}"`);
  });

  it("an unplaced family sees the census line on the city it would join (edge 9)", async () => {
    const uid = await member(2, "");
    const t = visibleText(buildTurfMap(uid, await getTurfMapView(uid, null, new Date())));
    expect(t).toContain("Turf · Low Town #1 (Bronze)");
    expect(t).toMatch(/Your family has no city yet: it gets one at the daily census once 3 members are active \(next <t:\d+:R>\)\./);
  });

  it("a pager press for a closed city shows the viewer's own city; a league button finds the right city (Review Focus 1)", async () => {
    await withCfConfig(ON, async () => {
      const m2 = await ensureCity("SILVER", 2);
      const gone = await ensureCity("SILVER", 3);
      await testPrisma.turfCity.update({ where: { id: gone.id }, data: { status: "CLOSED" } });
      const uid = await member(5, m2.id);
      const back = fakeButton(TURF_IDS.city(gone.id, uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(back as any);
      expect(said(back)).toContain("Midtown #2 (Silver)");
      const silver = fakeButton(TURF_IDS.league("SILVER", uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(silver as any);
      expect(said(silver)).toContain("Midtown #2 (Silver)");
      const gold = fakeButton(TURF_IDS.league("GOLD", uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(gold as any);
      expect(said(gold)).toContain("Uptown #1 (Gold)");
      const edge = fakeButton(TURF_IDS.cityEdge("prev", uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(edge as any);
      expect(said(edge)).toContain("Midtown #2 (Silver)");
    });
  });

  it("a stale select opens another city's racket read-only with the city line and the city refusal (Review Focus 1)", async () => {
    await withCfConfig(ON, async () => {
      const m1 = await testPrisma.turfCity.findFirstOrThrow({ where: { league: "SILVER", number: 1 } });
      const m2 = await ensureCity("SILVER", 2);
      const uid = await member(5, m2.id);
      const r = await racketByKey("casino_row", m1.id);
      const sel = fakeSelect(TURF_IDS.select(uid), [r.id], { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(sel as any);
      expect(said(sel)).toContain("**City:** Midtown #1 (Silver league)");
      expect(said(sel)).toContain("This racket is in Midtown #1. Your family plays in Midtown #2.");
    });
  });
});

describe("the league on family lists (2.6, plan 4 F17)", () => {
  it("S10 lines read L8 Gold", async () => {
    const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
    const s10 = crimeFamilyWorstCases().find((c) => c.label.startsWith("S10"))!;
    expect(visibleText(s10.payload)).toMatch(/L\d+ (Bronze|Silver|Gold)/);
  });
});
```

`src/scripts/fixtures/turfScreens.ts`: replace the S16 entry with `{ label: "S16 turf map (placed Gold family, 10 owned rackets, live bids, both pager arrows)", max: 20, payload: buildTurfMap(OWNER, { ...mapView(), viewerLeague: "GOLD", status: null, nav: { prev: CITY_PREV, next: CITY_NEXT } }) }` and `{ label: "S16 turf map (unplaced family)", max: 20, payload: buildTurfMap(OWNER, { ...mapView(), viewerLeague: "GOLD", status: "Your family has no city yet: it gets one at the daily census once 3 members are active (next <t:4102444800:R>).", nav: { prev: null, next: null } }) }`, with `CITY_PREV = "65f0000000000000000000c0"`, `CITY_NEXT = "65f0000000000000000000c2"`. Add to `test/crimeFamily/turf-layout.test.ts`: both S16 cases count ≤ 20 and carry no duplicate `custom_id`. In `test/crimeFamily/progression.test.ts` and plan 4's `recruit-board.test.ts`, the level assertions gain the league (`L1 Bronze`, `L5 · Silver`).

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/turf-league-ui.test.ts test/crimeFamily/turf-layout.test.ts`
Expected: FAIL: `TURF_IDS.city` is not a function; the header has no city.

- [ ] **Step 3: Add the ids, the view fields and `leagueCityFor`**

Per Interfaces.

- [ ] **Step 4: Draw S16's header and city row, S17's Back, and add the routes**

Per Interfaces. The `city` and `lg` routes are `gated` (turf switch) and owner-scoped like `v:map`.

- [ ] **Step 5: Add the league to S10, S29 and S30, and the leaderboard comment**

Per Files.

- [ ] **Step 6: Run the UI suites and the payload audit**

Run: `$VT test/crimeFamily/turf-league-ui.test.ts test/crimeFamily/turf-layout.test.ts test/crimeFamily/layout.test.ts test/crimeFamily/ids-post.test.ts test/crimeFamily/turf-handlers.test.ts test/crimeFamily/turf-command.test.ts test/crimeFamily/progression.test.ts test/crimeFamily/recruit-board.test.ts && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 7: Commit**

```bash
git add src/services/crimeFamily/views.ts src/services/crimeFamily/turfQueries.ts src/services/crimeFamily/turfLeaderboard.ts src/ui/crimeFamily/ids.ts src/ui/crimeFamily/turfScreens.ts src/ui/crimeFamily/familyScreens.ts src/ui/crimeFamily/recruitScreens.ts src/handlers/turfInteractionHandler.ts src/scripts/fixtures/turfScreens.ts test/crimeFamily
git commit -m "feat(turf): the turf map names its city and league and pages between cities; leagues on the family lists

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Help, tutorial, website and the economy audit doc for leagues

**Files:**
- Modify: `src/commands/general/help.ts:331-338` (the `turf` entry), `src/commands/general/tutorial.ts:180`, `dashboard/src/content/modules/crime-families.ts` (header comment `:5-7`, tagline `:11`, "Rackets" `:488-511`, "How rackets pay" `:513-534`, "Bidding" `:536-563`, "Decay and caps" `:615-635`, "Getting better at turf wars" `:637-646`, "The family leaderboard" `:671-676`), `dashboard/src/content/commands.ts:301-312` (the `turf` entry), `dashboard/src/app/changelog/page.tsx:50-134` (the v2.2 Turf entry, H20), `FORTUNA_V2_ECONOMY.md` (the Turf block `:333-354`, the source and sink ledger `:356-382`, the per-player income table near `:268`, Money Sinks `:395`)
- Test: `test/general/help-crime-families.test.ts`

**Interfaces:**
- Consumes: catalog and config values only (`TURF_LEAGUES`, `LEAGUE_RACKET_INCOME`, `RACKETS`, `FAMILY_LEVELS.racketCap`, `familiesPerCity`, `citySurplusDaysToClose`, `cityRebalanceSlack`, `racketEligibleMin`, `bidFloorDays`) and the amendment's §6.5, §10.1, §10.4 and §10.5 tables, copied with every number (house docs rule: exhaustive, exact numbers from source, full tables, a strategy section).
- Produces: copy only. Plan 5 already rewrote the cross-server war lines; leave them.

- [ ] **Step 1: Write the failing test**

Add to `test/general/help-crime-families.test.ts`: the `turf` help entry's description contains "league" and its subcommands say "in your family's city"; the tutorial lesson's `howToUse` turf line contains "your league's city"; `dashboard/src/content/modules/crime-families.ts` (read with `readFileSync`) contains "Low Town", "Midtown", "Uptown", "1,800,000", "4,300,000", "6,400,000 a day per city", "40 active families" and no "6,400,000 a day (44,800,000 a week) across the whole bot" and no "District rackets need family level 4".

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the docs**

- `help.ts` `turf`: description "Your league's city of 10 rackets, weekly bidding and turf wars."; `racket <key|1-10> — a racket in your family's city: owner, income and bidding window`; `bid <key> <amount> — bid on a racket in your family's city (Boss or Underboss)`; the `war` line as plan 5 left it.
- `tutorial.ts:180`: "`{p}turf` shows your league's city of 10 rackets; officers bid from earnings, and members scout and hit in the weekly war."
- `crime-families.ts`:
  - Header comment adds `TURF_LEAGUES` and `LEAGUE_RACKET_INCOME`; tagline ends "…and league cities of rackets to fight over in weekly turf wars."
  - "Rackets": the map is "your league's city"; the 6,400,000 bot-wide paragraph becomes "Each city's ten rackets pay at most 1,800,000 (Bronze), 4,300,000 (Silver) or 6,400,000 a day per city (Gold). A new city opens for every 40 active families in a league, so racket income grows with the number of active families instead of being split ever thinner."; "The ten rackets" table keeps keys, classes, baselines and war times and replaces the income and floor columns with "Income a day (Bronze / Silver / Gold)" and "Bid floor (Bronze / Silver / Gold)" (Corner 100,000 / 200,000 / 300,000 and 700,000 / 1,400,000 / 2,100,000; District 200,000 / 450,000 / 650,000 and 1,400,000 / 3,150,000 / 4,550,000; Crown 300,000 / 850,000 / 1,300,000 and 2,100,000 / 5,950,000 / 9,100,000); the note becomes "Every racket class is open to every family in a city: your league is the gate. A Bronze family holds at most one racket, so a Bronze Crown pays what an old Corner did."
  - New section "Leagues and cities" (after "Rackets"), exhaustive: table "Leagues" (League, Family levels, City name, Racket cap, Best holding a day: Bronze 1–3 Low Town #n 1 300,000; Silver 4–6 Midtown #n 2 1,300,000 (Crown + District); Gold 7–10 Uptown #n 3 2,600,000 (Crown + 2 Districts, at most 1 Crown)); body paragraphs: what a city is (the same 10 rackets, war times and baselines; its own owners, bids and wars); "active family" (at least 3 members who, in the last 7 days, started 2 crew heist seats in this family or made 3 correct war hits for it, not banned; counted by the daily census at 00:10 UTC); cities per league `max(1, ceil(active families / 40))` with the table 0–40 → 1, 41–80 → 2, 81–120 → 3, 4,000 → 100; opening (a closed city reopens first, lowest number first, then a new one); closing (only the highest-numbered city, after 14 censuses in a row with more cities than the league needs, and never while a racket in it is owned or a war in it is live or has a bid; its families get a new city the same census); placement (a family gets a city at the first census where it is active, the emptiest city of its league; until then it can view the map and can't bid); rebalancing (families with no turf at stake move from the fullest to the emptiest city until every city is within 2 families of the league average; a family holding a racket, a top bid or a live war never moves; a moved family's members get a "New city" DM); moving up a league (L3 → L4 and L6 → L7 are refused while the family holds a top bid or fights in a turf war; otherwise its rackets go back to the Street, the unpaid part of the day's cycle is lost, it has no city until the next census, and every member gets a "League move" DM).
  - "Bidding" table: the "First bid" row lists the floors by league; the "Class level" row becomes "City: only rackets in your family's city; a family with no city yet can't bid"; the example in the body uses a Gold city.
  - "The family leaderboard": each line shows the level and league ("L8 Gold"); the Rackets sort counts rackets in every city.
  - "Getting better at turf wars" gains: "Keep 3 members active every week: the census only places active families, and a family with no city can't bid."; "Move up a league between wars: level-ups that change league are refused while you hold a top bid or fight, and they hand your rackets back. Level up right after your rackets pay at :05 so you lose as little of the cycle as possible."; "Silver and Gold pay far more per racket (a Silver Crown pays 850,000 a day against Bronze's 300,000), but the families there are bigger and older."
- `commands.ts` `turf`: `short` "Your league's city of ten rackets: the turf map, weekly bidding from earnings, and the 60-minute turf war you scout and hit in."; the `racket` and `bid` descriptions say "in your family's city"; `keyNumbers` gain Leagues "Bronze L1–3, Silver L4–6, Gold L7–10", Cities "1 per 40 active families per league", Income "Bronze 100,000–300,000, Silver 200,000–850,000, Gold 300,000–1,300,000 a day per racket".
- Changelog v2.2 (keep plan 5's item "Turf war actions (Scout and Hit) work from any server and from the war-soon DM."): the title becomes "Turf: league cities of 10 rackets, weekly bidding and turf wars"; the intro says families fight over their league's city; the Rackets block says "!turf shows your league's city: four Corner, four District and two Crown rackets, all starting with the Street"; two new `FeatureItem`s "Three leagues by family level: Bronze L1–3, Silver L4–6, Gold L7–10" and "A new city opens for every 40 active families in a league".
- `FORTUNA_V2_ECONOMY.md`:
  - Turf block: the leagues table and amendment §6.5's income table (city totals 1,800,000 / 4,300,000 / 6,400,000, bid floors, best holdings); the racket table's income and floor columns by league as on the website; the "6,400,000 per day … bot-wide, fixed whatever the player count" sentence and the class-level sentence go; bullets for the census (00:10 UTC, active family definition, cities per league, opening, the 14-census close rule, placement, the ±2 rebalance) and the league move. The War paragraph keeps plan 5's "Fighters: members of either side, from any server or a DM, passing the `war` gate" sentence.
  - Per-player income: amendment §10.1's table with its League column and derivations, as the current table.
  - Worst-case audit: amendment §10.4's "Many cities" table and the sentence "Per active family the racket ceiling tends to the city total ÷ 40: 45,000 (Bronze), 107,500 (Silver), 160,000 (Gold) a day, so racket income per family is flat as the player count grows."
  - Source and sink ledger: S3 "300k / 650k / 1.3M per cycle (Gold); 100k / 200k / 300k (Bronze); 200k / 450k / 850k (Silver)" with bound "≤ 1,800,000 / 4,300,000 / 6,400,000 per OPEN city per day; per family ≤ 300,000 / 1,300,000 / 2,600,000; needs ≥ 3 eligible members"; K9 "≥ 700k / 1.4M / 2.1M (Bronze) … ≥ 2.1M / 4.55M / 9.1M (Gold)"; a new row "— | League move racket release | nothing minted or burned | the partial cycle is forfeited | per league-changing level-up".
  - The post-launch check paragraph (or a new one in the Crime Families section) adds two read-only counts: OPEN cities per league and active families per league.
  - Money Sinks `:395`: K9 reads "the winning war bid, at least 700,000 (Bronze Corner) to 9,100,000 (Gold Crown), burned at settlement".

- [ ] **Step 4: Run the test and type-check the dashboard**

Run: `$VT test/general/help-crime-families.test.ts && (cd dashboard && npx tsc --noEmit -p .)`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/help.ts src/commands/general/tutorial.ts dashboard/src/content/modules/crime-families.ts dashboard/src/content/commands.ts dashboard/src/app/changelog/page.tsx FORTUNA_V2_ECONOMY.md test/general/help-crime-families.test.ts
git commit -m "docs(turf): leagues, cities, the census and per-league racket income

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification and the owner hand-off

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `$VT`
Expected: every file passes (start the Redis container first; never two vitest runs at once).

- [ ] **Step 2: Static checks**

Run: `npx prisma validate && npm run typecheck && npm run validate:slash && npm run validate:app-emojis && npm run gen:pixel-assets -- --set cf --check`
Expected: schema valid; no type errors; 73/100 slash commands, `/turf` unchanged; app emojis validate without contacting Discord; the cf pixel set is up to date (no new art).

- [ ] **Step 3: Payload audit and tracked-file hygiene**

Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json src/utils/shopCatalog.ts src/services/shopItemEffects.ts && (grep -rn "isTester" src/services/crimeFamily || echo "no isTester") && (grep -rnE "racket\.(findUnique|update|upsert)\(\{ where: \{ key" src test || echo "no key-only racket lookups") && (grep -rn "minFamilyLevel\|incomePerCycle" src/data/crimeFamilyCatalog.ts src/ui/crimeFamily src/scripts/fixtures || echo "no class levels")`
Expected: "All payloads within Discord limits"; the three files unchanged; "no isTester"; "no key-only racket lookups"; "no class levels".

- [ ] **Step 4: Commit any fix-ups, then report the hand-off to the owner**

The hand-off goes in the final message, not in a file. It states:
- Deploy with `workflow_dispatch` and `run_schema: true`: `prisma/` changed in Task 2, not in the last commit. One new collection (`TurfCity`); `Racket` drops its `key` unique index for `[cityId, key]` on an empty collection, so no `--accept-data-loss`.
- Flags unchanged. Stage C (`turfEnabled: true`): the boot seed has already made Low Town #1, Midtown #1 and Uptown #1 with 30 rackets; the first census after the switch (00:10 UTC) places every active family; each city's first bidding windows open 72 h before each racket's war slot.
- H6: the rebalance stops at ±2 of the league average (A43), so 41 Gold families end at 22 / 19, not 20 / 21 as §6.11 suggested; H7 adds `cityRebalanceSlack: 2`.
- H5: the league-move DM is sent at the level-up, since the family has no city until the census.

---

## Self-review notes (for the executor)

- **Spec coverage (amendment sections → tasks):**
  - §6.2 leagues, `leagueOf` → Task 1; A26 names and crests → Tasks 1, 5.
  - §6.3 cities: the 10-racket city, per-city `Racket`/`War` rows → Task 2; count per league, opening, the 14-census close and closure transaction, CLOSED cities get no wars → Tasks 2 (`openWarPeriods`), 3; launch seed of city #1 per league → Task 2 (`seedTurf` inside `startCrimeFamilyJobs`).
  - §6.4 active family and the census: steps 1–2 are plan 4's (`ACTIVE_MEMBERS_STEP`); steps 3–5 (cities, placement, rebalance) → Task 3, appended to `CENSUS_STEPS`.
  - §6.5 income per league, retired class gates, `incomePerCycle` on the row, `bidFloor` from the row → Tasks 1, 2.
  - §6.6 bid blockers (no city, other city) → Task 2; league-changing level-up, S8 warning → Task 4; level never drops → no code (levels only rise).
  - §6.7 data model → Task 2 (all of it, including `Family.cityId/cityPlacedAt` and both new `Family` indexes; `CfJobRun` is plan 4's).
  - §6.8 commands, customIds and screens: `!turf` default city, `racket`/`bid` in the viewer's city → Task 2; racket-id customIds → Task 2; `turf:city`, the pager row, S16 header and status → Task 5; S17 city line → Task 2 (Back in Task 5); S8 → Task 4; S10 → Task 5.
  - §6.9 DMs: rebalance move and closure re-placement (`turf_cities` step) → Task 3; league move → Task 4 (H5).
  - §6.10 edges: 1, 2, 3, 4, 5 → Task 3; 6, 7, 11 → Task 4; 8, 10 → Task 2; 9 → Task 5; 12 → Task 3.
  - §6.11 tests: `league-math` → Task 1; `turf-league.race` → Tasks 3, 4; `openWarPeriods` across 3 cities → Task 2 (`turf-cities.test.ts`); `turf-bid.race` and `racket-seed` updates → Task 2; fixtures S16 placed and unplaced → Task 5, S8 with 3 released → Task 4.
  - §2.6 leaderboard league and `rankedHolders` comment → Task 5; plan 4 F17 (S29/S30) → Task 5.
  - §7.4's turf single writers are unchanged (`tickWars`, `collectRacket`); the census's notices are sent once by plan 4's day-claim CAS.
  - §10.1, §10.4, §10.5 and §12's league rows → Task 6. §11.1 `familiesPerCity`, `citySurplusDaysToClose` → Task 1 (plus H7). §13 stage C → hand-off (Task 7).
- **Deliberately not built here:** sizes, Capos, the vote, recruitment, sharding seams (plan 4); cross-server war actions and the relay (plan 5); a war intel relay (A21, never). The war board and war DMs do not name the city: a family plays in one city, so the racket name is unambiguous to everyone who sees them.
- **Plan 1–5 tests this plan edits:** `catalog.test.ts`, `racket-seed.test.ts`, `turf-jobs.test.ts`, `turf-views.test.ts`, `turf-command.test.ts`, `turf-handlers.test.ts`, `turf-hooks.test.ts`, `turf-layout.test.ts`, `ids-post.test.ts`, `sharding.test.ts` (Task 2); `census.test.ts` runs unchanged with the appended steps (they return at once while `turfEnabled` is false, which is the config default in tests); `progression.test.ts`, `layout.test.ts` (Tasks 4, 5); `recruit-board.test.ts` (Task 5); `test/anticheat/{turf-bid,turf-war,racket-tick}.race.test.ts`, `family-redis-down.test.ts`, `family-tester.test.ts`, `test/router/crew-jail.test.ts` (Task 2).
- **Cross-task names:** `leagueOf`/`leagueDef`/`cityLabel`/`LEAGUE_RACKET_INCOME` (1 → 2–6); `citiesFor`/`pickPlacementCity`/`planRebalance`/`nextCensusAt` (1 → 2, 3, 4); `ensureCity`/`seedCityRackets`/`seedTurf` (2 → 3, 7); `viewerCity`/`openCities`/`citySizes`/`placementTarget`/`racketInCity` (2 → 3, 5); `noCityLine` (2 → 5); `seedTurfCity`/`turfCity`/`racketByKey` (2 → 3–5); `turfStake`/`familiesWithStake` (3 → 4); `placeUnplaced`/`syncLeagueCities`/`rebalanceLeague` (3 → 4's tests); `turfCityMovedNotice` (3), `turfLeagueMoveNotice`/`announceLevelUp` (4); `TURF_IDS.city/cityEdge/league` (5).
