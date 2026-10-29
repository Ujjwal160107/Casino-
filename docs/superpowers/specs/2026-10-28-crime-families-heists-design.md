# Crime Families + Capers (the family heist): Product Requirements

- **Date:** 2026-10-28
- **Status:** Approved by the owner on 2026-10-29, with Q1–Q4 (section 22) settled on their defaults
- **Repo:** `/home/ujjwal/dev/Casino-` (Fortuna: discord.js v14, TypeScript, Prisma on MongoDB, ioredis, node-cron, node `canvas`, vitest)
- **Companion docs:** `DESIGN.md` (repo-wide asset style guide, read-only for this PRD), `FORTUNA_V2_ECONOMY.md` (balance source of truth)
- **Supersedes:** nothing. Builds on `docs/superpowers/specs/2026-06-21-crime-module-overhaul-design.md` and `2026-06-21-crime-minigames-design.md` without changing the solo crime board.

Conventions in this document:
- Every number is final. Every number lives in one config object, `CRIME_FAMILY_CONFIG` (section 19.2), so tuning never touches logic.
- "Author" in the Decisions table means the PRD author chose it; the owner can overrule any row before build.
- Money is in Fortunes (the global currency, `GLOBAL_CURRENCY_NAME`, `src/config/branding.ts`). "Burned" means removed from the economy with no recipient. "Minted" means created by the bot.
- File citations are `path:line` against the tree at commit `6b2d836`.

---

## 0. Summary

1. **Crime Families** adds a social crime endgame: players found a named family with a tag, ranks and a shared vault. Membership, vault and payday are global (economy is global per `discordId`); live play is guild-local: a caper seat is taken in the lobby's server and war actions in the family's home server, so every crew shares one chat.
2. The family's multiplayer heist is called a **Caper**, because "Legendary heist" is already the solo board's top tier and `HEIST` is already a `CrimeTag` (`src/data/crimeCatalog.ts:8`).
3. A Caper is a 10-minute lobby plus a 120-second **GO** phase. Each seat holds intel another seat needs (the **intel ring**), so the crew must talk. Outcomes are Clean, Messy or Bust.
4. Families fight over 10 fixed **Rackets** (classes Corner, District, Crown) that pay protection income into the family vault. Rackets change hands in a weekly 60-minute **Turf War** decided by scouting and skill-checked hits, with a blacked-out last 10 minutes. Every defender starts each block at the class baseline.
5. The vault has two buckets. **Treasury** (member deposits) can never be withdrawn. **Earnings** (minted family income) leave only through a weekly, equal, capped **Payday** (max 1,000,000 gross per member per week).
6. Nothing prints money: every source is capped (2 caper seats per player per rolling 24h, 4 capers per family per rolling 24h, 6,400,000/day of racket income bot-wide), every flow is taxed or burned, and no shop buff multiplies family income.
7. Anti-alt gates are non-transferable: lifetime `User.shiftsWorked` (20/60/150/300 by tier), Fortuna account age, Discord account age, 72h family tenure. Net worth is a secondary gate, always computed uncached.
8. All correctness lives in Mongo (compare-and-swap on required fields, sentinels instead of nulls). Redis only debounces renders, activity writes and lobby DMs. No tester bypass applies to any family state.
9. Every screen is ComponentsV2; the largest is 18 components. 24 new 160x160 pixel icons become `cf_` application emojis; 1 mascot and 9 banners come from the AI prompt pack. Icons are rendered by a new `src/scripts/generatePixelAssets.ts` from grids traced off AI reference renders.
10. Rollout is staged behind `CRIME_FAMILY_CONFIG.enabled` / `turfEnabled`: families, vault and capers first; rackets and wars two weeks later.

### Decisions

| # | Decision | Who decided | Rationale |
|---|---|---|---|
| D1 | Build Crime Families with a multiplayer heist | Owner | Owner request. |
| D2 | Every UI surface is ComponentsV2 | Owner | Owner constraint; repo house style (`src/utils/componentsV2.ts`). |
| D3 | New art in the existing 8/16-bit style, saved in `src/assets`, and used | Owner | Owner request. |
| D4 | New icons become application emojis and are used in the UI | Owner | Owner request. |
| D5 | A repo-wide asset guide (`DESIGN.md`) governs all art | Owner | Owner request; written this run. |
| D6 | `src/utils/shopCatalog.ts` and `src/services/shopItemEffects.ts` are not changed | Owner | Owner constraint. |
| D7 | The family job is named **Caper**; commands are `!crew`, `!caper`, `!turf` | Author | `!family` is marriage (`src/commandRouter.ts:568-573`, `src/slash/registry.ts:234`); "heist" is the solo legendary tier (`src/commands/economy/crimeUi.ts:163`). `cf` is coinflip (`src/commandRouter.ts:172`). |
| D8 | Capers do not reuse the solo minigame catalog; they use a new server-randomised intel ring | Author | Each solo stage's correct option is a fixed label in `src/data/crimeMinigameCatalog.ts`; buttons are shuffled per run (`src/services/crimeRunService.ts:49-51`) but the label can be memorised. Capers need a per-run random answer. |
| D9 | A seat is **dark** if its member has not opened the brief before GO−30s. A dark seat cannot lock a choice (it is a miss); from GO−30s the seat it holds intel for sees that intel "leaked". No patrol penalty. | Author | One AFK member costs one miss, not a cascade. Fixing darkness at GO−30s stops a crew from staying dark on purpose to read every answer (a dark seat is a guaranteed miss). |
| D10 | Bust needs k ≥ 2 misses for crews of 3–4 and k ≥ 3 for crews of 5–6 | Author | Large crews tolerate one AFK plus one mistake. |
| D11 | Two-bucket vault: treasury never withdrawable; earnings leave only via Payday | Author | Closes the marriage-vault laundering loop (`src/services/life/marriageService.ts:229-373`). |
| D12 | Vault spends draw **earnings first**, then treasury | Author | A deposit can never "free" minted earnings for Payday. |
| D13 | Payday is capped at 1,000,000 gross per member per payday (one payday per 7 days) | Author | Bounds alt feeding and small-family racket concentration. |
| D14 | 5% deposit tax and 5% payday tax, computed inline from `TAX_CONFIG.transferTaxRate`, never through `applyTransferTax` | Author | Tax Shield skips `applyTransferTax` (`src/services/shopBuffs.ts:52-55`); the vault must not be a cheaper transfer channel. |
| D15 | The vault is not robbable, not raided, and excluded from net worth and the leaderboard | Author | Marriage precedent; avoids multiplying wealth per member (`src/services/netWorthService.ts:25-105` unchanged). |
| D16 | Creation costs 10,000,000 (burned) and needs NW ≥ 15,000,000, 60 shifts, Fortuna ≥ 30d, Discord ≥ 180d | Author | A flat sink and a commitment signal, about one day of Month 2+ income (`FORTUNA_V2_ECONOMY.md:34`). Founding earns nothing membership does not, so no payback is claimed; the grind is the 172M of level fees (10.1). |
| D17 | Lifetime `shiftsWorked` gates per tier: 20/60/150/300, plus Fortuna age 14/30/30/45 days | Author | Non-transferable; net worth alone can be pushed to an alt for 5% or a 10k Tax Shield. T2 waits for day 30 so the Weeks 2–4 band holds only T1 (11.1). |
| D18 | Seat cap: 2 started seats per player per **rolling** 24h; 4 started capers per family per rolling 24h | Author | A UTC-day key allows 4 seats in two hours around midnight. |
| D19 | Each seat pays a stake that is burned at Start | Author | Every account carries its own sink every run. |
| D20 | No shop buff applies to caper, payday or racket money | Author | `applyIncomeModifiers` (`shopBuffs.ts:244-249`), Crown, Counterfeit and Devil would stack. |
| D21 | 10% of every caper pool (the "fence") is never minted | Author | Replaces income tax; cannot be bypassed by Tax Shield. |
| D22 | Caper pool per seat B = 350k / 550k / 850k / 1.2M; every seat weighs the same (no Mastermind bonus) | Author | Keeps perfect play (p = 1.0) at T4 at ≤ 15% of the Month 2+ band floor including Payday for **every** seat. A 1.25 Mastermind weight let a planner who took both daily seats as Mastermind reach 18.9%. |
| D23 | 10 fixed rackets, 6,400,000/day bot-wide, credited by an hourly tick into earnings | Author | Fixed mint regardless of player count; tick makes neglect rules enforceable. |
| D24 | A racket cycle mints nothing unless the owner has ≥ 3 racket-eligible members; 3 neglected cycles release it | Author | Stops a 2-account family farming racket income. |
| D25 | Rackets are acquired only by winning a war; the war's single attacker is chosen by bidding from **earnings only** (never treasury); floor = 7 × daily income; District needs family L4+, Crown L7+; the winning bid is burned when the war settles | Author | One attacker per window keeps settlement simple; the burn is the price of a shot. Earnings-only bids stop deposits turning into perpetual racket income (7.5 rule 2); a 7-day floor and level gates stop a young family buying a Crown with a 3-day payback. |
| D26 | War points come only from correct hits; correct answers come from scouting intel shared in chat | Author | Wars reward play and coordination, not paid attendance. |
| D27 | No money moves between families in a war | Author | Staged wars between alt families transfer nothing. |
| D28 | A family cannot bid against a family whose Boss, or any two of whose members, were in the other family within 14 days (either direction) | Author | Blocks split/trade/re-merge churn and shadow families run by the same people. |
| D29 | 10 family levels; perks are capacity, cooldown trims, tier unlocks and cosmetics only | Author | No money multiplier anywhere. |
| D30 | Daily dues 40,000 × level; arrears block bids and level-ups (not capers); every earnings credit and deposit retries the arrears | Author | Upkeep sink; held rackets are not free. Capers stay open so the vault can earn its way out of arrears. |
| D31 | Normalised new collections; `User` gains no field | Author | Hot model untouched; DB-enforced invariants (datamodel report option A). |
| D32 | No CAS ever filters a nullable field; sentinels (`""`, `-1`, `"LIVE"`, `now()` defaults) instead | Author | Prisma/Mongo null mismatch (`src/anticheat/claim.ts:59-75`). |
| D33 | Correctness is Mongo-only; Redis is used only for render and activity debounces and the lobby-DM cap, all failing open | Author | `cooldownClaim` fails open (`claim.ts:37-40`); a Redis outage must not double-pay. |
| D34 | No family, caper, vault, racket or war code calls `isTester` | Author | Shared state; testers would leak advantage to real families. |
| D35 | Every button is a persistent customId route; no message collectors | Author | Collectors die on restart and strand stakes (`src/commands/games/cockfight.ts`). |
| D36 | Four DM notice types: `family`, `caper_lobby`, `turf` (account, opt-out) and `caper` (cooldown reminder) | Author | Lobby calls get their own toggle so they are not DM spam. |
| D37 | 24 icons (one per emoji), 1 mascot, 9 banners; rackets use 3 class icons, not 10 per-racket icons | Author | Production risk vs. readability; judges' scope trim. |
| D38 | Icons are programmatic sprites (`generatePixelAssets.ts`); banners and the mascot use the AI prompt pack | Author | Icons must be crisp at 22 px; scenes are too large to hand-grid. |
| D39 | `cf_` emojis render nearest-neighbour at an integer scale (40-cell grid × 3 = 120 px in the 128 canvas); `shop_` keeps the smoothed render | Author | The smoothed 160 → 112 scale blurs 4 px cells (`src/scripts/syncShopApplicationEmojis.ts:87-90`), against `DESIGN.md` pillar 5. One optional `pixelGrid` field on the family, not a second script. |
| D40 | `casinoGuide` gets no entry; help, tutorial and the website module carry the guide | Author | Capers are not a casino game (`src/commands/general/casinoGuide.ts:28-35`). |
| D41 | Slash commands take one free-text `target`/`value` option, never a `user` option | Author | Slash serialisation stops at the first missing option (`src/slash/registry.ts:273-298`). |
| D42 | A cancelled or expired lobby sets the family cooldown to 30 minutes | Author | Stops lobby (and lobby DM) spam. |
| D43 | Role → prep-item partition covers all 25 whitelist items exactly once | Author | Gives the dead `successBonus` field a real job (section 8.2). |
| D44 | All new crons pass `{ timezone: "Etc/UTC" }` | Author | Existing crons run in host time (`src/scheduler.ts`), service day keys are UTC. |
| D45 | The young-pair shared-run cap from the "fun" draft is dropped | Author | Replaced by the non-transferable shift and age gates (D17); fewer rules to explain. |
| D46 | Website docs live under the `economy` module id | Author | Crime already lives there (`dashboard/src/content/types.ts:1`). |
| D47 | Hits and scouting use rotating 5-minute "weak points" derived from a secret per-war seed | Author | Gives war a skill element without a memorisable catalog. |
| D48 | Live play is guild-local: a caper seat is taken only in the lobby's guild; war actions only in the family's home guild. Membership, vault and payday stay global. | Author | The intel ring needs one shared chat inside 120 s; no family chat is built (non-goal). It also makes every mention and jump link resolve. |
| D49 | A seat with no locked choice at settle gets cut 0 (its share is never minted); it still loses its stake and pays the Bust fine | Author | AFK-joining must not be positive EV while the crew pays for it. |
| D50 | Anti-goal 1 is measured on the **median** eligible member of each band against that band's floor; the perfect-play design bound for any account is 15% of the Month 2+ floor (1,200,000/day) | Author | One voice-chat crew must not trip the economy alarm; alts are bounded by the hard per-account figure (11.4). |
| D51 | Level pace is set by fees, not XP; the 172M fee schedule is kept and the doc states the deposit needed to keep the XP pace | Author | "Costly things are grinded for": fees and deposits are the family's main sinks (10.2). |
| D52 | Every war defender, family or Street, starts each block at the class baseline (30/50/80); no dormancy substitution | Author | An absent active family was easier to take than an unowned racket. Neglect (9.3) already releases an inactive family's rackets in 3 cycles. |
| D53 | Three war windows: 18:00, 01:00 and 12:00 UTC | Author | 12:00 UTC is Asia/Oceania evening; one racket per class moves there. |
| D54 | The lowest racket class is **Corner**; "the Street" is only the NPC owner | Author | "Street" named a class, the NPC and a block. |
| D55 | A caper whose GO overlapped a bot restart, with any seat unlocked, is VOID (all stakes refunded, no counts used). A war that went ACTIVE more than 10 minutes late or had a tick gap over 10 minutes is CANCELLED and its escrowed bid refunded; the bid burns only at settlement | Author | Anti-goal 6: no stake or bid lost to a restart. |
| D56 | One "active member" rule (≥ 2 started seats or ≥ 3 correct hits in 7 days) for payday and racket eligibility | Author | One threshold to explain on one card. |
| D57 | Payday runs automatically 24 h after it falls due if no officer pressed it | Author | An absent officer must not hold the whole family's income. |
| D58 | At Start a new GO message mentions the crew and a `caper_lobby` DM goes to each seat; lobby DMs are capped at 3 per member per rolling 24 h and skipped for 2 h after a cancelled lobby; there is no caper-result DM | Author | Card edits ping nobody; DM volume stays bounded (13.4). |
| D59 | Vault amounts appear only on the ephemeral vault screen (S6); the public dashboard shows dues status without amounts | Author | Consistent with "no vault is ever shown" on the leaderboard (10.4). |
| D60 | Every refund (stake, kick, cancel, void, corrupt) is credited with `earned = false` | Author | A join/leave loop must not complete earn quests or trigger garnishment. |
| D61 | The disband final payday pays only if 7 days have passed since the last payday | Author | Keeps "one payday per 7 days" (D13). |
| D62 | Caper jail uses the standard bail (1,000, `src/utils/economyConfig.ts:2`) | Author | Jail is a time-out shared with solo crime; the Bust fine is the money consequence. A caper-only bail needs a `User` field (D31). |
| D63 | Heat raids are not counted as a family sink | Author | A raid on an empty wallet resets heat for free (`src/services/taxService.ts:294-296`). |
| D64 | Defence XP needs the attacker to score ≥ 1 correct hit on ≥ 2 blocks | Author | A staged war between friendly families must not mint defence XP. |
| D65 | Icons are hand-finished 40x40 grids traced from AI reference renders; the owner signs off a contact sheet against shipped icons before the emoji sync | Author | A blank 40x40 grid drifts flatter than the shipped icons. |
| D66 | A missing banner file omits the MediaGallery (no file, one component fewer); stages A and B may ship before AI art exists | Author | Art must not block capers; a gallery pointing at a missing attachment is rejected. |
| D67 | The no-family card shows the join gates first; there is no apply flow in v1 | Author | New players must see the low join bar; recruiting happens in chat and on the leaderboard. |

---

## 1. Intent and why now

- Fortuna's solo loops (jobs, hunting, zoo, crime, properties) are complete and rebalanced (`01158ce`, `4bb91b3`). Month 2+ players have nothing that needs other players.
- The crime stack already has the pieces a social layer needs: heat (`src/services/taxService.ts`), jail (`src/services/jailService.ts`), 25 prep items with an unused `successBonus` (`src/data/crimePrepWhitelist.ts:15-90`), and an anticheat claim kit (`src/anticheat/claim.ts`).
- The economy is global per `discordId`, so a family can recruit across servers. That is a growth loop: members pull friends into servers that run Fortuna.
- The rebalance just made "nothing prints money" enforceable. Adding a multiplayer money source now, under the same rules and tests, is cheaper than retrofitting rules after players find loops.

## 2. Goals, non-goals, anti-goals

### Goals
1. A reason to log in together: scheduled lobbies, a 120-second GO where the crew must talk, weekly wars with a blackout finish.
2. A family identity: name, tag, crest, ranks, a leaderboard, a ledger.
3. A medium-to-hard progression: 10 levels. XP alone takes about 76 days at full activity; the 172M of level fees set the real pace (about 167 days from vault income alone, or the XP pace with about 92M of member deposits). T4 capers unlock between day 49 and day 105 (10.2).
4. Income that tops up, never replaces, existing sources: at realistic play a member earns about 10–12% of the Weeks 2–4 floor and 6–9% of the Month 2+ floor, payday included; at perfect play no account ever earns more than 15% of the Month 2+ band floor (11.1, 11.4).
5. Abuse resistance by construction: DB-enforced one family per account, no vault exit to a single person, non-transferable gates.
6. Exhaustive docs: website module, command entries, help, tutorial, economy doc section.

### Non-goals
- Changing solo crime, Tax Shield, marriage, the transfer path or rob.
- Family chat, family roles in Discord guilds, or Discord role sync (crews talk in the guild where they play, D48).
- Vault withdrawals, payroll or custom splits.
- A web leaderboard.

### Anti-goals (failure even if it works)
1. **Capers become the best per-account income.** If the median eligible member's realised caper + payday income in a band exceeds 15% of that band's floor for a week, or any single account exceeds 1,200,000/day (15% of the Month 2+ floor) for a week (measured from `Transaction` rows), the feature has failed its economy goal (D50).
2. **The vault becomes a transfer channel.** Any path from one member's wallet into another specific member's wallet is a failure.
3. **Alts pay.** If a single human with N qualified accounts earns materially more than N real players would, the gates have failed.
4. **One person carries the crew.** If a caper can be passed at the perfect rate by one player answering for everyone, the intel ring has failed.
5. **A silent failure.** Any screen over 40 components or any interaction that dies without a reply (50035 is swallowed at `src/index.ts:301-314`).
6. **Stranded money.** Any stake, bid or payout lost to a restart.

## 3. Constraints

### From the owner
| Constraint | Consequence in this PRD |
|---|---|
| ComponentsV2 everywhere; Discord caps a payload at 40 components | Every screen in section 13.3 has a component count; a layout test pins worst cases (section 18). |
| `src/index.ts` swallows 50035 | Oversized payloads fail silently; the layout test is the only guard. |
| Art matches the existing pixel style; new art saved in `src/assets` and used | Section 16 and section 20; `DESIGN.md` rules apply. |
| New icons become application emojis, looked up by name | `cf_` family in the generalised sync script; `emojiInline(name)` at runtime (`src/utils/emojiRegistry.ts:133-137`). |
| `shopCatalog.ts` and `shopItemEffects.ts` unchanged | Prep items are read, never added or changed; no new shop items. |
| `FORTUNA_V2_ECONOMY.md` is the balance source of truth | Section 11 measures everything against its bands (`FORTUNA_V2_ECONOMY.md:28-34`). |
| `branding.ts` must be checked | `Mascot.Colors` (`src/config/branding.ts:125-129`) anchors the palette; existing `Mascot.Emotes` are reused only as fallbacks; no new `<:name:id>` strings are added there (`DESIGN.md` section 7). |

### From the codebase
| Constraint | Source | Consequence |
|---|---|---|
| `!family` and slash `family` belong to marriage | `src/commandRouter.ts:568-573`, `src/slash/registry.ts:234` | Commands are `!crew`, `!caper`, `!turf`. |
| `cf` is the coinflip alias; `job` is work | `src/commandRouter.ts:172`, `:184` | No `cf` alias. customId prefix is `crew:`/`cpr:`/`turf:`. `DESIGN.md` reserves the `cf_` emoji prefix for Crime Families; coinflip art uses `coin_`. |
| Solo minigame answers are fixed labels (buttons shuffled per run since `6b2d836`) | `src/data/crimeMinigameCatalog.ts`, `src/services/crimeRunService.ts:49-51` | Capers use a new per-run random mechanic (D8). |
| `addBalance` and `applyEconomyPenalty` each open their own transaction | `src/services/walletService.ts:112`, `src/services/penaltyService.ts:64` | Extract tx-scoped seams (section 14.4). |
| `removeBalance` clamps, never throws | `walletService.ts:193-212` | Never used for payments. |
| Guarded debit pattern `updateMany({balance:{gte}})` | `src/services/transferService.ts:36-40` | All debits use it via a new shared helper. |
| `cooldownClaim` fails open on Redis error | `src/anticheat/claim.ts:37-40` | Not used to guard money. |
| `{field: null}` does not match an absent field on Mongo | `src/anticheat/claim.ts:59-75` | Sentinels only (D32). |
| A Section must have exactly one accessory | `src/commands/games/hunt.ts:158-168` | Missing art → TextDisplay, never an accessory-less Section. |
| Slash commands defer publicly; first reply is public; a deferred slash command cannot show a modal; a prefix command has no interaction at all | `src/slash/handle.ts:26`, `src/slash/interactionMessage.ts:52-58`, `src/index.ts:272-293` | Private views and modals open only from buttons; a command that targets one posts a public opener card (13.3 S27). |
| No global ban check on interactions; `getUserRecord` is private and takes a `Message` | `src/index.ts:108-150`, `src/commandRouter.ts:198-227`; per-handler precedent `src/handlers/stockInteractionHandler.ts:73-77` | `checkMemberEligibility` reads `User.isBanned`/`banExpiresAt` itself (12.1). |
| No MessageContent intent; text collectors are dead | `src/index.ts:42-52`, `src/utils/collectorHelper.ts:4-10` | Joining is a button or select; text input is a modal. |
| Interaction tokens live 15 minutes | Discord | Lobby, GO, result and war boards are edited via stored `channelId`/`messageId`, never the token. |
| customIds ≤ 100 chars; snowflake ≤ 20, ObjectId 24 | Discord | Longest id in this PRD is 73 chars. |
| Up to 10 files per message; attachment names must have no spaces | `src/commands/games/hunt.ts:30-41` | All names are `cf_<key>.png`. |
| PM2 single fork, but `.env` points at the live DB, so a local `npm run dev` is a second process | `ecosystem.config.js:17-20` | No leader lock; every job step is a CAS; new crons pass `noOverlap: true` (node-cron 4.2.1 defaults it to false, `node_modules/node-cron/dist/esm/tasks/scheduled-task.d.ts:12`). |
| Cron has no backfill; no timezone passed today | `src/scheduler.ts:12-80` | Minute and hourly jobs catch up by querying `lte now`; daily work (dues, succession) runs from an hourly job so a missed hour is retried; new crons pass `Etc/UTC`. |
| Deploy runs `prisma db push` only if `prisma/` changed in `HEAD~1` | `.github/workflows/deploy.yml:59-80` | Schema ships in one commit or merge commit with its code. |
| `.env` `DATABASE_URL` is the live player DB | memory note | No agent runs app code, seeds or scripts against it. |
| Slash usage is 70 of 100 global commands | `src/slash/registry.ts:45-235` | 3 new commands → 73. |
| Settings panel test requires < 35 components | `test/dm/settings.test.ts:38-41` | 4 new DM types → 30 (on) / 31 (off). |
| `checkV2Payloads.ts` writes fake ids into the tracked `src/data/emojis.json` (the working tree holds 18 such records today; HEAD has `{}`) | `src/scripts/checkV2Payloads.ts:26-32`, `src/utils/emojiRegistry.ts:102-111` | Never run it; use vitest layout tests with an in-memory registry seam; restore the file before the art commit (19.4 step 7). |

## 4. Player journey

### 4.1 A new family (week 5 of a player's life)
Mara has played for 33 days, worked 70 shifts, owns a Business Briefcase and has 16M of net worth. She runs `!crew`, sees the requirements card with Lady Fortuna in a pinstripe suit, and presses **Create**. A modal asks for a name and a tag; she types "Velvet Ante" and `VLA`. The confirm card says "10,000,000 will be burned. You will be Boss." She confirms. Her dashboard shows a bronze crest, one member and an empty vault.

She invites three friends from two servers. Each gets a public invite card and a DM, and joins her server, because capers are played where the crew can talk (D48). One friend is on a 72-hour hop cooldown from another family, so the accept button tells him when he can join. The other two join; their roster lines show the flat-cap Associate icon until 72 hours pass.

### 4.2 A day in the life (day 20, level 3, 8 members)
- 19:02 UTC. The Underboss runs `!caper`, picks **Payroll Van (T2)** and becomes Mastermind. The lobby card posts a rainy-street banner. Eligible members in this server who have not used their two seats get a "Caper lobby open" DM with a jump link.
- 19:04. Members pick roles from the "Join as…" select. A Lookout in another channel of the same server runs `!caper join lookout`; her channel shows a small "joined" card with a jump link to the lobby.
- 19:06. The fifth seat fills and the caper auto-starts. Stakes (100,000 each) are burned. The card flips to GO with a 120-second timer, and a new GO message mentions all five crew members.
- 19:06–19:08. Each member opens their brief. Mara is the Muscle; her brief says "Tell <@Driver>: the clear route is **Canal Street**" and "Which door is unguarded? <@Underboss> has your intel". The crew calls intel in the channel. One member never opens his brief; at 30 seconds left the seat he holds intel for sees it as leaked.
- 19:08. Result: one miss (the AFK seat, which gets no cut), so the job is **Messy**. The result card lists every cut. The family gets 10% of the pool in earnings and 90 XP.
- 22:10. Mara takes a seat in the family's next caper, her second in 24 hours. Her first seat frees at 19:06 tomorrow, and the `caper` reminder DMs her then.

### 4.3 A war week (day 52, level 8)
- Wednesday 18:00 UTC. Bidding opens for **Casino Row Protection** (Crown, war Saturday 18:00 UTC, 72 hours later). The Boss bids the 9,100,000 floor from the vault's earnings.
- Thursday. A rival bids 10,010,000 (floor × 1.10). The Boss and Underboss get "You were outbid on Casino Row Protection: 10,010,000"; their escrow returns to earnings.
- Saturday 16:30 UTC. The Boss re-bids 11,011,000. Bidding closes at 17:00 UTC and the war is armed; the bid stays in escrow and burns when the war settles.
- Saturday 17:45. Both families get "War in 15 minutes".
- 18:00–19:00. The war board posts in both home channels. Members press **Scout**, learn one block's weak point, and post it in chat. Hitters arm a hit on a block and pick the approach within 20 seconds. The defender starts each block at 80 (the Crown baseline); correct hits score 10 (attacker) or 12 (defender).
- 18:50. Blackout: scores show "??", only hit counts are visible. Late hitters pile in.
- 19:00. The attacker takes 2 of 3 blocks and owns Casino Row Protection. From the next hourly tick, 1,300,000 per day flows to the family's earnings while at least 3 members stay racket-eligible.
- Sunday. Payday: 12 eligible members each receive 950,000 net (the cap). The rest of earnings stays for the level 9 fee.

---

## 5. Concept and fantasy

**Crime Families.** Lady Fortuna, in a charcoal pinstripe suit and a fedora, runs the city's underworld ledger. Players found a **Crime Family**: a name, a 2–4 character tag, a chain of command (Boss, Underboss, Capos, Soldiers) and a shared vault. The family's multiplayer job is the **Caper**, named so it never collides with the solo board's "Legendary heist" tier or the `HEIST` crime tag. A caper is a short live operation in which every crew member holds a piece of intel that a different member needs, so the crew has to talk in the server's chat or voice to pull it off. Families also fight over **Rackets**, 10 fixed city territories that pay protection money into the family vault, in a weekly 60-minute **Turf War** where scouts find weak points and hitters strike them before the last ten minutes go dark. A weekly **Payday** splits the family's minted earnings equally among the members who actually played.

The five moments the feature is built around:
1. **GO time.** 120 seconds of the crew calling intel to each other; then the card flips to Clean, Messy or Bust, naming who held which intel and who acted on it.
2. **The leak.** A crew member goes dark; at 30 seconds left the intel they held "leaks" to the seat that needed it. The dark seat is still a miss, so the leak turns a Bust into a Messy, never into a Clean.
3. **Outbid snipe.** "You were outbid on Casino Row Protection: 10,010,000."
4. **Blackout.** In the last 10 minutes of a war, scores show "??"; families rally late hitters for the reveal.
5. **Payday.** The Boss presses Payday; a public card in the home channel names everyone paid, and every eligible member gets a DM with their cut.

---

## 6. Family lifecycle

### 6.1 Creation

The **Create** button on the no-family card (S1) opens a modal with two inputs: Name and Tag. `!crew create` posts an opener card (S27) whose button opens the same modal, because a command cannot open a modal (section 3). On submit the bot validates and replies with an ephemeral confirm card (S3). **Confirm** runs one transaction.

| Requirement | Value | Check |
|---|---|---|
| Cost | **10,000,000** from wallet, burned | `debitWalletInTx(tx, uid, 10_000_000, "family_create", {familyId})` (guarded `wallet.updateMany({userId, balance:{gte}})`) |
| Net worth | ≥ **15,000,000** | `computeNetWorth(uid)`, exported and called uncached (`src/services/netWorthService.ts:25`; `getNetWorth` at `:111-117` caches 600 s and is never invalidated) |
| Lifetime shifts | ≥ **60** | `User.shiftsWorked` (`prisma/schema.prisma:83`) |
| Fortuna account age | ≥ **30 days** | `User.createdAt` (`prisma/schema.prisma:55`) |
| Discord account age | ≥ **180 days** | `SnowflakeUtil.timestampFrom(uid)` |
| Heat | < **70** | `User.crimeHeat` |
| Jail | not jailed | `checkJailStatus(uid)` (`src/services/jailService.ts:30`) |
| Ban | not banned | `User.isBanned && (banExpiresAt is unset or in the future)`, read in `checkMemberEligibility` (same rule as `src/handlers/stockInteractionHandler.ts:73-77`; `getUserRecord` is private and Message-only) |
| Membership | not in a family | `FamilyMember.userId @unique` |
| Hop cooldown | clear (6.6) | latest `FamilyExit` |
| Re-found cooldown | ≥ **7 days** since a `FamilyExit{reason:"DISBANDED", wasBoss:true}` | `FamilyExit` |

The create transaction (`runFamilyTx`, 14.4):
1. Guarded wallet debit of 10,000,000 (throws `InsufficientFunds`).
2. `family.create` with `level 1`, `homeGuildId`/`homeChannelId` = where Confirm was pressed. P2002 on `nameKey` or `tagKey` → "Name or tag taken"; the whole transaction rolls back, debit included.
3. `familyMember.create({ role:"BOSS", roleSlot:"BOSS", seat:1 })`. P2002 on `userId` → "Already in a family".
4. `familyLedger.create({ type:"create_fee", amount:0, meta:{paid:10_000_000} })` and `audit.create({ type:"family_create" })`.

### 6.2 Name and tag rules
| Field | Rule |
|---|---|
| Name | 3–24 chars, regex `^[A-Za-z0-9][A-Za-z0-9 '\-]{1,22}[A-Za-z0-9]$`, no double spaces. `nameKey = name.toLowerCase().replace(/\s+/g, " ")`, `@unique`. |
| Tag | Regex `^[A-Z0-9]{2,4}$` after `toUpperCase()`. `tagKey` = the uppercased tag, `@unique`. |
| Denylist | `FAMILY_NAME_DENYLIST = ["fortuna","admin","staff","mod","discord","police","cops","street","everyone","here"]` plus a slur list. Matched as a substring after lowercasing and stripping non-alphanumerics, on both name and tag. "Street" is reserved because it is the NPC owner of unowned rackets. |
| Rename | Boss only, `!crew rename` posts an opener card (S27) whose button opens the modal. Costs **2,000,000** from the vault (`spendFromVault`, earnings first), at most once per **30 days** (`Family.lastRenamedAt`). Ledger `rename_fee`. The tag cannot be renamed. |
| Moderation | Developer command `crew-forcerename <TAG> <newName>`, added to `ADMIN_COMMANDS` (`src/utils/developerAccess.ts:37`). Free, no cooldown, writes `Audit{type:"family_forcerename"}`. |

### 6.3 Roles and permissions
Stored roles are `BOSS | UNDERBOSS | CAPO | SOLDIER`. **Associate** is derived for display: `joinedAt > now − 72h`. Role caps are enforced by `@@unique([familyId, roleSlot])`: slots `"BOSS"`, `"UNDERBOSS"`, `"CAPO1"`, `"CAPO2"`, `"CAPO3"`, and the member's own `userId` for Soldiers. A promotion to Capo runs in a transaction that touches `Family.updatedAt`, reads the family's role slots and writes the lowest free of `CAPO1`, `CAPO2`, `CAPO3`; none free → "Capo seats are full". A concurrent promotion write-conflicts on the family document and retries (P2034). A P2002 is never caught inside a transaction: Mongo aborts the transaction on a duplicate key, so the unique index is the backstop and the error rolls the whole transaction back.

| Action | Boss | Underboss (max 1) | Capo (max 3) | Soldier | Associate (< 72h tenure) |
|---|---|---|---|---|---|
| View dashboard, log, leaderboard, turf map | yes | yes | yes | yes | yes |
| Deposit | yes | yes | yes | yes | yes |
| Invite | yes | yes | yes | no | no |
| Kick | anyone | Capo and below | Soldier only | no | no |
| Promote / demote | up to Underboss | up to Capo | no | no | no |
| Hand over the chair | yes | no | no | no | no |
| Plan a caper (Mastermind seat) | yes | yes | yes | no | no |
| Take a caper seat | yes | yes | yes | yes | **no** |
| Payday, level up, bid | yes | yes | no | no | no |
| Scout and hit in a war | yes | yes | yes | yes | **no** |
| Set home channel (`!crew home`), rename, disband | yes | no | no | no | no |
| Claim the chair from an inactive Boss | no | yes (after 7 days) | no | no | no |

Every permission is re-read from the DB on every press; the customId never carries a role.

### 6.4 Invite, join, leave, kick, disband

**Invite** (`!crew invite <@user|id|username>`, Capo+). Target resolution follows `src/commands/economy/rob.ts` (mention, 17–20 digit id, exact case-insensitive username in the guild).
- Creates `FamilyInvite{status:"PENDING", slot:"PENDING", expiresAt: now + 24h}`. `@@unique([familyId, inviteeId, slot])` allows one pending invite per pair.
- Limits, checked in the create transaction, which also touches `Family.updatedAt` so concurrent invites conflict and recount:
  - at most **5** PENDING invites per family;
  - at most **3** ACCEPTED invites per inviter per rolling 7 days (`FamilyInvite{inviterId, status:"ACCEPTED", resolvedAt ≥ now−7d}`);
  - at most **5** ACCEPTED invites per family per rolling 7 days.
- Posts the public invite card (S4) and sends a `family` DM to the invitee.

**Accept** (`crew:inv:accept:<inviteId>`, or `!crew accept <TAG>` from any server). Only `FamilyInvite.inviteeId` may press. One transaction:
1. CAS `familyInvite.updateMany({ id, status:"PENDING", expiresAt:{gt:now} })` → `{status:"ACCEPTED", slot:id, resolvedAt:now}`; `count === 1` or "Invite expired".
2. Join gates (`checkMemberEligibility(uid, "family_join")`, section 12.1): Discord ≥ 90d, Fortuna ≥ 14d, net worth ≥ 1,000,000, `shiftsWorked` ≥ 20, not jailed, not banned, hop cooldown clear, no `FamilyExit` from **this** family in the last 14 days. A failure throws, rolling the invite back to PENDING; the reply names the gate.
3. Re-check the 7-day accepted-join caps.
4. Read the family's member seats and `familyMember.create({ role:"SOLDIER", roleSlot:uid, seat:<lowest free seat ≤ memberCap> })`; no free seat → "Family is full" (the transaction rolls back, so the invite stays PENDING). `@@unique([familyId, seat])` is the DB backstop: a P2002 aborts the transaction, and an outer loop retries the whole transaction at most 3 times only when the violated index is `FamilyMember_familyId_seat_key`.
5. `Family.updatedAt` is touched (`family.update({ data:{ updatedAt: now } })`) so a concurrent accept, payday or disband write-conflicts and retries.

**Decline:** CAS PENDING → DECLINED, `slot = id`.

**Leave** (`!crew leave` posts an opener card, S27; its button shows the ephemeral confirm S26):
- Blocked while the member holds a `CaperCrew` row in a LOBBY or RUNNING caper, or a `WarContribution` in an ARMED or ACTIVE war.
- The Boss cannot leave while other members exist; they hand over the chair first. A Boss who is the only member leaving = disband.
- One transaction: delete the member row, write `FamilyExit{reason:"LEFT"}`, delete any PENDING invites they sent, touch `Family.updatedAt` (so a concurrent payday conflicts).

**Kick** (permission per 6.3; S5 Kick or `!crew kick <user>` leads to the ephemeral confirm S26; the transaction touches `Family.updatedAt`):
- Blocked while the family has an ACTIVE war (anti-sabotage freeze) and while the target sits in a RUNNING caper.
- If the target sits in a LOBBY caper, their `CaperCrew` row is deleted and their stake refunded in the same transaction. If the target is that lobby's Mastermind, the caper is cancelled and every stake refunded.
- Writes `FamilyExit{reason:"KICKED"}`; `family` DM to the target.

**Disband** (Boss only): S22 confirm card, then a modal that requires typing the tag.
- Blocked while any caper of the family is LOBBY, RUNNING or SETTLING, or any war involving the family is ARMED, ACTIVE or SETTLING.
- One transaction:
  1. If the family is the top bidder of a BIDDING war: `war.updateMany({ id, status:"BIDDING", topBidderFamilyId: fam })` → `topBid 0, topBidderFamilyId ""`; the escrow returns to the family's earnings first.
  2. **Final payday** with the section 7.3 eligibility, cap (1,000,000 gross each) and 5% tax, only if `lastPaydayAt ≤ now − 7d` (D61); otherwise earnings are burned with the treasury. Tenure is **not** waived. The 500,000 minimum does not apply.
  3. Everything left in `treasury` and `earnings` is burned (`FamilyLedger{type:"disband_burn"}`, `Audit{type:"family_disband"}`). The modal states the exact burn.
  4. Owned rackets → `ownerFamilyId:""`, `neglectStrikes:0`, `lastPayoutAt:now`. Uncollected cycles are forfeited.
  5. PENDING invites → EXPIRED.
  6. Every member: `FamilyExit{reason:"DISBANDED", wasBoss: uid === bossId}`; member rows deleted.
  7. The Family row is hard-deleted, freeing the name and tag.
- After commit: `family` DM to each former member with their final payday (if any).

### 6.5 Size cap and cross-server membership
| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Member cap | 6 | 7 | 8 | 8 | 10 | 10 | 12 | 12 | 12 | 12 |

- Families are global: membership, vault, payday and the dashboard never depend on a guild.
- **Live play is guild-local (D48).** A caper lobby belongs to the guild where it was planned: only members pressing or typing in that guild can take a seat (`interaction.guildId`/`message.guildId === caper.guildId`, checked in the join service). War actions are taken in the family's home guild (`=== family.homeGuildId`). The crew therefore always shares the channel where the card sits, every `<@id>` mention resolves, and every jump link opens.
- The family has one **home channel** (set at creation, changed with `!crew home` by the Boss in any channel where the bot has View Channel, Send Messages, Read Message History and Attach Files). Caper lobbies post where the plan ran; war boards post only in the two families' home channels.
- A member in another channel of the same guild can use commands that call the same service functions as the buttons: `!caper join <role>` and `!caper brief` (lobby guild), `!turf war` (home guild). Each posts a small personal card (S25) with a jump link and the same persistent buttons (`cpr:brief:<caperId>`, `turf:hit:<warId>:<block>`). Identity is checked against DB rows, never the message.
- Every DM about a shared card carries a jump link (`https://discord.com/channels/<guildId>/<channelId>/<messageId>`). Lobby DMs go only to members of the lobby's guild (`guild.members.fetch(uid)`, a single-member REST call that needs no privileged intent; a failure skips that DM).

### 6.6 Hop cooldowns
Read from the user's latest `FamilyExit`:

| Last exit | Before joining any family | Before founding | Before rejoining the same family |
|---|---|---|---|
| LEFT | 72 hours | 72 hours | 14 days |
| KICKED | 24 hours | 24 hours | 14 days |
| DISBANDED, member | 24 hours | 24 hours | n/a (family gone) |
| DISBANDED, Boss | 24 hours | 7 days | n/a |

### 6.7 Succession when the Boss goes inactive
`FamilyMember.lastActiveAt` is touched by any `!crew`/`!caper`/`!turf` command or `crew:`/`cpr:`/`turf:` press, throttled by Redis `cf:active:<uid>` (SET NX EX 3600). The throttle fails open (one extra write).

| Boss inactive for | What happens |
|---|---|
| 7 days | When the Underboss opens the dashboard, S2 adds a **Claim the chair** row. The hourly `runSuccession` job posts S23 in the home channel once per inactivity episode (CAS `family.updateMany({ id, claimNoticeFor:{ not: bossId } })` → `claimNoticeFor: bossId`, then stores `claimChannelId`/`claimMessageId`). Claim is a CAS: `family.updateMany({ id, bossId: oldBoss })` → `bossId: claimer`, inside a transaction that re-reads the Boss's `lastActiveAt ≤ now − 7d` and swaps role slots in this order so `@@unique([familyId, roleSlot])` never collides: old Boss → SOLDIER with `roleSlot = <old Boss uid>` first, then claimer → BOSS with `roleSlot "BOSS"`. After commit S23 is edited to "Chair claimed by <@x>" with no row. `family` DM to the old Boss. |
| 14 days | The hourly `runSuccession` job hands the chair over automatically, with the same CAS and slot order. Heir order: the Underboss; else the Capo with the earliest `joinedAt`; else the Soldier with the most lifetime `capers`, ties to the earliest `joinedAt`. The heir's own `lastActiveAt` must be within 7 days; if nobody qualifies, nothing changes. S23 is edited to "Chair handed to <@x>". `family` DM to all members. |
| All members inactive | Nothing special: the family keeps defending at the class baseline (D52), and its rackets lose income and are released by neglect within 3 cycles (9.3). |

### 6.8 The vault on disband
Covered in 6.4: escrowed bids return first, eligible members get a capped final payday, and everything else is burned. No member gets their deposits back.

---

## 7. Family vault

### 7.1 Buckets
| Bucket | Filled by | Spent on | Can reach a wallet? |
|---|---|---|---|
| `treasury` | member deposits (net of 5% tax) | dues, level-ups, rename, **after** earnings is empty; never bids | **Never.** Burned on disband. |
| `earnings` | caper vault cut (10% of each pool); racket income; refunded bid escrow | dues, level-ups, rename (**first**); racket bids (**only** from earnings, D25); Payday | Only through Payday (7.3) |

`spendFromVault(tx, familyId, amount, ledgerType, actorId, meta, { earningsOnly = false })` in `src/services/crimeFamily/vaultService.ts`:
1. Reads `{treasury T, earnings E}` inside the transaction.
2. `fromEarnings = min(E, amount)`, `fromTreasury = amount − fromEarnings`; if `fromTreasury > T`, or `earningsOnly` and `fromTreasury > 0` → throw `VaultShort`.
3. CAS `family.updateMany({ where:{ id, treasury:T, earnings:E }, data:{ treasury:T − fromTreasury, earnings:E − fromEarnings } })`, `count === 1` or throw `VaultBusy`. `VaultBusy`'s message contains "write conflict", so the `runFamilyTx` retry (14.4) treats it like a P2034; after the last attempt the user sees "Vault busy, try again".
4. Writes `FamilyLedger{type:ledgerType, amount:-amount, treasuryAfter, earningsAfter, meta:{...meta, fromTreasury, fromEarnings}}`.
5. Returns `{fromTreasury, fromEarnings}`. Bids pass `earningsOnly: true`, so a bid refund always returns to earnings.

### 7.2 Deposits
| Rule | Value |
|---|---|
| Who | any member, not jailed |
| Source | wallet only (no bank, no card) |
| Minimum | 10,000 |
| Cap | 25,000,000 per member per UTC day (`FamilyMember.depositDayKey`/`depositedToday`) |
| Tax | `floor(amount × TAX_CONFIG.transferTaxRate)` = 5%, burned, computed inline (Tax Shield never applies) |
| Credited | `treasury += amount − tax` |
| XP | 0 (money cannot buy levels) |

`!crew deposit <amount>` or the Deposit modal (accepts `250k`, `5m`, `1.5b` via the existing amount parser used by `!transfer`). One transaction:
1. `debitWalletInTx(tx, uid, amount, "family_vault_deposit", {familyId, tax})` (one Transaction row of `-amount`, `isEarned:false`).
2. Day-cap CAS on the member row: if `depositDayKey !== today` → `updateMany({id, depositDayKey: <read>})` → `{depositDayKey: today, depositedToday: amount}`; else `updateMany({id, depositDayKey: today, depositedToday:{lte: 25_000_000 − amount}})` → `{depositedToday:{increment: amount}}`. `count === 0` → "Daily deposit cap reached (x left today)".
3. `family.update({ treasury:{increment: amount − tax} })` (the transaction writes the family document, so concurrent spends conflict and retry).
4. `familyMember.update({ deposited:{increment: amount} })`.
5. `FamilyLedger{type:"deposit", amount: amount − tax}` and `FamilyLedger{type:"deposit_tax", amount:0, meta:{burned: tax}}`.
6. If `duesArrears > 0`, retry dues in the same transaction (7.4).

### 7.3 Payday (the only exit)
| Rule | Value |
|---|---|
| Who presses | Boss or Underboss; if nobody has pressed 24 h after it falls due, the hourly job pays it with `actorId "system"` (D57) |
| Frequency | once per 7 days: `Family.lastPaydayAt ≤ now − 7d` (defaults to creation time, so the first payday is 7 days after founding); auto payday at `lastPaydayAt + 8d` when earnings ≥ the minimum |
| Minimum earnings | 500,000 |
| Per-member cap | **1,000,000 gross** per payday |
| Tax | 5% of each gross share, burned, inline |

**Active member** (one rule for payday and rackets, D56): in the last 7 days, **≥ 2 started caper seats** (`CaperCrew{started:true, startedAt ≥ now−7d}`) **or ≥ 3 correct war hits** (`WarHit{state:"HIT", createdAt ≥ now−7d}`).

**Eligible member** (`checkMemberEligibility(uid, "payday")`), all of:
- `joinedAt ≤ now − 7d`;
- an active member;
- `shiftsWorked ≥ 20`, Discord ≥ 90d, Fortuna ≥ 14d, not banned. Jail does not block payday.

**Formula** (N = eligible count, E = earnings read):
- `gross = min(floor(E / N), 1_000_000)`
- `tax = floor(gross × 0.05)`, `net = gross − tax`
- earnings after = `E − gross × N` + any clamped excess (below)

**Flow:** Payday button → S7 preview (lists each eligible member, gross, tax, net; names ineligible members and why). Confirm id carries the previewed E and N: `crew:pay:ok:<E>:<N>:<ownerId>`. One `runFamilyTx` transaction with 5 attempts (each payday touches up to 12 wallet documents, so it conflicts more often than other spends):
1. Recompute the eligible set inside the transaction; if its size differs from N, abort and re-preview ("Members changed").
2. CAS `family.updateMany({ id, earnings:E, lastPaydayAt:{lte: now−7d} })` → `{earnings: E − gross×N, lastPaydayAt: now}`. `count === 0` → re-render the preview with fresh numbers ("Earnings changed"). Leave and kick touch the family document, so a member leaving mid-payday conflicts and retries.
3. For each eligible member: `creditWalletInTx(tx, uid, name, net, "family_payday", {familyId, gross, tax}, earned=true)`. If the wallet clamps at `MAX_SAFE_BALANCE` (`src/utils/economyConfig.ts:174`), the clamped excess is added back to earnings in the same transaction.
4. `FamilyLedger{type:"payday", amount: -gross×N}` and `{type:"payday_tax", meta:{burned: tax×N}}`.
5. After commit: `afterEarnedCredit` per member (card garnishment `src/services/creditCardService.ts:448`, quest `economy:earn`, cache invalidation); a `family` DM per paid member; a `family` DM to each ineligible member naming the gate they missed ("You missed payday: need 2 caper seats in 7 days, you had 1"); and a public payday card (S28) in the home channel.

The automatic payday (D57) runs the same transaction with E and N read inside it.

### 7.4 What the vault pays for
| Spend | Amount | When |
|---|---|---|
| Daily dues | **40,000 × level** | once per UTC day, from the hourly job (15) |
| Level-up fee | section 10.1 (2M → 50M) | Boss/Underboss press |
| Racket bid escrow | section 9.4 (floor 2,100,000 → 9,100,000), **earnings only** | bid; refunded on outbid or a cancelled war; burned when the war settles |
| Rename | 2,000,000 | Boss, once per 30 days |

**Dues and arrears.** The dues job CASes `family.updateMany({ id, duesDayKey:{not: today} })` → `duesDayKey: today` and calls `spendFromVault(tx, fam, 40_000 × level, "dues")` in the same transaction. On `VaultShort` the job instead sets `duesDayKey: today, duesArrears:{increment:1}` and writes `FamilyLedger{type:"dues_missed"}`.
- While `duesArrears > 0` the family cannot bid or level up (D30). Capers, joining, deposits, Payday and wars still work.
- Every deposit and every earnings credit (caper vault cut 8.8 step 4, racket income 9.3) retries the arrears in its own transaction: it pays `duesArrears × 40,000 × level` from the vault (earnings first) and resets `duesArrears` to 0 if it can.
- The dashboard (S2) shows a red line `Dues in arrears: 3 days` (no amount, D59) and S6 shows the exact amount owed; a `family` DM goes to the Boss and Underboss on the first missed day.

### 7.5 Rules that stop tax dodging, laundering and alt feeding
1. **No path to one person.** Money leaves the vault only as an equal, capped split to members with 7 days of tenure and recent play. The marriage pattern "deposit, then approve a withdrawal" (`src/services/life/marriageService.ts:229-373`) has no equivalent.
2. **Deposits never come back.** Treasury cannot become a wallet credit, even on disband, and cannot fund a racket bid, so it can never buy minted income.
3. **Earnings-first spending.** A rich member's deposit cannot pay a fee that earnings would have paid; spends always consume earnings first. The residual (a Boss pressing Payday before a level-up so the next fee hits treasury) is bounded by the 1,000,000/week cap per eligible member and taxed 5% + 5%.
4. **Earnings-only bids.** Bids draw only earnings and refunds return only to earnings, so treasury → bid → refund → earnings does not exist.
5. **Robbed money stays dirty.** Deposited loot is locked in treasury forever.
6. **Taxes cannot be shielded.** Both 5% legs are inline arithmetic, not `applyTransferTax` (`src/services/taxService.ts:107`).
7. **Alt payday needs play.** An alt must hold ≥ 20 lifetime shifts, 7 days of tenure, and ≥ 2 started caper seats (each needing tier gates and a burned stake) or ≥ 3 correct war hits in the window (a war needs a bid of at least 2,100,000 burned). Max feed per alt is 950,000 net per week.
8. **Vault invisibility is not a shelter.** The vault is excluded from net worth (marriage precedent) and the leaderboard, cannot be robbed or raided, and its money can never be spent on anything personal.

---

## 8. The Caper (family multiplayer heist)

### 8.1 Tiers
All tiers are in `CAPER_TIERS` (`src/data/crimeFamilyCatalog.ts`). None of the names collides with a solo crime name (`src/data/crimeCatalog.ts:81-151`).

| | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| Key / name | `pawnshop` Pawnshop Back Room | `payroll` Payroll Van | `racetrack` Racetrack Cashier Cage | `diamond` Diamond Exchange Vault |
| Family level to plan | 1 | 3 | 5 | 8 |
| Crew size (min–max) | 3–4 | 4–5 | 5–6 | 5–6 |
| Required roles | Mastermind, Lookout, Safecracker | + Driver | + Muscle | Mastermind, Lookout, Safecracker, Driver, Muscle |
| Optional role | Driver | Muscle | Hacker | Hacker |
| Pool per seat B | 350,000 | 550,000 | 850,000 | 1,200,000 |
| Stake per seat (burned at Start) | 50,000 | 100,000 | 175,000 | 300,000 |
| Bust fine per seat | 150,000 | 300,000 | 500,000 | 750,000 |
| Jail on Bust (per seat roll) | none | 20%, 1,200 s | 35%, 2,700 s | 50%, 3,600 s |
| Heat added Clean / Messy / Bust | 20 / 30 / 40 | 25 / 35 / 45 | 30 / 40 / 50 | 40 / 50 / 60 |
| Heat ceiling to join and at Start | < 70 | < 60 | < 50 | < 40 |
| Patrol base (chance a perfect run is Messy) | 0.10 | 0.15 | 0.20 | 0.25 |
| Seat gate: lifetime `shiftsWorked` | ≥ 20 | ≥ 60 | ≥ 150 | ≥ 300 |
| Seat gate: Fortuna account age | ≥ 14 d | ≥ 30 d | ≥ 30 d | ≥ 45 d |
| Seat gate: net worth | ≥ 2,000,000 | ≥ 8,000,000 | ≥ 20,000,000 | ≥ 40,000,000 |
| Seat gate: Discord age / family tenure | ≥ 90 d / ≥ 72 h | same | same | same |
| Family XP Clean / Messy / Bust | 150 / 60 / 20 | 225 / 90 / 30 | 300 / 120 / 40 | 375 / 150 / 50 |

### 8.2 Roles and the prep gate
A seat needs at least one prep item from its role's list. Items come from `CRIME_PREP_WHITELIST` (`src/data/crimePrepWhitelist.ts:15-90`), read only; every one of the 25 items belongs to exactly one role (validated at module load by `assertRolePartition()`). Ownership is `getOwnedPrepKeys(uid)` (`src/services/crimeService.ts:76`): inventory amount > 0. **Items are not consumed by a caper.** Ten of them are shop consumables (`consumable: true` in `shopCatalog.ts`); if a member uses one elsewhere after joining, they fail the re-check at Start and lose the seat with a refund.

| Seat order | Role | Prep keys (successBonus) | Best bonus | Call (4 options) |
|---|---|---|---|---|
| 1 | Mastermind (always the planner) | business_briefcase .10, legal_case_file .09, blackmarket_resume .12, corporate_blessing .15 | .15 | Which floor holds the cash |
| 2 | Lookout | hunting_permit .09, camouflage_kit .12, lucky_coin .08, rabbit_foot_charm .06, fox_tail_talisman .05 | .12 | Which guard shift change to wait for |
| 3 | Safecracker | mechanic_toolkit .08, thief_gloves .12, lab_kit .11, calculator_pro .09, cheat_sheet .13 | .13 | Which dial colour opens it |
| 4 | Driver | iron_spurs .10, guard_vest .08, arctic_wolf_spirit_charm .12 | .12 | Which escape route is clear |
| 5 | Muscle | wooden_rifle .08, iron_rifle .10, sniper_rifle .14, wolf_fang_dagger .10 | .14 | Which door is unguarded |
| 6 | Hacker | counterfeit_kit .10, eclipse_mask .14, python_skin_cloak .12, komodo_venom_flask .11 | .14 | Which camera feed to loop |

- Each role has at least one non-consumable shop or craft item, so a seat never depends on a consumable.
- `CaperCrew.itemBonus` stores the member's best owned bonus for the role at Start.
- **Crew edge** = mean of `itemBonus` over filled seats. Weakest items give 0.0733 (3 seats) to 0.08 (6 seats); best items give 0.1333 (3 or 6 seats), 0.13 (4 seats) or 0.132 (5 seats). This gives `successBonus`, dead in solo crime (`src/services/crimeService.ts:172`), a real effect.

### 8.3 The intel ring (new mechanic)
The 128-stage solo catalog is not reused (D8). At Start the server builds the run:
1. **Ring order** = seats in the role order of 8.2, filtered to filled seats (so with no Driver, Safecracker's intel goes to Muscle).
2. For each filled seat i: pick 4 labels from that role's pool of 6 with a `crypto.randomInt` Fisher–Yates shuffle, then `correct = crypto.randomInt(0, 4)`.
3. Store `Caper.answers = { order: string[], seats: { [role]: { options: string[4], correct: 0..3 } } }`. It is never rendered except through each seat's own brief.
4. **Seat i's correct answer is shown only to seat (i + 1) mod n.** Every member holds intel for someone else and needs intel from someone else. A blind guess passes 25% of the time. Brief wording template: "Tell <@next>: **<label>**" for the intel held, and "<call>? <@prev> has your intel" for the seat's own call (example: T2 n=5, order Mastermind, Lookout, Safecracker, Driver, Muscle; the Muscle holds the Driver's route and gets the door answer from the Mastermind).

**Label pools** (6 per role, plain text; button labels have no emoji, so an emoji can never hint at the answer):

| Role | Labels |
|---|---|
| Mastermind | Basement, Ground Floor, Mezzanine, 2nd Floor, 3rd Floor, Roof Office |
| Lookout | 9:00 PM, 10:15 PM, 11:30 PM, 12:45 AM, 2:00 AM, 3:15 AM |
| Safecracker | Crimson, Amber, Jade, Cobalt, Violet, Ivory |
| Driver | Harbor Bypass, Canal Street, Old Rail Road, Market Alley, Bridge Ramp, Tunnel 9 |
| Muscle | Loading Bay, Staff Door, Fire Exit, Skylight, Kitchen Door, Side Gate |
| Hacker | CAM-01, CAM-02, CAM-03, CAM-04, CAM-05, CAM-06 |

**The leak (AFK tolerance, D9).** `leakAt = goEndsAt − 30 s`. A seat is **dark** if its member had not opened the brief before `leakAt`: `briefOpened = false`, or `briefOpenedAt ≥ leakAt`. Darkness is a pure function of stored fields, so no snapshot job is needed.
- From `leakAt`, the brief of a seat whose intel holder is dark shows the answer directly ("Your contact went dark. The intel leaked: **Canal Street**"), and that seat's row gets `leaked = true` when it locks (display only, for the result card).
- A dark seat cannot lock a choice: its brief says "You went dark: this seat counts as a miss", and `cpr:act` refuses it. It is a miss and gets cut 0 (D49).
- Why this holds: a crew that stays dark on purpose to read every leaked answer turns every dark seat into a miss, so it Busts. One genuine AFK costs exactly one miss, so the best the crew can do is Messy. A member who opened the brief and then walked away is not dark: their partner gets no leak and must guess or be told.
- There is no patrol penalty for a leak: a leak always comes with a miss, so a penalty term would never apply.

### 8.4 Join window, step by step
1. **Plan** (`!caper`, tier select on S11, or `!caper plan <1-4>`). Planner must be Capo+. Checks, each failing with an ephemeral reason (or a public one-line reject for a prefix command):
   - family level unlocks the tier;
   - the bot has View Channel, Send Messages, Read Message History and Attach Files in this channel; otherwise the lobby posts in the home channel (if it is in this guild) or the plan is refused with the missing permission;
   - not "Under investigation" (fewer than 3 members with `crimeHeat ≥ 100`);
   - `now ≥ Family.nextCaperAt`;
   - fewer than 4 started capers in the rolling 24 h (`Caper{familyId, status ∈ [RUNNING, SETTLING, RESOLVED], startedAt ≥ now − 24h}`);
   - the planner passes every seat gate for the Mastermind seat (step 3).

   One transaction creates `Caper{status:"LOBBY", liveSlot:"LIVE", lobbyClosesAt: now + 600 s}` (`@@unique([familyId, liveSlot])` = one live caper per family), the planner's `CaperCrew{role:"MASTERMIND"}`, debits the planner's stake (`debitWalletInTx`, type `caper_stake`), and touches `Family.updatedAt`. After commit the lobby card S12 posts; its `channelId`/`messageId` are stored. `caper_lobby` DMs (with a jump link) go to members who are not seated, are in the lobby's guild, pass the tier's seat gates and have a free seat in their rolling 24 h, subject to the DM caps in 13.4.
2. **Lobby: 600 seconds.** Members pick an open role from the "Join as…" select (S12) or run `!caper join <role>` in the lobby's guild (D48). The select lists every open role (the card is shared, so it cannot be filtered per viewer); eligibility is checked on press, and a failure replies with the failing gate, naming the role's prep items when that is the gate.
3. **Seat gates** (`checkMemberEligibility(uid, "caper_t<n>", role)`), in order:
   1. member of this family with `joinedAt ≤ now − 72h` (no Associates), acting in the lobby's guild;
   2. not jailed, not banned;
   3. `crimeHeat` below the tier ceiling;
   4. `shiftsWorked`, Fortuna age, Discord age per 8.1;
   5. net worth per 8.1, from `computeNetWorth` (uncached; the 600 s `getNetWorth` cache would let one bankroll clear the gate for a whole lobby of alts);
   6. owns a prep key for the role;
   7. no other live seat (`@@unique([userId, liveSlot])`);
   8. fewer than **2** started seats in the rolling 24 h (`CaperCrew{userId, started:true, startedAt ≥ now − 24h}`).

   Then one `runFamilyTx` transaction: first CAS the caper document, `caper.updateMany({ where:{ id, status:"LOBBY", lobbyClosesAt:{ gt: now } }, data:{ seatsVersion:{ increment: 1 } } })`, `count === 1` or "Lobby closed"; then the guarded stake debit (`caper_stake`) and `caperCrew.create`. Writing the caper document makes a join conflict with a concurrent Start, Cancel, Leave or Kick (all of which also write it), so a join can never insert a row into a lobby that has just started or been cancelled. `@@unique([caperId, role])` and `@@unique([caperId, userId])` raise P2002 on a taken role or a double join; the transaction rolls back, stake included. The card re-renders (trailing debounce, 13.2).
4. **Leave** before Start (`cpr:leave:<caperId>`): in one transaction, CAS the caper document (`status:"LOBBY"`, `seatsVersion` increment), `caperCrew.deleteMany({ id, started:false })` with `count === 1` (the delete is the once-only guard and frees the role and the user's live slot), and refund the stake (`caper_stake_refund`, `earned = false`, D60). Kicks and Start's "pinched" removals use the same delete-and-refund. If the Mastermind leaves, the caper is cancelled and every stake refunded. Only a whole-caper end (cancel, VOID) keeps the rows, with `refunded:true`.
5. **Start.** Triggered by the planner pressing **Start** once required roles are filled, **automatically the moment every seat up to the tier maximum is filled**, or by the sweeper at `lobbyClosesAt` if required roles are filled. One `runFamilyTx` transaction:
   1. Re-validate every seat (jail, ban, heat ceiling, uncached net worth, prep ownership, rolling seat count). Failing seats are deleted and refunded (`earned = false`); the lobby later shows "<@x> got pinched".
   2. If required roles are no longer filled: the caper stays LOBBY until `lobbyClosesAt`; at `lobbyClosesAt` it is CANCELLED with every stake refunded.
   3. Re-check the family's rolling 4-per-24h count and `nextCaperAt`.
   4. CAS `caper.updateMany({ id, status:"LOBBY" })` → `{status:"RUNNING", startedAt:now, goEndsAt: now + 120 s, answers, edge, heatSnapshot, seatsVersion:{increment:1}}`, `count === 1`.
   5. Every crew row → `started:true, startedAt:now, itemBonus`. Stakes are now non-refundable (the burn is the stake row written at join), except by a VOID (step 7).
   6. `Family.nextCaperAt = now + familyCooldown(level)` (10.1).
   7. After commit: edit the card to GO (S13); post a new GO message (S28) in the lobby channel that mentions every crew member and carries an **Open brief** button; send each crew member a `caper_lobby` DM "Caper GO, ends <t:R>" with the jump link; `enqueueReminder(uid, "caper", oldestStartedSeatAt + 24h)` for each crew member who has now used 2 seats in 24 h (`src/services/cooldownReminderService.ts:17`). If the GO message cannot post, the DMs still go out.
6. **GO: 120 seconds.** Each member presses **Open brief** (`cpr:brief:<caperId>`, ephemeral S14) or runs `!caper brief` (which posts an opener card, S27). Opening sets `briefOpened = true, briefOpenedAt = now` (CAS from `briefOpened:false`, harmless if repeated). S14 has a **Refresh** button that re-renders the brief with the remaining time and, from `leakAt`, any leaked intel. A choice press `cpr:act:<caperId>:<0-3>` runs one transaction: refuse if the presser's seat is dark (8.3); `caperCrew.updateMany({ caperId, userId, choice:-1 })` → `{choice: idx, leaked: <holder dark && now ≥ leakAt>}` plus a guard read of `caper{status:"RUNNING", goEndsAt > now}`. One locked choice per member. The public card shows "Locked in 4/6", never correctness.
7. **Resolve** right after the press that locks the last choice (post-commit check `count(choice = -1) = 0`), or by the sweeper at `goEndsAt`. An unanswered seat is a miss with cut 0 (D49). **VOID (D55):** if the process booted after `startedAt` and at or before `goEndsAt` (the process records its boot time; the sweeper compares it), and any seat has `choice = -1`, the caper is not settled: in one transaction CAS `RUNNING → CANCELLED` with `outcome "VOID"`, refund every stake (`caper_stake_refund`, `earned = false`), set every crew row `started:false, refunded:true, liveSlot:<caperId>`, and write no heat, fine, jail, XP or vault cut. The rolling seat and caper counts ignore it because no row stays `started`.

If required roles are not filled at `lobbyClosesAt`, or the planner cancels, the caper is CANCELLED in one transaction: CAS `caper.updateMany({ id, status:"LOBBY" })` → `{status:"CANCELLED", liveSlot:<caperId>}`; every crew row is CAS'd `refunded:false → true` with `liveSlot:<caperId>` and its stake refunded (`earned = false`); rows are kept for the card; the rolling counts are untouched; and `Family.nextCaperAt = now + 1,800 s` (D42).

### 8.5 Success math
Pure function `resolveCaperOutcome({ n, misses k, roll r, base, edge, hottestHeat H })` in `src/services/crimeFamily/caperMath.ts` (k counts wrong choices, unlocked seats and dark seats):

```
bustAt = n <= 4 ? 2 : 3
q      = min(0.60, base × (1 − edge) + 0.002 × H)
k >= bustAt          → BUST
1 <= k < bustAt      → MESSY
k == 0 and r <  q    → MESSY   ("a patrol car turned the corner")
k == 0 and r >= q    → CLEAN
r = crypto.randomInt(0, 10_000) / 10_000, drawn once at resolve, stored in Caper.roll
H = highest crimeHeat among seats at Start (stored in Caper.heatSnapshot)
```

Because the heat ceiling caps H (T4: H ≤ 39), the heat term adds at most 0.078 at T4 and 0.138 at T1.

### 8.6 Payout formula and split
| Term | Formula |
|---|---|
| Outcome factor f | CLEAN 100%, MESSY 35%, BUST 0 (integer percent, so the pool is exact integer arithmetic: `B × n × fPct / 100`) |
| Pool | `B × n × f` (n = seats filled at Start) |
| Crew share (minted to wallets) | `floor(pool × 80 / 100)` |
| Vault cut (minted to `earnings`) | `floor(pool × 10 / 100)` |
| Fence (never minted) | the remaining 10% |
| Weights | every seat 1.00 (D22) |
| Cut | `cut = floor(crewShare / n)` for each seat that locked a choice; a seat with no locked choice (unlocked or dark) gets 0 (D49). Rounding remainders and unpaid seats' shares are never minted. |

Exact cuts (every seat that locked):

| Tier | n | Pool (Clean) | Crew share | Vault cut | Cut, Clean | Pool (Messy) | Vault cut, Messy | Cut, Messy |
|---|---|---|---|---|---|---|---|---|
| T1 | 3 | 1,050,000 | 840,000 | 105,000 | 280,000 | 367,500 | 36,750 | 98,000 |
| T1 | 4 | 1,400,000 | 1,120,000 | 140,000 | 280,000 | 490,000 | 49,000 | 98,000 |
| T2 | 4 | 2,200,000 | 1,760,000 | 220,000 | 440,000 | 770,000 | 77,000 | 154,000 |
| T2 | 5 | 2,750,000 | 2,200,000 | 275,000 | 440,000 | 962,500 | 96,250 | 154,000 |
| T3 | 5 | 4,250,000 | 3,400,000 | 425,000 | 680,000 | 1,487,500 | 148,750 | 238,000 |
| T3 | 6 | 5,100,000 | 4,080,000 | 510,000 | 680,000 | 1,785,000 | 178,500 | 238,000 |
| T4 | 5 | 6,000,000 | 4,800,000 | 600,000 | 960,000 | 2,100,000 | 210,000 | 336,000 |
| T4 | 6 | 7,200,000 | 5,760,000 | 720,000 | 960,000 | 2,520,000 | 252,000 | 336,000 |

- **No buff multipliers.** `checkCrownOfGreed`, `checkCounterfeitKit`, `checkDevilContract`, luck and `applyIncomeModifiers` (`src/services/shopBuffs.ts:244-249`) are never called. Income tax is not applied; the fence replaces it.
- Each cut is credited with `creditWalletInTx(tx, uid, name, cut, "caper_cut", {caperId, tier, role}, earned=true)`. Card garnishment applies after commit through `afterEarnedCredit` like all earned income.

### 8.7 Failure consequences
| Outcome | Money | Heat | Jail | Prep items |
|---|---|---|---|---|
| CLEAN | full cut | Clean heat per seat | none | kept |
| MESSY | 35% pool | Messy heat per seat | none | kept |
| BUST | no cut; each seat pays the tier fine via `applyEconomyPenaltyTx` (wallet first, then bank, which may go into debt; `Audit` row) | Bust heat per seat | per-seat roll at the tier rate; the roll is drawn once at resolve and stored in `CaperCrew.jailed`; bail is the standard 1,000 (D62) | kept |

A seat with no locked choice gets cut 0 on every outcome but still takes its heat, and the fine and jail roll on a Bust. The stake is lost on every outcome except a VOID (8.4 step 7). Heat is applied with `addCrimeHeatTx` inside the seat's settle transaction (14.4). `recordPotentialSoulLedgerLoss` (`src/services/shopBuffs.ts`) runs after commit for each fined seat.

### 8.8 Settlement (exactly once, crash-safe)
1. CAS `caper.updateMany({ id, status:"RUNNING" })` → `SETTLING`. Loser of a race gets `count 0` and stops. (The VOID check of 8.4 step 7 runs before this step.)
2. One transaction that starts with the draw CAS `caper.updateMany({ where:{ id, status:"SETTLING", roll:-1 }, data:{ roll: r, outcome, pool, crewShare } })`, `count === 1`, then writes `passed`, `cut`, `fine`, `jailed` on every crew row. All randomness is drawn here, once. On `count 0` another settler already drew: skip to step 3 and use the stored values. Steps 3–5 never recompute anything.
3. Per seat, one transaction: `caperCrew.updateMany({ id, settled:false })` → `settled:true` (`count === 1` or skip), then either `creditWalletInTx` (cut > 0) or `applyEconomyPenaltyTx` (fine > 0), then `addCrimeHeatTx`, then `jailUserTx` if `jailed`. Before the transaction the settler runs the exported `migrateLegacyHeatForUser(uid)` (14.4). A crash between seats leaves later seats `settled:false`; the sweeper resumes them.
4. One transaction: `caper.updateMany({ id, vaultPaid:false })` → `vaultPaid:true`, `family.update({ earnings:{increment: vaultCut}, xp:{increment: tierXp} })`, `FamilyLedger{type:"caper_cut"}`, `familyMember.updateMany({ capers:{increment:1} })` for the crew, then the arrears retry of 7.4 if `duesArrears > 0`.
5. CAS `SETTLING → RESOLVED`, `liveSlot = id`, every crew `liveSlot = caperId`.
6. After commit: `afterEarnedCredit` per paid seat, `recordPotentialSoulLedgerLoss` per fined seat, edit S12 to the result S15 (which lists every seat's cut, fine and jail time; there is no result DM, D58), and `logToChannel("TRADE")` when the pool is ≥ 5,000,000.

### 8.9 Cooldowns and caps
| Limit | Value | Enforcement |
|---|---|---|
| Seats per player | 2 started seats per rolling 24 h; 1 live seat at a time | `CaperCrew` count; `@@unique([userId, liveSlot])` |
| Capers per family | 4 started per rolling 24 h; 1 live at a time | `Caper` count; `@@unique([familyId, liveSlot])` |
| Family cooldown (from Start) | 3h00 at L1–3; 2h45 at L4–5; 2h30 at L6–8; 2h00 at L9–10 | `Family.nextCaperAt` |
| Cancelled or expired lobby | family cooldown 30 minutes | `Family.nextCaperAt` |
| Lobby / GO / leak point | 600 s / 120 s / GO − 30 s | `lobbyClosesAt`, `goEndsAt` |
| Solo crime cooldown | not touched | heat is the shared budget |

### 8.10 Expected value per member
Assumptions: edge 0.10 (typical gear), heat 0, every seat locks a choice (misses are wrong answers). Every seat is paid the same (D22), so a seat's EV equals the crew average. "Net" = gross cut − stake − expected fine.

**Realistic play (per-step pass rate p = 0.90):**

| Tier | n | P(Clean) | P(Messy) | P(Bust) | Gross EV/seat | Stake | E[fine] | Net/caper | Net/day (2 seats) | Vault EV/caper |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | 3 | 66.34% | 30.86% | 2.80% | 215,993 | 50,000 | 4,200 | 161,793 | 323,586 | 80,997 |
| T1 | 4 | 59.71% | 35.06% | 5.23% | 201,538 | 50,000 | 7,845 | 143,693 | 287,386 | 100,769 |
| T2 | 4 | 56.75% | 38.02% | 5.23% | 308,258 | 100,000 | 15,690 | 192,568 | 385,137 | 154,129 |
| T2 | 5 | 51.08% | 48.07% | 0.86% | 298,763 | 100,000 | 2,568 | 196,195 | 392,390 | 186,727 |
| T3 | 5 | 48.42% | 50.72% | 0.86% | 449,980 | 175,000 | 4,280 | 270,700 | 541,400 | 281,237 |
| T3 | 6 | 43.58% | 54.84% | 1.58% | 426,843 | 175,000 | 7,925 | 243,918 | 487,836 | 320,132 |
| T4 | 5 | 45.76% | 53.38% | 0.86% | 618,685 | 300,000 | 6,420 | 312,265 | 624,530 | 386,678 |
| T4 | 6 | 41.19% | 57.23% | 1.58% | 587,679 | 300,000 | 11,887 | 275,792 | 551,584 | 440,759 |

**Strong crew (p = 0.95):** T1 n=4 179,422/caper (358,844/day); T2 n=5 244,900 (489,800/day); T3 n=6 327,781 (655,562/day); T4 n=6 389,069 (778,138/day).

**Perfect play (p = 1.0, alts or a voice-chat crew):** no misses, only the patrol roll.

| Tier | Edge 0.10: P(Clean) | Net/caper | Net/day | Worst case, best gear: net/day (crew size, edge) | Mint per caper (crew + vault), max crew, best gear |
|---|---|---|---|---|---|
| T1 | 91.0% | 213,620 | 427,240 | 428,453 (n=3, 0.1333) | 1,188,747 (n=4, 0.13) |
| T2 | 86.5% | 301,390 | 602,780 | 605,526 (n=5, 0.132) | 2,265,541 (n=5, 0.132) |
| T3 | 82.0% | 425,440 | 850,880 | 856,773 (n=6, 0.1333) | 4,072,860 (n=6, 0.1333) |
| T4 | 77.5% | 519,600 | 1,039,200 | 1,049,600 (n=6, 0.1333) | 5,567,400 (n=6, 0.1333) |

Because every seat is paid the same, the perfect-play figure is also the planner's: a Capo who plans and takes the Mastermind seat on both daily runs earns 1,049,600/day at T4, not more.

Comparison (doc figures, `FORTUNA_V2_ECONOMY.md:143-159`; rent `src/services/propertyService.ts:24-28`):
- A realistic T4 seat pair (551,584/day) is below a World Zoo (866,000/day net) and well below a top shift line (2.58–4.14M/day).
- Perfect T4 play (1,049,600/day) is about a Legendary Rifle (1,459,000/day) minus a third, at a far higher entry cost: 40M net worth, 300 lifetime shifts, a level 8 family and a 300,000 stake per run.
- A T1 seat (287,386/day) is about a City Zoo (388,000) minus a quarter.

---

## 9. Rackets (territories)

### 9.1 The fixed list
Seeded by key (`RACKETS` in `src/data/crimeFamilyCatalog.ts`). Income is per 24-hour cycle, paid into the owner's `earnings`. War windows rotate between 18:00 UTC (EU evening), 01:00 UTC (US evening) and 12:00 UTC (Asia and Oceania evening, D53); both Crown wars fall on the weekend. Class levels: Corner any level, District family L4+, Crown family L7+ (D25).

| # | Key | Name | Class | Income / cycle | Bid floor (7 × income) | Baseline defence per block | Weekly war start (UTC) | `warDow` / `warHourUtc` |
|---|---|---|---|---|---|---|---|---|
| 1 | docks_numbers | Dockside Numbers | Corner | 300,000 | 2,100,000 | 30 | Mon 18:00 | 1 / 18 |
| 2 | laundromat_front | Laundromat Front | Corner | 300,000 | 2,100,000 | 30 | Tue 12:00 | 2 / 12 |
| 3 | harbor_customs | Harbor Customs Skim | District | 650,000 | 4,550,000 | 50 | Tue 18:00 | 2 / 18 |
| 4 | neon_strip | Neon Strip Clubs | District | 650,000 | 4,550,000 | 50 | Wed 01:00 | 3 / 1 |
| 5 | valet_racket | Valet Parking Racket | Corner | 300,000 | 2,100,000 | 30 | Wed 18:00 | 3 / 18 |
| 6 | pawn_row | Pawn Row Fencing | Corner | 300,000 | 2,100,000 | 30 | Thu 01:00 | 4 / 1 |
| 7 | union_kickbacks | Construction Union Kickbacks | District | 650,000 | 4,550,000 | 50 | Thu 18:00 | 4 / 18 |
| 8 | racetrack_book | Racetrack Bookmaking | District | 650,000 | 4,550,000 | 50 | Fri 12:00 | 5 / 12 |
| 9 | casino_row | Casino Row Protection | Crown | 1,300,000 | 9,100,000 | 80 | Sat 18:00 | 6 / 18 |
| 10 | city_hall | City Hall Contracts | Crown | 1,300,000 | 9,100,000 | 80 | Sun 12:00 | 0 / 12 |

**Total racket income in the economy: at most 6,400,000 per day (44,800,000 per week)**, fixed regardless of player count. Neglect (9.3) only lowers it.

### 9.2 Acquisition
- All rackets start owned by the Street (`ownerFamilyId = ""`).
- The only way to take a racket is to win its weekly war. There is no instant claim.
- On capture: `ownerFamilyId = attacker`, `capturedAt = lastPayoutAt = now`, `neglectStrikes = 0`. The previous owner's partial cycle is forfeited and never minted.

### 9.3 Income, who collects it, neglect
- **No manual collection.** The hourly job `tickRackets` (`5 * * * *` UTC) credits the owner's `earnings`. Members receive racket money only through Payday (7.3).
- Per owned racket: `rentCyclesDue(lastPayoutAt, now, 24)` (`src/services/propertyService.ts:44`, reused unchanged; banks at most 3 cycles after downtime).
- **Racket-eligible member** (`checkMemberEligibility(uid, "racket")`): tenure ≥ 72 h, `shiftsWorked ≥ 20`, Discord ≥ 90 d, not banned, and an active member (7.3: ≥ 2 started caper seats or ≥ 3 correct war hits in the last 7 days).
- Per due racket, one transaction with CAS `racket.updateMany({ id, ownerFamilyId: fam, lastPayoutAt: <read> })` → `lastPayoutAt: nextCollected`:
  - **≥ 3 racket-eligible members:** `earnings += cycles × income`, `xp += 20 × cycles`, `neglectStrikes = 0`, `FamilyLedger{type:"racket_income"}`, then the arrears retry of 7.4.
  - **< 3:** nothing minted, `neglectStrikes += cycles`, `FamilyLedger{type:"racket_neglect", amount:0}`. At `neglectStrikes ≥ 3` the racket is released (`ownerFamilyId:""`, `neglectStrikes:0`) and every member gets a `turf` DM. Each strike before that sends a `turf` DM "Neglect strike n/3: play two caper seats this week to keep <racket>" to every member who is not racket-eligible, and to the Boss and Underboss.

### 9.4 Contest: bidding, then a scheduled war
**Bidding picks the one attacker for the window.**

| Rule | Value |
|---|---|
| Window | opens 72 h before `startsAt`, closes 1 h before `startsAt` |
| Who | Boss or Underboss, paid from **earnings only** via `spendFromVault(..., { earningsOnly: true })`, held in escrow on the War row (`topBid`) |
| First bid | ≥ the floor (9.1) |
| Raise | ≥ `max(ceil(top × 1.10), top + 100,000)` |
| Outbid | same transaction: take the new escrow, return the previous escrow to the previous bidder's earnings, CAS `war.updateMany({ id, status:"BIDDING", bidClosesAt:{ gt: now }, topBid:<read>, topBidderFamilyId:<read> })` (the time guard refuses a bid between `bidClosesAt` and the next tick) |
| Owner | cannot bid on its own racket |
| Family constraints (checked in the bid transaction) | family level ≥ the class level (Corner any, District L4, Crown L7); held rackets + live top bids ≤ racket cap (10.1); at most 1 Crown held or bid; `duesArrears = 0`; not Under investigation; home channel set |
| Pair rule (D28) | refused if, in the last 14 days, the bidding family's Boss was a member of the owning family or the owning family's Boss was a member of the bidding family, or any two current members of one family were members of the other (`FamilyExit{userId, familyId, leftAt ≥ now−14d}`) |
| At close, with a bid | `ARMED`; the top bid **stays in escrow** and is burned at settlement (`FamilyLedger{type:"war_bid_burn"}`) whatever the result; `defenderFamilyId` = racket owner, or `""` (Street) if unowned |
| At close, no bid | `CANCELLED`; the owner keeps the racket for the week |
| Downtime cancel (D55) | the war is `CANCELLED` and the escrow returns to the attacker's earnings (`FamilyLedger{type:"bid_refund"}`), with no ownership change, XP or heat, if it went ACTIVE more than 600 s after `startsAt`, or if `War.maxTickGapSeconds > 600` at settlement (each minute tick on an ACTIVE war writes `lastTickAt` and keeps the largest gap) |

**The war.**

| Rule | Value |
|---|---|
| Length | 60 minutes from `startsAt` |
| Blocks | Docks, Main Street, Back Alleys |
| Who can act | members of the attacking or defending family, acting in their family's home guild (D48), who pass `checkMemberEligibility(uid, "war")`: tenure ≥ 72 h, Discord ≥ 90 d, Fortuna ≥ 14 d, `shiftsWorked ≥ 20`, not jailed, not banned, heat < 100 |
| Slot | `slot = floor((now − startsAt) / 300 s)`, values 0–11 |
| Weak point | per block and slot: `HMAC_SHA256(War.seed, block + ":" + slot)[0] mod 4`, an index into the block's 4 approaches. `War.seed` is 32 random hex chars set at ACTIVE and never rendered. |
| Approaches | Docks: Crane, Warehouse, Pier 4, Boathouse. Main Street: Bank Steps, Diner, Bus Stop, Hotel Lobby. Back Alleys: Fire Escape, Dumpster Row, Cellar Door, Laundry Line. |
| Contribution row | created on the member's first scout or hit by a pre-insert outside the money transaction: `upsert` on `@@unique([warId, userId])`; a P2002 from a racing first press is caught and the row re-read (no transaction is open, so the catch is safe) |
| **Scout** | free; once per member per slot (CAS `WarContribution.lastScoutSlot < slot`, in a transaction that also guards `war{status:"ACTIVE", endsAt:{gt: now}}`); reveals the current weak point of one **random** block (`crypto.randomInt(0, 3)`), valid until the slot ends. Crews share scouting in the home channel. |
| **Hit** | costs **25,000** from the wallet (guarded debit, burned, `turf_hit`); personal cooldown **600 s**; at most **6 hits per member per war**. Pressing a block button arms a hit (guarded on `war{status:"ACTIVE", endsAt:{gt: now}}`) and opens a 4-approach call with a **20 s** deadline (`min(now + 20 s, endsAt)`), judged against the slot at arm time. |
| Points | correct approach: **+10** to that block for the attacker, **+12** for the defender (home advantage × 1.2). Wrong or timed out: 0. |
| Baseline defence (D52) | the defender, family or Street, starts every block at the class baseline from 9.1 (30 / 50 / 80): `def*` fields are seeded at ACTIVE. The Street never hits. |
| Blackout | in the last 600 s the board shows each side's hit count and "??" for block scores |
| Result | each block goes to the higher score, ties to the defender; a family winning **≥ 2 of 3** blocks wins |
| Attacker wins | racket ownership moves (9.2) |
| Defender wins | no change |
| XP | a capture: attacker +300 × class multiplier (Corner 1, District 1.5, Crown 2); a defence: the defending family gets the same only if the attacker scored ≥ 1 correct hit on ≥ 2 blocks (D64); each correct hit +5 to the hitter's family |
| Heat | every attacking participant with ≥ 1 hit gets +15 heat on a loss |
| Money between families | **none**; nothing is looted |

With blind guessing a hit scores 2.5 points on average; with a scout's call it scores 10. Taking a Crown block from any defender that does not hit needs 9 correct hits (90 > 80); taking the racket needs 2 blocks, so 18 correct hits, at least 3 members hitting perfectly. Each correct defender hit adds 12 to that block.

### 9.5 Decay, upkeep and caps
| Mechanism | Rule |
|---|---|
| Neglect | < 3 racket-eligible members at a cycle → no mint and a strike; 3 strikes → released (9.3) |
| Inactive owner | defends at the baseline only; neglect releases its rackets within 3 cycles (6.7) |
| Upkeep | family dues 40,000 × level/day (7.4); defending above the baseline costs attendance and hit spend |
| Banking | at most 3 cycles banked after downtime (`MAX_BANKED_RENT_CYCLES = 3`, `src/services/propertyService.ts:37`) |
| Racket cap | 1 at L1–3; 2 at L4–6; 3 at L7–10 |
| Class level | District needs family L4+, Crown L7+ to bid |
| Crown cap | at most 1 Crown racket held or bid on at a time |
| Capture cost | the winning bid, at least 7 days of the racket's income, burned |

---

## 10. Progression

### 10.1 Levels
XP thresholds are cumulative. The level-up fee comes from the vault (earnings first) and is burned. Level-up is one transaction: `family.updateMany({ id, level:L, xp:{gte: threshold(L+1)}, duesArrears:0 })` → `level: L+1`, plus `spendFromVault(tx, fam, fee, "level_fee")`. Only the Boss or Underboss can press it (S8). XP is never spent.

| Level | XP to reach | Fee | Member cap | Racket cap | Tier unlocked | Family caper cooldown | Crest (cosmetic) |
|---|---|---|---|---|---|---|---|
| 1 | 0 | — | 6 | 1 | T1 | 3h00 | `cf_crest_1` bronze |
| 2 | 1,000 | 2,000,000 | 7 | 1 | — | 3h00 | `cf_crest_1` |
| 3 | 3,000 | 4,000,000 | 8 | 1 | T2 | 3h00 | `cf_crest_1` |
| 4 | 6,000 | 6,000,000 | 8 | 2 | — | 2h45 | `cf_crest_2` silver |
| 5 | 10,000 | 10,000,000 | 10 | 2 | T3 | 2h45 | `cf_crest_2` |
| 6 | 16,000 | 14,000,000 | 10 | 2 | — | 2h30 | `cf_crest_2` |
| 7 | 24,000 | 20,000,000 | 12 | 3 | — | 2h30 | `cf_crest_3` gold |
| 8 | 34,000 | 28,000,000 | 12 | 3 | T4 | 2h30 | `cf_crest_3` |
| 9 | 46,000 | 38,000,000 | 12 | 3 | — | 2h00 | `cf_crest_3` |
| 10 | 60,000 | 50,000,000 | 12 | 3 | — | 2h00 | `cf_crest_4` crowned gold, plus a gold "Made Family" line on the leaderboard |

Total fees L2 → L10: **172,000,000**.

### 10.2 XP sources
| Source | XP |
|---|---|
| Caper Clean / Messy / Bust | T1 150/60/20, T2 225/90/30, T3 300/120/40, T4 375/150/50 |
| Racket cycle minted | 20 per cycle (none on a neglected cycle) |
| Correct war hit | 5 |
| War won | capture: 300 × 1 / 1.5 / 2 (Corner / District / Crown); defence: the same, only if the attacker scored ≥ 1 correct hit on ≥ 2 blocks |
| Deposits, payday, scouting | 0 |

**Pacing** (p = 0.90, edge 0.10, a full roster whose members pass each tier's gates, 4 capers a day: T1 n=4 at L1–2, T2 n=5 at L3–4, T3 n=6 at L5–7, T4 n=6 at L8+; XP per day ≈ 447 / 634 / 788 / 964; vault EV per day 403,076 / 746,908 / 1,280,528 / 1,763,036 before dues; no rackets, no payday). A level needs both its XP and its fee (10.1), so the fee sets the pace (D51):

| Level reached | By XP alone (day) | Member deposits needed to keep the XP pace (cumulative) | With no deposits (day) |
|---|---|---|---|
| L3 (T2) | 7 | 3.6M | 18 |
| L5 (T3) | 18 | 13.0M | 45 |
| L8 (T4) | 49 | 42.9M | 105 |
| L10 | 76 | 92.5M | 167 |

Held rackets shorten the no-deposit column (one racket of the highest class allowed, held from the level it unlocks, brings L10 to about day 90 before capture bids); paying out Payday lengthens it. Either way the endgame is long ("Endgame is long", `FORTUNA_V2_ECONOMY.md:26`), and deposits are a sink: treasury never returns to a wallet.

### 10.3 Perks
Capacity (members, rackets), cooldown trims, tier unlocks and crests only. **No level grants a money multiplier, a payout bonus or a cheaper stake.**

### 10.4 Family leaderboard
`!crew top` (S10): three sorts, chosen by buttons: **XP** (`@@index([xp])`), **Rackets held** (count of `Racket` by `ownerFamilyId`), **War wins** (`@@index([warWins])`). Top 10 plus the caller's family rank. Each line: rank (medal emotes `Mascot.Emotes.MedalGold/Silver/Bronze` for 1–3), crest emoji, `[TAG] Name`, level, members, rackets. **No vault and no family net worth is ever shown.**

---

## 11. Economy numbers

### 11.1 Daily income per member by band
Realistic play (p = 0.90, edge 0.10). Payday per day = weekly net payday ÷ 7. Earnings either pay the level fees or go out as Payday, never both, so each band shows payday as a range: 0 while the family spends earnings on levels, up to the pay-out figure when it does not. Share is of the band floor.

| Band (`FORTUNA_V2_ECONOMY.md:30-34`) | Band income/day | Reachable tiers | Assumed family | Caper net/day (2 seats) | Payday net/day | Feature total/day | Share of band floor |
|---|---|---|---|---|---|---|---|
| Week 1 | 1–1.5M | none (14-day Fortuna gate) | — | 0 | 0 | 0 | 0% |
| Weeks 2–4 | 3–6M | T1 only (T2 needs 30 days of Fortuna age) | L3, 8 members, 4 T1 capers/day (n=4), 1 Corner racket | 287,386 | 0 – 69,240 | 287,386 – 356,626 | 9.6–11.9% |
| Month 2+ | 8–15M | T3, T4 | L8, 12 members who all pass the T4 seat gates (40M net worth, 300 shifts, 45 days), 4 T4 capers/day (n=6), 1 District + 1 Crown held | 487,836 (T3) – 551,584 (T4) | 0 – 135,714 (cap) | 487,836 – 687,298 | 6.1–8.6% |
| Any band, perfect play | — | T4 | as above, p = 1.0, best gear | 1,049,600 | 135,714 | 1,185,314 | 14.8% of the Month 2+ floor |

A member below a tier's gates gets no seat in that tier's runs; the family's 4 capers a day are shared between tiers, so a mixed family runs some T1–T2 capers for them at lower XP.

How the payday figures were derived (pay-out case):
- **Weeks 2–4:** earnings inflow = 4 × 100,769 (T1 vault EV) + 300,000 (racket) − 120,000 (dues at L3) = 583,076/day = 4,081,532/week. Gross per member = min(floor(4,081,532 / 8), 1,000,000) = 510,191; net 484,682/week = 69,240/day. In the levelling case this inflow goes to fees instead (10.2: L5 needs 22M of fees from L2, against about 4M/week of inflow, so members also deposit).
- **Month 2+:** inflow = 4 × 440,759 + 650,000 + 1,300,000 − 320,000 (dues at L8) = 3,393,036/day = 23,751,252/week. A holder that defends pays no bid; the one-off capture bids (at least 4,550,000 and 9,100,000) came from earlier earnings. Gross per member = min(1,979,271, 1,000,000) = 1,000,000 → net 950,000/week = 135,714/day. The remaining 11,751,252/week funds the L9 (38M) and L10 (50M) fees in about 7.5 weeks; a family that skips Payday pays them in about 26 days.

Existing sources at the same bands, for scale: World Zoo 866,000, Mansion rent 1,380,000, Legendary Rifle 1,459,000, top shift line 2.58–4.14M/day (economy report §3). Family income sits beside them and never replaces them.

### 11.2 The creation cost
The 10,000,000 creation fee is a flat sink, not an asset (D16). A founder is at least 30 days old, so it is about one day of Month 2+ income (`FORTUNA_V2_ECONOMY.md:34`). Founding pays nothing that membership does not, so no payback is claimed; the 20–40-day asset band (`FORTUNA_V2_ECONOMY.md:22`) does not apply. The family's grind is the 172,000,000 of level fees (10.1, 10.2).

### 11.3 Source and sink ledger
| # | Flow | Kind | Amount | Bound |
|---|---|---|---|---|
| S1 | Caper crew cut | **mint** → wallets | 0.80 × B × n × f | 2 seats/player/rolling 24 h; 4 capers/family/rolling 24 h |
| S2 | Caper vault cut | **mint** → earnings | 0.10 × B × n × f | same |
| S3 | Racket income | **mint** → earnings | 300k / 650k / 1.3M per cycle | 6,400,000/day bot-wide; needs ≥ 3 eligible members |
| T1 | Payday | earnings → wallets | gross ≤ 1,000,000 per member per week | once per 7 days; equal split |
| T2 | Stake refund (before Start, cancel, VOID) | return, `earned = false` | 50k–300k | — |
| T3 | Bid refund on outbid or a cancelled war | return to earnings | escrow | — |
| T4 | Deposit | wallet → treasury (locked) | ≥ 10,000 | 25,000,000/member/UTC day |
| K1 | Creation fee | sink | 10,000,000 | per family |
| K2 | Rename | sink | 2,000,000 | per 30 days |
| K3 | Level-up fees | sink | 2M → 50M (172M total) | per level |
| K4 | Daily dues | sink | 40,000 × level/day | — |
| K5 | Caper stake | sink | 50k / 100k / 175k / 300k per seat per run | every started run |
| K6 | Bust fine | sink | 150k / 300k / 500k / 750k per seat | 0.9–5.2% of runs at p = 0.90 |
| K7 | Deposit tax | sink | 5% | — |
| K8 | Payday tax | sink | 5% | — |
| K9 | Winning war bid | sink, burned at settlement | ≥ 2.1M / 4.55M / 9.1M | per racket-week |
| K10 | War hits | sink | 25,000 each | ≤ 6 per member per war |
| K11 | Treasury and earnings on disband | sink | full balance after the capped final payday | — |
| — | Heat → Fixer and raids | **not counted** (D63) | Fixer `max(150,000, ceil(heat) × 4,000)`; a raid on an empty wallet resets heat for free (`src/services/taxService.ts:294-296`) | existing code, unchanged |
| N1 | Fence | never minted | 0.10 × pool | — |
| N2 | Cut rounding remainder | never minted | < n Fortunes per caper | — |
| N3 | Neglected racket cycles | never minted | full cycle | — |
| N4 | Wallet overflow on a caper cut | never minted | excess over `MAX_SAFE_BALANCE` | recorded in `meta.capped` |

### 11.4 Worst-case mint audit
A family of 12 alts played by one person at p = 1.0 with the best gear, running 4 T4 capers per rolling 24 h at n = 6:
- Minted per caper: crew 4,948,800 + vault 618,600 = 5,567,400. Per day: 22,269,600.
- Burned per day: stakes 7,200,000 + dues 320,000.
- Per account per day: crew 1,649,600 − stakes 600,000 = 1,049,600, plus payday ≤ 135,714 net = **1,185,314**, 14.8% of the Month 2+ floor (8M) and 7.9% of its ceiling.
- Each of those 12 accounts needs ≥ 300 lifetime shifts (shifts are gated by the work cooldown; Black Market Resume adds 3–8 at 65% once per 24 h, `src/services/shopItemEffects.ts:1013-1018`), ≥ 45 days of Fortuna age, ≥ 90 days of Discord age and its own prep item; net worth (≥ 40M) is checked uncached at join and again for every seat at Start, so a crew of six needs 240M at the same moment rather than one bankroll passed between alts; and the family must reach level 8 (34,000 XP, 84,000,000 in fees from L2 to L8).
- Nothing compounds: no perk multiplies income and vault money cannot fund seats or stakes.

---

## 12. Anti-abuse

### 12.1 One eligibility seam
`checkMemberEligibility(uid, gate, opts?)` in `src/services/crimeFamily/eligibility.ts` returns `{ ok: boolean, failures: { gate: string, need: string, have: string }[] }`. Every join, seat, start, payday, racket and war check calls it, so a gate is tightened in one table:

Every gate also requires **not banned** (`User.isBanned` false, or `banExpiresAt` in the past; a read, not a filter, so no isSet guard is needed).

| Gate | Discord age | Fortuna age | `shiftsWorked` | Net worth | Tenure | Heat | Other |
|---|---|---|---|---|---|---|---|
| `found` | ≥ 180 d | ≥ 30 d | ≥ 60 | ≥ 15M | — | < 70 | not jailed, not in a family |
| `family_join` | ≥ 90 d | ≥ 14 d | ≥ 20 | ≥ 1M | — | — | not jailed |
| `caper_t1` | ≥ 90 d | ≥ 14 d | ≥ 20 | ≥ 2M | ≥ 72 h | < 70 | not jailed, role prep item, seat limits, acting in the lobby's guild |
| `caper_t2` | ≥ 90 d | ≥ 30 d | ≥ 60 | ≥ 8M | ≥ 72 h | < 60 | same |
| `caper_t3` | ≥ 90 d | ≥ 30 d | ≥ 150 | ≥ 20M | ≥ 72 h | < 50 | same |
| `caper_t4` | ≥ 90 d | ≥ 45 d | ≥ 300 | ≥ 40M | ≥ 72 h | < 40 | same |
| `war` | ≥ 90 d | ≥ 14 d | ≥ 20 | — | ≥ 72 h | < 100 | not jailed, acting in the family's home guild |
| `racket` | ≥ 90 d | — | ≥ 20 | — | ≥ 72 h | — | active member (7.3) |
| `payday` | ≥ 90 d | ≥ 14 d | ≥ 20 | — | ≥ 7 d | — | active member (7.3) |

Discord age is `SnowflakeUtil.timestampFrom(uid)`. Net worth is `computeNetWorth` called directly (exported from `src/services/netWorthService.ts:25`), never the 600 s `getNetWorth` cache (`:20`, `:111-117`), which nothing invalidates. The guild condition is passed in by the handler as `opts.guildId` and compared with the caper's or family's guild; the eligibility module never calls Discord.

### 12.2 Threats and defences
1. **One family per account.** `FamilyMember.userId @unique`, enforced by the DB.
2. **Join and hop.** Hop cooldowns (6.6), same-family rejoin 14 days, 3 accepted invites per inviter per 7 days, 5 accepted joins per family per 7 days, 72 h tenure before seats, hits and racket eligibility, 7 days before payday.
3. **Alt collusion in capers.** Same-IP is unknowable, so every seat costs real play: non-transferable `shiftsWorked` and age gates (12.1), a prep item, a burned stake, the heat ceiling. Net worth is a secondary gate because a main can push it to an alt for 5% or a 10k Tax Shield (`src/services/shopBuffs.ts:52-55`). **Accepted residual risk:** one human with six qualified accounts passes the intel ring perfectly; 11.4 bounds that at 1,185,314 per account per day.
4. **Per-pair limits.** (a) Inviter and family join caps (above). (b) The 14-day pair rule on bids (Boss, or any two members, 9.4). (c) A co-crew pair cap is not added: with 2 seats per 24 h a pair shares at most 14 capers a week, the same as a real duo.
5. **Vault laundering.** Section 7.5: no single-recipient exit, treasury never withdrawable, earnings-first spending, earnings-only bids, two inline 5% taxes, payday cap. Refunds are never earned income (D60), so a join/leave loop completes no quest.
6. **Rob interplay.**
   - The vault cannot be robbed and is never raided (raids touch the wallet only, `src/services/taxService.ts:285`).
   - Caper cuts and paydays land in wallets and are robbable as normal. Payday DMs go out in the same minute; robbers watching for them is intended drama.
   - Rob gives no war points and no XP, so staged robs between families gain nothing.
   - A jailed member cannot plan, join, deposit, bid, scout, hit or accept an invite; each of those services calls `checkJailStatus`. They can view every card and open their brief, because `crew`, `caper` and `turf` are **not** in `restrictedInJail` (13.1).
   - Jailed after joining but before Start: removed and refunded at Start. Jailed during GO: the brief and choice still work (the stake is paid; jail does not undo a live job).
7. **Heat propagation.** Personal heat per seat (8.1). Family-level effect is derived, not stored: ≥ 3 members at `crimeHeat ≥ 100` makes the family **Under investigation** (no planning, no bids; shown on S2). It is a soft brake: an empty-wallet raid can reset a member's heat (D63), and members that hot cannot take any seat anyway (ceilings < 70). The hottest seat raises the patrol chance by 0.002 per heat point (8.5).
8. **Inactivity.** Succession at 7 and 14 days (6.7); inactive owners defend only at the baseline and lose rackets to neglect; payday and racket eligibility require recent play, not just a command ping.
9. **Spam.** 5 pending invites per family; one live caper per family; 30-minute cooldown after a cancelled lobby; lobby DMs only to members in the lobby's guild who could actually take a seat, at most 3 per member per rolling 24 h, none for 2 h after a cancelled lobby, and only if they keep the `caper_lobby` toggle on; lobby edits debounced to one per 2 s with a trailing render; war boards refreshed once a minute; hits 600 s apart at 25,000 each.
10. **Griefing.** A saboteur who relays wrong intel and picks wrong can force k = 2. Mitigations: the result card names each step's intel holder and actor ("Door call missed: intel <@A> → call <@B>"); the saboteur pays their own stake and fine; kick plus the 14-day same-family block follows. Accepted.
11. **Tester bypass must not apply.** No module under `src/services/crimeFamily/` imports `isTester` (`src/utils/developerAccess.ts:22-29`). That covers creation fee, stakes, fines, deposit tax and cap, payday interval and eligibility, family cooldown, seat and caper caps, live-slot uniques, hop cooldowns, racket cycle timing (do **not** copy `src/services/propertyService.ts:306`, `:319`), bid rules, hit cooldown and cap, and war timing. Testers keep only the existing DM skip inside `sendOptOutDm` (`src/services/dmNoticeService.ts:53`) and `enqueueReminder` (`src/services/cooldownReminderService.ts:19`). `test/anticheat/family-tester.test.ts` pins this.

---

## 13. Commands and UI

### 13.1 Commands
| Prefix | Aliases | Slash (new top-level) | Subactions | Jail |
|---|---|---|---|---|
| `!crew` | `mob` | `/crew action:<choice> target:<str>` | (none) dashboard, `create`, `invite <user>`, `accept <TAG>`, `decline <TAG>`, `leave`, `kick <user>`, `promote <user>`, `demote <user>`, `handover <user>`, `deposit <amount>`, `vault`, `payday`, `levelup`, `log`, `top`, `info <TAG>`, `home`, `rename`, `disband`, `claim` (21 choices, ≤ 25) | **Not** in `restrictedInJail`: viewing works in jail. Every money or membership subaction calls `checkJailStatus` in the service. |
| `!caper` | `capers` | `/caper action:<choice> value:<str>` | (none) view or planner, `plan <1-4>`, `join <role>`, `leave`, `start`, `cancel`, `brief` | **Not** in `restrictedInJail` (`src/commandRouter.ts:263-268` blocks a whole command with no subcommand awareness, which would block `brief` for a member jailed during GO). Plan, join and start call `checkJailStatus` in the service; view, brief and choice stay open. Alias in `normalizeCommand` (`:113-195`). |
| `!turf` | `racket`, `rackets` | `/turf action:<choice> racket:<str, 10 choices> amount:<str>` | (none) map, `racket <key>`, `bid <key> <amount>`, `war` | **Not** in `restrictedInJail`; bid, scout and hit call `checkJailStatus` in the service; the map and boards stay viewable. Aliases in `normalizeCommand`. |

- User targets are free text (id, mention or exact username), resolved like `rob` (D41).
- Router: literal `case "crew":`, `case "caper":`, `case "turf":` in `routeMessage` (`src/commandRouter.ts:282-651`), lazy `require` like `:559-573`, so `src/scripts/validateSlashCommands.ts:38-45` passes. Slash goes from 70 to 73 of 100 (`src/slash/registry.ts:45-235`).
- The "did you mean" list (`src/commandRouter.ts:627-632`) gains `crew`, `caper`, `turf`.
- Help: a new `CategoryData` "Crime Families" in `CATEGORIES` (`src/commands/general/help.ts:39`; 17th category, fits page 3 at `PAGE_SIZE = 6`). `MODULE_EMOTES` (`:326`) is a module-level constant evaluated at import, before `initEmojiRegistry` runs (`src/index.ts:81`), so it gets `crimefamilies: Mascot.Emotes.Gun` only; a new `MODULE_APP_EMOJI = { crimefamilies: "cf_crest_1" }` is resolved at render time in the two lookups (`:388`, `:432`): `(MODULE_APP_EMOJI[id] && emojiInline(MODULE_APP_EMOJI[id])) ?? MODULE_EMOTES[id] ?? ""`. No module-level constant may call `cfEmoji`. Tutorial: one `SystemLesson` in `LESSONS` (`src/commands/general/tutorial.ts:43`).
- The marriage `!family` card gains one hint line: "Crime families are `!crew`."
- Any subaction whose target is a private screen or a modal (`vault`, `payday`, `levelup`, `log`, `disband`, `rename`, `leave`, `kick`, `create`, `brief`, `racket <key>`) replies with a public opener card (S27) owned by the caller; its button opens the ephemeral screen or the modal.
- `casinoGuide` is not changed (D40).
- `ADMIN_COMMANDS` gains `crew-forcerename` (6.2).

### 13.2 customId scheme and routing
Owner-scoped panels use `scope:action[:args]:ownerId` with the owner last (house style, `src/commands/economy/bank.ts:66-79`). Shared cards carry a DB id; the press is authorised against DB rows.

| Prefix | customIds | Who may press |
|---|---|---|
| `crew:` (owner) | `crew:v:<home\|vault\|manage\|log\|top\|invites>:<ownerId>`; `crew:create:open:<ownerId>` (modal opener); `crew:create:ok:<TAG>:<base64url(name)>:<ownerId>`; `crew:create:no:<ownerId>`; `crew:mg:sel:<ownerId>` (member select); `crew:inv:sel:<ownerId>` (S24 accept select); `crew:mg:<promote\|demote\|kick\|chair>:<targetId>:<ownerId>` (kick and chair open the S26 confirm); `crew:cf:<leave\|kick\|chair>:<ok\|no>:<targetId\|0>:<ownerId>` (S26); `crew:open:<vault\|payday\|level\|log\|disband\|rename\|leave>:<ownerId>` and `crew:open:kick:<targetId>:<ownerId>` (S27 opener buttons; `rename` and `disband` open the modal); `crew:vault:<deposit\|payday\|level>:<ownerId>` (deposit opens a modal); `crew:pay:ok:<E>:<N>:<ownerId>`; `crew:lvl:ok:<L>:<ownerId>`; `crew:log:<page>:<ownerId>`; `crew:top:<xp\|rk\|war>:<ownerId>`; `crew:disband:<open\|no>:<ownerId>` (open shows the modal) | the owner; the action re-reads the presser's role from the DB |
| `crew:` (modals) | `crew:modal:<create\|deposit\|rename\|disband>:<ownerId>` | the opener (`awaitModalSubmit` is never used; modal submits route through `interactionCreate`) |
| `crew:` (shared) | `crew:inv:<accept\|decline>:<inviteId>`; `crew:claim:<familyId>` | invitee per `FamilyInvite.inviteeId`; the Underboss per DB |
| `cpr:` | `cpr:v:plan:<ownerId>` (S2 Caper button → ephemeral S11); `cpr:plan:<ownerId>` (tier select); `cpr:join:<caperId>` (role select); `cpr:leave:<caperId>`; `cpr:start:<caperId>`; `cpr:cancel:<caperId>`; `cpr:brief:<caperId>` (also S14's Refresh); `cpr:act:<caperId>:<0-3>`; `cpr:open:brief:<caperId>:<ownerId>` (S27 opener for `!caper brief`) | join: a member of `caper.familyId` passing the seat gate, pressing in `caper.guildId`; start and cancel: `caper.plannerId` or the Boss; leave, brief, act: the presser's own `CaperCrew` row |
| `turf:` | `turf:sel:<ownerId>` (racket select); `turf:v:<map\|war>:<ownerId>` (S2 Turf button → ephemeral S16; omitted while `turfEnabled` is false); `turf:open:racket:<racketKey>:<ownerId>` (S27 opener for `!turf racket <key>`); `turf:bid:<racketKey>:<ownerId>` (modal opener); `turf:modal:bid:<racketKey>:<ownerId>`; `turf:scout:<warId>`; `turf:hit:<warId>:<docks\|main\|alleys>`; `turf:hx:<hitId>:<0-3>` | bid: Boss or Underboss; scout, hit: an eligible member of the attacking or defending family, pressing in its home guild; hx: the `WarHit.userId` |

- The longest id is `crew:create:ok:<4>:<32>:<20>` at 73 characters (limit 100); next are `cpr:open:brief:<24>:<20>` (60) and `crew:cf:chair:ok:<20>:<20>` (58).
- **Routing:** three `startsWith` branches beside `crime:` in `src/index.ts:214-227`, each lazily requiring `src/handlers/crewInteractionHandler.ts`, `caperInteractionHandler.ts`, `turfInteractionHandler.ts`. No prefix collides with an existing one (`bank_`, `bank:`, `crime:`, `heat:`, `hunt_`, `zoo_`, `shop_*`, `help:`, `tut:`, `settings:` …).
- **Ack:** handlers ack themselves; none is added to `shouldEarlyAcknowledgeInIndex` (`src/utils/interactionHelpers.ts:160-204`). Every handler acks (deferUpdate, deferReply or showModal) before any Redis or DB call; the `cf:active` write is fire-and-forget after the ack.
- **Modal openers** (`crew:create:open`, `crew:vault:deposit`, `crew:disband:open`, `crew:open:rename`, `crew:open:disband`, `turf:bid`) check only `i.user.id === ownerId` from the customId and then call `showModal` with no awaited I/O before it (a Mongo read first can miss the 3 s window, and the resulting 10062 is swallowed, `src/utils/interactionHelpers.ts:20-31`, `src/index.ts:262-263`). Role, jail, arrears and gate checks run on the modal submit, which defers ephemerally first.
- **Shared-card updates** have one writer: `renderCaperCard(caperId)` / `renderWarBoard(warId)` build from the DB and call `channel.messages.edit(messageId, payload)` without a fetch. A press on a shared card does `deferUpdate` and then calls the renderer; it never sends a locally built payload through `safeEditReply`, so a slow press cannot overwrite a newer roster. They never use an interaction token (15-minute lifetime). Errors 10003, 10008, 50001 and 50013 mean a dead board: set `messageId = ""`, try one repost (the lobby channel for capers, the home channel for wars), then fall back to DMs only and stop refreshing that board.
- **Debounce:** lobby and war renders use a trailing debounce (14.3): the first event renders at once; events inside the window schedule exactly one more render from the DB when it ends. The minute sweeper also re-renders every LOBBY card once, so a lost timer heals within 60 s. On a Redis error, render anyway.
- **Rejections:** one helper, `rejectPress(i, text)` in `src/utils/interactionHelpers.ts`: if the interaction was deferred ephemerally it edits the placeholder (`safeEditReply(i, { content: text })`, legal because the V2 flag is not set yet); if it was deferred with `deferUpdate` it sends `safeFollowUp(i, { content: text, flags: Ephemeral })`; otherwise `safeReply(i, { content: text, flags: Ephemeral })`. `safeReply` alone would turn a deferred ephemeral into a follow-up and leave the "thinking…" placeholder stuck (`:63-65`). Every `crew:`/`cpr:`/`turf:` handler uses it. Prefix commands reject with a public one-line `errorContainer`.
- **Flags and mentions:** every send and edit sets `MessageFlags.IsComponentsV2`; ephemeral sends OR in `MessageFlags.Ephemeral`. `setAccentColor` is never called. No `content` or `embeds` beside the V2 flag. Every send and edit passes `allowedMentions: { parse: [] }` through one wrapper beside `v2Reply` (house precedent `src/commands/general/settings.ts:110`), so a roster never pings the family. Exceptions: S4 `{ users: [inviteeId] }`, S23 `{ users: [underbossId] }`, the GO message (S28) `{ users: <crew ids> }`.
- **Attachments:** a render into a screen with file art, from a message that does not already hold that exact attachment name, sends `files:[art]` and `attachments: []` (S5 or S6 Back to S2, S17 Back to S16, S11 to S12, a dead-board repost). Same-screen re-renders (S10 sort, S12 roster, S13, S21) send no files and keep `attachment://` (precedent `src/commands/games/hunt.ts:262-277`).
- **Art fallbacks:** when `findAsset` returns null for a thumbnail, the builder emits a TextDisplay instead of the Section (never an accessory-less Section). When a gallery banner is missing, the MediaGallery is omitted and no file is sent (D66); S13 and S21 emit the gallery only if the message already holds the banner (`message.attachments.some(a => a.name === banner)`). When `cfEmoji` returns undefined, the emoji is omitted and the text label stays (section 20.4).

### 13.3 Screens
Counting rule (`src/scripts/checkV2Payloads.ts:37-43`): Container 1, TextDisplay 1, Separator 1, Section = 1 + texts + accessory, Thumbnail 1, MediaGallery 1, ActionRow 1 + its buttons, select row 2. All screens use `MessageFlags.IsComponentsV2`.

| # | Screen (trigger) | Visibility | Components (count) | Image / emoji | Who presses | Timeout |
|---|---|---|---|---|---|---|
| S1 | No-family card (`!crew` with no family) | public | Container[Section(2 text + thumbnail) 4, Sep, Text "Join a family" checklist (✓/✗ per `family_join` gate, first), Text "Found one" checklist (✓/✗ per `found` gate), Text hint ("Ask a family's Capo for an invite; `!crew top` lists families; caper lobbies and results post in this server"), Row(Create, My invites, Top families) 4] = **13** | thumbnail `cf_fortuna_don.png` (500 mascot) | caller | none (persistent route; presses re-validate) |
| S2 | Family dashboard (`!crew`) | public | Container[Section(`## <crest> [TAG] Name` + level/XP/members line + thumbnail) 4, Sep, Text roster (≤ 12 lines: rank emoji, mention, role, "Associate until `<t:R>`"), Sep, Text status (dues paid or "in arrears N days" with no amounts (D59), rackets, next caper `<t:R>`, investigation), Text hint, Row(Vault, Caper, Turf, Manage, Log) 6; when the caller is the Underboss and the Boss is inactive ≥ 7 d, + Row(Claim the chair `crew:claim:<familyId>`) 2] = **16**, worst case **18**. The Turf button is omitted while `turfEnabled` is false. | thumbnail `cf_crest_<1-4>.png`; inline `cf_rank_*` | caller (ids are owner-scoped); Manage needs Capo+ | none |
| S3 | Create confirm (after the create modal) | ephemeral | Container[Text title, Sep, Text cost, gates met, name and tag preview, Row(Confirm, Cancel) 3] = **7** | **no image**: a 10M decision; the cost line must be the focus | caller | token (15 min); Confirm re-validates everything |
| S4 | Invite card (`!crew invite`) | public, plus a DM to the invitee | Container[Section(2 text + thumbnail) 4, Text terms (hop cooldown, family cap, gates), Row(Accept, Decline) 3] = **9** | thumbnail family crest | invitee only | 24 h; the sweeper edits it to "Expired" with no row |
| S5 | Manage | ephemeral | Container[Text, Sep, Text permission legend, SelectRow(member ≤ 12, rank emoji per option) 2, Row(Promote, Demote, Kick, Hand over, Back) 6] = **12**; Kick and Hand over open the S26 confirm | **no image**: dense utility panel | owner (Capo+; each action re-checks) | token |
| S6 | Vault | ephemeral | Container[Text `## <cf_vault> Vault`, Sep, Text treasury / earnings / dues / arrears / last payday / next payday (the only screen with vault amounts), Text last 10 ledger lines, Sep, Text rules hint (when Payday is locked: one line per member with their failing payday gate, ≤ 12 lines), Row(Deposit, Payday, Level up, Back) 5] = **12** | inline `cf_vault` only: a private money panel stays light | members; Payday and Level up: Boss or Underboss | token |
| S7 | Payday preview | ephemeral | Container[Text, Text per-member split (≤ 12 lines) + ineligible names with reasons, Row(Confirm, Cancel) 3] = **6** | **no image** | Boss / Underboss | token; Confirm CAS fails and re-previews if earnings changed |
| S8 | Level-up confirm | ephemeral | Container[Text, Text fee and bucket split, Row(Confirm, Cancel) 3] = **6** | **no image** | Boss / Underboss | token |
| S9 | Log (15 lines/page) | ephemeral | Container[Text, Text 15 ledger lines, Row(Prev, page (disabled), Next) 4] = **7** | **no image** | members | token |
| S10 | Leaderboard (`!crew top`) | public | Container[Section(2 text + thumbnail) 4, Sep, Text top 10, Sep, Text your family's rank, Row(XP, Rackets, Wars) 4] = **13** | thumbnail `cf_crest_4.png`; inline crests and medal emotes | caller | none |
| S11 | Caper planner (`!caper`, or the S2 Caper button) | public from `!caper`; ephemeral from S2 | Container[Section(2 text + thumbnail) 4, Sep, Text "How a caper works" (4 lines: plan, join by role, GO 120 s and the intel ring, dark seats miss), Text tier table (B, stake, fine, ceiling, gates), Text family status (cooldown `<t:R>`, started x/4 in 24 h, arrears), SelectRow(tier ≤ 4) 2] = **11** | thumbnail `cf_caper.png` | caller; the select needs Capo+ | none |
| S12 | Lobby | public, stored `channelId`/`messageId` | Container[MediaGallery 1, Text header + closes `<t:R>`, Sep, Text roster (6 lines `cf_role_*` + member or "open"), Sep, Text terms (stake, Clean cut, fine, heat, ceiling, gates), Text hint, SelectRow "Join as…" (every open role) 2, Row(Leave, Start, Cancel) 4] = **14**; with no open role the select is omitted and the hint reads "All seats filled, waiting for Start" (**12**); without the banner file the gallery is omitted (−1); 1 file | gallery banner `cf_caper_t<1-4>.png` | 13.2 | 600 s, then sweeper starts or cancels |
| S13 | GO (edit of S12) | public | Container[MediaGallery, Text header + GO ends `<t:R>` + leak time, Sep, Text "Locked in x/n" roster, Text hint, Row(Open brief) 2] = **8** | same banner if the message holds it; the edit sends no `files` | crew | 120 s |
| S14 | Brief | ephemeral | Container[Text intel you hold ("Tell <@next>: **label**"), Sep, Text your call ("<call>? <@prev> has your intel"; leaked intel from `leakAt`; "-# If your contact goes dark, the intel leaks <t:leakAt:R>; press Refresh then"; or "You went dark" for a dark seat), Row(4 option buttons, Refresh `cpr:brief:<caperId>`) 6] = **10** | **no image**: a 120 s clock; labels are plain text so no emoji can hint at the answer | the crew row owner | until `goEndsAt`; later presses get "Too late"; Refresh does `deferUpdate` and edits the same ephemeral |
| S15 | Result (edit of S12) | public | Container[MediaGallery, Text header (Clean/Messy/Bust, roll vs patrol chance), Sep, Text per-step lines (`Mascot.Emotes.Accept`/`Decline`, intel holder → actor, leaked marks), Sep, Text payout or fine and jail lines, Text hint] = **8**; edit sends `files:[result banner]` with `attachments:[]` | gallery `cf_result_<clean\|messy\|bust>.png` | none | final |
| S16 | Turf map (`!turf`, or the S2 Turf button) | public from `!turf`; ephemeral from S2 | Container[MediaGallery, Text header, Sep, Text 4 Corner lines, Text 4 District lines, Text 2 Crown lines, Sep, Text next war `<t:F>`, SelectRow(racket × 10) 2, Row(War board, Back) 3] = **14** | gallery `cf_turf_map.png`; inline `cf_turf_<class>` | caller | none |
| S17 | Racket detail (select, or the S27 opener from `!turf racket <key>`) | ephemeral | Container[Section(2 text + thumbnail) 4, Sep, Text owner, income, strikes, top bid, bidding window, war time, class level, Text hint, Row(Bid, Back) 3] = **11** | thumbnail `cf_turf_<class>.png` | members; Bid: Boss / Underboss | token |
| S18 | War board | public, only in the two families' home channels (`War.boards`) | Container[MediaGallery, Text header + ends `<t:R>`, Sep, Text block scores (baseline included; blackout "??" in the last 600 s), Text top 5 hitters per side, Sep, Text hint, Row(Scout, Hit Docks, Hit Main St, Hit Back Alleys) 5] = **13** | gallery `cf_war_banner.png`; `.setEmoji` `cf_block_*` on hit buttons, `cf_role_lookout` on Scout | eligible members of either side, in their home guild | refreshed once a minute; row removed at settle |
| S19 | Hit call | ephemeral | Container[Text block, slot ends `<t:R>`, deadline `<t:R>`, Text hint, Row(4 approach buttons) 5] = **8** | **no image**: 20 s call; plain labels | the hit owner | 20 s |
| S20 | Scout report | ephemeral | Container[Text "Main Street: weak point is **Diner** until `<t:R>`", Text hint "Share it with your crew"] = **3** | **no image** | — | — |
| S21 | War result (edit of S18) | public | Container[MediaGallery, Text header, Sep, Text block results, Text ownership, XP and heat] = **6**; a new S28 result notice also posts in both home channels | same banner if the message holds it | none | final |
| S22 | Disband | ephemeral, then a modal (type the tag) | Container[Text, Text final payday and exact burn amounts, Row(Disband…, Cancel) 3] = **6** | **no image**: destructive confirm | Boss | token |
| S23 | Claim the chair | public, home channel, posted by `runSuccession`; ids stored in `Family.claimChannelId`/`claimMessageId` | Container[Text, Row(Claim) 2] = **4**; after a claim or handover it is edited to Container[Text "Chair claimed by <@x>"] = **2** | **no image** | Underboss per DB | until claimed or auto-handover |
| S24 | My invites (S1 button) | ephemeral | Container[Text, Text ≤ 5 pending invites (tag, family, expires `<t:R>`), SelectRow(accept TAG ≤ 5, `crew:inv:sel:<ownerId>`) 2, Row(Back) 2] = **7** | **no image** | caller | token |
| S25 | Personal card (`!caper join <role>`, `!turf war`) | public, the caller's channel | caper: Container[Text status + jump link to the lobby, Row(Open brief) 2] = **4**; war: Container[Text "War on <racket> ends `<t:R>`, scores on the home board" + jump link, Row(Scout, Hit Docks, Hit Main St, Hit Back Alleys) 5] = **7**; shows no scores, so it never needs a refresh | **no image** | caller (DB-checked) | stale presses are refused by their CAS |
| S26 | Confirm (leave, kick, hand over) | ephemeral | Container[Text, Text consequences (hop cooldown, refund, new Boss), Row(Confirm, Cancel) 3] = **6** | **no image** | owner | token |
| S27 | Opener card (a command whose target is private or a modal) | public, owner-scoped | Container[Text one-line summary, Row(Open …) 2] = **4** | **no image** | owner | none |
| S28 | Public notice | public | Container[Text] = **2**, or Container[Text, Row(one button) 2] = **4**. Variants: GO call (mentions the crew, Open brief button), payday paid ("Payday: 12 members paid 950,000 each" + names), war result (in both home channels), "Lobby moved" (edit of a superseded S12, no row, `attachments: []`) | **no image** | — | — |
| — | Errors and rejections | ephemeral | `rejectPress` (13.2) or `errorContainer` (existing Fail mascot) | existing art only | — | — |

The maximum is S2 at 18. The longest text is S16 (10 racket lines with two custom emojis each, up to 42 characters per emoji: `<:cf_role_safecracker:` + a 19-digit id + `>`) at under 2,000 of the 4,000 characters. Roster text is one TextDisplay capped at 12 lines; the ledger at 10 (S6) or 15 (S9) lines. Files per message: at most 1.

### 13.4 DM notices and cooldown reminders
New `DM_NOTICE_TYPES` entries (`src/services/dmPrefsService.ts:14-25`):

```ts
caper:       { label: "Family caper",      command: "!caper", group: "cooldown" }, // after `crime`
family:      { label: "Crime family",      group: "account" },                   // after `investment`
caper_lobby: { label: "Caper lobby calls", group: "account" },
turf:        { label: "Turf wars",         group: "account" },
```

- `caper` is a cooldown reminder: `enqueueReminder(uid, "caper", dueAt)` at Start when the member has used 2 seats in 24 h; `dueAt` = the older seat's `startedAt + 24h`. The existing minute drain (`processDueReminders`) sends it.
- The three account types have **no** `command` field, so they never satisfy `isCooldownReminderType` (`:40-42`).
- Settings panel: cooldown group 7 → 8 types (still 2 rows of 4, +1 button); account group 3 → 6 types (2 rows, +3 buttons, +1 row). Panel 25 → **30** components (on) and 26 → **31** (off); the test bound is < 35 (`test/dm/settings.test.ts:38-41`).
- Builders in `src/services/dmNoticeService.ts` call `noticeContainer(cfEmoji(key) ?? Mascot.Emotes.Gun, title, body, hint)` (`src/utils/componentsV2.ts:73-75`). `noticeContainer` takes an inline `<:name:id>` string and derives the thumbnail with `getEmoteUrl`, whose `/:(\d+)>/` match (`src/config/branding.ts:160-168`) returns null for a CDN URL, so passing a URL would silently fall back to the Think mascot (`componentsV2.ts:35`). Titles carry no emoji. Sent with `sendOptOutDm(client, id, type, container)` (`src/services/dmNoticeService.ts:46`), fired with `void`, one DM per user per event (batched like `notifyInvestmentsMatured`, `:294-309`).

| Notice | Type | Trigger | Recipients |
|---|---|---|---|
| Family invite (with `!crew accept <TAG>`) | family | invite created | invitee |
| Kicked / promoted / demoted / chair claimed / chair handed over | family | action | target (handover: all members) |
| Payday paid (gross, tax, net) | family | payday | each paid member |
| You missed payday (the gate you missed) | family | payday | each ineligible member |
| Dues in arrears (days, amount, how to clear) | family | first missed dues day | Boss, Underboss |
| Family disbanded (final payday, burn) | family | disband | all former members |
| Caper lobby open (tier, stake, jump link, closes `<t:R>`) | caper_lobby | plan | members in the lobby's guild, not seated, who pass the tier's seat gates and have a free seat; at most 3 per member per rolling 24 h (Redis counter `cf:lobbydm:<uid>`, fails open); none if the family cancelled a lobby in the last 2 h (`Caper{familyId, status:"CANCELLED", updatedAt ≥ now − 2h}`) |
| Caper GO (ends `<t:R>`, jump link) | caper_lobby | Start | each crew member |
| Family caper seat free | caper | reminder due | the member |
| Bid placed on your racket | turf | bid | owning family's Boss and Underboss |
| You were outbid | turf | outbid | outbid family's Boss and Underboss |
| War in 15 minutes (with jump link) | turf | minute tick, CAS `warnedSoon:false → true` | eligible members of both sides |
| War result | turf | settle | members of both families with a `WarContribution` |
| Neglect strike n/3 (how to keep it); racket released | turf | racket tick | members who are not racket-eligible, plus Boss and Underboss; release: all members |

There is no caper-result DM: the result card lists every cut, fine and jail time (D58). Worst case per member per day: 3 lobby calls + 2 GO calls + 1 seat-free reminder + 1 war warning + 1 war result, plus rare `family` notices (invites, payday once a week, dues).

---

## 14. Data model

### 14.1 Prisma models (all new collections; `User` and every existing model unchanged)
Money fields are `Float` like `Wallet.balance` (`prisma/schema.prisma:204`). References to users are bare `String` snowflakes with an index, no Prisma relation (the newer idiom of `JobReputation`, `CooldownReminder`).

```prisma
model Family {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  name           String
  nameKey        String   @unique
  tag            String
  tagKey         String   @unique
  bossId         String                       // CAS target for chair moves
  level          Int      @default(1)
  xp             Int      @default(0)
  treasury       Float    @default(0)
  earnings       Float    @default(0)
  homeGuildId    String
  homeChannelId  String
  nextCaperAt    DateTime @default(now())
  lastPaydayAt   DateTime @default(now())
  lastRenamedAt  DateTime @default(now())
  duesDayKey     String   @default("")        // "YYYY-MM-DD" UTC
  duesArrears    Int      @default(0)
  warWins        Int      @default(0)
  claimNoticeFor String   @default("")        // bossId whose inactivity S23 was posted for (CAS, once per episode)
  claimChannelId String   @default("")
  claimMessageId String   @default("")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt          // touched by create/plan/accept/invite/leave/kick/promote so payday and disband conflict
  @@index([xp])
  @@index([warWins])
}

model FamilyMember {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  familyId       String   @db.ObjectId
  userId         String   @unique             // one family per account
  role           String                       // BOSS|UNDERBOSS|CAPO|SOLDIER
  roleSlot       String                       // "BOSS"|"UNDERBOSS"|"CAPO1".."CAPO3"|userId
  seat           Int                          // 1..memberCap
  joinedAt       DateTime @default(now())
  lastActiveAt   DateTime @default(now())
  depositDayKey  String   @default("")
  depositedToday Float    @default(0)
  deposited      Float    @default(0)         // lifetime, display only
  capers         Int      @default(0)         // lifetime started seats
  correctHits    Int      @default(0)         // lifetime
  @@unique([familyId, roleSlot])
  @@unique([familyId, seat])
  @@index([familyId])
}

model FamilyExit {
  id       String   @id @default(auto()) @map("_id") @db.ObjectId
  userId   String
  familyId String   @db.ObjectId
  reason   String                             // LEFT|KICKED|DISBANDED
  wasBoss  Boolean  @default(false)
  leftAt   DateTime @default(now())
  @@index([userId, leftAt])
  @@index([familyId, userId, leftAt])
}

model FamilyInvite {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  familyId   String   @db.ObjectId
  inviterId  String
  inviteeId  String
  status     String   @default("PENDING")     // PENDING|ACCEPTED|DECLINED|EXPIRED
  slot       String   @default("PENDING")     // rewritten to id when resolved
  guildId    String
  channelId  String
  messageId  String   @default("")
  expiresAt  DateTime
  resolvedAt DateTime @default(now())         // rewritten at resolution; filtered only with status
  createdAt  DateTime @default(now())
  @@unique([familyId, inviteeId, slot])
  @@index([inviteeId, status])
  @@index([inviterId, status, resolvedAt])
  @@index([familyId, status, resolvedAt])
  @@index([status, expiresAt])
}

model FamilyLedger {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  familyId      String   @db.ObjectId
  actorId       String                        // discordId or "system"
  type          String   // create_fee|deposit|deposit_tax|payday|payday_tax|caper_cut|racket_income|racket_neglect|dues|dues_missed|level_fee|rename_fee|bid_escrow|bid_refund|war_bid_burn|disband_burn
  amount        Float                         // signed, vault perspective
  treasuryAfter Float
  earningsAfter Float
  meta          Json?                         // display only
  createdAt     DateTime @default(now())
  @@index([familyId, createdAt])
  @@index([actorId, createdAt])
}

model Caper {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  familyId      String   @db.ObjectId
  tier          Int
  status        String   @default("LOBBY")    // LOBBY|RUNNING|SETTLING|RESOLVED|CANCELLED
  liveSlot      String   @default("LIVE")     // rewritten to id when RESOLVED/CANCELLED
  plannerId     String
  guildId       String
  channelId     String
  messageId     String   @default("")
  lobbyClosesAt DateTime
  seatsVersion  Int      @default(0)          // written by join/leave/kick/start/cancel so they conflict
  startedAt     DateTime @default(now())      // rewritten at Start; counted only with a started status
  goEndsAt      DateTime @default(now())      // rewritten at Start; filtered only with status RUNNING
  answers       Json?                         // written at Start, read by brief/resolve, never filtered
  edge          Float    @default(0)
  heatSnapshot  Int      @default(0)
  roll          Float    @default(-1)
  outcome       String   @default("")         // ""|CLEAN|MESSY|BUST|CANCELLED|VOID
  pool          Float    @default(0)
  crewShare     Float    @default(0)
  vaultPaid     Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([familyId, liveSlot])
  @@index([status, lobbyClosesAt])
  @@index([status, goEndsAt])
  @@index([familyId, status, startedAt])
}

model CaperCrew {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  caperId     String   @db.ObjectId
  familyId    String   @db.ObjectId
  userId      String
  role        String                          // MASTERMIND|LOOKOUT|SAFECRACKER|DRIVER|MUSCLE|HACKER
  liveSlot    String   @default("LIVE")       // rewritten to caperId when resolved/cancelled
  stake       Float
  started     Boolean  @default(false)
  startedAt   DateTime @default(now())        // rewritten at Start; counted only with started:true
  itemBonus   Float    @default(0)
  briefOpened Boolean  @default(false)
  briefOpenedAt DateTime @default(now())      // rewritten at first open; read only with briefOpened:true (8.3 darkness)
  choice      Int      @default(-1)           // sentinel, CAS target
  leaked      Boolean  @default(false)        // display only: this seat locked after seeing leaked intel
  refunded    Boolean  @default(false)        // CAS on cancel/VOID refunds (rows are kept)
  passed      Boolean  @default(false)
  cut         Float    @default(0)
  fine        Float    @default(0)
  jailed      Boolean  @default(false)
  settled     Boolean  @default(false)        // CAS: money + heat + jail done
  joinedAt    DateTime @default(now())
  @@unique([caperId, role])
  @@unique([caperId, userId])
  @@unique([userId, liveSlot])
  @@index([userId, started, startedAt])
  @@index([caperId, settled])
}

model Racket {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  key            String   @unique
  name           String
  class          String                       // CORNER|DISTRICT|CROWN
  incomePerCycle Float
  baseDefense    Int                          // per-block baseline for any defender (9.1)
  warDow         Int                          // 0 = Sunday (getUTCDay)
  warHourUtc     Int
  ownerFamilyId  String   @default("")        // "" = Street (sentinel, never null)
  capturedAt     DateTime @default(now())
  lastPayoutAt   DateTime @default(now())
  neglectStrikes Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([ownerFamilyId])
}

model War {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  racketId          String   @db.ObjectId
  racketKey         String
  periodKey         String                    // ISO week of startsAt, e.g. "2026-W44"
  status            String   @default("BIDDING") // BIDDING|ARMED|ACTIVE|SETTLING|RESOLVED|CANCELLED
  bidOpensAt        DateTime
  bidClosesAt       DateTime
  startsAt          DateTime
  endsAt            DateTime
  topBid            Float    @default(0)      // escrow, always from earnings; burned at settlement
  topBidderFamilyId String   @default("")
  attackerFamilyId  String   @default("")
  defenderFamilyId  String   @default("")     // "" = Street NPC
  seed              String   @default("")     // set at ACTIVE, never rendered
  atkDocks          Int      @default(0)
  atkMain           Int      @default(0)
  atkAlleys         Int      @default(0)
  defDocks          Int      @default(0)
  defMain           Int      @default(0)
  defAlleys         Int      @default(0)      // def* seeded with the class baseline at ACTIVE
  winnerFamilyId    String   @default("")
  warnedSoon        Boolean  @default(false)
  lastTickAt        DateTime @default(now())  // written by each minute tick while ACTIVE
  maxTickGapSeconds Int      @default(0)      // > 600 at settlement → CANCELLED, bid refunded
  boards            Json?                     // the two home-channel boards [{guildId,channelId,messageId,side}], never filtered
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@unique([racketId, periodKey])
  @@index([status, bidClosesAt])
  @@index([status, startsAt])
  @@index([status, endsAt])
  @@index([topBidderFamilyId, status])
}

model WarContribution {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  warId         String   @db.ObjectId
  familyId      String   @db.ObjectId
  userId        String
  side          String                        // ATK|DEF
  hits          Int      @default(0)
  correctHits   Int      @default(0)
  points        Int      @default(0)
  nextHitAt     DateTime @default(now())
  lastScoutSlot Int      @default(-1)
  createdAt     DateTime @default(now())
  @@unique([warId, userId])
  @@index([warId, familyId])
  @@index([userId, createdAt])
}

model WarHit {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  warId     String   @db.ObjectId
  familyId  String   @db.ObjectId
  userId    String
  side      String                            // ATK|DEF
  block     String                            // docks|main|alleys
  slot      Int
  deadline  DateTime
  choice    Int      @default(-1)
  state     String   @default("ARMED")        // ARMED|HIT|MISS|TIMEOUT
  points    Int      @default(0)
  createdAt DateTime @default(now())
  @@index([state, deadline])
  @@index([userId, state, createdAt])
  @@index([warId, userId])
}
```

### 14.2 Nullable fields and the isSet guard
- **No CAS or filter touches a nullable field.** Every field in a `where` is required with a default: status strings, `""` sentinels (`ownerFamilyId`, `topBidderFamilyId`, `messageId`, `duesDayKey`, `claimNoticeFor`), `-1` sentinels (`choice`, `roll`, `lastScoutSlot`), `"LIVE"`/`"PENDING"` slot sentinels, and `now()`-defaulted DateTimes that are rewritten when they become meaningful.
- The only nullable fields are `Caper.answers`, `War.boards` and `FamilyLedger.meta`, all `Json?` and never filtered.
- Rule for implementers: any future filter on a nullable field must use `OR: [{ f: null }, { f: { isSet: false } }]` (`src/anticheat/claim.ts:59-84`; `userDateUnchanged` covers only three `User` fields).
- No `@unique` sits on a nullable field (Mongo counts a missing field as null).
- All collections are new, so `db push` adds no unique index over existing documents.

### 14.3 Redis keys (none guards money or uniqueness)
| Key | TTL | Purpose | On Redis error |
|---|---|---|---|
| `cf:active:<uid>` | 3,600 s (SET NX) | throttle `lastActiveAt` writes | write anyway |
| `cf:render:caper:<caperId>` | 2 s (SET NX) | trailing debounce of lobby card edits: when the SET fails, `SET cf:render:caper:pending:<caperId> NX EX 3` and, if that succeeds, schedule one in-process render from the DB at 2 s | edit anyway |
| `cf:render:war:<warId>` | 50 s (SET NX) | one war-board refresh per minute (same trailing rule) | edit anyway |
| `cf:lobbydm:<uid>` | 86,400 s (INCR, EXPIRE on first) | cap of 3 lobby DMs per member per rolling 24 h | send anyway |
| `networth:<id>` (existing) | 600 s | `getNetWorth` display cache; never read by a gate | — |

These use a tri-state SET NX (`'set' \| 'held' \| 'error'`) or `cooldownClaim` (fails open, `src/anticheat/claim.ts:19-41`). The repo's `redisService.setIfNotExists` fails **closed** (`src/services/redisService.ts:76-89`) and must not be used here: during an outage it would suppress every render.

### 14.4 New seams in existing code (DRY)
| Seam | Where | Why |
|---|---|---|
| `creditWalletInTx(tx, discordId, username, amount, type, meta, earned)` + `afterEarnedCredit(discordId, result, earned)` | extracted from `addBalance` (`src/services/walletService.ts:112-190`; tx body `:116-167`, post-commit `:170-189`) | caper cuts and payday credit inside the seat/payday transaction; `addBalance` becomes a wrapper with identical behaviour |
| `debitWalletInTx(tx, discordId, amount, type, meta)` | new in `walletService.ts` | first shared guarded debit (`updateMany({balance:{gte}})`, `count === 0` → `InsufficientFunds`, Transaction row). Existing inline call sites (transferService, jailService, marketService, stockService, questService, huntCraftService, creditCardService) are left as they are. |
| `applyEconomyPenaltyTx(tx, discordId, username, amount, type, meta, guildId?)` | extracted from `applyEconomyPenalty` (`src/services/penaltyService.ts:64`) | Bust fines commit with the seat's `settled` flag; `recordPotentialSoulLedgerLoss` stays post-commit |
| `addCrimeHeatTx(tx, discordId, amount)` | extracted from `addCrimeHeat` (`src/services/taxService.ts:119`) | heat in the settle transaction; the caller runs `migrateLegacyHeatForUser` before the transaction, which this change exports (`src/services/taxService.ts:43` is module-private today) |
| `jailUserTx(tx, discordId, seconds)` | extracted from `jailUser` (`src/services/jailService.ts:4-17`) | jail in the settle transaction; sets `jailReleaseTime = max(existing, now + seconds)` and `isJailed: true`, so a Bust roll never shortens a longer sentence (`jailUser` overwrites it today) |
| `rentCyclesDue` | reused unchanged (`src/services/propertyService.ts:44`) | racket cycles |
| `getOwnedPrepKeys` | reused unchanged (`src/services/crimeService.ts:76`) | prep gate and edge |
| `computeNetWorth` | exported from `src/services/netWorthService.ts:25` | uncached net worth for gates (12.1) |
| `runFamilyTx(fn, attempts = 3)` | new, `src/services/crimeFamily/tx.ts`, a wrapper over `withTransactionRetry` (`src/services/walletService.ts:16-28`, jittered, retries any message matching `isTransientWriteConflict`, `:7-14`) | every crime-family transaction uses this one helper (payday passes 5); `VaultBusy` and the join CAS miss throw errors whose message contains "write conflict" so they retry. `runWithRetry` (`src/utils/prisma.ts:5-30`) is not used: it retries only P2034. |
| `rejectPress(i, text)` | new in `src/utils/interactionHelpers.ts` | one rejection path for deferred and undeferred presses (13.2) |
| V2 send wrapper with `allowedMentions: { parse: [] }` | beside `v2Reply` | no roster ever pings (13.2) |
| `registerEmojiForTest(key, rec)` | new in `src/utils/emojiRegistry.ts`, in-memory only | layout tests seed `cf_` emojis without writing `src/data/emojis.json` (`setPersistedEmoji`, `:102-111`, writes the file) |
| `spendFromVault`, `checkMemberEligibility`, `resolveCaperOutcome`, `splitCaperPool`, `weakPoint`, `isDark` | new, `src/services/crimeFamily/` | one seam each |

New files: `src/data/crimeFamilyCatalog.ts` (tiers, roles, label pools, rackets, levels, approaches), `src/services/crimeFamily/{familyService,vaultService,eligibility,caperService,caperMath,racketService,warService,scheduler}.ts`, `src/commands/economy/{crew,caper,turf}.ts`, `src/ui/crimeFamilyUi.ts` (all S1–S28 builders), the three handlers, `src/utils/crimeFamilyAssets.ts`, `src/utils/applicationEmojiFamilies.ts`, `src/data/sprites/cf/*.ts`, `src/scripts/generatePixelAssets.ts`.

---

## 15. Scheduled jobs

All new schedules live in `src/services/crimeFamily/scheduler.ts`, registered from `initScheduler` (`src/scheduler.ts`, called at `src/index.ts:92`). The new jobs get their **own** `cron.schedule` calls with `{ timezone: "Etc/UTC", noOverlap: true }`; nothing is appended to the existing banking block (`src/scheduler.ts:25-37`), whose awaits could push a run past 60 s. Each job has its own try/catch and logs `[crimeFamily] <job> error`. PM2 runs one fork (`ecosystem.config.js:17-20`), but a local `npm run dev` against the live `.env` is a second process, so every step is a CAS and settlement draws its randomness behind a CAS (8.8). Minute and hourly queries use `lte now`, so missed ticks catch up on the next run; daily work runs from the hourly job, so a missed hour is retried within the same UTC day. When `CRIME_FAMILY_CONFIG.enabled` is false the sweepers **still run** (they only settle what exists), but plan, bid and invite commands are refused.

| Schedule | Function | Work | Idempotency guard |
|---|---|---|---|
| `* * * * *` (own schedule) | `sweepCapers(client, now)` | (a) LOBBY with `lobbyClosesAt ≤ now` → Start if required roles are filled, else CANCELLED with refunds; (b) RUNNING with `goEndsAt ≤ now` → VOID check (8.4 step 7), else settle; (c) SETTLING (any age) → resume; (d) RESOLVED with crew rows `settled:false` → resume (defensive); (e) LOBBY → re-render the card once (heals a lost trailing render) | status CAS (`LOBBY→RUNNING/CANCELLED`, `RUNNING→SETTLING` or `→CANCELLED` for VOID, `SETTLING→RESOLVED`, `count === 1`); the draw CAS `roll:-1` (8.8 step 2); cancel and VOID refunds CAS `refunded:false→true` per row (rows kept); lobby leave/kick/pinched refunds delete the row first (`deleteMany count === 1`); per-seat `settled:false→true`; `vaultPaid:false→true` |
| same | `sweepInvites(client, now)` | PENDING with `expiresAt ≤ now` → EXPIRED, `slot = id`; edit the card to "Expired" | CAS on `status:"PENDING"` |
| same | `sweepWarHits(now)` | ARMED `WarHit` with `deadline < now` → TIMEOUT | CAS on `state:"ARMED"` |
| `* * * * *` (own schedule, gated by `turfEnabled`) | `tickWars(client, now)` | (1) per racket, upsert next week's War once `now ≥ bidOpensAt`; (2) BIDDING with `bidClosesAt ≤ now` → ARMED (escrow kept, snapshot defender = owner or `""`) or CANCELLED; (3) ARMED with `startsAt − 15 min ≤ now` → warn DM; (4) ARMED with `startsAt ≤ now` → ACTIVE (set `seed`, seed `def*` with the class baseline, post the two home-channel boards, store `boards`), or CANCELLED with the escrow refunded if `now > startsAt + 600 s`; (5) ACTIVE → write `lastTickAt`, keep `maxTickGapSeconds`, refresh boards (debounced 50 s); (6) ACTIVE with `endsAt ≤ now` → SETTLING → CANCELLED with refund if `maxTickGapSeconds > 600`, else settle (burn the escrow, ownership, XP, heat) → RESOLVED, then post the S28 result notice; (7) SETTLING (any age) → resume | (1) `upsert` on `@@unique([racketId, periodKey])`; (2) CAS `{id, status:"BIDDING"}`; (3) CAS `warnedSoon:false`; (4) CAS `{status:"ARMED"}`; (6) CAS `{status:"ACTIVE"}`, the burn or refund in the settle transaction guarded on `status:"SETTLING"`, then the ownership CAS `racket.updateMany({ id, ownerFamilyId: <defender snapshot> })` inside the settle transaction (retry with `""` if the defender lost it meanwhile); hits after `endsAt` are refused by their own CAS |
| `5 * * * *` UTC (gated by `turfEnabled`) | `tickRackets(client, now)` | per owned racket: `rentCyclesDue(lastPayoutAt, now, 24)`; mint or neglect (9.3); release at 3 strikes | CAS `{ id, ownerFamilyId, lastPayoutAt: <read> }`; catch-up capped at 3 cycles |
| `10 * * * *` UTC (own schedule) | `chargeFamilyDues(client, now)` | per family not yet charged today: dues = 40,000 × level; on shortfall `duesArrears += 1` and DM on the first missed day | CAS `{ id, duesDayKey: { not: today } }` → today, with `spendFromVault` in the same transaction (runs 24 times a day, charges once) |
| same | `runSuccession(client, now)` | 7-day S23 notice and 14-day automatic chair handover (6.7) | `claimNoticeFor` CAS; CAS `{ id, bossId: <old> }` |
| same | `autoPayday(client, now)` | families with `lastPaydayAt ≤ now − 8d` and earnings ≥ 500,000: the 7.3 payday transaction with `actorId "system"` (D57) | the payday CAS on `earnings` and `lastPaydayAt` |
| once at boot, in `initScheduler` | `seedRackets()` | upsert the 10 rackets by `key`; update only `name, class, incomePerCycle, baseDefense, warDow, warHourUtc` | upsert on `key @unique`; never touches `ownerFamilyId`, `lastPayoutAt`, `neglectStrikes` |

- **Restart safety.** All state is in Mongo and every button is a persistent route. The process records its boot time at startup for the caper VOID rule (8.4 step 7); wars use `War.maxTickGapSeconds` (9.4). An in-process `setTimeout(goEndsAt)` may be added for snappier resolution, but the sweeper is authoritative and the draw CAS makes a double settle harmless.
- **War window math** is pure: `nextWarStart(racket, now)` returns the next `warDow`/`warHourUtc` instant in UTC; `periodKey` = ISO week of that instant; `bidOpensAt = startsAt − 72h`, `bidClosesAt = startsAt − 1h`, `endsAt = startsAt + 60 min`.

---

## 16. Assets and emojis

Rules come from `DESIGN.md`: files are `cf_<key>.png` in `src/assets/` (`[a-z0-9_]`, no spaces, no apostrophes); 1-logical-pixel near-black outline; flat 2–3-tone shading lit from the top left; no blur, glow, gradient or neon; Crime Families uses night slate, outline, gold, leather and Fail red (`DESIGN.md` section 3). Lady Fortuna's crime outfit: charcoal pinstripe suit, purple shirt, gold tie pin and cufflinks, fedora with a purple band, long purple hair (`DESIGN.md` section 5). The production path per asset is in section 20.

### 16.1 New asset files (34)
| # | File | Size class | Path | Used in | Art brief |
|---|---|---|---|---|---|
| 1 | cf_crest_1.png | Icon 160 (40x40 ×4) | sprite | S2/S4 thumbnail at L1–3; `cf_crest_1` emoji | Bronze shield (gold shadow `#A06000` and leather `#805020` tones) with a crossed-dice monogram, two chipped edges |
| 2 | cf_crest_2.png | Icon 160 | sprite | L4–6 | Steel-grey shield (`#303030/#404040/#505050`), dice monogram, two laurel sprigs |
| 3 | cf_crest_3.png | Icon 160 | sprite | L7–9 | Gold shield (`#E0A000/#D09000/#A06000`), dice monogram, purple ribbon scroll across the base |
| 4 | cf_crest_4.png | Icon 160 | sprite | L10; S10 thumbnail | Gold shield under a small crown with a purple gem, twin laurels, one 1-pixel highlight |
| 5 | cf_caper.png | Icon 160 | sprite | S11 thumbnail; `cf_caper` emoji | Rolled parchment blueprint, three-quarter view, a red X mark, a pencil across it |
| 6 | cf_vault.png | Icon 160 | sprite | S6 title; payday DM thumbnail | Squat steel vault door, three-quarter view, gold wheel handle, purple trim band |
| 7 | cf_war.png | Icon 160 | sprite | S18 header emoji; turf DM thumbnail | Two crossed crowbars with red tape grips (reads as one glyph) |
| 8 | cf_role_mastermind.png | Icon 160 | sprite | roster lines, S14 header | Gold chess knight, three-quarter view |
| 9 | cf_role_lookout.png | Icon 160 | sprite | roster lines, Scout button | Brass binoculars, three-quarter view, purple strap |
| 10 | cf_role_safecracker.png | Icon 160 | sprite | roster lines | Steel combination dial with gold numerals, front view |
| 11 | cf_role_driver.png | Icon 160 | sprite | roster lines | Black steering wheel with a gold horn badge |
| 12 | cf_role_muscle.png | Icon 160 | sprite | roster lines | Brass knuckles, front view |
| 13 | cf_role_hacker.png | Icon 160 | sprite | roster lines | Slate laptop, three-quarter view, a small gold skull glyph on a dark screen |
| 14 | cf_rank_boss.png | Icon 160 | sprite | S2 roster, S5 options | Gold signet ring with a purple stone |
| 15 | cf_rank_underboss.png | Icon 160 | sprite | S2, S5 | Steel signet ring with a black stone |
| 16 | cf_rank_capo.png | Icon 160 | sprite | S2, S5 | Large gold tie pin, front view |
| 17 | cf_rank_soldier.png | Icon 160 | sprite | S2, S5 | Black fedora, front three-quarter |
| 18 | cf_rank_associate.png | Icon 160 | sprite | S2 (members under 72 h) | Brown leather flat cap |
| 19 | cf_turf_corner.png | Icon 160 | sprite | S16 lines, S17 thumbnail (Corner) | Cracked brick tile with a red spray-paint tag |
| 20 | cf_turf_district.png | Icon 160 | sprite | S16, S17 (District) | Storefront sign board with a lit gold bulb border (no neon) |
| 21 | cf_turf_crown.png | Icon 160 | sprite | S16, S17 (Crown) | Gold crown with a slate band |
| 22 | cf_block_docks.png | Icon 160 | sprite | S18 score lines, Hit Docks button | Rope-tied wooden crate |
| 23 | cf_block_main.png | Icon 160 | sprite | S18, Hit Main St button | Street lamp |
| 24 | cf_block_alleys.png | Icon 160 | sprite | S18, Hit Back Alleys button | Dumpster with a lifted lid |
| 25 | cf_fortuna_don.png | Large character 500 (250x250 ×2) | AI | S1 thumbnail; website module hero | Fortuna head to mid-thigh, three-quarter, crime outfit, holding a gold-trimmed ledger, soft smirk |
| 26 | cf_caper_t1.png | Banner 960x336 (240x84 ×4) | AI | S12/S13 at T1 | Night pawnshop back room; placard `FORTUNA'S CAPERS` / `- PAWNSHOP BACK ROOM!` |
| 27 | cf_caper_t2.png | Banner | AI | S12/S13 at T2 | Rainy street with an armoured payroll van; placard `- PAYROLL VAN!` |
| 28 | cf_caper_t3.png | Banner | AI | S12/S13 at T3 | Racetrack cashier cage under floodlights; placard `- CASHIER CAGE!` |
| 29 | cf_caper_t4.png | Banner | AI | S12/S13 at T4 | Diamond exchange vault with a red laser grid; placard `- DIAMOND EXCHANGE!` |
| 30 | cf_result_clean.png | Banner | AI | S15 Clean | Getaway car under a moonlit bridge, Fortuna tipping her fedora; placard `CLEAN JOB!` |
| 31 | cf_result_messy.png | Banner | AI | S15 Messy | Car fishtailing, one distant red light; Fortuna gripping her fedora; placard `MESSY!` |
| 32 | cf_result_bust.png | Banner | AI | S15 Bust | Red and navy police lights, Fortuna centre with hands raised; placard `BUSTED!` |
| 33 | cf_turf_map.png | Banner | AI | S16 | Fortuna leaning over a pixel city map table split into Corner/District/Crown zones with small flags; placard `FORTUNA'S TURF` / `- HOLD THE BLOCK!` |
| 34 | cf_war_banner.png | Banner | AI | S18/S21 | Two crews facing off across a dusk street, Fortuna centre as referee; placard `TURF WAR!` |

Website copies (kebab-case, by hand, `dashboard/public/art/`): `cf-fortuna-don.png`, `cf-caper-t4.png`, `cf-turf-map.png`, `cf-war-banner.png`.

### 16.2 New application emojis (24, prefix `cf_`)
Rendered by the generalised sync script from the icon files: 128x128 canvas, ≤ 256 KiB (`src/scripts/syncShopApplicationEmojis.ts:20-23`), nearest-neighbour at an integer scale: 40 cells × 3 px = 120 px art with 4 px padding (D39, 20.4). Name = `applicationEmojiName("cf_", key)` = the file name without `.png`. Longest name: `cf_role_safecracker` (19 chars, limit 32). Buttons and select options call `.setEmoji(cfEmoji(key))` with the inline `<:name:id>` string, only when it is defined (house style, `src/commands/economy/crimeUi.ts:183`); no `extractEmojiForAPI` is needed. No two icons share a silhouette at 32 px (`DESIGN.md` section 5); the Soldier's fedora is the only hat.

| Emoji name | Source | Appears in | Text fallback when missing |
|---|---|---|---|
| cf_crest_1, cf_crest_2, cf_crest_3, cf_crest_4 | cf_crest_1..4.png | S2 header, S10 lines, help category emote, `family` DM thumbnails | omitted; `[TAG]` stays |
| cf_caper | cf_caper.png | S11 header, Caper button on S2 (`.setEmoji`), caper DM thumbnails | omitted |
| cf_vault | cf_vault.png | S6 title, Vault button on S2, payday DM thumbnail | omitted |
| cf_war | cf_war.png | S18 header, Turf button on S2, turf DM thumbnails | omitted |
| cf_role_mastermind, cf_role_lookout, cf_role_safecracker, cf_role_driver, cf_role_muscle, cf_role_hacker | the role icons | S12/S13/S15 roster lines, S14 header, "Join as…" select options, Scout button (`cf_role_lookout`) | role name text only |
| cf_rank_boss, cf_rank_underboss, cf_rank_capo, cf_rank_soldier, cf_rank_associate | the rank icons | S2 roster, S5 member select options | rank name text only |
| cf_turf_corner, cf_turf_district, cf_turf_crown | the turf icons | S16 lines, S16 select options, S17 header | class name text only |
| cf_block_docks, cf_block_main, cf_block_alleys | the block icons | S18 score lines; `.setEmoji` on the three Hit buttons | block name text only |

### 16.3 Surfaces with no art, and why
| Surface | Why |
|---|---|
| S3 create confirm, S8 level-up confirm, S7 payday preview, S22 disband | money decisions: the amount line must be the focus |
| S5 manage, S9 log | dense utility panels; a thumbnail costs a Section and a file |
| S14 brief, S19 hit call | 120 s / 20 s clocks; option labels must be plain text so no emoji hints at an answer |
| S20 scout report, S23 claim the chair | one-line cards |
| S6 vault | inline `cf_vault` emoji only; a private panel stays light |
| Modals | Discord modals cannot hold images |
| Errors and rejections | existing `errorContainer` Fail mascot or plain ephemeral text |
| Store page (1254x1254) | none is made: nothing is sold and the shop catalog is unchanged |

---

## 17. Edge cases

| # | Case | Expected behaviour |
|---|---|---|
| 1 | Boss tries to leave mid-job | Refused while seated in a LOBBY/RUNNING caper; a Boss with members must hand over the chair first. |
| 2 | Boss hands over the chair while planning a caper | Allowed. The planner keeps the Mastermind seat (a caper role, not a family role); Start and Cancel accept the planner or the **current** Boss. |
| 3 | Planner leaves the lobby or is kicked | Caper CANCELLED, every stake refunded, family cooldown 30 minutes, no rolling count used. |
| 4 | Member jailed during the lobby | Removed and refunded at Start. If required roles drop out, the lobby continues until `lobbyClosesAt`, then cancels. |
| 5 | Member jailed during GO | Brief and choice still work; cut or fine applies. Jail does not undo a running job. |
| 6 | Member's heat rises above the ceiling during the lobby (solo crime, rob) | Treated like jail: removed and refunded at Start. |
| 7 | Member uses or sells their only role item during the lobby | Fails the prep re-check at Start: removed and refunded. |
| 8 | Redis down during a window | No money or uniqueness guard uses Redis. Render, activity and lobby-DM helpers fail open (extra edits, extra writes, uncapped lobby DMs for the outage); they never use the fail-closed `setIfNotExists`. Joins, choices, scouts, hits, bids and deposits all work. |
| 9 | Mongo write conflict on a hot family document (deposit burst) | `runFamilyTx` retries with jitter (3 attempts; payday 5), then "Vault busy, try again". No partial write. |
| 10 | Bot restart mid-lobby or mid-GO | State is in Mongo; routes are persistent; the sweeper handles `lobbyClosesAt` and `goEndsAt` within 60 s of boot. A caper whose GO overlapped the restart and has any unlocked seat is VOID: every stake refunded, no fine, heat, jail or count (D55). If every seat had locked, it settles normally. |
| 11 | Bot restart mid-war | Hits after `endsAt` are refused by their CAS; the next minute tick settles from DB scores and re-fetches boards from `War.boards`. If the gap between ticks exceeded 600 s, the war is CANCELLED and the escrowed bid refunded (D55). |
| 12 | Bot down across a whole war window | On boot the tick sees ARMED past `startsAt + 600 s` or ACTIVE with a tick gap over 600 s: CANCELLED, escrow back to the attacker's earnings, no ownership change, no XP or heat. |
| 13 | Two families bid on the same racket in the same second | CAS on `{topBid, topBidderFamilyId}`: one wins; the other's transaction (escrow included) rolls back with "Outbid while you were bidding: top is now X". |
| 14 | Two families "claim" an unowned racket | Impossible: only the war's single attacker can capture, via the ownership CAS against the defender snapshot. |
| 15 | Attacker reaches its racket cap through another war before this one settles | Prevented at bid time (held + live top bids ≤ cap). If it still happens (a level-down is impossible, so only through a data fix), the capture releases the racket to the Street and the log says "over cap: released"; the bid stays burned. |
| 16 | Defender disbands while its war is BIDDING | Racket → Street at disband; ARMED snapshots `""`; the attacker fights the Street at the class baseline. |
| 17 | Family disbands with an ARMED or ACTIVE war | Disband refused until RESOLVED. |
| 18 | Top bidder disbands during BIDDING | Its escrow is cleared and returned to its earnings inside the disband transaction, then paid out (capped, if 7 days have passed since the last payday) or burned; bidding stays open for others. |
| 19 | Family disbands during a caper | Refused while LOBBY/RUNNING/SETTLING. A concurrent plan vs disband write-conflicts on `Family.updatedAt`; exactly one commits. |
| 20 | Member hits `MAX_SAFE_BALANCE` | `creditWalletInTx` clamps. A caper cut's excess is never minted (`meta.capped`); a payday excess returns to earnings in the same transaction. |
| 21 | Duplicate join (double click, button + command in two channels) | `@@unique([caperId, userId])` / `[userId, liveSlot]` P2002 → rollback (stake included) → "Already in this caper". |
| 22 | Two members pick the same role at once | `@@unique([caperId, role])`: the second gets "Role just taken"; no stake charged. |
| 23 | Double press on a brief option | CAS `choice: -1`: the second press gets "Locked in already". |
| 24 | Choice press after `goEndsAt` or after resolve | The transaction's guard `caper{status:"RUNNING", goEndsAt > now}` fails → "Too late". |
| 25 | Last choice and sweeper resolve at the same time | `RUNNING → SETTLING` CAS: one proceeds, the other is a no-op. |
| 26 | Settlement crashes after paying 2 of 5 seats | Remaining seats are `settled:false`, the caper is SETTLING; the sweeper resumes; nobody is paid twice, no fine is lost. |
| 27 | Lobby message deleted, or the bot lost access to its channel | Render gets 10003, 10008, 50001 or 50013 → `messageId = ""`, one fresh card posts in the stored channel; if that fails the caper still resolves, crew get the GO DM, and the result reaches them through `!caper` (which re-posts). When `!caper` re-posts while an old card still exists, the old card is first edited to S28 "Lobby moved" with a jump link, no row and `attachments: []` (10008/50001 ignored), then `messageId` is updated. |
| 28 | Channel deleted or bot removed from the guild | Same as 27. A war side whose board fails gets one repost in its home channel, then DMs only, and the minute refresh stops for that board. |
| 29 | Member blocks DMs | `sendOptOutDm` counts strikes; 3 failures auto-pause all DMs (`MAX_DM_FAILS`, `src/services/dmPrefsService.ts:48`). Gameplay never depends on a DM. |
| 30 | Member not in the lobby's server | Cannot take a seat (D48): the join replies "This caper is in <server>; join that server to play". They get no lobby DM. A seated member can open their brief from any channel of the lobby's guild with `!caper brief`. |
| 31 | Kick during an ACTIVE war | Refused. Kick of a RUNNING crew member: refused. Kick of a LOBBY crew member: seat removed and refunded. |
| 32 | Member leaves with a contribution in an ARMED/ACTIVE war | Refused until the war resolves. |
| 33 | One user accepts invites from two families at once | `FamilyMember.userId @unique`: one succeeds; the other transaction rolls back and its invite stays PENDING until it expires. |
| 34 | Two invitees accept into the last seat | Both transactions touch `Family.updatedAt`, so one conflicts and retries; on retry it reads no free seat and replies "Family is full"; that invite stays PENDING. A P2002 on `[familyId, seat]` (the backstop) aborts the transaction and the outer loop retries it. |
| 35 | Two promotions to Underboss at once | `@@unique([familyId, roleSlot])` with slot `"UNDERBOSS"`: one wins. |
| 36 | Underboss claims while the Boss comes back | The claim transaction re-reads `boss.lastActiveAt ≤ now − 7d` and CASes `bossId`; if the Boss acted first the claim fails with "The Boss is back". |
| 37 | Payday double press | CAS on `earnings: E` and `lastPaydayAt ≤ now − 7d`: one payout. |
| 38 | Payday racing a bid, dues or level-up spend | The earnings CAS fails; the preview re-renders with the new E. |
| 39 | Deposit racing a wallet spend | Guarded `balance gte`; on "Insufficient funds" the vault is untouched. |
| 40 | Two deposits racing the daily cap | The `depositedToday ≤ cap − amount` CAS rejects the second; nothing is debited. |
| 41 | Dues job runs 24 times a day, or the bot is down at 00:10 | The `duesDayKey` CAS charges once per UTC day; the first hourly run after midnight that the bot is up charges it. |
| 42 | Vault cannot pay dues | Arrears block bids and level-up (capers stay open); every deposit, caper vault cut and racket credit retries; S2 shows "in arrears N days", S6 the exact amount owed. |
| 43 | Two racket ticks overlap | The `lastPayoutAt` CAS lets one mint; the other is a no-op. |
| 44 | A tick runs while the racket is being captured | The tick's CAS includes `ownerFamilyId`; after capture it misses. |
| 45 | War hit by a member of neither family | "Not your war" (ephemeral) before any write. |
| 46 | Hit after the 6-hit cap, inside the 600 s cooldown, or with < 25,000 in wallet | Refused by the contribution CAS or the guarded debit; the whole transaction (hit row included) rolls back. |
| 47 | Hit answered after its 20 s deadline | `WarHit` CAS requires `deadline ≥ now` → 0 rows; the sweeper marks TIMEOUT; reply "Too late". |
| 48 | Double press on a hit approach | CAS `state:"ARMED"`: one counts. |
| 49 | Two scouts in the same slot by one member | CAS `lastScoutSlot < slot`: the second gets "Already scouted this slot, next at `<t:R>`". |
| 50 | Hit armed in slot 4, answered in slot 5 | Judged against the weak point of the arm-time slot (stored in `WarHit.slot`). |
| 51 | Member joins a family during its war | 72 h tenure blocks scouting and hits. |
| 52 | Tester presses anything | No bypass; identical rules (12.2 item 11). |
| 53 | Caper with an optional seat empty | Ring built over filled seats; pool uses n; bust threshold uses n. |
| 54 | Every seat filled before `lobbyClosesAt` | Auto-start immediately (8.4 step 5). |
| 55 | Member is banned (`User.isBanned`) | Router blocks commands; every gate in `checkMemberEligibility` reads the ban (12.1), and Start re-validation removes and refunds a member banned mid-lobby. A banned Boss is handled by succession. A banned member is not payday- or racket-eligible. |
| 56 | User deletes their Discord account | Goes inactive: drops out of payday and racket eligibility; the Boss can kick them; succession covers a Boss. |
| 57 | Name collision across case or spacing | `nameKey` normalisation + unique → "Name taken"; the create transaction (10M debit included) rolls back. |
| 58 | Feature flag turned off mid-caper or mid-war | New commands refused; sweepers keep settling live capers and wars; no stake or bid is stranded. |
| 59 | Rolling 24 h windows across midnight UTC | Seat and caper counts use `startedAt ≥ now − 24h`, not a day key; midnight changes nothing. |
| 60 | Card garnishment on a caper cut or payday | Applies after commit via `afterEarnedCredit` (`src/services/creditCardService.ts:448`), like all earned income. |
| 61 | Racket seed reruns on every deploy | Upsert never touches ownership or timers. |
| 62 | Inactive family owns a racket nobody bids on | The war is CANCELLED and the owner keeps it, but neglect (< 3 racket-eligible members) mints nothing and releases it after 3 cycles. |
| 63 | A caper's `answers` JSON is missing on a RUNNING row (data fix) | Resolve does not run. The caper is CANCELLED, every stake is refunded (`earned = false`), and an `Audit{type:"caper_corrupt"}` row is written. |
| 64 | Earnings below 500,000 at Payday | Button disabled with "Earnings must reach 500,000". |
| 65 | Payday with 0 eligible members | Button disabled and labelled "Payday locked"; the S6 rules hint lists each member's failing gate (≤ 12 lines). |
| 66 | A join commits while Start or Cancel runs | Impossible to strand: the join writes the caper document (`seatsVersion`, guarded on `status:"LOBBY"` and `lobbyClosesAt > now`), so the pair conflicts and the join retries into "Lobby closed" with no debit. |
| 67 | Two settlers (press path, sweeper, local dev process) run on one caper | The draw CAS `roll:-1` lets one draw; the other reads the stored outcome and per-seat values; per-seat `settled` stops double pay. |
| 68 | Crew agrees to stay dark until GO−30 s to read every leak | Every dark seat is a miss and cannot lock (8.3): the caper Busts. |
| 69 | A member joins and never locks a choice | Their seat is a miss with cut 0; they lose the stake and pay the fine on a Bust (D49). |
| 70 | A member opens the brief, then goes AFK | Not dark: no leak for their partner, who must guess or be told; the idle seat is a miss with cut 0. |
| 71 | Every seat filled but Start's re-check fails (cooldown, 4-per-24h count) | The caper stays LOBBY; S12 omits the select ("All seats filled, waiting for Start"); at `lobbyClosesAt` the sweeper retries Start or cancels. |
| 72 | GO message cannot post (missing permission, deleted channel) | Crew still get the `caper_lobby` GO DM; `!caper brief` opens the brief. |
| 73 | Banner or thumbnail file missing at deploy | The gallery or Section is omitted (D66, 13.2); no file is sent; component count drops by one. |
| 74 | Slow DB on a modal opener | The opener checks only the owner id and calls `showModal` first; gates run on submit (13.2). |
| 75 | Plan in a channel where the bot cannot read history or attach files | Caught at plan time: the lobby posts in the home channel if it is in this guild, else the plan is refused naming the permission. |
| 76 | A guild emoji named `cf_vault` exists in some server and the application emoji is missing | Ignored: the registry never fills a managed-prefix name from guild emojis (20.4); `cfEmoji` returns undefined and the label stays. |
| 77 | Final payday on disband within 7 days of the last payday | No payout; earnings burn with the treasury (D61). |
| 78 | Join/leave loop to farm refunds | Refunds are `earned = false`: no quest progress, no garnishment (D60); the 2-seat cap counts only started seats. |
| 79 | One bankroll passed between alts to clear the T4 net-worth gate | Net worth is computed uncached at join and for every seat at Start, so all six wallets must hold it at once (12.1, 11.4). |
| 80 | Underboss claim swaps role slots | The old Boss row moves to its own `roleSlot` first, then the claimer takes `"BOSS"`; no transient unique collision (6.7). |
| 81 | Bid lands after `bidClosesAt` but before the tick arms the war | Refused by the bid CAS time guard. |
| 82 | A staged war between friendly families | The attacker burns at least the floor; defence XP needs attacker hits on 2 blocks (D64); the pair rule blocks families sharing a Boss or two members (D28). |
| 83 | Officers absent when payday falls due | `autoPayday` pays it 24 h later with the same rules (D57). |
| 84 | Member jailed for a longer sentence before a Bust jail roll | `jailUserTx` keeps the later release time. |

---

## 18. Testing

**Recipe** (repo convention): `vitest.config.ts:8-13` (`globalSetup ./test/globalSetup.ts` starts a `MongoMemoryReplSet` with `count:1`; `setupFiles ./test/setupEnv.ts` overrides `DATABASE_URL` and `REDIS_URL`; 20 s timeouts; `fileParallelism:false`). Redis from `docker run -p 6381:6379 redis:7-alpine`. On Linux: `MONGOMS_SYSTEM_BINARY= npx vitest run <files>`. Never run two vitest processes at once (they clobber `test/.mongo-uri`). Tests never touch `.env`'s live database.

**Helpers** added to `test/helpers.ts`: `seedFamily({ bossId, level, treasury, earnings, members: [{ userId, role, joinedAt }] })`, `resetFamilies()` (deletes all 11 new collections), `seedRacket(key, overrides)`, `seedEligibleUser(discordId, { shifts, createdAt, netWorth, prepKeys })` (wraps `seedUser`, adds inventory rows for prep keys, and sets the snowflake-age stub).

**Race-test shapes** used below (from the concurrency report): (1) `Promise.allSettled` of the real service calls, assert one winner and final balances; (2) deterministic interleave by monkey-patching a Prisma delegate read to run the competing call first, restored in `finally` (`test/anticheat/marriage-vault.race.test.ts:55-70`); (3) `vi.mock` of a dependency that mutates state between check and write (`test/anticheat/transfer.race.test.ts:7-14`); (4) Redis outage via `vi.spyOn(redisService, "getInstance")` throwing; (5) fake channel and message objects driving a shared card (`test/games/cockfight-refund.test.ts:1-47`).

| File | Proves | Shape |
|---|---|---|
| `test/crimeFamily/catalog.test.ts` | role partition covers all 25 whitelist keys exactly once and every role has a non-consumable key; label pools have 6 distinct labels; rackets sum to 6,400,000/day; level table monotonic; every tier's numbers equal 8.1 | pure |
| `test/crimeFamily/caper-math.test.ts` | `resolveCaperOutcome` thresholds (bustAt 2 for n ≤ 4, 3 for n ≥ 5), q formula (no leak term) and 0.60 cap; `splitCaperPool` exact cuts table (8.6, equal weights, integer percent so T1 n=4 Messy is 98,000 not 97,999) incl. floors, unlocked seats at 0 and unminted remainder; the 8.10 EV tables recomputed from config and snapshotted, so a config change forces a doc update; perfect-play T4 ≤ 1,200,000/day per seat including the payday cap | pure |
| `test/crimeFamily/intel-ring.test.ts` | seat i's intel goes to seat (i+1) mod n over filled seats; 4 distinct options; correct index uniform over 10,000 seeds (chi-square bound p > 0.001); `isDark` true when unopened or opened at/after `leakAt`; leak shown only from `leakAt` and only when the holder is dark; a dark seat's choice is refused; an all-dark crew resolves BUST | pure |
| `test/crimeFamily/war-math.test.ts` | `nextWarStart` for every racket (18:00, 01:00 and 12:00 windows) across DST-free UTC boundaries; `periodKey`; slot math; `weakPoint` deterministic per seed and uniform; tie and 2-of-3 rules; baseline seeded for family and Street defenders; defence XP only with attacker hits on ≥ 2 blocks | pure |
| `test/crimeFamily/eligibility.test.ts` | every row of 12.1, each failing alone with the right `failures[]` entry; a temporary ban that expired passes, a permanent or future ban fails; net worth read via `computeNetWorth` even with a stale `networth:<id>` cache entry; wrong guild fails the caper and war gates | DB |
| `test/crimeFamily/layout.test.ts` | S1–S28 builders at worst case (12 members with 24-char names, 6 seats, 10 rackets, 15 ledger lines, blackout and non-blackout), with every `cf_` emoji seeded through `registerEmojiForTest` with a 19-digit id: components ≤ the stated count and < 40 (S2 with the claim row = 18); text ≤ 4,000 chars; customIds ≤ 100 chars; files ≤ 10; every payload carries `allowedMentions`; every Section has exactly one accessory with assets present **and** absent; S12, S13, S15, S16, S18 and S21 with the banner absent omit the gallery and send no file; S12 with all seats filled has no select; S5→S2, S6→S2 and S17→S16 Back send `files.length === 1` and `attachments: []`; S13 edit sends no `files`; S15 edit sends `files:[result]` and `attachments:[]` | builders + the counter from `test/market/my-listings-layout.test.ts:8-13` |
| `test/wallet/tx-seams.test.ts` | `addBalance` behaviour unchanged after extracting `creditWalletInTx`/`afterEarnedCredit` (cap clamp, garnishment, quest event); `debitWalletInTx` refuses overdraft; `applyEconomyPenaltyTx` matches `applyEconomyPenalty` allocation; `jailUserTx` keeps a later existing release time | DB |
| `test/anticheat/family-membership.race.test.ts` | double create by one user → 1 family, 1 debit; same name by two users → one winner, loser's wallet unchanged; two-family accept → 1 membership; last-seat race → cap holds via the family touch, no P2002 caught inside a transaction; two Underboss promotions → one; three concurrent Capo promotions → CAPO1..3 once each; concurrent invites → pending cap holds; chair claim vs Boss activity (interleave on `family.findUnique`) and the slot swap order | 1, 2 |
| `test/anticheat/family-vault.race.test.ts` | deposit vs wallet drain (mock between check and write) → no negative wallet; daily cap race; payday double press → one payout; payday vs bid spend → CAS retry; payday vs a member leaving between preview and confirm → re-preview, no pay to the leaver; earnings-first spend order; a bid with earnings short of the bid → `VaultShort` even with treasury; bid refund returns to earnings; Tax Shield active still charges both 5% legs; disband final payday skipped within 7 days of the last; `autoPayday` pays once at `lastPaydayAt + 8d` | 1, 2, 3 |
| `test/anticheat/caper-join.race.test.ts` | same user double join → 1 row, 1 stake; same role race → 1; join vs auto-start and join vs cancel (interleave: the join's caper read returns LOBBY, the competitor commits first) → the joiner has no orphan row, has their stake back, and can join a new lobby; join after `lobbyClosesAt` refused by the CAS; cancel refunds exactly once (`refunded` CAS) with rows kept; leave frees the role for another member; refunds carry `isEarned:false` and emit no `economy:earn`; 2-seat rolling cap at 23:59/00:01; one live caper per user and per family; plan vs disband → one commits; join from another guild refused | 1, 2 |
| `test/anticheat/caper-settle.race.test.ts` | last-choice settle vs sweeper → one payout set; two concurrent `settleCaper` calls and a resume started after step 2 committed → every seat's values come from one draw; throw from a mocked `creditWalletInTx` after seat 2 → sweeper resumes, totals equal the expected cuts and fines exactly once; Bust writes fine, heat and jail in the seat transaction; unlocked seat paid 0; choice double press; press after `goEndsAt`; boot time inside GO with an unlocked seat → VOID, all stakes refunded, no heat, rolling counts unchanged; `MAX_SAFE_BALANCE` clamp | 1, 3 |
| `test/anticheat/turf-bid.race.test.ts` | same-second bids → one top bid with correct escrow and refund; bid after `bidClosesAt` refused; bid vs top bidder's disband; racket cap, class level and 1-Crown limit counting live bids; 14-day pair rule (Boss, and two shared members) both directions | 1 |
| `test/anticheat/turf-war.race.test.ts` | hit and scout after `endsAt` refused; 6-hit cap and 600 s cooldown under concurrent presses → one debit each; first-press contribution upsert race → one row; scout once per slot; two settle ticks → one ownership change and one burn; ARMED past `startsAt + 600 s` → CANCELLED and refunded; tick gap > 600 s → CANCELLED and refunded; absent family defender holds at the baseline | 1, 2 |
| `test/anticheat/racket-tick.race.test.ts` | two ticks in one period mint once; 5 days of downtime → 3 cycles; < 3 eligible → no mint and a strike; 3 strikes release; tick vs capture | 1 |
| `test/anticheat/family-redis-down.test.ts` | with Redis throwing: plan, join, start, choice, scout, hit, bid, deposit, payday and ticks succeed with correct balances; renders and lobby DMs still go out | 4 |
| `test/anticheat/family-tester.test.ts` | a `BOT_DEVELOPER_IDS` user pays the fee and stakes, hits the 2-seat cap, the family cooldown, the hit cooldown and the gates, and gets no racket cycle bypass | 1 |
| `test/crimeFamily/scheduler.test.ts` | `chargeFamilyDues` 24 hourly runs on one day charge once, and a day whose 00:10 run was missed is charged at the next hour; arrears block bid/level but not plan; caper vault cut and racket income retry arrears; `runSuccession` heir order and one S23 per episode; `autoPayday`; `tickWars` creates one War per period and transitions once per state; reminder `caper` enqueued at the right `dueAt`; the new jobs are registered with `noOverlap: true` | direct calls |
| `test/crimeFamily/caper-flow.test.ts` | full lobby → GO → result with a fake channel (`{ messages: { edit: vi.fn(), send: vi.fn() } }`); the GO message is a new send mentioning the crew; the result edit names the result banner and carries no action row; a 50013 on render marks the board dead after one repost; trailing debounce renders the last of two joins inside 2 s | 5 |
| `test/crimeFamily/handlers.test.ts` | modal openers call `showModal` before any Prisma call; `rejectPress` edits a deferred ephemeral and follows up after `deferUpdate`; every handler acks before Redis | fake interactions |
| `test/dm/family-notice.test.ts` | `family`, `caper_lobby`, `turf` have no `command`; `caper` has `!caper` and is a `CooldownReminderType`; notices build; a notice with `cf_vault` seeded has a Section thumbnail URL containing that emoji id, and falls back to the Gun emote's id when unseeded; lobby DM cap 3 per 24 h; no lobby DM within 2 h of a cancel; toggles respected; settings panel = 30 (on) / 31 (off) | extends `test/dm/{prefs,settings}.test.ts` |
| `test/router/crew-jail.test.ts` | while jailed: `!caper brief` routes and opens; `!caper join` is refused by the service; `!turf` map routes; `!crew` view allowed; `!crew deposit` refused by the service; `family` still routes to marriage | `test/router/fakeMessage.ts` |
| `test/general/help-crime-families.test.ts` | with the registry seeded, the help category line contains `<:cf_crest_1:`; unseeded, it shows the Gun emote | builders |
| `test/scripts/emoji-families.test.ts` | family registry: no prefix starts with another; every `CF_ASSETS` file exists in `src/assets`; names match `^[a-z0-9_]{2,32}$`; no cross-family collision; prune candidates for `cf_` never include `shop_` names (pure helper `pruneCandidates(existing, family, desired)`); a guild emoji named `cf_vault` with no application emoji leaves `cfEmoji("vault")` undefined; the committed `src/data/emojis.json` has no duplicate ids and no managed-prefix key; every `CF_ART` banner is exactly 960x336, fully opaque, ≤ 48 colours, and `cf_fortuna_don.png` is 500x500 with alpha only 0/255 and ≤ 32 colours | pure, no Discord |
| `test/scripts/pixel-sprites.test.ts` | every sprite in `src/data/sprites/cf/` has 40 rows of 40 chars and valid palette indexes (`0`-`9`, `a`-`v`); rendering produces 160x160 with only alpha 0/255; colour count ≤ 32; the opaque bounding box spans ≥ 36 cells on its longer axis; the render is pixel-equal to the committed `src/assets/cf_<key>.png`; the `pixelGrid` emoji render maps each 4 px cell to exactly 3 px | pure (node `canvas`) |
| existing `npm run validate:slash` | 73 specs; literal case labels present | CI (`.github/workflows/deploy.yml:116-119`) |

---

## 19. Rollout

### 19.1 Schema change and deploy gate
- All 11 models are **new collections**; no existing model changes, so `prisma db push` (no `--accept-data-loss`) cannot fail on existing documents.
- Land the schema and the code that uses it in **one commit or one merge commit**, because the deploy job diffs only `HEAD~1` (`.github/workflows/deploy.yml:59-80`). Otherwise run the workflow with `workflow_dispatch run_schema: true`.
- Rackets are seeded by `seedRackets()` at boot (idempotent upsert, section 15), so the feature does not depend on `npm run seed`. `prisma/seed.ts` is not changed.
- `src/data/emojis.json` must be `{}` in the release commit (HEAD has `{}`; the working tree currently holds 18 fake records written by `checkV2Payloads.ts`).

### 19.2 Feature flag and staged release
`CRIME_FAMILY_CONFIG` in `src/utils/economyConfig.ts`, declared **after** `TAX_CONFIG` (`:176-195`), because it reads `TAX_CONFIG.transferTaxRate` (declaring it beside `MARRIAGE_CONFIG` at `:12` would be a TS2448 use-before-declaration). It holds every number in sections 6–12:

```ts
export const CRIME_FAMILY_CONFIG = {
  enabled: false,
  turfEnabled: false,
  allowGuildIds: null as string[] | null, // null = every guild
  createFee: 10_000_000,
  renameFee: 2_000_000,
  duesPerLevel: 40_000,
  depositMin: 10_000,
  depositDailyCap: 25_000_000,
  vaultTaxRate: TAX_CONFIG.transferTaxRate, // 0.05, applied inline on deposit and payday
  paydayMinEarnings: 500_000,
  paydayGrossCap: 1_000_000,
  paydayIntervalSeconds: 604_800,
  autoPaydayGraceSeconds: 86_400,
  inviteTtlSeconds: 86_400,
  lobbySeconds: 600,
  goSeconds: 120,
  leakAtSecondsLeft: 30,
  heatPenaltyPerPoint: 0.002,
  patrolCap: 0.60,
  seatsPer24h: 2,
  capersPerFamilyPer24h: 4,
  cancelledLobbyCooldownSeconds: 1_800,
  lobbyDmsPer24h: 3,
  lobbyDmQuietAfterCancelSeconds: 7_200,
  bidFloorDays: 7,
  warLateCancelSeconds: 600,
  hitCost: 25_000,
  hitCooldownSeconds: 600,
  hitsPerWar: 6,
  hitAnswerSeconds: 20,
  scoutSlotSeconds: 300,
  warMinutes: 60,
  blackoutSeconds: 600,
  // tiers, roles, rackets, levels, gates: imported from src/data/crimeFamilyCatalog.ts
} as const;
```

| Stage | What runs | Gate to the next stage |
|---|---|---|
| A (7 days) | `enabled: true`, `allowGuildIds: [<dev guild id>]`. Families, vault, capers. `turfEnabled: false`. May ship before the AI art exists (D66): banners are omitted and the mascot thumbnail falls back to a TextDisplay. | No failed race test; ledger sums reconcile (read-only aggregate). |
| B | `allowGuildIds: null`. Families, vault, capers for everyone. | 14 days elapsed and ≥ 4 families at L4+ (read-only count). |
| C | `turfEnabled: true`. `tickWars` opens the first BIDDING windows 72 h later; `tickRackets` starts. | — |

**Kill switch:** `enabled: false` refuses new commands; sweepers keep settling live capers and wars.

**Post-launch check (read-only, by the owner):** after 7 days in stage B, aggregate `Transaction{type:"caper_cut"}` and `{type:"family_payday"}` per member per day and compare with 8.10 and 11.1. Bucket members by Fortuna age (Weeks 2–4 = days 8–28, Month 2+ = day 29 on). Anti-goal 1 triggers if a bucket's **median** eligible member exceeds 15% of that band's floor (450,000/day in Weeks 2–4, 1,200,000/day in Month 2+) for a week, or if any single account exceeds 1,200,000/day for a week (D50).

### 19.3 Docs deliverables (same release)
| Deliverable | Content |
|---|---|
| `dashboard/src/content/modules/crime-families.ts` (`ModuleDoc`) | `forBeginners` (what, first commands `!crew`, `!caper`, `!turf`, tip); sections with full tables: tiers (8.1), roles and prep items (8.2), outcome math (8.5), payouts and exact cuts (8.6), caps and cooldowns (8.9), EV (8.10), vault rules (7), rackets and schedule (9.1), bidding and war rules (9.4), levels (10.1), XP (10.2); a "Getting better at Crime Families" strategy section (heat management for ceilings, best item per role for edge, intel calling etiquette, open your brief before the last 30 seconds, scouting rota, bid timing, defending above the baseline, levelling versus paying out). `screenshot` uses `/art/cf-caper-t4.png`. Registered after `crimeAndHeat` in `dashboard/src/content/modules/index.ts`. |
| `dashboard/src/content/commands.ts` | `COMMANDS` entries `crew`, `caper`, `turf`, module `"economy"`, `keyNumbers` quoting the exact constants (create fee, stake per tier, payday cap, hit cost), `jailBlocked: false` for all three (jail is enforced per action in the services, 13.1), `interactive: true`. |
| Cross-links | `dashboard/src/content/modules/crime-and-heat.ts`: "Legendary heists are solo. For crew jobs see Crime Families: Capers." `life-and-social.ts`: "`!family` is your marriage. Crime families are `!crew`." The same hint line on the bot's marriage `!family` card (13.1). |
| Art | `dashboard/public/art/cf-fortuna-don.png`, `cf-caper-t4.png`, `cf-turf-map.png`, `cf-war-banner.png` |
| Changelog | entry in `dashboard/src/app/changelog/page.tsx` |
| Bot help and tutorial | help category "Crime Families" (`src/commands/general/help.ts:39`, `MODULE_EMOTES` `:326-343`); tutorial `SystemLesson` (`src/commands/general/tutorial.ts:43`) |
| `casinoGuide` | **no entry** (D40) |
| `FORTUNA_V2_ECONOMY.md` | new "Crime Families" section: tables 8.1, 8.6, 8.10, 9.1, 10.1, 10.2 pacing, 11.1 and the ledger 11.3; Money Sinks list gains K1–K11 |
| `DESIGN.md` | updated in this project (already done): source table lists `applicationEmojiFamilies.ts`, `crimeFamilyAssets.ts`, `generatePixelAssets.ts` and the `validate:app-emojis`/`sync:app-emojis`/`gen:pixel-assets` commands; corrected size classes (icon fill, large character grid, measured drift); the pixel-grid emoji render; the key-colour, flood-fill and banner-crop rules; the reference-trace and contact-sheet steps. Re-check it against the shipped scripts when they land. |
| `README.md` | the `sync:app-emojis` / `gen:pixel-assets` commands next to the existing emoji notes (`README.md:92-95`) |

### 19.4 Implementation order
1. Tx seams (`creditWalletInTx`, `afterEarnedCredit`, `debitWalletInTx`, `applyEconomyPenaltyTx`, `addCrimeHeatTx`, `jailUserTx`; export `computeNetWorth` and `migrateLegacyHeatForUser`; `rejectPress`; `registerEmojiForTest`; the registry's managed-prefix skip) with `test/wallet/tx-seams.test.ts`; existing wallet, penalty, heat and jail tests stay green.
2. `src/data/crimeFamilyCatalog.ts`, `CRIME_FAMILY_CONFIG`, pure `caperMath.ts`, `eligibility.ts`, war math; catalog, math, ring and eligibility tests.
3. Prisma models + `familyService` (create, invite, accept, leave, kick, roles, chair, disband) + membership race tests. **One commit with step 4–6 code, or a merge commit.**
4. `vaultService` (`spendFromVault`, deposit, payday, dues) + vault race tests.
5. `caperService` (plan, join, leave, start, brief, choice, settle, sweeper) + join/settle/Redis-down/tester tests.
6. UI builders S1–S15, S22–S28 in `src/ui/crimeFamilyUi.ts`; `crew:`/`cpr:` routing; commands; router cases and aliases (no `restrictedInJail` entries); slash specs; DM registry and notices; layout, flow, handler, DM and router tests.
7. Art (may land after stage A, D66): `git checkout -- src/data/emojis.json` first; AI reference renders for the 24 icons, imported with `generatePixelAssets --import` and hand-finished (20.2); sprite test; the contact sheet (`--sheet`) signed off by the owner; AI renders for the mascot and the 4 caper and 3 result banners; `CF_ASSETS`; emoji-family refactor + emoji test; `npm run validate:app-emojis`; the **owner** runs `npm run sync:app-emojis -- --family cf --plan` (read-only), then `npm run sync:app-emojis -- --family cf` (live bot token), then restarts the bot so `initEmojiRegistry` loads the new names (`src/utils/emojiRegistry.ts:60-74`).
8. Stage A, then stage B.
9. `racketService`, `warService`, `tickWars`, `tickRackets`, `seedRackets` + turf race and scheduler tests.
10. Turf UI S16–S21, `turf:` routing; AI renders for `cf_turf_map` and `cf_war_banner`.
11. Docs (19.3).
12. Stage C.

---

## 20. Asset production plan

### 20.1 Path per asset
`DESIGN.md` section 8 defines two production paths. Each of the 34 files uses exactly one:

| Path | Assets | Why |
|---|---|---|
| **B. Programmatic sprite** (`src/scripts/generatePixelAssets.ts`), from an AI reference | all 24 icons (16.1 rows 1–24), which are also the 24 emoji sources | crisp 40x40 grids, alpha only 0/255, ≤ 32 colours by construction, reproducible from source, readable at 22 px; the reference render keeps the shading depth of the shipped icons (D65) |
| **A. AI prompt pack + post-process** | `cf_fortuna_don.png` (500) and the 9 banners (960x336) | Lady Fortuna and full scenes are too large to hand-grid (`DESIGN.md` section 8A) |

### 20.2 Path B: `src/scripts/generatePixelAssets.ts`
**Sprite source.** One file per icon in `src/data/sprites/cf/<key>.ts` (not under `src/assets`, because `copyAssets.js` copies every file there into `dist`), exporting the `DESIGN.md` 8B format:

```ts
// src/data/sprites/types.ts
export type PixelSprite = {
  key: string;              // "vault" (unprefixed, the CF_ASSETS key); the script writes `${CF_APPLICATION_EMOJI_PREFIX}${key}.png`
  grid: 40;                 // icons only in v1
  scale: 4;
  palette: string[];        // index 0 = "transparent"; ≤ 32 entries; hex from DESIGN.md section 3
  rows: string[];           // 40 strings of 40 chars; "0"-"9" then "a"-"v" index the palette
};
// src/data/sprites/cf/index.ts
export const CF_SPRITES: readonly PixelSprite[] = [cfCrest1, cfCrest2, /* … 24 entries … */];
```

**Script behaviour** (pure file I/O: no Prisma, no Redis, no `.env`, no Discord):
1. Load `CF_SPRITES` (a `--set cf` argument picks the set; `cf` is the only set in v1, so later families add a set, not a script).
2. Validate each sprite: `rows.length === grid`, every row `length === grid`, every char maps to an existing palette index, palette ≤ 32, index 0 is `"transparent"`, `key` matches `^[a-z0-9_]{2,29}$`, no duplicate keys, opaque bounding box ≥ 36 cells on its longer axis. Any failure exits 1 and names the sprite, row and column.
3. Render: `createCanvas(grid × scale, grid × scale)` (160x160), `ctx.imageSmoothingEnabled = false`, one `fillRect(x × scale, y × scale, scale, scale)` per non-zero cell.
4. Write `src/assets/cf_<key>.png` with `canvas.toBuffer("image/png", { compressionLevel: 9 })`. Byte budget: ≤ 64 KiB (`DESIGN.md` section 9), else exit 1.
5. Print a summary: written, unchanged (byte-identical, skipped), failed.

**CLI** (new `package.json` script `"gen:pixel-assets": "ts-node src/scripts/generatePixelAssets.ts"`):

| Command | Effect |
|---|---|
| `npm run gen:pixel-assets -- --set cf` | validate and write all 24 `src/assets/cf_*.png` |
| `npm run gen:pixel-assets -- --set cf --only vault,war` | only those keys |
| `npm run gen:pixel-assets -- --set cf --check` | validate only, write nothing (CI-safe) |
| `npm run gen:pixel-assets -- --set cf --preview <dir>` | also write 32x32 nearest-neighbour previews `<dir>/<key>_32.png` for the "still reads at 32 px" QA check |
| `npm run gen:pixel-assets -- --import ref_<key>.png --key <key>` | read a 40x40 reference PNG and write `src/data/sprites/cf/<key>.ts` (palette + rows) as a starting grid |
| `npm run gen:pixel-assets -- --set cf --sheet <out.png>` | tile every icon beside `lucky coin.png`, `thieves gloves.png` and `padlock.png` at 160 px and 32 px for the owner's sign-off |

**Output names:** `src/assets/cf_crest_1.png` … `cf_block_alleys.png`, exactly the 24 names in 16.1. `CF_ASSETS` (20.4) is derived from `CF_SPRITES` (`key → cf_<key>.png`), so there is one table for thumbnails and emojis.

**Authoring the grids (D65).** (1) Render each icon brief with the `DESIGN.md` 8A icon prompt (key colour per `DESIGN.md` 8A). (2) Reduce it to a 40x40 reference outside the repo: `magick raw.png <key-out per 8A> -filter box -resize 40x40! -channel A -threshold 50% +channel +dither -colors 24 ref_<key>.png`. (3) `--import` it. (4) Hand-finish the grid: clean the 1-cell near-black `#100010` outline, snap colours to `DESIGN.md` section 3, keep 2–3 tones per material lit from the top left and one optional 1-cell highlight. The object spans 36–38 of the 40 cells (1–2-cell margin), like the shipped icons; the emoji renderer's padding supplies the breathing room. Palettes come only from `DESIGN.md` section 3 (gold `#E0A000/#D09000/#A06000/#402000`, steel `#303030/#404040/#505050`, leather `#805020`, parchment `#D09050/#B08040`, night slate `#182030/#283040`, purple `#9B59B6/#A858B8/#502060`, Fail red `#E74C3C`, outline `#100010`). (5) Render, then the owner approves the `--sheet` contact sheet before the emoji sync. The committed source is the grid.

**Done 2026-10-29.** All 24 grids are in `src/data/sprites/cf/` and rendered to `src/assets/cf_*.png` (160x160, alpha only 0/255). The references were drawn in code (layered shapes with a top-left light ramp and an auto 1-cell outline), not rendered by an AI model; the owner approved the contact sheet. Emoji upload still waits for the generalised sync script (20.4) and owner approval.

### 20.3 Path A: AI prompt pack
**Who runs it.** The renders need an image-model account the repo does not have (no OpenAI SDK or key; `@google/generative-ai` in `package.json` is imported nowhere in `src/` and is not part of this pipeline). Who produces them is owner question Q3 (section 22); the default is the owner, delivering raw renders to a gitignored `art-src/cf/`, after which the builder runs the post-process below.

**Generation settings.** Banners: generate at 1536x1024 (landscape) and crop. Mascot and icon references: generate at 1024x1024. Use `gpt-image`: 47 shipped files of 1024 px or larger carry its C2PA manifest; the provenance of the 500 px, banner and 160 px classes is unknown (`DESIGN.md` section 8A). Generate 4 candidates per prompt; pick the one with the cleanest outline and correct placard text. **Key colour:** `#00FF00` for Lady Fortuna and any subject with purple or magenta; `#FF00FF` otherwise (`DESIGN.md` 8A). **Banner composition:** append to every banner prompt "compose everything, including the placard, inside the middle horizontal band; the image will be cropped to 1536x538 starting at y=243; keep the top and bottom 240 px plain dark wall and floor".

**Negative terms (append to every prompt):** `anti-aliasing, blur, soft shadow, drop shadow, glow, bloom, neon, gradient sky, vignette, depth of field, noise, painterly, photorealistic, 3D render, voxel, watermark, signature, logo, real brand, checkerboard, transparency grid, frame, border, extra text`.

**Prompts** (each is complete; paste as is, then append the negative terms):

`cf_fortuna_don.png`
```
16-bit pixel art character sprite of Lady Fortuna, a young woman with long straight purple hair to the waist, purple eyes, light skin and a soft confident smirk, three-quarter view, framed from head to mid-thigh, wearing a charcoal pinstripe suit, purple shirt, gold tie pin and gold cufflinks, and a black fedora with a purple band, holding a gold-trimmed leather ledger against her hip with one hand, SNES/GBA era RPG character art, crisp hard-edged square pixels on a visible 250x250 grid, 1-pixel near-black outline, flat cel shading with 2-3 tones per material, light from top left, limited palette of purple #9B59B6, gold #E0A000, charcoal #303030, slate #182030, near-black #100010, single character, figure cropped at mid-thigh by the bottom edge, about 5% margin at the top and sides, plain solid #00FF00 background, no ground, no text.
```

`cf_caper_t1.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, interior of a pawnshop back room at night: barred window with moonlight, shelves of pawned clocks and guitars, a wooden table with a rolled blueprint and a desk lamp; Lady Fortuna in the centre third from the waist up, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band, presenting with an open hand and a sly smile; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "FORTUNA'S CAPERS" on line one and "- PAWNSHOP BACK ROOM!" on line two in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030 and #283040, gold #E0A000, leather #805020, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_caper_t2.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a rainy city street at night with an armoured payroll van parked at the kerb, wet cobblestones reflecting one street lamp, brick walls; Lady Fortuna in the centre third from the waist up, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band, presenting with an open hand; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "FORTUNA'S CAPERS" on line one and "- PAYROLL VAN!" on line two in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030 and #283040, steel #404040, gold #E0A000, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_caper_t3.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a racetrack grandstand at night under floodlights with a barred cashier cage window full of banknote stacks and betting slips; Lady Fortuna in the centre third from the waist up, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band, presenting with an open hand; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "FORTUNA'S CAPERS" on line one and "- CASHIER CAGE!" on line two in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030 and #283040, leather #805020, gold #E0A000, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_caper_t4.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a diamond exchange vault with a round steel vault door standing open, velvet trays of cut gems, and a grid of thin red laser beams across the floor; Lady Fortuna in the centre third from the waist up, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band, presenting with an open hand; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "FORTUNA'S CAPERS" on line one and "- DIAMOND EXCHANGE!" on line two in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of steel #303030 #404040 #505050, Fail red #E74C3C, gold #E0A000, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_result_clean.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a black getaway car driving under a moonlit stone bridge with a bag of money on the back seat, calm night river; Lady Fortuna in the centre third from the waist up leaning out of the passenger window, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, tipping her black fedora with a purple band and smiling; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "CLEAN JOB!" in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030 and #283040, gold #E0A000, success green #2ECC71 accents, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_result_messy.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a black getaway car fishtailing around a street corner with a spilled money bag and a single red police light far in the distance; Lady Fortuna in the centre third from the waist up inside the car, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, holding her black fedora with a purple band on her head, gritted grin; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "MESSY!" in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030 and #283040, Fail red #E74C3C, gold #E0A000, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_result_bust.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a back alley at night lit by red and navy police lights, scattered banknotes on the ground, silhouettes of two crew members with hands raised against a brick wall; Lady Fortuna in the centre third from the waist up with both hands raised and a rueful smile, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "BUSTED!" in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030, Fail red #E74C3C, suit navy #385880 and #203050, gold #E0A000, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_turf_map.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a smoky back room with a large wooden table covered by a pixel city map divided into three zones (grey brick street blocks, a lit district with shop signs, and a gold crown district), small cloth flags on pins marking territories; Lady Fortuna in the centre third from the waist up leaning over the map and pointing at it, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "FORTUNA'S TURF" on line one and "- HOLD THE BLOCK!" on line two in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of parchment #D09050 and #B08040, leather #805020, night slate #182030, gold #E0A000, Fail red #E74C3C, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

`cf_war_banner.png`
```
16-bit pixel art game banner, wide 2.86:1 composition, a city street at dusk with two rival crews in suits and flat caps facing off from opposite pavements, a dock crane on the left, a street lamp in the middle and a dark alley mouth on the right; Lady Fortuna in the centre third from the waist up standing between them like a referee with one open hand raised, long straight purple hair, charcoal pinstripe suit, purple shirt, gold tie pin, black fedora with a purple band; a cream placard #F0E8D8 with a 2-pixel dark frame across the top centre reading "TURF WAR!" in a blocky pixel font, cream letters with a 1-pixel black outline; all text at least 16 pixels from the edges; SNES era RPG scene, crisp square pixels on a visible 240x84 grid, 1-pixel near-black outlines, flat 2-3 tone shading, light from top left, limited palette of night slate #182030 and #283040, leather #805020, gold #E0A000, Fail red #E74C3C, purple #9B59B6, near-black #100010, opaque background edge to edge.
```

**Post-process** (ImageMagick 7, run by the person producing art, never by the bot; implements `DESIGN.md` section 8A steps 1–6):

| Asset | Command |
|---|---|
| Mascot (from 1024x1024, `#00FF00` background) | `magick render.png -alpha set -fuzz 10% -fill none -draw "color 0,0 floodfill" -draw "color 1023,0 floodfill" -draw "color 0,1023 floodfill" -draw "color 1023,1023 floodfill" -filter box -resize 250x250! -channel A -threshold 50% +channel +dither -colors 32 -filter point -resize 500x500! -strip -define png:compression-level=9 src/assets/cf_fortuna_don.png` (corner flood fill, never a global `-transparent`, so interior pixels near the key survive) |
| Banner (from 1536x1024) | `magick render.png -crop 1536x538+0+${Y} +repage -filter box -resize 240x84! +dither -colors 48 -filter point -resize 960x336! -strip -define png:compression-level=9 src/assets/cf_<key>.png` with `Y=243` by default, adjusted by the producer so the placard sits inside (area downscale, then nearest-neighbour upscale; a point-sampled 6.4x downscale breaks 1-px outlines and letters) |

Then run the `DESIGN.md` section 9 checklist: exact size (`magick identify`), alpha 0/255 only (mascot), no opaque pixel within 20 RGB units of the key colour, fully opaque (banners), placard fully inside and at least 16 px from every edge with the text spelled correctly (else stamp it with the pixel font, section 21), ≤ 32 / ≤ 48 colours, no watermark, byte budgets (character ≤ 400 KiB, banner ≤ 700 KiB).

### 20.4 Emoji sync: one script, a registry of families
The existing script hardwires the shop family (`src/scripts/syncShopApplicationEmojis.ts:10-16`, `:104-160`). It is generalised, not forked (`DESIGN.md` section 7).

**New runtime helpers** (`src/utils/applicationEmojiNames.ts`):
- `applicationEmojiName(prefix: string, key: string): string` — the body of `getShopApplicationEmojiName` (`src/utils/shopItemAssets.ts:11-24`) with the prefix as a parameter (lowercase, non-`[a-z0-9_]` → `_`, collapse runs, trim, prefix, cut to 32, strip trailing `_`).
- `resolveTableAsset(table, key): { fileName, filePath, attachmentName } | null` — the body of `resolveShopItemThumbnailAsset` (`shopItemAssets.ts:103-118`) over any table, via `findAsset`.
- `getShopApplicationEmojiName` and `resolveShopItemThumbnailAsset` become one-line wrappers, so their call sites (`src/commands/games/roll.ts:39`, `src/commands/general/casinoGuide.ts:171`, `src/services/activeItemEffectService.ts:221`, `src/commands/economy/shop.ts:846`, `:1171`) do not change.

**Crime Families table** (`src/utils/crimeFamilyAssets.ts`):
```ts
export const CF_APPLICATION_EMOJI_PREFIX = "cf_";
export const CF_ASSETS: Readonly<Record<string, string>> =   // derived from CF_SPRITES: key -> `cf_${key}.png`
  Object.fromEntries(CF_SPRITES.map(s => [s.key, `${CF_APPLICATION_EMOJI_PREFIX}${s.key}.png`]));
export const CF_ART: Readonly<Record<string, string>> = {   // attachments only, never emojis
  fortuna_don: "cf_fortuna_don.png", caper_t1: "cf_caper_t1.png", /* … 10 entries … */
};
export const cfEmoji = (key: string): string | undefined => emojiInline(applicationEmojiName(CF_APPLICATION_EMOJI_PREFIX, key));
export const cfAttachment = (key: string): AttachmentBuilder | null; // findAsset + AttachmentBuilder named "cf_<key>.png"; null when the file is missing
```
There is no `cfEmojiIconUrl`: DM thumbnails pass the inline string from `cfEmoji` to `noticeContainer` (13.4).

**Family registry** (`src/utils/applicationEmojiFamilies.ts`, imported by the script and tests only):
```ts
export type ApplicationEmojiFamily = {
  id: "shop" | "cf";
  prefix: string;                              // "shop_" | "cf_"
  assets: Readonly<Record<string, string>>;    // key -> file name in src/assets
  validKeys: ReadonlySet<string>;              // shop: SHOP_CATALOG keys (read only); cf: keys of CF_ASSETS
  pixelGrid?: number;                          // cf: 40 (nearest-neighbour integer render); shop: unset (smoothed, off-grid sources)
};
export const APPLICATION_EMOJI_FAMILIES: readonly ApplicationEmojiFamily[] = [
  { id: "shop", prefix: SHOP_APPLICATION_EMOJI_PREFIX, assets: SHOP_ITEM_THUMBNAIL_ASSETS, validKeys: new Set(SHOP_CATALOG.map(i => i.key)) },
  { id: "cf",   prefix: CF_APPLICATION_EMOJI_PREFIX,   assets: CF_ASSETS,                  validKeys: new Set(Object.keys(CF_ASSETS)), pixelGrid: 40 },
];
export const MANAGED_EMOJI_PREFIXES = APPLICATION_EMOJI_FAMILIES.map(f => f.prefix);
```
Adding a future family is a new array entry, not a new branch.

**Script refactor** (same file, so existing docs and habits keep working):
1. Load-time assertion: no family prefix starts with another's (`"cf_"` vs `"shop_"` passes); duplicate ids fail.
2. `PreparedEmoji` gains `familyId` and `prefix`. `prepareEmojis(families)` loops families, rejects keys not in `validKeys`, derives names with `applicationEmojiName(prefix, key)`, re-checks `^[a-z0-9_]{2,32}$`, and checks name collisions **across** families.
3. `renderApplicationEmoji(filePath, family)` keeps today's path (128x128, 8 px padding, smoothing on, PNG level 9, ≤ 256 KiB) when `family.pixelGrid` is unset. When it is set (D39): assert `width === height` and `width % pixelGrid === 0`; cell = `floor((128 − 2 × 4) / pixelGrid)` = 3, so the art is 120 px at offset 4; `imageSmoothingEnabled = false`. 160 → 120 maps each 4 px cell onto exactly 3 px, so nearest-neighbour is lossless.
4. `temporaryEmojiName` uses `${prefix}tmp_<sha256(key+image)[0:16]>` (`cf_tmp_…` is 23 chars).
5. The 2,000-emoji cap check counts all families (63 shop + 24 cf = 87 desired).
6. Prune is scoped per selected family: candidates are application emojis whose name starts with that family's prefix and is not desired, extracted as a pure `pruneCandidates(existingNames, family, desiredNames)` for testing. It runs only after a run with zero failures.
7. Final verify: exactly one emoji per desired name, per family.
8. New option `--family <id>[,<id>]` (default: all). Help text and summary are per family. New option `--plan`: log in, fetch the application's emojis and print would-create, would-replace and would-prune per family without changing anything; the owner runs it before the first `--prune`.
9. `package.json`: `sync:shop-emojis` → `… --family shop`; `validate:shop-emojis` → `… --dry-run --family shop`; new `sync:app-emojis` (all families) and `validate:app-emojis` (`--dry-run`, all families). `--dry-run` never contacts Discord.
10. The upload needs the live bot token from `.env`; the **owner** runs it. `src/scripts/checkV2Payloads.ts` must not be run (it writes fake ids into `src/data/emojis.json`).

**Runtime lookup.** `initEmojiRegistry` (`src/index.ts:81`) loads application emojis **by name** at boot (`src/utils/emojiRegistry.ts:60-74`), overriding persisted records. Steps 4 and 5 (guild emoji cache and storage guild, `:78-99`) fill any name not yet in the registry from **any** server the bot is in; they gain a skip for names that start with a managed prefix (`SHOP_APPLICATION_EMOJI_PREFIX`, `CF_APPLICATION_EMOJI_PREFIX`; the registry imports only these constants, never the family registry; the emoji-families test asserts the list equals `MANAGED_EMOJI_PREFIXES`), so a third-party server's `cf_vault` can never render on Fortuna's cards. Code calls `cfEmoji("vault")` and never holds an id; no `<:name:id>` string is added to `src/config/branding.ts`. New uploads appear after the next bot restart. No module-level constant may call `cfEmoji` (it would run before the registry loads, 13.1).

**Fallback when an emoji is missing** (plain text label):
| Surface | Behaviour |
|---|---|
| Inline in a TextDisplay | the emoji is omitted; the text label (role, rank, class, block, `[TAG]`) is always printed, so nothing is lost |
| Button | no `.setEmoji`; the plain-text `setLabel` stays (labels never contain emoji) |
| Select option | no `emoji` field; the label stays |
| DM notice thumbnail | `noticeContainer(cfEmoji(key) ?? Mascot.Emotes.Gun, …)`, so the Gun emote's image (`src/config/branding.ts:160-168`) |
| Section thumbnail file missing (`findAsset` null) | the Section is replaced by a TextDisplay with the same text |
| Gallery banner file missing (`findAsset` null) | the MediaGallery is omitted (component count −1) and no file is sent (D66) |
| Help category emote | `Mascot.Emotes.Gun` |

---

## 21. Left to the builder
1. Exact wording of every card, hint and DM, within the facts given (amounts, timers, names).
2. Hand-finishing the 40x40 grids for the 24 icons from their reference renders, within the briefs (16.1) and the palette rules (20.2).
3. Choosing the best of 4 AI candidates per prompt, and fixing placard text if the model misspells it (re-roll, or render the placard blank and stamp the text with the pixel font in a post step).
4. File and function layout inside `src/services/crimeFamily/` beyond the named seams.
5. Whether to add an in-process `setTimeout` for faster resolution at `goEndsAt` (the sweeper stays authoritative).
6. The amount parser reused for deposit and bid inputs (`250k`, `5m`), provided it is the one `!transfer` uses.
7. Log line formats and `logToChannel("TRADE")` message text.
8. Index tuning beyond the listed `@@index` entries, if a query plan needs it.
9. The slur list content for `FAMILY_NAME_DENYLIST`.
10. Verifying that crafted prep items are not consumed by their own use paths; if one is, it still counts as owned until used (8.2), and no change is needed.
11. Existing-code gaps this feature works around without fixing them (they belong to their own tasks): interaction handlers have no shared ban check (`src/index.ts:108-150`; the feature reads the ban in 12.1), and a raid on an empty wallet resets heat for free (`src/services/taxService.ts:294-296`; the feature does not count raids as a sink, D63).

## 22. Open questions for the owner
Only questions whose answer changes what gets built and that only the owner can settle, most important first. Everything else is an author decision in section 0; the build proceeds on the defaults below unless the owner says otherwise.

**Resolved 2026-10-29:** the owner chose the default for all four: Q1 (a), Q2 (a), Q3 (a), Q4 (a).

| # | Question | Options (recommended first) | Default this doc assumes | Why it changes what gets built |
|---|---|---|---|---|
| Q1 | Ship Turf (rackets and wars) in this project? | (a) Same project, built last behind `turfEnabled` and switched on in stage C after ≥ 4 families reach L4 (19.2). (b) Defer Turf to its own PRD after stage B; payday eligibility becomes seats only. (c) Ship Turf with stage B. | (a) | Turf is about half the plan: the `Racket`, `War`, `WarContribution` and `WarHit` models, `tickWars`/`tickRackets`/`seedRackets`, S16–S21, 8 assets, 6 emojis and 4 race-test files. |
| Q2 | Name of the family job and its commands | (a) **Caper**, commands `!crew`/`!caper`/`!turf`, ids `cpr:`, emoji `cf_caper`. (b) Rename the solo board's "Legendary heist" tier and call the family job a **Heist** (`!heist`). | (a) | The name is baked into command names, customId prefixes, DM types, slash specs, emoji names and the placards on the AI banners (`FORTUNA'S CAPERS`); changing it after the art is made means re-rendering. (b) also touches `src/commands/economy/crimeUi.ts:163`, the crime docs and the overhaul spec. |
| Q3 | Who produces the AI art (1 mascot, the banners, and the 24 icon reference renders), with which account, and how many banners? | (a) The owner runs `gpt-image` in the ChatGPT UI with the 20.3 prompts and drops raw renders into a gitignored `art-src/cf/`; the builder runs the post-process; 9 banners. (b) Same producer, 3 banners (one caper, one result with text-only outcome, one turf). (c) Give the builder an image-API key and budget. | (a) | The repo has no image-model access (20.3), so art is either on the owner's critical path or needs a key. Capers do not wait for it (D66), but stage C's turf map and the icon emojis do. (b) removes 6 renders and the per-tier and per-outcome art from S12, S13 and S15. |
| Q4 | Is "no vault withdrawals, only a capped, equal weekly Payday" acceptable to players? | (a) Yes, as specified (7.3, 7.5). (b) Allow withdrawals with two-officer approval, a per-member weekly cap and tax. | (a) | (b) reopens the single-recipient exit that 7.5 closes, and sections 7, 11 and 12 would be re-derived. |

No contradiction with `DESIGN.md` remains: the emoji render rule (D39) and the asset classes were corrected in both files. Briefs in 16.1 follow its palette rule ("no new hues, never neon"); district art uses lit gold bulbs instead of neon, and police lights use Fail red with suit navy.

## 23. Glossary
| Term | Meaning |
|---|---|
| Associate | a member with less than 72 hours of tenure; derived, not stored; cannot take caper seats or hit |
| Brief | the ephemeral card (S14) showing the intel a seat holds and the call it must make |
| Bust | a caper outcome with k ≥ 2 misses (crews of 3–4) or k ≥ 3 (crews of 5–6): no pay, fines, jail rolls |
| Caper | the family multiplayer heist: 10-minute lobby, 120-second GO |
| Clean | a caper with no misses that survives the patrol roll: full pool |
| Active member | ≥ 2 started caper seats or ≥ 3 correct war hits in the last 7 days; needed for payday and racket eligibility |
| Baseline | the per-block score every war defender starts with: 30 / 50 / 80 by class |
| Corner | the lowest racket class (300,000/day) |
| Dark | a seat whose member had not opened the brief before GO−30 s; it cannot lock a choice and counts as a miss |
| Dues | 40,000 × level per UTC day from the vault |
| Earnings | the vault bucket of minted family income; the only bucket Payday can pay from |
| Edge | the mean of seats' best prep `successBonus`; lowers the patrol chance |
| Fence | the 10% of every caper pool that is never minted |
| GO | the 120-second live phase of a caper |
| Intel ring | seat i's correct answer is shown only to seat (i+1) mod n |
| k | number of seats whose choice was wrong or missing, dark seats included |
| Leak | intel shown to a seat from GO−30 s because its holder is dark; the dark seat is still a miss |
| Messy | a caper with 1 ≤ k < bustAt, or k = 0 with a failed patrol roll: 35% pool |
| Neglect strike | a racket cycle with fewer than 3 racket-eligible members; 3 strikes release the racket |
| Patrol roll | the random check that can turn a perfect run Messy (chance q, 8.5) |
| Payday | the weekly equal, capped, taxed split of earnings to eligible members |
| Pool | `B × n × f` for a caper |
| Racket | one of 10 fixed territories paying protection income into earnings |
| Scout | free war action revealing one random block's current weak point |
| Seat | one member's role in one caper |
| Slot | a 5-minute war interval; weak points rotate per slot |
| Street | the NPC owner and defender of unowned rackets (`ownerFamilyId = ""`) |
| Treasury | the vault bucket of member deposits; never withdrawable, burned on disband |
| Turf War | the weekly 60-minute contest for one racket |
| Under investigation | a family with ≥ 3 members at heat ≥ 100: cannot plan capers or bid |
| Weak point | the correct approach for a block in a slot, derived from the secret war seed |
