# 🎰 Fortuna (Casino-) — Complete Project Context for AI Agents

> **Purpose of this document:** This file provides a comprehensive, file-by-file explanation of the entire Fortuna Discord Economy Bot codebase. It is designed so that any AI coding assistant can understand the full project architecture, data flow, and every file's role in a single read-through. Treat this as the canonical reference for the project.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Environment Variables](#4-environment-variables)
5. [Root-Level Files](#5-root-level-files)
6. [Database Layer (Prisma + MongoDB)](#6-database-layer-prisma--mongodb)
7. [Bot Source Code (`src/`)](#7-bot-source-code-src)
   - [Entry Point & Core Orchestration](#71-entry-point--core-orchestration)
   - [Command Router](#72-command-router)
   - [Commands](#73-commands)
   - [Handlers (Interaction Handlers)](#74-handlers-interaction-handlers)
   - [Services (Business Logic)](#75-services-business-logic)
   - [Listeners (Event-Driven Features)](#76-listeners-event-driven-features)
   - [Utilities](#77-utilities)
   - [Configuration](#78-configuration)
   - [Scripts](#79-scripts)
   - [Assets](#710-assets)
8. [Web Dashboard (`dashboard/`)](#8-web-dashboard-dashboard)
9. [Deployment & CI/CD (`deploy/` + `.github/`)](#9-deployment--cicd-deploy--github)
10. [Auxiliary Files](#10-auxiliary-files)
11. [Data Flow Walkthrough](#11-data-flow-walkthrough)
12. [Key Design Patterns](#12-key-design-patterns)

---

## 1. Project Overview

**Fortuna** (repo name: `Casino-`) is a feature-rich **Discord Economy & Casino Bot** built with **Node.js/TypeScript**. It provides a full virtual economy system for Discord servers, including:

- **Virtual Currency** — per-guild wallets, banks, deposits, withdrawals, transfers
- **Casino Games** — Roulette, Blackjack, Coinflip, Slots, Russian Roulette, Cockfighting
- **Income System** — Work, Beg, Crime, Daily/Weekly/Monthly rewards, Chat Money, Role-based Income
- **Banking System** — Loans, Fixed Deposits (FD), Recurring Deposits (RD), Credit Scores
- **Stock Market** — Virtual stocks with fluctuating prices, buy/sell/portfolio tracking
- **Real Estate** — Properties with passive rent income
- **Life Simulation (BitLife-style)** — Education (university enrollment, semesters, GPA, degrees), Jobs (career paths with promotions), Marriage system, Daily Quests
- **Shop & Inventory** — Admin-configurable shops, consumables, equipment, buffs
- **Black Market** — Player-to-player item trading marketplace
- **Cockfighting** — Pet chickens with stats (STR/DEF/AGI), leveling, equipment, PvP battles
- **Admin Panel** — Extensive per-guild configuration, permissions, bans, setup wizard
- **Casino Drops** — Automated/scheduled currency drops in channels
- **Web Dashboard** — Next.js web app at `fortunabot.dev` for server management
- **Mascot System** — "Lady Fortuna" mascot with custom Discord emotes for all UI embeds

The bot is **multi-guild** — each Discord server has its own independent economy, configuration, and user data.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 with TypeScript (ES2020 target, CommonJS modules) |
| **Discord Library** | discord.js v14.25+ |
| **Database** | MongoDB Atlas (via Prisma ORM v5.22) |
| **Caching** | Redis (ioredis v5.9) — for cooldowns, guild config caching |
| **AI Integration** | Google Gemini API (`@google/generative-ai`) — used for the `!ask` command |
| **Image Generation** | Canvas (`canvas` v3.2) — for cockfight battle images and profiles |
| **Web Scraping** | Puppeteer v24 — for review scraping scripts |
| **Task Scheduling** | node-cron v4 — for periodic jobs (loans, investments, drops) |
| **Dashboard** | Next.js 16 + React 19 + Tailwind CSS v4 + Framer Motion |
| **Auth (Dashboard)** | NextAuth v4 with Discord OAuth |
| **Process Manager** | PM2 (ecosystem.config.js) |
| **Deployment** | DigitalOcean VPS, Nginx reverse proxy, GitHub Actions CI/CD |
| **Domain** | fortunabot.dev |

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Discord Servers                          │
│  Users send messages (!command) or interact with buttons/menus  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      src/index.ts                               │
│  Discord.js Client (GatewayIntentBits: Guilds, GuildMessages,   │
│  MessageContent, GuildMembers)                                  │
│                                                                 │
│  Events:                                                        │
│  ├── ready → Prisma connect, init emoji registry, start         │
│  │           listeners, init scheduler, register slash cmds     │
│  ├── messageCreate → prefix check → routeMessage()              │
│  └── interactionCreate → route to specific handler by customId  │
└──────────┬───────────────────────────┬──────────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐    ┌─────────────────────────────┐
│  commandRouter.ts   │    │     Interaction Handlers     │
│  (prefix commands)  │    │  (button/select/modal flows) │
│  ~900 lines switch  │    │  bankInteractionHandler.ts   │
│  statement mapping   │    │  marketInteractionHandler.ts │
│  100+ commands       │    │  lifeInteractionHandler.ts   │
│                     │    │  askInteractionHandler.ts    │
│                     │    │  setupHandler.ts             │
│                     │    │  jailInteractionHandler.ts   │
│                     │    │  inventoryInteractionHandler  │
└────────┬────────────┘    └──────────────┬──────────────┘
         │                                │
         ▼                                ▼
┌─────────────────────────────────────────────────────────┐
│                    Services Layer                        │
│  walletService, bankService, bankingService,            │
│  shopService, marketService, stockService,              │
│  jobService, educationService, propertyService,         │
│  effectService, jailService, questService,              │
│  casinoDropService, roleIncomeService, ...              │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Data Layer                                   │
│  ┌──────────────┐  ┌───────────────┐                     │
│  │ Prisma ORM   │  │ Redis Cache   │                     │
│  │ (MongoDB)    │  │ (ioredis)     │                     │
│  │              │  │               │                     │
│  │ 25+ Models   │  │ Cooldowns     │                     │
│  │ Users,Wallets│  │ Guild configs │                     │
│  │ Banks,Bets   │  │ Session data  │                     │
│  │ Stocks,Jobs  │  │               │                     │
│  └──────────────┘  └───────────────┘                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Scheduler (node-cron) — src/scheduler.ts                │
│  • Every minute: process investments, loans, drops,      │
│    auto role income, vote reminders, temp role cleanup    │
│  • Every hour: guild cleanup (soft-deleted guilds)       │
│  • Interval: stock market price updates (60s)            │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Web Dashboard (dashboard/)                              │
│  Next.js 16 + Tailwind CSS + NextAuth (Discord OAuth)    │
│  • Landing page (fortunabot.dev)                         │
│  • Docs & commands reference                             │
│  • Per-guild admin dashboard                             │
│  • Shared Prisma schema with the bot                     │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Environment Variables

Defined in `.env` (root) — **DO NOT COMMIT** (listed in .gitignore):

| Variable | Purpose |
|----------|---------|
| `DISCORD_TOKEN` | Bot authentication token |
| `CLIENT_ID` | Discord application/client ID |
| `DATABASE_URL` | MongoDB Atlas connection string (Prisma) |
| `EMOJI_GUILD_ID` | ID of the Discord server used to store custom emojis |
| `GEMINI_API_KEY` | Google Gemini API key for the `!ask` AI command |
| `TOPGG_TOKEN` | Top.gg API token for vote verification |
| `REDIS_URL` | Redis connection URL (defaults to `redis://127.0.0.1:6379`) |

The dashboard has its own `.env` in `dashboard/.env` with additional variables for NextAuth.

---

## 5. Root-Level Files

| File | Purpose |
|------|---------|
| `package.json` | Bot dependencies and npm scripts. Key scripts: `dev` (ts-node-dev), `build` (tsc + copy assets), `start` (node dist/index.js) |
| `tsconfig.json` | TypeScript config — target ES2020, CommonJS module, rootDir=src, outDir=dist, strict mode, sourceMap |
| `prisma.config.ts` | Prisma configuration for code generation path |
| `ecosystem.config.js` | **PM2 process manager config** — runs two processes: `casino-bot` (dist/index.js, 1.5GB max memory) and `casino-dashboard` (Next.js on port 3000) |
| `Procfile` | Heroku-style process declaration: `worker: npm start` (legacy, VPS deployment is primary) |
| `.gitignore` | Ignores node_modules, .env, dist/, build/, coverage/, generated Prisma client |
| `README.md` | Basic project README |
| `DOCUMENTATION.md` | User-facing documentation for bot commands |
| `PRIVACY_POLICY.md` | Bot privacy policy document |
| `blog-hashnode.md` | Blog post draft about the project's architecture |
| `reviews.json` | Scraped user reviews data (from top.gg or similar) |
| `emojis.txt` | Text file listing all custom emoji names/IDs |
| `emoji_check.log` | Log output from emoji validation scripts |
| `error.log` / `error_full.log` | Error log files |
| `ssh_key_ujjwal` / `ssh_key_ujjwal.pub` | SSH keys for VPS deployment |

---

## 6. Database Layer (Prisma + MongoDB)

### `prisma/schema.prisma` (715 lines)

This is the **single source of truth for the entire data model**. It defines 25+ MongoDB models. The schema has two generators: one for the bot and one specifically for the dashboard (`dashboard/node_modules/.prisma/client`).

#### Core Models:

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | Central user entity, scoped per guild | `discordId`, `guildId` (compound unique), `xp`, `level`, `intelligence`, `discipline`, `jobId`, `jobXp`, `jobStress`, `isBanned`, `isJailed`, `creditScore` |
| **Wallet** | User's spendable currency balance | `balance` (Int), linked 1:1 to User |
| **Bank** | User's banked savings | `balance` (Int), linked 1:1 to User |
| **Transaction** | Audit trail of all wallet changes | `amount`, `type` (income, bet, payout, transfer, etc.), `meta` (JSON), `isEarned` |
| **Bet** | Record of every gambling bet placed | `gameId`, `amount`, `choice`, `result`, `payout` |
| **GuildConfig** | **Massive per-guild configuration** (~70+ fields) | Currency name/emoji, prefix, all game configs, cooldowns, bet limits, banking rates, marriage config, jail config, chat money config, education config, job config, quest pay, vote reward, casino channels, disabled commands, reward amounts |
| **ShopItem** | Admin-defined items for purchase | `itemType` (CONSUMABLE, ROLE, BUFF, COLLECTIBLE, EQUIPMENT, UNI_BOOK), `effects` (JSON), `requirements` (JSON), `onBuyActions` (JSON) |
| **Inventory** | User's owned items | Links User ↔ ShopItem with `amount` |
| **Loan** | Active/completed/defaulted loans | `amount`, `totalRepayment`, `interestRate`, `dueDate`, `status` (ACTIVE/PAID/DEFAULTED) |
| **Investment** | FD/RD investments | `type` (FD/RD), `amount`, `interestRate`, `maturityDate`, `status` |
| **Stock** | Per-guild stock definitions | `symbol`, `name`, `currentPrice`, `volatility`, `basePrice` |
| **Portfolio** / **StockHolding** | User's stock portfolio | `quantity`, `avgBuyPrice` |
| **Property** | Buyable real estate | `basePrice`, `price` (fluctuates), `incomePerCycle`, `incomeCycleHours` |
| **OwnedProperty** | User's owned properties | `purchasedPrice`, `lastCollected` (for rent) |
| **MarketListing** | Black market P2P listings | Links seller, shopItem or property, `amount`, `totalPrice` |
| **ActiveEffect** | Temporary buffs/effects on users | `effectType` (LUCK_BOOST, etc.), `value`, `expiresAt` |
| **Degree** | University degrees | `type` (HS, ASSOCIATE, BACHELORS, MASTERS, PHD, TRADE, CERTIFICATE), `totalSemesters`, `tuitionPerSem`, `incomeMulti` |
| **UserEducation** | Active enrollment tracking | `currentSemester`, `currentGpa`, `stress`, `attendance`, `status` (ENROLLED/PROBATION/DROPPED/GRADUATED) |
| **UserDegree** | Completed degrees | `finalGpa`, `obtainedAt` |
| **Job** | Job definitions requiring degrees | `minPay`, `maxPay`, `successRate`, `requiredDegreeId` |
| **WorkLog** | Shift history | `jobId`, `shiftType`, `success`, `earnings` |
| **Marriage** | Marriage between two users | `spouse1Id`, `spouse2Id`, `affection`, `jointBalance` |
| **DailyQuest** | Per-user daily quest tracking | `dayKey` (YYYY-MM-DD), `tasks` (JSON array), `completed`, `rewardClaimed` |
| **RoleIncome** / **RoleIncomeClaim** | Discord role-based passive income | `roleId`, `amount`, `cooldown`, `incomeType` (COLLECTIBLE/AUTOMATIC) |
| **IncomeConfig** | Per-guild income command config | `commandKey` (work/beg/crime/slut), pay ranges, cooldowns, success rates |
| **CommandPermission** | Granular command permissions | `command`, `targetType` (USER/ROLE/CHANNEL), `action` (ALLOW/DENY) |
| **CasinoDropConfig** | Casino drop scheduling config | `type` (SCHEDULED/INTERVAL/MESSAGE_COUNT/RANDOM/MANUAL), timing params, drop amounts |
| **Audit** | Admin action audit trail | `type`, `meta` (JSON) |

### `prisma/seed.ts`

Seeds default income configs (work, beg, crime, slut) for a `GLOBAL_DEFAULT` guild and creates a default roulette game session.

---

## 7. Bot Source Code (`src/`)

### 7.1 Entry Point & Core Orchestration

#### `src/index.ts` (106 lines)
The **main entry point**. This file:

1. **Creates the Discord.js Client** with intents: `Guilds`, `GuildMessages`, `MessageContent`, `GuildMembers`
2. **`ready` event**: Connects Prisma, initializes emoji registry, sets up all listeners (chatMoney, casinoDrop, guildCreate, guildDelete), initializes the scheduler, and registers slash commands per-guild
3. **`interactionCreate` event**: Routes button/select/modal interactions to the correct handler based on `customId` prefix:
   - `bank_`, `loan_`, `invest_`, `repay_` → `bankInteractionHandler`
   - `market_`, `sell_` → `marketInteractionHandler`
   - `inv_` → `inventoryInteractionHandler`
   - `enroll_`, `claim_scholarship_`, `stress_`, `work_`, `promote_`, `edu_stress_` → `lifeInteractionHandler`
   - `ask_` → `askInteractionHandler`
   - `setup_`, `modal_setup_`, `select_setup_` → `setupHandler`
   - `pay_bail` → `jailInteractionHandler`
   - `casino_drop_claim_` → `CasinoDropService.handleClaim`
4. **`messageCreate` event**: Checks for prefix or @mention, extracts command text, and calls `routeMessage()`. Supports per-guild configurable prefix (default `!`). If the bot is just @mentioned with no command, sends a help message.

#### `src/commands.ts` (153 lines)
A **legacy/fallback command handler** with basic `balance`, `deposit`, and `bet` commands. This appears to be an early prototype that was superseded by `commandRouter.ts` but kept for reference. It has its own `ensureUserAndWallet` function and transaction logic with retry fallback.

#### `src/scheduler.ts` (129 lines)
The **cron job scheduler** initialized on bot ready:

- **Every 60 seconds** (setInterval): Updates stock market prices via `updateMarket()`
- **Every minute** (node-cron `* * * * *`):
  - Processes matured investments (FD/RD)
  - Handles overdue loans (credit score penalties)
  - Removes expired temporary roles/effects
  - Processes casino drops (scheduled, interval, message-count based)
  - Processes automatic role incomes
  - Sends vote reminders (DM users who voted 12+ hours ago)
- **Every hour** (`0 * * * *`): Cleans up guild data that's been soft-deleted for 24+ hours

---

### 7.2 Command Router

#### `src/commandRouter.ts` (928 lines)
The **central command dispatcher** — a massive `switch` statement that maps ~100+ command names (with aliases) to their handler functions.

**Flow:**
1. Parses the raw message content, extracts `command` and `args`
2. Normalizes multi-word commands (e.g., `set casino channel` → `set-casino-channel`)
3. Maps aliases (e.g., `bal` → `balance`, `bj` → `blackjack`, `inv` → `inventory`)
4. Checks if the user is banned (temporary or permanent) — blocks all commands
5. Checks command permissions via `permissionService` (casino channel restrictions, role/user/channel allows/denies)
6. Checks jail status — blocks economy commands if user is jailed
7. Routes to the appropriate command handler via a `switch` statement
8. If unknown command, uses `findBestMatch()` (fuzzy matching via Levenshtein distance) to suggest similar commands

**Commands restricted when in jail:** work, crime, beg, slut, rob, shop, buy, sell, market, bet, blackjack, roulette, slots, coinflip, cockfight, chicken, withdraw, deposit, transfer, give, collect, daily, weekly, monthly, invest, stock, trade

---

### 7.3 Commands

Commands are organized into 6 categories under `src/commands/`:

#### `src/commands/admin/` (52 files)
Server administrator commands. Require `MANAGE_GUILD` permission or Casino Admin role.

| File | Command(s) | Purpose |
|------|-----------|---------|
| `setup.ts` | `!setup`, `!config` | **Master setup wizard** — interactive embed with buttons/selects for all guild configuration |
| `setupDrop.ts` | `!setup-drop` | Configure casino drop system (scheduled/interval/message-count/random drops) |
| `drop.ts` | `!drop` | Manually trigger a casino drop |
| `adminDashboard.ts` | `!adminpanel` | Full admin dashboard embed with all current settings |
| `setPrefix.ts` | `!setprefix` | Change command prefix |
| `setCurrency.ts` | `!set-currency` | Change currency name |
| `setCurrencyEmoji.ts` | `!set-currency-emoji` | Change currency emoji |
| `setStartMoney.ts` | `!set-start-money` | Set starting balance for new users |
| `setIncome.ts` | `!setincome` | Configure income command pay ranges and success rates |
| `setIncomeCooldown.ts` | `!set-income-cooldown` | Set cooldowns for income commands |
| `setRob.ts` | `!setrob` | Configure rob success rate, fine %, cooldown, immune roles |
| `setMinBet.ts` | `!min-bet` | Set minimum bet amount |
| `betLimit.ts` | `!set-bet-limit` | Set per-game bet limits |
| `setGameCooldown.ts` | `!set-game-cooldown` | Set cooldown for specific games |
| `setGlobalGameCooldown.ts` | `!set-global-game-cooldown` | Set global game cooldown |
| `setEconomyConfig.ts` | `!set-loan-interest`, `!set-fd`, `!set-rd`, `!set-tax`, etc. | Multi-purpose economy config setter |
| `setRoleIncome.ts` | `!set-role-income` | Configure role-based income |
| `setLogChannel.ts` | `!set-log-channel` | Set audit log channel |
| `setCasinoChannel.ts` | `!set-casino-channel` | Whitelist channels for bot commands |
| `chatMoneyConfig.ts` | `!chatmoney` | Configure passive chat money earning |
| `addMoney.ts` | `!add-money` | Admin add currency to user |
| `removeMoney.ts` | `!remove-money` | Admin remove currency from user |
| `setMoney.ts` | `!set-money` | Admin set exact balance |
| `addShopItem.ts` | `!shop-add` | Add items to the guild shop |
| `manageShop.ts` | `!manage-item` | Edit/delete shop items |
| `resetShop.ts` | `!reset-shop` | Delete all shop items |
| `removeItem.ts` | `!remove-item` | Remove items from user inventory |
| `adminProperty.ts` | `!manage-property` | Create/edit/delete properties |
| `casinoBan.ts` | `!casino-ban` | Ban user from bot (temp/permanent) |
| `casinoUnban.ts` | `!casino-unban` | Unban user |
| `casinoBanList.ts` | `!banlist` | List banned users |
| `resetEconomy.ts` | `!reset-economy` | Wipe all economy data for the guild |
| `resetAdminConfig.ts` | `!reset-admin-settings` | Reset permission settings |
| `factoryReset.ts` | `!factory-reset` | Complete guild data wipe |
| `resetLoans.ts` | `!reset-loans` | Clear all loans |
| `manageCasinoAdmin.ts` | `!make-casino-admin`, `!remove-casino-admin` | Manage casino admin users |
| `manageCreditScore.ts` | `!set-credit-score` | Manually set user credit score |
| `manageCreditConfig.ts` | `!view-credit-tiers`, `!delete-credit-tier` | View/delete credit tiers |
| `addCreditTier.ts` | `!add-credit-tier` | Add credit score tiers |
| `configCreditTier.ts` | `!config-credit-tier` | Configure credit tier settings |
| `manageLoanBan.ts` | `!loan-ban`, `!loan-unban` | Ban/unban users from loans |
| `configJobs.ts` | `!config-jobs` | Configure job salaries |
| `manageJobStore.ts` | `!manage-jobstore` | Manage job store items |
| `manageUniStore.ts` | `!manage-uni` | Manage university store items |
| `manageChicken.ts` | `!manage-chicken` | Admin chicken/cockfight management |
| `setCockfight.ts` | `!set-cockfight` | Configure cockfight settings |
| `educationAdmin.ts` | `!setint`, `!setdis`, `!resetedu`, `!grantdegree`, `!set-degree-cost`, `!set-study-cooldown` | Education system admin commands |
| `viewConfig.ts` | `!viewconfig` | View current guild configuration |
| `addEmoji.ts` | `!addemoji` | Register custom emojis |
| `debugPermissions.ts` | `!test` | Debug command permission checks |
| `testwelcome.ts` | `!testwelcome` | Preview welcome message |

#### `src/commands/economy/` (29 files)
Core economy commands available to all users:

| File | Command(s) | Purpose |
|------|-----------|---------|
| `balance.ts` | `!balance`, `!bal` | Show wallet + bank balance |
| `deposit.ts` | `!deposit`, `!dep` | Move money from wallet to bank |
| `withdrawBank.ts` | `!withdraw`, `!wd` | Move money from bank to wallet |
| `transfer.ts` | `!transfer`, `!give` | Send money to another user |
| `bank.ts` | `!bank` | Full banking dashboard — loans, FD, RD, investments |
| `incomeCommands.ts` | `!beg`, `!slut` | Earn money with cooldown |
| `crime.ts` | `!crime` | Risky income (can result in jail) |
| `rob.ts` | `!rob` | Rob another user |
| `jail.ts` | `!jail`, `!bail` | View jail status / pay bail |
| `shop.ts` | `!shop`, `!buy` | Browse and purchase items |
| `inventory.ts` | `!inventory`, `!inv` | View owned items |
| `use.ts` | `!use` | Use a consumable item |
| `equip.ts` | `!equip` | Equip weapon/armor/accessory |
| `iteminfo.ts` | `!iteminfo` | View detailed item info |
| `profile.ts` | `!profile`, `!p` | View user profile (level, XP, stats, badges) |
| `leaderboard.ts` | `!leaderboard`, `!lb` | Server-wide leaderboards |
| `market.ts` | `!market`, `!bm` | Black market — list/buy/sell items between players |
| `daily.ts` / `weekly.ts` / `monthly.ts` | `!daily`, `!weekly`, `!monthly` | Time-gated reward claims |
| `rewards.ts` | (shared logic) | Reward claiming utility |
| `collect.ts` | `!collect` | Collect role-based income |
| `credit.ts` | `!credit` | View credit score |
| `stock.ts` | `!stock` | View stock market, buy/sell stocks |
| `myStocks.ts` | `!my-stocks` | View personal stock portfolio |
| `properties.ts` | `!properties`, `!buy-property`, `!sell-property`, `!my-properties`, `!collect-rent` | Real estate system |
| `ask.ts` | `!ask-money` | Request money from another user (sends interactive confirmation) |
| `vote.ts` | `!vote` | Vote for bot on Top.gg for rewards |

#### `src/commands/games/` (8 files)
Gambling and PvP games:

| File | Command(s) | Purpose |
|------|-----------|---------|
| `roulette.ts` | `!bet <amount> <choice>`, `!roulette-guide` | Full roulette with number, color, dozen, column, and special bets |
| `blackjack.ts` | `!blackjack <amount>`, `!bj` | Blackjack card game with hit/stand/double-down buttons |
| `coinflip.ts` | `!coinflip <amount> <heads/tails>` | 50/50 coinflip gamble |
| `slots.ts` | `!slots <amount>` | Slot machine with symbol combinations and payouts |
| `russianRoulette.ts` | `!rr <amount>` | Russian roulette — multiplayer elimination game |
| `cockfight.ts` | `!cockfight <bet>` | PvP cockfight matchmaking with betting, uses chicken stats |
| `chicken.ts` | `!chicken` | View/manage your fighting chicken (stats, training, healing) |
| `feed.ts` | `!feed` | Feed your chicken to restore health |

#### `src/commands/general/` (6 files)
Information and utility commands:

| File | Command(s) | Purpose |
|------|-----------|---------|
| `help.ts` | `!help` | **Main help embed** — categorized command list with descriptions |
| `casinoGuide.ts` | `!casino`, `!games` | Detailed casino/gambling guide |
| `tutorial.ts` | `!guide`, `!tutorial` | Getting started tutorial |
| `ping.ts` | `!ping` | Bot latency check |
| `start.ts` | `!start` | Create account / first-time setup |
| `dashboard.ts` | `!dashboard` | Link to web dashboard |

#### `src/commands/life/` (13 files)
Life simulation system (BitLife-inspired):

| File | Command(s) | Purpose |
|------|-----------|---------|
| `education.ts` | `!edu`, `!uni`, `!university` | View education status, available degrees |
| `enroll.ts` | `!enroll <degree>` | Enroll in a university degree (checks prerequisites, intelligence, tuition) |
| `study.ts` | `!study` | Study to progress through semesters, earn GPA |
| `dropout.ts` | `!dropout` | Drop out of current degree |
| `uniStore.ts` | `!unistore` | Buy textbooks and study materials |
| `jobs.ts` | `!jobs`, `!careers` | View available jobs and requirements |
| `apply.ts` | `!apply <job>` | Apply for a job (checks degree requirements, intelligence) |
| `work.ts` | `!work`, `!job` | Work a shift — interactive minigame (button click, typing challenge) |
| `career.ts` | `!career` | View current job details, progress, promotion requirements |
| `jobStore.ts` | `!jobstore` | Buy work tools and boosters |
| `relax.ts` | `!relax` | Reduce job/education stress (gym, meditation, sports) |
| `marriage.ts` | `!marry`, `!divorce`, `!family` | Marriage proposals, divorce, family info, joint banking |
| `dailyQuest.ts` | `!quests`, `!daily-quests` | View and track daily quest progress |

#### `src/commands/shop/` (1 file)
| File | Command(s) | Purpose |
|------|-----------|---------|
| `cockStore.ts` | `!cockstore`, `!cs` | Specialized shop for chicken equipment (weapons, armor, boots) |

---

### 7.4 Handlers (Interaction Handlers)

Located in `src/handlers/`. These handle Discord **button clicks, select menu selections, and modal submissions** that originate from interactive embeds.

| File | Size | What It Handles |
|------|------|----------------|
| `bankInteractionHandler.ts` | 20KB | All banking UI interactions — loan applications, FD/RD creation, investment viewing, repayment flows |
| `marketInteractionHandler.ts` | 16KB | Black market — listing pagination, buy confirmations, sell item forms |
| `lifeInteractionHandler.ts` | 43KB | **Largest handler** — enrollment confirmations, scholarship claims, stress relief selection, dropout confirmation, work shift flows, promotion confirmations, education stress relief |
| `inventoryInteractionHandler.ts` | 9KB | Inventory pagination, item use confirmation |
| `askInteractionHandler.ts` | 3KB | "Ask for money" accept/decline flow |
| `setupHandler.ts` | 30KB | **Master setup wizard handler** — handles all interactive configuration through buttons, selects, and modals for the `!setup` command |
| `jailInteractionHandler.ts` | 1.2KB | Bail payment confirmation button |

---

### 7.5 Services (Business Logic)

Located in `src/services/`. These contain the core business logic, separated from command presentation.

| File | Purpose |
|------|---------|
| **`walletService.ts`** (4.6KB) | Core wallet operations: `ensureUserAndWallet()`, `depositToWallet()`, `withdrawFromWallet()`. Handles income tax deduction on earned income. Creates users with starting money from guild config. |
| **`bankService.ts`** (5.4KB) | Bank deposit/withdraw operations with balance limits |
| **`bankingService.ts`** (11.7KB) | Advanced banking: loan creation, repayment, FD/RD processing, matured investment payout, overdue loan handling, credit score updates |
| **`shopService.ts`** (12KB) | Shop item purchase logic, stock management, item effect application, role granting, inventory management |
| **`marketService.ts`** (9.5KB) | Black market listing, buying, selling with tax calculation |
| **`stockService.ts`** (9.6KB) | Stock market: `updateMarket()` (price fluctuation algorithm using volatility), buy/sell shares, portfolio valuation |
| **`jobService.ts`** (17KB) | **Job system**: sector definitions (Tech, Medical, Business, Legal, Service, Trade), career ladders with levels (Intern→Junior→Senior→Lead→Director), shift minigames, promotion logic, salary calculation |
| **`educationService.ts`** (19.5KB) | **Education system**: degree catalog, semester progression, GPA calculation, exam logic, scholarship system, study cooldowns, stress management |
| **`propertyService.ts`** (11KB) | Property pricing (dynamic based on demand), purchase, sale, rent collection calculation |
| **`casinoDropService.ts`** (15KB) | Casino drops: scheduled/interval/random/message-count drop processing, claim handling, embed generation |
| **`effectService.ts`** (16KB) | Buff/debuff system: apply effects, check active effects, remove expired effects, temporary role management |
| **`jailService.ts`** (3.4KB) | Jail system: check jail status, jail user, release user, bail calculation |
| **`questService.ts`** (5.7KB) | Daily quest generation and progress tracking |
| **`gameService.ts`** (3.2KB) | Shared game utilities: bet validation, payout calculation |
| **`minigameService.ts`** (7KB) | Work shift minigames: button-click timing, typing challenge generation |
| **`incomeService.ts`** (4KB) | Income command processing with configurable success rates and cooldowns |
| **`interviewService.ts`** (4.2KB) | Job application interview minigame |
| **`roleIncomeService.ts`** (8.9KB) | Role-based income: collectible (manual claim) and automatic (scheduled payout) |
| **`guildConfigService.ts`** (1.6KB) | Fetch/cache guild configuration (creates default if not exists) |
| **`guildCleanupService.ts`** (5.9KB) | Soft-delete guild data when bot is removed, restore on rejoin, permanent cleanup after 24h |
| **`permissionService.ts`** (2.8KB) | Check command permissions against CommandPermission model and casino channel restrictions |
| **`transferService.ts`** (1.6KB) | User-to-user currency transfer with tax |
| **`tradeService.ts`** (3.4KB) | Item trading between users |
| **`userService.ts`** (3KB) | User lookup, XP/level management |
| **`profileStyles.ts`** (2KB) | Profile embed styling configuration |
| **`redisService.ts`** (2.2KB) | **Redis wrapper** — singleton class with `get<T>()`, `set()`, `del()` methods. JSON serialization. Lazy connection with retry strategy. |
| **`imageService.ts`** (0.7KB) | Image path utilities |

**`src/services/life/marriageService.ts`** (6.4KB) — Marriage business logic: proposal, acceptance, divorce, affection system, joint balance management.

---

### 7.6 Listeners (Event-Driven Features)

Located in `src/listeners/`. These are passive event handlers that run on every message or guild event.

| File | Purpose |
|------|---------|
| `chatMoneyListener.ts` | **Passive income on chat** — awards random currency to users who chat in configured channels, with per-user cooldown (memory cache + DB). Fires on every `messageCreate`. |
| `casinoDropListener.ts` | Tracks message counts for MESSAGE_COUNT type casino drops. Increments counter on each message in configured channels. |
| `guildCreateListener.ts` | Sends a branded welcome embed with setup instructions when the bot joins a new server. Restores soft-deleted guild data if the bot was previously removed. |
| `guildDeleteListener.ts` | Soft-deletes guild configuration (sets `deletedAt`) when the bot is removed from a server. The scheduler permanently deletes after 24 hours. |

---

### 7.7 Utilities

Located in `src/utils/`. Shared helpers used across the codebase.

| File | Purpose |
|------|---------|
| `prisma.ts` | **Prisma client singleton** + `runWithRetry()` helper that retries on MongoDB write conflicts (P2034) with exponential backoff |
| `emojiRegistry.ts` | **Custom emoji management system** — loads emojis from config, persisted JSON file, client cache, and a dedicated emoji storage guild. Provides `emojiInline()`, `emojiIconUrl()`, `getEmojiRecord()`, etc. |
| `embed.ts` | Reusable embed builders: `errorEmbed()`, `successEmbed()` with consistent styling |
| `format.ts` | Number/string formatting utilities |
| `formatNumber.ts` | Compact number formatter (e.g., 1000 → 1K) |
| `balance.ts` | Balance display formatting |
| `balanceUtils.ts` | Balance validation helpers |
| `cooldown.ts` | Cooldown checking and formatting for time-gated commands |
| `duration.ts` | Duration parsing/formatting (seconds → human readable) |
| `pagination.ts` | Paginated embed system with button navigation |
| `gameUtils.ts` | Game-related utilities: chicken stat calculation, combat formulas, XP curves |
| `imageUtils.ts` | Canvas-based image generation for cockfight battle scenes |
| `interactionHelpers.ts` | Safe interaction reply helper (handles already-replied, deferred, etc.) |
| `collectorHelper.ts` | Message/component collector setup helpers |
| `discordLogger.ts` | Log events to a configured guild log channel |
| `logger.ts` | Console logging utility |
| `permissionUtils.ts` | Permission check helpers (admin, casino admin) |
| `permissions.ts` | Permission constants and check functions |
| `stringUtils.ts` | String utilities including `findBestMatch()` (Levenshtein distance fuzzy matching for command suggestions) |

---

### 7.8 Configuration

Located in `src/config/`:

| File | Purpose |
|------|---------|
| `branding.ts` | **Central branding config** — defines the `Mascot` object with: Name ("Lady Fortuna"), 70+ custom Discord emote strings (Success, Fail, Angry, Think, Love, Money, Teacher, Graduate, job icons, game icons, UI elements), Image paths, Color palette (#9B59B6 purple, #2ECC71 green, #E74C3C red), Links (Dashboard, Support, Docs). Also exports `getEmoteUrl()` helper. |
| `gameConfig.ts` | **Game configuration** — cockfight emojis, base stat formulas (LevelMultiplier, StrWeight, DefWeight, AgiWeight), equipment slot definitions (weapon/armor/accessory), predefined equipment items (Iron/Gold/Diamond/Netherite tiers) with stat bonuses and prices |
| `emoji.ts` | Emoji constants (currently minimal, most emojis are in branding.ts) |

---

### 7.9 Scripts

Located in `src/scripts/`:

| File | Purpose |
|------|---------|
| `copyAssets.js` | **Build script** — copies `src/assets/` to `dist/assets/` during `npm run build` (since TypeScript doesn't copy non-TS files) |
| `fetchEmojis.ts` | Fetches all emojis from the bot's guilds and logs them |
| `checkShopItems.ts` | Validates shop item consistency |
| `resetStocks.ts` | Resets all stock prices to base values |

Located in root `scripts/`:

| File | Purpose |
|------|---------|
| `scrape_reviews.js` | Puppeteer script to scrape bot reviews from web |
| `analyze_debug.js` | Debug analysis utility |
| `simple_analyze.js` | Simplified analysis script |
| `debug_page.html` | HTML debug page for review data |

---

### 7.10 Assets

#### `src/assets/` (8 image files)
Bot embed images used in Discord messages:
- `casino_banner.png` — Casino game embeds
- `guide_banner.png` — Tutorial/help embeds
- `roulette_banner.png` — Roulette game embeds
- `roulette_guide.png` — Roulette guide
- `cockfight_bg.png` — Cockfight battle background
- `beg_thumbnail.png` — Beg command embed
- `daily_quest.jpg` — Daily quest embed
- `stock_market.jpg` — Stock market embed

#### `assets/` (root, 5 image files)
Additional images:
- `black_market.png` — Black market embed
- `cock_store.jpg` / `cock_store.png` — Cock store embed
- `marriage_proposal.png` — Marriage proposal embed
- `property_banner.png` — Property system embed

---

## 8. Web Dashboard (`dashboard/`)

A **Next.js 16 web application** hosted at `fortunabot.dev`. Uses React 19, Tailwind CSS v4, Framer Motion for animations, and NextAuth for Discord OAuth.

### Structure:

```
dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page (redirects/overview)
│   │   ├── layout.tsx                  # Root layout with metadata
│   │   ├── globals.css                 # Global Tailwind styles
│   │   ├── api/auth/                   # NextAuth API routes
│   │   ├── changelog/                  # Changelog page
│   │   ├── commands/                   # Command reference docs
│   │   ├── docs/                       # Documentation pages
│   │   ├── policy/                     # Privacy policy page
│   │   ├── terms/                      # Terms of service page
│   │   ├── team/                       # Team page
│   │   └── dashboard/
│   │       ├── page.tsx                # Server selection page
│   │       └── [guildId]/              # Per-guild dashboard pages
│   ├── components/
│   │   ├── Hero.tsx                    # Landing page hero section
│   │   ├── FeatureSection.tsx          # Features showcase
│   │   ├── LandingNavbar.tsx           # Landing page navigation
│   │   ├── Footer.tsx                  # Site footer
│   │   ├── InteractiveCardDeck.tsx     # Animated card deck component
│   │   ├── PokerCard.tsx               # Poker card animation component
│   │   ├── ServerPokerChip.tsx         # Server selection chip component
│   │   ├── ServerList.tsx              # Server selection list
│   │   ├── FloatingParticles.tsx       # Particle animation background
│   │   ├── AmbientBackground.tsx       # Ambient background effects
│   │   ├── CursorSpotlight.tsx         # Cursor-following spotlight effect
│   │   ├── DashboardNavbar.tsx         # Dashboard navigation
│   │   ├── GeneralSidebar.tsx          # Documentation sidebar
│   │   ├── MobileSidebar.tsx           # Mobile sidebar navigation
│   │   ├── Providers.tsx               # React providers wrapper
│   │   ├── dashboard/                  # Dashboard-specific components
│   │   │   ├── AdminSidebar.tsx        # Admin panel sidebar
│   │   │   ├── DashboardNavbar.tsx     # Dashboard top nav
│   │   │   ├── MobileAdminSidebar.tsx  # Mobile admin sidebar
│   │   │   ├── OverviewLogs.tsx        # Activity log viewer
│   │   │   ├── OverviewReviews.tsx     # Reviews display
│   │   │   ├── admin/                  # Admin config components
│   │   │   ├── education/              # Education management components
│   │   │   ├── forms/                  # Form components
│   │   │   ├── games/                  # Game configuration UI
│   │   │   ├── income/                 # Income settings components
│   │   │   ├── marriage/               # Marriage settings components
│   │   │   ├── properties/             # Property management components
│   │   │   ├── shop/                   # Shop management components
│   │   │   └── ui/                     # Reusable UI elements
│   │   ├── docs/                       # Documentation components
│   │   ├── landing/                    # Landing page components
│   │   └── ui/                         # Shared UI components
│   ├── lib/
│   │   ├── prisma.ts                   # Dashboard Prisma client
│   │   ├── redis.ts                    # Dashboard Redis client
│   │   ├── auth.ts                     # NextAuth configuration (Discord provider)
│   │   ├── discord.ts                  # Discord API helpers (fetch guilds, bot status)
│   │   ├── permissions.ts              # Dashboard permission checks
│   │   ├── cache.ts                    # Dashboard caching layer
│   │   ├── cleanup.ts                  # Data cleanup utilities
│   │   ├── audit.ts                    # Dashboard audit logging
│   │   └── utils.ts                    # General utilities
│   ├── actions/                        # Next.js Server Actions
│   └── types/                          # TypeScript type definitions
├── prisma/                             # Symlinks to root prisma schema
├── public/                             # Static assets (favicon, images)
├── package.json                        # Dashboard dependencies
├── next.config.ts                      # Next.js configuration
├── tsconfig.json                       # Dashboard TypeScript config
└── postcss.config.mjs                  # PostCSS (Tailwind) config
```

**Key point:** The dashboard shares the same Prisma schema as the bot. The `prisma/schema.prisma` has a second generator (`clientDashboard`) that outputs to `dashboard/node_modules/.prisma/client`.

---

## 9. Deployment & CI/CD (`deploy/` + `.github/`)

### CI/CD Pipeline:

**`.github/workflows/deploy.yml`** — GitHub Actions workflow:
- Triggers on push to `main` branch
- Sends a POST request to the VPS deploy webhook with a secret header
- The VPS webhook handler (`deploy-webhook.sh`) does the actual deployment

### VPS Deployment:

**`deploy/setup_server.sh`** — Initial Ubuntu VPS setup:
- Installs Node.js 20, PM2, Redis, Nginx, Docker, build tools

**`deploy/deploy-webhook.sh`** — Webhook-triggered deployment:
- Listens on port 9000 via `socat`
- Validates `X-Deploy-Secret` header
- Pulls latest code from git
- Installs dependencies (`npm install`)
- Builds bot (`npm run build`)
- Runs `prisma db push`
- Builds dashboard (`cd dashboard && npm install && npm run build`)
- Restarts PM2 processes

**`deploy/nginx_app.conf`** — Nginx reverse proxy:
- Routes `fortunabot.dev` / `www.fortunabot.dev` → `localhost:3000` (Next.js dashboard)

**`deploy/deploy-webhook.service`** — Systemd service unit for the deploy webhook

**`ecosystem.config.js`** — PM2 config runs two processes:
1. `casino-bot` — `dist/index.js` (max 1.8GB memory, auto-restart)
2. `casino-dashboard` — Next.js `npm start` on port 3000 (max 500MB memory)

---

## 10. Auxiliary Files

| File | Purpose |
|------|---------|
| `reviews.json` | Cached user reviews data |
| `emojis.txt` | Raw emoji ID mappings |
| `emoji_check.log` | Emoji validation output |
| `error.log` / `error_full.log` | Runtime error logs |
| `src/data/emojis.json` | Persisted emoji registry (read/written by `emojiRegistry.ts`) |

---

## 11. Data Flow Walkthrough

### Example: User runs `!blackjack 500`

1. **Discord** → `messageCreate` event fires in `src/index.ts`
2. **index.ts** → Checks not a bot, has guild, fetches guild config for prefix, detects `!` prefix match
3. **index.ts** → Calls `routeMessage(client, message, prefix)` in `commandRouter.ts`
4. **commandRouter.ts** → Parses `blackjack` as command, `500` as args
5. **commandRouter.ts** → Normalizes `bj` → `blackjack` (if alias used)
6. **commandRouter.ts** → Checks user not banned (queries `User` model)
7. **commandRouter.ts** → Checks command permissions (`permissionService.checkCommandPermission()`)
8. **commandRouter.ts** → Checks not in jail (`jailService.checkJailStatus()`)
9. **commandRouter.ts** → `switch` case `"blackjack"` → calls `handleBlackjack(message, args)`
10. **blackjack.ts** → Validates bet amount (>= minBet, <= maxBet from `GuildConfig`)
11. **blackjack.ts** → Checks cooldown (Redis or in-memory)
12. **blackjack.ts** → Ensures user wallet exists (`walletService.ensureUserAndWallet()`)
13. **blackjack.ts** → Checks `wallet.balance >= 500`
14. **blackjack.ts** → Deducts 500 from wallet (`withdrawFromWallet()`)
15. **blackjack.ts** → Deals cards, creates game state, sends embed with Hit/Stand/Double buttons
16. **Discord** → User clicks "Hit" button → `interactionCreate` fires
17. **index.ts** → `customId` doesn't match any handler prefix → blackjack handles its own collector
18. **blackjack.ts** → Processes hit, updates hand, checks bust/21
19. **blackjack.ts** → Game ends → calculates payout
20. **blackjack.ts** → If won: `depositToWallet(walletId, payout)` creates Transaction record
21. **blackjack.ts** → Creates `Bet` record with result
22. **blackjack.ts** → Updates XP, checks for level up, tracks quest progress
23. **blackjack.ts** → Sends result embed

### Example: Scheduled Investment Maturation

1. **scheduler.ts** → Cron fires every minute
2. **scheduler.ts** → Calls `processAllInvestments()` from `bankingService.ts`
3. **bankingService.ts** → Queries `Investment` where `status: "ACTIVE"` and `maturityDate <= now`
4. **bankingService.ts** → For each matured investment:
   - Calculates payout (principal + interest)
   - Updates investment status to `COMPLETED`
   - Deposits payout to user's wallet via `depositToWallet()`
   - Creates transaction record
5. **bankingService.ts** → Returns count of processed investments

---

## 12. Key Design Patterns

### Multi-Guild Isolation
Every data entity is scoped by `guildId`. A user has separate balances, inventories, jobs, and education per guild. The `User` model uses a compound unique key `@@unique([discordId, guildId])`.

### Service Layer Pattern
Business logic lives in `services/`, keeping command files thin. Commands handle only Discord interaction (parsing args, building embeds), delegating all data operations to services.

### Command Alias System
The `commandRouter.ts` uses a normalization map + switch statement with fall-through cases to support dozens of aliases per command (e.g., `bal`, `b`, `balance` all map to the same handler).

### Interactive Flows
Complex multi-step operations (banking, market, setup) use Discord buttons/selects/modals. The command sends an initial embed, and subsequent interactions are routed through `handlers/` based on `customId` prefixes.

### Graceful Error Handling
- `safeInteractionReply()` prevents crashes from already-replied/deferred interactions
- `runWithRetry()` handles MongoDB write conflicts with exponential backoff
- Error codes 10008 (Unknown Message) and 50035 (Invalid Form Body) are silently caught

### Guild Lifecycle Management
- **Join**: Sends welcome embed, restores soft-deleted data if bot was previously removed
- **Leave**: Soft-deletes guild config (`deletedAt` timestamp)
- **24h later**: Scheduler permanently purges all guild data

### Emoji System
Custom emojis are stored in a dedicated "emoji storage" guild and loaded into an in-memory registry on startup. The `branding.ts` file has 70+ emote references. The system supports inline emoji strings, CDN URLs, and fallback to guild emojis.

### Cooldown System
Cooldowns use a hybrid approach:
1. In-memory `Map<string, number>` for fast checks (prevents DB spam)
2. Database timestamps for persistence across restarts
3. Redis for shared cooldown state (when available)

---

> **Last updated:** 2026-04-28
> **Generated for:** AI IDE context transfer
