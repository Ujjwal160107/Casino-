# Fortuna V2 Economy Reference

Last updated: 2026-10-11 (economy rebalance)

This is the handoff reference for Fortuna's economy: the balance targets, the current values, and the known open issues. Code is the source of truth. When a value changes, change the code first, then this file.

| Area | Source of truth |
| --- | --- |
| Rewards, jobs, beg/slut, rob, tax, cards, relax | `src/utils/economyConfig.ts` |
| Properties (rent, price curve, banking) | `src/services/propertyService.ts` |
| Hunt rifles, animals, zoo tiers, feed | `src/utils/animalCatalog.ts`, `src/services/zooService.ts` |
| Degrees, scholarships | `src/services/educationService.ts` |
| Crime board | `src/data/crimeCatalog.ts`, `src/data/crimeMinigameCatalog.ts` |
| Casino | `src/commands/games/*.ts`, `src/services/shopBuffs.ts` (luck) |
| Stocks | `src/config/stockConfig.ts`, `src/services/stockEngine.ts` |
| Shop prices and item effects | `src/utils/shopCatalog.ts`, `src/services/shopItemEffects.ts` |
| Crime Families | `CRIME_FAMILY_CONFIG` in `src/utils/economyConfig.ts`, `src/data/crimeFamilyCatalog.ts` |

## Balance Targets

Difficulty target: **medium to hard**. Players grind for big items; nothing expensive comes cheap; no loop prints money.

1. **Every asset pays itself back.** Rifles pay back in about 1–2 weeks of hunting, zoos in about 1–3 weeks, and properties in 20–40 days. Bigger assets take longer, but earn more per day in absolute terms.
2. **Grind beats spam.** Structured activities (shifts, hunts, zoo, crime) pay more per action than no-skill spam commands (beg/slut).
3. **No casino game is positive-EV.** Luck may soften the house edge but never flip it.
4. **One-time payouts stay modest.** Finishing a degree returns its tuition plus a margin, not a multiple.
5. **Endgame is long.** Cosmetics from 10M to 1B and the Private Island are months of play.

Progression bands for an engaged player, counting daily check-ins plus active play:

| Stage | Typical assets | Income |
| --- | --- | --- |
| Week 1 | Entry job, Wooden Rifle, Mini Zoo | ~1–1.5M/day |
| Weeks 2–4 | Degree job, Sniper Rifle, City Zoo, Shack/Apartment | ~3–6M/day |
| Month 2+ | Tier 4 job, Legendary Rifle, World Zoo, House/Mansion | ~8–15M/day |

## Economy Model

- Global economy: user identity is `discordId`; wallet, bank, cards, jobs, education, assets are global.
- `guildId` is only for Discord context and transaction metadata. No per-server economy.
- Catalogs (shop, properties, degrees) are code-owned and seeded under `guildId: "global"`. Property rows re-sync name, base price, rent **and current price** whenever properties are seeded (any `properties`/`zoo`/market open after a restart).

## Currency and Limits

| Setting | Value |
| --- | ---: |
| Starting wallet | 1,000 |
| Max safe balance | 9,000,000,000,000,000 |
| Default jail fine / bail | 1,000 |
| Default jail time | 600s |
| Study cooldown / daily cap | 1,800s / 16 sessions |

## Time-Gated Rewards

| Reward | Amount | Cooldown | Taxed |
| --- | ---: | --- | --- |
| Daily | 100,000 | 24h | no |
| Vote | 100,000 | 12h | no |
| Weekly | 800,000 | 7d | 8% |
| Monthly | 4,000,000 | 30d | 8% |
| Daily quests (5 tasks) | 560,000, up to 840,000 with a 7-day streak | 24h | no |

## Jobs

One shift per hour (3,600s cooldown). Pay is taxed 8%. Successful shifts add stress (+5) and wear sector gear by **2–6** durability; a Repair Coupon (300k) restores 100.

| Job | Pay/shift | Job | Pay/shift |
| --- | ---: | --- | ---: |
| Delivery Driver | 50,000 | Junior Developer | 130,000 |
| Waiter | 55,000 | Senior Developer | 210,000 |
| Freelance Writer | 55,000 | Lead Engineer | 280,000 |
| Streamer | 55,000 | Paralegal | 140,000 |
| Sous Chef | 75,000 | Associate Attorney | 260,000 |
| Sales Intern | 65,000 | Partner | 400,000 |
| IT Intern | 70,000 | Medical Resident | 150,000 |
| Apprentice Mechanic | 80,000 | General Practitioner | 220,000 |
| Master Mechanic | 120,000 | Surgeon | 320,000 |
| Financial Analyst | 120,000 | Chief of Medicine | 450,000 |
| Sales Manager | 180,000 | | |

Multipliers: daily-streak bonus up to +50%, reputation tier up to +10%, plus shop buffs. An entry shift now nets about 23k after tax, stress relief and gear wear (it was break-even or negative at 30–35k with 5–12 wear).

## Education

| Degree | Tuition | Scholarships (75% + 100%) | Net on finishing |
| --- | ---: | ---: | ---: |
| High School Diploma | 150,000 | 225,000 | +75,000 |
| Trade License | 300,000 | 450,000 | +150,000 |
| BA Fine Arts | 900,000 | 1,350,000 | +450,000 |
| BS Computer Science | 1,200,000 | 1,800,000 | +600,000 |
| Bachelor of Laws (LLB) | 2,500,000 | 3,750,000 | +1,250,000 |
| MBBS | 4,000,000 | 6,000,000 | +2,000,000 |
| Master of Laws (LLM) | 6,000,000 | 9,000,000 | +3,000,000 |
| MD / Ph.D. | 10,000,000 | 15,000,000 | +5,000,000 |

Scholarships pay **0.5× tuition at 75% XP and 1× at 100%** (`SCHOLARSHIP_TUITION_SHARE`). Each milestone pays once per degree per user, surviving dropout. It used to pay 3.5×, about 62M across all degrees.

## Side Income

| Command | Cooldown | Success | Payout | Fail cost | Max/hour if spammed |
| --- | --- | ---: | --- | --- | ---: |
| Beg | 60s | 70% | 5,000–10,000 | none | ~315k |
| Slut | 120s | 55% | 12,000–22,000 | none | ~280k |

Beg used to be 8,000–15,000 every 45s, about 644k/hour, which out-earned the top job.

**Crime** is a minigame board with a 1h cooldown. Success depends only on answering the stages.

| Tier | Payout | Fine | Jail on failure |
| --- | --- | --- | --- |
| Petty | 50–120k | 25–60k | — |
| Medium | 100–220k | 60–140k | — |
| High | 180–350k | 120–240k | 10%, 20 min |
| Elite | 300–550k | 200–400k | 20%, 45 min |
| Legendary | 500k–1.2M | 350–700k | 35%, 60 min |

**Heat:** decays 10 per hour. At 100+ heat there is a 40% chance each hour of a raid that seizes 10–25% of the wallet.

**Rob:** 1h cooldown, 40% success (±5% from Luck). On success it steals 8–20% of the target's wallet. On failure the fine is max(60k, 1.5× the would-be steal), plus jail.

## Hunting

| Rifle | Price | Cooldown | Rolls | Common / Uncommon / Rare / Legendary |
| --- | ---: | --- | --- | --- |
| Wooden | 500,000 | 8h | 1 | 100 / 0 / 0 / 0 |
| Iron | 1,500,000 | 6h | 1 | 70 / 30 / 0 / 0 |
| Sniper | 4,000,000 | 4h | 1–2 | 55 / 32 / 13 / 0 |
| Legendary | 12,000,000 | 2h | 1–2 | 55 / 32 / 11 / 2 |

Buff caps: Rare 20%, Legendary 5%.

| Rarity | Sell values | Average | Zoo income/day | Feed/day |
| --- | --- | ---: | ---: | ---: |
| Common | Rabbit 20k, Squirrel 16k, Fox 24k, Duck 18k | 19,500 | 4,000 | 1,500 |
| Uncommon | Deer 60k, Boar 65k, Wolf 70k, Eagle 75k | 67,500 | 16,000 | 6,000 |
| Rare | Bear 280k, Leopard 320k, Croc 260k, Python 240k | 275,000 | 60,000 | 22,000 |
| Legendary | Tiger 900k, Komodo 1M, Arctic Wolf 950k, Golden Eagle 850k | 925,000 | 200,000 | 75,000 |

Common sell values were raised from 6–10k, so a Wooden Rifle is worth buying. Every rarity now sells for about 5 days of zoo income.

Expected value from selling everything, hunting the moment each cooldown ends:

| Rifle | Per hunt | Per day (max) | Payback |
| --- | ---: | ---: | ---: |
| Wooden | 19,500 | 58,500 | 8.5 days |
| Iron | 33,900 | 135,600 | 11 days |
| Sniper | 102,100 | 612,700 | 6.5 days |
| Legendary | 121,600 | 1,459,000 | 8.2 days |

## Zoo

Zoos form a single-slot upgrade ladder. Buying a bigger zoo replaces the old one with no refund, and the animals carry over.

Animals earn only when fed. One feed unit lasts 24h, and an animal dies after 72h of hunger. Zoo income is claimed once per 24h.

| Zoo | Price | Species (C/U/R/L) | Animals | Gross/day | Feed/day | Net/day | Payback |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Mini | 800,000 | 3/2/0/0 | 18 | 144,000 | 54,000 | 90,000 | 8.9 days |
| City | 5,000,000 | 4/4/2/0 | 34 | 616,000 | 228,000 | 388,000 | 12.9 days |
| World | 18,000,000 | 4/4/4/2 | 42 | 1,376,000 | 510,000 | 866,000 | 20.8 days |

The World Zoo used to hold 3 rare and 1 legendary species (net 627k), so upgrading from City took 75 days to pay back. It now takes 37.7 days.

## Properties

| Property | Base price | Rent / 24h | Payback |
| --- | ---: | ---: | ---: |
| Shack | 1,800,000 | 90,000 | 20 days |
| Apartment | 5,400,000 | 225,000 | 24 days |
| House | 16,000,000 | 570,000 | 28 days |
| Mansion | 47,000,000 | 1,380,000 | 34 days |
| Private Island | 126,000,000 | 3,150,000 | 40 days |

Rules:
- Rent was 0.67%/day (150-day payback) before this rebalance.
- **Uncollected rent banks for up to 3 days** (`MAX_BANKED_RENT_CYCLES`). Past that, the clock restarts and the extra is lost.
- **Each sale raises a property's price 5%, capped at 1.5× base** (`MAX_PRICE_MULTIPLIER`). Selling pays 75% of the current price.
- Rent shares the daily claim with zoo income in `collect-rent`.

## Casino

| Game | Bets | Cooldown | Return at Luck 50 | Luck range |
| --- | --- | --- | --- | --- |
| Coinflip | 10k–500k | 20m | 98% (49% win, 2×) | 48–50% win: 96–100% |
| Slots | 10k–750k | 25m | 96% | 2× tier ±1.5pp: 93–99% |
| Blackjack | 10k–1M | 30m | ~99.4% | dealer draws nudged ≤4% |
| Roulette | 10k–1M | 30m | 97.3% | none |
| Russian Roulette | 10k–750k | none | 100% (player pot) | none |
| Cockfight | 10k–1M | 45m | 100% duel pot, side bets 1.5× | none |

**Luck** runs 0–100, base 50, and comes from timed item effects. Before this rebalance, slots paid 121% at Luck 75 and 146% at Luck 100, and coinflip reached a 56% win rate.

## Banking, Cards, Stocks

**Bank:** no interest on balance. Fixed Deposits pay 10% a year simple; Recurring Deposits pay an effective 4% a year. Transfers are taxed 5%.

**Cards:**

| Tier | Score | Career tier | Limit | Weekly interest if minimum missed | Spend cap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Starter | 300 | 0 | 1.5M | 12% | 750k/week |
| Gold | 500 | 2 | 6M | 8% | 3M/week |
| Platinum | 700 | 3 | 20M | 5% | 10M/week |
| Black | 850 | 4 | 60M | 3% | 25M/week |

Card notes:
- The minimum due is max(12%, tier floor).
- Paying the minimum on time charges no interest.
- Three misses in a row lock the card.
- A delinquent or locked card garnishes 25% of income.

**Stocks** are a trading game, not an investment:
- Prices tick every 30 min with a negative baseline drift, so buy-and-hold loses.
- Traders who buy on RALLY/BOOM forecasts (65% hit rate) profit, limited by slippage.
- The offline check is `npx ts-node --transpile-only src/scripts/simulateStockMarket.ts`. It shows a naive trader losing about 36% over 12h, and the simulator's own "informed" trader losing about 9%.

## Crime Families

Design: `docs/superpowers/specs/2026-10-28-crime-families-heists-design.md`. Shipped behind `CRIME_FAMILY_CONFIG.enabled` (off by default); Turf (rackets, bids and wars) also needs `CRIME_FAMILY_CONFIG.turfEnabled` (off by default). Families are global per `discordId`; a player is in at most one.

- **Founding** burns 10,000,000 from the wallet. Gates: net worth ≥ 15M (uncached), ≥ 60 lifetime shifts, Fortuna age ≥ 30 days, Discord age ≥ 180 days, heat < 70, not jailed or banned, hop cooldown clear, 7 days after disbanding as Boss.
- **Joining** needs net worth ≥ 1M, ≥ 20 shifts, Fortuna ≥ 14 days, Discord ≥ 90 days, not jailed or banned. Invite caps: 5 pending per family, 3 accepted per inviter and 5 joins per family per rolling 7 days.
- **Vault:** `treasury` (deposits, locked forever, burned on disband) and `earnings` (crew heist vault cut, racket income, refunded bids). Spends take earnings first. Deposits: wallet only, min 10,000, cap 25,000,000 per member per UTC day, 5% tax burned inline (never `applyTransferTax`), 0 XP.
- **Dues:** 40,000 × level per UTC day from the vault. A missed day adds a day of arrears, which blocks level-ups and bids until a deposit or earnings credit clears it.
- **Payday** (the only vault exit): every 7 days, earnings ≥ 500,000, Boss or Underboss (auto 24 h after due). Eligible: 7 days of tenure, an active member (≥ 2 started crew heist seats or ≥ 3 correct war hits in 7 days), ≥ 20 shifts, Discord ≥ 90 days, Fortuna ≥ 14 days. `gross = min(floor(E / N), 1,000,000)`, 5% tax burned, so at most 950,000 net per member per week.
- **Disband** burns treasury and earnings after a capped final payday (only if the last payday was ≥ 7 days ago).
- The vault is excluded from net worth and every leaderboard.

**Family levels** (XP cumulative and never spent; the fee comes from the vault, earnings first, and is burned; fees L2 → L10 total 172,000,000; no level grants a money multiplier):

| Level | XP to reach | Fee | Member cap | Racket cap | Tier unlocked | Family crew heist cooldown | Crest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | — | 6 | 1 | T1 | 3h00 | `cf_crest_1` bronze |
| 2 | 1,000 | 2,000,000 | 7 | 1 | — | 3h00 | `cf_crest_1` |
| 3 | 3,000 | 4,000,000 | 8 | 1 | T2 | 3h00 | `cf_crest_1` |
| 4 | 6,000 | 6,000,000 | 8 | 2 | — | 2h45 | `cf_crest_2` silver |
| 5 | 10,000 | 10,000,000 | 10 | 2 | T3 | 2h45 | `cf_crest_2` |
| 6 | 16,000 | 14,000,000 | 10 | 2 | — | 2h30 | `cf_crest_2` |
| 7 | 24,000 | 20,000,000 | 12 | 3 | — | 2h30 | `cf_crest_3` gold |
| 8 | 34,000 | 28,000,000 | 12 | 3 | T4 | 2h30 | `cf_crest_3` |
| 9 | 46,000 | 38,000,000 | 12 | 3 | — | 2h00 | `cf_crest_3` |
| 10 | 60,000 | 50,000,000 | 12 | 3 | — | 2h00 | `cf_crest_4` crowned gold |

**XP sources:**

| Source | XP |
| --- | --- |
| Crew heist Clean / Messy / Bust | T1 150/60/20, T2 225/90/30, T3 300/120/40, T4 375/150/50 |
| Racket cycle minted | 20 per cycle (none on a neglected cycle) |
| Correct war hit | 5 to the hitter's family |
| War won | capture 300 / 450 / 600 (Corner / District / Crown, 300 × 1 / 1.5 / 2); defence the same, only if the attacker scored ≥ 1 correct hit on ≥ 2 blocks |
| Deposits, payday, scouting | 0 |

**XP pacing** (p = 0.90, edge 0.10, full roster passing each tier's gates, 4 crew heists a day: T1 n=4 at L1–2, T2 n=5 at L3–4, T3 n=6 at L5–7, T4 n=6 at L8+; XP/day ≈ 447 / 634 / 788 / 964; vault EV/day 403,076 / 746,908 / 1,280,528 / 1,763,036 before dues; no rackets, no payday). A level needs both XP and fee, so the fee sets the pace:

| Level reached | By XP alone (day) | Member deposits needed to keep the XP pace (cumulative) | With no deposits (day) |
| --- | --- | --- | --- |
| L3 (T2) | 7 | 3.6M | 18 |
| L5 (T3) | 18 | 13.0M | 45 |
| L8 (T4) | 49 | 42.9M | 105 |
| L10 | 76 | 92.5M | 167 |

**Daily income per member by band** (p = 0.90, edge 0.10; payday is a range because earnings either pay level fees or go out as Payday, never both; share is of the band floor):

| Band | Band income/day | Reachable tiers | Assumed family | Crew heist net/day (2 seats) | Payday net/day | Feature total/day | Share of band floor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Week 1 | 1–1.5M | none (14-day Fortuna gate) | — | 0 | 0 | 0 | 0% |
| Weeks 2–4 | 3–6M | T1 only | L3, 8 members, 4 T1 crew heists/day (n=4), 1 Corner racket | 287,386 | 0 – 69,240 | 287,386 – 356,626 | 9.6–11.9% |
| Month 2+ | 8–15M | T3, T4 | L8, 12 members passing the T4 seat gates, 4 T4 crew heists/day (n=6), 1 District + 1 Crown held | 487,836 (T3) – 551,584 (T4) | 0 – 135,714 (cap) | 487,836 – 687,298 | 6.1–8.6% |
| Any band, perfect play | — | T4 | as above, p = 1.0, best gear | 1,049,600 | 135,714 | 1,185,314 | 14.8% of the Month 2+ floor |

**Crew Heists** (`!heist`, aliases `!crewheist`, `!caper`, `!capers`, `/heist`; "caper" in code; spec section 8). A Capo+ plans a tier; a 600 s lobby fills role seats (each seat pays its stake on join, refunded on leave, cancel or VOID); Start re-validates every seat (the net-worth check counts the stake already paid) and burns the stakes; a 120 s GO follows in which each seat answers one 4-option call whose answer only the next seat in the ring holds. A seat that has not opened its brief before the last 30 s is dark: it is a miss and its partner sees the answer leaked. Misses `k` (wrong, unlocked or dark): BUST at `k ≥ 2` (n ≤ 4) or `k ≥ 3` (n ≥ 5), MESSY at `k ≥ 1`, else MESSY if `roll < q` and CLEAN otherwise, with `q = min(0.60, base × (1 − edge) + 0.002 × H)`, edge = mean best prep bonus over the seats, H = hottest seat's heat at Start, the roll drawn once at settlement. No buff, luck or `applyIncomeModifiers` touches crew heist money and no income tax applies (the fence replaces it). Limits: 2 started seats per player and 4 started crew heists per family per rolling 24 h; 1 live seat and 1 live crew heist; family cooldown from Start 3h00 (L1–3), 2h45 (L4–5), 2h30 (L6–8), 2h00 (L9–10); 30 min after a cancelled or expired lobby. Prep items are checked, never consumed.

| | T1 | T2 | T3 | T4 |
| --- | --- | --- | --- | --- |
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
| Patrol base | 0.10 | 0.15 | 0.20 | 0.25 |
| Seat gate: lifetime shifts | ≥ 20 | ≥ 60 | ≥ 150 | ≥ 300 |
| Seat gate: Fortuna age | ≥ 14 d | ≥ 30 d | ≥ 30 d | ≥ 45 d |
| Seat gate: net worth (uncached) | ≥ 2,000,000 | ≥ 8,000,000 | ≥ 20,000,000 | ≥ 40,000,000 |
| Seat gate: Discord age / family tenure | ≥ 90 d / ≥ 72 h | same | same | same |
| Family XP Clean / Messy / Bust | 150 / 60 / 20 | 225 / 90 / 30 | 300 / 120 / 40 | 375 / 150 / 50 |

**Crew heist payout.** `pool = B × n × fPct / 100` (CLEAN 100, MESSY 35, BUST 0; n = seats at Start); `crewShare = floor(pool × 80 / 100)` minted to wallets as `caper_cut` (earned, so garnishment applies); `vaultCut = floor(pool × 10 / 100)` minted to earnings; the last 10% is the fence (N1), never minted. Every seat weighs 1.00: `cut = floor(crewShare / n)` for each seat that locked a choice, 0 for an unlocked or dark seat; that share and the rounding remainder (N2) are never minted. A Bust fines every seat (`caper_fine`, wallet then bank, may go into debt) and rolls jail per seat; every seat takes the outcome's heat. Exact cuts (every seat locked):

| Tier | n | Pool (Clean) | Crew share | Vault cut | Cut, Clean | Pool (Messy) | Vault cut, Messy | Cut, Messy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 3 | 1,050,000 | 840,000 | 105,000 | 280,000 | 367,500 | 36,750 | 98,000 |
| T1 | 4 | 1,400,000 | 1,120,000 | 140,000 | 280,000 | 490,000 | 49,000 | 98,000 |
| T2 | 4 | 2,200,000 | 1,760,000 | 220,000 | 440,000 | 770,000 | 77,000 | 154,000 |
| T2 | 5 | 2,750,000 | 2,200,000 | 275,000 | 440,000 | 962,500 | 96,250 | 154,000 |
| T3 | 5 | 4,250,000 | 3,400,000 | 425,000 | 680,000 | 1,487,500 | 148,750 | 238,000 |
| T3 | 6 | 5,100,000 | 4,080,000 | 510,000 | 680,000 | 1,785,000 | 178,500 | 238,000 |
| T4 | 5 | 6,000,000 | 4,800,000 | 600,000 | 960,000 | 2,100,000 | 210,000 | 336,000 |
| T4 | 6 | 7,200,000 | 5,760,000 | 720,000 | 960,000 | 2,520,000 | 252,000 | 336,000 |

**Crew heist expected value per seat** (edge 0.10, heat 0, every seat locks; net = gross cut − stake − expected fine; pinned by `test/crimeFamily/caper-math.test.ts`). Realistic play, per-step pass rate p = 0.90:

| Tier | n | P(Clean) | P(Messy) | P(Bust) | Gross EV/seat | Stake | E[fine] | Net/crew heist | Net/day (2 seats) | Vault EV/crew heist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 3 | 66.34% | 30.86% | 2.80% | 215,993 | 50,000 | 4,200 | 161,793 | 323,586 | 80,997 |
| T1 | 4 | 59.71% | 35.06% | 5.23% | 201,538 | 50,000 | 7,845 | 143,693 | 287,386 | 100,769 |
| T2 | 4 | 56.75% | 38.02% | 5.23% | 308,258 | 100,000 | 15,690 | 192,568 | 385,137 | 154,129 |
| T2 | 5 | 51.08% | 48.07% | 0.86% | 298,763 | 100,000 | 2,568 | 196,195 | 392,390 | 186,727 |
| T3 | 5 | 48.42% | 50.72% | 0.86% | 449,980 | 175,000 | 4,280 | 270,700 | 541,400 | 281,237 |
| T3 | 6 | 43.58% | 54.84% | 1.58% | 426,843 | 175,000 | 7,925 | 243,918 | 487,836 | 320,132 |
| T4 | 5 | 45.76% | 53.38% | 0.86% | 618,685 | 300,000 | 6,420 | 312,265 | 624,530 | 386,678 |
| T4 | 6 | 41.19% | 57.23% | 1.58% | 587,679 | 300,000 | 11,887 | 275,792 | 551,584 | 440,759 |

Strong crew, p = 0.95, net per crew heist (per day): T1 n=4 179,422 (358,844); T2 n=5 244,900 (489,800); T3 n=6 327,781 (655,562); T4 n=6 389,069 (778,138).

Perfect play, p = 1.0 (only the patrol roll):

| Tier | Edge 0.10: P(Clean) | Net/crew heist | Net/day | Worst case, best gear: net/day (n, edge) | Mint per crew heist (crew + vault), max crew, best gear |
| --- | --- | --- | --- | --- | --- |
| T1 | 91.0% | 213,620 | 427,240 | 428,453 (n=3, 0.1333) | 1,188,747 (n=4, 0.13) |
| T2 | 86.5% | 301,390 | 602,780 | 605,526 (n=5, 0.132) | 2,265,541 (n=5, 0.132) |
| T3 | 82.0% | 425,440 | 850,880 | 856,773 (n=6, 0.1333) | 4,072,860 (n=6, 0.1333) |
| T4 | 77.5% | 519,600 | 1,039,200 | 1,049,600 (n=6, 0.1333) | 5,567,400 (n=6, 0.1333) |

Every seat is paid the same, so the perfect-play figure is also the planner's ceiling (1,049,600/day at T4). A realistic T4 seat pair (551,584/day) sits below a World Zoo (866,000/day net); perfect T4 play is about a Legendary Rifle (1,459,000/day) minus a third; a T1 seat (287,386/day) is about a City Zoo (388,000) minus a quarter.

**Turf** (`!turf`, aliases `!racket` / `!rackets`, `/turf`; spec section 9; `RACKETS`, `RACKET_CLASSES`, `WAR_BLOCKS`, `WAR_RULES` in `src/data/crimeFamilyCatalog.ts`, math in `src/services/crimeFamily/warMath.ts`). Ten fixed rackets, all starting with the Street (`ownerFamilyId ""`); the only way to take one is to win its weekly war.

| # | Key | Name | Class | Income / 24 h cycle | Bid floor (7 × income) | Baseline defence per block | Weekly war start (UTC) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | docks_numbers | Dockside Numbers | Corner | 300,000 | 2,100,000 | 30 | Mon 18:00 |
| 2 | laundromat_front | Laundromat Front | Corner | 300,000 | 2,100,000 | 30 | Tue 12:00 |
| 3 | harbor_customs | Harbor Customs Skim | District | 650,000 | 4,550,000 | 50 | Tue 18:00 |
| 4 | neon_strip | Neon Strip Clubs | District | 650,000 | 4,550,000 | 50 | Wed 01:00 |
| 5 | valet_racket | Valet Parking Racket | Corner | 300,000 | 2,100,000 | 30 | Wed 18:00 |
| 6 | pawn_row | Pawn Row Fencing | Corner | 300,000 | 2,100,000 | 30 | Thu 01:00 |
| 7 | union_kickbacks | Construction Union Kickbacks | District | 650,000 | 4,550,000 | 50 | Thu 18:00 |
| 8 | racetrack_book | Racetrack Bookmaking | District | 650,000 | 4,550,000 | 50 | Fri 12:00 |
| 9 | casino_row | Casino Row Protection | Crown | 1,300,000 | 9,100,000 | 80 | Sat 18:00 |
| 10 | city_hall | City Hall Contracts | Crown | 1,300,000 | 9,100,000 | 80 | Sun 12:00 |

Total racket income (source S3): at most 6,400,000 per day (44,800,000 per week) bot-wide, fixed whatever the player count; neglect only lowers it. Class level to bid: Corner any, District L4+, Crown L7+.

- **Income:** no manual collection. `tickRackets` (`5 * * * *` UTC) pays `rentCyclesDue(lastPayoutAt, now, 24)` cycles (at most 3 banked, `MAX_BANKED_RENT_CYCLES`) into the owner's `earnings` as `racket_income`, +20 XP per cycle, and retries dues arrears. Needs ≥ 3 racket-eligible members (tenure ≥ 72 h, ≥ 20 shifts, Discord ≥ 90 d, not banned, active member; jail does not block). Fewer: nothing minted (N3), `neglectStrikes += cycles`; at 3 strikes the racket returns to the Street. Capture sets `lastPayoutAt = now`, so the old owner's partial cycle is never minted.
- **Bidding:** window opens 72 h and closes 1 h before the war start. Boss or Underboss, not jailed, from earnings only (`spendFromVault(..., { earningsOnly: true })`), held in escrow on the War row. First bid ≥ floor; raise ≥ `max(ceil(top × 1.10), top + 100,000)` (9,100,000 → 10,010,000 → 11,011,000). Outbid escrow returns to earnings (`bid_refund`, T3). Refused: own racket, already top bidder, below the class level, dues in arrears, Under investigation, no home channel, held rackets + live bids/attacks + 1 > racket cap (1 / 2 / 3 at L1–3 / L4–6 / L7–10), a second Crown held or bid, or the 14-day pair rule (shared Boss, or ≥ 2 current members who left the other family). At close: a bid arms the war and the escrow is burned at settlement whatever the result (`war_bid_burn`, K9); no bid cancels it and the owner keeps the racket.
- **War:** 60 minutes; blocks Docks (Crane, Warehouse, Pier 4, Boathouse), Main Street (Bank Steps, Diner, Bus Stop, Hotel Lobby), Back Alleys (Fire Escape, Dumpster Row, Cellar Door, Laundry Line). Fighters: members of either side in their home guild passing the `war` gate (tenure ≥ 72 h, Discord ≥ 90 d, Fortuna ≥ 14 d, ≥ 20 shifts, not jailed or banned, heat < 100). 12 slots of 300 s; weak point `HMAC_SHA256(seed, block:slot)[0] mod 4`. Scout: free, once per member per slot, one random block. Hit: 25,000 from the wallet, burned (`turf_hit`, K10), 600 s cooldown, ≤ 6 per member per war, 20 s to call (`min(now + 20 s, endsAt)`), judged against the arm-time slot; correct +10 attacking, +12 defending, otherwise 0. Defender (family or Street) starts each block at the class baseline 30 / 50 / 80; the Street never hits. Blackout: the last 600 s hide block scores and show hit counts. Each block to the higher score, ties to the defender; 2 of 3 wins. XP: capture 300 / 450 / 600; defence the same only if the attacker scored on ≥ 2 blocks; +5 per correct hit. +15 heat to every attacking hitter on a loss. No money moves between families.
- **Downtime cancel:** a war that would go ACTIVE more than 600 s after its start, or whose largest tick gap exceeds 600 s, is CANCELLED: the escrow returns to earnings, no ownership change, XP or heat.
- **Edges:** a capture by a family already at its racket cap releases the racket to the Street (bid still burned). Disband refunds live top bids to earnings (then burned with the vault) and releases every racket; disband is refused while a war is ARMED, ACTIVE or SETTLING, and kicks while one is ACTIVE.

**Source and sink ledger:**

| # | Flow | Kind | Amount | Bound |
| --- | --- | --- | --- | --- |
| S1 | Crew heist crew cut | mint → wallets | 0.80 × B × n × f | 2 seats/player/rolling 24 h; 4 crew heists/family/rolling 24 h |
| S2 | Crew heist vault cut | mint → earnings | 0.10 × B × n × f | same |
| S3 | Racket income | mint → earnings | 300k / 650k / 1.3M per cycle | 6,400,000/day bot-wide; needs ≥ 3 eligible members |
| T1 | Payday | earnings → wallets | gross ≤ 1,000,000 per member per week | once per 7 days; equal split |
| T2 | Stake refund (before Start, cancel, VOID) | return, `earned = false` | 50k–300k | — |
| T3 | Bid refund on outbid or a cancelled war | return to earnings | escrow | — |
| T4 | Deposit | wallet → treasury (locked) | ≥ 10,000 | 25,000,000/member/UTC day |
| K1 | Creation fee | sink | 10,000,000 | per family |
| K2 | Rename | sink | 2,000,000 | per 30 days |
| K3 | Level-up fees | sink | 2M → 50M (172M total) | per level |
| K4 | Daily dues | sink | 40,000 × level/day | — |
| K5 | Crew heist stake | sink | 50k / 100k / 175k / 300k per seat per run | every started run |
| K6 | Bust fine | sink | 150k / 300k / 500k / 750k per seat | 0.9–5.2% of runs at p = 0.90 |
| K7 | Deposit tax | sink | 5% | — |
| K8 | Payday tax | sink | 5% | — |
| K9 | Winning war bid | sink, burned at settlement | ≥ 2.1M / 4.55M / 9.1M | per racket-week |
| K10 | War hits | sink | 25,000 each | ≤ 6 per member per war |
| K11 | Treasury and earnings on disband | sink | full balance after the capped final payday | — |
| — | Heat → Fixer and raids | not counted | existing code, unchanged | — |
| N1 | Fence | never minted | 0.10 × pool | — |
| N2 | Cut rounding remainder | never minted | < n Fortunes per crew heist | — |
| N3 | Neglected racket cycles | never minted | full cycle | — |
| N4 | Wallet overflow on a crew heist cut | never minted | excess over `MAX_SAFE_BALANCE` | recorded in `meta.capped` |

## Money Sinks

- Income tax: 8% on shifts, weekly and monthly.
- Transfer tax: 5%.
- Market fees: seller 10%, buyer 5%. Shop quick-sell pays about 47.5%.
- Relax: 25k–350k.
- Zoo feed.
- Crime fines and raids.
- Casino house edge.
- Card interest on missed payments.
- Property resale at 75%.
- Crime Families: creation fee 10,000,000 (K1), rename 2,000,000 per 30 days (K2), level-up fees 2M → 50M, 172M in all (K3), dues 40,000 × level a day (K4), crew heist stakes 50,000 / 100,000 / 175,000 / 300,000 per seat per started run (K5), Bust fines 150,000 / 300,000 / 500,000 / 750,000 per seat (K6), 5% deposit tax (K7), 5% payday tax (K8), the winning war bid, at least 2,100,000 / 4,550,000 / 9,100,000, burned at settlement (K9), war hits 25,000 each, up to 6 per member per war (K10), treasury and earnings burned on disband (K11). Never minted: the 10% crew heist fence (N1), the cut rounding remainder (N2) and neglected racket cycles (N3).

## Open Issues (not changed in the 2026-10-11 rebalance)

Shop items were deliberately left untouched. Recommended follow-ups:

| Issue | Where | Why it matters |
| --- | --- | --- |
| Counterfeit Kit (50k, ×1.25 next income) has no use cooldown | `shopItemEffects.ts` `BUFF_ITEM_COOLDOWN_SECONDS` | +1M on a monthly claim, +112k on a top shift; stacks with Crown of Greed ×1.25 and Lucky Tie |
| Lucky Tie says "event odds" but gives +10% pay on every shift for 24h | `lifeInteractionHandler.ts` | Description mismatch |
| Hunter's Compass use message says +8% Rare/+4% Legendary; code gives +6%/+1% | `shopItemEffects.ts` | Description mismatch |
| Tax Shield claims to block market fees; market never checks it | `marketService.ts` | Description mismatch |
| Lucky Coin ×1.5 on the next game payout | `shopBuffs.ts` | A max coinflip with it returns 147% for a 75k item (6h cooldown) |
| Crime questions are a fixed pool | `crimeMinigameCatalog.ts` | Memorized answers turn crime into ~1M/hour of fixed income at legendary tier |
| Net worth counts items at 100% of shop price | `netWorthService.ts` | Overstates liquid value about 2×, including unsellable card-exclusives |
| Hunt buffs add Rare/Legendary odds on rifles whose base is 0 | `animalCatalog.ts` `applyHuntBuffs` | A Camouflage Kit gives a Wooden Rifle 8% Rare / 2% Legendary, contradicting "Commons only" |
| Fresh catches arrive fed for 24h | `huntService.ts` | First zoo day is free; minor |
| Golden Eagle Crown (zoo ×1.1, 7 days) costs ~8M for ~0.7–1M of income | `huntCraftService.ts` | Strictly negative craft |

## Removed From V2 (do not reintroduce)

- Per-server economy, currency, start money, income, cooldowns.
- Casino channel restrictions, casino admins, casino bans, command permissions.
- Role income, chat money, casino drops.
- Job store, university store, separate stress stores.
- Explicit bank loans.

## Implementation Rules

- User identity is `discordId`; never key economy data by `guildId`.
- Use the config constants above, not local literals.
- Money moves through wallet/card/bank services with transaction logs.
- One-time claims use `cooldownClaim` or a conditional CAS.
- Debits are guarded (`balance: { gte }`).
- Games use the wallet only: no bank or card betting. Validate the bet before mutating the wallet.
