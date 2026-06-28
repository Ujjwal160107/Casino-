# Fortuna V2 Economy Reference

Last updated: 2026-06-21

This file documents the current Fortuna V2 economy values and rules. It is intended as a handoff/reference document for future work, especially when continuing the V1 to V2 migration.

Primary code source of truth:

- `src/utils/economyConfig.ts`

Do not treat this document as a replacement for the code. If values change, update `economyConfig.ts` first, then update this file.

## Economy Model

Fortuna V2 uses a global user economy.

- User identity is `discordId`.
- Wallet, bank, cards, jobs, education, relax, profile, rewards, and games are global per user.
- `guildId` must not be used as part of user economy identity.
- `guildId` is only valid for server prefix, Discord context, and transaction metadata.
- Per-server economy customization has been removed.
- Per-server prefix remains supported through `GuildSettings`.

## Global Catalogs

Shop items, properties, and degrees are **backend-owned** and stored once under sentinel `guildId: "global"`.

- Catalog definitions live in code (`shopCatalog.ts`, `propertyService.ts`, `economyConfig.ts` / `educationService.ts`).
- DB rows are keyed globally via `catalogKey` (shop/degrees) or `key` (properties).
- All guilds share the same catalog; no per-guild shop/property/degree seeding is required.
- Admin mutators (`!shop-add`, `!reset-shop`, `!manage-property`, `!setdegree`) are retired — edit code constants instead.
- Migration script: `npx ts-node src/scripts/migrateGlobalCatalog.ts` (run once before enabling unique indexes on existing DBs).

## Currency

Global currency name:

```text
Fortunes
```

Global currency emoji:

```text
<:fortunes:1503253856992366612>
```

Use shared formatting helpers for money display. Do not hardcode alternate currency names or emojis in new V2 code.

## Safety Limits

Starting wallet balance:

```text
1,000
```

Maximum safe balance:

```text
9,000,000,000,000,000
```

Default jail fine:

```text
1,000
```

Default jail time:

```text
600 seconds
```

Default study cooldown:

```text
300 seconds
```

## Time-Gated Rewards

Daily:

```text
100,000
Cooldown: 24 hours
```

Weekly:

```text
800,000
Cooldown: 7 days
```

Monthly:

```text
4,000,000
Cooldown: 30 days
```

These are global user rewards, not per-server rewards.

## Degrees

Education progression uses **XP only** (GPA is deprecated).

Degree prices (from `DEGREE_PRICES` in `economyConfig.ts`):

| Degree | Cost |
| --- | ---: |
| High School Diploma | 150,000 |
| Trade License | 300,000 |
| BA Fine Arts | 900,000 |
| BS Computer Science | 1,200,000 |
| Bachelor of Laws (LLB) | 2,500,000 |
| MBBS | 4,000,000 |
| Master of Laws (LLM) | 6,000,000 |
| Doctor of Medicine (MD) / Ph.D. | 10,000,000 |

Education should use these constants instead of local hardcoded tuition values.

## Game Bet Limits

From `GAME_BET_LIMITS` in `economyConfig.ts`:

| Setting | Value |
| --- | ---: |
| Default minimum bet | 10,000 |
| Default maximum bet | 1,000,000 |

Per-game maximum bets:

| Game | Max bet |
| --- | ---: |
| coinflip | 500,000 |
| slots | 750,000 |
| blackjack | 1,000,000 |
| roulette | 1,000,000 |
| russian_roulette / rr | 750,000 |
| cockfight / chicken | 1,000,000 |

## Jobs

Default pay per shift:

| Job | Pay |
| --- | ---: |
| Delivery Driver | 30,000 |
| Waiter | 32,000 |
| Freelance Writer | 35,000 |
| Streamer | 35,000 |
| Sous Chef | 45,000 |
| Apprentice Mechanic | 50,000 |
| Master Mechanic | 90,000 |
| Sales Intern | 35,000 |
| Financial Analyst | 120,000 |
| Sales Manager | 180,000 |
| IT Intern | 45,000 |
| Junior Developer | 130,000 |
| Senior Developer | 210,000 |
| Lead Engineer | 280,000 |
| Paralegal | 140,000 |
| Associate Attorney | 260,000 |
| Partner | 400,000 |
| Medical Resident | 150,000 |
| General Practitioner | 220,000 |
| Surgeon | 320,000 |
| Chief of Medicine | 450,000 |

Job requirements should align with degree progression and shared career-tier helpers.

## Side Income

Beg:

```text
Cooldown: 45 seconds
Win rate: 70%
Payout: 8,000 to 15,000
```

Slut / flirt-equivalent:

```text
Cooldown: 120 seconds
Win rate: 55%
Payout: 12,000 to 22,000
```

Crime:

```text
Cooldown: 300 seconds
Win rate: 35%
Success payout: 35,000 to 90,000
Fail fine: 15,000 to 40,000
```

Rob:

```text
Cooldown: 300 seconds
Success rate: 45%
Steal amount: 8% to 20% of victim wallet
Steal cap: 250,000
Fail penalty: 60,000 to 120,000
```

## Relax / Stress Economy

Stress is unified across job and education.

Stress values should be clamped:

```text
0 to 100
```

Relax options:

| Option | Cost | Job Stress Reduction | Education Stress Reduction |
| --- | ---: | ---: | ---: |
| Quick Break | 25,000 | 8 | 8 |
| Gym Session | 75,000 | 20 | 15 |
| Meditation Retreat | 150,000 | 35 | 35 |
| Weekend Getaway | 350,000 | 75 | 60 |

Relax rules:

- Do not charge if both stress values are already 0.
- Do not mutate wallet or stress on insufficient funds.
- Deduct wallet and reduce stress in one transaction.
- Never reduce stress below 0.
- Use universal `!relax`; do not reintroduce study-specific or job-store relax buttons.

## Credit Cards

Credit cards are a V2 lightweight credit system.

Important rules:

- Card payments must not change credit score immediately.
- Credit score changes happen only during scheduler settlement.
- Credit cards must not be usable for casino games.
- Gambling uses wallet only.
- Card close should require zero balance.
- Card upgrade should preserve balance and statement state.
- Minimum due calculation must use shared helpers.

Score rules:

| Event | Score Change |
| --- | ---: |
| Paid minimum on time | +20 |
| Paid full statement | +30 |
| Missed payment | -45 |
| Repeat missed payment | -60 |

Score clamp:

```text
300 to 850
```

Card tiers:

| Tier | Required Score | Required Career Tier | Credit Limit | Weekly Interest | Minimum Due | Weekly Spend Cap | Weekly Withdraw Cap |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Starter | 300 | 0 | 1,500,000 | 12% | max(12%, 75,000) | 750,000 | 250,000 |
| Gold | 500 | 2 | 6,000,000 | 8% | max(12%, 150,000) | 3,000,000 | 1,000,000 |
| Platinum | 700 | 3 | 20,000,000 | 5% | max(12%, 400,000) | 10,000,000 | 3,000,000 |
| Black | 850 | 4 | 60,000,000 | 3% | max(12%, 1,000,000) | 25,000,000 | 8,000,000 |

Card order:

```text
Starter -> Gold -> Platinum -> Black
```

Card image assets:

- `src/assets/starter_card.png`
- `src/assets/gold_card.png`
- `src/assets/platinum_card.png`
- `src/assets/black_card.png`

### Commands

| Command | Purpose |
| --- | --- |
| `!mycards` | Full card dashboard: balance owed, due date, projected minimum, recent activity, pay buttons |
| `!card pay <amount>` | Pay from wallet toward card balance (text fallback) |
| `!card issue` | Issue your first eligible card |
| `!credit` | Credit score summary + My Cards dashboard |
| `!bank` → Cards | Apply, browse tiers, manage card |
| `!shop` → Buy (Credit) | Charge shop purchase to ACTIVE card |

Billing cycle: **7 days**. Due date is set when the card is issued and refreshed each statement. Minimum due = `max(12% of balance, tier floor)` via `calculateMinimumDue()`.

Shop hunt consumables (one use, next hunt): **Camouflage Kit** (Rare+ boost), **Bait Box** (≥2 animals), **Echo Whistle** (35% echo best catch).

## Banking Notes

Current V2 direction:

- Bank is a global user account.
- Cards are accessed through bank UI.
- Users should not explicitly take old-style bank loans.
- Purchases that need credit should use card flows.

Legacy compatibility constants still exist in `BANKING_CONFIG`:

- FD interest rate
- RD interest rate

Old bank loans are **retired**. Card balance is the user's credit debt for net worth.

## Games Economy

Games should use wallet only.

Rules:

- No bank betting.
- No credit card betting.
- No card withdraw shortcut inside games.
- Validate bet amount before mutating wallet.
- Reject invalid, negative, zero, NaN, and unsupported decimal bets.
- Mutate wallet transactionally where possible.
- Log game transactions consistently.

Default global game bet limits:

```text
Minimum bet: 10,000
Maximum bet: 1,000,000
```

Recommended per-game caps:

| Game | Max Bet |
| --- | ---: |
| Coinflip | 500,000 |
| Slots | 750,000 |
| Blackjack | 1,000,000 |
| Roulette | 1,000,000 |
| Russian Roulette | 750,000 |
| Cockfight | 1,000,000 |

Transaction types:

- `game_bet`
- `game_win`
- `game_loss`
- `game_refund`

Transaction metadata should include:

- game name
- bet amount
- payout
- result
- guildId
- channelId
- messageId when available

## Economy Systems Removed From V2

Do not bring these back as independent systems:

- per-server economy config
- custom server currency
- server start money
- server income settings
- server cooldown settings
- casino channel restrictions
- casino admin system
- casino bans
- command permissions
- role income
- chat money
- casino drops
- job store
- university store
- separate stress item stores
- old explicit bank loan flow

## Implementation Guidance

When touching economy code:

- Use `discordId` for user identity.
- Do not include `guildId` in wallet, bank, card, job, education, or profile identity.
- Use `economyConfig.ts` constants.
- Use wallet/card/bank services instead of direct mutations where helpers exist.
- Keep user-facing text natural; do not say "global balance" or "global wallet".
- Use the global Fortunes emoji for money.
- Prefer transaction logs for money movement.
- Keep Discord UI component-first where that flow has already been modernized.

## Known Economy Migration Leftovers

The project still has build/runtime cleanup left in older systems.

Likely remaining V1 leftovers:

- `discordId_guildId`
- `where: { id }` on `User`
- `guildId` on economy records that are now global
- stale relation includes for inventory/shop/market/trade
- old loan or store assumptions

Known areas needing scoped future passes:

- shop
- inventory
- effects/items
- market
- trade
- property
- stock
- marriage
- daily quests
- leaderboard
- old credit/loan display path

## Current Validation Snapshot

As of the latest architecture cleanup:

```text
npx prisma validate
```

Passed.

```text
npx prisma generate
```

Passed.

```text
npm run build
```

Still fails because of remaining V1 identity and stale relation assumptions in older, not-yet-migrated modules.
