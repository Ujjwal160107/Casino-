# Cooldown Reminder DMs + !settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DM players when their daily/weekly/monthly/crime/hunt/work/vote cooldown lifts, with per-type opt-out via a new `!settings` command.

**Architecture:** Schedule-at-claim reminder queue — every cooldown-set site upserts one `CooldownReminder` row with the exact due time; the existing per-minute cron drains due rows and sends one combined DM per player. A new `cooldownReminderService` owns enqueue/cancel/prefs/delivery. Replaces the old vote-reminder loop.

**Tech Stack:** TypeScript, discord.js v14, Prisma (MongoDB), node-cron (existing scheduler), Redis untouched.

**Spec:** `docs/superpowers/specs/2026-07-11-cooldown-reminders-design.md`

## Global Constraints

- **Never break gameplay:** every enqueue call is fire-and-forget — wrap in `.catch(err => console.error(...))` or internal try/catch. A reminder failure must never fail a claim/shift/hunt/vote.
- **The 7 types, exactly:** `daily`, `weekly`, `monthly`, `crime`, `hunt`, `work`, `vote`. Nothing else enqueues.
- **Defaults:** reminders ON for everyone (`remindersEnabled @default(true)`, `disabledReminders @default([])`).
- **Testers never get reminders:** guard with `isTester(discordId)` from `src/utils/developerAccess`.
- **Fire-once:** a DM attempt (success or failure) deletes the reminder row. No retries; the next claim re-enqueues.
- **DM copy** exactly per spec: single-type and combined formats, footer `-# Manage these DMs with \`!settings\` in any server with Fortuna.`, commands shown with `!` prefix.
- **Auto-pause:** 3 consecutive DM failures → `remindersEnabled=false`, pending rows cleared, counter reset. Any DM success resets the counter.
- **Verification:** no test runner in the bot — `npx tsc --noEmit` must pass after every task; `npx prisma validate` after schema changes. Do NOT run `prisma db push` (deploy-time step; document it).
- **Commit style:** conventional commits, one per task, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Don't touch:** the legacy `voteReminder` / `lastVoteReminder` columns stay in the schema (stop reading them, except the lazy migration described in Task 2).

---

## File Map

| Task | Creates | Modifies |
|------|---------|----------|
| 1 | `src/services/cooldownReminderService.ts` | `prisma/schema.prisma` |
| 2 | — | `src/services/cooldownService.ts`, `src/services/huntService.ts`, `src/handlers/lifeInteractionHandler.ts`, `src/commands/economy/vote.ts`, `src/scheduler.ts` |
| 3 | `src/commands/general/settings.ts` | `src/commandRouter.ts`, `src/index.ts` |
| 4 | — | `dashboard/src/content/commands.ts`, `dashboard/src/content/modules/getting-started.ts` |

---

### Task 1: Schema + cooldownReminderService

**Files:**
- Modify: `prisma/schema.prisma` (User model ~lines 37–46 area; new model at end of file)
- Create: `src/services/cooldownReminderService.ts`

**Interfaces:**
- Produces (consumed by Tasks 2–3):
  - `REMINDER_TYPES: Record<ReminderType, { label: string; command: string }>` and `type ReminderType`
  - `enqueueReminder(discordId: string, type: ReminderType, dueAt: Date): Promise<void>` (never throws)
  - `cancelReminder(discordId: string, type: ReminderType): Promise<void>`
  - `cancelAll(discordId: string): Promise<void>`
  - `getReminderPrefs(discordId: string): Promise<{ remindersEnabled: boolean; disabledReminders: string[] }>`
  - `setReminderTypeEnabled(discordId: string, type: ReminderType, enabled: boolean): Promise<boolean>` (returns new enabled state)
  - `setMasterEnabled(discordId: string, enabled: boolean): Promise<void>`
  - `processDueReminders(client: Client): Promise<void>`

- [ ] **Step 1: Add the User fields.** In `prisma/schema.prisma`, inside `model User`, directly below the `voteReminder Boolean @default(true)` line, add:

```prisma
    remindersEnabled    Boolean  @default(true)
    disabledReminders   String[] @default([])
    reminderDmFailCount Int      @default(0)
```

- [ ] **Step 2: Add the model.** At the end of `prisma/schema.prisma`, add:

```prisma
model CooldownReminder {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  discordId String
  type      String
  dueAt     DateTime
  createdAt DateTime @default(now())

  @@unique([discordId, type])
  @@index([dueAt])
}
```

- [ ] **Step 3: Validate + regenerate client:**

Run: `npx prisma validate && npx prisma generate`
Expected: both succeed. (Do NOT run `db push` — that happens at deploy.)

- [ ] **Step 4: Create `src/services/cooldownReminderService.ts`:**

```ts
import { Client } from "discord.js";
import prisma from "../utils/prisma";
import { isTester } from "../utils/developerAccess";

export const REMINDER_TYPES = {
  daily: { label: "Daily reward", command: "!daily" },
  weekly: { label: "Weekly reward", command: "!weekly" },
  monthly: { label: "Monthly reward", command: "!monthly" },
  crime: { label: "Crime board", command: "!crime" },
  hunt: { label: "Hunt", command: "!hunt" },
  work: { label: "Work shift", command: "!work" },
  vote: { label: "Vote", command: "!vote" },
} as const;

export type ReminderType = keyof typeof REMINDER_TYPES;

const ALL_TYPES = Object.keys(REMINDER_TYPES) as ReminderType[];
const BATCH_SIZE = 200;
const MAX_DM_FAILS = 3;
const FOOTER = "-# Manage these DMs with `!settings` in any server with Fortuna.";

export function isReminderType(value: string): value is ReminderType {
  return (ALL_TYPES as string[]).includes(value);
}

export async function getReminderPrefs(discordId: string) {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { remindersEnabled: true, disabledReminders: true },
  });
  return {
    remindersEnabled: user?.remindersEnabled ?? true,
    disabledReminders: user?.disabledReminders ?? [],
  };
}

/**
 * Queue a reminder for when a cooldown lifts. Replaces any pending reminder
 * of the same type. Fire-and-forget: never throws, never blocks the caller.
 */
export async function enqueueReminder(discordId: string, type: ReminderType, dueAt: Date): Promise<void> {
  try {
    if (isTester(discordId)) return;

    // Lazy migration: carry the legacy vote opt-out into the new prefs once.
    if (type === "vote") {
      const legacy = await prisma.user.findUnique({
        where: { discordId },
        select: { voteReminder: true, disabledReminders: true },
      });
      if (legacy && legacy.voteReminder === false && !legacy.disabledReminders.includes("vote")) {
        await prisma.user.update({
          where: { discordId },
          data: { disabledReminders: { push: "vote" }, voteReminder: true },
        });
        return;
      }
    }

    const prefs = await getReminderPrefs(discordId);
    if (!prefs.remindersEnabled || prefs.disabledReminders.includes(type)) return;

    await prisma.cooldownReminder.upsert({
      where: { discordId_type: { discordId, type } },
      create: { discordId, type, dueAt },
      update: { dueAt },
    });
  } catch (err) {
    console.error(`enqueueReminder failed for ${discordId}/${type}:`, err);
  }
}

export async function cancelReminder(discordId: string, type: ReminderType): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId, type } }).catch(() => {});
}

export async function cancelAll(discordId: string): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId } }).catch(() => {});
}

/** Toggle one type. Returns the NEW enabled state of that type. */
export async function setReminderTypeEnabled(discordId: string, type: ReminderType, enabled: boolean): Promise<boolean> {
  const prefs = await getReminderPrefs(discordId);
  const disabled = new Set(prefs.disabledReminders);
  if (enabled) disabled.delete(type);
  else disabled.add(type);
  await prisma.user.update({
    where: { discordId },
    data: { disabledReminders: { set: Array.from(disabled) } },
  });
  if (!enabled) await cancelReminder(discordId, type);
  return enabled;
}

export async function setMasterEnabled(discordId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({
    where: { discordId },
    data: { remindersEnabled: enabled, ...(enabled ? { reminderDmFailCount: 0 } : {}) },
  });
  if (!enabled) await cancelAll(discordId);
}

function buildDmContent(types: ReminderType[]): string {
  if (types.length === 1) {
    const t = REMINDER_TYPES[types[0]];
    return `⏰ **Cooldown lifted!** Your **${t.label.toLowerCase()}** is ready — use \`${t.command}\`.\n${FOOTER}`;
  }
  const lines = types.map((ty) => `• **${REMINDER_TYPES[ty].label}** — \`${REMINDER_TYPES[ty].command}\``);
  return `⏰ **Cooldowns lifted!** Ready to use:\n${lines.join("\n")}\n${FOOTER}`;
}

/** Called by the per-minute cron. Drains due reminders, one combined DM per player. */
export async function processDueReminders(client: Client): Promise<void> {
  const due = await prisma.cooldownReminder.findMany({
    where: { dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: BATCH_SIZE,
  });
  if (due.length === 0) return;

  // Delete the batch up front: fire-once semantics regardless of DM outcome.
  await prisma.cooldownReminder.deleteMany({ where: { id: { in: due.map((r) => r.id) } } });

  const byUser = new Map<string, ReminderType[]>();
  for (const row of due) {
    if (!isReminderType(row.type)) continue; // unknown types are dropped silently
    const list = byUser.get(row.discordId) ?? [];
    list.push(row.type);
    byUser.set(row.discordId, list);
  }

  for (const [discordId, types] of byUser) {
    try {
      const prefs = await getReminderPrefs(discordId);
      if (!prefs.remindersEnabled) continue;
      const active = types.filter((t) => !prefs.disabledReminders.includes(t));
      if (active.length === 0) continue;

      const discordUser = await client.users.fetch(discordId).catch(() => null);
      if (!discordUser) continue;

      try {
        await discordUser.send({ content: buildDmContent(active) });
        await prisma.user.update({
          where: { discordId },
          data: { reminderDmFailCount: 0 },
        }).catch(() => {});
      } catch {
        // DMs closed or blocked — count it; auto-pause after MAX_DM_FAILS in a row.
        const user = await prisma.user.findUnique({
          where: { discordId },
          select: { reminderDmFailCount: true },
        });
        const fails = (user?.reminderDmFailCount ?? 0) + 1;
        if (fails >= MAX_DM_FAILS) {
          await prisma.user.update({
            where: { discordId },
            data: { remindersEnabled: false, reminderDmFailCount: 0 },
          }).catch(() => {});
          await cancelAll(discordId);
        } else {
          await prisma.user.update({
            where: { discordId },
            data: { reminderDmFailCount: fails },
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`processDueReminders failed for ${discordId}:`, err);
    }
  }
}
```

- [ ] **Step 5: Typecheck:**

Run: `npx tsc --noEmit`
Expected: clean (pre-existing unrelated errors, if any, must not come from the new file — record any pre-existing error count before and after).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/services/cooldownReminderService.ts
git commit -m "feat(reminders): CooldownReminder queue, prefs fields, reminder service"
```

---

### Task 2: Enqueue hooks + scheduler swap

**Files:**
- Modify: `src/services/cooldownService.ts` (both branches of `setCooldown`)
- Modify: `src/services/huntService.ts` (~line 186, the `redis.set(huntKey, ...)` site)
- Modify: `src/handlers/lifeInteractionHandler.ts` (every successful-shift `lastShift: new Date()` write — known sites near lines 489, 756, 1018, 1181; the grep in Step 3 is authoritative)
- Modify: `src/commands/economy/vote.ts` (success block after `lastVote` update; reminder-toggle block)
- Modify: `src/scheduler.ts` (swap `processVoteReminders` → `processDueReminders`, delete the old function)

**Interfaces:**
- Consumes: `enqueueReminder`, `setReminderTypeEnabled`, `getReminderPrefs`, `processDueReminders` from `../services/cooldownReminderService` (exact signatures in Task 1).

- [ ] **Step 1: Hook `cooldownService.setCooldown` (both storage branches).** In `src/services/cooldownService.ts`, add at top:

```ts
import { enqueueReminder, isReminderType } from "./cooldownReminderService";
```

In the Redis branch, right before `return { active: false, key, expiresAt, remainingSeconds: cooldownSeconds };` (the `result === "OK"` path), add:

```ts
      if (isReminderType(commandName)) {
        void enqueueReminder(discordId, commandName, expiresAt);
      }
```

In the Prisma-fallback transaction, right after the `await tx.activeEffect.create({...})` call (before its `return`), add the same two lines. Note: `isReminderType` filters to the 7 types, so `beg`/`slut`/casino cooldowns that flow through this service never enqueue.

- [ ] **Step 2: Hook `huntService`.** In `src/services/huntService.ts`, add the import:

```ts
import { enqueueReminder } from "./cooldownReminderService";
```

Directly after this existing block (~line 186):

```ts
  if (!isTester(discordId)) {
    await redis.set(huntKey, "1", "EX", tier.cooldownSeconds);
  }
```

add:

```ts
  if (!isTester(discordId)) {
    void enqueueReminder(discordId, "hunt", new Date(Date.now() + tier.cooldownSeconds * 1000));
  }
```

(Or fold into the same `if` — either is fine; keep the enqueue AFTER the redis.set.)

- [ ] **Step 3: Hook work shifts.** In `src/handlers/lifeInteractionHandler.ts`, add the import at top:

```ts
import { enqueueReminder } from "../services/cooldownReminderService";
```

Find every site that writes a successful-shift cooldown:

Run: `grep -n "lastShift: new Date()" src/handlers/lifeInteractionHandler.ts`
Expected: the shift-completion sites (approx. lines 489, 756, 1018, 1181 — line numbers may have drifted; the grep is authoritative). Skip any `lastShift: null` writes (job quit/reset).

At each site, immediately after the `prisma.user.update(...)` (or transaction) that sets `lastShift: new Date()`, add:

```ts
        void enqueueReminder(userData.discordId, "work", new Date(Date.now() + cooldownMs));
```

using the in-scope final cooldown for that code path (`cooldownMs` where the gate computed it; if a site has only seconds, use `finalCooldown * 1000`). If a site has NO cooldown value in scope, compute it exactly like the gate at ~733–745 does (job's `cooldownSeconds` minus summed `COOLDOWN_REDUCTION` active effects, floor 0). In your report, list each hooked site (line + which variable you used) — the reviewer verifies coverage.

- [ ] **Step 4: Hook vote + migrate the toggle.** In `src/commands/economy/vote.ts`:

Add import:

```ts
import { enqueueReminder, setReminderTypeEnabled, getReminderPrefs } from "../../services/cooldownReminderService";
```

(a) In the `if (hasVoted)` success block, directly after the `prisma.user.update({ ... data: { lastVote: now } })` call, add:

```ts
        void enqueueReminder(user.discordId, "vote", new Date(now.getTime() + cooldown));
```

(`cooldown` is the existing `12 * 60 * 60 * 1000` const in scope.)

(b) Replace the reminder-toggle block (the `if (args[0] === "reminder" || "remind")` body) with:

```ts
    if (args[0]?.toLowerCase() === "reminder" || args[0]?.toLowerCase() === "remind") {
        const prefs = await getReminderPrefs(user.discordId);
        const currentlyOn = prefs.remindersEnabled && !prefs.disabledReminders.includes("vote");
        const newState = await setReminderTypeEnabled(user.discordId, "vote", !currentlyOn);
        return message.reply({
            embeds: [errorEmbed(message.author, "Reminder Settings", `Vote reminders are now **${newState ? "ENABLED" : "DISABLED"}**. Manage all reminders with \`${prefix}settings\`.`)]
        });
    }
```

- [ ] **Step 5: Swap the scheduler.** In `src/scheduler.ts`:
  - Add import: `import { processDueReminders } from "./services/cooldownReminderService";`
  - In the `* * * * *` cron, replace `await processVoteReminders(client).catch((err) => console.error("Vote Reminder error:", err));` with `await processDueReminders(client).catch((err) => console.error("Cooldown reminder error:", err));`
  - Delete the entire `processVoteReminders` function at the bottom of the file.

- [ ] **Step 6: Typecheck:**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/cooldownService.ts src/services/huntService.ts src/handlers/lifeInteractionHandler.ts src/commands/economy/vote.ts src/scheduler.ts
git commit -m "feat(reminders): enqueue hooks for daily/weekly/monthly/crime/hunt/work/vote; queue-driven scheduler"
```

---

### Task 3: !settings command + interaction routing

**Files:**
- Create: `src/commands/general/settings.ts`
- Modify: `src/commandRouter.ts` (add cases `settings`, `notifications`, `reminders` next to the other general commands)
- Modify: `src/index.ts` (route customId prefix `settings:` — mirror the existing `tut:` block at ~line 196)

**Interfaces:**
- Consumes: `REMINDER_TYPES`, `ReminderType`, `isReminderType`, `getReminderPrefs`, `setReminderTypeEnabled`, `setMasterEnabled` from `../../services/cooldownReminderService`; `ensureUserAndWallet` from `../../services/walletService`.
- Produces: `handleSettings(message: Message)`, `handleSettingsInteraction(interaction: ButtonInteraction)`.

- [ ] **Step 1: Create `src/commands/general/settings.ts`:**

```ts
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import {
    REMINDER_TYPES,
    ReminderType,
    isReminderType,
    getReminderPrefs,
    setReminderTypeEnabled,
    setMasterEnabled,
} from "../../services/cooldownReminderService";

const ACCENT_COLOR = 0x9B59B6;
const TYPE_ORDER: ReminderType[] = ["daily", "weekly", "monthly", "crime", "hunt", "work", "vote"];

function buildSettingsPayload(ownerId: string, prefs: { remindersEnabled: boolean; disabledReminders: string[] }, autoPaused: boolean) {
    const container = new ContainerBuilder()
        .setAccentColor(ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("## ⚙️ Your Settings — Cooldown alarms"),
            new TextDisplayBuilder().setContent(
                "Fortuna DMs you the moment these cooldowns lift. Toggle what you want.",
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );

    if (autoPaused) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "-# Reminders were paused because your DMs were closed. Allow DMs from server members, then turn the master switch back on.",
            ),
        );
    }

    const masterRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`settings:master:${ownerId}`)
            .setLabel(prefs.remindersEnabled ? "All reminders: ON" : "All reminders: OFF")
            .setStyle(prefs.remindersEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
    );

    const typeButton = (type: ReminderType) => {
        const on = prefs.remindersEnabled && !prefs.disabledReminders.includes(type);
        return new ButtonBuilder()
            .setCustomId(`settings:toggle:${type}:${ownerId}`)
            .setLabel(`${REMINDER_TYPES[type].label}: ${on ? "ON" : "OFF"}`)
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!prefs.remindersEnabled);
    };

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...TYPE_ORDER.slice(0, 4).map(typeButton),
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...TYPE_ORDER.slice(4).map(typeButton),
    );

    return {
        components: [container, masterRow, row1, row2],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] as never[] },
    };
}

async function loadPrefsWithPauseFlag(discordId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId },
        select: { remindersEnabled: true, disabledReminders: true, reminderDmFailCount: true },
    });
    const prefs = {
        remindersEnabled: user?.remindersEnabled ?? true,
        disabledReminders: user?.disabledReminders ?? [],
    };
    // Auto-pause leaves remindersEnabled=false with a zeroed fail counter; we
    // can't distinguish it from a manual off, so show the hint whenever the
    // master is off — it's accurate advice in both cases.
    return { prefs, autoPaused: !prefs.remindersEnabled };
}

export async function handleSettings(message: Message) {
    if (!message.guildId) return;
    await ensureUserAndWallet(message.author.id, message.guildId, message.author.tag);
    const { prefs, autoPaused } = await loadPrefsWithPauseFlag(message.author.id);
    return message.reply(buildSettingsPayload(message.author.id, prefs, autoPaused));
}

export async function handleSettingsInteraction(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":"); // settings:master:<owner> | settings:toggle:<type>:<owner>
    const action = parts[1];
    const ownerId = parts[parts.length - 1];

    if (interaction.user.id !== ownerId) {
        return interaction.reply({
            content: "These settings belong to someone else. Run `settings` yourself.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }

    if (action === "master") {
        const prefs = await getReminderPrefs(ownerId);
        await setMasterEnabled(ownerId, !prefs.remindersEnabled);
    } else if (action === "toggle") {
        const type = parts[2];
        if (!isReminderType(type)) {
            return interaction.reply({ content: "Unknown setting.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const prefs = await getReminderPrefs(ownerId);
        const currentlyOn = !prefs.disabledReminders.includes(type);
        await setReminderTypeEnabled(ownerId, type, !currentlyOn);
    } else {
        return interaction.reply({ content: "Unknown setting.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const { prefs, autoPaused } = await loadPrefsWithPauseFlag(ownerId);
    return interaction.update(buildSettingsPayload(ownerId, prefs, autoPaused)).catch(() => {});
}
```

- [ ] **Step 2: Route the command.** In `src/commandRouter.ts`, next to the other general commands (near `case "tutorial":`), add:

```ts
    case "settings":
    case "notifications":
    case "reminders": {
      const { handleSettings } = require("./commands/general/settings");
      return handleSettings(message);
    }
```

(Match the file's existing lazy-require style — see the `ping` case.)

- [ ] **Step 3: Route the buttons.** In `src/index.ts`, directly below the `tut:` block (~line 196–199), add:

```ts
    if (id.startsWith("settings:")) {
      const { handleSettingsInteraction } = require("./commands/general/settings");
      return await handleSettingsInteraction(interaction);
    }
```

- [ ] **Step 4: Typecheck:**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/settings.ts src/commandRouter.ts src/index.ts
git commit -m "feat(settings): !settings dashboard with per-reminder toggles and master switch"
```

---

### Task 4: Website docs (docs-complete rule)

**Files:**
- Modify: `dashboard/src/content/commands.ts` (add `settings` entry; update `vote` entry)
- Modify: `dashboard/src/content/modules/getting-started.ts` (one pro tip)

**Interfaces:**
- Consumes: the `Command` type already in `dashboard/src/content/types.ts`. The commands page count is computed from the array — no other file changes needed.

- [ ] **Step 1: Add the settings entry.** In `dashboard/src/content/commands.ts`, in the `── general ──` section, add:

```ts
  {
    id: "settings",
    name: "!settings",
    aliases: ["notifications", "reminders"],
    module: "general",
    short: "Choose which cooldown alarms Fortuna DMs you — or silence the lot.",
    usage: "!settings",
    examples: ["!settings"],
    keyNumbers: [
      { label: "Alarm types", value: "daily, weekly, monthly, crime, hunt, work, vote" },
      { label: "Default", value: "all ON" },
    ],
    interactive: true,
  },
```

(Adapt field order/formatting to match neighboring entries exactly.)

- [ ] **Step 2: Update the vote entry.** In the same file, find the `vote` entry's `args` (the `reminder` subcommand description) and change its description to note the unification, e.g.: `"Toggle vote reminder DMs — same switch as !settings."` Keep everything else unchanged.

- [ ] **Step 3: Add the beginner tip.** In `dashboard/src/content/modules/getting-started.ts`, append to `proTips`:

```ts
    "Fortuna DMs you when your daily, work, crime, and other long cooldowns lift. Too chatty? !settings lets you pick exactly which alarms you get.",
```

- [ ] **Step 4: Verify the site builds:**

Run: `cd dashboard && npx next build`
Expected: compiles successfully; `/commands` includes the settings entry (count line updates automatically).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/content/commands.ts dashboard/src/content/modules/getting-started.ts
git commit -m "docs(web): document !settings and cooldown alarm DMs"
```

---

## Deploy notes (not part of the tasks — for the operator)

- Run `npx prisma db push` against production before starting the new bot build (new model + 3 User fields; additive, no data migration needed).
- Existing players who disabled vote reminders keep that choice (lazy migration on their next vote).
- Rollback: reverting the code is enough; the new collection/fields are inert without it.

## Plan Self-Review Notes (already applied)

- Spec coverage: schema ✓ (T1), service+delivery+auto-pause ✓ (T1), all 7 hooks ✓ (T2: cooldownService covers daily/weekly/monthly/crime via `isReminderType` filter), scheduler swap + old loop removal ✓ (T2), lazy vote migration ✓ (T1 service + T2 toggle), settings UI/routing ✓ (T3), website docs ✓ (T4), server-only note honored (handleSettings guards `!message.guildId`).
- The `disabledReminders: { set: [...] }` write and `{ push: "vote" }` are valid Prisma MongoDB list operations.
- `interaction.update` with Components V2 payload matches how other owner-locked dashboards re-render in this codebase.
- Type names consistent across tasks: `enqueueReminder`, `setReminderTypeEnabled`, `setMasterEnabled`, `getReminderPrefs`, `processDueReminders`, `isReminderType`, `REMINDER_TYPES`, `ReminderType`.
