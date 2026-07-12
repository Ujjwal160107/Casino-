# Cooldown Reminder DMs ("Alarms") — Design Spec

Date: 2026-07-11
Status: Approved by Ujjwal (scope, defaults, and architecture approved in brainstorming)

## Goal

DM players the moment a long cooldown lifts so they come back and play. Players control which reminders they get through a new `!settings` command. ON by default, per-type opt-out.

## Scope — exactly these 7 reminder types

| Type | Trigger (enqueue site) | Due time |
|---|---|---|
| `daily` | `cooldownService.setCooldown` succeeds for `daily` | now + 24h |
| `weekly` | same, for `weekly` | now + 7d |
| `monthly` | same, for `monthly` | now + 30d |
| `crime` | same, for `crime` | now + 1h |
| `hunt` | `huntService` sets `hunt:<id>` Redis key after a successful hunt | now + rifle tier's `cooldownSeconds` |
| `work` | work-shift completion in `lifeInteractionHandler` (where `lastShift` is written) | now + `finalCooldown` (post COOLDOWN_REDUCTION effects) |
| `vote` | successful `!vote` claim | now + 12h |

Explicitly out of scope: beg/slut (too short), casino game cooldowns (too frequent), any channel/guild pings (DMs only).

## Architecture: schedule-at-claim reminder queue

When a cooldown is set, upsert one pending reminder row with the exact due time. The existing per-minute cron drains due rows and DMs. Chosen over polling (Redis TTL keys vanish at expiry — nothing to poll) and Redis keyspace-expiry events (fire-and-forget; bot restart loses reminders; doesn't cover DB-based work cooldown).

### Schema (prisma/schema.prisma)

```prisma
model CooldownReminder {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  discordId String
  type      String   // "daily" | "weekly" | "monthly" | "crime" | "hunt" | "work" | "vote"
  dueAt     DateTime
  createdAt DateTime @default(now())

  @@unique([discordId, type])
  @@index([dueAt])
}
```

New fields on `User`:

```prisma
remindersEnabled    Boolean  @default(true)   // master switch
disabledReminders   String[] @default([])     // subset of the 7 type names
reminderDmFailCount Int      @default(0)      // consecutive DM failures
```

Existing `voteReminder Boolean` and `lastVoteReminder DateTime?` stay in the schema but stop being read (see Migration).

### New service: `src/services/cooldownReminderService.ts`

Single owner of the feature. Exports:

- `REMINDER_TYPES` — the 7 type names with per-type metadata `{ label, command, emoji }` used by DMs and the settings UI.
- `enqueueReminder(discordId, type, dueAt)` — no-op if master off or type disabled (reads User prefs); otherwise upsert `CooldownReminder` on `(discordId, type)` (re-claims replace the pending row). Never throws to callers (log + swallow) — a reminder failure must never break a claim.
- `cancelReminder(discordId, type)` / `cancelAll(discordId)` — used when a player disables a type / the master switch.
- `processDueReminders(client)` — called by the per-minute cron:
  1. Fetch due rows (`dueAt <= now`), oldest first, `take: 200` per run.
  2. Group by `discordId`; re-check prefs (master + type) at send time; skip+delete rows for disabled types.
  3. One combined DM per player per run, even if several types are due.
  4. Delete rows after the attempt (success or failure) — reminders never retry; the next claim re-enqueues.
  5. On DM success: reset `reminderDmFailCount` to 0. On failure (DMs closed/blocked): increment; at 3 consecutive failures set `remindersEnabled = false`, clear the player's pending rows, reset the counter.
- `isTester(discordId)` players are never enqueued (they bypass cooldowns anyway).

### DM format (in-voice, Components V2 not required — plain content string like vote reminders)

Single type due:

> ⏰ **Cooldown lifted!** Your **daily reward** is ready — use `!daily`.
> -# Manage these DMs with `!settings` in any server with Fortuna.

Multiple types due (one DM):

> ⏰ **Cooldowns lifted!** Ready to use:
> • **Daily reward** — `!daily`
> • **Crime board** — `!crime`
> • **Hunt** — `!hunt`
> -# Manage these DMs with `!settings` in any server with Fortuna.

Commands are shown with the default `!` prefix (DMs have no guild context).

### Enqueue hooks (smallest possible touch per site)

1. `src/services/cooldownService.ts` — in `setCooldown`, after a successful reservation (Redis `OK` or Prisma create), if `commandName` ∈ {daily, weekly, monthly, crime}: `enqueueReminder(discordId, commandName, expiresAt)`. One line per branch, fire-and-forget.
2. `src/services/huntService.ts` — where `hunt:<id>` is set with `tier.cooldownSeconds`: enqueue `hunt` due `now + cooldownSeconds*1000`.
3. `src/handlers/lifeInteractionHandler.ts` — everywhere a successful shift writes `lastShift: new Date()` (including the burnout branch): enqueue `work` due `now + finalCooldown*1000`. `finalCooldown` is already computed there (job cooldown minus COOLDOWN_REDUCTION). If a player later buys a cooldown reduction, the pending reminder is NOT moved — it fires at the originally computed time (acceptable, documented).
4. `src/commands/economy/vote.ts` — after a successful vote claim: enqueue `vote` due `now + 12h`.

### Scheduler integration (`src/scheduler.ts`)

- In the existing `* * * * *` cron: replace `processVoteReminders(client)` with `processDueReminders(client)` from the new service.
- Delete the local `processVoteReminders` function — the queue owns vote reminders now.

### Migration of existing vote reminders (lazy, no script)

- `!vote reminder` / `!vote remind` keeps working: it now toggles `"vote"` in `disabledReminders` (and reports the new state). It no longer writes `voteReminder`.
- Lazy migration: when enqueuing a `vote` reminder, if the user's legacy `voteReminder === false` AND `"vote" ∉ disabledReminders`, add `"vote"` to `disabledReminders` first (one-time carry-over of the old opt-out), then skip the enqueue.
- Players mid-cycle at deploy time (voted <12h ago) get no reminder for that cycle — their next vote enqueues normally. Documented, acceptable.

## `!settings` command

- New file `src/commands/general/settings.ts`, routed in `commandRouter.ts` as `settings` with aliases `notifications`, `reminders`.
- Components V2 container, owner-locked (same pattern as help/tutorial):
  - Header: "⚙️ Your Settings — Cooldown alarms" + one line: "Fortuna DMs you when these cooldowns lift. Toggle what you want."
  - Master row: one button — "All reminders: ON/OFF" (`settings:master:<ownerId>`).
  - Two rows of type toggles (4 + 3): label shows state, e.g. "Daily ✓" (Success style) / "Daily ✗" (Secondary style). customId `settings:toggle:<type>:<ownerId>`.
  - If `remindersEnabled` was auto-disabled by DM failures, show a notice line: "Reminders were paused because your DMs were closed. Turn the master switch back on once your DMs allow messages from Fortuna."
- Button handler: new `handleSettingsInteraction(interaction)` in `settings.ts`, routed from `index.ts` by customId prefix `settings:` (same pattern as `tut:`). Ownership check → toggle pref → `cancelReminder`/`cancelAll` when disabling (enabling does NOT retro-enqueue; the next claim does) → re-render the same message via update.
- Servers only: the bot's message handler ignores DMs (`!message.guild → return`), so `!settings` runs in servers — which is why the DM footer says "in any server with Fortuna". Making the bot answer DM commands is out of scope.

## Error handling & edge cases

- Enqueue failures are logged and swallowed — never block a claim/shift/hunt/vote.
- Reminders are best-effort, fire-once: a DM attempt (success or fail) deletes the row. Bot downtime longer than a due time delivers the reminder late (next cron run), never duplicated.
- Disabling a type deletes its pending row; the master switch off deletes all rows for that player.
- `@@unique([discordId, type])` guarantees at most one pending reminder per type per player; upsert handles the race with a concurrent claim.
- Jailed players still receive reminders (jail expires on its own; the DM stays valid).
- Combined DM caps at the 7 known types; unknown `type` rows (future-proofing) are deleted silently.

## Website docs (keep the docs-complete rule)

In `dashboard/src/content/commands.ts`:
- Add a `settings` entry (module `general`, aliases `notifications, reminders`, interactive: true, short in-voice description, usage `!settings`).
- Update the `vote` entry's `!vote reminder` arg description to mention it's the same toggle as `!settings`.

In `dashboard/src/content/modules/getting-started.ts`: add one pro tip mentioning cooldown alarm DMs and `!settings`.

## Verification (no test runner in the bot)

- `npx tsc --noEmit` clean.
- `npx prisma validate` + `npx prisma db push` (dev DB) for the new model/fields.
- Manual smoke on the dev bot: claim `!daily` as a non-tester account with a shortened cooldown (temporarily set `TIME_GATED_REWARDS.daily.cooldownSeconds = 90` locally), confirm: pending row appears; DM arrives ~1 min after expiry; row deleted; `!settings` toggles render and persist; disabling daily deletes the pending row; `!vote reminder` flips the same toggle shown in `!settings`; closed-DM account auto-disables after 3 fires.
- Website: `npx next build` in dashboard/ passes; `/commands` shows the settings entry.

## Out of scope (explicit)

- Per-guild or channel-based notifications; slash-command settings UI; reminder snoozing; casino/beg/slut reminders; rescheduling pending reminders when cooldown-reduction items are consumed; a data migration script for `voteReminder` (lazy migration covers it).
