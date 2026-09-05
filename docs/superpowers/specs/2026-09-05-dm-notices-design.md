# DM notices: one look, one opt-out seam, two new notices

**Date:** 2026-09-05
**Status:** approved in brainstorm, awaiting implementation plan

## Goal

Every DM Fortuna sends a player should be a ComponentsV2 container in the house style
(text left, application-emoji thumbnail right, `-#` hint), built and sent through one
seam. Add the two notices players are missing while away (weekly card statement, market
sale), and move the `!settings` buttons inside the container.

## Scope

**In**

- Restyle the four existing DMs: robbed, padlock, tax raid, cooldown lifted.
- New: weekly card DM (statement issued + last statement settled, one DM per Monday).
- New: market sale DM to the seller (item listings and hunt-part listings).
- `!settings`: buttons inside the container, grouped; two new toggles.
- Shared plumbing: notice container helper, raw DM sender, opt-out sender with strike
  bookkeeping, registry with groups.

**Out**

- FD/RD maturity DM: owned by the investment-returns work (see Coordination).
- Expired market listings, transfers received, jail release, zoo deaths: no DM. The
  first two are low value or already pinged; the last two resolve on the player's own
  next command.
- Any schema change. `remindersEnabled`, `disabledReminders`, `reminderDmFailCount`
  keep their names and meaning.

## Current state

| Site | Trigger | Shape today |
|---|---|---|
| `victimNotifyService.ts` `notifyRobbed` | `!rob` success | plain `content`, always on |
| `victimNotifyService.ts` `notifyPadlockUsed` | `!rob` blocked | plain `content`, always on |
| `cooldownReminderService.ts` `processDueReminders` | per-minute cron | plain `content` with unicode ⏰, opt-out, 3-strike auto-pause inline |
| `taxService.ts` `executeRaid` | hourly cron | `errorContainer` with mascot Fail thumbnail, raw `toLocaleString` coins |

Each file repeats fetch-user, send, swallow. Card settlement (Monday cron) and market
sales are silent.

## Design

### Modules

Three modules, no import cycle:

```
componentsV2.ts ── noticeContainer()
        ▲
dmNoticeService.ts ── sendDm, sendOptOutDm, builders, notify*   ──► dmPrefsService.ts
        ▲                                                                    ▲
cooldownReminderService.ts (queue only) ─────────────────────────────────────┘
```

**`src/services/dmPrefsService.ts`** (new). One responsibility: how a player controls
Fortuna's DMs.

- `DM_NOTICE_TYPES` registry, moved from `cooldownReminderService.REMINDER_TYPES`:

  | key | label | command | group |
  |---|---|---|---|
  | daily | Daily reward | `!daily` | cooldown |
  | weekly | Weekly reward | `!weekly` | cooldown |
  | monthly | Monthly reward | `!monthly` | cooldown |
  | crime | Crime board | `!crime` | cooldown |
  | hunt | Hunt | `!hunt` | cooldown |
  | work | Work shift | `!work` | cooldown |
  | vote | Vote | `!vote` | cooldown |
  | card | Card statements | (none) | account |
  | market | Market sales | (none) | account |

  `command` is optional; only cooldown types have one. Exports: `DmNoticeType`,
  `isDmNoticeType`, `CooldownReminderType` (the subset with a command).
- `getDmPrefs(discordId)` returns `{ remindersEnabled, disabledReminders }` (was
  `getReminderPrefs`).
- `setNoticeTypeEnabled(discordId, type, enabled)`, `setMasterEnabled(discordId, enabled)`.
  These no longer delete queued reminders (see Decisions).
- `recordDmDelivered(discordId)` resets `reminderDmFailCount` to 0.
- `recordDmFailed(discordId)` increments it; at `MAX_DM_FAILS` (3) sets
  `remindersEnabled: false` and resets the count. Returns `{ paused: boolean }`.
- No Discord import, no queue knowledge.

**`src/services/dmNoticeService.ts`** (renamed from `victimNotifyService.ts`). One
responsibility: build and send player DMs.

- `sendDm(client, userId, container): Promise<boolean>`: fetch user, `send(v2Reply(container))`,
  swallow every failure, return delivered. Never throws.
- `sendOptOutDm(client, discordId, type, container): Promise<void>`: skip testers
  (`isTester`, mirrors `enqueueReminder`), skip if master off or type disabled, else
  `sendDm` then `recordDmDelivered` or `recordDmFailed`. Never throws.
- One builder per notice returning a `ContainerBuilder` (pure, testable), and one
  `notify*` per notice that builds and sends:
  - `notifyRobbed(client, victimId, robberName, amount, guildName)`: always on
  - `notifyPadlockUsed(client, victimId, robberName, guildName)`: always on
  - `notifyTaxRaid(client, discordId, seized, walletNow)`: always on
  - `notifyCooldownsLifted(client, discordId, types)`: caller has already filtered by
    prefs, so this calls `sendDm` plus the delivered/failed bookkeeping (see Flows)
  - `notifyCardWeekly(client, { issued, settled })`: opt-out type `card`
  - `notifyMarketSale(client, sale)`: opt-out type `market`

**`src/services/cooldownReminderService.ts`**: queue only. `enqueueReminder`,
`enqueueWorkReminder`, `cancelReminder`, `cancelAll`, `processDueReminders`. The registry,
prefs functions, `buildDmContent`, `FOOTER`, `MAX_DM_FAILS` and the inline strike block
leave this file.

### Container helper

`componentsV2.ts` gains:

```ts
export function noticeContainer(emote: string, title: string, body: string, hint?: string): ContainerBuilder
```

Wraps `statusContainer("info", title, body, { hint, thumbnailUrl: getEmoteUrl(emote) ?? undefined })`.
House rules hold: no accent color, no footer, no timestamp. Titles are text only; the
thumbnail carries the emoji. Money is always `fmtCurrency`.

### The notices

Opt-out notices end their hint with "Manage these DMs with `!settings`."

| Notice | Thumbnail (`Mascot.Emotes`) | Title | Body | Hint |
|---|---|---|---|---|
| Robbed | `Gun` | You've been robbed! | `**{robber}** lifted **{amount}** from your wallet in **{guild}**.` (guild clause omitted when null) | `-# Wallet money can be robbed. Bank what you don't need with !deposit.` |
| Padlock | `Lock` | Your Padlock just paid for itself. | `**{robber}** tried to rob you in **{guild}**. The padlock blocked the hit and broke in the process.` | `-# Padlocks are single-use. Grab another: !shop buy padlock.` |
| Tax raid | `Police` | Tax raid | `The IRS audited your financial activity.` newline `**Seized:** {amount}` newline `**Wallet now:** {amount}` newline `Your criminal heat has been reset.` | `-# Heat builds from crime and robbery. Check it with !heat.` |
| Cooldown (1) | `Cooldown` | Cooldown lifted! | `Your **{label}** is ready. Use {command}.` | `-# Manage these DMs with !settings in any server with Fortuna.` |
| Cooldown (n) | `Cooldown` | Cooldowns lifted! | `Ready to use:` then one `• **{label}** — {command}` line per type | same |
| Card weekly | `Credit` | by outcome, below | last week's result, then this week's statement | `-# Pay with !card pay <amount>. Manage these DMs with !settings.` |
| Market sale | `Market` | Your listing sold! | `**{qty}× {name}** sold for **{total}**. After the **{fee}** fee you received **{net}**.` plus optional garnish line | `-# List more in !market. Manage these DMs with !settings.` |

Command names in hints are rendered in inline code in the real copy; the table omits
the backticks for readability.

**Card weekly.** Inputs per user: optional `settled` (last week's statement) and
optional `issued` (this week's). Title and first block follow `settled.status`:

- `PAID_FULL`: title "Card statement paid in full", body
  `Last week's statement is paid in full. Credit score **+{delta}**.`
- `PAID_MINIMUM`: title "Minimum payment received", body
  `You paid the minimum on last week's statement. Credit score **+{delta}**. **{remaining}** rolls forward.`
- `MISSED`: title "Card payment missed", body
  `You missed last week's minimum. Credit score **{delta}**. Interest of **{interest}** was added. Your card is now **{cardStatus}**.`
  When `cardStatus === "LOCKED"`, append `Income is garnished at 25% until the balance clears.`
- No `settled`: title "New card statement".

Second block, only when `issued.statementBalance > 0`:
`**New statement:** {balance}` newline `**Minimum due:** {minimum} by <t:{dueAtUnix}:R>`.

No DM when there is no `settled` and the issued balance is 0.

**Market sale.** `sale = { sellerId, name, amount, totalPrice, fees, garnished }`.
Garnish line, only when `garnished > 0`: `**{garnished}** went to your delinquent card.`
Hunt-part sales never garnish today, so `garnished` is 0 for them; that behaviour is
not changed here.

### Flows

**Cooldown.** `processDueReminders` drains the batch, groups by user, filters by prefs
exactly as today, then calls `notifyCooldownsLifted(client, discordId, active)`. That
function builds the container, calls `sendDm`, then `recordDmDelivered` or
`recordDmFailed`. The prefs check stays in the drain because it needs the per-type
filter before grouping.

**Card.** In `creditCardService.ts`:

- `generateStatementForCard` returns `StatementIssued | null`:
  `{ userId, tier, statementBalance, minimumDue, dueAt }`.
- `settleStatement` returns `StatementSettled | null`:
  `{ userId, status, scoreDelta, interestCharged, cardStatus, remainingBalance }` where
  `remainingBalance = max(0, statementBalance - amountPaid)`.
- `generateWeeklyStatements` and `settleDueStatements` return arrays.
- `processWeeklyCardSettlement` returns `{ issued: StatementIssued[]; settled: StatementSettled[] }`.
- No Discord import.

`scheduler.ts` logs `issued.length` and `settled.length` as today, then
`await notifyCardWeekly(client, result)`, which groups both lists by `userId` and sends
one `sendOptOutDm(..., "card", ...)` per user. Generation runs before settlement, so
`settled` is last week's statement and `issued` is this week's.

**Market.** `buyListing` adds `totalPrice` and `garnished` to its return (it already
computes both). `buyHuntPartListing` adds `totalPrice`. After a successful buy, each of
the three call sites fires `void notifyMarketSale(client, { ...result, name })`:
`market.ts` (item buy, part buy) and the `bm_buy_confirm:` button handler in `index.ts`.

**Existing sites.** `rob.ts` changes its import path only. `taxService.executeRaid`
replaces the inline DM with `notifyTaxRaid(client, discordId, result.removedAmount, result.newBalance)`.
`settings.ts` and `vote.ts` import from `dmPrefsService`.

### Settings panel

All buttons move inside the container:

```
+----------------------------------------------------+
| ## Your Settings                            [gear] |  section + Settings emote thumbnail
| Fortuna DMs you when these happen. Toggle          |
| what you want.                                     |
| -# Reminders are currently off. ...                |  only when master is off
| -------------------------------------------------- |
| [All DMs: ON]                                      |
| -------------------------------------------------- |
| ### Cooldown alarms                                |
| [Daily: ON] [Weekly: ON] [Monthly: ON] [Crime: ON] |
| [Hunt: ON]  [Work: ON]   [Vote: ON]                |
| -------------------------------------------------- |
| ### Account notices                                |
| [Card statements: ON] [Market sales: ON]           |
|                                                    |
| -# Security alerts (robbery, padlock, tax raid)    |
|    are always on.                                  |
+----------------------------------------------------+
```

- Rows are `ActionRowBuilder`s added to the container via `addActionRowComponents`.
- Groups and order come from `DM_NOTICE_TYPES` (insertion order, filtered by `group`,
  chunked into rows of 4). `TYPE_ORDER` is deleted.
- Button styles unchanged: type buttons Success when on, Secondary when off, disabled
  while master is off; master Success or Danger. Custom IDs unchanged
  (`settings:master:<owner>`, `settings:toggle:<type>:<owner>`).
- Group heading text: `### Cooldown alarms`, `### Account notices`.
- Component count about 27 of Discord's 40. A per-type section layout was rejected at 37.

## Decisions

- **ComponentsV2, house style, no accent color.** Consistent with every command reply;
  the raid DM already proves containers work in DMs.
- **Card: every settlement outcome DMs**, not only misses. Combined with the new
  statement into one Monday DM per cardholder.
- **No DM for a zero statement with nothing settled.**
- **Card and market are opt-out via `!settings`** with their own toggles, sharing the
  master switch and the 3-strike auto-pause.
- **Toggling off no longer deletes queued reminders.** The drain skips disabled types
  and a paused master at fire time, so the deletes were redundant. Dropping them is
  what keeps prefs independent of the queue. A player who toggles off and back on
  before the due time still gets that reminder.
- **Tester skip lives in `sendOptOutDm`.** `enqueueReminder` already skips testers; one
  rule for the opt-out tier. Always-on notices do not skip testers (unchanged).
- **Market garnish line** surfaces a number the seller would otherwise find confusing.
  Hunt-part sales not garnishing is pre-existing and out of scope.

## Error handling

- `sendDm` returns false on any failure (unknown user, closed DMs 50007, network) and
  never throws. `sendOptOutDm` and every `notify*` catch everything; a per-user failure
  is logged and the loop continues.
- Card and market notifications are fire-and-forget from their callers; they never
  block the command reply or the cron.
- DM containers are small, so the 40-component cap is not a concern there. The settings
  panel is counted above.

## Coordination with the investment-returns work

`docs/superpowers/specs/2026-09-05-investment-returns-and-card-exclusive-items-design.md`
plans an `investment` reminder type, a `sendReminderDm(client, discordId, content)`
extraction in `cooldownReminderService`, a plain-content `investmentNotifyService`, and
appending `investment` to `TYPE_ORDER`. Those touch the same seams this spec moves.

Whichever lands second adapts:

- If this lands first: the investment work adds
  `investment: { label: "Investment payouts", group: "account" }` to `DM_NOTICE_TYPES`,
  builds its DM with `noticeContainer(Mascot.Emotes.Bank, ...)` and sends via
  `sendOptOutDm(client, discordId, "investment", container)`. No `sendReminderDm`, no
  `TYPE_ORDER` edit.
- If the investment work lands first: this plan renames its `sendReminderDm` into
  `sendOptOutDm`, moves its `investment` entry into the registry with `group: "account"`,
  and restyles its DM through `noticeContainer`.

Either way the `!settings` account group ends with three toggles: card, market,
investment. Component count stays under 30.

## Testing

Vitest with the existing Mongo memory-server harness (`test/`).

**Pure, no database:**

- `noticeContainer` JSON: section with the emote's CDN URL as thumbnail; hint present
  after a separator when given, absent otherwise.
- Each notice builder's JSON contains its title, `fmtCurrency` amounts and hint.
- Card weekly: four title variants; MISSED with LOCKED includes the garnish sentence;
  zero issued balance omits the statement block; no `settled` plus zero balance returns
  null (no container).
- Market: garnish line only when `garnished > 0`.
- Settings payload: ten toggles, no top-level `ActionRow`, total component count under
  40, type buttons disabled when master is off.

**Mongo-backed:**

- `sendOptOutDm` with a fake client: disabled type sends nothing; master off sends
  nothing; delivered resets `reminderDmFailCount`; three failures set
  `remindersEnabled: false` and reset the count.
- `settleStatement` returns the right outcome object for PAID_FULL, PAID_MINIMUM, MISSED
  (score delta, interest, card status, remaining balance).
- `buyListing` returns `totalPrice` and `garnished`; `buyHuntPartListing` returns
  `totalPrice`.

**Before done:** `npx tsc --noEmit` and `npm test` clean.

## Files

- new: `src/services/dmPrefsService.ts`
- rename: `src/services/victimNotifyService.ts` to `src/services/dmNoticeService.ts`
- edit: `src/utils/componentsV2.ts`, `src/services/cooldownReminderService.ts`,
  `src/services/creditCardService.ts`, `src/services/marketService.ts`,
  `src/services/huntPartService.ts`, `src/services/taxService.ts`, `src/scheduler.ts`,
  `src/commands/economy/rob.ts`, `src/commands/economy/market.ts`,
  `src/commands/economy/vote.ts`, `src/commands/general/settings.ts`, `src/index.ts`
- tests: `test/dm/notices.test.ts`, `test/dm/prefs.test.ts`, `test/dm/settings.test.ts`,
  card and market return-shape tests alongside existing suites
