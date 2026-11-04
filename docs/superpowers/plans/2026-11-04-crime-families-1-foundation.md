# Crime Families 1 of 3: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Crime Families layer (found, join, ranks, vault, payday, levels, leaderboard, `!crew`, family DMs, family jobs, the `cf_` emoji family) behind `CRIME_FAMILY_CONFIG`, with every seam that plan 2 (Capers) and plan 3 (Turf) plug into, and with capers and turf not playable yet.

**Architecture:** Data lives in `src/data/crimeFamilyCatalog.ts` and `CRIME_FAMILY_CONFIG`; every money or membership write in `src/services/crimeFamily/` is one Mongo transaction (`runFamilyTx`) guarded by compare-and-swap, with unique indexes as the backstop. Pure ComponentsV2 builders in `src/ui/crimeFamily/` render plain view objects, and one router dispatches `crew:`/`cpr:`/`turf:` customIds to three route tables; plans 2 and 3 extend only the registries listed under "Seams exported to plans 2 and 3".

**Tech Stack:** TypeScript, discord.js 14.25 (ComponentsV2), Prisma 5.22 on MongoDB (replica set, interactive transactions), ioredis, node-cron 4.2.1, node `canvas`, vitest with mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` (approved 2026-10-29, Q1–Q4 on defaults). Asset rules: `DESIGN.md`. Read both. The spec cites code at `6b2d836`; this plan cites HEAD `c45d257`, and the line numbers differ.

**Plan series:** 1 Foundation (this plan) → 2 Capers (`cpr:`, `!caper`, Caper/CaperCrew models, settlement) → 3 Turf (`turf:`, `!turf`, Racket/War models, ticks).

---

## Global Constraints

- `.env` `DATABASE_URL` is the LIVE player database. Never run `npm run dev`, `npm start`, `npm run seed`, `npx prisma db push`, `npx prisma studio`, any `sync:*-emojis` without `--dry-run`, or any `ts-node src/...` not listed here. Allowed: vitest (`test/setupEnv.ts` overrides `DATABASE_URL`), `npm run typecheck`, `npx prisma validate|format|generate` (no connection), `npm run validate:slash`, `npm run validate:app-emojis` (after Task 14 moves `dotenv` into the live path), `npm run gen:pixel-assets -- --set cf --check`, and `checkV2Payloads.ts` only as `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- `$VT <files>` in this plan means `MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' <files>`. DB tests need Redis: `docker start casino-test-redis || docker run -d --rm --name casino-test-redis -p 6381:6379 redis:7-alpine`. Never run two vitest processes at once (they clobber `test/.mongo-uri`).
- Commit directly on `main`, never push (a push deploys). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy gate (spec 19.1): `deploy.yml` runs `prisma db push` only when `prisma/` changed in `HEAD~1`. The schema lands in Task 3, so the owner deploys this plan with `workflow_dispatch` (`run_schema: true`; any dispatch sets `prisma=true`, `deploy.yml:65-66`). Plans 2 and 3 use the same wording. Task 20 writes this into the hand-off note.
- Money in family UI and messages is formatted with `Math.floor(n).toLocaleString("en-US")` (`fmtFortunes` in `src/utils/format.ts`, Task 2), never `fmtAmount`/`fmtCurrency`, which print "∞" from 2,147,483,647 up (`src/utils/format.ts:3-11`) and a vault can pass that.
- Economy is global per `discordId`. `User` and every existing Prisma model are unchanged (D31). `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` are unchanged (D6).
- No module under `src/services/crimeFamily/` imports `isTester` (D34). Testers keep only the existing DM skip in `sendOptOutDm`.
- Every Mongo filter and CAS uses required fields with sentinels (`""`, `-1`, `"PENDING"`, `now()` defaults). A filter on a nullable field needs `OR: [{ f: null }, { f: { isSet: false } }]` (`src/anticheat/claim.ts:59-84`). The only nullable family field is `FamilyLedger.meta`, never filtered.
- Wallet debits go through `debitWalletInTx` (guarded `balance gte`); credits through `creditWalletInTx` + `afterEarnedCredit`; refunds use `earned = false` (D60). Taxes are `Math.floor(amount * CRIME_FAMILY_CONFIG.vaultTaxRate)` inline, never `applyTransferTax` (D14). No shop buff is ever applied to family money (D20).
- Every family transaction runs in `runFamilyTx` (3 attempts, payday 5); an exhausted retry of any transient error is `FamilyError("Vault busy, try again.")` (spec 17 edge 9). Never catch a P2002 inside a transaction; catch it outside. Writers that must conflict touch the family document with `touchFamily`. Any check that a concurrent writer can invalidate (hook blocks, caps, permissions) runs inside the transaction callback, so every retry re-checks it.
- Under vitest a lazy `require()` goes through Node, not vitest, and loads a second copy of every module it reaches (`test/router/fakeMessage.ts:4-7`). All new Crime Families modules (services, UI, handlers, `crew.ts`) import each other statically; the only lazy requires are the existing ones in `src/index.ts` and `src/commandRouter.ts`. A test that reaches crew code through `routeMessage` sees the second copy of `CRIME_FAMILY_CONFIG`, which `withCfConfig` patches too (Task 1).
- Redis never guards money or uniqueness. Use the tri-state `setNx` (fails open); never `redisService.setIfNotExists` (fails closed, `src/services/redisService.ts:76-89`).
- Every UI is ComponentsV2 built with `v2Quiet`/`cfPayload`: `allowedMentions: { parse: [] }` except S4 (`users: [inviteeId]`) and S23 (`users: [underbossId]`); no `setAccentColor`, no `content`/`embeds` beside the V2 flag; ≤ 40 components (50035 is swallowed, `src/index.ts:311-318`). Every new screen is in the worst-case table that both the layout test and `checkV2Payloads.ts` read.
- Missing art never breaks a payload: a missing thumbnail turns the Section into a TextDisplay; a missing banner omits the MediaGallery and sends no file (D66). Code never requires a banner file.
- `cfEmoji` is called only at render time, never in a module-level constant (it would run before `initEmojiRegistry`, `src/index.ts:82`). Buttons and select options get `.setEmoji` only when it returns a value; labels stay plain text.
- Handlers ack (`deferUpdate`, `deferReply`, or `showModal`) before any DB or Redis call. Modal openers check only `i.user.id === ownerId` and call `showModal` with no awaited I/O before it. (The global ban gate at `src/index.ts:117-123` already reads Mongo before every press; it is upstream and stays.)
- DMs go only through `sendOptOutDm` with a `DM_NOTICE_TYPES` entry; account-group types have no `command` field.
- New crons are their own `cron.schedule` calls with `{ timezone: "Etc/UTC", noOverlap: true }`; nothing is appended to the banking block (`src/scheduler.ts:25-37`).
- `CRIME_FAMILY_CONFIG.enabled` and `allowGuildIds` gate `!crew`, creation and invites; sweepers and family payouts (dues, succession, payday) run regardless; `turfEnabled: false` hides the Turf button. The only exception is plan 3's turf ticks: spec 15 gates `tickWars` (new wars) and `tickRackets` by `turfEnabled` (plan 3 T1). Defaults ship off.
- Emoji upload is owner-only (spec 19.4 step 7). This plan runs only `--dry-run`. `src/data/emojis.json` stays `{}`.
- Every number in logic comes from `CRIME_FAMILY_CONFIG` or the catalog; no money literal in a service.

## Review Focus

1. **Deposit amount text** (`!crew deposit` and the Deposit modal): `"all"`/`"max"`/`"allin"` deposit `min(wallet, what is left of today's cap)` (P21), so a 40,000,000 wallet deposits 25,000,000; `"-5m"`, `"0"`, `"abc"` and `"1.5x"` are refused with "Enter a positive amount like 250k or 5m", `"2.5k"` is 2,500, `"1,000,000"` is 1,000,000. Tests: Task 2 (`parsePositiveAmount`), Task 9 (service rejects ≤ 0 and non-integers; `depositMaxFor`), Task 18 (`!crew deposit all` with a 40,000,000 wallet).
2. **Name and tag typed into the modal** with outer spaces, double spaces, accents, emoji or a lowercase tag: outer spaces are trimmed, `"vla"` becomes `VLA`, the rest is refused with the rule spelled out. Test: Task 4.
3. **Invite target** that is the inviter, a bot, a member of the inviter's family, a member of another family, an unknown name, or an ambiguous name: a specific refusal, no invite row, no DM. Tests: Task 7 (service), Task 18 (`resolvePlayerTarget`).
4. **A stale owner-scoped panel** pressed after the presser lost the right (left the family, was kicked, was demoted between the Payday preview and Confirm): an ephemeral refusal from the DB re-read and no write. Test: Task 16.
5. **The home channel is gone** (deleted, or the bot lost access) when a payday card, claim notice or expired-invite edit posts: money still moves, DMs still go, the job does not throw. Tests: Task 15 (`sendToChannel`/`editChannelMessage` return null/"dead" on 10003/10008/50001/50013), Task 17 (scheduler with a dead channel).

## Decisions this plan makes (not in the spec, or changed by code since)

| # | Spec ref | Decision | Why |
|---|---|---|---|
| P1 | 14.4 `registerEmojiForTest` | Use the existing in-memory `setEmojiRecord` (`src/utils/emojiRegistry.ts:103-105`, added in `c70f990`) | It already exists; a second seam would duplicate it |
| P2 | 3, 19.1 "never run checkV2Payloads" | It now seeds in memory (`c70f990`); add entries and run it with the env override above | Owner asked for a `checkV2Payloads` entry per screen |
| P3 | 3 "no global ban check" | `src/index.ts:117-123` now gates every press (`523dbe4`); `checkMemberEligibility` still reads the ban through `isBanActive` (`src/services/banService.ts:6-8`) | One ban rule |
| P4 | 18 | The test DB has no indexes (`test/globalSetup.ts` never runs `db push`). `ensureUniqueIndexes(models)` builds them from `Prisma.dmmf` with Prisma's names (`<Model>_<fields>_key`) | Unique backstops and P2002 targets must exist in race tests |
| P5 | 14.4 file list | UI is `src/ui/crimeFamily/{ids,kit,post,familyScreens,announce}.ts`; services are split by responsibility (file map below) | SRP; spec 21.4 leaves layout to the builder |
| P6 | 6.4, 7.3, 10.4, 15 | Caper/turf data that families depend on (active-member counts, exit blocks, disband side effects, racket sort, sweepers) plug in through `extensions.ts`, `LEADERBOARD_SORTS` and `CF_SCHEDULES`; plan 1 ships them empty or with the family-only entries | Plans 2/3 add entries, not branches |
| P7 | 13.2 routing | One `index.ts` branch (lazy `require` of the router) for the three prefixes into `crimeFamilyRouter.ts`, which statically imports the three route tables. Each route entry declares its `scope` and `ack`; the router runs the owner check and the ack before the route | Owner check, ack, error mapping and activity touch live once, and plans 2/3 add entries, not checks. A lazy require of the tables would load a second module copy under vitest |
| P8 | 6.4 Leave | A Boss who is the only member is refused with "Leaving would disband the family: use `!crew disband`" | Disband burns money and keeps its typed-tag guard |
| P9 | 13.1 `handover` | `!crew handover <user>` posts an opener `crew:open:chair:<targetId>:<ownerId>` → S26, like kick | Irreversible; same confirm as S5 |
| P10 | 13.2 `crew:open:disband` | Opens S22 (exact burn) first; S22's Disband… button opens the typed-tag modal | The spec's `crew:disband:open` only makes sense from S22; a modal cannot show the burn |
| P11 | 7.4 | `duesDayKey` is set to today at creation | No dues on the founding day from an empty vault |
| P12 | 6.4 handover | The old Boss becomes a Soldier (`roleSlot = <old uid>`), as in a claim | One slot-swap order |
| P13 | 10.2 "XP ledger" | `awardFamilyXp` writes `FamilyLedger{type:"xp", amount:0, meta:{xp, source}}`; `creditEarnings(..., { xp })` records XP in that row's meta | XP shows in the log without a new model |
| P14 | 13.4 | Only the `family` DM type lands now (settings panel 25 → 26 components); `caper`, `caper_lobby`, `turf` come with plans 2 and 3 | No toggle for a feature that does not exist yet |
| P15 | 14.4 seams | Plan 1 adds `debitWalletInTx`, `creditWalletInTx`, `afterEarnedCredit`, exports `computeNetWorth`; `applyEconomyPenaltyTx`, `addCrimeHeatTx`, `jailUserTx`, exporting `migrateLegacyHeatForUser` belong to plan 2 | YAGNI: only capers use them |
| P16 | 18 `emoji-families.test.ts` | Banners are checked for 960x336 and full opacity, not ≤ 48 colours | `c45d257` shipped smooth banners (70k–120k colours) and updated `DESIGN.md` 8A |
| P17 | 6.4 Invite resolution | `resolveRobTarget` (`src/commands/economy/rob.ts:35-69`) moves to `src/utils/playerTarget.ts` as `resolvePlayerTarget(message, raw, copy)`; rob's copy is unchanged | Same rule at two call sites |
| P18 | 20.4 | `CF_APPLICATION_EMOJI_PREFIX` and `SHOP_APPLICATION_EMOJI_PREFIX` live in `src/utils/applicationEmojiNames.ts` (re-exported where the spec names them) | `emojiRegistry` → `crimeFamilyAssets` → `emojiRegistry` would be an import cycle |
| P19 | 20.4 step 10 | `dotenv.config` and the client login move into one `loginClient()` helper that the live sync and `--plan` call | `--dry-run` must never load `.env`; `--plan` needs the token |
| P20 | 6.3 Associate column | Associate status (the restriction and the S2 label) never applies to the `BOSS` row. For other roles the Associate column blocks only `take_seat` and `war_act`; its other "no" cells are already "no" for a Soldier by role | A founder's row has `joinedAt = now`; a literal reading blocks a new Boss from inviting for 72 h, against spec 4.1 |
| P21 | 7.2, 13.1 | A deposit of `all`/`max`/`allin` is clamped to `min(wallet, depositDailyCap − depositedToday)` (`depositedToday` counts only when `depositDayKey` is today) | "all" with a 40M wallet should deposit 25M, not refuse |
| P22 | 6.7 "once per inactivity episode" | When `runSuccession` sees the Boss active again while `claimNoticeFor === bossId`, it CASes `claimNoticeFor` back to `""` and edits S23 to "The Boss is back." | Ends the episode, so a second absence gets a second S23 |
| P23 | 10.4, 13.3 S2 | Rackets held come from an optional `FamilyHook.racketsHeld(familyIds)`; with no provider the value is `null` and S2/S10 hide it | Plan 3 adds a hook entry instead of editing queries and builders |

Known consequence kept from the spec (owner may overrule): the denylist matches substrings after stripping non-alphanumerics (6.2), so "Where Eagles Dare" (`here`), "Model Citizens" (`mod`) and "Badminton Club" (`admin`) are refused. Task 4 pins this.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/data/crimeFamilyCatalog.ts` | All static family, caper, racket, war, level and gate data |
| `src/services/crimeFamily/tx.ts` | `runFamilyTx`, `touchFamily`, `FamilyError`, `VaultShort`, `VaultBusy`, `isUniqueViolation` |
| `src/services/crimeFamily/ledger.ts` | Write and page `FamilyLedger` rows |
| `src/services/crimeFamily/extensions.ts` | Registries plans 2/3 extend: `ACTIVITY_RULES`, `FAMILY_HOOKS` |
| `src/services/crimeFamily/names.ts` | Name/tag validation, keys, denylist |
| `src/services/crimeFamily/permissions.ts` | Role ranks, Associate derivation, the 6.3 permission table |
| `src/services/crimeFamily/eligibility.ts` | `checkMemberEligibility` (12.1), hop cooldowns, active-member rule |
| `src/services/crimeFamily/familyQueries.ts` | Read seams: membership lookup, roster, dashboard view |
| `src/services/crimeFamily/views.ts` | View types passed from services to UI (types only) |
| `src/services/crimeFamily/familyService.ts` | Create, rename, home channel, force rename |
| `src/services/crimeFamily/membershipService.ts` | Invite, accept, decline, leave, kick, invite expiry |
| `src/services/crimeFamily/chairService.ts` | Promote, demote, hand over, claim, heir, auto handover, claim notice CAS |
| `src/services/crimeFamily/vaultService.ts` | `spendFromVault`, `creditEarnings`, arrears, deposit, dues, vault view |
| `src/services/crimeFamily/paydayService.ts` | Payday split, preview, execute (manual, auto, final) |
| `src/services/crimeFamily/progression.ts` | XP award, level-up |
| `src/services/crimeFamily/leaderboard.ts` | `LEADERBOARD_SORTS` and the S10 view |
| `src/services/crimeFamily/disbandService.ts` | Disband preview and transaction |
| `src/services/crimeFamily/activity.ts` | `setNx` tri-state and `touchActivity` |
| `src/services/crimeFamily/scheduler.ts` | `CF_SCHEDULES`, `registerCrimeFamilyJobs`, family jobs |
| `src/ui/crimeFamily/ids.ts` | customId builders and parser for `crew:`/`cpr:`/`turf:` |
| `src/ui/crimeFamily/kit.ts` | `cfPayload`, art helpers, emoji helpers, S27 opener, S28 notice |
| `src/ui/crimeFamily/post.ts` | Channel send/edit with dead-board codes, bot-permission check, jump links |
| `src/ui/crimeFamily/familyScreens.ts` | S1–S10, S22–S24, S26 builders |
| `src/ui/crimeFamily/announce.ts` | Discord side effects shared by handlers and jobs (payday card + DMs, chair change) |
| `src/handlers/crimeFamilyRouter.ts` | Parse prefix, owner/error/activity wrapper, dispatch to route tables |
| `src/handlers/crewInteractionHandler.ts` | `CREW_ROUTES` |
| `src/handlers/caperInteractionHandler.ts` | `CAPER_ROUTES` (empty; plan 2 fills) |
| `src/handlers/turfInteractionHandler.ts` | `TURF_ROUTES` (empty; plan 3 fills) |
| `src/commands/economy/crew.ts` | `!crew` subaction table, `crew-forcerename` |
| `src/utils/playerTarget.ts` | Mention/id/username target resolution (from rob) |
| `src/utils/applicationEmojiNames.ts` | Emoji-name derivation, table asset resolution, managed prefixes |
| `src/utils/crimeFamilyAssets.ts` | `CF_ASSETS`, `CF_ART`, `cfEmoji`, `cfAttachment`, `cfNoticeEmote` |
| `src/utils/applicationEmojiFamilies.ts` | Emoji family registry, prune candidates (script and tests only) |
| `src/scripts/fixtures/crimeFamilyScreens.ts` | Worst-case screen table read by the layout test and `checkV2Payloads.ts` |
| `dashboard/src/content/modules/crime-families.ts` | Website module (family sections) |
| Tests | `test/crimeFamily/*.test.ts`, `test/anticheat/family-*.test.ts`, `test/wallet/tx-seams.test.ts`, `test/dm/family-notice.test.ts`, `test/scripts/emoji-families.test.ts`, `test/router/crew-jail.test.ts`, `test/general/help-crime-families.test.ts`, `test/crimeFamily/fakeInteraction.ts` |

**Modify:** `prisma/schema.prisma` (append), `src/utils/economyConfig.ts`, `src/services/walletService.ts`, `src/services/netWorthService.ts:25`, `src/utils/format.ts`, `src/utils/componentsV2.ts`, `src/utils/interactionHelpers.ts`, `src/utils/emojiRegistry.ts:76-99`, `src/utils/shopItemAssets.ts`, `src/scripts/syncShopApplicationEmojis.ts`, `src/scripts/checkV2Payloads.ts`, `src/services/dmPrefsService.ts:14-25`, `src/services/dmNoticeService.ts`, `src/scheduler.ts`, `src/index.ts`, `src/commandRouter.ts`, `src/slash/registry.ts`, `src/utils/developerAccess.ts:37-60`, `src/commands/economy/rob.ts`, `src/commands/life/marriage.ts`, `src/commands/general/help.ts`, `src/commands/general/tutorial.ts`, `package.json`, `test/helpers.ts`, `test/slash/registry.test.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/content/modules/index.ts`, `dashboard/src/content/modules/life-and-social.ts`, `FORTUNA_V2_ECONOMY.md`, `README.md:92-95`, `DESIGN.md` section 7.

---

## Seams exported to plans 2 and 3

Every later plan imports these; names and types are fixed here. Plans 2 and 3 extend only these registries and never add branches: `ACTIVITY_RULES` and `FAMILY_HOOKS` (`extensions.ts`), `CF_SCHEDULES`, `LEADERBOARD_SORTS`, `DM_NOTICE_TYPES`, `APPLICATION_EMOJI_FAMILIES`, the route tables `CAPER_ROUTES`/`TURF_ROUTES`, and `crimeFamilyWorstCases()`.

```ts
// src/utils/economyConfig.ts
export const CRIME_FAMILY_CONFIG: {...};                       // Task 1
export function isCrimeFamilyOpen(guildId: string | null | undefined): boolean;

// src/data/crimeFamilyCatalog.ts                              // Task 1
export type CaperRoleKey = "MASTERMIND" | "LOOKOUT" | "SAFECRACKER" | "DRIVER" | "MUSCLE" | "HACKER";
export const CAPER_ROLES: readonly CaperRoleDef[];  export const CAPER_TIERS: readonly CaperTierDef[];
export const CAPER_OUTCOME_PCT, CAPER_SPLIT_PCT;  export function caperTier(n: number): CaperTierDef; export function caperRole(k: CaperRoleKey): CaperRoleDef;
export const RACKETS: readonly RacketDef[]; export const RACKET_CLASSES; export function racketDef(key: string): RacketDef | undefined;
export const WAR_BLOCKS; export const WAR_RULES;
export type FamilyRole = "BOSS" | "UNDERBOSS" | "CAPO" | "SOLDIER";
export const FAMILY_LEVELS: readonly FamilyLevelDef[]; export function levelDef(level: number): FamilyLevelDef;
export type GateKey = "found" | "family_join" | "caper_t1" | "caper_t2" | "caper_t3" | "caper_t4" | "war" | "racket" | "payday";
export const ELIGIBILITY_GATES: Readonly<Record<GateKey, GateDef>>;

// src/services/walletService.ts                               // Task 2 (isTransientWriteConflict: Task 3 adds `export` at :7)
export function isTransientWriteConflict(error: any): boolean;
export class InsufficientFundsError extends Error {}
export type CreditResult = { walletId: string; previousBalance: number; newBalance: number; requestedAmount: number; appliedAmount: number; capped: boolean; garnished?: number };
export function creditWalletInTx(tx: Prisma.TransactionClient, discordId: string, username: string, amount: number, type: string, meta: Record<string, unknown>, earned: boolean): Promise<CreditResult>;
export function afterEarnedCredit(discordId: string, result: CreditResult, earned: boolean): Promise<CreditResult>;
export function debitWalletInTx(tx: Prisma.TransactionClient, discordId: string, amount: number, type: string, meta: Record<string, unknown>): Promise<{ walletId: string }>;
// src/services/netWorthService.ts: export async function computeNetWorth(discordId: string): Promise<NetWorthBreakdown>;
// src/utils/format.ts: export function parsePositiveAmount(raw: string, maxBalance: number): number | null; export function fmtFortunes(n: number): string;

// src/services/crimeFamily/tx.ts                              // Task 3
export class FamilyError extends Error {}                      // message is safe to show a player
export class VaultShort extends FamilyError { need: number; have: number }
export class VaultBusy extends Error {}                        // message contains "write conflict" → retried
export function runFamilyTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, attempts?: number): Promise<T>;
export function touchFamily(tx: Prisma.TransactionClient, familyId: string, now: Date): Promise<void>;
export function isUniqueViolation(err: unknown, indexName?: string): boolean;

// src/services/crimeFamily/ledger.ts                          // Task 3
export type LedgerType = "create_fee" | "deposit" | "deposit_tax" | "payday" | "payday_tax" | "caper_cut" | "racket_income" | "racket_neglect" | "dues" | "dues_missed" | "level_fee" | "rename_fee" | "bid_escrow" | "bid_refund" | "war_bid_burn" | "disband_burn" | "xp";
export function writeLedger(tx: Prisma.TransactionClient, row: LedgerRow): Promise<void>;
export type LedgerLine = { at: Date; type: LedgerType; actorId: string; amount: number; treasuryAfter: number; earningsAfter: number; meta: Record<string, unknown> | null };
export function readLedgerPage(familyId: string, page: number, pageSize: number): Promise<{ rows: LedgerLine[]; page: number; pages: number }>;

// src/services/crimeFamily/extensions.ts                      // Task 3 (empty), filled by plans 2/3
export interface ActivityRule { key: string; label: string; need: number; count(userId: string, since: Date): Promise<number> }
export const ACTIVITY_RULES: ActivityRule[];                   // plan 2: {caper seats, 2}; plan 3: {correct war hits, 3}
export type MemberExitKind = "LEFT" | "KICKED";
export interface FamilyHook {
  key: string;
  // Blocks run inside the runFamilyTx callback after touchFamily, so every retry re-checks; a string → FamilyError(string).
  memberExitBlock?(tx: Prisma.TransactionClient, ctx: { familyId: string; userId: string; kind: MemberExitKind }): Promise<string | null>;
  onMemberExit?(tx: Prisma.TransactionClient, ctx: { familyId: string; userId: string; kind: MemberExitKind; now: Date }): Promise<void>;
  disbandBlock?(tx: Prisma.TransactionClient, familyId: string): Promise<string | null>;
  onDisband?(tx: Prisma.TransactionClient, ctx: { familyId: string; now: Date }): Promise<void>;  // runs after the blocks, before the final payday
  disbandPreview?(familyId: string): Promise<{ returnedToEarnings: number }>;                        // what onDisband would add (plan 3 escrow)
  racketsHeld?(familyIds: string[]): Promise<Map<string, number>>;                                  // plan 3; no provider → null in views (P23)
}
export const FAMILY_HOOKS: FamilyHook[];
export function racketsHeldFor(familyIds: string[]): Promise<Map<string, number> | null>;       // null when no hook provides it

// src/services/crimeFamily/eligibility.ts                     // Task 5
export type EligibilityCheck = { gate: string; need: string; have: string; ok: boolean };
export type EligibilityResult = { ok: boolean; checks: EligibilityCheck[]; failures: EligibilityCheck[] };
export interface EligibilityOpts { now?: Date; guildId?: string | null; expectedGuildId?: string; familyId?: string; role?: CaperRoleKey }
export function checkMemberEligibility(uid: string, gate: GateKey, opts?: EligibilityOpts): Promise<EligibilityResult>;
export function isActiveMember(uid: string, now: Date): Promise<{ active: boolean; have: string; need: string }>;
export function eligibilityError(failures: EligibilityCheck[]): FamilyError;   // "Not eligible: ≥ 60 shifts (you have 59 shifts); …"

// src/services/crimeFamily/permissions.ts                     // Task 4
export type FamilyAction = "view" | "deposit" | "invite" | "kick" | "promote" | "demote" | "handover" | "plan_caper" | "take_seat" | "payday" | "level_up" | "bid" | "war_act" | "set_home" | "rename" | "disband" | "claim_chair" | "manage";
export function can(actor: { role: FamilyRole; joinedAt: Date }, action: FamilyAction, now: Date, target?: { role: FamilyRole }): boolean;
export function isAssociate(joinedAt: Date, now: Date): boolean;

// src/services/crimeFamily/familyQueries.ts                   // Task 6
export function getMembership(uid: string): Promise<{ family: Family; member: FamilyMember } | null>;  // first read: prisma.familyMember.findUnique({ where: { userId } }) on the global client
export function requireMembership(uid: string): Promise<{ family: Family; member: FamilyMember }>;  // FamilyError "You are not in a crime family."
export function listMembers(familyId: string): Promise<FamilyMember[]>;   // rank desc, then joinedAt asc
export function getFamilyByTag(tag: string): Promise<Family | null>;
export function isUnderInvestigation(familyId: string): Promise<boolean>;

// src/services/crimeFamily/vaultService.ts                    // Task 9
export function spendFromVault(tx, familyId: string, amount: number, type: LedgerType, actorId: string, meta: Record<string, unknown>, opts?: { earningsOnly?: boolean }): Promise<{ fromTreasury: number; fromEarnings: number }>;
export function creditEarnings(tx, familyId: string, amount: number, type: LedgerType, actorId: string, meta: Record<string, unknown>, opts?: { xp?: number }): Promise<{ earningsAfter: number; arrearsCleared: boolean }>;
export function utcDayKey(d: Date): string;                    // "YYYY-MM-DD"

// src/services/crimeFamily/progression.ts                     // Task 11
export function awardFamilyXp(tx, familyId: string, xp: number, source: string, actorId: string, meta?: Record<string, unknown>): Promise<void>;

// src/services/crimeFamily/leaderboard.ts                     // Task 11
export interface LeaderboardSort { key: string; label: string; top(limit: number): Promise<{ familyId: string; value: number }[]>; rankOf(familyId: string): Promise<{ rank: number; value: number } | null> }
export const LEADERBOARD_SORTS: LeaderboardSort[];             // plan 3 adds { key: "rk", label: "Rackets" }

// src/services/crimeFamily/activity.ts                        // Task 13
export type SetNxResult = "set" | "held" | "error";
export function setNx(key: string, ttlSeconds: number): Promise<SetNxResult>;
export function touchActivity(uid: string, now?: Date): Promise<void>;

// src/services/dmNoticeService.ts                             // Task 13
export function notifyMany(client: Client, type: DmNoticeType, ids: readonly string[], build: (id: string) => ContainerBuilder): Promise<void>;
// src/utils/crimeFamilyAssets.ts                              // Task 14
export function cfEmoji(key: string): string | undefined;                                       // key without "cf_"
export function cfAttachment(key: string): { attachment: AttachmentBuilder; url: string } | null; // CF_ART or CF_ASSETS key; null when the file is missing
export function cfNoticeEmote(key: string): string;                                             // cfEmoji(key) ?? Mascot.Emotes.Gun

// src/ui/crimeFamily/*                                         // Tasks 15–16
export interface CfPayload { components: ContainerBuilder[]; flags: number; allowedMentions: { parse: []; users?: string[] }; files?: AttachmentBuilder[]; attachments?: [] }
export function cfPayload(container: ContainerBuilder, opts?: { files?: AttachmentBuilder[]; freshAttachments?: boolean; ephemeral?: boolean; mentionUsers?: string[] }): CfPayload;
export function cfId(prefix: CfPrefix, ...parts: (string | number)[]): string;   // throws over 100 chars
export function parseCfId(customId: string): { prefix: CfPrefix; action: string; args: string[] } | null;
export function thumbSection(text: string, artKey: string): { component: SectionBuilder | TextDisplayBuilder; file: AttachmentBuilder | null };
export function bannerGallery(artKey: string): { gallery: MediaGalleryBuilder; file: AttachmentBuilder } | null;
export function buildOpener(ownerSummary: string, button: { customId: string; label: string }): CfPayload;         // S27
export function buildNotice(text: string, button?: { customId: string; label: string }, mentionUsers?: string[]): CfPayload;  // S28
export function sendToChannel(client: Client, channelId: string, payload: CfPayload): Promise<string | null>;   // message id
export function editChannelMessage(client: Client, channelId: string, messageId: string, payload: CfPayload): Promise<"ok" | "dead" | "error">;
export function missingBotPermissions(channel: GuildBasedChannel, botId: string): string[];
export function jumpLink(guildId: string, channelId: string, messageId: string): string;

// src/utils/interactionHelpers.ts: export function rejectPress(i: RepliableInteraction, text: string): Promise<void>;
// src/utils/componentsV2.ts: export function v2Quiet(containers, files?, extraFlags?, mentionUsers?): {...v2Reply, allowedMentions};

// src/handlers/crimeFamilyRouter.ts                           // Task 16
export type CfInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
export type CfRoute = (i: CfInteraction, args: string[]) => Promise<void>;
// scope "owner": the router refuses unless args.at(-1) === i.user.id ("This panel is not yours."); "shared"/"modalOpener": no id check
// (a modalOpener is owner-scoped too but checks only the id, then showModal). ack "update": deferUpdate; "ephemeral": deferReply
// ephemeral; "modal": showModal is the route's first await; "auto": deferUpdate when the pressed message is ephemeral, else deferReply ephemeral.
export interface CfRouteEntry { scope: "owner" | "shared" | "modalOpener"; ack: "update" | "ephemeral" | "modal" | "auto"; run: CfRoute }
export type CfRouteTable = Readonly<Record<string, CfRouteEntry>>;   // key = "<action>" or "<action>:<first arg>" (most specific wins)
// CAPER_ROUTES in caperInteractionHandler.ts and TURF_ROUTES in turfInteractionHandler.ts are the tables plans 2/3 fill.

// src/services/crimeFamily/scheduler.ts                       // Task 17
export interface CfJob { name: string; run(client: Client, now: Date): Promise<void> }
export const CF_SCHEDULES: { cron: string; jobs: CfJob[] }[];  // plan 2 adds sweepCapers to the minute entry; plan 3 adds sweepWarHits to it, then its own tickWars ("* * * * *") and tickRackets ("5 * * * *") entries

// src/scripts/fixtures/crimeFamilyScreens.ts                  // Task 15
export function crimeFamilyWorstCases(): { label: string; max: number; payload: CfPayload }[];  // plans 2/3 append

// test/helpers.ts                                              // Task 3
export function snowflakeAt(date: Date): string; export function daysAgo(n: number, from?: Date): Date;
export function seedEligibleUser(opts?: SeedEligibleOpts): Promise<string>;   // opts.id overrides the generated snowflake
export function seedFamily(opts: SeedFamilyOpts): Promise<Family>;
export function resetFamilies(): Promise<void>; export function ensureUniqueIndexes(models: string[]): Promise<void>;
export function withCfConfig<T>(overrides: Partial<Record<keyof typeof CRIME_FAMILY_CONFIG, unknown>>, fn: () => Promise<T>): Promise<T>;  // patches both module copies
```

---

### Task 1: `CRIME_FAMILY_CONFIG`, feature flags and the catalog

**Files:**
- Modify: `src/utils/economyConfig.ts` (insert after `TAX_CONFIG`, `:176-195`; before it is TS2448)
- Create: `src/data/crimeFamilyCatalog.ts`
- Test: `test/crimeFamily/catalog.test.ts`

**Interfaces:**
- Consumes: `CRIME_PREP_WHITELIST` (`src/data/crimePrepWhitelist.ts:16`), `SHOP_CATALOG` (read only).
- Produces: `CRIME_FAMILY_CONFIG`, `isCrimeFamilyOpen`, every catalog export in the Seams block. Shapes:
  - `CaperRoleDef { key: CaperRoleKey; name: string; emojiKey: string /* "role_lookout" */; prepKeys: readonly string[]; call: string; labels: readonly string[] }`
  - `CaperTierDef { tier: 1|2|3|4; key: string; name: string; levelToPlan: number; crewMin: number; crewMax: number; required: readonly CaperRoleKey[]; optional: CaperRoleKey; poolPerSeat: number; stake: number; bustFine: number; jail: { chance: number; seconds: number } | null; heat: { clean: number; messy: number; bust: number }; heatCeiling: number; patrolBase: number; seatGate: { shifts: number; fortunaAgeDays: number; netWorth: number }; xp: { clean: number; messy: number; bust: number }; bannerKey: string /* "caper_t1" */ }`
  - `FamilyLevelDef { level: number; xpToReach: number; fee: number; memberCap: number; racketCap: number; tierUnlocked: 1|2|3|4|null; caperCooldownSeconds: number; crestKey: "crest_1"|"crest_2"|"crest_3"|"crest_4" }`
  - `RacketDef { key: string; name: string; class: "CORNER"|"DISTRICT"|"CROWN"; incomePerCycle: number; warDow: number; warHourUtc: number }`; `RACKET_CLASSES: Record<class, { name: string; baseline: number; minFamilyLevel: number; xpMultiplier: number; emojiKey: string }>`
  - `WAR_BLOCKS: readonly { key: "docks"|"main"|"alleys"; name: string; emojiKey: string; approaches: readonly string[] }[]`; `WAR_RULES = { atkPoints: 10, defPoints: 12, captureXp: 300, hitXp: 5, racketCycleXp: 20, lossHeat: 15, slots: 12, crownCap: 1 }`
  - `GateDef { discordAgeDays: number; fortunaAgeDays: number | null; shifts: number; netWorth: number | null; tenureSeconds: number | null; heatBelow: number | null; notJailed: boolean; notInFamily: boolean; activeMember: boolean; hop: "join"|"found"|null; guild: "lobby"|"home"|null; prepItem: boolean }`
  - `FAMILY_ROLES: Record<FamilyRole | "ASSOCIATE", { name: string; emojiKey: string }>`, `CAPO_SLOTS = ["CAPO1","CAPO2","CAPO3"] as const`, `FAMILY_NAME_RULE`, `FAMILY_TAG_RULE`, `FAMILY_NAME_DENYLIST`, `FAMILY_NAME_SLURS`.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/catalog.test.ts
import { describe, it, expect } from "vitest";
import { CRIME_FAMILY_CONFIG, isCrimeFamilyOpen } from "../../src/utils/economyConfig";
import * as C from "../../src/data/crimeFamilyCatalog";
import { CRIME_PREP_WHITELIST } from "../../src/data/crimePrepWhitelist";
import { SHOP_CATALOG } from "../../src/utils/shopCatalog";
import { withCfConfig } from "../helpers";

describe("crime family catalog", () => {
  it("partitions the 25 prep items across the six roles exactly once (8.2)", () => {
    const keys = C.CAPER_ROLES.flatMap((r) => r.prepKeys);
    expect(keys).toHaveLength(25);
    expect(new Set(keys)).toEqual(new Set(CRIME_PREP_WHITELIST.map((p) => p.key)));
    const consumable = new Set(SHOP_CATALOG.filter((i) => i.consumable).map((i) => i.key));
    for (const r of C.CAPER_ROLES) expect(r.prepKeys.some((k) => !consumable.has(k)), r.key).toBe(true);
  });

  it("orders roles and label pools as 8.2/8.3", () => {
    expect(C.CAPER_ROLES.map((r) => r.key)).toEqual(["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE", "HACKER"]);
    for (const r of C.CAPER_ROLES) expect(new Set(r.labels).size).toBe(6);
    expect(C.caperRole("DRIVER").labels).toEqual(["Harbor Bypass", "Canal Street", "Old Rail Road", "Market Alley", "Bridge Ramp", "Tunnel 9"]);
    expect(C.caperRole("MUSCLE").prepKeys).toEqual(["wooden_rifle", "iron_rifle", "sniper_rifle", "wolf_fang_dagger"]);
  });

  it("pins the tier table (8.1)", () => {
    expect(C.CAPER_TIERS.map((t) => [t.key, t.levelToPlan, t.crewMin, t.crewMax, t.poolPerSeat, t.stake, t.bustFine, t.heatCeiling, t.patrolBase])).toEqual([
      ["pawnshop", 1, 3, 4, 350_000, 50_000, 150_000, 70, 0.10],
      ["payroll", 3, 4, 5, 550_000, 100_000, 300_000, 60, 0.15],
      ["racetrack", 5, 5, 6, 850_000, 175_000, 500_000, 50, 0.20],
      ["diamond", 8, 5, 6, 1_200_000, 300_000, 750_000, 40, 0.25],
    ]);
    expect(C.CAPER_TIERS.map((t) => t.jail)).toEqual([null, { chance: 0.2, seconds: 1200 }, { chance: 0.35, seconds: 2700 }, { chance: 0.5, seconds: 3600 }]);
    expect(C.CAPER_TIERS.map((t) => t.seatGate)).toEqual([
      { shifts: 20, fortunaAgeDays: 14, netWorth: 2_000_000 }, { shifts: 60, fortunaAgeDays: 30, netWorth: 8_000_000 },
      { shifts: 150, fortunaAgeDays: 30, netWorth: 20_000_000 }, { shifts: 300, fortunaAgeDays: 45, netWorth: 40_000_000 },
    ]);
    expect(C.CAPER_TIERS.map((t) => [t.heat.clean, t.heat.messy, t.heat.bust, t.xp.clean, t.xp.messy, t.xp.bust])).toEqual([
      [20, 30, 40, 150, 60, 20], [25, 35, 45, 225, 90, 30], [30, 40, 50, 300, 120, 40], [40, 50, 60, 375, 150, 50],
    ]);
    expect(C.CAPER_TIERS.map((t) => [t.required.length, t.optional])).toEqual([[3, "DRIVER"], [4, "MUSCLE"], [5, "HACKER"], [5, "HACKER"]]);
  });

  it("pins rackets (9.1): 10 rackets, 6,400,000 a day", () => {
    expect(C.RACKETS.reduce((s, r) => s + r.incomePerCycle, 0)).toBe(6_400_000);
    expect(C.RACKETS.map((r) => [r.key, r.class, r.warDow, r.warHourUtc])).toEqual([
      ["docks_numbers", "CORNER", 1, 18], ["laundromat_front", "CORNER", 2, 12], ["harbor_customs", "DISTRICT", 2, 18],
      ["neon_strip", "DISTRICT", 3, 1], ["valet_racket", "CORNER", 3, 18], ["pawn_row", "CORNER", 4, 1],
      ["union_kickbacks", "DISTRICT", 4, 18], ["racetrack_book", "DISTRICT", 5, 12], ["casino_row", "CROWN", 6, 18], ["city_hall", "CROWN", 0, 12],
    ]);
    expect(C.RACKET_CLASSES.CROWN).toMatchObject({ baseline: 80, minFamilyLevel: 7, xpMultiplier: 2 });
  });

  it("pins levels (10.1): fees L2..L10 total 172,000,000", () => {
    expect(C.FAMILY_LEVELS.map((l) => l.xpToReach)).toEqual([0, 1000, 3000, 6000, 10000, 16000, 24000, 34000, 46000, 60000]);
    expect(C.FAMILY_LEVELS.reduce((s, l) => s + l.fee, 0)).toBe(172_000_000);
    expect(C.FAMILY_LEVELS.map((l) => l.memberCap)).toEqual([6, 7, 8, 8, 10, 10, 12, 12, 12, 12]);
    expect(C.FAMILY_LEVELS.map((l) => l.racketCap)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    expect(C.FAMILY_LEVELS.map((l) => l.caperCooldownSeconds)).toEqual([10800, 10800, 10800, 9900, 9900, 9000, 9000, 9000, 7200, 7200]);
    expect(C.FAMILY_LEVELS.map((l) => l.tierUnlocked)).toEqual([1, null, 2, null, 3, null, null, 4, null, null]);
    expect(C.levelDef(10).crestKey).toBe("crest_4");
  });

  it.each([
    ["found", { discordAgeDays: 180, fortunaAgeDays: 30, shifts: 60, netWorth: 15_000_000, tenureSeconds: null, heatBelow: 70, notJailed: true, notInFamily: true, activeMember: false, hop: "found", guild: null, prepItem: false }],
    ["family_join", { discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: 1_000_000, tenureSeconds: null, heatBelow: null, notJailed: true, notInFamily: false, activeMember: false, hop: "join", guild: null, prepItem: false }],
    ["caper_t4", { discordAgeDays: 90, fortunaAgeDays: 45, shifts: 300, netWorth: 40_000_000, tenureSeconds: 259_200, heatBelow: 40, notJailed: true, notInFamily: false, activeMember: false, hop: null, guild: "lobby", prepItem: true }],
    ["war", { discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: null, tenureSeconds: 259_200, heatBelow: 100, notJailed: true, notInFamily: false, activeMember: false, hop: null, guild: "home", prepItem: false }],
    ["racket", { discordAgeDays: 90, fortunaAgeDays: null, shifts: 20, netWorth: null, tenureSeconds: 259_200, heatBelow: null, notJailed: false, notInFamily: false, activeMember: true, hop: null, guild: null, prepItem: false }],
    ["payday", { discordAgeDays: 90, fortunaAgeDays: 14, shifts: 20, netWorth: null, tenureSeconds: 604_800, heatBelow: null, notJailed: false, notInFamily: false, activeMember: true, hop: null, guild: null, prepItem: false }],
  ] as const)("gate %s matches 12.1", (gate, def) => {
    expect(C.ELIGIBILITY_GATES[gate]).toEqual(def);
  });

  it("pins the config numbers the families layer uses", () => {
    expect(CRIME_FAMILY_CONFIG).toMatchObject({ enabled: false, turfEnabled: false, allowGuildIds: null, createFee: 10_000_000, renameFee: 2_000_000, duesPerLevel: 40_000, depositMin: 10_000, depositDailyCap: 25_000_000, vaultTaxRate: 0.05, paydayMinEarnings: 500_000, paydayGrossCap: 1_000_000 });
  });

  it("opens only when enabled and the guild is allowed", async () => {
    expect(isCrimeFamilyOpen("g1")).toBe(false);
    await withCfConfig({ enabled: true }, async () => {
      expect(isCrimeFamilyOpen("g1")).toBe(true);
      expect(isCrimeFamilyOpen(null)).toBe(false);
    });
    await withCfConfig({ enabled: true, allowGuildIds: ["g1"] }, async () => {
      expect(isCrimeFamilyOpen("g1")).toBe(true);
      expect(isCrimeFamilyOpen("g2")).toBe(false);
    });
  });
});
```

Add `withCfConfig` to `test/helpers.ts` in this task. It applies the overrides to two objects and restores every key of both in `finally`: the statically imported `CRIME_FAMILY_CONFIG`, and the Node copy `require("../src/utils/economyConfig").CRIME_FAMILY_CONFIG`, loaded after `require("ts-node").register({ transpileOnly: true })` (the copy `routeMessage`'s lazy `require` of `crew.ts` sees; Global Constraints). When both are the same object (no second copy loaded), it patches once.

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/catalog.test.ts`
Expected: FAIL, cannot resolve `../../src/data/crimeFamilyCatalog`.

- [ ] **Step 3: Add `CRIME_FAMILY_CONFIG` and `isCrimeFamilyOpen` to `src/utils/economyConfig.ts`**

The spec 19.2 object verbatim (including its caper and turf keys, so plans 2/3 never redefine them; they append only their own non-spec keys: plan 2 Task 2, plan 3 Task 1), plus these keys:

```ts
renameCooldownSeconds: 2_592_000, maxPendingInvites: 5, acceptedInvitesPerInviterPer7d: 3, joinsPerFamilyPer7d: 5,
associateSeconds: 259_200, claimChairAfterSeconds: 604_800, autoHandoverAfterSeconds: 1_209_600,
hopCooldownSeconds: { LEFT: 259_200, KICKED: 86_400, DISBANDED: 86_400 },
refoundAfterBossDisbandSeconds: 604_800, rejoinSameFamilySeconds: 1_209_600,
activityThrottleSeconds: 3_600, ledgerPageSize: 15, vaultLedgerLines: 10,
underInvestigationHeat: 100, underInvestigationMembers: 3, maxLevel: 10,
```

`isCrimeFamilyOpen(guildId)` = `enabled && !!guildId && (allowGuildIds === null || allowGuildIds.includes(guildId))`.

- [ ] **Step 4: Create `src/data/crimeFamilyCatalog.ts`**

Data copied from spec tables 8.1, 8.2 (prep keys and calls), 8.3 (label pools), 9.1, 9.4 (blocks and approaches), 10.1, 12.1, 6.2 and 16.2 (emoji keys: `role_<role lowercase>`, `rank_<role lowercase>`, `rank_associate`, `turf_<class lowercase>`, `block_<key>`, crests). `ELIGIBILITY_GATES.caper_t<n>` is built from `CAPER_TIERS[n-1]` (`seatGate`, `heatCeiling`) so the two tables cannot drift. `FAMILY_NAME_DENYLIST = ["fortuna","admin","staff","mod","discord","police","cops","street","everyone","here"]`; `FAMILY_NAME_SLURS` is a lowercase English slur list the implementer fills (spec 21.9). `CAPER_OUTCOME_PCT = { CLEAN: 100, MESSY: 35, BUST: 0 }`, `CAPER_SPLIT_PCT = { crew: 80, vault: 10 }`. Call `assertRolePartition()` at module load: throws if any whitelist key is missing or appears twice.

- [ ] **Step 5: Run the test to verify it passes**

Run: `$VT test/crimeFamily/catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/economyConfig.ts src/data/crimeFamilyCatalog.ts test/crimeFamily/catalog.test.ts test/helpers.ts
git commit -m "feat(crime-families): config, feature flags and the static catalog"
```

---

### Task 2: Wallet transaction seams and the uncached net worth

**Files:**
- Modify: `src/services/walletService.ts:112-191` (extract from `addBalance`), add `debitWalletInTx`
- Modify: `src/services/netWorthService.ts:25` (add `export`)
- Modify: `src/utils/format.ts` (add `parsePositiveAmount` and `fmtFortunes` after `parseSmartAmount`, `:55-74`)
- Test: `test/wallet/tx-seams.test.ts`

**Interfaces:**
- Produces: `InsufficientFundsError`, `CreditResult`, `creditWalletInTx`, `afterEarnedCredit`, `debitWalletInTx`, `computeNetWorth`, `parsePositiveAmount` (Seams block), and `fmtFortunes(n: number): string` = `Math.floor(n).toLocaleString("en-US")`.

- [ ] **Step 1: Write the failing test**

```ts
// test/wallet/tx-seams.test.ts
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { addBalance, creditWalletInTx, debitWalletInTx, InsufficientFundsError } from "../../src/services/walletService";
import { computeNetWorth } from "../../src/services/netWorthService";
import { questBus } from "../../src/services/questEvents";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";
import { parsePositiveAmount, fmtFortunes } from "../../src/utils/format";
import { testPrisma, testRedis, seedUser, resetUser } from "../helpers";

const A = "seam-a";
const bal = async () => (await testPrisma.wallet.findUnique({ where: { userId: A } }))!.balance;
beforeEach(async () => { await seedUser(A); });
afterAll(() => resetUser(A));

describe("wallet tx seams", () => {
  it("addBalance keeps its clamp and earn event", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: MAX_SAFE_BALANCE - 100 } });
    const emit = vi.spyOn(questBus, "emit");
    const r = await addBalance(A, "A", 500, "income", {}, true);
    expect(r).toMatchObject({ appliedAmount: 100, capped: true });
    expect(emit).toHaveBeenCalledWith("economy:earn", { discordId: A, amount: 100 });
    emit.mockRestore();
  });

  it("creditWalletInTx rolls back with its transaction", async () => {
    await expect(prisma.$transaction(async (tx) => {
      await creditWalletInTx(tx, A, "A", 1_000, "test", {}, true);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    expect(await bal()).toBe(0);
  });

  it("debitWalletInTx refuses an overdraft and writes nothing", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 500 } });
    await expect(prisma.$transaction((tx) => debitWalletInTx(tx, A, 600, "t", {}))).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await bal()).toBe(500);
  });

  it("two racing debits of 600 on 1,000 pay once", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 1_000 } });
    const run = () => prisma.$transaction((tx) => debitWalletInTx(tx, A, 600, "family_vault_deposit", { k: 1 }));
    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bal()).toBe(400);
    const w = await testPrisma.wallet.findUnique({ where: { userId: A } });
    const rows = await testPrisma.transaction.findMany({ where: { walletId: w!.id, type: "family_vault_deposit" } });
    expect(rows.map((r) => [r.amount, r.isEarned])).toEqual([[-600, false]]);
  });

  it("computeNetWorth ignores a stale networth cache", async () => {
    await testPrisma.wallet.update({ where: { userId: A }, data: { balance: 7_000 } });
    await testRedis().set(`networth:${A}`, JSON.stringify({ total: 9e12 }), "EX", 600);
    expect((await computeNetWorth(A)).total).toBe(7_000);
  });

  it.each([["5m", 1e9, 5_000_000], ["1.5b", 9e9, 1_500_000_000], ["2.5k", 1e9, 2_500], ["1,000,000", 1e9, 1_000_000], ["all", 42, 42],
    ["-5m", 1e9, null], ["0", 1e9, null], ["abc", 1e9, null], ["1.5x", 1e9, null], ["all", 0, null]] as const)(
    "parsePositiveAmount(%s, %d) = %s", (raw, max, want) => expect(parsePositiveAmount(raw, max)).toBe(want));

  it("fmtFortunes never prints infinity", () => expect(fmtFortunes(3_000_000_000.7)).toBe("3,000,000,000"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/wallet/tx-seams.test.ts`
Expected: FAIL, `creditWalletInTx` is not exported.

- [ ] **Step 3: Implement the seams**

- `creditWalletInTx`: the body of `addBalance`'s transaction (`:116-168`) unchanged, returning `CreditResult`.
- `afterEarnedCredit`: `addBalance`'s post-commit block (`:171-188`): garnishment and `economy:earn` only when `earned && appliedAmount > 0`; `invalidateUserCache` whenever `appliedAmount > 0`.
- `addBalance` becomes `afterEarnedCredit(id, await withTransactionRetry(() => prisma.$transaction((tx) => creditWalletInTx(...))), earned)`; same signature and result.
- `debitWalletInTx`: `tx.wallet.updateMany({ where: { userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } })`; `count === 0` → `throw new InsufficientFundsError()` (message `"Insufficient funds."`); then one `Transaction{ amount: -amount, type, meta, isEarned: false }`. Existing inline debit sites stay as they are (spec 14.4).
- `parsePositiveAmount(raw, max)`: `parseSmartAmount` (`src/utils/format.ts:55`), then `null` unless the input matches `^\d[\d,]*(\.\d+)?[kmb]?$|^(all|max|allin)$` (case-insensitive) and the result is a finite integer > 0.
- `computeNetWorth`: add `export` only.

- [ ] **Step 4: Run the new test and the existing wallet users**

Run: `$VT test/wallet/tx-seams.test.ts test/card/garnishment.test.ts test/bank test/anticheat/transfer.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/walletService.ts src/services/netWorthService.ts src/utils/format.ts test/wallet/tx-seams.test.ts
git commit -m "refactor(wallet): tx-scoped credit and guarded debit seams; export computeNetWorth"
```

---

### Task 3: Family models, transaction kit, ledger, extension registries and test helpers

**Files:**
- Modify: `prisma/schema.prisma` (append `Family`, `FamilyMember`, `FamilyExit`, `FamilyInvite`, `FamilyLedger` verbatim from spec 14.1)
- Create: `src/services/crimeFamily/tx.ts`, `src/services/crimeFamily/ledger.ts`, `src/services/crimeFamily/extensions.ts`
- Modify: `test/helpers.ts`, `src/services/walletService.ts:7` (add `export` to `isTransientWriteConflict`)
- Test: `test/crimeFamily/tx.test.ts`

**Interfaces:**
- Consumes: `withTransactionRetry`, `isTransientWriteConflict` (`src/services/walletService.ts:7-28`).
- Produces: `tx.ts`, `ledger.ts`, `extensions.ts` exports and the test helpers (Seams block). `LedgerRow = { familyId: string; actorId: string; type: LedgerType; amount: number; treasuryAfter: number; earningsAfter: number; meta?: Record<string, unknown> }`. `readLedgerPage` (Seams block) maps each row to `LedgerLine` (`at` = `createdAt`) and clamps `page` into `[0, pages-1]`. `racketsHeldFor(ids)` returns `null` when no `FAMILY_HOOKS` entry has `racketsHeld`, else the first provider's map.
- Helper shapes: `SeedEligibleOpts = { id?: string /* used instead of a generated snowflake */; discordAgeDays?: number /*400*/; fortunaAgeDays?: number /*400*/; shifts?: number /*400*/; wallet?: number /*0*/; heat?: number /*0*/; prepKeys?: string[]; jailedUntil?: Date; ban?: { expiresAt: Date | null } }` (returns a fresh snowflake id whose timestamp is `discordAgeDays` ago; prep keys become `ShopItem` upserts by `catalogKey` plus `Inventory` rows, as in `test/zoo/feeding.test.ts:7-20`). `SeedFamilyOpts = { bossId: string; name?: string; tag?: string; level?: number; xp?: number; treasury?: number; earnings?: number; duesArrears?: number; lastPaydayAt?: Date; homeGuildId?: string /* "g1" */; homeChannelId?: string /* "c-home": production families always have a home channel, and plan 1's auto-payday card and plan 3's bid blocker read it */; members?: { userId: string; role: FamilyRole; joinedAt?: Date; lastActiveAt?: Date; capers?: number }[] }` (creates the Boss row in seat 1 with `joinedAt` 30 days ago, then each `members` entry, which never includes the Boss, in seats 2..n with its `roleSlot`; `name` and `tag` default to unique values from a module counter `n`: name `` `Family ${n}` ``, tag `` `F${n}` ``, at most 4 characters, so a test may seed up to 999 default families). `resetFamilies()` deletes the five collections (plans 2/3 extend it).

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/tx.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { runFamilyTx, VaultBusy, FamilyError, isUniqueViolation } from "../../src/services/crimeFamily/tx";
import { writeLedger, readLedgerPage } from "../../src/services/crimeFamily/ledger";
import { testPrisma, ensureUniqueIndexes, resetFamilies, seedFamily, seedEligibleUser } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("family transaction kit", () => {
  it("unique indexes exist with Prisma's names", async () => {
    const fam = await seedFamily({ bossId: await seedEligibleUser() });
    const err = await testPrisma.familyMember.create({ data: { familyId: fam.id, userId: fam.bossId, role: "SOLDIER", roleSlot: "x", seat: 9 } }).catch((e) => e);
    expect(isUniqueViolation(err, "FamilyMember_userId_key")).toBe(true);
  });

  it("retries a VaultBusy and succeeds", async () => {
    let calls = 0;
    expect(await runFamilyTx(async () => { if (++calls === 1) throw new VaultBusy(); return "ok"; })).toBe("ok");
    expect(calls).toBe(2);
  });

  it("turns an exhausted VaultBusy into a player message", async () => {
    await expect(runFamilyTx(async () => { throw new VaultBusy(); })).rejects.toThrow(new FamilyError("Vault busy, try again."));
  });

  it("turns an exhausted Mongo write conflict (P2034) into the same message", async () => {
    let calls = 0;
    const p2034 = Object.assign(new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"), { code: "P2034" });
    await expect(runFamilyTx(async () => { calls++; throw p2034; })).rejects.toThrow(new FamilyError("Vault busy, try again."));
    expect(calls).toBe(3);
  });

  it("does not retry a FamilyError", async () => {
    let calls = 0;
    await expect(runFamilyTx(async () => { calls++; throw new FamilyError("no"); })).rejects.toThrow("no");
    expect(calls).toBe(1);
  });

  it("pages the ledger newest first and clamps the page", async () => {
    const fam = await seedFamily({ bossId: await seedEligibleUser() });
    await runFamilyTx(async (tx) => { for (let i = 0; i < 16; i++) await writeLedger(tx, { familyId: fam.id, actorId: "system", type: "dues", amount: -i, treasuryAfter: 0, earningsAfter: 0 }); });
    const p = await readLedgerPage(fam.id, 9, 15);
    expect([p.page, p.pages, p.rows.length]).toEqual([1, 2, 1]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/tx.test.ts`
Expected: FAIL, cannot resolve `../../src/services/crimeFamily/tx`.

- [ ] **Step 3: Append the five models to `prisma/schema.prisma` and regenerate**

Models exactly as spec 14.1 (`Family` … `FamilyLedger`). Then:
Run: `npx prisma validate && npx prisma generate`
Expected: "The schema … is valid" and "Generated Prisma Client". Do not run `db push`.

- [ ] **Step 4: Implement `tx.ts`, `ledger.ts`, `extensions.ts` and the helpers**

- `runFamilyTx(fn, attempts = 3)`: `withTransactionRetry(() => prisma.$transaction(fn, { maxWait: 5_000, timeout: 15_000 }), attempts)`; when the final error satisfies `isTransientWriteConflict` (this covers `VaultBusy` and P2034), throw `new FamilyError("Vault busy, try again.")`; anything else is rethrown unchanged.
- `VaultBusy` message `"Vault write conflict"` (contains "write conflict", so `isTransientWriteConflict`, `walletService.ts:7-14`, retries it). `VaultShort(need, have)` message `` `The vault is short: needs ${fmtFortunes(need)}, has ${fmtFortunes(have)}.` ``.
- `touchFamily`: `tx.family.update({ where: { id }, data: { updatedAt: now } })`.
- `isUniqueViolation(err, index?)`: `code === "P2002"` and, when given, `String(meta?.target)` includes `index`.
- `extensions.ts`: `export const ACTIVITY_RULES: ActivityRule[] = []; export const FAMILY_HOOKS: FamilyHook[] = [];` with a header comment telling plans 2/3 to add entries here and never import `membershipService`/`disbandService` from a hook module (cycle).
- `ensureUniqueIndexes(models)`: for each model in `Prisma.dmmf.datamodel.models`, every `uniqueIndexes[].fields` and every field with `isUnique` → `testPrisma.$runCommandRaw({ createIndexes: model, indexes: [{ key, name: \`${model}_${fields.join("_")}_key\`, unique: true }] })`; ignore error codes 85/86 (index already exists).

- [ ] **Step 5: Run the test to verify it passes**

Run: `$VT test/crimeFamily/tx.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/services/walletService.ts src/services/crimeFamily/tx.ts src/services/crimeFamily/ledger.ts src/services/crimeFamily/extensions.ts test/helpers.ts test/crimeFamily/tx.test.ts
git commit -m "feat(crime-families): family models, transaction kit, ledger and extension registries"
```

---

### Task 4: Names, tags and the permission table

**Files:**
- Create: `src/services/crimeFamily/names.ts`, `src/services/crimeFamily/permissions.ts`
- Test: `test/crimeFamily/names-permissions.test.ts`

**Interfaces:**
- Produces: `checkFamilyName(raw: string): { ok: true; name: string; nameKey: string } | { ok: false; reason: string }`; `checkFamilyTag(raw: string): { ok: true; tag: string; tagKey: string } | { ok: false; reason: string }`; `nameKeyOf(name: string): string`; plus `can`, `isAssociate`, `ROLE_RANK`, `nextRoleUp(role): FamilyRole | null`, `nextRoleDown(role): FamilyRole | null`.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/names-permissions.test.ts
import { describe, it, expect } from "vitest";
import { checkFamilyName, checkFamilyTag } from "../../src/services/crimeFamily/names";
import { can, isAssociate } from "../../src/services/crimeFamily/permissions";

const now = new Date("2026-11-04T12:00:00Z");
const old = new Date("2026-10-01T00:00:00Z");
const fresh = new Date("2026-11-03T12:00:00Z"); // 24h: Associate

describe("names and tags (6.2)", () => {
  it.each([
    ["Velvet Ante", "velvet ante"], ["  Velvet Ante  ", "velvet ante"], ["O'Brien-Kin", "o'brien-kin"],
  ])("accepts %j", (raw, key) => expect(checkFamilyName(raw)).toMatchObject({ ok: true, nameKey: key }));
  it.each(["Velvet  Ante", "ab", "x".repeat(25), "Café Noir", "Ante 😀", "-Ante", "Streetwise", "The F.o.r.t.u.n.a", "Where Eagles Dare", "Model Citizens"])(
    "refuses %j", (raw) => expect(checkFamilyName(raw).ok).toBe(false));
  it("uppercases a tag and refuses bad ones", () => {
    expect(checkFamilyTag(" vla ")).toEqual({ ok: true, tag: "VLA", tagKey: "VLA" });
    for (const t of ["V", "VLAXX", "V-A", "MOD"]) expect(checkFamilyTag(t).ok).toBe(false);
  });
});

describe("permissions (6.3)", () => {
  const as = (role: any, joinedAt = old) => ({ role, joinedAt });
  it.each([
    ["CAPO", "invite", undefined, true], ["SOLDIER", "invite", undefined, false],
    ["BOSS", "kick", "UNDERBOSS", true], ["UNDERBOSS", "kick", "CAPO", true], ["UNDERBOSS", "kick", "UNDERBOSS", false],
    ["CAPO", "kick", "SOLDIER", true], ["CAPO", "kick", "CAPO", false],
    ["BOSS", "promote", "CAPO", true], ["UNDERBOSS", "promote", "SOLDIER", true], ["UNDERBOSS", "promote", "CAPO", false],
    ["UNDERBOSS", "payday", undefined, true], ["CAPO", "payday", undefined, false],
    ["UNDERBOSS", "claim_chair", undefined, true], ["BOSS", "claim_chair", undefined, false],
    ["BOSS", "disband", undefined, true], ["UNDERBOSS", "set_home", undefined, false], ["CAPO", "plan_caper", undefined, true],
  ] as const)("%s %s %s → %s", (role, action, target, want) =>
    expect(can(as(role), action, now, target ? { role: target } : undefined)).toBe(want));
  it("Associates can deposit but cannot take a seat or act in a war", () => {
    expect(isAssociate(fresh, now)).toBe(true);
    expect(can(as("SOLDIER", fresh), "deposit", now)).toBe(true);
    expect(can(as("SOLDIER", fresh), "take_seat", now)).toBe(false);
    expect(can(as("SOLDIER", fresh), "war_act", now)).toBe(false);
  });
  it("a fresh Capo or Underboss keeps the rank's rights except seats and war acts", () => {
    expect(can(as("CAPO", fresh), "invite", now)).toBe(true);
    expect(can(as("UNDERBOSS", fresh), "payday", now)).toBe(true);
    expect(can(as("CAPO", fresh), "take_seat", now)).toBe(false);
  });
  it.each(["invite", "set_home", "rename", "disband", "payday", "take_seat", "war_act"] as const)(
    "a Boss who founded a minute ago may %s (P20)", (action) => {
      expect(can({ role: "BOSS", joinedAt: new Date(+now - 60_000) }, action, now)).toBe(true);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/names-permissions.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`checkFamilyName`: trim; refuse `/\s{2,}/` ("No double spaces."); test `FAMILY_NAME_RULE` (reason states "3–24 characters: letters, digits, spaces, ' and -; start and end with a letter or digit"); denylist and slurs match as substrings of `raw.toLowerCase().replace(/[^a-z0-9]/g, "")`. `nameKeyOf = name.toLowerCase().replace(/\s+/g, " ")`. Tag: trim, uppercase, `FAMILY_TAG_RULE`, same denylist check. `can` encodes the spec 6.3 role columns; the Associate column is applied as P20: when `role !== "BOSS"` and `isAssociate(joinedAt, now)`, `take_seat` and `war_act` are false, and every other action follows the role column. Promote/demote compare `ROLE_RANK` (Boss may move a target up to UNDERBOSS, Underboss only SOLDIER → CAPO; demote only targets ranked below the actor). `isAssociate = joinedAt > now − associateSeconds` stays a pure date test; callers that display the label (S2 roster, `buildDashboardView`) skip it for the `BOSS` row.

- [ ] **Step 4: Run the test to verify it passes**

Run: `$VT test/crimeFamily/names-permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/names.ts src/services/crimeFamily/permissions.ts test/crimeFamily/names-permissions.test.ts
git commit -m "feat(crime-families): name and tag rules and the role permission table"
```

---

### Task 5: The eligibility seam

**Files:**
- Create: `src/services/crimeFamily/eligibility.ts`
- Test: `test/crimeFamily/eligibility.test.ts`

**Interfaces:**
- Consumes: `ELIGIBILITY_GATES`, `caperRole`, `computeNetWorth` (Task 2), `isBanActive` (`src/services/banService.ts:6`), `checkJailStatus` (`src/services/jailService.ts:30`), `getOwnedPrepKeys` (`src/services/crimeService.ts:76`), `ACTIVITY_RULES` (Task 3).
- Produces: `checkMemberEligibility`, `isActiveMember`, `EligibilityCheck`/`EligibilityResult`/`EligibilityOpts` (Seams block), and `discordAccountCreatedAt(uid: string): Date` (`SnowflakeUtil.timestampFrom`; a non-snowflake id returns `new Date()`), `hopCooldownEndsAt(exit: { reason: "LEFT" | "KICKED" | "DISBANDED"; leftAt: Date }): Date` (`leftAt + hopCooldownSeconds[reason]`; the founding column of 6.6 differs only for a disbanding Boss, which is the separate `refound_cooldown` check).
- Check names in `failures[].gate`, always evaluated and returned in this order: `banned`, `jailed`, `discord_age`, `fortuna_age`, `shifts`, `net_worth`, `not_member`, `tenure`, `heat`, `in_family`, `hop_cooldown`, `refound_cooldown`, `rejoin_cooldown`, `guild`, `prep_item`, `active`. `need`/`have` are display strings that always carry their unit, numbers formatted with `toLocaleString("en-US")`: `discord_age`/`fortuna_age` `"≥ 180 days Discord age"`/`"179 days"`, `shifts` `"≥ 60 shifts"`/`"59 shifts"`, `net_worth` `"≥ 15,000,000 net worth"`/`"14,999,999"`, `tenure` `"≥ 7 days in the family"`/`"3 days"`, `heat` `"heat below 70"`/`"heat 70"`, the rest a short phrase (`"not jailed"`/`"jailed"`). Produces `eligibilityError(failures: EligibilityCheck[]): FamilyError` with message `` `Not eligible: ${failures.map((f) => `${f.need} (you have ${f.have})`).join("; ")}` ``; `createFamily` and `acceptInvite` throw it.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/eligibility.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { checkMemberEligibility, eligibilityError } from "../../src/services/crimeFamily/eligibility";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const gates = async (uid: string, gate: any, opts?: any) => (await checkMemberEligibility(uid, gate, opts)).failures.map((f) => f.gate);
const exit = (userId: string, familyId: string, reason: string, leftAt: Date, wasBoss = false) =>
  testPrisma.familyExit.create({ data: { userId, familyId, reason, leftAt, wasBoss } });
const FAM = "65f000000000000000000001";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("checkMemberEligibility (12.1)", () => {
  it("passes a qualified founder", async () => {
    expect(await gates(await seedEligibleUser({ wallet: 15_000_000 }), "found")).toEqual([]);
  });

  it.each([
    [{ discordAgeDays: 179 }, "discord_age"], [{ fortunaAgeDays: 29 }, "fortuna_age"], [{ shifts: 59 }, "shifts"],
    [{ wallet: 14_999_999 }, "net_worth"], [{ heat: 70 }, "heat"], [{ jailedUntil: new Date(Date.now() + 60_000) }, "jailed"],
    [{ ban: { expiresAt: null } }, "banned"], [{ ban: { expiresAt: new Date(Date.now() + 60_000) } }, "banned"],
  ] as const)("found fails alone on %o", async (opts, gate) => {
    expect(await gates(await seedEligibleUser({ wallet: 15_000_000, ...opts }), "found")).toEqual([gate]);
  });

  it("an expired ban passes", async () => {
    expect(await gates(await seedEligibleUser({ wallet: 15_000_000, ban: { expiresAt: new Date(Date.now() - 1) } }), "found")).toEqual([]);
  });

  it("a stale networth cache cannot clear the gate", async () => {
    const uid = await seedEligibleUser({ wallet: 10 });
    await testRedis().set(`networth:${uid}`, JSON.stringify({ total: 1e12 }), "EX", 600);
    expect(await gates(uid, "family_join")).toContain("net_worth");
  });

  it("applies hop cooldowns (6.6)", async () => {
    const u = await seedEligibleUser({ wallet: 15_000_000 });
    await exit(u, FAM, "LEFT", new Date(Date.now() - 71 * 3600_000));
    expect(await gates(u, "family_join")).toEqual(["hop_cooldown"]);
    const k = await seedEligibleUser({ wallet: 15_000_000 });
    await exit(k, FAM, "KICKED", new Date(Date.now() - 25 * 3600_000));
    expect(await gates(k, "family_join")).toEqual([]);
    const b = await seedEligibleUser({ wallet: 15_000_000 });
    await exit(b, FAM, "DISBANDED", new Date(Date.now() - 25 * 3600_000), true);
    expect(await gates(b, "family_join")).toEqual([]);
    expect(await gates(b, "found")).toEqual(["refound_cooldown"]);
  });

  it("blocks rejoining the same family for 14 days", async () => {
    const u = await seedEligibleUser({ wallet: 2_000_000 });
    await exit(u, FAM, "KICKED", daysAgo(13));
    expect(await gates(u, "family_join", { familyId: FAM })).toEqual(["rejoin_cooldown"]);
    expect(await gates(u, "family_join", { familyId: "65f000000000000000000002" })).toEqual([]);
  });

  it("checks a caper seat's heat, prep item, tenure and guild", async () => {
    const boss = await seedEligibleUser();
    const u = await seedEligibleUser({ wallet: 9_000_000, heat: 60, prepKeys: ["camouflage_kit"] });
    await seedFamily({ bossId: boss, members: [{ userId: u, role: "SOLDIER", joinedAt: daysAgo(4) }] });
    expect(await gates(u, "caper_t2", { role: "LOOKOUT", guildId: "g1", expectedGuildId: "g1" })).toEqual(["heat"]);
    expect(await gates(u, "caper_t1", { role: "MUSCLE", guildId: "g2", expectedGuildId: "g1" })).toEqual(["guild", "prep_item"]);
  });

  it("payday needs 7 days of tenure and an active-member rule", async () => {
    const boss = await seedEligibleUser();
    const u = await seedEligibleUser();
    await seedFamily({ bossId: boss, members: [{ userId: u, role: "SOLDIER", joinedAt: daysAgo(6) }] });
    expect(await gates(u, "payday")).toEqual(["tenure", "active"]);
    ACTIVITY_RULES.push({ key: "t", label: "test seats", need: 2, count: async () => 2 });
    try { expect(await gates(boss, "payday")).toEqual([]); } finally { ACTIVITY_RULES.pop(); }
  });

  it("renders needs with units", async () => {
    const r = await checkMemberEligibility(await seedEligibleUser({ wallet: 15_000_000, shifts: 59 }), "found");
    expect(eligibilityError(r.failures).message).toBe("Not eligible: ≥ 60 shifts (you have 59 shifts)");
  });
});
```

(`seedFamily` sets the Boss's `joinedAt` to 30 days ago unless given.)

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/eligibility.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `checkMemberEligibility`**

Read the user (`isBanned`, `banExpiresAt`, `createdAt`, `shiftsWorked`, `crimeHeat`) and the member row once; evaluate the gate's rows in the order listed under Interfaces, every applicable row producing an `EligibilityCheck`; net worth only when the gate has one, through `computeNetWorth` (never `getNetWorth`); jail through `checkJailStatus`; `guild` when the gate has one and `opts.expectedGuildId` is given (`opts.guildId === opts.expectedGuildId`); `prep_item` when `opts.role` is given (any of `caperRole(role).prepKeys` in `getOwnedPrepKeys`). `not_member` replaces `tenure` when a tenure gate has no member row. Hop (gates with `hop` set): latest `FamilyExit` by `leftAt` → `hopCooldownEndsAt`; for `found` also `refound_cooldown` from any `DISBANDED` exit with `wasBoss: true` within `refoundAfterBossDisbandSeconds`; `rejoin_cooldown` from any exit with `opts.familyId` within `rejoinSameFamilySeconds`. Active: `isActiveMember` is true when any `ACTIVITY_RULES` entry has `count(uid, now − 7d) ≥ need`; with no rules, `have: "0"` and `need: "recent caper or war play"`, joined with " or " from rule labels otherwise.

- [ ] **Step 4: Run the test to verify it passes**

Run: `$VT test/crimeFamily/eligibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/eligibility.ts test/crimeFamily/eligibility.test.ts
git commit -m "feat(crime-families): one eligibility seam for every gate"
```

---

### Task 6: Create, home channel, force rename and the read seams

**Files:**
- Create: `src/services/crimeFamily/familyQueries.ts`, `src/services/crimeFamily/views.ts`, `src/services/crimeFamily/familyService.ts`
- Test: `test/anticheat/family-membership.race.test.ts` (create block)

**Interfaces:**
- Consumes: `debitWalletInTx`, `runFamilyTx`, `touchFamily`, `writeLedger`, `isUniqueViolation`, `checkFamilyName/Tag`, `checkMemberEligibility(uid, "found")`, `eligibilityError`, `racketsHeldFor`, `isAssociate`.
- Produces (`renameFamily` is added to this file by Task 9, which owns `spendFromVault`):
  - `createFamily(input: { uid: string; username: string; name: string; tag: string; guildId: string; channelId: string; now?: Date }): Promise<Family>`
  - `setHomeChannel(bossId: string, guildId: string, channelId: string): Promise<Family>`
  - `forceRenameFamily(tag: string, rawName: string, adminId: string): Promise<Family>`
  - read seams in the Seams block, plus `buildDashboardView(familyId: string, viewerId: string, now: Date): Promise<FamilyDashboardView>`.
  - `views.ts` (types only): `FamilyDashboardView { familyId; name; tag; level; xp; nextLevelXp: number | null; memberCount; memberCap; crestKey; roster: { userId: string; role: FamilyRole; associateUntil: Date | null /* always null for the BOSS row (P20) */ }[]; duesArrears: number; nextCaperAt: Date; underInvestigation: boolean; racketsHeld: number | null; showTurf: boolean; viewer: { userId: string; role: FamilyRole | null; canManage: boolean; canClaim: boolean } }`. Each other view type is added to `views.ts` by the task that first produces it: `VaultView` (Task 9), `PaydayPreview` (Task 10), `LeaderboardView` (Task 11), `InviteView` (Task 15). `LedgerLine` lives in `ledger.ts` (Task 3).

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/family-membership.race.test.ts  (create block; Tasks 7–8 append blocks)
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createFamily, forceRenameFamily } from "../../src/services/crimeFamily/familyService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes } from "../helpers";

const todayKey = () => new Date().toISOString().slice(0, 10);

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const create = (uid: string, name = "Velvet Ante", tag = "VLA") => createFamily({ uid, username: "u", name, tag, guildId: "g1", channelId: "c1" });

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("createFamily (6.1)", () => {
  it("burns 10,000,000 and seats the founder as Boss", async () => {
    const uid = await seedEligibleUser({ wallet: 15_000_000 });
    const fam = await create(uid);
    expect(await wallet(uid)).toBe(5_000_000);
    expect(fam).toMatchObject({ level: 1, nameKey: "velvet ante", tagKey: "VLA", bossId: uid, homeGuildId: "g1", homeChannelId: "c1", duesDayKey: todayKey() });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: uid } })).toMatchObject({ role: "BOSS", roleSlot: "BOSS", seat: 1 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: fam.id } })).toMatchObject({ type: "create_fee", amount: 0, meta: { paid: 10_000_000 } });
    expect(await testPrisma.audit.count({ where: { userId: uid, type: "family_create" } })).toBe(1);
  });

  it("refuses a failing gate before any debit", async () => {
    const uid = await seedEligibleUser({ wallet: 15_000_000, shifts: 59 });
    await expect(create(uid)).rejects.toThrow(/shifts/i);
    expect(await wallet(uid)).toBe(15_000_000);
  });

  it("forceRenameFamily applies the name rules and maps a taken name", async () => {
    await seedFamily({ bossId: await seedEligibleUser(), name: "Taken Name", tag: "TKN" });
    const f = await seedFamily({ bossId: await seedEligibleUser(), tag: "VLA" });
    await expect(forceRenameFamily("VLA", "Velvet  Ante", "admin")).rejects.toThrow("No double spaces.");
    await expect(forceRenameFamily("VLA", "taken name", "admin")).rejects.toThrow("Name taken.");
    expect(await forceRenameFamily("vla", "Fresh Name", "admin")).toMatchObject({ id: f.id, name: "Fresh Name", nameKey: "fresh name" });
  });

  it("one user double-creating gets one family and one debit", async () => {
    const uid = await seedEligibleUser({ wallet: 25_000_000 });
    await Promise.allSettled([create(uid, "Alpha Crew", "ALP"), create(uid, "Beta Crew", "BET")]);
    expect(await testPrisma.family.count()).toBe(1);
    expect(await wallet(uid)).toBe(15_000_000);
  });

  it("two users racing for one name: one family, the loser keeps their money", async () => {
    const a = await seedEligibleUser({ wallet: 15_000_000 });
    const b = await seedEligibleUser({ wallet: 15_000_000 });
    const rs = await Promise.allSettled([create(a, "Velvet Ante", "VLA"), create(b, "velvet ante", "VLB")]);
    expect(rs.filter((r) => r.status === "rejected").map((r: any) => r.reason.message)).toEqual(["Name or tag taken."]);
    expect([await wallet(a), await wallet(b)].sort((x, y) => x - y)).toEqual([5_000_000, 15_000_000]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/family-membership.race.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

- `createFamily`: name/tag checks → `checkMemberEligibility(uid, "found")` (failures → `throw eligibilityError(failures)`) → `runFamilyTx` with the four steps of spec 6.1 (`debitWalletInTx(tx, uid, createFee, "family_create", { tag })`, `family.create` with `duesDayKey: utcDayKey(now)` (P11), `familyMember.create({ role: "BOSS", roleSlot: "BOSS", seat: 1 })`, ledger `create_fee`, `audit.create({ type: "family_create" })`). Outside the transaction map `isUniqueViolation(err, "Family_nameKey_key" | "Family_tagKey_key")` → `FamilyError("Name or tag taken.")`, `"FamilyMember_userId_key"` → `"You are already in a family."`, `InsufficientFundsError` passes through.
- `setHomeChannel`: Boss only; plain update. `forceRenameFamily`: `getFamilyByTag(tag)` (none → `FamilyError("No family with that tag.")`), `checkFamilyName(rawName)` (refuse with its `reason`), then the update and `Audit{type:"family_forcerename", userId: adminId, meta: { tag, from, to }}`; no fee, no cooldown; outside, `isUniqueViolation(err, "Family_nameKey_key")` → `FamilyError("Name taken.")`, as `renameFamily` does.
- `familyQueries.ts`: `getMembership` (`prisma.familyMember.findUnique({ where: { userId } })` on the global client, then the family; Task 9's race test patches exactly that call), `listMembers` (sort by `ROLE_RANK` desc then `joinedAt`), `isUnderInvestigation` (count users among member ids with `crimeHeat ≥ underInvestigationHeat`, true at `≥ underInvestigationMembers`), `buildDashboardView` (`canClaim` = viewer is Underboss and the Boss's `lastActiveAt ≤ now − claimChairAfterSeconds`; `showTurf = CRIME_FAMILY_CONFIG.turfEnabled`; `racketsHeld = (await racketsHeldFor([familyId]))?.get(familyId) ?? null` when a provider exists, else `null` (P23); `associateUntil` is `null` for the BOSS row).

- [ ] **Step 4: Run the test to verify it passes**

Run: `$VT test/anticheat/family-membership.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/familyQueries.ts src/services/crimeFamily/views.ts src/services/crimeFamily/familyService.ts test/anticheat/family-membership.race.test.ts
git commit -m "feat(crime-families): found a family and home channel, with race tests"
```

---

### Task 7: Invite, accept, decline, leave and kick

**Files:**
- Create: `src/services/crimeFamily/membershipService.ts`
- Test: append to `test/anticheat/family-membership.race.test.ts`

**Interfaces:**
- Consumes: `can`, `checkMemberEligibility(uid, "family_join", { familyId })`, `eligibilityError`, `FAMILY_HOOKS`, `runFamilyTx`, `touchFamily`, `isUniqueViolation`, `levelDef`.
- Produces:
  - `inviteMember(input: { inviterId: string; inviteeId: string; guildId: string; channelId: string; now?: Date }): Promise<FamilyInvite & { family: Family }>`
  - `setInviteMessage(inviteId: string, messageId: string): Promise<void>`
  - `acceptInvite(inviteId: string, uid: string, now?: Date): Promise<{ family: Family; member: FamilyMember }>`; `acceptInviteByTag(uid: string, tag: string, now?: Date)`
  - `declineInvite(inviteId: string, uid: string, now?: Date): Promise<FamilyInvite>`; `declineInviteByTag(uid, tag, now?)`
  - `listPendingInvites(uid: string, now?: Date): Promise<(FamilyInvite & { family: Family })[]>`
  - `leaveFamily(uid: string, now?: Date): Promise<{ family: Family }>`
  - `kickMember(actorId: string, targetId: string, now?: Date): Promise<{ family: Family; targetId: string }>`
  - `expireInvites(now: Date): Promise<FamilyInvite[]>`

- [ ] **Step 1: Write the failing tests (append)**

```ts
// add to the file's imports:
import { inviteMember, acceptInvite, declineInvite, leaveFamily, kickMember, expireInvites } from "../../src/services/crimeFamily/membershipService";
import { FAMILY_HOOKS } from "../../src/services/crimeFamily/extensions";
import { FamilyError, VaultBusy } from "../../src/services/crimeFamily/tx";
import type { FamilyRole } from "../../src/data/crimeFamilyCatalog";
import { daysAgo } from "../helpers";

const invite = (inviterId: string, inviteeId: string, now?: Date) => inviteMember({ inviterId, inviteeId, guildId: "g1", channelId: "c1", now });
const joiner = () => seedEligibleUser({ wallet: 2_000_000 });          // passes family_join
async function famWith(members: { role: FamilyRole; joinedAt?: Date }[] = []) {
  const bossId = await seedEligibleUser();
  const rows = [];
  for (const m of members) rows.push({ userId: await joiner(), joinedAt: daysAgo(10), ...m });
  const family = await seedFamily({ bossId, members: rows });
  return { family, bossId, ids: rows.map((r) => r.userId) };
}
const pending = (familyId: string) => testPrisma.familyInvite.count({ where: { familyId, status: "PENDING" } });
const inviteRow = (id: string) => testPrisma.familyInvite.findUnique({ where: { id } });
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);

describe("invites (6.4)", () => {
  it("creates a 24 h PENDING invite; Soldiers cannot invite", async () => {
    const now = new Date();
    const { family, bossId, ids: [soldier] } = await famWith([{ role: "SOLDIER" }]);
    const t = await joiner();
    const inv = await invite(bossId, t, now);
    expect(inv).toMatchObject({ familyId: family.id, inviterId: bossId, inviteeId: t, status: "PENDING", slot: "PENDING", guildId: "g1", channelId: "c1" });
    expect(+inv.expiresAt).toBe(+now + 86_400_000);
    await expect(invite(soldier, await joiner())).rejects.toThrow("You don't have permission to do that.");
  });

  it("a Boss who founded a minute ago can invite at once (P20)", async () => {
    const founder = await seedEligibleUser({ wallet: 15_000_000 });
    await createFamily({ uid: founder, username: "f", name: "Fresh Crew", tag: "FRS", guildId: "g1", channelId: "c1" });
    await expect(invite(founder, await joiner())).resolves.toMatchObject({ status: "PENDING" });
  });

  it("refuses self, a member of this family and a member of another family, with no row", async () => {
    const { bossId, ids: [mine] } = await famWith([{ role: "SOLDIER" }]);
    const other = await famWith();
    await expect(invite(bossId, bossId)).rejects.toThrow("You can't invite yourself.");
    await expect(invite(bossId, mine)).rejects.toThrow(`<@${mine}> is already in your family.`);
    await expect(invite(bossId, other.bossId)).rejects.toThrow(`<@${other.bossId}> is already in a crime family.`);
    expect(await testPrisma.familyInvite.count()).toBe(0);
  });

  it("refuses a second pending invite to the same player", async () => {
    const { bossId } = await famWith();
    const t = await joiner();
    await invite(bossId, t);
    await expect(invite(bossId, t)).rejects.toThrow("Already invited.");
    expect(await testPrisma.familyInvite.count()).toBe(1);
  });

  it("holds the pending cap of 5 under 6 concurrent invites", async () => {
    const { family, bossId } = await famWith();
    const targets = await Promise.all(Array.from({ length: 6 }, joiner));
    const rs = await Promise.allSettled(targets.map((t) => invite(bossId, t)));
    const n = await pending(family.id);
    expect(n).toBeLessThanOrEqual(5);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(n);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("Too many pending invites (max 5)."));
    while ((await pending(family.id)) < 5) await invite(bossId, await joiner());
    await expect(invite(bossId, await joiner())).rejects.toThrow("Too many pending invites (max 5).");
  });

  it("holds the inviter's 3-per-7-days and the family's 5-per-7-days accepted caps", async () => {
    const { family, bossId, ids: [capo] } = await famWith([{ role: "CAPO", joinedAt: daysAgo(30) }]);
    const accepted = (inviterId: string, n: number, at: Date) => testPrisma.familyInvite.createMany({ data: Array.from({ length: n }, (_, k) => ({
      familyId: family.id, inviterId, inviteeId: `old-${inviterId}-${k}`, status: "ACCEPTED", slot: `s-${inviterId}-${k}`, guildId: "g1", channelId: "c1", expiresAt: at, resolvedAt: at })) });
    await accepted(capo, 3, daysAgo(6));
    await expect(invite(capo, await joiner())).rejects.toThrow("You can bring in 3 members per 7 days.");
    await accepted(bossId, 2, daysAgo(6));
    await expect(invite(bossId, await joiner())).rejects.toThrow("Your family can take 5 new members per 7 days.");
    await testPrisma.familyInvite.updateMany({ where: { familyId: family.id, status: "ACCEPTED" }, data: { resolvedAt: daysAgo(8) } });
    await expect(invite(capo, await joiner())).resolves.toMatchObject({ status: "PENDING" });
  });
});

describe("accept (6.4)", () => {
  it("seats the invitee as a Soldier in the lowest free seat", async () => {
    const { family, bossId } = await famWith();
    const u = await joiner();
    const inv = await invite(bossId, u);
    expect((await acceptInvite(inv.id, u)).member).toMatchObject({ familyId: family.id, role: "SOLDIER", roleSlot: u, seat: 2 });
    expect(await inviteRow(inv.id)).toMatchObject({ status: "ACCEPTED", slot: inv.id });
  });

  it("only the invitee may accept", async () => {
    const { bossId } = await famWith();
    const inv = await invite(bossId, await joiner());
    await expect(acceptInvite(inv.id, await joiner())).rejects.toThrow("This invite is not for you.");
  });

  it("an expired invite is refused and stays PENDING for the sweeper", async () => {
    const now = new Date();
    const { bossId } = await famWith();
    const u = await joiner();
    const inv = await invite(bossId, u, daysAgo(2, now));
    await expect(acceptInvite(inv.id, u, now)).rejects.toThrow("Invite expired.");
    expect((await inviteRow(inv.id))!.status).toBe("PENDING");
  });

  it("a failing join gate rolls the invite back to PENDING and names the gate", async () => {
    const { bossId } = await famWith();
    const u = await seedEligibleUser({ wallet: 2_000_000, shifts: 19 });
    const inv = await invite(bossId, u);
    await expect(acceptInvite(inv.id, u)).rejects.toThrow("Not eligible: ≥ 20 shifts (you have 19 shifts)");
    expect((await inviteRow(inv.id))!.status).toBe("PENDING");
    expect(await testPrisma.familyMember.findUnique({ where: { userId: u } })).toBeNull();
  });

  it("accepting two families at once yields one membership; the other invite stays PENDING", async () => {
    const a = await famWith(); const b = await famWith();
    const u = await joiner();
    const ia = await invite(a.bossId, u); const ib = await invite(b.bossId, u);
    const rs = await Promise.allSettled([acceptInvite(ia.id, u), acceptInvite(ib.id, u)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(BUSY_OR("You are already in a family."));
    expect(await testPrisma.familyMember.count({ where: { userId: u } })).toBe(1);
    expect((await testPrisma.familyInvite.findMany({ where: { inviteeId: u } })).map((i) => i.status).sort()).toEqual(["ACCEPTED", "PENDING"]);
  });

  it("two invitees racing for the last seat: one joins, the other gets 'Family is full.'", async () => {
    const { family, bossId } = await famWith([{ role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }, { role: "SOLDIER" }]); // 5 of 6
    const a = await joiner(); const b = await joiner();
    const invs = [await invite(bossId, a), await invite(bossId, b)];
    const rs = await Promise.allSettled([acceptInvite(invs[0].id, a), acceptInvite(invs[1].id, b)]);
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id } })).toBe(6);
    const lost = rs.findIndex((r) => r.status === "rejected");
    expect((rs[lost] as PromiseRejectedResult).reason.message).toBe("Family is full.");
    expect((await inviteRow(invs[lost].id))!.status).toBe("PENDING");
  });

  it("decline marks DECLINED with slot = id, once", async () => {
    const { bossId } = await famWith();
    const u = await joiner();
    const inv = await invite(bossId, u);
    expect(await declineInvite(inv.id, u)).toMatchObject({ status: "DECLINED", slot: inv.id });
    await expect(declineInvite(inv.id, u)).rejects.toThrow("Invite expired.");
  });
});

describe("leave and kick (6.4)", () => {
  it("leave deletes the row, writes FamilyExit LEFT and deletes the leaver's pending invites", async () => {
    const { family, ids: [capo] } = await famWith([{ role: "CAPO" }]);
    await invite(capo, await joiner());
    await leaveFamily(capo);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: capo } })).toBeNull();
    expect(await testPrisma.familyExit.findFirst({ where: { userId: capo } })).toMatchObject({ familyId: family.id, reason: "LEFT", wasBoss: false });
    expect(await testPrisma.familyInvite.count({ where: { inviterId: capo } })).toBe(0);
  });

  it("a Boss with members cannot leave; a solo Boss is pointed to disband", async () => {
    const { bossId } = await famWith([{ role: "SOLDIER" }]);
    await expect(leaveFamily(bossId)).rejects.toThrow("Hand over the chair first (`!crew handover <user>`).");
    const solo = await famWith();
    await expect(leaveFamily(solo.bossId)).rejects.toThrow("You're the only member. Leaving would disband the family: use `!crew disband`.");
  });

  it("a hook's memberExitBlock refuses leave and kick, inside the transaction", async () => {
    const { bossId, ids: [s] } = await famWith([{ role: "SOLDIER" }]);
    const kinds: string[] = [];
    FAMILY_HOOKS.push({ key: "t", memberExitBlock: async (tx, ctx) => { await tx.family.findUnique({ where: { id: ctx.familyId } }); kinds.push(ctx.kind); return "You are seated in a live caper."; } });
    try {
      await expect(leaveFamily(s)).rejects.toThrow("You are seated in a live caper.");
      await expect(kickMember(bossId, s)).rejects.toThrow("You are seated in a live caper.");
    } finally { FAMILY_HOOKS.pop(); }
    expect(kinds).toEqual(["LEFT", "KICKED"]);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: s } })).not.toBeNull();
  });

  it("a retried leave re-runs the block", async () => {
    const { ids: [s] } = await famWith([{ role: "SOLDIER" }]);
    let calls = 0;
    FAMILY_HOOKS.push({ key: "t", memberExitBlock: async () => { if (++calls === 1) throw new VaultBusy(); return "Blocked now."; } });
    try { await expect(leaveFamily(s)).rejects.toThrow("Blocked now."); } finally { FAMILY_HOOKS.pop(); }
    expect(calls).toBe(2);
  });

  it("kick follows the rank table, writes FamilyExit KICKED and runs onMemberExit inside the transaction", async () => {
    const { ids: [capo, capo2, s1, s2] } = await famWith([{ role: "CAPO" }, { role: "CAPO" }, { role: "SOLDIER" }, { role: "SOLDIER" }]);
    const kinds: string[] = [];
    FAMILY_HOOKS.push({ key: "t", onMemberExit: async (_tx, ctx) => { kinds.push(ctx.kind); } });
    try {
      await expect(kickMember(capo, capo2)).rejects.toThrow("You don't have permission to do that.");
      await kickMember(capo, s1);
    } finally { FAMILY_HOOKS.pop(); }
    expect(kinds).toEqual(["KICKED"]);
    expect(await testPrisma.familyExit.findFirst({ where: { userId: s1 } })).toMatchObject({ reason: "KICKED" });
    FAMILY_HOOKS.push({ key: "t", onMemberExit: async () => { throw new FamilyError("hook failed"); } });
    try { await expect(kickMember(capo, s2)).rejects.toThrow("hook failed"); } finally { FAMILY_HOOKS.pop(); }
    expect(await testPrisma.familyMember.findUnique({ where: { userId: s2 } })).not.toBeNull();
  });

  it("expireInvites moves past-due PENDING to EXPIRED with slot = id, once", async () => {
    const now = new Date();
    const { bossId } = await famWith();
    const inv = await invite(bossId, await joiner(), daysAgo(2, now));
    const [a, b] = await Promise.all([expireInvites(now), expireInvites(now)]);
    expect(a.length + b.length).toBe(1);
    expect(await inviteRow(inv.id)).toMatchObject({ status: "EXPIRED", slot: inv.id });
  });
});
```

Every expected message string above is the exact copy.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/family-membership.race.test.ts`
Expected: FAIL in the new blocks only.

- [ ] **Step 3: Implement `membershipService.ts`**

- `inviteMember`: `isCrimeFamilyOpen` is checked by callers (command/handler), not here. Inviter via `requireMembership`, `can(inviter, "invite")` (false → `"You don't have permission to do that."`, the one permission refusal every service uses), not jailed; invitee checks (self, member of this family, member of any family). Transaction: `touchFamily`; count PENDING for family (`< maxPendingInvites`, else `"Too many pending invites (max 5)."`), ACCEPTED by inviter with `resolvedAt ≥ now − 7d` (`< acceptedInvitesPerInviterPer7d`, else `"You can bring in 3 members per 7 days."`), ACCEPTED for family in 7 d (`< joinsPerFamilyPer7d`, else `"Your family can take 5 new members per 7 days."`); numbers in the copy come from config; `familyInvite.create({ status: "PENDING", slot: "PENDING", expiresAt: now + inviteTtlSeconds, guildId, channelId })`. Outside: `FamilyInvite_familyId_inviteeId_slot_key` P2002 → `"Already invited."`.
- `acceptInvite`: only `invite.inviteeId === uid` (else `"This invite is not for you."`); jail check; outer loop of at most 3 runs that retries only on `isUniqueViolation(err, "FamilyMember_familyId_seat_key")`; inside `runFamilyTx`: invite CAS (spec 6.4 step 1; `count 0` → `"Invite expired."`), gate (`throw eligibilityError(failures)`, which rolls the CAS back), re-check the 7-day caps, lowest free seat ≤ `levelDef(level).memberCap` (none → `"Family is full."`), `familyMember.create({ role: "SOLDIER", roleSlot: uid, seat })`, `touchFamily`. `FamilyMember_userId_key` P2002 → `"You are already in a family."`.
- `leaveFamily`: Boss with others → `"Hand over the chair first (\`!crew handover <user>\`)."`; solo Boss → `"You're the only member. Leaving would disband the family: use \`!crew disband\`."` (P8); transaction: `touchFamily`, then every `FAMILY_HOOKS[].memberExitBlock(tx, ctx)` (a string → `throw new FamilyError(it)`; inside the callback, so a retry re-checks), `familyMember.deleteMany({ where: { userId, familyId } })` (`count === 1`), `familyExit.create({ reason: "LEFT" })`, `familyInvite.deleteMany({ where: { inviterId: uid, status: "PENDING" } })`, hooks' `onMemberExit`.
- `kickMember`: `can(actor, "kick", now, target)` re-read inside the transaction, not self; same transaction shape (blocks after `touchFamily`) with `reason: "KICKED"`.
- `declineInvite`: CAS PENDING → `{ status: "DECLINED", slot: id, resolvedAt: now }`; `count 0` → `"Invite expired."`.
- `expireInvites`: find PENDING with `expiresAt ≤ now`; per row CAS `updateMany({ id, status: "PENDING" }) → { status: "EXPIRED", slot: id, resolvedAt: now }`; return the rows whose CAS won.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$VT test/anticheat/family-membership.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/membershipService.ts test/anticheat/family-membership.race.test.ts
git commit -m "feat(crime-families): invite, accept, decline, leave and kick with race tests"
```

---

### Task 8: Ranks, the chair and succession

**Files:**
- Create: `src/services/crimeFamily/chairService.ts`
- Test: append to `test/anticheat/family-membership.race.test.ts`; `test/crimeFamily/heir.test.ts`

**Interfaces:**
- Consumes: `can`, `nextRoleUp/Down`, `CAPO_SLOTS`, `runFamilyTx`, `touchFamily`, `isUniqueViolation`.
- Produces:
  - `promoteMember(actorId: string, targetId: string, now?: Date): Promise<{ family: Family; newRole: FamilyRole }>`; `demoteMember(...)` same shape
  - `handOverChair(bossId: string, targetId: string, now?: Date): Promise<{ family: Family; oldBossId: string; newBossId: string }>`
  - `claimChair(familyId: string, claimerId: string, now?: Date): Promise<{ family: Family; oldBossId: string; newBossId: string }>`
  - `pickHeir(members: FamilyMember[], now: Date): FamilyMember | null`
  - `autoHandover(familyId: string, now: Date): Promise<{ family: Family; oldBossId: string; newBossId: string } | null>`
  - `markClaimNotice(familyId: string, bossId: string): Promise<boolean>`; `clearClaimNotice(familyId: string, bossId: string): Promise<boolean>` (P22: CAS `claimNoticeFor: bossId` → `""`, true when it won); `setClaimMessage(familyId: string, channelId: string, messageId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/heir.test.ts
import { describe, it, expect } from "vitest";
import { pickHeir } from "../../src/services/crimeFamily/chairService";

const now = new Date("2026-11-04T00:00:00Z");
const m = (userId: string, role: string, joinedDaysAgo: number, activeDaysAgo: number, capers = 0) =>
  ({ userId, role, joinedAt: new Date(+now - joinedDaysAgo * 864e5), lastActiveAt: new Date(+now - activeDaysAgo * 864e5), capers }) as any;

describe("pickHeir (6.7)", () => {
  it("prefers the Underboss, then the earliest Capo, then the Soldier with most capers", () => {
    expect(pickHeir([m("b", "BOSS", 90, 20), m("u", "UNDERBOSS", 10, 1), m("c", "CAPO", 50, 1)], now)!.userId).toBe("u");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("c1", "CAPO", 20, 1), m("c2", "CAPO", 40, 1)], now)!.userId).toBe("c2");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("s1", "SOLDIER", 40, 1, 3), m("s2", "SOLDIER", 10, 1, 9)], now)!.userId).toBe("s2");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("s1", "SOLDIER", 40, 1, 5), m("s2", "SOLDIER", 10, 1, 5)], now)!.userId).toBe("s1");
  });
  it("skips heirs inactive for more than 7 days; nobody → null", () => {
    expect(pickHeir([m("b", "BOSS", 90, 20), m("u", "UNDERBOSS", 10, 8), m("c", "CAPO", 50, 2)], now)!.userId).toBe("c");
    expect(pickHeir([m("b", "BOSS", 90, 20), m("u", "UNDERBOSS", 10, 8)], now)).toBeNull();
  });
});
```

Append to `family-membership.race.test.ts`:
- "promotions fill CAPO1, CAPO2, CAPO3, then 'Capo seats are full.'"
- "three concurrent Soldier → Capo promotions take CAPO1..3 once each" (`Promise.allSettled`, then `roleSlot`s sorted equal `["CAPO1","CAPO2","CAPO3"]`)
- "two concurrent promotions to Underboss: one wins; the other reads 'The Underboss seat is taken.'"
- "an Underboss can promote Soldier → Capo but not Capo → Underboss"
- "demote Capo → Soldier sets roleSlot to the member's uid"
- "handover moves bossId and makes the old Boss a Soldier with roleSlot = old uid"
- "claim works after 7 days of Boss inactivity and is refused at 6 ('The Boss is still active.')"
- "autoHandover at 14 days seats the heir as BOSS; nobody qualified → null and nothing changes"

and these two in code (the pre-check read is pinned so the patch fires on the right call):

```ts
it("claim vs a returning Boss: the in-transaction re-read sees the return → 'The Boss is back.'", async () => {
  const bossId = await seedEligibleUser(); const ub = await seedEligibleUser();
  const f = await seedFamily({ bossId, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(20) }] });
  await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: daysAgo(8) } });
  // claimChair's pre-check reads the Boss with prisma.familyMember.findUnique({ where: { userId: family.bossId } }) on the
  // global client; the in-transaction re-read uses tx.familyMember.findUnique, a different delegate the patch does not touch.
  const delegate = prisma.familyMember as any;
  const original = delegate.findUnique;
  let first = true;
  delegate.findUnique = async (args: any) => {
    const snapshot = await original.call(delegate, args);
    if (first && args?.where?.userId === bossId) {
      first = false;
      await testPrisma.familyMember.update({ where: { userId: bossId }, data: { lastActiveAt: new Date() } });
    }
    return snapshot;                                   // stale: still 8 days ago
  };
  try { await expect(claimChair(f.id, ub)).rejects.toThrow("The Boss is back."); } finally { delegate.findUnique = original; }
  expect(first).toBe(false);
  expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.bossId).toBe(bossId);
});

it("markClaimNotice is true once per inactivity episode; clearClaimNotice opens the next one", async () => {
  const f = await seedFamily({ bossId: await seedEligibleUser() });
  expect(await markClaimNotice(f.id, f.bossId)).toBe(true);
  expect(await markClaimNotice(f.id, f.bossId)).toBe(false);
  expect(await clearClaimNotice(f.id, f.bossId)).toBe(true);
  expect(await clearClaimNotice(f.id, f.bossId)).toBe(false);
  expect(await markClaimNotice(f.id, f.bossId)).toBe(true);
});
```

(Add `import prisma from "../../src/utils/prisma"` and the `chairService` imports to the file.)

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/heir.test.ts test/anticheat/family-membership.race.test.ts`
Expected: FAIL in the new tests.

- [ ] **Step 3: Implement `chairService.ts`**

Every rank change is one `runFamilyTx` that calls `touchFamily` first, re-reads the actor's and target's rows, checks `can`, and writes the new slot: Capo = lowest of `CAPO_SLOTS` not held (read inside the transaction; none → `"Capo seats are full."`), Underboss = `"UNDERBOSS"` (held → `"The Underboss seat is taken."`), Soldier = the member's `userId`. A P2002 is mapped outside the transaction. Chair moves (`handOverChair`, `claimChair`, `autoHandover`) share one private `moveChair(tx, family, oldBossId, newBossId)`: CAS `family.updateMany({ where: { id, bossId: oldBossId }, data: { bossId: newBossId } })` (`count 0` → `"The chair already changed hands."`), then old Boss → `{ role: "SOLDIER", roleSlot: oldBossId }`, then heir → `{ role: "BOSS", roleSlot: "BOSS" }` (this order never collides, spec 6.7). `claimChair` re-reads the Boss's `lastActiveAt` inside the transaction and refuses with `"The Boss is back."` when `> now − claimChairAfterSeconds`; before the transaction, `prisma.familyMember.findUnique({ where: { userId: family.bossId } })` (global client, exactly this call) showing a Boss active within 7 days gives `"The Boss is still active."`. `clearClaimNotice` = CAS `family.updateMany({ where: { id, claimNoticeFor: bossId }, data: { claimNoticeFor: "" } })`. `markClaimNotice` = CAS `family.updateMany({ where: { id, claimNoticeFor: { not: bossId } }, data: { claimNoticeFor: bossId } })`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$VT test/crimeFamily/heir.test.ts test/anticheat/family-membership.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/chairService.ts test/crimeFamily/heir.test.ts test/anticheat/family-membership.race.test.ts
git commit -m "feat(crime-families): ranks, chair hand-over, claim and succession heir"
```

---

### Task 9: The vault: spend, earnings credit, arrears, deposits, dues and rename

**Files:**
- Create: `src/services/crimeFamily/vaultService.ts`
- Modify: `src/services/crimeFamily/familyService.ts` (add `renameFamily`), `src/services/crimeFamily/views.ts` (add `VaultView`)
- Test: `test/anticheat/family-vault.race.test.ts`

**Interfaces:**
- Consumes: `debitWalletInTx`, `runFamilyTx`, `touchFamily`, `writeLedger`, `VaultShort`, `VaultBusy`, `requireMembership`, `checkJailStatus`.
- Produces: `spendFromVault`, `creditEarnings`, `utcDayKey` (Seams block) and
  - `retryArrears(tx, familyId: string, actorId: string): Promise<boolean>`
  - `depositToVault(uid: string, amount: number, now?: Date): Promise<{ amount: number; tax: number; net: number; leftToday: number }>`
  - `depositMaxFor(uid: string, now: Date): Promise<number>` (P21: `min(wallet, depositDailyCap − (depositDayKey === utcDayKey(now) ? depositedToday : 0))`; what `all`/`max`/`allin` deposit) and `resolveDepositAmount(uid: string, raw: string, now: Date): Promise<number | null>` (`all`/`max`/`allin`, case-insensitive → `depositMaxFor`; else `parsePositiveAmount(raw, Number.MAX_SAFE_INTEGER)`; `null` means "Enter a positive amount like 250k or 5m"), used by both the Deposit modal (Task 16) and `!crew deposit` (Task 18)
  - `chargeDues(familyId: string, now: Date): Promise<{ status: "charged" | "missed" | "skipped"; firstMiss: boolean }>`
  - `renameFamily(bossId: string, rawName: string, now?: Date): Promise<Family>` (in `familyService.ts`)
  - `getVaultView(familyId: string, viewerId: string, now: Date): Promise<VaultView>`; this task adds `VaultView` to `views.ts`: `VaultView { familyId; tag; treasury; earnings; level; duesPerDay; duesArrears; arrearsOwed; lastPaydayAt; nextPaydayAt; ledger: LedgerLine[]; canOfficer: boolean }`. Task 10 adds `payday: PaydayPreview` (filled by `previewPayday`) and Task 11 adds `levelUp: { next: FamilyLevelDef | null; blockers: string[] }` (filled by `levelUpBlockers`) to the type and to `getVaultView`; S6 (Task 15) reads the complete type.

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/family-vault.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { spendFromVault, creditEarnings, depositToVault, depositMaxFor, resolveDepositAmount, chargeDues, utcDayKey } from "../../src/services/crimeFamily/vaultService";
import { runFamilyTx, VaultShort } from "../../src/services/crimeFamily/tx";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("spendFromVault (7.1)", () => {
  it("draws earnings first, then treasury, and records the split", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), treasury: 1_000, earnings: 300 });
    expect(await runFamilyTx((tx) => spendFromVault(tx, f.id, 500, "level_fee", "x", {}))).toEqual({ fromTreasury: 200, fromEarnings: 300 });
    expect(await fam(f.id)).toMatchObject({ treasury: 800, earnings: 0 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "level_fee" } })).toMatchObject({ amount: -500, treasuryAfter: 800, earningsAfter: 0, meta: { fromTreasury: 200, fromEarnings: 300 } });
  });
  it("earningsOnly refuses even with a full treasury; overspend changes nothing", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), treasury: 9e6, earnings: 100 });
    await expect(runFamilyTx((tx) => spendFromVault(tx, f.id, 200, "bid_escrow", "x", {}, { earningsOnly: true }))).rejects.toBeInstanceOf(VaultShort);
    await expect(runFamilyTx((tx) => spendFromVault(tx, f.id, 9_000_101, "level_fee", "x", {}))).rejects.toBeInstanceOf(VaultShort);
    expect(await fam(f.id)).toMatchObject({ treasury: 9e6, earnings: 100 });
  });
});

describe("creditEarnings and arrears (7.4)", () => {
  it("credits earnings and XP, then clears arrears it can afford", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), level: 2, duesArrears: 2 });
    const r = await runFamilyTx((tx) => creditEarnings(tx, f.id, 500_000, "caper_cut", "system", {}, { xp: 90 }));
    expect(r).toEqual({ earningsAfter: 340_000, arrearsCleared: true });
    expect(await fam(f.id)).toMatchObject({ earnings: 340_000, xp: 90, duesArrears: 0 });
  });
});

describe("deposits (7.2)", () => {
  it("taxes 5% inline even under Tax Shield and locks the rest in treasury", async () => {
    const boss = await seedEligibleUser({ wallet: 2_000_000 });
    const f = await seedFamily({ bossId: boss });
    await testRedis().set(`tax_shield:${boss}`, JSON.stringify({ active: true }), "EX", 600);
    expect(await depositToVault(boss, 1_000_000)).toMatchObject({ tax: 50_000, net: 950_000 });
    expect(await wallet(boss)).toBe(1_000_000);
    expect(await fam(f.id)).toMatchObject({ treasury: 950_000, earnings: 0 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "deposit_tax" } })).toMatchObject({ amount: 0, meta: { burned: 50_000 } });
  });
  it("refuses under the minimum, a non-integer, a jailed member and a non-member", async () => {
    const boss = await seedEligibleUser({ wallet: 1_000_000 });
    await seedFamily({ bossId: boss });
    await expect(depositToVault(boss, 9_999)).rejects.toThrow("Minimum deposit is 10,000.");
    await expect(depositToVault(boss, 20_000.5)).rejects.toThrow("Deposit a whole number of fortunes.");
    await expect(depositToVault(boss, 0)).rejects.toThrow("Minimum deposit is 10,000.");
    const jailed = await seedEligibleUser({ wallet: 1_000_000, jailedUntil: new Date(Date.now() + 3600_000) });
    await seedFamily({ bossId: jailed });
    await expect(depositToVault(jailed, 50_000)).rejects.toThrow(/jail/i);
    await expect(depositToVault(await seedEligibleUser({ wallet: 1_000_000 }), 50_000)).rejects.toThrow("You are not in a crime family.");
    expect(await wallet(boss)).toBe(1_000_000);
  });
  it("depositMaxFor clamps 'all' to what is left of today's cap (P21)", async () => {
    const boss = await seedEligibleUser({ wallet: 40_000_000 });
    await seedFamily({ bossId: boss });
    const day = new Date("2026-11-04T10:00:00Z");
    expect(await depositMaxFor(boss, day)).toBe(25_000_000);
    expect(await resolveDepositAmount(boss, "ALL", day)).toBe(25_000_000);
    expect(await resolveDepositAmount(boss, "2.5k", day)).toBe(2_500);
    expect(await resolveDepositAmount(boss, "-5m", day)).toBeNull();
    await depositToVault(boss, 20_000_000, day);
    expect(await depositMaxFor(boss, day)).toBe(5_000_000);
    expect(await depositMaxFor(boss, new Date("2026-11-05T00:01:00Z"))).toBe(20_000_000);   // wallet now 20M
  });
  it("enforces the 25,000,000 daily cap and resets on the next UTC day", async () => {
    const boss = await seedEligibleUser({ wallet: 60_000_000 });
    const f = await seedFamily({ bossId: boss });
    const day = new Date("2026-11-04T10:00:00Z");
    await depositToVault(boss, 20_000_000, day);
    await expect(depositToVault(boss, 6_000_000, day)).rejects.toThrow("Daily deposit cap reached (5,000,000 left today).");
    await expect(depositToVault(boss, 6_000_000, new Date("2026-11-05T00:01:00Z"))).resolves.toMatchObject({ amount: 6_000_000 });
  });
  it("two deposits racing the cap: one lands, nothing is debited for the other", async () => {
    const boss = await seedEligibleUser({ wallet: 30_000_000 });
    await seedFamily({ bossId: boss });
    const rs = await Promise.allSettled([depositToVault(boss, 13_000_000), depositToVault(boss, 13_000_000)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await wallet(boss)).toBe(17_000_000);
  });
  it("a deposit racing a wallet drain never overdraws", async () => {
    const boss = await seedEligibleUser({ wallet: 1_000_000 });
    const f = await seedFamily({ bossId: boss });
    // depositToVault's membership read is getMembership → prisma.familyMember.findUnique({ where: { userId } }) on the global client.
    const delegate = prisma.familyMember as any;
    const original = delegate.findUnique;
    let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first && args?.where?.userId === boss) { first = false; await testPrisma.wallet.update({ where: { userId: boss }, data: { balance: 0 } }); }
      return snapshot;
    };
    try { await expect(depositToVault(boss, 500_000)).rejects.toThrow("Insufficient funds."); } finally { delegate.findUnique = original; }
    expect(first).toBe(false);
    expect(await wallet(boss)).toBe(0);
    expect(await fam(f.id)).toMatchObject({ treasury: 0 });
  });
});

describe("dues (7.4)", () => {
  it("charges once per UTC day across 24 runs and counts misses", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), level: 3, earnings: 150_000 });
    const day = new Date("2026-11-05T00:10:00Z");
    const runs = await Promise.allSettled(Array.from({ length: 24 }, (_, h) => chargeDues(f.id, new Date(+day + h * 3600_000 - 1))));
    const ok = runs.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof chargeDues>>> => r.status === "fulfilled").map((r) => r.value.status);
    expect(ok.filter((s) => s === "charged")).toHaveLength(1);
    expect(ok.every((s) => s === "charged" || s === "skipped")).toBe(true);
    for (const r of runs) if (r.status === "rejected") expect(r.reason.message).toBe("Vault busy, try again.");
    expect((await fam(f.id))!.earnings).toBe(30_000);
    expect(await chargeDues(f.id, new Date("2026-11-06T00:10:00Z"))).toEqual({ status: "missed", firstMiss: true });
    expect(await chargeDues(f.id, new Date("2026-11-07T00:10:00Z"))).toEqual({ status: "missed", firstMiss: false });
    expect(await fam(f.id)).toMatchObject({ duesArrears: 2, duesDayKey: "2026-11-07" });
  });
});

describe("renameFamily (6.2)", () => {
  it("is Boss-only, once per 30 days, and paid earnings-first", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 3_000_000 });
    await expect(renameFamily(boss, "New Name")).rejects.toThrow("You can rename once every 30 days.");
    await testPrisma.family.update({ where: { id: f.id }, data: { lastRenamedAt: daysAgo(31) } });
    expect(await renameFamily(boss, "New Name")).toMatchObject({ name: "New Name", nameKey: "new name", earnings: 1_000_000, tag: f.tag });
  });
  it("a taken name rolls back with no charge", async () => {
    const a = await seedFamily({ bossId: await seedEligibleUser(), name: "Taken Name", tag: "TKN" });
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 3_000_000, tag: "NEW" });
    await testPrisma.family.update({ where: { id: f.id }, data: { lastRenamedAt: daysAgo(31) } });
    await expect(renameFamily(boss, "taken name")).rejects.toThrow("Name taken.");
    expect((await fam(f.id))!.earnings).toBe(3_000_000);
    expect(a.name).toBe("Taken Name");
  });
});
```

(Import `renameFamily` from `../../src/services/crimeFamily/familyService` at the top of the file.)

(`seedFamily` sets `duesDayKey: ""`, so the first run of the test day charges.)

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/family-vault.race.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `vaultService.ts`**

- `spendFromVault`: exactly spec 7.1 steps 1–5 (read inside `tx`; CAS on `{ id, treasury: T, earnings: E }`; `count 0` → `throw new VaultBusy()`; ledger meta merges `fromTreasury`, `fromEarnings`).
- `creditEarnings`: `tx.family.update({ earnings: { increment }, xp: { increment: opts.xp ?? 0 } })` returns the row → `writeLedger({ amount, meta: { ...meta, xp } })` → `retryArrears`.
- `retryArrears`: if `duesArrears > 0`, owed = `duesArrears × duesPerLevel × level`; try `spendFromVault(tx, id, owed, "dues", actorId, { arrearsDays })`, then CAS `family.updateMany({ where: { id, duesArrears: <read> }, data: { duesArrears: 0 } })`; catch only `VaultShort` (thrown before any write) and return false.
- `depositToVault(uid, amount, now)`: membership through `getMembership` (its pinned first read), not jailed, then in this order: `!Number.isInteger(amount)` → `"Deposit a whole number of fortunes."`; `leftToday === 0 || amount > leftToday` → the cap message (so a clamped `all` of 0 with nothing left says "Daily deposit cap reached (0 left today)."); `amount < depositMin` → `"Minimum deposit is 10,000."`; `runFamilyTx` with spec 7.2 steps 1–6 (`debitWalletInTx(tx, uid, amount, "family_vault_deposit", { familyId, tax })`; the day-cap CAS on the member row with `utcDayKey(now)`, filtered on `familyId` too (`count 0` → re-read the member: gone → `"You are not in a crime family."`, a disband committed first; else the cap message); `family.update({ treasury: { increment: amount − tax } })`; member `deposited` increment; ledger `deposit` (`amount − tax`) and `deposit_tax` (`0`, `meta.burned`); `retryArrears`). Cap miss message: `` `Daily deposit cap reached (${left.toLocaleString("en-US")} left today).` ``.
- `chargeDues`: spec 7.4 transaction; `firstMiss` = the arrears were 0 before the increment.
- `getVaultView`: amounts from the family row, `arrearsOwed = duesArrears × duesPerLevel × level`, `nextPaydayAt = lastPaydayAt + paydayIntervalSeconds`, last `vaultLedgerLines` rows.
- `renameFamily` (in `familyService.ts`): Boss check (`family.bossId === bossId`) → `checkFamilyName` → `runFamilyTx`: CAS `family.updateMany({ where: { id, lastRenamedAt: { lte: now − renameCooldownSeconds } }, data: { name, nameKey, lastRenamedAt: now } })` (`count 0` → `FamilyError("You can rename once every 30 days.")`), then `spendFromVault(tx, id, renameFee, "rename_fee", bossId, { from, to })`. Outside, `isUniqueViolation(err, "Family_nameKey_key")` → `"Name taken."`.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/anticheat/family-vault.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/vaultService.ts src/services/crimeFamily/familyService.ts src/services/crimeFamily/views.ts test/anticheat/family-vault.race.test.ts
git commit -m "feat(crime-families): two-bucket vault, deposits, dues and arrears"
```

---

### Task 10: Payday

**Files:**
- Create: `src/services/crimeFamily/paydayService.ts`
- Modify: `src/services/crimeFamily/views.ts` (`PaydayPreview`, `VaultView.payday`), `src/services/crimeFamily/vaultService.ts` (`getVaultView` fills `payday`)
- Test: append `describe("payday (7.3)")` to `test/anticheat/family-vault.race.test.ts`

**Interfaces:**
- Consumes: `checkMemberEligibility(uid, "payday")`, `creditWalletInTx`, `afterEarnedCredit`, `runFamilyTx`, `writeLedger`, `can`.
- Produces:
  - `splitPayday(earnings: number, count: number): { gross: number; tax: number; net: number }` (pure; `gross = min(floor(E / N), paydayGrossCap)`, `tax = floor(gross × vaultTaxRate)`)
  - `PaydayPreview { familyId: string; earnings: number; count: number; split: { gross: number; tax: number; net: number }; eligible: string[]; ineligible: { userId: string; reason: string }[]; dueAt: Date; lockedReason: string | null }`, added to `views.ts`; this task also adds `payday: PaydayPreview` to `VaultView` and fills it in `getVaultView`
  - `previewPayday(familyId: string, now?: Date): Promise<PaydayPreview>`
  - `PaydayPaid = { status: "paid"; family: Family; split; paid: { userId: string; credit: CreditResult }[]; ineligible: PaydayPreview["ineligible"]; clampedBack: number }`; `PaydayResult = PaydayPaid | { status: "changed"; reason: "Members changed." | "Earnings changed." | "Payday is not due yet."; preview: PaydayPreview }`
  - `executePayday(familyId: string, actorId: string, expected: { earnings: number; count: number } | null, now?: Date): Promise<PaydayResult>` (`actorId "system"` and `expected null` for auto payday)
  - `payMembersInTx(tx, family: Family, eligible: string[], earnings: number, actorId: string, now: Date): Promise<{ split; paid: { userId: string; credit: CreditResult }[]; clampedBack: number }>` (shared with disband)

- [ ] **Step 1: Write the failing tests**

```ts
// add to the file's imports:
import { vi, afterEach } from "vitest";
import { splitPayday, previewPayday, executePayday } from "../../src/services/crimeFamily/paydayService";
import { leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { questBus } from "../../src/services/questEvents";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";

const active = new Set<string>();
const rule = { key: "test", label: "test seats", need: 2, count: async (uid: string) => (active.has(uid) ? 2 : 0) };
async function payFam(earnings: number, o: { lastPaydayAt?: Date; newbie?: boolean; underboss?: boolean } = {}) {
  const bossId = await seedEligibleUser();
  const soldiers = [await seedEligibleUser(), await seedEligibleUser()];
  const newbie = o.newbie ? await seedEligibleUser() : null;
  const ub = o.underboss ? await seedEligibleUser() : null;
  for (const u of [bossId, ...soldiers, ...(ub ? [ub] : [])]) active.add(u);
  const members = [
    ...soldiers.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
    ...(newbie ? [{ userId: newbie, role: "SOLDIER" as const, joinedAt: daysAgo(3) }] : []),
    ...(ub ? [{ userId: ub, role: "UNDERBOSS" as const, joinedAt: daysAgo(10) }] : []),
  ];
  const family = await seedFamily({ bossId, earnings, lastPaydayAt: o.lastPaydayAt ?? daysAgo(8), members });
  return { family, bossId, soldiers, newbie, ub };
}
const expect3 = { earnings: 3_000_000, count: 3 };

describe("payday (7.3)", () => {
  beforeEach(() => { active.clear(); ACTIVITY_RULES.push(rule); });
  afterEach(() => { ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(rule), 1); });

  it("splits as 11.1 computes", () => {
    expect(splitPayday(4_081_532, 8)).toEqual({ gross: 510_191, tax: 25_509, net: 484_682 });
    expect(splitPayday(23_751_252, 12)).toEqual({ gross: 1_000_000, tax: 50_000, net: 950_000 });
  });

  it("pays eligible members equally, taxes inline and names the ineligible", async () => {
    const { family, bossId, soldiers, newbie } = await payFam(3_000_000, { newbie: true });
    const r = await executePayday(family.id, bossId, expect3);
    expect(r).toMatchObject({ status: "paid", split: { gross: 1_000_000, tax: 50_000, net: 950_000 }, clampedBack: 0 });
    for (const id of [bossId, ...soldiers]) expect(await wallet(id)).toBe(950_000);
    expect(await wallet(newbie!)).toBe(0);
    expect((r as any).ineligible).toEqual([{ userId: newbie, reason: expect.stringMatching(/7 days/) }]);
    const after = (await fam(family.id))!;
    expect(after.earnings).toBe(0);
    expect(Math.abs(+after.lastPaydayAt - Date.now())).toBeLessThan(60_000);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: family.id, type: "payday" } })).toMatchObject({ amount: -3_000_000 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: family.id, type: "payday_tax" } })).toMatchObject({ amount: 0, meta: { burned: 150_000 } });
    const w = await testPrisma.wallet.findUnique({ where: { userId: soldiers[0] } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: w!.id, type: "family_payday" } })).toMatchObject({ amount: 950_000, isEarned: true });
  });

  it("locks below 500,000 and with nobody eligible", async () => {
    const low = await payFam(499_999);
    expect((await previewPayday(low.family.id)).lockedReason).toBe("Earnings must reach 500,000.");
    await expect(executePayday(low.family.id, low.bossId, { earnings: 499_999, count: 3 })).rejects.toThrow("Earnings must reach 500,000.");
    const idle = await payFam(3_000_000);
    active.clear();
    expect((await previewPayday(idle.family.id)).lockedReason).toBe("Payday locked: nobody qualifies yet.");
    expect((await fam(idle.family.id))!.earnings).toBe(3_000_000);
  });

  it("is not due for 7 days after the last payday", async () => {
    const { family, bossId } = await payFam(3_000_000, { lastPaydayAt: daysAgo(6) });
    expect(await executePayday(family.id, bossId, expect3)).toMatchObject({ status: "changed", reason: "Payday is not due yet." });
    expect((await fam(family.id))!.earnings).toBe(3_000_000);
  });

  it("a double press pays once", async () => {
    const { family, bossId, soldiers } = await payFam(3_000_000);
    const rs = await Promise.allSettled([executePayday(family.id, bossId, expect3), executePayday(family.id, bossId, expect3)]);
    expect(rs.filter((r) => r.status === "fulfilled" && r.value.status === "paid")).toHaveLength(1);
    for (const id of [bossId, ...soldiers]) expect(await wallet(id)).toBe(950_000);
  });

  it("an earnings change between preview and confirm re-previews", async () => {
    const { family, bossId } = await payFam(3_000_000);
    await runFamilyTx((tx) => spendFromVault(tx, family.id, 1, "level_fee", "x", {}, { earningsOnly: true }));
    expect(await executePayday(family.id, bossId, expect3)).toMatchObject({ status: "changed", reason: "Earnings changed." });
    expect(await wallet(bossId)).toBe(0);
  });

  it("a member leaving between preview and confirm re-previews and is not paid", async () => {
    const { family, bossId, soldiers } = await payFam(3_000_000);
    await leaveFamily(soldiers[0]);
    expect(await executePayday(family.id, bossId, expect3)).toMatchObject({ status: "changed", reason: "Members changed." });
    expect(await wallet(soldiers[0])).toBe(0);
  });

  it("returns a clamped excess to earnings", async () => {
    const { family, bossId, soldiers } = await payFam(3_000_000);
    await testPrisma.wallet.update({ where: { userId: soldiers[0] }, data: { balance: MAX_SAFE_BALANCE - 100 } });
    expect(await executePayday(family.id, bossId, expect3)).toMatchObject({ status: "paid", clampedBack: 949_900 });
    expect((await fam(family.id))!.earnings).toBe(949_900);
  });

  it("refuses a Soldier and a demoted Underboss", async () => {
    const { family, soldiers, ub } = await payFam(3_000_000, { underboss: true });
    const exp4 = { earnings: 3_000_000, count: 4 };
    await expect(executePayday(family.id, soldiers[0], exp4)).rejects.toThrow("Only the Boss or Underboss can run payday.");
    await testPrisma.familyMember.update({ where: { userId: ub! }, data: { role: "SOLDIER", roleSlot: ub! } });
    await expect(executePayday(family.id, ub!, exp4)).rejects.toThrow("Only the Boss or Underboss can run payday.");
    expect((await fam(family.id))!.earnings).toBe(3_000_000);
  });

  it("emits economy:earn per paid member", async () => {
    const { family, bossId, soldiers } = await payFam(3_000_000);
    const emit = vi.spyOn(questBus, "emit");
    try {
      await executePayday(family.id, bossId, expect3);
      for (const id of [bossId, ...soldiers]) expect(emit).toHaveBeenCalledWith("economy:earn", { discordId: id, amount: 950_000 });
    } finally { emit.mockRestore(); }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/family-vault.race.test.ts`
Expected: FAIL in the payday block.

- [ ] **Step 3: Implement `paydayService.ts`**

`previewPayday` evaluates every member with `checkMemberEligibility(uid, "payday", { now })` (reason = first failure rendered `` `${need} (you have ${have})` ``, e.g. "≥ 7 days in the family (you have 3 days)"); `lockedReason` is `"Earnings must reach 500,000."` below `paydayMinEarnings`, else `"Payday locked: nobody qualifies yet."` with no eligible member, else `null`. `executePayday`: permission (`actorId === "system"` or `can(member, "payday")` re-read from the DB; refusal `"Only the Boss or Underboss can run payday."`) → a locked preview throws `FamilyError(lockedReason)` → `runFamilyTx(…, 5)`: recompute the eligible set; with `expected`, a different count returns `"Members changed."`; CAS `family.updateMany({ where: { id, earnings: E, lastPaydayAt: { lte: now − paydayIntervalSeconds } }, data: { earnings: E − gross × N, lastPaydayAt: now } })` (`count 0` → re-read: interval not elapsed → `"Payday is not due yet."`, else `"Earnings changed."`; these return, they do not throw, so nothing commits); then `payMembersInTx`: per member `creditWalletInTx(tx, uid, username, net, "family_payday", { familyId, gross, tax }, true)`, add `net − appliedAmount` back to earnings, ledger `payday` (`-gross × N`) and `payday_tax` (`0`, `meta.burned: tax × N`). After commit: `afterEarnedCredit` per paid member. Minimum earnings (`paydayMinEarnings`) and an empty eligible set lock manual and auto payday; disband's final payday skips the minimum.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/anticheat/family-vault.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/paydayService.ts src/services/crimeFamily/views.ts src/services/crimeFamily/vaultService.ts test/anticheat/family-vault.race.test.ts
git commit -m "feat(crime-families): capped, taxed, equal weekly payday"
```

---

### Task 11: XP, level-up and the leaderboard

**Files:**
- Create: `src/services/crimeFamily/progression.ts`, `src/services/crimeFamily/leaderboard.ts`
- Modify: `src/services/crimeFamily/views.ts` (`LeaderboardView`, `VaultView.levelUp`), `src/services/crimeFamily/vaultService.ts` (`getVaultView` fills `levelUp`)
- Test: `test/crimeFamily/progression.test.ts`

**Interfaces:**
- Consumes: `spendFromVault`, `writeLedger`, `levelDef`, `can`, `racketsHeldFor`.
- Produces: `awardFamilyXp` (Seams), `levelUpBlockers(family: Family): string[]` (pure: `"Max level."`, `"Needs 1,000 XP (have 400)."`, `"Clear dues arrears first."`), `levelUp(familyId: string, actorId: string, expectedLevel: number, now?: Date): Promise<{ family: Family; level: number; fee: number; fromTreasury: number; fromEarnings: number }>`, `LEADERBOARD_SORTS` (`{ key: "xp", label: "XP" }` by `Family.xp`, `{ key: "war", label: "War wins" }` by `Family.warWins`, ties by `createdAt`), `getLeaderboard(sortKey: string, viewerFamilyId: string | null): Promise<LeaderboardView>`, and this task adds to `views.ts` `LeaderboardView { sort: string; sorts: { key: string; label: string }[]; rows: { rank: number; familyId: string; tag: string; name: string; level: number; crestKey: string; members: number; rackets: number | null; value: number }[]; viewer: { rank: number; value: number } | null }` (`rackets` from one `racketsHeldFor(rowIds)` call, `null` with no provider, P23) and `levelUp: { next: FamilyLevelDef | null; blockers: string[] }` to `VaultView`. Permission refusal copy: `"Only the Boss or Underboss can level up."`.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/progression.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { levelUp, awardFamilyXp } from "../../src/services/crimeFamily/progression";
import { getLeaderboard } from "../../src/services/crimeFamily/leaderboard";
import { runFamilyTx } from "../../src/services/crimeFamily/tx";
import { FAMILY_HOOKS } from "../../src/services/crimeFamily/extensions";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });

describe("levelUp (10.1)", () => {
  it("L1 → L2 needs 1,000 XP and burns 2,000,000 earnings-first; XP is kept", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, xp: 1_200, earnings: 1_500_000, treasury: 1_000_000 });
    expect(await levelUp(f.id, boss, 1)).toMatchObject({ level: 2, fee: 2_000_000, fromEarnings: 1_500_000, fromTreasury: 500_000 });
    expect(await fam(f.id)).toMatchObject({ level: 2, xp: 1_200, earnings: 0, treasury: 500_000 });
  });

  it.each([
    ["xp short", { xp: 999 }, "Needs 1,000 XP (have 999)."],
    ["arrears", { xp: 2_000, duesArrears: 1 }, "Clear dues arrears first."],
    ["max", { level: 10, xp: 99_999 }, "Max level."],
  ] as const)("refuses %s", async (_n, seed, msg) => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 100_000_000, ...seed });
    await expect(levelUp(f.id, boss, f.level)).rejects.toThrow(msg);
    expect(await fam(f.id)).toMatchObject({ level: f.level, earnings: 100_000_000 });
  });

  it("refuses a Soldier and a stale expectedLevel, and pays once on a double press", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, xp: 5_000, earnings: 10_000_000, members: [{ userId: s, role: "SOLDIER" }] });
    await expect(levelUp(f.id, s, 1)).rejects.toThrow("Only the Boss or Underboss can level up.");
    await expect(levelUp(f.id, boss, 2)).rejects.toThrow("Level changed.");
    const rs = await Promise.allSettled([levelUp(f.id, boss, 1), levelUp(f.id, boss, 1)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(/^(Level changed\.|Vault busy, try again\.)$/);
    expect(await fam(f.id)).toMatchObject({ level: 2, earnings: 8_000_000 });
  });
});

describe("XP and leaderboard (10.2, 10.4)", () => {
  it("awardFamilyXp increments XP and writes an xp ledger row", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), xp: 100, treasury: 7, earnings: 9 });
    await runFamilyTx((tx) => awardFamilyXp(tx, f.id, 150, "caper_t1_clean", "u1", { caperId: "c" }));
    expect((await fam(f.id))!.xp).toBe(250);
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: f.id, type: "xp" } }))
      .toMatchObject({ actorId: "u1", amount: 0, treasuryAfter: 7, earningsAfter: 9, meta: { xp: 150, source: "caper_t1_clean", caperId: "c" } });
  });

  it("ranks the top 10 by XP and gives the viewer's rank outside it", async () => {
    const fams = [];
    for (let x = 1; x <= 12; x++) fams.push(await seedFamily({ bossId: await seedEligibleUser(), xp: x }));
    const v = await getLeaderboard("xp", fams[0].id);
    expect(v.rows).toHaveLength(10);
    expect(v.rows[0]).toMatchObject({ rank: 1, familyId: fams[11].id, value: 12, level: 1, members: 1, rackets: null });
    expect(v.viewer).toEqual({ rank: 12, value: 1 });
    expect(v.sorts).toEqual([{ key: "xp", label: "XP" }, { key: "war", label: "War wins" }]);
  });

  it("fills rackets from a racketsHeld hook (P23)", async () => {
    const f = await seedFamily({ bossId: await seedEligibleUser(), xp: 5 });
    FAMILY_HOOKS.push({ key: "t", racketsHeld: async (ids) => new Map(ids.map((id) => [id, 2])) });
    try { expect((await getLeaderboard("xp", f.id)).rows[0].rackets).toBe(2); } finally { FAMILY_HOOKS.pop(); }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/progression.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`levelUp`: permission re-read; `levelUpBlockers` fast-fail; `runFamilyTx`: CAS `family.updateMany({ where: { id, level: expectedLevel, xp: { gte: levelDef(L+1).xpToReach }, duesArrears: 0 }, data: { level: L + 1 } })` (`count 0` → re-read and throw the matching blocker, or `"Level changed."`), then `spendFromVault(tx, id, levelDef(L+1).fee, "level_fee", actorId, { to: L + 1 })`. `awardFamilyXp`: `xp: { increment }` + ledger `{ type: "xp", amount: 0, treasuryAfter, earningsAfter, meta: { xp, source } }`.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/progression.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/progression.ts src/services/crimeFamily/leaderboard.ts src/services/crimeFamily/views.ts src/services/crimeFamily/vaultService.ts test/crimeFamily/progression.test.ts
git commit -m "feat(crime-families): family XP, level-up and leaderboard"
```

---

### Task 12: Disband

**Files:**
- Create: `src/services/crimeFamily/disbandService.ts`
- Test: `test/anticheat/family-disband.race.test.ts`

**Interfaces:**
- Consumes: `FAMILY_HOOKS`, `payMembersInTx`, `checkMemberEligibility(uid, "payday")`, `writeLedger`, `runFamilyTx`, `afterEarnedCredit`.
- Produces: `previewDisband(familyId: string, now?: Date): Promise<{ finalPayday: PaydayPreview | null; burnTreasury: number; burnEarnings: number }>` (earnings include the sum of every `FAMILY_HOOKS[].disbandPreview(familyId).returnedToEarnings`, so S22 states the exact burn); `disbandFamily(bossId: string, typedTag: string, now?: Date): Promise<{ family: Family; formerMembers: string[]; paid: { userId: string; credit: CreditResult }[]; split: { gross: number; tax: number; net: number } | null; burned: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/family-disband.race.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { disbandFamily, previewDisband } from "../../src/services/crimeFamily/disbandService";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { depositToVault, creditEarnings } from "../../src/services/crimeFamily/vaultService";
import { FAMILY_HOOKS, ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { VaultBusy } from "../../src/services/crimeFamily/tx";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const burnRow = (familyId: string) => testPrisma.familyLedger.findFirst({ where: { familyId, type: "disband_burn" } });
const active = new Set<string>();
const rule = { key: "test", label: "test seats", need: 2, count: async (uid: string) => (active.has(uid) ? 2 : 0) };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(async () => { await resetFamilies(); active.clear(); ACTIVITY_RULES.push(rule); });
afterEach(() => { ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(rule), 1); });

async function disbandFam(o: { earnings: number; treasury: number; lastPaydayAt: Date }) {
  const bossId = await seedEligibleUser(); const s = await seedEligibleUser();
  active.add(bossId); active.add(s);
  const family = await seedFamily({ bossId, name: "Velvet Ante", tag: "VLA", ...o, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { family, bossId, s };
}

describe("disband (6.4)", () => {
  it("is Boss-only and needs the tag (trimmed, any case)", async () => {
    const bossId = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId, tag: "VLA", members: [{ userId: ub, role: "UNDERBOSS" }] });
    await expect(disbandFamily(ub, "VLA")).rejects.toThrow("Only the Boss can disband the family.");
    await expect(disbandFamily(bossId, "VLB")).rejects.toThrow("Type the tag exactly: VLA");
    expect(await testPrisma.family.count()).toBe(1);
    await expect(disbandFamily(bossId, " vla ")).resolves.toMatchObject({ family: { id: f.id } });
  });

  it("pays a final payday when 7 days have passed, without the 500,000 minimum, then burns the rest", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 300_000, treasury: 2_000_000, lastPaydayAt: daysAgo(8) });
    expect(await previewDisband(family.id)).toMatchObject({ finalPayday: { split: { gross: 150_000, tax: 7_500, net: 142_500 } }, burnTreasury: 2_000_000, burnEarnings: 0 });
    const r = await disbandFamily(bossId, "VLA");
    expect(r).toMatchObject({ split: { gross: 150_000, tax: 7_500, net: 142_500 }, burned: 2_000_000 });
    for (const id of [bossId, s]) expect(await wallet(id)).toBe(142_500);
    expect(await burnRow(family.id)).toMatchObject({ amount: -2_000_000 });
  });

  it("burns everything when the last payday was under 7 days ago (D61)", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 300_000, treasury: 2_000_000, lastPaydayAt: daysAgo(6) });
    expect(await previewDisband(family.id)).toMatchObject({ finalPayday: null, burnTreasury: 2_000_000, burnEarnings: 300_000 });
    expect(await disbandFamily(bossId, "VLA")).toMatchObject({ split: null, paid: [], burned: 2_300_000 });
    expect([await wallet(bossId), await wallet(s)]).toEqual([0, 0]);
    expect(await burnRow(family.id)).toMatchObject({ amount: -2_300_000 });
  });

  it("writes DISBANDED exits (wasBoss for the Boss), expires invites, deletes members and frees the name and tag", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 0, treasury: 0, lastPaydayAt: daysAgo(1) });
    const inv = await testPrisma.familyInvite.create({ data: { familyId: family.id, inviterId: bossId, inviteeId: "x", guildId: "g1", channelId: "c1", expiresAt: new Date(Date.now() + 864e5) } });
    const r = await disbandFamily(bossId, "VLA");
    expect([...r.formerMembers].sort()).toEqual([bossId, s].sort());
    const exits = await testPrisma.familyExit.findMany({ where: { familyId: family.id } });
    expect(Object.fromEntries(exits.map((e) => [e.userId, [e.reason, e.wasBoss]]))).toEqual({ [bossId]: ["DISBANDED", true], [s]: ["DISBANDED", false] });
    expect(await testPrisma.familyInvite.findUnique({ where: { id: inv.id } })).toMatchObject({ status: "EXPIRED", slot: inv.id });
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id } })).toBe(0);
    expect(await testPrisma.family.count()).toBe(0);
    expect(await testPrisma.audit.count({ where: { userId: bossId, type: "family_disband" } })).toBe(1);
    const founder = await seedEligibleUser({ wallet: 15_000_000 });
    await expect(createFamily({ uid: founder, username: "f", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" })).resolves.toMatchObject({ tagKey: "VLA" });
  });

  it("re-checks hook blocks on every attempt and runs onDisband before the final payday", async () => {
    const { family, bossId } = await disbandFam({ earnings: 0, treasury: 0, lastPaydayAt: daysAgo(8) });
    FAMILY_HOOKS.push({ key: "block", disbandBlock: async () => "A caper is in its lobby." });
    try { await expect(disbandFamily(bossId, "VLA")).rejects.toThrow("A caper is in its lobby."); } finally { FAMILY_HOOKS.pop(); }
    let calls = 0;
    FAMILY_HOOKS.push({ key: "flip", disbandBlock: async () => { if (++calls === 1) throw new VaultBusy(); return "A caper is in its lobby."; } });
    try { await expect(disbandFamily(bossId, "VLA")).rejects.toThrow("A caper is in its lobby."); } finally { FAMILY_HOOKS.pop(); }
    expect(calls).toBe(2);
    expect(await testPrisma.family.count()).toBe(1);
    FAMILY_HOOKS.push({
      key: "refund",
      disbandPreview: async () => ({ returnedToEarnings: 1_000_000 }),
      onDisband: (tx, c) => creditEarnings(tx, c.familyId, 1_000_000, "bid_refund", "system", {}).then(() => undefined),
    });
    try {
      expect((await previewDisband(family.id)).finalPayday?.split).toEqual({ gross: 500_000, tax: 25_000, net: 475_000 });
      expect((await disbandFamily(bossId, "VLA")).split).toEqual({ gross: 500_000, tax: 25_000, net: 475_000 });
    } finally { FAMILY_HOOKS.pop(); }
  });

  it("a disband racing a deposit: the disband commits; a deposit that won is burned, one that lost charges nothing", async () => {
    const { family, bossId, s } = await disbandFam({ earnings: 0, treasury: 500_000, lastPaydayAt: daysAgo(1) });
    await testPrisma.wallet.update({ where: { userId: s }, data: { balance: 2_000_000 } });
    const [d, dep] = await Promise.allSettled([disbandFamily(bossId, "VLA"), depositToVault(s, 1_000_000)]);
    expect(d.status).toBe("fulfilled");
    expect(await testPrisma.family.count()).toBe(0);
    expect(await testPrisma.familyMember.count({ where: { familyId: family.id } })).toBe(0);
    if (dep.status === "fulfilled") {
      expect((await burnRow(family.id))!.amount).toBe(-(500_000 + 950_000));
      expect(await wallet(s)).toBe(1_000_000);
    } else {
      expect(dep.reason.message).toMatch(/not in a crime family|Vault busy, try again\./);
      expect(await wallet(s)).toBe(2_000_000);
      expect((await burnRow(family.id))!.amount).toBe(-500_000);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/family-disband.race.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `disbandService.ts`**

Boss check (`"Only the Boss can disband the family."`), `typedTag.trim().toUpperCase() === family.tagKey` (else `` `Type the tag exactly: ${tag}` ``) → one `runFamilyTx(…, 5)`: `touchFamily`; every `disbandBlock(tx, familyId)` (a string → `throw new FamilyError(it)`; inside the callback so each retry re-checks, spec 17 edge 19); every `onDisband` (plan 3 returns escrow and releases rackets here); re-read the family; if `lastPaydayAt ≤ now − paydayIntervalSeconds` and the eligible set is non-empty, `payMembersInTx` (no minimum, D61); burn what remains (`disband_burn` with `amount: −(treasury + earnings)`, `Audit{type:"family_disband"}`); PENDING invites → EXPIRED with `slot = id`; one `FamilyExit{ reason: "DISBANDED", wasBoss }` per member; delete members; delete the family. After commit `afterEarnedCredit` per paid member. `previewDisband` computes the same numbers read-only, adding the hooks' `disbandPreview` amounts to earnings before the payday split.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/anticheat/family-disband.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/disbandService.ts test/anticheat/family-disband.race.test.ts
git commit -m "feat(crime-families): disband with capped final payday and full burn"
```

---

### Task 13: Activity throttle, the `family` DM type and its notices; tester and Redis-outage guarantees

**Files:**
- Create: `src/services/crimeFamily/activity.ts`
- Modify: `src/services/dmPrefsService.ts:14-25` (add `family` after `investment`), `src/services/dmNoticeService.ts` (Crime Families section), `test/dm/prefs.test.ts:20` and `test/dm/investment-notice.test.ts:38` (both pin `noticeTypesInGroup("account")`; the expected array becomes `["card", "market", "investment", "family"]`)
- Test: `test/dm/family-notice.test.ts`, `test/anticheat/family-redis-down.test.ts`, `test/anticheat/family-tester.test.ts`

**Interfaces:**
- Consumes: `redisService.getInstance` (raw ioredis `set(key, "1", "EX", ttl, "NX")`), `cfNoticeEmote` (Task 14; until then use `Mascot.Emotes.Gun` and switch in Task 14 Step 3), `noticeContainer` (`src/utils/componentsV2.ts:73-75`), `sendOptOutDm` (`src/services/dmNoticeService.ts:46-60`).
- Produces: `setNx`, `touchActivity`, `notifyMany` (Seams) and builders, each returning a `ContainerBuilder` with a text-only title and `-# … Manage these DMs with \`!settings\`` hint:
  - `familyInviteNotice(v: { familyLabel: string; inviterId: string; tag: string; expiresAt: Date; jumpUrl: string | null })` (body includes `` `!crew accept ${tag}` ``)
  - `familyRoleNotice(kind: "kicked" | "promoted" | "demoted" | "chair_claimed" | "chair_handed", v: { familyLabel: string; role?: FamilyRole; newBossId?: string })`
  - `familyPaydayNotice(v: { familyLabel: string; gross: number; tax: number; net: number })`, `familyMissedPaydayNotice(v: { familyLabel: string; reason: string })`
  - `familyArrearsNotice(v: { familyLabel: string; days: number; owed: number })`, `familyDisbandedNotice(v: { familyLabel: string; finalNet: number | null; burned: number })`

- [ ] **Step 1: Write the failing tests**

```ts
// test/dm/family-notice.test.ts
import { describe, it, expect } from "vitest";
import { DM_NOTICE_TYPES, isCooldownReminderType } from "../../src/services/dmPrefsService";
import { familyInviteNotice, notifyMany } from "../../src/services/dmNoticeService";
import { containerText, containerThumb, fakeDmClient } from "./helpers";
import { seedUser, testPrisma } from "../helpers";

describe("family DM notices (13.4)", () => {
  it("family is an account notice with no command", () => {
    expect(DM_NOTICE_TYPES.family).toEqual({ label: "Crime family", group: "account" });
    expect(isCooldownReminderType("family")).toBe(false);
  });
  it("the invite notice tells the player how to accept and links the card", () => {
    const c = familyInviteNotice({ familyLabel: "[VLA] Velvet Ante", inviterId: "1", tag: "VLA", expiresAt: new Date(Date.now() + 864e5), jumpUrl: "https://discord.com/channels/1/2/3" });
    expect(containerText(c)).toContain("!crew accept VLA");
    expect(containerText(c)).toContain("https://discord.com/channels/1/2/3");
  });
  it("uses the Gun emote as the thumbnail while no cf emoji is loaded", () => {
    expect(containerThumb(familyInviteNotice({ familyLabel: "x", inviterId: "1", tag: "VLA", expiresAt: new Date(), jumpUrl: null }))).toContain("1456729243399753752");
  });
  it("respects the family toggle", async () => {
    await seedUser("fam-dm-off", { disabledReminders: ["family"] } as any);
    await seedUser("fam-dm-on");
    const dm = fakeDmClient();
    await notifyMany(dm.client, "family", ["fam-dm-off", "fam-dm-on"], () => familyInviteNotice({ familyLabel: "x", inviterId: "1", tag: "VLA", expiresAt: new Date(), jumpUrl: null }));
    expect([...dm.sent.keys()]).toEqual(["fam-dm-on"]);
  });
});
```

`test/anticheat/family-redis-down.test.ts`: with `vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); })`: `setNx` returns `"error"`; `touchActivity` still writes `lastActiveAt`; `depositToVault`, `executePayday`, `createFamily`, `inviteMember`/`acceptInvite` succeed with correct balances. Also, with Redis up: a second `touchActivity` within the hour leaves `lastActiveAt` unchanged.

`test/anticheat/family-tester.test.ts`: with `seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000 })` (`src/utils/developerAccess.ts:3`): `createFamily` debits 10,000,000; `depositToVault` charges 5% and the daily cap; `executePayday` refuses before 7 days; a failing gate still fails. Plus a static assertion: no file under `src/services/crimeFamily/` contains `isTester` (`fs.readdirSync` + `readFileSync`).

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/dm/family-notice.test.ts test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts`
Expected: FAIL (`DM_NOTICE_TYPES.family` undefined, modules missing).

- [ ] **Step 3: Implement**

- `DM_NOTICE_TYPES.family = { label: "Crime family", group: "account" }` after `investment`; update the two pinned arrays in `test/dm/prefs.test.ts:20` and `test/dm/investment-notice.test.ts:38` to `["card", "market", "investment", "family"]`.
- `setNx`: `"OK"` → `"set"`, `null` → `"held"`, any throw → `"error"` (logged).
- `touchActivity(uid, now)`: `setNx("cf:active:" + uid, activityThrottleSeconds)`; on `"held"` return; else `familyMember.updateMany({ where: { userId: uid }, data: { lastActiveAt: now } })`; never throws.
- Notice builders call `noticeContainer(cfNoticeEmote(key), title, body, hint)` (`crest_1` for invites/roles/disband, `vault` for payday/arrears). `notifyMany` sends sequentially with `sendOptOutDm(client, id, type, build(id))`, one DM per id.

- [ ] **Step 4: Run them, plus the settings and DM suites**

Run: `$VT test/dm test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts`
Expected: PASS (settings panel still `< 35`).

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/activity.ts src/services/dmPrefsService.ts src/services/dmNoticeService.ts test/dm/prefs.test.ts test/dm/investment-notice.test.ts test/dm/family-notice.test.ts test/anticheat/family-redis-down.test.ts test/anticheat/family-tester.test.ts
git commit -m "feat(crime-families): family DM notices, activity throttle, tester and Redis-outage tests"
```

---

### Task 14: The `cf_` emoji family, generalised sync script and asset helpers

**Files:**
- Create: `src/utils/applicationEmojiNames.ts`, `src/utils/crimeFamilyAssets.ts`, `src/utils/applicationEmojiFamilies.ts`
- Modify: `src/utils/shopItemAssets.ts:5-24,103-118` (wrappers), `src/utils/emojiRegistry.ts:76-99` (managed-prefix skip), `src/scripts/syncShopApplicationEmojis.ts`, `package.json` (scripts), `src/services/dmNoticeService.ts` (use `cfNoticeEmote`)
- Test: `test/scripts/emoji-families.test.ts`

**Interfaces:**
- Consumes: `CF_SPRITES` (`src/data/sprites/cf/index.ts`), `findAsset` (`src/utils/assetPaths.ts:33`), `emojiInline` (`src/utils/emojiRegistry.ts:138`).
- Produces:
  - `applicationEmojiNames.ts`: `SHOP_APPLICATION_EMOJI_PREFIX = "shop_"`, `CF_APPLICATION_EMOJI_PREFIX = "cf_"`, `RUNTIME_MANAGED_PREFIXES = [SHOP…, CF…]`, `applicationEmojiName(prefix: string, key: string): string` (body of `getShopApplicationEmojiName`, `shopItemAssets.ts:11-24`, prefix as a parameter), `resolveTableAsset(table: Readonly<Record<string, string>>, key: string): { fileName: string; filePath: string; attachmentName: string } | null` (body of `resolveShopItemThumbnailAsset`, `:103-118`).
  - `crimeFamilyAssets.ts`: `CF_ASSETS` (derived from `CF_SPRITES`: `key → "cf_" + key + ".png"`), `CF_ART = { fortuna_don, caper_t1..caper_t4, result_clean, result_messy, result_bust, turf_map, war_banner }` (10 entries, `cf_<key>.png`), `cfEmoji`, `cfAttachment` (`resolveTableAsset` over `CF_ART` then `CF_ASSETS`; returns `{ attachment: new AttachmentBuilder(filePath, { name: attachmentName }), url: "attachment://" + attachmentName }` or `null`), `cfNoticeEmote`.
  - `applicationEmojiFamilies.ts`: `ApplicationEmojiFamily` and `APPLICATION_EMOJI_FAMILIES` exactly as spec 20.4, `MANAGED_EMOJI_PREFIXES`, `assertFamilyRegistry(families): void` (no prefix starts with another's, no duplicate ids), `pruneCandidates(existingNames: readonly string[], family: ApplicationEmojiFamily, desiredNames: ReadonlySet<string>): string[]`, `selectFamilies(ids: string[] | null): ApplicationEmojiFamily[]`.
  - Script exports `renderApplicationEmoji(filePath: string, family: ApplicationEmojiFamily): Promise<Buffer>` and `prepareEmojis(families): Promise<PreparedEmoji[]>`; `main()` runs only under `require.main === module`.

- [ ] **Step 1: Write the failing test**

```ts
// test/scripts/emoji-families.test.ts
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { loadImage, createCanvas } from "canvas";
import { APPLICATION_EMOJI_FAMILIES, MANAGED_EMOJI_PREFIXES, pruneCandidates, assertFamilyRegistry } from "../../src/utils/applicationEmojiFamilies";
import { RUNTIME_MANAGED_PREFIXES, applicationEmojiName } from "../../src/utils/applicationEmojiNames";
import { CF_ASSETS, CF_ART } from "../../src/utils/crimeFamilyAssets";
import { renderApplicationEmoji } from "../../src/scripts/syncShopApplicationEmojis";

const ASSETS = path.join(__dirname, "../../src/assets");
const cf = APPLICATION_EMOJI_FAMILIES.find((f) => f.id === "cf")!;

describe("application emoji families (20.4)", () => {
  it("keeps prefixes disjoint and the runtime list in sync", () => {
    expect(() => assertFamilyRegistry(APPLICATION_EMOJI_FAMILIES)).not.toThrow();
    expect(() => assertFamilyRegistry([...APPLICATION_EMOJI_FAMILIES, { ...cf, id: "cf2" as any, prefix: "cf_x" }])).toThrow();
    expect([...RUNTIME_MANAGED_PREFIXES]).toEqual(MANAGED_EMOJI_PREFIXES);
  });
  it("has 24 cf icons on disk with valid, collision-free names", () => {
    expect(Object.keys(CF_ASSETS)).toHaveLength(24);
    const names = APPLICATION_EMOJI_FAMILIES.flatMap((f) => Object.keys(f.assets).map((k) => applicationEmojiName(f.prefix, k)));
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z0-9_]{2,32}$/);
    for (const file of Object.values(CF_ASSETS)) expect(fs.existsSync(path.join(ASSETS, file)), file).toBe(true);
  });
  it("prunes only the selected family's stale names", () => {
    expect(pruneCandidates(["cf_old", "cf_vault", "shop_x", "cfx"], cf, new Set(["cf_vault"]))).toEqual(["cf_old"]);
  });
  it("renders a cf icon nearest-neighbour: each 4 px cell becomes exactly 3 px at offset 4", async () => {
    const png = await renderApplicationEmoji(path.join(ASSETS, CF_ASSETS.vault), cf);
    const img = await loadImage(png);
    expect([img.width, img.height]).toEqual([128, 128]);
    const src = await loadImage(path.join(ASSETS, CF_ASSETS.vault));
    const a = createCanvas(160, 160).getContext("2d"); a.drawImage(src, 0, 0);
    const b = createCanvas(128, 128).getContext("2d"); b.drawImage(img, 0, 0);
    for (const [cx, cy] of [[10, 10], [20, 21], [33, 7]]) {
      expect(Array.from(b.getImageData(4 + cx * 3 + 1, 4 + cy * 3 + 1, 1, 1).data)).toEqual(Array.from(a.getImageData(cx * 4 + 1, cy * 4 + 1, 1, 1).data));
    }
  });
  it("ships banners at 960x336, fully opaque, and the mascot at 500x500 with binary alpha and ≤ 32 colours", async () => {
    for (const [key, file] of Object.entries(CF_ART)) {
      const p = path.join(ASSETS, file);
      if (!fs.existsSync(p)) continue; // D66: art may be absent
      const img = await loadImage(p);
      const ctx = createCanvas(img.width, img.height).getContext("2d"); ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, img.width, img.height).data;
      const alpha = px.filter((_, i) => i % 4 === 3);
      if (key === "fortuna_don") {
        expect([img.width, img.height]).toEqual([500, 500]);
        expect(alpha.every((v) => v === 0 || v === 255)).toBe(true);
        const colours = new Set<number>();
        for (let i = 0; i < px.length; i += 4) colours.add(((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0);
        expect(colours.size).toBeLessThanOrEqual(32);   // spec 18; P16 drops the cap for banners only
      }
      else { expect([img.width, img.height]).toEqual([960, 336]); expect(alpha.every((v) => v === 255)).toBe(true); }
    }
  });
  it("never fills a managed-prefix name from a guild emoji", async () => {
    vi.resetModules();
    const reg = await import("../../src/utils/emojiRegistry");
    const client = { application: { fetch: async () => {}, emojis: { fetch: async () => new Map() } }, emojis: { cache: new Map([["1", { id: "1", name: "cf_vault", animated: false }]]) }, guilds: { cache: new Map() } } as any;
    await reg.initEmojiRegistry(client);
    expect(reg.emojiInline("cf_vault")).toBeUndefined();
  });
  it("keeps src/data/emojis.json free of managed names and duplicate ids", () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/emojis.json"), "utf8"));
    expect(Object.keys(data).filter((k) => MANAGED_EMOJI_PREFIXES.some((p) => k.startsWith(p)))).toEqual([]);
    const ids = Object.values<any>(data).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/scripts/emoji-families.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

- The three util modules as specified. `shopItemAssets.ts` re-exports `SHOP_APPLICATION_EMOJI_PREFIX` and keeps `getShopApplicationEmojiName`/`resolveShopItemThumbnailAsset` as one-line wrappers (their call sites do not change).
- `emojiRegistry.ts` steps 4 and 5 (`:76-99`): skip any name where `RUNTIME_MANAGED_PREFIXES.some((p) => name.startsWith(p))`.
- Sync script, spec 20.4 steps 1–9: `parseOptions` accepts `--family <ids>` and `--plan`; `prepareEmojis(selectFamilies(...))` loops families (keys checked against `validKeys`, names via `applicationEmojiName`, cross-family collision check); `renderApplicationEmoji(filePath, family)` keeps today's path when `pixelGrid` is unset and, when set, asserts a square source divisible by the grid, cell `= floor((128 − 8) / pixelGrid)` = 3, offset 4, `imageSmoothingEnabled = false`; `temporaryEmojiName` uses `${prefix}tmp_`; the cap check counts all families; prune uses `pruneCandidates` per selected family; `--plan` prints would-create/replace/prune per family without writing; `dotenv.config({ quiet: true })` and the client login move into one `loginClient(): Promise<Client>` helper that both `syncEmojis` and the `--plan` path call, and the `--dry-run` path never calls it (P19).
- `package.json`: `"sync:shop-emojis": "… --family shop"`, `"validate:shop-emojis": "… --dry-run --family shop"`, `"sync:app-emojis": "ts-node src/scripts/syncShopApplicationEmojis.ts"`, `"validate:app-emojis": "ts-node src/scripts/syncShopApplicationEmojis.ts --dry-run"`.
- `dmNoticeService` family builders switch to `cfNoticeEmote`. Append to `test/dm/family-notice.test.ts`: after `setEmojiRecord("cf_crest_1", { id: "1234567890123456789", name: "cf_crest_1" })`, the invite notice's thumbnail URL contains `1234567890123456789`.

- [ ] **Step 4: Run the test and the dry run**

Run: `$VT test/scripts/emoji-families.test.ts test/dm/family-notice.test.ts test/utils/pixel-sprites.test.ts`
Expected: PASS.
Run: `npm run validate:app-emojis`
Expected: "Validated 87 transparent 128x128 PNG emojis …" and "Dry run complete. Discord was not contacted". Then `git diff --exit-code src/data/emojis.json` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/utils/applicationEmojiNames.ts src/utils/crimeFamilyAssets.ts src/utils/applicationEmojiFamilies.ts src/utils/shopItemAssets.ts src/utils/emojiRegistry.ts src/scripts/syncShopApplicationEmojis.ts src/services/dmNoticeService.ts package.json test/scripts/emoji-families.test.ts
git commit -m "feat(emoji): application emoji families with the cf_ pixel-grid family"
```

---

### Task 15: UI kit, customIds, channel I/O and the family screens

**Files:**
- Create: `src/ui/crimeFamily/ids.ts`, `src/ui/crimeFamily/kit.ts`, `src/ui/crimeFamily/post.ts`, `src/ui/crimeFamily/familyScreens.ts`, `src/scripts/fixtures/crimeFamilyScreens.ts`
- Modify: `src/services/crimeFamily/views.ts` (`InviteView`), `src/services/crimeFamily/familyQueries.ts` (`toInviteView`), `src/utils/componentsV2.ts` (add `v2Quiet` after `v2Reply`, `:90-100`), `src/scripts/checkV2Payloads.ts` (seed every `CF_ASSETS` key with `setEmojiRecord`, then `check()` every `crimeFamilyWorstCases()` entry)
- Test: `test/crimeFamily/layout.test.ts`, `test/crimeFamily/ids-post.test.ts`

**Interfaces:**
- Consumes: view types (Task 6, 9–11), `cfEmoji`, `cfAttachment`, `levelDef`, `FAMILY_ROLES`, `Mascot.Emotes.MedalGold/Silver/Bronze`.
- Produces: kit/post exports (Seams block) and:
  - `ids.ts`: `CfPrefix = "crew" | "cpr" | "turf"`; `CREW_IDS` = one builder per crew id in spec 13.2 plus P9's `openTarget("chair", …)`: `view(screen, owner)`, `createOpen(owner)`, `createOk(tag, name, owner)`, `createNo(owner)`, `manageSelect(owner)`, `manage(action, target, owner)`, `confirm(kind, answer, target | "0", owner)`, `open(kind, owner)`, `openTarget(kind, target, owner)`, `vault(action, owner)`, `paydayOk(earnings, count, owner)`, `levelOk(level, owner)`, `log(page, owner)`, `top(sort, owner)`, `disband(action, owner)`, `modal(kind, owner)`, `inviteSelect(owner)`, `invite(answer, inviteId)`, `claim(familyId)`; `CPR_IDS.viewPlan(owner)` = `cpr:v:plan:<owner>` and `TURF_IDS.viewMap(owner)` = `turf:v:map:<owner>` (the S2 buttons; plans 2/3 add the rest); `encodeName`/`decodeName` (base64url).
  - `familyScreens.ts` (each returns `CfPayload`; `art: boolean` means "this message does not hold the file yet", so send `files` and `attachments: []`):
    - S1 `buildNoFamilyCard(ownerId: string, join: EligibilityResult, found: EligibilityResult)`
    - S2 `buildDashboard(view: FamilyDashboardView, opts: { art: boolean })` (visitor mode when `view.viewer.role === null`: no rows, no dues line)
    - S3 `buildCreateConfirm(ownerId: string, v: { name: string; tag: string; fee: number })`
    - S4 `buildInviteCard(v: InviteView)`, `buildInviteResolved(v: InviteView, text: string)`; this task adds to `views.ts` `InviteView { inviteId: string; familyLabel: string; crestKey: string; inviterId: string; inviteeId: string; expiresAt: Date; memberCount: number; memberCap: number }` and `toInviteView(invite: FamilyInvite & { family: Family }, memberCount: number): InviteView` in `familyQueries.ts`
    - S5 `buildManagePanel(ownerId: string, view: FamilyDashboardView, selected: string | null)`
    - S6 `buildVaultPanel(ownerId: string, v: VaultView, note?: string)`
    - S7 `buildPaydayPreview(ownerId: string, p: PaydayPreview, note?: string)`
    - S8 `buildLevelUpConfirm(ownerId: string, v: VaultView)`
    - S9 `buildLedgerPage(ownerId: string, page: { rows: LedgerLine[]; page: number; pages: number })`
    - S10 `buildLeaderboard(ownerId: string, v: LeaderboardView, opts: { art: boolean })`
    - S22 `buildDisbandConfirm(ownerId: string, tag: string, p: { finalPayday: PaydayPreview | null; burnTreasury: number; burnEarnings: number })`
    - S23 `buildClaimNotice(familyId: string, underbossId: string, bossId: string)`, `buildClaimResolved(text: string)`
    - S24 `buildMyInvites(ownerId: string, invites: InviteView[])`
    - S26 `buildConfirm(ownerId: string, kind: "leave" | "kick" | "chair", targetId: string | null, consequences: string)`
  - `crimeFamilyWorstCases()`: one entry per screen and variant with `max` = the spec 13.3 count (S2 = 18 with claim row and `showTurf: true`; S10 with 2 sorts = 12; S24 with 5 invites = 7; S23 = 4 and 2; S28 = 2 and 4; S27 = 4), built from 12 members with 24-character names, 15 ledger lines, 5 invites, 10 leaderboard rows (rank 1 at level 10, every row with `rackets: 3`, so the "Made Family" marker and the rackets column are in the worst case) and amounts near `MAX_SAFE_BALANCE`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/layout.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ComponentType } from "discord.js";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";
import { CF_ASSETS } from "../../src/utils/crimeFamilyAssets";
import type { FamilyDashboardView } from "../../src/services/crimeFamily/views";
import type { CfPayload } from "../../src/ui/crimeFamily/kit";
import { CREW_IDS, TURF_IDS } from "../../src/ui/crimeFamily/ids";

const art = vi.hoisted(() => ({ present: true }));
vi.mock("../../src/utils/assetPaths", async (orig) => {
  const m = await orig<typeof import("../../src/utils/assetPaths")>();
  return { ...m, findAsset: (n: string) => (art.present ? m.findAsset(n) : null) };
});
const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
const { buildDashboard, buildLeaderboard } = await import("../../src/ui/crimeFamily/familyScreens");

const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);
const chars = (n: any): number => (typeof n.content === "string" ? n.content.length : 0) + (n.components ?? []).reduce((s: number, c: any) => s + chars(c), 0) + (n.accessory ? chars(n.accessory) : 0);
const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); };

beforeAll(() => { for (const k of Object.keys(CF_ASSETS)) setEmojiRecord(`cf_${k}`, { id: "1456569047758929931", name: `cf_${k}` }); });

const labels = crimeFamilyWorstCases().map((c) => c.label);

describe.each([true, false])("family screens, art present = %s", (present) => {
  it.each(labels)("%s", (label) => {
      art.present = present; // payloads are built inside the test, after the toggle
      const c = crimeFamilyWorstCases().find((x) => x.label === label)!;
      const json = c.payload.components.map((x) => x.toJSON());
      const total = json.reduce((s, x) => s + count(x), 0);
      expect(total).toBeLessThanOrEqual(c.max);
      expect(total).toBeLessThan(40);
      expect(json.reduce((s, x) => s + chars(x), 0)).toBeLessThanOrEqual(4000);
      expect(c.payload.allowedMentions.parse).toEqual([]);
      expect(c.payload.files?.length ?? 0).toBeLessThanOrEqual(present ? 1 : 0);
      json.forEach((x) => walk(x, (n) => {
        if (n.type === ComponentType.Section) expect(n.accessory).toBeTruthy();
        if (n.custom_id) expect(n.custom_id.length).toBeLessThanOrEqual(100);
        if (n.type === ComponentType.Button && n.label) expect(n.label).not.toMatch(/<a?:\w+:\d+>/);
      }));
  });
});

describe("screen details", () => {
  const view = (o: Partial<FamilyDashboardView> = {}, viewer: Partial<FamilyDashboardView["viewer"]> = {}): FamilyDashboardView => ({
    familyId: "65f000000000000000000001", name: "Velvet Ante", tag: "VLA", level: 1, xp: 0, nextLevelXp: 1_000, memberCount: 2, memberCap: 6,
    crestKey: "crest_1", roster: [{ userId: "1", role: "BOSS", associateUntil: null }, { userId: "2", role: "UNDERBOSS", associateUntil: null }],
    duesArrears: 0, nextCaperAt: new Date(), underInvestigation: false, racketsHeld: null, showTurf: false, ...o,
    viewer: { userId: "2", role: "UNDERBOSS", canManage: true, canClaim: false, ...viewer },
  });
  const ids = (p: CfPayload) => { const out: string[] = []; p.components.forEach((c) => walk(c.toJSON(), (n) => n.custom_id && out.push(n.custom_id))); return out; };
  const text = (p: CfPayload) => JSON.stringify(p.components.map((c) => c.toJSON()));

  it("S2 Back from an ephemeral panel sends the crest and clears attachments", () => {
    art.present = true;
    const p = buildDashboard(view(), { art: true });
    expect(p.files).toHaveLength(1);
    expect(p.attachments).toEqual([]);
    expect(buildDashboard(view(), { art: false }).files ?? []).toHaveLength(0);
  });

  it("S2 hides Turf while turfEnabled is false and shows Claim only for a claim-eligible Underboss", () => {
    expect(ids(buildDashboard(view(), { art: false })).some((id) => id.startsWith("turf:"))).toBe(false);
    expect(ids(buildDashboard(view({ showTurf: true }), { art: false }))).toContain(TURF_IDS.viewMap("2"));
    expect(ids(buildDashboard(view(), { art: false }))).not.toContain(CREW_IDS.claim("65f000000000000000000001"));
    expect(ids(buildDashboard(view({}, { canClaim: true }), { art: false }))).toContain(CREW_IDS.claim("65f000000000000000000001"));
  });

  it("S2 never labels the Boss an Associate and hides rackets with no provider", () => {
    const t = text(buildDashboard(view({ roster: [{ userId: "1", role: "BOSS", associateUntil: null }, { userId: "2", role: "SOLDIER", associateUntil: new Date(Date.now() + 3600_000) }] }), { art: false }));
    expect(t.match(/Associate until/g)).toHaveLength(1);
    expect(t).not.toMatch(/Rackets/);
    expect(text(buildDashboard(view({ racketsHeld: 2 }), { art: false }))).toMatch(/Rackets 2/);
  });

  it("S10 marks a level 10 family 'Made Family' and shows rackets only when known", () => {
    const row = (rank: number, level: number, rackets: number | null) => ({ rank, familyId: `f${rank}`, tag: `T${rank}`, name: `Family ${rank}`, level, crestKey: "crest_4", members: 12, rackets, value: 60_000 - rank });
    const lb = (rackets: number | null) => ({ sort: "xp", sorts: [{ key: "xp", label: "XP" }, { key: "war", label: "War wins" }], rows: [row(1, 10, rackets), row(2, 9, rackets)], viewer: null });
    const t = text(buildLeaderboard("u", lb(null), { art: false }));
    expect(t.match(/Made Family/g)).toHaveLength(1);
    expect(t).not.toMatch(/rackets/i);
    expect(text(buildLeaderboard("u", lb(3), { art: false }))).toMatch(/3 rackets/);
  });
});
```

`test/crimeFamily/ids-post.test.ts`: every `CREW_IDS` builder at max lengths (20-digit ids, 24-char ObjectIds, `createOk("WXYZ", "x".repeat(24), …)` is 73 characters) is ≤ 100 and round-trips through `parseCfId`; `parseCfId("crime:x")` and `parseCfId("crew")` are `null`; `cfId` over 100 throws; `sendToChannel` returns `null` and `editChannelMessage` returns `"dead"` when the fake channel throws `{ code: 10003 | 10008 | 50001 | 50013 }`, `"error"` on any other error, and neither throws; `missingBotPermissions` lists the missing names of View Channel, Send Messages, Read Message History, Attach Files.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/layout.test.ts test/crimeFamily/ids-post.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

- `v2Quiet(containers, files?, extraFlags = 0, mentionUsers?)` = `{ ...v2Reply(containers, files, extraFlags), allowedMentions: mentionUsers?.length ? { parse: [], users: mentionUsers } : { parse: [] } }`. `cfPayload` wraps it (`ephemeral` ORs `MessageFlags.Ephemeral`; `freshAttachments` adds `attachments: []`).
- `thumbSection`: `cfAttachment(artKey)` present → `Section(text).setThumbnailAccessory(url)` + file; absent → one TextDisplay, no file. `bannerGallery`: absent → `null` (D66).
- Emoji in text: `` `${cfEmoji(k) ? cfEmoji(k) + " " : ""}${label}` ``; buttons/options `.setEmoji(cfEmoji(k))` only when defined.
- Screens follow the 13.3 component lists exactly. S2 roster line: `<rank emoji> <@id> · Role` plus `· Associate until <t:…:R>`; status line shows "Dues paid" or "Dues in arrears: N days" (no amount, D59), "Next caper <t:…:R>", "Under investigation" when true, and rackets only when `racketsHeld !== null`. S6 is the only screen with vault amounts. S7 Confirm id carries `earnings` and `count`; S6 Payday is disabled with its `lockedReason` as the label ("Payday locked") and Level up disabled when blockers exist. S10 renders one sort button per `view.sorts`, medal emotes for ranks 1–3, each line `[TAG] Name · L<level> · <members> members`, then `` · ${rackets} rackets`` only when `rackets !== null` (P23), and a gold `` `${Mascot.Emotes.MedalGold} Made Family` `` marker on rows with `level === CRIME_FAMILY_CONFIG.maxLevel` (spec 10.1). S2's status line shows `Rackets ${racketsHeld}` only when `racketsHeld !== null`, and the roster shows "Associate until" only when `associateUntil !== null` (never for the Boss, P20). S24 omits the select with no invites.
- `post.ts`: `client.channels.fetch(channelId)` then `send`/`messages.edit(messageId, payload)` (never `fetch` the message); dead codes 10003, 10008, 50001, 50013. `missingBotPermissions(channel, botId)` calls `channel.permissionsFor(botId)?.has(PermissionFlagsBits[name])` for each `name` of `["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"]` and returns the display names of the missing ones ("View Channel", "Send Messages", "Read Message History", "Attach Files"); plan 2's `fakeCaperClient` models exactly this contract.
- Fixtures: build every case from literal views; no DB.
- `checkV2Payloads.ts`: seed `cf_<key>` for every `CF_ASSETS` key next to the existing seeding (`:27-33`), then `for (const c of crimeFamilyWorstCases()) check(c.label, c.payload)`.

- [ ] **Step 4: Run the tests and the payload audit**

Run: `$VT test/crimeFamily/layout.test.ts test/crimeFamily/ids-post.test.ts`
Expected: PASS.
Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: every line `PASS`, ending "All payloads within Discord limits". Then `git diff --exit-code src/data/emojis.json` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/crimeFamily src/services/crimeFamily/views.ts src/services/crimeFamily/familyQueries.ts src/utils/componentsV2.ts src/scripts/fixtures/crimeFamilyScreens.ts src/scripts/checkV2Payloads.ts test/crimeFamily/layout.test.ts test/crimeFamily/ids-post.test.ts
git commit -m "feat(crime-families): UI kit, customIds, channel I/O and family screens"
```

---

### Task 16: Interaction router, crew routes and stub caper/turf tables

**Files:**
- Create: `src/handlers/crimeFamilyRouter.ts`, `src/handlers/crewInteractionHandler.ts`, `src/handlers/caperInteractionHandler.ts`, `src/handlers/turfInteractionHandler.ts`, `src/ui/crimeFamily/announce.ts`, `test/crimeFamily/fakeInteraction.ts`
- Modify: `src/utils/interactionHelpers.ts` (add `rejectPress`), `src/index.ts` (one branch after the `crime:` branch, `:225-228`)
- Test: `test/crimeFamily/handlers.test.ts`

**Interfaces:**
- Consumes: every service from Tasks 6–13, every screen from Task 15, `touchActivity`.
- Produces: router types and route tables (Seams), `rejectPress`, and `announce.ts`:
  - `announcePayday(client: Client, result: PaydayPaid): Promise<{ cardPosted: boolean }>` (S28 "Payday: N members paid X each" + names to the home channel; `familyPaydayNotice` to each paid, `familyMissedPaydayNotice` to each ineligible)
  - `announceChairChange(client: Client, family: Family, kind: "claimed" | "handed", oldBossId: string, newBossId: string): Promise<void>` (edit S23 via `claimChannelId`/`claimMessageId` when set; DMs per 13.4: claim → old Boss, handover → all members)
  - `announceRoleChange(client: Client, family: Family, kind: "kicked" | "promoted" | "demoted", targetId: string, newRole: FamilyRole | null): Promise<void>` (one `familyRoleNotice` DM to the target)
  - `announceDisband(client: Client, result: Awaited<ReturnType<typeof disbandFamily>>): Promise<void>` (`familyDisbandedNotice` to every former member with their final net, if any)
  - Every kick, promote, demote, hand-over and disband path (button or `!crew` subaction) calls the matching announcer after the service returns.
- `fakeInteraction.ts`: `fakeButton(customId: string, opts: { userId: string; guildId?: string; ephemeralSource?: boolean; channelId?: string })`, `fakeSelect(customId, values, opts)`, `fakeModal(customId, fields: Record<string, string>, opts)`; each exposes `vi.fn` for `deferUpdate`, `deferReply`, `showModal`, `reply`, `editReply`, `followUp` that update `deferred`/`replied`/`ephemeral` like discord.js, an `order: string[]` log, `message.flags` carrying Ephemeral when `ephemeralSource`, and `client.channels.fetch` resolving a channel whose `send` and `messages.edit` are `vi.fn`s. Helper `said(i): string` = `JSON.stringify` of every `reply`, `editReply` and `followUp` call.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/handlers.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import prisma from "../../src/utils/prisma";
import { redisService } from "../../src/services/redisService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { rejectPress } from "../../src/utils/interactionHelpers";
import { CREW_IDS, CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, fakeModal, said } from "./fakeInteraction";
import { inviteMember } from "../../src/services/crimeFamily/membershipService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("crime family interactions", () => {
  it.each([CREW_IDS.createOpen("u1"), CREW_IDS.vault("deposit", "u1"), CREW_IDS.open("rename", "u1"), CREW_IDS.disband("open", "u1")])(
    "%s opens its modal before any Prisma or Redis call", async (id) => {
      const db = vi.spyOn(prisma.familyMember, "findUnique");
      const redis = vi.spyOn(redisService, "getInstance");
      const i = fakeButton(id, { userId: "u1" });
      i.showModal.mockImplementation(async () => { expect(db).not.toHaveBeenCalled(); expect(redis).not.toHaveBeenCalled(); i.order.push("showModal"); });
      await handleCrimeFamilyInteraction(i as any);
      expect(i.order[0]).toBe("showModal");
      db.mockRestore(); redis.mockRestore();
    });

  it("refuses another user's panel without any DB call", async () => {
    const i = fakeButton(CREW_IDS.view("vault", "owner"), { userId: "intruder" });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringMatching(/not yours/i) }));
  });

  it("acks before touching Redis", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const redis = vi.spyOn(redisService, "getInstance");
    const i = fakeButton(CREW_IDS.view("vault", boss), { userId: boss });
    i.deferReply.mockImplementation(async () => { expect(redis).not.toHaveBeenCalled(); i.deferred = true; i.ephemeral = true; });
    await handleCrimeFamilyInteraction(i as any);
    expect(i.deferReply).toHaveBeenCalled();
    redis.mockRestore();
  });

  it("rejectPress edits a deferred ephemeral and follows up after deferUpdate", async () => {
    const a = fakeButton("crew:x:u", { userId: "u" }); a.deferred = true; a.ephemeral = true;
    await rejectPress(a as any, "No.");
    expect(a.editReply).toHaveBeenCalledWith({ content: "No." });
    const b = fakeButton("crew:x:u", { userId: "u" }); b.deferred = true;
    await rejectPress(b as any, "No.");
    expect(b.followUp).toHaveBeenCalledWith(expect.objectContaining({ content: "No.", flags: 64 }));
  });

  it("a member who left presses an old Vault button: refused, nothing written", async () => {
    const boss = await seedEligibleUser(); const gone = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const i = fakeButton(CREW_IDS.view("vault", gone), { userId: gone });
    await handleCrimeFamilyInteraction(i as any);
    expect(JSON.stringify(i.editReply.mock.calls)).toMatch(/not in a crime family/);
  });

  it("an Underboss demoted between Payday preview and Confirm is refused and nobody is paid (Review Focus 4)", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, earnings: 1_000_000, lastPaydayAt: daysAgo(8), members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }] });
    ACTIVITY_RULES.push({ key: "all", label: "all", need: 0, count: async () => 1 });
    try {
      await testPrisma.familyMember.update({ where: { userId: ub }, data: { role: "SOLDIER", roleSlot: ub } });   // demoted after the preview
      const i = fakeButton(CREW_IDS.paydayOk(1_000_000, 2, ub), { userId: ub, ephemeralSource: true });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toMatch(/Boss or Underboss/);
      expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.earnings).toBe(1_000_000);
      expect(await testPrisma.transaction.count({ where: { type: "family_payday" } })).toBe(0);
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("the invite Accept button only works for the invitee", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const boss = await seedEligibleUser();
      const invitee = await seedEligibleUser({ wallet: 2_000_000 }); const other = await seedEligibleUser({ wallet: 2_000_000 });
      const f = await seedFamily({ bossId: boss });
      const inv = await inviteMember({ inviterId: boss, inviteeId: invitee, guildId: "g1", channelId: "c1" });
      const wrong = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: other, guildId: "g1" });
      await handleCrimeFamilyInteraction(wrong as any);
      expect(said(wrong)).toContain("This invite is not for you.");
      expect(await testPrisma.familyMember.findUnique({ where: { userId: other } })).toBeNull();
      const right = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: invitee, guildId: "g1" });
      await handleCrimeFamilyInteraction(right as any);
      expect(await testPrisma.familyMember.findUnique({ where: { userId: invitee } })).toMatchObject({ familyId: f.id, role: "SOLDIER" });
    });
  });
  it("the S2 Caper button answers 'Capers open soon.' until plan 2", async () => {
    const i = fakeButton(CPR_IDS.viewPlan("u1"), { userId: "u1" });
    await handleCrimeFamilyInteraction(i as any);
    expect(JSON.stringify(i.reply.mock.calls)).toContain("Capers open soon.");
  });
  it("create and invite answers are refused while the feature is closed", async () => {
    const founder = await seedEligibleUser({ wallet: 15_000_000 });
    const press = () => fakeButton(CREW_IDS.createOk("VLA", "Velvet Ante", founder), { userId: founder, guildId: "g1", ephemeralSource: true });
    const off = press();
    await handleCrimeFamilyInteraction(off as any);
    expect(said(off)).toContain("Crime Families are not open in this server yet.");
    await withCfConfig({ enabled: true, allowGuildIds: ["g2"] }, async () => {
      const elsewhere = press();
      await handleCrimeFamilyInteraction(elsewhere as any);
      expect(said(elsewhere)).toContain("Crime Families are not open in this server yet.");
    });
    expect(await testPrisma.family.count()).toBe(0);
    expect(await testPrisma.wallet.findUnique({ where: { userId: founder } })).toMatchObject({ balance: 15_000_000 });
    const boss = await seedEligibleUser(); const invitee = await seedEligibleUser({ wallet: 2_000_000 });
    await seedFamily({ bossId: boss });
    const inv = await inviteMember({ inviterId: boss, inviteeId: invitee, guildId: "g1", channelId: "c1" });
    const acc = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: invitee, guildId: "g1" });
    await handleCrimeFamilyInteraction(acc as any);
    expect(said(acc)).toContain("Crime Families are not open yet.");
    expect(await testPrisma.familyMember.findUnique({ where: { userId: invitee } })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/handlers.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

- `rejectPress(i, text)`: `deferred && ephemeral` → `safeEditReply(i, { content: text })`; `deferred || replied` → `safeFollowUp(i, { content: text, flags: Ephemeral })`; else `safeReply(i, { content: text, flags: Ephemeral })`.
- `handleCrimeFamilyInteraction(i)`: `parseCfId`; table = `{ crew: CREW_ROUTES, cpr: CAPER_ROUTES, turf: TURF_ROUTES }[prefix]`, all three imported statically (P7; a lazy require would load a second module copy under vitest, so the spies above would watch the wrong `prisma` and `redisService`); entry = ``table[`${action}:${args[0]}`] ?? table[action]``; missing entry → `rejectPress` with crew `"This button is no longer active."`, cpr `"Capers open soon."`, turf `"Turf wars open soon."`; then, before any I/O: `scope === "owner" || scope === "modalOpener"` and `args.at(-1) !== i.user.id` → `rejectPress("This panel is not yours.")`; the ack per `entry.ack` (`"modal"` acks nothing here, the route's first await is `showModal`); then `entry.run(i, args)`; map `FamilyError`/`InsufficientFundsError` to `rejectPress(err.message)`, anything else to `console.error` + `rejectPress("Something went wrong.")`; finally `void touchActivity(i.user.id)`.
- `CREW_ROUTES` entries (`CfRouteEntry`, the router owns the owner check and the ack): `create:open`, `vault:deposit`, `open:rename`, `open:disband`, `disband:open` → `{ scope: "modalOpener", ack: "modal" }`; `v`, `open` (the rest), `vault` (the rest) → `{ scope: "owner", ack: "auto" }`; `create:ok`, `create:no`, `mg`, `cf`, `pay`, `lvl`, `log`, `top`, `disband:no`, `inv:sel` → `{ scope: "owner", ack: "update" }`; `modal` → `{ scope: "owner", ack: "ephemeral" }`; `inv` (accept/decline) and `claim` → `{ scope: "shared", ack: "ephemeral" }`, which update the shared card through `editChannelMessage`. After the ack every route re-reads membership and role from the DB. Create routes (`create:*`, `modal:create`) check `isCrimeFamilyOpen(i.guildId)` (`"Crime Families are not open in this server yet."`); invite answers (`inv:*`) check only `CRIME_FAMILY_CONFIG.enabled` (`"Crime Families are not open yet."`), because spec 6.4 lets an invitee accept from any server. Payday Confirm → `executePayday` → on `"paid"`, `announcePayday` and S6 with "Paid N members"; on `"changed"`, re-render S7 with the reason. Claim → `claimChair` → `announceChairChange`. Invite accept → `acceptInvite` → `buildInviteResolved` on the S4 card.
- `CAPER_ROUTES: CfRouteTable = {}` and `TURF_ROUTES: CfRouteTable = {}` with a comment naming plan 2/plan 3: they add entries with a `scope` and `ack`, never their own owner check.
- `src/index.ts`: `if (id.startsWith("crew:") || id.startsWith("cpr:") || id.startsWith("turf:")) { const { handleCrimeFamilyInteraction } = require("./handlers/crimeFamilyRouter"); return await handleCrimeFamilyInteraction(interaction); }`. No entry in `shouldEarlyAcknowledgeInIndex`.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/handlers/crimeFamilyRouter.ts src/handlers/crewInteractionHandler.ts src/handlers/caperInteractionHandler.ts src/handlers/turfInteractionHandler.ts src/ui/crimeFamily/announce.ts src/utils/interactionHelpers.ts src/index.ts test/crimeFamily/handlers.test.ts test/crimeFamily/fakeInteraction.ts
git commit -m "feat(crime-families): persistent crew:/cpr:/turf: routing and crew panels"
```

---

### Task 17: Family scheduled jobs

**Files:**
- Create: `src/services/crimeFamily/scheduler.ts`
- Modify: `src/scheduler.ts` (call `registerCrimeFamilyJobs(client)` at the end of `initScheduler`, before the log line `:73`)
- Test: `test/crimeFamily/scheduler.test.ts`

**Interfaces:**
- Consumes: `expireInvites`, `chargeDues`, `markClaimNotice`, `clearClaimNotice`, `setClaimMessage`, `buildClaimResolved`, `autoHandover`, `executePayday`, `announcePayday`, `announceChairChange`, `buildInviteResolved`, `buildClaimNotice`, `sendToChannel`, `editChannelMessage`, `notifyMany`, `familyArrearsNotice`.
- Produces: `CfJob`, `CF_SCHEDULES`, `registerCrimeFamilyJobs(client: Client): void`, `runJobs(client: Client, jobs: CfJob[], now?: Date): Promise<void>`, and the jobs `sweepInvites`, `chargeFamilyDues`, `runSuccession`, `autoPayday` (each an exported `(client: Client, now: Date) => Promise<void>`, so tests call them directly). `CF_SCHEDULES` holds `CfJob` objects that wrap them, named after the function: `[{ cron: "* * * * *", jobs: [{ name: "sweepInvites", run: sweepInvites }] }, { cron: "10 * * * *", jobs: [{ name: "chargeFamilyDues", run: chargeFamilyDues }, { name: "runSuccession", run: runSuccession }, { name: "autoPayday", run: autoPayday }] }]`. Plans 2 and 3 add `CfJob` objects the same way (plan 2's test pins the minute entry's names as `["sweepInvites", "sweepCapers"]`).

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/scheduler.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
const { schedule } = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule }, schedule }));
const { CF_SCHEDULES, registerCrimeFamilyJobs, runJobs, chargeFamilyDues, runSuccession, autoPayday, sweepInvites } = await import("../../src/services/crimeFamily/scheduler");
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { fakeDmClient } from "../dm/helpers";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const DAY = 864e5;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
function fakeClient(o: { dead?: boolean } = {}) {
  const dm = fakeDmClient();
  const sent: any[] = []; const edits: [string, any][] = [];
  const channel = {
    isTextBased: () => true,
    send: vi.fn(async (p: any) => { sent.push(p); return { id: `m${sent.length}` }; }),
    messages: { edit: vi.fn(async (id: string, p: any) => { edits.push([id, p]); return {}; }) },
  };
  (dm.client as any).channels = { fetch: vi.fn(async () => { if (o.dead) throw Object.assign(new Error("Unknown Channel"), { code: 10003 }); return channel; }) };
  return { client: dm.client, dm: dm.sent, sent, edits };
}
const allActive = { key: "all", label: "all", need: 0, count: async () => 1 };
async function dueFamily(now: Date) {
  const boss = await seedEligibleUser(); const s = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, earnings: 1_000_000, lastPaydayAt: new Date(+now - 8 * DAY - 60_000), members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, boss, s };
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("crime family jobs (15)", () => {
  it("registers each schedule in UTC with noOverlap", () => {
    registerCrimeFamilyJobs({} as any);
    expect(schedule.mock.calls.map((c) => [c[0], c[2]])).toEqual(CF_SCHEDULES.map((s) => [s.cron, expect.objectContaining({ timezone: "Etc/UTC", noOverlap: true })]));
  });

  it("one failing job does not stop the next in its schedule", async () => {
    const ran: string[] = [];
    await runJobs({} as any, [{ name: "a", run: async () => { ran.push("a"); throw new Error("x"); } }, { name: "b", run: async () => { ran.push("b"); } }]);
    expect(ran).toEqual(["a", "b"]);
  });

  it("dues: hourly runs charge once a day; a missed 00:10 is charged at the next hour; the first miss DMs Boss and Underboss", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, level: 2, earnings: 80_000, members: [{ userId: ub, role: "UNDERBOSS" }] });
    const c = fakeClient();
    await chargeFamilyDues(c.client, new Date("2026-11-05T01:10:00Z"));   // the 00:10 run never happened
    await chargeFamilyDues(c.client, new Date("2026-11-05T02:10:00Z"));
    expect((await fam(f.id))!.earnings).toBe(0);
    expect(c.dm.size).toBe(0);
    await chargeFamilyDues(c.client, new Date("2026-11-06T00:10:00Z"));
    await chargeFamilyDues(c.client, new Date("2026-11-07T00:10:00Z"));
    expect((await fam(f.id))!.duesArrears).toBe(2);
    expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 1, [ub]: 1 });
  });

  it("succession: one S23 per inactivity episode, ended by the Boss's return; auto handover at 14 days edits it", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, homeChannelId: "home", members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(20) }] });
    const setActive = (uid: string, d: Date) => testPrisma.familyMember.update({ where: { userId: uid }, data: { lastActiveAt: d } });
    const c = fakeClient();
    await setActive(boss, new Date(+now - 7 * DAY - 60_000));
    await runSuccession(c.client, now); await runSuccession(c.client, now);
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0].allowedMentions).toEqual({ parse: [], users: [ub] });
    expect(await fam(f.id)).toMatchObject({ claimNoticeFor: boss, claimChannelId: "home", claimMessageId: "m1" });
    await setActive(boss, now);                                           // the Boss is back (P22)
    await runSuccession(c.client, now);
    expect(c.edits.at(-1)![0]).toBe("m1");
    expect(JSON.stringify(c.edits.at(-1)![1])).toContain("The Boss is back.");
    expect((await fam(f.id))!.claimNoticeFor).toBe("");
    const later = new Date(+now + 7 * DAY + 60_000);                      // gone again for 7 days
    await runSuccession(c.client, later);
    expect(c.sent).toHaveLength(2);
    const muchLater = new Date(+now + 14 * DAY + 60_000);
    await setActive(ub, muchLater);
    await runSuccession(c.client, muchLater);
    expect((await fam(f.id))!.bossId).toBe(ub);
    expect(c.edits.at(-1)![0]).toBe("m2");
    expect(JSON.stringify(c.edits.at(-1)![1])).toContain(`Chair handed to <@${ub}>`);
  });

  it("autoPayday pays at lastPaydayAt + 8 days with earnings ≥ 500,000, once", async () => {
    const now = new Date();
    ACTIVITY_RULES.push(allActive);
    try {
      const { f, boss, s } = await dueFamily(now);
      const early = await seedFamily({ bossId: await seedEligibleUser(), earnings: 1_000_000, lastPaydayAt: new Date(+now - 8 * DAY + 60_000) });
      const c = fakeClient();
      await autoPayday(c.client, now); await autoPayday(c.client, now);
      expect([await wallet(boss), await wallet(s)]).toEqual([475_000, 475_000]);
      expect((await fam(f.id))!.earnings).toBe(0);
      expect((await fam(early.id))!.earnings).toBe(1_000_000);
      expect(c.sent).toHaveLength(1);
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("a dead home channel: payday still pays, DMs go, nothing throws (Review Focus 5)", async () => {
    const now = new Date();
    ACTIVITY_RULES.push(allActive);
    try {
      const { f, boss, s } = await dueFamily(now);
      const c = fakeClient({ dead: true });
      await expect(autoPayday(c.client, now)).resolves.toBeUndefined();
      expect([await wallet(boss), await wallet(s)]).toEqual([475_000, 475_000]);
      expect([...c.dm.keys()].sort()).toEqual([boss, s].sort());
      expect((await fam(f.id))!.earnings).toBe(0);
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("sweepInvites expires due invites and edits their cards once", async () => {
    const now = new Date();
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss });
    const inv = await testPrisma.familyInvite.create({ data: { familyId: f.id, inviterId: boss, inviteeId: "x", guildId: "g1", channelId: "c1", messageId: "m9", expiresAt: new Date(+now - 1_000) } });
    const c = fakeClient();
    await sweepInvites(c.client, now); await sweepInvites(c.client, now);
    expect(c.edits.map((e) => e[0])).toEqual(["m9"]);
    expect(JSON.stringify(c.edits[0][1])).toContain("Expired");
    expect((await testPrisma.familyInvite.findUnique({ where: { id: inv.id } }))!.status).toBe("EXPIRED");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/scheduler.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`registerCrimeFamilyJobs`: one `cron.schedule(s.cron, () => runJobs(client, s.jobs), { timezone: "Etc/UTC", noOverlap: true, name: \`crimeFamily:${s.jobs.map((j) => j.name).join("+")}\` })` per entry (named by its jobs, not its cron: plan 3 adds a second `* * * * *` entry, and two tasks with one name would make the logs ambiguous); `runJobs` runs jobs in order, each in its own try/catch logging `` `[crimeFamily] ${job.name} error` ``, with `now = new Date()`. Jobs per spec 15: `chargeFamilyDues` loops families (`select id`) and DMs `familyArrearsNotice` to Boss and Underboss when `firstMiss`; `runSuccession` per family: Boss inactive ≥ `autoHandoverAfterSeconds` → `autoHandover` → `announceChairChange("handed")`; else ≥ `claimChairAfterSeconds` with an Underboss → `markClaimNotice` → `sendToChannel(home, buildClaimNotice(...))` → `setClaimMessage`; else, when `claimNoticeFor === bossId` (the Boss came back, P22) → `clearClaimNotice` → on a win, `editChannelMessage(claimChannelId, claimMessageId, buildClaimResolved("The Boss is back."))` when `claimMessageId !== ""`; `autoPayday` = families with `lastPaydayAt ≤ now − (paydayIntervalSeconds + autoPaydayGraceSeconds)` and `earnings ≥ paydayMinEarnings` → `executePayday(id, "system", null, now)` → `announcePayday`; `sweepInvites` → `expireInvites(now)` → `editChannelMessage` with `buildInviteResolved(…, "Expired")` when `messageId !== ""`.

- [ ] **Step 4: Run it to verify it passes**

Run: `$VT test/crimeFamily/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/scheduler.ts src/scheduler.ts test/crimeFamily/scheduler.test.ts
git commit -m "feat(crime-families): dues, succession, auto payday and invite expiry jobs"
```

---

### Task 18: The `!crew` command, slash spec, aliases and admin rename

**Files:**
- Create: `src/commands/economy/crew.ts`, `src/utils/playerTarget.ts`
- Modify: `src/commands/economy/rob.ts:35-69,89` (call `resolvePlayerTarget`), `src/commandRouter.ts` (alias `mob: "crew"` in the map `:145-196`; `case "crew":` and `case "crew-forcerename":` with lazy `require` beside `:559-564`; `"crew"` in `validCommands` `:618-623`), `src/utils/developerAccess.ts:37-60` (`"crew-forcerename"`), `src/slash/registry.ts` (new spec after the marriage block, `:231-234`), `src/commands/life/marriage.ts:146` and the dashboard body (`:109-123`, one line "Crime families are `!crew`."), `test/slash/registry.test.ts`
- Test: `test/router/crew-jail.test.ts`, `test/crimeFamily/crew-command.test.ts`

**Interfaces:**
- Consumes: services, screens, `buildOpener`, `isCrimeFamilyOpen`, `parsePositiveAmount`, `missingBotPermissions`, `touchActivity`.
- Produces:
  - `resolvePlayerTarget(message: Message, raw: string | undefined, copy: { verb: string; bot: string }): Promise<{ id: string; name: string } | { error: string }>` (rob's rules and copy; `verb` is capitalised at the start of a sentence and lowercased inside one; rob passes `{ verb: "Rob", bot: "Bots are broke." }`, crew passes `{ verb: "Invite", bot: "Bots can't join a family." }`)
  - `CrewCtx = { message: Message; args: string[] /* after the subaction */; uid: string; guildId: string; channelId: string; prefix: string }`
  - `handleCrew(message: Message, args: string[]): Promise<unknown>`; `CREW_SUBACTIONS: Readonly<Record<string, (ctx: CrewCtx) => Promise<unknown>>>` with the 21 keys `dashboard, create, invite, accept, decline, leave, kick, promote, demote, handover, deposit, vault, payday, levelup, log, top, info, home, rename, disband, claim`; `handleCrewForceRename(message: Message, args: string[])`
  - Slash: `{ name: "crew", desc: "Your crime family: dashboard, vault, invites and ranks", opts: [{ kind: "str", name: "action", desc: "What to do -- leave blank for your dashboard", required: false, choices: [the 21 keys] }, { kind: "str", name: "target", desc: "Player, tag or amount, when the action needs one", required: false }] }`

- [ ] **Step 1: Write the failing tests**

```ts
// test/router/crew-jail.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { routeMessage } from "../../src/commandRouter";
import { fakeMessage, replyText } from "./fakeMessage";
import { seedEligibleUser, seedFamily, resetFamilies, withCfConfig } from "../helpers";

beforeEach(resetFamilies);

describe("!crew routing", () => {
  it("a jailed member can view the dashboard but not deposit", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const boss = await seedEligibleUser({ wallet: 1_000_000, jailedUntil: new Date(Date.now() + 3600_000) });
      await seedFamily({ bossId: boss, tag: "VLA" });
      const view = fakeMessage("!crew", { authorId: boss, guildId: "g1" });
      await routeMessage({} as any, view.message, "!");
      expect(replyText(view.reply.mock.calls[0][0])).toContain("[VLA]");
      const dep = fakeMessage("!crew deposit 100k", { authorId: boss, guildId: "g1" });
      await routeMessage({} as any, dep.message, "!");
      expect(replyText(dep.reply.mock.calls[0][0])).toMatch(/jail/i);
    });
  });
  it("!mob is !crew; !family is still marriage and points to !crew", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, tag: "MOB" });
      const mob = fakeMessage("!mob", { authorId: boss, guildId: "g1" });
      await routeMessage({} as any, mob.message, "!");
      expect(replyText(mob.reply.mock.calls[0][0])).toContain("[MOB]");
    });
    const single = fakeMessage("!family", { authorId: await seedEligibleUser(), guildId: "g1" });
    await routeMessage({} as any, single.message, "!");
    const t = replyText(single.reply.mock.calls[0][0]);
    expect(t).toContain("Not Married");
    expect(t).toContain("Crime families are `!crew`.");
  });
  it("refuses while disabled or in a guild outside allowGuildIds", async () => {
    const u = await seedEligibleUser();
    const off = fakeMessage("!crew", { authorId: u, guildId: "g1" });
    await routeMessage({} as any, off.message, "!");
    expect(replyText(off.reply.mock.calls[0][0])).toContain("Crime Families are not open in this server yet.");
    await withCfConfig({ enabled: true, allowGuildIds: ["g2"] }, async () => {
      const other = fakeMessage("!crew", { authorId: u, guildId: "g1" });
      await routeMessage({} as any, other.message, "!");
      expect(replyText(other.reply.mock.calls[0][0])).toContain("Crime Families are not open in this server yet.");
    });
  });
});
```

`crew-jail.test.ts` depends on `withCfConfig` patching both module copies (Task 1): `routeMessage` reaches `crew.ts` through its lazy `require`, so `crew.ts` reads the Node copy of `CRIME_FAMILY_CONFIG`. `crew.ts` itself imports services and screens statically (Global Constraints).

`test/crimeFamily/crew-command.test.ts`:
- `resolvePlayerTarget`: a mention of a bot → `{ error: "Bots can't join a family." }`; a 17–20 digit id with no user → "No Fortuna player with that ID."; two users sharing a username → "Multiple players share that name — invite them by user ID instead."; the inviter themself → `!crew invite` replies "You can't invite yourself." and no invite row (Review Focus 3).
- `!crew invite <id>` posts S4 with `allowedMentions.users = [inviteeId]`, stores `messageId`, and DMs the invitee.
- `!crew deposit -5m` / `abc` reply "Enter a positive amount like 250k or 5m"; with a 40,000,000 wallet, `!crew deposit all` deposits 25,000,000 (wallet 15,000,000 after, treasury 23,750,000) and a second `!crew deposit all` replies "Daily deposit cap reached (0 left today)." (Review Focus 1, P21).
- `!crew vault`, `payday`, `levelup`, `log`, `leave`, `rename`, `disband`, `create` reply with an S27 opener whose button id is the matching `CREW_IDS.open(...)`/`createOpen`; `kick <user>` and `handover <user>` use `CREW_IDS.openTarget`.
- `!crew home` in a channel missing Attach Files names the permission and does not move home.
- `!crew-forcerename VLA New Name` from `BOT_DEVELOPER_ID` renames with no fee; from anyone else is "Developer Only".

Slash test additions in `test/slash/registry.test.ts`: `["crew", { action: "invite", target: "Bob" }, ["invite", "Bob"]]`, `["crew", { action: "deposit", target: "5m" }, ["deposit", "5m"]]`, `["crew", {}, []]`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/router/crew-jail.test.ts test/crimeFamily/crew-command.test.ts test/slash/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`handleCrew`: `isCrimeFamilyOpen(message.guildId)` else `errorContainer("Crime Families", "Crime Families are not open in this server yet.")`; `void touchActivity`; dispatch `CREW_SUBACTIONS[args[0]?.toLowerCase() ?? "dashboard"]` (unknown → usage line listing subactions). No family + `dashboard` → S1 with both eligibility results; member → S2 with `art: true`; `info <TAG>` → visitor S2; `top` → S10 (`xp`); private targets → S27 openers (13.1 list plus P9). `deposit`: `resolveDepositAmount(uid, raw, now)` (`null` → "Enter a positive amount like 250k or 5m"), then `depositToVault`. Service errors map to a public one-line `errorContainer` (13.2). Jail is enforced in the services that move money or membership (`crew` is not added to `restrictedInJail`, `:254-259`). Slash count becomes 71.

- [ ] **Step 4: Run them, the router suites and the slash validator**

Run: `$VT test/router test/crimeFamily/crew-command.test.ts test/slash/registry.test.ts`
Expected: PASS.
Run: `npm run validate:slash`
Expected: "71/100 used" and "All slash command specs are valid."

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/crew.ts src/utils/playerTarget.ts src/commands/economy/rob.ts src/commandRouter.ts src/utils/developerAccess.ts src/slash/registry.ts src/commands/life/marriage.ts test/router/crew-jail.test.ts test/crimeFamily/crew-command.test.ts test/slash/registry.test.ts
git commit -m "feat(crime-families): !crew command, /crew, mob alias and crew-forcerename"
```

---

### Task 19: Help, tutorial and docs

**Files:**
- Modify: `src/commands/general/help.ts` (`CATEGORIES` `:39`, `MODULE_EMOTES` `:326-343`, lookups `:388`, `:432`; export `buildMainMenu` `:371`, `buildModuleView` `:431`, `CATEGORIES`), `src/commands/general/tutorial.ts` (`LESSONS` `:43-204`, exported)
- Create: `dashboard/src/content/modules/crime-families.ts`
- Modify: `dashboard/src/content/modules/index.ts` (register after `crimeAndHeat`), `dashboard/src/content/commands.ts` (`crew` entry), `dashboard/src/content/modules/life-and-social.ts` (cross-link), `FORTUNA_V2_ECONOMY.md` ("Crime Families" section before "Money Sinks" `:216`; add K1–K4, K7, K8, K11 to the sinks list), `README.md:92-95`, `DESIGN.md` section 7 (replace the "never run checkV2Payloads" sentence: it now seeds in memory)
- Test: `test/general/help-crime-families.test.ts`

**Interfaces:**
- Consumes: `emojiInline` at render time, catalog and config values for every number in the docs.
- Produces: help category `crimefamilies` ("Crime Families", `crew` with its 21 subcommands), `MODULE_EMOTES.crimefamilies = Mascot.Emotes.Gun`, `MODULE_APP_EMOJI = { crimefamilies: "cf_crest_1" }` resolved as `(MODULE_APP_EMOJI[id] && emojiInline(MODULE_APP_EMOJI[id])) ?? MODULE_EMOTES[id] ?? ""` in both lookups; one `SystemLesson` `crimefamilies` (emote `Mascot.Emotes.Gun`); `casinoGuide` unchanged (D40).

- [ ] **Step 1: Write the failing test**

```ts
// test/general/help-crime-families.test.ts
import { describe, it, expect, vi } from "vitest";
import { Mascot } from "../../src/config/branding";

const allPages = (h: typeof import("../../src/commands/general/help")) =>
  [1, 2, 3, 4].map((p) => JSON.stringify(h.buildMainMenu("!", p, "u").toJSON())).join("\n");

describe("help and tutorial (19.3)", () => {
  it("shows the cf_crest_1 app emoji when it is loaded", async () => {
    vi.resetModules();
    const { setEmojiRecord } = await import("../../src/utils/emojiRegistry");
    setEmojiRecord("cf_crest_1", { id: "1234567890123456789", name: "cf_crest_1" });
    const help = await import("../../src/commands/general/help");
    expect(allPages(help)).toContain("<:cf_crest_1:1234567890123456789>");
    const cat = help.CATEGORIES.find((c) => c.id === "crimefamilies")!;
    expect(JSON.stringify(help.buildModuleView(cat, "!").toJSON())).toContain("<:cf_crest_1:1234567890123456789>");
  });

  it("falls back to the Gun emote in a fresh module without it", async () => {
    vi.resetModules();
    const help = await import("../../src/commands/general/help");
    const pages = allPages(help);
    expect(pages).toContain("Crime Families");
    expect(pages).toContain(Mascot.Emotes.Gun);
    expect(pages).not.toContain("cf_crest_1");
  });

  it("the tutorial has a Crime Families lesson that points to {p}crew", async () => {
    const { LESSONS } = await import("../../src/commands/general/tutorial");
    const l = LESSONS.find((x) => x.id === "crimefamilies")!;
    expect(l).toMatchObject({ label: "Crime Families", emote: Mascot.Emotes.Gun });
    expect(l.howToUse.join(" ")).toContain("{p}crew");
  });
});
```

Export `buildMainMenu(prefix: string, page: number, authorId: string): ContainerBuilder` (`src/commands/general/help.ts:371`), `buildModuleView(category: CategoryData, prefix: string): ContainerBuilder` (`:431`) and `CATEGORIES` (`:39`) from `help.ts`, and `LESSONS` (`src/commands/general/tutorial.ts:43`) from `tutorial.ts`, so the test renders without a `Message`. The emote lookups to change are `:388` and `:432`. The test walks pages 1–4 because 17 categories at `PAGE_SIZE = 6` (`:323`) make 3 pages and the clamp at `:373` repeats the last; it does not depend on where `crimefamilies` sits in `CATEGORIES`.

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement help, tutorial and docs**

Docs follow the house rule (exhaustive, exact numbers from source, full tables, a strategy section). `crime-families.ts` `forBeginners` (spec 19.3: what a family is, the first command `!crew`, one tip; plans 2 and 3 add `!caper` and `!turf` to it) and sections for this plan: what a family is; founding (cost, every `found` gate, name/tag rules); ranks and the 6.3 permission table; joining (join gates, hop table 6.6, invite caps); the vault (two buckets, deposit rules, earnings-first, what it pays for); dues and arrears; payday (active member, eligibility, formula, cap, tax, auto payday); levels table 10.1 and XP sources 10.2 (caper and war rows marked "with Capers"/"with Turf"); succession; disband; the leaderboard; and "Getting better at Crime Families" (recruit active players, deposit to keep the level pace, keep dues paid, pay out versus level up). `screenshot` uses `/art/cf-fortuna-don.png`; copy `src/assets/cf_fortuna_don.png` to `dashboard/public/art/cf-fortuna-don.png`. `commands.ts` `crew`: module `"economy"`, `jailBlocked: false`, `interactive: true`, `keyNumbers` Create fee 10,000,000, Deposit tax 5%, Payday cap 1,000,000 gross a week, Dues 40,000 × level a day. `FORTUNA_V2_ECONOMY.md`'s new "Crime Families" section holds the family tables of spec 19.3: 10.1 levels, 10.2 XP pacing (caper and war rows marked as above), 11.1 daily income by band and the 11.3 source and sink ledger; plan 2 adds 8.1, 8.6 and 8.10, plan 3 adds 9.1. The changelog entry ships with plan 2 (stage A release).

- [ ] **Step 4: Run the test and the dashboard type check**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: PASS.
Run: `cd dashboard && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/help.ts src/commands/general/tutorial.ts dashboard/src/content dashboard/public/art/cf-fortuna-don.png FORTUNA_V2_ECONOMY.md README.md DESIGN.md test/general/help-crime-families.test.ts
git commit -m "docs(crime-families): help, tutorial, website module and economy reference"
```

---

### Task 20: Full verification and the owner hand-off

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `$VT`
Expected: all files PASS (the only known environmental failures are the Redis-dependent suites if the container is down; start it first).

- [ ] **Step 2: Static checks**

Run: `npm run typecheck && npm run validate:slash && npm run validate:app-emojis && npm run gen:pixel-assets -- --set cf --check`
Expected: no type errors; 71/100 slash commands; 87 emojis validated without contacting Discord; 24 sprites valid.

- [ ] **Step 3: Payload audit and tracked-file hygiene**

Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json && grep -rn "isTester" src/services/crimeFamily || echo "no isTester"`
Expected: "All payloads within Discord limits", `emojis.json` unchanged (`{}`), "no isTester".

- [ ] **Step 4: Commit any fix-ups, then report the hand-off to the owner**

The hand-off note (in the final message, not a file) states: deploy with `workflow_dispatch` because `prisma/` changed before the last commit (spec 19.1); the feature is off (`enabled: false`); to try stage A set `enabled: true, allowGuildIds: ["<dev guild>"]`; the owner runs `npm run sync:app-emojis -- --family cf --plan`, then `npm run sync:app-emojis -- --family cf`, then restarts the bot (spec 19.4 step 7); capers and turf buttons answer "open soon" until plans 2 and 3.

---

## Self-review notes (for the executor)

- Spec coverage for this plan: 6.1–6.7 (Tasks 6–8, 12, 17), 7.1–7.5 (Tasks 9–10, 12), 10.1–10.4 (Task 11), 12.1 (Task 5), 12.2 items 1, 2, 5, 6 (jail in deposit, invite and accept), 7 (Under investigation on S2), 8, 9, 11 (Tasks 5–13; items 6–9 and 11 are cross-cutting, and plans 2 and 3 cover their own slices), 17 edges 9, 29 (existing `sendOptOutDm` strikes; no new code), 33–42, 52 (family slice), 55 (gate slice), 56 (no code: activity rules and kick cover it), 57, 64, 65, 73, 74, 76, 77, 80, 83 (Tasks 3–18), 13.1 `!crew` (Task 18), 13.2 (Tasks 15–16), 13.3 S1–S10, S22–S24, S26–S28 (Task 15), 13.4 `family` rows (Tasks 13, 16, 17), 14.1 five family models (Task 3), 14.4 wallet seams used here (Task 2), 15 dues/succession/auto payday/invite sweep (Task 17), 16.2 and 20.4 (Task 14), 19.2 flags (Task 1), 19.3 family docs (Task 19).
- Left to plan 2: `Caper`/`CaperCrew`, 8.x, S11–S15, S25 caper card, `!caper`, `cpr:` routes, `caper`/`caper_lobby` DM types, `applyEconomyPenaltyTx`/`addCrimeHeatTx`/`jailUserTx`, the caper `ACTIVITY_RULES` entry and `FAMILY_HOOKS` entry, `sweepCapers`, the changelog. Left to plan 3: `Racket`/`War`/`WarContribution`/`WarHit`, 9.x, S16–S21, `!turf`, `turf:` routes, `turf` DM type, the war `ACTIVITY_RULES`/`FAMILY_HOOKS` entries, the `rk` leaderboard sort, `tickWars`/`tickRackets`/`seedRackets`.
- Review pass 2 (2026-11-04): hook blocks and caps run inside `runFamilyTx` so retries re-check them; any exhausted transient conflict is "Vault busy, try again."; route entries carry `scope`/`ack` and the router owns the owner check and ack; route tables are static imports and `withCfConfig` patches both module copies; Associate rules never touch the Boss (P20); `all` deposits clamp to the day's cap (P21); claim notices reset when the Boss returns (P22); rackets come from an optional hook (P23). Concurrency tests assert `≤ cap` plus "Vault busy" as the only other outcome, never an exact count that a retry exhaustion could break.
