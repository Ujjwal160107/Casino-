# Fortuna V2 Architecture Handoff

Last updated: 2026-05-14

This document is a compact handoff for continuing the Fortuna V2 migration. It explains the intended V2 architecture, what has already been implemented, what is currently disabled or removed, and what still needs work.

## V2 Architecture Summary

Fortuna V2 is moving away from the old per-guild economy model.

The intended V2 architecture is:

- Economy and progression are global per Discord user.
- `discordId` is the global user identity.
- Wallet, bank, cards, jobs, education, profile, relax, rewards, and games should all use global user state.
- `guildId` should not be part of user economy identity.
- `guildId` remains valid only for server-specific things such as command prefix, Discord channel/message context, and metadata in logs or game transactions.
- Per-server prefix is the only remaining guild setting.
- Admin commands are developer-only.
- Guild admin, casino admin, command permission, casino ban, casino channel, role income, chat money, drop, and setup systems are legacy and should not be revived.

## Identity Rules

Use this rule everywhere:

```ts
where: { discordId: userId }
```

Do not use:

```ts
where: {
  discordId_guildId: {
    discordId,
    guildId
  }
}
```

Do not use `where: { id }` for `User` unless the schema is deliberately changed again. In current V2, `User.discordId` is the primary identity.

## Prefix-Only Guild Settings

The only intentional per-server config is prefix.

Current schema model:

```prisma
model GuildSettings {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  guildId   String   @unique
  prefix    String   @default("!")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Primary service:

- `src/services/guildSettingsService.ts`

Compatibility wrapper:

- `src/services/guildConfigService.ts`

`guildConfigService.ts` no longer represents real guild economy configuration. It exists as a compatibility/defaults wrapper so older active code can still get prefix, currency display, and default constants while migration continues.

## Economy Constants

The main source of truth is:

- `src/utils/economyConfig.ts`

This should own:

- base reward amounts
- degree prices
- job pay values
- beg/crime/rob ranges
- card score rules
- card tiers
- minimum due helpers
- score clamp helpers
- cycle key helpers
- shared economy limits

Avoid adding new hardcoded values in command handlers.

## Currency Display

The bot-wide currency emoji is:

```text
<:fortunes:1503253856992366612>
```

Currency display is centralized through branding/config helpers. Use shared formatting helpers where available instead of hand-writing money strings.

## Developer-Only Admin Access

Admin command access is developer-only.

Developer Discord user ID:

```text
1288340046449086567
```

Shared helper:

- `src/utils/developerAccess.ts`

Admin commands should use the helper instead of checking Discord server admin, guild owner, casino admin, roles, or old command permissions.

Non-developer denial text should stay concise:

```text
This command is restricted to the bot developer.
```

## Implemented V2 Work

### Global User / Economy Core

Implemented or partially implemented:

- global `User` identity by `discordId`
- global `Wallet`
- global `Bank`
- global transactions
- global rewards path work
- V2 balance path cleanup
- V2 bank/card integration work
- profile updates for cards and stress visibility
- global economy reminder cleanup away from old composite identity

Important note: some older commands still compile against V1 assumptions and need migration, especially outside active core.

### Credit Cards

Implemented:

- `CreditCard`
- `CardTransaction`
- `CardStatement`
- `src/services/creditCardService.ts`
- card tiers
- card eligibility by score and career tier
- weekly scheduler settlement
- statement generation
- minimum due handling
- score changes through scheduler settlement only
- bank to cards UI entry
- card image assets:
  - `src/assets/starter_card.png`
  - `src/assets/gold_card.png`
  - `src/assets/platinum_card.png`
  - `src/assets/black_card.png`

Current product direction:

- `!bank` is the main card entry.
- `!card` should remain only as a thin compatibility wrapper or safe alias.
- Credit cards must not be usable for gambling.
- Casino games use wallet only.

### Bank UI

Implemented or partially implemented:

- component-first bank menu
- cards button inside bank flow
- cards hub
- apply flow
- my cards flow
- image-based card display with fallbacks

Known care point:

- Discord component v2 image and layout support is limited. If image plus text layout is awkward, prefer compact readable sections with safe attachment fallback.

### Jobs / Education / Life

Implemented or partially implemented:

- V2 economy job pay values
- degree pricing sync
- career tier helpers
- `getUserCareerTier(...)`
- education enrollment wallet/card payment paths
- jobs UI moved toward Discord v2 component-first presentation
- job application flow no longer depends on job IDs as the main user-facing action
- study dashboard relax button removed
- universal `!relax` flow added

Current product direction:

- one universal relax/stress system
- job stress and education stress should be handled consistently
- no separate study relax button
- no separate job store or university store long term

### Universal Relax / Stress

Implemented:

- universal relax options
- wallet affordability checks
- transaction-based stress reduction
- job stress and education stress support
- profile stress visibility
- component-first relax dashboard

Current relax pricing:

- Quick Break: 25,000
- Gym Session: 75,000
- Meditation Retreat: 150,000
- Weekend Getaway: 350,000

Stress rules:

- clamp 0 to 100
- do not charge if both stress values are already 0
- do not mutate on insufficient funds
- reduce job stress, education stress, or both depending on what exists

### Games

Implemented or partially implemented:

- coinflip V2 migration
- slots V2 migration
- blackjack V2 migration
- roulette V2 migration
- russian roulette V2 migration
- cockfight V2 migration/polish
- shared game bet helpers
- wallet-only betting
- bet transaction logging
- ownership checks for interactive buttons
- double-settlement protections in touched games

Important game rules:

- games use wallet only
- no bank betting
- no card betting
- no card withdraw shortcut in games
- transaction meta should include game, bet amount, payout, result, guildId, channelId, and messageId where possible

### Dormant Guild System Removal

Removed from schema:

- `GuildConfig`
- `CommandPermission`
- `CasinoDropConfig`
- `RoleIncome`
- `RoleIncomeClaim`
- `IncomeConfig`

Removed dormant runtime/code paths:

- old permission service
- role income service
- casino drop service
- guild cleanup service
- chat money listener
- casino drop listener
- setup handler
- legacy `src/commands.ts`
- old guild setup/config/admin commands
- casino admin commands
- casino ban commands
- set-currency commands
- casino channel commands
- role income commands
- chat money config commands
- drop setup commands
- old factory reset guild cleanup command

## Removed / Deprecated Systems

These should not be brought back as separate systems:

- guild economy config
- custom currency per server
- casino channel restrictions
- casino admin users/roles
- casino bans
- guild command permissions
- setup wizard
- role income
- chat money
- casino drops
- job store
- university store
- separate stress-reduction item stores

Future item/shop work should be handled by one main shop system with internal categories, not separate job/uni stores.

## Current Validation Status

The latest cleanup pass completed:

```text
npx prisma validate
```

Result: passed.

```text
npx prisma generate
```

Result: passed.

Full build currently fails:

```text
npm run build
```

Main reason: remaining out-of-scope V1 leftovers in older modules, especially shop, inventory, market, property, stock, trade, marriage, effect, and some older economy commands.

Common remaining errors:

- `discordId_guildId` no longer exists
- `User.id` no longer exists
- `guildId` no longer exists on global economy models
- stale relation includes expecting old relation shapes
- old inventory/shop/market assumptions

## Known Remaining Migration Targets

### High Priority

These are likely to block clean builds or runtime paths:

- `src/commands/economy/credit.ts`
- `src/commands/economy/depositBank.ts`
- `src/commands/economy/equip.ts`
- `src/commands/economy/inventory.ts`
- `src/commands/economy/leaderboard.ts`
- `src/commands/economy/rewards.ts`
- `src/commands/games/feed.ts`
- `src/commands/life/dailyQuest.ts`
- `src/commands/life/marriage.ts`
- `src/handlers/inventoryInteractionHandler.ts`
- `src/handlers/marketInteractionHandler.ts`
- `src/services/effectService.ts`
- `src/services/shopService.ts`
- `src/services/transferService.ts`

### Major Subsystems Not Yet Fully Migrated

Do these in separate scoped passes:

- shop
- inventory
- market
- property
- stock
- trade
- marriage
- effects/items
- quests
- old loan-facing commands, if any remain user-facing

### Compatibility Cleanup

Eventually rename or replace:

- `getGuildConfig(...)`
- `guildConfigService.ts`
- `LegacyGuildConfig`

Current status: these are compatibility/default wrappers only, not schema-backed guild economy config.

Do not remove them until active commands that still need prefix/currency/default values are migrated to cleaner helpers.

## Suggested Next Passes

Recommended order:

1. Clean full-build blockers caused by V1 identity assumptions in active economy commands.
2. Migrate inventory/effects because many shop, trade, and item errors depend on them.
3. Migrate shop as one main V2 shop system.
4. Migrate market/trade together.
5. Migrate property and stock separately.
6. Remove `guildConfigService` compatibility wrapper after callers use `guildSettingsService`, branding, and `economyConfig` directly.

## Quick Checklist For Future Work

Before changing a file, check:

- Is this command still routed?
- Does it use `discordId` for users?
- Does it accidentally use `guildId` as part of economy identity?
- Does it call removed guild config systems?
- Does it use shared economy constants?
- Does it mutate wallet/bank/card state transactionally?
- Does user-facing UI avoid saying "global"?
- Does interactive UI check button ownership?

## Safe Mental Model

Fortuna V2 should feel like one account across all servers.

Servers can choose their prefix.

Everything else about the user economy belongs to the user, not the server.
