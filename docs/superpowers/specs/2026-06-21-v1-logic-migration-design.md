# V1 Logic Migration Design (Scoped)

Last updated: 2026-06-21

## Goal

Remove V1 configuration and logic leftovers so Fortuna V2 systems keep working, without UI migration and without stock subsystem work.

## Approved approach

**Approach 3:** Replace `guildConfigService` with thin `getGuildPrefix()` + direct `economyConfig` / `branding` imports. Delete dead files. Fix build-breaking V1 identity in active services. Remove guild admin dashboard (bot + Next.js).

## Scope

### In scope

- Delete `guildConfigService.ts` after migrating all non-stock callers
- Add `src/utils/guildContext.ts` with `getGuildPrefix(guildId)`
- Refactor `gameUtils.getGameBetLimits(gameKey)` — no legacy config object
- Fix `effectService.ts` for global `discordId` / `ActiveEffect.userId`
- Fix `credit.ts` signatures (`getFinancialSummary`, `calculateCreditLimits`)
- Delete dead files: `depositBank.ts`, `rewards.ts`, `cockStore.ts`, `uniStore.ts`, `jobStore.ts`, `dashboard.ts` (bot)
- Remove bot `!dashboard` command and admin-dashboard links
- Remove Next.js `/dashboard/*` admin routes; keep public site (landing, docs, policy, terms, team, changelog)
- Migrate `getGuildConfig()` callers to V2 helpers (logic only, embed UI unchanged)
- Minimal `lifeInteractionHandler` config migration (prefix/currency constants), not gameplay refactor
- Minimal `stockService.ts` compile fixes only if required so non-stock work does not regress (identity queries only, no stock feature refactor)

### Out of scope

- Embed → ComponentsV2 UI migration
- Stock feature migration or redesign (`stock.ts`, `myStocks.ts` behavior)
- Full `lifeInteractionHandler` gameplay refactor
- Schema cleanup (`currentGpa`, etc.)
- Economy rebalancing (use existing `economyConfig.ts`)

## Config replacement rules

| Old | New |
|-----|-----|
| `config.prefix` | `await getGuildPrefix(guildId)` |
| `config.currencyEmoji` | `GLOBAL_CURRENCY_EMOJI` or omit in `fmtCurrency()` |
| `config.jailFine` | `DEFAULT_JAIL_FINE` |
| `config.minBet` / `maxBet` | `getGameBetLimits(gameKey)` |
| `config.studyCooldown` | `DEFAULT_STUDY_COOLDOWN_SECONDS` |
| Relax costs | `RELAX_OPTIONS` |
| Banking limits | `BANKING_CONFIG` |
| `config.logChannelId` | Remove guild log channel lookup (V2: no per-guild log config) |

## Verification

- `npx tsc --noEmit` passes for all migrated files
- Grep: no `getGuildConfig`, `LegacyGuildConfig` outside deferred stock paths
- V2 smoke paths: shop, inventory, bank, jail bail amount, coinflip bet limits
- Public site routes still present; `/dashboard` admin routes removed
