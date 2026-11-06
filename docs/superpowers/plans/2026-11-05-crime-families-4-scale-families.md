# Crime Families 4: Families at Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the player-facing "Caper" to "Crew Heist", grow families to 10–30 members with size-scaled heist caps, Capo seats, join limits and investigation threshold, pay big families through a two-phase payday, add the no-confidence vote and the recruitment board, and make every Crime Families job and channel post safe under Discord sharding.

**Architecture:** One schema commit (Task 2) adds a denormalized `Family.memberCount`, the listing fields, `FamilyInvite.kind`, the vote fields on `FamilyMember`, and five new collections (`PaydayShare`, `FamilyVote`, `FamilyBallot`, `CfJobRun`, `BotProcessBoot`). Every size rule is a pure function in `sizeRules.ts`; every vote decision is pure in `voteRules.ts`; every write is one `runFamilyTx` guarded by a CAS or a unique index. New features plug into the shipped registries: `FAMILY_HOOKS` (three new optional methods), `CF_SCHEDULES`, the router's `crew` table (merged from `CREW_ROUTES` and two new route modules in `crimeFamilyRouter.ts`), `DM_NOTICE_TYPES`, `crimeFamilyWorstCases()`, and a new `CENSUS_STEPS` that plan 6 extends. All channel I/O goes through one REST seam, and every family job registers only on the job shard.

**Tech Stack:** TypeScript, discord.js 14.25 (ComponentsV2, `client.rest`, `MessagePayload`), Prisma 5.22 on MongoDB (replica set, interactive transactions), ioredis, node-cron 4.2.1, vitest with mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-11-05-crime-families-scale-design.md` (the amendment; it wins where the two differ). Read sections 0 (Decisions A1–A46), 2, 3, 4, 7, 8, 9, 10, 11, 12 and Appendices A and B. The old spec `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` still governs every rule the amendment does not mention (sections 6, 7.3, 12 and 13 above all). The code is the truth where it differs from either spec. Plans 1–3 (`docs/superpowers/plans/2026-11-04-crime-families-{1-foundation,2-capers,3-turf}.md`) are shipped; their Global Constraints still hold.

**Plan series and scope:** 1 Foundation → 2 Capers → 3 Turf (shipped) → **4 Families at scale (this plan)** → 5 Heists and war actions across servers → 6 Turf leagues. The amendment's A39 put the vote and recruiting in plan 5 and cross-server play in plan 4; this series swaps them (see F1). This plan therefore does **not** touch guild locks, `GateDef.guild`, `isCrimeFamilyOpen(null)` (A20), the intel relay, the DM "Join as…"/Open-brief/Scout cards, `CaperCrew.sharedIntel`, leagues, cities or racket income. Line numbers are against `main` at `1badb42`; re-check each `file:line` before you edit it, because earlier tasks move lines.

---

## Global Constraints

- `.env` `DATABASE_URL` is the LIVE player database. Never run `npm run dev`, `npm start`, `npm run seed`, `npx prisma db push`, `npx prisma studio`, any `sync:*-emojis` without `--dry-run`, or any `ts-node src/...` not listed here, and never read `.env`. Allowed: vitest, `npm run typecheck`, `npx prisma validate|format|generate` (no connection), `npm run validate:slash`, `npm run validate:app-emojis`, `npm run gen:pixel-assets -- --set cf --check`, and `checkV2Payloads.ts` only as `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- `$VT <files>` means `MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' <files>`. DB tests need Redis on 6381: `docker start casino-test-redis || docker run -d --rm --name casino-test-redis -p 6381:6379 redis:7-alpine`. Never run two vitest processes at once (they clobber `test/.mongo-uri`).
- Commit directly on `main`; never push (only the owner pushes, and a push deploys). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy gate: every `prisma/` change lands in Task 2 and nowhere else, so the owner deploys with `workflow_dispatch` and `run_schema: true`. Nothing is deployed in the family collections, so no change needs a migration or `--accept-data-loss`.
- **Copy rule (A8).** Player-visible text says "Crew Heist" (a feature title or button) and "crew heist(s)" (in a sentence); the command is `!heist` / `/heist`. Internal names keep "caper": the `Caper`/`CaperCrew` models, `cpr:` customIds, `caper*` files and functions, Redis keys, the ledger and transaction types (`caper_cut`, `caper_stake`), the DM pref keys `caper` and `caper_lobby`, the art keys (`cf_caper`, `caper_t1..4`), the activity rule key `caper_seats` and the audit type `caper_corrupt`. The banners keep their painted "FORTUNA'S CAPERS" placard (A38). The solo `!crime` board's "Legendary" tier is untouched. Every task after Task 1 writes "crew heist" in new copy.
- `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` never change. `src/data/emojis.json` stays `{}`. No emoji upload and no new art: icons come only from the 24 `CF_ASSETS` keys (this plan uses `rank_boss` for vote notices, `crest_1..4` and `rank_associate` for recruitment) and banners only from `CF_ART`.
- No module under `src/services/crimeFamily/` imports `isTester` (`test/anticheat/family-tester.test.ts` scans the folder). No tester bypass on any family state.
- Every new filtered field is required with a default or sentinel: `FamilyInvite.kind "INVITE"`, `FamilyVote.status "OPEN"`, `liveSlot "LIVE"`, `announced false`, `resultAnnounced false`, `reposted false`, `cooldownUntil now()`, `FamilyMember.bossedOnce false`, `officerUntil now()`, `PaydayShare.paid false`, `CfJobRun.dayKey ""`, `Family.recruiting false`, `appDigestAt now()`. The arrays `FamilyVote.eligibleIds` and `BotProcessBoot.shardIds` are never filtered. Any filter on a nullable field needs `OR: [{ f: null }, { f: { isSet: false } }]` (`src/anticheat/claim.ts:59-84`).
- Every money, membership, rank, ballot, application and share write runs in `runFamilyTx` (`src/services/crimeFamily/tx.ts:39-47`) with a CAS (`updateMany` + `count === 1`) or a unique index as the backstop, and gets a race test under `test/anticheat/`. Never catch a P2002 inside a transaction. The P2002s this plan maps, always outside the transaction: `FamilyVote_familyId_liveSlot_key`, `FamilyBallot_voteId_userId_key`, `FamilyInvite_familyId_inviteeId_slot_key`, `FamilyMember_familyId_seat_key`, `FamilyMember_userId_key`, `CfJobRun_key_key`.
- Net-worth **gates** (the 10,000,000 promotion bar, application requirements) call `computeNetWorth` inside the transaction callback so every retry recomputes; never `getNetWorth` (its 600 s `networth:<id>` cache is for display: the inbox, the board filter, S30).
- All Crime Families modules import each other statically; registries are edited as array/object literals. Route tables never import each other: shared route helpers live in the leaf `src/handlers/crewRouteKit.ts`, and `crimeFamilyRouter.ts` merges `CREW_ROUTES`, `VOTE_ROUTES` and `RECRUIT_ROUTES`. A hook module (`voteHooks.ts`) imports only `@prisma/client` types, `CRIME_FAMILY_CONFIG` and `voteRules.ts`, never `familyQueries`, `chairService`, `membershipService` or `disbandService` (`src/services/crimeFamily/extensions.ts:1-3`).
- Redis guards no money, uniqueness, ballot, application, share or placement. The only new key is `cf:render:vote:<voteId>` (the existing `trailingRender`, which fails open).
- Every UI is ComponentsV2 through `cfPayload` with `allowedMentions: { parse: [] }` (pings only via `mentionUsers` where the old spec already pings), no `content`/`embeds`, and ≤ 40 components (50035 is swallowed by `src/index.ts`). Every new or changed screen and every new DM container gets a worst-case entry in `src/scripts/fixtures/crimeFamilyScreens.ts` (or `caperScreens.ts` for heist screens) whose `max` is the amendment's §11.3 count. Free text (pitch, application message) is rendered only through `escapeMarkdown`.
- Every DM goes through `sendOptOutDm`/`notifyMany` (`src/services/dmNoticeService.ts:49-67`, `:315-328`) with type `family` or the new `recruit`; `recruit` is an account-group type with no `command` field.
- Every channel post or edit goes through `sendToChannel`/`editChannelMessage` (`src/ui/crimeFamily/post.ts`), which use the REST seam after Task 3. Family code reads the channel cache only in `pickLobbyChannel` (`src/ui/crimeFamily/caperCard.ts:84-108`, through `fetchGuildChannel`'s `client.channels.fetch`) and `!crew home` (`src/commands/economy/crew.ts:99-104`, which reads `ctx.message.channel` and never fetches); both run on the shard that received the command or press, so the guild is local.
- New jobs are entries in `CF_SCHEDULES` (`src/services/crimeFamily/scheduler.ts:115-134`); after Task 3 they register only through `startCrimeFamilyJobs`, on the job shard.
- Every number comes from `CRIME_FAMILY_CONFIG` (`src/utils/economyConfig.ts:200-268`), the catalog or the pure rule modules; no literal in a service.
- Vault amounts appear only on ephemeral screens (old D59). Ballots are secret (A16): no card, DM or log ever names how a member voted.
- Slash commands stay at 73 of 100; `/heist` replaces `/caper`; `/crew` ends this plan at 24 of 25 choices.

## Review Focus

1. **An application fed into the invite paths.** An applicant presses `crew:inv:accept:<applicationId>` (a crafted or reused id), types `!crew accept <TAG>` or `!crew decline <TAG>` while only an application is pending, or opens S24. Expected: "Invite expired." / "You have no pending invite from that family." / the application is not listed; no membership row, the application stays PENDING. Test: Task 12.
2. **Requirement text in the listing modal.** `10m` → 10,000,000, `2.5b` → 2,500,000,000, `1,000` → 1,000, blank and `0` → 0; `-5`, `abc`, `1e9`, `2.5` (shifts), `all` → "Enter a whole number like 10m or 1,000."; a value above its limit → "Max 10,000,000,000." (or 5,000 / 730 / 1,000). Nothing is written on a refusal. Test: Task 12.
3. **Pitch and message text that would format, ping or hide a link.** `**bold**`, `# Big`, `-# tiny`, `<t:0:R>`, `||spoiler||` and a run of newlines are accepted, collapsed to single spaces and render literally (escaped, no pings). Zero-width characters (U+200B–U+200D, U+2060, U+FEFF) are stripped before every rule, so `disc​ord.gg/abc` and `@​everyone` are refused like their plain forms. Tests: Task 12 (rules), Task 14 (render).
4. **Stale presses.** A vote DM YES after the close → "Voting closed."; a ballot from a member who left → "You can't vote in this one."; Accept or Decline on an application that expired, was withdrawn or was already answered → "Application no longer pending."; any S31/S32 button after the officer was demoted to Soldier → "You don't have permission to do that."; no row changes in any case. Tests: Tasks 11, 15.
5. **Board paging and filters at the edges.** A page number past the end (families filled up or stopped recruiting between presses) clamps to the last page; an I-qualify view with nothing to show says why ("No recruiting family's requirements fit you yet." or the first failing join gate); a full family never appears; an empty board says "No family is recruiting right now." Test: Task 14.

## Decisions this plan makes (not in the spec, or chosen where it is silent)

| # | Spec ref | Decision | Why |
|---|---|---|---|
| F1 | A39 | This plan builds the vote and recruiting (A39's plan 5) and leaves cross-server play, the relay and A20 to plan 5. The vote and recruitment DM buttons work from DMs without A20 because `crew:` routes check only `CRIME_FAMILY_CONFIG.enabled` (`assertEnabled`, the renamed `assertInvitesOpen` of `src/handlers/crewInteractionHandler.ts:63-65`, moved to `crewRouteKit.ts` in Task 11), never the guild | The owner's workflow fixed this split; nothing here needs a guild-free `isCrimeFamilyOpen` |
| F2 | 2.2, 3.2 | The four size rules live in a new pure module `sizeRules.ts`, tested in `test/crimeFamily/size-rules.test.ts`; the catalog test keeps only the member-cap row | The catalog holds data; the rules read config |
| F3 | 6.4, 8.3 | The daily census of `Family.activeMembers` (A22, census steps 1–2) ships here, because S29 sorts on it. `runTurfCensus` runs an ordered `CENSUS_STEPS` registry; plan 6 appends its turf steps (cities, placement, rebalance) as entries | The board needs the number now; plan 6 adds a step, not a branch |
| F4 | 4.3 step 4 | `chairService` stays vote-agnostic: the vote hook voids the vote inside the chair move, and `announceChairChange` (which already runs after every handover, claim and automatic succession) ends with `announcePendingVoteResults(client, familyId)` | The mover never has to know a vote exists; the `resultAnnounced` CAS still makes the edit happen once |
| F5 | 2.4 | `payPaydayShares` returns the paid shares; DMs stay in the announcers (`announcePayday`, and a new `announceResumedShares` for the minute job). A share whose family was deleted (disband) and whose credit clamps writes an `audit` row `family_payday_clamp_burn` with `meta.burned` instead of a ledger row | Services never DM; a deleted family has no vault to credit and the `PaydayShare` model has no meta field |
| F6 | 2.4 | `writeLedger` returns the new row's id; the `payday` row's id is the `runKey` | One write, one id |
| F7 | 3.2, A45 | `changeRank` returns `{ family, newRole, fellBack }`; `fellBack` is true when a demoted Underboss landed on Soldier, and both callers append "(no Capo seat was free)" | The service decides, the UI words it |
| F8 | 2.5 | S2's Associates line lists only Soldiers inside their 72 h; an officer inside 72 h stays on its rank line | The Capos count `(capos/cap)` must match the names on its line |
| F9 | 4.6 | A dead S34 gets one repost for the life of the vote, gated by the CAS `familyVote.updateMany({ where: { id, reposted: false }, data: { reposted: true } })` (the `WarBoardRef.reposted` pattern); after that, or after a failed repost (`messageId ""`), open-vote renders stop and only DMs carry the vote until the result, which `announceVoteResult` posts once when the edit is dead | §4.6: one repost, then DMs only; without the flag a board deleted again and again (automod) would be reposted on every ballot |
| F10 | 8.9 M2 | The listing modal opener carries the four current requirement numbers in its customId (`crew:rc:edit:<nw>:<sh>:<age>:<heists>:<owner>`, ≤ 59 characters) and pre-fills them; the pitch input is blank and "blank keeps the current pitch" | A modal opener may do no I/O before `showModal`; without this every edit would reset the requirements |
| F11 | 8.2 | Requirement inputs parse with `parseBidAmount` (`src/services/crimeFamily/bidService.ts:105-115`) after mapping blank and `0` to 0 | The spec names the bid parser rules; one parser |
| F12 | 8.4 | `applyToFamily` stores `guildId`/`channelId` of the press (`""` when absent); applications never post a card | `FamilyInvite.guildId/channelId` are required strings |
| F13 | 3.3 | `start_vote` and `cast_vote` join `ROLE_ACTIONS` in Task 9; `edit_listing` and `review_apps` in Task 12 | Each lands with its first caller |
| F14 | 7.2 | `startCrimeFamilyJobs(client)` (new, in `src/services/crimeFamily/scheduler.ts`) is the one entry `initScheduler` calls: it returns at once off the job shard, else registers `CF_SCHEDULES` and runs the boot seed. Plan 6 swaps `seedRackets` for `seedTurf` inside it | One guard, testable without starting the market timers in `initScheduler` |
| F15 | 7.3 | The test fakes (`fakeClient`, `fakeCaperClient`, `fakeInteraction`) gain a `rest` double and `options: {}`; `sent`/`edits`/`calls` keep their shapes but `payload` becomes the REST body JSON plus `files` (`RawFile[]`). Tests that read `payload.components[i].toJSON()` read `payload.components[i]`; `allowedMentions` becomes `allowed_mentions` | The seam serializes before the fake sees it |
| F16 | 4.2 | Ballot and vote-start presses from a member who is banned or jailed are refused with the existing jail line or "Banned accounts can't take part in a vote."; the snapshot still counts them (they stay members) | Gates match every other family action |
| F17 | 8.3 | S29 and S30 show no league until plan 6 adds `leagueOf`; plan 6 appends "· <League>" after the level | Leagues do not exist in this plan |
| F18 | 8.2 | `parseRequirement(raw, max)` returns `{ ok: true; value } \| { ok: false; reason }`, so "not a number" and "over the limit" carry their own refusal (Review Focus 2) | One call site per input; the reason travels with the result |
| F19 | 4.7, 8.10 | DM builders that carry buttons (`familyVoteOpenedNotice`, `recruitDigestNotice`) live in `dmNoticeService.ts` and take an `ActionRowBuilder<ButtonBuilder>` that the announcer builds from `CREW_IDS`; `services/` never imports `ui/` | Keeps the services → ui direction the repo already has |
| F20 | 4.5 | `crew:vt:start:<owner>` (S2's Vote button) shows the S25 vote card (ephemeral) when a vote is open and S35 otherwise; no extra customId | The spec's id set covers both states |
| F21 | 4.6 | S34 and the S25 vote card never read a ballot: `VoteView` has no per-viewer choice. The ballot reply text is built from the pressed button | Secrecy (A16) by construction, not by discipline |
| F22 | 2.3 | `isUnderInvestigation` stays a boolean wrapper over a new `investigationOf(familyId)` returning `{ hot, threshold, under }`, so refusals and S11 name the live threshold | Callers that only branch keep their call |

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/services/crimeFamily/sizeRules.ts` | Pure size rules: heist cap, Capo cap, investigation threshold, joins per 7 days |
| `src/utils/shard.ts` | `isJobShard` (shared, repo-wide) |
| `src/utils/restMessages.ts` | `restSend` / `restEdit`: channel messages through `client.rest` (shared, repo-wide) |
| `src/services/processBootService.ts` | `BotProcessBoot` rows: record a boot, ask whether any process booted since a time |
| `src/services/crimeFamily/voteRules.ts` | Pure vote math: pass threshold, outcome, cooldown, void reason |
| `src/services/crimeFamily/voteHooks.ts` | `VOTE_FAMILY_HOOK` (the freeze and the chair-move void) and `voidOpenVotesInTx` |
| `src/services/crimeFamily/voteService.ts` | Start, ballot, close, announcement CASes, vote reads and views |
| `src/services/crimeFamily/voteSweeper.ts` | `sweepVotes` minute job: close due votes, announce silent starts and results |
| `src/ui/crimeFamily/voteScreens.ts` | S34 (open and result), S35, S25 vote |
| `src/ui/crimeFamily/voteAnnounce.ts` | Post and edit S34, vote DMs, the debounced render |
| `src/handlers/crewRouteKit.ts` | The shared route helpers (`show`, `showThenAnnounce`, `notice`, `owner`, `auto`, `update`, `assertEnabled`); a leaf that imports no route table |
| `src/handlers/crewVoteRoutes.ts` | `crew:vt:*`, `crew:vote:*` routes and the vote entry screen |
| `src/services/crimeFamily/recruitService.ts` | Listing edit and toggle, apply, withdraw, accept, decline, digest CAS |
| `src/services/crimeFamily/recruitQueries.ts` | Applicant stats, board, family card, recruitment panel, inbox, my applications |
| `src/services/crimeFamily/census.ts` | `runTurfCensus`, `CENSUS_STEPS`, the active-member count |
| `src/ui/crimeFamily/recruitScreens.ts` | S29–S33 and the M1/M2 modal builders |
| `src/ui/crimeFamily/recruitAnnounce.ts` | Applicant result DMs, officer digests, expiry DMs |
| `src/handlers/crewRecruitRoutes.ts` | `crew:bd`, `crew:fc`, `crew:app`, `crew:rc`, `crew:ap`, `crew:modal:apply|recruit` routes |
| Tests | `test/crimeFamily/{rename-copy,scale-schema,size-rules,sharding,vote-rules,vote-layout,recruit-text,recruit-board,census,route-tables}.test.ts`, `test/anticheat/{family-capo,family-vote,family-recruit}.race.test.ts`; test helpers `test/crimeFamily/visibleText.ts` (Task 1) and `test/crimeFamily/layoutHelpers.ts` (Task 6) |

**Modify:** `prisma/schema.prisma`, `src/utils/economyConfig.ts`, `src/data/crimeFamilyCatalog.ts`, `test/helpers.ts`, `src/commandRouter.ts`, `src/slash/registry.ts`, `src/index.ts`, `src/scheduler.ts`, `src/services/dmPrefsService.ts`, `src/services/dmNoticeService.ts`, `src/services/crimeFamily/{membershipService,chairService,familyService,familyQueries,paydayService,disbandService,ledger,permissions,extensions,tx,names,eligibility,caperLobbyService,caperPlayService,caperQueries,caperHooks,caperSettleService,caperSweeper,scheduler,views}.ts`, `src/ui/crimeFamily/{post,ids,familyScreens,caperScreens,caperCard,caperFlow,announce}.ts`, `src/handlers/{crimeFamilyRouter,crewInteractionHandler,caperInteractionHandler}.ts`, `src/commands/economy/{crew,caper}.ts`, `src/scripts/fixtures/{crimeFamilyScreens,caperScreens}.ts`, `src/commands/general/{help,tutorial}.ts`, `test/crimeFamily/{fakeClient,caperFixtures,fakeInteraction}.ts` and the tests each task names, `dashboard/src/content/modules/{crime-families,crime-and-heat}.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md`.

## Interfaces this plan exports (plans 5 and 6 consume the starred lines)

```ts
// src/services/crimeFamily/sizeRules.ts  (*plan 6 docs and audits)
export function heistCapFor(memberCount: number): number;              // max(heistCapMin 4, ceil(n / heistCapDivisor 3))
export function capoCapFor(memberCount: number): number;               // max(1, floor(n / capoPerMembers 5))
export function investigationThresholdFor(memberCount: number): number; // max(underInvestigationMembers 3, ceil(n / investigationDivisor 4))
export function joinsPerFamilyFor(level: number): number;              // max(joinsPerFamilyPer7dMin 5, ceil(levelDef(level).memberCap / joinsPerFamilyDivisor 3))

// src/utils/shard.ts  (*plans 5, 6)
export function isJobShard(client: { shard?: { ids: number[] } | null }): boolean;   // !client.shard || client.shard.ids.includes(0)

// src/utils/restMessages.ts  (*plans 5, 6)
export function restSend(client: Client, channelId: string, payload: MessageCreateOptions): Promise<string>;           // message id; throws DiscordAPIError
export function restEdit(client: Client, channelId: string, messageId: string, payload: MessageEditOptions): Promise<void>;

// src/ui/crimeFamily/post.ts  (*plans 5, 6: unchanged signatures, now REST-backed)
export function sendToChannel(client: Client, channelId: string, payload: CfPayload): Promise<string | null>;
export function editChannelMessage(client: Client, channelId: string, messageId: string, payload: CfPayload): Promise<"ok" | "dead" | "error">;

// src/services/processBootService.ts  (*plan 5)
export function recordProcessBoot(client: { shard?: { ids: number[] } | null }, now?: Date): Promise<void>;
export function bootedSince(since: Date): Promise<boolean>;            // any BotProcessBoot with bootedAt > since

// src/services/crimeFamily/caperSettleService.ts  (*plan 5; bootedAt parameter removed, A30)
export function resolveCaper(caperId: string, now: Date, rng?: Rng): Promise<ResolveResult>;
// src/ui/crimeFamily/caperFlow.ts
export function resolveAndAnnounce(client: Client, caperId: string, now: Date): Promise<ResolveResult>;

// src/services/crimeFamily/scheduler.ts  (*plan 6 swaps seedRackets → seedTurf inside it)
export function startCrimeFamilyJobs(client: Client): void;           // F14

// src/services/crimeFamily/census.ts  (*plan 6 appends entries; its turf_cities (closure re-placement) and turf_rebalance steps return the "New city" turf DMs)
export type CensusNotice = { type: DmNoticeType; userIds: string[]; build: (userId: string) => ContainerBuilder };   // built with a dmNoticeService builder; sent by the job, never by the step
export interface CensusStep { key: string; run(now: Date): Promise<CensusNotice[] | void> }
export const CENSUS_STEPS: CensusStep[];                               // [ACTIVE_MEMBERS_STEP]
export function runTurfCensus(now: Date): Promise<{ status: "ran" | "skipped"; notices: CensusNotice[] }>;   // CfJobRun{ key: "turf_census" } dayKey claim (A22); notices of every step, in step order
export function activeMembersByFamily(since: Date, now: Date): Promise<Map<string, number>>;
// src/ui/crimeFamily/announce.ts  (*plan 6 reuses it unchanged)
export function announceCensusNotices(client: Client, notices: CensusNotice[]): Promise<void>;   // notifyMany per notice; never throws
// CF_SCHEDULES "10 * * * *" entry: { name: "runTurfCensus", run: async (c, now) => announceCensusNotices(c, (await runTurfCensus(now)).notices) }

// src/services/crimeFamily/membershipService.ts  (consumed by Tasks 12 and 13; no later plan joins a family)
export function joinFamilyInTx(tx: Prisma.TransactionClient, i: { familyId: string; uid: string; inviterId: string; now: Date }): Promise<{ family: Family; member: FamilyMember }>;
export function withSeatRetry<T>(fn: () => Promise<T>, msgs: { alreadyInFamily: string }): Promise<T>;   // the 3-run FamilyMember_familyId_seat_key loop of acceptInvite; FamilyMember_userId_key → msgs.alreadyInFamily

// src/services/crimeFamily/extensions.ts  (FamilyHook gains, *plans 5, 6 may implement)
rankChangeBlock?(tx: Prisma.TransactionClient, familyId: string): Promise<string | null>;
handoverBlock?(tx: Prisma.TransactionClient, familyId: string): Promise<string | null>;
onChairMove?(tx: Prisma.TransactionClient, familyId: string, now: Date): Promise<void>;

// src/services/crimeFamily/chairService.ts
export function moveChair(tx: Prisma.TransactionClient, familyId: string, oldBossId: string, newBossId: string, now: Date): Promise<ChairMove>;  // now exported; writes firstBossAt once; runs onChairMove
export function promoteMember(actorId: string, targetId: string, now?: Date): Promise<{ family: Family; newRole: FamilyRole; fellBack: boolean }>;
export function demoteMember(actorId: string, targetId: string, now?: Date): Promise<{ family: Family; newRole: FamilyRole; fellBack: boolean }>;

// src/services/crimeFamily/paydayService.ts
export function reservePaydayInTx(tx: Prisma.TransactionClient, family: Family, eligible: string[], earnings: number, actorId: string, now: Date): Promise<{ runKey: string; split: Split }>;
export type PaidShare = { userId: string; familyId: string; gross: number; tax: number; net: number; credit: CreditResult };
export function payPaydayShares(runKey: string, now?: Date): Promise<PaidShare[]>;
export function resumeUnpaidShares(now: Date): Promise<PaidShare[]>;
export type PaydayPaid = { status: "paid"; family: Family; split: Split; runKey: string; paid: PaidShare[]; ineligible: PaydayPreview["ineligible"] };

// src/services/crimeFamily/ledger.ts
export function writeLedger(tx: Prisma.TransactionClient, row: LedgerRow): Promise<string>;   // F6; LedgerType gains "payday_clamp_return"

// src/services/crimeFamily/tx.ts
export function touchUser(tx: Prisma.TransactionClient, discordId: string, now: Date): Promise<void>;

// src/services/crimeFamily/names.ts
export type PublicTextCheck = { ok: true; text: string } | { ok: false; reason: string };
export function checkPublicText(raw: string, limits: { min: number; max: number }): PublicTextCheck;

// src/services/crimeFamily/voteRules.ts
export type VoteStatus = "OPEN" | "PASSED" | "FAILED" | "VOID";
export type VoidReason = "too_few" | "no_heir" | "chair_moved";
export function votePassNeed(eligible: number): number;               // ceil(2 × eligible / 3)
export function decideVote(i: { eligibleAtClose: number; yes: number; heirId: string | null; chairMoved: boolean }): { status: Exclude<VoteStatus, "OPEN">; voidReason: VoidReason | null };
export function voteCooldownUntil(status: Exclude<VoteStatus, "OPEN">, voidReason: VoidReason | null, closedAt: Date): Date;
export function voidReasonOf(v: Pick<FamilyVote, "status" | "eligibleAtClose" | "cooldownUntil" | "closedAt">): VoidReason | null;

// src/services/crimeFamily/voteHooks.ts
export const VOTE_FAMILY_HOOK: FamilyHook;
export function hasOpenVote(db: Prisma.TransactionClient, familyId: string): Promise<boolean>;
export function voidOpenVotesInTx(tx: Prisma.TransactionClient, familyId: string, now: Date): Promise<void>;

// src/services/crimeFamily/voteService.ts
export function voteStartBlock(db: Prisma.TransactionClient, familyId: string, actorId: string, now: Date): Promise<string | null>;
export function startVote(actorId: string, now?: Date): Promise<FamilyVote>;
export function castBallot(voteId: string, userId: string, choice: "YES" | "NO", now?: Date): Promise<FamilyVote>;
export function closeVote(voteId: string, now: Date): Promise<FamilyVote | null>;
export function openVoteOf(familyId: string): Promise<FamilyVote | null>;
export function claimVoteAnnouncement(voteId: string, which: "start" | "result"): Promise<boolean>;
export function setVoteMessage(voteId: string, expectMessageId: string, channelId: string, messageId: string): Promise<boolean>;
export function claimVoteRepost(voteId: string): Promise<boolean>;     // F9: reposted false → true, once per vote (Task 11)
export function votesDue(now: Date): Promise<{ close: string[]; announceStart: string[]; announceResult: string[] }>;
export function getVoteView(voteId: string, viewerId: string | null, now: Date): Promise<VoteView | null>;
export function getVoteStartView(actorId: string, now: Date): Promise<VoteStartView>;

// src/handlers/crewRouteKit.ts  (Task 11; a leaf: imports no route table)
export const show: (i: CfInteraction, payload: CfPayload) => Promise<void>;
export const showThenAnnounce: (i: CfInteraction, payload: CfPayload | Promise<CfPayload>, announce: () => Promise<unknown>) => Promise<void>;
export const notice: (text: string) => CfPayload;
export const owner: (args: string[]) => string;
export const auto: (run: CfRoute) => CfRouteEntry;
export const update: (run: CfRoute) => CfRouteEntry;
export function assertEnabled(): void;                                 // "Crime Families are not open yet." unless CRIME_FAMILY_CONFIG.enabled

// src/handlers/crimeFamilyRouter.ts
const TABLES = { crew: { ...CREW_ROUTES, ...VOTE_ROUTES, ...RECRUIT_ROUTES }, cpr: CAPER_ROUTES, turf: TURF_ROUTES };   // Tasks 11, 15

// src/ui/crimeFamily/voteAnnounce.ts
export function announceVoteStart(client: Client, voteId: string): Promise<void>;
export function announceVoteResult(client: Client, voteId: string): Promise<void>;
export function requestVoteRender(client: Client, voteId: string): Promise<void>;
export function announcePendingVoteResults(client: Client, familyId: string): Promise<void>;

// src/services/crimeFamily/recruitService.ts
export type BoardSort = "lvl" | "mem" | "act";                         // defined here (Task 12) so ids.ts (Task 13) can type the board id before recruitQueries.ts exists
export type Requirements = { netWorth: number; shifts: number; ageDays: number; heists: number };
export const REQUIREMENTS: readonly { key: keyof Requirements; label: string; field: keyof Family; max: number; unit: string }[];
export type ListingInput = { pitch: string; minNetWorth: string; minShifts: string; minAgeDays: string; minHeists: string };
export type RequirementParse = { ok: true; value: number } | { ok: false; reason: string };
export function parseRequirement(raw: string, max: number): RequirementParse;   // F18
export function editListing(actorId: string, input: ListingInput, now?: Date): Promise<Family>;
export function setRecruiting(actorId: string, on: boolean, now?: Date): Promise<Family>;
export function applyToFamily(i: { applicantId: string; familyId: string; message: string; guildId: string; channelId: string; now?: Date }): Promise<FamilyInvite>;
export function withdrawApplication(appId: string, applicantId: string, now?: Date): Promise<FamilyInvite>;
export function acceptApplication(appId: string, officerId: string, now?: Date): Promise<{ family: Family; member: FamilyMember; application: FamilyInvite }>;
export function declineApplication(appId: string, officerId: string, now?: Date): Promise<FamilyInvite>;
export function familiesDueDigest(now: Date): Promise<string[]>;
export function claimDigest(familyId: string, now: Date): Promise<number>;   // new applications since the last digest; 0 when none or the CAS lost

// src/services/crimeFamily/recruitQueries.ts
export type { BoardSort } from "./recruitService";
export type ApplicantStats = Requirements;                             // Requirements is exported by recruitService.ts
export function applicantStats(uid: string, now: Date, opts: { cached: boolean }): Promise<ApplicantStats>;
export function getBoardView(viewerId: string, sort: BoardSort, qualifyOnly: boolean, page: number, now: Date): Promise<BoardView>;
export function getFamilyCardView(familyId: string, viewerId: string, now: Date): Promise<FamilyCardView>;
export function getRecruitPanelView(officerId: string, now: Date): Promise<RecruitPanelView>;
export function getInboxView(officerId: string, page: number, now: Date): Promise<InboxView>;
export function getMyApplicationsView(uid: string, now: Date): Promise<MyApplicationsView>;

// test/helpers.ts
export interface SeedFamilyOpts { /* existing */ bossSince?: Date; data?: Partial<Prisma.FamilyUncheckedCreateInput>; members?: { userId: string; role: FamilyRole; joinedAt?: Date; lastActiveAt?: Date; capers?: number; officerUntil?: Date }[] }
export function seedApplication(o: { familyId: string; applicantId: string; status?: string; message?: string; createdAt?: Date; resolvedAt?: Date; expiresAt?: Date; inviterId?: string }): Promise<FamilyInvite>;
export function seedVote(o: { familyId: string; bossId: string; starterId: string; eligibleIds: string[]; status?: string; closesAt?: Date; createdAt?: Date; cooldownUntil?: Date; closedAt?: Date; announced?: boolean; resultAnnounced?: boolean }): Promise<FamilyVote>;
```

```ts
// src/services/crimeFamily/familyQueries.ts  (F22)
export function investigationOf(familyId: string): Promise<{ hot: number; threshold: number; under: boolean }>;

// src/ui/crimeFamily/ids.ts: CREW_IDS gains (Tasks 6, 11, 13); BoardSort is `import type` from recruitService.ts
manageSelect: (page: number, owner: string) => string;      // crew:mg:sel:<page>:<owner>
managePage: (page: number, owner: string) => string;        // crew:mg:pg:<page>:<owner>
voteStart / voteOk / voteCancel: (owner: string) => string; // crew:vt:<start|ok|cancel>:<owner>
ballot: (choice: "yes" | "no", voteId: string) => string;   // crew:vote:<yes|no>:<voteId>
board: (sort: BoardSort, qualify: boolean, page: number, owner: string) => string;   // crew:bd:<sort>:<0|1>:<page>:<owner>
boardSelect, myApps, withdraw: (owner: string) => string;   // crew:bd:sel / crew:app:mine / crew:app:wd
familyCard, applyOpen, applyModal: (familyId: string, owner: string) => string;      // crew:fc / crew:app:open / crew:modal:apply
recruit: (kind: "home" | "toggle" | "inbox", owner: string) => string;              // crew:rc:<kind>:<owner>
recruitEdit: (r: Requirements, owner: string) => string;   // crew:rc:edit:<nw>:<sh>:<age>:<heists>:<owner> (F10)
recruitModal: (owner: string) => string;                    // crew:modal:recruit:<owner>
appAnswer: (answer: "accept" | "decline", appId: string, owner: string) => string;   // crew:ap:<answer>:<appId>:<owner>
inboxPage: (page: number, owner: string) => string;         // crew:ap:pg:<page>:<owner>
```

View types (`src/services/crimeFamily/views.ts`) added by the tasks that produce them: `FamilyDashboardView` gains `capos`, `capoCap` (Task 7), `vote: { voteId: string; closesAt: Date; viewerEligible: boolean } | null`, `viewer.canStartVote` (Task 11), `recruiting`, `viewer.canRecruit` (Task 15); `PaydayPreview.ineligible[]` gains `need` (Task 8); `CaperPlannerView` gains `heistCap` and `investigationThreshold` (Task 5); new `VoteStartView` (Task 9), `VoteView` (Task 10), `ReqCheck`, `BoardView`, `FamilyCardView`, `RecruitPanelView`, `InboxView`, `MyApplicationsView` (Task 14). Starred seams for plans 5 and 6 are marked `*` in the comment above each block; everything else is consumed inside this plan.

---

### Task 1: The Crew Heist rename (player copy, `!heist`, `/heist`)

**Files:**
- Create: `test/crimeFamily/visibleText.ts`, `test/crimeFamily/rename-copy.test.ts`
- Modify:
  - `src/commandRouter.ts`: the alias map (`:196-197`) drops `capers: "caper"` and gains `crewheist: "heist"`, `caper: "heist"`, `capers: "heist"`; `case "caper":` (`:573`) becomes `case "heist":` (same lazy `require("./commands/economy/caper")`); the did-you-mean list (`:642`) says `"heist"`.
  - `src/slash/registry.ts:250-259`: `name: "heist", desc: "Crew heists: plan, join and play with your family"`; options unchanged.
  - `src/services/dmPrefsService.ts:19`, `:27`: `caper: { label: "Crew heist", command: "!heist", group: "cooldown" }`, `caper_lobby: { label: "Crew heist lobby", group: "account" }`.
  - Player strings only in: `src/services/dmNoticeService.ts` (`caperLobbyNotice`, `caperGoNotice`, `turfNeglectNotice`), `src/services/crimeFamily/{caperLobbyService,caperPlayService,caperQueries,caperSettleService,caperHooks,eligibility}.ts`, `src/ui/crimeFamily/{caperScreens,caperFlow,caperCard,familyScreens}.ts`, `src/handlers/caperInteractionHandler.ts`, `src/commands/economy/caper.ts`, `src/commands/general/{help,tutorial}.ts` (`:318-328`, `:180`), `src/scripts/fixtures/{caperScreens,crimeFamilyScreens}.ts`.
  - Docs copy: `dashboard/src/content/modules/{crime-families,crime-and-heat}.ts`, `dashboard/src/content/commands.ts:77-78`, `:274-294`, `dashboard/src/app/changelog/page.tsx:143-157`, `FORTUNA_V2_ECONOMY.md:217-396`.
  - Tests that pin old copy: `test/anticheat/{caper-join.race,family-disband.race,family-membership.race,family-tester}.test.ts`, `test/crimeFamily/{caper-command,caper-handlers,caper-hooks,caper-play,handlers}.test.ts`, `test/dm/{turf-notice,family-notice}.test.ts`, `test/general/help-crime-families.test.ts`, `test/router/crew-jail.test.ts`.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `visibleText(payload: unknown): string` in `test/crimeFamily/visibleText.ts`: walks a payload (builders are `toJSON()`ed first) and joins every value under the keys `content`, `label`, `placeholder`, `description`, `title`, `value`, `name` **except** when the parent key is `emoji`; it never reads `custom_id`, `url` or `media`. Tasks 11 and 14 reuse it.
  - Copy rules every later task follows: "Crew Heist" in titles and buttons, "crew heist(s)" in sentences, `!heist`/`/heist`/`{p}heist` in usage.

Exact replacements the test pins (the rest follow the rule mechanically):

| Where | Old | New |
|---|---|---|
| S2 button (`familyScreens.ts`) | `Caper` | `Crew Heist` |
| `LEDGER_LABELS.caper_cut` | `Caper cut` | `Crew heist cut` |
| `MANAGE_LEGEND` | `can't take caper seats` | `can't take crew heist seats` |
| S8 (`familyScreens.ts:287`) | `tier N capers` | `tier N crew heists` |
| `CAPER_ACTIVITY_RULE.label` (`caperHooks.ts:25`) | `caper seats` | `crew heist seats` |
| `isActiveMember` (`eligibility.ts:41`) | `recent caper or war play` | `recent crew heist or war play` |
| trade log (`caperFlow.ts:189`) | `Caper resolved` | `Crew heist resolved` |
| `LIVE_CAPER` (`caperLobbyService.ts:23`) | `…a live caper.` | `…a live crew heist.` |
| help entry | `name: "caper", aliases: ["capers"]` | `name: "heist", aliases: ["crewheist", "caper", "capers"]` |
| tutorial | `` `{p}caper` — plan or join a family caper`` | `` `{p}heist` — plan or join a crew heist`` |
| `commands.ts` | `id: "caper"`, `name: "!caper"` | `id: "heist"`, `name: "!heist"`, aliases `["crewheist", "caper", "capers"]` |

Internal identifiers listed in the Global Constraints copy rule, `throw new Error(...)` developer messages in `crimeFamilyCatalog.ts`, code comments and the solo `!crime` "Legendary" tier do not change.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/rename-copy.test.ts
import { describe, it, expect, vi } from "vitest";
import type { Client } from "discord.js";
import { visibleText } from "./visibleText";
import { crimeFamilyWorstCases } from "../../src/scripts/fixtures/crimeFamilyScreens";
import * as dm from "../../src/services/dmNoticeService";
import { DM_NOTICE_TYPES } from "../../src/services/dmPrefsService";
import { SPECS } from "../../src/slash/registry";
import { routeMessage } from "../../src/commandRouter";
import { fakeMessage, replyText } from "../router/fakeMessage";
import { CATEGORIES, buildModuleView } from "../../src/commands/general/help";
import { LESSONS } from "../../src/commands/general/tutorial";
import { seedEligibleUser, withCfConfig } from "../helpers";

// As test/router/dispatch.test.ts: the router's import graph reaches canvas, which is not built here.
// routeMessage loads command handlers through a lazy require() that fakeMessage sends through ts-node,
// so vi.mock never sees it: the routing cases assert on the reply text instead.
vi.mock("canvas", () => ({}));

const OLD = /\bcapers?\b/i;
async function route(content: string, authorId: string): Promise<string> {
  const { message, reply } = fakeMessage(content, { authorId, guildId: "g1" });
  await routeMessage({} as Client, message, "!");
  return reply.mock.calls.map((c) => replyText(c[0])).join("\n");
}

describe("Crew Heist rename (amendment 9)", () => {
  it("no worst-case screen shows 'caper'", () => {
    for (const c of crimeFamilyWorstCases()) expect(visibleText(c.payload), c.label).not.toMatch(OLD);
  });
  it("no DM builder or DM pref label shows 'caper'", () => {
    const at = new Date();
    const built = [
      dm.caperLobbyNotice({ tierName: "Warehouse Job", stake: 300_000, closesAt: at, familyLabel: "[VLA] Velvet Ante", jumpUrl: null }),
      dm.caperGoNotice({ tierName: "Warehouse Job", goEndsAt: at, jumpUrl: null }),
      dm.turfNeglectNotice({ racketName: "Docks", strikes: 1, max: 3 }),
    ];
    for (const c of built) expect(visibleText(c)).not.toMatch(OLD);
    expect(DM_NOTICE_TYPES.caper).toEqual({ label: "Crew heist", command: "!heist", group: "cooldown" });
    expect(DM_NOTICE_TYPES.caper_lobby.label).toBe("Crew heist lobby");
  });
  it("help, tutorial and slash say heist", () => {
    const cat = CATEGORIES.find((c) => c.id === "crimefamilies")!;
    const help = visibleText(buildModuleView(cat, "!")).replace(/crewheist\W+caper\W+capers/gi, "");   // the alias list may name them
    expect(help).not.toMatch(OLD);
    expect(JSON.stringify(LESSONS.find((l) => l.id === "crimefamilies"))).not.toMatch(/`\{p\}caper/);
    expect(SPECS.some((s) => s.name === "heist")).toBe(true);
    expect(SPECS.some((s) => s.name === "caper")).toBe(false);
  });
  it.each(["!heist", "!crewheist", "!caper", "!capers"])("%s routes to the heist handler", async (cmd) => {
    // The heist handler's own non-member refusal (caper.ts `view`); `!crew` would show S1 instead.
    const on = await withCfConfig({ enabled: true, allowGuildIds: null }, async () => route(cmd, await seedEligibleUser()));
    expect(on).not.toContain("Unknown Command");
    expect(on).toContain("You are not in a crime family. Start with");
    const off = await withCfConfig({ enabled: false }, async () => route(cmd, await seedEligibleUser()));
    expect(off).toContain("Crime Families are not open in this server yet.");
  });
});
```

The help assertion allows the alias list `caper, capers` (the help entry must name its aliases); every other occurrence fails. Add one more `it` that settles a heist through `test/crimeFamily/caperFixtures.ts`'s `seedRunning` + `resolveAndAnnounce` with `vi.spyOn` on `src/utils/discordLogger`'s `logToChannel` (pool ≥ `caperTradeLogMinPool`) and asserts `visibleText` of every logged payload has no `OLD` match, and one that renders `buildCrimeBoardPayload` (`src/commands/economy/crimeUi.ts:76`) for a legendary session and still contains `"Legendary"`. Add one that reads `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/modules/crime-and-heat.ts` and `dashboard/src/content/commands.ts` with `readFileSync` (the dashboard is a separate project, so the test reads text, not modules), drops every line containing `aliases:` and every `/art/…` path, and expects no `OLD` match.

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/rename-copy.test.ts`
Expected: FAIL: screens contain "Caper", `/heist` missing, `!heist` replies "Unknown Command".

- [ ] **Step 3: Rename the command and slash spec**

`commandRouter.ts` and `registry.ts` as listed in Files. `npm run validate:slash` must still print 73/100.

- [ ] **Step 4: Sweep the player copy**

Run: `grep -rnE '\bcapers?\b' src --include='*.ts' -i | grep -vE '^\S+:\s*(//|\*)|import |cfId\(|cpr:|caper_(t[1-4]|cut|stake|lobby|seats|corrupt)|"caper"|emojiKey|bannerKey|new Error'`
Change every remaining string literal a player can see per the table and the copy rule, then re-run the grep until only identifiers, comments and the help alias list remain.

- [ ] **Step 5: Update the tests that pin old copy**

Change each `toContain`/`toMatch`/`toThrow` string in the test files listed in Files to the new copy (for example `"Your family already has a live crew heist."`). Do not change customIds or model names in tests.

- [ ] **Step 6: Rename the docs copy**

The dashboard module and commands entries, the changelog's unreleased entry and `FORTUNA_V2_ECONOMY.md` say "Crew Heist"/"crew heist(s)" and `!heist`; `commands.ts:77-78` `keyNumbers` read "…crime, crew heist, hunt…" and "…crime family, crew heist lobby, turf wars". `crime-and-heat.ts:32` says "For crew jobs see Crime Families: Crew Heists."

- [ ] **Step 7: Run the affected suites and the static checks**

Run: `$VT test/crimeFamily test/anticheat test/dm test/general test/router && npm run typecheck && npm run validate:slash && (cd dashboard && npx tsc --noEmit -p .)`
Expected: PASS; 73/100 slash commands.

- [ ] **Step 8: Commit**

```bash
git add -A src test dashboard/src FORTUNA_V2_ECONOMY.md
git commit -m "feat(crime-families): rename player-facing Caper to Crew Heist; !heist and /heist with caper aliases"
```

---

### Task 2: The schema, the new config keys and the test helpers

**Files:**
- Modify: `prisma/schema.prisma` (`Family` `:749-776`, `FamilyMember` `:777-795`, `FamilyInvite` `:807-826`, `FamilyLedger` type comment `:827`, `CaperCrew` `:871-899`, `WarHit` `:970-`), `src/utils/economyConfig.ts:200-268`, `test/helpers.ts`
- Create: `test/crimeFamily/scale-schema.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - Prisma models exactly as the amendment's §2.4 (`PaydayShare`), §4.4 (`FamilyVote`, `FamilyBallot`, the three `FamilyMember` fields) plus one field the amendment lacks, `FamilyVote.reposted Boolean @default(false) // the one S34 repost of F9 is spent`, §6.7 (`CfJobRun` only), §7.5 (`BotProcessBoot`) and Appendix A for `Family` (only `memberCount`, `activeMembers`, `censusAt`, the eight recruit fields and the three `@@index([recruiting, …])`), `FamilyMember`, `FamilyInvite` (`kind`, `message`, status comment, both indexes), `CaperCrew` (only `@@index([started, startedAt])`) and `WarHit` (`@@index([state, createdAt])`). Not in this plan: `Family.cityId`, `cityPlacedAt`, `@@index([cityId])`, `@@index([level, activeMembers])`, `TurfCity`, the `Racket`/`War` changes (plan 6) and `CaperCrew.sharedIntel/sharedAt/relayed` (plan 5).
  - `CRIME_FAMILY_CONFIG` gains every §11.1 key except `familiesPerCity` and `citySurplusDaysToClose` (plan 6). `capersPerFamilyPer24h` stays until Task 5 and `joinsPerFamilyPer7d` until Task 4, each removed by the task that replaces its reader.
  - `test/helpers.ts` per the Interfaces block at the top: `seedFamily` writes `memberCount: 1 + members.length`, the Boss row `bossedOnce: true, firstBossAt: opts.bossSince ?? daysAgo(30)`, each member's optional `officerUntil`, and spreads `opts.data` into the family create last; `resetFamilies` also empties `familyBallot`, `familyVote`, `paydayShare`, `cfJobRun`, `botProcessBoot` (first, before `familyInvite`); `seedApplication` creates `kind: "APPLICATION"`, `inviterId` default `""`, `status` default `"PENDING"`, `slot` = `"PENDING"` when PENDING else the row id (create then update), `guildId`/`channelId` `"g1"`/`"c1"`, `expiresAt` default now + `applicationTtlSeconds`; `seedVote` creates the vote (`liveSlot` `"LIVE"` when OPEN, else its id after create) plus nothing else.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/scale-schema.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { testPrisma, seedEligibleUser, seedFamily, seedApplication, seedVote, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";
import { CRIME_FAMILY_CONFIG as C } from "../../src/utils/economyConfig";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyVote", "FamilyBallot", "PaydayShare", "CfJobRun"]));
beforeEach(resetFamilies);

describe("scale schema defaults (Appendix A)", () => {
  it("a seeded family counts its members and marks its Boss's first chair", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER" }] });
    expect(f.memberCount).toBe(2);
    expect(f.recruiting).toBe(false);
    const b = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } });
    expect(b.bossedOnce).toBe(true);
    expect(+b.firstBossAt).toBeLessThan(+daysAgo(29));
    const m = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: s } });
    expect(m.bossedOnce).toBe(false);
    expect(+m.officerUntil).toBeLessThanOrEqual(Date.now());
  });
  it("invites default to kind INVITE; applications and votes seed with their sentinels", async () => {
    const boss = await seedEligibleUser(); const f = await seedFamily({ bossId: boss });
    const a = await seedApplication({ familyId: f.id, applicantId: "777" });
    expect(a).toMatchObject({ kind: "APPLICATION", status: "PENDING", slot: "PENDING", inviterId: "" });
    const v = await seedVote({ familyId: f.id, bossId: boss, starterId: "1", eligibleIds: ["1", "2", "3"] });
    expect(v).toMatchObject({ status: "OPEN", liveSlot: "LIVE", announced: false, resultAnnounced: false, reposted: false });
    await expect(seedVote({ familyId: f.id, bossId: boss, starterId: "2", eligibleIds: [] })).rejects.toMatchObject({ code: "P2002" });
  });
  it("adds the scale config keys", () => {
    expect(C).toMatchObject({ heistCapMin: 4, heistCapDivisor: 3, capoPerMembers: 5, capoMinNetWorth: 10_000_000, investigationDivisor: 4,
      joinsPerFamilyPer7dMin: 5, joinsPerFamilyDivisor: 3, paydayShareResumeSeconds: 60, voteSeconds: 172_800, voteMinEligible: 3,
      applicationTtlSeconds: 259_200, maxPendingApplicationsPerApplicant: 3, maxPendingApplicationsPerFamily: 25,
      reapplyAfterDeclineSeconds: 604_800, reapplyAfterWithdrawSeconds: 86_400, appDigestEverySeconds: 21_600,
      boardPageSize: 6, inboxPageSize: 5, managePageSize: 15 });
    expect(C.recruitLimits).toEqual({ netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/scale-schema.test.ts`
Expected: FAIL: `seedApplication` is not exported, `memberCount` is undefined.

- [ ] **Step 3: Write the schema, config and helpers**

Field comments copy the amendment's. `FamilyMember.roleSlot` comment `"CAPO1".."CAPO6"`, `seat` comment `1..30`. `FamilyLedger.type` comment gains `payday_clamp_return`. Then run `npx prisma format && npx prisma validate && npx prisma generate`.

- [ ] **Step 4: Run the test and the existing family suites**

Run: `$VT test/crimeFamily/scale-schema.test.ts test/crimeFamily test/anticheat && npm run typecheck`
Expected: PASS (no behaviour changed yet).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/utils/economyConfig.ts test/helpers.ts test/crimeFamily/scale-schema.test.ts
git commit -m "feat(crime-families): scale schema (memberCount, votes, applications, payday shares, job runs, process boots) and config keys"
```

---

### Task 3: Sharding-ready: one job shard, the REST seam and process boots

**Files:**
- Create: `src/utils/shard.ts`, `src/utils/restMessages.ts`, `src/services/processBootService.ts`, `test/crimeFamily/sharding.test.ts`
- Modify:
  - `src/ui/crimeFamily/post.ts:12-49`: `PostableChannel` and `fetchPostable` go; `sendToChannel` returns `await restSend(...)`, `editChannelMessage` awaits `restEdit(...)`; the catch blocks and `DEAD_CODES` stay as they are.
  - `src/services/crimeFamily/scheduler.ts`: add `startCrimeFamilyJobs` (F14) after `registerCrimeFamilyJobs` (`:148-156`).
  - `src/scheduler.ts:10-11`, `:75-76`: import and call `startCrimeFamilyJobs(client)` in place of `registerCrimeFamilyJobs(client)` and the `seedRackets()` line.
  - `src/index.ts:70-93`: in the `ready` handler, after `prisma.$connect()` and before `initScheduler(client)`: `await recordProcessBoot(client).catch((err) => console.error("[crimeFamily] recordProcessBoot failed:", err));`.
  - `src/services/crimeFamily/caperSettleService.ts:31-34`, `:63-71`: `processBootedAt` and the `bootedAt` parameter go; `:71` becomes `if (unlocked && (await bootedSince(caper.startedAt))) return voidRun(caper, false);`.
  - `src/services/crimeFamily/caperSweeper.ts:45`, `:55`: `sweepCapers(client, now)` (no `bootedAt`).
  - `src/ui/crimeFamily/caperFlow.ts:18`, `:179-180`: `resolveAndAnnounce(client, caperId, now)`.
  - Test doubles (F15): `test/crimeFamily/fakeClient.ts`, `test/crimeFamily/caperFixtures.ts:125-159` (`fakeCaperClient`), `test/crimeFamily/fakeInteraction.ts:20-24` gain `options: {}` and `rest: { post, patch }`; `channels.fetch` stays only for `pickLobbyChannel`.
  - Tests that pass a boot time or read builder payloads from the fakes: `test/crimeFamily/{caper-flow,caper-sweeper,caper-cache,caper-command,turf-announce}.test.ts`, `test/anticheat/{caper-settle.race,family-redis-down}.test.ts`.
  - `test/crimeFamily/ids-post.test.ts:51-90` ("channel I/O"): its own `fake()` builds a `channels.fetch` channel double for `post.ts`; rewrite it as a `rest` double (`{ rest: { post: vi.fn(async () => { if (fail.send) throw fail.send; return { id: "m1" }; }), patch: vi.fn(async () => { if (fail.edit) throw fail.edit; return {}; }) } }`). "sends and edits without fetching the message" asserts `rest.patch` was called once with `Routes.channelMessage("c1", "m9")`; the dead-code `it.each` loops over `["send", "edit"]` only (there is no fetch step any more): a dead send is `null` and leaves edit `"ok"`, a dead edit is `"dead"` and leaves send `"m1"`.
  - `test/crimeFamily/scheduler.test.ts:57`: `c.sent[0].allowedMentions` becomes `c.sent[0].allowed_mentions` (`{ parse: [], users: [ub] }`); every other `allowedMentions` read of a fake's `sent`/`edits`/`calls` payload in the files above changes the same way.

**Interfaces:**
- Consumes: nothing new.
- Produces: `isJobShard`, `restSend`, `restEdit`, `recordProcessBoot`, `bootedSince`, `startCrimeFamilyJobs`, the boot-free `resolveCaper`/`resolveAndAnnounce` (all as in the Interfaces block at the top).
  - `restSend`: `const mp = MessagePayload.create({ client } as unknown as MessageTarget, payload); const { body, files } = await mp.resolveBody().resolveFiles(); const msg = await client.rest.post(Routes.channelMessages(channelId), { body, files }) as { id: string }; return msg.id;`. `restEdit`: the same body through `client.rest.patch(Routes.channelMessage(channelId, messageId), { body, files })`. Both let `DiscordAPIError` propagate (its `code` is what `post.ts`'s `isDead` reads).
  - `recordProcessBoot(client, now = new Date())`: `botProcessBoot.create({ data: { shardIds: client.shard?.ids ?? [], bootedAt: now } })`.
  - `bootedSince(since)`: `(await prisma.botProcessBoot.count({ where: { bootedAt: { gt: since } } })) > 0`.
  - `startCrimeFamilyJobs(client)`: `if (!isJobShard(client)) return; registerCrimeFamilyJobs(client); seedRackets().catch((err) => console.error("[crimeFamily] seedRackets error", err));`.
  - The fakes' REST double: `post(route, { body, files })` parses the channel id out of `/channels/<id>/messages`, records `{ op: "send", channelId, payload: { ...body, files } }` in `calls` and `sent`, and returns `{ id: "m<n>" }`; `patch` parses `/channels/<id>/messages/<mid>` and records an `edit`. A dead channel (`fakeClient({ dead: true })`, `failSend`, `failEdit`, `sendFailures`, `editFailures`) throws `Object.assign(new Error(...), { code })` with the same codes as today. Assertions read `payload.components[0]` (already JSON) and `payload.allowed_mentions`.

- [ ] **Step 1: Write the failing test**

```ts
// test/crimeFamily/sharding.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import cron from "node-cron";
import { readFileSync } from "node:fs";
import { isJobShard } from "../../src/utils/shard";
import { CF_SCHEDULES, startCrimeFamilyJobs } from "../../src/services/crimeFamily/scheduler";
import { editChannelMessage, sendToChannel } from "../../src/ui/crimeFamily/post";
import { buildNotice } from "../../src/ui/crimeFamily/kit";
import { recordProcessBoot, bootedSince } from "../../src/services/processBootService";
import { fakeClient } from "./fakeClient";
import { resetFamilies } from "../helpers";

vi.mock("../../src/services/crimeFamily/racketService", async (orig) => ({ ...(await orig<object>()), seedRackets: vi.fn(async () => undefined) }));
beforeEach(resetFamilies);

describe("one job shard (A29)", () => {
  it.each([[null, true], [{ ids: [0] }, true], [{ ids: [0, 1] }, true], [{ ids: [1] }, false]])("shard %j → %s", (shard, want) => {
    expect(isJobShard({ shard: shard as any })).toBe(want);
  });
  it("registers every family schedule on the job shard and none elsewhere", () => {
    const spy = vi.spyOn(cron, "schedule").mockImplementation(() => ({}) as any);
    startCrimeFamilyJobs({ shard: { ids: [1] } } as any);
    expect(spy).not.toHaveBeenCalled();
    startCrimeFamilyJobs({ shard: null } as any);
    expect(spy).toHaveBeenCalledTimes(CF_SCHEDULES.length);
    spy.mockRestore();
  });
  it("initScheduler registers family jobs only through startCrimeFamilyJobs", () => {
    const src = readFileSync("src/scheduler.ts", "utf8");
    expect(src).toContain("startCrimeFamilyJobs(client)");
    expect(src).not.toMatch(/registerCrimeFamilyJobs\(|seedRackets\(/);
  });
});

describe("REST seam (A28)", () => {
  it("posts and edits through client.rest for a guild this process does not cache", async () => {
    const fc = fakeClient();
    (fc.client as any).guilds = { cache: new Map() };
    const id = await sendToChannel(fc.client as any, "c-far", buildNotice("hello"));
    expect(id).toBe("m1");
    expect(await editChannelMessage(fc.client as any, "c-far", "m1", buildNotice("edited"))).toBe("ok");
    expect(fc.calls.map((c) => [c.op, c.channelId])).toEqual([["send", "c-far"], ["edit", "c-far"]]);
    expect(fc.calls[0].payload.allowed_mentions).toEqual({ parse: [] });
    expect((fc.client as any).channels.fetch).not.toHaveBeenCalled();
  });
  it("a REST 10008 marks the board dead", async () => {
    const fc = fakeClient({ dead: true });
    expect(await editChannelMessage(fc.client as any, "c1", "m9", buildNotice("x"))).toBe("dead");
    expect(await sendToChannel(fc.client as any, "c1", buildNotice("x"))).toBeNull();
  });
});

describe("process boots (A30)", () => {
  it("bootedSince sees a boot written by another shard", async () => {
    const t = new Date();
    expect(await bootedSince(t)).toBe(false);
    await recordProcessBoot({ shard: { ids: [3] } }, new Date(+t + 1_000));
    expect(await bootedSince(t)).toBe(true);
  });
});
```

Add to `test/anticheat/caper-settle.race.test.ts` (replacing every `OLD_BOOT`/`bootedAt` argument; the old "boot offset" cases become boot rows): a `BotProcessBoot` row with `shardIds: [3]` and `bootedAt` inside GO voids a run with an unlocked seat; the same row does not void a run where every seat locked; a row dated before `startedAt` voids nothing.

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/crimeFamily/sharding.test.ts`
Expected: FAIL: `src/utils/shard` does not exist.

- [ ] **Step 3: Implement the five seams and the fakes**

Per Files and Interfaces. `restMessages.ts` imports `MessagePayload`, `Routes`, `type Client`, `type MessageCreateOptions`, `type MessageEditOptions`, `type MessageTarget` from `discord.js`.

- [ ] **Step 4: Update the boot-time callers and the payload assertions**

Remove the `bootedAt` arguments in the tests listed in Files; a test that needs "restarted" seeds a `BotProcessBoot` row, one that needs "not restarted" seeds nothing (`resetFamilies` empties the collection). Replace `payload.components[i].toJSON()` with `payload.components[i]` and `allowedMentions` with `allowed_mentions`.

- [ ] **Step 5: Run the family suites**

Run: `$VT test/crimeFamily test/anticheat && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/utils/shard.ts src/utils/restMessages.ts src/services/processBootService.ts src/ui/crimeFamily/post.ts src/services/crimeFamily/scheduler.ts src/scheduler.ts src/index.ts src/services/crimeFamily/caperSettleService.ts src/services/crimeFamily/caperSweeper.ts src/ui/crimeFamily/caperFlow.ts test
git commit -m "feat(crime-families): family jobs on the job shard only, channel I/O through REST, restart VOID from process boots"
```

---

### Task 4: Bigger families: member caps, `memberCount`, join caps and the shared join path

**Files:**
- Create: `src/services/crimeFamily/sizeRules.ts`, `test/crimeFamily/size-rules.test.ts`
- Modify:
  - `src/data/crimeFamilyCatalog.ts:238-247`: `memberCap` 10, 12, 14, 16, 18, 20, 23, 25, 28, 30.
  - `src/services/crimeFamily/membershipService.ts`: `assertJoinCaps` (`:24-36`) takes the family level and reads `joinsPerFamilyFor(level)`; the body of `acceptInvite` after its invite CAS (`:116-128`) moves into exported `joinFamilyInTx`; the retry loop (`:108-138`) becomes exported `withSeatRetry`; `removeMember` (`:194-206`) decrements `memberCount` right after its `deleteMany`.
  - `src/utils/economyConfig.ts`: remove `joinsPerFamilyPer7d`.
  - `test/crimeFamily/catalog.test.ts:55`, `test/anticheat/family-membership.race.test.ts`.

**Interfaces:**
- Consumes: `CRIME_FAMILY_CONFIG` keys from Task 2; `levelDef`.
- Produces: `heistCapFor`, `capoCapFor`, `investigationThresholdFor`, `joinsPerFamilyFor` (formulas in the top Interfaces block; F2); `joinFamilyInTx(tx, { familyId, uid, inviterId, now })` and `withSeatRetry(fn, { alreadyInFamily })`.
  - `joinFamilyInTx` order: `checkMemberEligibility(uid, "family_join", { now, familyId })` (refusal `eligibilityError`); read the family (missing → `"That family no longer exists."`); `assertJoinCaps(tx, familyId, family.level, inviterId, now, 1)`; lowest free seat in `1..levelDef(level).memberCap` (none → `"Family is full."`); create the SOLDIER row exactly as today; `tx.family.update({ where: { id }, data: { memberCount: { increment: 1 } } })`; `touchFamily`; return `{ family: <re-read after the writes>, member }`. Task 12 appends the applicant's-applications step to its end.
  - `withSeatRetry(fn, msgs: { alreadyInFamily: string })`: runs `fn` up to 3 times while it throws P2002 on `FamilyMember_familyId_seat_key` (then `"Vault busy, try again."`); maps `FamilyMember_userId_key` to `msgs.alreadyInFamily` (the presser is not always the joiner: `acceptInvite` passes `"You are already in a family."`, Task 13's `acceptApplication` passes `` `<@${applicantId}> is already in a family.` ``); rethrows anything else.
  - Join cap refusal: `` `Your family can take ${joinsPerFamilyFor(level)} new members per 7 days.` `` The two `count`s stay kind-agnostic, so Task 12's accepted applications count against both caps without another change.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/size-rules.test.ts
import { describe, it, expect } from "vitest";
import { heistCapFor, capoCapFor, investigationThresholdFor, joinsPerFamilyFor } from "../../src/services/crimeFamily/sizeRules";

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("size rules (amendment 2.2, 3.2)", () => {
  it("heist cap: 4 up to 12 members, then ceil(n / 3)", () => {
    expect(range(1, 30).map(heistCapFor)).toEqual(range(1, 30).map((n) => Math.max(4, Math.ceil(n / 3))));
    expect([12, 13, 15, 16, 25, 30].map(heistCapFor)).toEqual([4, 5, 5, 6, 9, 10]);
  });
  it("capo cap: max(1, floor(n / 5))", () => {
    expect([1, 9, 10, 14, 15, 19, 20, 24, 25, 29, 30].map(capoCapFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  });
  it("investigation threshold: max(3, ceil(n / 4)); 8 at 30", () => {
    expect([1, 12, 13, 16, 17, 29, 30].map(investigationThresholdFor)).toEqual([3, 3, 4, 4, 5, 8, 8]);
  });
  it("joins per 7 days by level: 5 5 5 6 6 7 8 9 10 10", () => {
    expect(range(1, 10).map(joinsPerFamilyFor)).toEqual([5, 5, 5, 6, 6, 7, 8, 9, 10, 10]);
  });
});
```

`catalog.test.ts:55` expects `[10, 12, 14, 16, 18, 20, 23, 25, 28, 30]`. In `family-membership.race.test.ts` add:
- "memberCount equals the member rows after 6 concurrent accepts, 2 leaves and 2 kicks": an L3 family (cap 14) with 7 members and 6 PENDING invites from 3 Capos; run all ten in `Promise.allSettled`; `expect(family.memberCount).toBe(await testPrisma.familyMember.count({ where: { familyId } }))`.
- "a 30-member L10 family refuses the 31st accept with 'Family is full.' and keeps memberCount 30".
- "an L10 family takes 10 joins a week: the 10th accept commits, the 11th reads 'Your family can take 10 new members per 7 days.'" (seed 9 ACCEPTED invites with `resolvedAt` 1 day ago from several inviters).

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/size-rules.test.ts test/crimeFamily/catalog.test.ts test/anticheat/family-membership.race.test.ts`
Expected: FAIL: `sizeRules` does not exist; caps are the old row.

- [ ] **Step 3: Implement**

`sizeRules.ts` imports only `CRIME_FAMILY_CONFIG` and `levelDef`. `acceptInvite` becomes: the existing pre-checks, then `withSeatRetry(() => runFamilyTx(async (tx) => { <invite CAS as today>; return joinFamilyInTx(tx, { familyId: invite.familyId, uid, inviterId: invite.inviterId, now }); }), { alreadyInFamily: "You are already in a family." })`.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/crimeFamily/size-rules.test.ts test/crimeFamily/catalog.test.ts test/anticheat/family-membership.race.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/sizeRules.ts src/data/crimeFamilyCatalog.ts src/services/crimeFamily/membershipService.ts src/utils/economyConfig.ts test/crimeFamily/size-rules.test.ts test/crimeFamily/catalog.test.ts test/anticheat/family-membership.race.test.ts
git commit -m "feat(crime-families): 10-30 member caps, a denormalized memberCount and size-scaled weekly joins"
```

---

### Task 5: The size-scaled heist cap and investigation threshold

**Files:**
- Modify:
  - `src/services/crimeFamily/caperLobbyService.ts:44-52` (`familyCaperBlock`), `:89-91` (the plan refusal).
  - `src/services/crimeFamily/familyQueries.ts:59-67`: `investigationOf` (F22); `isUnderInvestigation` returns `(await investigationOf(id)).under`.
  - `src/services/crimeFamily/caperQueries.ts:100-116` (`buildPlannerView`), `src/services/crimeFamily/views.ts:159-170` (`CaperPlannerView` gains `heistCap: number; investigationThreshold: number`), `src/ui/crimeFamily/caperScreens.ts:53-58` (S11 status).
  - `src/utils/economyConfig.ts`: remove `capersPerFamilyPer24h`.
  - `src/scripts/fixtures/caperScreens.ts` (S11 view literal gains the two fields).
- Test: `test/anticheat/caper-join.race.test.ts`, `test/crimeFamily/caper-layout.test.ts`

**Interfaces:**
- Consumes: `heistCapFor`, `investigationThresholdFor` (Task 4); `Family.memberCount`.
- Produces: `investigationOf(familyId)` (top Interfaces block); `CaperPlannerView.heistCap/investigationThreshold`.
  - `familyCaperBlock(family, now)` reads `family.memberCount` from the row it is given (callers already pass the row read before the transaction, inside the plan transaction and inside Start, `:92`, `:104`, `:297`). With `recent` oldest first and `cap = heistCapFor(family.memberCount)`: when `recent.length >= cap` the next slot is `windowEnd(recent[recent.length - cap].startedAt)` (a family over its cap after members left waits for enough runs to age out, edge 2.7.2). Copy: `` `Your family has run ${recent.length} crew heists in the last 24 hours (cap ${cap} for ${family.memberCount} members). Next slot ${rel(next)}.` ``
  - `investigationOf`: reads the family's `memberCount` (0 members or no family → `{ hot: 0, threshold: 3, under: false }`), counts members at `underInvestigationHeat` as today, `threshold = investigationThresholdFor(memberCount)`, `under = hot >= threshold`. Plan refusal: `` `Your family is under investigation: no crew heists until fewer than ${threshold} members are at ${CRIME_FAMILY_CONFIG.underInvestigationHeat} heat.` `` S11: `**Started:** x/${heistCap} in 24 h` and "Under investigation: no crew heists until fewer than ${investigationThreshold} members are at 100 heat."

- [ ] **Step 1: Write the failing tests**

Append to `test/anticheat/caper-join.race.test.ts` (it already has `plan`, `startCaper`, `T1`, `G`, `CH` and `caperCrew`; the block below adds its three imports). Also change the existing line 41 regex to `` /^Your family has run 4 crew heists in the last 24 hours \(cap 4 for 4 members\)\. Next slot <t:\d+:R>\.$/ `` and line 45's text to "…no crew heists until fewer than 3 members…".

```ts
import { leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { seedFamily, daysAgo } from "../helpers";
import { seedLobby } from "../crimeFamily/caperFixtures";

/** A level-10 family of n (the Boss can plan tier 1), off its cooldown. */
async function sized(n: number) {
  const boss = await seedEligibleUser({ wallet: 5_000_000 });
  const ids: string[] = [];
  for (let k = 0; k < n - 1; k++) ids.push(await seedEligibleUser());
  const f = await seedFamily({ bossId: boss, level: 10, homeGuildId: G, homeChannelId: CH, members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
  await testPrisma.family.update({ where: { id: f.id }, data: { nextCaperAt: daysAgo(1) } });
  return { f, boss, ids };
}
/** k started (RESOLVED) runs, the j-th started (k - j) hours ago, so index 0 is the oldest. */
async function startedRuns(familyId: string, plannerId: string, k: number) {
  for (let j = 0; j < k; j++) {
    const at = new Date(Date.now() - (k - j) * 3_600_000);
    await testPrisma.caper.create({ data: { familyId, tier: 1, status: "RESOLVED", liveSlot: `old${j}`, plannerId, guildId: G, channelId: CH, lobbyClosesAt: at, startedAt: at } });
  }
}
/** k extra Soldiers in seats after the current ones; memberCount follows. */
async function grow(familyId: string, k: number): Promise<string[]> {
  const seats = await testPrisma.familyMember.count({ where: { familyId } });
  const ids: string[] = [];
  for (let j = 0; j < k; j++) {
    const userId = await seedEligibleUser();
    await testPrisma.familyMember.create({ data: { familyId, userId, role: "SOLDIER", roleSlot: userId, seat: seats + j + 1, joinedAt: daysAgo(10) } });
    ids.push(userId);
  }
  await testPrisma.family.update({ where: { id: familyId }, data: { memberCount: { increment: k } } });
  return ids;
}

describe("heist cap by size (amendment 2.2)", () => {
  it.each([[12, 4], [13, 5], [25, 9], [30, 10]])("%i members: the cap is %i", async (n, cap) => {
    const { f, boss } = await sized(n);
    await startedRuns(f.id, boss, cap - 1);
    const c = await plan(boss);
    await testPrisma.caper.update({ where: { id: c.id }, data: { status: "RESOLVED", liveSlot: c.id, startedAt: new Date() } });
    await expect(plan(boss)).rejects.toThrow(new RegExp(`^Your family has run ${cap} crew heists in the last 24 hours \\(cap ${cap} for ${n} members\\)\\. Next slot <t:\\d+:R>\\.$`));
  });

  it("Start re-checks the cap after members leave: 25 → 21 members, 8 runs, cap 7, the second-oldest run frees the slot", async () => {
    const { caper, family, ids } = await seedLobby({ roles: [...T1] });
    const extra = await grow(family.id, 21);                                    // 4 + 21 = 25 members, cap 9
    await startedRuns(family.id, ids.MASTERMIND, 8);
    for (const id of extra.slice(0, 4)) await leaveFamily(id);                   // 21 members, cap 7
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } })).memberCount).toBe(21);
    const r = await startCaper(caper.id, { kind: "press", uid: ids.MASTERMIND });
    expect(r.status).toBe("waiting");
    expect(r.reason).toContain("Your family has run 8 crew heists in the last 24 hours (cap 7 for 21 members).");
    const second = await testPrisma.caper.findFirstOrThrow({ where: { familyId: family.id, liveSlot: "old1" } });
    expect(r.reason).toContain(`<t:${Math.floor((+second.startedAt! + 86_400_000) / 1000)}:R>`);
  });

  it("8 of 30 members at 100 heat freezes planning; 7 does not", async () => {
    const { boss, ids } = await sized(30);
    const heat = (who: string[]) => testPrisma.user.updateMany({ where: { discordId: { in: who } }, data: { crimeHeat: 100 } });
    await heat(ids.slice(0, 7));
    await expect(plan(boss)).resolves.toMatchObject({ status: "LOBBY" });
    await testPrisma.caper.deleteMany({});
    await heat(ids.slice(0, 8));
    await expect(plan(boss)).rejects.toThrow("Your family is under investigation: no crew heists until fewer than 8 members are at 100 heat.");
  });
});
```

Append to `test/crimeFamily/caper-layout.test.ts` (the fixture's `plannerView` sets `heistCap: 10, investigationThreshold: 8`; import `visibleText` from `./visibleText`):

```ts
it("S11 names the size-scaled heist cap", () => {
  const s11 = caperWorstCases().find((c) => c.label === "S11 planner (Capo)")!;
  expect(visibleText(s11.payload)).toContain("/10 in 24 h");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/caper-join.race.test.ts test/crimeFamily/caper-layout.test.ts`
Expected: FAIL: the cap is still 4 at every size.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/anticheat/caper-join.race.test.ts test/crimeFamily/caper-layout.test.ts test/crimeFamily && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperLobbyService.ts src/services/crimeFamily/familyQueries.ts src/services/crimeFamily/caperQueries.ts src/services/crimeFamily/views.ts src/ui/crimeFamily/caperScreens.ts src/utils/economyConfig.ts src/scripts/fixtures/caperScreens.ts test/anticheat/caper-join.race.test.ts test/crimeFamily/caper-layout.test.ts
git commit -m "feat(crime-families): heist cap max(4, ceil(members/3)) and investigation threshold max(3, ceil(members/4))"
```

---

### Task 6: Screens for 30-member rosters: the grouped S2 roster and the paged S5

**Files:**
- Create: `test/crimeFamily/layoutHelpers.ts`: the file-local `count`, `chars` and `walk` of `test/crimeFamily/layout.test.ts:17-19` move here (exported), plus `countComponents(p: CfPayload): number` = the sum of `count(c.toJSON())` over `p.components`; `layout.test.ts` imports them.
- Modify:
  - `src/ui/crimeFamily/familyScreens.ts:64-111` (S2), `:164-199` (S5).
  - `src/ui/crimeFamily/ids.ts:44`: `manageSelect(page, owner)` → `crew:mg:sel:<page>:<owner>`; add `managePage(page, owner)` → `crew:mg:pg:<page>:<owner>`.
  - `src/handlers/crewInteractionHandler.ts:117-122` (`manageScreen(uid, selected, page)`), `:173` (`v:manage` → page 0), `:203-213` (`manageRoute`).
  - `src/scripts/fixtures/crimeFamilyScreens.ts`: `MEMBERS`/`ROLES` grow to 30 (Boss, Underboss, 6 Capos, 12 Soldiers, 10 Soldiers whose `associateUntil` is set; the Underboss also has `associateUntil` set, to pin F8); `dashboardView` (`:37`) is exported for the layout tests; S2 entries `max: 20`, S5 becomes page 2 of 2 with a selection, `max: 16`.
  - `test/crimeFamily/ids-post.test.ts:14`: `CREW_IDS.manageSelect(U)` becomes `CREW_IDS.manageSelect(99, U)` and `CREW_IDS.managePage(99, U)` joins the `all` array.
- Test: `test/crimeFamily/layout.test.ts`, `test/crimeFamily/handlers.test.ts`, `test/crimeFamily/ids-post.test.ts`

**Interfaces:**
- Consumes: `FamilyDashboardView.roster` (unchanged shape); `CRIME_FAMILY_CONFIG.managePageSize` (15).
- Produces:
  - `buildDashboard`: the roster TextDisplay is one line per group, in this order and only when non-empty: `${roleEmoji("BOSS")} **Boss** <@a>`, `${roleEmoji("UNDERBOSS")} **Underboss** <@b>`, `${roleEmoji("CAPO")} **Capos** <@c> <@d> …`, `${roleEmoji("SOLDIER")} **Soldiers** …` (Soldiers past their 72 h), `${roleEmoji("ASSOCIATE")} **Associates** <@f> ${rel(until)} …` (only SOLDIER rows with `associateUntil`, F8; an officer inside 72 h stays on its rank line). Task 7 appends `(capos/cap)` to the Capos label. The claim button moves into a second row that Tasks 11 and 15 extend (`buttonRow` of at most 3: Claim the chair, Vote, Recruit).
  - `buildManagePanel(ownerId, view, selected, page)`: `pages = max(1, ceil(roster / 15))`, `page` clamped into `[0, pages - 1]`; the title text lists that page's members with their global `#n`; the select (`manageSelect(page, ownerId)`) holds only that page's members (≤ 15); a `selected` id not on this page (or the owner) counts as none; a third row `Prev` (`managePage(page - 1)`, disabled on page 0), a disabled `Page x/y` button whose customId is `managePage(page, ownerId)` (a disabled button is never pressed; the id only has to be unique in the message, and Prev/Next carry `page ∓ 1`), `Next` (disabled on the last page). Component count 16 at worst.
  - `manageRoute`: `sel` → `manageScreen(uid, i.values[0] ?? null, Number(args[1]) || 0)`; `pg` → `manageScreen(uid, null, Number(args[1]) || 0)`; after a promote or demote it re-renders the page that holds the target (`Math.floor(index / 15)` in the rank-sorted roster).

- [ ] **Step 1: Write the failing tests**

`test/crimeFamily/layout.test.ts` imports `count`, `chars`, `walk` and `countComponents` from `./layoutHelpers` (deleting its own copies at `:17-19`) and `dashboardView` from the fixture, then appends:

```ts
const { buildManagePanel } = await import("../../src/ui/crimeFamily/familyScreens");
const { dashboardView } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
import { countComponents } from "./layoutHelpers";

const rosterText = (p: CfPayload) => {
  let text = "";
  p.components.forEach((c) => walk(c.toJSON(), (n) => { if (typeof n.content === "string" && n.content.includes("**Boss**")) text = n.content; }));
  return text;
};
const selectOf = (p: CfPayload) => {
  let sel: any = null;
  p.components.forEach((c) => walk(c.toJSON(), (n) => { if (n.type === ComponentType.StringSelect) sel = n; }));
  return sel;
};
const buttons = (p: CfPayload) => {
  const out: any[] = [];
  p.components.forEach((c) => walk(c.toJSON(), (n) => { if (n.type === ComponentType.Button) out.push(n); }));
  return out;
};

describe("30-member rosters (amendment 2.5)", () => {
  it("S2 groups a 30-member roster into five lines under 1,400 characters", () => {
    const v = dashboardView();
    const text = rosterText(buildDashboard(v));
    const lines = text.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.match(/\*\*(\w+)/)![1])).toEqual(["Boss", "Underboss", "Capos", "Soldiers", "Associates"]);
    expect(text.length).toBeLessThan(1_400);
    const ub = v.roster.find((r) => r.role === "UNDERBOSS")!;
    expect(lines[1]).toContain(`<@${ub.userId}>`);                       // F8: inside 72 h, still on its rank line
    expect(lines[4]).not.toContain(`<@${ub.userId}>`);
  });

  it("S5 page 2 of 2 lists #16..#30 and a select of 15", () => {
    const v = dashboardView();
    const target = v.roster[19].userId;
    const p = buildManagePanel(v.viewer.userId, v, target, 1);
    const sel = selectOf(p);
    expect(sel.custom_id).toBe(CREW_IDS.manageSelect(1, v.viewer.userId));
    expect(sel.options).toHaveLength(15);
    expect(sel.options.find((o: any) => o.default)?.value).toBe(target);
    const [prev, page, next] = buttons(p).filter((b) => /^(Prev|Page|Next)/.test(b.label));
    expect([prev.disabled ?? false, page.label, page.disabled, next.disabled]).toEqual([false, "Page 2/2", true, true]);
    expect(prev.custom_id).toBe(CREW_IDS.managePage(0, v.viewer.userId));
    expect(JSON.stringify(p.components.map((c) => c.toJSON()))).toContain("#16");
    expect(countComponents(p)).toBeLessThanOrEqual(16);
  });

  it("S5 clamps a page past the end to the last page; a selection off the page counts as none", () => {
    const v = dashboardView();
    const p = buildManagePanel(v.viewer.userId, v, v.roster[2].userId, 9);
    expect(selectOf(p).custom_id).toBe(CREW_IDS.manageSelect(1, v.viewer.userId));
    expect(selectOf(p).options.some((o: any) => o.default)).toBe(false);
  });
});
```

Append to `test/crimeFamily/handlers.test.ts` (import `fakeSelect` from `./fakeInteraction`):

```ts
it("the S5 pager and a select on page 2 keep the page", async () => {
  const boss = await seedEligibleUser();
  const ids: string[] = [];
  for (let k = 0; k < 19; k++) ids.push(await seedEligibleUser());
  await seedFamily({ bossId: boss, level: 6, members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
  await withCfConfig({ enabled: true }, async () => {
    const pg = fakeButton(CREW_IDS.managePage(1, boss), { userId: boss, ephemeralSource: true });
    await handleCrimeFamilyInteraction(pg as any);
    const page2 = JSON.stringify(pg.editReply.mock.calls.at(-1)![0]);
    expect(page2).toContain(CREW_IDS.manageSelect(1, boss));
    const pick = ids[17];                                                // roster #19: page 2 (index 1)
    const sel = fakeSelect(CREW_IDS.manageSelect(1, boss), [pick], { userId: boss, ephemeralSource: true });
    await handleCrimeFamilyInteraction(sel as any);
    const out = JSON.stringify(sel.editReply.mock.calls.at(-1)![0]);
    expect(out).toContain(CREW_IDS.manageSelect(1, boss));
    expect(out).toContain(CREW_IDS.manage("promote", pick, boss));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/layout.test.ts test/crimeFamily/handlers.test.ts`
Expected: FAIL: S2 still renders one line per member; `managePage` is undefined.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run them, plus the payload audit**

Run: `$VT test/crimeFamily/layout.test.ts test/crimeFamily/handlers.test.ts && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 5: Commit**

```bash
git add src/ui/crimeFamily/familyScreens.ts src/ui/crimeFamily/ids.ts src/handlers/crewInteractionHandler.ts src/scripts/fixtures/crimeFamilyScreens.ts test/crimeFamily/layoutHelpers.ts test/crimeFamily/layout.test.ts test/crimeFamily/handlers.test.ts
git commit -m "feat(crime-families): grouped S2 roster and a 15-per-page S5 for 30-member families"
```

---

### Task 7: Capos scale with size: the Capo cap, the 10,000,000 bar and grandfathering

**Files:**
- Create: `test/anticheat/family-capo.race.test.ts`
- Modify:
  - `src/data/crimeFamilyCatalog.ts:22`: `CAPO_SLOTS = ["CAPO1", …, "CAPO6"]`.
  - `src/services/crimeFamily/chairService.ts:15-63`: `slotFor`, `changeRank`, `promoteMember`, `demoteMember` (F7).
  - `src/services/crimeFamily/familyQueries.ts` (`buildDashboardView`: `capos`, `capoCap`), `src/services/crimeFamily/views.ts:9-28`.
  - `src/ui/crimeFamily/familyScreens.ts`: S2's Capos label `**Capos (${capos}/${capoCap})**`; `MANAGE_LEGEND` appends ` Capo seats ${capos}/${capoCap}; promotion needs 10,000,000 net worth.` (built from the view and `capoMinNetWorth`, so it becomes a function of the view).
  - `src/ui/crimeFamily/familyScreens.ts:168` `buildManagePanel(ownerId, view, selected, page, note?: string)` and `src/handlers/crewInteractionHandler.ts:117-122` `manageScreen(uid, selected, page, note?)` gain an optional `note` rendered as a `-#` line under the title (the `buildVaultPanel(…, note?)` pattern at `familyScreens.ts:225`); `manageRoute` (`:210-212`) passes `` `<@${target}> is now a Soldier (no Capo seat was free).` `` when `fellBack`, else no note. `src/commands/economy/crew.ts:63-70` (`rankChange`) appends ` (no Capo seat was free)` to its notice when `fellBack`.
  - `src/scripts/fixtures/crimeFamilyScreens.ts` (the dashboard view gains `capos: 6, capoCap: 6`).
  - `test/anticheat/family-membership.race.test.ts` `describe("ranks (6.3)")` (`:276-317`): `famWith` gains `opts: { size?: number; wallet?: number }` (pads the family with Soldiers to `size` at level 10 and seeds every member with `wallet`, default 0). Edits: `:279` "promotions fill CAPO1..CAPO6, then 'Capo seats are full (6/6 for 30 members).'" (`size: 30, wallet: 12_000_000`, seven Soldiers promoted in turn); `:289` "seven concurrent Soldier → Capo promotions never seat more than 6" (the invariant test below, `size: 30`); `:296` the Underboss race seeds both Capos with `wallet: 12_000_000` (A10 puts the net-worth bar on Underboss too; without it both read "Promotion needs…"), and its rejection matches `BUSY_OR("The Underboss seat is taken.")`; `:304` "an Underboss can promote Soldier → Capo" uses `size: 10` (cap 2, one Capo seated) and `wallet: 12_000_000`; `:312` is unchanged. `test/crimeFamily/layout.test.ts`, `test/crimeFamily/handlers.test.ts` (the S5 note).

**Interfaces:**
- Consumes: `capoCapFor` (Task 4); `computeNetWorth` (`src/services/netWorthService.ts:25`); `CRIME_FAMILY_CONFIG.capoMinNetWorth`, `voteOfficerGraceSeconds`.
- Produces: `promoteMember`/`demoteMember` returning `{ family, newRole, fellBack }`; `FamilyDashboardView.capos`, `capoCap`.
  - `slotFor(tx, familyId, member, newRole, opts: { fallBack: boolean }): Promise<{ role: FamilyRole; roleSlot: string }>`: as today, except that with no free Capo slot and `fallBack` it returns `{ role: "SOLDIER", roleSlot: member.userId }` instead of throwing.
  - `changeRank` inside the transaction, after `touchFamily` and the existing `can` check:
    1. promotion into CAPO: `capos = tx.familyMember.count({ where: { familyId, role: "CAPO" } })`, `cap = capoCapFor(family.memberCount)` with the family re-read in this transaction; refuse `` `Capo seats are full (${capos}/${cap} for ${memberCount} members).` ``
    2. promotion into CAPO or UNDERBOSS (A10): `(await computeNetWorth(targetId)).total >= capoMinNetWorth`, called inside the callback; refuse `` `Promotion needs ${fmtFortunes(capoMinNetWorth)} net worth (<@${targetId}> has ${fmtFortunes(total)}).` ``
    3. `slotFor(..., { fallBack: action === "demote" && targetRole === "UNDERBOSS" })` (A45); `fellBack = newRole was CAPO && result.role === "SOLDIER"`.
    4. the row update writes `role`, `roleSlot` and, on every demotion out of UNDERBOSS or CAPO, `officerUntil: now + voteOfficerGraceSeconds`.
  - No rule ever demotes a Capo for net worth or size.

- [ ] **Step 1: Write the failing test**

```ts
// test/anticheat/family-capo.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { promoteMember, demoteMember } from "../../src/services/crimeFamily/chairService";
import { kickMember } from "../../src/services/crimeFamily/membershipService";
import { redisService } from "../../src/services/redisService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes } from "../helpers";
import type { FamilyRole } from "../../src/data/crimeFamilyCatalog";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

const RICH = 12_000_000;
async function family(size: number, roles: Partial<Record<FamilyRole, number>> = {}, wallet = RICH) {
  const boss = await seedEligibleUser();
  const plan: FamilyRole[] = [
    ...Array(roles.UNDERBOSS ?? 0).fill("UNDERBOSS"), ...Array(roles.CAPO ?? 0).fill("CAPO"),
  ];
  const ids: string[] = [];
  for (let i = 0; i < size - 1; i++) ids.push(await seedEligibleUser({ wallet }));
  const f = await seedFamily({ bossId: boss, level: 10, members: ids.map((userId, i) => ({ userId, role: plan[i] ?? "SOLDIER" })) });
  return { f, boss, ids };
}
const role = async (id: string) => (await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: id } })).role;
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);

describe("Capos scale with size (amendment 3)", () => {
  it("seven promotions race in a 30-member family: never more than 6 Capos, unique slots; the losers fill to exactly 6 in turn", async () => {
    const { boss, ids } = await family(30);
    const seven = ids.slice(0, 7);
    // Every write serializes on touchFamily and runFamilyTx tries 3 times, so a loser may read "Vault busy".
    const r = await Promise.allSettled(seven.map((id) => promoteMember(boss, id)));
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("Capo seats are full (6/6 for 30 members)."));
    const capoSlots = async () => (await testPrisma.familyMember.findMany({ where: { role: "CAPO" } })).map((m) => m.roleSlot);
    const raced = await capoSlots();
    expect(raced.length).toBeLessThanOrEqual(6);
    expect(new Set(raced).size).toBe(raced.length);
    for (const id of seven) if ((await role(id)) === "SOLDIER") await promoteMember(boss, id).catch((e) => expect(e.message).toBe("Capo seats are full (6/6 for 30 members)."));
    expect((await capoSlots()).sort()).toEqual(["CAPO1", "CAPO2", "CAPO3", "CAPO4", "CAPO5", "CAPO6"]);
    expect((await Promise.all(seven.map(role))).filter((x) => x === "SOLDIER")).toHaveLength(1);
  });
  it("reads net worth uncached: a stale 50M cache does not pass a live 9M", async () => {
    const { boss, ids } = await family(10, {}, 9_000_000);
    await redisService.set(`networth:${ids[0]}`, { total: 50_000_000 }, 600);   // getNetWorth's display cache
    await expect(promoteMember(boss, ids[0])).rejects.toThrow("Promotion needs 10,000,000 net worth (<@" + ids[0] + "> has 9,000,000).");
  });
  it("kicks down to 19 members keep all 6 Capos; the next promotion waits", async () => {
    const { boss, ids } = await family(30, { CAPO: 6 });
    for (const id of ids.slice(6, 17)) await kickMember(boss, id);
    expect(await testPrisma.familyMember.count({ where: { role: "CAPO" } })).toBe(6);
    await expect(promoteMember(boss, ids[20])).rejects.toThrow("Capo seats are full (6/3 for 19 members).");
  });
  it("a 2M Capo cannot be promoted to Underboss (A10)", async () => {
    const { boss, ids } = await family(10, { CAPO: 1 }, 2_000_000);
    await expect(promoteMember(boss, ids[0])).rejects.toThrow(/Promotion needs 10,000,000 net worth/);
  });
  it("demoting the Underboss with six Capos lands on Soldier and grants 7 days of start_vote", async () => {
    const { boss, ids } = await family(30, { UNDERBOSS: 1, CAPO: 6 });
    const before = Date.now();
    expect(await demoteMember(boss, ids[0])).toMatchObject({ newRole: "SOLDIER", fellBack: true });
    const row = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ids[0] } });
    expect(row).toMatchObject({ role: "SOLDIER", roleSlot: ids[0] });
    expect(+row.officerUntil).toBeGreaterThanOrEqual(before + 604_800_000);
  });
  it("19 members, 3 Capos, a free CAPO4: the demoted Underboss takes CAPO4 over the cap; the next promotion is refused", async () => {
    const { boss, ids } = await family(19, { UNDERBOSS: 1, CAPO: 3 });
    expect(await demoteMember(boss, ids[0])).toMatchObject({ newRole: "CAPO", fellBack: false });
    expect(await role(ids[0])).toBe("CAPO");
    await expect(promoteMember(boss, ids[10])).rejects.toThrow("Capo seats are full (4/3 for 19 members).");
  });
});
```

Also add to the same file:

```ts
it("a promotion racing a leave that drops the cap re-reads memberCount", async () => {
  const { f, boss, ids } = await family(10, { CAPO: 1 });                   // cap 2, one Capo seated
  const r = await Promise.allSettled([promoteMember(boss, ids[5]), leaveFamily(ids[6])]);
  for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("Capo seats are full (1/1 for 9 members)."));
  const after = await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } });
  const capos = await testPrisma.familyMember.count({ where: { familyId: f.id, role: "CAPO" } });
  // Promote-then-leave legitimately ends at 2 Capos for 9 members (grandfathered); leave-then-promote must refuse.
  if (after.memberCount === 9 && capos === 2) expect(r[0].status).toBe("fulfilled");
  expect(capos).toBeLessThanOrEqual(2);
});
it("S5 says the demoted Underboss fell back to Soldier", async () => {
  const { boss, ids } = await family(30, { UNDERBOSS: 1, CAPO: 6 });
  await withCfConfig({ enabled: true }, async () => {
    const i = fakeButton(CREW_IDS.manage("demote", ids[0], boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
    await handleCrimeFamilyInteraction(i as any);
    expect(said(i)).toContain(`<@${ids[0]}> is now a Soldier (no Capo seat was free).`);
  });
});
```

(imports for these two: `leaveFamily` from `membershipService`, `withCfConfig` from `../helpers`, `handleCrimeFamilyInteraction` from `../../src/handlers/crimeFamilyRouter`, `CREW_IDS` from `../../src/ui/crimeFamily/ids`, `fakeButton`, `said` from `../crimeFamily/fakeInteraction`, `fakeClient` from `../crimeFamily/fakeClient`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/anticheat/family-capo.race.test.ts`
Expected: FAIL: CAPO4 does not exist; no net-worth check.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Update the old Capo cases, then run the suites**

Apply the `family-membership.race.test.ts` `ranks (6.3)` edits listed in Files. Run: `$VT test/anticheat/family-capo.race.test.ts test/anticheat/family-membership.race.test.ts test/crimeFamily && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/crimeFamilyCatalog.ts src/services/crimeFamily/chairService.ts src/services/crimeFamily/familyQueries.ts src/services/crimeFamily/views.ts src/ui/crimeFamily/familyScreens.ts src/handlers/crewInteractionHandler.ts src/commands/economy/crew.ts src/scripts/fixtures/crimeFamilyScreens.ts test
git commit -m "feat(crime-families): Capo cap floor(members/5) up to 6, a 10,000,000 promotion bar, grandfathered seats"
```

---

### Task 8: The two-phase payday

**Files:**
- Modify:
  - `src/services/crimeFamily/ledger.ts:5-7`, `:30-33` (F6; `LedgerType` gains `"payday_clamp_return"`).
  - `src/services/crimeFamily/paydayService.ts:18-22` (types), `:36-46` (`ineligible` gains `need`), `:88-120` (`payMembersInTx` removed), `:127-160` (`executePayday`).
  - `src/services/crimeFamily/views.ts` (`PaydayPreview.ineligible[]` gains `need: string`).
  - `src/services/crimeFamily/disbandService.ts` (92 lines): `:11` imports `reservePaydayInTx`, `payPaydayShares`, `type PaidShare` in place of `payMembersInTx`; `:43` the result's `paid` becomes `PaidShare[]`; `:62-66` (the `payout` declaration and the `payMembersInTx` call inside `if (isPaydayDue(...))`) become `let reserved: { runKey: string; split: Split } | null = null; … reserved = await reservePaydayInTx(tx, beforePay, eligible, beforePay.earnings, bossId, now);`, still before the burn read at `:68-69` (`final` / `burned`), so `burned` is exactly what the reservation left; `:86` returns `reserved` in place of `payout`; `:89-90` (the `afterEarnedCredit` loop) become `const paid = outcome.reserved ? await payPaydayShares(outcome.reserved.runKey, now) : [];` and `:91` reads `split: outcome.reserved?.split ?? null`.
  - `src/ui/crimeFamily/announce.ts:37-53` (`announcePayday` reads `PaidShare[]`), new `announceResumedShares`.
  - `src/services/crimeFamily/scheduler.ts:115-123` (minute job `resumePaydayShares`).
  - `src/ui/crimeFamily/familyScreens.ts`: `LEDGER_LABELS.payday_clamp_return = "Payday clamp return"`; S6 (`:226-229`) shows at most 10 ineligible lines then `-# +N more: see the payday preview`; S7 (`:257-`) "Paid (N × net)" one line of mentions, "Not paid" grouped `**<need>:** <@a> <@b> …` by `need`.
  - `src/scripts/fixtures/crimeFamilyScreens.ts` (S6 with 30 ineligible, S7 with 30 paid and 30 grouped unpaid), `test/anticheat/family-vault.race.test.ts`, `test/anticheat/family-disband.race.test.ts`, `test/crimeFamily/layout.test.ts`.

**Interfaces:**
- Consumes: `creditWalletInTx`, `afterEarnedCredit` (`src/services/walletService.ts`), `creditEarnings` (`vaultService.ts:89-107`), `runFamilyTx`.
- Produces: `reservePaydayInTx`, `PaidShare`, `payPaydayShares`, `resumeUnpaidShares`, `PaydayPaid` (top Interfaces block); `announceResumedShares(client, paid: PaidShare[]): Promise<void>`.
  - `reservePaydayInTx(tx, family, eligible, earnings, actorId, now)`: `split = splitPayday(earnings, N)`; `family.update({ earnings: { increment: -gross × N } })`; `runKey = await writeLedger(... "payday", amount: -gross × N, meta: { ...split, members: N })`; the `payday_tax` row (`meta.burned = tax × N`); `paydayShare.createMany` one row per eligible id in `eligible` order with `{ familyId, runKey, userId, gross, tax, net }`. The caller has already won the earnings and interval CAS (unchanged, `:145-152`).
  - `payPaydayShares(runKey, now)`: reads `paid:false` shares of `runKey` ordered by `id`; for each, `payShare` in its own `runFamilyTx`; a share that throws is logged and skipped (the resume job retries it); returns the shares this call paid.
  - `payShare` (module-private): `paydayShare.updateMany({ where: { id, paid: false }, data: { paid: true } })` with `count === 1` else skip; `creditWalletInTx(tx, userId, username, net, "family_payday", { familyId, gross, tax }, true)`; `clamp = net - credit.appliedAmount`; when `clamp > 0` and the family exists, `creditEarnings(tx, familyId, clamp, "payday_clamp_return", "system", { userId, runKey }, { retryArrears: false })`; when it does not (F5), `tx.audit.create({ data: { userId, type: "family_payday_clamp_burn", meta: { familyId, runKey, burned: clamp } } })`. After commit, `credit = await afterEarnedCredit(userId, credit, true)`.
  - `resumeUnpaidShares(now)`: every `paid:false` share with `createdAt ≤ now − paydayShareResumeSeconds`, grouped by `runKey`, through `payPaydayShares`.
  - `executePayday` keeps its preview, "changed" outcomes and the 5 attempts; inside the transaction it calls `reservePaydayInTx` in place of `payMembersInTx`, and after the commit `payPaydayShares(runKey, now)`; `PaydayPaid.paid` is what that call returned (a share it failed to pay is paid and DMed by the minute job).
  - `disbandFamily` reserves inside its transaction at `:62-66`, before the burn read at `:68`, so `burned` stays exact, and pays after the commit in place of `:89-90`; its result's `paid` is `PaidShare[]` and `split` is unchanged. A share left unpaid by a crash is paid by the minute job after the family row is gone (F5: its clamp burns into an audit row).
  - `announcePayday` names every paid id (up to 30); `announceResumedShares` DMs `familyPaydayNotice` to each resumed share, labelling the family by its current `familyLabel` or `"your former family"` when it is gone.

- [ ] **Step 1: Write the failing tests**

Append to `test/anticheat/family-vault.race.test.ts` (it already has `fam`, `wallet`, `active`, `rule`, `ACTIVITY_RULES`, `MAX_SAFE_BALANCE`, `seedFamily`, `seedEligibleUser`, `daysAgo` and `executePayday`). The existing "returns a clamped excess to earnings" case (`:226-231`) changes to: `executePayday` resolves `{ status: "paid" }`, earnings end at 949,900, and one `payday_clamp_return` ledger row has `amount: 949_900` (`PaydayPaid` no longer carries `clampedBack`).

```ts
import { payPaydayShares, resumeUnpaidShares } from "../../src/services/crimeFamily/paydayService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";

// Throws on chosen credits: `on` holds 1-based call numbers, `all` throws on every call.
const fail = vi.hoisted(() => ({ calls: 0, on: new Set<number>(), all: false }));
vi.mock("../../src/services/walletService", async (orig) => {
  const real = await orig<typeof import("../../src/services/walletService")>();
  return {
    ...real,
    creditWalletInTx: vi.fn(async (...a: Parameters<typeof real.creditWalletInTx>) => {
      fail.calls += 1;
      if (fail.all || fail.on.has(fail.calls)) throw new Error(`injected credit failure ${fail.calls}`);
      return real.creditWalletInTx(...a);
    }),
  };
});
const resetFail = () => { fail.calls = 0; fail.on.clear(); fail.all = false; };
const later = () => new Date(Date.now() + 61_000);                       // past paydayShareResumeSeconds (60)
const shares = (runKey: string) => testPrisma.paydayShare.findMany({ where: { runKey }, orderBy: { id: "asc" } });

/** A due family of 30 payday-eligible members (the Boss plus 29), earnings E. */
async function bigPayFam(earnings: number, o: { tag?: string } = {}) {
  const bossId = await seedEligibleUser();
  const ids: string[] = [];
  for (let k = 0; k < 29; k++) ids.push(await seedEligibleUser());
  for (const u of [bossId, ...ids]) active.add(u);
  const family = await seedFamily({ bossId, level: 10, earnings, lastPaydayAt: daysAgo(8), ...(o.tag ? { tag: o.tag } : {}),
    members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
  return { family, bossId, ids, all: [bossId, ...ids] };
}

describe("two-phase payday (amendment 2.4)", () => {
  beforeEach(() => { active.clear(); ACTIVITY_RULES.push(rule); resetFail(); });
  afterEach(() => { ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(rule), 1); resetFail(); });

  it("a 30-member payday reserves once and pays 30 shares", async () => {
    const { family, bossId, all } = await bigPayFam(40_000_000);
    const r = await executePayday(family.id, bossId, { earnings: 40_000_000, count: 30 });
    expect(r).toMatchObject({ status: "paid", split: { gross: 1_000_000, tax: 50_000, net: 950_000 } });
    const payday = await testPrisma.familyLedger.findFirstOrThrow({ where: { familyId: family.id, type: "payday" } });
    expect(payday).toMatchObject({ amount: -30_000_000, meta: { gross: 1_000_000, tax: 50_000, net: 950_000, members: 30 } });
    expect(await testPrisma.familyLedger.findFirstOrThrow({ where: { familyId: family.id, type: "payday_tax" } })).toMatchObject({ amount: 0, meta: { burned: 1_500_000 } });
    expect(await testPrisma.familyLedger.count({ where: { familyId: family.id, type: { in: ["payday", "payday_tax"] } } })).toBe(2);
    const rows = await shares(payday.id);                                // F6: the payday row's id is the runKey
    expect(rows).toHaveLength(30);
    expect(rows.every((s) => s.paid && s.gross === 1_000_000 && s.tax === 50_000 && s.net === 950_000)).toBe(true);
    expect((r as any).runKey).toBe(payday.id);
    expect((r as any).paid).toHaveLength(30);
    expect((await fam(family.id))!.earnings).toBe(10_000_000);           // 40,000,000 − 30 × 1,000,000
    for (const id of all) expect(await wallet(id)).toBe(950_000);
  });

  it("a crash on share 7 is paid once by the resume job", async () => {
    const { family, bossId, all } = await bigPayFam(40_000_000);
    fail.on.add(7);
    const r = await executePayday(family.id, bossId, { earnings: 40_000_000, count: 30 });
    expect((r as any).paid).toHaveLength(29);
    const runKey = (r as any).runKey as string;
    const unpaid = (await shares(runKey)).filter((s) => !s.paid);
    expect(unpaid).toHaveLength(1);
    expect(await wallet(unpaid[0].userId)).toBe(0);
    expect(await resumeUnpaidShares(new Date())).toEqual([]);            // younger than 60 s: not yet
    const resumed = await resumeUnpaidShares(later());
    expect(resumed.map((p) => p.userId)).toEqual([unpaid[0].userId]);
    expect(await resumeUnpaidShares(later())).toEqual([]);
    for (const id of all) expect(await wallet(id)).toBe(950_000);
    expect((await fam(family.id))!.earnings).toBe(10_000_000);           // the reservation never moves again
  });

  it("payer and resume race on one share: exactly one credit per share", async () => {
    const { family, bossId, all } = await bigPayFam(40_000_000);
    fail.all = true;
    const r = await executePayday(family.id, bossId, { earnings: 40_000_000, count: 30 });
    expect((r as any).paid).toEqual([]);
    resetFail();
    const runKey = (r as any).runKey as string;
    const [a, b] = await Promise.all([payPaydayShares(runKey, later()), resumeUnpaidShares(later())]);
    expect(a.length + b.length).toBe(30);
    expect(new Set([...a, ...b].map((p) => p.userId)).size).toBe(30);
    for (const id of all) expect(await wallet(id)).toBe(950_000);
    expect((await shares(runKey)).every((s) => s.paid)).toBe(true);
  });

  it("a share that clamps after the family disbanded burns the excess into an audit row", async () => {
    const { family, bossId, ids } = await bigPayFam(40_000_000, { tag: "VLA" });
    const rich = ids[0];
    await testPrisma.wallet.update({ where: { userId: rich }, data: { balance: MAX_SAFE_BALANCE - 100 } });
    // disbandFamily pays its shares after the commit that deleted the family, so the clamp has no vault to return to.
    const r = await disbandFamily(bossId, "VLA");
    expect(r.burned).toBe(10_000_000);                                   // 40,000,000 − 30 × 1,000,000 reserved before the burn read
    expect(r.paid).toHaveLength(30);
    expect(r.paid.find((p) => p.userId === rich)!.credit.appliedAmount).toBe(100);
    expect(await testPrisma.family.findUnique({ where: { id: family.id } })).toBeNull();
    expect(await resumeUnpaidShares(later())).toEqual([]);
    expect(await wallet(rich)).toBe(MAX_SAFE_BALANCE);
    const audit = await testPrisma.audit.findFirstOrThrow({ where: { userId: rich, type: "family_payday_clamp_burn" } });
    expect(audit.meta).toMatchObject({ familyId: family.id, burned: 950_000 - 100 });
    expect(await testPrisma.familyLedger.count({ where: { type: "payday_clamp_return" } })).toBe(0);
  });
});
```

Append to `test/crimeFamily/layout.test.ts` (the fixture's `paydayPreview` grows to 30 ineligible members spread over 7 distinct `need` strings):

```ts
it("S7 groups 30 unpaid members by need; S6 shows 10 ineligible lines and +20 more", () => {
  const text = (label: string) => JSON.stringify(crimeFamilyWorstCases().find((c) => c.label === label)!.payload.components.map((c) => c.toJSON()));
  const s7 = text("S7 payday preview (30 paid, 30 unpaid)");
  expect(s7.match(/\*\*[^*]+:\*\*/g)!.length).toBeLessThanOrEqual(7);
  const s6 = text("S6 vault (30 ineligible)");
  expect(s6).toContain("+20 more: see the payday preview");
});
```


- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/family-vault.race.test.ts test/crimeFamily/layout.test.ts`
Expected: FAIL: no `paydayShare` rows are written.

- [ ] **Step 3: Implement** per Interfaces; delete `payMembersInTx` and its import in `disbandService.ts`.

- [ ] **Step 4: Run the suites**

Run: `$VT test/anticheat/family-vault.race.test.ts test/anticheat/family-disband.race.test.ts test/crimeFamily && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/ledger.ts src/services/crimeFamily/paydayService.ts src/services/crimeFamily/views.ts src/services/crimeFamily/disbandService.ts src/ui/crimeFamily/announce.ts src/services/crimeFamily/scheduler.ts src/ui/crimeFamily/familyScreens.ts src/scripts/fixtures/crimeFamilyScreens.ts test
git commit -m "feat(crime-families): two-phase payday (reserve once, credit each share by CAS, resume unpaid shares)"
```

---

### Task 9: The no-confidence vote: rules, the freeze hooks, the chair seam and Start

**Files:**
- Create: `src/services/crimeFamily/voteRules.ts`, `src/services/crimeFamily/voteHooks.ts`, `src/services/crimeFamily/voteService.ts` (Start half), `test/crimeFamily/vote-rules.test.ts`, `test/anticheat/family-vote.race.test.ts`
- Modify:
  - `src/services/crimeFamily/extensions.ts:20-35`: three optional `FamilyHook` methods; `FAMILY_HOOKS = [CAPER_FAMILY_HOOK, TURF_FAMILY_HOOK, VOTE_FAMILY_HOOK]`.
  - `src/services/crimeFamily/chairService.ts`: `moveChair` (`:65-77`) exported with `now`; `changeRank` runs `rankChangeBlock` after `touchFamily`; `handOverChair` (`:80-88`) gains `touchFamily` and `handoverBlock` before its `can` check; `claimChair` and `autoHandover` pass `now`.
  - `src/services/crimeFamily/familyService.ts:44-46`: the founder row gains `bossedOnce: true, firstBossAt: now`.
  - `src/services/crimeFamily/permissions.ts:7-9` (the `FamilyAction` union), `:22-41` (`ROLE_ACTIONS`): `start_vote: ["UNDERBOSS", "CAPO"]`, `cast_vote: ["UNDERBOSS", "CAPO", "SOLDIER"]` (F13).
  - `src/services/crimeFamily/views.ts`: `VoteStartView`.
  - `test/crimeFamily/names-permissions.test.ts`.

**Interfaces:**
- Consumes: `FamilyVote`/`FamilyBallot` models and the `FamilyMember` vote fields (Task 2); `CRIME_FAMILY_CONFIG.vote*`; `isAssociate`, `can`, `pickHeir`; `isBanActive` (`src/services/banService.ts:6`); `checkJailStatus` through `assertNotJailed`.
- Produces: the `voteRules.ts`, `voteHooks.ts` and Start half of `voteService.ts` from the top Interfaces block, `moveChair`, and:

```ts
// src/services/crimeFamily/views.ts
export interface VoteStartView {
  ownerId: string;
  familyLabel: string;
  bossId: string;
  eligible: number;          // the snapshot a Start now would take
  need: number;              // votePassNeed(eligible)
  openVoteId: string | null; // set when a vote is already open (S2's Vote button then shows the S25 vote card, F20)
  block: string | null;      // voteStartBlock's refusal, shown on S35 with Start disabled
}
```

  - `votePassNeed(n) = Math.ceil(2 * n / 3)`. `decideVote`: `chairMoved` → VOID `chair_moved`; `eligibleAtClose < voteMinEligible` → VOID `too_few`; `yes < need` → FAILED; `heirId === null` → VOID `no_heir`; else PASSED. `voteCooldownUntil`: FAILED, `too_few`, `no_heir` → `closedAt + voteCooldownSeconds`; `chair_moved` and PASSED → `closedAt`. `voidReasonOf` (display): `status !== "VOID"` → null; `cooldownUntil <= closedAt` → `chair_moved`; `eligibleAtClose < voteMinEligible` → `too_few`; else `no_heir`.
  - `VOTE_FAMILY_HOOK` (`key: "vote"`): `memberExitBlock` only for `kind === "KICKED"` → `"No kicks while a no-confidence vote is open."`; `disbandBlock` → `"No disband while a no-confidence vote is open."`; `rankChangeBlock` → `"No promotions or demotions while a no-confidence vote is open."`; `handoverBlock` → `"No handover while a no-confidence vote is open."`; `onChairMove` → `voidOpenVotesInTx`. Each block is `(await hasOpenVote(tx, familyId)) ? <line> : null`.
  - `voidOpenVotesInTx(tx, familyId, now)`: the OPEN vote (if any) → `updateMany({ where: { id, status: "OPEN" }, data: { status: "VOID", liveSlot: id, closedAt: now, cooldownUntil: now } })`; `resultAnnounced` stays false so `announceVoteResult` (Task 11) edits S34.
  - `moveChair(tx, familyId, oldBossId, newBossId, now)`: today's three writes, then `familyMember.updateMany({ where: { familyId, userId: newBossId, bossedOnce: false }, data: { bossedOnce: true, firstBossAt: now } })` (A40), then every `FAMILY_HOOKS` `onChairMove`, then the re-read.
  - `voteStartBlock(db, familyId, actorId, now)` returns the first refusal, in this order:
    1. actor not a member of `familyId` → `"You are not in a crime family."`; jailed → `"You can't do that while in jail."`; banned → `"Banned accounts can't take part in a vote."` (F16);
    2. not `can(actor, "start_vote")` and not `officerUntil > now` → `"Only the Underboss or a Capo can start a no-confidence vote."`;
    3. `isAssociate(actor.joinedAt, now)` → `"You need 72 hours in the family to start a vote."`;
    4. an OPEN vote → `"A vote is already open."`;
    5. a vote of this family with `cooldownUntil > now` → `` `A failed vote blocks another until ${rel(cooldownUntil)}.` ``;
    6. the Boss row has `bossedOnce: false` or `firstBossAt > now − voteBossGraceSeconds` → `` `The Boss has held the chair under 7 days: a vote can open ${rel(firstBossAt + 7 d)}.` ``;
    7. snapshot (members other than the Boss with `joinedAt ≤ now − associateSeconds`) shorter than `voteMinEligible` → `` `A vote needs 3 members besides the Boss with 72 hours in the family (you have ${n}).` ``
  - `startVote(actorId, now)`: `requireMembership`, then one `runFamilyTx`: `touchFamily`, `voteStartBlock(tx, …)` (throw its line), `familyVote.create({ data: { familyId, bossId: family.bossId, starterId: actorId, eligibleIds: snapshot, closesAt: now + voteSeconds } })`, `familyBallot.create({ data: { voteId, familyId, userId: actorId, choice: "YES", castAt: now } })`. P2002 on `FamilyVote_familyId_liveSlot_key`, outside → `"A vote is already open."`. A starter outside the snapshot cannot happen (step 3).
  - `getVoteStartView(actorId, now)`: the same reads outside a transaction.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/vote-rules.test.ts
import { describe, it, expect } from "vitest";
import { decideVote, votePassNeed, voteCooldownUntil, voidReasonOf } from "../../src/services/crimeFamily/voteRules";

const T = new Date("2026-11-10T00:00:00Z");
const WEEK = 604_800_000;

describe("vote rules (amendment 4.2)", () => {
  it("needs ceil(2n/3) YES for every n from 3 to 29", () => {
    for (let n = 3; n <= 29; n++) expect(votePassNeed(n)).toBe(Math.ceil((2 * n) / 3));
    expect(votePassNeed(29)).toBe(20);
  });
  it("decides in the documented order", () => {
    expect(decideVote({ eligibleAtClose: 29, yes: 29, heirId: "u", chairMoved: true })).toEqual({ status: "VOID", voidReason: "chair_moved" });
    expect(decideVote({ eligibleAtClose: 2, yes: 2, heirId: "u", chairMoved: false })).toEqual({ status: "VOID", voidReason: "too_few" });
    expect(decideVote({ eligibleAtClose: 29, yes: 19, heirId: "u", chairMoved: false })).toEqual({ status: "FAILED", voidReason: null });
    expect(decideVote({ eligibleAtClose: 29, yes: 20, heirId: null, chairMoved: false })).toEqual({ status: "VOID", voidReason: "no_heir" });
    expect(decideVote({ eligibleAtClose: 29, yes: 20, heirId: "u", chairMoved: false })).toEqual({ status: "PASSED", voidReason: null });
  });
  it("cools down 7 days after FAILED, too_few and no_heir only (A46)", () => {
    expect(+voteCooldownUntil("FAILED", null, T)).toBe(+T + WEEK);
    expect(+voteCooldownUntil("VOID", "too_few", T)).toBe(+T + WEEK);
    expect(+voteCooldownUntil("VOID", "no_heir", T)).toBe(+T + WEEK);
    expect(+voteCooldownUntil("VOID", "chair_moved", T)).toBe(+T);
    expect(+voteCooldownUntil("PASSED", null, T)).toBe(+T);
    expect(voidReasonOf({ status: "VOID", eligibleAtClose: 9, cooldownUntil: T, closedAt: T } as any)).toBe("chair_moved");
  });
});
```

```ts
// test/anticheat/family-vote.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { startVote, voteStartBlock } from "../../src/services/crimeFamily/voteService";
import { claimChair, demoteMember, handOverChair, promoteMember } from "../../src/services/crimeFamily/chairService";
import { kickMember, leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import prisma from "../../src/utils/prisma";
import { testPrisma, seedEligibleUser, seedFamily, seedVote, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyVote", "FamilyBallot"]));
beforeEach(resetFamilies);

const DAY = 86_400_000;
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);
/** Boss + optional Underboss + `capos` Capos + Soldiers up to `size`, everyone joined 10 days ago, at level 10. */
async function voteFamily(o: { size: number; underboss?: boolean; capos?: number; bossSince?: Date; tag?: string }) {
  const boss = await seedEligibleUser({ wallet: 12_000_000 });
  const roles = [...(o.underboss ? ["UNDERBOSS"] : []), ...Array(o.capos ?? 0).fill("CAPO")];
  const ids: string[] = [];
  for (let k = 0; k < o.size - 1; k++) ids.push(await seedEligibleUser({ wallet: 12_000_000 }));
  const f = await seedFamily({ bossId: boss, level: 10, tag: o.tag ?? "VLA", bossSince: o.bossSince,
    members: ids.map((userId, k) => ({ userId, role: (roles[k] ?? "SOLDIER") as any, joinedAt: daysAgo(10) })) });
  return { f, boss, ids };
}
const openVotes = (familyId: string) => testPrisma.familyVote.findMany({ where: { familyId, status: "OPEN" } });

describe("no-confidence vote: start (amendment 4.3)", () => {
  it("edge 1: two Capos start at once → one OPEN vote with the starter's YES; the other is refused", async () => {
    const { f, ids: [, c1, c2] } = await voteFamily({ size: 6, underboss: true, capos: 2 });
    const r = await Promise.allSettled([startVote(c1), startVote(c2)]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("A vote is already open."));
    const open = await openVotes(f.id);
    expect(open).toHaveLength(1);
    expect(await testPrisma.familyBallot.findMany({ where: { voteId: open[0].id } })).toMatchObject([{ userId: open[0].starterId, choice: "YES" }]);
    expect(open[0].eligibleIds.sort()).toEqual([...(await testPrisma.familyMember.findMany({ where: { familyId: f.id, role: { not: "BOSS" } } })).map((m) => m.userId)].sort());
  });

  it("edges 4 and 8: an open vote freezes handover, kick, promote, demote and disband; a Soldier may still leave", async () => {
    const { f, boss, ids: [ub, capo, s1, s2] } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    await startVote(capo);
    await expect(handOverChair(boss, ub)).rejects.toThrow("No handover while a no-confidence vote is open.");
    await expect(kickMember(boss, s1)).rejects.toThrow("No kicks while a no-confidence vote is open.");
    await expect(promoteMember(boss, s1)).rejects.toThrow("No promotions or demotions while a no-confidence vote is open.");
    await expect(demoteMember(boss, capo)).rejects.toThrow("No promotions or demotions while a no-confidence vote is open.");
    await expect(disbandFamily(boss, "VLA")).rejects.toThrow("No disband while a no-confidence vote is open.");
    await expect(leaveFamily(s2)).resolves.toMatchObject({ family: { id: f.id } });
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).bossId).toBe(boss);
  });

  it("edge 10: the Underboss's claim during a vote commits and voids it with no cooldown", async () => {
    const { f, boss, ids: [ub, capo] } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const v = await startVote(capo);
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: daysAgo(8) } });
    await claimChair(f.id, ub);
    const after = await testPrisma.familyVote.findUniqueOrThrow({ where: { id: v.id } });
    expect(after).toMatchObject({ status: "VOID", liveSlot: v.id, resultAnnounced: false });
    expect(+after.cooldownUntil).toBe(+after.closedAt!);
  });

  it("edge 11: handing the chair back and forth never resets the first Boss's grace", async () => {
    const { f, boss, ids: [ub, capo] } = await voteFamily({ size: 6, underboss: true, capos: 1, bossSince: daysAgo(30) });
    const first = (await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).firstBossAt;
    await handOverChair(boss, ub);
    const ubFirst = (await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ub } })).firstBossAt;
    await handOverChair(ub, boss);
    expect(+(await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: boss } })).firstBossAt).toBe(+first);
    expect(await voteStartBlock(prisma, f.id, capo, new Date())).toBeNull();
    await handOverChair(boss, ub); await handOverChair(ub, boss);
    expect(+(await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ub } })).firstBossAt).toBe(+ubFirst);
  });

  it("edge 12: a demoted officer may start a vote for 7 days", async () => {
    const { f, boss, ids: [ub, c1] } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const t = new Date();
    await demoteMember(boss, c1, t);                                     // Capo → Soldier, officerUntil = t + 7 d
    await demoteMember(boss, ub, t);                                     // Underboss → Capo (a seat is free)
    await demoteMember(boss, ub, t);                                     // Capo → Soldier
    expect(await voteStartBlock(prisma, f.id, c1, new Date(+t + 6 * DAY))).toBeNull();
    expect(await voteStartBlock(prisma, f.id, c1, new Date(+t + 8 * DAY))).toBe("Only the Underboss or a Capo can start a no-confidence vote.");
  });

  it("the Boss's 7-day grace and the 7-day cooldown, each at its boundary", async () => {
    const now = new Date();
    const fresh = await voteFamily({ size: 6, capos: 1, bossSince: new Date(+now - 7 * DAY + 1_000), tag: "AAA" });
    expect(await voteStartBlock(prisma, fresh.f.id, fresh.ids[0], now)).toMatch(/^The Boss has held the chair under 7 days: a vote can open <t:\d+:R>\.$/);
    expect(await voteStartBlock(prisma, fresh.f.id, fresh.ids[0], new Date(+now + 1_000))).toBeNull();
    const cooled = await voteFamily({ size: 6, capos: 1, tag: "BBB" });
    await seedVote({ familyId: cooled.f.id, bossId: cooled.boss, starterId: cooled.ids[0], eligibleIds: cooled.ids, status: "FAILED", closedAt: daysAgo(7), cooldownUntil: new Date(+now + 1_000) });
    expect(await voteStartBlock(prisma, cooled.f.id, cooled.ids[0], now)).toMatch(/^A failed vote blocks another until <t:\d+:R>\.$/);
    expect(await voteStartBlock(prisma, cooled.f.id, cooled.ids[0], new Date(+now + 1_000))).toBeNull();
  });

  it("refuses a snapshot of 2, an Associate Capo and the Boss", async () => {
    const small = await voteFamily({ size: 3, capos: 1, tag: "CCC" });
    expect(await voteStartBlock(prisma, small.f.id, small.ids[0], new Date())).toBe("A vote needs 3 members besides the Boss with 72 hours in the family (you have 2).");
    const { f, boss, ids } = await voteFamily({ size: 6, capos: 1, tag: "DDD" });
    await testPrisma.familyMember.update({ where: { userId: ids[0] }, data: { joinedAt: new Date(Date.now() - 3_600_000) } });
    expect(await voteStartBlock(prisma, f.id, ids[0], new Date())).toBe("You need 72 hours in the family to start a vote.");
    expect(await voteStartBlock(prisma, f.id, boss, new Date())).toBe("Only the Underboss or a Capo can start a no-confidence vote.");
    expect(await openVotes(f.id)).toHaveLength(0);
  });
});
```

`names-permissions.test.ts`: `can(UNDERBOSS|CAPO, "start_vote")` true, SOLDIER and BOSS false; `cast_vote` true for SOLDIER, false for BOSS.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/vote-rules.test.ts test/anticheat/family-vote.race.test.ts test/crimeFamily/names-permissions.test.ts`
Expected: FAIL: the modules do not exist.

- [ ] **Step 3: Implement** `voteRules.ts`, `voteHooks.ts` (imports per the Global Constraints hook rule), the extension methods, the chair changes, `createFamily`, the permission rows and the Start half of `voteService.ts`.

- [ ] **Step 4: Run them, plus the membership suite**

Run: `$VT test/crimeFamily/vote-rules.test.ts test/anticheat/family-vote.race.test.ts test/crimeFamily/names-permissions.test.ts test/anticheat/family-membership.race.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/voteRules.ts src/services/crimeFamily/voteHooks.ts src/services/crimeFamily/voteService.ts src/services/crimeFamily/extensions.ts src/services/crimeFamily/chairService.ts src/services/crimeFamily/familyService.ts src/services/crimeFamily/permissions.ts src/services/crimeFamily/views.ts test/crimeFamily/vote-rules.test.ts test/anticheat/family-vote.race.test.ts test/crimeFamily/names-permissions.test.ts
git commit -m "feat(crime-families): no-confidence vote start, the rank/kick/handover/disband freeze and the once-per-member Boss grace"
```

---

### Task 10: Ballots, the close and the announcement CASes

**Files:**
- Modify: `src/services/crimeFamily/voteService.ts` (second half), `src/services/crimeFamily/views.ts` (`VoteView`)
- Test: `test/anticheat/family-vote.race.test.ts`

**Interfaces:**
- Consumes: Task 9's rules, `moveChair`, `pickHeir`, `listMembers`, `familyLabel`.
- Produces: `castBallot`, `closeVote`, `openVoteOf`, `claimVoteAnnouncement`, `setVoteMessage`, `votesDue`, `getVoteView` (top Interfaces block) and:

```ts
// src/services/crimeFamily/views.ts  (F21: no field ever says how anyone voted)
export interface VoteView {
  voteId: string;
  familyId: string;
  familyLabel: string;
  tag: string;
  homeChannelId: string;
  channelId: string;
  messageId: string;
  bossId: string;
  starterId: string;
  status: VoteStatus;
  closesAt: Date;
  eligible: number;        // OPEN: snapshot ids still members (not the Boss); closed: eligibleAtClose
  need: number;            // votePassNeed(eligible)
  voted: number;           // OPEN: ballots from those ids; closed: yes + no
  heirId: string | null;   // OPEN: the current Underboss (null → "the heir order picks the next Boss")
  result: { yes: number; no: number; newBossId: string; voidReason: VoidReason | null } | null;   // null while OPEN
  viewerCanVote: boolean;  // OPEN, viewer in the snapshot and still a member
}
```

  - `castBallot(voteId, userId, choice, now)`: one retry of the whole call when the first attempt throws P2002 on `FamilyBallot_voteId_userId_key` (mapped outside the transaction). Inside one `runFamilyTx`: `familyVote.updateMany({ where: { id: voteId, status: "OPEN", closesAt: { gt: now } }, data: { ballotsVersion: { increment: 1 } } })`, `count !== 1` → `"Voting closed."`; read the vote; presser not in `eligibleIds` or no longer a member of `vote.familyId` → `"You can't vote in this one."`; jailed or banned → the F16 lines; `familyBallot.findFirst({ voteId, userId })` → update `{ choice, castAt: now }`, else create. Returns the vote.
  - `closeVote(voteId, now)`: one `runFamilyTx`: read the vote; return null unless `status === "OPEN" && closesAt <= now`; read the family and its members; `chairMoved = family.bossId !== vote.bossId`; `ids` = snapshot ∩ members − `vote.bossId`; `yes`/`no` = ballots whose `userId` is in `ids`; `heirId` = the member with role UNDERBOSS, else `pickHeir(members without vote.bossId, now)?.userId ?? null`; `decideVote`; CAS `familyVote.updateMany({ where: { id, status: "OPEN" }, data: { status, liveSlot: id, closedAt: now, cooldownUntil: voteCooldownUntil(...), yes, no, eligibleAtClose: ids.length, newBossId: status === "PASSED" ? heirId : "" } })`, `count !== 1` → return null; on PASSED `moveChair(tx, familyId, vote.bossId, heirId, now)`; `touchFamily`; return the closed row. A chair move racing the close writes the family document, so one side retries; the retry sees the new `bossId` and closes VOID (edge 3, 10).
  - `claimVoteAnnouncement(voteId, "start")`: `updateMany({ id, announced: false }) → { announced: true }`; `"result"`: `updateMany({ id, status: { not: "OPEN" }, resultAnnounced: false }) → { resultAnnounced: true }`; true on `count === 1`.
  - `setVoteMessage(voteId, expectMessageId, channelId, messageId)`: CAS on `messageId: expectMessageId`. `claimVoteRepost(voteId)` is added in Task 11 with its only caller.
  - `votesDue(now)`: `close` = OPEN with `closesAt ≤ now`; `announceStart` = OPEN, `announced: false`, `createdAt ≤ now − voteAnnounceGraceSeconds`; `announceResult` = `status ≠ OPEN`, `resultAnnounced: false`, `closedAt ≤ now − voteAnnounceGraceSeconds`.
  - `openVoteOf(familyId)`: the OPEN row or null. `getVoteView` returns null when the vote or its family is gone.

- [ ] **Step 1: Write the failing tests**

Append to `test/anticheat/family-vote.race.test.ts` (extend its imports with `castBallot`, `closeVote`, `claimVoteAnnouncement` from `voteService` and `autoHandover` from `chairService`):

```ts
const vote = (id: string) => testPrisma.familyVote.findUniqueOrThrow({ where: { id } });
const roleOf = async (uid: string) => (await testPrisma.familyMember.findUnique({ where: { userId: uid } }))?.role ?? null;
const bossOf = async (familyId: string) => (await testPrisma.family.findUniqueOrThrow({ where: { id: familyId } })).bossId;
/** An OPEN vote seeded `ageMs` ago with every non-Boss member in the snapshot (the starter's YES included). */
async function openOn(f: { id: string }, boss: string, starter: string, eligibleIds: string[], ageMs = 0) {
  const createdAt = new Date(Date.now() - ageMs);
  const v = await seedVote({ familyId: f.id, bossId: boss, starterId: starter, eligibleIds, createdAt, closesAt: new Date(+createdAt + 2 * DAY) });
  await testPrisma.familyBallot.create({ data: { voteId: v.id, familyId: f.id, userId: starter, choice: "YES", castAt: createdAt } });
  return v;
}
async function ballots(v: { id: string }, voters: string[], choice: "YES" | "NO") {
  for (const u of voters) await castBallot(v.id, u, choice);
}

describe("no-confidence vote: ballots and the close (amendment 4.3 steps 2-4)", () => {
  it("edge 2: a ballot racing the close is either counted or refused 'Voting closed.'; a ballot at closesAt is refused", async () => {
    const { f, boss, ids } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const v = await openOn(f, boss, ids[1], ids);
    const at = v.closesAt;
    const [b, c] = await Promise.allSettled([castBallot(v.id, ids[2], "NO", new Date(+at - 1)), closeVote(v.id, at)]);
    if (b.status === "rejected") expect(b.reason.message).toMatch(BUSY_OR("Voting closed."));
    if (c.status === "rejected") expect(c.reason.message).toMatch(BUSY_OR("never"));
    if (c.status === "rejected" || c.value === null) await closeVote(v.id, at);   // a busy close is retried by the next sweep
    const closed = await vote(v.id);
    expect(closed.status).not.toBe("OPEN");
    expect(closed.no).toBe(b.status === "fulfilled" ? 1 : 0);
    await expect(castBallot(v.id, ids[3], "YES", at)).rejects.toThrow("Voting closed.");
  });

  it("edge 3: two closes in parallel close once and move the chair once", async () => {
    const { f, boss, ids } = await voteFamily({ size: 6, underboss: true, capos: 1 });
    const v = await openOn(f, boss, ids[1], ids);
    await ballots(v, ids.slice(2, 5), "YES");                            // 4 of 5 YES ≥ ceil(10/3) = 4
    const r = await Promise.allSettled([closeVote(v.id, v.closesAt), closeVote(v.id, v.closesAt)]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("never"));
    const rows = r.filter((x) => x.status === "fulfilled" && x.value !== null);
    expect(rows).toHaveLength(1);
    expect(await vote(v.id)).toMatchObject({ status: "PASSED", newBossId: ids[0], yes: 4, no: 0, eligibleAtClose: 5 });
    expect(await bossOf(f.id)).toBe(ids[0]);
    expect(await roleOf(boss)).toBe("SOLDIER");
    expect(await testPrisma.familyMember.count({ where: { familyId: f.id, role: "BOSS" } })).toBe(1);
  });

  it("edge 5: with the Underboss gone the earliest-joined active Capo takes the chair; with no heir the vote is VOID no_heir", async () => {
    const a = await voteFamily({ size: 6, underboss: true, capos: 2, tag: "AAA" });
    const v = await openOn(a.f, a.boss, a.ids[1], a.ids);
    await testPrisma.familyMember.update({ where: { userId: a.ids[2] }, data: { joinedAt: daysAgo(20) } });   // the elder Capo
    await leaveFamily(a.ids[0]);                                         // the Underboss leaves
    await ballots(v, a.ids.slice(2), "YES");
    await closeVote(v.id, v.closesAt);
    expect(await vote(v.id)).toMatchObject({ status: "PASSED", newBossId: a.ids[2] });
    const b = await voteFamily({ size: 4, capos: 1, tag: "BBB" });
    const w = await openOn(b.f, b.boss, b.ids[0], b.ids);
    await ballots(w, b.ids.slice(1), "YES");
    await testPrisma.familyMember.updateMany({ where: { familyId: b.f.id, role: { not: "BOSS" } }, data: { lastActiveAt: daysAgo(30) } });
    const closed = (await closeVote(w.id, w.closesAt))!;
    expect(closed).toMatchObject({ status: "VOID", newBossId: "" });
    expect(+closed.cooldownUntil - +closed.closedAt!).toBe(7 * DAY);
    expect(await bossOf(b.f.id)).toBe(b.boss);
  });

  it("edges 6 and 14: 3 eligible at open, one leaves → VOID too_few with a 7-day cooldown", async () => {
    const { f, boss, ids } = await voteFamily({ size: 4, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    await leaveFamily(ids[2]);
    const closed = (await closeVote(v.id, v.closesAt))!;
    expect(closed).toMatchObject({ status: "VOID", eligibleAtClose: 2 });
    expect(+closed.cooldownUntil - +closed.closedAt!).toBe(7 * DAY);
  });

  it("edge 7: a member who joined after the start cannot vote", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    const late = await seedEligibleUser();
    await testPrisma.familyMember.create({ data: { familyId: f.id, userId: late, role: "SOLDIER", roleSlot: late, seat: 6, joinedAt: daysAgo(10) } });
    await expect(castBallot(v.id, late, "YES")).rejects.toThrow("You can't vote in this one.");
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id, userId: late } })).toBe(0);
  });

  it("edge 9: a pass against a Boss inactive for 7 days still moves the chair to the vote's heir", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, underboss: true, capos: 1 });
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: daysAgo(8) } });
    const v = await openOn(f, boss, ids[1], ids);
    await ballots(v, ids.slice(2), "YES");
    await closeVote(v.id, v.closesAt);
    expect(await bossOf(f.id)).toBe(ids[0]);
  });

  it("edge 15: automatic succession during an open vote voids it with no cooldown", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, underboss: true, capos: 1 });
    const v = await openOn(f, boss, ids[1], ids);
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: daysAgo(15) } });
    expect(await autoHandover(f.id, new Date())).not.toBeNull();
    const after = await vote(v.id);
    expect(after).toMatchObject({ status: "VOID", resultAnnounced: false });
    expect(+after.cooldownUntil).toBe(+after.closedAt!);
  });

  it("a changed ballot counts once with its last choice; 20 YES of 29 passes and 19 fails", async () => {
    const pass = await voteFamily({ size: 30, underboss: true, capos: 6, tag: "PAS" });
    const v = await openOn(pass.f, pass.boss, pass.ids[1], pass.ids);
    await ballots(v, pass.ids.slice(2, 21), "YES");                      // the starter + 19 = 20 YES
    await castBallot(v.id, pass.ids[21], "YES"); await castBallot(v.id, pass.ids[21], "NO");
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id, userId: pass.ids[21] } })).toBe(1);
    expect(await closeVote(v.id, v.closesAt)).toMatchObject({ status: "PASSED", yes: 20, no: 1, eligibleAtClose: 29 });
    const newBoss = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: pass.ids[0] } });
    expect(newBoss.bossedOnce).toBe(true);
    const fail = await voteFamily({ size: 30, underboss: true, capos: 6, tag: "FAL" });
    const w = await openOn(fail.f, fail.boss, fail.ids[1], fail.ids);
    await ballots(w, fail.ids.slice(2, 20), "YES");                      // 19 YES
    expect(await closeVote(w.id, w.closesAt)).toMatchObject({ status: "FAILED", yes: 19, newBossId: "" });
    expect(await bossOf(fail.f.id)).toBe(fail.boss);
  });

  it("ballot races: the same member pressing YES and NO at once leaves one ballot", async () => {
    const { f, boss, ids } = await voteFamily({ size: 6, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    const r = await Promise.allSettled([castBallot(v.id, ids[1], "YES"), castBallot(v.id, ids[1], "NO"), castBallot(v.id, ids[2], "YES")]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("never"));
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id, userId: ids[1] } })).toBeLessThanOrEqual(1);
    expect(await testPrisma.familyBallot.count({ where: { voteId: v.id } })).toBeLessThanOrEqual(3);
  });

  it("the announcement CASes: 'start' is won once in two parallel calls; 'result' is refused while OPEN", async () => {
    const { f, boss, ids } = await voteFamily({ size: 5, capos: 1 });
    const v = await openOn(f, boss, ids[0], ids);
    expect((await Promise.all([claimVoteAnnouncement(v.id, "start"), claimVoteAnnouncement(v.id, "start")])).filter(Boolean)).toHaveLength(1);
    expect(await claimVoteAnnouncement(v.id, "result")).toBe(false);
    await closeVote(v.id, v.closesAt);
    expect((await Promise.all([claimVoteAnnouncement(v.id, "result"), claimVoteAnnouncement(v.id, "result")])).filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/family-vote.race.test.ts`
Expected: FAIL: `castBallot` is not exported.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/anticheat/family-vote.race.test.ts test/crimeFamily/vote-rules.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/voteService.ts src/services/crimeFamily/views.ts test/anticheat/family-vote.race.test.ts
git commit -m "feat(crime-families): secret changeable ballots, the 2/3 close with heir order, and once-only announcement CASes"
```

---

### Task 11: Vote surfaces: S34, S35, the S25 vote card, DMs, the sweeper, routes and `!crew vote`

**Files:**
- Create: `src/ui/crimeFamily/voteScreens.ts`, `src/ui/crimeFamily/voteAnnounce.ts`, `src/services/crimeFamily/voteSweeper.ts` (a job module: it may import `ui/`, as `scheduler.ts` already does), `src/handlers/crewRouteKit.ts`, `src/handlers/crewVoteRoutes.ts`, `test/crimeFamily/vote-layout.test.ts`, `test/crimeFamily/route-tables.test.ts`
- Modify:
  - `src/ui/crimeFamily/ids.ts`: `CrewOpenKind` gains `"vote"`; `CREW_IDS.voteStart/voteOk/voteCancel/ballot` (top Interfaces block).
  - `src/services/dmNoticeService.ts` (four `family` notices below, F19), `src/ui/crimeFamily/announce.ts:55-72` (`announceChairChange` ends with `await announcePendingVoteResults(client, family.id)`, F4).
  - `src/services/crimeFamily/scheduler.ts:115-123`: `SWEEP_VOTES_JOB` in the minute entry.
  - `src/services/crimeFamily/voteService.ts`: `claimVoteRepost` (F9).
  - `src/services/crimeFamily/familyQueries.ts` (`buildDashboardView`: `vote`, `viewer.canStartVote`), `src/services/crimeFamily/views.ts`, `src/ui/crimeFamily/familyScreens.ts` (S2 status "Vote open, closes <t:R>"; the Vote button in the second row).
  - `src/handlers/crewRouteKit.ts` (new leaf; imports only `safeEditReply`, `buildNotice`, `CRIME_FAMILY_CONFIG`, `FamilyError` and `import type` from `crimeFamilyRouter.ts`): `show`, `showThenAnnounce`, `notice`, `owner` move here from `crewInteractionHandler.ts:47-57`, `auto`, `update` from `:323-324`, and `assertInvitesOpen` (`:63-65`) moves here renamed `assertEnabled` with its `NOT_OPEN` line (`:41`). It imports neither `CREW_ROUTES` nor `VOTE_ROUTES`/`RECRUIT_ROUTES`.
  - `src/handlers/crewInteractionHandler.ts`: imports those helpers from `./crewRouteKit` (its local copies are deleted, every `assertInvitesOpen()` call becomes `assertEnabled()`); `openRoute` (`:182-196`) gains `case "vote"`. It does **not** import `VOTE_ROUTES`: a table that spreads a module which imports it back would read `undefined` (spreading `undefined` is silently allowed) whenever the route module loads first, and every `crew:vt`/`crew:vote` press would read "This button is no longer active."
  - `src/handlers/crimeFamilyRouter.ts:38`: `TABLES.crew` becomes `{ ...CREW_ROUTES, ...VOTE_ROUTES }` (Task 15 appends `...RECRUIT_ROUTES`); the router imports every table, and no table imports the router's values or another table.
  - `src/commands/economy/crew.ts:131-153`: `vote` subaction. `src/slash/registry.ts:244-245`: choice `"vote"` (22 of 25).
  - `src/scripts/fixtures/crimeFamilyScreens.ts`, `test/crimeFamily/{handlers,crew-command}.test.ts`, `test/anticheat/family-vote.race.test.ts`.

**Interfaces:**
- Consumes: Task 10's service and `VoteView`; Task 9's `VoteStartView`, `voteStartBlock`; `trailingRender` (`src/ui/crimeFamily/debounce.ts:8`); `sendToChannel`, `editChannelMessage`; `notifyMany`, `sendOptOutDm`; `buildClaimResolved`; `visibleText` (Task 1).
- Produces: `announceVoteStart`, `announceVoteResult`, `requestVoteRender`, `announcePendingVoteResults` (top Interfaces block); `sweepVotes(client, now)` and `SWEEP_VOTES_JOB: CfJob`; `VOTE_ROUTES: CfRouteTable`; `voteEntryScreen(uid: string): Promise<CfPayload>`; the `crewRouteKit.ts` exports (top Interfaces block), `assertEnabled()` among them; `FamilyDashboardView.vote: { voteId: string; closesAt: Date; viewerEligible: boolean } | null` and `viewer.canStartVote: boolean` (`can(start_vote) || officerUntil > now`).
  - Screens (`voteScreens.ts`), component counts per the amendment §4.6:
    - `buildVoteCard(view: VoteView): CfPayload`. OPEN (7): header `` `## No-confidence vote · [${tag}]\n<@${bossId}> · started by <@${starterId}> · closes ${rel(closesAt)}` ``, separator, body `` `Eligible voters: ${eligible} · a pass needs **${need}** YES\n**${voted} of ${eligible} have voted.** Ballots are secret and can change until the close.\n` `` + (`heirId` ? `` `On a pass <@${heirId}> takes the chair.` `` : `"On a pass the heir order picks the next Boss."`), row `Vote YES` (Success, `ballot("yes", voteId)`), `Vote NO` (Danger). Closed (3): the header and one result line: `` `Passed: <@${newBossId}> is Boss (YES ${yes}, NO ${no}, eligible ${eligible})` ``, `` `Failed (YES ${yes}, NO ${no}, eligible ${eligible}, needed ${need})` ``, or `Void: the chair changed hands.` / `Void: fewer than 3 eligible voters remained.` / `Void: nobody could take the chair.`. `allowedMentions` none.
    - `buildVoteStartConfirm(v: VoteStartView): CfPayload` (6): `` `Start a no-confidence vote against <@${bossId}>?` ``; `` `Eligible voters: ${eligible} · a pass needs ${need} YES · 48 hours.\nYou are named as the starter and vote YES. A failed vote, or one voided for too few eligible voters, blocks another for 7 days. Ranks, kicks, disband and handover freeze while it is open.` `` (+ `` `\n**${block}**` `` when blocked); row `Start vote` (Danger, `voteOk`, disabled when `block`), `Cancel` (`voteCancel`).
    - `buildVoteSeatCard(view: VoteView): CfPayload` (5): `` `No-confidence vote on <@${bossId}> in [${tag}] closes ${rel(closesAt)}. Ballots are secret.` `` and the YES/NO row.
  - DMs (`family`, icon `rank_boss`): `familyVoteOpenedNotice(v: { familyLabel; bossId; starterId; closesAt; need; eligible }, row: ActionRowBuilder<ButtonBuilder>)` (9), `familyVoteAgainstYouNotice(v: { familyLabel; starterId; closesAt })` (6), `familyVoteResultNotice(v: { familyLabel; line: string })` (6, `line` = the S34 result line), `familyNewBossNotice(v: { familyLabel })` (6, "You are now the Boss of [TAG]").
  - `announceVoteStart(client, voteId)`: only when `claimVoteAnnouncement(voteId, "start")`; post `buildVoteCard` to `homeChannelId`; `setVoteMessage(voteId, "", homeChannelId, id ?? "")`; DM every snapshot id `familyVoteOpenedNotice` with the YES/NO row; DM the Boss `familyVoteAgainstYouNotice`. Never throws (`safely`).
  - `announceVoteResult(client, voteId)`: only when `claimVoteAnnouncement(voteId, "result")`; edit S34 to the result, or when the edit is `"dead"` or `messageId === ""`, post it once and store it; on PASSED with a stored S23 (`claimChannelId`/`claimMessageId`), edit it to `buildClaimResolved("Chair taken by vote")`; DM every current member plus the old Boss `familyVoteResultNotice`; on PASSED DM the new Boss `familyNewBossNotice`.
  - `requestVoteRender(client, voteId)`: `trailingRender("vote", voteId, voteRenderDebounceSeconds, …)`; the render reads the view, stops unless OPEN or when `messageId === ""`, edits S34; on a `"dead"` edit it first wins `claimVoteRepost(voteId)` (`familyVote.updateMany({ where: { id, reposted: false }, data: { reposted: true } })`, `count === 1`; exported from `voteService.ts` beside `setVoteMessage`), then posts once and stores the result with `setVoteMessage(voteId, oldId, homeChannelId, newId ?? "")`; a lost claim stores `""` the same way, so every later render stops and only DMs carry the vote (F9).
  - `announcePendingVoteResults(client, familyId)`: `announceVoteResult` for each of the family's closed votes with `resultAnnounced: false`.
  - `sweepVotes(client, now)`: `votesDue(now)`; each `close` id → `closeVote` then, when it returned a row, `announceVoteResult`; each `announceStart` → `announceVoteStart`; each `announceResult` → `announceVoteResult`; one failure never stops the rest (A42).
  - Routes (`VOTE_ROUTES`): `"vt:start"` `{ owner, auto }` → `voteEntryScreen(owner)` (F20); `"vt:ok"` `{ owner, update }` → `assertEnabled()`, `startVote`, then `showThenAnnounce` a notice `` `Vote started. It closes ${rel(closesAt)}.` `` and `announceVoteStart`; `"vt:cancel"` `{ owner, update }` → "Cancelled."; `vote` `{ shared, ephemeral }` → `assertEnabled()`, `castBallot(args[1], i.user.id, args[0] === "yes" ? "YES" : "NO")`, reply `` `Your ballot: ${choice}. You can change it until ${rel(closesAt)}. Ballots are secret.` `` built from the pressed button (F21), then `void requestVoteRender(i.client, voteId)`. `voteEntryScreen`: an OPEN vote → `buildVoteSeatCard`; else `buildVoteStartConfirm(await getVoteStartView(uid, now))`.
  - `!crew vote`: an open vote → reply with `buildVoteSeatCard` (public); else when the caller is an Underboss, a Capo or has `officerUntil > now` → S27 opener `crew:open:vote:<uid>` ("start a no-confidence vote.", label "Start vote…"); else the `voteStartBlock` line as the refusal. `!crew vote start` always replies with the opener.
  - S2 second row (with Task 6's claim button): `Vote` (Danger, `voteStart(owner)`) when `vote?.viewerEligible` or (`!vote && viewer.canStartVote`).

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/vote-layout.test.ts
import { describe, it, expect } from "vitest";
import { buildVoteCard, buildVoteSeatCard, buildVoteStartConfirm } from "../../src/ui/crimeFamily/voteScreens";
import type { VoteView } from "../../src/services/crimeFamily/views";
import { visibleText } from "./visibleText";
import { countComponents } from "./layoutHelpers";

const base: VoteView = {
  voteId: "65f0000000000000000000aa", familyId: "65f0000000000000000000ff", familyLabel: "[VLA] Velvet Ante", tag: "VLA",
  homeChannelId: "c", channelId: "c", messageId: "m", bossId: "1", starterId: "2", status: "OPEN", closesAt: new Date(Date.now() + 3_600_000),
  eligible: 29, need: 20, voted: 11, heirId: "3", result: null, viewerCanVote: true,
};

describe("vote screens (amendment 4.6)", () => {
  it("S34 open: 7 components, counts only, nobody's choice", () => {
    const p = buildVoteCard(base);
    expect(countComponents(p)).toBe(7);
    const t = visibleText(p);
    expect(t).toContain("11 of 29 have voted");
    expect(t).toContain("needs **20** YES");
    expect(t).toContain("<@3> takes the chair");
    expect(p.allowedMentions).toEqual({ parse: [] });
  });
  it("S34 result variants: 3 components each", () => {
    const passed = buildVoteCard({ ...base, status: "PASSED", result: { yes: 21, no: 6, newBossId: "3", voidReason: null } });
    expect(countComponents(passed)).toBe(3);
    expect(visibleText(passed)).toContain("Passed: <@3> is Boss (YES 21, NO 6, eligible 29)");
    expect(visibleText(buildVoteCard({ ...base, status: "VOID", result: { yes: 0, no: 0, newBossId: "", voidReason: "chair_moved" } }))).toContain("Void: the chair changed hands.");
  });
  it("S35 is 6 and S25 vote is 5; a blocked S35 disables Start", () => {
    const s35 = buildVoteStartConfirm({ ownerId: "2", familyLabel: "[VLA] Velvet Ante", bossId: "1", eligible: 29, need: 20, openVoteId: null, block: "A vote is already open." });
    expect(countComponents(s35)).toBe(6);
    expect(JSON.stringify(s35.components[0].toJSON())).toMatch(/"disabled":true/);
    expect(countComponents(buildVoteSeatCard(base))).toBe(5);
  });
});
```

In `handlers.test.ts` (Review Focus 4): a DM YES pressed after `closesAt` → "Voting closed." and no ballot row; a ballot from a member who left → "You can't vote in this one."; `crew:vt:start` with a vote open shows the S25 vote card, without one shows S35; `crew:vt:ok` posts S34 once (`fakeClient().calls` has one send to the home channel) and DMs every snapshot id once.

Append to `family-vote.race.test.ts` the secrecy test (A16, spec §4.9) and the repost bound (F9); import `getVoteView`, `castBallot` from `voteService`, `buildVoteCard`, `buildVoteSeatCard` from `voteScreens`, `familyVoteResultNotice` from `dmNoticeService`, `requestVoteRender` from `voteAnnounce`, `visibleText` from `../crimeFamily/visibleText`, `fakeClient` from `../crimeFamily/fakeClient`:

```ts
it("no S34, S25 vote card or result DM ever pairs a voter with a choice (A16)", async () => {
  const { f, boss, ids } = await voteFamily({ size: 6, underboss: true, capos: 1 });
  const v = await openOn(f, boss, ids[1], ids);
  const [a, b] = [ids[2], ids[3]];
  await castBallot(v.id, a, "YES");
  await castBallot(v.id, b, "NO");
  const now = new Date();
  const views = await Promise.all([a, b, null].map((viewer) => getVoteView(v.id, viewer, now)));
  const texts = views.map((view) => visibleText(buildVoteCard(view!)) + visibleText(buildVoteSeatCard(view!)));
  expect(new Set(texts.map((t) => t.replace(/<t:\d+:R>/g, ""))).size).toBe(1);       // identical for A, B and no viewer
  await closeVote(v.id, v.closesAt);
  const closed = (await getVoteView(v.id, a, now))!;
  const result = visibleText(buildVoteCard(closed));
  const dm = visibleText(familyVoteResultNotice({ familyLabel: "[VLA] Velvet Ante", line: result }));
  for (const t of [...texts, result, dm]) {
    for (const who of [a, b]) expect(t).not.toMatch(new RegExp(`<@${who}>[^\\n]{0,40}\\b(YES|NO)\\b|\\b(YES|NO)\\b[^\\n]{0,40}<@${who}>`));
  }
  expect(Object.keys(closed)).not.toContain("ballots");
});

it("a dead S34 is reposted once for the life of the vote, then renders stop (F9)", async () => {
  const { f, boss, ids } = await voteFamily({ size: 6, capos: 1 });
  const v = await openOn(f, boss, ids[0], ids);
  await testPrisma.familyVote.update({ where: { id: v.id }, data: { channelId: "c-home", messageId: "m-old" } });
  const c = fakeClient({ failEdit: new Set(["c-home"]) });                 // every edit is refused: the board stays dead
  for (let k = 0; k < 3; k++) {
    await castBallot(v.id, ids[1 + k], "YES");
    await testRedis().del(`cf:render:vote:${v.id}`);                       // each call is the first event of its window: it renders at once
    await requestVoteRender(c.client as any, v.id);
  }
  expect(c.calls.filter((x) => x.op === "send")).toHaveLength(1);
  expect(await vote(v.id)).toMatchObject({ reposted: true });
});
```

(`requestVoteRender` runs through `trailingRender` (`debounce.ts:8`), whose first event renders synchronously, so the test deletes the window key before each call instead of waiting; add `testRedis` to the helpers import. `fakeClient`'s `failEdit` answers 50013, which `post.ts` maps to `"dead"`.)

In `family-vote.race.test.ts` (edge 13): make `announceVoteStart`'s first call throw before its CAS (`vi.spyOn(voteService, "claimVoteAnnouncement").mockRejectedValueOnce(new Error("crash"))`), then run `sweepVotes` twice at `createdAt + 61 s`: one S34 send and one DM per recipient. The same shape after a close for `announceVoteResult`. And: `announceChairChange` after a claim edits S34 to "Void: the chair changed hands." once.

In `crew-command.test.ts`: `!crew vote` with a vote open replies S25 vote; a Capo with none gets the opener; a Soldier gets "Only the Underboss or a Capo can start a no-confidence vote.".

```ts
// test/crimeFamily/route-tables.test.ts: loads a route module before crewInteractionHandler (the import-cycle guard)
import { describe, it, expect } from "vitest";
import { VOTE_ROUTES } from "../../src/handlers/crewVoteRoutes";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { CREW_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, said } from "./fakeInteraction";
import { withCfConfig, seedEligibleUser, resetFamilies } from "../helpers";

describe("route tables (Task 11)", () => {
  it("crew:vt:start routes even when crewVoteRoutes is the first route module loaded", async () => {
    await resetFamilies();
    expect(VOTE_ROUTES["vt:start"]).toBeDefined();
    const uid = await seedEligibleUser();
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.voteStart(uid), { userId: uid, ephemeralSource: true });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).not.toContain("This button is no longer active.");
      expect(said(i)).toContain("You are not in a crime family.");
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/vote-layout.test.ts test/crimeFamily/route-tables.test.ts test/crimeFamily/handlers.test.ts test/crimeFamily/crew-command.test.ts test/anticheat/family-vote.race.test.ts`
Expected: FAIL: `voteScreens` does not exist.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Add the fixtures**

`crimeFamilyScreens.ts`: "S34 vote card (29 eligible)" max 7; "S34 vote result" max 3; "S35 vote confirm (blocked)" max 6; "S25 vote card" max 5; "S2 dashboard (claim and vote, 30 members)" max 20; DM containers wrapped in `cfPayload(...)`: vote opened (with the row) max 9, against you 6, result 6, new Boss 6. Every text uses the longest label and a 20-digit id.

- [ ] **Step 5: Run the suites and the payload audit**

Run: `$VT test/crimeFamily test/anticheat/family-vote.race.test.ts && npm run typecheck && npm run validate:slash && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; 73/100; "All payloads within Discord limits".

- [ ] **Step 6: Commit**

```bash
git add src/ui/crimeFamily/voteScreens.ts src/ui/crimeFamily/voteAnnounce.ts src/services/crimeFamily/voteSweeper.ts src/handlers/crewRouteKit.ts src/handlers/crewVoteRoutes.ts src/handlers/crimeFamilyRouter.ts src/services/crimeFamily/voteService.ts src/ui/crimeFamily/ids.ts src/services/dmNoticeService.ts src/ui/crimeFamily/announce.ts src/services/crimeFamily/scheduler.ts src/services/crimeFamily/familyQueries.ts src/services/crimeFamily/views.ts src/ui/crimeFamily/familyScreens.ts src/handlers/crewInteractionHandler.ts src/commands/economy/crew.ts src/slash/registry.ts src/scripts/fixtures/crimeFamilyScreens.ts test
git commit -m "feat(crime-families): vote card, confirm, DMs, the vote sweeper, ballot routes and !crew vote"
```

---

### Task 12: Recruitment listing and applications: the text rule, requirements, apply and withdraw

**Files:**
- Create: `src/services/crimeFamily/recruitService.ts` (listing, apply, withdraw), `test/crimeFamily/recruit-text.test.ts`, `test/anticheat/family-recruit.race.test.ts`
- Modify:
  - `src/data/crimeFamilyCatalog.ts` (after `FAMILY_NAME_SLURS`, `:35-39`): `export const PITCH_DENYLIST: readonly string[] = ["fortuna", "admin", "staff", "mod", "moderator", "discord"];`.
  - `src/services/crimeFamily/names.ts`: `checkPublicText`, `PublicTextCheck`.
  - `src/services/crimeFamily/tx.ts` (after `touchFamily`, `:52-55`): `touchUser`.
  - `src/services/crimeFamily/permissions.ts`: `edit_listing: UNDERBOSS_UP`, `review_apps: CAPO_UP` (F13).
  - `src/services/crimeFamily/membershipService.ts`: kind-scoped reads and CASes (below); `joinFamilyInTx` ends by withdrawing the joiner's other PENDING applications.
  - `test/crimeFamily/names-permissions.test.ts`.

**Interfaces:**
- Consumes: `FamilyInvite.kind/message` (Task 2); `joinFamilyInTx` (Task 4); `parseBidAmount` (`bidService.ts:105`); `computeNetWorth`; `checkMemberEligibility`; `isUniqueViolation`.
- Produces: `checkPublicText`, `touchUser`, `ListingInput`, `RequirementParse`, `parseRequirement`, `editListing`, `setRecruiting`, `applyToFamily`, `withdrawApplication` (top Interfaces block); `REQUIREMENTS: readonly { key: keyof Requirements; label: string; field: keyof Family; max: number; unit: string }[]` in `recruitService.ts` (net worth → `recruitMinNetWorth`, `recruitLimits.netWorth`, "net worth"; shifts → `recruitMinShifts`, 5,000, "lifetime shifts"; ageDays → `recruitMinAgeDays`, 730, "days on Fortuna"; heists → `recruitMinHeists`, 1,000, "crew heists"), the one table Tasks 14 and 15 render from; `export type Requirements = { netWorth: number; shifts: number; ageDays: number; heists: number }` (Task 14's `recruitQueries.ts` imports it); and `export type BoardSort = "lvl" | "mem" | "act"`, defined here so Task 13's `ids.ts` can `import type` it before `recruitQueries.ts` exists (Task 14 re-exports it from there).
  - `checkPublicText(raw, { min, max })` (A37 plus Review Focus 3): remove `/[​-‍⁠﻿]/g`; trim; collapse `/\s+/g` to one space; then in order: length outside `min..max` → `` `Write ${min}–${max} characters.` ``; `/<@[!&]?\d+>|<#\d+>|@everyone|@here/i` → `"No mentions or pings."`; `/(https?:\/\/|www\.|discord\.gg|discord(app)?\.com\/invite|dsc\.gg|\]\()/i` → `"No links or invites."`; the per-word slur rule (split on spaces, fold each word with the `names.ts:17-20` fold, append one extra word per run of ≥ 2 consecutive one-character folded words joined, refuse when any word contains a `FAMILY_NAME_SLURS` entry) → `"That text is not allowed."`; `PITCH_DENYLIST` as whole words of the lowercased text (`\b…\b`) → `"Don't use Fortuna, staff or Discord names."`. Returns `{ ok: true, text }` with the collapsed text. Names and tags keep `isDenied`.
  - `touchUser(tx, discordId, now)`: the `touchFamily` pattern on `User.updatedAt` (read, then write `max(now, updatedAt + 1 ms)`).
  - `parseRequirement(raw, max)`: `raw.trim()` empty or `"0"` → `{ ok: true, value: 0 }`; `parseBidAmount` null → `{ ok: false, reason: "Enter a whole number like 10m or 1,000." }`; above `max` → `` { ok: false, reason: `Max ${fmtFortunes(max)}.` } ``.
  - `editListing(actorId, input, now)`: parse and check everything first (a refusal is `` `${label}: ${reason}` `` for a requirement, the `checkPublicText` reason for the pitch; nothing is written); a blank `pitch` keeps the stored one (F10); then one `runFamilyTx`: `touchFamily`, re-read the actor, `can(actor, "edit_listing")` else `NO_PERMISSION`, write `recruitPitch`, the four `recruitMin*` and `recruitEditedAt: now`. Returns the family.
  - `setRecruiting(actorId, on, now)`: one `runFamilyTx` with the same permission re-read; `on` with `recruitPitch === ""` → `"Write a pitch first (Edit listing)."`.
  - `applyToFamily(i)`: `checkPublicText(message, applicationChars)` first; then one `runFamilyTx`, refusing in this order: `touchFamily` (gone → `"That family no longer exists."`), `touchUser`; the applicant has a member row → `"You are already in a family."`; `checkMemberEligibility(applicantId, "family_join", { now, familyId })` → `eligibilityError`; `!family.recruiting` → `` `[${tag}] is not recruiting.` ``; `memberCount >= levelDef(level).memberCap` → `` `[${tag}] is full.` ``; each `REQUIREMENTS` row against uncached stats (`computeNetWorth` inside the callback; `user.shiftsWorked`; `floor((now − user.createdAt) / 86,400,000)`; `caperCrew.count({ where: { userId, started: true } })`) → `` `[${tag}] needs ${fmtFortunes(need)} ${unit} (you have ${fmtFortunes(have)}).` ``; the applicant's PENDING applications `>= maxPendingApplicationsPerApplicant` → `"You have 3 pending applications. Withdraw one first."`; the family's PENDING applications `>= maxPendingApplicationsPerFamily` → `` `[${tag}]'s inbox is full. Try again later.` ``; the one reapply `findFirst` of amendment §8.4 step 2 → DECLINED: `` `[${tag}] declined you: you can apply again ${rel(resolvedAt + 7 d)}.` ``, WITHDRAWN/EXPIRED: `` `You can apply to [${tag}] again ${rel(resolvedAt + 24 h)}.` ``; then `familyInvite.create({ kind: "APPLICATION", inviterId: "", inviteeId, message: text, status: "PENDING", slot: "PENDING", guildId, channelId, expiresAt: now + applicationTtlSeconds })` (F12). P2002 on `FamilyInvite_familyId_inviteeId_slot_key`, outside → `"You already have a pending invite or application with this family."`.
  - `withdrawApplication(appId, applicantId, now)`: read the row (missing, another invitee or `kind !== "APPLICATION"` → `"Application no longer pending."`); one `runFamilyTx` with `touchFamily` (skipped when the family is gone) and `touchUser`, CAS `{ id, inviteeId, kind: "APPLICATION", status: "PENDING" } → { status: "WITHDRAWN", slot: id, resolvedAt: now }`, `count !== 1` → `"Application no longer pending."`.
  - `membershipService` (Review Focus 1): `readOwnInvite` (`:84-89`) treats `kind !== "INVITE"` as missing (`"Invite expired."`); the `acceptInvite` and `declineInvite` CASes add `kind: "INVITE"`; `pendingInviteFromTag` (`:144`), `listPendingInvites` (`:177`) and the pending-invites count in `inviteMember` (`:59`) filter `kind: "INVITE"`; inside `inviteMember`'s transaction, a PENDING application for the pair → `` `<@${inviteeId}> already applied: accept it in the inbox.` `` (edge 8.11.8); `joinFamilyInTx` ends with one CAS per other PENDING application of `uid` → `{ status: "WITHDRAWN", slot: id, resolvedAt: now }`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/recruit-text.test.ts
import { describe, it, expect } from "vitest";
import { checkPublicText } from "../../src/services/crimeFamily/names";
import { parseRequirement } from "../../src/services/crimeFamily/recruitService";

const P = { min: 10, max: 150 };
const ok = (s: string) => checkPublicText(s, P);

describe("checkPublicText (A37)", () => {
  it.each(["Where there is a street, we run it.", "Don't be a nerd, we play daily", "go ok team, heists nightly",
    "we are tardy but loyal", "much inky ink here ok"])("accepts %s", (s) => expect(ok(s).ok).toBe(true));
  it.each([
    ["Join us at discord.gg/abc now", "No links or invites."],
    ["@everyone welcome to the crew", "No mentions or pings."],
    ["@​everyone welcome to the crew", "No mentions or pings."],
    ["visit disc​ord.gg/abc today", "No links or invites."],
    ["Fortuna staff family recruiting", "Don't use Fortuna, staff or Discord names."],
    ["we are n i g g e r s crew", "That text is not allowed."],
    ["we are n.i.g.g.e.r crew ok", "That text is not allowed."],
    ["short", "Write 10–150 characters."],
  ])("refuses %s", (s, reason) => expect(ok(s)).toEqual({ ok: false, reason }));
  it("collapses whitespace and keeps markdown as literal text for the renderer to escape", () => {
    expect(ok("**bold**   # Big\n\n\n-# tiny ||spoiler|| <t:0:R>")).toEqual({ ok: true, text: "**bold** # Big -# tiny ||spoiler|| <t:0:R>" });
  });
});

describe("parseRequirement (Review Focus 2)", () => {
  it.each([["10m", 10_000_000], ["2.5b", 2_500_000_000], ["1,000", 1_000], ["", 0], ["0", 0]])("%s → %i", (raw, v) =>
    expect(parseRequirement(raw, 10_000_000_000)).toEqual({ ok: true, value: v }));
  it.each(["-5", "abc", "1e9", "2.5", "all"])("refuses %s", (raw) =>
    expect(parseRequirement(raw, 5_000)).toEqual({ ok: false, reason: "Enter a whole number like 10m or 1,000." }));
  it("names the limit", () => expect(parseRequirement("20b", 10_000_000_000)).toEqual({ ok: false, reason: "Max 10,000,000,000." }));
});
```

```ts
// test/anticheat/family-recruit.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { applyToFamily, editListing, withdrawApplication } from "../../src/services/crimeFamily/recruitService";
import { acceptInvite, acceptInviteByTag, declineInviteByTag, inviteMember, listPendingInvites } from "../../src/services/crimeFamily/membershipService";
import { redisService } from "../../src/services/redisService";
import { testPrisma, seedEligibleUser, seedFamily, seedApplication, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "User"]));
beforeEach(resetFamilies);

const HOUR = 3_600_000;
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()[\]]/g, "\\$&")}|Vault busy, try again\\.)$`);
const PITCH = "We run heists every night and pay on time.";
let tagSeq = 0;
/** A recruiting family (Boss + `size - 1` Soldiers) with optional requirements. */
async function recruiting(o: { size?: number; level?: number; req?: Partial<Record<"recruitMinNetWorth" | "recruitMinShifts" | "recruitMinAgeDays" | "recruitMinHeists", number>>; on?: boolean } = {}) {
  const boss = await seedEligibleUser();
  const ids: string[] = [];
  for (let k = 0; k < (o.size ?? 1) - 1; k++) ids.push(await seedEligibleUser());
  const tag = `R${++tagSeq}`;
  const f = await seedFamily({ bossId: boss, tag, level: o.level ?? 1, members: ids.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
    data: { recruiting: o.on ?? true, recruitPitch: PITCH, ...o.req } });
  return { f, boss, ids, tag };
}
const apply = (applicantId: string, familyId: string, message = "I run heists daily") => applyToFamily({ applicantId, familyId, message, guildId: "g1", channelId: "c1" });
const pending = (where: object) => testPrisma.familyInvite.count({ where: { kind: "APPLICATION", status: "PENDING", ...where } });

describe("applications (amendment 8.4)", () => {
  it("edge 1: four parallel applies never leave more than 3 PENDING; retrying the busy ones fills to exactly 3", async () => {
    const p = await seedEligibleUser();
    const fams = await Promise.all([0, 1, 2, 3].map(() => recruiting()));
    const r = await Promise.allSettled(fams.map(({ f }) => apply(p, f.id)));
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("You have 3 pending applications. Withdraw one first."));
    expect(await pending({ inviteeId: p })).toBeLessThanOrEqual(3);
    for (const [k, x] of r.entries()) {
      if (x.status === "rejected" && /busy/.test(x.reason.message)) await apply(p, fams[k].f.id).catch((e) => expect(e.message).toBe("You have 3 pending applications. Withdraw one first."));
    }
    expect(await pending({ inviteeId: p })).toBe(3);
  });

  it("edge 2: 26 parallel applicants never leave more than 25 PENDING; retrying the busy ones fills to exactly 25", async () => {
    const { f, tag } = await recruiting();
    const ps: string[] = [];
    for (let k = 0; k < 26; k++) ps.push(await seedEligibleUser());
    const full = `[${tag}]'s inbox is full. Try again later.`;
    const r = await Promise.allSettled(ps.map((p) => apply(p, f.id)));
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR(full));
    expect(await pending({ familyId: f.id })).toBeLessThanOrEqual(25);
    for (const [k, x] of r.entries()) {
      if (x.status === "rejected" && /busy/.test(x.reason.message)) await apply(ps[k], f.id).catch((e) => expect(e.message).toBe(full));
    }
    expect(await pending({ familyId: f.id })).toBe(25);
  });

  it("edge 7: reapply waits: 7 days after a decline, 24 hours after a withdraw or expiry", async () => {
    const { f, tag } = await recruiting();
    const p = await seedEligibleUser();
    const prior = (status: string, ago: number) => seedApplication({ familyId: f.id, applicantId: p, status, resolvedAt: new Date(Date.now() - ago) });
    const clear = () => testPrisma.familyInvite.deleteMany({ where: { inviteeId: p } });
    await prior("DECLINED", 6 * 24 * HOUR);
    await expect(apply(p, f.id)).rejects.toThrow(new RegExp(`^\\[${tag}\\] declined you: you can apply again <t:\\d+:R>\\.$`));
    await clear(); await prior("DECLINED", 7 * 24 * HOUR);
    await expect(apply(p, f.id)).resolves.toMatchObject({ status: "PENDING" });
    for (const status of ["WITHDRAWN", "EXPIRED"]) {
      await clear(); await prior(status, 2 * HOUR);
      await expect(apply(p, f.id)).rejects.toThrow(new RegExp(`^You can apply to \\[${tag}\\] again <t:\\d+:R>\\.$`));
      await clear(); await prior(status, 24 * HOUR);
      await expect(apply(p, f.id)).resolves.toMatchObject({ status: "PENDING" });
    }
  });

  it("a withdraw racing an apply to the same family never leaves two PENDING rows", async () => {
    const { f, tag } = await recruiting();
    const p = await seedEligibleUser();
    const a = await apply(p, f.id);
    const r = await Promise.allSettled([withdrawApplication(a.id, p), apply(p, f.id)]);
    expect(await pending({ familyId: f.id, inviteeId: p })).toBeLessThanOrEqual(1);
    const [w, again] = r;
    if (w.status === "fulfilled" && again.status === "rejected") {
      expect(again.reason.message).toMatch(new RegExp(`^(You already have a pending invite or application with this family\\.|You can apply to \\[${tag}\\] again <t:\\d+:R>\\.|Vault busy, try again\\.)$`));
    }
  });

  it("requirements are read uncached: a stale 50M display cache does not pass a live 1M", async () => {
    const { f, tag } = await recruiting({ req: { recruitMinNetWorth: 10_000_000 } });
    const p = await seedEligibleUser({ wallet: 1_000_000 });
    await redisService.set(`networth:${p}`, { total: 50_000_000 }, 600);
    await expect(apply(p, f.id)).rejects.toThrow(`[${tag}] needs 10,000,000 net worth (you have 1,000,000).`);
    expect(await pending({ inviteeId: p })).toBe(0);
  });

  it("a full family and a closed listing refuse; a refused listing edit writes nothing; a Capo cannot edit", async () => {
    const full = await recruiting({ size: 10, level: 1 });                // L1 cap 10
    const closed = await recruiting({ on: false });
    const p = await seedEligibleUser();
    await expect(apply(p, full.f.id)).rejects.toThrow(`[${full.tag}] is full.`);
    await expect(apply(p, closed.f.id)).rejects.toThrow(`[${closed.tag}] is not recruiting.`);
    const before = (await testPrisma.family.findUniqueOrThrow({ where: { id: closed.f.id } })).recruitEditedAt;
    const input = { pitch: "", minNetWorth: "abc", minShifts: "", minAgeDays: "", minHeists: "" };
    await expect(editListing(closed.boss, input)).rejects.toThrow(/net worth: Enter a whole number like 10m or 1,000\.$/i);
    await expect(editListing(closed.boss, { ...input, minNetWorth: "", pitch: "visit discord.gg/abc now" })).rejects.toThrow("No links or invites.");
    expect(+(await testPrisma.family.findUniqueOrThrow({ where: { id: closed.f.id } })).recruitEditedAt).toBe(+before);
    const capo = await seedEligibleUser();
    await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }] });
    await expect(editListing(capo, { ...input, minNetWorth: "", pitch: PITCH })).rejects.toThrow("You don't have permission to do that.");
  });

  it("Review Focus 1: an application never passes through the invite paths", async () => {
    const { f, tag } = await recruiting();
    const p = await seedEligibleUser();
    const a = await apply(p, f.id);
    await expect(acceptInvite(a.id, p)).rejects.toThrow("Invite expired.");
    await expect(acceptInviteByTag(p, tag)).rejects.toThrow("You have no pending invite from that family.");
    await expect(declineInviteByTag(p, tag)).rejects.toThrow("You have no pending invite from that family.");
    expect(await listPendingInvites(p)).toEqual([]);
    expect(await testPrisma.familyInvite.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: "PENDING", kind: "APPLICATION" });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: p } })).toBeNull();
  });

  it("edge 8: inviting a player who already applied points the officer to the inbox", async () => {
    const { f, boss } = await recruiting();
    const p = await seedEligibleUser();
    await apply(p, f.id);
    await expect(inviteMember({ inviterId: boss, inviteeId: p, guildId: "g1", channelId: "c1" })).rejects.toThrow(`<@${p}> already applied: accept it in the inbox.`);
  });

  it("accepting an invite withdraws the joiner's other PENDING applications", async () => {
    const a = await recruiting(); const b = await recruiting();
    const inviter = await recruiting();
    const p = await seedEligibleUser();
    const [x, y] = [await apply(p, a.f.id), await apply(p, b.f.id)];
    const inv = await inviteMember({ inviterId: inviter.boss, inviteeId: p, guildId: "g1", channelId: "c1" });
    await acceptInvite(inv.id, p);
    for (const id of [x.id, y.id]) expect(await testPrisma.familyInvite.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "WITHDRAWN", slot: id });
  });
});
```

`names-permissions.test.ts`: `edit_listing` for BOSS/UNDERBOSS only; `review_apps` for BOSS/UNDERBOSS/CAPO.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/recruit-text.test.ts test/anticheat/family-recruit.race.test.ts test/crimeFamily/names-permissions.test.ts`
Expected: FAIL: `checkPublicText` and `recruitService` do not exist.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run them, plus the membership suite**

Run: `$VT test/crimeFamily/recruit-text.test.ts test/anticheat/family-recruit.race.test.ts test/crimeFamily/names-permissions.test.ts test/anticheat/family-membership.race.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/crimeFamilyCatalog.ts src/services/crimeFamily/names.ts src/services/crimeFamily/tx.ts src/services/crimeFamily/permissions.ts src/services/crimeFamily/recruitService.ts src/services/crimeFamily/membershipService.ts test/crimeFamily/recruit-text.test.ts test/anticheat/family-recruit.race.test.ts test/crimeFamily/names-permissions.test.ts
git commit -m "feat(crime-families): recruitment listing, stat requirements, applications with per-applicant and per-family caps"
```

---

### Task 13: Accepting and declining applications, expiry, officer digests and the `recruit` DM type

**Files:**
- Create: `src/ui/crimeFamily/recruitAnnounce.ts`
- Modify:
  - `src/services/crimeFamily/recruitService.ts`: `acceptApplication`, `declineApplication`, `familiesDueDigest`, `claimDigest`.
  - `src/services/dmPrefsService.ts:14-29`: `recruit: { label: "Family applications", group: "account" }` after `turf`.
  - `src/services/dmNoticeService.ts`: four `recruit` notices (below).
  - `src/ui/crimeFamily/ids.ts`: every recruitment id of the top Interfaces block (`board`, `boardSelect`, `myApps`, `withdraw`, `familyCard`, `applyOpen`, `applyModal`, `recruit`, `recruitEdit`, `recruitModal`, `appAnswer`, `inboxPage`), with `import type { BoardSort, Requirements } from "../../services/crimeFamily/recruitService"` (both exist since Task 12, so this commit type-checks); the digest's button is the first caller.
  - `src/services/crimeFamily/scheduler.ts:40-44` (`sweepInvites` splits by kind), `:124-131` (`sendApplicationDigests` in the `10 * * * *` entry).
  - `src/services/crimeFamily/disbandService.ts:77-80` (the PENDING-invite expiry loop): `pending` selects `{ id, kind, inviteeId, familyId }` and the loop also collects the `kind === "APPLICATION"` rows; `disbandFamily`'s result gains `expiredApplications: FamilyInvite[]`. `src/ui/crimeFamily/announce.ts:92-103`: `announceDisband` ends with `announceExpiredApplications`.
  - `src/scripts/fixtures/crimeFamilyScreens.ts` (the four DM containers), `test/dm/family-notice.test.ts`, `test/anticheat/family-recruit.race.test.ts`, `test/crimeFamily/scheduler.test.ts` (the pinned job names gain `sendApplicationDigests`).
  - `test/dm/turf-notice.test.ts`: `:11` the case title becomes "turf is an account notice, with no command"; `:14` `noticeTypesInGroup("account").at(-1)` is now `"recruit"`, so it asserts `noticeTypesInGroup("account").slice(-2)` equals `["turf", "recruit"]`; `:16-18` the settings pin becomes 31/32.
  - `test/crimeFamily/ids-post.test.ts:12-23`: the `all` array gains every new `CREW_IDS` builder at its longest (20-digit `U`, 24-character `O`, page 999): `voteStart(U)`, `voteOk(U)`, `voteCancel(U)`, `ballot("yes", O)`, `board("act", true, 999, U)`, `boardSelect(U)`, `myApps(U)`, `withdraw(U)`, `familyCard(O, U)`, `applyOpen(O, U)`, `applyModal(O, U)`, `recruit("toggle", U)`, `recruitEdit({ netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 }, U)`, `recruitModal(U)`, `appAnswer("decline", O, U)`, `inboxPage(999, U)` (the vote ids exist since Task 11); plus `it("the longest new id is recruitEdit at 59 characters (F10)", () => expect(CREW_IDS.recruitEdit({ netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 }, U)).toHaveLength(59))`.

**Interfaces:**
- Consumes: Task 12's service; `joinFamilyInTx`, `withSeatRetry(fn, { alreadyInFamily })` (Task 4); `notifyMany`; `cfNoticeEmote`.
- Produces: `acceptApplication`, `declineApplication`, `familiesDueDigest`, `claimDigest` (top Interfaces block); in `recruitAnnounce.ts`: `announceApplicationAnswer(client: Client, application: FamilyInvite, family: Family, answer: "accepted" | "declined"): Promise<void>`, `announceExpiredApplications(client: Client, rows: { application: FamilyInvite; familyLabel: string }[]): Promise<void>`, `sendApplicationDigests(client: Client, now: Date): Promise<void>`; the `recruit` DM type.
  - `acceptApplication(appId, officerId, now)`: read the row (missing or not an application → `"Application no longer pending."`); `withSeatRetry(() => runFamilyTx(async (tx) => { … }), { alreadyInFamily: `<@${applicantId}> is already in a family.` })` (the presser is the officer, so a `FamilyMember_userId_key` collision, edge 4, must not read "You are already in a family."): re-read the officer (member of the application's family, `can(officer, "review_apps")`, else `NO_PERMISSION`); CAS `{ id, kind: "APPLICATION", status: "PENDING", expiresAt: { gt: now } } → { status: "ACCEPTED", slot: id, inviterId: officerId, resolvedAt: now }`, `count !== 1` → `"Application no longer pending."`; the applicant has a member row → `` `<@${applicantId}> is already in a family.` ``; `joinFamilyInTx(tx, { familyId, uid: applicantId, inviterId: officerId, now })`. Any refusal rolls the row back to PENDING (edge 5, 6). Returns `{ family, member, application }`.
  - `declineApplication(appId, officerId, now)`: the same officer re-read in a `runFamilyTx`, CAS `PENDING → { status: "DECLINED", slot: id, inviterId: officerId, resolvedAt: now }`.
  - `familiesDueDigest(now)`: the distinct `familyId`s of PENDING applications, kept when the family's `appDigestAt ≤ now − appDigestEverySeconds` and one of its PENDING applications has `createdAt > appDigestAt`.
  - `claimDigest(familyId, now)`: read `appDigestAt = t`; `n` = PENDING applications created after `t`; `n === 0` → 0; CAS `family.updateMany({ where: { id, appDigestAt: t }, data: { appDigestAt: now } })`; returns `n` on `count === 1`, else 0. At most 4 digests per family per day follow from the 6 h window.
  - DMs (type `recruit`, icon `crest_1`; applicant ones `rank_associate`): `recruitDigestNotice(v: { familyLabel; count }, row: ActionRowBuilder<ButtonBuilder>)` (8; title `` `${count} new application${count === 1 ? "" : "s"} to ${familyLabel}` ``, body "Accept or decline them in the inbox. Applications expire after 72 hours."), `applicationAcceptedNotice(v: { familyLabel })` (6; "Application accepted", "You joined **…**. Open it with `!crew`."), `applicationDeclinedNotice(v: { familyLabel; reapplyAt: Date })` (6; "…You can apply again <t:R>."), `applicationExpiredNotice(v: { familyLabel })` (6; "Your application to **…** expired after 72 hours. You can apply again in 24 hours.").
  - `sendApplicationDigests`: for each `familiesDueDigest(now)` id, `n = await claimDigest(id, now)`; when `n > 0`, `notifyMany(client, "recruit", officerIds, (id) => recruitDigestNotice({ familyLabel, count: n }, buttonRow(cfButton(CREW_IDS.recruit("inbox", id), "Open inbox", ButtonStyle.Primary))))` to every Capo, Underboss and Boss.
  - `sweepInvites`: expired rows with `kind === "INVITE"` and a `messageId` → `resolveInviteCard` as today; `kind === "APPLICATION"` → `announceExpiredApplications` with each family's label (families read in one `findMany`; a missing family is skipped, the disband path DMs those).

- [ ] **Step 1: Write the failing tests**

Append to `test/anticheat/family-recruit.race.test.ts` (extend its imports with `acceptApplication`, `declineApplication` from `recruitService`, `disbandFamily` from `disbandService`, `announceDisband` from `../../src/ui/crimeFamily/announce`, `fakeClient` from `../crimeFamily/fakeClient`):

```ts
/** An officer (Capo) seated in a recruiting family; the officer is returned with the family. */
async function withOfficer(o: Parameters<typeof recruiting>[0] = {}) {
  const r = await recruiting(o);
  const capo = await seedEligibleUser();
  await testPrisma.familyMember.create({ data: { familyId: r.f.id, userId: capo, role: "CAPO", roleSlot: "CAPO1", seat: (o.size ?? 1) + 1, joinedAt: daysAgo(10) } });
  await testPrisma.family.update({ where: { id: r.f.id }, data: { memberCount: { increment: 1 } } });
  return { ...r, capo };
}
const row = (id: string) => testPrisma.familyInvite.findUniqueOrThrow({ where: { id } });
const NOT_PENDING = "Application no longer pending.";

describe("accept and decline (amendment 8.5)", () => {
  it("edge 3: two officers accept one application at once → one member row", async () => {
    const { f, boss, capo } = await withOfficer();
    const p = await seedEligibleUser();
    const a = await apply(p, f.id);
    const r = await Promise.allSettled([acceptApplication(a.id, boss), acceptApplication(a.id, capo)]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR(NOT_PENDING));
    if (r.every((x) => x.status === "rejected")) await acceptApplication(a.id, boss);   // both busy: the retry seats once
    expect(await testPrisma.familyMember.count({ where: { userId: p } })).toBe(1);
    expect(await row(a.id)).toMatchObject({ status: "ACCEPTED", slot: a.id });
  });

  it("edge 4: two families accept the same player at once → one membership, honest refusal text, counts match rows", async () => {
    const A = await withOfficer(); const B = await withOfficer();
    const p = await seedEligibleUser();
    const [x, y] = [await apply(p, A.f.id), await apply(p, B.f.id)];
    const r = await Promise.allSettled([acceptApplication(x.id, A.boss), acceptApplication(y.id, B.boss)]);
    for (const z of r) if (z.status === "rejected") expect(z.reason.message).toMatch(BUSY_OR(`<@${p}> is already in a family.`));
    expect(await testPrisma.familyMember.count({ where: { userId: p } })).toBe(1);
    const statuses = [(await row(x.id)).status, (await row(y.id)).status].sort();
    expect(statuses.filter((s) => s === "ACCEPTED")).toHaveLength(1);
    expect(statuses.every((s) => ["ACCEPTED", "PENDING", "WITHDRAWN"].includes(s))).toBe(true);
    for (const fam of [A.f, B.f]) {
      const after = await testPrisma.family.findUniqueOrThrow({ where: { id: fam.id } });
      expect(after.memberCount).toBe(await testPrisma.familyMember.count({ where: { familyId: fam.id } }));
    }
  });

  it("edges 5 and 6: a full family and a jailed applicant roll the row back to PENDING", async () => {
    const full = await withOfficer({ size: 9, level: 1 });                // 9 + the Capo = 10 = the L1 cap
    const p = await seedEligibleUser();
    const a = await seedApplication({ familyId: full.f.id, applicantId: p });
    await expect(acceptApplication(a.id, full.boss)).rejects.toThrow("Family is full.");
    expect(await row(a.id)).toMatchObject({ status: "PENDING", slot: "PENDING" });
    const open = await withOfficer();
    const jailed = await seedEligibleUser({ jailedUntil: new Date(Date.now() + HOUR) });
    const b = await seedApplication({ familyId: open.f.id, applicantId: jailed });
    await expect(acceptApplication(b.id, open.boss)).rejects.toThrow(/jailed/);
    expect(await row(b.id)).toMatchObject({ status: "PENDING" });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: jailed } })).toBeNull();
  });

  it("stale answers: expired, withdrawn or already answered → 'Application no longer pending.'", async () => {
    const { f, boss } = await withOfficer();
    const p = await seedEligibleUser();
    const expired = await seedApplication({ familyId: f.id, applicantId: p, expiresAt: new Date(Date.now() - 1_000) });
    await expect(acceptApplication(expired.id, boss)).rejects.toThrow(NOT_PENDING);
    await testPrisma.familyInvite.delete({ where: { id: expired.id } });
    const a = await apply(p, f.id);
    await declineApplication(a.id, boss);
    await expect(acceptApplication(a.id, boss)).rejects.toThrow(NOT_PENDING);
    await expect(declineApplication(a.id, boss)).rejects.toThrow(NOT_PENDING);
    expect(await row(a.id)).toMatchObject({ status: "DECLINED", inviterId: boss });
  });

  it("edge 11: disband with 25 PENDING applications expires them all and DMs each applicant once", async () => {
    const { f, boss, tag } = await withOfficer();
    for (let k = 0; k < 25; k++) await apply(await seedEligibleUser(), f.id);
    const r = await disbandFamily(boss, tag);
    expect(r.expiredApplications).toHaveLength(25);
    expect(await testPrisma.familyInvite.count({ where: { kind: "APPLICATION", status: "EXPIRED" } })).toBe(25);
    const c = fakeClient();
    await announceDisband(c.client as any, r);
    for (const a of r.expiredApplications) expect(c.dm.get(a.inviteeId)).toBe(1);
  });

  it("the weekly caps count both kinds", async () => {
    const { f, boss, capo } = await withOfficer();                         // L1: 5 joins per 7 days
    for (let k = 0; k < 4; k++) await seedApplication({ familyId: f.id, applicantId: `9${k}`, status: "ACCEPTED", resolvedAt: daysAgo(1), inviterId: boss });
    await testPrisma.familyInvite.updateMany({ where: { familyId: f.id }, data: { kind: "INVITE" } });
    const [p1, p2] = [await seedEligibleUser(), await seedEligibleUser()];
    const [a1, a2] = [await apply(p1, f.id), await apply(p2, f.id)];
    await acceptApplication(a1.id, capo);
    await expect(acceptApplication(a2.id, capo)).rejects.toThrow("Your family can take 5 new members per 7 days.");
    const other = await withOfficer();
    for (let k = 0; k < 3; k++) await seedApplication({ familyId: other.f.id, applicantId: `8${k}`, status: "ACCEPTED", resolvedAt: daysAgo(1), inviterId: other.capo });
    const a3 = await apply(await seedEligibleUser(), other.f.id);
    await expect(acceptApplication(a3.id, other.capo)).rejects.toThrow("You can bring in 3 members per 7 days.");
  });
});
```

Append to `test/dm/family-notice.test.ts` (imports: `sendApplicationDigests` from `../../src/ui/crimeFamily/recruitAnnounce`, `buildSettingsPayload` from `../../src/commands/general/settings`, `fakeClient` from `../crimeFamily/fakeClient`, `seedEligibleUser`, `seedFamily`, `seedApplication`, `resetFamilies`, `daysAgo` from `../helpers`; `count` as in `turf-notice.test.ts:8`):

```ts
it("recruit is an account notice with no command", () => {
  expect(DM_NOTICE_TYPES.recruit).toEqual({ label: "Family applications", group: "account" });
  expect(isCooldownReminderType("recruit")).toBe(false);
});
it("the settings panel is 31 components with DMs on and 32 off", () => {
  expect(count(buildSettingsPayload("o", { remindersEnabled: true, disabledReminders: [] }).components[0].toJSON())).toBe(31);
  expect(count(buildSettingsPayload("o", { remindersEnabled: false, disabledReminders: [] }).components[0].toJSON())).toBe(32);
});
it("officer digests: one DM per officer per 6-hour window, and only for new applications", async () => {
  await resetFamilies();
  const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const capo = await seedEligibleUser(); const soldier = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS" }, { userId: capo, role: "CAPO" }, { userId: soldier, role: "SOLDIER" }],
    data: { recruiting: true, recruitPitch: "We run heists every night.", appDigestAt: daysAgo(1) } });
  const t0 = new Date();
  await seedApplication({ familyId: f.id, applicantId: "701", createdAt: t0 });
  const c = fakeClient();
  await sendApplicationDigests(c.client as any, new Date(+t0 + 1_000));
  await sendApplicationDigests(c.client as any, new Date(+t0 + 2_000));
  expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 1, [ub]: 1, [capo]: 1 });
  await sendApplicationDigests(c.client as any, new Date(+t0 + 6 * 3_600_000 + 2_000));    // a window later, nothing new
  expect(c.dm.get(boss)).toBe(1);
  await seedApplication({ familyId: f.id, applicantId: "702", createdAt: new Date(+t0 + 6 * 3_600_000 + 3_000) });
  await sendApplicationDigests(c.client as any, new Date(+t0 + 12 * 3_600_000 + 4_000));
  expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 2, [ub]: 2, [capo]: 2 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/anticheat/family-recruit.race.test.ts test/dm/family-notice.test.ts test/dm/turf-notice.test.ts`
Expected: FAIL: `acceptApplication` is not exported; the panel is 30/31.

- [ ] **Step 3: Implement** per Interfaces, and add the four DM fixture entries (`cfPayload(container)`, longest family label, `count` 25): digest max 8, the others max 6.

- [ ] **Step 4: Run them, plus the scheduler and DM suites**

Run: `$VT test/anticheat/family-recruit.race.test.ts test/anticheat/family-disband.race.test.ts test/dm test/crimeFamily/scheduler.test.ts test/crimeFamily/layout.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/recruitService.ts src/ui/crimeFamily/recruitAnnounce.ts src/services/dmPrefsService.ts src/services/dmNoticeService.ts src/ui/crimeFamily/ids.ts src/services/crimeFamily/scheduler.ts src/services/crimeFamily/disbandService.ts src/ui/crimeFamily/announce.ts src/scripts/fixtures/crimeFamilyScreens.ts test
git commit -m "feat(crime-families): accept and decline applications through the join path, expiry DMs and 6-hourly officer digests"
```

---

### Task 14: The census, the recruitment reads and screens S29–S33 with modals M1 and M2

**Files:**
- Create: `src/services/crimeFamily/census.ts`, `src/services/crimeFamily/recruitQueries.ts`, `src/ui/crimeFamily/recruitScreens.ts`, `test/crimeFamily/census.test.ts`, `test/crimeFamily/recruit-board.test.ts`
- Modify:
  - `src/services/crimeFamily/scheduler.ts:124-131`: `{ name: "runTurfCensus", run: async (c, now) => announceCensusNotices(c, (await runTurfCensus(now)).notices) }` in the `10 * * * *` entry (the job, not the step, sends; services never DM).
  - `src/ui/crimeFamily/announce.ts`: `announceCensusNotices(client, notices)`: `for (const n of notices) await notifyMany(client, n.type, n.userIds, n.build)` inside `safely("announceCensusNotices", …)`. This plan's only step returns no notices; plan 6's `turf_cities` (a closure's re-placement) and `turf_rebalance` steps return their "New city" `turf` notices (`turfCityMovedNotice`) through it.
  - `src/services/crimeFamily/views.ts`: `BoardView`, `FamilyCardView`, `RecruitPanelView`, `InboxView`, `MyApplicationsView` (below).
  - `src/scripts/fixtures/crimeFamilyScreens.ts`, `test/crimeFamily/scheduler.test.ts` (pinned names gain `runTurfCensus`).

**Interfaces:**
- Consumes: `Family.activeMembers/censusAt`, the recruit fields, `CfJobRun` (Task 2); `REQUIREMENTS`, `Requirements` (Task 12); the recruitment `CREW_IDS` (Task 13); `getNetWorth`, `computeNetWorth`, `checkMemberEligibility`, `isBanActive`, `utcDayKey` (`vaultService.ts:22`), `escapeMarkdown` (`discord.js`), `thumbSection`/`addThumbSection`, `cfButton`, `buttonRow`.
- Produces: `CensusNotice`, `CensusStep`, `CENSUS_STEPS`, `runTurfCensus`, `activeMembersByFamily` (F3), `announceCensusNotices` and the `recruitQueries.ts` functions (top Interfaces block); the view types; and in `recruitScreens.ts`: `buildBoard(v: BoardView)`, `buildFamilyCard(v: FamilyCardView, note?: string)`, `buildRecruitPanel(v: RecruitPanelView, note?: string)`, `buildInbox(v: InboxView, note?: string)`, `buildMyApplications(v: MyApplicationsView, note?: string)` (each `CfPayload`), `buildApplyModal(familyId: string, owner: string): ModalBuilder`, `buildListingModal(r: Requirements, owner: string): ModalBuilder`.

```ts
// src/services/crimeFamily/views.ts
export type ReqCheck = { key: keyof Requirements; label: string; need: number; have: number; ok: boolean };
export interface BoardView {
  ownerId: string; sort: BoardSort; qualifyOnly: boolean; page: number; pages: number;
  rows: { familyId: string; tag: string; name: string; level: number; crestKey: string; members: number; cap: number; active: number; req: Requirements; qualifies: boolean }[];
  emptyReason: string | null;   // "No family is recruiting right now." | "No recruiting family's requirements fit you yet." | the first failing family_join need
}
export interface FamilyCardView {
  ownerId: string; familyId: string; label: string; tag: string; crestKey: string; level: number; members: number; cap: number; active: number;
  pitch: string; recruiting: boolean; checks: ReqCheck[]; joinGate: string | null;   // null = every family_join gate passes
  pending: number;                     // the viewer's PENDING applications (of maxPendingApplicationsPerApplicant)
  appliedAt: Date | null;              // the viewer's PENDING application to this family
  reapplyAt: Date | null;              // a decline (7 d) or withdraw/expiry (24 h) block still running
  applyBlock: string | null;           // why Apply is disabled; null = enabled
}
export interface RecruitPanelView { ownerId: string; tag: string; recruiting: boolean; pitch: string; req: Requirements; pending: number; canEdit: boolean }
export interface InboxView {
  ownerId: string; tag: string; page: number; pages: number; total: number;
  rows: { appId: string; applicantId: string; createdAt: Date; expiresAt: Date; message: string; checks: ReqCheck[] }[];
}
export interface MyApplicationsView { ownerId: string; rows: { appId: string; familyLabel: string; createdAt: Date; expiresAt: Date }[] }
```

  - `activeMembersByFamily(since, now)`: `caperCrew.groupBy({ by: ["familyId", "userId"], where: { started: true, startedAt: { gte: since } }, _count: { _all: true } })` and `warHit.groupBy({ by: ["familyId", "userId"], where: { state: "HIT", createdAt: { gte: since } }, _count: { _all: true } })`; a pair counts when its seats `>= activeCaperSeats` or its hits `>= activeCorrectHits`; keep pairs whose user has a `FamilyMember` row with that same `familyId`; drop users for whom `isBanActive` is true; returns `Map<familyId, count>`.
  - `ACTIVE_MEMBERS_STEP = { key: "active_members", run }`: `since = now − 7 d`; `family.updateMany({ where: { id }, data: { activeMembers: map.get(id) ?? 0, censusAt: now } })` for every family; returns nothing. `CENSUS_STEPS = [ACTIVE_MEMBERS_STEP]` (plan 6 appends its steps, each gating itself on `turfEnabled` and returning its `CensusNotice[]`).
  - `runTurfCensus(now)`: `{ status: "skipped", notices: [] }` unless `CRIME_FAMILY_CONFIG.enabled`; ensure the `CfJobRun { key: "turf_census" }` row (`create`, P2002 caught outside any transaction); skipped when its `dayKey === utcDayKey(now)`; run every step in order, concatenating each step's returned notices (`?? []`; a throw propagates, leaving `dayKey` unset so the next hour reruns every step and no notice of the failed run is sent); then `cfJobRun.updateMany({ where: { key, dayKey: <read> }, data: { dayKey: today, ranAt: now } })`; when that CAS's `count !== 1` another process finished the day first and the call returns `{ status: "skipped", notices: [] }` (no doubled DMs under a double run, A29); else `{ status: "ran", notices }`.
  - `applicantStats(uid, now, { cached })`: net worth from `getNetWorth` when `cached` else `computeNetWorth`; `shiftsWorked`; whole days since `User.createdAt`; `caperCrew.count({ where: { userId, started: true } })`.
  - `getBoardView`: `where = { recruiting: true, OR: FAMILY_LEVELS.map((l) => ({ level: l.level, memberCount: { lt: l.memberCap } })) }`; with `qualifyOnly`, first `checkMemberEligibility(viewerId, "family_join", { now })` (failing → no rows, `emptyReason` = its first failure's `need`), then the viewer's cached stats as four `lte` filters on the `recruitMin*` fields; `orderBy` `lvl` `[{ level: "desc" }, { memberCount: "desc" }, { createdAt: "asc" }]`, `mem` `[{ memberCount: "desc" }, { level: "desc" }]`, `act` `[{ activeMembers: "desc" }, { memberCount: "desc" }]`; `pages = max(1, ceil(count / boardPageSize))`, `page` clamped (Review Focus 5); each row's `qualifies` from the cached stats.
  - `getFamilyCardView`: cached stats against each `REQUIREMENTS` row; `joinGate` from `checkMemberEligibility(viewer, "family_join", { now, familyId })`; `applyBlock` the first of: in a family, `joinGate`, not recruiting, full, a failing requirement, 3 pending, the family's 25 pending, `reapplyAt`, an existing PENDING application to it.
  - `getRecruitPanelView(officerId)`: `NO_PERMISSION` unless `can(officer, "review_apps")`; `canEdit = can(officer, "edit_listing")`.
  - `getInboxView(officerId, page)`: the same permission; PENDING applications of the family oldest first, `inboxPageSize` per page, page clamped; each row's `checks` from **cached** stats (A33: display, not a gate).
  - `getMyApplicationsView(uid)`: the viewer's PENDING applications (≤ 3) with each family's label.
  - Screens, counts per amendment §8.9; every pitch and message passes through `escapeMarkdown`; every payload has `allowedMentions: { parse: [] }`:
    - S29 `buildBoard` (17; 15 when empty): text `` `## Families recruiting\nSort: ${Level|Members|Activity} · I qualify: ${on|off} · page ${page + 1}/${pages}` ``; separator; one text of up to 6 lines `` `${cfLabel(crestKey, `**[${tag}] ${name}**`)} · L${level} · ${members}/${cap} members · ${active} active${qualifies ? " ✓" : ""}\n-# ${reqLine(req)}` `` (or `emptyReason`); select `boardSelect(owner)` (values = family ids; omitted when empty); row `Level`/`Members`/`Activity` (`board(sort, qualify, 0, owner)`, the current sort Primary) and `I qualify` (toggles); row `Prev`/disabled page/`Next` (`board(sort, qualify, page ∓ 1, owner)`), `My applications` (`myApps(owner)`), `Back` (`CREW_IDS.view("home", owner)`). `reqLine`: the non-zero requirements as `10,000,000 net worth · 300 shifts · 45 days · 5 crew heists`, or `No requirements`.
    - S30 `buildFamilyCard` (11): `thumbSection` header `` `## [${tag}] ${name}\nL${level} · ${members}/${cap} members · ${active} active` `` with the crest; separator; the escaped pitch; one line per check `` `${ok ? "✓" : "✗"} ${label}: ${fmt(need)} (you ${fmt(have)})` `` plus `✓ Join gates` or `` `✗ ${joinGate}` ``; a status line (`Pending applications ${pending}/3`, `` `Applied ${rel(appliedAt)}` ``, `` `Apply again ${rel(reapplyAt)}` ``, or `applyBlock`); row `Apply…` (`applyOpen(familyId, owner)`, disabled when `applyBlock`), `My applications`.
    - S31 `buildRecruitPanel` (10): header `` `## Recruitment · [${tag}]\n${recruiting ? "Recruiting" : "Not recruiting"}` ``; separator; pitch (escaped, or "No pitch yet.") and `reqLine`; `` `Applications: ${pending}/25 pending` ``; row `Recruiting on|off` (`recruit("toggle")`), `Edit listing…` (`recruitEdit(req, owner)`), `Applications (${pending})` (`recruit("inbox")`), `Back` — the first two disabled unless `canEdit`.
    - S32 `buildInbox` (28): header with `page/pages` and `total`; separator; per row a text `` `<@${applicantId}> · applied ${rel(createdAt)} · expires ${rel(expiresAt)}\n> ${escaped message}\n${checks.map(✓/✗ label).join(" · ")}` `` and a row `Accept` (Success, `appAnswer("accept", appId, owner)`), `Decline` (Danger); a pager row `Prev`/page/`Next` (`inboxPage`) and `Back` (`recruit("home")`).
    - S33 `buildMyApplications` (8): header; up to 3 lines `` `[TAG] Name · applied ${rel} · expires ${rel}` `` (or "No pending applications."); select `withdraw(owner)` (values = application ids; omitted when none); row `Board` (`board("lvl", false, 0, owner)`), `Back`.
    - M1 `buildApplyModal`: title "Apply to the family", one Paragraph input `message`, label "Why should they take you? (1–200 characters)", min 1, max 200, required.
    - M2 `buildListingModal` (F10): title "Recruitment listing"; `pitch` (Paragraph, max 150, not required, placeholder "Leave blank to keep your current pitch"); `nw`, `shifts`, `age`, `heists` (Short, not required, max 20) pre-filled with `String(r.netWorth)` etc. and labels "Min net worth (like 10m)", "Min lifetime shifts", "Min days on Fortuna", "Min lifetime crew heists".

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/census.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { CENSUS_STEPS, activeMembersByFamily, runTurfCensus, type CensusStep } from "../../src/services/crimeFamily/census";
import { testPrisma, seedEligibleUser, seedFamily, seedWarHits, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "CfJobRun"]));
beforeEach(resetFamilies);

const since = () => daysAgo(7);
/** n started seats for uid in familyId, each in its own RESOLVED run, startedAt 1 day ago. */
async function seats(uid: string, familyId: string, n: number, started = true) {
  for (let k = 0; k < n; k++) {
    const at = daysAgo(1);
    const c = await testPrisma.caper.create({ data: { familyId, tier: 1, status: "RESOLVED", liveSlot: `${uid}-${k}`, plannerId: uid, guildId: "g1", channelId: "c1", lobbyClosesAt: at, startedAt: at } });
    await testPrisma.caperCrew.create({ data: { caperId: c.id, familyId, userId: uid, role: "LOOKOUT", stake: 0, started, startedAt: at, liveSlot: c.id } });
  }
}

describe("active-member census (A22, amendment 6.4 steps 1-2)", () => {
  it("2 started seats in this family count; 2 seats from a previous family do not", async () => {
    const a = await seedEligibleUser(); const b = await seedEligibleUser();
    const old = await seedFamily({ bossId: await seedEligibleUser() });
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: a, role: "SOLDIER" }, { userId: b, role: "SOLDIER" }] });
    await seats(a, f.id, 2);
    await seats(b, old.id, 2);                                           // b played them for another family
    expect((await activeMembersByFamily(since(), new Date())).get(f.id)).toBe(1);
  });

  it("3 HIT war hits count; 2 do not; MISS never counts", async () => {
    const [a, b, c] = [await seedEligibleUser(), await seedEligibleUser(), await seedEligibleUser()];
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [a, b, c].map((userId) => ({ userId, role: "SOLDIER" as const })) });
    await seedWarHits(a, f.id, 3);
    await seedWarHits(b, f.id, 2);
    await seedWarHits(c, f.id, 5, { state: "MISS" });
    expect((await activeMembersByFamily(since(), new Date())).get(f.id)).toBe(1);
  });

  it("a banned member, an ex-member and unstarted (VOID) seats never count", async () => {
    const banned = await seedEligibleUser({ ban: { expiresAt: new Date(Date.now() + 86_400_000) } });
    const ex = await seedEligibleUser(); const idle = await seedEligibleUser();
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: banned, role: "SOLDIER" }, { userId: idle, role: "SOLDIER" }] });
    await seats(banned, f.id, 2);
    await seats(ex, f.id, 2);                                            // no member row
    await seats(idle, f.id, 2, false);
    expect((await activeMembersByFamily(since(), new Date())).get(f.id) ?? 0).toBe(0);
  });

  it("runTurfCensus writes activeMembers and censusAt on every family, then skips the rest of the UTC day", async () => {
    const a = await seedEligibleUser();
    const f = await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: a, role: "SOLDIER" }] });
    const g = await seedFamily({ bossId: await seedEligibleUser() });
    await seats(a, f.id, 2);
    const now = new Date();
    await withCfConfig({ enabled: true }, async () => {
      expect(await runTurfCensus(now)).toEqual({ status: "ran", notices: [] });
      expect(await runTurfCensus(now)).toEqual({ status: "skipped", notices: [] });                 // same UTC day
    });
    expect(await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({ activeMembers: 1, censusAt: now });
    expect(await testPrisma.family.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ activeMembers: 0, censusAt: now });
  });

  it("a step that throws leaves dayKey unset and the next run reruns every step; notices come back in step order", async () => {
    const calls: string[] = [];
    const boom: CensusStep = { key: "boom", run: async () => { calls.push("boom"); throw new Error("boom"); } };
    const note: CensusStep = { key: "note", run: async () => { calls.push("note"); return [{ type: "turf", userIds: ["1"], build: () => ({}) as any }]; } };
    const now = new Date();
    await withCfConfig({ enabled: true }, async () => {
      CENSUS_STEPS.push(boom);
      await expect(runTurfCensus(now)).rejects.toThrow("boom");
      CENSUS_STEPS.splice(CENSUS_STEPS.indexOf(boom), 1);
      expect((await testPrisma.cfJobRun.findUniqueOrThrow({ where: { key: "turf_census" } })).dayKey).toBe("");
      CENSUS_STEPS.push(note);
      const r = await runTurfCensus(now);
      CENSUS_STEPS.splice(CENSUS_STEPS.indexOf(note), 1);
      expect(r.status).toBe("ran");
      expect(r.notices.map((n) => n.userIds)).toEqual([["1"]]);
    });
    expect(calls).toEqual(["boom", "note"]);
  });

  it("two processes racing the same day: one 'ran', the other 'skipped' with no notices (A29)", async () => {
    const now = new Date();
    const r = await withCfConfig({ enabled: true }, () => Promise.all([runTurfCensus(now), runTurfCensus(now)]));
    expect(r.filter((x) => x.status === "ran")).toHaveLength(1);
    expect(r.find((x) => x.status === "skipped")!.notices).toEqual([]);
  });

  it("disabled → skipped", async () => {
    expect(await withCfConfig({ enabled: false }, () => runTurfCensus(new Date()))).toEqual({ status: "skipped", notices: [] });
  });
});
```

```ts
// test/crimeFamily/recruit-board.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getBoardView, getFamilyCardView } from "../../src/services/crimeFamily/recruitQueries";
import { buildFamilyCard } from "../../src/ui/crimeFamily/recruitScreens";
import { FAMILY_LEVELS } from "../../src/data/crimeFamilyCatalog";
import { visibleText } from "./visibleText";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies } from "../helpers";

beforeEach(resetFamilies);

let n = 0;
/** A recruiting family whose memberCount, activeMembers and requirements are set directly (the board reads only Family). */
async function listed(o: { level?: number; members?: number; active?: number; req?: Record<string, number>; recruiting?: boolean; pitch?: string } = {}) {
  return seedFamily({ bossId: await seedEligibleUser(), tag: `B${++n}`, level: o.level ?? 1,
    data: { recruiting: o.recruiting ?? true, recruitPitch: o.pitch ?? "We run heists every night.", memberCount: o.members ?? 1, activeMembers: o.active ?? 0, ...o.req } });
}

describe("recruitment board (amendment 8.3)", () => {
  it("sorts by level, members and activity", async () => {
    const a = await listed({ level: 9, members: 3, active: 1 });
    const b = await listed({ level: 2, members: 9, active: 2 });
    const c = await listed({ level: 5, members: 5, active: 4 });
    const viewer = await seedEligibleUser();
    const order = async (sort: "lvl" | "mem" | "act") => (await getBoardView(viewer, sort, false, 0, new Date())).rows.map((r) => r.familyId);
    expect(await order("lvl")).toEqual([a.id, c.id, b.id]);
    expect(await order("mem")).toEqual([b.id, c.id, a.id]);
    expect(await order("act")).toEqual([c.id, b.id, a.id]);
  });

  it("13 families page 6, 6, 1; a page past the end clamps to the last (Review Focus 5)", async () => {
    for (let k = 0; k < 13; k++) await listed();
    const viewer = await seedEligibleUser();
    const sizes = await Promise.all([0, 1, 2].map(async (p) => (await getBoardView(viewer, "lvl", false, p, new Date())).rows.length));
    expect(sizes).toEqual([6, 6, 1]);
    expect(await getBoardView(viewer, "lvl", false, 9, new Date())).toMatchObject({ page: 2, pages: 3 });
  });

  it("a full family never appears, at every level", async () => {
    const viewer = await seedEligibleUser();
    for (const l of FAMILY_LEVELS) {
      await resetFamilies();
      const full = await listed({ level: l.level, members: l.memberCap });
      const room = await listed({ level: l.level, members: l.memberCap - 1 });
      const ids = (await getBoardView(viewer, "lvl", false, 0, new Date())).rows.map((r) => r.familyId);
      expect(ids, `L${l.level}`).toEqual([room.id]);
      expect(ids).not.toContain(full.id);
    }
  });

  it("I qualify hides every family with one failing requirement and explains an empty view", async () => {
    const viewer = await seedEligibleUser({ wallet: 1_000_000, shifts: 400, fortunaAgeDays: 400 });
    await listed({ req: { recruitMinNetWorth: 2_000_000 } });
    await listed({ req: { recruitMinShifts: 401 } });
    await listed({ req: { recruitMinAgeDays: 401 } });
    await listed({ req: { recruitMinHeists: 1 } });
    const open = await listed();
    const v = await getBoardView(viewer, "lvl", true, 0, new Date());
    expect(v.rows.map((r) => r.familyId)).toEqual([open.id]);
    await testPrisma.family.update({ where: { id: open.id }, data: { recruitMinHeists: 1 } });
    expect(await getBoardView(viewer, "lvl", true, 0, new Date())).toMatchObject({ rows: [], emptyReason: "No recruiting family's requirements fit you yet." });
    const young = await seedEligibleUser({ fortunaAgeDays: 1 });
    const gated = await getBoardView(young, "lvl", true, 0, new Date());
    expect(gated.rows).toEqual([]);
    expect(gated.emptyReason).toMatch(/days/);                           // the failing family_join gate's `need`
  });

  it("an empty board says nobody is recruiting", async () => {
    await listed({ recruiting: false });
    expect((await getBoardView(await seedEligibleUser(), "lvl", false, 0, new Date())).emptyReason).toBe("No family is recruiting right now.");
  });

  it("Review Focus 3: a pitch renders escaped, with no pings", async () => {
    const f = await listed({ pitch: "**bold** # Big <t:0:R> @here" });
    const card = buildFamilyCard(await getFamilyCardView(f.id, await seedEligibleUser(), new Date()));
    const text = visibleText(card);
    expect(text).toContain("\\*\\*bold\\*\\*");
    expect(text).toContain("\\# Big");
    expect(card.allowedMentions).toEqual({ parse: [] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/census.test.ts test/crimeFamily/recruit-board.test.ts`
Expected: FAIL: the modules do not exist.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Add the fixtures**

S29 (6 families, 24-character names, every requirement at its limit, page 999/999) max 17; S29 empty max 15; S30 (150-character pitch of wide characters, every check failing) max 11; S31 max 10; S32 (5 applications with 200-character messages) max 28; S33 (3 applications) max 8.

- [ ] **Step 5: Run the suites and the payload audit**

Run: `$VT test/crimeFamily/census.test.ts test/crimeFamily/recruit-board.test.ts test/crimeFamily/layout.test.ts test/crimeFamily/scheduler.test.ts && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 6: Commit**

```bash
git add src/services/crimeFamily/census.ts src/services/crimeFamily/recruitQueries.ts src/ui/crimeFamily/recruitScreens.ts src/services/crimeFamily/scheduler.ts src/services/crimeFamily/views.ts src/scripts/fixtures/crimeFamilyScreens.ts test/crimeFamily/census.test.ts test/crimeFamily/recruit-board.test.ts test/crimeFamily/scheduler.test.ts
git commit -m "feat(crime-families): daily active-member census, the recruitment board, family card, panel, inbox and my-applications screens"
```

---

### Task 15: Recruitment routes, `!crew board` / `!crew recruit`, and the S1 and S2 entry points

**Files:**
- Create: `src/handlers/crewRecruitRoutes.ts`
- Modify:
  - `src/handlers/crimeFamilyRouter.ts:38`: `TABLES.crew` becomes `{ ...CREW_ROUTES, ...VOTE_ROUTES, ...RECRUIT_ROUTES }` (the specific keys `modal:apply` and `modal:recruit` win over `modal` by the lookup at `crimeFamilyRouter.ts:59`). `crewInteractionHandler.ts` is not touched for routing.
  - `src/commands/economy/crew.ts:131-153`: `board`, `recruit`. `src/slash/registry.ts:244-245`: choices `"board"`, `"recruit"` (24 of 25).
  - `src/ui/crimeFamily/familyScreens.ts:43-60` (S1: a `Find a family` button `board("lvl", false, 0, owner)` in its row; the hint becomes "-# Browse families with `!crew board` or ask a Capo for an invite; crew heist lobbies and results post in this server." — plan 5 rewrites its last clause), S2 (status `Recruiting` when `recruiting`; a `Recruit` button `recruit("home", owner)` in the second row when `viewer.canRecruit`).
  - `src/services/crimeFamily/familyQueries.ts`, `src/services/crimeFamily/views.ts`: `FamilyDashboardView.recruiting: boolean`, `viewer.canRecruit` (`can(viewer, "review_apps")`).
  - `src/scripts/fixtures/crimeFamilyScreens.ts`: S1 ("S1 no-family card", `:103`) max 14; "S2 dashboard (claim, vote and recruit, 30 members)" max 20.
- Test: `test/crimeFamily/handlers.test.ts`, `test/crimeFamily/crew-command.test.ts`, `test/crimeFamily/layout.test.ts`, `test/crimeFamily/route-tables.test.ts`

**Interfaces:**
- Consumes: Tasks 12–14 (services, views, screens, ids); `assertEnabled`, `show`, `showThenAnnounce`, `notice`, `owner`, `auto`, `update` from `crewRouteKit.ts` (Task 11; never from `crewInteractionHandler.ts`); `CfRouteEntry`; `announceApplicationAnswer` (Task 13).
- Produces: `RECRUIT_ROUTES: CfRouteTable`:
  - `bd` `{ owner, auto }` → `[sort, q, page]` → `buildBoard(getBoardView(uid, sort, q === "1", Number(page) || 0, now))` (an unknown sort reads as `lvl`).
  - `"bd:sel"` `{ owner, ephemeral }` and `fc` `{ owner, ephemeral }` → `buildFamilyCard(getFamilyCardView(id, uid, now))`.
  - `"app:open"` `{ modalOpener }` → `showModal(buildApplyModal(args[1], owner))` as the first await.
  - `"modal:apply"` `{ owner, ephemeral }` → `assertEnabled()`, `applyToFamily({ applicantId: uid, familyId: args[1], message, guildId: i.guildId ?? "", channelId: i.channelId ?? "" })` (F12), then S30 with note "Application sent. Officers see it in their inbox."
  - `"app:mine"` `{ owner, auto }` → S33; `"app:wd"` `{ owner, update }` → `withdrawApplication(i.values[0], uid)` → S33 with note "Application withdrawn. You can apply there again in 24 hours."
  - `"rc:home"` `{ owner, auto }` → S31; `"rc:toggle"` `{ owner, update }` → `setRecruiting(uid, !panel.recruiting)` → S31; `"rc:edit"` `{ modalOpener }` → `showModal(buildListingModal({ netWorth: +args[1], shifts: +args[2], ageDays: +args[3], heists: +args[4] }, owner))`; `"modal:recruit"` `{ owner, ephemeral }` → `editListing(uid, { pitch, minNetWorth: nw, minShifts: shifts, minAgeDays: age, minHeists: heists })` from M2's inputs `pitch`, `nw`, `shifts`, `age`, `heists` → S31 with note "Listing saved."
  - `"rc:inbox"` `{ owner, auto }` → S32 page 0; `"ap:pg"` `{ owner, update }` → S32 at `args[1]`; `ap` `{ owner, update }` → `[answer, appId]`: `acceptApplication` or `declineApplication`, then `showThenAnnounce` S32 (same page) with note `` `Accepted <@${applicantId}>.` `` / `` `Declined <@${applicantId}>.` `` and `announceApplicationAnswer`.
  - Every mutation calls `assertEnabled()` first; reads need only `enabled` as well (F1: DM digest buttons work without a guild).
  - `!crew board`: `buildBoard(getBoardView(uid, "lvl", false, 0, now))` as a public reply; `!crew board <TAG>`: the family by tag (none → "No family with that tag.") → S27 opener `familyCard(family.id, uid)`, `` `<@${uid}>: [${tag}]'s recruiting card.` ``, label "Open card". `!crew recruit`: `requireMembership`, `can(member, "review_apps")` else "Only a Capo or above can open recruitment." → S27 opener `recruit("home", uid)`, "your family's recruitment.", label "Open recruitment".

- [ ] **Step 1: Write the failing tests**

Append to `test/crimeFamily/handlers.test.ts` (imports: `fakeSelect` from `./fakeInteraction`, `applyToFamily` from `recruitService`, `seedApplication` from `../helpers`, `fakeClient` from `./fakeClient`):

```ts
describe("recruitment routes (Task 15)", () => {
  const REQ = { netWorth: 10_000_000, shifts: 300, ageDays: 45, heists: 5 };
  it.each([() => CREW_IDS.applyOpen("65f0000000000000000000ff", "u1"), () => CREW_IDS.recruitEdit(REQ, "u1")])(
    "%s opens its modal before any Prisma or Redis call", async (id) => {
      const findUnique = prisma.familyMember.findUnique;
      const db = vi.spyOn(prisma.familyMember, "findUnique");
      const redis = vi.spyOn(redisService, "getInstance");
      const i = fakeButton(id(), { userId: "u1" });
      i.showModal.mockImplementation(async () => { expect(db).not.toHaveBeenCalled(); expect(redis).not.toHaveBeenCalled(); i.order.push("showModal"); });
      await handleCrimeFamilyInteraction(i as any);
      expect(i.order[0]).toBe("showModal");
      db.mockRestore(); redis.mockRestore();
      Object.assign(prisma.familyMember, { findUnique });
    });

  it("the listing modal is pre-filled from its customId (F10)", async () => {
    const i = fakeButton(CREW_IDS.recruitEdit(REQ, "u1"), { userId: "u1" });
    await handleCrimeFamilyInteraction(i as any);
    const modal = JSON.stringify(i.showModal.mock.calls[0][0].toJSON());
    for (const v of ["10000000", "300", "45", "5"]) expect(modal).toContain(`"value":"${v}"`);
  });

  it("apply → inbox → accept seats the applicant once", async () => {
    const boss = await seedEligibleUser(); const p = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, data: { recruiting: true, recruitPitch: "We run heists every night." } });
    await withCfConfig({ enabled: true }, async () => {
      const m = fakeModal(CREW_IDS.applyModal(f.id, p), { message: "I run heists daily" }, { userId: p });
      await handleCrimeFamilyInteraction(m as any);
      expect(said(m)).toContain("Application sent. Officers see it in their inbox.");
      const app = await testPrisma.familyInvite.findFirstOrThrow({ where: { familyId: f.id, inviteeId: p, kind: "APPLICATION" } });
      const b = fakeButton(CREW_IDS.appAnswer("accept", app.id, boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
      await handleCrimeFamilyInteraction(b as any);
      expect(said(b)).toContain(`Accepted <@${p}>.`);
    });
    expect(await testPrisma.familyMember.count({ where: { userId: p, familyId: f.id } })).toBe(1);
  });

  it("Review Focus 4: stale answers and a demoted officer change nothing", async () => {
    const boss = await seedEligibleUser(); const capo = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }], data: { recruiting: true, recruitPitch: "We run heists every night." } });
    const rows = await Promise.all([
      seedApplication({ familyId: f.id, applicantId: "711", expiresAt: new Date(Date.now() - 1_000) }),
      seedApplication({ familyId: f.id, applicantId: "712", status: "WITHDRAWN", resolvedAt: new Date() }),
      seedApplication({ familyId: f.id, applicantId: "713", status: "DECLINED", resolvedAt: new Date(), inviterId: boss }),
    ]);
    await withCfConfig({ enabled: true }, async () => {
      for (const r of rows) for (const answer of ["accept", "decline"] as const) {
        const b = fakeButton(CREW_IDS.appAnswer(answer, r.id, capo), { userId: capo, ephemeralSource: true });
        await handleCrimeFamilyInteraction(b as any);
        expect(said(b)).toContain("Application no longer pending.");
      }
      await testPrisma.familyMember.update({ where: { userId: capo }, data: { role: "SOLDIER", roleSlot: capo } });
      for (const id of [CREW_IDS.recruit("home", capo), CREW_IDS.recruit("inbox", capo), CREW_IDS.recruit("toggle", capo), CREW_IDS.inboxPage(0, capo)]) {
        const b = fakeButton(id, { userId: capo, ephemeralSource: true });
        await handleCrimeFamilyInteraction(b as any);
        expect(said(b)).toContain("You don't have permission to do that.");
      }
    });
    expect((await Promise.all(rows.map((r) => testPrisma.familyInvite.findUniqueOrThrow({ where: { id: r.id } })))).map((r) => r.status)).toEqual(["PENDING", "WITHDRAWN", "DECLINED"]);
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).recruiting).toBe(true);
  });

  it("a board page past the end clamps (Review Focus 5)", async () => {
    const uid = await seedEligibleUser();
    for (let k = 0; k < 7; k++) await seedFamily({ bossId: await seedEligibleUser(), data: { recruiting: true, recruitPitch: "We run heists every night." } });
    await withCfConfig({ enabled: true }, async () => {
      const b = fakeButton(CREW_IDS.board("lvl", false, 99, uid), { userId: uid, ephemeralSource: true });
      await handleCrimeFamilyInteraction(b as any);
      expect(said(b)).toContain("page 2/2");
    });
  });
});
```

Append to `test/crimeFamily/crew-command.test.ts`:

```ts
describe("!crew board and !crew recruit (Task 15)", () => {
  it("!crew board replies S29 publicly; !crew board <TAG> replies the card opener", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "VLA", data: { recruiting: true, recruitPitch: "We run heists every night." } });
    const uid = await seedEligibleUser();
    expect((await crew(uid, "board")).said()).toContain("Families recruiting");
    expect((await crew(uid, "board VLA")).said()).toContain(CREW_IDS.familyCard(f.id, uid));
    expect((await crew(uid, "board NOPE")).said()).toContain("No family with that tag.");
  });
  it("!crew recruit: a Soldier is refused, a Capo gets the opener", async () => {
    const boss = await seedEligibleUser(); const capo = await seedEligibleUser(); const soldier = await seedEligibleUser();
    await seedFamily({ bossId: boss, members: [{ userId: capo, role: "CAPO" }, { userId: soldier, role: "SOLDIER" }] });
    expect((await crew(soldier, "recruit")).said()).toContain("Only a Capo or above can open recruitment.");
    expect((await crew(capo, "recruit")).said()).toContain(CREW_IDS.recruit("home", capo));
  });
});
```

Append to `test/crimeFamily/layout.test.ts`:

```ts
it("S1 carries Find a family within 14 components; S2 with claim, vote and recruit buttons stays within 20", () => {
  const byLabel = (l: string) => crimeFamilyWorstCases().find((c) => c.label === l)!;
  const s1 = byLabel("S1 no-family card");
  expect(JSON.stringify(s1.payload.components.map((c) => c.toJSON()))).toContain("Find a family");
  expect(countComponents(s1.payload)).toBeLessThanOrEqual(14);
  expect(countComponents(byLabel("S2 dashboard (claim, vote and recruit, 30 members)").payload)).toBeLessThanOrEqual(20);
});
```

Append to `test/crimeFamily/route-tables.test.ts`: `import { RECRUIT_ROUTES } from "../../src/handlers/crewRecruitRoutes"` beside the `VOTE_ROUTES` import, both above the router import, and the same case for `CREW_IDS.board("lvl", false, 0, uid)` (`RECRUIT_ROUTES.bd` is defined; the press reads "Families recruiting", never "This button is no longer active.").

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/handlers.test.ts test/crimeFamily/crew-command.test.ts test/crimeFamily/layout.test.ts`
Expected: FAIL: `crew:app:open` has no route.

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Run the suites, the slash check and the payload audit**

Run: `$VT test/crimeFamily && npm run typecheck && npm run validate:slash && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; 73/100; "All payloads within Discord limits".

- [ ] **Step 5: Commit**

```bash
git add src/handlers/crewRecruitRoutes.ts src/handlers/crimeFamilyRouter.ts src/commands/economy/crew.ts src/slash/registry.ts src/ui/crimeFamily/familyScreens.ts src/services/crimeFamily/familyQueries.ts src/services/crimeFamily/views.ts src/scripts/fixtures/crimeFamilyScreens.ts test
git commit -m "feat(crime-families): recruitment routes, !crew board and !crew recruit, Find a family and Recruit buttons"
```

---

### Task 16: Help, tutorial, website and economy docs for families at scale

**Files:**
- Modify: `src/commands/general/help.ts:286-338`, `src/commands/general/tutorial.ts:175-180`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/app/changelog/page.tsx:143-157`, `FORTUNA_V2_ECONOMY.md:217-396`
- Test: `test/general/help-crime-families.test.ts`

**Interfaces:**
- Consumes: catalog and config values only. Every number is read off `FAMILY_LEVELS`, `CRIME_FAMILY_CONFIG`, `sizeRules.ts` and the amendment §10 tables (the house docs rule: exhaustive, exact numbers from source, full tables, a strategy section).
- Produces: copy only. Cross-server play, the intel relay, leagues and cities are plan 5's and plan 6's docs; this task must not describe them.

- [ ] **Step 1: Write the failing test**

Add to `help-crime-families.test.ts`: the `crew` help entry's subcommands include `board [TAG]`, `recruit` and `vote [start]`; its description says "up to 30 members"; the tutorial lesson's `howItWorks` says "10 to 30 players" and `howToUse` includes `` `{p}crew board` ``.

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the docs**

- `help.ts` `crew` subcommands gain "board [TAG] — browse families that are recruiting, or open one's card", "recruit — your family's listing and applications (Capo and up)", "vote [start] — the no-confidence vote (Underboss and Capos start it)"; `promote` reads "move a member up one rank (Capo needs 10,000,000 net worth)"; the description adds "Families hold up to 30 members."
- `tutorial.ts`: `howItWorks` "a crew of 10 to 30 players…"; `howToUse` gains "`{p}crew board` — find a family that is recruiting".
- `crime-families.ts`: tagline and `what` (lines 11, 14) say 10 to 30 players; the "Joining" invite caps (line 101) say "at most 5 to 10 new members per family in any 7 days, by level" with the full table; the size table (line 115) and the level table's member column (lines 228-231) use the new caps; new sections, each exhaustive: "Family size" (amendment §2.2 table: member cap, heist cap, Capo cap, investigation threshold and weekly joins per level, plus the heist-cap-by-members table), "Capos" (cap `max(1, floor(members / 5))`, the 10,000,000 promotion bar for Capo and Underboss, grandfathering, the Underboss demotion that lands on Soldier when all six seats are held), "No-confidence vote" (who starts, the 72 h voter snapshot, 2/3 of eligible at close with the 3..29 → need table, 48 h, secret changeable ballots, the freeze, claim and succession void it, the 7-day cooldown and its void cases, the Boss's one-time 7-day grace, the demoted officer's 7 days), "Recruitment board" (listing fields and limits, the board sorts and I qualify, apply limits 3/25/72 h, the 7-day and 24-hour reapply waits, the 6-hourly officer digest); the payday section says payday credits each member separately and a missed credit is retried within a minute; the strategy section gains "recruit by activity: the board's Activity sort is the census of members who played in the last 7 days", "keep a free Capo seat for the member you want to promote, since seats never free themselves", and "a vote needs two thirds of everyone eligible, not of those who voted: chase ballots".
- `commands.ts`: the `crew` entry's usage and `keyNumbers` gain Members "10–30 by level", Capos "1–6 (members ÷ 5)", Vote "48 h, 2/3 of eligible", Applications "3 per player, 25 per family, 72 h"; the `heist` entry's cooldown line reads "2 seats per player and 4–10 crew heists per family (members ÷ 3) per rolling 24 hours, plus the family cooldown"; the settings "Account notices" value appends "family applications".
- Changelog: the unreleased v2.1 entry is rewritten as "Crime Families and Crew Heists" with 10–30 members, scaled Capos, the no-confidence vote and the recruitment board. Leagues go in the v2.2 Turf entry (`page.tsx:50-134`), which plan 6 Task 6 rewrites (its H20); this entry does not mention them.
- `FORTUNA_V2_ECONOMY.md`: member caps, the heist cap, the Capo rule, the vote and recruitment rules; amendment §10.1 (rows without the league column, which plan 6 adds), §10.2, §10.3 and §10.4's 30-account audit (its racket line keeps today's 2,600,000 best holding); the ledger gains `payday_clamp_return`; Money Sinks unchanged.

- [ ] **Step 4: Run the test and type-check the dashboard**

Run: `$VT test/general/help-crime-families.test.ts test/crimeFamily/rename-copy.test.ts && (cd dashboard && npx tsc --noEmit -p .)`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/help.ts src/commands/general/tutorial.ts dashboard/src/content/modules/crime-families.ts dashboard/src/content/commands.ts dashboard/src/app/changelog/page.tsx FORTUNA_V2_ECONOMY.md test/general/help-crime-families.test.ts
git commit -m "docs(crime-families): 10-30 member families, Capo scaling, the no-confidence vote and the recruitment board"
```

---

### Task 17: Full verification and the owner hand-off

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `$VT`
Expected: every file passes (start the Redis container first; never two vitest runs at once).

- [ ] **Step 2: Static checks**

Run: `npx prisma validate && npm run typecheck && npm run validate:slash && npm run validate:app-emojis && npm run gen:pixel-assets -- --set cf --check`
Expected: schema valid; no type errors; 73/100 slash commands with `/heist` and no `/caper`; app emojis validate without contacting Discord; the cf pixel set is up to date.

- [ ] **Step 3: Payload audit and tracked-file hygiene**

Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json src/utils/shopCatalog.ts src/services/shopItemEffects.ts && (grep -rn "isTester" src/services/crimeFamily || echo "no isTester") && (grep -rn "channels.fetch" src/ui/crimeFamily src/services/crimeFamily src/handlers src/commands/economy/{crew,caper,turf}.ts || true)`
Expected: "All payloads within Discord limits"; the three files unchanged; "no isTester"; `channels.fetch` only in `src/ui/crimeFamily/caperCard.ts` (`pickLobbyChannel`'s `fetchGuildChannel`).

- [ ] **Step 4: Commit any fix-ups, then report the hand-off to the owner**

The hand-off goes in the final message, not in a file. It states:
- Deploy with `workflow_dispatch` and `run_schema: true`: `prisma/` changed in Task 2, not in the last commit. Five new collections; the changed models have no documents, so no `--accept-data-loss`.
- Flags unchanged (`enabled`, `turfEnabled`, `allowGuildIds`). The census runs at :10 every hour and does its work once per UTC day.
- A37 (the per-word free-text filter that narrows "the existing name rules filter") is built as the amendment specifies and needs the owner's sign-off before the recruitment board is switched on for players.
- The bot is still one process; the job-shard guard and the REST seam make a later `ShardingManager` deploy need no Crime Families change. The non-family jobs in `src/scheduler.ts` and slash registration still run per process (amendment §7.7) and need the same `isJobShard` guard before sharding.
- Plan 5 (cross-server heists, the intel relay, A20) and plan 6 (leagues) build on the seams listed under "Interfaces this plan exports".

---

## Self-review notes (for the executor)

- **Spec coverage (amendment sections → tasks):**
  - §9 rename → Task 1 (code, tests, docs); §12's rename rows → Tasks 1, 16.
  - §2.2 caps, heist cap, joins, investigation → Tasks 4, 5; §2.3 `memberCount` → Tasks 2, 4; §2.4 two-phase payday → Task 8; §2.5 S2/S5 → Task 6, S6/S7/S28 → Task 8, S11 → Task 5; §2.7 edges 1–6 → Tasks 4, 5, 8; §2.6 leaderboard → unchanged here (its league suffix and the `rankedHolders` comment are plan 6).
  - §3 Capos → Task 7 (permission rows in Tasks 9 and 12, F13).
  - §4 vote → Tasks 9 (rules, hooks, chair seam, Start), 10 (ballot, close, CASes), 11 (screens, DMs, sweeper, routes, `!crew vote`); edges 1–15 split across their race tests as listed in each task.
  - §7 sharding → Task 3 (`isJobShard`, REST seam, `BotProcessBoot`, `startCrimeFamilyJobs`); §7.4's single writers are the CASes of Tasks 8, 10, 11, 13.
  - §8 recruitment → Tasks 12 (text, listing, apply, withdraw, kind-scoped invites), 13 (accept, decline, expiry, digest, `recruit` DMs), 14 (census of A22 step 2, reads, S29–S33, M1, M2), 15 (routes, commands, S1/S2 entry points).
  - §6.4 census steps 1–2 → Task 14 (F3); steps 3–5 are plan 6 entries in `CENSUS_STEPS`.
  - §11.1 config → Task 2 (and the two removals in Tasks 4 and 5); §11.2 commands → Tasks 1, 11, 15; §11.3 fixtures → Tasks 6, 8, 11, 13, 14, 15; §11.4 Redis key → Task 11.
  - Appendix A → Task 2 (plan-4 slice); Appendix B: `sweepVotes` (11), `resumePaydayShares` (8), `sweepInvites` (13), `sweepCapers` (3), `sendApplicationDigests` (13), `runTurfCensus` (14), `recordProcessBoot` (3).
- **Deliberately not built here (and where it lands):** guild-lock removal, A20, the intel relay, the DM "Join as…"/Open brief/Scout cards, `CaperCrew.sharedIntel` and the S1 cross-server sentence (plan 5); leagues, cities, `Family.cityId`, census steps 3–5, per-league income, `seedTurf` (plan 6); the non-family `isJobShard` guards and `logToChannel` via REST (amendment §7.7, outside the spec).
- **Owner sign-off:** A37 (Task 12's `checkPublicText`) is in the hand-off.
- **Plan 1–3 tests this plan edits:** `catalog.test.ts` (Task 4), `family-membership.race.test.ts` (Task 4; Task 7's `ranks (6.3)` rewrite: `famWith` sizes and 10,000,000 wallets for the CAPO1..6 fill, the seven-promotion invariant, the Underboss race and "an Underboss can promote Soldier → Capo"; Tasks 9, 12), `caper-join.race.test.ts` (Task 5, including the `:41` and `:45` copy), `caper-settle.race.test.ts`, `caper-sweeper.test.ts`, `caper-flow.test.ts`, `caper-cache.test.ts`, `family-redis-down.test.ts`, `caper-command.test.ts`, `turf-announce.test.ts` (Task 3), `ids-post.test.ts` (Task 3's REST channel double, Task 6's `manageSelect(page, owner)` arity at `:14`, Task 13's new ids in `all`), `scheduler.test.ts` (Task 3's `:57` `allowed_mentions`, Tasks 13, 14 job names), `caper-layout.test.ts` (Task 5), `layout.test.ts` (Tasks 6, 7, 8, 15), `handlers.test.ts` (Tasks 6, 7, 11, 15), `crew-command.test.ts` (Tasks 11, 15), `names-permissions.test.ts` (Tasks 9, 12), `family-vault.race.test.ts` (Task 8, including the `:226-231` clamp case), `family-disband.race.test.ts` (Tasks 8, 13), `turf-notice.test.ts` (Task 1's copy; Task 13's `:11`/`:14` last-account-notice pin and the 31/32 pin), `family-notice.test.ts` (Tasks 1, 13), and every copy pin in Task 1.
- **Cross-task names:** `joinFamilyInTx`/`withSeatRetry(fn, { alreadyInFamily })` (4 → 12, 13); `crewRouteKit.ts` helpers (11 → 15; never imported from `crewInteractionHandler.ts`); the router's merged `crew` table (11, 15); `BoardSort` (12 → 13 `ids.ts`, 14 re-export); `CensusNotice`/`announceCensusNotices` (14 → plan 6); `claimVoteRepost` and `FamilyVote.reposted` (2 → 11); `heistCapFor`/`capoCapFor`/`investigationThresholdFor`/`joinsPerFamilyFor` (4 → 5, 7, 16); `moveChair(…, now)` (9 → 10); `VoteView` (10 → 11); `VoteStartView` (9 → 11); `assertEnabled` (11 → 15); `REQUIREMENTS`/`Requirements` (12 → 14, 15); recruitment `CREW_IDS` (13 → 14, 15); `visibleText` (1 → 11, 14); `countComponents` (6 → 11).
