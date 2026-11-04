# Crime Families 2 of 3: Capers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Caper, the family multiplayer heist of spec section 8: a 600 s lobby, a 120 s GO played through the intel ring, Clean/Messy/Bust settlement that pays exactly once across crashes and restarts, `!caper` and `/caper`, screens S11–S15 plus the caper parts of S25 and S28, the `caper` and `caper_lobby` DMs and the minute sweeper, all behind `CRIME_FAMILY_CONFIG`.

**Architecture:** Pure rules (`caperMath.ts`, `intelRing.ts`) decide outcomes, splits and briefs. Three services own the lobby (plan, join, leave, cancel, start), the GO (brief, lock) and settlement (draw, per-seat pay, vault, VOID). Every money write is one `runFamilyTx` with a compare-and-swap on the caper document or a sentinel field (`seatsVersion`, `roll: -1`, `settled`, `refunded`, `vaultPaid`). Discord side effects live in `src/ui/crimeFamily/caper*.ts` (one card writer, one flow module) and are driven by the `cpr:` routes, `!caper` and `sweepCapers`. Plan 1's registries (`FAMILY_HOOKS`, `ACTIVITY_RULES`, `CAPER_ROUTES`, `CF_SCHEDULES`, `DM_NOTICE_TYPES`, `crimeFamilyWorstCases()`) are extended by entries only.

**Tech Stack:** TypeScript, discord.js 14.25 (ComponentsV2), Prisma 5.22 on MongoDB (replica set, interactive transactions), ioredis, node-cron 4.2.1, Node `crypto.randomInt`, vitest with mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` (approved 2026-10-29, Q1–Q4 on defaults). Sections 8 (all), 12.1 caper rows, 12.2 items 3, 6, 7, 9, 10, 11 (caper slices of 6, 7, 9 and 11), 13.1–13.4 caper rows, 14.1 `Caper`/`CaperCrew`, 14.3, 14.4 settlement seams, 15 `sweepCapers`, 17 edges 1–8, 10, 19–27, 30, 53–55, 58–60, 63, 66–72, 75, 78–79, 84 (edge 9, `runFamilyTx`, is plan 1's), 18 caper rows. Asset rules: `DESIGN.md`.

**Depends on:** plan 1, `docs/superpowers/plans/2026-11-04-crime-families-1-foundation.md`, executed in full. Read its "Global Constraints", "Decisions" and "Seams exported to plans 2 and 3" before Task 1: this plan uses those names and types exactly and never redefines them. File citations below are against HEAD `c45d257` plus plan 1's files.

**Plan series:** 1 Foundation → **2 Capers (this plan)** → 3 Turf.

---

## Global Constraints

- `.env` `DATABASE_URL` is the LIVE player database. Never run `npm run dev`, `npm start`, `npm run seed`, `npx prisma db push`, `npx prisma studio`, any `sync:*-emojis` without `--dry-run`, or any `ts-node src/...` not listed here. Allowed: vitest, `npm run typecheck`, `npx prisma validate|format|generate`, `npm run validate:slash`, `npm run validate:app-emojis`, and `checkV2Payloads.ts` only as `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- `$VT <files>` means `MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' <files>`. DB tests need Redis: `docker start casino-test-redis || docker run -d --rm --name casino-test-redis -p 6381:6379 redis:7-alpine`. Never run two vitest processes at once (they clobber `test/.mongo-uri`).
- Commit directly on `main`, never push (a push deploys). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy gate (spec 19.1): `deploy.yml` runs `prisma db push` only when `prisma/` changed in `HEAD~1`. `Caper`/`CaperCrew` land in Task 4, so the owner deploys this plan with `workflow_dispatch` (`run_schema: true`). Task 17 states it in the hand-off.
- Economy is global per `discordId`. `User` and every existing Prisma model are unchanged (D31). `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` are unchanged (D6); prep items are read, never consumed by a caper.
- No buff ever touches caper money (D20): never call `applyIncomeModifiers`, `checkCrownOfGreed`, `checkCounterfeitKit`, `checkDevilContract`, luck helpers or `applyIncomeTax`. The 10% fence replaces income tax (D21).
- No module under `src/services/crimeFamily/` imports `isTester` (D34). Testers keep only the existing skips inside `sendOptOutDm` and `enqueueReminder`.
- Every Mongo filter and CAS uses required fields with sentinels (`status`, `liveSlot: "LIVE"`, `messageId: ""`, `roll: -1`, `choice: -1`, `refunded`, `settled`, `vaultPaid`, `now()`-defaulted dates read only with their status). `Caper.answers` is the only nullable caper field and is never filtered. Any future filter on a nullable field needs `OR: [{ f: null }, { f: { isSet: false } }]` (`src/anticheat/claim.ts:59-84`).
- Money moves only through plan 1's seams and this plan's Task 1 seams: stakes `debitWalletInTx(..., "caper_stake", ...)`; cuts `creditWalletInTx(..., "caper_cut", ..., true)` then `afterEarnedCredit`; refunds `creditWalletInTx(..., "caper_stake_refund", ..., false)` (D60, never `afterEarnedCredit`); fines `applyEconomyPenaltyTx(..., "caper_fine", ...)`; vault cut `creditEarnings(tx, familyId, vaultCut, "caper_cut", "system", meta, { xp })`. Never `addBalance`/`removeBalance` for caper money.
- Every caper transaction runs in `runFamilyTx` (3 attempts). Never catch a P2002 inside a transaction; map it outside with `isUniqueViolation`. Every check a concurrent writer can invalidate (seat gates at Start, family counts, permissions) runs inside the transaction callback so a retry re-checks it. Writers that must conflict write the caper document (`seatsVersion: { increment: 1 }`) or the family document (`touchFamily`).
- All randomness is `crypto.randomInt` through the injectable `Rng` (Task 2), and settlement draws it once, behind the draw CAS (`roll: -1`, CFD-2). Tests inject `scriptedRng`.
- All Crime Families modules import each other statically (plan 1 Global Constraints: a lazy `require` loads a second module copy under vitest); the only lazy requires are the existing ones in `src/index.ts` and `src/commandRouter.ts`. Hook modules (`caperHooks.ts`, `caperRefunds.ts`) never import `familyQueries`, `eligibility`, `membershipService` or `disbandService` (import cycle through `extensions.ts`).
- Redis never guards money or uniqueness. Use plan 1's tri-state `setNx` (fails open); never `redisService.setIfNotExists` (fails closed, `src/services/redisService.ts:76-89`).
- Every UI is ComponentsV2 through plan 1's `cfPayload`/`buildNotice`/`buildOpener`: `allowedMentions: { parse: [] }` everywhere except the GO call (S28) `{ users: <crew ids> }`; no `setAccentColor`, no `content`/`embeds` beside the V2 flag; ≤ 40 components (50035 is swallowed, `src/index.ts:311-318`). Every new screen and variant is a `caperWorstCases()` entry, which both plan 1's layout test and `checkV2Payloads.ts` read.
- Missing art never breaks a payload: missing `cf_caper.png` turns S11's Section into a TextDisplay; a missing tier or result banner omits the MediaGallery and sends no file (D66). Code never requires a banner.
- `cfEmoji` is called only at render time. Role emojis go on roster lines and "Join as…" options; S14 option buttons never carry an emoji and their labels are plain text (8.3).
- Shared caper cards have one writer, `renderCaperCard`, which edits by stored `channelId`/`messageId` and never uses an interaction token. A press on a shared card acks with `deferUpdate` and calls the flow module; it never sends a locally built card.
- DMs go only through `sendOptOutDm`/`notifyMany` with a `DM_NOTICE_TYPES` entry: `caper` (cooldown group, `command: "!caper"`) and `caper_lobby` (account group, no `command`).
- The sweeper is a `CfJob` appended to plan 1's `* * * * *` entry of `CF_SCHEDULES` (UTC, `noOverlap: true`); nothing is added to `src/scheduler.ts`'s banking block.
- `isCrimeFamilyOpen(guildId)` gates planning, joining and the no-live-caper `!caper` view only; leave, start, cancel, brief, lock, render and the sweeper always run, so a live caper finishes under the kill switch (C3, spec 19.2, edge 58).
- Every number in logic comes from `CRIME_FAMILY_CONFIG` or the catalog. Money in caper UI and copy is `fmtFortunes`.
- This plan uploads no emoji and writes nothing to `src/data/emojis.json` (stays `{}`).

## Review Focus

1. **A member whose net worth is within one stake of the tier gate** (2,010,000 for T1): the join passes, the 50,000 stake drops net worth to 1,960,000, and a literal Start re-check would pinch them. Expected: they keep the seat, because the Start check counts the stake already paid (C2). Test: Task 6 "net worth at Start counts the stake already paid".
2. **Role text typed into `!caper join`**: `LOOKOUT`, `lookout`, ` Safecracker `, `safe cracker`, `mastermind`, and `hacker` in a T1 caper. Expected: case and spaces ignored; Mastermind → "The Mastermind seat belongs to the planner."; a role outside the tier → "That role is not part of this caper."; nothing debited on a refusal; `join` passes the whole remainder (`ctx.args.join(" ")`) to `parseRoleArg`. Tests: Task 14 (the `parseRoleArg` table and "!caper join safe cracker seats the member as SAFECRACKER").
3. **A stale brief**: Refresh or an option pressed on an S14 from an earlier caper after that caper resolved, or after `goEndsAt`. Expected: "Too late.", no write, and never the new caper's answers (the customId carries the caper id). Test: Task 7.
4. **The lobby card is deleted, or the bot loses access mid-lobby**: joins still work through `!caper join`, the sweeper still starts the run, crew still get the GO DM, the board is marked dead after one failed repost, and `!caper` reposts it. Test: Task 11 (dead board), Task 14 (`!caper` repost).
5. **Start pressed twice, or racing the last join's auto-start**: exactly one LOBBY → RUNNING transition, one GO message, one set of DMs. Tests: Task 6 (service), Task 11 (one GO message).

## Decisions this plan makes (not in the spec, or refined by plan 1)

| # | Spec ref | Decision | Why |
|---|---|---|---|
| C1 | 8.4 step 7, D55 | VOID when the process booted after `startedAt` (`bootedAt > startedAt`) while the caper is still RUNNING and any seat has `choice = -1`; the spec's "at or before `goEndsAt`" is dropped. `processBootedAt()` = `Date.now() − process.uptime() × 1000`, no stored heartbeat | A RUNNING caper seen by a process that booted after its start was necessarily unsettled across a restart; the old process settles within ≤ 60 s of `goEndsAt`, so a boot after `goEndsAt` still means the GO (or its settle) overlapped downtime. Anti-goal 6 |
| C2 | 8.4 step 5.1, 12.1 | At Start the net-worth gate counts the seat's stake: `computeNetWorth(uid).total + crew.stake ≥ tier.seatGate.netWorth`. Every other gate is plan 1's `checkMemberEligibility` | The stake is burned at join; without this a member at the edge is pinched by their own stake. All seats still need the money at once (11.4) |
| C3 | 19.2, edge 58 | `isCrimeFamilyOpen` gates plan, join and the no-live-caper `!caper` view; nothing else | A kill switch must not strand a GO in flight (brief, lock) or a filled lobby |
| C4 | 8.8 step 1, 15 (c)(d) | Any settler that finds the caper SETTLING proceeds; the draw CAS, per-seat `settled` CAS and `vaultPaid` CAS make it idempotent. Step 5 resolves only when, inside its transaction, no crew row is `settled:false` and `vaultPaid` is true, so the sweeper branch "(d) RESOLVED with `settled:false`" cannot occur and is not built | YAGNI; the precondition makes it structurally impossible |
| C5 | 13.2 attachments, D66 | Whether a card shows its banner is decided by the file existing in this process (`bannerGallery(key) !== null`), not by fetching the message. When an edit returns `"error"` (a rejected payload), `renderCaperCard` retries it once with the file and `attachments: []` | Edits never fetch (13.2); file presence only changes across a deploy, and the retry heals that case |
| C6 | 6.4 kick, 15 (e) | The sweeper re-renders every LOBBY card and every caper that ended (RESOLVED/CANCELLED) in the last `caperEndedRerenderSeconds` (120) | `FamilyHook` has no post-commit step, so a lobby cancelled by a kick, or a result whose render crashed, heals within 60 s |
| C7 | 17 edge 27 | `!caper` reposts the live caper's card in the caller's channel (lobby guild only, old card edited to "Lobby moved"); with no live caper it reposts the latest RESOLVED card of the family when it ended within `caperDeadResultRepostSeconds` (3,600) and its board is dead (`messageId === ""`); otherwise it shows S11 | "The result reaches them through `!caper` (which re-posts)" needs a bounded rule |
| C8 | 21.5 | Start schedules an in-process `setTimeout(goEndsAt + caperSettleDelayMs)` that calls `resolveAndAnnounce`; the sweeper stays authoritative | The result should not wait up to 60 s after GO; the CASes make the double call harmless |
| C9 | 8.4 step 3.1, plan 1 P20 | The 72 h tenure gate applies to every seat, the Boss included (plan 1's `checkMemberEligibility` tenure row); P20 governs only `can()` | Spec text; a new family's other members are Associates for 72 h anyway, so no T1 crew of 3 exists before then |
| C10 | 14.4 `jailUserTx` | `jailUserTx(tx, id, seconds, now)` is a new function with `max(existing, now + seconds)`; `jailUser` is not changed | Changing `jailUser` changes solo crime (non-goal) |
| C11 | 13.4 `caper` reminder | The seat-free reminder uses the existing `cooldownNotice` ("Your **family caper** is ready. Use `!caper`.") through `processDueReminders`; no new builder | One registry entry is enough (`dmPrefsService` memory note) |
| C12 | 18 caper-math | The 8.10 EV tables are recomputed by a helper inside the test, not by production code | Only the test pins them |
| C13 | 17 edge 30 | The wrong-guild refusal reads "This caper is in another server; join that server to play." (no server name) | Services have no client; plan 1's eligibility seam reports the `guild` gate |
| C14 | 13.3 | A CANCELLED or VOID caper's card is Container[Text header, Text body] = 3 components, sent with `attachments: []` | The spec lists no cancelled screen; the edit must clear the lobby banner |
| C15 | 8.4 step 1 | Plan copy uses "Family caper cooldown: ready `<t:R>`." for both plan and Start; seat-limit copy names when the next seat frees | One string per rule |

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/services/crimeFamily/random.ts` | `Rng`, `cryptoRng`, `rollUnit` |
| `src/services/crimeFamily/caperMath.ts` | Pure: patrol chance, outcome, pool split, crew edge, best role bonus |
| `src/services/crimeFamily/intelRing.ts` | Pure: ring order, answers, darkness, leak, the brief view |
| `src/services/crimeFamily/caperRefunds.ts` | Tx primitives: refund a stake, remove a lobby seat, cancel a lobby, void a run |
| `src/services/crimeFamily/caperHooks.ts` | `CAPER_ACTIVITY_RULE` and `CAPER_FAMILY_HOOK` (leave/kick/disband blocks, kick refunds) |
| `src/services/crimeFamily/caperQueries.ts` | Read seams and the S11/S12–S15 view builders |
| `src/services/crimeFamily/caperLobbyService.ts` | Plan, join, leave, cancel, start |
| `src/services/crimeFamily/caperPlayService.ts` | Open brief, lock a choice |
| `src/services/crimeFamily/caperSettleService.ts` | `processBootedAt`, resolve (VOID/corrupt/settle), the draw, per-seat pay, vault |
| `src/services/crimeFamily/caperSweeper.ts` | `sweepCapers`, `SWEEP_CAPERS_JOB` |
| `src/ui/crimeFamily/debounce.ts` | `trailingRender` (14.3 trailing debounce) |
| `src/ui/crimeFamily/caperScreens.ts` | S11–S15, cancelled card, S25 caper card, S28 GO call and "Lobby moved" builders |
| `src/ui/crimeFamily/caperCard.ts` | The one card writer: render, post/repost, dead board, lobby channel pick |
| `src/ui/crimeFamily/caperFlow.ts` | Orchestration shared by routes, `!caper` and the sweeper: lobby DMs, start, resolve, cancel |
| `src/commands/economy/caper.ts` | `!caper` subaction table |
| `src/scripts/fixtures/caperScreens.ts` | `caperWorstCases()` |
| Tests | `test/crimeFamily/{caper-math,intel-ring,caper-hooks,caper-play,caper-layout,caper-flow,caper-handlers,caper-sweeper,caper-command}.test.ts`, `test/crimeFamily/caperFixtures.ts`, `test/anticheat/{caper-join,caper-settle}.race.test.ts` |

**Modify:** `prisma/schema.prisma` (append `Caper`, `CaperCrew`), `src/handlers/crimeFamilyRouter.ts` (the `cpr` missing-entry copy), `src/services/penaltyService.ts:64-145`, `src/services/taxService.ts:43,118-129`, `src/services/jailService.ts` (append), `src/utils/economyConfig.ts` (`CRIME_FAMILY_CONFIG` keys), `src/services/crimeFamily/extensions.ts` (registry entries), `src/services/crimeFamily/views.ts`, `src/services/crimeFamily/scheduler.ts` (minute entry), `src/ui/crimeFamily/ids.ts` (`CPR_IDS`), `src/handlers/caperInteractionHandler.ts` (`CAPER_ROUTES`), `src/scripts/fixtures/crimeFamilyScreens.ts` (append), `src/services/dmPrefsService.ts:14-25`, `src/services/dmNoticeService.ts`, `src/commandRouter.ts` (alias map `:145-196`, `case "caper":` beside plan 1's `case "crew":`, `validCommands` `:618-623`), `src/slash/registry.ts` (after plan 1's `crew` spec), `src/commands/general/help.ts`, `src/commands/general/tutorial.ts`, `test/helpers.ts` (`resetFamilies`), `test/crimeFamily/fakeInteraction.ts`, `test/crimeFamily/handlers.test.ts` (the "Capers open soon." case), `test/wallet/tx-seams.test.ts`, `test/dm/{prefs,investment-notice,family-notice}.test.ts`, `test/anticheat/{family-redis-down,family-tester}.test.ts`, `test/crimeFamily/scheduler.test.ts`, `test/router/crew-jail.test.ts`, `test/slash/registry.test.ts`, `test/general/help-crime-families.test.ts`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/modules/crime-and-heat.ts`, `dashboard/src/content/commands.ts` (`caper` entry, `!settings` lines `:77-78`), `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md`.

---

## Seams consumed from plan 1 (exact names)

`CRIME_FAMILY_CONFIG`, `isCrimeFamilyOpen`; catalog `CaperRoleKey`, `CAPER_ROLES`, `CAPER_TIERS`, `CAPER_OUTCOME_PCT`, `CAPER_SPLIT_PCT`, `caperTier`, `caperRole`, `levelDef`, `CaperTierDef`, `CaperRoleDef`, `GateKey`; `creditWalletInTx`, `afterEarnedCredit`, `debitWalletInTx`, `InsufficientFundsError`, `CreditResult`, `computeNetWorth`, `fmtFortunes`; `runFamilyTx`, `touchFamily`, `FamilyError`, `VaultBusy`, `isUniqueViolation`; `ACTIVITY_RULES`, `FAMILY_HOOKS`, `ActivityRule`, `FamilyHook`, `MemberExitKind`; `checkMemberEligibility`, `eligibilityError`, `EligibilityCheck`, `isActiveMember`; `can`; `getMembership`, `requireMembership`, `listMembers`, `isUnderInvestigation`; `creditEarnings`; `setNx`, `touchActivity`; `notifyMany`; `cfEmoji`, `cfAttachment`, `cfNoticeEmote`; `CfPayload`, `cfPayload`, `cfId`, `parseCfId`, `thumbSection`, `bannerGallery`, `buildOpener`, `buildNotice`, `sendToChannel`, `editChannelMessage`, `missingBotPermissions`, `jumpLink`, `CPR_IDS.viewPlan`; `rejectPress`; `CfInteraction`, `CfRouteEntry`, `CfRouteTable`, `CAPER_ROUTES`; `CfJob`, `CF_SCHEDULES`; `crimeFamilyWorstCases`; test helpers `snowflakeAt`, `daysAgo`, `seedEligibleUser`, `seedFamily`, `resetFamilies`, `ensureUniqueIndexes`, `withCfConfig`, `fakeButton`, `fakeSelect`, `said`.

## Seams exported to plan 3

```ts
// src/services/penaltyService.ts, taxService.ts, jailService.ts       // Task 1
export function applyEconomyPenaltyTx(tx: Prisma.TransactionClient, discordId: string, username: string, amount: number, type: string, meta?: Record<string, unknown>, guildId?: string): Promise<PenaltyAllocation>;
export function addCrimeHeatTx(tx: Prisma.TransactionClient, discordId: string, amount: number): Promise<number>;   // turf: +15 heat on a lost war
export async function migrateLegacyHeatForUser(discordId: string): Promise<void>;                                   // now exported
export function jailUserTx(tx: Prisma.TransactionClient, discordId: string, seconds: number, now?: Date): Promise<Date>;

// src/services/crimeFamily/random.ts                                   // Task 2
export type Rng = (maxExclusive: number) => number;   // integer in [0, maxExclusive)
export const cryptoRng: Rng;                           // (m) => crypto.randomInt(0, m)
export function rollUnit(rng: Rng): number;            // rng(10_000) / 10_000

// src/ui/crimeFamily/debounce.ts                                       // Task 11
export function trailingRender(scope: string, id: string, windowSeconds: number, render: () => Promise<void>): Promise<void>;  // keys cf:render:<scope>:<id> and cf:render:<scope>:pending:<id>

// Registry entries this plan adds (plan 3 appends after them)
// DM_NOTICE_TYPES: caper (cooldown, after crime), caper_lobby (account, after family) → plan 3 adds turf after caper_lobby (panel 29/30 → 30/31)
// ACTIVITY_RULES[0] = CAPER_ACTIVITY_RULE (key "caper_seats", need 2) → plan 3 appends the war-hit rule
// FAMILY_HOOKS[0] = CAPER_FAMILY_HOOK → plan 3 appends its hook
// CF_SCHEDULES["* * * * *"].jobs = [sweepInvites, SWEEP_CAPERS_JOB]
// resetFamilies() also clears Caper and CaperCrew
```

---
### Task 1: Settlement transaction seams (penalty, heat, jail)

**Files:**
- Modify: `src/services/penaltyService.ts:64-145` (extract the transaction body of `applyEconomyPenalty`)
- Modify: `src/services/taxService.ts:43` (export `migrateLegacyHeatForUser`), `:118-129` (`addCrimeHeat` delegates to `addCrimeHeatTx`)
- Modify: `src/services/jailService.ts` (append `jailUserTx`; `jailUser` unchanged, C10)
- Test: `test/wallet/tx-seams.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `withTransactionRetry` (`src/services/walletService.ts:16-28`), `calculatePenaltyAllocation` (`src/services/penaltyService.ts:22`), `invalidateUserCache`.
- Produces (spec 14.4): `applyEconomyPenaltyTx`, `addCrimeHeatTx`, exported `migrateLegacyHeatForUser`, `jailUserTx` (signatures in "Seams exported to plan 3").

- [ ] **Step 1: Write the failing test**

```ts
// append to test/wallet/tx-seams.test.ts
import { applyEconomyPenalty, applyEconomyPenaltyTx } from "../../src/services/penaltyService";
import { addCrimeHeatTx } from "../../src/services/taxService";
import { jailUserTx } from "../../src/services/jailService";

describe("settlement tx seams (14.4)", () => {
  const B = "seam-b";
  const money = async (wallet: number, bank: number) => {
    await testPrisma.wallet.update({ where: { userId: B }, data: { balance: wallet } });
    await testPrisma.bank.upsert({ where: { userId: B }, update: { balance: bank }, create: { userId: B, balance: bank } });
  };
  const user = () => testPrisma.user.findUnique({ where: { discordId: B } });
  // resetUser (test/helpers.ts:29-39) never deletes Audit rows, so each case starts from zero audits for B.
  beforeEach(async () => { await resetUser(B); await testPrisma.audit.deleteMany({ where: { userId: B } }); await seedUser(B); });
  afterAll(async () => { await testPrisma.audit.deleteMany({ where: { userId: B } }); await resetUser(B); });

  it("applyEconomyPenaltyTx allocates exactly like applyEconomyPenalty (wallet first, bank into debt)", async () => {
    await money(100_000, 50_000);
    const a = await prisma.$transaction((tx) => applyEconomyPenaltyTx(tx, B, "B", 300_000, "caper_fine", { caperId: "c" }, "g1"));
    expect(a).toMatchObject({ walletDebit: 100_000, bankDebit: 200_000, newWalletBalance: 0, newBankBalance: -150_000 });
    await money(100_000, 50_000);
    expect(await applyEconomyPenalty(B, "B", 300_000, "caper_fine", { caperId: "c" }, "g1")).toEqual(a);
    expect(await testPrisma.audit.count({ where: { userId: B, type: "caper_fine" } })).toBe(2);
  });

  it("applyEconomyPenaltyTx rolls back with its transaction", async () => {
    await money(100_000, 0);
    await expect(prisma.$transaction(async (tx) => { await applyEconomyPenaltyTx(tx, B, "B", 50_000, "caper_fine", {}); throw new Error("abort"); })).rejects.toThrow("abort");
    expect((await testPrisma.wallet.findUnique({ where: { userId: B } }))!.balance).toBe(100_000);
    expect(await testPrisma.audit.count({ where: { userId: B, type: "caper_fine" } })).toBe(0);
  });

  it("addCrimeHeatTx adds rounded heat inside the transaction and rolls back with it", async () => {
    await testPrisma.user.update({ where: { discordId: B }, data: { crimeHeat: 10 } });
    expect(await prisma.$transaction((tx) => addCrimeHeatTx(tx, B, 45))).toBe(55);
    await expect(prisma.$transaction(async (tx) => { await addCrimeHeatTx(tx, B, 20); throw new Error("abort"); })).rejects.toThrow("abort");
    expect((await user())!.crimeHeat).toBe(55);
  });

  it("jailUserTx never shortens a longer sentence and replaces an expired one", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const later = new Date(+now + 5_000_000);
    await testPrisma.user.update({ where: { discordId: B }, data: { isJailed: true, jailReleaseTime: later } });
    expect(await prisma.$transaction((tx) => jailUserTx(tx, B, 1_200, now))).toEqual(later);
    await testPrisma.user.update({ where: { discordId: B }, data: { isJailed: true, jailReleaseTime: new Date(+now - 1) } });
    expect(+(await prisma.$transaction((tx) => jailUserTx(tx, B, 1_200, now)))).toBe(+now + 1_200_000);
    expect(await user()).toMatchObject({ isJailed: true, jailReleaseTime: new Date(+now + 1_200_000) });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/wallet/tx-seams.test.ts`
Expected: FAIL, `applyEconomyPenaltyTx` is not exported.

- [ ] **Step 3: Implement the seams**

- `applyEconomyPenaltyTx`: the callback body of `applyEconomyPenalty` (`:73-140`) unchanged, taking `tx`; `applyEconomyPenalty` becomes `withTransactionRetry(() => prisma.$transaction((tx) => applyEconomyPenaltyTx(tx, ...)))` then `invalidateUserCache` (same signature and result).
- `addCrimeHeatTx(tx, id, amount)`: `heatGain = Math.max(0, Math.round(amount))`; 0 → read and return `crimeHeat`; else `tx.user.update({ crimeHeat: { increment } })` and return the new value. `addCrimeHeat` = `await migrateLegacyHeatForUser(id); return addCrimeHeatTx(prisma, id, amount)` (the global client satisfies `Prisma.TransactionClient`). Add `export` to `migrateLegacyHeatForUser` (`:43`).
- `jailUserTx(tx, id, seconds, now = new Date())`: read `isJailed`, `jailReleaseTime` (a read, not a filter); `release = isJailed && jailReleaseTime > now ? max(jailReleaseTime, now + seconds) : now + seconds`; write `{ isJailed: true, jailReleaseTime: release }`; return `release`.

- [ ] **Step 4: Run the new tests and the existing users of these functions**

Run: `$VT test/wallet/tx-seams.test.ts test/anticheat/bail.race.test.ts test/anticheat/hunt.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/penaltyService.ts src/services/taxService.ts src/services/jailService.ts test/wallet/tx-seams.test.ts
git commit -m "refactor(crime): tx-scoped penalty, heat and jail seams for caper settlement"
```

---

### Task 2: Caper config keys, the RNG seam and the caper math

**Files:**
- Modify: `src/utils/economyConfig.ts` (add keys to `CRIME_FAMILY_CONFIG`)
- Create: `src/services/crimeFamily/random.ts`, `src/services/crimeFamily/caperMath.ts`
- Test: `test/crimeFamily/caper-math.test.ts`

**Interfaces:**
- Consumes: `CAPER_TIERS`, `CAPER_ROLES`, `caperRole`, `CAPER_OUTCOME_PCT`, `CAPER_SPLIT_PCT`, `CRIME_PREP_WHITELIST` (`src/data/crimePrepWhitelist.ts:16`), `CRIME_FAMILY_CONFIG.patrolCap`/`heatPenaltyPerPoint`.
- Produces:
  - `CRIME_FAMILY_CONFIG` gains `caperWindowSeconds: 86_400, caperRenderDebounceSeconds: 2, caperEndedRerenderSeconds: 120, caperDeadResultRepostSeconds: 3_600, caperTradeLogMinPool: 5_000_000, caperSettleDelayMs: 1_000, activeCaperSeats: 2` (`activeCaperSeats` is the 7.3 active-member need that `CAPER_ACTIVITY_RULE` reads, the twin of plan 3's `activeCorrectHits`).
  - `random.ts`: `Rng`, `cryptoRng`, `rollUnit` (Seams block).
  - `caperMath.ts`: `type CaperOutcome = "CLEAN" | "MESSY" | "BUST"`; `patrolChance(base: number, edge: number, hottestHeat: number): number` (`min(patrolCap, base × (1 − edge) + heatPenaltyPerPoint × H)`, rounded to 6 decimals so 0.1 × 0.9 is exactly 0.09); `resolveCaperOutcome(i: { n: number; misses: number; roll: number; base: number; edge: number; hottestHeat: number }): CaperOutcome` (spec 8.5 verbatim, `bustAt = n ≤ 4 ? 2 : 3`, `roll < q` → MESSY); `splitCaperPool(i: { poolPerSeat: number; n: number; outcome: CaperOutcome; locked: readonly boolean[] }): { pool: number; crewShare: number; vaultCut: number; cutPerSeat: number; cuts: number[] }` (`pool = floor(B × n × pct / 100)`, `crewShare = floor(pool × 80 / 100)`, `vaultCut = floor(pool × 10 / 100)`, `cutPerSeat = floor(crewShare / n)`, `cuts[i] = locked[i] ? cutPerSeat : 0`); `bestRoleBonus(role: CaperRoleKey, owned: ReadonlySet<string>): number` (max `successBonus` of owned keys of that role, 0 when none); `crewEdge(bonuses: readonly number[]): number` (mean, 0 for none).

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/caper-math.test.ts
import { describe, it, expect } from "vitest";
import { patrolChance, resolveCaperOutcome, splitCaperPool, bestRoleBonus, crewEdge, type CaperOutcome } from "../../src/services/crimeFamily/caperMath";
import { caperTier, CAPER_ROLES, type CaperTierDef } from "../../src/data/crimeFamilyCatalog";
import { CRIME_PREP_WHITELIST } from "../../src/data/crimePrepWhitelist";
import { rollUnit } from "../../src/services/crimeFamily/random";

const bonus = (k: string) => CRIME_PREP_WHITELIST.find((p) => p.key === k)!.successBonus;

describe("patrol chance and outcome (8.5)", () => {
  it("computes q with the heat term and the 0.60 cap", () => {
    expect(patrolChance(0.10, 0.10, 0)).toBe(0.09);
    expect(patrolChance(0.10, 0, 69)).toBe(0.238);
    expect(patrolChance(0.25, 0.8 / 6, 39)).toBe(0.294667);
    expect(patrolChance(0.25, 0, 200)).toBe(0.6);
  });
  it.each([[3, 0, "CLEAN"], [3, 1, "MESSY"], [3, 2, "BUST"], [4, 1, "MESSY"], [4, 2, "BUST"], [5, 2, "MESSY"], [5, 3, "BUST"], [6, 2, "MESSY"], [6, 3, "BUST"], [5, 5, "BUST"]] as const)(
    "n=%i with %i misses → %s", (n, misses, want) => expect(resolveCaperOutcome({ n, misses, roll: 0.5, base: 0.1, edge: 0, hottestHeat: 0 })).toBe(want));
  it("a perfect run is MESSY below q and CLEAN at q", () => {
    expect(resolveCaperOutcome({ n: 4, misses: 0, roll: 0.0899, base: 0.1, edge: 0.1, hottestHeat: 0 })).toBe("MESSY");
    expect(resolveCaperOutcome({ n: 4, misses: 0, roll: 0.09, base: 0.1, edge: 0.1, hottestHeat: 0 })).toBe("CLEAN");
  });
  it("rollUnit maps an integer draw to [0, 1) in 1/10,000 steps", () => {
    expect(rollUnit(() => 900)).toBe(0.09);
    expect(rollUnit(() => 9_999)).toBe(0.9999);
  });
});

describe("splitCaperPool (8.6)", () => {
  const all = (n: number) => Array(n).fill(true);
  it.each([
    [1, 3, "CLEAN", 1_050_000, 840_000, 105_000, 280_000], [1, 4, "CLEAN", 1_400_000, 1_120_000, 140_000, 280_000],
    [2, 4, "CLEAN", 2_200_000, 1_760_000, 220_000, 440_000], [2, 5, "CLEAN", 2_750_000, 2_200_000, 275_000, 440_000],
    [3, 5, "CLEAN", 4_250_000, 3_400_000, 425_000, 680_000], [3, 6, "CLEAN", 5_100_000, 4_080_000, 510_000, 680_000],
    [4, 5, "CLEAN", 6_000_000, 4_800_000, 600_000, 960_000], [4, 6, "CLEAN", 7_200_000, 5_760_000, 720_000, 960_000],
    [1, 3, "MESSY", 367_500, 294_000, 36_750, 98_000], [1, 4, "MESSY", 490_000, 392_000, 49_000, 98_000],
    [2, 4, "MESSY", 770_000, 616_000, 77_000, 154_000], [2, 5, "MESSY", 962_500, 770_000, 96_250, 154_000],
    [3, 5, "MESSY", 1_487_500, 1_190_000, 148_750, 238_000], [3, 6, "MESSY", 1_785_000, 1_428_000, 178_500, 238_000],
    [4, 5, "MESSY", 2_100_000, 1_680_000, 210_000, 336_000], [4, 6, "MESSY", 2_520_000, 2_016_000, 252_000, 336_000],
  ] as const)("T%i n=%i %s", (tier, n, outcome, pool, crewShare, vaultCut, cut) => {
    expect(splitCaperPool({ poolPerSeat: caperTier(tier).poolPerSeat, n, outcome, locked: all(n) }))
      .toEqual({ pool, crewShare, vaultCut, cutPerSeat: cut, cuts: Array(n).fill(cut) });
  });
  it("BUST mints nothing; an unlocked seat gets 0; remainders are never minted", () => {
    expect(splitCaperPool({ poolPerSeat: 350_000, n: 3, outcome: "BUST", locked: all(3) }).cuts).toEqual([0, 0, 0]);
    expect(splitCaperPool({ poolPerSeat: 350_000, n: 3, outcome: "MESSY", locked: [true, false, true] }).cuts).toEqual([98_000, 0, 98_000]);
    const odd = splitCaperPool({ poolPerSeat: 100_001, n: 3, outcome: "CLEAN", locked: all(3) });
    expect(odd).toMatchObject({ pool: 300_003, crewShare: 240_002, vaultCut: 30_000, cutPerSeat: 80_000 });
    expect(odd.cuts.reduce((a, b) => a + b, 0) + odd.vaultCut).toBeLessThanOrEqual(Math.floor(odd.pool * 0.9));
  });
});

describe("edge (8.2)", () => {
  const extremes = (pick: (xs: number[]) => number) => CAPER_ROLES.map((r) => pick(r.prepKeys.map(bonus)));
  it("best owned bonus per role; none owned → 0", () => {
    expect(bestRoleBonus("SAFECRACKER", new Set(["thief_gloves", "cheat_sheet", "iron_rifle"]))).toBe(0.13);
    expect(bestRoleBonus("DRIVER", new Set(["thief_gloves"]))).toBe(0);
  });
  it("matches the spec's weakest and best crew edges", () => {
    const lo = extremes((x) => Math.min(...x)); const hi = extremes((x) => Math.max(...x));
    expect(crewEdge(lo.slice(0, 3))).toBeCloseTo(0.0733, 4);
    expect(crewEdge(lo)).toBeCloseTo(0.08, 10);
    expect([3, 4, 5, 6].map((n) => +crewEdge(hi.slice(0, n)).toFixed(4))).toEqual([0.1333, 0.13, 0.132, 0.1333]);
    expect(crewEdge([])).toBe(0);
  });
});

// C12: the 8.10 tables, recomputed from the catalog. A config change fails here and forces a docs update.
function caperEv(t: CaperTierDef, n: number, p: number, edge: number) {
  const choose = (k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  const q = patrolChance(t.patrolBase, edge, 0);
  const bustAt = n <= 4 ? 2 : 3;
  let pMessy = Math.pow(p, n) * q, pBust = 0;
  for (let k = 1; k <= n; k++) { const pk = choose(k) * Math.pow(1 - p, k) * Math.pow(p, n - k); if (k >= bustAt) pBust += pk; else pMessy += pk; }
  const pClean = Math.pow(p, n) * (1 - q);
  const split = (o: CaperOutcome) => splitCaperPool({ poolPerSeat: t.poolPerSeat, n, outcome: o, locked: Array(n).fill(true) });
  const gross = split("CLEAN").cutPerSeat * pClean + split("MESSY").cutPerSeat * pMessy;
  const fine = t.bustFine * pBust;
  const net = gross - t.stake - fine;
  return [`${(pClean * 100).toFixed(2)}%`, `${(pMessy * 100).toFixed(2)}%`, `${(pBust * 100).toFixed(2)}%`, Math.round(gross), Math.round(fine), Math.round(net), Math.round(2 * net),
    Math.round(split("CLEAN").vaultCut * pClean + split("MESSY").vaultCut * pMessy)];
}

describe("expected value (8.10)", () => {
  it("realistic play, p = 0.90, edge 0.10", () => {
    expect([[1, 3], [1, 4], [2, 4], [2, 5], [3, 5], [3, 6], [4, 5], [4, 6]].map(([t, n]) => caperEv(caperTier(t), n, 0.9, 0.1))).toEqual([
      ["66.34%", "30.86%", "2.80%", 215_993, 4_200, 161_793, 323_586, 80_997],
      ["59.71%", "35.06%", "5.23%", 201_538, 7_845, 143_693, 287_386, 100_769],
      ["56.75%", "38.02%", "5.23%", 308_258, 15_690, 192_568, 385_137, 154_129],
      ["51.08%", "48.07%", "0.86%", 298_763, 2_568, 196_195, 392_390, 186_727],
      ["48.42%", "50.72%", "0.86%", 449_980, 4_280, 270_700, 541_400, 281_237],
      ["43.58%", "54.84%", "1.58%", 426_843, 7_925, 243_918, 487_836, 320_132],
      ["45.76%", "53.38%", "0.86%", 618_685, 6_420, 312_265, 624_530, 386_678],
      ["41.19%", "57.23%", "1.58%", 587_679, 11_887, 275_792, 551_584, 440_759],
    ]);
  });
  it("strong crew, p = 0.95: net per caper", () => {
    expect([[1, 4], [2, 5], [3, 6], [4, 6]].map(([t, n]) => caperEv(caperTier(t), n, 0.95, 0.1)[5])).toEqual([179_422, 244_900, 327_781, 389_069]);
  });
  it("perfect play stays at or under 1,200,000/day per account including the payday cap (D50, 11.4)", () => {
    expect([[1, 3], [2, 5], [3, 6], [4, 6]].map(([t, n]) => caperEv(caperTier(t), n, 1, 0.1)[6])).toEqual([427_240, 602_780, 850_880, 1_039_200]);
    const worst = caperEv(caperTier(4), 6, 1, 0.8 / 6)[6] as number;
    expect(worst).toBe(1_049_600);
    expect(worst + Math.floor((1_000_000 * 0.95) / 7)).toBeLessThanOrEqual(1_200_000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/caper-math.test.ts`
Expected: FAIL, cannot resolve `caperMath`.

- [ ] **Step 3: Add the config keys, `random.ts` and `caperMath.ts`** as specified under Interfaces. Integer percent arithmetic only (`CAPER_OUTCOME_PCT`, `CAPER_SPLIT_PCT`), so T1 n=4 Messy is 98,000, not 97,999.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/caper-math.test.ts test/crimeFamily/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/economyConfig.ts src/services/crimeFamily/random.ts src/services/crimeFamily/caperMath.ts test/crimeFamily/caper-math.test.ts
git commit -m "feat(capers): outcome math, pool split, crew edge and the RNG seam"
```

---

### Task 3: The intel ring and the brief view

**Files:**
- Create: `src/services/crimeFamily/intelRing.ts`
- Modify: `src/services/crimeFamily/views.ts` (add `BriefView`)
- Test: `test/crimeFamily/intel-ring.test.ts`

**Interfaces:**
- Consumes: `CAPER_ROLES`, `caperRole`, `Rng`, `CRIME_FAMILY_CONFIG.leakAtSecondsLeft`.
- Produces:
  - `type CaperAnswers = { order: CaperRoleKey[]; seats: Partial<Record<CaperRoleKey, { options: string[]; correct: number }>> }`
  - `ringOrder(filled: readonly CaperRoleKey[]): CaperRoleKey[]` (CAPER_ROLES order filtered to filled)
  - `buildAnswers(filled: readonly CaperRoleKey[], rng: Rng): CaperAnswers` (per seat in ring order: Fisher–Yates over the role's 6 labels with `rng`, keep the first 4, then `correct = rng(4)`)
  - `parseAnswers(json: unknown): CaperAnswers | null` (null unless `order` is a non-empty array of role keys and every role in it has 4 distinct strings and an integer `correct` in 0..3; edge 63)
  - `ringNeighbours(order: readonly CaperRoleKey[], role: CaperRoleKey): { prev: CaperRoleKey; next: CaperRoleKey }`
  - `leakAtOf(goEndsAt: Date): Date` (`goEndsAt − leakAtSecondsLeft`)
  - `isDark(seat: { briefOpened: boolean; briefOpenedAt: Date }, leakAt: Date): boolean` (`!briefOpened || briefOpenedAt ≥ leakAt`)
  - `briefFor(i: { caperId: string; answers: CaperAnswers; role: CaperRoleKey; seats: readonly { role: CaperRoleKey; userId: string; briefOpened: boolean; briefOpenedAt: Date; choice: number }[]; goEndsAt: Date; now: Date }): BriefView`
  - `views.ts` gains `BriefView { caperId: string; ownerId: string; role: CaperRoleKey; tell: { userId: string; label: string }; call: { question: string; options: string[]; fromUserId: string }; leaked: string | null; dark: boolean; lockedIndex: number | null; goEndsAt: Date; leakAt: Date }`.
- **Ring direction (spec 8.3 rule 4 and the 4.2 example are the source of truth):** seat *i*'s correct answer is shown only to seat *(i + 1) mod n*. So a seat's brief **tells its `prev`** that seat's own answer (`tell = { userId: prev, label: prev's correct label }`), and **its own intel comes from `next`** (`call.fromUserId = next`). In T2 n=5 (Mastermind, Lookout, Safecracker, Driver, Muscle) the Muscle tells the Driver the route and hears the door from the Mastermind. The leak: seat X sees `leaked` (its own correct label) when `now ≥ leakAt` and its `next` is dark. `dark` is true for the viewer only when `now ≥ leakAt` and `isDark(viewer)`; `lockedIndex` is `choice` or null at −1.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/intel-ring.test.ts
import { describe, it, expect } from "vitest";
import { ringOrder, buildAnswers, parseAnswers, ringNeighbours, leakAtOf, isDark, briefFor } from "../../src/services/crimeFamily/intelRing";
import { resolveCaperOutcome } from "../../src/services/crimeFamily/caperMath";
import { caperRole, type CaperRoleKey } from "../../src/data/crimeFamilyCatalog";
import { cryptoRng } from "../../src/services/crimeFamily/random";

const T2: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"];
const ids = Object.fromEntries(T2.map((r, i) => [r, `u${i}`])) as Record<CaperRoleKey, string>;
const goEndsAt = new Date("2026-11-04T19:08:00Z");
const leakAt = leakAtOf(goEndsAt);
const opened = new Date("2026-11-04T19:06:30Z");
const seats = (dark: CaperRoleKey[] = []) => T2.map((role) => ({ role, userId: ids[role], briefOpened: !dark.includes(role), briefOpenedAt: opened, choice: -1 }));
const correctLabel = (a: ReturnType<typeof buildAnswers>, r: CaperRoleKey) => a.seats[r]!.options[a.seats[r]!.correct];

describe("intel ring (8.3)", () => {
  it("orders the ring by 8.2 over filled seats only", () => {
    expect(ringOrder(["MUSCLE", "MASTERMIND", "SAFECRACKER", "LOOKOUT"])).toEqual(["MASTERMIND", "LOOKOUT", "SAFECRACKER", "MUSCLE"]);
    expect(ringNeighbours(ringOrder(["MUSCLE", "MASTERMIND", "SAFECRACKER", "LOOKOUT"]), "SAFECRACKER")).toEqual({ prev: "LOOKOUT", next: "MUSCLE" });
    expect(ringNeighbours(T2, "MASTERMIND")).toEqual({ prev: "MUSCLE", next: "LOOKOUT" });
  });

  it("gives each seat 4 distinct labels from its own pool and a correct index in 0..3", () => {
    const a = buildAnswers(T2, cryptoRng);
    expect(a.order).toEqual(T2);
    for (const r of T2) {
      expect(new Set(a.seats[r]!.options).size).toBe(4);
      for (const o of a.seats[r]!.options) expect(caperRole(r).labels).toContain(o);
      expect([0, 1, 2, 3]).toContain(a.seats[r]!.correct);
    }
  });

  it("draws the correct index uniformly (chi-square, 3 dof, p > 0.001)", () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[buildAnswers(["MASTERMIND", "LOOKOUT", "SAFECRACKER"], cryptoRng).seats.LOOKOUT!.correct]++;
    expect(counts.reduce((s, c) => s + (c - 2_500) ** 2 / 2_500, 0)).toBeLessThan(16.27);
  });

  it("4.2: the Muscle tells the Driver the route and hears the door from the Mastermind", () => {
    const a = buildAnswers(T2, cryptoRng);
    const b = briefFor({ caperId: "c", answers: a, role: "MUSCLE", seats: seats(), goEndsAt, now: opened });
    expect(b.tell).toEqual({ userId: ids.DRIVER, label: correctLabel(a, "DRIVER") });
    expect(b.call).toEqual({ question: "Which door is unguarded", options: a.seats.MUSCLE!.options, fromUserId: ids.MASTERMIND });
    expect([b.leaked, b.dark, b.lockedIndex, b.ownerId]).toEqual([null, false, null, ids.MUSCLE]);
  });

  it("isDark: unopened, or opened at or after leakAt", () => {
    expect(isDark({ briefOpened: false, briefOpenedAt: opened }, leakAt)).toBe(true);
    expect(isDark({ briefOpened: true, briefOpenedAt: new Date(+leakAt - 1) }, leakAt)).toBe(false);
    expect(isDark({ briefOpened: true, briefOpenedAt: leakAt }, leakAt)).toBe(true);
  });

  it("leaks a seat's own answer from leakAt, only when its intel holder (next) is dark", () => {
    const a = buildAnswers(T2, cryptoRng);
    const s = seats(["MASTERMIND"]);                      // the Muscle's holder went dark
    expect(briefFor({ caperId: "c", answers: a, role: "MUSCLE", seats: s, goEndsAt, now: new Date(+leakAt - 1) }).leaked).toBeNull();
    expect(briefFor({ caperId: "c", answers: a, role: "MUSCLE", seats: s, goEndsAt, now: leakAt }).leaked).toBe(correctLabel(a, "MUSCLE"));
    expect(briefFor({ caperId: "c", answers: a, role: "DRIVER", seats: s, goEndsAt, now: leakAt }).leaked).toBeNull();
    const darkSelf = briefFor({ caperId: "c", answers: a, role: "MASTERMIND", seats: s, goEndsAt, now: leakAt });
    expect(darkSelf.dark).toBe(true);
  });

  it("an all-dark crew is all misses and Busts", () => {
    expect(resolveCaperOutcome({ n: 5, misses: 5, roll: 0.99, base: 0.15, edge: 0.1, hottestHeat: 0 })).toBe("BUST");
  });

  it("parseAnswers rejects missing or malformed data (edge 63)", () => {
    const a = buildAnswers(T2, cryptoRng);
    expect(parseAnswers(JSON.parse(JSON.stringify(a)))).toEqual(a);
    for (const bad of [null, undefined, {}, { order: [] }, { order: ["MASTERMIND"], seats: {} }, { order: ["MASTERMIND"], seats: { MASTERMIND: { options: ["a", "a", "b", "c"], correct: 0 } } }, { order: ["MASTERMIND"], seats: { MASTERMIND: { options: ["a", "b", "c", "d"], correct: 4 } } }])
      expect(parseAnswers(bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/intel-ring.test.ts`
Expected: FAIL, cannot resolve `intelRing`.

- [ ] **Step 3: Implement `intelRing.ts` and add `BriefView` to `views.ts`** as specified under Interfaces. `call.question` is `caperRole(role).call`.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/intel-ring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/intelRing.ts src/services/crimeFamily/views.ts test/crimeFamily/intel-ring.test.ts
git commit -m "feat(capers): the server-randomised intel ring, darkness and the leak"
```

---

### Task 4: Caper models, refund primitives and the family hooks

**Files:**
- Modify: `prisma/schema.prisma` (append `Caper` and `CaperCrew` verbatim from spec 14.1)
- Create: `src/services/crimeFamily/caperRefunds.ts`, `src/services/crimeFamily/caperHooks.ts`, `src/services/crimeFamily/caperQueries.ts` (read seams only; Task 10 adds the view builders)
- Modify: `src/services/crimeFamily/extensions.ts` (`ACTIVITY_RULES = [CAPER_ACTIVITY_RULE]`, `FAMILY_HOOKS = [CAPER_FAMILY_HOOK]`), `test/helpers.ts` (`resetFamilies` also deletes `caperCrew` then `caper`)
- Create: `test/crimeFamily/caperFixtures.ts`
- Test: `test/crimeFamily/caper-hooks.test.ts`

**Interfaces:**
- Consumes: `creditWalletInTx`, `FamilyError`, `ActivityRule`/`FamilyHook`/`MemberExitKind` (type-only imports), `buildAnswers`, `scriptedRng`, plan 1 test helpers.
- Produces:
  - `caperRefunds.ts` (all take `tx`; none opens a transaction):
    - `refundStakeInTx(tx, row: CaperCrew, reason: string): Promise<CreditResult>` → `creditWalletInTx(tx, row.userId, row.userId, row.stake, "caper_stake_refund", { caperId: row.caperId, role: row.role, reason }, false)`
    - `removeSeatInTx(tx, row: CaperCrew, reason: "leave" | "kick" | "pinched"): Promise<void>` → CAS `caper.updateMany({ where: { id: row.caperId, status: "LOBBY" }, data: { seatsVersion: { increment: 1 } } })` (`count 0` → `FamilyError("Lobby closed.")`), `caperCrew.deleteMany({ where: { id: row.id, started: false } })` (`count 0` → `FamilyError("That seat is already gone.")`), `refundStakeInTx`
    - `cancelCaperInTx(tx, caperId: string, now: Date): Promise<CaperCrew[]>` → CAS LOBBY → `{ status: "CANCELLED", outcome: "CANCELLED", liveSlot: caperId, seatsVersion: { increment: 1 } }` (`count 0` → `FamilyError("Lobby closed.")`); per row CAS `{ id, refunded: false }` → `{ refunded: true, liveSlot: caperId }` and refund on `count 1`; `family.update({ nextCaperAt: now + cancelledLobbyCooldownSeconds })`; returns the refunded rows
    - `voidCaperInTx(tx, caperId: string): Promise<CaperCrew[]>` → CAS `{ id, status: "RUNNING" }` (only a RUNNING caper is ever voided: `resolveCaper` validates `answers` and the C1 restart rule before its RUNNING → SETTLING CAS, so a SETTLING caper is always settled, never voided) → `{ status: "CANCELLED", outcome: "VOID", liveSlot: caperId }` (`count 0` → returns `[]`); per row CAS `{ id, refunded: false }` → `{ refunded: true, started: false, liveSlot: caperId }` and refund
  - `caperHooks.ts` (imports only `prisma`, config, `caperRefunds`, types):
    - `CAPER_ACTIVITY_RULE: ActivityRule = { key: "caper_seats", label: "caper seats", need: CRIME_FAMILY_CONFIG.activeCaperSeats, count: (uid, since) => caperCrew.count({ userId, started: true, startedAt ≥ since }) }`
    - `CAPER_FAMILY_HOOK: FamilyHook = { key: "caper", memberExitBlock, onMemberExit, disbandBlock }`: the user's live seat is `tx.caperCrew.findFirst({ where: { userId, liveSlot: "LIVE" } })` plus its caper. `memberExitBlock`: `LEFT` with a seat in LOBBY/RUNNING/SETTLING → `"You are seated in a live caper. Leave its lobby with \`!caper leave\`, or wait for it to finish."`; `KICKED` with a seat in RUNNING/SETTLING → `` `<@${userId}> is in a running caper.` ``. `onMemberExit` (`KICKED`, seat in LOBBY): a `MASTERMIND` row → `cancelCaperInTx(tx, caperId, now)`; any other → `removeSeatInTx(tx, row, "kick")`. `disbandBlock`: any family caper LOBBY → `"A caper is in its lobby."`; RUNNING or SETTLING → `"A caper is running."`.
  - `caperQueries.ts`: `getCaper(caperId: string): Promise<Caper | null>` (exactly `prisma.caper.findUnique({ where: { id } })` on the global client; race tests patch this call), `getLiveCaper(familyId: string): Promise<Caper | null>` (`liveSlot: "LIVE"`), `listCrew(caperId: string): Promise<CaperCrew[]>`, `liveSeatOf(userId: string): Promise<CaperCrew | null>`, `startedSeatsSince(userId: string, since: Date): Promise<CaperCrew[]>` (ascending `startedAt`), `startedCapersSince(familyId: string, since: Date): Promise<Caper[]>` (status in RUNNING/SETTLING/RESOLVED, ascending `startedAt`).
  - `test/crimeFamily/caperFixtures.ts`:
    - `G = "g1"`, `CH = "c1"`; `scriptedRng(values: number[]): Rng` (returns `values[i] % max` in order; throws `"rng exhausted"`)
    - `txCount(type: string, userIds: readonly string[]): Promise<number>`: `transaction.count({ where: { type, walletId: { in: <wallet ids of userIds> } } })`. Every caper test counts `Transaction` rows through this helper, never with an unscoped `{ type }` filter: `resetFamilies` does not delete `Transaction` rows and each test seeds fresh users, so an unscoped count also sees the earlier tests of the same file.
    - `setCaperUpdatedAt(caperId: string, at: Date): Promise<void>`: `testPrisma.$runCommandRaw({ update: "Caper", updates: [{ q: { _id: { $oid: caperId } }, u: { $set: { updatedAt: { $date: at.toISOString() } } } }] })` (a raw write, because Prisma stamps `@updatedAt` itself on every `update`); the sweeper and `!caper` tests backdate ended capers with it.
    - `caperCrew(o: { tier?: 1|2|3|4; roles: CaperRoleKey[]; plannerRank?: "BOSS" | "CAPO"; plannerId?: string; wallet?: number; joinedDaysAgo?: number }): Promise<{ family: Family; bossId: string; ids: Record<CaperRoleKey, string> }>`: one `seedEligibleUser` per role owning `caperRole(role).prepKeys[0]` (the MASTERMIND user with `id: plannerId` when given), wallet `tier.seatGate.netWorth + 1_000_000` unless given; the MASTERMIND user is the Boss (`plannerRank` "BOSS", default) or a Capo under a separate unseated Boss, who is seeded with the same wallet and **no** prep item; everyone else a Soldier; family level `caperTier(tier).levelToPlan`, `homeGuildId: G`, `homeChannelId: CH`, members joined `joinedDaysAgo` (10) days ago
    - `seedLobby(o: { tier?; roles: CaperRoleKey[]; plannerRank?; now?: Date }): Promise<{ caper: Caper; family: Family; bossId: string; ids: Record<CaperRoleKey, string> }>`: `caperCrew` plus direct writes of `Caper{ status: "LOBBY", liveSlot: "LIVE", plannerId: ids.MASTERMIND, guildId: G, channelId: CH, lobbyClosesAt: now + 600 s }` and one unstarted crew row per role with `stake = tier.stake` (no wallet debit)
    - `seedRunning(o: { tier?; roles: CaperRoleKey[]; picks?: Partial<Record<CaperRoleKey, "right" | "wrong" | "none">>; dark?: CaperRoleKey[]; startedAt?: Date; goEndsAt?: Date; edge?: number; heatSnapshot?: number; status?: "RUNNING" | "SETTLING"; wallet?: number }): Promise<{ caper: Caper; family: Family; bossId: string; ids: Record<CaperRoleKey, string>; answers: CaperAnswers }>`: every wallet defaults to 0 (the stakes were paid at join), so settlement tests read cuts directly; `startedAt` default now − 60 s, `goEndsAt` = `startedAt + 120 s`; answers from `buildAnswers(roles, scriptedRng([0..99]))`; started rows (`startedAt`, `stake`), `briefOpened: true, briefOpenedAt: startedAt + 1 s` except `dark` roles (`briefOpened: false`); `choice` = correct (`right`, default), `(correct + 1) % 4` (`wrong`) or −1 (`none`)

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/caper-hooks.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { leaveFamily, kickMember } from "../../src/services/crimeFamily/membershipService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { isActiveMember } from "../../src/services/crimeFamily/eligibility";
import { runFamilyTx } from "../../src/services/crimeFamily/tx";
import { cancelCaperInTx, removeSeatInTx } from "../../src/services/crimeFamily/caperRefunds";
import { testPrisma, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";
import { seedLobby, seedRunning, txCount } from "./caperFixtures";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const crew = (caperId: string) => testPrisma.caperCrew.findMany({ where: { caperId } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("caper family hooks (6.4, 7.3)", () => {
  it("leave is refused while seated in a LOBBY or a RUNNING caper", async () => {
    const lobby = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await expect(leaveFamily(lobby.ids.LOOKOUT)).rejects.toThrow("You are seated in a live caper. Leave its lobby with `!caper leave`, or wait for it to finish.");
    await resetFamilies();
    const run = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await expect(leaveFamily(run.ids.SAFECRACKER)).rejects.toThrow(/seated in a live caper/);
  });

  it("kicking a LOBBY seat deletes it and refunds the stake as unearned income", async () => {
    const { caper, ids, bossId } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const before = await wallet(ids.LOOKOUT);
    await kickMember(bossId, ids.LOOKOUT);
    expect((await crew(caper.id)).map((r) => r.role).sort()).toEqual(["MASTERMIND", "SAFECRACKER"]);
    expect(await wallet(ids.LOOKOUT)).toBe(before + 50_000);
    const w = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: w!.id, type: "caper_stake_refund" } })).toMatchObject({ amount: 50_000, isEarned: false });
    expect((await testPrisma.caper.findUnique({ where: { id: caper.id } }))!.seatsVersion).toBe(1);
  });

  it("kicking the Mastermind cancels the lobby, refunds every stake once and sets the 30-minute cooldown", async () => {
    const now = new Date();
    const { caper, ids, bossId, family } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], plannerRank: "CAPO" });
    const before = await Promise.all(Object.values(ids).map(wallet));
    await kickMember(bossId, ids.MASTERMIND, now);
    expect(await testPrisma.caper.findUnique({ where: { id: caper.id } })).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED", liveSlot: caper.id });
    expect((await crew(caper.id)).every((r) => r.refunded && r.liveSlot === caper.id)).toBe(true);
    expect(await Promise.all(Object.values(ids).map(wallet))).toEqual(before.map((b) => b + 50_000));
    expect(+(await testPrisma.family.findUnique({ where: { id: family.id } }))!.nextCaperAt).toBe(+now + 1_800_000);
  });

  it("kicking a member seated in a RUNNING caper is refused", async () => {
    const { ids, bossId } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await expect(kickMember(bossId, ids.LOOKOUT)).rejects.toThrow(`<@${ids.LOOKOUT}> is in a running caper.`);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: ids.LOOKOUT } })).not.toBeNull();
  });

  it.each([["LOBBY", "A caper is in its lobby."], ["RUNNING", "A caper is running."], ["SETTLING", "A caper is running."]] as const)(
    "disband is refused while a caper is %s", async (status, msg) => {
      const seeded = status === "LOBBY"
        ? await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] })
        : await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], status });
      await expect(disbandFamily(seeded.bossId, seeded.family.tag)).rejects.toThrow(msg);
    });

  it("two started seats in 7 days make a member active for payday; one does not", async () => {
    const { ids } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], startedAt: daysAgo(6) });
    expect((await isActiveMember(ids.LOOKOUT, new Date())).active).toBe(false);
    await testPrisma.caperCrew.create({ data: { caperId: "65f000000000000000000009", familyId: "65f000000000000000000009", userId: ids.LOOKOUT, role: "LOOKOUT", liveSlot: "65f000000000000000000009", stake: 50_000, started: true, startedAt: daysAgo(1) } });
    expect((await isActiveMember(ids.LOOKOUT, new Date())).active).toBe(true);
  });

  it("primitives: removing a seat twice or from a closed lobby, and cancelling twice, refund once", async () => {
    const { caper, ids } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const [row] = (await crew(caper.id)).filter((r) => r.role === "LOOKOUT");
    await runFamilyTx((tx) => removeSeatInTx(tx, row, "leave"));
    await expect(runFamilyTx((tx) => removeSeatInTx(tx, row, "leave"))).rejects.toThrow("That seat is already gone.");
    const rs = await Promise.allSettled([runFamilyTx((tx) => cancelCaperInTx(tx, caper.id, new Date())), runFamilyTx((tx) => cancelCaperInTx(tx, caper.id, new Date()))]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(3);   // 1 leave + 2 cancel refunds
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/caper-hooks.test.ts`
Expected: FAIL, `caperFixtures`/`caperRefunds` not found.

- [ ] **Step 3: Append the models and regenerate**

`Caper` and `CaperCrew` exactly as spec 14.1. Then:
Run: `npx prisma validate && npx prisma generate`
Expected: "The schema … is valid" and "Generated Prisma Client". Do not run `db push`.

- [ ] **Step 4: Implement `caperRefunds.ts`, `caperHooks.ts`, `caperQueries.ts` (read seams), the registry entries, the fixtures and the `resetFamilies` extension** as specified under Interfaces.

- [ ] **Step 5: Run the new test and every plan 1 crime-family suite (the registries are no longer empty)**

Run: `$VT test/crimeFamily test/anticheat/family-membership.race.test.ts test/anticheat/family-vault.race.test.ts test/anticheat/family-disband.race.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/services/crimeFamily/caperRefunds.ts src/services/crimeFamily/caperHooks.ts src/services/crimeFamily/caperQueries.ts src/services/crimeFamily/extensions.ts test/helpers.ts test/crimeFamily/caperFixtures.ts test/crimeFamily/caper-hooks.test.ts
git commit -m "feat(capers): Caper and CaperCrew models, refund primitives and family hooks"
```

---
### Task 5: Plan, join, leave and cancel

**Files:**
- Create: `src/services/crimeFamily/caperLobbyService.ts`
- Test: `test/anticheat/caper-join.race.test.ts`

**Interfaces:**
- Consumes: `requireMembership`, `can(member, "plan_caper", now)`, `isUnderInvestigation`, `checkMemberEligibility(uid, \`caper_t${tier}\`, { role, guildId, expectedGuildId, now })`, `eligibilityError`, `debitWalletInTx`, `runFamilyTx`, `touchFamily`, `isUniqueViolation`, `getCaper`, `liveSeatOf`, `startedSeatsSince`, `startedCapersSince`, `removeSeatInTx`, `cancelCaperInTx`, `caperTier`, `caperRole`, `levelDef`, `CRIME_PREP_WHITELIST` (item names).
- Produces:
  - `planCaper(input: { uid: string; tier: number; guildId: string; channelId: string; now?: Date }): Promise<Caper>`
  - `joinCaper(input: { caperId: string; uid: string; role: CaperRoleKey; guildId: string | null; now?: Date }): Promise<{ caper: Caper; seat: CaperCrew; full: boolean }>`: `caper` is `tx.caper.findUniqueOrThrow({ where: { id } })` read inside the transaction after the CAS and the insert (so `seatsVersion` includes this join), never the pre-check `getCaper` snapshot; `full` = `tx.caperCrew.count({ where: { caperId } }) === tier.crewMax` in the same transaction
  - `leaveCaper(caperId: string, uid: string, now?: Date): Promise<{ cancelled: boolean }>`
  - `cancelCaper(caperId: string, actorId: string | null, now?: Date): Promise<CaperCrew[]>` (`null` = the sweeper; a user must be the planner or the family's current Boss, edge 2)
  - `tierRoles(tier: CaperTierDef): CaperRoleKey[]` (`[...required, optional]` in ring order) and `openRoles(tier, filled: readonly CaperRoleKey[]): CaperRoleKey[]` (`tierRoles(tier)` minus `filled` minus `MASTERMIND`: the Mastermind seat is never open, because only the planner holds it and losing it cancels the caper)
- Rules and exact copy (each refusal is a `FamilyError` thrown before any write, or rolls the whole transaction back):
  - Plan, checked in exactly this order (the first failure wins): tier not 1–4 → `"Pick a tier from 1 to 4."`; `requireMembership`; `getLiveCaper(familyId)` → `"Your family already has a live caper."`; `!can(member, "plan_caper")` → `"Only a Capo or above can plan a caper."`; `level < tier.levelToPlan` → `` `${tier.name} unlocks at family level ${tier.levelToPlan}.` ``; `isUnderInvestigation` → `"Your family is under investigation: no capers until fewer than 3 members are at 100 heat."`; `now < nextCaperAt` → `` `Family caper cooldown: ready <t:${unix(nextCaperAt)}:R>.` `` (C15); `startedCapersSince(fam, now − caperWindowSeconds).length ≥ capersPerFamilyPer24h` → `` `Your family has run 4 capers in the last 24 hours. Next slot <t:${unix(oldest.startedAt + window)}:R>.` ``; then the planner's seat gates for MASTERMIND (below). Transaction: re-read the family (`null` → `"You are not in a crime family."`), re-check cooldown and the 24 h count, `touchFamily`, `caper.create({ familyId, tier, plannerId, guildId, channelId, lobbyClosesAt: now + lobbySeconds })`, `debitWalletInTx(tx, uid, tier.stake, "caper_stake", { caperId, role: "MASTERMIND" })`, `caperCrew.create({ role: "MASTERMIND", stake: tier.stake })`. Outside: `Caper_familyId_liveSlot_key` → `"Your family already has a live caper."`; `CaperCrew_userId_liveSlot_key` → `"You already hold a seat in a live caper."`.
  - Seat gates (shared by plan and join, `seatGates(uid, caper-or-tier, role, guildId, now)`): `requireMembership`; member's family must be the caper's (`"This caper belongs to another family."`); `checkMemberEligibility` failures: a `guild` failure → `"This caper is in another server; join that server to play."` (C13); otherwise `eligibilityError(failures)` with, when `prep_item` failed, `` ` ${role.name} needs one of: ${names.join(", ")}.` `` appended (names from `CRIME_PREP_WHITELIST`); `liveSeatOf(uid)` → `"You already hold a seat in a live caper."`; `startedSeatsSince(uid, now − caperWindowSeconds).length ≥ seatsPer24h` → `` `You've used both caper seats in the last 24 hours. A seat frees <t:${unix(oldest.startedAt + window)}:R>.` ``.
  - Join: `getCaper` (its pinned read) must be LOBBY with `lobbyClosesAt > now` (`"Lobby closed."`); `role === "MASTERMIND"` → `"The Mastermind seat belongs to the planner."`; role not in `tierRoles(tier)` → `"That role is not part of this caper."`; seat gates. Transaction (CFD-1): CAS `caper.updateMany({ where: { id, status: "LOBBY", lobbyClosesAt: { gt: now } }, data: { seatsVersion: { increment: 1 } } })` (`count 0` → `"Lobby closed."`), `debitWalletInTx(tx, uid, tier.stake, "caper_stake", { caperId, role })`, `caperCrew.create`. Outside: `CaperCrew_caperId_role_key` → `"Role just taken."`; `CaperCrew_caperId_userId_key` or `CaperCrew_userId_liveSlot_key` → `"Already in this caper."`.
  - Leave: no LOBBY seat → `"You are not in this caper."` (a LOBBY caper always has its MASTERMIND row: every path that removes it cancels the caper, so the planner always finds their seat); a started caper → `"The caper has started; your seat is locked in."`; the Mastermind → `cancelCaperInTx` (`cancelled: true`); else `removeSeatInTx(tx, row, "leave")`.
  - Cancel: actor not the planner and not the current Boss → `"Only the planner or the Boss can cancel this caper."`; `cancelCaperInTx`.

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/caper-join.race.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { planCaper, joinCaper, leaveCaper, cancelCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { questBus } from "../../src/services/questEvents";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { testPrisma, resetFamilies, ensureUniqueIndexes, seedEligibleUser } from "../helpers";
import { caperCrew, txCount, G, CH } from "../crimeFamily/caperFixtures";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const crew = (caperId: string) => testPrisma.caperCrew.findMany({ where: { caperId } });
const plan = (uid: string, tier = 1, now?: Date) => planCaper({ uid, tier, guildId: G, channelId: CH, now });
const join = (caperId: string, uid: string, role: any, now?: Date, guildId = G) => joinCaper({ caperId, uid, role, guildId, now });
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);
const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("plan (8.4 step 1)", () => {
  it("opens a 600 s lobby, seats the planner as Mastermind and takes the stake", async () => {
    const now = new Date();
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    const c = await plan(ids.MASTERMIND, 1, now);
    expect(c).toMatchObject({ familyId: family.id, tier: 1, status: "LOBBY", liveSlot: "LIVE", plannerId: ids.MASTERMIND, guildId: G, channelId: CH, messageId: "", seatsVersion: 0 });
    expect(+c.lobbyClosesAt).toBe(+now + 600_000);
    expect(await crew(c.id)).toMatchObject([{ userId: ids.MASTERMIND, role: "MASTERMIND", stake: 50_000, started: false, liveSlot: "LIVE" }]);
    expect(await wallet(ids.MASTERMIND)).toBe(before - 50_000);
  });

  it("refuses with the reason and takes nothing", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    await expect(plan(ids.LOOKOUT)).rejects.toThrow("Only a Capo or above can plan a caper.");
    await expect(plan(ids.MASTERMIND, 2)).rejects.toThrow("Payroll Van unlocks at family level 3.");
    await expect(plan(ids.MASTERMIND, 5)).rejects.toThrow("Pick a tier from 1 to 4.");
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(Date.now() + 3_600_000) } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow(/^Family caper cooldown: ready <t:\d+:R>\.$/);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date() } });
    for (let k = 0; k < 4; k++) await testPrisma.caper.create({ data: { familyId: family.id, tier: 1, status: "RESOLVED", liveSlot: `old${k}`, plannerId: ids.MASTERMIND, guildId: G, channelId: CH, lobbyClosesAt: new Date(), startedAt: new Date(Date.now() - 3_600_000) } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow(/^Your family has run 4 capers in the last 24 hours\. Next slot <t:\d+:R>\.$/);
    await testPrisma.caper.updateMany({ where: { liveSlot: "old0" }, data: { status: "CANCELLED", outcome: "VOID" } });   // VOID never counts
    for (const id of [ids.LOOKOUT, ids.SAFECRACKER, ids.DRIVER]) await testPrisma.user.update({ where: { discordId: id }, data: { crimeHeat: 100 } });
    await expect(plan(ids.MASTERMIND)).rejects.toThrow("Your family is under investigation: no capers until fewer than 3 members are at 100 heat.");
    expect(await wallet(ids.MASTERMIND)).toBe(before);
  });

  it("plan racing disband: exactly one commits", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const before = await wallet(ids.MASTERMIND);
    const [p, d] = await Promise.allSettled([plan(ids.MASTERMIND), disbandFamily(ids.MASTERMIND, family.tag)]);
    expect([p.status, d.status].filter((s) => s === "fulfilled")).toHaveLength(1);
    if (d.status === "fulfilled") { expect(await testPrisma.caper.count()).toBe(0); expect(await wallet(ids.MASTERMIND)).toBe(before); }
    else expect((d as PromiseRejectedResult).reason.message).toMatch(BUSY_OR("A caper is in its lobby."));
  });
});

describe("join (8.4 steps 2-3)", () => {
  it("takes a seat and its stake; full is true once every seat up to the tier maximum is filled", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    expect((await join(c.id, ids.LOOKOUT, "LOOKOUT")).full).toBe(false);
    await join(c.id, ids.SAFECRACKER, "SAFECRACKER");
    const r = await join(c.id, ids.DRIVER, "DRIVER");
    expect(r.full).toBe(true);
    expect(r.caper.seatsVersion).toBe(3);
  });

  it("refuses the Mastermind seat, a role outside the tier, another guild and a missing prep item, with no debit", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    const before = await wallet(ids.LOOKOUT);
    await expect(join(c.id, ids.LOOKOUT, "MASTERMIND")).rejects.toThrow("The Mastermind seat belongs to the planner.");
    await expect(join(c.id, ids.LOOKOUT, "HACKER")).rejects.toThrow("That role is not part of this caper.");
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", undefined, "g2")).rejects.toThrow("This caper is in another server; join that server to play.");
    await expect(join(c.id, ids.LOOKOUT, "DRIVER")).rejects.toThrow("Driver needs one of: Iron Spurs, Guard Vest, Arctic Wolf Spirit Charm.");
    expect(await wallet(ids.LOOKOUT)).toBe(before);
    expect(await crew(c.id)).toHaveLength(1);
  });

  it("same user double join, two roles at once: one row, one stake", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const both = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["hunting_permit", "mechanic_toolkit"] });
    const c = await plan(ids.MASTERMIND);
    await testPrisma.familyMember.create({ data: { familyId: c.familyId, userId: both, role: "SOLDIER", roleSlot: both, seat: 9, joinedAt: new Date(Date.now() - 10 * 864e5) } });
    const rs = await Promise.allSettled([join(c.id, both, "LOOKOUT"), join(c.id, both, "SAFECRACKER")]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Already in this caper."));
    expect(await wallet(both)).toBe(2_950_000);
  });

  it("same role race between two members: one seat; the loser keeps their money", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    const twin = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["hunting_permit"] });
    await testPrisma.familyMember.create({ data: { familyId: c.familyId, userId: twin, role: "SOLDIER", roleSlot: twin, seat: 9, joinedAt: new Date(Date.now() - 10 * 864e5) } });
    const lookoutBefore = await wallet(ids.LOOKOUT);
    const rs = await Promise.allSettled([join(c.id, ids.LOOKOUT, "LOOKOUT"), join(c.id, twin, "LOOKOUT")]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Role just taken."));
    expect((await crew(c.id)).filter((r) => r.role === "LOOKOUT")).toHaveLength(1);
    expect(lookoutBefore - (await wallet(ids.LOOKOUT)) + (3_000_000 - (await wallet(twin)))).toBe(50_000);
  });

  it("one live caper per family: a second plan is refused", async () => {
    const { ids, bossId } = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    await plan(ids.MASTERMIND);
    const briefcase = await testPrisma.shopItem.findFirst({ where: { catalogKey: "business_briefcase" } });
    await testPrisma.inventory.create({ data: { userId: bossId, shopItemId: briefcase!.id, amount: 1 } });   // the fixture's unseated Boss owns no prep item
    await expect(plan(bossId)).rejects.toThrow("Your family already has a live caper.");
    expect(await testPrisma.caper.count()).toBe(1);
  });

  it("dues arrears do not block planning (spec 7.4, D30)", async () => {
    const { ids, family } = await caperCrew({ tier: 1, roles: [...T1] });
    await testPrisma.family.update({ where: { id: family.id }, data: { duesArrears: 3 } });
    const c = await plan(ids.MASTERMIND);
    expect(c.status).toBe("LOBBY");
  });

  it("join after lobbyClosesAt is refused by the CAS with no debit", async () => {
    const now = new Date();
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND, 1, now);
    const before = await wallet(ids.LOOKOUT);
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", new Date(+now + 600_001))).rejects.toThrow("Lobby closed.");
    expect(await wallet(ids.LOOKOUT)).toBe(before);
  });

  it("join vs cancel (interleave): the joiner has no orphan row, keeps their stake and can join the next lobby", async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    const before = await wallet(ids.LOOKOUT);
    // joinCaper's pre-check is getCaper → prisma.caper.findUnique({ where: { id } }) on the global client.
    const delegate = prisma.caper as any; const original = delegate.findUnique; let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.id === c.id) { first = false; await cancelCaper(c.id, ids.MASTERMIND); }
      return snapshot;                                    // stale: still LOBBY
    };
    try { await expect(join(c.id, ids.LOOKOUT, "LOOKOUT")).rejects.toThrow("Lobby closed."); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect(await testPrisma.caperCrew.count({ where: { userId: ids.LOOKOUT } })).toBe(0);
    expect(await wallet(ids.LOOKOUT)).toBe(before);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date() } });
    const next = await plan(ids.MASTERMIND);
    await expect(join(next.id, ids.LOOKOUT, "LOOKOUT")).resolves.toMatchObject({ full: false });
  });

  it("enforces the rolling 2-seat cap across UTC midnight (23 h 59 m in, 24 h 1 m out)", async () => {
    const now = new Date("2026-11-05T00:01:00Z");
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const seat = (startedAt: Date, k: number) => testPrisma.caperCrew.create({ data: { caperId: `65f00000000000000000000${k}`, familyId: family.id, userId: ids.LOOKOUT, role: "LOOKOUT", liveSlot: `65f00000000000000000000${k}`, stake: 50_000, started: true, startedAt } });
    await seat(new Date("2026-11-04T00:02:00Z"), 1); await seat(new Date("2026-11-04T23:00:00Z"), 2);
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(+now - 1) } });
    const c = await plan(ids.MASTERMIND, 1, now);
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", now)).rejects.toThrow(/^You've used both caper seats in the last 24 hours\. A seat frees <t:1793836920:R>\.$/);
    await testPrisma.caperCrew.updateMany({ where: { userId: ids.LOOKOUT, liveSlot: "65f000000000000000000001" }, data: { startedAt: new Date("2026-11-04T00:00:00Z") } });
    await expect(join(c.id, ids.LOOKOUT, "LOOKOUT", now)).resolves.toBeTruthy();
  });

  it("refunds are unearned: leave refunds once, emits no economy:earn, and frees the role", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    const emit = vi.spyOn(questBus, "emit");
    await leaveCaper(c.id, ids.LOOKOUT);
    await expect(leaveCaper(c.id, ids.LOOKOUT)).rejects.toThrow("You are not in this caper.");
    expect(emit).not.toHaveBeenCalledWith("economy:earn", expect.anything());
    emit.mockRestore();
    const w = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
    expect(await testPrisma.transaction.findMany({ where: { walletId: w!.id, type: "caper_stake_refund" } })).toMatchObject([{ amount: 50_000, isEarned: false }]);
    await expect(join(c.id, ids.SAFECRACKER, "SAFECRACKER")).resolves.toBeTruthy();
  });

  it("the Mastermind leaving cancels and refunds everyone once; cancel is planner-or-Boss only", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    await expect(cancelCaper(c.id, ids.LOOKOUT)).rejects.toThrow("Only the planner or the Boss can cancel this caper.");
    expect(await leaveCaper(c.id, ids.MASTERMIND)).toEqual({ cancelled: true });
    expect(await testPrisma.caper.findUnique({ where: { id: c.id } })).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED", liveSlot: c.id });
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(2);
  });

  it("after a chair handover the current Boss, not only the planner, can cancel a Capo's caper (edge 2)", async () => {
    const { ids, bossId } = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    const c = await plan(ids.MASTERMIND);
    await join(c.id, ids.LOOKOUT, "LOOKOUT");
    expect(await cancelCaper(c.id, bossId)).toHaveLength(2);
    expect((await testPrisma.caper.findUnique({ where: { id: c.id } }))!.status).toBe("CANCELLED");
    expect(await txCount("caper_stake_refund", [ids.MASTERMIND, ids.LOOKOUT])).toBe(2);
    await expect(cancelCaper(c.id, bossId)).rejects.toThrow("Lobby closed.");
    expect(await txCount("caper_stake_refund", [ids.MASTERMIND, ids.LOOKOUT])).toBe(2);
  });
});
```

The second-plan refusal comes from the pre-check `getLiveCaper(familyId)`, which runs before `can` and before any seat gate (the order under "Rules"), or, in a race, from the `Caper_familyId_liveSlot_key` P2002. The fixture's unseated Boss holds the default wallet; the test gives them a briefcase only so the case would still pass if the order were ever changed to gates-first.

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/caper-join.race.test.ts`
Expected: FAIL, cannot resolve `caperLobbyService`.

- [ ] **Step 3: Implement `caperLobbyService.ts`** (plan, join, leave, cancel, `tierRoles`, `openRoles`, the shared `seatGates`) as specified under Interfaces. `planCaper` checks `getLiveCaper(familyId)` before its transaction (`"Your family already has a live caper."`). The 2-seat cap test's expected stamp is `unix(2026-11-04T00:02Z + 24h)` = `1793836920`.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/anticheat/caper-join.race.test.ts test/crimeFamily/caper-hooks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperLobbyService.ts test/anticheat/caper-join.race.test.ts
git commit -m "feat(capers): plan, join, leave and cancel with join-vs-cancel race tests"
```

---
### Task 6: Start: re-validation, pinches, the run's draw and the family cooldown

**Files:**
- Modify: `src/services/crimeFamily/caperLobbyService.ts` (add `startCaper`)
- Test: append `describe("start (8.4 step 5)")` to `test/anticheat/caper-join.race.test.ts`

**Interfaces:**
- Consumes: `checkMemberEligibility`, `computeNetWorth`, `getOwnedPrepKeys` (`src/services/crimeService.ts:76`), `bestRoleBonus`, `crewEdge`, `buildAnswers`, `ringOrder`, `Rng`/`cryptoRng`, `removeSeatInTx`, `startedCapersSince`, `startedSeatsSince`, `levelDef`, `tierRoles`.
- Produces:
  - `type StartBy = { kind: "press"; uid: string } | { kind: "auto" } | { kind: "sweeper" }`
  - `type StartResult = { status: "started" | "pinched" | "waiting" | "closed" | "cancelled"; pinched: { userId: string; role: CaperRoleKey }[]; reason: string | null }`
  - `startCaper(caperId: string, by: StartBy, now?: Date, rng?: Rng): Promise<StartResult>`
- Behaviour: a press by anyone but the planner or the family's current Boss throws `FamilyError("Only the planner or the Boss can start this caper.")`; a press with required roles unfilled returns `waiting` with reason `` `Fill the required roles first: ${names.join(", ")}.` ``. Everything else is one `runFamilyTx` whose callback (so every retry re-checks):
  1. Reads the caper (`status !== "LOBBY"` → `closed`) and its crew.
  2. Re-validates every seat: `checkMemberEligibility(uid, gate, { role, now })` minus its `net_worth` row, plus C2's `computeNetWorth(uid).total + row.stake ≥ tier.seatGate.netWorth`, plus membership in the caper's family, plus the rolling seat cap (`startedSeatsSince(uid, now − window).length < seatsPer24h`). Failing non-Mastermind rows → `removeSeatInTx(tx, row, "pinched")` (deleted, refunded unearned). A failing **MASTERMIND** row instead → `cancelCaperInTx(tx, caperId, now)` (every stake refunded once, `nextCaperAt = now + cancelledLobbyCooldownSeconds`) and return `cancelled` with reason `` `<@${plannerId}> got pinched; the caper was cancelled and every stake refunded.` `` (spec 8.4 step 4 and edge 3: losing the planner's seat cancels the caper; removing it alone would leave a lobby nobody can start, since `joinCaper` refuses MASTERMIND and `openRoles` never lists it). Other failing rows found in the same pass are not removed separately: the cancel refunds them with everyone.
  3. Required roles no longer filled → `pinched` (at least one removal) or `waiting`; the caper stays LOBBY.
  4. Family re-check: `now < nextCaperAt` → `waiting`, reason `` `Family caper cooldown: ready <t:R>.` ``; 24 h count at the cap → `waiting`, reason the plan copy.
  5. CAS `caper.updateMany({ where: { id, status: "LOBBY" }, data: { status: "RUNNING", startedAt: now, goEndsAt: now + goSeconds, answers: buildAnswers(ringOrder(filled), rng), edge: crewEdge(bonuses), heatSnapshot: max(crimeHeat), seatsVersion: { increment: 1 } } })`; `count 0` → `closed`.
  6. Every remaining row → `{ started: true, startedAt: now, itemBonus: bestRoleBonus(role, owned) }`.
  7. `family.update({ nextCaperAt: now + levelDef(level).caperCooldownSeconds })`.
  Returns `started` with the pinched list and `reason: null`; `pinched` carries `` `${mentions} got pinched (stake refunded). Fill the required roles before the lobby closes.` ``; `closed` carries `"Lobby closed."`; `cancelled` carries the planner-pinched copy above and `pinched: [{ userId: plannerId, role: "MASTERMIND" }]`. Discord effects (S13, GO message, DMs, reminders) are Task 11's `runStart`, which renders `cancelled` exactly like a cancel (C14 card).

- [ ] **Step 1: Write the failing tests (append)**

```ts
// add to the imports of test/anticheat/caper-join.race.test.ts:
import { startCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { computeNetWorth } from "../../src/services/netWorthService";
import { caperTier } from "../../src/data/crimeFamilyCatalog";
import { scriptedRng } from "../crimeFamily/caperFixtures";

// Sets uid's wallet so that net worth + the paid stake lands exactly on `target`, whatever else (prep items at their
// ShopItem price, bank) the seed left in the net worth (src/services/netWorthService.ts:94-99 counts inventory).
async function walletForStartNetWorth(uid: string, target: number) {
  const nw = await computeNetWorth(uid);
  const stake = caperTier(1).stake;
  await testPrisma.wallet.update({ where: { userId: uid }, data: { balance: target - stake - (nw.total - nw.wallet) } });
}

async function fullLobby(roles: readonly string[] = T1, now = new Date()) {
  const f = await caperCrew({ tier: 1, roles: [...roles] as any });
  const c = await plan(f.ids.MASTERMIND, 1, now);
  for (const r of roles) if (r !== "MASTERMIND") await join(c.id, f.ids[r as keyof typeof f.ids], r, now);
  return { ...f, caper: c };
}

describe("start (8.4 step 5)", () => {
  it("starts with every seat filled: stakes locked, the draw stored, heat snapshot, edge and the family cooldown", async () => {
    const now = new Date();
    const { family, ids, caper } = await fullLobby(T1, now);
    await testPrisma.user.update({ where: { discordId: ids.LOOKOUT }, data: { crimeHeat: 30 } });
    expect(await startCaper(caper.id, { kind: "auto" }, now)).toEqual({ status: "started", pinched: [], reason: null });
    const c = (await testPrisma.caper.findUnique({ where: { id: caper.id } }))!;
    expect(c).toMatchObject({ status: "RUNNING", startedAt: now, goEndsAt: new Date(+now + 120_000), heatSnapshot: 30, roll: -1, outcome: "" });
    expect(c.edge).toBeCloseTo((0.10 + 0.09 + 0.08 + 0.10) / 4, 10);    // first prep key of each role
    expect((c.answers as any).order).toEqual(["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"]);
    expect((await crew(caper.id)).every((r) => r.started && +r.startedAt === +now && r.liveSlot === "LIVE")).toBe(true);
    expect(+(await testPrisma.family.findUnique({ where: { id: family.id } }))!.nextCaperAt).toBe(+now + 10_800_000);
  });

  it("only the planner or the current Boss may press Start; required roles first", async () => {
    const { ids, caper } = await fullLobby(["MASTERMIND", "LOOKOUT"]);
    await expect(startCaper(caper.id, { kind: "press", uid: ids.LOOKOUT })).rejects.toThrow("Only the planner or the Boss can start this caper.");
    expect(await startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })).toEqual({ status: "waiting", pinched: [], reason: "Fill the required roles first: Safecracker." });
  });

  it("pinches a member jailed during the lobby, refunds them and starts with the rest", async () => {
    const { ids, caper } = await fullLobby();
    await testPrisma.user.update({ where: { discordId: ids.DRIVER }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    const before = await wallet(ids.DRIVER);
    expect(await startCaper(caper.id, { kind: "auto" })).toMatchObject({ status: "started", pinched: [{ userId: ids.DRIVER, role: "DRIVER" }] });
    expect(await wallet(ids.DRIVER)).toBe(before + 50_000);
    expect((await crew(caper.id)).map((r) => r.role).sort()).toEqual(["LOOKOUT", "MASTERMIND", "SAFECRACKER"]);
  });

  it("a member who used up their only prep item is pinched; a broken required role keeps the lobby open", async () => {
    const { ids, caper } = await fullLobby();
    await testPrisma.inventory.deleteMany({ where: { userId: ids.LOOKOUT } });
    expect(await startCaper(caper.id, { kind: "auto" })).toMatchObject({ status: "pinched", pinched: [{ userId: ids.LOOKOUT, role: "LOOKOUT" }] });
    expect((await testPrisma.caper.findUnique({ where: { id: caper.id } }))!.status).toBe("LOBBY");
  });

  it("net worth at Start counts the stake already paid (C2, Review Focus 1)", async () => {
    const gate = caperTier(1).seatGate.netWorth;                                   // 2,000,000
    const { ids, caper } = await fullLobby(["MASTERMIND", "LOOKOUT", "SAFECRACKER"]);
    await walletForStartNetWorth(ids.SAFECRACKER, gate);                           // net worth + stake = gate exactly
    expect(await startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })).toMatchObject({ status: "started", pinched: [] });
    await resetFamilies();
    const again = await fullLobby(["MASTERMIND", "LOOKOUT", "SAFECRACKER"]);
    await walletForStartNetWorth(again.ids.SAFECRACKER, gate - 1);                 // one Fortune short
    expect(await startCaper(again.caper.id, { kind: "auto" })).toMatchObject({ status: "pinched", pinched: [{ userId: again.ids.SAFECRACKER, role: "SAFECRACKER" }] });
  });

  it("a pinched planner cancels the caper: every stake refunded once and the 30-minute cooldown (spec 8.4 step 4, edge 3)", async () => {
    const now = new Date();
    const { family, ids, caper } = await fullLobby(T1, now);
    await testPrisma.user.update({ where: { discordId: ids.MASTERMIND }, data: { isJailed: true, jailReleaseTime: new Date(+now + 3_600_000) } });
    const before = await Promise.all(Object.values(ids).map(wallet));
    expect(await startCaper(caper.id, { kind: "auto" }, now)).toEqual({
      status: "cancelled", pinched: [{ userId: ids.MASTERMIND, role: "MASTERMIND" }],
      reason: `<@${ids.MASTERMIND}> got pinched; the caper was cancelled and every stake refunded.`,
    });
    expect(await testPrisma.caper.findUnique({ where: { id: caper.id } })).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED", liveSlot: caper.id });
    expect(await Promise.all(Object.values(ids).map(wallet))).toEqual(before.map((b) => b + 50_000));
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(4);
    expect(+(await testPrisma.family.findUnique({ where: { id: family.id } }))!.nextCaperAt).toBe(+now + 1_800_000);
  });

  it("after a chair handover the current Boss can Start a Capo's caper (edge 2)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1], plannerRank: "CAPO" });
    const c = await plan(f.ids.MASTERMIND);
    await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
    expect(await startCaper(c.id, { kind: "press", uid: f.bossId })).toMatchObject({ status: "started" });
  });

  it("waits while the family cooldown is running (edge 71)", async () => {
    const { family, caper } = await fullLobby();
    await testPrisma.family.update({ where: { id: family.id }, data: { nextCaperAt: new Date(Date.now() + 600_000) } });
    expect(await startCaper(caper.id, { kind: "auto" })).toMatchObject({ status: "waiting", reason: expect.stringMatching(/^Family caper cooldown: ready <t:\d+:R>\.$/) });
    expect((await testPrisma.caper.findUnique({ where: { id: caper.id } }))!.status).toBe("LOBBY");
  });

  it("Start pressed twice and racing the auto-start: exactly one run (Review Focus 5)", async () => {
    const { ids, caper } = await fullLobby();
    const rs = await Promise.all([startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND }), startCaper(caper.id, { kind: "auto" }), startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND })].map((p) => p.catch((e) => ({ status: e.message }))));
    expect(rs.filter((r) => r.status === "started")).toHaveLength(1);
    for (const r of rs) expect(r.status).toMatch(/^(started|closed|Vault busy, try again\.)$/);
  });

  it("join vs auto-start (interleave): the joiner has no orphan row and keeps their stake", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await plan(f.ids.MASTERMIND);
    await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
    const before = await wallet(f.ids.DRIVER);
    const delegate = prisma.caper as any; const original = delegate.findUnique; let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.id === c.id) { first = false; await startCaper(c.id, { kind: "press", uid: f.ids.MASTERMIND }); }
      return snapshot;
    };
    try { await expect(join(c.id, f.ids.DRIVER, "DRIVER")).rejects.toThrow("Lobby closed."); } finally { delegate.findUnique = original; }
    expect(await testPrisma.caperCrew.count({ where: { userId: f.ids.DRIVER } })).toBe(0);
    expect(await wallet(f.ids.DRIVER)).toBe(before);
  });

  it("join racing start for real: a committed join is always part of the started crew or refunded, never orphaned", async () => {
    for (let k = 0; k < 5; k++) {
      await resetFamilies();
      const f = await caperCrew({ tier: 1, roles: [...T1] });
      const c = await plan(f.ids.MASTERMIND);
      await join(c.id, f.ids.LOOKOUT, "LOOKOUT"); await join(c.id, f.ids.SAFECRACKER, "SAFECRACKER");
      const [j] = await Promise.allSettled([join(c.id, f.ids.DRIVER, "DRIVER"), startCaper(c.id, { kind: "press", uid: f.ids.MASTERMIND })]);
      const row = await testPrisma.caperCrew.findFirst({ where: { caperId: c.id, userId: f.ids.DRIVER } });
      if (j.status === "fulfilled") expect(row?.started).toBe(true);
      else expect(row).toBeNull();
    }
  });
});
```

(`fullLobby`'s users hold `tier.seatGate.netWorth + 1,000,000` by default, so the "net worth" case lowers the Safecracker's wallet after the join. Net worth also counts the seat's prep item at its `ShopItem.price` (`src/services/netWorthService.ts:94-99`; plan 1's `seedEligibleUser` upserts it with `update: {}`, so a price set by an earlier test persists), so the test never hard-codes a wallet: `walletForStartNetWorth` reads the non-wallet part and sets the wallet so that net worth + 50,000 is exactly the 2,000,000 gate (the seat holds) or the gate − 1 (pinched, and the T1 lobby loses a required role). Review Focus 1's 2,010,000 → 1,960,000 example is the same rule with no other assets.)

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/caper-join.race.test.ts`
Expected: FAIL in the `start` block (`startCaper` not exported).

- [ ] **Step 3: Implement `startCaper`** as specified under Interfaces. Read users for `crimeHeat` once (`user.findMany({ where: { discordId: { in } } })`); `owned` comes from the same `getOwnedPrepKeys` call the prep re-check uses.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/anticheat/caper-join.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperLobbyService.ts test/anticheat/caper-join.race.test.ts
git commit -m "feat(capers): Start with seat re-validation, pinches and the stored draw"
```

---

### Task 7: The GO: opening the brief and locking a choice

**Files:**
- Create: `src/services/crimeFamily/caperPlayService.ts`
- Test: `test/crimeFamily/caper-play.test.ts`

**Interfaces:**
- Consumes: `getCaper`, `listCrew`, `parseAnswers`, `briefFor`, `leakAtOf`, `isDark`, `ringNeighbours`, `runFamilyTx`.
- Produces:
  - `openBrief(caperId: string, uid: string, now?: Date): Promise<BriefView>`: LOBBY → `"The brief opens at GO."`; not RUNNING or `now ≥ goEndsAt` → `"Too late."`; no crew row → `"You are not in this caper."`; CAS `caperCrew.updateMany({ where: { caperId, userId, briefOpened: false }, data: { briefOpened: true, briefOpenedAt: now } })` (a repeat changes nothing); returns `briefFor(...)` from the re-read rows.
  - `lockChoice(caperId: string, uid: string, index: number, now?: Date): Promise<{ brief: BriefView; allLocked: boolean }>`: `index` not an integer in 0..3 → `"Pick one of the four options."`; one `runFamilyTx`: guard read `tx.caper.findFirst({ where: { id, status: "RUNNING", goEndsAt: { gt: now } } })` (none → `"Too late."`), the presser's row (none → `"You are not in this caper."`), `now ≥ leakAt && isDark(row, leakAt)` → `"You went dark: this seat counts as a miss."`; CAS `caperCrew.updateMany({ where: { caperId, userId, choice: -1 }, data: { choice: index, leaked: now ≥ leakAt && isDark(holder, leakAt) } })` where `holder` is the presser's `next` (`count 0` → `"Locked in already."`). After commit, `allLocked = caperCrew.count({ caperId, choice: -1 }) === 0`.
- Why no caper-document write here: a lock writes its own crew row and the settle draw writes every crew row (Task 8), so a lock racing the draw is a write-write conflict and retries into "Too late." (CFD-2).

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/caper-play.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
import { seedRunning, seedLobby } from "./caperFixtures";

const R = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const row = (caperId: string, userId: string) => testPrisma.caperCrew.findFirst({ where: { caperId, userId } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("brief and lock (8.4 step 6)", () => {
  it("opening the brief stamps briefOpenedAt once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], dark: ["LOOKOUT"] });
    const t1 = new Date(+caper.startedAt + 5_000); const t2 = new Date(+t1 + 5_000);
    await openBrief(caper.id, ids.LOOKOUT, t1); await openBrief(caper.id, ids.LOOKOUT, t2);
    expect(await row(caper.id, ids.LOOKOUT)).toMatchObject({ briefOpened: true, briefOpenedAt: t1 });
  });

  it("refuses before GO, after GO, on a resolved caper and for a stranger (Review Focus 3)", async () => {
    const lobby = await seedLobby({ tier: 1, roles: [...R] });
    await expect(openBrief(lobby.caper.id, lobby.ids.LOOKOUT)).rejects.toThrow("The brief opens at GO.");
    await resetFamilies();
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R] });
    await expect(openBrief(caper.id, ids.LOOKOUT, caper.goEndsAt)).rejects.toThrow("Too late.");
    await expect(openBrief(caper.id, "999999999999999999")).rejects.toThrow("You are not in this caper.");
    await testPrisma.caper.update({ where: { id: caper.id }, data: { status: "RESOLVED", liveSlot: caper.id } });
    await expect(openBrief(caper.id, ids.LOOKOUT, caper.startedAt)).rejects.toThrow("Too late.");
    await expect(lockChoice(caper.id, ids.LOOKOUT, 0, caper.startedAt)).rejects.toThrow("Too late.");
  });

  it("locks one choice per member; a concurrent double press writes once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], picks: { LOOKOUT: "none" } });
    const now = new Date(+caper.startedAt + 10_000);
    const rs = await Promise.allSettled([lockChoice(caper.id, ids.LOOKOUT, 1, now), lockChoice(caper.id, ids.LOOKOUT, 2, now)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(/^(Locked in already\.|Vault busy, try again\.)$/);
    expect([1, 2]).toContain((await row(caper.id, ids.LOOKOUT))!.choice);
    await expect(lockChoice(caper.id, ids.LOOKOUT, 3, now)).rejects.toThrow("Locked in already.");
    await expect(lockChoice(caper.id, ids.LOOKOUT, 4, now)).rejects.toThrow("Pick one of the four options.");
  });

  it("reports allLocked on the last lock", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], picks: { LOOKOUT: "none", SAFECRACKER: "none" } });
    const now = new Date(+caper.startedAt + 10_000);
    expect((await lockChoice(caper.id, ids.LOOKOUT, 0, now)).allLocked).toBe(false);
    expect((await lockChoice(caper.id, ids.SAFECRACKER, 0, now)).allLocked).toBe(true);
  });

  it("a dark seat cannot lock; a seat whose holder went dark locks with leaked = true", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], dark: ["LOOKOUT"], picks: { LOOKOUT: "none", MASTERMIND: "none" } });
    const leakAt = new Date(+caper.goEndsAt - 30_000);
    await openBrief(caper.id, ids.LOOKOUT, leakAt);                                  // opened at leakAt: dark
    await expect(lockChoice(caper.id, ids.LOOKOUT, 0, leakAt)).rejects.toThrow("You went dark: this seat counts as a miss.");
    await lockChoice(caper.id, ids.MASTERMIND, 0, leakAt);                           // Mastermind's holder (next) is the Lookout
    expect(await row(caper.id, ids.MASTERMIND)).toMatchObject({ choice: 0, leaked: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/caper-play.test.ts`
Expected: FAIL, cannot resolve `caperPlayService`.

- [ ] **Step 3: Implement `caperPlayService.ts`** as specified under Interfaces.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/caper-play.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperPlayService.ts test/crimeFamily/caper-play.test.ts
git commit -m "feat(capers): open the brief and lock one choice, with darkness and the leak"
```

---

### Task 8: Settlement: VOID, the draw CAS, per-seat pay and the vault cut

**Files:**
- Create: `src/services/crimeFamily/caperSettleService.ts`
- Test: `test/anticheat/caper-settle.race.test.ts`

**Interfaces:**
- Consumes: `parseAnswers`, `ringOrder`, `ringNeighbours`, `isDark`, `leakAtOf`, `resolveCaperOutcome`, `splitCaperPool`, `rollUnit`, `cryptoRng`, `voidCaperInTx`, `creditWalletInTx`, `afterEarnedCredit`, `applyEconomyPenaltyTx`, `addCrimeHeatTx`, `migrateLegacyHeatForUser`, `jailUserTx`, `creditEarnings`, `recordPotentialSoulLedgerLoss` (`src/services/shopBuffs.ts:138`), `runFamilyTx`, `caperTier`.
- Produces:
  - `processBootedAt(): Date` = `new Date(Date.now() − process.uptime() × 1000)` (C1; no stored heartbeat).
  - `type ResolveResult = { caperId: string; status: "not_due" | "settled" | "void" | "busy"; resolvedNow: boolean; outcome: "CLEAN" | "MESSY" | "BUST" | "VOID" | null }`
  - `resolveCaper(caperId: string, now: Date, bootedAt: Date, rng?: Rng): Promise<ResolveResult>`: the one entry point for the press path, the timer and the sweeper. RUNNING: `parseAnswers(answers) === null` → `voidCaperInTx(tx, id)` plus `Audit{ type: "caper_corrupt", userId: plannerId, guildId, meta: { caperId } }` in the same transaction (edge 63) → `void`; any `choice = -1` and `now < goEndsAt` → `not_due`; any `choice = -1` and `bootedAt > startedAt` → VOID (C1) → `void`; else CAS `RUNNING → SETTLING` (`count 0` and the caper is not SETTLING → `busy`) and `settleCaper`. SETTLING: `settleCaper` (C4). Anything else → `busy`.
  - `settleCaper(caperId: string, now: Date, rng?: Rng): Promise<{ resolvedNow: boolean; outcome: "CLEAN" | "MESSY" | "BUST" }>`, spec 8.8 steps 2–5:
    - **Draw** (one transaction): read the caper and crew; with `roll === -1`, `parseAnswers(answers)` must be non-null: `resolveCaper` validated it before the RUNNING → SETTLING CAS and `answers` is written only at Start, so a null here is an invariant violation that throws `Error(`caper ${id}: answers unreadable in SETTLING`)` (no VOID path, no write; the sweeper's per-caper catch logs it for the owner); `misses` = rows whose `choice` is not the seat's correct index (dark and unlocked seats included); `roll = rollUnit(rng)` drawn first, then one jail roll per seat in ring order (`rollUnit(rng) < tier.jail.chance`, BUST only, tiers with jail only); `split = splitCaperPool({ ..., locked: rows.map((r) => r.choice !== -1) })`; CAS `caper.updateMany({ where: { id, status: "SETTLING", roll: -1 }, data: { roll, outcome, pool, crewShare } })`; on `count 1` write `passed`, `cut`, `fine` (`tier.bustFine` on BUST, else 0) and `jailed` on every row; on `count 0` write nothing (another settler drew; later steps read the stored values).
    - **Seats** (ring order; rows with `settled: false`): `await migrateLegacyHeatForUser(uid)`, then one transaction: CAS `caperCrew.updateMany({ where: { id, settled: false }, data: { settled: true } })` (`count 0` → skip), `cut > 0` → `creditWalletInTx(tx, uid, uid, cut, "caper_cut", { caperId, tier, role }, true)`, `fine > 0` → `applyEconomyPenaltyTx(tx, uid, uid, fine, "caper_fine", { caperId, tier, role }, caper.guildId)`, `addCrimeHeatTx(tx, uid, tier.heat[outcome.toLowerCase()])`, `jailed` → `jailUserTx(tx, uid, tier.jail.seconds, now)`. After that commit: `afterEarnedCredit(uid, credit, true)` for a paid seat, `recordPotentialSoulLedgerLoss(uid, fine)` for a fined seat.
    - **Vault** (one transaction): CAS `caper.updateMany({ where: { id, status: "SETTLING", vaultPaid: false }, data: { vaultPaid: true } })`; on `count 1`: `creditEarnings(tx, familyId, vaultCut, "caper_cut", "system", { caperId, tier, outcome }, { xp: tier.xp[outcome.toLowerCase()] })` (it also retries dues arrears), and `familyMember.updateMany({ where: { familyId, userId: { in: crewIds } }, data: { capers: { increment: 1 } } })`. `vaultCut` = `floor(pool × 10 / 100)` from the stored `pool`.
    - **Resolve** (one transaction): only if `caperCrew.count({ caperId, settled: false }) === 0` and the caper's `vaultPaid` is true: CAS `{ id, status: "SETTLING" }` → `{ status: "RESOLVED", liveSlot: id }` and `caperCrew.updateMany({ where: { caperId }, data: { liveSlot: caperId } })`; `resolvedNow` = this CAS won. The caller renders S15 and logs (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/caper-settle.race.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
const fail = vi.hoisted(() => ({ at: 0, calls: 0 }));
vi.mock("../../src/services/walletService", async (orig) => {
  const m = await orig<typeof import("../../src/services/walletService")>();
  return { ...m, creditWalletInTx: async (...a: Parameters<typeof m.creditWalletInTx>) => {
    if (fail.at && ++fail.calls === fail.at) throw new Error("boom");
    return m.creditWalletInTx(...a);
  } };
});
const { resolveCaper, settleCaper } = await import("../../src/services/crimeFamily/caperSettleService");
import { startedSeatsSince, startedCapersSince } from "../../src/services/crimeFamily/caperQueries";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
import { seedRunning, scriptedRng, txCount } from "../crimeFamily/caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const user = (id: string) => testPrisma.user.findUnique({ where: { discordId: id } });
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const caperRow = (id: string) => testPrisma.caper.findUnique({ where: { id } });
const after = (c: { goEndsAt: Date }) => new Date(+c.goEndsAt + 1_000);
const OLD_BOOT = new Date(0);
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); fail.at = 0; fail.calls = 0; });

describe("settlement (8.8)", () => {
  it("CLEAN pays each locked seat once, credits the vault cut and XP once and counts the seat", async () => {
    const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    expect(await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]))).toEqual({ caperId: caper.id, status: "settled", resolvedNow: true, outcome: "CLEAN" });
    for (const id of Object.values(ids)) {
      expect(await wallet(id)).toBe(280_000);
      expect((await user(id))!.crimeHeat).toBe(20);
    }
    expect(await txCount("caper_cut", Object.values(ids))).toBe(3);
    const mw = await testPrisma.wallet.findUnique({ where: { userId: ids.MASTERMIND } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: mw!.id, type: "caper_cut" } })).toMatchObject({ amount: 280_000, isEarned: true });
    expect(await fam(family.id)).toMatchObject({ earnings: 105_000, xp: 150 });
    expect((await testPrisma.familyMember.findMany({ where: { familyId: family.id } })).every((m) => m.capers === 1)).toBe(true);
    expect(await caperRow(caper.id)).toMatchObject({ status: "RESOLVED", liveSlot: caper.id, outcome: "CLEAN", roll: 0.5, pool: 1_050_000, crewShare: 840_000, vaultPaid: true });
    expect((await testPrisma.caperCrew.findMany({ where: { caperId: caper.id } })).every((r) => r.settled && r.passed && r.liveSlot === caper.id)).toBe(true);
  });

  it("MESSY from one unlocked seat: that seat gets 0 and its share is never minted", async () => {
    const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { SAFECRACKER: "none" } });
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    expect([await wallet(ids.MASTERMIND), await wallet(ids.LOOKOUT), await wallet(ids.SAFECRACKER)]).toEqual([98_000, 98_000, 0]);
    expect(await fam(family.id)).toMatchObject({ earnings: 36_750, xp: 60 });
    expect((await user(ids.SAFECRACKER))!.crimeHeat).toBe(30);
  });

  it("BUST writes fine, heat and jail with each seat; a longer sentence is kept (T2)", async () => {
    const now = new Date();
    const { caper, family, ids } = await seedRunning({ tier: 2, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"], picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong" }, wallet: 1_000_000, startedAt: new Date(+now - 200_000) });
    const later = new Date(+now + 9_000_000);
    await testPrisma.user.update({ where: { discordId: ids.SAFECRACKER }, data: { isJailed: true, jailReleaseTime: later } });
    // roll, then one jail roll per seat in ring order: MM jailed (0 < 0.2), LO free, SC jailed, DR free
    await resolveCaper(caper.id, now, OLD_BOOT, scriptedRng([5_000, 0, 9_999, 0, 9_999]));
    for (const id of Object.values(ids)) {
      expect(await wallet(id)).toBe(700_000);
      expect((await user(id))!.crimeHeat).toBe(45);
    }
    expect(await user(ids.MASTERMIND)).toMatchObject({ isJailed: true, jailReleaseTime: new Date(+now + 1_200_000) });
    expect(await user(ids.SAFECRACKER)).toMatchObject({ isJailed: true, jailReleaseTime: later });
    expect((await user(ids.LOOKOUT))!.isJailed).toBe(false);
    expect(await testPrisma.audit.count({ where: { type: "caper_fine", userId: { in: Object.values(ids) } } })).toBe(4);
    expect(await fam(family.id)).toMatchObject({ earnings: 0, xp: 30 });
  });

  it("two concurrent settlers draw once: every seat's money comes from one outcome", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], status: "SETTLING" });
    await Promise.allSettled([settleCaper(caper.id, after(caper), scriptedRng([0])), settleCaper(caper.id, after(caper), scriptedRng([9_999]))]);
    await settleCaper(caper.id, after(caper), scriptedRng([0]));                       // resume whatever the loser left
    const c = (await caperRow(caper.id))!;
    const cut = c.outcome === "CLEAN" ? 280_000 : 98_000;
    expect([c.roll, c.outcome]).toEqual(c.roll === 0 ? [0, "MESSY"] : [0.9999, "CLEAN"]);
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(cut);
    expect(await txCount("caper_cut", Object.values(ids))).toBe(3);
  });

  it("a crash after seat 2's credit resumes without paying anyone twice, using the first draw", async () => {
    const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3], status: "SETTLING" });
    fail.at = 2;
    await expect(settleCaper(caper.id, after(caper), scriptedRng([5_000]))).rejects.toThrow("boom");
    expect((await caperRow(caper.id))!.status).toBe("SETTLING");
    fail.at = 0;
    expect(await settleCaper(caper.id, after(caper), scriptedRng([0]))).toEqual({ resolvedNow: true, outcome: "CLEAN" });
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(280_000);
    expect((await fam(family.id))!.earnings).toBe(105_000);
  });

  it("the last lock's settle racing the sweeper pays one set (edge 25)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await Promise.allSettled([resolveCaper(caper.id, new Date(+caper.startedAt + 10_000), OLD_BOOT, scriptedRng([5_000])), resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]))]);
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(280_000);
  });

  it("an unlocked seat before goEndsAt is not due", async () => {
    const { caper } = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" } });
    expect((await resolveCaper(caper.id, new Date(+caper.startedAt + 10_000), OLD_BOOT)).status).toBe("not_due");
    expect((await caperRow(caper.id))!.status).toBe("RUNNING");
  });

  it.each([["inside the GO", 50_000], ["after the GO ended, still unsettled (C1)", 150_000]] as const)(
    "VOID: a restart %s with an unlocked seat refunds every stake and records nothing", async (_n, bootOffset) => {
      const startedAt = new Date(Date.now() - 200_000);
      const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" }, startedAt });
      expect(await resolveCaper(caper.id, after(caper), new Date(+startedAt + bootOffset))).toMatchObject({ status: "void", outcome: "VOID" });
      expect(await caperRow(caper.id)).toMatchObject({ status: "CANCELLED", outcome: "VOID", liveSlot: caper.id });
      for (const id of Object.values(ids)) { expect(await wallet(id)).toBe(50_000); expect((await user(id))!.crimeHeat).toBe(0); }
      const lw = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
      expect(await testPrisma.transaction.findFirst({ where: { walletId: lw!.id, type: "caper_stake_refund" } })).toMatchObject({ isEarned: false });
      expect((await testPrisma.caperCrew.findMany({ where: { caperId: caper.id } })).every((r) => !r.started && r.refunded && r.liveSlot === caper.id)).toBe(true);
      expect(await startedSeatsSince(ids.MASTERMIND, new Date(0))).toHaveLength(0);
      expect(await startedCapersSince(family.id, new Date(0))).toHaveLength(0);
      expect(await fam(family.id)).toMatchObject({ earnings: 0, xp: 0 });
    });

  it("a boot before startedAt settles normally; every seat locked never VOIDs", async () => {
    const startedAt = new Date(Date.now() - 200_000);
    const a = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" }, startedAt });
    expect((await resolveCaper(a.caper.id, after(a.caper), new Date(+startedAt - 1), scriptedRng([5_000]))).outcome).toBe("MESSY");
    await resetFamilies();
    const b = await seedRunning({ tier: 1, roles: [...R3], startedAt });
    expect((await resolveCaper(b.caper.id, after(b.caper), new Date(+startedAt + 50_000), scriptedRng([5_000]))).outcome).toBe("CLEAN");
  });

  it("corrupt answers on a RUNNING caper: VOID with refunds and a caper_corrupt audit (edge 63)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { answers: {} } });
    expect((await resolveCaper(caper.id, after(caper), OLD_BOOT)).status).toBe("void");
    expect(await testPrisma.audit.count({ where: { type: "caper_corrupt", userId: ids.MASTERMIND } })).toBe(1);
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(3);
  });

  it("a cut above MAX_SAFE_BALANCE is clamped and the excess is never minted (edge 20)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.wallet.update({ where: { userId: ids.LOOKOUT }, data: { balance: MAX_SAFE_BALANCE - 100_000 } });
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    expect(await wallet(ids.LOOKOUT)).toBe(MAX_SAFE_BALANCE);
    const w = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: w!.id, type: "caper_cut" } })).toMatchObject({ amount: 100_000, meta: expect.objectContaining({ capped: true }) });
  });

  it("the vault cut retries dues arrears (7.4)", async () => {
    const { caper, family } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.family.update({ where: { id: family.id }, data: { duesArrears: 1 } });
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    expect(await fam(family.id)).toMatchObject({ earnings: 65_000, duesArrears: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/caper-settle.race.test.ts`
Expected: FAIL, cannot resolve `caperSettleService`.

- [ ] **Step 3: Implement `caperSettleService.ts`** as specified under Interfaces. Per-seat heat uses the outcome's column of `tier.heat` (Clean/Messy/Bust); prep items are not touched.

- [ ] **Step 4: Run it, then the whole caper suite**

Run: `$VT test/anticheat/caper-settle.race.test.ts test/anticheat/caper-join.race.test.ts test/crimeFamily`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperSettleService.ts test/anticheat/caper-settle.race.test.ts
git commit -m "feat(capers): exactly-once settlement with the draw CAS, VOID and resume"
```

---
### Task 9: The `caper` and `caper_lobby` DM types and their notices

**Files:**
- Modify: `src/services/dmPrefsService.ts:14-25` (two entries), `src/services/dmNoticeService.ts` (Crime Families section: two builders), `test/dm/prefs.test.ts:19-20`, `test/dm/investment-notice.test.ts:38`
- Test: append to `test/dm/family-notice.test.ts`

**Interfaces:**
- Consumes: `noticeContainer` (`src/utils/componentsV2.ts:73`), `cfNoticeEmote`, `fmtFortunes`.
- Produces:
  - `DM_NOTICE_TYPES.caper = { label: "Family caper", command: "!caper", group: "cooldown" }` inserted after `crime`; `DM_NOTICE_TYPES.caper_lobby = { label: "Caper lobby calls", group: "account" }` after plan 1's `family`. `"caper"` becomes a `CooldownReminderType`; `processDueReminders` sends it through the existing `cooldownNotice` (C11).
  - `caperLobbyNotice(v: { familyLabel: string; tierName: string; stake: number; closesAt: Date; jumpUrl: string | null }): ContainerBuilder` (title "Caper lobby open"; body names the tier, the stake and `<t:closesAt:R>`, then the jump link when given; thumbnail `cfNoticeEmote("caper")`)
  - `caperGoNotice(v: { tierName: string; goEndsAt: Date; jumpUrl: string | null }): ContainerBuilder` (title "Caper GO"; body "GO ends `<t:R>`. Open your brief now." plus the jump link)
- Settings panel: cooldown 7 → 8 types (still 2 rows), account 4 → 5 (a second row): 26 → **29** components with DMs on, **30** off. Plan 3's `turf` makes it 30/31 (spec 13.4).

- [ ] **Step 1: Write the failing tests**

```ts
// append to test/dm/family-notice.test.ts
import { caperLobbyNotice, caperGoNotice } from "../../src/services/dmNoticeService";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";

describe("caper DM notices (13.4)", () => {
  const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);
  it("caper is a cooldown reminder for !caper; caper_lobby is an account notice with no command", () => {
    expect(DM_NOTICE_TYPES.caper).toEqual({ label: "Family caper", command: "!caper", group: "cooldown" });
    expect(isCooldownReminderType("caper")).toBe(true);
    expect(DM_NOTICE_TYPES.caper_lobby).toEqual({ label: "Caper lobby calls", group: "account" });
    expect(isCooldownReminderType("caper_lobby")).toBe(false);
  });
  it("the lobby call names the tier, stake and close time and links the card", () => {
    const t = containerText(caperLobbyNotice({ familyLabel: "[VLA] Velvet Ante", tierName: "Payroll Van", stake: 100_000, closesAt: new Date(1_800_000_000_000), jumpUrl: "https://discord.com/channels/1/2/3" }));
    for (const s of ["Payroll Van", "100,000", "<t:1800000000:R>", "https://discord.com/channels/1/2/3"]) expect(t).toContain(s);
  });
  it("the GO call uses the cf_caper emoji as its thumbnail when loaded, the Gun emote otherwise", () => {
    expect(containerThumb(caperGoNotice({ tierName: "x", goEndsAt: new Date(), jumpUrl: null }))).toContain("1456729243399753752");
    setEmojiRecord("cf_caper", { id: "1234567890123456780", name: "cf_caper" });
    expect(containerThumb(caperGoNotice({ tierName: "x", goEndsAt: new Date(), jumpUrl: null }))).toContain("1234567890123456780");
  });
  it("the settings panel is 29 components with DMs on and 30 off", () => {
    expect(count(buildSettingsPayload("o", { remindersEnabled: true, disabledReminders: [] }).components[0].toJSON())).toBe(29);
    expect(count(buildSettingsPayload("o", { remindersEnabled: false, disabledReminders: [] }).components[0].toJSON())).toBe(30);
  });
});
```

Update the pinned arrays: `test/dm/prefs.test.ts:19` → `["daily", "weekly", "monthly", "crime", "caper", "hunt", "work", "vote"]`; `:20` and `test/dm/investment-notice.test.ts:38` → `["card", "market", "investment", "family", "caper_lobby"]`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/dm`
Expected: FAIL (`DM_NOTICE_TYPES.caper` undefined; the pinned arrays).

- [ ] **Step 3: Add the registry entries and the two builders** as specified under Interfaces.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/dm`
Expected: PASS (including `test/dm/settings.test.ts`, still `< 35`).

- [ ] **Step 5: Commit**

```bash
git add src/services/dmPrefsService.ts src/services/dmNoticeService.ts test/dm/prefs.test.ts test/dm/investment-notice.test.ts test/dm/family-notice.test.ts
git commit -m "feat(capers): caper reminder and caper_lobby DM types with their notices"
```

---

### Task 10: Caper views, customIds, screens and the worst-case fixtures

**Files:**
- Modify: `src/services/crimeFamily/views.ts` (`CaperPlannerView`, `CaperCardView`, `CaperSeatView`), `src/services/crimeFamily/caperQueries.ts` (view builders), `src/ui/crimeFamily/ids.ts` (`CPR_IDS`), `src/scripts/fixtures/crimeFamilyScreens.ts` (append `...caperWorstCases()`)
- Create: `src/ui/crimeFamily/caperScreens.ts`, `src/scripts/fixtures/caperScreens.ts`
- Test: `test/crimeFamily/caper-layout.test.ts` (plan 1's `test/crimeFamily/layout.test.ts` covers the appended entries automatically)

**Interfaces:**
- Consumes: `cfPayload`, `cfId`, `thumbSection`, `bannerGallery`, `buildNotice`, `buildOpener`, `jumpLink`, `cfEmoji`, `fmtFortunes`, `splitCaperPool`, `patrolChance`, `tierRoles`, `openRoles`, `leakAtOf`, `isDark`, `ringNeighbours`, `parseAnswers`, `caperTier`, `caperRole`, `startedCapersSince`, `getLiveCaper`, `requireMembership`, `can`, `isUnderInvestigation`.
- Produces:
  - `views.ts`:
    - `CaperSeatView { role: CaperRoleKey; optional: boolean; userId: string | null; locked: boolean; passed: boolean; leaked: boolean; dark: boolean; holderId: string | null; cut: number; fine: number; jailed: boolean }`
    - `CaperCardView { caperId: string; familyLabel: string; tier: number; status: "LOBBY" | "RUNNING" | "SETTLING" | "RESOLVED" | "CANCELLED"; outcome: "" | "CLEAN" | "MESSY" | "BUST" | "CANCELLED" | "VOID"; plannerId: string; guildId: string; channelId: string; messageId: string; lobbyClosesAt: Date; goEndsAt: Date; leakAt: Date; seats: CaperSeatView[] /* tierRoles order */; openRoles: CaperRoleKey[]; lockedCount: number; crewCount: number; roll: number; patrolChance: number; pool: number; note: string | null }`
    - `CaperPlannerView { ownerId: string; familyLabel: string; level: number; tiers: { tier: number; unlocked: boolean }[]; nextCaperAt: Date; startedLast24h: number; duesArrears: number; underInvestigation: boolean; canPlan: boolean; live: { caperId: string; tier: number; status: string; guildId: string; channelId: string; messageId: string } | null }`
  - `caperQueries.ts`: `buildCaperCardView(caperId: string, now: Date, note?: string | null): Promise<CaperCardView | null>` (family label `[TAG] Name`, or `"A crime family"` when the family is gone), `buildPlannerView(ownerId: string, now: Date): Promise<CaperPlannerView>` (`requireMembership`; `canPlan = can(member, "plan_caper", now)`).
  - `ids.ts` `CPR_IDS` gains `plan(owner)` = `cpr:plan:<owner>`, `join(caperId)`, `leave(caperId)`, `start(caperId)`, `cancel(caperId)`, `brief(caperId)`, `act(caperId, index)`, `openBrief(caperId, owner)` = `cpr:open:brief:<caperId>:<owner>` (60 chars at max).
  - `caperScreens.ts` (each returns `CfPayload`; `art: true` means "this message does not hold the file yet": send it and `attachments: []`):
    - S11 `buildCaperPlanner(v: CaperPlannerView, opts: { art: boolean; ephemeral: boolean })`: Section(`## <cf_caper> Capers` + family line, thumbnail `caper`) via `thumbSection`, Sep, Text "How a caper works" (4 lines: plan a tier, join by role, GO 120 s with the intel ring, dark seats are misses), Text tier table (per tier: name, level, crew, pool per seat B, stake, Bust fine, heat ceiling, seat gates; locked tiers marked "unlocks at L<n>"), Text family status (cooldown `<t:R>` or "ready", "Started x/4 in 24 h", arrears, investigation, and the live caper with its jump link when `live !== null`), SelectRow `CPR_IDS.plan(owner)` with one option per unlocked tier only when `canPlan && live === null && !underInvestigation`. **11** worst case.
    - `buildCaperCard(v: CaperCardView, opts: { art: boolean }): CfPayload` by status:
      - LOBBY → S12: gallery `caper_t<n>` (when `bannerGallery` is non-null), Text header (tier name, family, closes `<t:R>`), Sep, Text roster (one line per tier role: `cfEmoji(role.emojiKey)` + role name + `<@id>` or "open", "(optional)" on the optional role), Sep, Text terms (stake, Clean cut per seat from `splitCaperPool` at `crewMax`, Bust fine, heat Clean/Messy/Bust, heat ceiling, seat gates), Text hint (or "All seats filled, waiting for Start", or the note), SelectRow "Join as…" `CPR_IDS.join` with one option per open role (role emoji when defined) omitted when no role is open, Row(Leave, Start, Cancel). **14** / 12 with no open role / −1 without the banner.
      - RUNNING or SETTLING → S13: gallery (same banner, never `files` unless `opts.art`), Text header (GO ends `<t:goEndsAt:R>`, leak `<t:leakAt:R>`), Sep, Text "Locked in x/n" roster (no correctness), Text hint, Row(Open brief `CPR_IDS.brief`). **8**.
      - RESOLVED → S15: always `files: [result_<outcome>]` and `attachments: []` when the banner exists, `attachments: []` otherwise; gallery, Text header (`**CLEAN**`/`**MESSY**`/`**BUST**`, `roll 0.5000 vs patrol 0.1000`), Sep, Text per-step lines (`Mascot.Emotes.Accept`/`Decline`, role call, `intel <@holder> → call <@actor>`, "(leaked)", "(went dark)"), Sep, Text payout lines (`<@id> +cut`, or `−fine` and "jailed 20 min"), Text hint (no action row). **8**.
      - CANCELLED → C14: Text header ("Caper cancelled" or "Caper void"), Text body ("Every stake was refunded." plus the note) and `attachments: []`. **3**.
    - S14 `buildBrief(v: BriefView): CfPayload` (ephemeral): Text "Tell <@prev>: **label**", Sep, Text the call ("<question>? <@next> has your intel", the leaked line, `-# If your contact goes dark, the intel leaks <t:leakAt:R>; press Refresh then`, "Locked in: **label**", or "You went dark: this seat counts as a miss"), Row(4 option buttons `CPR_IDS.act(caperId, i)` with plain labels and no emoji, disabled once locked; Refresh `CPR_IDS.brief`). A dark seat gets the Row(Refresh) only. **10** / 6.
    - S25 `buildCaperSeatCard(v: { caperId: string; text: string; jumpUrl: string | null }): CfPayload`: Text (status + jump link), Row(Open brief). **4**.
    - S28 `buildGoCall(v: { caperId: string; crewIds: string[]; goEndsAt: Date; pinched: string[] }): CfPayload` = `buildNotice("Caper GO! <@a> <@b> … Open your brief. GO ends <t:R>." + pinched line, { customId: CPR_IDS.brief(caperId), label: "Open brief" }, crewIds)`. **4**.
    - S28 `buildLobbyMoved(jumpUrl: string): CfPayload` = `{ ...buildNotice(\`Lobby moved: ${jumpUrl}\`), attachments: [] }`. **2**.
  - `caperWorstCases(): { label: string; max: number; payload: CfPayload }[]` with entries: "S11 planner (Capo)" 11 (`live: null`, all four tiers unlocked), "S11 planner (live caper)" 9 (no select), "S12 lobby (T4, 1 seat)" 14, "S12 lobby (T4, full)" 12, "S12 cancelled" 3, "S13 GO (T4, 6 seats)" 8, "S14 brief (open)" 10, "S14 brief (locked)" 10, "S14 brief (dark)" 6, "S15 result (T4 BUST, 6 seats)" 8, "S25 caper card" 4, "S27 brief opener" 4, "S28 GO call (6 crew)" 4, "S28 lobby moved" 2. Views are literal: 24-character family names, 20-digit ids, T4 labels, a `note` of 200 characters, amounts near `MAX_SAFE_BALANCE`.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/caper-layout.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const { caperWorstCases } = await import("../../src/scripts/fixtures/caperScreens");
const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
const { buildCaperCard, buildBrief } = await import("../../src/ui/crimeFamily/caperScreens");

const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); (n.items ?? []).forEach((c: any) => f(c)); };
const json = (p: any) => p.components.map((c: any) => c.toJSON());
const types = (p: any) => { const t: number[] = []; json(p).forEach((x: any) => walk(x, (n) => n.type && t.push(n.type))); return t; };
const ids = (p: any) => { const t: string[] = []; json(p).forEach((x: any) => walk(x, (n) => n.custom_id && t.push(n.custom_id))); return t; };
const pick = (label: string) => caperWorstCases().find((c) => c.label === label)!.payload;

beforeAll(() => { for (const k of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${k}`, { id: "1456569047758929931", name: `cf_${k}` }); });

describe("caper screens (13.3)", () => {
  it("are all part of the family worst-case table", () => {
    const all = crimeFamilyWorstCases().map((c) => c.label);
    for (const c of caperWorstCases()) expect(all).toContain(c.label);
  });

  it("S12 with every seat filled has no select; without the banner it has no gallery and no file", () => {
    art.present = true;
    expect(types(pick("S12 lobby (T4, full)"))).not.toContain(ComponentType.StringSelect);
    expect(ids(pick("S12 lobby (T4, 1 seat)")).some((i) => i.startsWith("cpr:join:"))).toBe(true);
    art.present = false;
    const p = pick("S12 lobby (T4, 1 seat)");
    expect(types(p)).not.toContain(ComponentType.MediaGallery);
    expect(p.files ?? []).toHaveLength(0);
    art.present = true;
  });

  it("S13 is an edit that sends no file; S15 sends the result banner and clears attachments; the cancelled card clears them too", () => {
    art.present = true;
    const go = pick("S13 GO (T4, 6 seats)");
    expect(go.files ?? []).toHaveLength(0);
    expect(types(go)).toContain(ComponentType.MediaGallery);
    const result = pick("S15 result (T4 BUST, 6 seats)");
    expect(result.files!.map((f: any) => f.name)).toEqual(["cf_result_bust.png"]);
    expect(result.attachments).toEqual([]);
    expect(types(result)).not.toContain(ComponentType.ActionRow);
    expect(pick("S12 cancelled").attachments).toEqual([]);
  });

  it("S14 option buttons carry plain labels and no emoji; a dark seat gets only Refresh", () => {
    const open = json(pick("S14 brief (open)"));
    const buttons: any[] = []; open.forEach((x: any) => walk(x, (n) => n.type === ComponentType.Button && buttons.push(n)));
    expect(buttons.filter((b) => b.custom_id.startsWith("cpr:act:")).every((b) => !b.emoji && !/<a?:\w+:\d+>/.test(b.label))).toBe(true);
    expect(ids(pick("S14 brief (dark)")).filter((i) => i.startsWith("cpr:act:"))).toHaveLength(0);
    expect(pick("S14 brief (open)").flags & 64).toBe(64);
  });

  it("only the GO call pings, and only the crew", () => {
    expect(pick("S28 GO call (6 crew)").allowedMentions).toEqual({ parse: [], users: expect.arrayContaining([expect.any(String)]) });
    expect(pick("S28 GO call (6 crew)").allowedMentions.users).toHaveLength(6);
    for (const c of caperWorstCases().filter((x) => x.label !== "S28 GO call (6 crew)")) expect(c.payload.allowedMentions).toEqual({ parse: [] });
  });

  it("customIds stay under 100 characters at max length", () => {
    const longest = [CPR_IDS.openBrief("a".repeat(24), "9".repeat(20)), CPR_IDS.act("a".repeat(24), 3), CPR_IDS.plan("9".repeat(20))];
    expect(Math.max(...longest.map((s) => s.length))).toBe(60);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/caper-layout.test.ts`
Expected: FAIL, cannot resolve `caperScreens`.

- [ ] **Step 3: Implement the views, the view builders, the ids, the screens and the fixtures** as specified under Interfaces, then append `...caperWorstCases()` to the array `crimeFamilyWorstCases()` returns. `CaperSeatView.holderId` is the seat's `next` in ring order (the holder of its intel); `dark` uses `isDark(row, leakAt)` and is shown only once the caper has left RUNNING.

- [ ] **Step 4: Run both layout suites and the payload audit**

Run: `$VT test/crimeFamily/caper-layout.test.ts test/crimeFamily/layout.test.ts`
Expected: PASS (plan 1's layout test now iterates the caper entries too, art present and absent).
Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json`
Expected: every line `PASS`, "All payloads within Discord limits", and `emojis.json` unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/views.ts src/services/crimeFamily/caperQueries.ts src/ui/crimeFamily/ids.ts src/ui/crimeFamily/caperScreens.ts src/scripts/fixtures/caperScreens.ts src/scripts/fixtures/crimeFamilyScreens.ts test/crimeFamily/caper-layout.test.ts
git commit -m "feat(capers): planner, lobby, GO, brief and result screens with worst-case fixtures"
```

---

### Task 11: The card writer, the trailing debounce and the caper flow

**Files:**
- Create: `src/ui/crimeFamily/debounce.ts`, `src/ui/crimeFamily/caperCard.ts`, `src/ui/crimeFamily/caperFlow.ts`
- Modify: `test/crimeFamily/caperFixtures.ts` (`fakeCaperClient`)
- Test: `test/crimeFamily/caper-flow.test.ts`

**Interfaces:**
- Consumes: `buildCaperCardView`, `buildCaperCard`, `buildGoCall`, `buildLobbyMoved`, `sendToChannel`, `editChannelMessage`, `missingBotPermissions`, `jumpLink`, `setNx`, `notifyMany`, `caperLobbyNotice`, `caperGoNotice`, `enqueueReminder` (`src/services/cooldownReminderService.ts:17`), `logToChannel` (`src/utils/discordLogger.ts:14`), `listMembers`, `checkMemberEligibility`, `getOwnedPrepKeys`, `startedSeatsSince`, `startCaper`, `cancelCaper`, `resolveCaper`, `openRoles`, `redisService.getInstance`.
- Produces:
  - `debounce.ts`: `trailingRender(scope, id, windowSeconds, render)` (Seams block): `setNx("cf:render:<scope>:<id>", window)` → `"set"` or `"error"`: `await render()`; `"held"`: `setNx("cf:render:<scope>:pending:<id>", window + 1)` → `"set"`: `setTimeout(() => void render().catch(log), window × 1000)`; `"held"`: nothing; `"error"`: `await render()`.
  - `caperCard.ts`:
    - `renderCaperCard(client: Client, caperId: string, opts?: { note?: string | null; now?: Date }): Promise<"ok" | "dead" | "skipped">`: `skipped` when the caper is missing or `messageId === ""`; builds `buildCaperCard(view, { art: status is RESOLVED or CANCELLED })`; `editChannelMessage` → `"error"`: retry once with the art and `attachments: []` (C5); `"dead"`: CAS `caper.updateMany({ where: { id, messageId: <old> }, data: { messageId: "" } })`, then one `sendToChannel(client, caper.channelId, <card with art>)`; on success CAS `{ id, messageId: "" }` → the new id and return `"ok"`, else return `"dead"` (the board stays dead until `!caper` reposts, spec 13.2).
    - `requestCaperRender(client: Client, caperId: string): Promise<void>` = `trailingRender("caper", caperId, caperRenderDebounceSeconds, () => renderCaperCard(client, caperId).then(() => undefined))`.
    - `postCaperCard(client: Client, caperId: string, channelId: string): Promise<string | null>`: sends the card with its art to `channelId`; on success, if the caper had a live board (`messageId !== ""`), edits the old one to `buildLobbyMoved(newJump)` (dead codes ignored), then CAS `{ id, messageId: <old> }` → `{ channelId, messageId: <new> }`; returns the new message id or null.
    - `pickLobbyChannel(client: Client, channelId: string, family: Family): Promise<string>`: the channel itself when `missingBotPermissions(channel, client.user.id)` is empty; else the family's home channel when `family.homeGuildId` is the channel's guild and the home channel has no missing permissions; else `FamilyError(\`I need ${missing.join(", ")} in this channel to post the lobby.\`)` (edge 75).
  - `caperFlow.ts` (every function catches and logs Discord errors; none throws on a dead channel):
    - `announceLobby(client: Client, caperId: string, now?: Date): Promise<string[]>` (ids DMed): nobody when the family has a `Caper{ status: "CANCELLED", outcome: "CANCELLED", updatedAt ≥ now − lobbyDmQuietAfterCancelSeconds }`; otherwise members who are not seated, are fetchable in the lobby's guild (`client.guilds.cache.get(guildId)?.members.fetch(uid)`; a throw skips them), pass `checkMemberEligibility(uid, gate, { now })` (no role), own a prep key of some open role, have a free seat in their rolling 24 h, and get a lobby-DM slot (`INCR cf:lobbydm:<uid>`, `EXPIRE 86400` when the count is 1, slot = count ≤ `lobbyDmsPer24h`; a Redis error grants the slot); then `notifyMany(client, "caper_lobby", ids, () => caperLobbyNotice({ familyLabel, tierName, stake, closesAt: caper.lobbyClosesAt, jumpUrl }))` (plan 1 signature `notifyMany(client, type, ids, build: (id) => ContainerBuilder)`; the notice is the same for every recipient, so the builder ignores `id`).
    - `runStart(client: Client, caperId: string, by: StartBy, now?: Date): Promise<StartResult>`: `startCaper`; on `started`: `renderCaperCard` (S13, note "Pinched at Start: <@x> (stake refunded)" when any), `sendToChannel(client, caper.channelId, buildGoCall({ caperId, crewIds, goEndsAt, pinched }))` (a null result is fine, edge 72), `notifyMany(client, "caper_lobby", crewIds, () => caperGoNotice({ tierName, goEndsAt, jumpUrl }))` where `jumpUrl` links the GO message, or the card when the GO message did not post, or is null, `enqueueReminder(uid, "caper", oldest.startedAt + 24 h)` for every crew member with 2 started seats in the window, and `setTimeout(() => void resolveAndAnnounce(client, caperId, new Date()), goEndsAt − now + caperSettleDelayMs)` (C8, `unref()`); on `pinched`/`waiting`: `renderCaperCard` with the reason as the note; on `cancelled` (the planner was pinched): `renderCaperCard` with the reason as the note, which draws the C14 cancelled card; on `closed`: nothing.
    - `onSeatsChanged(client: Client, caperId: string, full: boolean, now?: Date): Promise<void>`: `full` → `runStart(client, caperId, { kind: "auto" }, now)`; else `requestCaperRender`.
    - `runCancel(client: Client, caperId: string, actorId: string | null, now?: Date): Promise<void>`: `cancelCaper` then `renderCaperCard`.
    - `resolveAndAnnounce(client: Client, caperId: string, now: Date, bootedAt?: Date): Promise<ResolveResult>`: `resolveCaper(caperId, now, bootedAt ?? processBootedAt())` (`processBootedAt` from `caperSettleService.ts`); on `resolvedNow` or `void`: `renderCaperCard`; on a resolved pool ≥ `caperTradeLogMinPool`: `logToChannel(client, { guild, type: "TRADE", title: "Caper resolved", description })` when `client.guilds.cache.get(guildId)` exists.

- [ ] **Step 1: Write the failing test**

Append `fakeCaperClient` to `test/crimeFamily/caperFixtures.ts` (Tasks 12–15 reuse it):

```ts
// append to test/crimeFamily/caperFixtures.ts
import { vi } from "vitest";
import { PermissionFlagsBits, type Client } from "discord.js";
import { fakeDmClient } from "../dm/helpers";

export type BotPerm = "ViewChannel" | "SendMessages" | "ReadMessageHistory" | "AttachFiles";

export function fakeCaperClient(o: { members?: string[]; missingPerms?: Record<string, BotPerm[]> } = {}) {
  const dm = fakeDmClient();
  const sent: { channelId: string; payload: any }[] = [];
  const edits: { channelId: string; messageId: string; payload: any }[] = [];
  const editFailures: unknown[] = [];   // each edit call shifts one: a present value is thrown instead of editing
  const sendFailures: unknown[] = [];   // same for send
  let n = 0;
  const make = (id: string) => {
    const missing = (o.missingPerms?.[id] ?? []).map((k) => PermissionFlagsBits[k]);   // bigints, the contract in Task 12
    return {
      id, guildId: G, isTextBased: () => true,
      permissionsFor: (_botId: string) => ({ has: (p: bigint) => !missing.includes(p) }),
      send: vi.fn(async (payload: any) => {
        const f = sendFailures.shift(); if (f) throw f;
        const m = { id: `m${++n}` }; sent.push({ channelId: id, payload }); return m;
      }),
      messages: { edit: vi.fn(async (messageId: string, payload: any) => {
        const f = editFailures.shift(); if (f) throw f;
        edits.push({ channelId: id, messageId, payload }); return { id: messageId };
      }) },
    };
  };
  const channels = new Map<string, ReturnType<typeof make>>();
  const channel = (id: string) => { if (!channels.has(id)) channels.set(id, make(id)); return channels.get(id)!; };
  const members = new Set(o.members ?? []);
  const guild = { id: G, name: "Guild", members: { fetch: vi.fn(async (uid: string) => (members.has(uid) ? { id: uid } : Promise.reject(new Error("Unknown Member")))) } };
  const client = {
    user: { id: "bot" },
    channels: { fetch: vi.fn(async (id: string) => channel(id)) },
    users: (dm.client as any).users,
    guilds: { cache: new Map([[G, guild]]) },
  } as unknown as Client;
  return { client, channel, sent, edits, editFailures, sendFailures, dms: dm.sent };
}
```

```ts
// test/crimeFamily/caper-flow.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { ComponentType } from "discord.js";
import { planCaper, joinCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { parseAnswers } from "../../src/services/crimeFamily/intelRing";
import { postCaperCard, renderCaperCard, requestCaperRender } from "../../src/ui/crimeFamily/caperCard";
import { onSeatsChanged, runStart, resolveAndAnnounce, announceLobby } from "../../src/ui/crimeFamily/caperFlow";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, seedEligibleUser } from "../helpers";
import { caperCrew, seedLobby, fakeCaperClient, setCaperUpdatedAt, G, CH } from "./caperFixtures";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const JOINERS = ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const caperRow = (id: string) => testPrisma.caper.findUniqueOrThrow({ where: { id } });
const json = (payload: any) => payload.components.map((c: any) => c.toJSON());
const text = (payload: any) => JSON.stringify(json(payload));
const types = (payload: any) => { const t: number[] = []; const walk = (x: any) => { if (x.type) t.push(x.type); (x.components ?? []).forEach(walk); if (x.accessory) walk(x.accessory); }; json(payload).forEach(walk); return t; };
const fileNames = (payload: any): string[] => (payload.files ?? []).map((f: any) => f.name);
const isGoCall = (s: { payload: any }) => Array.isArray(s.payload.allowedMentions?.users);

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

async function postedLobby(now = new Date()) {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const fc = fakeCaperClient({ members: Object.values(f.ids) });
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
  const mid = await postCaperCard(fc.client, c.id, CH);
  return { ...f, fc, c, mid: mid! };
}

describe("caper card and flow (13.2, 8.4)", () => {
  it("plan → card → joins → auto-start → GO → result", async () => {
    const { ids, fc, c, mid } = await postedLobby();
    expect(fc.sent).toHaveLength(1);
    expect(fileNames(fc.sent[0].payload)).toEqual(["cf_caper_t1.png"]);
    expect(fc.sent[0].payload.allowedMentions).toEqual({ parse: [] });
    expect((await caperRow(c.id)).messageId).toBe(mid);

    for (const r of JOINERS) {
      const j = await joinCaper({ caperId: c.id, uid: ids[r], role: r, guildId: G });
      await onSeatsChanged(fc.client, c.id, j.full);
    }
    const run = await caperRow(c.id);
    expect(run.status).toBe("RUNNING");
    const goEdit = fc.edits.find((e) => e.messageId === mid && text(e.payload).includes(`cpr:brief:${c.id}`))!;
    expect(fileNames(goEdit.payload)).toEqual([]);
    const go = fc.sent.filter(isGoCall);
    expect(go).toHaveLength(1);
    expect([...go[0].payload.allowedMentions.users].sort()).toEqual(Object.values(ids).sort());
    for (const id of Object.values(ids)) expect(fc.dms.get(id)).toBe(1);   // the GO DM (caper_lobby)

    const answers = parseAnswers(run.answers)!;
    const t = new Date(+run.startedAt + 5_000);
    for (const r of T1) { await openBrief(c.id, ids[r], t); await lockChoice(c.id, ids[r], answers.seats[r]!.correct, t); }
    expect(await resolveAndAnnounce(fc.client, c.id, new Date(+run.goEndsAt + 1_000), new Date(0))).toMatchObject({ status: "settled", resolvedNow: true });
    const last = fc.edits.filter((e) => e.messageId === mid).at(-1)!;
    expect(fileNames(last.payload)[0]).toMatch(/^cf_result_(clean|messy)\.png$/);
    expect(last.payload.attachments).toEqual([]);
    expect(types(last.payload)).not.toContain(ComponentType.ActionRow);
  });

  it("Start racing the last join's auto-start posts one GO message (Review Focus 5)", async () => {
    const { ids, fc, c } = await postedLobby();
    for (const r of JOINERS) await joinCaper({ caperId: c.id, uid: ids[r], role: r, guildId: G });
    await Promise.allSettled([onSeatsChanged(fc.client, c.id, true), runStart(fc.client, c.id, { kind: "press", uid: ids.MASTERMIND })]);
    expect(fc.sent.filter(isGoCall)).toHaveLength(1);
    for (const id of Object.values(ids)) expect(fc.dms.get(id)).toBe(1);
  });

  it("a 50013 on render marks the board dead after one failed repost; the next render is skipped (Review Focus 4)", async () => {
    const { ids, fc, c } = await postedLobby();
    const ch = fc.channel(CH);
    fc.editFailures.push({ code: 50013 }); fc.sendFailures.push({ code: 50013 });
    expect(await renderCaperCard(fc.client, c.id)).toBe("dead");
    expect((await caperRow(c.id)).messageId).toBe("");
    const calls = ch.send.mock.calls.length + ch.messages.edit.mock.calls.length;
    expect(await renderCaperCard(fc.client, c.id)).toBe("skipped");
    expect(ch.send.mock.calls.length + ch.messages.edit.mock.calls.length).toBe(calls);
    let full = false;
    for (const r of JOINERS) full = (await joinCaper({ caperId: c.id, uid: ids[r], role: r, guildId: G })).full;
    expect(full).toBe(true);
    expect((await runStart(fc.client, c.id, { kind: "auto" })).status).toBe("started");
    for (const id of Object.values(ids)) expect(fc.dms.get(id)).toBe(1);
  });

  it("a rejected edit is retried once with the banner and attachments: [] (C5)", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    fc.editFailures.push({ code: 50035 });
    expect(await renderCaperCard(fc.client, caper.id)).toBe("ok");
    const edit = fc.channel(CH).messages.edit;
    expect(edit).toHaveBeenCalledTimes(2);
    expect(fileNames(edit.mock.calls[0][1])).toEqual([]);
    expect(fileNames(edit.mock.calls[1][1])).toEqual(["cf_caper_t1.png"]);
    expect(edit.mock.calls[1][1].attachments).toEqual([]);
  });

  it("the trailing debounce renders the last of two joins inside 2 s", async () => {
    const { ids, fc, c, mid } = await postedLobby();
    const edit = fc.channel(CH).messages.edit;
    await joinCaper({ caperId: c.id, uid: ids.LOOKOUT, role: "LOOKOUT", guildId: G });
    await requestCaperRender(fc.client, c.id);                      // "set": renders now
    await new Promise((r) => setTimeout(r, 100));
    await joinCaper({ caperId: c.id, uid: ids.SAFECRACKER, role: "SAFECRACKER", guildId: G });
    await requestCaperRender(fc.client, c.id);                      // "held": schedules one trailing render
    expect(edit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(2), { timeout: 4_000, interval: 50 });
    expect(edit.mock.calls[1][0]).toBe(mid);
    expect(text(edit.mock.calls[1][1])).toContain(`<@${ids.SAFECRACKER}>`);     // read from the DB at fire time
    await new Promise((r) => setTimeout(r, 2_100));
    expect(edit).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("lobby DMs: only eligible, unseated members in the lobby's guild; at most 3 per member per rolling 24 h; none within 2 h of a cancelled lobby", async () => {
    const now = new Date();
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const assoc = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["hunting_permit"] });
    // Associate is derived from tenure (plan 1 P20), never a stored role: a Soldier who joined now is one.
    await testPrisma.familyMember.create({ data: { familyId: f.family.id, userId: assoc, role: "SOLDIER", roleSlot: assoc, seat: 9, joinedAt: now } });
    await testPrisma.inventory.deleteMany({ where: { userId: f.ids.DRIVER } });                       // no prep item for any open role
    const fc = fakeCaperClient({ members: [f.ids.MASTERMIND, f.ids.LOOKOUT, f.ids.DRIVER, assoc] });   // the Safecracker is not in the guild
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
    expect(await announceLobby(fc.client, c.id, now)).toEqual([f.ids.LOOKOUT]);
    for (let k = 0; k < 3; k++) await announceLobby(fc.client, c.id, now);
    expect(fc.dms.get(f.ids.LOOKOUT)).toBe(3);
    const old = await testPrisma.caper.create({ data: { familyId: f.family.id, tier: 1, status: "CANCELLED", outcome: "CANCELLED", liveSlot: "old-cancel", plannerId: f.ids.MASTERMIND, guildId: G, channelId: CH, lobbyClosesAt: now } });
    await setCaperUpdatedAt(old.id, new Date(+now - 3_600_000));
    await flushTestKeys("cf:lobbydm:*");
    expect(await announceLobby(fc.client, c.id, now)).toEqual([]);
  });

  it("Start enqueues the caper reminder at the older seat's startedAt + 24 h", async () => {
    const now = new Date();
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const earlier = new Date(+now - 3 * 3_600_000);
    await testPrisma.caperCrew.create({ data: { caperId: "65f000000000000000000001", familyId: f.family.id, userId: f.ids.LOOKOUT, role: "LOOKOUT", liveSlot: "65f000000000000000000001", stake: 50_000, started: true, startedAt: earlier } });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
    for (const r of JOINERS) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r, guildId: G, now });
    expect((await runStart(fc.client, c.id, { kind: "auto" }, now)).status).toBe("started");
    expect(await testPrisma.cooldownReminder.findMany({ where: { discordId: f.ids.LOOKOUT, type: "caper" } })).toMatchObject([{ dueAt: new Date(+earlier + 86_400_000) }]);
    expect(await testPrisma.cooldownReminder.count({ where: { discordId: f.ids.SAFECRACKER, type: "caper" } })).toBe(0);
  });

  it("!caper repost edits the old card to Lobby moved", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    const mid = await postCaperCard(fc.client, caper.id, "c2");
    expect(fc.sent.map((s) => s.channelId)).toEqual(["c2"]);
    const moved = fc.edits.find((e) => e.messageId === "m0")!;
    expect(moved.channelId).toBe(CH);
    expect(text(moved.payload)).toContain(`Lobby moved: https://discord.com/channels/${G}/c2/${mid}`);
    expect(moved.payload.attachments).toEqual([]);
    expect(await caperRow(caper.id)).toMatchObject({ channelId: "c2", messageId: mid });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/caper-flow.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `debounce.ts`, `caperCard.ts` and `caperFlow.ts`** as specified under Interfaces.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/caper-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/crimeFamily/debounce.ts src/ui/crimeFamily/caperCard.ts src/ui/crimeFamily/caperFlow.ts test/crimeFamily/caperFixtures.ts test/crimeFamily/caper-flow.test.ts
git commit -m "feat(capers): single card writer, trailing debounce, lobby and GO announcements"
```

---
### Task 12: The `cpr:` routes

**Files:**
- Modify: `src/handlers/caperInteractionHandler.ts` (fill `CAPER_ROUTES`), `src/handlers/crimeFamilyRouter.ts` (the `cpr` missing-entry copy becomes `"This button is no longer active."`), `test/crimeFamily/fakeInteraction.ts` (`fakeButton`/`fakeSelect` accept an optional `client` that replaces the fake's own `i.client`, so caper route tests pass Task 11's `fakeCaperClient(...).client`, whose channels carry `guildId`, message ids and the `missingPerms` mapping below), `test/crimeFamily/handlers.test.ts` (replace the case "the S2 Caper button answers 'Capers open soon.' until plan 2")
- Test: `test/crimeFamily/caper-handlers.test.ts`

**Interfaces:**
- Consumes: `CfRouteEntry`, `rejectPress`, `isCrimeFamilyOpen`, `requireMembership`, `buildPlannerView`, `buildCaperPlanner`, `pickLobbyChannel`, `postCaperCard`, `announceLobby`, `planCaper`, `joinCaper`, `leaveCaper`, `onSeatsChanged`, `runStart`, `runCancel`, `openBrief`, `lockChoice`, `buildBrief`, `buildNotice`, `resolveAndAnnounce`, `renderCaperCard`, `requestCaperRender`, `jumpLink`.
- Produces `CAPER_ROUTES` (the router owns the owner check and the ack; every route re-reads membership from the DB; route keys per plan 1's `"<action>"` / `"<action>:<first arg>"` rule):

| Key | customId | scope | ack | Run |
|---|---|---|---|---|
| `v:plan` | `cpr:v:plan:<owner>` (S2 Caper) | owner | ephemeral | `editReply(buildCaperPlanner(await buildPlannerView(uid, now), { art: true, ephemeral: true }))` |
| `plan` | `cpr:plan:<owner>` (S11 select) | owner | ephemeral | closed guild → `"Crime Families are not open in this server yet."`; `pickLobbyChannel(client, i.channelId, family)` → `planCaper({ tier: Number(values[0]) })` → `postCaperCard` → `void announceLobby` → `editReply(buildNotice(\`Lobby posted: ${jump}\`))` |
| `join` | `cpr:join:<caperId>` (S12 select) | shared | update | closed guild → same refusal; `joinCaper({ role: values[0], guildId: i.guildId })` → `onSeatsChanged` |
| `leave` | `cpr:leave:<caperId>` | shared | update | `leaveCaper` → `cancelled ? renderCaperCard : requestCaperRender` |
| `start` | `cpr:start:<caperId>` | shared | update | `runStart(client, id, { kind: "press", uid })`; not `started` → `rejectPress(i, reason)` |
| `cancel` | `cpr:cancel:<caperId>` | shared | update | `runCancel(client, id, uid)` |
| `brief` | `cpr:brief:<caperId>` (S13, S25, S28, S14 Refresh) | shared | auto | `editReply(buildBrief(await openBrief(id, uid)))` |
| `act` | `cpr:act:<caperId>:<0-3>` (S14) | shared | update | `lockChoice(id, uid, Number(args[1]))` → `editReply(buildBrief(brief))`; `allLocked` → `await resolveAndAnnounce(client, id, new Date())` after the reply |
| `open:brief` | `cpr:open:brief:<caperId>:<owner>` (S27) | owner | ephemeral | `editReply(buildBrief(await openBrief(args[1], uid)))` |

**Permission contract** (plan 1's `missingBotPermissions`, `src/ui/crimeFamily/post.ts`): it calls `channel.permissionsFor(botId)?.has(PermissionFlagsBits[name])` for each `name` of `["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"]` and returns the display names of the missing ones ("View Channel", "Send Messages", "Read Message History", "Attach Files"). `fakeCaperClient` (Task 11), the only fake that models missing permissions, maps its flag names through `PermissionFlagsBits` and compares bigints; route tests hand its client to `fakeButton`/`fakeSelect`. If plan 1's helper turns out to pass something else to `has()`, fix the fake to that argument, never the helper.

Jail never blocks `brief` or `act` (edge 5): those services do not call `checkJailStatus`; plan and join are blocked through the eligibility gate.

- [ ] **Step 1: Write the failing tests**

In `test/crimeFamily/handlers.test.ts`, replace the case "the S2 Caper button answers 'Capers open soon.' until plan 2" with:

```ts
  it("the S2 Caper button opens the planner; an unknown cpr action is no longer active", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const i = fakeButton(CPR_IDS.viewPlan(boss), { userId: boss, guildId: "g1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.deferReply).toHaveBeenCalledTimes(1);
    expect(i.ephemeral).toBe(true);
    expect(said(i)).toContain("How a caper works");
    expect(said(i)).toContain(`cpr:plan:${boss}`);
    const gone = fakeButton("cpr:nope:u1", { userId: "u1" });
    await handleCrimeFamilyInteraction(gone as any);
    expect(said(gone)).toContain("This button is no longer active.");
  });
```

```ts
// test/crimeFamily/caper-handlers.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { planCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, fakeSelect, said } from "./fakeInteraction";
import { testPrisma, resetFamilies, ensureUniqueIndexes, withCfConfig, flushTestKeys } from "../helpers";
import { caperCrew, seedRunning, fakeCaperClient, G, CH } from "./caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const seat = (caperId: string, userId: string) => testPrisma.caperCrew.findFirstOrThrow({ where: { caperId, userId } });
const press = async <T>(i: T) => { await handleCrimeFamilyInteraction(i as any); return i as any; };
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

describe("cpr: planner routes", () => {
  it("plan from a Soldier is refused with no caper", () => open(async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    const i = await press(fakeSelect(CPR_IDS.plan(ids.LOOKOUT), ["1"], { userId: ids.LOOKOUT, guildId: G, channelId: CH, client: fc.client }));
    expect(said(i)).toContain("Only a Capo or above can plan a caper.");
    expect(await testPrisma.caper.count()).toBe(0);
  }));

  it("plan while closed", async () => {
    const { bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: G, channelId: CH, client: fakeCaperClient().client }));
    expect(said(i)).toContain("Crime Families are not open in this server yet.");
    expect(await testPrisma.caper.count()).toBe(0);
  });

  it("plan in a channel missing Attach Files outside the home guild", () => open(async () => {
    const { family, bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    await testPrisma.family.update({ where: { id: family.id }, data: { homeGuildId: "g9", homeChannelId: "c9" } });
    const fc = fakeCaperClient({ missingPerms: { [CH]: ["AttachFiles"] } });
    const before = await wallet(bossId);
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: G, channelId: CH, client: fc.client }));
    expect(said(i)).toContain("I need Attach Files in this channel to post the lobby.");
    expect(await testPrisma.caper.count()).toBe(0);
    expect(await wallet(bossId)).toBe(before);
    expect(fc.sent).toHaveLength(0);
  }));

  it("plan posts the card and answers with its jump link", () => open(async () => {
    const { family, bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: G, channelId: CH, client: fc.client }));
    expect(fc.sent).toHaveLength(1);
    expect(fc.sent[0].payload.files).toHaveLength(1);
    expect((await testPrisma.caper.findFirstOrThrow({ where: { familyId: family.id } })).messageId).toBe("m1");
    expect(said(i)).toContain(`Lobby posted: https://discord.com/channels/${G}/${CH}/m1`);
  }));
});

describe("cpr: lobby and GO routes", () => {
  it("join from another guild", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const i = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: "g2", client: fakeCaperClient().client }));
    expect(i.order[0]).toBe("deferUpdate");
    expect(said(i)).toContain("This caper is in another server; join that server to play.");
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id } })).toBe(1);
  }));

  it("brief from the public card defers ephemerally; Refresh from the brief defers as an update", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    const pub = await press(fakeButton(CPR_IDS.brief(caper.id), { userId: ids.LOOKOUT, guildId: G }));
    expect(pub.deferReply).toHaveBeenCalledTimes(1);
    expect(pub.ephemeral).toBe(true);
    expect(said(pub)).toContain("Tell <@");
    const refresh = await press(fakeButton(CPR_IDS.brief(caper.id), { userId: ids.LOOKOUT, guildId: G, ephemeralSource: true }));
    expect(refresh.deferUpdate).toHaveBeenCalledTimes(1);
    expect(refresh.deferReply).not.toHaveBeenCalled();
  });

  it("a dark seat's option press is refused", async () => {
    // leakAt = goEndsAt − 30 s is 10 s in the past at press time
    const goEndsAt = new Date(Date.now() + 20_000);
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], startedAt: new Date(Date.now() - 100_000), goEndsAt, picks: { LOOKOUT: "none" } });
    await testPrisma.caperCrew.updateMany({ where: { caperId: caper.id, userId: ids.LOOKOUT }, data: { briefOpened: true, briefOpenedAt: new Date(+goEndsAt - 30_000) } });   // opened exactly at leakAt
    const i = await press(fakeButton(CPR_IDS.act(caper.id, 0), { userId: ids.LOOKOUT, guildId: G, ephemeralSource: true }));
    expect(said(i)).toContain("You went dark: this seat counts as a miss.");
    expect((await seat(caper.id, ids.LOOKOUT)).choice).toBe(-1);
  });

  it("the last lock resolves the caper", async () => {
    const { caper, ids, answers } = await seedRunning({ tier: 1, roles: [...R3], picks: { SAFECRACKER: "none" } });
    await press(fakeButton(CPR_IDS.act(caper.id, answers.seats.SAFECRACKER!.correct), { userId: ids.SAFECRACKER, guildId: G, ephemeralSource: true, client: fakeCaperClient().client }));
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: caper.id } })).status).toBe("RESOLVED");
  });

  it("a jailed crew member can still open the brief and lock (edge 5)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" } });
    await testPrisma.user.update({ where: { discordId: ids.LOOKOUT }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    const b = await press(fakeButton(CPR_IDS.brief(caper.id), { userId: ids.LOOKOUT, guildId: G }));
    expect(said(b)).toContain("Tell <@");
    await press(fakeButton(CPR_IDS.act(caper.id, 1), { userId: ids.LOOKOUT, guildId: G, ephemeralSource: true, client: fakeCaperClient().client }));
    expect((await seat(caper.id, ids.LOOKOUT)).choice).toBe(1);
  });

  it("another user's S27 opener is not theirs", async () => {
    const db = vi.spyOn(prisma.caper, "findUnique");
    const i = await press(fakeButton(CPR_IDS.openBrief("65f000000000000000000001", "111111111111111111"), { userId: "222222222222222222" }));
    expect(said(i)).toContain("This panel is not yours.");
    expect(db).not.toHaveBeenCalled();
    db.mockRestore();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/caper-handlers.test.ts test/crimeFamily/handlers.test.ts`
Expected: FAIL (the routes are empty; the replaced plan 1 case).

- [ ] **Step 3: Implement the routes and the two small modifications** as specified under Interfaces.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/crimeFamily/caper-handlers.test.ts test/crimeFamily/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/caperInteractionHandler.ts src/handlers/crimeFamilyRouter.ts test/crimeFamily/fakeInteraction.ts test/crimeFamily/handlers.test.ts test/crimeFamily/caper-handlers.test.ts
git commit -m "feat(capers): persistent cpr: routes for planner, lobby, brief and choices"
```

---

### Task 13: The minute sweeper

**Files:**
- Create: `src/services/crimeFamily/caperSweeper.ts`
- Modify: `src/services/crimeFamily/scheduler.ts` (append `SWEEP_CAPERS_JOB` to the `* * * * *` entry of `CF_SCHEDULES`, after `sweepInvites`)
- Test: `test/crimeFamily/caper-sweeper.test.ts`; append one case to `test/crimeFamily/scheduler.test.ts`

**Interfaces:**
- Consumes: `processBootedAt`, `runStart`, `runCancel`, `resolveAndAnnounce`, `renderCaperCard`, `CfJob`.
- Produces: `sweepCapers(client: Client, now: Date, bootedAt?: Date): Promise<void>` and `SWEEP_CAPERS_JOB: CfJob = { name: "sweepCapers", run: (client, now) => sweepCapers(client, now) }`. Spec 15, in this order, each caper in its own try/catch logging `` `[crimeFamily] sweepCapers ${id} error` ``:
  - (a) LOBBY with `lobbyClosesAt ≤ now` → `runStart(client, id, { kind: "sweeper" }, now)`; `pinched` or `waiting` → `runCancel(client, id, null, now)` (D42 cooldown, refunds); `started`, `cancelled` (a pinched planner already cancelled it and `runStart` rendered it) and `closed` → nothing more.
  - (b) RUNNING with `goEndsAt ≤ now` → `resolveAndAnnounce(client, id, now, bootedAt)` (VOID, corrupt or settle).
  - (c) SETTLING (any age) → `resolveAndAnnounce` (resume, C4).
  - (e) LOBBY with `lobbyClosesAt > now` → `renderCaperCard` once (heals a lost trailing render); RESOLVED or CANCELLED with `updatedAt ≥ now − caperEndedRerenderSeconds` → `renderCaperCard` (C6).
  - The sweeper ignores `CRIME_FAMILY_CONFIG.enabled` (spec 15, edge 58).

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/caper-sweeper.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
const boom = vi.hoisted(() => ({ id: "" }));
vi.mock("../../src/services/crimeFamily/caperSettleService", async (orig) => {
  const m = await orig<typeof import("../../src/services/crimeFamily/caperSettleService")>();
  return { ...m, resolveCaper: async (...a: Parameters<typeof m.resolveCaper>) => { if (a[0] === boom.id) throw new Error("boom"); return m.resolveCaper(...a); } };
});
const { sweepCapers } = await import("../../src/services/crimeFamily/caperSweeper");
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig } from "../helpers";
import { seedLobby, seedRunning, fakeCaperClient, setCaperUpdatedAt, txCount } from "./caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const BOOT = new Date(0);                                         // booted long before every seeded startedAt: no C1 VOID
const caperRow = (id: string) => testPrisma.caper.findUniqueOrThrow({ where: { id } });
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const board = (id: string, messageId: string) => testPrisma.caper.update({ where: { id }, data: { messageId } });
const fileNames = (payload: any): string[] => (payload.files ?? []).map((f: any) => f.name);
const dueRun = () => ({ tier: 1 as const, roles: [...R3], startedAt: new Date(Date.now() - 200_000) });   // goEndsAt 80 s ago

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); boom.id = ""; });

describe("sweepCapers (spec 15)", () => {
  it("a lobby past its close starts when the required roles are filled", async () => {
    const now = new Date();
    const { caper } = await seedLobby({ tier: 1, roles: [...R3], now: new Date(+now - 601_000) });   // lobbyClosesAt = now − 1 s
    await board(caper.id, "m0");
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, now, BOOT);
    expect((await caperRow(caper.id)).status).toBe("RUNNING");
    expect(fc.sent.filter((s) => Array.isArray(s.payload.allowedMentions?.users))).toHaveLength(1);
  });

  it("a lobby past its close without the required roles is cancelled with refunds and the 30-minute cooldown", async () => {
    const now = new Date();
    const { caper, family, ids } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"], now: new Date(+now - 601_000) });
    await board(caper.id, "m0");
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, now, BOOT);
    expect(await caperRow(caper.id)).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED" });
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(2);
    expect(+(await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } })).nextCaperAt).toBe(+now + 1_800_000);
    expect(fc.edits.find((e) => e.messageId === "m0")!.payload.attachments).toEqual([]);
  });

  it("a RUNNING caper past goEndsAt resolves and the card shows the result", async () => {
    const { caper } = await seedRunning(dueRun());
    await board(caper.id, "m0");
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, new Date(), BOOT);
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
    expect(fc.edits.some((e) => e.messageId === "m0" && fileNames(e.payload).some((n) => n.startsWith("cf_result_")))).toBe(true);
  });

  it("a restart VOID through the sweeper", async () => {
    const run = dueRun();
    const { caper, ids } = await seedRunning({ ...run, picks: { LOOKOUT: "none" } });
    await sweepCapers(fakeCaperClient().client, new Date(), new Date(+run.startedAt + 50_000));
    expect(await caperRow(caper.id)).toMatchObject({ status: "CANCELLED", outcome: "VOID" });
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(50_000);
  });

  it("a SETTLING caper is resumed", async () => {
    const { caper } = await seedRunning({ tier: 1, roles: [...R3], status: "SETTLING" });
    await sweepCapers(fakeCaperClient().client, new Date(), BOOT);
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
  });

  it("re-renders each LOBBY card once and recently ended cards only", async () => {
    const now = new Date();
    const a = await seedLobby({ tier: 1, roles: [...R3], now });                    // open lobby, closes in 600 s
    const b = await seedRunning({ tier: 1, roles: [...R3] });                       // goEndsAt in the future: not due
    const c = await seedRunning({ tier: 1, roles: [...R3] });
    await board(a.caper.id, "mA");
    for (const [x, mid, ago] of [[b, "mB", 60_000], [c, "mC", 600_000]] as const) {
      await testPrisma.caper.update({ where: { id: x.caper.id }, data: { status: "RESOLVED", liveSlot: x.caper.id, outcome: "CLEAN", messageId: mid } });
      await setCaperUpdatedAt(x.caper.id, new Date(+now - ago));
    }
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, now, BOOT);
    expect(fc.edits.map((e) => e.messageId).sort()).toEqual(["mA", "mB"]);
  });

  it("one failing caper does not stop the others", async () => {
    const x = await seedRunning(dueRun());
    const y = await seedRunning(dueRun());
    boom.id = x.caper.id;
    await sweepCapers(fakeCaperClient().client, new Date(), BOOT);
    expect((await caperRow(x.caper.id)).status).toBe("RUNNING");
    expect((await caperRow(y.caper.id)).status).toBe("RESOLVED");
  });

  it("runs while the feature is off", () => withCfConfig({ enabled: false }, async () => {
    const { caper } = await seedRunning(dueRun());
    await sweepCapers(fakeCaperClient().client, new Date(), BOOT);
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
  }));
});
```

Append to `test/crimeFamily/scheduler.test.ts`:
```ts
it("sweepCapers runs in the minute schedule after sweepInvites", () => {
  expect(CF_SCHEDULES.find((s) => s.cron === "* * * * *")!.jobs.map((j) => j.name)).toEqual(["sweepInvites", "sweepCapers"]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/caper-sweeper.test.ts test/crimeFamily/scheduler.test.ts`
Expected: FAIL, `caperSweeper` not found.

- [ ] **Step 3: Implement `caperSweeper.ts` and register the job** as specified under Interfaces.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/crimeFamily/caper-sweeper.test.ts test/crimeFamily/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperSweeper.ts src/services/crimeFamily/scheduler.ts test/crimeFamily/caper-sweeper.test.ts test/crimeFamily/scheduler.test.ts
git commit -m "feat(capers): minute sweeper for lobby close, GO end, resume and card healing"
```

---

### Task 14: `!caper`, `/caper`, the alias and router wiring

**Files:**
- Create: `src/commands/economy/caper.ts`
- Modify: `src/commandRouter.ts` (alias `capers: "caper"` in the map `:145-196`; `case "caper":` with a lazy `require("./commands/economy/caper")` beside plan 1's `case "crew":`; `"caper"` in `validCommands` `:618-623`; **not** in `restrictedInJail` `:254-259`), `src/slash/registry.ts` (spec after plan 1's `crew` spec), `test/slash/registry.test.ts`, `test/router/crew-jail.test.ts`
- Test: `test/crimeFamily/caper-command.test.ts`

**Interfaces:**
- Consumes: `isCrimeFamilyOpen`, `requireMembership`, `getLiveCaper`, `liveSeatOf`, `planCaper`, `joinCaper`, `leaveCaper`, `pickLobbyChannel`, `postCaperCard`, `announceLobby`, `onSeatsChanged`, `runStart`, `runCancel`, `renderCaperCard`, `requestCaperRender`, `buildPlannerView`, `buildCaperPlanner`, `buildCaperSeatCard`, `buildOpener`, `buildNotice`, `jumpLink`, `touchActivity`, `errorContainer`, `CPR_IDS`.
- Produces:
  - The command context is plan 1's `CrewCtx` (`src/commands/economy/crew.ts`), imported, never redeclared (same shape; DRY).
  - `CAPER_SUBACTIONS: Readonly<Record<"view" | "plan" | "join" | "leave" | "start" | "cancel" | "brief", (ctx: CrewCtx) => Promise<unknown>>>`
  - `handleCaper(message: Message, args: string[]): Promise<unknown>` (no guild → return; `void touchActivity`; unknown subaction → `` `Usage: ${prefix}caper [plan <1-4> | join <role> | leave | start | cancel | brief]` ``)
  - `parseRoleArg(raw: string | undefined): CaperRoleKey | null` (lowercase, drop spaces, `-` and `_`, match a role key or a role name the same way)
  - Slash: `{ name: "caper", desc: "Family capers: plan, join and play the crew heist", opts: [{ kind: "str", name: "action", desc: "What to do -- leave blank to view", required: false, choices: ["plan", "join", "leave", "start", "cancel", "brief"] }, { kind: "str", name: "value", desc: "Tier 1-4 for plan, a role for join", required: false }] }` (72 of 100).
- Subactions (service errors become a public one-line `errorContainer`, plan 1 convention):
  - `view`: not a member → "You are not in a crime family. Start with `!crew`."; a live caper in this guild → `postCaperCard(client, id, channelId)` (repost, old board edited to "Lobby moved", C7); a live caper in another guild → notice "Your family's caper is running in another server: <jump>"; else the family's latest RESOLVED caper with `messageId === ""` and `updatedAt ≥ now − caperDeadResultRepostSeconds` → `postCaperCard` (C7); else `isCrimeFamilyOpen` → S11 public with art, or the closed refusal.
  - `plan <1-4>`: open check; `pickLobbyChannel`; `planCaper`; `postCaperCard`; `void announceLobby`; when the lobby went to the home channel, reply "Lobby posted in <#home>: <jump>".
  - `join <role>`: open check; `parseRoleArg(ctx.args.join(" "))` (the whole remainder, so `!caper join safe cracker` reaches `"safe cracker"`; null → "Unknown role. Roles: Lookout, Safecracker, Driver, Muscle, Hacker."); no LOBBY caper → "Your family has no open lobby."; `joinCaper` with `message.guildId`; reply S25 `buildCaperSeatCard({ text: "Seated as <Role>.", jumpUrl })`; `onSeatsChanged`.
  - `leave` / `start` / `cancel`: on the family's live caper ("Your family has no open lobby."); `leave` → `leaveCaper` + render; `start` → `runStart({ kind: "press", uid })` (not `started` → its reason); `cancel` → `runCancel`.
  - `brief`: the caller's live seat in a RUNNING caper → S27 `buildOpener("Your caper brief is ready.", { customId: CPR_IDS.openBrief(caperId, uid), label: "Open brief" })`; else "No caper is running."

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/caper-command.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { handleCaper, parseRoleArg } from "../../src/commands/economy/caper";
import { planCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig } from "../helpers";
import { caperCrew, seedRunning, fakeCaperClient, setCaperUpdatedAt, G, CH } from "./caperFixtures";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const fileNames = (payload: any): string[] => (payload.files ?? []).map((f: any) => f.name);
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);

/** Runs `!caper <args>` as uid in channelId; `said()` is every reply payload as JSON. */
async function run(fc: ReturnType<typeof fakeCaperClient>, uid: string, args: string[], channelId = CH) {
  const reply = vi.fn(async (_p: unknown) => ({ id: "r1" }));
  const message = { client: fc.client, guildId: G, guild: { id: G }, channelId, channel: fc.channel(channelId), author: { id: uid, username: "T", bot: false }, reply } as any;
  await handleCaper(message, args);
  return { reply, said: () => JSON.stringify(reply.mock.calls) };
}
async function lobby() {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const fc = fakeCaperClient({ members: Object.values(f.ids) });
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
  return { ...f, fc, c };
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

describe("parseRoleArg (Review Focus 2)", () => {
  it.each([["LOOKOUT", "LOOKOUT"], ["lookout", "LOOKOUT"], [" Safecracker ", "SAFECRACKER"], ["safe cracker", "SAFECRACKER"], ["Safe-Cracker", "SAFECRACKER"], ["safe_cracker", "SAFECRACKER"], ["mastermind", "MASTERMIND"], ["hacker", "HACKER"], ["boss", null], [undefined, null]] as const)(
    "%s → %s", (raw, want) => expect(parseRoleArg(raw)).toBe(want));
});

describe("!caper", () => {
  it("join refusals name the reason and debit nothing (Review Focus 2)", () => open(async () => {
    const { ids, fc } = await lobby();
    const before = await wallet(ids.LOOKOUT);
    expect((await run(fc, ids.LOOKOUT, ["join", "mastermind"])).said()).toContain("The Mastermind seat belongs to the planner.");
    expect((await run(fc, ids.LOOKOUT, ["join", "hacker"])).said()).toContain("That role is not part of this caper.");
    expect((await run(fc, ids.LOOKOUT, ["join", "wizard"])).said()).toContain("Unknown role. Roles: Lookout, Safecracker, Driver, Muscle, Hacker.");
    expect(await wallet(ids.LOOKOUT)).toBe(before);
  }));

  it("!caper join safe cracker seats the member as SAFECRACKER (the whole remainder is the role)", () => open(async () => {
    const { ids, fc, c } = await lobby();
    await run(fc, ids.SAFECRACKER, ["join", "safe", "cracker"]);
    expect(await testPrisma.caperCrew.findFirst({ where: { caperId: c.id, userId: ids.SAFECRACKER } })).toMatchObject({ role: "SAFECRACKER" });
  }));

  it("!caper plan 1 posts S12 and stores its id; plan 9 is refused", () => open(async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient();
    expect((await run(fc, ids.MASTERMIND, ["plan", "9"])).said()).toContain("Pick a tier from 1 to 4.");
    await run(fc, ids.MASTERMIND, ["plan", "1"]);
    expect(fc.sent).toHaveLength(1);
    expect(fileNames(fc.sent[0].payload)).toEqual(["cf_caper_t1.png"]);
    expect((await testPrisma.caper.findFirstOrThrow({ where: { familyId: family.id } })).messageId).toBe("m1");
  }));

  it("!caper join lookout from another channel replies S25 with the jump link and an Open brief button", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const mid = await postCaperCard(fc.client, c.id, CH);
    const m = await run(fc, ids.LOOKOUT, ["join", "lookout"], "c2");
    expect(m.said()).toContain(`https://discord.com/channels/${G}/${CH}/${mid}`);
    expect(m.said()).toContain(`cpr:brief:${c.id}`);
  }));

  it("!caper with a live lobby in this guild reposts it (Review Focus 4)", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const mid = await postCaperCard(fc.client, c.id, CH);
    await run(fc, ids.LOOKOUT, [], "c2");
    expect(fc.sent.map((s) => s.channelId)).toEqual([CH, "c2"]);
    expect(JSON.stringify(fc.edits.find((e) => e.messageId === mid)!.payload.components.map((x: any) => x.toJSON()))).toContain("Lobby moved");
  }));

  it("!caper reposts a dead result from 10 minutes ago and shows S11 for one from 2 hours ago (C7)", () => open(async () => {
    const r = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.caper.update({ where: { id: r.caper.id }, data: { status: "RESOLVED", liveSlot: r.caper.id, outcome: "CLEAN", messageId: "" } });
    await setCaperUpdatedAt(r.caper.id, new Date(Date.now() - 600_000));
    const fc = fakeCaperClient();
    await run(fc, r.ids.LOOKOUT, []);
    expect(fc.sent).toHaveLength(1);
    expect(fileNames(fc.sent[0].payload)).toEqual(["cf_result_clean.png"]);
    await testPrisma.caper.update({ where: { id: r.caper.id }, data: { messageId: "" } });
    await setCaperUpdatedAt(r.caper.id, new Date(Date.now() - 7_200_000));
    const m = await run(fc, r.ids.LOOKOUT, []);
    expect(fc.sent).toHaveLength(1);
    expect(m.said()).toContain("How a caper works");
  }));

  it("!caper brief with a running seat replies an S27 opener; without one, No caper is running.", async () => {
    const r = await seedRunning({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    expect((await run(fc, r.ids.LOOKOUT, ["brief"])).said()).toContain(CPR_IDS.openBrief(r.caper.id, r.ids.LOOKOUT));
    await testPrisma.caper.update({ where: { id: r.caper.id }, data: { status: "RESOLVED", liveSlot: r.caper.id } });
    await testPrisma.caperCrew.updateMany({ where: { caperId: r.caper.id }, data: { liveSlot: r.caper.id } });
    expect((await run(fc, r.ids.LOOKOUT, ["brief"])).said()).toContain("No caper is running.");
  });
});
```

Append to `test/router/crew-jail.test.ts` (through `routeMessage`, so `withCfConfig` patches both module copies; add `testPrisma` to its `../helpers` import and `import { seedRunning, seedLobby } from "../crimeFamily/caperFixtures"`):
```ts
it("a jailed member can open the caper brief but cannot join (13.1)", async () => {
  await withCfConfig({ enabled: true }, async () => {
    const run = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await testPrisma.user.update({ where: { discordId: run.ids.LOOKOUT }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    const brief = fakeMessage("!caper brief", { authorId: run.ids.LOOKOUT, guildId: "g1" });
    await routeMessage({} as any, brief.message, "!");
    expect(replyText(brief.reply.mock.calls[0][0])).toContain(`cpr:open:brief:${run.caper.id}:${run.ids.LOOKOUT}`);
  });
  await resetFamilies();
  await withCfConfig({ enabled: true }, async () => {
    const lobby = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    const extra = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["mechanic_toolkit"], jailedUntil: new Date(Date.now() + 3_600_000) });
    await testPrisma.familyMember.create({ data: { familyId: lobby.family.id, userId: extra, role: "SOLDIER", roleSlot: extra, seat: 9, joinedAt: new Date(Date.now() - 10 * 864e5) } });
    const join = fakeMessage("!caper join safecracker", { authorId: extra, guildId: "g1" });
    await routeMessage({} as any, join.message, "!");
    expect(replyText(join.reply.mock.calls[0][0])).toMatch(/jail/i);
    expect(await testPrisma.caperCrew.count({ where: { userId: extra } })).toBe(0);
  });
});
```

Append to the `it.each` table of `test/slash/registry.test.ts`: `["caper", { action: "join", value: "lookout" }, ["join", "lookout"]]`, `["caper", { action: "plan", value: "2" }, ["plan", "2"]]`, `["caper", {}, []]`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/caper-command.test.ts test/router test/slash/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `caper.ts`, the router wiring and the slash spec** as specified under Interfaces.

- [ ] **Step 4: Run them, the router suites and the slash validator**

Run: `$VT test/crimeFamily/caper-command.test.ts test/router test/slash/registry.test.ts`
Expected: PASS.
Run: `npm run validate:slash`
Expected: "72/100 used" and "All slash command specs are valid."

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/caper.ts src/commandRouter.ts src/slash/registry.ts test/crimeFamily/caper-command.test.ts test/router/crew-jail.test.ts test/slash/registry.test.ts
git commit -m "feat(capers): !caper command, /caper, capers alias and jail routing"
```

---

### Task 15: Redis-outage and tester guarantees for capers

**Files:**
- Test: append to `test/anticheat/family-redis-down.test.ts` and `test/anticheat/family-tester.test.ts`

**Interfaces:**
- Consumes: everything above; `redisService.getInstance`, `BOT_DEVELOPER_ID` (`src/utils/developerAccess.ts:3`).

- [ ] **Step 1: Write the tests**

```ts
// append to test/anticheat/family-redis-down.test.ts (spec 18 shape 4); the file already imports vi, testPrisma, resetFamilies and redisService
import { planCaper, joinCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { parseAnswers } from "../../src/services/crimeFamily/intelRing";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { onSeatsChanged, resolveAndAnnounce, announceLobby } from "../../src/ui/crimeFamily/caperFlow";
import { caperCrew, fakeCaperClient, G, CH } from "../crimeFamily/caperFixtures";

describe("capers with Redis down", () => {
  const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
  const bal = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  const text = (payload: any) => JSON.stringify(payload.components.map((c: any) => c.toJSON()));
  let down: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => { await resetFamilies(); down = vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); }); });
  afterEach(() => down.mockRestore());

  it("plan → joins → auto-start → locks → settle pays exactly the stored outcome, and every state renders", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const mid = await postCaperCard(fc.client, c.id, CH);
    for (const r of ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const) {
      const j = await joinCaper({ caperId: c.id, uid: f.ids[r], role: r, guildId: G });
      await onSeatsChanged(fc.client, c.id, j.full);                     // un-debounced render, then the auto-start
    }
    const run = await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } });
    expect(run.status).toBe("RUNNING");
    const base = new Map(await Promise.all(Object.values(f.ids).map(async (id) => [id, await bal(id)] as const)));   // after every stake
    const earnings0 = (await testPrisma.family.findUniqueOrThrow({ where: { id: f.family.id } })).earnings;
    const answers = parseAnswers(run.answers)!;
    const t = new Date(+run.startedAt + 5_000);
    for (const r of T1) { await openBrief(c.id, f.ids[r], t); await lockChoice(c.id, f.ids[r], answers.seats[r]!.correct, t); }
    await resolveAndAnnounce(fc.client, c.id, new Date(+run.goEndsAt + 1_000), new Date(0));
    const done = await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } });
    expect(done.status).toBe("RESOLVED");
    const cut = done.outcome === "CLEAN" ? 280_000 : 98_000;             // T1 n=4 (8.6)
    for (const id of Object.values(f.ids)) expect(await bal(id)).toBe(base.get(id)! + cut);
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.family.id } })).earnings).toBe(earnings0 + Math.floor((done.pool * 10) / 100));
    const cards = fc.edits.filter((e) => e.messageId === mid).map((e) => e.payload);
    expect(cards.some((p) => text(p).includes(`cpr:join:${c.id}`))).toBe(true);                                   // LOBBY
    expect(cards.some((p) => text(p).includes(`cpr:brief:${c.id}`))).toBe(true);                                  // GO (S13)
    expect(cards.some((p) => (p.files ?? []).some((x: any) => x.name.startsWith("cf_result_")))).toBe(true);      // result (S15)
  });

  it("announceLobby still DMs a qualified member (the lobby-DM cap fails open)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    expect(await announceLobby(fc.client, c.id)).toEqual(expect.arrayContaining([f.ids.LOOKOUT, f.ids.SAFECRACKER, f.ids.DRIVER]));
    expect(fc.dms.get(f.ids.LOOKOUT)).toBe(1);
  });
});
```

```ts
// append to test/anticheat/family-tester.test.ts (D34: no tester bypass); add resetUser to the file's "../helpers" import
import { readdirSync, readFileSync } from "node:fs";
import { planCaper, cancelCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { BOT_DEVELOPER_ID } from "../../src/utils/developerAccess";
import { caperCrew, G, CH } from "../crimeFamily/caperFixtures";

describe("capers treat testers like everyone else", () => {
  const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
  const bal = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  const plan = (uid: string) => planCaper({ uid, tier: 1, guildId: G, channelId: CH });
  beforeEach(async () => { await resetFamilies(); await resetUser(BOT_DEVELOPER_ID); });

  it("the stake, the family cooldown and the 2-seat cap all apply to BOT_DEVELOPER_ID", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1], plannerId: BOT_DEVELOPER_ID });
    const dev = f.ids.MASTERMIND;
    expect(dev).toBe(BOT_DEVELOPER_ID);
    const before = await bal(dev);
    const c = await plan(dev);
    expect(await bal(dev)).toBe(before - 50_000);
    await cancelCaper(c.id, dev);                                          // sets nextCaperAt = now + 1,800 s
    await expect(plan(dev)).rejects.toThrow(/^Family caper cooldown: ready <t:\d+:R>\.$/);
    await testPrisma.family.update({ where: { id: f.family.id }, data: { nextCaperAt: new Date() } });
    for (const k of [1, 2]) await testPrisma.caperCrew.create({ data: { caperId: `65f00000000000000000000${k}`, familyId: f.family.id, userId: dev, role: "MASTERMIND", liveSlot: `65f00000000000000000000${k}`, stake: 50_000, started: true, startedAt: new Date(Date.now() - k * 3_600_000) } });
    await expect(plan(dev)).rejects.toThrow(/^You've used both caper seats in the last 24 hours\. A seat frees <t:\d+:R>\.$/);
  });

  it("no Crime Families service and no caper UI module reads isTester", () => {
    const files = [
      ...readdirSync("src/services/crimeFamily").map((f) => `src/services/crimeFamily/${f}`),
      ...readdirSync("src/ui/crimeFamily").filter((f) => f.startsWith("caper")).map((f) => `src/ui/crimeFamily/${f}`),
    ];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toContain("isTester");
  });
});
```

- [ ] **Step 2: Run them**

Run: `$VT test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts`
Expected: PASS. If one fails, the defect is in the service it names: fix it there (Redis must never guard money, D33; no tester bypass, D34) and re-run.

- [ ] **Step 3: Commit**

```bash
git add test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts
git commit -m "test(capers): Redis outage and tester parity for the caper flow"
```

---

### Task 16: Help, tutorial, docs, changelog and the economy reference

**Files:**
- Modify: `src/commands/general/help.ts` (the `crimefamilies` category gains a `caper` command entry), `src/commands/general/tutorial.ts` (the `crimefamilies` lesson gains caper lines), `test/general/help-crime-families.test.ts`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/modules/crime-and-heat.ts`, `dashboard/src/content/commands.ts` (new `caper` entry; `!settings` lines `:77-78`), `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md` (its "Crime Families" section and Money Sinks list)

**Interfaces:**
- Consumes: catalog and config values for every number (house docs rule: exhaustive, exact numbers, full tables, a strategy section).
- Produces:
  - Help `caper` entry: `{ name: "caper", aliases: ["capers"], description: "Plan or join a family caper: a 10-minute lobby and a 120-second GO where the crew trades intel.", usage: "{p}caper [subcommand]", subcommands: ["plan <1-4> — plan a tier (Capo and above)", "join <role> — take a seat (Lookout, Safecracker, Driver, Muscle, Hacker)", "leave — leave the lobby (stake refunded)", "start — start once the required roles are filled", "cancel — cancel the lobby (planner or Boss)", "brief — open your brief during GO"], example: "{p}caper join lookout" }`.
  - Tutorial `crimefamilies` lesson `howToUse` gains "`{p}caper` — plan or join a family caper" and "`{p}caper brief` — open your brief during GO".
  - `crime-families.ts`: `forBeginners` gains `!caper` as a first command (plan 1 wrote it for `!crew`); caper sections: tiers (8.1, full table), roles and prep items (8.2 with every item and bonus), the intel ring and the leak (8.3, with the 4.2 example), the run step by step (8.4), outcome math (8.5), payouts and exact cuts (8.6 table), consequences (8.7), caps and cooldowns (8.9), expected value (8.10, all three tables), and "Getting better at capers" (open your brief before the last 30 seconds, say your intel to the right person, heat below the tier ceiling, best item per role for edge, why an AFK seat costs one miss, when to fill the optional role). `screenshot.src` becomes `/art/cf-caper-t4.png` (spec 19.3; plan 1 set `/art/cf-fortuna-don.png`, which stays in `dashboard/public/art/` for other pages); copy `src/assets/cf_caper_t4.png` to `dashboard/public/art/cf-caper-t4.png` (spec 16.1 website copies). `DocSection` (`dashboard/src/content/types.ts:31-38`) has no image field and none is added. `src/assets/cf_caper_t4.png` is already in the repo.
  - `commands.ts` `caper`: module `"economy"`, aliases `["capers"]`, `jailBlocked: false`, `interactive: true`, `keyNumbers`: Stake per seat 50,000 / 100,000 / 175,000 / 300,000; Pool per seat 350,000 / 550,000 / 850,000 / 1,200,000; Seats 2 per rolling 24 h; Family capers 4 per rolling 24 h; Lobby 10 min, GO 120 s. `!settings`: "Cooldown alarms" adds "family caper"; "Account notices" lists every account-group label in registry order.
  - `crime-and-heat.ts`: one line "Legendary heists are solo. For crew jobs see Crime Families: Capers."
  - Changelog: one entry "Crime Families and Capers" (stage A release, plan 1 defers it here).
  - `FORTUNA_V2_ECONOMY.md`: caper tables 8.1, 8.6, 8.10; sources S1, S2; sinks K5 (stakes) and K6 (Bust fines) in the Money Sinks list; the fence N1 and remainder N2.

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to test/general/help-crime-families.test.ts
it("the Crime Families category lists !caper with its subcommands", async () => {
  vi.resetModules();
  const help = await import("../../src/commands/general/help");
  const cat = help.CATEGORIES.find((c) => c.id === "crimefamilies")!;
  expect(cat.commands.find((c) => c.name === "caper")).toMatchObject({ aliases: ["capers"] });
  expect(JSON.stringify(help.buildModuleView(cat, "!").toJSON())).toContain("!caper join lookout");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write help, tutorial and docs** as specified under Interfaces.

- [ ] **Step 4: Run the test and the dashboard type check**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: PASS.
Run: `cd dashboard && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/help.ts src/commands/general/tutorial.ts test/general/help-crime-families.test.ts dashboard/src/content dashboard/src/app/changelog/page.tsx dashboard/public/art/cf-caper-t4.png FORTUNA_V2_ECONOMY.md
git commit -m "docs(capers): help, tutorial, website module, changelog and economy tables"
```

---

### Task 17: Full verification and the owner hand-off

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `$VT`
Expected: every file PASS (start the Redis container first).

- [ ] **Step 2: Static checks**

Run: `npm run typecheck && npm run validate:slash && npm run validate:app-emojis`
Expected: no type errors; "72/100 used"; 87 emojis validated without contacting Discord.

- [ ] **Step 3: Payload audit and tracked-file hygiene**

Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json && (grep -rn "isTester" src/services/crimeFamily src/ui/crimeFamily || echo "no isTester")`
Expected: "All payloads within Discord limits", `emojis.json` unchanged, "no isTester".

- [ ] **Step 4: Commit any fix-ups, then report the hand-off**

The hand-off (in the final message, not a file) states: deploy with `workflow_dispatch` (`run_schema: true`) because `Caper`/`CaperCrew` landed before the last commit (spec 19.1); the feature is still off (`enabled: false`); stage A is `enabled: true, allowGuildIds: ["<dev guild>"]` (spec 19.2), and capers can ship before any further art (D66); the `cf_` emojis need the owner's `npm run sync:app-emojis -- --family cf --plan`, then `npm run sync:app-emojis -- --family cf`, then a restart, if plan 1's hand-off has not been done yet; the post-launch read-only check is spec 19.2's `Transaction{type:"caper_cut"}` aggregate.

---

## Self-review notes (for the executor)

- **Spec coverage.** 8.1 tiers (plan 1 catalog; Tasks 2, 10, 16); 8.2 roles, prep gate, edge (Tasks 2, 5, 6); 8.3 ring, leak, darkness (Tasks 3, 7); 8.4 steps 1–7 (Tasks 5, 6, 7, 8, 11, 13); 8.5 (Task 2); 8.6 (Tasks 2, 8); 8.7 (Tasks 1, 8); 8.8 steps 1–6 (Tasks 8, 11); 8.9 caps and cooldowns (Tasks 4–6, 9); 8.10 (Task 2 test, Task 16 docs); 12.1 caper gates (Tasks 5, 6); 12.2 items 3, 6, 7, 9, 10, 11 (Tasks 5–8, 11, 15); 13.1 `!caper` (Task 14); 13.2 `cpr:` (Tasks 10, 12); 13.3 S11–S15, S25 caper, S27 brief, S28 GO and "Lobby moved" (Task 10); 13.4 `caper`, `caper_lobby` (Tasks 9, 11); 14.1 `Caper`/`CaperCrew` (Task 4); 14.3 `cf:render:caper:*`, `cf:lobbydm:*` (Task 11); 14.4 settlement seams (Task 1); 15 `sweepCapers` (Task 13); CFD-1 (Task 5 join CAS, Tasks 5–6 interleave tests); CFD-2 (Task 8 draw CAS, Task 13 own `noOverlap` schedule via plan 1's `CF_SCHEDULES`); 17 edges 1–8, 10, 19–27, 30, 53–55, 58–60, 63, 66–72, 75, 78, 79, 84 (Tasks 4–8, 11–14; edge 75 is `pickLobbyChannel`, Tasks 11–12); 18 caper rows (Tasks 1–15).
- **Not built, on purpose:** the sweeper branch "(d) RESOLVED with `settled:false`" (C4: structurally impossible); a VOID of a SETTLING caper (`answers` are validated before RUNNING → SETTLING and never rewritten, so `settleCaper` treats unreadable answers as an invariant error, Task 8); a caper-result DM (D58); `jailUser` changes (C10); a dedicated seat-free reminder builder (C11); EV helpers in production code (C12). Turf (`turf`, rackets, wars, the war `ACTIVITY_RULES`/`FAMILY_HOOKS` entries, the `turf` DM type) is plan 3.
- **Type consistency.** Plan 1 names are used verbatim (see "Seams consumed"). Plan 2 names introduced once and reused: `Rng`/`cryptoRng`/`rollUnit`, `CaperAnswers`, `BriefView`, `CaperCardView`, `CaperPlannerView`, `CaperSeatView`, `StartBy`, `StartResult`, `ResolveResult`, `startCaper`, `resolveCaper`, `settleCaper`, `processBootedAt` (in `caperSettleService.ts`), `runStart`, `runCancel`, `onSeatsChanged`, `resolveAndAnnounce`, `announceLobby`, `renderCaperCard`, `requestCaperRender`, `postCaperCard`, `pickLobbyChannel`, `trailingRender`, `CAPER_ACTIVITY_RULE`, `CAPER_FAMILY_HOOK`, `SWEEP_CAPERS_JOB`, `caperWorstCases`.
- **Import graph.** `extensions.ts → caperHooks.ts → caperRefunds.ts → walletService`; none of those imports `familyQueries`, `eligibility`, `membershipService` or `disbandService`. `caperSweeper.ts` and `scheduler.ts` import the UI flow module, as plan 1's `scheduler.ts` already imports `announce.ts` (surrounding-code precedent; a service importing UI is the existing shape here).
- **Row counts in tests** are always scoped to the test's own users (`txCount`, `audit.count({ where: { userId: { in } } })`): `resetFamilies` keeps `Transaction` rows and `resetUser` keeps `Audit` rows, so an unscoped count sees earlier tests in the same file.
- **Concurrency tests** assert one winner plus "Vault busy, try again." as the only other outcome, never an exact count a retry exhaustion could break (plan 1 convention).
