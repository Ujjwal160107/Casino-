# Crime Families 5: Global Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every family member plan, join, brief, share intel and fight a turf war from any server the bot shares with them (or from their DMs), with a bot-side intel relay that keeps the GO ring a cooperative puzzle when the crew has no shared chat.

**Architecture:** The guild locks go from the one eligibility seam (`GateDef.guild`, `EligibilityOpts.guildId/expectedGuildId`) and from the three service callers that passed a guild, and `isCrimeFamilyOpen(null)` follows `enabled` (A20) so DM presses work. Off-card surfaces reuse the S25 personal-card pattern through one pure builder, and the DM notices carry the same rows the shared cards already use (`joinSelectRow`, `briefRow`, `warActionRow`), built in `ui/` and passed into `dmNoticeService` (plan 4 F19). The relay is one CAS on the sharer's own `CaperCrew` row inside `runFamilyTx` (the `lockChoice` pattern), derived into the recipient's brief by the pure `briefFor`; it moves no money.

**Tech Stack:** TypeScript, discord.js 14.25 (ComponentsV2), Prisma 5.22 on MongoDB (replica set, interactive transactions), ioredis, vitest with mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-11-05-crime-families-scale-design.md` (the amendment; it wins where the two differ). Read sections 0 (A4, A18–A21), 5 (all of it), 7.4, 11.3, 12 and Appendix A's `CaperCrew` block. The old spec `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` still governs everything the amendment does not mention (8.3 intel ring, 8.4 steps, 9.4 war actions, 13.2 routing). The code is the truth where it differs from either spec.

**Plan series and scope:** 1 Foundation → 2 Capers → 3 Turf (shipped) → 4 Families at scale (`docs/superpowers/plans/2026-11-05-crime-families-4-scale-families.md`, executed before this plan) → **5 Global play (this plan)** → 6 Turf leagues. Plan 4's F1 moved cross-server play, the intel relay and A20 here. This plan builds amendment §5 and its docs rows of §12 and nothing else: no vote, recruitment, sizes, sharding seams, leagues, cities or racket income. Line numbers are against `main` at `1badb42`; plan 4 has edited most of these files (the rename, the REST seam, the heist cap), so re-find each cited function by name before you edit it.

---

## Global Constraints

- `.env` `DATABASE_URL` is the LIVE player database. Never run `npm run dev`, `npm start`, `npm run seed`, `npx prisma db push`, `npx prisma studio`, any `sync:*-emojis` without `--dry-run`, or any `ts-node src/...` not listed here, and never read `.env`. Allowed: vitest, `npm run typecheck`, `npx prisma validate|format|generate` (no connection), `npm run validate:slash`, `npm run validate:app-emojis`, `npm run gen:pixel-assets -- --set cf --check`, and `checkV2Payloads.ts` only as `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
- `$VT <files>` means `MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**' <files>`. DB tests need Redis on 6381: `docker start casino-test-redis || docker run -d --rm --name casino-test-redis -p 6381:6379 redis:7-alpine`. Never run two vitest processes at once (they clobber `test/.mongo-uri`).
- Commit directly on `main`; never push (only the owner pushes, and a push deploys). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy gate: the only `prisma/` change is Task 4's three `CaperCrew` fields, so the owner deploys with `workflow_dispatch` and `run_schema: true`. The family collections hold no documents (nothing deployed), so no migration and no `--accept-data-loss`.
- **Copy rule (A8, plan 4 Task 1).** Player-visible text says "Crew Heist" (a title or button) and "crew heist(s)" (in a sentence); the command is `!heist` / `/heist`. Internal names keep "caper": `Caper`/`CaperCrew`, `cpr:` customIds, `caper*` files and functions, Redis keys, ledger and transaction types, the DM pref keys `caper` and `caper_lobby`, the art keys. New code here is named `caper*`/`share*`; new copy says "crew heist".
- `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` never change. `src/data/emojis.json` stays `{}`. No emoji upload and no new art: the intel DM reuses the `caper` notice icon; nothing else adds an icon.
- No module under `src/services/crimeFamily/` imports `isTester`. No tester bypass on any family state.
- Every filtered field is required with a default: `CaperCrew.sharedIntel false` is the CAS sentinel; `sharedAt` is read only with `sharedIntel: true`; `relayed` is display only and never filtered. Any filter on a nullable field needs `OR: [{ f: null }, { f: { isSet: false } }]`.
- Every money and seat write stays in `runFamilyTx` (`src/services/crimeFamily/tx.ts`) behind a CAS or a unique index; the share is a CAS (`updateMany` + `count === 1`) on the sharer's own row with the caper guard read in the same transaction, and gets a race test in `test/anticheat/`. Never catch a P2002 inside a transaction.
- Every UI is ComponentsV2 through `cfPayload` with `allowedMentions: { parse: [] }` (the S28 GO call keeps its crew ping), ≤ 40 components (50035 is swallowed by `src/index.ts`). Every new or changed screen and DM container gets a worst-case fixture in `src/scripts/fixtures/{caperScreens,turfScreens,crimeFamilyScreens}.ts` whose `max` is the amendment's §5.4/§5.5/§11.3 count.
- Every DM goes through `sendOptOutDm`/`notifyMany` (`src/services/dmNoticeService.ts`). Heist DMs use type `caper_lobby`, war DMs `turf`; no new DM type. DM builders that carry a row take it as a parameter (plan 4 F19); `src/services/` never imports `src/ui/`.
- Every channel post or edit goes through `sendToChannel`/`editChannelMessage` (`src/ui/crimeFamily/post.ts`, REST-backed after plan 4 Task 3). After this plan no family code reads `client.guilds.cache` or fetches a guild member, except the trade log in `resolveAndAnnounce` (`logToChannel` needs a `Guild`; amendment §7.7 leaves it).
- The kill switch keeps its shape (old C3, T1): planning and joining are refused while `enabled` is false; Brief, Refresh, lock, Share, Leave, Start, Cancel, Scout, Hit and the hit answer keep working so a live heist or war finishes.
- Every number comes from `CRIME_FAMILY_CONFIG` (`src/utils/economyConfig.ts`) or the catalog; this plan adds no config key and no Redis key (`cf:lobbydm:<uid>` keeps the lobby-DM cap, amendment §5.7).
- Slash commands stay at 73 of 100; no slash option changes.

## Review Focus

1. **A stale lobby DM.** A member presses the DM's "Join as…" after the lobby started, was cancelled or closed, or after they left the family. Expected: "Lobby closed." (or the not-in-family / another-family line), no debit, no seat row, and the DM is not edited. Test: Task 3.
2. **A public S25 lobby card pressed by the wrong person.** `!heist` in server B posts an S25 lobby card in a public channel; a member of another family (or a non-member) picks a role. Expected: "This crew heist belongs to another family." / "You are not in a crime family.", no debit, the card is not edited, so the real member can still use it. Test: Task 2.
3. **Share from the wrong state.** Share pressed from a brief kept open after the heist resolved, after GO ended, by a seat that was pinched at Start (no crew row), by a dark seat, or twice. Expected: "Too late." / "You are not in this crew heist." / "You went dark: this seat counts as a miss." / "Already shared."; no row changes and no nudge DM. Tests: Task 5 (service), Task 6 (route).
4. **War buttons from a DM at the wrong time.** The war-soon DM's Scout or Hit pressed before the war starts, after it ends, or by a member who left the family since the DM. Expected: "The war has not started yet." / "This war is over." / "Not your war."; no contribution row, no debit. Test: Task 3.
5. **A DM press while Crime Families is switched off.** Join from a lobby DM with `enabled: false`. Expected: "Crime Families are not open yet." (not "…in this server…", there is no server), no seat; with `enabled: true` and an `allowGuildIds` list that names no DM, the same press seats the member (A20). Test: Task 1.

## Decisions this plan makes (not in the spec, or chosen where it is silent)

| # | Spec ref | Decision | Why |
|---|---|---|---|
| G1 | A20, C3 | `src/handlers/crewRouteKit.ts` (plan 4 Task 11) gains `NOT_OPEN_HERE` (moved from `crewInteractionHandler.ts`, which re-exports it), exports its `NOT_OPEN`, and adds `assertCfOpen(guildId)` (refuses with `NOT_OPEN_HERE` in a server, `NOT_OPEN` in a DM) and `assertServerOpen(i)` (needs a guild, then `isCrimeFamilyOpen`). Join uses `assertCfOpen`; the create routes and the heist plan route use `assertServerOpen` | A20 makes `isCrimeFamilyOpen(null)` true, which would silently drop the guild requirement from create (it writes `guildId: i.guildId!`) and plan (the lobby needs a channel). "…not open in this server yet" in a DM names a server that does not exist |
| G2 | 5.2 | One pure builder, `buildPersonalCaperCard(view: CaperCardView, viewerId: string)`, draws every off-card heist surface from the live card's view: S25 lobby (unseated, LOBBY), S25 seated (seated, any live status), and a notice with the jump link (unseated, RUNNING/SETTLING). `!heist` in another server, `!heist join` and an off-card join press all use it | One decision point for "what does this member see away from the card"; the old "running in another server" line goes |
| G3 | 5.2 | "The shared card" means `i.message.id === caper.messageId` (read from the row `joinCaper` returns). Any other pressed message (a DM, an S25 lobby card) is edited to the presser's S25 card, built after `onSeatsChanged`, which names them (`<@uid> seated as **Lookout**.`, no ping; the GO-live variant when that join filled the crew and GO auto-started). A refused join edits nothing | A public S25 lobby card is pressable by anyone in that channel; naming the presser keeps the edit honest, and leaving refused cards alone keeps them usable for the right member |
| G4 | 5.4 S25 lobby | The S25 lobby jump link shows whenever the lobby card is live (`messageId !== ""`) | Whether the viewer is in the lobby's server is not knowable from another shard without a REST member fetch per render; a link to a server they are not in only fails to open |
| G5 | 5.3 | `BriefView` gains `shared: boolean` (the viewer's own `sharedIntel`) next to the spec's `relayed` and `canShare`, so the accessory reads "Shared" after a share | The spec's S14 shows Share/Shared; `canShare` alone cannot tell "shared" from "can't share" |
| G6 | 5.3 | Share needs the sharer's brief to be open (`briefOpened`); a crafted press before opening says "Open your brief first." | The spec's "after it has opened its brief"; the Share button only exists on an opened brief |
| G7 | 5.3 nudge | The nudge DM is skipped when the recipient has already locked their call or is already dark (`now >= leakAt` and `isDark`); the share itself still records | The DM carries nothing a locked or dark seat can use; the CAS still bounds it at one per seat |
| G8 | 5.3 result card | `lockChoice` writes `relayed = holder.sharedIntel` at lock time (the holder is the seat's ring successor, as for `leaked`). `relayed` and `leaked` never both hold: a holder that shared opened its brief before the leak, so it is never dark | The spec's "(relayed)" is decided by the lock, like "(leaked)" |
| G9 | 5.5 | DM builders take their row: `caperLobbyNotice(v, row)`, `caperGoNotice(v, row)`, new `caperIntelNotice(v, row)`, `turfWarSoonNotice(v, row)`; the announcers pass `joinSelectRow` / `briefRow` (exported from `caperScreens.ts`) and `warActionRow` (exported from `turfScreens.ts`), the same builders the shared cards use | Plan 4 F19's direction (services never import ui); one row builder per action, used by card and DM alike |
| G10 | 5.5 war-soon | The war-soon DM is 11 components (6 + Row of Scout and three Hits = 5); its fixture keeps the spec's `max` 12. Its text becomes "The war board posts in your family's home channel. Scout and hit from the buttons below once it starts, from any server." | The spec's 12 counts one component the row does not have; the layout test checks `≤ max` |
| G11 | 5.2 | `!turf war` from any server shows the S25 war card; the S20 scout report's hint becomes "-# Share it with your crew: it holds until the slot ends." | A21 keeps scouting chat-shared; "in the home channel" no longer describes where the crew is |
| G12 | 5.4 S1 | The S1 hint keeps plan 4 Task 15's invite clause: "-# Browse families with `!crew board` or ask a Capo for an invite. Crew heists and turf wars work from any server." | Plan 4 added the invite clause and left this plan the last clause |
| G13 | tests | `fakeCaperClient` loses `members` and the guild's `members.fetch` (its `guilds.cache` keeps `{ id: G, name: "Guild" }` for the trade log) and gains `lastDm` (the fake DM client's `last`); `fakeInteraction` accepts `guildId: null` (a DM press) and `messageId` (default `"m-source"`) | No family code reads guild membership any more; DM and on-card presses must be expressible |
| G14 | 5.2 S12 | The S12 lobby hint says "-# Pick a role from **Join as…** or use `!heist join <role>` in any server. Start needs …; the crew heist starts by itself once every seat is filled." | Tells a member on the card that the lobby is not server-bound |

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `test/crimeFamily/cross-server.test.ts` | Join, brief, start, cancel and `!heist` from another server and from DMs; lobby DMs to members in no shared server; DM-pressed join edits the DM; war actions from another server and a DM |
| `test/crimeFamily/intel-relay.test.ts` | Pure `briefFor` relay rules |
| `test/anticheat/caper-relay.race.test.ts` | The share CAS, share vs settle, the nudge bound and the DM toggle |

**Modify:** `prisma/schema.prisma` (`CaperCrew`), `src/utils/economyConfig.ts` (`isCrimeFamilyOpen`, `isTurfOpen`), `src/data/crimeFamilyCatalog.ts` (`GateDef`, `ELIGIBILITY_GATES`), `src/services/crimeFamily/{eligibility,caperLobbyService,caperPlayService,caperQueries,intelRing,views,warActions}.ts`, `src/services/dmNoticeService.ts`, `src/ui/crimeFamily/{caperScreens,caperFlow,familyScreens,turfScreens,turfAnnounce,ids}.ts`, `src/handlers/{crewRouteKit,crewInteractionHandler,caperInteractionHandler,turfInteractionHandler}.ts`, `src/commands/economy/{caper,turf}.ts`, `src/scripts/fixtures/{caperScreens,turfScreens,crimeFamilyScreens}.ts`, `test/crimeFamily/{caperFixtures,fakeInteraction}.ts` and the tests each task names, `src/commands/general/{help,tutorial}.ts`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/commands.ts`, `dashboard/src/app/changelog/page.tsx`, `FORTUNA_V2_ECONOMY.md`.

## Interfaces this plan exports (plan 6 consumes the starred lines)

```ts
// src/utils/economyConfig.ts (A20)
export function isCrimeFamilyOpen(guildId: string | null | undefined): boolean;   // enabled && (!guildId || allowGuildIds === null || allowGuildIds.includes(guildId))
export function isTurfOpen(guildId: string | null | undefined): boolean;          // isCrimeFamilyOpen(guildId) && turfEnabled

// src/data/crimeFamilyCatalog.ts  (*plan 6: GateDef has no guild row)
export interface GateDef { /* as today, without `guild` */ }

// src/services/crimeFamily/eligibility.ts
export interface EligibilityOpts { now?: Date; familyId?: string; role?: CaperRoleKey }

// src/services/crimeFamily/caperLobbyService.ts
export function joinCaper(input: { caperId: string; uid: string; role: CaperRoleKey; now?: Date }): Promise<{ caper: Caper; seat: CaperCrew; full: boolean }>;

// src/services/crimeFamily/warActions.ts  (*plan 6: no guild argument)
export function scoutWar(input: { warId: string; userId: string; now?: Date }): Promise<ScoutReport>;
export function armHit(input: { warId: string; userId: string; block: WarBlockKey; now?: Date }): Promise<ArmedHit>;

// src/handlers/crewRouteKit.ts
export const NOT_OPEN: string;        // "Crime Families are not open yet."
export const NOT_OPEN_HERE: string;   // "Crime Families are not open in this server yet." (re-exported by crewInteractionHandler.ts)
export function assertCfOpen(guildId: string | null): void;
export function assertServerOpen(i: CfInteraction): void;

// src/ui/crimeFamily/caperScreens.ts
export function joinSelectRow(caperId: string, roles: readonly CaperRoleKey[]): ActionRowBuilder<StringSelectMenuBuilder>;
export function briefRow(caperId: string): ActionRowBuilder<ButtonBuilder>;
export function buildPersonalCaperCard(v: CaperCardView, viewerId: string): CfPayload;

// src/ui/crimeFamily/turfScreens.ts  (*plan 6 reuses it on the city war cards)
export function warActionRow(warId: string): ActionRowBuilder<ButtonBuilder>;

// src/services/dmNoticeService.ts
export function caperLobbyNotice(v: { familyLabel: string; tierName: string; stake: number; closesAt: Date; jumpUrl: string | null }, row: ActionRowBuilder<StringSelectMenuBuilder>): ContainerBuilder;   // 8
export function caperGoNotice(v: { tierName: string; goEndsAt: Date; jumpUrl: string | null }, row: ActionRowBuilder<ButtonBuilder>): ContainerBuilder;   // 8
export function caperIntelNotice(v: { sharerId: string; tierName: string; goEndsAt: Date }, row: ActionRowBuilder<ButtonBuilder>): ContainerBuilder;     // 8
export function turfWarSoonNotice(v: { racketName: string; side: WarSide; startsAt: Date; channelUrl: string }, row: ActionRowBuilder<ButtonBuilder>): ContainerBuilder;   // 11 (*plan 6)

// src/services/crimeFamily/views.ts
export interface BriefView { /* existing */ relayed: string | null; canShare: boolean; shared: boolean }
export interface CaperSeatView { /* existing */ relayed: boolean }

// src/services/crimeFamily/intelRing.ts
type BriefSeat = { role: CaperRoleKey; userId: string; briefOpened: boolean; briefOpenedAt: Date; choice: number; sharedIntel: boolean };

// src/services/crimeFamily/caperPlayService.ts
export type IntelNudge = { userId: string; tierName: string; goEndsAt: Date };
export function shareIntel(caperId: string, uid: string, now?: Date): Promise<{ brief: BriefView; nudge: IntelNudge | null }>;

// src/ui/crimeFamily/caperFlow.ts
export function sendIntelNudge(client: Client, caperId: string, sharerId: string, nudge: IntelNudge): Promise<void>;   // never throws

// src/ui/crimeFamily/ids.ts
CPR_IDS.share: (caperId: string) => string;   // cpr:share:<caperId>, 34 characters

// test/crimeFamily/caperFixtures.ts
seedRunning(o: { /* existing */ shared?: CaperRoleKey[] });   // those seats: sharedIntel true, sharedAt startedAt + 2 s
fakeCaperClient(o?: { missingPerms?: Record<string, BotPerm[]> }): { /* existing; no members option */ lastDm: Map<string, unknown> };
// test/crimeFamily/fakeInteraction.ts
export type FakeOpts = { userId: string; guildId?: string | null; messageId?: string; ephemeralSource?: boolean; channelId?: string; client?: unknown };
```

---
### Task 1: No guild locks: A20 open flags, the eligibility seam and the service callers

**Files:**
- Modify:
  - `src/utils/economyConfig.ts:270-279`: `isCrimeFamilyOpen(guildId)` = `enabled && (!guildId || allowGuildIds === null || allowGuildIds.includes(guildId))`; `isTurfOpen` unchanged in body (it already composes `isCrimeFamilyOpen`). Doc comments: "a DM press (no guild) is open whenever `enabled` (A20); `allowGuildIds` limits servers only".
  - `src/data/crimeFamilyCatalog.ts:260-312`: `GateDef.guild` (`:271`) goes; `caperGate` (`:283`) and every `ELIGIBILITY_GATES` row (`:290`, `:294`, `:302`, `:306`, `:310`) drop `guild:`.
  - `src/services/crimeFamily/eligibility.ts`: `EligibilityOpts` (`:17`) loses `guildId` and `expectedGuildId`; `guildPhrase` (`:56-58`) and the guild block (`:145-148`) go; the doc comment's row list (`:60-65`) drops `guild`.
  - `src/services/crimeFamily/caperLobbyService.ts`: `seatGates` (`:58-76`) loses its `guildId` parameter, `target.guildId` and the "another server" refusal (`:65`); `planCaper` (`:94`) and `joinCaper` (`:127-137`) call it without a guild; `joinCaper`'s input loses `guildId` (`planCaper` keeps its `guildId`, which records where the card posts).
  - `src/services/crimeFamily/warActions.ts`: `warActor` (`:57-73`) loses `guildId` and calls `checkMemberEligibility(userId, "war", { now })`; `scoutWar` (`:76`) and `armHit` (`:94`) inputs lose `guildId`.
  - `src/handlers/crewRouteKit.ts` (plan 4 Task 11): add `export const NOT_OPEN_HERE = "Crime Families are not open in this server yet."`, export the existing `NOT_OPEN`, add `assertCfOpen` and `assertServerOpen` (G1). Its imports gain `isCrimeFamilyOpen`; it still imports no route table.
  - `src/handlers/crewInteractionHandler.ts:40`: `NOT_OPEN_HERE` becomes `export { NOT_OPEN_HERE } from "./crewRouteKit";`; `assertCreateOpen` (`:59-61`) is deleted and its two callers (`:249`, `:293`) call `assertServerOpen(i)`.
  - `src/handlers/caperInteractionHandler.ts:25-44`: `assertOpen` goes; `planRoute` calls `assertServerOpen(i)`; `joinRoute` calls `assertCfOpen(i.guildId)` and `joinCaper` without `guildId`; `NOT_OPEN_HERE` is no longer imported here.
  - `src/handlers/turfInteractionHandler.ts:89`, `:108`: `armHit`/`scoutWar` without `guildId`; the header comment's "Scout, Hit and the hit answer are not [gated]" gains "and work from any server or a DM".
  - `src/commands/economy/caper.ts:92`: `joinCaper` without `guildId`.
  - `src/commands/economy/turf.ts:63-67`: `war` drops the home-guild check and its comment says "from any server".
  - `test/crimeFamily/fakeInteraction.ts:8`, `:30`: `FakeOpts.guildId?: string | null`; `guildId: opts.guildId === undefined ? "g1" : opts.guildId` (null is a DM).
- Test: `test/crimeFamily/{catalog,war-math,eligibility,caper-handlers,turf-handlers,turf-command,handlers}.test.ts`, `test/anticheat/caper-join.race.test.ts`

**Interfaces:**
- Consumes: plan 4's `crewRouteKit.ts` (`assertEnabled`, `NOT_OPEN`), `withCfConfig`, `fakeSelect`/`fakeButton`, `caperCrew`, `fakeCaperClient`.
- Produces: `isCrimeFamilyOpen`/`isTurfOpen` (A20), `GateDef` without `guild`, `EligibilityOpts { now?; familyId?; role? }`, the guild-free `joinCaper`, `scoutWar`, `armHit`, and from `crewRouteKit.ts`:
  - `assertCfOpen(guildId: string | null): void`: `if (!isCrimeFamilyOpen(guildId)) throw new FamilyError(guildId ? NOT_OPEN_HERE : NOT_OPEN)`.
  - `assertServerOpen(i: CfInteraction): void`: `if (!i.guildId || !isCrimeFamilyOpen(i.guildId)) throw new FamilyError(NOT_OPEN_HERE)`.
  - `FakeOpts.guildId: string | null`.

- [ ] **Step 1: Write the failing tests**

In `test/crimeFamily/catalog.test.ts`, delete the `guild: …` entry from all six expected rows of the gate table (`:63-68`: `found`, `family_join`, `caper_t4`, `war`, `racket`, `payday`; `toEqual` treats `guild: null` as a key the catalog no longer has), replace the `isCrimeFamilyOpen(null)` line (`:81`) with its own case, and add the matching turf case to `war-math.test.ts`:

```ts
it("A20: a DM press follows enabled; allowGuildIds limits only servers", async () => {
  expect(isCrimeFamilyOpen(null)).toBe(false);                                // enabled false by default in tests
  await withCfConfig({ enabled: true, allowGuildIds: ["g1"] }, async () => {
    expect(isCrimeFamilyOpen(null)).toBe(true);
    expect(isCrimeFamilyOpen(undefined)).toBe(true);
    expect(isCrimeFamilyOpen("g2")).toBe(false);
  });
  expect(Object.values(ELIGIBILITY_GATES).some((g) => "guild" in g)).toBe(false);
});
// war-math.test.ts
it("A20: isTurfOpen(null) needs enabled and turfEnabled", async () => {
  await withCfConfig({ enabled: true }, async () => expect(isTurfOpen(null)).toBe(false));
  await withCfConfig({ enabled: true, turfEnabled: true, allowGuildIds: ["g1"] }, async () => expect(isTurfOpen(null)).toBe(true));
});
```

In `eligibility.test.ts` (`:65-70`) rename the case "checks a caper seat's heat, prep item and tenure" and replace both guild assertions with `expect(await gates(u, "caper_t2", { role: "LOOKOUT" })).toEqual(["heat"])` and `expect(await gates(u, "caper_t1", { role: "MUSCLE" })).toEqual(["prep_item"])`.

In `test/anticheat/caper-join.race.test.ts`: the `join` helper (`:14`) loses its `guildId` parameter; the case at `:71` is renamed "refuses the Mastermind seat, a role outside the tier and a missing prep item, with no debit" and loses the `"g2"` line.

In `caper-handlers.test.ts` replace "join from another guild" (`:70-76`) with:

```ts
it("join from another guild and from a DM seats the member (A4, A20)", () => open(async () => {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
  const fc = fakeCaperClient();
  const far = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: "g2", client: fc.client }));
  expect(said(far)).not.toContain("another server");
  const dm = await press(fakeSelect(CPR_IDS.join(c.id), ["SAFECRACKER"], { userId: f.ids.SAFECRACKER, guildId: null, client: fc.client }));
  expect(said(dm)).not.toContain("not open");
  expect((await testPrisma.caperCrew.findMany({ where: { caperId: c.id } })).map((r) => r.role).sort()).toEqual(["LOOKOUT", "MASTERMIND", "SAFECRACKER"]);
}));

it("a DM join while switched off says 'not open yet' and seats nobody (Review Focus 5)", async () => {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
  const before = (await testPrisma.wallet.findUnique({ where: { userId: f.ids.LOOKOUT } }))!.balance;
  const off = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: null, client: fakeCaperClient().client }));
  expect(said(off)).toContain("Crime Families are not open yet.");
  expect(said(off)).not.toContain("in this server");
  await withCfConfig({ enabled: true, allowGuildIds: ["g9"] }, async () => {
    const on = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: null, client: fakeCaperClient().client }));
    expect(said(on)).not.toContain("not open");
  });
  expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: f.ids.LOOKOUT } })).toBe(1);
  expect((await testPrisma.wallet.findUnique({ where: { userId: f.ids.LOOKOUT } }))!.balance).toBe(before - caperTier(1).stake);   // one stake (50,000), once
});

it("plan from a DM is refused (the lobby needs a server channel)", () => open(async () => {
  const { bossId } = await caperCrew({ tier: 1, roles: [...R3] });
  const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: null, client: fakeCaperClient().client }));
  expect(said(i)).toContain("Crime Families are not open in this server yet.");
  expect(await testPrisma.caper.count()).toBe(0);
}));
```

(`caperTier` comes from `src/data/crimeFamilyCatalog`; add it to the file's imports.)

In `handlers.test.ts`, after the closed-feature case (`:110-125`), add: a `createOk` press with `guildId: null` under `withCfConfig({ enabled: true })` says "Crime Families are not open in this server yet." and creates no family.

In `turf-handlers.test.ts` replace "a press from another guild is refused…" (`:55-62`) with:

```ts
it("Hit from another guild and Scout from a DM work like any press (A4)", async () => {
  await withCfConfig(ON, async () => {
    const { w, s } = await liveWar();
    const hit = fakeButton(TURF_IDS.hit(w.id, "docks"), { userId: s, guildId: "elsewhere" });
    await handleCrimeFamilyInteraction(hit as any);
    expect(JSON.stringify(hit.editReply.mock.calls)).toMatch(/turf:hx:[0-9a-f]{24}:\d/);
    const scout = fakeButton(TURF_IDS.scout(w.id), { userId: s, guildId: null });
    await handleCrimeFamilyInteraction(scout as any);
    expect(said(scout)).toContain("weak point is");
    expect(await testPrisma.warContribution.count({ where: { warId: w.id, userId: s } })).toBe(1);
  });
});
```

In `turf-command.test.ts` (`:83-91`) rename the case "war posts the S25 card from any server" and change the `"g2"` line to `expect(await run("!turf war", boss, "g2")).toContain(TURF_IDS.scout(w.id))`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/catalog.test.ts test/crimeFamily/war-math.test.ts test/crimeFamily/eligibility.test.ts test/crimeFamily/caper-handlers.test.ts test/crimeFamily/turf-handlers.test.ts test/crimeFamily/turf-command.test.ts test/crimeFamily/handlers.test.ts test/anticheat/caper-join.race.test.ts`
Expected: FAIL: `isCrimeFamilyOpen(null)` is false under `enabled`, a `guild` row exists, the DM join says "not open in this server", the g2 hit is "Not eligible".

- [ ] **Step 3: Implement the open flags, the seam and the callers**

Per Files and Interfaces. `npm run typecheck` finds every remaining `guildId`/`expectedGuildId` argument to `checkMemberEligibility`, `joinCaper`, `scoutWar` and `armHit`; remove each.

- [ ] **Step 4: Run the family suites**

Run: `$VT test/crimeFamily test/anticheat && npm run typecheck`
Expected: PASS. `grep -rn 'expectedGuildId\|guildPhrase\|another server; join' src` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/economyConfig.ts src/data/crimeFamilyCatalog.ts src/services/crimeFamily/eligibility.ts src/services/crimeFamily/caperLobbyService.ts src/services/crimeFamily/warActions.ts src/handlers/crewRouteKit.ts src/handlers/crewInteractionHandler.ts src/handlers/caperInteractionHandler.ts src/handlers/turfInteractionHandler.ts src/commands/economy/caper.ts src/commands/economy/turf.ts test
git commit -m "feat(crime-families): crew heists and war actions from any server or DM; drop the guild gate (A4, A20)"
```

---

### Task 2: Personal cards: `!heist` from another server, off-card joins, the S1 and S12 hints

**Files:**
- Modify:
  - `src/ui/crimeFamily/caperScreens.ts`: export `joinSelectRow` (the select built inline in `buildLobby`, `:128-139`, which now calls it) and `briefRow` (the Open brief row of `buildGo` `:163` and `buildCaperSeatCard` `:256`, which now call it); add `buildPersonalCaperCard`; the S12 hint (`:107-110`) per G14; the header comment lists the S25 lobby variant.
  - `src/commands/economy/caper.ts`: `view` (`:59-74`): a live heist whose `guildId` is this server keeps the C7 repost; any other live heist replies `buildPersonalCaperCard(view, ctx.uid)` (public) with `view = await buildCaperCardView(live.id, now)`; a null view (the row vanished between the two reads) throws `FamilyError(NO_LOBBY)`. `join` (`:86-101`) first runs `await onSeatsChanged(ctx.message.client, caper.id, full)` (it never throws: every branch is wrapped in `safely`), then builds the view and replies `buildPersonalCaperCard(view, ctx.uid)` in place of the hand-built seat card, so a join that fills the crew shows the GO-live variant, not the lobby copy; the `try/finally` goes (the seat and the auto-start are both committed before the reply, so a failed reply skips nothing). A null view there replies the notice `` `Seated as ${caperRole(role).name}.` `` (the seat is committed). The header comment (`:1-6`) says subactions work from any server.
  - `src/handlers/caperInteractionHandler.ts` `joinRoute`: after `joinCaper`, `await onSeatsChanged(i.client, caperId, full)` as today (`:43`); then, when the pressed message is not the shared card (G3), build the view and `show(i, buildPersonalCaperCard(view, i.user.id))`; a null view skips the edit (the seat is committed, the card writer redraws). No `try/finally`: `onSeatsChanged` already ran.
  - `src/ui/crimeFamily/familyScreens.ts` S1 hint (`buildNoFamilyCard`, plan 4 Task 15's text) per G12.
  - `src/scripts/fixtures/caperScreens.ts`, `src/scripts/fixtures/crimeFamilyScreens.ts` (S1 stays `max` 14).
  - `test/crimeFamily/fakeInteraction.ts`: `FakeOpts.messageId?: string`; `message: { id: opts.messageId ?? "m-source", … }`.
- Create: `test/crimeFamily/cross-server.test.ts`
- Test: `test/crimeFamily/{caper-command,caper-handlers,caper-layout}.test.ts`

**Interfaces:**
- Consumes: Task 1's guild-free `joinCaper` and `assertCfOpen`; `buildCaperCardView(caperId, now)` (`src/services/crimeFamily/caperQueries.ts:66`); `jumpLink`; `buildNotice`, `buttonRow`, `cfButton`, `cfPayload`, `text` (`kit.ts`); `visibleText` (plan 4 Task 1), `countComponents` (plan 4 Task 6, `test/crimeFamily/layoutHelpers.ts`).
- Produces: `joinSelectRow`, `briefRow`, `buildPersonalCaperCard` (top Interfaces block); `FakeOpts.messageId`.
  - `joinSelectRow(caperId, roles)`: a `StringSelectMenuBuilder` `CPR_IDS.join(caperId)`, placeholder "Join as…", one option per role (label = role name, value = role key, the role's cf emoji when loaded), exactly as `buildLobby` builds it today.
  - `briefRow(caperId)`: `buttonRow(cfButton(CPR_IDS.brief(caperId), "Open brief", ButtonStyle.Primary))`.
  - `buildPersonalCaperCard(v, viewerId)` (G2), with `seat = v.seats.find((s) => s.userId === viewerId)`, `jump = v.messageId ? jumpLink(v.guildId, v.channelId, v.messageId) : null`, `tier = caperTier(v.tier)`:
    - LOBBY, no seat → **S25 lobby** (4): `Container[Text, SelectRow(joinSelectRow(v.caperId, v.openRoles))]`; text `` `${v.familyLabel} crew heist lobby: ${tier.name} · closes ${rel(v.lobbyClosesAt)}` `` + (`jump` ? `` `\n[Go to the lobby](${jump})` `` : "") + (no open role ? `"\nEvery open seat is taken."`, and no select row).
    - a seat, LOBBY → `buildCaperSeatCard({ caperId, text: `${mention(viewerId)} seated as **${roleName}**. GO starts when every seat is filled or the planner presses Start.`, jumpUrl: jump })` (4).
    - a seat, RUNNING or SETTLING → `buildCaperSeatCard({ caperId, text: `${mention(viewerId)} GO is live: open your brief. GO ends ${rel(v.goEndsAt)}.`, jumpUrl: jump })` (4).
    - no seat, RUNNING or SETTLING (or any ended status) → `buildNotice(`Your family's ${tier.name} crew heist is under way${jump ? `: ${jump}` : "."}`)` (2).
  - Off-card join (G3): `const onCard = i.isMessageComponent() && i.message.id === joined.caper.messageId;` `if (!onCard)` show the personal card built from `buildCaperCardView(caperId, new Date())`, read after `onSeatsChanged` so a filling join sees RUNNING.
  - Null view (`buildCaperCardView` returns `Promise<CaperCardView | null>`): `view` throws `FamilyError(NO_LOBBY)`; `join` replies `` `Seated as ${roleName}.` ``; `joinRoute` edits nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/cross-server.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { handleCaper } from "../../src/commands/economy/caper";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { planCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig, seedEligibleUser, seedFamily } from "../helpers";
import { caperCrew, seedRunning, fakeCaperClient, G, CH } from "./caperFixtures";
import { fakeSelect, said } from "./fakeInteraction";
import { visibleText } from "./visibleText";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);
const press = async (i: any) => { await handleCrimeFamilyInteraction(i); return i; };

/** `!heist <args>` as uid in another server's channel; the reply payloads as visible text and JSON. */
async function heist(fc: ReturnType<typeof fakeCaperClient>, uid: string, args: string[], guildId = "g2", channelId = "c-far") {
  const reply = vi.fn(async (_p: unknown) => ({ id: "r1" }));
  const message = { client: fc.client, guildId, guild: { id: guildId }, channelId, channel: fc.channel(channelId), author: { id: uid, username: "T", bot: false }, reply } as any;
  await handleCaper(message, args);
  return { text: reply.mock.calls.map((c) => visibleText(c[0])).join("\n"), json: JSON.stringify(reply.mock.calls) };
}

async function lobbyWithCard() {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const fc = fakeCaperClient();
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
  const cardId = (await postCaperCard(fc.client, c.id, CH))!;
  return { ...f, fc, c, cardId };
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

describe("personal cards (amendment 5.2, 5.4)", () => {
  it("!heist in another server posts the S25 lobby card; in the lobby's server it reposts the card", () => open(async () => {
    const { ids, fc, c, cardId } = await lobbyWithCard();
    const far = await heist(fc, ids.LOOKOUT, []);
    expect(far.text).toContain("crew heist lobby: Pawnshop Back Room");
    expect(far.text).toContain(`[Go to the lobby](https://discord.com/channels/${G}/${CH}/${cardId})`);
    expect(far.json).toContain(CPR_IDS.join(c.id));
    expect(far.text).not.toContain("another server");
    const sends = fc.sent.length;
    await heist(fc, ids.LOOKOUT, [], G, CH);
    expect(fc.sent.length).toBe(sends + 1);                                  // C7 repost in the lobby's own server
  }));

  it("join, brief, start and cancel work from another server", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    expect((await heist(fc, ids.LOOKOUT, ["join", "lookout"])).text).toContain("seated as **Lookout**");
    expect((await heist(fc, ids.SAFECRACKER, ["join", "safecracker"])).text).toContain("seated as **Safecracker**");
    await heist(fc, ids.MASTERMIND, ["start"]);
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("RUNNING");
    expect((await heist(fc, ids.LOOKOUT, ["brief"])).json).toContain(CPR_IDS.openBrief(c.id, ids.LOOKOUT));
    expect((await heist(fc, ids.LOOKOUT, [])).text).toContain("GO is live: open your brief.");
    expect((await heist(fc, ids.DRIVER, [])).text).toContain("crew heist is under way");
  }));

  it("cancel from another server refunds every stake", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    await heist(fc, ids.LOOKOUT, ["join", "lookout"]);
    expect((await heist(fc, ids.MASTERMIND, ["cancel"])).text).toContain("every stake was refunded");
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CANCELLED");
  }));

  it("a join on the shared card leaves it to the card writer; a join on an S25 lobby card edits that card to the presser's seat", () => open(async () => {
    const { ids, fc, c, cardId } = await lobbyWithCard();
    const onCard = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: ids.LOOKOUT, guildId: G, messageId: cardId, client: fc.client }));
    expect(onCard.editReply).not.toHaveBeenCalled();
    const off = await press(fakeSelect(CPR_IDS.join(c.id), ["SAFECRACKER"], { userId: ids.SAFECRACKER, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
    expect(visibleText(off.editReply.mock.calls.at(-1)[0])).toContain(`<@${ids.SAFECRACKER}> seated as **Safecracker**`);
  }));

  it("a join that fills the crew shows the GO-live card, not the lobby copy (G3, edge 7)", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    await heist(fc, ids.LOOKOUT, ["join", "lookout"]);
    await heist(fc, ids.SAFECRACKER, ["join", "safecracker"]);
    const last = await press(fakeSelect(CPR_IDS.join(c.id), ["DRIVER"], { userId: ids.DRIVER, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
    const text = visibleText(last.editReply.mock.calls.at(-1)[0]);
    expect(text).toContain("GO is live: open your brief.");
    expect(text).not.toContain("GO starts when");
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("RUNNING");
  }));

  it("an S25 lobby card pressed by another family's member is refused and not edited (Review Focus 2)", () => open(async () => {
    const { c, fc } = await lobbyWithCard();
    const outsider = await seedEligibleUser({ wallet: 9_000_000, prepKeys: ["camouflage_kit"] });
    await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: outsider, role: "SOLDIER" }] });
    const before = (await testPrisma.wallet.findUnique({ where: { userId: outsider } }))!.balance;
    const i = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: outsider, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
    expect(said(i)).toContain("This crew heist belongs to another family.");
    expect(i.editReply.mock.calls.every((call: any[]) => !visibleText(call[0]).includes("seated as"))).toBe(true);
    expect((await testPrisma.wallet.findUnique({ where: { userId: outsider } }))!.balance).toBe(before);
  }));
});
```

(`said(i)` reads every reply, edit and follow-up; the refusal arrives through `rejectPress`. `camouflage_kit` is a Lookout prep item, as `eligibility.test.ts:66-69` relies on.)

In `caper-command.test.ts`, the case at `:63` ("!caper join lookout from another channel…") expects `seated as **Lookout**` instead of `Seated as Lookout.`. In `caper-handlers.test.ts`, every existing join press on the shared card passes `messageId` equal to the stored card id (read it after `postCaperCard`, or `m1` from `fakeCaperClient`), so it keeps asserting today's behaviour.

Fixtures (`src/scripts/fixtures/caperScreens.ts`): "S25 lobby (5 open roles)" max 4 = `buildPersonalCaperCard(cardView({ status: "LOBBY", seats: seats(1, false) }), CREW[3])` (T4: five open roles); "S25 lobby (no open role)" max 4 = the same with every seat but the viewer's filled and the viewer unseated (use a 21st id); "S25 seated (GO)" max 4 = `buildPersonalCaperCard(cardView({ status: "RUNNING", seats: seats(6, false) }), CREW[2])`; "S25 under way (unseated)" max 2. The existing "S25 caper card" row stays.

Add to `caper-layout.test.ts`: the "S25 lobby (5 open roles)" fixture has exactly one select whose `custom_id` is `CPR_IDS.join(CAPER_ID)` with 5 options and no Mastermind; "S25 lobby (no open role)" has no select and says "Every open seat is taken."; `visibleText` of the S12 lobby fixture contains "in any server" and of S1 contains "Crew heists and turf wars work from any server.".

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/cross-server.test.ts test/crimeFamily/caper-command.test.ts test/crimeFamily/caper-handlers.test.ts test/crimeFamily/caper-layout.test.ts`
Expected: FAIL: `buildPersonalCaperCard` is not exported; `!heist` in g2 replies "running in another server".

- [ ] **Step 3: Extract the rows, add the builder, rewire `view`, `join` and `joinRoute`, update the hints**

Per Files and Interfaces. `buildLobby`, `buildGo` and `buildCaperSeatCard` produce byte-identical JSON to before once they call the extracted rows (the existing layout fixtures prove it).

- [ ] **Step 4: Run the suites and the payload audit**

Run: `$VT test/crimeFamily && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 5: Commit**

```bash
git add src/ui/crimeFamily/caperScreens.ts src/ui/crimeFamily/familyScreens.ts src/commands/economy/caper.ts src/handlers/caperInteractionHandler.ts src/scripts/fixtures/caperScreens.ts src/scripts/fixtures/crimeFamilyScreens.ts test
git commit -m "feat(crime-families): S25 lobby and seat cards away from the lobby; off-card joins edit the pressed card"
```

---

### Task 3: DMs as personal cards: the lobby DM's Join as…, the GO DM's Open brief, the war-soon DM's Scout and Hit

**Files:**
- Modify:
  - `src/services/dmNoticeService.ts:411-425`, `:443-449`: `caperLobbyNotice(v, row)`, `caperGoNotice(v, row)`, `turfWarSoonNotice(v, row)` (G9) append `row` to the `familyNotice` container (`.addActionRowComponents(row)`); new copy below. The module imports `ActionRowBuilder`, `ButtonBuilder`, `StringSelectMenuBuilder` as types only and nothing from `src/ui/`.
  - `src/ui/crimeFamily/caperFlow.ts`: `announceLobby` (`:66-99`) drops `client.guilds.cache.get` (`:77-78`) and the `guild.members.fetch` filter (`:85-89`); its doc comment says "unseated members of the family, in any server (A4)"; `notifyMany(…, () => caperLobbyNotice(notice, joinSelectRow(caperId, view.openRoles)))`. `announceStart` (`:129`) passes `briefRow(caperId)` to `caperGoNotice`.
  - `src/ui/crimeFamily/turfScreens.ts`: `warActionRow` (`:145`) is exported (`ActionRowBuilder<ButtonBuilder>` return type spelled out); `buildScoutReport`'s hint (`:217`) per G11.
  - `src/ui/crimeFamily/turfAnnounce.ts`: `announceWarSoon` (`:146-163`) passes `warActionRow(war.id)`; its doc comment says "with the Scout and Hit buttons, so the DM is the member's war card in any server".
  - `test/crimeFamily/caperFixtures.ts:126-159` (G13): the `members` option, the `members` set and `guild.members` go; `guilds: { cache: new Map([[G, { id: G, name: "Guild" }]]) }` stays for the trade log; the return gains `lastDm: dm.last`.
  - `src/scripts/fixtures/caperScreens.ts`, `src/scripts/fixtures/turfScreens.ts`: the DM entries below.
- Test: `test/crimeFamily/cross-server.test.ts` (append), `test/crimeFamily/caper-flow.test.ts` (`:28`, `:118-134`, `:139`, `:162`), `test/crimeFamily/caper-command.test.ts:24`, `test/anticheat/family-redis-down.test.ts:110`, `:138`, `test/dm/family-notice.test.ts:45-53`, `test/crimeFamily/rename-copy.test.ts` (plan 4 Task 1: its `dm.caperLobbyNotice`/`dm.caperGoNotice` calls gain a row), `test/crimeFamily/turf-layout.test.ts`

**Interfaces:**
- Consumes: Task 2's `joinSelectRow`, `briefRow`, `buildPersonalCaperCard` and the off-card join edit; Task 1's guild-free `scoutWar`/`armHit` and `assertCfOpen`; `familyNotice` (`dmNoticeService.ts:335`), `notifyMany`; `leaveFamily(uid, now)` (`src/services/crimeFamily/membershipService.ts:209`); `seedWar`, `seedRacket`; `countComponents`, `visibleText`.
- Produces: the three DM builders of the top Interfaces block, `warActionRow` (exported), `fakeCaperClient().lastDm`.
  - `caperLobbyNotice(v, row)` (8): title "Crew Heist lobby open"; body `` `**${v.familyLabel}** is planning a **${v.tierName}** crew heist.\n**Stake:** ${fmtFortunes(v.stake)}\nThe lobby closes ${relTime(v.closesAt)}. Pick a role below to join from here.` `` + `jumpLine(v.jumpUrl, "Go to the lobby")`.
  - `caperGoNotice(v, row)` (8): title "Crew Heist GO"; body `` `The **${v.tierName}** crew heist is live.\nGO ends ${relTime(v.goEndsAt)}. Open your brief below.` `` + `jumpLine(v.jumpUrl, "Go to the crew heist")`.
  - `turfWarSoonNotice(v, row)` (11, G10): body `` `Your family is ${attacking|defending} **${v.racketName}**. The war starts ${relTime(v.startsAt)}.\nThe war board posts in your family's home channel. Scout and hit from the buttons below once it starts, from any server.` `` + `jumpLine(v.channelUrl || null, "Go to the home channel")`.

- [ ] **Step 1: Write the failing tests**

Append to `test/crimeFamily/cross-server.test.ts` (imports gain `announceLobby`, `onSeatsChanged`, `runCancel`, `runStart` from `caperFlow`, `joinCaper` from `caperLobbyService`, `leaveFamily` from `membershipService`, `announceWarSoon` from `turfAnnounce`, `TURF_IDS`, `fakeButton`, `seedWar`, `seedRacket`, `daysAgo`):

```ts
describe("DM personal cards (amendment 5.2, 5.5)", () => {
  it("lobby DMs reach every qualified unseated member with no shared server, carrying Join as…", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();                             // the fake client knows no guild members at all
    expect((await announceLobby(fc.client, c.id)).sort()).toEqual([ids.LOOKOUT, ids.SAFECRACKER, ids.DRIVER].sort());
    expect(JSON.stringify(fc.lastDm.get(ids.DRIVER))).toContain(CPR_IDS.join(c.id));
    expect(visibleText(fc.lastDm.get(ids.DRIVER))).toContain("Pick a role below to join from here.");
  }));

  it("a join from the lobby DM seats the member and edits the DM into the S25 seated card (edge 7)", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    const i = await press(fakeSelect(CPR_IDS.join(c.id), ["DRIVER"], { userId: ids.DRIVER, guildId: null, messageId: "dm-1", client: fc.client }));
    const card = i.editReply.mock.calls.at(-1)[0];
    expect(visibleText(card)).toContain(`<@${ids.DRIVER}> seated as **Driver**`);
    expect(JSON.stringify(card)).toContain(CPR_IDS.brief(c.id));
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: ids.DRIVER } })).toBe(1);
  }));

  it("a stale lobby DM (started, cancelled, member left) is refused, charges nothing and is not edited (Review Focus 1)", () => open(async () => {
    const started = await lobbyWithCard();
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: started.c.id, uid: started.ids[r], role: r });
    await runStart(started.fc.client, started.c.id, { kind: "press", uid: started.ids.MASTERMIND });
    const cancelled = await lobbyWithCard();
    await runCancel(cancelled.fc.client, cancelled.c.id, cancelled.ids.MASTERMIND);
    const left = await lobbyWithCard();
    await leaveFamily(left.ids.DRIVER);
    for (const [k, expected] of [[started, "Lobby closed."], [cancelled, "Lobby closed."], [left, "You are not in a crime family."]] as const) {
      const before = (await testPrisma.wallet.findUnique({ where: { userId: k.ids.DRIVER } }))!.balance;
      const i = await press(fakeSelect(CPR_IDS.join(k.c.id), ["DRIVER"], { userId: k.ids.DRIVER, guildId: null, messageId: "dm-old", client: k.fc.client }));
      expect(said(i)).toContain(expected);
      expect(i.editReply.mock.calls.every((call: any[]) => !visibleText(call[0]).includes("seated as"))).toBe(true);
      expect((await testPrisma.wallet.findUnique({ where: { userId: k.ids.DRIVER } }))!.balance).toBe(before);
      expect(await testPrisma.caperCrew.count({ where: { caperId: k.c.id, userId: k.ids.DRIVER } })).toBe(0);
    }
  }));

  it("the GO DM carries Open brief, and pressing it in the DM opens the brief", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: c.id, uid: ids[r], role: r });
    const { full } = await joinCaper({ caperId: c.id, uid: ids.DRIVER, role: "DRIVER" });
    await onSeatsChanged(fc.client, c.id, full);                                // full lobby: auto-start, GO DMs
    expect(JSON.stringify(fc.lastDm.get(ids.SAFECRACKER))).toContain(CPR_IDS.brief(c.id));
    const i = await press(fakeButton(CPR_IDS.brief(c.id), { userId: ids.SAFECRACKER, guildId: null, messageId: "dm-go", client: fc.client }));
    expect(said(i)).toContain("Safecracker brief");
  }));
});

describe("war actions from a DM (amendment 5.2, 5.5)", () => {
  const ON = { enabled: true, turfEnabled: true };
  async function warFamily(status: "ARMED" | "ACTIVE", racketKey: string) {
    const boss = await seedEligibleUser({ wallet: 100_000 }); const s = await seedEligibleUser({ wallet: 100_000 });
    const fam = await seedFamily({ bossId: boss, homeGuildId: G, homeChannelId: CH, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedRacket(racketKey);
    const w = await seedWar({ racketKey, status, topBid: 2_100_000, topBidderFamilyId: fam.id, defenderFamilyId: "" });
    return { boss, s, fam, w };
  }

  it("the war-soon DM carries Scout and the three Hits", () => withCfConfig(ON, async () => {
    const { s, w } = await warFamily("ARMED", "docks_numbers");
    const fc = fakeCaperClient();
    await announceWarSoon(fc.client, w.id, new Date());
    const dm = JSON.stringify(fc.lastDm.get(s));
    for (const id of [TURF_IDS.scout(w.id), TURF_IDS.hit(w.id, "docks"), TURF_IDS.hit(w.id, "main"), TURF_IDS.hit(w.id, "alleys")]) expect(dm).toContain(id);
    expect(visibleText(fc.lastDm.get(s))).toContain("from any server");
  }));

  it("DM war buttons at the wrong time or from a member who left are refused with no row and no debit (Review Focus 4)", () => withCfConfig(ON, async () => {
    const armed = await warFamily("ARMED", "docks_numbers");
    const scout = (uid: string, warId: string) => press(fakeButton(TURF_IDS.scout(warId), { userId: uid, guildId: null }));
    expect(said(await scout(armed.s, armed.w.id))).toContain("The war has not started yet.");
    await testPrisma.war.update({ where: { id: armed.w.id }, data: { status: "SETTLING" } });
    expect(said(await press(fakeButton(TURF_IDS.hit(armed.w.id, "docks"), { userId: armed.s, guildId: null })))).toContain("This war is over.");
    const live = await warFamily("ACTIVE", "casino_row");
    await leaveFamily(live.s);
    expect(said(await scout(live.s, live.w.id))).toContain("Not your war.");
    expect(await testPrisma.warContribution.count({ where: { userId: { in: [armed.s, live.s] } } })).toBe(0);
    expect((await testPrisma.wallet.findUnique({ where: { userId: armed.s } }))!.balance).toBe(100_000);
  }));
});
```

(`docks`, `main`, `alleys` are the `WAR_BLOCKS` keys, `src/data/crimeFamilyCatalog.ts:216-219`.)

In `caper-flow.test.ts`, the case at `:118` becomes "lobby DMs: only eligible, unseated members, in any server; at most 3 per member per rolling 24 h; none within 2 h of a cancelled lobby": its client is `fakeCaperClient()`, its comment "the Safecracker is not in the guild" goes, and the first expectation is `expect((await announceLobby(fc.client, c.id, now)).sort()).toEqual([f.ids.LOOKOUT, f.ids.SAFECRACKER].sort())` (the Associate fails tenure, the Driver has no prep item). Every other `fakeCaperClient({ members: … })` call in the files listed above becomes `fakeCaperClient()`. In the `:139` case ("the lobby-DM counter is created with its 24 h TTL in one MULTI…") the members list was what filtered out the Safecracker and the Driver, who both hold prep items and qualify; both of its expectations (`:147`, `:157`) become `expect((await announceLobby(fc.client, c.id, now)).sort()).toEqual([f.ids.LOOKOUT, f.ids.SAFECRACKER, f.ids.DRIVER].sort())`. Its TTL and counter checks on `cf:lobbydm:<LOOKOUT>` stay as they are.

In `test/dm/family-notice.test.ts:45-53`, the builders take `joinSelectRow("65f0000000000000000000aa", ["LOOKOUT"])` / `briefRow("65f0000000000000000000aa")`, and a new case asserts `countComponents(cfPayload(caperLobbyNotice(…, row))) === 8`, the same for `caperGoNotice` (8), and `turfWarSoonNotice(…, warActionRow("65f0000000000000000000bb"))` is 11 and contains "Scout and hit from the buttons below".

In `turf-layout.test.ts`, `visibleText` of the "S20 scout report" fixture contains "it holds until the slot ends" and not "in the home channel".

Fixtures: `caperScreens.ts` adds "DM crew heist lobby (T4, 5 roles)" max 8 = `cfPayload(caperLobbyNotice({ familyLabel: FAMILY_LABEL, tierName: caperTier(4).name, stake: caperTier(4).stake, closesAt: SOON(), jumpUrl: jump }, joinSelectRow(CAPER_ID, T4_ROLES.slice(1))))` and "DM crew heist GO" max 8 (`briefRow(CAPER_ID)`); `turfScreens.ts` adds "DM turf war soon" max 12 = `cfPayload(turfWarSoonNotice({ racketName: "Construction Union Kickbacks", side: "DEF", startsAt: SOON(), channelUrl: jumpLink(OWNER, OWNER, OWNER).replace(/\/\d+$/, "") }, warActionRow(WAR_ID)))`.

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/cross-server.test.ts test/crimeFamily/caper-flow.test.ts test/dm/family-notice.test.ts test/crimeFamily/turf-layout.test.ts`
Expected: FAIL: `fc.lastDm` is undefined, the DMs carry no row, `warActionRow` is not exported, `announceLobby` returns `[]` (no guild member known).

- [ ] **Step 3: Implement the DM rows, the guild-free lobby DMs and the scout hint**

Per Files and Interfaces. `announceLobby` keeps its order of checks (status, open roles, the 2-hour quiet, then per member: unseated, `wouldQualify`, `takeLobbyDmSlot`), so the 3-a-day cap and the quiet after a cancel are untouched (amendment §5.7).

- [ ] **Step 4: Run the suites and the payload audit**

Run: `$VT test/crimeFamily test/dm test/anticheat && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits". `grep -rn "members.fetch\|guilds.cache" src/ui/crimeFamily src/services/crimeFamily src/handlers src/commands/economy/{crew,caper,turf}.ts` prints only `resolveAndAnnounce`'s trade-log line in `caperFlow.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/services/dmNoticeService.ts src/ui/crimeFamily/caperFlow.ts src/ui/crimeFamily/turfScreens.ts src/ui/crimeFamily/turfAnnounce.ts src/scripts/fixtures/caperScreens.ts src/scripts/fixtures/turfScreens.ts test
git commit -m "feat(crime-families): lobby, GO and war-soon DMs carry their buttons and reach members in any server"
```

---

### Task 4: The relay's data: `CaperCrew` share fields, `briefFor`'s relay rules and the "(relayed)" mark

**Files:**
- Modify:
  - `prisma/schema.prisma:871-898` (`CaperCrew`), after `leaked`:
    ```prisma
    sharedIntel Boolean  @default(false)        // CAS sentinel: this seat shared the intel it holds (A18)
    sharedAt    DateTime @default(now())        // rewritten at the share; read only with sharedIntel:true
    relayed     Boolean  @default(false)        // display only: this seat locked after its holder shared
    ```
    No new index (the share CAS filters by the existing `[caperId, userId]` unique).
  - `src/services/crimeFamily/intelRing.ts:72-105`: `BriefSeat` gains `sharedIntel: boolean`; `briefFor` returns three more fields (below). The header comment gains "A seat's holder may share; the share shows only to the seat it answers (A18)".
  - `src/services/crimeFamily/views.ts:99-131`: `BriefView` gains `relayed: string | null` ("From the holder's share: this seat's own correct label"), `canShare: boolean`, `shared: boolean` (G5); `CaperSeatView` gains `relayed: boolean` ("display only, written at lock").
  - `src/services/crimeFamily/caperPlayService.ts`: `briefOf` (`:23-30`) maps `sharedIntel: r.sharedIntel`; `lockChoice`'s CAS data (`:60`) gains `relayed: holder?.sharedIntel === true` (G8).
  - `src/services/crimeFamily/caperQueries.ts:85`: each seat view gains `relayed: row?.relayed ?? false`.
  - `test/crimeFamily/caperFixtures.ts` `seedRunning` (`:94-122`): `shared?: CaperRoleKey[]`; those rows get `sharedIntel: true, sharedAt: new Date(startedAt.getTime() + 2_000)`.
  - `src/scripts/fixtures/caperScreens.ts`: `seats()` adds `relayed: ended && i % 2 === 0`; `briefView()` adds `relayed: null, canShare: true, shared: false` (Task 5 draws them).
- Create: `test/crimeFamily/intel-relay.test.ts`
- Test: `test/crimeFamily/intel-ring.test.ts:12` (the `seats` helper adds `sharedIntel: false`), `test/crimeFamily/caper-play.test.ts`

**Interfaces:**
- Consumes: `ringNeighbours`, `isDark`, `leakAtOf` (`intelRing.ts:56-70`).
- Produces (Tasks 5 and 6 rely on these exactly):
  - `briefFor(...)` with `seat = seatOf(i.role)`, `holder = seatOf(next)`:
    - `relayed = holder.sharedIntel ? correctLabel(i.role) : null`
    - `shared = seat.sharedIntel`
    - `canShare = seat.briefOpened && !isDark(seat, leakAt) && !seat.sharedIntel && i.now < i.goEndsAt` (a seat opened before `leakAt` is never dark, so this is "not dark at the press", amendment §5.3)
  - `CaperCrew.sharedIntel`, `sharedAt`, `relayed` (Prisma); `BriefView.relayed/canShare/shared`; `CaperSeatView.relayed`; `seedRunning({ shared })`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/crimeFamily/intel-relay.test.ts
import { describe, it, expect } from "vitest";
import { buildAnswers, briefFor, leakAtOf } from "../../src/services/crimeFamily/intelRing";
import type { CaperRoleKey } from "../../src/data/crimeFamilyCatalog";
import { cryptoRng } from "../../src/services/crimeFamily/random";

const T2: CaperRoleKey[] = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER", "MUSCLE"];
const ids = Object.fromEntries(T2.map((r, i) => [r, `u${i}`])) as Record<CaperRoleKey, string>;
const goEndsAt = new Date("2026-11-04T19:08:00Z");
const leakAt = leakAtOf(goEndsAt);
const opened = new Date("2026-11-04T19:06:30Z");
const answers = buildAnswers(T2, cryptoRng);
const label = (r: CaperRoleKey) => answers.seats[r]!.options[answers.seats[r]!.correct];
const seats = (o: { shared?: CaperRoleKey[]; unopened?: CaperRoleKey[]; lateOpen?: CaperRoleKey[] } = {}) => T2.map((role) => ({
  role, userId: ids[role], choice: -1,
  briefOpened: !o.unopened?.includes(role), briefOpenedAt: o.lateOpen?.includes(role) ? leakAt : opened,
  sharedIntel: !!o.shared?.includes(role),
}));
const brief = (role: CaperRoleKey, s = seats(), now = opened) => briefFor({ caperId: "c", answers, role, seats: s, goEndsAt, now });

describe("intel relay (amendment 5.3)", () => {
  it("the Muscle's share shows the Driver's own answer in the Driver's brief and nowhere else", () => {
    const s = seats({ shared: ["MUSCLE"] });
    expect(brief("DRIVER", s).relayed).toBe(label("DRIVER"));
    for (const r of ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "MUSCLE"] as const) expect(brief(r, s).relayed).toBeNull();
    expect(brief("MUSCLE", s)).toMatchObject({ shared: true, canShare: false, tell: { userId: ids.DRIVER, label: label("DRIVER") } });
  });

  it("the Mastermind's share reaches the last seat of the ring", () => {
    expect(brief("MUSCLE", seats({ shared: ["MASTERMIND"] })).relayed).toBe(label("MUSCLE"));
  });

  it("canShare needs an opened brief that is not dark, no earlier share and time left", () => {
    expect(brief("LOOKOUT").canShare).toBe(true);
    expect(brief("LOOKOUT", seats(), leakAt).canShare).toBe(true);                     // opened before the leak: never dark
    expect(brief("LOOKOUT", seats({ unopened: ["LOOKOUT"] })).canShare).toBe(false);
    expect(brief("LOOKOUT", seats({ lateOpen: ["LOOKOUT"] }), leakAt)).toMatchObject({ dark: true, canShare: false });
    expect(brief("LOOKOUT", seats(), goEndsAt).canShare).toBe(false);
    expect(brief("LOOKOUT", seats({ shared: ["LOOKOUT"] }))).toMatchObject({ canShare: false, shared: true });
  });

  it("a dark holder still leaks at GO−30 s and relays nothing; a holder that shared is never dark, so relayed and leaked never both hold", () => {
    expect(brief("DRIVER", seats({ unopened: ["MUSCLE"] }), leakAt)).toMatchObject({ leaked: label("DRIVER"), relayed: null });
    expect(brief("DRIVER", seats({ unopened: ["MUSCLE"] }), opened).leaked).toBeNull();
    expect(brief("DRIVER", seats({ shared: ["MUSCLE"] }), leakAt)).toMatchObject({ leaked: null, relayed: label("DRIVER") });
  });
});
```

Add to `caper-play.test.ts`:

```ts
it("a lock after the holder shared is marked relayed; the card view carries it; a lock without a share is not (G8)", async () => {
  const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none", LOOKOUT: "none" }, shared: ["LOOKOUT"] });
  const now = new Date();
  await lockChoice(caper.id, ids.MASTERMIND, 0, now);                      // the Mastermind's holder is the Lookout
  await lockChoice(caper.id, ids.LOOKOUT, 0, now);                         // the Lookout's holder (Safecracker) did not share
  const rows = await testPrisma.caperCrew.findMany({ where: { caperId: caper.id } });
  expect(Object.fromEntries(rows.map((r) => [r.role, r.relayed]))).toEqual({ MASTERMIND: true, LOOKOUT: false, SAFECRACKER: false });
  expect((await buildCaperCardView(caper.id, now))!.seats.find((s) => s.role === "MASTERMIND")!.relayed).toBe(true);
});
```

(`R3` is `["MASTERMIND", "LOOKOUT", "SAFECRACKER"]` as in that file; add `buildCaperCardView` to its imports.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx prisma generate && $VT test/crimeFamily/intel-relay.test.ts test/crimeFamily/caper-play.test.ts`
Expected: FAIL: `relayed`/`canShare` are undefined; `seedRunning` rejects the unknown `sharedIntel` field until the schema changes.

- [ ] **Step 3: Add the fields and derive the relay**

Schema per Files, then `npx prisma format && npx prisma validate && npx prisma generate` (no connection). Then `intelRing.ts`, `views.ts`, `caperPlayService.ts`, `caperQueries.ts`, the fixtures, per Interfaces.

- [ ] **Step 4: Run the suites**

Run: `$VT test/crimeFamily test/anticheat && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/services/crimeFamily/intelRing.ts src/services/crimeFamily/views.ts src/services/crimeFamily/caperPlayService.ts src/services/crimeFamily/caperQueries.ts src/scripts/fixtures/caperScreens.ts test
git commit -m "feat(crime-families): CaperCrew share fields and the relay rules in briefFor (A18)"
```

---

### Task 5: `shareIntel`: the one-per-seat share CAS and its races

**Files:**
- Modify: `src/services/crimeFamily/caperPlayService.ts` (new `shareIntel`, `IntelNudge`; the header comment gains "A share writes only its own crew row, like a lock").
- Create: `test/anticheat/caper-relay.race.test.ts`
- Test: `test/crimeFamily/caper-play.test.ts`

**Interfaces:**
- Consumes: Task 4's fields and `briefFor`; `answersOf`, `briefOf`, `TOO_LATE`, `NOT_IN_CAPER` (`caperPlayService.ts:12-30`, copy renamed by plan 4 Task 1 to "You are not in this crew heist."); `runFamilyTx`, `FamilyError`; `caperTier`; `resolveCaper(caperId, now, rng)` (plan 4 Task 3, A30).
- Produces: `IntelNudge`, `shareIntel` (top Interfaces block). Inside one `runFamilyTx`, in this order:
  1. `tx.caper.findFirst({ where: { id: caperId, status: "RUNNING", goEndsAt: { gt: now } } })`, else `TOO_LATE`; `answersOf(caper)`.
  2. `rows = tx.caperCrew.findMany({ where: { caperId } })`; no row for `uid` → `NOT_IN_CAPER`.
  3. `now >= leakAt && isDark(row, leakAt)` → "You went dark: this seat counts as a miss."
  4. `!row.briefOpened` → "Open your brief first." (G6)
  5. CAS `tx.caperCrew.updateMany({ where: { caperId, userId: uid, sharedIntel: false }, data: { sharedIntel: true, sharedAt: now } })`; `count !== 1` → "Already shared."
  6. `recipient = rows.find((r) => r.role === ringNeighbours(answers.order, row.role).prev)`; `nudge = recipient.choice === -1 && !(now >= leakAt && isDark(recipient, leakAt)) ? { userId: recipient.userId, tierName: caperTier(caper.tier).name, goEndsAt: caper.goEndsAt } : null` (G7).
  After the transaction: `brief = briefOf(caper, answers, await listCrew(caperId), uid, now)` (as `lockChoice` does). No money moves, no Redis, no DM (the route sends the nudge).

- [ ] **Step 1: Write the failing tests**

Add to `caper-play.test.ts`:

```ts
describe("share (amendment 5.3)", () => {
  it("records one share and returns the nudge for the seat it answers", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    const now = new Date();
    const { brief, nudge } = await shareIntel(caper.id, ids.LOOKOUT, now);           // the Lookout holds the Mastermind's answer
    expect(brief).toMatchObject({ shared: true, canShare: false });
    expect(nudge).toEqual({ userId: ids.MASTERMIND, tierName: "Pawnshop Back Room", goEndsAt: caper.goEndsAt });
    expect(await testPrisma.caperCrew.findFirst({ where: { caperId: caper.id, userId: ids.LOOKOUT } })).toMatchObject({ sharedIntel: true, sharedAt: now });
    expect((await openBrief(caper.id, ids.MASTERMIND, now)).relayed).not.toBeNull();
  });

  it("refuses from the wrong state and writes nothing (Review Focus 3)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], dark: ["SAFECRACKER"] });
    const now = new Date();
    const leakAt = new Date(+caper.goEndsAt - 30_000);
    await expect(shareIntel(caper.id, ids.SAFECRACKER, now)).rejects.toThrow("Open your brief first.");
    await expect(shareIntel(caper.id, ids.SAFECRACKER, leakAt)).rejects.toThrow("You went dark: this seat counts as a miss.");
    await expect(shareIntel(caper.id, "not-in-crew", now)).rejects.toThrow("You are not in this crew heist.");
    await expect(shareIntel(caper.id, ids.LOOKOUT, caper.goEndsAt)).rejects.toThrow("Too late.");
    await shareIntel(caper.id, ids.LOOKOUT, now);
    await expect(shareIntel(caper.id, ids.LOOKOUT, now)).rejects.toThrow("Already shared.");
    expect(await testPrisma.caperCrew.count({ where: { caperId: caper.id, sharedIntel: true } })).toBe(1);
    await testPrisma.caper.update({ where: { id: caper.id }, data: { status: "SETTLING" } });
    await expect(shareIntel(caper.id, ids.MASTERMIND, now)).rejects.toThrow("Too late.");
  });

  it("skips the nudge when the recipient already locked or went dark (G7), but still records the share", async () => {
    const locked = await seedRunning({ tier: 1, roles: [...R3] });                    // every seat locked
    expect((await shareIntel(locked.caper.id, locked.ids.LOOKOUT, new Date())).nudge).toBeNull();
    const dark = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" }, dark: ["MASTERMIND"] });
    const leakAt = new Date(+dark.caper.goEndsAt - 30_000);
    expect((await shareIntel(dark.caper.id, dark.ids.LOOKOUT, leakAt)).nudge).toBeNull();
    expect(await testPrisma.caperCrew.count({ where: { sharedIntel: true, caperId: { in: [locked.caper.id, dark.caper.id] } } })).toBe(2);
  });
});
```

("Pawnshop Back Room" is `caperTier(1).name`, `src/data/crimeFamilyCatalog.ts:135`.)

```ts
// test/anticheat/caper-relay.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { shareIntel } from "../../src/services/crimeFamily/caperPlayService";
import { resolveCaper } from "../../src/services/crimeFamily/caperSettleService";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
import { seedRunning, scriptedRng, txCount } from "../crimeFamily/caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const row = (caperId: string, userId: string) => testPrisma.caperCrew.findFirstOrThrow({ where: { caperId, userId } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("the share CAS (A18)", () => {
  it("two concurrent shares from one seat record one share and one nudge", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    const now = new Date();
    const rs = await Promise.allSettled([shareIntel(caper.id, ids.LOOKOUT, now), shareIntel(caper.id, ids.LOOKOUT, now)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rs.find((r) => r.status === "rejected")).toMatchObject({ reason: { message: "Already shared." } });
    expect(rs.filter((r) => r.status === "fulfilled" && r.value.nudge !== null)).toHaveLength(1);
  });

  it("a share racing the settle draw either lands before it or reads Too late; the take is paid once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });            // every seat locked: due before goEndsAt
    const t = new Date(+caper.startedAt + 10_000);
    const [share] = await Promise.allSettled([shareIntel(caper.id, ids.LOOKOUT, t), resolveCaper(caper.id, t, scriptedRng([5_000]))]);
    const shared = (await row(caper.id, ids.LOOKOUT)).sharedIntel;
    expect(share.status === "fulfilled").toBe(shared);
    if (share.status === "rejected") expect(share.reason.message).toBe("Too late.");
    await resolveCaper(caper.id, t, scriptedRng([5_000]));                               // finish whatever the race left
    expect(await txCount("caper_cut", Object.values(ids))).toBe(3);
    await expect(shareIntel(caper.id, ids.SAFECRACKER, t)).rejects.toThrow("Too late.");
  });

  it("a share at or after goEndsAt is refused and writes nothing", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    await expect(shareIntel(caper.id, ids.LOOKOUT, caper.goEndsAt)).rejects.toThrow("Too late.");
    expect((await row(caper.id, ids.LOOKOUT)).sharedIntel).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/caper-play.test.ts test/anticheat/caper-relay.race.test.ts`
Expected: FAIL: `shareIntel` is not exported.

- [ ] **Step 3: Implement `shareIntel`**

Per Interfaces. The refusal order is the one listed; no `catch` inside the transaction.

- [ ] **Step 4: Run them to verify they pass**

Run: `$VT test/crimeFamily/caper-play.test.ts test/anticheat/caper-relay.race.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/crimeFamily/caperPlayService.ts test/crimeFamily/caper-play.test.ts test/anticheat/caper-relay.race.test.ts
git commit -m "feat(crime-families): shareIntel, one CAS-guarded share per seat during GO (A18)"
```

---

### Task 6: The Share button: S14, the `cpr:share` route, the intel DM and the "(relayed)" mark on S15

**Files:**
- Modify:
  - `src/ui/crimeFamily/ids.ts:62-74`: `CPR_IDS.share: (caperId: string) => cfId("cpr", "share", caperId)` with the doc comment "S14's Share: the seat's held intel to the seat it answers (A18)".
  - `src/ui/crimeFamily/caperScreens.ts`:
    - `buildBrief` (`:221-248`): not dark → the header is a `SectionBuilder` (`text` + `setButtonAccessory`); dark → the same header text as a plain `TextDisplay` (S14 dark stays 6). Header text `` `### ${roleLabel(v.role)} brief\nYour intel for ${mention(v.tell.userId)}: **${v.tell.label}**` ``. Accessory: `v.shared` → `cfButton(CPR_IDS.share(v.caperId), "Shared", ButtonStyle.Success, { disabled: true })`, else `cfButton(CPR_IDS.share(v.caperId), "Share", ButtonStyle.Primary, { disabled: !v.canShare })`. The call text gains, right after the question line, `` `Intel from ${mention(v.call.fromUserId)}: **${v.relayed}**` `` when `v.relayed !== null`; the "-# If your contact goes dark…" line shows only when `lockedIndex`, `leaked` and `relayed` are all null, and reads `` `-# Press Share to send ${mention(v.tell.userId)} their intel. If your contact goes dark, the intel leaks ${rel(v.leakAt)}; press Refresh then.` `` when `v.canShare`, otherwise (already shared, the button reads "Shared") only `` `-# If your contact goes dark, the intel leaks ${rel(v.leakAt)}; press Refresh then.` ``.
    - `stepLine` (`:167-171`) appends `" (relayed)"` when `s.relayed`, before `" (leaked)"`.
    - The S11 "How a crew heist works" step 3 (`:78`) reads `` `3. GO lasts ${goSeconds} s: open your brief, press Share to pass on the intel you hold, and lock your own call.` ``; the S13 hint (`:153`) reads "-# Open your brief: press Share to pass on the intel you hold, then lock your own call. A seat that has not opened its brief by the leak goes dark and misses."
  - `src/services/dmNoticeService.ts`: `caperIntelNotice(v, row)` (8): `familyNotice("caper", "Intel arrived", …)` + the row; body `` `<@${v.sharerId}> shared your intel for the **${v.tierName}** crew heist. Open your brief.\nGO ends ${relTime(v.goEndsAt)}.` `` It never takes or prints a label.
  - `src/ui/crimeFamily/caperFlow.ts`: `sendIntelNudge` (top Interfaces block): `sendOptOutDm(client, nudge.userId, "caper_lobby", caperIntelNotice({ sharerId, tierName: nudge.tierName, goEndsAt: nudge.goEndsAt }, briefRow(caperId)))`.
  - `src/handlers/caperInteractionHandler.ts`: `share: shared("auto", shareRoute)`; `shareRoute` calls `shareIntel(caperId, i.user.id)`, `show(i, buildBrief(brief))`, then `if (nudge) await sendIntelNudge(i.client, caperId, i.user.id, nudge)`. No `assertCfOpen` (kill switch: Share keeps working, Global Constraints). The header comment lists Share with Brief and Refresh as presses that answer with a private screen.
  - `src/scripts/fixtures/caperScreens.ts`: "S14 brief (open)" and "S14 brief (locked)" become max **12**; add "S14 brief (shared, relayed, locked)" max 12 = `buildBrief(briefView({ shared: true, canShare: false, relayed: caperRole("DRIVER").labels[2], leaked: null, lockedIndex: 2 }))`; "S14 brief (dark)" stays 6; add "DM intel arrived" max 8 = `cfPayload(caperIntelNotice({ sharerId: CREW[4], tierName: caperTier(4).name, goEndsAt: SOON() }, briefRow(CAPER_ID)))`. The S15 fixture already marks every even seat relayed (Task 4).
- Test: `test/crimeFamily/caper-layout.test.ts`, `test/crimeFamily/cross-server.test.ts` (append), `test/anticheat/caper-relay.race.test.ts` (append), `test/crimeFamily/ids-post.test.ts` (the id list gains `CPR_IDS.share`)

**Interfaces:**
- Consumes: Task 5's `shareIntel`/`IntelNudge`; Task 4's `BriefView` and `CaperSeatView.relayed`; Task 2's `briefRow`; `sendOptOutDm`, `setNoticeTypeEnabled(discordId, type, enabled)` (`src/services/dmPrefsService.ts:72`); `countComponents`, `visibleText`.
- Produces: `CPR_IDS.share`, `caperIntelNotice`, `sendIntelNudge` (top Interfaces block); the `share` entry of `CAPER_ROUTES`.

- [ ] **Step 1: Write the failing tests**

Add to `caper-layout.test.ts` (fixtures by label from `caperWorstCases()`):

```ts
it("S14 open: the header Section's accessory is Share (cpr:share); shared is a disabled Shared; dark has no Share", () => {
  const open = byLabel("S14 brief (open)"), shared = byLabel("S14 brief (shared, relayed, locked)"), dark = byLabel("S14 brief (dark)");
  expect(countComponents(open)).toBe(12);
  expect(countComponents(shared)).toBe(12);
  expect(countComponents(dark)).toBe(6);
  const accessory = (p: CfPayload) => (p.components[0] as any).toJSON().components[0].accessory;
  expect(accessory(open)).toMatchObject({ custom_id: CPR_IDS.share(CAPER_ID), label: "Share", disabled: false });
  expect(accessory(shared)).toMatchObject({ label: "Shared", disabled: true });
  expect(JSON.stringify(dark)).not.toContain(CPR_IDS.share(CAPER_ID));
  expect(visibleText(shared)).toMatch(/Intel from <@\d+>: \*\*.+\*\*/);
  expect(visibleText(open)).toContain("Your intel for <@");
});

it("S15 marks a seat that locked on relayed intel '(relayed)'; the intel DM never carries a label", () => {
  expect(visibleText(byLabel("S15 result (T4 BUST, 6 seats)"))).toContain("(relayed)");
  expect(countComponents(byLabel("DM intel arrived"))).toBe(8);
  expect(visibleText(byLabel("DM intel arrived"))).toContain("shared your intel for the");
  for (const l of caperRole("DRIVER").labels) expect(visibleText(byLabel("DM intel arrived"))).not.toContain(l);
});
```

(`byLabel(l)` is `caperWorstCases().find((c) => c.label === l)!.payload`; `CAPER_ID` is the fixture's `"65f0000000000000000000aa"`. After plan 4's F15 a payload component may already be plain JSON: read `.toJSON?.() ?? c`.)

Append to `cross-server.test.ts` (imports gain `CRIME_FAMILY_CONFIG` from `src/utils/economyConfig`; the edge-1 case waits out the 2 s render debounce, so it carries a 10 s timeout like `caper-flow.test.ts:116`):

```ts
describe("the intel relay through Discord (amendment 5.3, 5.8)", () => {
  it("a crew in three places with no shared chat locks every call right through Share (edge 1)", () => open(async () => {
    const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
    const f = await caperCrew({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await postCaperCard(fc.client, c.id, CH);
    await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: "g2", messageId: "s25", client: fc.client }));
    await press(fakeSelect(CPR_IDS.join(c.id), ["SAFECRACKER"], { userId: f.ids.SAFECRACKER, guildId: null, messageId: "dm", client: fc.client }));
    await runStart(fc.client, c.id, { kind: "press", uid: f.ids.MASTERMIND });
    const where = { [f.ids.MASTERMIND]: G, [f.ids.LOOKOUT]: "g2", [f.ids.SAFECRACKER]: null } as Record<string, string | null>;
    for (const uid of Object.values(f.ids)) await press(fakeButton(CPR_IDS.brief(c.id), { userId: uid, guildId: where[uid], client: fc.client }));
    // the second join's trailing S13 render (debounce.ts) must land before the snapshot, as caper-flow.test.ts:114 waits for it
    await new Promise((r) => setTimeout(r, CRIME_FAMILY_CONFIG.caperRenderDebounceSeconds * 1000 + 100));
    const dmsBefore = new Map(fc.dms), sends = fc.sent.length, edits = fc.edits.length;
    for (const uid of Object.values(f.ids)) await press(fakeButton(CPR_IDS.share(c.id), { userId: uid, guildId: where[uid], ephemeralSource: true, client: fc.client }));
    for (const uid of Object.values(f.ids)) expect(fc.dms.get(uid)).toBe((dmsBefore.get(uid) ?? 0) + 1);   // one intel DM each
    expect([fc.sent.length, fc.edits.length]).toEqual([sends, edits]);                 // the relay posts and edits nothing in any channel
    for (const uid of Object.values(f.ids)) {
      const b = await openBrief(c.id, uid);
      expect(b.relayed).not.toBeNull();
      await press(fakeButton(CPR_IDS.act(c.id, b.call.options.indexOf(b.relayed!)), { userId: uid, guildId: where[uid], ephemeralSource: true, client: fc.client }));
    }
    const answers = parseAnswers((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).answers)!;
    const rows = await testPrisma.caperCrew.findMany({ where: { caperId: c.id } });
    expect(rows.every((r) => r.relayed && r.choice === answers.seats[r.role as CaperRoleKey]!.correct)).toBe(true);
  }), 10_000);

  it("Share from the wrong state is refused with no row change and no DM (Review Focus 3)", () => open(async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], picks: { MASTERMIND: "none" }, dark: ["SAFECRACKER"] });
    const fc = fakeCaperClient();
    const share = (uid: string) => press(fakeButton(CPR_IDS.share(caper.id), { userId: uid, guildId: null, ephemeralSource: true, client: fc.client }));
    expect(said(await share("outsider"))).toContain("You are not in this crew heist.");
    expect(said(await share(ids.SAFECRACKER))).toContain("Open your brief first.");
    await share(ids.LOOKOUT);
    expect(said(await share(ids.LOOKOUT))).toContain("Already shared.");
    await testPrisma.caper.update({ where: { id: caper.id }, data: { status: "RESOLVED" } });
    expect(said(await share(ids.MASTERMIND))).toContain("Too late.");
    expect(await testPrisma.caperCrew.count({ where: { caperId: caper.id, sharedIntel: true } })).toBe(1);
    expect([...fc.dms.values()].reduce((a, b) => a + b, 0)).toBe(1);                  // only the Lookout's one share nudged
  }));
});
```

(Imports gain `openBrief`, `parseAnswers`, `CaperRoleKey`, `seedRunning`.)

Append to `caper-relay.race.test.ts`:

```ts
describe("the nudge DM (A18)", () => {
  it("two concurrent Share presses send one nudge; with the caper_lobby toggle off the share records and no DM goes", async () => {
    const a = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    const fc = fakeCaperClient();
    const press = (uid: string, caperId: string) => handleCrimeFamilyInteraction(fakeButton(CPR_IDS.share(caperId), { userId: uid, guildId: null, ephemeralSource: true, client: fc.client }) as any);
    await Promise.all([press(a.ids.LOOKOUT, a.caper.id), press(a.ids.LOOKOUT, a.caper.id)]);
    expect(fc.dms.get(a.ids.MASTERMIND)).toBe(1);
    const b = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    await setNoticeTypeEnabled(b.ids.MASTERMIND, "caper_lobby", false);
    await press(b.ids.LOOKOUT, b.caper.id);
    expect(fc.dms.get(b.ids.MASTERMIND) ?? 0).toBe(0);
    expect((await row(b.caper.id, b.ids.LOOKOUT)).sharedIntel).toBe(true);
  });
});
```

(Imports gain `handleCrimeFamilyInteraction`, `CPR_IDS`, `fakeButton`, `fakeCaperClient`, `setNoticeTypeEnabled`. No `withCfConfig`: the router (`src/handlers/crimeFamilyRouter.ts`) never reads `enabled`, and Share is not gated, so it works with Crime Families switched off, which this case also proves.)

- [ ] **Step 2: Run them to verify they fail**

Run: `$VT test/crimeFamily/caper-layout.test.ts test/crimeFamily/cross-server.test.ts test/anticheat/caper-relay.race.test.ts test/crimeFamily/ids-post.test.ts`
Expected: FAIL: `CPR_IDS.share` is undefined; the S14 fixtures count 10; `cpr:share` reads "This button is no longer active."

- [ ] **Step 3: Implement the id, the screens, the DM, the nudge sender and the route**

Per Files and Interfaces.

- [ ] **Step 4: Run the suites and the payload audit**

Run: `$VT test/crimeFamily test/anticheat test/dm && npm run typecheck && DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: PASS; "All payloads within Discord limits".

- [ ] **Step 5: Commit**

```bash
git add src/ui/crimeFamily/ids.ts src/ui/crimeFamily/caperScreens.ts src/services/dmNoticeService.ts src/ui/crimeFamily/caperFlow.ts src/handlers/caperInteractionHandler.ts src/scripts/fixtures/caperScreens.ts test
git commit -m "feat(crime-families): Share on the brief relays held intel to its seat, with a nudge DM and a (relayed) mark (A18)"
```

---

### Task 7: Help, tutorial, website and economy docs for global play and the intel relay

**Files:**
- Modify: `src/commands/general/help.ts:318-338` (the `heist` and `turf` entries after plan 4's rename), `src/commands/general/tutorial.ts:175-180`, `dashboard/src/content/modules/crime-families.ts`, `dashboard/src/content/commands.ts:77-78`, `:274-294` and the `turf` entry, `dashboard/src/app/changelog/page.tsx:50-134` (v2.2 Turf) and `:143-157` (v2.1), `FORTUNA_V2_ECONOMY.md:272`, `:352`
- Test: `test/general/help-crime-families.test.ts`

**Interfaces:**
- Consumes: catalog and config values only (`CRIME_FAMILY_CONFIG.goSeconds` 120, `leakAtSecondsLeft` 30, `lobbyDmsPer24h` 3, `lobbyDmQuietAfterCancelSeconds` 7,200), and the copy of Tasks 2, 3 and 6. The house docs rule holds: exhaustive, exact numbers from source, full tables, a strategy section.
- Produces: copy only. Plan 4 already renamed every string to "Crew Heist"; this task re-finds each passage by its text (the line numbers above are pre-plan-4) and must not describe leagues or cities (plan 6).

- [ ] **Step 1: Write the failing test**

Add to `help-crime-families.test.ts`: the `heist` help entry's description contains "from any server" and its `brief` subcommand line contains "Share"; the `turf` entry's `war` line contains "from any server"; the tutorial lesson's `howToUse` contains "`{p}heist brief` — open your brief and Share the intel you hold" and its `howItWorks` contains "work from any server".

- [ ] **Step 2: Run it to verify it fails**

Run: `$VT test/general/help-crime-families.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the docs**

- `help.ts`: `heist` description "Plan or join a crew heist from any server: a 10-minute lobby and a 120-second GO where the crew shares intel."; subcommands `join <role> — take a seat, from any server`, `brief — open your brief during GO (Share sends the intel you hold to the seat that needs it)`; `turf` subcommand `war — your war card with Scout and Hit, from any server`.
- `tutorial.ts`: `howItWorks` appends "Crew heists and turf wars work from any server, and their DMs carry the buttons."; the `{p}heist brief` line becomes "`{p}heist brief` — open your brief and Share the intel you hold".
- `crime-families.ts`, section by section:
  - "What a family is" (`:26-32`): add "Crew heists and turf wars work from any server the bot shares with you, and from the bot's DMs."
  - The crew heist intro (`:254-283`): drop "in one server"; the GO paragraph says each brief shows a crewmate's answer, and the crew passes it with the **Share** button or in chat.
  - "The intel ring and the leak" (`:305-324`): the brief line is now "Your intel for @previous: <answer>"; a new paragraph and table "Sharing intel": Share sits on your brief; only the seat holding the intel can press it, after opening the brief and while not dark, during the 120 s; once per seat per crew heist; the answer appears only in the brief of the seat it answers ("Intel from @next: <answer>" on its next open or Refresh), never on the card, in a channel or in a DM; that seat gets an "Intel arrived" DM with Open brief (no answer in it; skipped once it has locked or gone dark; off with the "Crew heist lobby" DM toggle); a seat that locked after its intel was shared shows "(relayed)" on the result card. Then the edge list from amendment §5.8 rows 1–7 and 9 in plain words (a crew of six in six servers can play a perfect run; a share at the last second is the recipient's miss if they never refresh; DMs off means Refresh still shows it; a role taken while you read the DM says "Role just taken." and charges nothing).
  - "A crew heist, step by step" (`:326-350`): the plan step keeps the home-channel fallback; the lobby step says members "in any server" get the DM with a **Join as…** select (3 a day, none for 2 hours after a cancel), joining works from the card, the DM, or `!heist join <role>` in any server, and away from the card you get a personal card with a link back; `!heist` in another server shows the lobby card with **Join as…**; the GO step says the GO DM carries Open brief; the seat-gate table row 1 (`:340`) becomes "In this family for 72 hours or more (no Associates)".
  - "Expected value: a strong crew" (`:444-458`): "calls its intel clearly in the channel" becomes "shares every intel line (Share or chat)".
  - "Getting better at crew heists" (`:477-486`): replace "Say your intel to the right person…" with "Press Share the moment your brief opens: it reaches exactly the seat that needs it, wherever they are. Then wait for your own intel (Refresh) before you lock; a blind lock is right 1 time in 4." and add "A seat that never shares costs its partner a 75% miss chance: in a crew of strangers, Share is the whole game."
  - "The Turf War" (`:565-598`): the war-soon DM carries Scout and the three Hit buttons; "Who can fight" drops "acting in their family's home server"; "`!turf war` shows your war card with the buttons from any server". "Getting better at turf wars" (`:637-646`): "Call weak points in the home channel" becomes "Call weak points where your crew talks (the home channel, or any shared chat)", and add "Scout and Hit work from the war-soon DM, so members outside the home server can fight; there is no bot relay for scout calls."
  - "Crew heist caps and cooldowns" table (`:404-421`): add a row "Intel DMs: 1 per seat per crew heist (only when a crewmate shares)".
- `commands.ts`: in the settings "Account notices" value (`:78`), plan 4's "crew heist lobby" becomes "crew heist lobby calls and intel" (the rest, including plan 4 Task 16's "family applications", stays); the `heist` entry's `short` says "…from any server…" and its `keyNumbers` gain "Works from: any server or the bot's DMs" and "Share: once per seat per crew heist"; the `turf` entry gains "War actions: from any server or the war-soon DM".
- Changelog: the v2.1 entry plan 4 rewrote (`page.tsx:143-157`) gains a feature item "Crew heists work from any server and from the bot's DMs; the Share button passes intel to crewmates anywhere."; the v2.2 Turf entry (`page.tsx:50-134`, which plan 6 rewrites for leagues and keeps this item) gains "Turf war actions (Scout and Hit) work from any server and from the war-soon DM."
- `FORTUNA_V2_ECONOMY.md`: the Crew Heists paragraph (`:272`) gains "Seats join, brief and act from any server or a DM. A seat that has opened its brief and is not dark may Share once (`CaperCrew.sharedIntel`, CAS): its held answer appears only in the brief of the seat it answers; no money, XP or heat moves and no outcome rule changes." The War paragraph (`:352`) says "Fighters: members of either side, from any server or a DM, passing the `war` gate"; no table changes (the relay is not a source or sink).

- [ ] **Step 4: Run the test and type-check the dashboard**

Run: `$VT test/general/help-crime-families.test.ts test/crimeFamily/rename-copy.test.ts && (cd dashboard && npx tsc --noEmit -p .)`
Expected: PASS; no type errors; `grep -n "in this server\|lobby's server\|home server" dashboard/src/content/modules/crime-families.ts` prints only the lobby-channel fallback sentence ("…home channel when it is in the same server…").

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/help.ts src/commands/general/tutorial.ts dashboard/src/content/modules/crime-families.ts dashboard/src/content/commands.ts dashboard/src/app/changelog/page.tsx FORTUNA_V2_ECONOMY.md test/general/help-crime-families.test.ts
git commit -m "docs(crime-families): crew heists and turf wars from any server, and the Share intel relay"
```

---

### Task 8: Full verification and the owner hand-off

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `$VT`
Expected: every file passes (start the Redis container first; never two vitest runs at once).

- [ ] **Step 2: Static checks**

Run: `npx prisma validate && npm run typecheck && npm run validate:slash && npm run validate:app-emojis && npm run gen:pixel-assets -- --set cf --check`
Expected: schema valid; no type errors; 73/100 slash commands (`/heist`, no `/caper`); app emojis validate without contacting Discord; the cf pixel set is up to date.

- [ ] **Step 3: Payload audit, tracked-file hygiene and the guild-lock sweep**

Run: `DATABASE_URL=mongodb://127.0.0.1:9/never REDIS_URL=redis://127.0.0.1:6381 npx ts-node --transpile-only src/scripts/checkV2Payloads.ts && git diff --exit-code src/data/emojis.json src/utils/shopCatalog.ts src/services/shopItemEffects.ts && (grep -rn "isTester" src/services/crimeFamily || echo "no isTester") && (grep -rn "expectedGuildId\|guildPhrase\|members.fetch\|guilds.cache" src/services/crimeFamily src/ui/crimeFamily src/handlers src/commands/economy/{crew,caper,turf}.ts || true)`
Expected: "All payloads within Discord limits"; the three files unchanged; "no isTester"; the last grep prints only the trade-log `guilds.cache` line in `resolveAndAnnounce` (`src/ui/crimeFamily/caperFlow.ts`).

- [ ] **Step 4: Commit any fix-ups, then report the hand-off to the owner**

The hand-off goes in the final message, not in a file. It states:
- Deploy with `workflow_dispatch` and `run_schema: true`: `prisma/` changed in Task 4 (three `CaperCrew` fields with defaults). `CaperCrew` holds no documents, so no `--accept-data-loss`.
- Flags unchanged. With `enabled: true`, DM presses work for every member (A20); `allowGuildIds` still limits every command and every server-side press (`!crew`, `!turf` incl. `!turf war`, `!heist join`, a Join as… press on an S25 card in a server not on the list); presses from the bot's DMs (lobby Join as…, Open brief, Share, war-soon Scout/Hit) follow `enabled` alone (A20).
- Behaviour change to announce: a member no longer needs to be in the lobby's server; lobby DMs reach every qualified member (still 3 a day), and the brief has a Share button.
- The trade log of a big crew heist still posts only when the lobby's guild is in this process's cache (amendment §7.7, unchanged).
- Plan 6 (leagues) keeps `warActionRow`, `turfWarSoonNotice(v, row)`, the guild-free `scoutWar`/`armHit` and `GateDef` without `guild` exactly as this plan leaves them (its "Interfaces consumed" block).

---

## Self-review notes (for the executor)

- **Spec coverage (amendment sections → tasks):**
  - §5.2 no guild locks (`GateDef.guild`, `EligibilityOpts`, `seatGates`, `warActor`, `!turf war`) → Task 1; A20 → Task 1 (G1 keeps create and plan server-bound); personal cards (`!heist` elsewhere, subactions anywhere, off-card join edit) → Task 2; lobby DMs regardless of guild → Task 3; GO DM Open brief → Task 3; war actions from any server and DMs, war-soon DM row → Tasks 1, 3.
  - §5.3 relay: data and `briefFor` → Task 4; the CAS and its races → Task 5; S14 Share, nudge DM, "(relayed)" → Task 6.
  - §5.4 S1 → Task 2 (G12); S14 open/dark → Task 6; S25 lobby → Task 2; S25 seated/war unchanged.
  - §5.5 DMs → Task 3 (lobby, GO, war-soon), Task 6 (intel). §5.6 `cpr:share` → Task 6. §5.7 no Redis → Global Constraints.
  - §5.8 edges: 1 → Task 6 (three places, no shared chat); 2, 3 → unchanged lock/settle rules, covered by `caper-play` and the settle race; 4 → Task 5; 5 → Task 6 (toggle off, share still recorded); 6 → the existing `Role just taken.` unique-index path, reached from the DM select (Task 3 DM join test uses it unchanged); 7 → Task 3; 8 → Task 1 (the removed refusal); 9 → Task 1 (hit from a DM).
  - §5.9 tests → `intel-relay` (Task 4), `caper-relay.race` (Tasks 5, 6), `cross-server` (Tasks 2, 3, 6), the removed guild assertions (Task 1).
  - §12 docs rows for §5 → Task 7. §11.3 fixture counts for S1, S14, S25 lobby and the four DMs → Tasks 2, 3, 6.
- **Deliberately not built here:** the vote, recruitment, sizes, Capos, sharding seams, process boots and the rename (plan 4); leagues, cities, per-league income and census steps 3–5 (plan 6); a war intel relay (A21 says none); `logToChannel` via REST (amendment §7.7).
- **Cross-task names:** `assertCfOpen`/`assertServerOpen`/`NOT_OPEN_HERE` (1 → 2); `FakeOpts.guildId: string | null` (1 → 2, 3, 6) and `messageId` (2 → 3, 6); `joinSelectRow`/`briefRow` (2 → 3, 6); `buildPersonalCaperCard` (2 → 3's DM join edit); `warActionRow` (3 → plan 6); `fakeCaperClient().lastDm` (3 → 6); `BriefView.relayed/canShare/shared`, `CaperSeatView.relayed`, `seedRunning({ shared })` (4 → 5, 6); `shareIntel`/`IntelNudge` (5 → 6); `CPR_IDS.share`, `caperIntelNotice`, `sendIntelNudge` (6).
- **Plan 1–4 tests this plan edits:** `catalog`, `war-math`, `eligibility`, `caper-handlers`, `turf-handlers`, `turf-command`, `handlers` and `caper-join.race` (Task 1); `caper-command`, `caper-handlers`, `caper-layout` (Task 2); `caper-flow`, `caper-command`, `family-redis-down`, `family-notice`, `rename-copy`, `turf-layout` (Task 3); `intel-ring`, `caper-play` (Task 4); `caper-play` (Task 5); `caper-layout`, `ids-post` (Task 6); `help-crime-families` (Task 7).
