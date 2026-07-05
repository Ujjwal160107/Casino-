# Fortuna (Lady Fortuna) — Public Commands Inventory

Appendix to [website V2 refactor design spec](2026-07-05-website-v2-refactor-design.md). Produced 2026-07-05 by exhaustive read of `src/commands` (economy, games, general, life) plus router, services, and config. This is the source of truth for the website's commands page and docs content.

## Global facts

- **Bot / persona name:** `Lady Fortuna` (referred to as "Fortuna" in copy).
- **Default prefix:** `!` (per-guild configurable via `!set-prefix`; stored in guild settings, `settings.prefix ?? "!"`). The bot also responds when @mentioned (a bare mention returns a help pointer).
- **Currency:** name **"Fortunes"** (`GLOBAL_CURRENCY_NAME = "Fortunes"`), emoji `<:fortunes:1503253856992366612>` (`GLOBAL_CURRENCY_EMOJI`).
- **Slash commands:** effectively **none live.** `index.ts`, `deploy-commands.ts`, and `registerSlashCommands.ts` all load from `src/commands/slash/`, but that directory does not exist (`fs.existsSync(slashDir)` is false → "No slash commands directory found; skipping"). All gameplay is prefix/message-based, routed through `src/commandRouter.ts` → `routeMessage()`.
- **Economy identity — fully V2.** No command in `src/commands` uses the V1 compound key `discordId_guildId`/`guildId_discordId` (grep returned nothing). All DB lookups use `where: { discordId }`. Many handlers still *pass* a now-cosmetic `guildId` arg into service helpers (e.g. `ensureUserAndWallet(id, guildId, tag)`, `getUser(id, guildId)`, `payBail(id, guildId)`), but identity itself is global/V2. Those "V1-signature leftover" cases are flagged per command below.
- **Routing gates in `routeMessage`:** banned-user check; developer-only gate (`isDeveloperOnlyCommand`); a large `LEGACY_REMOVED_COMMANDS` set that replies "removed in Fortuna V2"; and a **jail restriction set** blocking these while jailed: `work, crime, beg, slut, rob, shop, buy, sell, market, bet, blackjack, roulette, slots, coinflip, cockfight, chicken, withdraw, deposit, transfer, daily, weekly, monthly, bank, card, invest, stock, trade`.
- **Dead/non-command files:** none of the player-facing command files are unrouted. The only non-command file in these folders is `src/commands/economy/crimeUi.ts` — a UI-payload helper imported by `crime.ts` and `handlers/crimeInteractionHandler.ts`, **not** a standalone command. Several router cases point to *removed* stores and reply with a "store moved" message (see General notes).
- **Casino global cooldowns** (`casinoCooldownService.ts`, normal / premium-seconds; premium is currently always false): coinflip 20/8 min, slots 25/10 min, blackjack 30/12 min, roulette 30/12 min, cockfight 45/18 min. Plus a 5-min active-game lock.
- **Bet limits** (`GAME_BET_LIMITS`): default min **10,000**, default max **1,000,000**; per-game max: coinflip 500k, slots 750k, blackjack 1M, roulette 1M, russian_roulette 750k, cockfight 1M, chicken 1M.

---

## Module: `general`

### `help`
- **File:** `general/help.ts` · **Aliases:** none.
- **Does:** Opens the paginated Components-V2 help menu (16 module sections). Each module has a **View** button → ephemeral submenu; Prev/Next page buttons (owner-locked via `help:nav:<page>:<authorId>`). This file is itself the curated public command catalog.
- **Usage:** `!help` · **Cooldown:** none · **Interactive:** yes (buttons, pagination, per-user ephemeral module views).

### `casino` / `games` / `casinoguide` / `casino-guide`
- **File:** `general/casinoGuide.ts` · **Handler:** `handleCasinoGuide`.
- **Does:** Casino game-guide hub (banner image + per-game guide buttons: blackjack, roulette, slots, coinflip, cockfight, feed, russian roulette). 5-min button collector, paginated (Prev/Next).
- **Usage:** `!casino` · **Interactive:** yes (buttons open ephemeral guides; roulette guide attaches an image). Note: some guide bodies hardcode a `,` prefix in examples.

### `guide` / `tutorial`
- **File:** `general/tutorial.ts` · **Handler:** `handleTutorial`.
- **Does:** "How to Play" onboarding: New Player Path + 16 paginated system lessons; **View** buttons open ephemeral lesson views (`tut:module:*`, `tut:nav:*`, owner-locked).
- **Usage:** `!tutorial` · **Interactive:** yes.

### `start`
- **File:** `general/start.ts` · **Handler:** `handleStart` (required via `require`).
- **Does:** Creates the player's profile if none exists; grants starting balance.
- **Key numbers:** `STARTING_WALLET_BALANCE = 1,000`.
- **Usage:** `!start` · **V1 leftover:** calls `getUser(userId, guildId)` / `createUser(userId, guildId, username)` (guildId passed).

### `ping` / `latency`
- **File:** `general/ping.ts` · **Handler:** `handlePing`.
- **Does:** System status dashboard — API, WebSocket, DB (Mongo `$runCommandRaw ping`), Redis latency, uptime, RAM.
- **Usage:** `!ping` · **Cooldown:** none.

*(Note: `set-prefix`/`setprefix` routes to `admin/setPrefix.ts` — admin folder, excluded from the public site. It appears in the help catalog as user-facing but is implemented under admin.)*

---

## Module: `economy`

### `balance` / `bal` / `b`
- **File:** `economy/balance.ts` · **Handler:** `handleBalance`.
- **Does:** Shows wallet, bank, net worth (self or a mentioned user; bots rejected).
- **Usage:** `!balance [@user]` · **V1 leftover:** `ensureUserAndWallet(id, guildId, tag)`.

### `deposit` / `dep` / `depo`
- **File:** `economy/deposit.ts` · **Handler:** `handleDeposit`.
- **Does:** Move wallet → bank. Supports `all` and smart amounts (`parseSmartAmount`); reports wallet-cap capping.
- **Usage:** `!deposit <amount|all>`.

### `withdraw` / `with` / `wd`
- **File:** `economy/withdrawBank.ts` · **Handler:** `handleWithdrawBank`.
- **Does:** Move bank → wallet (`all` / smart amount; wallet-cap aware).
- **Usage:** `!withdraw <amount|all>`.

### `transfer` / `give`
- **File:** `economy/transfer.ts` · **Handler:** `handleTransfer`.
- **Does:** P2P wallet transfer with **5% transfer tax** (can be "shielded" by an item); logs to channel.
- **Usage:** `!transfer <@user> <amount>` · **Key #:** `transferTaxRate = 0.05` · **V1 leftover:** passes `message.guildId` to `ensureUserAndWallet`/`transferAnyFunds`.

### `ask` / `ask-money` / `askmoney`
- **File:** `economy/ask.ts` · **Handler:** `handleAsk`.
- **Does:** Sends a money-request card that pings the target with **Accept / Decline / Block** buttons (`ask_accept:<id>:<amt>`, `ask_decline`, `ask_block`). Sub: `unblock @user`.
- **Usage:** `!ask <@user> <amount> [reason]` · `!ask unblock <@user>` · **Interactive:** yes.

### `crime`
- **File:** `economy/crime.ts` · **Handler:** `handleCrime` (UI from `crimeUi.ts`).
- **Does:** Crime minigame board (button-driven); jail-blocked; shows cooldown board with last result when on CD.
- **Key #s** (`GRINDING_COMMANDS.crime`): cooldown **3600s**, winRate **0.35**, payout **100,000–220,000**, fine **60,000–140,000**; successful crime adds **+20 heat** (`crimeHeatGain`).
- **Usage:** `!crime` · **Interactive:** yes (crime board buttons).

### `beg` / `slut`
- **File:** `economy/incomeCommands.ts` · **Handler:** `handleIncome` (reads which verb from message content).
- **Does:** Low-risk grind income with randomized flavor messages; Lucky Coin multiplier applies.
- **Key #s:** beg — cd **45s**, winRate **0.70**, payout **8,000–15,000**; slut — cd **120s**, winRate **0.55**, payout **12,000–22,000**.
- **Usage:** `!beg` / `!slut`.

### `jail` / `status`  and  `bail` / `release` / `paybail` / `pay-bail`
- **File:** `economy/jail.ts` · **Handlers:** `handleJail`, `handleBail`.
- **Does:** `jail` shows incarceration status + a **Pay Bail** button (`pay_bail`); `bail` pays the fine.
- **Key #s:** `DEFAULT_JAIL_FINE = 1,000`, `DEFAULT_JAIL_TIME_SECONDS = 600`.
- **Usage:** `!jail`, `!bail` · **Interactive:** yes (Pay Bail button) · **V1 leftover:** `ensureUserAndWallet(id, guildId, tag)`, `payBail(discordId, guildId)`.

### `daily`
- **File:** `economy/daily.ts` · **Handler:** `handleDaily`.
- **Does:** Daily claim; item multipliers (Counterfeit Kit, Crown of Greed, Devil Contract). Emits `social:claim_daily` quest event.
- **Key #s:** amount **100,000**, cooldown **24h**. No income tax.
- **Usage:** `!daily`.

### `weekly`
- **File:** `economy/weekly.ts` · **Handler:** `handleWeekly`.
- **Key #s:** amount **800,000**, cooldown **7d**, **8% income tax** applied (`applyIncomeTax`, shieldable).
- **Usage:** `!weekly`.

### `monthly`
- **File:** `economy/monthly.ts` · **Handler:** `handleMonthly`.
- **Key #s:** amount **4,000,000**, cooldown **30d**, **8% income tax** (shieldable).
- **Usage:** `!monthly`.

### `vote`
- **File:** `economy/vote.ts` · **Handler:** `handleVote`.
- **Does:** Top.gg vote reward (verifies via Top.gg API). Sub: `reminder`/`remind` toggles vote reminders.
- **Key #s:** reward **5,000**, cooldown **12h**. Top.gg bot id `1371816936857669702`.
- **Usage:** `!vote` · `!vote reminder` · **V1 leftover:** `ensureUserAndWallet(id, guild.id, username)`.

### `rob` / `steal`
- **File:** `economy/rob.ts` · **Handler:** `handleRob`.
- **Does:** PvP wallet robbery; many item interactions (Padlock, Thief Gloves, Eclipse Mask, Demonic Vulnerability, Crocodile Hide, Wolf Fang Dagger, Crown of Greed, Soul Ledger).
- **Key #s** (`ROB_CONFIG`): cd **300s**, base success **0.45** (clamped 0.05–0.85), steal **8–20%** of victim wallet, steal cap **250,000**, fail penalty **60,000–120,000**.
- **Usage:** `!rob <@user>`.

### `shop` / `store`  (+ `buy`, `cockstore`/`cock-store`/`cs`)
- **File:** `economy/shop.ts` · **Handler:** `handleShop`.
- **Does:** Category store browser (Components-V2, paginated, select-menu category switch, buy/use buttons; 15-min collector). Categories: **GENERAL, HUNT, JOB, UNI, COCK, COSMETICS**.
- **Subcommands:** `buy <item>` (wallet), `buy card <item>` (credit, with confirm buttons), `sell <item>`, `inv`/`inventory`, and category words `hunt|job|uni|cock|cosmetics`. Router extras: `!buy …` → `handleShop(["buy", …])`; `!cockstore`/`!cs` → `handleShop(["cock"])`.
- **Usage:** `!shop [category|buy <item>|buy card <item>|sell <item>|inv]` · **Interactive:** yes.

### `inventory` / `inv` / `bag` / `items`
- **File:** `economy/inventory.ts` · **Handler:** `handleInventory`.
- **Does:** Inventory viewer (ALL / HUNT / JOB / UNI / COCK categories); buttons for use/craft/list-to-market etc.
- **Usage:** `!inventory [category]` · **Interactive:** yes (buttons, modals).

### `use`
- **File:** `economy/use.ts` · **Handler:** `handleUse`.
- **Does:** Use a consumable/special item; handles targeted items (`use <item> @user`), feed shorthands (`basic/protein/champion` [+amount]), Soul Ledger, cock items.
- **Usage:** `!use <item> [amount] [@user]`.

### `equip`
- **File:** `economy/equip.ts` · **Handler:** `handleEquip`.
- **Does:** Equips weapon/armor/accessory to your chicken (slot-based; shows replaced item).
- **Usage:** `!equip <item>`.

### `iteminfo` / `item-info` / `item`
- **File:** `economy/iteminfo.ts` · **Handler:** `handleItemInfo`.
- **Does:** Item details incl. price + effect description.
- **Usage:** `!iteminfo <item>`.

### `bank`
- **File:** `economy/bank.ts` · **Handler:** exported as `execute` (imported as `handleBank`).
- **Does:** Bank dashboard (Components-V2). Subcommands: `fd <amount> <days>`, `rd <amount> <days>`, `collect`, `investments`/`invest`, `cards`/`card` (cards hub), `loan`/`loans`/`repay` (redirects to Cards — direct loans removed).
- **Key #s:** `fdInterestRate = 10`, `rdInterestRate = 8` (APR). This file also exports `buildBankCardsPayload`/`buildMyCardsPayload` used by card/credit.
- **Usage:** `!bank [fd|rd|collect|investments|cards|loan …]` · **Interactive:** yes.

### `card` / `creditcard` / `credit-card`  and  `mycards` / `my cards` / `my-cards` / `mycard`
- **File:** `economy/card.ts` · **Handlers:** `handleCard`, `handleMyCards`.
- **Does:** Fortuna Card management. `card` default → cards hub (mine or catalog). Subcommands: `issue`, `pay <amount>`, `withdraw <amount>` (cash advance), `upgrade`, `close`. `mycards` = full card dashboard (balance/due/transactions + pay buttons).
- **Usage:** `!card [issue|pay <amt>|withdraw <amt>|upgrade|close]`, `!mycards` · **Interactive:** yes (card dashboard buttons).

### `credit` / `score`
- **File:** `economy/credit.ts` · **Handler:** `handleCredit`.
- **Does:** Credit-score summary (score, best eligible tier, current card) + embeds the My Cards dashboard.
- **Usage:** `!credit`.

### `stock` / `stocks` / `stock-market` / `stockmarket`
- **File:** `economy/stock.ts` · **Handler:** `handleStock`.
- **Does:** Global stock market (Components-V2 with banner). One market all servers; prices tick every 30 min. Subcommands: `buy <symbol> <qty>`, `sell <symbol> <qty>`, `portfolio`/`port`, `news`. Shows risk/volatility labels, forecasts/rumors, DELISTING badges.
- **Usage:** `!stock [buy <sym> <qty>|sell <sym> <qty>|portfolio|news]`.

### `my-stocks` / `mystocks` / `my-stock` / `mystock` / `stock-portfolio`
- **File:** `economy/myStocks.ts` · **Handler:** `handleMyStocks`.
- **Does:** Your holdings with per-position and total P/L.
- **Usage:** `!my-stocks`.

### `market` / `bm` / `black-market` / `blackmarket`
- **File:** `economy/market.ts` · **Handler:** `handleMarket`.
- **Does:** Player-to-player Black Market hub — Browse, Animal Parts, Sell Item (modal), My Listings (5-min collector, Components-V2).
- **Key #s:** fees **5% buyer + 10% seller**, listing expiry **7 days**, **max 5 listings/user**, wallet-only.
- **Usage:** `!market` · **Interactive:** yes (buttons + modal).

### `leaderboard` / `lb` / `top` / `rich`  (+ `lb-wallet`/`lbwallet`/`cashlb`)
- **File:** `economy/leaderboard.ts` · **Handler:** `handleLeaderboard`.
- **Does:** Server leaderboard, default **net worth**; button-switchable. Args: `cash` → wallet board; `work`/`shift`/`employee(s)` → employee board. `!lb-wallet` routes to `handleLeaderboard(["cash"])`.
- **Usage:** `!leaderboard [cash|work]`, `!lb-wallet` · **Interactive:** yes (toggle buttons).

### `profile` / `p` / `me` / `userinfo`
- **File:** `economy/profile.ts` · **Handler:** `handleProfile`.
- **Does:** Full profile with pages: Overview, Wealth, Career, Cosmetics, Education, Relationship (self or mentioned user).
- **Usage:** `!profile [@user]` · **Interactive:** yes (page buttons).

### Real Estate — `economy/properties.ts` (5 commands)
- **`properties` / `realestate` / `estate`** → `propertiesHandler`. Browse buyable properties. Subs: `collect` (collect all rent), `mine` (owned).
- **`buy-property` / `buyproperty` / `buyprop`** → `buyPropertyHandler`. `!buy-property <key>`.
- **`sell-property` / `sellproperty` / `sellprop`** → `sellPropertyHandler`. `!sell-property <key>`.
- **`my-properties` / `myproperties` / `myprops` / `portfolio`** → `myPropertiesHandler`.
- **`collect-rent` / `collectrent` / `rent`** → `collectRentHandler`.
- **Does:** Buy properties → passive rent; collect income. **Interactive:** browse view has buttons.

---

## Module: `games`

### `coinflip`
- **File:** `games/coinflip.ts` · **Handler:** `handleCoinflip` · **Aliases:** none routed (note: `cf` is remapped to **cockfight**, not coinflip — the casino-guide text that says `,cf` for coinflip is inaccurate).
- **Does:** Heads/Tails; can pass choice as arg (`h`/`t`/`head(s)`/`tail(s)`) or use **Heads/Tails buttons**. 2x on win; Lucky Coin / Crown of Greed / Soul Ledger interplay.
- **Key #s:** max bet 500k (default min 10k); casino cd 20 min.
- **Usage:** `!coinflip <amount> [h|t]` · **Interactive:** yes.

### `slots` / `slot`
- **File:** `games/slots.ts` · **Handler:** `handleSlots`.
- **Does:** 3-reel slots, luck-adjusted roll.
- **Key #s** (`SLOTS_PAYOUT_TABLE`): 7️⃣ **20x** (0.5%), 💎 **10x** (1.5%), 🔔 **5x** (4%), grapes/melon **3x** (7%), cherry/banana **2x** (15%). Max bet 750k; cd 25 min.
- **Usage:** `!slots <amount>`.

### `blackjack` / `bj`
- **File:** `games/blackjack.ts` · **Handler:** `handleBlackjack`.
- **Does:** Full blackjack vs dealer with **Hit/Stand buttons**; dealer hits to 17. Blackjack pays **2.5x**, normal win **2x**, push returns bet. Active-game lock; Crown of Greed applied to stake/payout.
- **Key #s:** max bet 1M; cd 30 min.
- **Usage:** `!blackjack <amount>` · **Interactive:** yes.

### `bet` / `roulette` / `roul`  (+ guide: `roulette-guide`/`roul-guide`/`rouletteguide`/`roulguide`)
- **File:** `games/roulette.ts` · **Handlers:** `handleBet`, `handleRouletteMenu`.
- **Does:** Roulette bet by number/color/range/dozen/column. Accepts `!bet <amount> <space>` (and tolerant arg order). Guide command opens the payout menu.
- **Key #s / payouts:** single number **x36**; dozens/columns **x3**; halves/odd-even/colors **x2**. Max bet 1M; cd 30 min.
- **Usage:** `!bet <amount> <space>` (e.g. `red`, `17`, `1-12`).

### `rr` / `russianroulette` / `russian-roulette`
- **File:** `games/russianRoulette.ts` · **Handler:** `handleRussianRoulette`.
- **Does:** Multiplayer lobby game (in-memory per-channel). Subs: `start`/`create <amount>`, `join`, `force`.
- **Key #s:** **2–6 players**, **60s** lobby timer; max bet 750k (`russian_roulette`).
- **Usage:** `!rr start <amount>`, `!rr join`, `!rr force` · **Interactive:** yes (lobby message updates).

### `cockfight` / `cock-fight` / `cf`
- **File:** `games/cockfight.ts` · **Handler:** `handleCockFight`.
- **Does:** Cockfight match with VS/winner images, stat-based combat, side bets, bet window. `cf` alias maps here (via `normalizeCommand`).
- **Key #s:** bet window `cockfightBetSeconds = 60`; max bet 1M; casino cd 45 min.
- **Usage:** `!cockfight <amount>` · **Interactive:** yes (buttons, modals, side-bets).

### `chicken` / `cock`
- **File:** `games/chicken.ts` · **Handler:** `handleChicken`.
- **Does:** Raise/manage fighting chicken. Subs: `name <name>`, `train`, `top`/`leaderboard`, `traits`/`info`; default shows your chicken.
- **Usage:** `!chicken [name <n>|train|top|traits]`.

### `feed`
- **File:** `games/feed.ts` · **Handler:** `handleFeed`.
- **Does:** Feed your chicken/rooster to boost combat stats.
- **Usage:** `!feed`.

### `hunt`
- **File:** `games/hunt.ts` · **Handler:** `handleHunt`.
- **Does:** Hunt animals (requires a rifle from `!shop hunt`); per-rifle cooldown. Sub: `craft` → crafting payload.
- **Errors:** `NO_RIFLE`, `COOLDOWN` (cd from `RIFLE_TIERS[rifle].cooldownSeconds`).
- **Usage:** `!hunt`, `!hunt craft` · **Interactive:** yes (craft buttons).

### `zoo` / `myzoo` / `my-zoo`
- **File:** `games/zoo.ts` · **Handler:** `handleZoo`.
- **Does:** View captured animals; zoo capacity/income by rarity (needs a zoo property). Ignores args.
- **Usage:** `!zoo` · **Interactive:** yes (buttons).

---

## Module: `life`

### `work` / `job` / `myjob`
- **File:** `life/work.ts` · **Handler:** `handleWork`.
- **Does:** Work a shift at your current job (Components-V2); unemployed → prompt to `!jobs`. Builds stress; sector work-events; income taxed 8% (income tax) and subject to card garnishment.
- **Usage:** `!work` · **Interactive:** yes.

### `jobs` / `careers` / `joblist`
- **File:** `life/jobs.ts` · **Handler:** `handleJobs`.
- **Does:** Browse available jobs (by degree/career-tier requirements).
- **Usage:** `!jobs`.

### `apply`
- **File:** `life/apply.ts` · **Handler:** `handleApply`.
- **Does:** Apply to a job by name.
- **Usage:** `!apply <job>`.

### `career` / `mycareer`
- **File:** `life/career.ts` · **Handler:** `handleCareer`.
- **Does:** View career progression / promotion path.
- **Usage:** `!career`.

### `relax` / `chill`
- **File:** `life/relax.ts` · **Handler:** `handleRelax`.
- **Does:** Stress-reduction dashboard with buttons per option (`relax:<owner>:<optionId>`).
- **Key #s** (`RELAX_OPTIONS`): Quick Break 25,000 (-8 job/-8 edu); Gym Session 75,000 (-20/-15); Meditation Retreat 150,000 (-35/-35); Weekend Getaway 350,000 (-75/-60). Stress clamps 0–100.
- **Usage:** `!relax` · **Interactive:** yes.

### `education` / `uni` / `university` / `edu` / `school`  (+ `degrees`/`mydegrees`/`degree`)
- **File:** `life/education.ts` · **Handlers:** `handleEducation`, `handleListDegrees`.
- **Does:** Education dashboard (current program XP bar, scholarship milestones); `degrees` lists earned degrees.
- **Usage:** `!education`, `!degrees` · **V1 leftover:** `getUser(userId, guildId)`.

### `enroll`  (+ `exam`/`finals`)
- **File:** `life/enroll.ts` · **Handlers:** `handleEnroll`, `handleExam`.
- **Does:** Enroll in a degree by name (`args.join(" ")`); `exam` takes the final exam to graduate.
- **Usage:** `!enroll <degree>`, `!exam`.
- **Degree prices** (`DEGREE_PRICES`): High School Diploma 150k, Trade License 300k, BA Fine Arts 900k, BS Computer Science 1.2M, LLB 2.5M, MBBS 4M, LLM 6M, MD/PhD 10M.

### `study`
- **File:** `life/study.ts` · **Handler:** `handleStudy`.
- **Does:** Study current program for XP via a minigame; DB-based cooldown; tester bypass. (Handler signature ignores args — the help's `study classic` variant is not implemented in this file.)
- **Key #:** `DEFAULT_STUDY_COOLDOWN_SECONDS = 300`.
- **Usage:** `!study` · **Interactive:** yes (minigame buttons).

### `dropout`
- **File:** `life/dropout.ts` · **Handler:** `handleDropout`.
- **Does:** Drop out of current program.
- **Usage:** `!dropout`.

### Marriage — `life/marriage.ts` (3 commands)
- **`marry` / `propose`** → `handleMarry`. `!marry <@user>` (proposal flow).
- **`divorce`** → `handleDivorce`. `!divorce`.
- **`family` / `spouse` / `marriage`** → `handleFamily`. Default → dashboard. Subs: `bank`/`account`/`bal`/`vault`, `deposit`/`dep <amt>`, `withdraw`/`with <amt>`, `hug`, `kiss`, `date`, `chaos`, `make love`/`makelove`/`make-love`/`sex`.
- **Key #s** (`MARRIAGE_CONFIG`): cost 0, divorce 0, cooldown 0 (currently free). Joint vault shared savings.
- **Interactive:** yes (dashboard/affection actions).

### `quests` / `quest` / `dailyquest` / `missions` / `daily-quests` / `dailyquests`
- **File:** `life/dailyQuest.ts` · **Handler:** `handleDailyQuest`.
- **Does:** Daily quest board (Components-V2): tasks with difficulty, progress bars, rewards, streak bonus, reroll (first reroll free). Claim/reroll buttons.
- **Usage:** `!quests` · **Interactive:** yes.

---

## Credit card system at a glance (`services/creditCardService.ts` + `economyConfig.CARD_TIERS`)

- **Tiers** (name · req credit score · req career tier · credit limit · weekly interest · weekly spend cap · weekly withdraw cap):
  - **STARTER** — 300 · 0 · 1.5M · 12% · 750k · 250k (min-due floor 75k)
  - **GOLD** — 500 · 2 · 6M · 8% · 3M · 1M (floor 150k)
  - **PLATINUM** — 700 · 3 · 20M · 5% · 10M · 3M (floor 400k)
  - **BLACK** — 850 · 4 · 60M · 3% · 25M · 8M (floor 1M)
  - Minimum due = 12% of statement (or the tier floor, whichever higher). Eligibility needs both score AND career tier.
- **How cards work:** one card per user (`creditCard.userId = discordId`). `issue`/`applyForCardTier`/`upgrade` (needs <50% utilization to upgrade), `close` (zero balance only). Spending via `chargeCardPurchase` (shop "buy card"), cash advance via `withdrawFromCard`, repayment via `payCard` (from **wallet**). Weekly cycle (`getCycleKey`, ~7-day) generates statements and settles them: pay-full **+30** score, pay-minimum **+20**, miss **−45** (repeat miss **−60**); 3 misses → **LOCKED**, 1–2 → **DELINQUENT**. Unpaid balance accrues weekly interest; delinquent/locked cards garnish **25%** of income (`applyGarnishment`). Score clamps **300–850**.

## Career tiers & jobs (from `jobService.ts` + `DEFAULT_JOB_PAYS`)

- **Career tiers 0→4** gate card eligibility. Examples: service (Waiter/Sous Chef, tier 0, no degree); trade (Apprentice→Master Mechanic, tiers 1–2, Trade License); tech (IT Intern→Junior→Senior→Lead Engineer, tiers 1–4, needs BS CS); business (Sales Intern→Analyst→Manager, tiers 1–3); legal (Paralegal→Associate→Partner, tiers 2–4, LLB/LLM); medical (Resident→GP→Surgeon→Chief, tiers 2–4, MBBS + MD/PhD). Pays range 30k (delivery/waiter) up to 450k (Chief of Medicine); each job has `reqDegrees`, `reqXp`, and often a `reqJobId` chain.

## Other economy constants (for the reference)

- Income tax 8% (`weekly`, `monthly`, work); transfer tax 5%. Wallet max `MAX_SAFE_BALANCE = 9,000,000,000,000,000`.
- Tax/heat scanner: crime **+20 heat**, raid threshold 100, 40% auto-raid chance/scan, seizes 10–25% of wallet, heat decays 10/hr, 72h TTL.

## Coverage confirmation

Every non-admin command file is routed and accounted for: **general** (5 files), **economy** (28 command files + `crimeUi.ts` helper), **games** (10 files), **life** (11 files). No dead/unrouted player-facing command files. The `admin/` folder was skipped (developer-only; note `set-prefix` surfaces to users but is physically implemented in `admin/setPrefix.ts`). A few router cases (`jobstore`, `unistore`, `bookstore`, `manage-uni`, `manage-jobstore`, etc.) intentionally reply "store moved to the main shop system" and are not backed by live command files.
