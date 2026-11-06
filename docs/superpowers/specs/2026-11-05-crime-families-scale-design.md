# Crime Families at Scale: Amendment PRD

- **Date:** 2026-11-05
- **Status:** The eight changes in section 0 are owner decisions (approved 2026-11-05) and their numbers are fixed. Every other row of the Decisions table is an author decision the owner can overrule before build. **A37 needs explicit owner sign-off before Plan 5**: it narrows the owner's "the existing name rules filter" for free text (section 8.6).
- **Amends:** `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md` (the "old spec"). Where the two differ, this document wins. Rules this document does not mention are unchanged and are not repeated here.
- **Repo:** `/home/ujjwal/dev/Casino-`. File citations are `path:line` against `main` at commit `1badb42`. The code is the truth where it differs from the old spec.
- **Deployment state:** nothing in Crime Families is deployed. No player data exists in the new collections, so every schema and rule change below needs no data migration.
- **Hard constraints carried over:** `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` never change; `src/data/emojis.json` stays `{}`; no emoji upload; no new art (only the 24 `cf_` icons in `CF_ASSETS` and the 10 files in `CF_ART`); ComponentsV2 only, 40 components per message, and every new or changed screen gets a worst-case entry in `src/scripts/fixtures/{crimeFamilyScreens,caperScreens,turfScreens}.ts` (read by `src/scripts/checkV2Payloads.ts:139-140`); slash commands stay at 73 of 100; a slash option holds at most 25 choices; every money move stays in `runFamilyTx` with CAS and unique-index backstops and gets a race test in `test/anticheat/`; nullable Mongo filters need `isSet:false OR null`; every DM goes through `dmNoticeService`/`dmPrefsService`; no tester bypass on family state.

Conventions:
- **Player copy says "Crew Heist"** (the feature) and "crew heist(s)" (in sentences). Internal names keep "caper": the `Caper`/`CaperCrew` models, `cpr:` customIds, `caper*` files and functions, Redis keys, ledger and transaction types (`caper_cut`, `caper_stake`), DM pref keys (`caper`, `caper_lobby`) and the art keys (`cf_caper`, `caper_t1..4`). This document uses "heist" for the player-facing thing and "caper" when it names code.
- Every number lives in `CRIME_FAMILY_CONFIG` (`src/utils/economyConfig.ts:200-268`) or `src/data/crimeFamilyCatalog.ts`; section 11 lists every new or changed key.
- Screen numbers continue the old spec: S1–S28 keep their meaning; S29–S35 are new. Decision ids are `A1…` so they never collide with the old `D1…D67`.

---

## 0. Summary

1. **Bigger families.** Member caps by level are 10, 12, 14, 16, 18, 20, 23, 25, 28, 30. A family may start `max(4, ceil(members / 3))` crew heists per rolling 24 h (4 to 10), which keeps exactly 2 seats per member at a full 6-seat crew. Per-player caps (2 started seats per rolling 24 h) do not change, so per-player income cannot rise.
2. **Capos scale with size.** `max(1, floor(members / 5))` Capos (1 to 6, slots `CAPO1..CAPO6`). Promotion into an officer rank needs 10,000,000 uncached net worth at that moment. Nobody is ever auto-demoted; only new promotions wait.
3. **No-confidence vote.** An Underboss or Capo can open a 48-hour secret ballot against an active Boss. It passes with YES from at least two thirds of the eligible voters (members other than the Boss with 72 h of tenure when it opened, re-checked against membership at close). The Underboss takes the chair, else the old heir order.
4. **Crew heists and war actions work from any server.** The lobby card still posts where it was planned; members anywhere join, brief and act through commands, their DMs or a personal card. A bot-side **intel relay** (a Share button on each brief) keeps the GO ring a cooperative puzzle when the crew has no shared chat.
5. **Turf leagues.** Bronze (L1–3), Silver (L4–6) and Gold (L7–10) each have their own cities of the 10 rackets, `max(1, ceil(active families / 40))` cities per league. Racket income is set per league so a family's racket income never exceeds what the old spec allowed at its level, and bot-wide racket income grows with active families instead of being split ever thinner.
6. **Sharding-ready.** Every Crime Families job runs only on the process that hosts shard 0 (or the unsharded process). Every channel post and edit goes through one REST seam that never needs the guild in cache. A heist's restart VOID reads process boots from Mongo instead of `process.uptime()`.
7. **Recruitment board.** Families can list themselves with a pitch and stat requirements. Players browse, see their own stats against each requirement, and apply with a short message; officers accept or decline, and acceptance runs the same join path as an invite.
8. **Rename.** Every player-visible "Caper" becomes "Crew Heist". The command is `!heist` and `/heist` (the old `/caper` is renamed, so slash stays at 73); `crewheist`, `caper` and `capers` are aliases.
9. **Economy.** Per-account worst case is unchanged at 1,185,314 per day (14.8% of the Month 2+ floor), now proven for a 30-account family; per-player realistic income is equal or lower in every band (section 10).
10. **Rollout.** Same flags (`enabled`, `turfEnabled`) and stages. Stage C now opens one city per league. Three plans: Plan 4 (rename first, then the scale foundation), Plan 5 (vote and recruitment), Plan 6 (leagues).

### Decisions

| # | Decision | Who | Why |
|---|---|---|---|
| A1 | Member caps L1..L10 = 10, 12, 14, 16, 18, 20, 23, 25, 28, 30; family heist cap per rolling 24 h = `max(4, ceil(members / 3))`; per-player caps unchanged | Owner | A global bot needs families of 10–30 so players can find roles and crews. |
| A2 | Capo cap = `max(1, floor(members / 5))`; slots CAPO1..CAPO6; promotion to Capo needs uncached net worth ≥ 10,000,000; grandfathering, no auto-demotion; Underboss stays 1 | Owner | More players want officer roles; the net-worth bar keeps officer seats for committed accounts. |
| A3 | No-confidence vote: started by the Underboss or a Capo; voters = members other than the Boss with tenure ≥ 72 h; passes at YES ≥ 2/3 of eligible voters at close; 48 h; Underboss takes the chair, else the heir order; one open vote; 7-day cooldown after a failed vote; no vote in a Boss's first 7 days | Owner | Big families need a way to replace an active but bad Boss. Handover, the 7-day claim and 14-day succession stay. |
| A4 | Heists and war actions across servers, with a bot-side GO intel relay | Owner | Families are global; the guild lock (D48) splits real crews. |
| A5 | Turf leagues Bronze L1–3 / Silver L4–6 / Gold L7–10; cities per league = `max(1, ceil(active families / 40))` | Owner | 10 global rackets cannot serve thousands of families. |
| A6 | Every family job on exactly one shard; channel posts and edits work from that shard via REST | Owner | Discord forces sharding at 2,500 guilds; doubled posts and DMs must not happen. |
| A7 | Recruitment board: listing, requirements from tracked stats, apply modal, officer inbox; limits 3 pending per applicant, 72 h expiry, 25 pending per family, 7-day reapply wait after a decline | Owner | Recruiting in chat does not scale across servers; replaces D67 ("no apply flow in v1"). |
| A8 | Player-facing "Caper" becomes "Crew Heist"; `!heist`/`/heist` (renamed, not added); aliases `crewheist`, `caper`, `capers`; internal names unchanged; Plan 4 Task 1 | Owner | "Crew Heist" says what it is. Supersedes the naming half of D7 and Q2. |
| A9 | The heist cap, Capo cap and investigation threshold read a denormalized `Family.memberCount`, written in the same transaction as every member row create or delete | Author | One indexed field instead of a count per check; the recruitment board sorts on it too. |
| A10 | The 10,000,000 gate applies to promotion into Underboss as well as Capo | Author | The Underboss starts votes and is the first heir; the bar's purpose applies more strongly there. |
| A11 | Rolling 7-day joins per family = `max(5, ceil(memberCap / 3))` (5 → 10); the inviter cap (3 per 7 days) and the 5-pending-invites cap are unchanged | Author | 5 joins a week would take 6 weeks to fill a 30-member family; more officers already widen the per-inviter cap. |
| A12 | "Under investigation" needs `max(3, ceil(members / 4))` members at heat ≥ 100 (was a flat 3) | Author | 3 of 30 members (10%) would freeze a family that 3 of 12 (25%) did not; the ratio is kept. |
| A13 | Dues (40,000 × level), the payday cap (1,000,000 gross per member per week), the 500,000 payday minimum, the 3-member racket floor, the pair rule (2 members) and the lobby-DM cap (3 a day) are unchanged | Author | Each is per member or per family, not per 12; surplus earnings cannot reach a wallet except through the capped payday (section 10.4). |
| A14 | Payday becomes two-phase: one family transaction reserves earnings and writes a `PaydayShare` row per member; each share is credited in its own CAS transaction; the minute sweeper resumes unpaid shares | Author | A single transaction writing 30 wallets conflicts with any of 30 active players' wallet writes (old 7.3 already needed 5 attempts for 12). |
| A15 | S2 shows a grouped roster (one line per rank); S5 pages 15 members; S6 and S7 cap or group their member lines | Author | 30 roster lines with icons exceed safe text size; a select holds at most 25 options. |
| A16 | Ballots are secret: cards and DMs show only "x of N voted" and final totals; the starter is named and votes YES automatically; ballots can change until close; at least 3 eligible voters to open and at close | Author | Secrecy stops retaliation after a failed vote; a named starter stops frivolous votes; the minimum stops a 1-member coup in a 2-member family. |
| A17 | While a vote is open: no kicks, no promotions or demotions, no disband, no handover; a claim or automatic succession voids the vote; the vote closes only at 48 h | Author | Without the freeze a Boss could kick YES voters, promote a loyal Underboss, disband the vault or pass the chair to a loyalist to escape. |
| A18 | Intel relay: each brief gets a Share button that delivers the intel the seat holds to the one seat that needs it, visible only in that seat's own brief; one share per seat; the nudge DM carries no answer | Author | Sharing stays a deliberate act by every seat inside the 120 s; one player still cannot answer for others (anti-goal 4). |
| A19 | DMs are the cross-server personal card: the lobby DM carries a "Join as…" select, the GO and relay DMs carry Open brief, the war-soon DM carries Scout and Hit, the vote DM carries Yes and No | Author | A member in another server has no shared channel; DMs reach every shard (Discord routes DM interactions to shard 0). |
| A20 | A press from a DM counts as open when `CRIME_FAMILY_CONFIG.enabled` is true; `allowGuildIds` only limits servers | Author | `isCrimeFamilyOpen(null)` is false today (`src/utils/economyConfig.ts:271-274`), which would refuse every DM button. Every DM action still needs a family membership that began in an allowed server. |
| A21 | No war intel relay; war scouting stays self-serve and chat-shared | Author | A member anywhere can scout and then hit the block they scouted; a relay would add a model for an optimisation. |
| A22 | "Active family" = at least 3 current members each with ≥ 2 started heist seats in this family or ≥ 3 correct war hits for this family in the last 7 days, not banned; counted by a daily census into `Family.activeMembers` | Author | Every counted member burned stakes after passing seat gates; family-scoped counts stop a hopper carrying activity between families. Opening one extra city needs 40 such families (400,000,000 in creation fees alone). |
| A23 | A family plays in exactly one city of its league (its `cityId`), placed only at the daily census (a league-changing level-up waits for the next census like any unplaced family); every census rebalances movable families across the league's OPEN cities (A43); it may only bid in its own city | Author | One city per family keeps "a family's wars never overlap" true (`src/services/crimeFamily/turfQueries.ts:107-111`). |
| A24 | A level-up that changes league is refused while the family has live turf (top bid, or a side in an ARMED, ACTIVE or SETTLING war); otherwise its rackets go to the Street and it is re-placed in the new league at the next census | Author | Rackets are city assets; carrying a Bronze racket into Silver would break both leagues' income bounds. S8 warns first. |
| A25 | Per-league racket income: Bronze 100k/200k/300k, Silver 200k/450k/850k, Gold 300k/650k/1.3M (Corner/District/Crown); the class level gates (District L4, Crown L7) are retired because the league is the gate; racket cap by level and the 1-Crown cap stay | Author | Each league's best holding equals the old best holding at the same levels: 300k (L1–3), 1.3M (L4–6), 2.6M (L7–10). |
| A26 | City names: Low Town (Bronze), Midtown (Silver), Uptown (Gold), numbered "#n"; league icons reuse the crest icons | Author | No new art; crest tiers already map onto leagues. |
| A27 | A city closes only after 14 consecutive censuses as its league's surplus, as the highest-numbered OPEN city, with no owned racket and no live war; closed cities reopen lowest-first before a new one is created | Author | "Cities never close while rackets are owned", and a shrinking league does not leave a ghost map. |
| A28 | Every Crime Families channel post and edit always goes through REST (`client.rest`), never through `client.channels.fetch` | Author | One path to test. `channels.fetch` returns null for a guild another shard holds (`node_modules/discord.js/src/managers/ChannelManager.js:124-132`, `src/util/Channels.js:43-45`), which today reads as a dead board. |
| A29 | `isJobShard(client)` = unsharded, or this process hosts shard 0; jobs and seeding register only there | Author | Shard 0 always exists and also receives every DM interaction. |
| A30 | A heist with an unlocked seat is VOID when any bot process booted after its Start, read from a new `BotProcessBoot` collection | Author | Under sharding the sweeper's own boot time (`src/services/crimeFamily/caperSettleService.ts:32-34`, `:71`) misses a restart of the shard that served the crew. |
| A31 | Recruitment surface: three new `/crew` choices (`board`, `recruit`, `vote`), 24 of 25; no new slash command | Author | Slash stays at 73 and `/crew` keeps one free choice. |
| A32 | The listing (toggle, pitch, requirements) is edited by the Boss or Underboss; the applications inbox is open to Capo and above | Author | The listing is the family's public face; reviewing matches who may invite. |
| A33 | Requirements: minimum net worth, minimum lifetime shifts, minimum Fortuna account age (days), minimum lifetime crew heists; checked uncached at apply; shown live (display cache) in the inbox | Author | All four are tracked already and none needs a new `User` field. |
| A34 | Applications are `FamilyInvite` rows with `kind: "APPLICATION"`; the invite accept body becomes one shared `joinFamilyInTx` | Author | Reuses the pair unique index, the expiry sweeper, the join caps and every join gate (DRY). |
| A35 | The 3-pending-applications cap is serialized by touching the applicant's `User` document in the apply transaction | Author | Two applies to different families write different family documents and would not conflict otherwise. |
| A36 | Officers get one digest DM per family per 6 h at most (Mongo CAS on `Family.appDigestAt`), under a new opt-out DM type `recruit` ("Family applications") | Author | 25 pending applications must not become 25 DMs to 8 officers. |
| A37 | The pitch and the application message use one validator: length, no mentions, links or invites, the name slur list matched per word (each whitespace-separated word folded on its own, runs of single-character words joined), and the impersonation words of the name denylist as whole words. **Needs owner sign-off** (it changes the owner's "existing name rules filter") | Author | The name fold over a whole sentence joins words and invents slurs ("be a nerd" → "beanerd", "go ok" → "gook"); the full denylist as substrings would refuse "where", "there" and "street"; the mention forms it guards are refused directly. |
| A38 | The banners keep their "FORTUNA'S CAPERS" placard | Author | No new art is allowed; the placard reads as flavour on an image, not as a command name. |
| A39 | Three plans: 4 (rename, sizes, Capos, cross-server and relay, sharding seams, two-phase payday), 5 (vote, recruitment), 6 (leagues) | Author | Each plan ships behind the existing flags and has one schema commit. |
| A40 | The Boss's 7-day vote grace counts from `FamilyMember.firstBossAt`, the member's first time in this family's chair, set once and never rewritten by a later chair move | Author | A grace reset by every chair move lets a Boss and one loyalist (or an alt) swap the chair weekly and never face a vote. Each member gets the 7 days once. |
| A41 | A member demoted out of Underboss or Capo keeps `start_vote` for 7 days (`FamilyMember.officerUntil`) | Author | Otherwise a Boss who sees a revolt coming demotes every officer before a vote exists and nobody can ever start one. |
| A42 | The start and the result of a vote are announced by whoever wins a CAS on `FamilyVote.announced` / `resultAnnounced`; `sweepVotes` picks up any vote whose announcement is overdue | Author | A crash between the start commit and the post would leave a silent vote that fails for lack of ballots and costs the family its 7-day cooldown. |
| A43 | Every census rebalances each league: families with no turf at stake move from the fullest OPEN city to the emptiest until every city is within ±2 of the league average | Author | A new city filled only by new arrivals would hand them a near-empty map; a family could time its league-changing level-up to land there. |
| A44 | A withdrawn or expired application blocks a new one to the same family for 24 h (`reapplyAfterWithdrawSeconds` 86,400) | Author | Withdrawing before a decline would dodge the owner's 7-day block and let one player cycle messages into an inbox. |
| A45 | Demoting an Underboss skips the Capo cap (it is not a promotion); with all six Capo slots held it lands on Soldier | Author | `slotFor` would otherwise throw "Capo seats are full" and the Underboss could only be kicked. |
| A46 | A VOID vote for "fewer than 3 eligible at close" or "no heir" sets the same 7-day cooldown as a failed vote; only a VOID by claim or succession sets none | Author | Otherwise a starter has an ally leave before close and re-opens at once, freezing kicks, ranks and disband 48 h at a time. |

---

## 1. Section map

| Old spec section | Status | Replaced by |
|---|---|---|
| 0 Summary items 1, 2, 4, 6; D7 (naming), D18 (family half), D23, D25 (class levels), D48, D55 (caper half), D58 (GO DM), D67 | superseded | A1–A46 |
| 2 Non-goals ("crews talk in the guild where they play") | superseded | §5 |
| 3 Constraint rows "PM2 single fork…no leader lock" and "Slash usage" | amended | §7, §9 |
| 6.3 Roles table, Capo max 3 | amended | §3, §4.3, §8.4 |
| 6.4 Join caps, accept steps, kick and disband blocks | amended | §2.2, §4.4, §8.5 |
| 6.5 Size cap table and the guild-local bullets | superseded | §2.2, §5 |
| 6.7 Succession | amended (third path added) | §4 |
| 7.3 Payday flow step 3 and attempt count | superseded | §2.4 |
| 8.4 steps 1–3 (guild gate, lobby DM recipients), 5.7 (GO DM), 7 (VOID) | amended | §5, §7.5 |
| 8.9 "Capers per family: 4" | superseded | §2.2 |
| 9.1 income column and the 6,400,000 bot-wide total; 9.2; 9.4 class constraint and "who can act"; 9.5 class level row | superseded | §5, §6 |
| 10.1 Member cap column | superseded | §2.2 |
| 10.2 Pacing table | superseded | §10.3 |
| 10.4 Leaderboard | amended | §2.6 |
| 11.1, 11.3 rows S1–S3 and K9, 11.4 | superseded | §10 |
| 12.1 `guild` column; 12.2 items 7 and 9 | amended | §2.2, §5 |
| 13.1–13.4 | amended | per section, consolidated in §11 |
| 14.1–14.3 | amended | Appendix A |
| 15 Scheduled jobs | amended | §7, Appendix B |
| 17 Edge cases 30, 35, 65 | superseded | §2.7, §3.6, §5.8 |
| 18 Testing | extended | each section's tests |
| 19.2 Stage C; 19.3; 19.4 | amended | §12, §13 |
| 23 Glossary ("Caper") | amended | §9 |

---

## 2. Change 1: Bigger families

### 2.1 Supersedes
Old 6.5 (size table), 10.1 (member cap column), 8.9 row "Capers per family", 0 item 6, D18 (the family half), 6.4 "at most 5 ACCEPTED invites per family per rolling 7 days", 7.3 "One `runFamilyTx` transaction with 5 attempts" and step 3, 12.2 item 7 (investigation at 3 members), 13.3 S2/S5/S6/S7 line caps ("≤ 12"), edge 65.

### 2.2 Rules and numbers

**Member cap** (`FAMILY_LEVELS[*].memberCap`, `src/data/crimeFamilyCatalog.ts:237-248`):

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Member cap | 10 | 12 | 14 | 16 | 18 | 20 | 23 | 25 | 28 | 30 |
| Heist cap at full roster | 4 | 4 | 5 | 6 | 6 | 7 | 8 | 9 | 10 | 10 |
| Capo cap at full roster (§3) | 2 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 5 | 6 |
| Investigation threshold at full roster | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 7 | 7 | 8 |
| Joins per rolling 7 days | 5 | 5 | 5 | 6 | 6 | 7 | 8 | 9 | 10 | 10 |
| Heist cooldown × heist cap (hours) | 12 | 12 | 15 | 16.5 | 16.5 | 17.5 | 20 | 22.5 | 20 | 20 |

`FamilyMember.seat` ranges 1..30. The `@@unique([familyId, seat])` backstop and the accept retry loop (`src/services/crimeFamily/membershipService.ts:108-138`) are unchanged.

**Family heist cap.** `heistCapFor(memberCount) = max(heistCapMin 4, ceil(memberCount / heistCapDivisor 3))`, replacing `capersPerFamilyPer24h` in `familyCaperBlock` (`src/services/crimeFamily/caperLobbyService.ts:45-52`). `memberCount` is `Family.memberCount` read in the same place the rolling count is read: before the plan transaction, inside it, and inside Start (`startCaper` re-runs `familyCaperBlock` at `:296-298`), so every retry re-checks.

| Members | 1–12 | 13–15 | 16–18 | 19–21 | 22–24 | 25–27 | 28–30 |
|---|---|---|---|---|---|---|---|
| Heists per rolling 24 h | 4 | 5 | 6 | 7 | 8 | 9 | 10 |

- Seat supply vs demand at full roster: at the 6-seat tiers (T3, T4; L5 and up) `cap × 6 ≥ members × 2` at every level (L5: 36 = 36, L10: 60 = 60). At T1 (4 seats) and T2 (5 seats) supply is smaller than 2 seats per member (L3: 25 seats for 28 member-seats), so per-member income at T1/T2 is equal to or lower than in the old spec (section 10.1).
- The family cooldown table (old 8.9) stays. The last row of the table above shows `cooldown × cap` never exceeds 24 h, so the cap is reachable at every level.
- Shrinking: a family whose `memberCount` drops below the size that earned its current count of started heists simply waits until the rolling window frees a slot; nothing is refunded or cancelled.
- The refusal reads "Your family has run 9 crew heists in the last 24 hours (cap 9 for 25 members). Next slot <t:R>."

**Joins per rolling 7 days** (A11): `joinsPerFamilyFor(level) = max(joinsPerFamilyPer7dMin 5, ceil(memberCap(level) / joinsPerFamilyDivisor 3))`, replacing the flat `joinsPerFamilyPer7d` in `assertJoinCaps` (`membershipService.ts:24-36`). Accepted applications count too (§8.5). Unchanged: 5 PENDING invites per family (`maxPendingInvites`), 3 ACCEPTED invites per inviter per 7 days.

**Under investigation** (A12): `isUnderInvestigation` (`src/services/crimeFamily/familyQueries.ts:60-67`) compares against `investigationThresholdFor(memberCount) = max(underInvestigationMembers 3, ceil(memberCount / investigationDivisor 4))`. The S11 and plan refusal names the live threshold.

**Unchanged by size** (A13): dues 40,000 × level per UTC day, the 1,000,000 gross payday cap, the 500,000 payday minimum, payday eligibility, 3 racket-eligible members per racket cycle, 2 seats per player per rolling 24 h, the lobby-DM cap of 3 per member per rolling 24 h, and the pair rule's "two members".

### 2.3 Data model
`Family.memberCount Int @default(1)` (A9). Written in the transaction that creates or deletes the member row:
- `createFamily` (`src/services/crimeFamily/familyService.ts:21`): created with 1.
- `joinFamilyInTx` (§8.5, the extracted body of `acceptInvite`): `memberCount: { increment: 1 }` together with the existing `touchFamily`.
- `removeMember` (`membershipService.ts:194-206`, leave and kick): `memberCount: { decrement: 1 }`.
- Disband deletes the row.

Every write already touches the family document, so the counter cannot drift under concurrency; `test/anticheat/family-membership.race.test.ts` asserts `memberCount === count(FamilyMember)` after every race shape.

### 2.4 Two-phase payday (A14)
Replaces old 7.3 step 3 and the "5 attempts, 12 wallets" note. Totals, cap, tax and eligibility are unchanged.

```prisma
model PaydayShare {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  familyId  String   @db.ObjectId
  runKey    String                         // the id of this payday's FamilyLedger "payday" row
  userId    String
  gross     Float
  tax       Float
  net       Float
  paid      Boolean  @default(false)        // CAS: wallet credited
  createdAt DateTime @default(now())
  @@unique([runKey, userId])
  @@index([paid, createdAt])
  @@index([familyId, createdAt])
}
```

1. **Reserve** (one `runFamilyTx`, 5 attempts, no wallet writes): the existing preview check, earnings and interval CAS (`src/services/crimeFamily/paydayService.ts:145-152`), `earnings -= gross × N`, the `payday` and `payday_tax` ledger rows, then `paydayShare.createMany` with one row per eligible member (`runKey` = the `payday` row's id).
2. **Pay** (one small transaction per share, in member order): `paydayShare.updateMany({ id, paid:false }) → { paid:true }` with `count === 1`, then `creditWalletInTx(..., "family_payday", { familyId, gross, tax }, earned=true)`. A `MAX_SAFE_BALANCE` clamp returns the excess with `creditEarnings(tx, familyId, excess, "payday_clamp_return", "system", {...}, { retryArrears: false })`; if the family no longer exists (a disband's final payday) the excess is burned and recorded in the share's ledger meta. After commit: `afterEarnedCredit` and the `family` payday DM for that member.
3. **Announce:** the caller that reserved pays every share, then posts the S28 payday card. A crash between 1 and 3 leaves `paid:false` rows; the minute job `resumePaydayShares` (Appendix B) pays rows older than `paydayShareResumeSeconds` (60) and DMs those members; the card is not reposted.
- `executePayday` (manual and `autoPayday`) and the disband final payday (`src/services/crimeFamily/disbandService.ts:62-65`) all reserve through one `reservePaydayInTx(tx, family, eligible, earnings, actorId, now)` and pay through one `payPaydayShares(runKey)`; `payMembersInTx` is removed.
- A member who leaves, is kicked or is banned between phases is still paid: eligibility was decided at reserve time.

### 2.5 Screens
| # | Change | Components |
|---|---|---|
| S2 | Roster is one TextDisplay of grouped lines: `<rank icon> **Boss** <@a>`, `**Underboss** <@b>`, `**Capos (3/4)** <@c> <@d> <@e>`, `**Soldiers** …`, `**Associates** <@f> <t:R> …` (each Associate with the end of their 72 h). Worst case 30 members, 10 Associates: about 1,300 characters. Status adds "Recruiting" and "Vote open, closes <t:R>". A second button row holds up to 3 of: Claim the chair (unchanged rule), Vote (§4), Recruit (§8). | 16 + second row (1 + 3) = **20** worst case |
| S5 | 15 members per page. Container[Text title + page roster (15 lines), Sep, Text legend (adds "Capo seats x/y; promotion needs 10,000,000 net worth"), SelectRow(≤ 15) 2, Row(Promote, Demote, Kick, Hand over, Back) 6, Row(Prev, page x/y disabled, Next) 4] | **16** |
| S6 | Locked-payday rule lines: at most 10 ineligible members, then "+N more: see the payday preview" | 12 (unchanged) |
| S7 | "Paid (N × net)": mentions only, one line; "Not paid" grouped by the first failing gate: `<gate need>: <@a> <@b> …`. Worst case 30 mentions + 7 gate labels ≈ 1,300 characters | 6 (unchanged) |
| S11 | "Started x/<heist cap> in 24 h" | 11 (unchanged) |
| S28 | Payday card names up to 30 members | 2 (unchanged) |

customIds: S5 select `crew:mg:sel:<page>:<ownerId>`, pager `crew:mg:pg:<page>:<ownerId>` (both ≤ 35 characters).

### 2.6 Leaderboard (old 10.4)
Sorts, top 10 and the viewer's rank are unchanged. Each line adds the league name (§6) after the level ("L8 Gold"). `rankedHolders` (`src/services/crimeFamily/turfLeaderboard.ts:10`) counts rackets in every city; its "at most 10 exist" comment goes.

### 2.7 Edge cases
| # | Case | Expected |
|---|---|---|
| 1 | Two accepts race for seat 30 | Unchanged mechanism (family touch + seat unique); `memberCount` ends at 30. |
| 2 | A 25-member family with 9 heists started loses 5 members | Cap drops to 7; no new heist until the rolling window has fewer than 7. |
| 3 | Payday reserve commits, the process dies before any share is paid | Minute job pays every `paid:false` share once; ledger totals match one payday. |
| 4 | Two payers race on one share (press path and resume job) | `paid:false → true` CAS: one credits. |
| 5 | Share clamps at `MAX_SAFE_BALANCE` after the family disbanded | Excess burned; recorded in meta. |
| 6 | 8 of 30 members reach heat 100 | Family is under investigation (threshold 8); 7 is not. |

### 2.8 Tests
- `test/crimeFamily/catalog.test.ts`: the member-cap row; `heistCapFor`, `joinsPerFamilyFor`, `investigationThresholdFor` for every member count 1–30 and every level.
- `test/anticheat/family-membership.race.test.ts`: `memberCount` equality after concurrent accepts, leaves and kicks; 31st accept refused.
- `test/anticheat/family-vault.race.test.ts`: two-phase payday for 30 members (one reserve, 30 shares, totals exact); crash injected after reserve (mock `creditWalletInTx` throwing for share 7) then `resumePaydayShares` pays the rest exactly once; payer vs resume race; disband final payday through shares.
- `test/anticheat/caper-join.race.test.ts`: the heist cap at 12, 13, 25 and 30 members, including Start's re-check after members leave.
- Fixtures: S2 with 30 members, 6 Capos, 10 Associates, the vote and recruit buttons; S5 page 2 of 2 with a selection; S6 with 30 ineligible; S7 with 30 paid and 30 grouped unpaid.

---

## 3. Change 2: Capos scale with size

### 3.1 Supersedes
Old 6.3 ("max 3", slots `CAPO1..CAPO3`, the column header "Capo (max 3)"), the `roleSlot` comment in 14.1, edge 35's Capo half.

### 3.2 Rules
- `capoCapFor(memberCount) = max(1, floor(memberCount / capoPerMembers 5))`: 1–9 members → 1, 10–14 → 2, 15–19 → 3, 20–24 → 4, 25–29 → 5, 30 → 6.
- `CAPO_SLOTS` (`src/data/crimeFamilyCatalog.ts:22`) becomes `CAPO1..CAPO6`. All six slots always exist; the cap is a count check, so a grandfathered family can hold more Capos than its cap.
- **Promotion into Capo** (`changeRank`, `src/services/crimeFamily/chairService.ts:35-55`), inside the transaction after the existing permission check:
  1. `capos = count(FamilyMember{familyId, role:"CAPO"})`; refuse when `capos >= capoCapFor(family.memberCount)`: "Capo seats are full (4/4 for 22 members)."
  2. `computeNetWorth(targetId).total >= capoMinNetWorth (10,000,000)`, called inside the transaction callback so each retry recomputes (the same pattern as `seatHolds`, `caperLobbyService.ts:228-230`); never `getNetWorth`. Refuse: "Promotion needs 10,000,000 net worth (<@x> has 6,200,000)."
  3. The lowest free slot of CAPO1..CAPO6 (`slotFor`, `chairService.ts:22-32`); the unique `[familyId, roleSlot]` index stays the backstop.
- **Promotion into Underboss** runs check 2 as well (A10). Chair moves (handover, claim, succession, vote) check nothing.
- **Demoting an Underboss** (A45; `ROLE_DOWN` UNDERBOSS → CAPO, `permissions.ts:47`) is not a promotion: it skips checks 1 and 2, so it may leave the family above its Capo cap (grandfathered like any other Capo). When all six of CAPO1..CAPO6 are held, `slotFor` returns no Capo slot and the Underboss drops straight to Soldier (`roleSlot = userId`) instead of throwing "Capo seats are full"; the reply says "<@x> is now a Soldier (no Capo seat was free)." Demotions out of Capo or Underboss also set `officerUntil` (§4.2).
- **Grandfathering:** no rule ever demotes. A Capo below 10,000,000, or a family whose `memberCount` falls so that `capos > cap`, keeps every Capo and every Capo power. Only new promotions into Capo wait until `capos < cap`. A demoted Capo who is promoted again passes both checks again.
- Underboss stays one (`"UNDERBOSS"` slot).

### 3.3 Permission table (old 6.3, changed and new rows only)
| Action | Boss | Underboss | Capo | Soldier | Associate |
|---|---|---|---|---|---|
| Promote to Capo (needs 10M on the target, a free Capo seat) | yes | yes | no | no | no |
| Start a no-confidence vote (§4) | no | yes | yes | only within 7 days of a demotion out of Underboss or Capo (A41) | no |
| Vote in a no-confidence vote (tenure ≥ 72 h at open) | no | yes | yes | yes | no |
| Edit the recruitment listing (§8) | yes | yes | no | no | no |
| Review applications (§8) | yes | yes | yes | no | no |

`ROLE_ACTIONS` (`src/services/crimeFamily/permissions.ts:22-41`) gains `start_vote: ["UNDERBOSS", "CAPO"]` (the vote service also admits any member with `officerUntil > now`, §4.2; `can` stays a pure role table), `cast_vote: ["UNDERBOSS", "CAPO", "SOLDIER"]` (the tenure rule is the vote's snapshot, not the Associate column), `edit_listing: UNDERBOSS_UP`, `review_apps: CAPO_UP`.

### 3.4 Data model, config, screens
- No new fields for Capos (`FamilyMember.officerUntil`, written by demotions, belongs to the vote, §4.4). `FamilyMember.roleSlot` comment: `"CAPO1".."CAPO6"`.
- Config: `capoPerMembers: 5`, `capoMinNetWorth: 10_000_000`.
- S5 legend and the promote refusal name both numbers; S2's Capos line shows `(capos/cap)`.

### 3.5 DM notices
Unchanged: `family` "You were promoted / demoted".

### 3.6 Edge cases
| # | Case | Expected |
|---|---|---|
| 1 | Seven promotions to Capo race in a 30-member family with 0 Capos | 6 commit (CAPO1..CAPO6 once each), the 7th "Capo seats are full (6/6 for 30 members)". |
| 2 | Target's 600 s `networth:<id>` cache says 50M, live net worth is 9M | Refused (uncached read). |
| 3 | Kicks take a 30-member family with 6 Capos to 19 members | All 6 stay Capos; promotions wait until Capos < 3. |
| 4 | A Capo with 2M net worth is promoted to Underboss | Refused by the 10M check (A10). |
| 5 | Promotion races a member leaving that drops the cap | Both touch the family document; the retry re-reads `memberCount`. |
| 6 | 30-member family with 6 Capos demotes its Underboss | Lands on Soldier (no Capo slot free); no throw; `officerUntil = now + 7 d`. |
| 7 | 19-member family with 3 Capos (cap 3) and a free CAPO4 slot demotes its Underboss | Lands on CAPO4; 4 Capos over a cap of 3 (grandfathered); the next promotion to Capo is refused. |

### 3.7 Tests
`test/anticheat/family-capo.race.test.ts` (new): edge cases 1–7; `test/crimeFamily/names-permissions.test.ts`: the new permission rows; catalog test: `capoCapFor` for 1–30.

---

## 4. Change 3: No-confidence vote

### 4.1 Supersedes and keeps
Adds a third path to old 6.7. Handover, the 7-day Underboss claim (S23) and the 14-day automatic succession are unchanged. Amends 6.3 (new rows, §3.3) and 6.4 and 6.7 (kick, promote, demote, disband and handover are frozen during an open vote; the claim and automatic succession still run and void it).

### 4.2 Rules
| Rule | Value |
|---|---|
| Who starts | a member with `role ∈ {UNDERBOSS, CAPO}` **or** `officerUntil > now` (A41), with tenure ≥ 72 h, not jailed, not banned. `changeRank` sets `officerUntil = now + 7 d` (`voteOfficerGraceSeconds` 604,800) on every demotion out of Underboss or Capo (UNDERBOSS → CAPO/SOLDIER, CAPO → SOLDIER); the row is deleted on leave or kick, so the right dies with the membership |
| Target | the current Boss, only when the Boss's `FamilyMember.firstBossAt ≤ now − 7 d` (`voteBossGraceSeconds` 604,800; A40). `firstBossAt` is written once, by the first chair move (or `createFamily`) that seats this member as Boss of this family, guarded by `bossedOnce:false`; later chair moves never rewrite it. A→B→A swaps give B 7 days once and A nothing. A member who leaves loses the row (and so the mark); rejoining costs the hop and rejoin cooldowns, which bound the repeat |
| Cooldown | refused while a vote of this family has `cooldownUntil > now` (A46). Close sets `cooldownUntil = closedAt + 7 d` (`voteCooldownSeconds` 604,800) on FAILED, and on VOID for `eligibleAtClose < 3` or no heir; a VOID caused by a claim or automatic succession sets none (`cooldownUntil = closedAt`) |
| One at a time | `@@unique([familyId, liveSlot])`, `liveSlot "LIVE"` while OPEN |
| Eligible voters | snapshot at open: every member except the Boss with `joinedAt ≤ now − 72 h`; stored in `eligibleIds`; at least `voteMinEligible` 3 or the start is refused |
| Window | 48 h (`voteSeconds` 172,800); closes only at `closesAt` |
| Ballot | YES or NO, secret, changeable until close; the starter's YES is recorded at start |
| Count at close | `eligibleAtClose` = snapshot ids still members of this family and not the Boss; YES and NO count only ballots from those ids |
| Pass | `YES ≥ ceil(2 × eligibleAtClose / 3)` (29 eligible → 20 YES) |
| VOID | the chair changed while open (Underboss claim, automatic succession), or `eligibleAtClose < 3`, or no heir on a pass |
| On pass | the Underboss at close (if any) takes the chair; else `pickHeir` over the members without the old Boss (`chairService.ts:111-120`); the old Boss becomes a Soldier (`moveChair`, `:70-77`); the new Boss's `firstBossAt` is set if this is their first time in the chair |
| Freeze while OPEN | no kicks (by anyone), no promotions or demotions, no disband, **no handover** (so a Boss cannot leave either: leaving needs a handover first); members' leaving, invites, accepts, deposits, heists, payday, bids and level-ups continue. The Underboss claim and the 14-day automatic succession still run and void the vote |

Anti-abuse in one place:
- **Joiners after open cannot vote**: the snapshot is fixed at open.
- **Kicking YES voters** to shrink the denominator is impossible (frozen); a voter who leaves on their own drops from both sides.
- **Installing a loyal heir** is impossible (rank changes frozen); the Underboss at close is the Underboss at open unless they left.
- **Escaping by disband** is impossible (frozen).
- **Escaping by handover** is impossible while a vote is open (frozen), and **chair swaps** with a loyalist or an alt buy no fresh grace: the grace reads the first time each member held this chair (A40).
- **Pre-emptive demotions**: a Boss who demotes every officer before a vote exists leaves each of them `start_vote` for 7 days (A41).
- **Retaliation**: ballots are secret (A16). Cards and DMs show only "x of N have voted" while open, and only YES, NO and eligible totals at close; `FamilyBallot` rows are never rendered.
- **Serial votes**: 7 days after a failed vote or one voided for too few eligible voters or no heir (A46); never in a Boss's first 7 days in this chair.
- **Silent votes**: the start is announced by the CAS winner on `announced`, and the sweeper announces any vote that is still silent after 60 s (A42), so a crash cannot leave a vote that fails unseen.

### 4.3 Flow
1. **Start** (`crew:vt:ok:<ownerId>` from S35, opened by the S2 Vote button or `!crew vote start`). One `runFamilyTx`: re-read the actor (role or `officerUntil`, tenure), `touchFamily`, check the Boss's `firstBossAt` grace, the cooldown and the snapshot size, `familyVote.create({ status:"OPEN", liveSlot:"LIVE", bossId, starterId, closesAt: now + 48 h, eligibleIds, announced:false })`, `familyBallot.create({ choice:"YES" })` for the starter. A P2002 on `FamilyVote_familyId_liveSlot_key` (caught outside the transaction) → "A vote is already open." After commit, `announceVoteStart(voteId)`.
   - **`announceVoteStart`** (A42): CAS `familyVote.updateMany({ id, announced:false }) → { announced:true }`; only on `count === 1`: post S34 in the home channel through the REST seam, store `channelId`/`messageId`, send the start DMs (§4.7). `sweepVotes` (job shard) also calls it for every OPEN vote with `announced:false` and `createdAt ≤ now − voteAnnounceGraceSeconds` (60), so a crash between the commit and the CAS is announced within about a minute. The remaining gap (a crash after the CAS, before the REST post) is milliseconds wide; the result is still on `!crew`, S2 and the S25 vote card, and a dead or missing S34 is reposted by the existing render path. A double run of the sweeper loses the CAS and posts nothing.
2. **Ballot** (`crew:vote:<yes|no>:<voteId>`, from S34, the S25 vote card or the DM). One `runFamilyTx`: `familyVote.updateMany({ id, status:"OPEN", closesAt:{gt:now} }) → { ballotsVersion:{increment:1} }` with `count === 1` (so a ballot conflicts with the close), check the presser is in `eligibleIds` and still a member, then find-and-update or create the `FamilyBallot`. A first-ballot double press raises P2002 on `[voteId, userId]`: the outer call retries once into the update path. Reply ephemerally: "Your ballot: YES. You can change it until <t:R>. Ballots are secret." Then a debounced S34 render.
3. **Close** (minute job `sweepVotes`, Appendix B), one `runFamilyTx` per due vote: read the family, current members and ballots; decide PASSED, FAILED or VOID (§4.2); CAS `familyVote.updateMany({ id, status:"OPEN" }) → { status, liveSlot:id, closedAt:now, cooldownUntil, yes, no, eligibleAtClose, newBossId }` (`resultAnnounced` stays false); on PASSED call `moveChair(tx, familyId, vote.bossId, heir)` (which sets the heir's `firstBossAt` on a first chair); `touchFamily`. A chair move racing the close writes the same family document, so one transaction write-conflicts and retries; the retry reads the new `bossId` and closes the vote as VOID. After commit, `announceVoteResult(voteId)`.
   - **`announceVoteResult`** (A42): CAS `familyVote.updateMany({ id, status:{ not:"OPEN" }, resultAnnounced:false }) → { resultAnnounced:true }`; only on `count === 1`: edit S34 to the result (or repost it once when dead), edit the S23 card if a claim notice is up, send the close DMs and, on a pass, "You are now the Boss". `sweepVotes` also calls it for every closed vote with `resultAnnounced:false` and `closedAt ≤ now − voteAnnounceGraceSeconds`, so a crash after the close commit is announced on the next minute.
4. **Chair moves elsewhere** (Underboss claim, `autoHandover`): `moveChair` runs the new `onChairMove` hook, which CASes any OPEN vote of the family to VOID (`cooldownUntil = closedAt`, `resultAnnounced:false`) in the same transaction; after commit the mover calls `announceVoteResult`, which edits S34 to "Vote void: the chair changed hands". **Handover** is refused while a vote is OPEN: `handOverChair` (`chairService.ts:80-88`, which today has no cooldown or hook) calls the new `handoverBlock` inside its transaction → "No handover while a no-confidence vote is open."

Hooks (registry entries, `src/services/crimeFamily/extensions.ts:20-35`): a new `VOTE_FAMILY_HOOK` with `memberExitBlock` (KICKED while OPEN → "No kicks while a no-confidence vote is open."), `disbandBlock`, and three new optional `FamilyHook` methods, `rankChangeBlock(tx, familyId)` (called by `changeRank`), `handoverBlock(tx, familyId)` (called by `handOverChair`) and `onChairMove(tx, familyId, now)` (called by `moveChair`). `firstBossAt` is a chair fact, not a vote fact, so `moveChair` itself writes it: after seating the new Boss, `familyMember.updateMany({ familyId, userId:newBossId, bossedOnce:false }) → { bossedOnce:true, firstBossAt:now }` (a no-op for a returning Boss); `createFamily` creates the founder row with `bossedOnce:true, firstBossAt:now`. Every chair path (handover, claim, succession, vote) goes through `moveChair`, so none can skip it.

### 4.4 Data model
```prisma
model FamilyVote {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  familyId        String   @db.ObjectId
  status          String   @default("OPEN")   // OPEN|PASSED|FAILED|VOID
  liveSlot        String   @default("LIVE")   // rewritten to id at close: one open vote per family
  announced       Boolean  @default(false)    // CAS: S34 posted and start DMs sent (A42)
  resultAnnounced Boolean  @default(false)    // CAS: result edit and close DMs sent (A42)
  cooldownUntil   DateTime @default(now())    // rewritten at close: closedAt + 7 d on FAILED and counted VOIDs (A46), else closedAt
  bossId          String                      // the Boss the vote targets
  starterId       String
  eligibleIds     String[]                    // snapshot at open; never filtered
  closesAt        DateTime
  ballotsVersion  Int      @default(0)        // written by every ballot so ballot and close conflict
  closedAt        DateTime @default(now())    // rewritten at close; read only with status ≠ OPEN
  yes             Int      @default(0)        // written at close
  no              Int      @default(0)
  eligibleAtClose Int      @default(0)
  newBossId       String   @default("")
  channelId       String   @default("")
  messageId       String   @default("")       // S34; "" = dead or never posted
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([familyId, liveSlot])
  @@index([status, closesAt])
  @@index([familyId, cooldownUntil])
  @@index([announced, createdAt])
  @@index([resultAnnounced, closedAt])
}

model FamilyBallot {
  id       String   @id @default(auto()) @map("_id") @db.ObjectId
  voteId   String   @db.ObjectId
  familyId String   @db.ObjectId
  userId   String
  choice   String                              // YES|NO
  castAt   DateTime @default(now())
  @@unique([voteId, userId])
}
```
`FamilyMember` gains `bossedOnce Boolean @default(false)`, `firstBossAt DateTime @default(now())` (read only with `bossedOnce:true`; written once by `moveChair` or `createFamily`, A40) and `officerUntil DateTime @default(now())` (the default is already past, so a member who was never demoted has no right; set by `changeRank` on a demotion out of Underboss or Capo, A41). All three live on the member row and die with it on leave or kick. No `Family.bossSince` field: a grace that every chair move rewrote is what A40 removes.

### 4.5 Commands and customIds
- `!crew vote` (slash choice `vote`): with a vote open, posts the S25 vote card; else, for an Underboss, a Capo or a member with `officerUntil > now`, the S27 opener `crew:open:vote:<ownerId>`; else a one-line reason (grace, cooldown, too few eligible). `!crew vote start` always posts the opener.
- customIds: `crew:vt:<start|ok|cancel>:<ownerId>` (owner scope), `crew:vote:<yes|no>:<voteId>` (shared; authorised against `eligibleIds` and membership), `crew:open:vote:<ownerId>`. Longest 38 characters.

### 4.6 Screens
| # | Screen | Visibility | Components |
|---|---|---|---|
| S34 | Vote card: Container[Text "## No-confidence vote · [TAG]\n<@boss> · started by <@starter> · closes <t:R>", Sep, Text (eligible N, need ceil(2N/3) YES, "x of N have voted", secret ballot, who takes the chair on a pass), Row(Vote YES, Vote NO) 3] | public, home channel; `allowedMentions` none | **7**; result edit Container[Text header, Text "Passed: <@new> is Boss (YES 21, NO 6, eligible 29)" / "Failed" / "Void: …"] **3** |
| S35 | Start confirm: Container[Text "Start a no-confidence vote against <@boss>?", Text (eligible voters, threshold, 48 h, you are named, a failed vote, or one voided for too few eligible voters, blocks another for 7 days; ranks, kicks and handover freeze), Row(Start vote, Cancel) 3] | ephemeral | **6** |
| S25 vote | Container[Text "No-confidence vote on <@boss> in [TAG] closes <t:R>. Ballots are secret.", Row(Vote YES, Vote NO) 3] | public, caller's channel | **5** |
| S2 | Vote button in the second row (open vote: any eligible voter; startable: Underboss, Capo or a recently demoted officer) | — | within S2's 20 |

The S34 render uses the trailing debounce with the Redis key `cf:render:vote:<voteId>` (2 s, fails open, never guards a ballot). A dead S34 gets one repost in the home channel, then DMs only (old 13.2 policy).

### 4.7 DM notices (`family`, opt-out)
| Notice | Trigger | Recipients | Components |
|---|---|---|---|
| "No-confidence vote opened" with Row(Vote YES, Vote NO) | start | every eligible voter | 6 + 3 = 9 |
| "A no-confidence vote was opened against you" (starter named, closes <t:R>) | start | the Boss | 6 |
| "No-confidence vote: passed / failed / void" with totals | close | every member at close, the old Boss | 6 |
| "You are now the Boss of [TAG]" | pass | the new Boss | 6 |

### 4.8 Edge cases
| # | Case | Expected |
|---|---|---|
| 1 | Two Capos start at once | One vote (unique `liveSlot`); the other "A vote is already open." |
| 2 | A ballot lands in the same second as the close | Both write the vote document; one retries; a late ballot gets "Voting closed." |
| 3 | The sweeper closes twice, or the process dies after the close commit and before the announcement | The second close CAS misses: no second chair move. The result is announced exactly once by whoever wins `resultAnnounced` (the closer, or `sweepVotes` on the next minute). |
| 4 | Boss tries to hand over during the vote | Refused by `handoverBlock`: "No handover while a no-confidence vote is open." The vote runs on. |
| 5 | The Underboss leaves during the vote, which then passes | `pickHeir` picks the earliest-joined active Capo, etc.; none qualifies → VOID. |
| 6 | 3 eligible at open, 1 leaves | `eligibleAtClose = 2` → VOID with the 7-day cooldown (A46). |
| 7 | A member who joined after the start presses YES on a DM forwarded to them | Not in the snapshot: "You can't vote in this one." |
| 8 | Boss tries to kick, promote, demote or disband while open | Refused with the freeze line. |
| 9 | A vote passes against a Boss who is also inactive 7 days | Same result; the S23 card (if posted) is edited to "Chair taken by vote". |
| 10 | Underboss claim (7-day inactivity) during an open vote | Claim commits and voids the vote (`onChairMove`); no cooldown. |
| 11 | Boss A hands to loyalist B (no vote open), B hands straight back to A | B had 7 days of grace while seated; A's `firstBossAt` is unchanged, so A can face a vote at once. A second A→B→A swap gives B no new grace. |
| 12 | The Boss demotes the Underboss and every Capo, then a former Capo (now Soldier) starts a vote on day 6 | Allowed (`officerUntil > now`); on day 8 refused. |
| 13 | The process dies after the start commit, before S34 and the DMs | `sweepVotes` finds `announced:false` older than 60 s, wins the CAS, posts S34 and sends the start DMs once. |
| 14 | A vote is VOID because an eligible ally left (`eligibleAtClose = 2`) | 7-day cooldown, the same as a failed vote. |
| 15 | A vote is VOID by the 14-day automatic succession | No cooldown. |

### 4.9 Tests
`test/anticheat/family-vote.race.test.ts` (new): edge cases 1–15 (13 by making the after-commit `announceVoteStart` throw before its CAS, then running `sweepVotes` twice: one S34 post and one DM per recipient; the same injection after the close commit for `announceVoteResult`); the 2/3 threshold for eligible 3..29 (ceil rounding); the 7-day cooldown boundary and the Boss's 7-day grace boundary; a ballot change; secrecy (no payload of S34, S25 vote or any DM contains a voter's choice; `test/crimeFamily/vote-layout.test.ts`); the freeze through the hook registry (`test/crimeFamily/handlers.test.ts` gets the routes).

---

## 5. Change 4: Crew heists and war actions across servers

### 5.1 Supersedes
D48 and old 6.5 bullets 2–5; 8.4 step 1 (lobby DMs "in the lobby's guild"), step 3 gate 1 ("acting in the lobby's guild"), step 5.7 (GO DM content); 9.4 "Who can act" ("acting in their family's home guild"); 12.1's `guild` column; 12.2 item 9 (the guild clause); 13.2 "who may press" for `cpr:join` and `turf:scout/hit`; 13.3 S1 hint, S14, S25; 13.4 lobby-DM recipients; edge 30; D58's GO DM.

### 5.2 Rules
- **No guild locks.** `GateDef.guild` and `EligibilityOpts.guildId/expectedGuildId` are removed (`src/data/crimeFamilyCatalog.ts:271`, `:283`, `:302`; `src/services/crimeFamily/eligibility.ts:17`, `:145-148`). `seatGates` (`caperLobbyService.ts:58-76`) and `warActor` (`src/services/crimeFamily/warActions.ts:57-73`) stop passing a guild. `!turf war` drops its home-server check (`src/commands/economy/turf.ts:64-68`).
- **The lobby card** posts where the heist was planned (`pickLobbyChannel`, unchanged). The GO call (S28) still posts in that channel.
- **Personal cards** (the S25 pattern):
  - `!heist` in a server other than the lobby's posts the **S25 lobby** card instead of "running in another server" (`src/commands/economy/caper.ts:63-67`). In the lobby's own server the old C7 repost stays.
  - `!heist join <role>`, `!heist brief`, `!heist leave/start/cancel` work from any server (identity from DB rows, unchanged).
  - A join pressed anywhere other than the shared lobby card (a DM, an S25 lobby card) edits the pressed message into the S25 seated card ("Seated as Driver" + Open brief); a join on the shared card keeps today's behaviour (`src/handlers/caperInteractionHandler.ts:40-44`).
- **Lobby DMs** go to every unseated member who would qualify and has a lobby-DM slot, regardless of guild: `announceLobby` (`src/ui/crimeFamily/caperFlow.ts:71-99`) drops the `client.guilds.cache.get` and `guild.members.fetch` filter (`:77-89`). The 3-per-24 h cap and the 2-hour quiet after a cancel stay.
- **GO DMs** carry an Open brief button (`cpr:brief:<caperId>`). Brief, Refresh, choices and Share all work from a DM (the router has no guild check, `src/index.ts:230`).
- **War actions** (scout, hit, answer) work from any server and from a DM. War boards still post only in both families' home channels. The war-soon DM carries the Scout and Hit row, so it is the member's personal war card.
- **DM presses** are open when `enabled` is true (A20): `isCrimeFamilyOpen(null)` becomes `CRIME_FAMILY_CONFIG.enabled`; `isTurfOpen(null)` becomes `enabled && turfEnabled`.

### 5.3 The GO intel relay (A18)
The puzzle is unchanged: seat i's correct answer is shown only to seat i+1 (old 8.3), a blind guess passes 25% of the time, and darkness, the leak and the outcome math are untouched. What changes is how seat i+1 can pass that answer to seat i.

| Rule | Value |
|---|---|
| Where | S14 brief: the "Tell <@prev>: **label**" line becomes a Section whose accessory is a **Share** button (`cpr:share:<caperId>`) |
| Who | only the seat holding the intel, after it has opened its brief and while it is not dark (`isDark`, `intelRing.ts:68-70`, is false at the press) |
| When | while the heist is RUNNING and `now < goEndsAt` |
| How often | once per seat: CAS `caperCrew.updateMany({ caperId, userId, sharedIntel:false }) → { sharedIntel:true, sharedAt:now }`, guarded in the same transaction on `caper{status:"RUNNING", goEndsAt > now}`; a repeat press says "Already shared." |
| Who sees it | only the previous seat (the one whose call it answers), in its own brief: "Intel from <@next>: **label**" on its next open or Refresh. Nobody else, no card, no channel |
| Nudge | a `caper_lobby` DM to that previous seat: "<@next> shared your intel. Open your brief." with Open brief; it never contains the label; `sendOptOutDm`, so the toggle and the strike counter apply; at most one per seat per heist (the CAS) |
| Result card | a seat that locked after its intel was relayed is marked "(relayed)" beside the existing "(leaked)" (`CaperCrew.relayed`, display only, written by `lockChoice` like `leaked`) |

Why the puzzle still needs everyone: every seat must open its brief before the leak, press Share for the intel it holds, and lock its own call after its partner shares. A member who opened the brief and never shares leaves their partner a 25% guess; a member who never opens is dark (a miss) and their held intel leaks at GO−30 s exactly as before. Only the holder can share, so one player cannot carry the crew (anti-goal 4). The relay always delivers the true label, so the old "relays wrong intel" griefing (old 12.2 item 10) now needs chat; the saboteur's remaining tool is not sharing, which costs them their own stake like any miss.

Data model (`CaperCrew`): `sharedIntel Boolean @default(false)`, `sharedAt DateTime @default(now())` (read only with `sharedIntel:true`), `relayed Boolean @default(false)` (display only). `BriefView` gains `relayed: string | null` (the label, when the holder shared) and `canShare: boolean`; `briefFor` (`src/services/crimeFamily/intelRing.ts:75-105`) derives both.

### 5.4 Screens
| # | Change | Components |
|---|---|---|
| S1 | Hint: "Browse families with `!crew board`. Crew heists and turf wars work from any server." Row gains Find a family (§8) | **14** |
| S14 open | Container[Section(Text "### <role> brief\nYour intel for <@prev>: **label**" + Button accessory Share/Shared) 3, Sep, Text call (adds "Intel from <@next>: **label**" when relayed), Row(4 options, Refresh) 6] | **12** |
| S14 dark | unchanged (no Share) | 6 |
| S25 lobby (new variant) | Container[Text "[TAG] crew heist lobby: <tier> · closes <t:R>" + jump link when the viewer can open it, SelectRow(Join as…, open roles, `cpr:join:<caperId>`) 2]; with no open role the select is omitted and the text says so | **4** |
| S25 seated | unchanged | 4 |
| S25 war | unchanged | 7 |

### 5.5 DM notices
| Notice | Type | Change | Components |
|---|---|---|---|
| Crew heist lobby open | `caper_lobby` | recipients regardless of guild; adds SelectRow(Join as…) | 6 + 2 = **8** |
| Crew heist GO | `caper_lobby` | adds Row(Open brief) | 6 + 2 = **8** |
| Intel arrived (new) | `caper_lobby` | "<@x> shared your intel. Open your brief." + Row(Open brief); never the label | **8** |
| Turf war soon | `turf` | adds Row(Scout, Hit Docks, Hit Main St, Hit Back Alleys) | 6 + 6 = **12** |

Worst case per member per day (old 13.4): 3 lobby calls + 2 GO + 2 intel nudges + 1 seat-free reminder + 1 war warning + 1 war result, plus rare `family` and `recruit` notices.

### 5.6 customIds
`cpr:share:<caperId>` (shared; authorised against the presser's `CaperCrew` row; 34 characters). Every other id is unchanged.

### 5.7 Redis
None new. `cf:lobbydm:<uid>` keeps the cap.

### 5.8 Edge cases
| # | Case | Expected |
|---|---|---|
| 1 | Crew of 6 in 6 different servers, no shared chat | Each joins from the lobby DM; GO DMs open briefs; Shares deliver intel; a perfect run is possible. |
| 2 | Share pressed at GO−1 s, recipient never refreshes | The seat locks nothing or guesses; it is the recipient's miss. |
| 3 | Holder shares, then GO ends before the recipient presses | Recipient unlocked → miss, cut 0 (D49). |
| 4 | Dark seat presses Share after the leak | "You went dark: this seat counts as a miss." Its intel already leaked. |
| 5 | Recipient has DMs off | No nudge; the brief's Refresh shows the relayed intel. |
| 6 | Join select in a lobby DM after the role filled | "Role just taken." (`@@unique([caperId, role])`), no stake charged. |
| 7 | A member joins from a DM; the lobby card's channel is in a server they are not in | Seated; the S25 seated card replaces the DM; GO reaches them by DM. |
| 8 | Old edge 30 ("member not in the lobby's server") | Removed: they can play. |
| 9 | War hit armed from a DM | Scored like any hit; the hit call is an ephemeral DM reply. |

### 5.9 Tests
- `test/crimeFamily/intel-relay.test.ts` (new, pure): `briefFor` shows the relay only to the previous seat; never to the holder, the next seat or the card view; the leak still applies to a dark holder; `canShare` false when dark or after `goEndsAt`.
- `test/anticheat/caper-relay.race.test.ts` (new): double Share → one CAS; Share vs settle draw (the draw writes every crew row, so the share retries into "Too late."); Share after `goEndsAt` refused; the nudge DM count is 1 and respects the `caper_lobby` toggle.
- `test/crimeFamily/cross-server.test.ts` (new): join, brief, start and cancel from a guild other than the lobby's; lobby DMs reach a member sharing no guild with the bot's lobby; DM-pressed join edits the DM into S25; scout and hit from another guild and from a DM; `isCrimeFamilyOpen(null)` follows `enabled`.
- Remove the "wrong guild fails" assertions from `test/crimeFamily/eligibility.test.ts` and the "join from another guild refused" case in `test/anticheat/caper-join.race.test.ts`.
- Fixtures: S14 open with Share and with Shared; S25 lobby with 5 open roles; the four DM containers.

---

## 6. Change 5: Turf leagues

### 6.1 Supersedes
Old 9.1 (the fixed list as one set; its income column; "6,400,000 per day … fixed regardless of player count"), 9.2, 9.4 (class level constraint in "Family constraints"), 9.5 "Class level" row, D23, D25's level gates, 13.3 S16/S17, 14.1 `Racket.key @unique`, 15's `seedRackets` and `tickWars` step 1, 19.2 stage C.

### 6.2 Leagues
| League | Family levels | City name | Icon (existing) | Racket cap by level (unchanged) |
|---|---|---|---|---|
| Bronze | 1–3 | Low Town #n | `cf_crest_1` | 1 |
| Silver | 4–6 | Midtown #n | `cf_crest_2` | 2 |
| Gold | 7–10 | Uptown #n | `cf_crest_3` | 3 (at most 1 Crown) |

`leagueOf(level)` is pure and the only source; `Family` stores no league.

### 6.3 Cities
- A city is the old 10-racket map: the same 10 keys, names, classes, baseline defence, war weekday and hour (old 9.1 columns 2–4, 7–9). Each city has its own `Racket` rows and its own weekly `War` rows; bidding, wars, neglect and settlement run per city exactly as built.
- **Count per league** at each census: `target = max(1, ceil(activeFamilies / familiesPerCity 40))`, where `activeFamilies` counts families of that league's levels with `activeMembers ≥ racketEligibleMin (3)`.
- **Opening:** when `target > open`, reopen CLOSED cities lowest number first, then create `number = max + 1` with its 10 rackets. Creation is an upsert on `@@unique([league, number])`, so a repeated census cannot open a city twice.
- **Never closes while anything is owned** (A27). A city closes only when all hold: it is the league's highest-numbered OPEN city; `open > target` at 14 consecutive censuses (`surplusDays ≥ citySurplusDaysToClose 14`, counted once per UTC day by a `surplusDayKey` CAS, reset to 0 at any census where `open ≤ target`); no racket in it has an owner; no war in it is ARMED, ACTIVE or SETTLING, or BIDDING with a bid. Closing is one transaction: CAS `turfCity.updateMany({ id, status:"OPEN" }) → { status:"CLOSED", closedAt }`; then the closure, not the bid, is the side that writes the contested documents: `war.updateMany({ cityId, status:"BIDDING", topBidderFamilyId:"" }) → { status:"CANCELLED" }` (no escrow to refund), then re-read that the city has no owned racket and no War left in BIDDING, ARMED, ACTIVE or SETTLING (else throw and roll the closure back); every family placed there is set to `cityId:""` (re-placed by the same census). A bid racing the closure writes the same War document (`placeBid`'s CAS on `status:"BIDDING"`, `bidService.ts:199`), so one of the two write-conflicts and retries: the bid then sees CANCELLED, or the closure sees the bid and aborts. `placeBid` does not touch the city, so bids on different rackets of one city stay independent. A reopened city's rackets resume at the next weekly period (this week's War rows stay CANCELLED under `@@unique([racketId, periodKey])`). A CLOSED city gets no new War rows (`openWarPeriods` reads only OPEN cities).
- **Launch:** the boot seed ensures city #1 of each league exists, so stage C starts with 3 cities and 30 rackets.

### 6.4 Active family and the census (A22)
`activeMembers` for a family = its current members who, in the 7 days before the census, have ≥ 2 started heist seats **in this family** (`CaperCrew{familyId, started:true, startedAt ≥ since}`) or ≥ 3 correct war hits **for this family** (`WarHit{familyId, state:"HIT", createdAt ≥ since}`), and are not banned (`isBanActive`). A VOID or cancelled heist has no started rows, so it never counts.

The census (`runTurfCensus`, hourly job, runs once per UTC day):
1. Claim the day: upsert `CfJobRun{ key:"turf_census" }` (P2002 caught, no transaction open); run only when `dayKey ≠ today`; set `dayKey = today` after the last step succeeds. Every step is idempotent, so a crash reruns next hour.
2. Two `groupBy` aggregates over the last 7 days (`CaperCrew{started:true, startedAt ≥ since}` by `[familyId, userId]` through the new `@@index([started, startedAt])`, `WarHit{state:"HIT", createdAt ≥ since}` by `[familyId, userId]` through the new `@@index([state, createdAt])`; the existing indexes all lead with `userId` and would scan collections that only grow), intersected with current `FamilyMember` rows and the ban read; write `activeMembers` and `censusAt` on every family. Runs whenever `enabled` (the recruitment board sorts on it).
3. Only when `turfEnabled`: per league, open, count surplus and close cities (§6.3).
4. Only when `turfEnabled`: place every active, unplaced family (`cityId ""`, a CLOSED city, or a city of another league) into the OPEN city of its league with the fewest placed active families, ties to the lowest number, in order of `activeMembers` desc then `createdAt` asc. Placement is a CAS `family.updateMany({ id, cityId:<read> }) → { cityId, cityPlacedAt:now }` that also touches the chosen city. This is the only placement path: a league-changing level-up leaves the family unplaced until the next census (§6.6). Inactive families keep their city.
5. Only when `turfEnabled`, **rebalance** each league (A43), every census (so always after any opening or closing, which happen only here). A family is **movable** when it is active, placed in an OPEN city of this league, owns no racket, is not the top bidder of a BIDDING war and is no side of an ARMED, ACTIVE or SETTLING war. Let `avg` = placed active families ÷ OPEN cities. Repeat: take the emptiest OPEN city (fewest placed active families, ties to the lowest number) and the fullest city that still has a movable family (ties to the highest number); move that city's most recently placed movable family (`cityPlacedAt` desc) to the emptiest city when `full − empty ≥ 2` and (`full > avg + 2` or `empty < avg − 2`); stop when no move applies. Each move is the same CAS on `Family.cityId` (re-checking movability inside the transaction: no owned racket, no top bid, no live war) plus a touch of the destination city, and sends the `turf` DM "Your family moved to <city>". The loop ends because every move lowers the sum of squared city sizes. Families with turf at stake never move; a full city of them stays full until they lose it.

### 6.5 Income per league (A25)
| League | Corner (×4) | District (×4) | Crown (×2) | City total per day | Bid floors (7 × income) | Best holding per family per day |
|---|---|---|---|---|---|---|
| Bronze | 100,000 | 200,000 | 300,000 | **1,800,000** | 700,000 / 1,400,000 / 2,100,000 | 300,000 (cap 1) |
| Silver | 200,000 | 450,000 | 850,000 | **4,300,000** | 1,400,000 / 3,150,000 / 5,950,000 | 1,300,000 (Crown + District) |
| Gold | 300,000 | 650,000 | 1,300,000 | **6,400,000** | 2,100,000 / 4,550,000 / 9,100,000 | 2,600,000 (Crown + 2 Districts) |

- The old class level gates (District L4+, Crown L7+, `RACKET_CLASSES[*].minFamilyLevel`, `bidService.ts:58`) are retired: within a city every class is open to every family placed there. The league is the gate: Bronze families hold at most one racket, so a Bronze Crown is worth exactly an old Corner.
- Baseline defence (30/50/80), capture XP (300 × 1 / 1.5 / 2), the 20 XP per minted cycle and war mechanics are unchanged by league.
- `RacketDef.incomePerCycle` moves out of `RACKETS` into `LEAGUE_RACKET_INCOME[league][class]`; the seed writes it onto each `Racket` row; `bidFloor` reads the row (`bidService.ts:169`).

### 6.6 Bids and level-ups
- `bidBlockers` (`bidService.ts:48-67`) gains, before the existing checks: "Your family has no city yet: it gets one at the daily census once 3 members are active (next <t:R>)." and "This racket is in <city>. Your family plays in <own city>." The class-level line goes. `loadBidContext` loads the racket by id and the viewer's `cityId`.
- **League-changing level-up** (`levelUp`, `src/services/crimeFamily/progression.ts:54-82`; L3→L4, L6→L7): inside the transaction, refuse with "Finish your turf first: …" while the family is the top bidder of a BIDDING war or a side of an ARMED, ACTIVE or SETTLING war. Otherwise: every owned racket → `ownerFamilyId:""`, `neglectStrikes:0`, `lastPayoutAt:now` (partial cycles forfeited); `FamilyLedger{type:"league_move", amount:0, meta:{from, to, released:[keys]}}`; `cityId:""`. There is no immediate placement: the family is placed in its new league at the next daily census, like any unplaced family, and the rebalance then evens it out, so timing a level-up to a new city's opening buys nothing. S8 lists the rackets that will be released before Confirm and says "Your family gets a <league> city at the next census (<t:R>)."
- Level never drops, so a league never moves down.

### 6.7 Data model
```prisma
model TurfCity {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  league        String                       // BRONZE|SILVER|GOLD
  number        Int                          // 1.. per league
  status        String   @default("OPEN")    // OPEN|CLOSED
  surplusDays   Int      @default(0)
  surplusDayKey String   @default("")        // "YYYY-MM-DD": surplusDays counts once per UTC day
  openedAt      DateTime @default(now())
  closedAt      DateTime @default(now())     // rewritten at close; read only with status CLOSED
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt          // touched by placement and rebalance moves so a closure conflicts (placeBid does not touch it)
  @@unique([league, number])
  @@index([league, status])
}

model CfJobRun {
  id     String   @id @default(auto()) @map("_id") @db.ObjectId
  key    String   @unique                     // "turf_census"
  dayKey String   @default("")
  ranAt  DateTime @default(now())
}
```
- `Racket`: `key` loses `@unique`; adds `cityId String @db.ObjectId`, `league String`, `openedPeriodKey String @default("")`; adds `@@unique([cityId, key])`, `@@index([cityId])`, `@@index([key, openedPeriodKey])`.
- `War`: adds `cityId String @db.ObjectId` (the racket's, written at upsert) and `@@index([cityId, status])`.
- `Family`: adds `cityId String @default("")` (sentinel), `cityPlacedAt DateTime @default(now())` (rewritten at every placement or move; read only with `cityId ≠ ""`), `activeMembers Int @default(0)`, `censusAt DateTime @default(now())`, `@@index([cityId])`, `@@index([level, activeMembers])`.
- `openWarPeriods` (`src/services/crimeFamily/warService.ts:41-57`) stops upserting every racket every minute: per racket key (10 schedules) it computes `periodKey` and, when bidding is OPEN, reads only rackets of OPEN cities with `openedPeriodKey ≠ periodKey`, upserts their War and sets `openedPeriodKey` (one write per racket per week). No existing document lacks the new fields (nothing is deployed), so no `isSet` guard is needed; any later backfill must add one (old 14.2 rule).

### 6.8 Commands, customIds, screens
- `!turf` shows the viewer's family city; an unplaced family sees the city it would be placed in, read-only; a non-member sees Low Town #1. `!turf racket <key|1-10>` and `!turf bid <key> <amount>` resolve the key in the viewer's city. Slash `/turf` is unchanged (its `racket` choices are still the 10 keys).
- customIds: racket ids replace racket keys where a city matters: `turf:sel:<ownerId>` (option values are racket ids), `turf:open:racket:<racketId>:<ownerId>` (62), `turf:bid:<racketId>:<ownerId>` (54), `turf:modal:bid:<racketId>:<ownerId>` (60); new `turf:city:<cityId>:<ownerId>` (55).

| # | Change | Components |
|---|---|---|
| S16 | Header "## Turf · Uptown #2 (Gold)" and, for an unplaced family, its status line; income lines per league; group headers lose "(family L4+)"; new Row(◀ city, city ▶, Bronze, Silver, Gold) 6 (the viewer's league button Primary; ◀/▶ disabled at the ends) | 14 + 6 = **20** |
| S17 | "Class level" line becomes "City: Uptown #2 (Gold league)"; floor per league | 11 (unchanged) |
| S8 | League-change warning lines | 6 (unchanged) |
| S10 | League name per line | 13 (unchanged) |

### 6.9 DM notices
`turf`, new: "Your family moved to <city>" on a league change (all members; one line listing released rackets) and on a rebalance move (all members; "The league opened or closed a city; your family now plays in <city>."). First placement by the census sends nothing.

### 6.10 Edge cases
| # | Case | Expected |
|---|---|---|
| 1 | Census runs at 00:10 and again at 01:10 | The second sees `dayKey = today` and skips. |
| 2 | Crash after step 3 opened a city, before `dayKey` | Next hour reruns; the upsert finds the city; placement continues. |
| 3 | 41st active Gold family at a census | Uptown #2 opens; the 41st is placed there, then the rebalance moves the most recently placed movable families from #1 until both cities are within ±2 of 20.5; nobody is left alone on an empty map. |
| 4 | League shrinks to 30 active families with 2 Gold cities, an owned racket in #2 | #2 never closes while owned; `surplusDays` keeps counting; closes on the first eligible census after the racket is released. |
| 5 | Bid races a closure | Both write the racket's War document; the retry sees CANCELLED (bid refused) or the bid (closure aborts); never both. Bids on two rackets of one open city never conflict with each other. |
| 6 | Bronze L3 family with a held racket levels to L4 | Racket to the Street, `league_move` ledger row, unplaced until the next census, then placed in Midtown if active; S8 warned. |
| 7 | Same family is defending in an ARMED war | Level-up refused until the war resolves. |
| 8 | Family placed in Uptown #1 bids on Uptown #2's Casino Row | Refused: "This racket is in Uptown #2…". |
| 9 | Unplaced family opens `!turf` | Read-only map of its likely city; Bid disabled with the census line. |
| 10 | Two families in different cities bid on "the same" key | Different `Racket` rows and wars; independent. |
| 11 | A Silver L6 family delays its level-up until the Gold count is about to cross 40, then levels | Unplaced until the census; placed into the emptier city and rebalanced with everyone else; no near-empty city exists to land in. |
| 12 | A movable family wins a top bid while the census plans its move | The move's CAS transaction re-checks movability and touches the family; the bid writes the family's earnings (`spendFromVault`, `bidService.ts:188`) and re-reads `cityId` for its own-city check, so one retries; a family with a top bid is not moved, and a moved family's bid on its old city is refused. |

### 6.11 Tests
- `test/crimeFamily/league-math.test.ts` (new, pure): `leagueOf` 1–10; `citiesFor(0, 1, 40, 41, 80, 81, 4000)` = 1, 1, 1, 2, 2, 3, 100; league income tables sum to 1.8M/4.3M/6.4M; each league's best holding ≤ the old level maximum.
- `test/anticheat/turf-league.race.test.ts` (new): edge cases 1–8, 11 and 12; census vs level-up race on the same family (placement CAS); two placements into one city stay balanced; the 41st family is not left alone (after the census both Uptown cities hold 20 or 21); a family holding a racket or a top bid is never moved; the rebalance stops with every OPEN city within ±2 of the average or no movable family left; 40 bids on 10 rackets of one city in parallel all commit (no city hot spot).
- `test/crimeFamily/turf-jobs.test.ts`: `openWarPeriods` writes each racket's War once per week across 3 cities; CLOSED cities get none.
- Update `test/anticheat/turf-bid.race.test.ts` (class-level cases become city cases) and `test/crimeFamily/racket-seed.test.ts` (seed upserts every city's 10 rows by `[cityId, key]`, never touching owner or timers).
- Fixtures: S16 for a placed Gold family with live bids on all 10, and for an unplaced family; S8 with 3 released rackets.

---

## 7. Change 6: Sharding-ready

### 7.1 Supersedes
Old 3 constraint row "PM2 single fork … No leader lock" (the bot may run as several shard processes); 13.2 "Shared-card updates … `channel.messages.edit`" (now REST); 15 registration and restart safety; D55's caper half and 8.4 step 7's boot rule.

### 7.2 One job shard (A29)
- `src/utils/shard.ts` (new, shared): `isJobShard(client) = client.shard === null || client.shard.ids.includes(0)`. `discord.js` sets `client.shard` only under `ShardingManager`.
- `initScheduler` (`src/scheduler.ts:75-76`) calls `registerCrimeFamilyJobs(client)` and the turf seed only when `isJobShard(client)`. Every Crime Families cron lives in `CF_SCHEDULES` (`src/services/crimeFamily/scheduler.ts:115-134`), so this is one guard.
- In-process timers stay wherever the press ran: the GO settle timer (`caperFlow.ts:139-140`) and the trailing debounce. Both only render, and only the CAS winner of a state change renders (`resolvedNow`, the Start CAS, the vote close CAS), so a timer on shard 3 and the sweeper on shard 0 cannot double a post.
- Redis keys are shared by all shards, so the lobby-DM cap and the debounces work across processes.

### 7.3 REST seam (A28)
`src/utils/restMessages.ts` (new, shared):
- `restSend(client, channelId, payload): Promise<string>`: builds `{ body, files }` with `MessagePayload.create({ client } as MessageTarget, payload).resolveBody().resolveFiles()` (the payload builder reads only `target.client` for a non-webhook, non-interaction target: `node_modules/discord.js/src/structures/MessagePayload.js:142-179`, `:270-275`), then `client.rest.post(Routes.channelMessages(channelId), { body, files })` and returns the message id.
- `restEdit(client, channelId, messageId, payload): Promise<void>`: the same body through `client.rest.patch(Routes.channelMessage(channelId, messageId), …)`.
- Both throw `DiscordAPIError`, whose `code` is the same 10003/10008/50001/50013 that `post.ts` maps to "dead".

`sendToChannel` and `editChannelMessage` (`src/ui/crimeFamily/post.ts:24-49`) call the seam; `fetchPostable` (`:17-21`) is removed. Every family card writer already goes through those two functions (caper card, war boards, payday card, claim notice, invite card, vote card). Interaction replies keep using the interaction. The cache is still read only where an interaction guarantees the guild is local: `pickLobbyChannel` and `!crew home` (`missingBotPermissions`).

DMs already use REST (`client.users.fetch` + `user.send`, `src/services/dmNoticeService.ts:26-34`) and work from any shard.

### 7.4 What a sharded deploy must not double
| Post or DM | Single writer |
|---|---|
| Lobby card, GO call, GO DMs | the Start CAS winner |
| Heist result card, trade log | `resolvedNow` (the `SETTLING → RESOLVED` CAS) |
| War boards (first post, repost), war-soon DMs, war result | `tickWars` on the job shard; `claimWarnSoon` and the settle CAS |
| Payday card and DMs | the reserving caller; resumed shares DM once each (`paid` CAS) |
| Invite expiry edits, application expiry DMs | `sweepInvites` on the job shard, per-row CAS |
| Claim notice | `markClaimNotice` CAS |
| Vote card, vote DMs | the `announced` CAS winner (the starter, else `sweepVotes`); the `resultAnnounced` CAS winner (the closer or chair mover, else `sweepVotes`) |
| Officer digests | the `appDigestAt` CAS |
| Neglect and release DMs | `collectRacket`'s CAS |

### 7.5 Restart VOID from Mongo (A30)
```prisma
model BotProcessBoot {
  id       String   @id @default(auto()) @map("_id") @db.ObjectId
  shardIds Int[]                              // [] when unsharded
  bootedAt DateTime @default(now())
  @@index([bootedAt])
}
```
Every process writes one row in its `ready` handler before `initScheduler`. `resolveCaper` (`caperSettleService.ts:63-79`) replaces `bootedAt > caper.startedAt` (`:71`) with "a seat is unlocked and `botProcessBoot.count({ where: { bootedAt: { gt: caper.startedAt } } }) > 0`". `processBootedAt()` and the `bootedAt` parameters are removed; tests seed boot rows instead. A boot after `goEndsAt` but before the sweep can void a run that was not hurt; that costs only a refund and is accepted (no money is minted by a VOID).

Wars keep `maxTickGapSeconds`, measured by the job shard's ticks. A non-job shard restarting during a war does not cancel it: its members can act from a DM (shard 0) or another server.

### 7.6 Tests
- `test/crimeFamily/sharding.test.ts` (new): `isJobShard` for `shard: null`, `{ ids: [0] }`, `{ ids: [0, 1] }`, `{ ids: [1] }`; `initScheduler` registers no `crimeFamily:*` task on shard 1 (spy on `cron.schedule`); `sendToChannel` and `editChannelMessage` post through `client.rest` for a channel whose guild is absent from `client.guilds.cache`, and a REST 10008 marks the board dead.
- `test/crimeFamily/fakeClient.ts` gains a `rest` double (`post`, `patch`) recording calls; `channels.fetch` is no longer used by family code.
- `test/anticheat/caper-settle.race.test.ts`: VOID from a `BotProcessBoot` row written by another "process" (shard 3) during GO; no VOID when every seat locked; no VOID from a boot before Start.

### 7.7 Outside this spec (repo-wide, not changed here)
The non-family jobs in `src/scheduler.ts:14-79` (banking, raids, card settlement, reminders, market expiry) and slash registration in `src/index.ts` also run in every shard process; they need the same `isJobShard` guard before the bot is sharded. `logToChannel` (`src/utils/discordLogger.ts:19`) fetches its log channel from the cache, so the heist trade log reaches `LOG_CHANNEL_ID` only from the shard that holds that guild. The `isJobShard` and REST seams are shared utilities so those follow-ups reuse them.

---

## 8. Change 7: Recruitment board

### 8.1 Supersedes
D67 ("no apply flow in v1") and the S1 hint; extends 6.4 (a second way to join, same path), 13.1 (`/crew` choices), 13.4 (DM type `recruit`), 14.1 (`Family` and `FamilyInvite` fields).

### 8.2 Listing
| Field | Rule | Who |
|---|---|---|
| Recruiting | on/off; turning on needs a pitch | Boss, Underboss |
| Pitch | 10–150 characters after whitespace collapse, `checkPublicText` (§8.6) | Boss, Underboss |
| Min net worth | 0–10,000,000,000; accepts `10m`, `2.5b` (the bid parser rules, `bidService.ts:105-115`) | Boss, Underboss |
| Min lifetime shifts | 0–5,000 (`User.shiftsWorked`) | Boss, Underboss |
| Min Fortuna account age | 0–730 days (`User.createdAt`) | Boss, Underboss |
| Min lifetime crew heists | 0–1,000 (`count(CaperCrew{userId, started:true})`, any family, ever) | Boss, Underboss |

Empty requirement inputs mean 0. The board shows a family only while `recruiting` is true and `memberCount < memberCap(level)` (a full family disappears and comes back on its own). Turning recruiting off refuses new applications; pending ones can still be accepted or declined.

### 8.3 Board and family card
- **Board (S29):** 6 families per page, sorted by **Level** (level desc, then members desc, then created asc), **Members** (memberCount desc, level desc), or **Activity** (`activeMembers` desc from the census, memberCount desc). The **I qualify** toggle keeps only families whose four requirements are all ≤ the viewer's stats and shows nothing (with the reason) when the viewer fails the base `family_join` gate. Stats for the filter: `getNetWorth` (the 600 s display cache; A33, it is not a gate), `shiftsWorked`, account age, lifetime heists. Queries use the three `@@index([recruiting, …])` indexes; "not full" is an `OR` of 10 `{ level, memberCount: { lt: cap } }` clauses.
- **Family card (S30):** pitch (markdown-escaped), level, league, members/cap, active members, and each requirement with the viewer's value and ✓/✗, plus the base join gates summary (✓ or the first failing gate). Apply is enabled only when everything passes and §8.4's caps allow.

### 8.4 Applying
Apply opens the modal (one paragraph input, 1–200 characters, `checkPublicText`). On submit, one `runFamilyTx`:
1. `touchFamily` (serialises the family's 25-pending cap) and `touchUser(tx, applicantId, now)` (new beside `touchFamily` in `tx.ts`; writes `User.updatedAt` so one applicant's concurrent applies conflict, A35).
2. Refuse when: the applicant is in a family; fails `checkMemberEligibility(uid, "family_join", { familyId })` (hop and rejoin cooldowns included); fails a requirement (net worth via `computeNetWorth`, uncached); the family is not recruiting or is full; the applicant has 3 PENDING applications; the family has 25 PENDING applications; an application of this applicant to this family was DECLINED with `resolvedAt ≥ now − 7 d` (`reapplyAfterDeclineSeconds`); an application of this applicant to this family was WITHDRAWN or EXPIRED with `resolvedAt ≥ now − 24 h` (`reapplyAfterWithdrawSeconds` 86,400, A44: "You can apply to [TAG] again <t:R>."). Both reads are one `familyInvite.findFirst({ familyId, inviteeId, kind:"APPLICATION", OR:[{status:"DECLINED", resolvedAt:{gte}}, {status:{in:["WITHDRAWN","EXPIRED"]}, resolvedAt:{gte}}] })` inside this transaction (the family and User touches serialise it with any concurrent withdraw or apply). Rows WITHDRAWN by `joinFamilyInTx` (the applicant joined elsewhere) also count; leaving that family costs the hop cooldown, which is longer.
3. `familyInvite.create({ kind:"APPLICATION", inviterId:"", inviteeId:applicant, message, status:"PENDING", slot:"PENDING", guildId, channelId, expiresAt: now + 72 h })`. A P2002 on the existing `[familyId, inviteeId, slot]` index (an invite or application already pending for the pair) → "You already have a pending invite or application with this family."

Withdraw (S33): CAS PENDING → `WITHDRAWN`, `slot = id`, `resolvedAt = now`, no DM. The S33 line and S30 status then show "reapply <t:R>" (24 h).

### 8.5 Reviewing and the shared join path (A34)
- `joinFamilyInTx(tx, { familyId, uid, inviterId, now })` is extracted from `acceptInvite` (`membershipService.ts:103-139`, steps 2–5 of old 6.4): the `family_join` gate, `assertJoinCaps` (with `alreadyAccepted = 1`), the lowest free seat, the member row, `memberCount + 1`, `touchFamily`, and then the applicant's other PENDING applications → `WITHDRAWN` (one CAS per row, at most 2). `acceptInvite` and `acceptApplication` both call it inside their CAS transactions; the seat-collision retry loop wraps both.
- **Accept** (`crew:ap:accept:<appId>:<ownerId>`): re-read the officer (`review_apps`), CAS `familyInvite.updateMany({ id, kind:"APPLICATION", status:"PENDING", expiresAt:{gt:now} }) → { status:"ACCEPTED", slot:id, inviterId:officer, resolvedAt:now }`, then `joinFamilyInTx`. Any refusal rolls the application back to PENDING and names the gate. `assertJoinCaps` counts ACCEPTED rows of both kinds by `inviterId` (the accepting officer) and by family, so applications use the same 3-per-officer and `max(5, ceil(cap/3))`-per-family weekly caps.
- **Decline** (`crew:ap:decline:<appId>:<ownerId>`): CAS PENDING → DECLINED, `slot = id`, `inviterId = officer`, `resolvedAt = now`.
- **Expiry:** `expireInvites` (`membershipService.ts:241-252`) already moves every past-due PENDING row to EXPIRED; `sweepInvites` sends the applicant DM for `kind:"APPLICATION"` rows and edits S4 cards for invites.
- **Kind-scoped reads:** `listPendingInvites` and `pendingInviteFromTag` (`:141-147`, `:175-187`), the 5-pending-invites count in `inviteMember` (`:59`) and S24 filter `kind:"INVITE"`. `removeMember`'s cleanup of the leaver's sent invites (`:202`) only matches `inviterId = leaver`, which an application never has while PENDING.
- **Disband:** the existing "PENDING invites → EXPIRED" step covers applications; applicants get the expiry DM.

### 8.6 `checkPublicText(raw, { min, max })` (A37)
In `src/services/crimeFamily/names.ts`, used by the pitch and the application message:
1. Trim; collapse every run of whitespace (newlines included) to one space; enforce `min..max`.
2. Refuse mentions and pings: `/<@[!&]?\d+>|<#\d+>|@everyone|@here/i`.
3. Refuse links and invites: `/(https?:\/\/|www\.|discord\.gg|discord(app)?\.com\/invite|dsc\.gg|\]\()/i`.
4. Refuse any `FAMILY_NAME_SLURS` entry found **per word** (A37, needs owner sign-off): split the collapsed text on spaces; fold each word on its own (lowercase, strip non-alphanumerics, the `names.ts:17-20` fold); then join every run of two or more consecutive one-character folded words into one extra word ("n i g g e r" → "nigger"); refuse when any word contains a slur as a substring. Folding the whole sentence at once, as `isDenied` does for a 24-character name, joins neighbouring words and invents matches: "don't be a nerd" → "dontbeanerd" (beaner), "go ok" → "gook", "we are tardy" → "wearetardy" (retard), "much inky" → "muchinky" (chink). Names and tags keep `isDenied` unchanged.
5. Refuse `PITCH_DENYLIST = ["fortuna", "admin", "staff", "mod", "moderator", "discord"]` as whole words on the lowercased text (impersonation). The rest of the name denylist (`here`, `everyone`, `street`, `police`, `cops`) is not applied: rule 2 covers the mention forms and the others are ordinary words in a pitch.
Rendering always passes the text through `escapeMarkdown`.

### 8.7 Data model
- `Family`: `recruiting Boolean @default(false)`, `recruitPitch String @default("")`, `recruitMinNetWorth Float @default(0)`, `recruitMinShifts Int @default(0)`, `recruitMinAgeDays Int @default(0)`, `recruitMinHeists Int @default(0)`, `recruitEditedAt DateTime @default(now())`, `appDigestAt DateTime @default(now())`; `@@index([recruiting, level])`, `@@index([recruiting, memberCount])`, `@@index([recruiting, activeMembers])`.
- `FamilyInvite`: `kind String @default("INVITE")` (INVITE|APPLICATION), `message String @default("")`; status adds `WITHDRAWN`; `@@index([familyId, kind, status, createdAt])`, `@@index([inviteeId, kind, status])`.

### 8.8 Commands and customIds
| Surface | Behaviour |
|---|---|
| `!crew board` (choice `board`) | posts S29 (public, owner-scoped buttons) |
| `!crew board <TAG>` | posts an S27 opener for that family's S30 |
| `!crew recruit` (choice `recruit`) | S27 opener for S31 (Capo+) |
| S1 "Find a family", S2 "Recruit" | S29 / S31, ephemeral |

`/crew` choices become 24 of 25 (`board`, `recruit`, `vote` added to the 21 at `src/slash/registry.ts:244-245`).

| customId | Scope | Length |
|---|---|---|
| `crew:bd:<lvl\|mem\|act>:<0\|1>:<page>:<ownerId>` | owner | ≤ 38 |
| `crew:bd:sel:<ownerId>` (value = familyId) | owner, ephemeral S30 | 32 |
| `crew:fc:<familyId>:<ownerId>` | owner | 53 |
| `crew:app:open:<familyId>:<ownerId>` (modal opener) | modalOpener | 59 |
| `crew:modal:apply:<familyId>:<ownerId>` | owner | 62 |
| `crew:app:mine:<ownerId>`, `crew:app:wd:<ownerId>` (select, value = appId) | owner | ≤ 34 |
| `crew:rc:<home\|toggle\|inbox>:<ownerId>`, `crew:rc:edit:<ownerId>` (modal opener), `crew:modal:recruit:<ownerId>` | owner; permission re-read | ≤ 39 |
| `crew:ap:<accept\|decline>:<appId>:<ownerId>`, `crew:ap:pg:<page>:<ownerId>` | owner; `review_apps` re-read | ≤ 61 |

### 8.9 Screens
| # | Screen | Visibility | Components |
|---|---|---|---|
| S29 | Board: Container[Text header (sort, filter, page x/y), Sep, Text ≤ 6 family lines (crest, `[TAG] Name`, L + league, members/cap, active, requirements, ✓ when the viewer qualifies), SelectRow(open a family ≤ 6) 2, Row(Level, Members, Activity, I qualify) 5, Row(Prev, page, Next, My applications, Back) 6] | public from `!crew board`, ephemeral from S1 | **17**; no results → 15 |
| S30 | Family card: Container[Section(header + crest thumbnail) 3, Sep, Text pitch, Text requirements with ✓/✗ and the viewer's values, Text status (pending x/3, "applied <t:R>", "reapply <t:R>"), Row(Apply…, My applications) 3] | ephemeral | **11** |
| S31 | Recruitment panel: Container[Text header (on/off), Sep, Text pitch and requirements, Text inbox summary (N/25 pending), Row(Recruiting on/off, Edit listing…, Applications (N), Back) 5] | ephemeral; edit buttons disabled for Capos | **10** |
| S32 | Inbox, 5 per page: Container[Text header, Sep, 5 × (Text applicant, applied/expires, message, live ✓/✗ stats; Row(Accept, Decline) 3), Row(Prev, page, Next, Back) 5] | ephemeral | **28** |
| S33 | My applications: Container[Text header, Text ≤ 3 lines (family, status, expires), SelectRow(withdraw ≤ 3) 2, Row(Board, Back) 3] | ephemeral | **8** |
| M1 | Apply modal: 1 paragraph input | modal | — |
| M2 | Listing modal: pitch (paragraph, 150), min net worth, min shifts, min age days, min heists (5 inputs, the modal maximum) | modal | — |

### 8.10 DM notices (new opt-out type `recruit`, A36)
`DM_NOTICE_TYPES` gains `recruit: { label: "Family applications", group: "account" }` (no `command`). Settings panel: account group 6 → 7 types (rows 4 + 3), panel 30 → **31** (on) and 31 → **32** (off), under the `< 35` bound (`test/dm/settings.test.ts:39-40`).

| Notice | Trigger | Recipients | Components |
|---|---|---|---|
| "N new applications to [TAG]" + Row(Open inbox `crew:rc:inbox:<officerId>`) | hourly digest: PENDING applications created after `appDigestAt`, and `appDigestAt ≤ now − 6 h`; CAS `appDigestAt` then send | every Capo, Underboss and Boss | 8 |
| "Application accepted: you joined [TAG]" | accept | applicant | 6 |
| "Application declined" (reapply after <t:R>) | decline | applicant | 6 |
| "Application expired" | sweeper | applicant | 6 |

At most 4 digests per family per day.

### 8.11 Edge cases
| # | Case | Expected |
|---|---|---|
| 1 | Four applies by one player, same second, four families | 3 commit; the 4th's retry sees 3 PENDING (User touch). |
| 2 | 26 applicants to one family at once | 25 commit (family touch). |
| 3 | Two officers accept the same application | Status CAS: one joins the player, the other "Application no longer pending." |
| 4 | A player with 2 pending applications is accepted by both families at once | `FamilyMember.userId @unique`: one membership; the other rolls back to PENDING, then is WITHDRAWN by the winner's transaction or fails "Already in a family". |
| 5 | Accept when the family is full | "Family is full."; stays PENDING until expiry. |
| 6 | Accept while the applicant is jailed or on a hop cooldown | The join gate names it; stays PENDING. |
| 7 | Decline, then reapply on day 6; or withdraw (or let it expire), then reapply after 2 h | Decline: refused with the date, day 7 allowed. Withdraw or expiry: refused until 24 h after `resolvedAt` (A44), so one player cannot cycle messages into an inbox faster than one a day per family. |
| 8 | An officer invites a player who has a pending application | "<@x> already applied: accept it in the inbox." |
| 9 | Pitch "Join us at discord.gg/abc" or "@everyone welcome" | Refused naming the rule. |
| 10 | Applicant passes the requirements at apply, then moves their money away | Inbox shows ✗ live; the officer decides. |
| 11 | Family disbands with 25 pending applications | All EXPIRED in the disband transaction; 25 applicant DMs. |

### 8.12 Tests
- `test/crimeFamily/recruit-text.test.ts` (new, pure): every `checkPublicText` rule, including "where" and "there" passing and "Fortuna staff family" failing; the cross-word false positives "don't be a nerd", "go ok", "we are tardy" and "much inky" passing; "n i g g e r" (joined single-character run) and "n.i.g.g.e.r" (one word, punctuation folded away) failing.
- `test/anticheat/family-recruit.race.test.ts` (new): edge cases 1–7 and 11 (7 also: withdraw then apply within 24 h refused, at 24 h allowed; expire then apply likewise; a withdraw racing an apply to the same family); join caps counted across invites and applications; `memberCount` after accepts.
- `test/crimeFamily/recruit-board.test.ts` (new, DB): sorts, paging, the not-full filter at every level, I qualify with each requirement failing alone.
- `test/dm/family-notice.test.ts`: `recruit` has no `command`; digest CAS sends once per 6 h; settings 31/32.
- Fixtures: S29 (6 families, longest names and requirement numbers), S30, S31, S32 (5 applications with 200-character messages), S33, the four DM containers.

---

## 9. Change 8: Rename "Caper" to "Crew Heist"

### 9.1 Supersedes
D7 (the job's name and `!caper`), Q2, old 13.1 `!caper` row, 13.4 labels, 19.3 copy, 23 "Caper".

### 9.2 Rules
- Commands: `!heist` is the command; `normalizeCommand` (`src/commandRouter.ts:196-199`) maps `crewheist`, `caper` and `capers` to `heist`; `case "heist":` replaces `case "caper":` (`:573-576`); the did-you-mean list (`:642`) says `heist`. Slash: the spec at `src/slash/registry.ts:252` becomes `name: "heist", desc: "Crew heists: plan, join and play with your family"`; choices unchanged; slash count stays 73; `validate:slash` passes on the literal case label.
- Copy: every player-visible string says "Crew Heist" (feature title) or "crew heist(s)": S1, S2's button ("Crew Heist"), S11–S15, S25, S27, S28, every refusal in `caperLobbyService.ts`, `caperPlayService.ts`, `caperQueries.ts`, `caper.ts` and the caper routes, the activity rule label (`src/services/crimeFamily/caperHooks.ts:25`, "crew heist seats"), the payday reasons, `turfNeglectNotice` ("play two crew heist seats"), ledger labels (`familyScreens.ts:204`, "Crew heist cut"), the DM notices ("Crew heist lobby open", "Crew heist GO"), the guild trade-log entry (`src/ui/crimeFamily/caperFlow.ts:189`, title "Caper resolved" → "Crew heist resolved"; it shows in the server's log channel), help, tutorial, website and docs.
- DM preference labels (`src/services/dmPrefsService.ts:19`, `:27`): `caper: { label: "Crew heist", command: "!heist", group: "cooldown" }`, `caper_lobby: { label: "Crew heist lobby", group: "account" }`. The keys stay.
- Unchanged: models, `cpr:` ids, files, functions, Redis keys, `caper_*` ledger and transaction types, art keys, and the solo `!crime` board's "Legendary heist" tier (`src/commands/economy/crimeUi.ts:163`).
- The four lobby banners keep their painted "FORTUNA'S CAPERS" placard (A38).
- Plan 4 Task 1 does the rename across code, tests, fixtures, help, tutorial, website, `FORTUNA_V2_ECONOMY.md` and the changelog, so every later task pins the new copy.

### 9.3 Tests
`test/crimeFamily/rename-copy.test.ts` (new): every worst-case fixture payload, every DM builder, every `logToChannel` payload family code sends (the heist trade log, captured by a spy on `logToChannel` in a settled-heist run), the help category, the tutorial lesson, the slash specs and the dashboard module/commands content contain no `/\bcapers?\b/i` outside `customId`, emoji and attachment names; `/heist` exists and `/caper` does not; `!heist`, `!crewheist`, `!caper`, `!capers` all route to the heist handler; `!crime` still renders "Legendary".

---

## 10. Economy

All figures use the old spec's assumptions (p = 0.90, edge 0.10, every seat locks; perfect play p = 1.0 with best gear) and its per-seat tables (old 8.6, 8.10), which this amendment does not change.

### 10.1 Per-player income by band (supersedes old 11.1)
| Band | Band income/day | League, family | Heists/day (cap) | Heist net/day | Payday net/day | Feature total/day | Share of band floor |
|---|---|---|---|---|---|---|---|
| Week 1 | 1–1.5M | none (14-day Fortuna gate) | — | 0 | 0 | 0 | 0% |
| Weeks 2–4 | 3–6M | Bronze, L3, 14 members, T1 n=4, 1 Bronze Crown | 5 (20 seats for 28) | 205,276 average – 287,386 (both seats) | 0 – 46,404 | 205,276 – 333,790 | 6.8–11.1% |
| Month 2+ (Silver) | 8–15M | Silver, L5, 18 members, T3 n=6, Crown + District | 6 (36 seats) | 487,836 | 0 – 135,714 (cap) | 487,836 – 623,550 | 6.1–7.8% |
| Month 2+ (Gold) | 8–15M | Gold, L8, 25 members, T4 n=6, Crown + 2 Districts | 9 (54 seats) | 551,584 | 0 – 135,714 (cap) | 551,584 – 687,298 | 6.9–8.6% |
| Month 2+ (Gold, max size) | 8–15M | Gold, L10, 30 members, T4 n=6 | 10 (60 seats) | 551,584 | 0 – 135,714 (cap) | 551,584 – 687,298 | 6.9–8.6% |
| Any band, perfect play | — | as the Gold rows, p = 1.0, best gear | — | 1,049,600 | 135,714 | 1,185,314 | 14.8% of the Month 2+ floor |

Derivations (pay-out case, earnings not spent on levels):
- **Weeks 2–4:** heist net 143,693 per seat × 20 seats ÷ 14 members = 205,276. Inflow = 5 × 100,769 + 300,000 − 120,000 = 683,845/day = 4,786,915/week; gross = floor(4,786,915 / 14) = 341,922; tax 17,096; net 324,826/week = 46,404/day. Old: 287,386 – 356,626 (9.6–11.9%).
- **Silver:** inflow = 6 × 320,132 + 1,300,000 − 200,000 = 3,020,792/day = 21,145,544/week; ÷ 18 = 1,174,752 → capped at 1,000,000 gross, 950,000 net = 135,714/day.
- **Gold L8:** inflow = 9 × 440,759 + 2,600,000 − 320,000 = 6,246,831/day = 43,727,817/week; ÷ 25 = 1,749,112 → capped.
- **Gold L10:** inflow = 10 × 440,759 + 2,600,000 − 400,000 = 6,607,590/day = 46,253,130/week; ÷ 30 = 1,541,771 → capped.

No row rises above the old spec's: the per-member payday is capped and per-member seats are capped, so a bigger family adds members, not income per member.

### 10.2 Dues (re-checked, unchanged)
Dues stay 40,000 × level. They now take a smaller share of a big family's inflow (L10, 30 members: 400,000 of 7,007,590 gross inflow, 5.7%; old L8 with 12 members: 320,000 of 3,713,036, 8.6%). This needs no change because surplus earnings above the payday cap can only be burned (bids, level fees, dues, rename) or burned at disband; none of it reaches a wallet (section 10.4).

### 10.3 Pacing (supersedes old 10.2's table)
Full roster at each level's cap, members passing each tier's gates, the heist cap at full roster (§2.2), tiers T1 at L1–2, T2 at L3–4, T3 at L5–7, T4 at L8+; no rackets, no payday. Same method as the old table (which this method reproduces: L3 day 18, L5 45, L8 105, L10 167).

| Level | Members | Heists/day | XP/day | Vault/day after dues |
|---|---|---|---|---|
| 1 | 10 | 4 | 447 | 363,076 |
| 2 | 12 | 4 | 447 | 323,076 |
| 3 | 14 | 5 | 792.5 | 813,635 |
| 4 | 16 | 6 | 951 | 960,362 |
| 5 | 18 | 6 | 1,182 | 1,720,792 |
| 6 | 20 | 7 | 1,379 | 2,000,924 |
| 7 | 23 | 8 | 1,576 | 2,281,056 |
| 8 | 25 | 9 | 2,169 | 3,646,831 |
| 9 | 28 | 10 | 2,410 | 4,047,590 |
| 10 | 30 | 10 | 2,410 | 4,007,590 |

| Level reached | By XP alone (day) | Deposits to keep the XP pace (cumulative) | With no deposits (day) | Old: XP alone / no deposits |
|---|---|---|---|---|
| L3 (T2) | 6.7 | 3.7M | 17.9 | 7 / 18 |
| L5 (T3) | 14.7 | 12.6M | 35.7 | 18 / 45 |
| L8 (T4) | 31.9 | 39.8M | 66.1 | 49 / 105 |
| L10 | 43.3 | 84.1M | 88.9 | 76 / 167 |

A full 30-member family levels faster than a full 12-member one because it has 2.5 times the players; per member the effort is the same. Fees (172,000,000) are unchanged.

### 10.4 Worst-case mint audit (supersedes old 11.4)
**30 accounts played by one person**, Gold league L10, perfect play (p = 1.0), best gear (edge 0.1333), T4 n=6, every day:
- Heists per rolling 24 h: max(4, ceil(30 / 3)) = **10**; seats 60 = 30 × 2 (each account's 2-seat cap is the binding limit).
- Minted per heist: crew 4,948,800 + vault 618,600 = 5,567,400. Per day: **55,674,000** (crew 49,488,000, vault 6,186,000).
- Burned per day: stakes 60 × 300,000 = 18,000,000; dues 400,000.
- Racket income: at most the Gold best holding, 2,600,000/day, and only while ≥ 3 members are racket-eligible.
- Vault inflow: 6,186,000 + 2,600,000 − 400,000 = 8,386,000/day = 58,702,000/week. Payday takes at most 30 × 1,000,000 = 30,000,000 gross/week (1,500,000 tax burned, 28,500,000 net); **28,702,000/week stays in earnings** and can only be burned.
- **Per account per day: 1,649,600 crew − 600,000 stakes = 1,049,600, plus payday 135,714 = 1,185,314**: 14.8% of the Month 2+ floor (8M), 7.9% of its ceiling. Identical to the old 12-account audit, so a bigger family gives an alt nothing.
- Gates per account are unchanged (300 lifetime shifts, 45 days Fortuna, 90 days Discord, 40M uncached net worth at join and at Start, a prep item, 72 h tenure), and the family must reach L10 (60,000 XP, 172,000,000 in fees). Every Start re-checks the six seats uncached, so each crew needs 240,000,000 of net worth across its six accounts at that moment (1,200,000,000 for all 30 accounts to be seat-eligible at once).

**Many cities.** Racket mint per day ≤ Σ leagues (OPEN cities × city total), with OPEN cities = max(1, ceil(active / 40)) plus at most the cities kept open by owned rackets or by the 14-day surplus rule.

| Active families (Bronze / Silver / Gold) | Cities | Racket mint ceiling/day | Per active family/day |
|---|---|---|---|
| launch (0 / 0 / 0) | 1 / 1 / 1 | 12,500,000 | — |
| 40 / 40 / 40 | 1 / 1 / 1 | 12,500,000 | 104,167 |
| 400 / 300 / 200 | 10 / 8 / 5 | 18,000,000 + 34,400,000 + 32,000,000 = 84,400,000 | 93,778 |
| 4,000 / 3,000 / 2,000 | 100 / 75 / 50 | 180,000,000 + 322,500,000 + 320,000,000 = 822,500,000 | 91,389 |

Per active family the racket ceiling tends to the city total ÷ 40: 45,000 (Bronze), 107,500 (Silver), 160,000 (Gold) per day, so racket income per family is flat as the player count grows, where the old fixed 6,400,000 thinned towards zero. Per family it never exceeds 300,000 / 1,300,000 / 2,600,000 per day (A25), and per member it reaches a wallet only through the capped payday.

### 10.5 Source and sink ledger changes (old 11.3)
| # | Flow | Change |
|---|---|---|
| S1, S2 | Heist crew cut, vault cut | bound: 2 seats/player/rolling 24 h; `max(4, ceil(members / 3))` heists/family/rolling 24 h |
| S3 | Racket income | ≤ 1,800,000 / 4,300,000 / 6,400,000 per OPEN city per day (Bronze / Silver / Gold); cities per league per §6.3; per family ≤ 300,000 / 1,300,000 / 2,600,000; needs ≥ 3 eligible members |
| T1 | Payday | two-phase (§2.4), same totals and cap |
| K9 | Winning war bid | floors per league (§6.5) |
| — | `league_move` racket release | nothing minted or burned; the partial cycle is forfeited (like a capture) |

Anti-goal 1 thresholds (D50) and the post-launch check (old 19.2) are unchanged. The check gains two read-only counts: OPEN cities per league and active families per league.

---

## 11. Consolidated surfaces

### 11.1 `CRIME_FAMILY_CONFIG` changes (`src/utils/economyConfig.ts:200-268`)
```ts
// removed: capersPerFamilyPer24h, joinsPerFamilyPer7d
heistCapMin: 4,
heistCapDivisor: 3,
capoPerMembers: 5,
capoMinNetWorth: 10_000_000,
underInvestigationMembers: 3,          // now the minimum
investigationDivisor: 4,
joinsPerFamilyPer7dMin: 5,
joinsPerFamilyDivisor: 3,
paydayShareResumeSeconds: 60,
voteSeconds: 172_800,
voteCooldownSeconds: 604_800,
voteBossGraceSeconds: 604_800,       // from FamilyMember.firstBossAt (A40)
voteOfficerGraceSeconds: 604_800,    // officerUntil after a demotion (A41)
voteAnnounceGraceSeconds: 60,        // sweeper announces a silent start or result (A42)
voteMinEligible: 3,
voteRenderDebounceSeconds: 2,
familiesPerCity: 40,
citySurplusDaysToClose: 14,
applicationTtlSeconds: 259_200,
maxPendingApplicationsPerApplicant: 3,
maxPendingApplicationsPerFamily: 25,
reapplyAfterDeclineSeconds: 604_800,
reapplyAfterWithdrawSeconds: 86_400,  // withdrawn or expired (A44)
appDigestEverySeconds: 21_600,
pitchChars: { min: 10, max: 150 },
applicationChars: { min: 1, max: 200 },
recruitLimits: { netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 },
boardPageSize: 6,
inboxPageSize: 5,
managePageSize: 15,
```
Catalog (`src/data/crimeFamilyCatalog.ts`): the member-cap row; `CAPO_SLOTS` ×6; `TURF_LEAGUES` (key, name, levels, city name, crest key); `LEAGUE_RACKET_INCOME`; `RACKETS` without `incomePerCycle`; `RACKET_CLASSES` without `minFamilyLevel`; `GateDef` without `guild`; `PITCH_DENYLIST`.

### 11.2 Commands
| Command | Change |
|---|---|
| `!crew` / `/crew` | adds `board [TAG]`, `recruit`, `vote [start]`; 24 of 25 choices |
| `!heist` / `/heist` | renamed from `!caper` / `/caper`; aliases `crewheist`, `caper`, `capers`; every subaction from any server |
| `!turf` / `/turf` | any server; resolves rackets in the family's city |

### 11.3 Screens added or changed (worst case; every row gets a fixture entry)
| # | Components | # | Components |
|---|---|---|---|
| S1 | 14 | S25 lobby / seated / war / vote | 4 / 4 / 7 / 5 |
| S2 | 20 | S29 | 17 |
| S5 | 16 | S30 | 11 |
| S6, S7, S8 | 12, 6, 6 | S31 | 10 |
| S11 | 11 | S32 | 28 |
| S14 open / dark | 12 / 6 | S33 | 8 |
| S16 | 20 | S34 / result | 7 / 3 |
| S17 | 11 | S35 | 6 |

The largest screen is S32 at 28. DM containers: lobby 8, GO 8, intel 8, war-soon 12, vote 9, digest 8. Settings panel 31/32.

### 11.4 Redis keys
One new key: `cf:render:vote:<voteId>` (2 s trailing debounce, fails open). Redis still guards no money, uniqueness, ballot, application or placement.

---

## 12. Docs deliverables
| Deliverable | Content |
|---|---|
| `src/commands/general/help.ts:286-338` | `heist` entry (aliases `crewheist`, `caper`, `capers`); `crew` entry lists `board`, `recruit`, `vote`; descriptions say any server and up to 30 members |
| `src/commands/general/tutorial.ts:175-180` | "a crew of 10 to 30 players"; `!heist`; `!crew board` |
| `dashboard/src/content/modules/crime-families.ts` | sizes (lines 11, 14, 115, 228-231), Capo cap and the 10M bar, the vote, the recruitment board, cross-server play and the intel relay (replacing "in one server", lines 256, 328-329, 340, and the war rule at line 568: "acting in their family's home server" and "!turf war … in the home server only" become any server the bot shares with them), the heist cap, leagues and cities with the income table, the census rule, two-phase payday wording; strategy section additions (share early, recruit by activity, when to move up a league) |
| `dashboard/src/content/commands.ts:247-288` | `heist` (id and aliases), `crew` usage; settings key numbers (`:77-78`) with the new labels and "family applications" |
| `dashboard/src/content/modules/crime-and-heat.ts:32` | "For crew jobs see Crime Families: Crew Heists." |
| `dashboard/src/app/changelog/page.tsx:143-157` | the unreleased v2.1 entry rewritten: "Crime Families and Crew Heists", 10–30 members, leagues |
| `FORTUNA_V2_ECONOMY.md:217-383` and Money Sinks `:384-396` | the Crime Families section: member caps, heist cap, Capo rule, vote, leagues and income table, sections 10.1, 10.3, 10.4, the ledger rows; all "caper" copy renamed |
| Old spec | one amendment line under its title (done with this document) |

## 13. Rollout

- **Flags unchanged.** `enabled` gates families, vault, heists, the vote and the board; `turfEnabled` gates rackets, wars, cities and placement. `allowGuildIds` still limits servers in stage A; DM presses follow `enabled` (A20).
- **Stage A and B** as in old 19.2. **Stage C** turns on `turfEnabled`: the boot seed has already created Low Town #1, Midtown #1 and Uptown #1 with their rackets; the first census after the switch places every active family; each city's first BIDDING windows open 72 h before each racket's war slot.
- **Unsharded today.** Every change runs identically with `client.shard === null`; sharding later needs no Crime Families change.
- **Schema and code ship together** per plan (one commit or merge commit; `deploy.yml` diffs `HEAD~1`). All new models are new collections; changed models have no documents (nothing deployed), so `prisma db push` needs no `--accept-data-loss`. Dropping `Racket.key @unique` and adding `@@unique([cityId, key])` happen on empty collections.
- **Plans** (A39), each with docs for its own part:
  - **Plan 4, Scale foundation.** Task 1: the rename (§9). Then member caps, `memberCount`, heist cap, join caps, investigation threshold; the two-phase payday; Capos; cross-server play, the intel relay and the DM cards; `isJobShard`, the REST seam and `BotProcessBoot`.
  - **Plan 5, Governance and recruiting.** The no-confidence vote; the recruitment board, applications, inbox, digest and the `recruit` DM type.
  - **Plan 6, Turf leagues.** Cities, the census, placement, per-league income, league-changing level-ups, the city pager, closures.
- Tests run on memory-server Mongo and Redis on 6381 (`MONGOMS_SYSTEM_BINARY= npx vitest run --exclude '.claude/**' --exclude 'node_modules/**'`); nothing runs against `.env`.

---

## Appendix A. Prisma diff (one place)

```prisma
model Family {
  // … existing fields (old 14.1) …
  memberCount        Int      @default(1)
  cityId             String   @default("")
  activeMembers      Int      @default(0)
  censusAt           DateTime @default(now())
  recruiting         Boolean  @default(false)
  recruitPitch       String   @default("")
  recruitMinNetWorth Float    @default(0)
  recruitMinShifts   Int      @default(0)
  recruitMinAgeDays  Int      @default(0)
  recruitMinHeists   Int      @default(0)
  recruitEditedAt    DateTime @default(now())
  appDigestAt        DateTime @default(now())
  @@index([cityId])
  @@index([level, activeMembers])
  @@index([recruiting, level])
  @@index([recruiting, memberCount])
  @@index([recruiting, activeMembers])
}

model FamilyMember {
  // roleSlot: "BOSS"|"UNDERBOSS"|"CAPO1".."CAPO6"|userId; seat 1..30
  bossedOnce   Boolean  @default(false)     // CAS: firstBossAt written once (A40)
  firstBossAt  DateTime @default(now())     // read only with bossedOnce:true
  officerUntil DateTime @default(now())     // start_vote after a demotion out of Underboss/Capo (A41)
}

model FamilyInvite {
  // … existing fields …
  kind    String @default("INVITE")      // INVITE|APPLICATION
  message String @default("")
  // status: PENDING|ACCEPTED|DECLINED|EXPIRED|WITHDRAWN
  @@index([familyId, kind, status, createdAt])
  @@index([inviteeId, kind, status])
}

model CaperCrew {
  // … existing fields …
  sharedIntel Boolean  @default(false)
  sharedAt    DateTime @default(now())   // read only with sharedIntel:true
  relayed     Boolean  @default(false)   // display only
  @@index([started, startedAt])          // the census groupBy (§6.4)
}

model WarHit {
  @@index([state, createdAt])            // the census groupBy (§6.4)
}

model Racket {
  // key: no longer @unique
  cityId          String @db.ObjectId
  league          String
  openedPeriodKey String @default("")
  @@unique([cityId, key])
  @@index([cityId])
  @@index([key, openedPeriodKey])
}

model War {
  cityId String @db.ObjectId
  @@index([cityId, status])
}

// New: PaydayShare (§2.4), FamilyVote and FamilyBallot (§4.4), TurfCity and CfJobRun (§6.7), BotProcessBoot (§7.5).
```
Every new filtered field is required with a sentinel or default. The only array fields (`eligibleIds`, `shardIds`) are never filtered.

## Appendix B. Scheduled jobs (old 15, changes only; all registered only on the job shard)

| Schedule | Function | Work | Guard |
|---|---|---|---|
| `* * * * *` | `sweepVotes` (new) | close OPEN votes with `closesAt ≤ now` (§4.3); announce votes whose start (`announced:false`) or result (`resultAnnounced:false`) is older than 60 s | status CAS; chair CAS; `announced` / `resultAnnounced` CAS |
| same | `resumePaydayShares` (new) | pay `paid:false` shares older than 60 s | per-share `paid` CAS |
| same | `sweepInvites` (changed) | also expires applications and DMs their applicants | per-row status CAS |
| same | `sweepCapers` (changed) | VOID reads `BotProcessBoot` | unchanged CASes |
| same (turf) | `tickWars` (changed) | step 1 per racket key over OPEN cities, once per racket per week | `openedPeriodKey` + War upsert |
| `10 * * * *` | `sendApplicationDigests` (new) | officer digests | `appDigestAt` CAS |
| same | `runTurfCensus` (new) | once per UTC day: `activeMembers`; when `turfEnabled`: cities and placement | `CfJobRun.dayKey`; idempotent steps |
| boot (job shard) | `seedTurf` (replaces `seedRackets`) | ensure city #1 per league; upsert every city's 10 racket definitions by `[cityId, key]`, never touching owner, timers or strikes | upserts |
| boot (every process) | `recordProcessBoot` (new) | one `BotProcessBoot` row | insert |
