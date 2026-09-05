# Investment Returns & Card-Exclusive Items — Design

**Date:** 2026-09-05
**Status:** Approved pending user spec review

## Goal

Two player-facing changes to the bank and shop:

1. **Investment returns are visible.** When an FD or RD matures, the player is told what it
   paid, and the bank's Investments tab keeps a history of past returns.
2. **Some shop items are card-exclusive.** A handful of items can only be bought on credit
   with a Fortuna Card of a given tier or higher. This gives every card tier a reason to
   exist and forces real card usage (purchase → statement → payment → score).

## Decisions (confirmed with user)

1. **Audience for returns: players only.** No line is posted to the owner log channel.
2. **Card gate rule: tier ladder, must pay on credit.** Each gated item names a minimum
   tier. Wallet purchase is refused. Holding a card is not enough; the purchase itself
   goes on the card.
3. **Default item set** (below) chosen so every price fits inside its tier's weekly spend
   cap. Two consumables low in the ladder for repeat usage, cosmetics high for upgrade
   motivation. The user may swap items later; the invariant test guards the cap rule.
4. **DM on maturity is in**, governed by the existing `!settings` reminder toggles.

## Current behaviour (why this is needed)

- `processAllInvestments` runs from a per-minute cron and calls `matureInvestment`, which
  flips `status` to `COMPLETED` and increments the bank. Nothing is recorded about the
  interest or payout, and no message is sent. Players never see their returns.
- `!bank collect` and the `invest_collect_btn` handler still exist but the button is no
  longer rendered anywhere, and by the time a player could press it the cron has already
  matured everything. They stay as-is (harmless if the cron ever lags).
- The card gives debt risk and weekly interest, and nothing else. Tiers differ only in
  limits, so nobody upgrades. The shop already has `creditBlocked` on catalog entries and
  a `requirements` JSON checked inside `buyItem`, so a card gate is a small addition to an
  existing seam.

---

## Part 1: Investment returns

### Data model (`prisma/schema.prisma`, model `Investment`)

Three new optional fields:

```prisma
completedAt    DateTime?
interestEarned Float?   // what calculateInvestmentPayout said the deposit earned
payout         Float?   // what was actually credited (after the MAX_SAFE_BALANCE cap)
```

- Optional on purpose: `db push` does not backfill, and Prisma's Mongo connector throws
  when a required field is absent from a document (same reasoning as
  `GuildSettings.robEnabled`). No backfill script.
- Storing interest and payout separately makes a bank-cap shortfall derivable:
  `shortfall = amount + interestEarned - payout`, shown when `> 0`.
- Legacy `COMPLETED` rows have none of these fields and are excluded from history with
  the Mongo-native positive filter `completedAt: { isSet: true }`. Never use
  `not: null` on these fields (see the Prisma/Mongo null gotcha already recorded for
  this repo).

### Service (`src/services/bankingService.ts`)

- `matureInvestment`: the `COMPLETED` update also sets `completedAt: now`,
  `interestEarned: calculated.interest`, `payout`. Consumers read `userId`, `interestEarned`
  and `payout` from the returned `investment` row. Everything else is unchanged, so the
  cron path and the collect path both record.
- `processAllInvestments()`: returns the array of non-null matured results instead of a
  count. The scheduler logs `results.length`.
- New `getInvestmentReturns(discordId, limit = 5)` returning
  `{ recent: Investment[]; lifetimeInterest: number }`:
  - `recent`: `where { userId, status: "COMPLETED", completedAt: { isSet: true } }`,
    `orderBy { completedAt: "desc" }`, `take: limit`.
  - `lifetimeInterest`: `aggregate({ _sum: { interestEarned: true } })` over the same
    filter, `?? 0`.

### DM on maturity

> **Adapted 2026-09-05:** the DM notices work (spec
> `docs/superpowers/specs/2026-09-05-dm-notices-design.md`, merge `23c288b`) landed
> first. Its "Coordination" section prescribes the shape below; the earlier plan for a
> `sendReminderDm` extraction, a `REMINDER_TYPES` entry and a `TYPE_ORDER` edit is void.

**Registry (`src/services/dmPrefsService.ts`):** add
`investment: { label: "Investment payouts", group: "account" }` to `DM_NOTICE_TYPES`.
No `command` field, so it never enters the cooldown reminder queue. `!settings` renders
the account group from the registry, so the toggle appears with no settings change; the
account group ends card, market, investment.

**Notice (`src/services/dmNoticeService.ts`):**

- `investmentMaturedNotice(matured: MaturedInvestment[]): ContainerBuilder` — built with
  `noticeContainer(Mascot.Emotes.Bank, "Investment matured!", body, hint)`. One line per
  deposit; a shortfall sentence only when the bank cap cut a payout; the hint points at
  `!bank invest` and `!settings`.
- `notifyInvestmentsMatured(client, matured)` — groups by `m.investment.userId` and calls
  `sendOptOutDm(client, discordId, "investment", container)`, which applies the master
  switch, the per-type toggle, the tester skip and the closed-DM strike count. Never
  throws; per-user errors are logged.
- Body copy:

  ```
  ## Investment matured!
  • **FD** — 💰 100,000 locked for 30 days → paid **💰 100,821** (+821 interest)
  • **RD** — 💰 50,000 locked for 10 days → paid **💰 50,054** (+54 interest)

  Your bank was full, so 5,000 of this payout was lost.   ← only when shortfall > 0
  -# See your history in `!bank invest`. Manage these DMs with `!settings`.
  ```

**Scheduler (`src/scheduler.ts`):** after `processAllInvestments()`, call
`notifyInvestmentsMatured(client, matured).catch(log)`.

**Settings:** no change; the registry drives it.

### Bank Investments tab (`src/commands/economy/bank.ts`)

- `buildBankInvestmentsContainer` gains a fifth parameter
  `returns: { recent; lifetimeInterest }`.
- Header subtitle gains a line: `Lifetime interest earned: **X**` (always shown).
- After the active list: a divider separator, `### Recent returns`, and **one**
  `TextDisplay` holding up to five lines (packed into one component so the 40-component
  cap is not eroded):

  ```
  FD · **100,000** → **100,821** (+821) · 3 days ago
  RD · **50,000** → **50,054** (+54) · 1 week ago · ⚠ bank full, −5,000
  ```

  Relative time uses `<t:…:R>`. If there are none: `-# No matured deposits yet.`
- Both call sites (`bankInteractionHandler` case `"invest"` and `bank.ts` `execute`
  for `investments`) fetch `getInvestmentReturns(user.id)` alongside
  `getFinancialSummary` with `Promise.all`.

### Docs (`dashboard/src/content/modules/bank-and-credit.ts`)

Replace the maturity sentence in the FD section (currently "At maturity the payout lands
back in your bank automatically — Fortuna checks every minute, and !bank collect sweeps
anything the automation hasn't.") with one that says the payout lands automatically,
Fortuna DMs the principal, interest and payout (toggle under `!settings`), and the
Investments tab keeps the last five returns plus lifetime interest earned.

---

## Part 2: Card-exclusive items

### Rule

An item with `requiresCardTier` set can be bought only when all of these hold:

1. `paymentSource === "card"`.
2. The card's `status` is `ACTIVE`.
3. `cardTierMeets(card.tier, requiresCardTier)` — the card's tier is at or above the
   required one in `CARD_TIER_ORDER`.

Testers bypass the gate, consistent with every other purchase check in `buyItem`.

### Default item set

| Tier (weekly spend cap) | Items | Prices |
|---|---|---|
| Starter (750,000) | Celestial Harp, Demonic Harp | 450,000 · 600,000 |
| Gold (3,000,000) | Crown of Greed, Royal Cape | 1,000,000 · 2,500,000 |
| Platinum (10,000,000) | Platinum Crown, Void Wings | 6,500,000 · 10,000,000 |
| Black (25,000,000) | Celestial Halo, Emperor's Throne | 15,000,000 · 25,000,000 |

Fortune Dragon Cloak, Galaxy Walkout, Crown of Immortals and anything above stay
wallet-buyable: they exceed even the Black weekly cap, so a card gate would make them
unbuyable. Existing owners are unaffected; only new purchases are gated.

### Catalog (`src/utils/shopCatalog.ts`)

- `ShopCatalogItem.requiresCardTier?: CardTierName` (type imported from
  `economyConfig`, which has no imports of its own, so no cycle).
- Set on the eight items above.
- New export `getCardExclusiveItems(tier: CardTierName): ShopCatalogItem[]` filtering
  `SHOP_CATALOG` on `requiresCardTier === tier`.
- Invariants enforced by a unit test, not at runtime:
  - no item has both `creditBlocked` and `requiresCardTier`;
  - every gated item's `price` is `<=` its tier's `weeklySpendCap` and `<= creditLimit`.

### Tier comparison (`src/utils/economyConfig.ts`)

`cardTierMeets(cardTier: string, minTier: CardTierName): boolean` using
`CARD_TIER_ORDER.indexOf`. Unknown card tiers rank as Starter (matches
`getCardTierConfig`'s fallback).

### Enforcement (one seam)

- `src/services/creditCardService.ts` — `chargeCardPurchaseTx(trx, discordId, amount,
  meta, opts?: { minTier?: CardTierName })`. After the existing `ACTIVE` check:
  if `opts.minTier` is set and `!cardTierMeets(card.tier, opts.minTier)`, throw
  `This item needs a **GOLD** Fortuna Card or higher. Your card: **STARTER**.` (service errors keep the uppercase enum, matching the existing card-service messages; UI labels use the title-case form)
  Card rules stay in the card service.
- `src/services/shopService.ts` — `buyItem`:
  - Hoist the catalog lookup out of the `paymentSource === "card"` branch into a small
    `findCatalogEntry(item)` helper (by `catalogKey` first, name fallback — the same
    match `getItemEffectSource` already does; both use the helper).
  - New check next to the `creditBlocked` one:
    `if (entry?.requiresCardTier && paymentSource !== "card" && !tester)` throw
    `**Royal Cape** is card-exclusive. Buy it on credit with a **GOLD** Fortuna Card or
    higher: \`shop buy card Royal Cape\`.`
  - Pass `{ minTier: entry?.requiresCardTier }` into `chargeCardPurchaseTx`.
- No pre-check is added in `shop.ts`. Every purchase path (wallet button, credit
  confirm button, `!shop buy`, `!shop buy card`) already funnels through `buyItem`, and
  each caller already surfaces its error. (The existing `creditBlocked` pre-check is
  duplicated in three places in `shop.ts`; that duplication is left alone here.)

### Display (`src/commands/economy/shop.ts`, `buildItemInfoCard`)

- Signature changes from `canUseCredit: boolean` to
  `card: { status: string; tier: string } | null`. The single caller passes
  `cardSummary.card`. Inside: `canUseCredit = card?.status === "ACTIVE"`;
  `meetsTier = !item.requiresCardTier || (canUseCredit && cardTierMeets(card.tier, item.requiresCardTier))`.
- For a gated item:
  - Under the price line: `-# {Credit emote} **Gold Card exclusive** · credit only`.
  - The wallet **Buy** button is not rendered.
  - **Buy (Credit)** is rendered, disabled unless `meetsTier`.
  - When not `meetsTier`, one hint line:
    no card → `-# Requires an active **Gold** Fortuna Card or higher. Apply with \`!card\`.`
    lower card → `-# Your **Starter** card doesn't qualify. Upgrade with \`!card upgrade\`.`
- Non-gated items render exactly as today.

### Card screens (`src/commands/economy/bank.ts`)

- `formatTierUnlocks(tier)` → `Unlocks: **Celestial Harp**, **Demonic Harp**` or `null`.
- Appended to the per-tier text in both `addCardTierSections` (catalog view) and the
  apply view loop. The "mine" view is unchanged.

### Docs (`dashboard/src/content/modules/`)

- `items-and-shop.ts`: extend the tip on line 11 with a sentence that eight items are
  card-exclusive and credit-only; prefix the effect text of the three gated general-store
  rows with `**Starter/Gold Card exclusive.**`; add one sentence to the cosmetics paragraph
  listing the five gated cosmetics and their tiers.
- `bank-and-credit.ts`: one new paragraph in the card tiers section listing what each
  tier unlocks, and a sentence in the strategy section that exclusives are the reason to
  climb the ladder.

---

## Not in scope

- Removing the dead collect button or `!bank collect`.
- New shop items, assets, or effects.
- An owner-log line for maturities.
- Tutorial text.
- Consolidating the three duplicated `creditBlocked` pre-checks in `shop.ts`.

## Testing

Vitest with the Mongo memory-server (`npx vitest run`), following `test/helpers.ts`
conventions. New files:

- `test/bank/investment-returns.test.ts`
  - `matureInvestment` writes `completedAt`, `interestEarned`, `payout`.
  - Capped case: bank near `MAX_SAFE_BALANCE` → `payout < amount + interestEarned`.
  - A deposit with a future `maturityDate` is untouched.
  - `getInvestmentReturns` excludes a `COMPLETED` row seeded without `completedAt`,
    orders newest first, respects `limit`, and sums `lifetimeInterest` correctly.
  - `processAllInvestments` returns the matured results.
- `test/dm/investment-notice.test.ts`
  - Registry entry is an account notice with no command; account group is card, market, investment.
  - Notice: bank thumbnail, one line per deposit with the numbers; shortfall line only when capped.
  - One DM per user with all their matured deposits (fake DM client from `test/dm/helpers.ts`).
  - Skipped when the `investment` toggle is off.
- `test/shop/card-exclusive.test.ts`
  - Wallet purchase of a gated item throws.
  - Credit purchase with a Starter card for a Gold item throws.
  - Credit purchase with a Gold card for a Gold item succeeds and writes a
    `CardTransaction`.
  - Tester bypass.
  - Catalog invariants (no `creditBlocked` + `requiresCardTier`; price within the
    tier's `weeklySpendCap` and `creditLimit`).
  - `cardTierMeets` unit cases including an unknown tier.
- `npm run typecheck` exits 0.
- Manual smoke: open a gated item's info card with no card, a Starter card, and a Gold
  card; open `!bank invest` after a one-day FD whose `maturityDate` was set into the past
  and let the cron mature it; confirm the DM and the Recent returns line.

## Rollout

- `npx prisma db push` for the three optional fields. No backfill.
- Deploy is a single release; there is no ordering dependency between the two parts.
