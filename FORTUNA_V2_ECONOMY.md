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
