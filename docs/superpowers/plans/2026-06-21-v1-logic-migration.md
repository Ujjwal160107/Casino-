# V1 Logic Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove V1 config shim and blockers while keeping V2 systems stable; no embed UI work; no stock feature refactor.

**Architecture:** Add `getGuildPrefix()` helper; callers import `economyConfig`/`branding` directly; delete dead files and admin dashboard; fix `effectService` identity; migrate callers in batches; delete `guildConfigService.ts`.

**Tech Stack:** TypeScript, discord.js, Prisma/MongoDB, Next.js (dashboard public site only)

**Spec:** `docs/superpowers/specs/2026-06-21-v1-logic-migration-design.md`

---

## File map

| Action | Path |
|--------|------|
| Create | `src/utils/guildContext.ts` |
| Delete | `src/services/guildConfigService.ts` (last) |
| Delete | `src/commands/economy/depositBank.ts`, `rewards.ts`, `src/commands/shop/cockStore.ts`, `src/commands/life/uniStore.ts`, `jobStore.ts`, `src/commands/general/dashboard.ts` |
| Fix | `src/services/effectService.ts`, `src/commands/economy/credit.ts`, `src/utils/gameUtils.ts` |
| Migrate | ~45 files importing `getGuildConfig` (exclude stock feature logic changes) |
| Remove | `dashboard/src/app/dashboard/**`, admin components/actions, bot dashboard links |

---

### Task 1: Foundation helpers

**Files:**
- Create: `src/utils/guildContext.ts`
- Modify: `src/utils/gameUtils.ts`

- [ ] **Step 1:** Create `guildContext.ts`:

```ts
import { getGuildSettings } from "../services/guildSettingsService";

export const DEFAULT_PREFIX = "!";

export async function getGuildPrefix(guildId: string): Promise<string> {
  const settings = await getGuildSettings(guildId);
  return settings.prefix?.trim() || DEFAULT_PREFIX;
}
```

- [ ] **Step 2:** Change `getGameBetLimits(config, gameKey)` to `getGameBetLimits(gameKey: string)` — remove config param; use internal `V2_DEFAULT_MIN_BET`, `V2_GAME_MAX_BETS`; remove `schemaOldMin`/`schemaOldMax` fallbacks and `roulette_v1` key.

- [ ] **Step 3:** Update all `getGameBetLimits(config, ...)` call sites in game files to `getGameBetLimits(...)`.

- [ ] **Step 4:** Run `npx tsc --noEmit 2>&1 | findstr gameUtils` — no new errors from gameUtils.

---

### Task 2: Delete dead bot files

**Files:**
- Delete: `depositBank.ts`, `rewards.ts`, `cockStore.ts`, `uniStore.ts`, `jobStore.ts`, `dashboard.ts`
- Modify: `src/commandRouter.ts` — remove dashboard import/case; confirm dead files not routed

- [ ] **Step 1:** Delete the six files listed above.

- [ ] **Step 2:** Remove `handleDashboard` import and `case "dashboard"` from `commandRouter.ts`.

- [ ] **Step 3:** Grep confirms no imports of deleted modules.

---

### Task 3: Fix effectService (V2 identity)

**Files:**
- Modify: `src/services/effectService.ts`

- [ ] **Step 1:** Replace all `User.id` / `discordId_guildId` with `where: { discordId }`.

- [ ] **Step 2:** ActiveEffect create/update: use `userId: discordId` only; remove `guildId` field usage.

- [ ] **Step 3:** User fetches that need wallet: `include: { wallet: true }`.

- [ ] **Step 4:** Run `npx tsc --noEmit 2>&1 | findstr effectService` — zero errors.

---

### Task 4: Fix credit.ts

**Files:**
- Modify: `src/commands/economy/credit.ts`

- [ ] **Step 1:** `getFinancialSummary(targetUser.id)` — single arg.

- [ ] **Step 2:** `calculateCreditLimits(userSummary.creditScore)` — no config arg.

- [ ] **Step 3:** Replace `getGuildConfig` with `getGuildPrefix` if prefix needed; use `fmtCurrency` without config emoji.

- [ ] **Step 4:** Run `npx tsc --noEmit 2>&1 | findstr credit.ts` — zero errors.

---

### Task 5: Migrate service layer (non-stock)

**Files:**
- Modify: `src/services/shopItemEffects.ts`, `src/services/educationService.ts`, `src/utils/discordLogger.ts`

- [ ] **Step 1:** Replace `getGuildConfig` with `getGuildPrefix` + `economyConfig`/`branding` as needed.

- [ ] **Step 2:** `discordLogger`: remove dependency on `logChannelId` from guild config; skip guild log if no env channel (no-op).

- [ ] **Step 3:** No remaining `guildConfigService` imports in these three files.

---

### Task 6: Migrate handlers

**Files:**
- Modify: `src/handlers/bankInteractionHandler.ts`, `src/handlers/marketInteractionHandler.ts`, `src/handlers/lifeInteractionHandler.ts`, `src/handlers/jailInteractionHandler.ts` (prefix/currency only if touched)

- [ ] **Step 1:** Replace `getGuildConfig` usage with `getGuildPrefix` + `fmtCurrency` / constants.

- [ ] **Step 2:** Do not refactor gameplay logic in `lifeInteractionHandler`.

- [ ] **Step 3:** `jail.ts`: use `DEFAULT_JAIL_FINE` + `getGuildPrefix` (keep embed UI).

---

### Task 7: Migrate game commands

**Files:**
- Modify: `coinflip.ts`, `slots.ts`, `blackjack.ts`, `roulette.ts`, `russianRoulette.ts`, `cockfight.ts`, `chicken.ts`, `feed.ts`

- [ ] **Step 1:** Replace `getGuildConfig` with `getGuildPrefix`; currency via `fmtCurrency`.

- [ ] **Step 2:** Bet limits via `getGameBetLimits(gameKey)` only.

---

### Task 8: Migrate economy commands (non-stock)

**Files:**
- Modify: `balance.ts`, `transfer.ts`, `jail.ts`, `iteminfo.ts`, `ask.ts`, `equip.ts`, `vote.ts`, `properties.ts`, `profile.ts`, `incomeCommands.ts`, `daily.ts`, `weekly.ts`, `monthly.ts`, `crime.ts`, `rob.ts`

- [ ] **Step 1:** Replace config imports per mapping table in spec.

- [ ] **Step 2:** Skip `stock.ts`, `myStocks.ts` except minimal prefix/emoji swap if needed for compile after Task 10.

---

### Task 9: Migrate life + general + admin commands

**Files:**
- Modify: life commands (`study`, `enroll`, `education`, `career`, `work`, `apply`, `jobs`, `relax`, `dropout`, `marriage`); general (`start`, `tutorial`, `casinoGuide`, `help`); admin money commands

- [ ] **Step 1:** Config migration only.

- [ ] **Step 2:** Remove dashboard links from `help.ts`, `start.ts`, `guildCreateListener.ts`, `testwelcome.ts`.

- [ ] **Step 3:** Update `branding.ts` — remove admin dashboard URL or point to site root/docs only.

---

### Task 10: Delete guildConfigService

**Files:**
- Delete: `src/services/guildConfigService.ts`

- [ ] **Step 1:** Grep `getGuildConfig|guildConfigService|LegacyGuildConfig` — only allowed in stock files (if any remain).

- [ ] **Step 2:** For `stock.ts`, `myStocks.ts`, `stockService.ts`: minimal import swap to `getGuildPrefix`/`fmtCurrency` only — no stock logic refactor.

- [ ] **Step 3:** Delete `guildConfigService.ts`.

---

### Task 11: Remove Next.js admin dashboard

**Files:**
- Delete: `dashboard/src/app/dashboard/**`
- Delete: `dashboard/src/components/dashboard/**`, admin server actions under `dashboard/src/actions/`
- Modify: `LandingNavbar.tsx`, `Footer.tsx`, `MobileSidebar.tsx`, `GeneralSidebar.tsx`, `docs/page.tsx`

- [ ] **Step 1:** Remove admin route tree.

- [ ] **Step 2:** Remove Dashboard nav links and Discord sign-in callback to `/dashboard`.

- [ ] **Step 3:** Update docs page — remove server economy management via dashboard.

- [ ] **Step 4:** Keep `/`, `/docs`, `/policy`, `/terms`, `/team`, `/changelog`.

---

### Task 12: Verification

- [ ] **Step 1:** `npx tsc --noEmit` — document any remaining stockService errors separately.

- [ ] **Step 2:** Grep checks per spec verification section.

- [ ] **Step 3:** Confirm V2 commands unchanged in behavior (shop, bank, inventory, jail fine from economyConfig).
