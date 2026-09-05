# DM Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every DM Fortuna sends a player is a house-style ComponentsV2 container built and sent through one seam; cardholders and market sellers get the notices they are missing; the `!settings` buttons move inside the container.

**Architecture:** Three modules with no import cycle. `dmPrefsService` owns the notice registry, prefs and strike bookkeeping (no Discord, no queue). `dmNoticeService` (renamed from `victimNotifyService`) owns one `noticeContainer`-based builder per notice, the raw `sendDm`, and the prefs-gated `sendOptOutDm`. `cooldownReminderService` keeps only the queue. Domain services (`creditCardService`, `marketService`) return outcome data and never import Discord; the scheduler and command call sites hand that data to `notify*` functions.

**Tech Stack:** TypeScript 5 (strict), discord.js 14.25 ComponentsV2 builders, Prisma on MongoDB, vitest with the repo's mongodb-memory-server harness (`test/`).

**Spec:** `docs/superpowers/specs/2026-09-05-dm-notices-design.md`

## Global Constraints

- House rules for every container: no accent color, no footer, no timestamp. Titles are text only; the thumbnail carries the emoji.
- Money is always rendered with `fmtCurrency` from `src/utils/format.ts`.
- Opt-out notices end their hint with "Manage these DMs with `!settings`."
- No Prisma schema change. `remindersEnabled`, `disabledReminders`, `reminderDmFailCount` keep their names and meaning.
- Settings button custom IDs stay `settings:master:<owner>` and `settings:toggle:<type>:<owner>`.
- Settings payload stays under Discord's 40-component cap (target about 27).
- Opt-out DMs skip testers (`isTester` from `src/utils/developerAccess.ts`); always-on notices do not.
- A closed DM is a normal outcome. No DM path may throw into gameplay or a cron.
- Run tests with `npx vitest run <file>`; `.env.test` must exist (it does on this machine). The harness starts Mongo for every run, so even pure tests take a few seconds.
- Every commit message ends with:

  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o
  ```

## File map

| File | Responsibility after this plan |
|---|---|
| `src/utils/componentsV2.ts` | + `noticeContainer(emote, title, body, hint?)` |
| `src/services/dmPrefsService.ts` (new) | `DM_NOTICE_TYPES` registry, prefs read/write, strike bookkeeping |
| `src/services/dmNoticeService.ts` (renamed from `victimNotifyService.ts`) | `sendDm`, `sendOptOutDm`, every notice builder and `notify*` |
| `src/services/cooldownReminderService.ts` | queue only: enqueue, cancel, drain |
| `src/services/creditCardService.ts` | returns `StatementIssued` / `StatementSettled` outcome objects |
| `src/services/marketService.ts`, `src/services/huntPartService.ts` | buy results gain `totalPrice` (and `garnished` for items) |
| `src/services/taxService.ts` | calls `notifyTaxRaid` |
| `src/scheduler.ts` | logs card counts, calls `notifyCardWeekly` |
| `src/commands/economy/rob.ts` | import path only |
| `src/commands/economy/market.ts`, `src/index.ts` | call `notifyMarketSale` after a buy |
| `src/commands/economy/vote.ts`, `src/services/cooldownService.ts` | import from `dmPrefsService` |
| `src/commands/general/settings.ts` | grouped toggles inside the container, driven by the registry |
| `test/dm/*.test.ts`, `test/dm/helpers.ts` | new tests and shared test helpers |
| `test/card/settlement-outcomes.test.ts`, `test/market/buy-result.test.ts` | return-shape tests |

---

### Task 1: `noticeContainer` helper

**Files:**
- Modify: `src/utils/componentsV2.ts` (after `errorContainer`, line 66)
- Create: `test/dm/helpers.ts`
- Test: `test/dm/notice-container.test.ts`

**Interfaces:**
- Consumes: `statusContainer` and `StatusOptions` in the same file; `getEmoteUrl` from `src/config/branding.ts` (already imported there).
- Produces: `noticeContainer(emote: string, title: string, body: string, hint?: string): ContainerBuilder`. Every later builder uses it.
- Produces (test helper): `containerText(c)`, `containerThumb(c)`.

- [ ] **Step 1: Write the test helper**

Create `test/dm/helpers.ts`:

```ts
import { Client, ComponentType, ContainerBuilder } from "discord.js";

/** All TextDisplay content in a container, top-level and inside sections, joined by newlines. */
export function containerText(container: ContainerBuilder): string {
  const json = container.toJSON() as any;
  const parts: string[] = [];
  for (const c of json.components) {
    if (c.type === ComponentType.TextDisplay) parts.push(c.content);
    if (c.type === ComponentType.Section) for (const t of c.components) parts.push(t.content);
  }
  return parts.join("\n");
}

/** URL of the first section's thumbnail accessory, if any. */
export function containerThumb(container: ContainerBuilder): string | undefined {
  const json = container.toJSON() as any;
  return json.components[0]?.accessory?.media?.url;
}

export type FakeDm = { client: Client; sent: Map<string, number> };

/** A client whose users all exist. Ids in `failFor` reject send, like closed DMs (50007). */
export function fakeDmClient(failFor: string[] = []): FakeDm {
  const sent = new Map<string, number>();
  const client = {
    users: {
      fetch: async (id: string) => ({
        send: async () => {
          if (failFor.includes(id)) {
            throw Object.assign(new Error("Cannot send messages to this user"), { code: 50007 });
          }
          sent.set(id, (sent.get(id) ?? 0) + 1);
          return {};
        },
      }),
    },
  } as unknown as Client;
  return { client, sent };
}
```

- [ ] **Step 2: Write the failing test**

Create `test/dm/notice-container.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ComponentType } from "discord.js";
import { noticeContainer } from "../../src/utils/componentsV2";
import { Mascot, getEmoteUrl } from "../../src/config/branding";

describe("noticeContainer", () => {
  it("puts the emote's CDN image in the section thumbnail and the title above the body", () => {
    const json = noticeContainer(Mascot.Emotes.Gun, "Title", "Body").toJSON() as any;
    const section = json.components[0];
    expect(section.type).toBe(ComponentType.Section);
    expect(section.components[0].content).toBe("## Title\nBody");
    expect(section.accessory.type).toBe(ComponentType.Thumbnail);
    expect(section.accessory.media.url).toBe(getEmoteUrl(Mascot.Emotes.Gun));
  });

  it("adds the hint after a separator only when given", () => {
    const withHint = noticeContainer(Mascot.Emotes.Gun, "T", "B", "-# hint").toJSON() as any;
    expect(withHint.components.map((c: any) => c.type)).toEqual([
      ComponentType.Section,
      ComponentType.Separator,
      ComponentType.TextDisplay,
    ]);
    expect(withHint.components[2].content).toBe("-# hint");

    const without = noticeContainer(Mascot.Emotes.Gun, "T", "B").toJSON() as any;
    expect(without.components).toHaveLength(1);
  });

  it("never sets an accent color", () => {
    const json = noticeContainer(Mascot.Emotes.Gun, "T", "B").toJSON() as any;
    expect(json.accent_color).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/dm/notice-container.test.ts`
Expected: FAIL, `noticeContainer` is not exported.

- [ ] **Step 4: Implement `noticeContainer`**

In `src/utils/componentsV2.ts`, directly after `errorContainer`:

```ts
/**
 * Player DM notice. Same shape as statusContainer, but the thumbnail is the
 * given emote's CDN image instead of a mascot reaction. Titles stay text-only;
 * the thumbnail carries the emoji.
 */
export function noticeContainer(emote: string, title: string, body: string, hint?: string): ContainerBuilder {
    return statusContainer("info", title, body, { hint, thumbnailUrl: getEmoteUrl(emote) ?? undefined });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/dm/notice-container.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/utils/componentsV2.ts test/dm/helpers.ts test/dm/notice-container.test.ts
git commit -m "feat(dm): add noticeContainer, the one shape every player DM uses

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 2: `dmPrefsService` and the registry move

**Files:**
- Create: `src/services/dmPrefsService.ts`
- Modify: `src/services/cooldownReminderService.ts` (whole file)
- Modify: `src/commands/general/settings.ts:13-24, 66-67, 88-93, 121-130` (mechanical renames only; Task 8 rewrites the file)
- Modify: `src/commands/economy/vote.ts:9, 28-30`
- Modify: `src/services/cooldownService.ts:4, 81, 138`
- Test: `test/dm/prefs.test.ts`

**Interfaces:**
- Produces from `dmPrefsService`:
  - `DM_NOTICE_TYPES` (const registry), `DmNoticeType`, `CooldownReminderType`, `DmNoticeGroup`, `DmPrefs`
  - `isDmNoticeType(v: string): v is DmNoticeType`, `isCooldownReminderType(v: string): v is CooldownReminderType`, `noticeTypesInGroup(group): DmNoticeType[]`
  - `getDmPrefs(discordId): Promise<DmPrefs>`, `isNoticeEnabled(prefs, type): boolean`
  - `setNoticeTypeEnabled(discordId, type, enabled): Promise<boolean>`, `setMasterEnabled(discordId, enabled): Promise<void>`
  - `recordDmDelivered(discordId): Promise<void>`, `recordDmFailed(discordId): Promise<{ paused: boolean }>`, `MAX_DM_FAILS`
- Removed from `cooldownReminderService`: `REMINDER_TYPES`, `ReminderType`, `isReminderType`, `getReminderPrefs`, `setReminderTypeEnabled`, `setMasterEnabled`.

- [ ] **Step 1: Write the failing test**

Create `test/dm/prefs.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import {
  DM_NOTICE_TYPES,
  MAX_DM_FAILS,
  getDmPrefs,
  isCooldownReminderType,
  isDmNoticeType,
  isNoticeEnabled,
  noticeTypesInGroup,
  recordDmDelivered,
  recordDmFailed,
  setMasterEnabled,
  setNoticeTypeEnabled,
} from "../../src/services/dmPrefsService";

describe("DM_NOTICE_TYPES registry", () => {
  it("splits cooldown types (with a command) from account types (without)", () => {
    expect(noticeTypesInGroup("cooldown")).toEqual(["daily", "weekly", "monthly", "crime", "hunt", "work", "vote"]);
    expect(noticeTypesInGroup("account")).toEqual(["card", "market"]);
    for (const t of noticeTypesInGroup("cooldown")) expect(isCooldownReminderType(t)).toBe(true);
    for (const t of noticeTypesInGroup("account")) expect(isCooldownReminderType(t)).toBe(false);
  });

  it("recognises only registered keys", () => {
    expect(isDmNoticeType("card")).toBe(true);
    expect(isDmNoticeType("bogus")).toBe(false);
    expect(isCooldownReminderType("card")).toBe(false);
    expect(DM_NOTICE_TYPES.card.label).toBe("Card statements");
    expect(DM_NOTICE_TYPES.market.label).toBe("Market sales");
  });
});

describe("DM prefs", () => {
  const id = "dm-prefs-1";
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it("defaults to everything on", async () => {
    const prefs = await getDmPrefs(id);
    expect(prefs.remindersEnabled).toBe(true);
    expect(isNoticeEnabled(prefs, "card")).toBe(true);
  });

  it("toggling one type leaves the others alone", async () => {
    await setNoticeTypeEnabled(id, "card", false);
    const prefs = await getDmPrefs(id);
    expect(isNoticeEnabled(prefs, "card")).toBe(false);
    expect(isNoticeEnabled(prefs, "market")).toBe(true);
    await setNoticeTypeEnabled(id, "card", true);
    expect(isNoticeEnabled(await getDmPrefs(id), "card")).toBe(true);
  });

  it("master off disables every type; master on clears the strike count", async () => {
    await testPrisma.user.update({ where: { discordId: id }, data: { reminderDmFailCount: 2 } });
    await setMasterEnabled(id, false);
    expect(isNoticeEnabled(await getDmPrefs(id), "daily")).toBe(false);
    await setMasterEnabled(id, true);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.remindersEnabled).toBe(true);
    expect(user?.reminderDmFailCount).toBe(0);
  });

  it("three failures in a row pause the master and reset the count", async () => {
    for (let i = 1; i < MAX_DM_FAILS; i++) {
      expect(await recordDmFailed(id)).toEqual({ paused: false });
    }
    expect(await recordDmFailed(id)).toEqual({ paused: true });
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.remindersEnabled).toBe(false);
    expect(user?.reminderDmFailCount).toBe(0);
  });

  it("a delivered DM resets the strike count", async () => {
    await recordDmFailed(id);
    await recordDmDelivered(id);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.reminderDmFailCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/dm/prefs.test.ts`
Expected: FAIL, cannot resolve `../../src/services/dmPrefsService`.

- [ ] **Step 3: Create `dmPrefsService.ts`**

```ts
import prisma from "../utils/prisma";

// How a player controls Fortuna's DMs. Nothing here sends anything or knows
// about the reminder queue; the drain and the notice senders read these prefs
// at send time.

export type DmNoticeGroup = "cooldown" | "account";

/**
 * Every DM a player can switch off in `!settings`. Cooldown types carry the
 * command the reminder points at; account types have none. Insertion order is
 * the order the settings panel renders.
 */
export const DM_NOTICE_TYPES = {
  daily: { label: "Daily reward", command: "!daily", group: "cooldown" },
  weekly: { label: "Weekly reward", command: "!weekly", group: "cooldown" },
  monthly: { label: "Monthly reward", command: "!monthly", group: "cooldown" },
  crime: { label: "Crime board", command: "!crime", group: "cooldown" },
  hunt: { label: "Hunt", command: "!hunt", group: "cooldown" },
  work: { label: "Work shift", command: "!work", group: "cooldown" },
  vote: { label: "Vote", command: "!vote", group: "cooldown" },
  card: { label: "Card statements", group: "account" },
  market: { label: "Market sales", group: "account" },
} as const;

export type DmNoticeType = keyof typeof DM_NOTICE_TYPES;

/** The subset that can be queued as a cooldown reminder: every entry with a command. */
export type CooldownReminderType = {
  [K in DmNoticeType]: (typeof DM_NOTICE_TYPES)[K] extends { command: string } ? K : never;
}[DmNoticeType];

const ALL_TYPES = Object.keys(DM_NOTICE_TYPES) as DmNoticeType[];

export function isDmNoticeType(value: string): value is DmNoticeType {
  return (ALL_TYPES as string[]).includes(value);
}

export function isCooldownReminderType(value: string): value is CooldownReminderType {
  return isDmNoticeType(value) && "command" in DM_NOTICE_TYPES[value];
}

export function noticeTypesInGroup(group: DmNoticeGroup): DmNoticeType[] {
  return ALL_TYPES.filter((t) => DM_NOTICE_TYPES[t].group === group);
}

export const MAX_DM_FAILS = 3;

export type DmPrefs = { remindersEnabled: boolean; disabledReminders: string[] };

export async function getDmPrefs(discordId: string): Promise<DmPrefs> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { remindersEnabled: true, disabledReminders: true },
  });
  return {
    remindersEnabled: user?.remindersEnabled ?? true,
    disabledReminders: user?.disabledReminders ?? [],
  };
}

export function isNoticeEnabled(prefs: DmPrefs, type: DmNoticeType): boolean {
  return prefs.remindersEnabled && !prefs.disabledReminders.includes(type);
}

/** Toggle one type. Returns the NEW enabled state of that type. */
export async function setNoticeTypeEnabled(discordId: string, type: DmNoticeType, enabled: boolean): Promise<boolean> {
  const prefs = await getDmPrefs(discordId);
  const disabled = new Set(prefs.disabledReminders);
  if (enabled) disabled.delete(type);
  else disabled.add(type);
  await prisma.user.update({
    where: { discordId },
    data: { disabledReminders: { set: Array.from(disabled) } },
  });
  return enabled;
}

export async function setMasterEnabled(discordId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({
    where: { discordId },
    data: { remindersEnabled: enabled, ...(enabled ? { reminderDmFailCount: 0 } : {}) },
  });
}

export async function recordDmDelivered(discordId: string): Promise<void> {
  await prisma.user.update({ where: { discordId }, data: { reminderDmFailCount: 0 } }).catch(() => {});
}

/** Count a closed or blocked DM. Auto-pauses the master at MAX_DM_FAILS in a row. */
export async function recordDmFailed(discordId: string): Promise<{ paused: boolean }> {
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
    return { paused: true };
  }
  await prisma.user.update({ where: { discordId }, data: { reminderDmFailCount: fails } }).catch(() => {});
  return { paused: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/dm/prefs.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Rewrite `cooldownReminderService.ts` as queue-only**

Replace the whole file with:

```ts
import { Client } from "discord.js";
import prisma from "../utils/prisma";
import { isTester } from "../utils/developerAccess";
import {
  CooldownReminderType,
  DM_NOTICE_TYPES,
  getDmPrefs,
  isCooldownReminderType,
  isNoticeEnabled,
  recordDmDelivered,
  recordDmFailed,
} from "./dmPrefsService";

// The reminder QUEUE. Which DMs a player allows lives in dmPrefsService; the
// drain reads those prefs at fire time, so nothing here has to delete rows
// when a toggle changes.

const BATCH_SIZE = 200;
const FOOTER = "-# Manage these DMs with `!settings` in any server with Fortuna.";

/**
 * Queue a reminder for when a cooldown lifts. Replaces any pending reminder
 * of the same type. Fire-and-forget: never throws, never blocks the caller.
 */
export async function enqueueReminder(discordId: string, type: CooldownReminderType, dueAt: Date): Promise<void> {
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

    const prefs = await getDmPrefs(discordId);
    if (!isNoticeEnabled(prefs, type)) return;

    await prisma.cooldownReminder.upsert({
      where: { discordId_type: { discordId, type } },
      create: { discordId, type, dueAt },
      update: { dueAt },
    });
  } catch (err) {
    console.error(`enqueueReminder failed for ${discordId}/${type}:`, err);
  }
}

// Mirrors the shift gate in lifeInteractionHandler: flat base minus
// COOLDOWN_REDUCTION active effects, floored at zero.
const WORK_BASE_COOLDOWN_SECONDS = 3600;

/** Enqueue a work reminder using the same cooldown math as the shift gate. */
export async function enqueueWorkReminder(discordId: string): Promise<void> {
  try {
    const effects = await prisma.activeEffect.findMany({
      where: {
        userId: discordId,
        effectType: "COOLDOWN_REDUCTION",
        OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
      },
    });
    const reduction = effects.reduce((sum, eff) => sum + (eff.value || 0), 0);
    const seconds = Math.max(0, WORK_BASE_COOLDOWN_SECONDS - reduction);
    await enqueueReminder(discordId, "work", new Date(Date.now() + seconds * 1000));
  } catch (err) {
    console.error(`enqueueWorkReminder failed for ${discordId}:`, err);
  }
}

export async function cancelReminder(discordId: string, type: CooldownReminderType): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId, type } }).catch(() => {});
}

export async function cancelAll(discordId: string): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId } }).catch(() => {});
}

function buildDmContent(types: CooldownReminderType[]): string {
  if (types.length === 1) {
    const t = DM_NOTICE_TYPES[types[0]];
    return `⏰ **Cooldown lifted!** Your **${t.label.toLowerCase()}** is ready — use \`${t.command}\`.\n${FOOTER}`;
  }
  const lines = types.map((ty) => `• **${DM_NOTICE_TYPES[ty].label}** — \`${DM_NOTICE_TYPES[ty].command}\``);
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

  const byUser = new Map<string, CooldownReminderType[]>();
  for (const row of due) {
    if (!isCooldownReminderType(row.type)) continue; // unknown types are dropped silently
    const list = byUser.get(row.discordId) ?? [];
    list.push(row.type);
    byUser.set(row.discordId, list);
  }

  for (const [discordId, types] of byUser) {
    try {
      const prefs = await getDmPrefs(discordId);
      const active = types.filter((t) => isNoticeEnabled(prefs, t));
      if (active.length === 0) continue;

      const discordUser = await client.users.fetch(discordId).catch(() => null);
      if (!discordUser) continue;

      try {
        await discordUser.send({ content: buildDmContent(active) });
        await recordDmDelivered(discordId);
      } catch {
        await recordDmFailed(discordId);
      }
    } catch (err) {
      console.error(`processDueReminders failed for ${discordId}:`, err);
    }
  }
}
```

- [ ] **Step 6: Update the four importers**

`src/commands/economy/vote.ts` line 9 becomes two lines:

```ts
import { enqueueReminder } from "../../services/cooldownReminderService";
import { getDmPrefs, isNoticeEnabled, setNoticeTypeEnabled } from "../../services/dmPrefsService";
```

and lines 28-30 become:

```ts
        const prefs = await getDmPrefs(user.discordId);
        const currentlyOn = isNoticeEnabled(prefs, "vote");
        const newState = await setNoticeTypeEnabled(user.discordId, "vote", !currentlyOn);
```

`src/services/cooldownService.ts` line 4 becomes:

```ts
import { enqueueReminder } from "./cooldownReminderService";
import { isCooldownReminderType } from "./dmPrefsService";
```

and both `if (isReminderType(commandName)) {` (lines 81 and 138) become `if (isCooldownReminderType(commandName)) {`.

`src/commands/general/settings.ts`, mechanical renames only (the file is rewritten in Task 8):

- Lines 15-22 import block becomes:

  ```ts
  import {
      DM_NOTICE_TYPES,
      DmNoticeType,
      isDmNoticeType,
      getDmPrefs,
      setNoticeTypeEnabled,
      setMasterEnabled,
  } from "../../services/dmPrefsService";
  ```
- Line 24: `const TYPE_ORDER: DmNoticeType[] = [...]` (was `ReminderType[]`).
- Line 63: `const typeButton = (type: DmNoticeType) => {`.
- Line 67: `REMINDER_TYPES[type].label` becomes `DM_NOTICE_TYPES[type].label`.
- Lines 121-122: `getReminderPrefs(ownerId)` becomes `getDmPrefs(ownerId)`.
- Line 125: `isReminderType(type)` becomes `isDmNoticeType(type)`.
- Line 128: `getReminderPrefs(ownerId)` becomes `getDmPrefs(ownerId)`.
- Line 130: `setReminderTypeEnabled(...)` becomes `setNoticeTypeEnabled(...)`.

- [ ] **Step 7: Type-check and confirm nothing else imports the removed names**

Run: `npm run typecheck`
Expected: no errors.

Run: `grep -rn --include=*.ts "REMINDER_TYPES\|\bReminderType\b\|isReminderType\|getReminderPrefs\|setReminderTypeEnabled" src`
Expected: no output (`CooldownReminderType` and `DmNoticeType` remain, which the leading `\b` excludes).

- [ ] **Step 8: Run the existing suite to catch regressions**

Run: `npm test`
Expected: PASS. (`test/anticheat` and `test/zoo` do not touch the reminder service, but `cooldownService` is imported widely.)

- [ ] **Step 9: Commit**

```bash
git add src/services/dmPrefsService.ts src/services/cooldownReminderService.ts src/services/cooldownService.ts src/commands/economy/vote.ts src/commands/general/settings.ts test/dm/prefs.test.ts
git commit -m "refactor(dm): move DM prefs and the notice registry out of the reminder queue

Toggling a type off no longer deletes queued rows; the drain already skips
disabled types at fire time, so the deletes were redundant and coupled prefs
to the queue.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 3: `dmNoticeService`: rename, `sendDm`, and the three always-on notices

**Files:**
- Rename: `src/services/victimNotifyService.ts` to `src/services/dmNoticeService.ts` (then rewrite)
- Modify: `src/commands/economy/rob.ts:21`
- Modify: `src/services/taxService.ts:3, 305-318`
- Test: `test/dm/notices.test.ts`

**Interfaces:**
- Consumes: `noticeContainer`, `v2Reply` (`src/utils/componentsV2.ts`); `Mascot` (`src/config/branding.ts`); `fmtCurrency` (`src/utils/format.ts`).
- Produces:
  - `sendDm(client: Client, userId: string, container: ContainerBuilder): Promise<boolean>`
  - `robbedNotice(robberName, amount, guildName): ContainerBuilder`, `notifyRobbed(client, victimId, robberName, amount, guildName): Promise<void>`
  - `padlockNotice(robberName, guildName): ContainerBuilder`, `notifyPadlockUsed(client, victimId, robberName, guildName): Promise<void>`
  - `taxRaidNotice(seized, walletNow): ContainerBuilder`, `notifyTaxRaid(client, discordId, seized, walletNow): Promise<void>`

- [ ] **Step 1: Rename the file with git**

```bash
git mv src/services/victimNotifyService.ts src/services/dmNoticeService.ts
```

- [ ] **Step 2: Write the failing test**

Create `test/dm/notices.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Client } from "discord.js";
import {
  sendDm,
  robbedNotice,
  padlockNotice,
  taxRaidNotice,
} from "../../src/services/dmNoticeService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

describe("sendDm", () => {
  const anyNotice = () => robbedNotice("R", 1, null);

  it("returns true when Discord accepts the message", async () => {
    const { client, sent } = fakeDmClient();
    expect(await sendDm(client, "u1", anyNotice())).toBe(true);
    expect(sent.get("u1")).toBe(1);
  });

  it("returns false when the DM is closed", async () => {
    const { client } = fakeDmClient(["u1"]);
    expect(await sendDm(client, "u1", anyNotice())).toBe(false);
  });

  it("returns false when the user cannot be fetched", async () => {
    const client = { users: { fetch: async () => { throw new Error("Unknown User"); } } } as unknown as Client;
    expect(await sendDm(client, "u1", anyNotice())).toBe(false);
  });
});

describe("security notices", () => {
  it("robbed: gun thumbnail, robber, amount, server, bank hint", () => {
    const c = robbedNotice("Vex", 12_345, "Casino Lounge");
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Gun));
    const t = containerText(c);
    expect(t).toContain("## You've been robbed!");
    expect(t).toContain(`**Vex** lifted **${fmtCurrency(12_345)}** from your wallet in **Casino Lounge**.`);
    expect(t).toContain("-# Wallet money can be robbed. Bank what you don't need with `!deposit`.");
  });

  it("robbed: no server clause when the guild is unknown", () => {
    const t = containerText(robbedNotice("Vex", 5, null));
    expect(t).toContain("from your wallet.");
    expect(t).not.toContain(" in **");
  });

  it("padlock: lock thumbnail and single-use hint", () => {
    const c = padlockNotice("Vex", "Casino Lounge");
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Lock));
    const t = containerText(c);
    expect(t).toContain("## Your Padlock just paid for itself.");
    expect(t).toContain("**Vex** tried to rob you in **Casino Lounge**. The padlock blocked the hit and broke in the process.");
    expect(t).toContain("-# Padlocks are single-use. Grab another: `!shop buy padlock`.");
  });

  it("tax raid: police thumbnail, seized and remaining amounts as currency, heat hint", () => {
    const c = taxRaidNotice(250_000, 750_000);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Police));
    const t = containerText(c);
    expect(t).toContain("## Tax raid");
    expect(t).toContain(`**Seized:** ${fmtCurrency(250_000)}`);
    expect(t).toContain(`**Wallet now:** ${fmtCurrency(750_000)}`);
    expect(t).toContain("Your criminal heat has been reset.");
    expect(t).toContain("-# Heat builds from crime and robbery. Check it with `!heat`.");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/dm/notices.test.ts`
Expected: FAIL, `sendDm` / `robbedNotice` are not exported.

- [ ] **Step 4: Rewrite `dmNoticeService.ts`**

Replace the file's content with:

```ts
import { Client, ContainerBuilder } from "discord.js";
import { Mascot } from "../config/branding";
import { noticeContainer, v2Reply } from "../utils/componentsV2";
import { fmtCurrency } from "../utils/format";

// Every DM Fortuna sends a player is built and sent from here, so they all
// share one look (noticeContainer) and one failure policy: a closed DM is a
// normal outcome, never an error that reaches gameplay.

/** Raw send. True only if Discord accepted the message. Never throws. */
export async function sendDm(client: Client, userId: string, container: ContainerBuilder): Promise<boolean> {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    await user.send(v2Reply(container));
    return true;
  } catch {
    return false;
  }
}

const inGuild = (guildName: string | null) => (guildName ? ` in **${guildName}**` : "");

// ---- Security notices: always on, never counted against DM strikes. ----

export function robbedNotice(robberName: string, amount: number, guildName: string | null): ContainerBuilder {
  return noticeContainer(
    Mascot.Emotes.Gun,
    "You've been robbed!",
    `**${robberName}** lifted **${fmtCurrency(amount)}** from your wallet${inGuild(guildName)}.`,
    "-# Wallet money can be robbed. Bank what you don't need with `!deposit`.",
  );
}

export async function notifyRobbed(
  client: Client,
  victimId: string,
  robberName: string,
  amount: number,
  guildName: string | null,
): Promise<void> {
  await sendDm(client, victimId, robbedNotice(robberName, amount, guildName));
}

export function padlockNotice(robberName: string, guildName: string | null): ContainerBuilder {
  return noticeContainer(
    Mascot.Emotes.Lock,
    "Your Padlock just paid for itself.",
    `**${robberName}** tried to rob you${inGuild(guildName)}. The padlock blocked the hit and broke in the process.`,
    "-# Padlocks are single-use. Grab another: `!shop buy padlock`.",
  );
}

export async function notifyPadlockUsed(
  client: Client,
  victimId: string,
  robberName: string,
  guildName: string | null,
): Promise<void> {
  await sendDm(client, victimId, padlockNotice(robberName, guildName));
}

export function taxRaidNotice(seized: number, walletNow: number): ContainerBuilder {
  return noticeContainer(
    Mascot.Emotes.Police,
    "Tax raid",
    "The IRS audited your financial activity.\n" +
      `**Seized:** ${fmtCurrency(seized)}\n` +
      `**Wallet now:** ${fmtCurrency(walletNow)}\n` +
      "Your criminal heat has been reset.",
    "-# Heat builds from crime and robbery. Check it with `!heat`.",
  );
}

export async function notifyTaxRaid(client: Client, discordId: string, seized: number, walletNow: number): Promise<void> {
  await sendDm(client, discordId, taxRaidNotice(seized, walletNow));
}
```

- [ ] **Step 5: Point `rob.ts` at the new module**

`src/commands/economy/rob.ts` line 21 becomes:

```ts
import { notifyRobbed, notifyPadlockUsed } from "../../services/dmNoticeService";
```

- [ ] **Step 6: Replace the inline raid DM in `taxService.ts`**

Line 3 (`import { errorContainer, v2Reply } from "../utils/componentsV2";`) becomes:

```ts
import { notifyTaxRaid } from "./dmNoticeService";
```

In `executeRaid`, the block from `try {` through the closing `}` of the `catch` (lines 305-318, the one that fetches the user and sends `errorContainer("TAX RAID", ...)`) becomes a single line:

```ts
  await notifyTaxRaid(client, discordId, result.removedAmount, result.newBalance);
```

- [ ] **Step 7: Run the tests and type-check**

Run: `npx vitest run test/dm/notices.test.ts`
Expected: PASS (7 tests).

Run: `npm run typecheck`
Expected: no errors.

Run: `grep -rn --include=*.ts "victimNotifyService" src test`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add -A src/services/dmNoticeService.ts src/services/victimNotifyService.ts src/commands/economy/rob.ts src/services/taxService.ts test/dm/notices.test.ts
git commit -m "feat(dm): send robbery, padlock and raid notices as house-style containers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 4: `sendOptOutDm` and the cooldown notice

**Files:**
- Modify: `src/services/dmNoticeService.ts` (append)
- Modify: `src/services/cooldownReminderService.ts` (drop `buildDmContent`, `FOOTER`, the fetch/send block)
- Test: `test/dm/send.test.ts`

**Interfaces:**
- Consumes: `getDmPrefs`, `isNoticeEnabled`, `recordDmDelivered`, `recordDmFailed`, `DM_NOTICE_TYPES`, `DmNoticeType`, `CooldownReminderType` (Task 2); `isTester` (`src/utils/developerAccess.ts`).
- Produces:
  - `sendOptOutDm(client, discordId, type: DmNoticeType, container): Promise<void>`
  - `cooldownNotice(types: CooldownReminderType[]): ContainerBuilder`
  - `notifyCooldownsLifted(client, discordId, types: CooldownReminderType[]): Promise<void>`
  - module constant `SETTINGS_HINT = "Manage these DMs with \`!settings\`"` (not exported), reused by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

Create `test/dm/send.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { cooldownNotice, notifyCooldownsLifted, sendOptOutDm } from "../../src/services/dmNoticeService";
import { setNoticeTypeEnabled } from "../../src/services/dmPrefsService";
import { processDueReminders } from "../../src/services/cooldownReminderService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

describe("cooldownNotice", () => {
  it("single type: cooldown thumbnail, label, command, settings hint", () => {
    const c = cooldownNotice(["daily"]);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Cooldown));
    const t = containerText(c);
    expect(t).toContain("## Cooldown lifted!");
    expect(t).toContain("Your **daily reward** is ready. Use `!daily`.");
    expect(t).toContain("-# Manage these DMs with `!settings` in any server with Fortuna.");
  });

  it("several types become a bullet list", () => {
    const t = containerText(cooldownNotice(["daily", "work"]));
    expect(t).toContain("## Cooldowns lifted!");
    expect(t).toContain("• **Daily reward** — `!daily`");
    expect(t).toContain("• **Work shift** — `!work`");
  });
});

describe("sendOptOutDm", () => {
  const id = "dm-send-1";
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it("sends when enabled and clears the strike count", async () => {
    await testPrisma.user.update({ where: { discordId: id }, data: { reminderDmFailCount: 2 } });
    const { client, sent } = fakeDmClient();
    await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBe(1);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.reminderDmFailCount).toBe(0);
  });

  it("sends nothing when that type is off", async () => {
    await setNoticeTypeEnabled(id, "daily", false);
    const { client, sent } = fakeDmClient();
    await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBeUndefined();
  });

  it("sends nothing when the master is off", async () => {
    await seedUser(id, { remindersEnabled: false });
    const { client, sent } = fakeDmClient();
    await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBeUndefined();
  });

  it("three closed-DM failures in a row pause the master", async () => {
    const { client, sent } = fakeDmClient([id]);
    for (let i = 0; i < 3; i++) await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBeUndefined();
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.remindersEnabled).toBe(false);
    expect(user?.reminderDmFailCount).toBe(0);
  });
});

describe("processDueReminders", () => {
  const id = "dm-drain-1";
  const past = () => new Date(Date.now() - 60_000);
  beforeEach(async () => {
    await seedUser(id);
    await testPrisma.cooldownReminder.deleteMany({ where: { discordId: id } });
  });
  afterAll(async () => {
    await testPrisma.cooldownReminder.deleteMany({ where: { discordId: id } });
    await resetUser(id);
  });

  it("DMs one combined notice and removes the rows", async () => {
    await testPrisma.cooldownReminder.createMany({
      data: [
        { discordId: id, type: "daily", dueAt: past() },
        { discordId: id, type: "work", dueAt: past() },
      ],
    });
    const { client, sent } = fakeDmClient();
    await processDueReminders(client);
    expect(sent.get(id)).toBe(1);
    expect(await testPrisma.cooldownReminder.count({ where: { discordId: id } })).toBe(0);
  });

  it("skips a type the player switched off", async () => {
    await setNoticeTypeEnabled(id, "daily", false);
    await testPrisma.cooldownReminder.create({ data: { discordId: id, type: "daily", dueAt: past() } });
    const { client, sent } = fakeDmClient();
    await processDueReminders(client);
    expect(sent.get(id)).toBeUndefined();
  });

  it("notifyCooldownsLifted counts a closed DM against the strike count", async () => {
    const { client } = fakeDmClient([id]);
    await notifyCooldownsLifted(client, id, ["daily"]);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.reminderDmFailCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/dm/send.test.ts`
Expected: FAIL, `cooldownNotice` / `sendOptOutDm` / `notifyCooldownsLifted` are not exported.

- [ ] **Step 3: Add the opt-out seam and cooldown notice to `dmNoticeService.ts`**

Extend the import block at the top of the file:

```ts
import { isTester } from "../utils/developerAccess";
import {
  CooldownReminderType,
  DM_NOTICE_TYPES,
  DmNoticeType,
  getDmPrefs,
  isNoticeEnabled,
  recordDmDelivered,
  recordDmFailed,
} from "./dmPrefsService";
```

Directly after `sendDm`, add:

```ts
const SETTINGS_HINT = "Manage these DMs with `!settings`";

/** Send and record the outcome against the strike count. Caller has already applied prefs. */
async function deliverCounted(client: Client, discordId: string, container: ContainerBuilder): Promise<void> {
  if (await sendDm(client, discordId, container)) await recordDmDelivered(discordId);
  else await recordDmFailed(discordId);
}

/**
 * Send a DM the player can switch off in `!settings`. Checks the master switch
 * and the per-type toggle, then keeps the closed-DM strike count. Never throws.
 */
export async function sendOptOutDm(
  client: Client,
  discordId: string,
  type: DmNoticeType,
  container: ContainerBuilder,
): Promise<void> {
  try {
    if (isTester(discordId)) return;
    const prefs = await getDmPrefs(discordId);
    if (!isNoticeEnabled(prefs, type)) return;
    await deliverCounted(client, discordId, container);
  } catch (err) {
    console.error(`sendOptOutDm(${type}) failed for ${discordId}:`, err);
  }
}
```

At the end of the file, add:

```ts
// ---- Opt-out notices: governed by !settings and the DM strike count. ----

export function cooldownNotice(types: CooldownReminderType[]): ContainerBuilder {
  const hint = `-# ${SETTINGS_HINT} in any server with Fortuna.`;
  if (types.length === 1) {
    const t = DM_NOTICE_TYPES[types[0]];
    return noticeContainer(
      Mascot.Emotes.Cooldown,
      "Cooldown lifted!",
      `Your **${t.label.toLowerCase()}** is ready. Use \`${t.command}\`.`,
      hint,
    );
  }
  const lines = types.map((ty) => `• **${DM_NOTICE_TYPES[ty].label}** — \`${DM_NOTICE_TYPES[ty].command}\``);
  return noticeContainer(Mascot.Emotes.Cooldown, "Cooldowns lifted!", `Ready to use:\n${lines.join("\n")}`, hint);
}

/** The reminder drain has already filtered by prefs, so this only sends and counts. */
export async function notifyCooldownsLifted(
  client: Client,
  discordId: string,
  types: CooldownReminderType[],
): Promise<void> {
  try {
    await deliverCounted(client, discordId, cooldownNotice(types));
  } catch (err) {
    console.error(`notifyCooldownsLifted failed for ${discordId}:`, err);
  }
}
```

- [ ] **Step 4: Route the drain through `notifyCooldownsLifted`**

In `src/services/cooldownReminderService.ts`:

- Import block: remove `DM_NOTICE_TYPES`, `recordDmDelivered`, `recordDmFailed` from the `./dmPrefsService` import (keep `CooldownReminderType`, `getDmPrefs`, `isCooldownReminderType`, `isNoticeEnabled`) and add:

  ```ts
  import { notifyCooldownsLifted } from "./dmNoticeService";
  ```
- Delete the `FOOTER` constant and the whole `buildDmContent` function.
- In `processDueReminders`, the per-user loop body becomes:

  ```ts
  for (const [discordId, types] of byUser) {
    try {
      const prefs = await getDmPrefs(discordId);
      const active = types.filter((t) => isNoticeEnabled(prefs, t));
      if (active.length === 0) continue;
      await notifyCooldownsLifted(client, discordId, active);
    } catch (err) {
      console.error(`processDueReminders failed for ${discordId}:`, err);
    }
  }
  ```

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run test/dm/send.test.ts`
Expected: PASS (9 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/dmNoticeService.ts src/services/cooldownReminderService.ts test/dm/send.test.ts
git commit -m "feat(dm): route cooldown reminders through the shared opt-out DM seam

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 5: Card settlement returns outcome objects

**Files:**
- Modify: `src/services/creditCardService.ts:455-643`
- Modify: `src/scheduler.ts:46-54`
- Test: `test/card/settlement-outcomes.test.ts`

**Interfaces:**
- Produces (exported from `creditCardService`):

  ```ts
  export type StatementIssued = { userId: string; tier: string; statementBalance: number; minimumDue: number; dueAt: Date };
  export type StatementOutcome = "PAID_FULL" | "PAID_MINIMUM" | "MISSED";
  export type StatementSettled = { userId: string; status: StatementOutcome; scoreDelta: number; interestCharged: number; cardStatus: string; remainingBalance: number };
  generateWeeklyStatements(now?): Promise<StatementIssued[]>
  settleDueStatements(now?): Promise<StatementSettled[]>
  processWeeklyCardSettlement(now?): Promise<{ issued: StatementIssued[]; settled: StatementSettled[] }>
  ```
- No Discord import in `creditCardService`.

- [ ] **Step 1: Write the failing test**

Create `test/card/settlement-outcomes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { generateWeeklyStatements, settleDueStatements } from "../../src/services/creditCardService";
import { CARD_SCORE_RULES, CARD_TIERS, calculateMinimumDue, getCycleKey } from "../../src/utils/economyConfig";

const id = "card-settle-1";
const tier = CARD_TIERS.STARTER;
const DAY = 24 * 3_600_000;

const baseCard = {
  userId: id,
  tier: tier.tier,
  status: "ACTIVE",
  creditLimit: tier.creditLimit,
  weeklyInterestPct: tier.weeklyInterestPct,
  weeklySpendCap: tier.weeklySpendCap,
  weeklyWithdrawCap: tier.weeklyWithdrawCap,
};

async function cleanCard() {
  const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
  if (!card) return;
  await testPrisma.cardTransaction.deleteMany({ where: { cardId: card.id } });
  await testPrisma.cardStatement.deleteMany({ where: { cardId: card.id } });
  await testPrisma.creditCard.delete({ where: { id: card.id } });
}

/** A card whose last statement is OPEN and past due, with `paid` already applied. */
async function seedOverdueStatement(opts: { balance: number; paid: number; missStreak?: number }) {
  const weekAgo = new Date(Date.now() - 8 * DAY);
  const card = await testPrisma.creditCard.create({
    data: {
      ...baseCard,
      currentBalance: opts.balance - opts.paid,
      statementBalance: opts.balance,
      missStreak: opts.missStreak ?? 0,
      nextStatementAt: new Date(Date.now() + 6 * DAY), // not due, so generation stays out of these tests
      currentCycleKey: getCycleKey(weekAgo),
    },
  });
  await testPrisma.cardStatement.create({
    data: {
      cardId: card.id,
      cycleKey: getCycleKey(weekAgo),
      statementAt: weekAgo,
      dueAt: new Date(Date.now() - 60_000),
      statementBalance: opts.balance,
      minimumDue: calculateMinimumDue(opts.balance, tier),
      amountPaid: opts.paid,
      status: "OPEN",
    },
  });
}

async function settleMine() {
  return (await settleDueStatements()).filter((s) => s.userId === id);
}

describe("settleDueStatements outcomes", () => {
  beforeEach(async () => {
    await cleanCard();
    await seedUser(id);
  });
  afterAll(async () => {
    await cleanCard();
    await resetUser(id);
  });

  it("PAID_FULL: full-payment score bonus, card ACTIVE, nothing remaining", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 500_000 });
    const [o] = await settleMine();
    expect(o).toMatchObject({
      userId: id,
      status: "PAID_FULL",
      scoreDelta: CARD_SCORE_RULES.payFullStatement,
      interestCharged: 0,
      cardStatus: "ACTIVE",
      remainingBalance: 0,
    });
  });

  it("PAID_MINIMUM: minimum-payment bonus and the rest rolls forward", async () => {
    const min = calculateMinimumDue(500_000, tier);
    await seedOverdueStatement({ balance: 500_000, paid: min });
    const [o] = await settleMine();
    expect(o).toMatchObject({
      status: "PAID_MINIMUM",
      scoreDelta: CARD_SCORE_RULES.payMinimumOnTime,
      interestCharged: 0,
      cardStatus: "ACTIVE",
      remainingBalance: 500_000 - min,
    });
  });

  it("MISSED, first time: miss penalty, interest on the unpaid part, card DELINQUENT", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 0 });
    const [o] = await settleMine();
    expect(o).toMatchObject({
      status: "MISSED",
      scoreDelta: CARD_SCORE_RULES.missPayment,
      interestCharged: Math.floor(500_000 * tier.weeklyInterestPct / 100),
      cardStatus: "DELINQUENT",
      remainingBalance: 500_000,
    });
  });

  it("MISSED, third in a row: repeat penalty and the card LOCKS", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 0, missStreak: 2 });
    const [o] = await settleMine();
    expect(o).toMatchObject({ status: "MISSED", scoreDelta: CARD_SCORE_RULES.repeatMiss, cardStatus: "LOCKED" });
  });

  it("an already-settled statement is not reported again", async () => {
    await seedOverdueStatement({ balance: 500_000, paid: 500_000 });
    await settleMine();
    expect(await settleMine()).toEqual([]);
  });
});

describe("generateWeeklyStatements", () => {
  beforeEach(async () => {
    await cleanCard();
    await seedUser(id);
  });
  afterAll(async () => {
    await cleanCard();
    await resetUser(id);
  });

  it("returns the issued statement with balance, minimum and a future due date", async () => {
    await testPrisma.creditCard.create({
      data: { ...baseCard, currentBalance: 250_000, nextStatementAt: new Date(Date.now() - 60_000) },
    });
    const issued = (await generateWeeklyStatements()).filter((s) => s.userId === id);
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({
      tier: tier.tier,
      statementBalance: 250_000,
      minimumDue: calculateMinimumDue(250_000, tier),
    });
    expect(issued[0].dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("reports a zero statement for a card with no balance (the notifier decides whether to DM)", async () => {
    await testPrisma.creditCard.create({
      data: { ...baseCard, currentBalance: 0, nextStatementAt: new Date(Date.now() - 60_000) },
    });
    const issued = (await generateWeeklyStatements()).filter((s) => s.userId === id);
    expect(issued).toHaveLength(1);
    expect(issued[0].statementBalance).toBe(0);
    expect(issued[0].minimumDue).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/card/settlement-outcomes.test.ts`
Expected: FAIL. `settleDueStatements()` returns a number, so `.filter` is not a function.

- [ ] **Step 3: Add the outcome types and return them**

In `src/services/creditCardService.ts`, directly above `generateWeeklyStatements` (line 455), add:

```ts
export type StatementIssued = {
  userId: string;
  tier: string;
  statementBalance: number;
  minimumDue: number;
  dueAt: Date;
};

export type StatementOutcome = "PAID_FULL" | "PAID_MINIMUM" | "MISSED";

export type StatementSettled = {
  userId: string;
  status: StatementOutcome;
  scoreDelta: number;
  interestCharged: number;
  cardStatus: string;
  remainingBalance: number;
};
```

`generateWeeklyStatements` becomes:

```ts
export async function generateWeeklyStatements(now = new Date()): Promise<StatementIssued[]> {
  const cards = await prisma.creditCard.findMany({
    where: {
      status: { in: ["ACTIVE", "DELINQUENT"] },
      OR: [{ nextStatementAt: null }, { nextStatementAt: { lte: now } }]
    }
  });

  const issued: StatementIssued[] = [];
  for (const card of cards) {
    const result = await generateStatementForCard(card.id, now);
    if (result) issued.push(result);
  }
  return issued;
}
```

In `generateStatementForCard`:

- Signature: `async function generateStatementForCard(cardId: string, now: Date): Promise<StatementIssued | null> {`
- Both `return false;` lines become `return null;`.
- The final `return true;` becomes:

  ```ts
      return { userId: card.userId, tier: card.tier, statementBalance, minimumDue, dueAt };
  ```

`settleDueStatements` becomes:

```ts
export async function settleDueStatements(now = new Date()): Promise<StatementSettled[]> {
  const statements = await prisma.cardStatement.findMany({
    where: {
      status: "OPEN",
      dueAt: { lte: now },
      scoreDeltaApplied: false
    },
    select: { id: true }
  });

  const settled: StatementSettled[] = [];
  for (const statement of statements) {
    const result = await settleStatement(statement.id);
    if (result) settled.push(result);
  }
  return settled;
}
```

In `settleStatement`:

- Signature: `async function settleStatement(statementId: string): Promise<StatementSettled | null> {`
- Both `return false;` lines become `return null;`.
- `let status = "MISSED";` becomes `let status: StatementOutcome = "MISSED";`
- The final `return true;` becomes:

  ```ts
      return {
        userId: user.discordId,
        status,
        scoreDelta,
        interestCharged,
        cardStatus,
        remainingBalance: Math.max(0, statement.statementBalance - statement.amountPaid),
      };
  ```

`processWeeklyCardSettlement` becomes:

```ts
export async function processWeeklyCardSettlement(now = new Date()) {
  const issued = await generateWeeklyStatements(now);
  const settled = await settleDueStatements(now);
  return { issued, settled };
}
```

- [ ] **Step 4: Update the scheduler log line**

In `src/scheduler.ts`, the weekly cron body becomes:

```ts
  cron.schedule("0 0 * * 1", async () => {
    console.log("Running weekly credit card settlement...");
    try {
      const result = await processWeeklyCardSettlement();
      console.log(`Processed card settlement. Statements generated: ${result.issued.length}, statements settled: ${result.settled.length}.`);
    } catch (err) {
      console.error("Weekly credit card settlement failed:", err);
    }
  });
```

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run test/card/settlement-outcomes.test.ts`
Expected: PASS (7 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/creditCardService.ts src/scheduler.ts test/card/settlement-outcomes.test.ts
git commit -m "refactor(card): return statement outcomes from weekly settlement

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 6: Card weekly notice

**Files:**
- Modify: `src/services/dmNoticeService.ts` (append)
- Modify: `src/scheduler.ts` (weekly cron)
- Test: `test/dm/card-notice.test.ts`

**Interfaces:**
- Consumes: `StatementIssued`, `StatementSettled` (Task 5, `import type`); `sendOptOutDm`, `SETTINGS_HINT`, `noticeContainer` (Task 4).
- Produces:
  - `type CardWeeklyInput = { issued?: StatementIssued; settled?: StatementSettled }`
  - `cardWeeklyNotice(input: CardWeeklyInput): ContainerBuilder | null`
  - `notifyCardWeekly(client, result: { issued: StatementIssued[]; settled: StatementSettled[] }): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `test/dm/card-notice.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { seedUser, resetUser } from "../helpers";
import { cardWeeklyNotice, notifyCardWeekly } from "../../src/services/dmNoticeService";
import { setNoticeTypeEnabled } from "../../src/services/dmPrefsService";
import type { StatementIssued, StatementSettled } from "../../src/services/creditCardService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

const dueAt = new Date(Date.now() + 7 * 24 * 3_600_000);
const issued: StatementIssued = { userId: "u", tier: "STARTER", statementBalance: 300_000, minimumDue: 75_000, dueAt };
const settledBase = { userId: "u", interestCharged: 0, cardStatus: "ACTIVE", remainingBalance: 0 };
const paidFull: StatementSettled = { ...settledBase, status: "PAID_FULL", scoreDelta: 30 };
const paidMin: StatementSettled = { ...settledBase, status: "PAID_MINIMUM", scoreDelta: 20, remainingBalance: 225_000 };
const missed: StatementSettled = { ...settledBase, status: "MISSED", scoreDelta: -45, interestCharged: 36_000, cardStatus: "DELINQUENT", remainingBalance: 300_000 };
const locked: StatementSettled = { ...missed, scoreDelta: -60, cardStatus: "LOCKED" };

const text = (input: Parameters<typeof cardWeeklyNotice>[0]) => containerText(cardWeeklyNotice(input)!);

describe("cardWeeklyNotice", () => {
  it("returns null when nothing settled and the statement is zero", () => {
    expect(cardWeeklyNotice({ issued: { ...issued, statementBalance: 0, minimumDue: 0 } })).toBeNull();
    expect(cardWeeklyNotice({})).toBeNull();
  });

  it("titles and first block follow last week's outcome", () => {
    const full = text({ settled: paidFull });
    expect(full).toContain("## Card statement paid in full");
    expect(full).toContain("Last week's statement is paid in full. Credit score **+30**.");

    const min = text({ settled: paidMin });
    expect(min).toContain("## Minimum payment received");
    expect(min).toContain(`Credit score **+20**. **${fmtCurrency(225_000)}** rolls forward.`);

    const miss = text({ settled: missed });
    expect(miss).toContain("## Card payment missed");
    expect(miss).toContain(`Credit score **-45**. Interest of **${fmtCurrency(36_000)}** was added. Your card is now **DELINQUENT**.`);
    expect(miss).not.toContain("garnished");

    const lock = text({ settled: locked });
    expect(lock).toContain("Your card is now **LOCKED**. Income is garnished at 25% until the balance clears.");

    expect(text({ issued })).toContain("## New card statement");
  });

  it("statement block appears only for a positive balance and carries the due timestamp", () => {
    const both = text({ issued, settled: paidFull });
    expect(both).toContain(`**New statement:** ${fmtCurrency(300_000)}`);
    expect(both).toContain(`**Minimum due:** ${fmtCurrency(75_000)} by <t:${Math.floor(dueAt.getTime() / 1000)}:R>`);

    const zero = text({ issued: { ...issued, statementBalance: 0, minimumDue: 0 }, settled: paidFull });
    expect(zero).not.toContain("New statement");
  });

  it("uses the Credit emote and points at card pay and settings", () => {
    const c = cardWeeklyNotice({ issued })!;
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Credit));
    expect(containerText(c)).toContain("-# Pay with `!card pay <amount>`. Manage these DMs with `!settings`.");
  });
});

describe("notifyCardWeekly", () => {
  const a = "card-dm-a";
  const b = "card-dm-b";
  beforeEach(async () => {
    await seedUser(a);
    await seedUser(b);
  });
  afterAll(async () => {
    await resetUser(a);
    await resetUser(b);
  });

  it("sends one DM per cardholder, merging settlement and new statement", async () => {
    const { client, sent } = fakeDmClient();
    await notifyCardWeekly(client, {
      issued: [{ ...issued, userId: a }, { ...issued, userId: b }],
      settled: [{ ...paidFull, userId: a }],
    });
    expect(sent.get(a)).toBe(1);
    expect(sent.get(b)).toBe(1);
  });

  it("respects the card toggle", async () => {
    await setNoticeTypeEnabled(a, "card", false);
    const { client, sent } = fakeDmClient();
    await notifyCardWeekly(client, { issued: [{ ...issued, userId: a }], settled: [] });
    expect(sent.get(a)).toBeUndefined();
  });

  it("skips a cardholder with nothing to say", async () => {
    const { client, sent } = fakeDmClient();
    await notifyCardWeekly(client, { issued: [{ ...issued, userId: a, statementBalance: 0, minimumDue: 0 }], settled: [] });
    expect(sent.get(a)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/dm/card-notice.test.ts`
Expected: FAIL, `cardWeeklyNotice` is not exported.

- [ ] **Step 3: Add the card notice to `dmNoticeService.ts`**

Add to the imports (type-only, so no runtime dependency on the card service):

```ts
import type { StatementIssued, StatementSettled } from "./creditCardService";
```

Append to the end of the file:

```ts
export type CardWeeklyInput = { issued?: StatementIssued; settled?: StatementSettled };

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * One Monday DM per cardholder: last week's settlement (if any) and this
 * week's statement (if above zero). Null when there is nothing to say.
 */
export function cardWeeklyNotice(input: CardWeeklyInput): ContainerBuilder | null {
  const { issued, settled } = input;
  const hasStatement = !!issued && issued.statementBalance > 0;
  if (!settled && !hasStatement) return null;

  let title = "New card statement";
  const blocks: string[] = [];

  if (settled) {
    switch (settled.status) {
      case "PAID_FULL":
        title = "Card statement paid in full";
        blocks.push(`Last week's statement is paid in full. Credit score **${signed(settled.scoreDelta)}**.`);
        break;
      case "PAID_MINIMUM":
        title = "Minimum payment received";
        blocks.push(
          `You paid the minimum on last week's statement. Credit score **${signed(settled.scoreDelta)}**. ` +
            `**${fmtCurrency(settled.remainingBalance)}** rolls forward.`,
        );
        break;
      case "MISSED": {
        title = "Card payment missed";
        let line =
          `You missed last week's minimum. Credit score **${signed(settled.scoreDelta)}**. ` +
          `Interest of **${fmtCurrency(settled.interestCharged)}** was added. Your card is now **${settled.cardStatus}**.`;
        if (settled.cardStatus === "LOCKED") line += " Income is garnished at 25% until the balance clears.";
        blocks.push(line);
        break;
      }
    }
  }

  if (issued && hasStatement) {
    const dueUnix = Math.floor(issued.dueAt.getTime() / 1000);
    blocks.push(
      `**New statement:** ${fmtCurrency(issued.statementBalance)}\n` +
        `**Minimum due:** ${fmtCurrency(issued.minimumDue)} by <t:${dueUnix}:R>`,
    );
  }

  return noticeContainer(
    Mascot.Emotes.Credit,
    title,
    blocks.join("\n\n"),
    `-# Pay with \`!card pay <amount>\`. ${SETTINGS_HINT}.`,
  );
}

/** Groups the Monday cron's results by cardholder and sends one opt-out DM each. */
export async function notifyCardWeekly(
  client: Client,
  result: { issued: StatementIssued[]; settled: StatementSettled[] },
): Promise<void> {
  const byUser = new Map<string, CardWeeklyInput>();
  for (const s of result.settled) byUser.set(s.userId, { ...byUser.get(s.userId), settled: s });
  for (const i of result.issued) byUser.set(i.userId, { ...byUser.get(i.userId), issued: i });

  for (const [discordId, input] of byUser) {
    try {
      const container = cardWeeklyNotice(input);
      if (container) await sendOptOutDm(client, discordId, "card", container);
    } catch (err) {
      console.error(`notifyCardWeekly failed for ${discordId}:`, err);
    }
  }
}
```

- [ ] **Step 4: Call it from the scheduler**

In `src/scheduler.ts`, add the import:

```ts
import { notifyCardWeekly } from "./services/dmNoticeService";
```

and inside the weekly cron's `try`, after the `console.log(...)` line, add:

```ts
      await notifyCardWeekly(client, result);
```

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run test/dm/card-notice.test.ts`
Expected: PASS (7 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/dmNoticeService.ts src/scheduler.ts test/dm/card-notice.test.ts
git commit -m "feat(dm): DM cardholders their weekly statement and settlement outcome

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 7: Market sale notice

**Files:**
- Modify: `src/services/marketService.ts:160-170` (garnishment block and return)
- Modify: `src/services/huntPartService.ts:407` (return)
- Modify: `src/services/dmNoticeService.ts` (append)
- Modify: `src/commands/economy/market.ts:306, 380` (after each buy)
- Modify: `src/index.ts` (import; after the `bm_buy_confirm:` buy at line 130)
- Test: `test/market/buy-result.test.ts`, `test/dm/market-notice.test.ts`

**Interfaces:**
- Produces: `buyListing` return gains `totalPrice: number; garnished: number`; `buyHuntPartListing` return gains `totalPrice: number`.
- Produces (dmNoticeService):

  ```ts
  export type MarketSale = { sellerId: string; name: string; amount: number; totalPrice: number; fees: { sellerFee: number; sellerPayout: number }; garnished?: number };
  marketSaleNotice(sale: MarketSale): ContainerBuilder
  notifyMarketSale(client, sale: MarketSale): Promise<void>
  ```

- [ ] **Step 1: Write the failing return-shape test**

Create `test/market/buy-result.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { buyListing } from "../../src/services/marketService";
import { buyHuntPartListing, formatPartName } from "../../src/services/huntPartService";

const seller = "mkt-seller-1";
const buyer = "mkt-buyer-1";
const ITEM_NAME = "Test Widget";
const future = () => new Date(Date.now() + 3_600_000);

async function cleanup() {
  await testPrisma.marketListing.deleteMany({ where: { sellerId: seller } });
  await testPrisma.huntPartListing.deleteMany({ where: { sellerId: seller } });
  await testPrisma.huntPartInventory.deleteMany({ where: { userId: buyer } });
  const items = await testPrisma.shopItem.findMany({ where: { name: ITEM_NAME } });
  for (const item of items) {
    await testPrisma.inventory.deleteMany({ where: { shopItemId: item.id } });
    await testPrisma.shopItem.delete({ where: { id: item.id } });
  }
}

describe("buy results carry what the seller notice needs", () => {
  beforeEach(async () => {
    await cleanup();
    await seedUser(seller);
    await seedUser(buyer, { wallet: { create: { balance: 1_000_000 } } });
  });
  afterAll(async () => {
    await cleanup();
    await resetUser(seller);
    await resetUser(buyer);
  });

  it("buyListing reports the sale price and the garnished amount (zero for a clean seller)", async () => {
    const item = await testPrisma.shopItem.create({ data: { guildId: "global", name: ITEM_NAME, price: 1 } });
    const listing = await testPrisma.marketListing.create({
      data: { sellerId: seller, shopItemId: item.id, amount: 2, totalPrice: 100_000, expiresAt: future() },
    });

    const result = await buyListing(buyer, listing.id);

    expect(result).toMatchObject({ sellerId: seller, itemName: ITEM_NAME, amount: 2, totalPrice: 100_000, garnished: 0 });
    expect(result.fees.sellerPayout).toBe(90_000);
  });

  it("buyHuntPartListing reports the sale price", async () => {
    const listing = await testPrisma.huntPartListing.create({
      data: { sellerId: seller, partKey: "rabbit_fur", amount: 3, totalPrice: 30_000, expiresAt: future() },
    });

    const result = await buyHuntPartListing(buyer, listing.id);

    expect(result).toMatchObject({ sellerId: seller, amount: 3, totalPrice: 30_000 });
    expect(result.partName).toBe(formatPartName("rabbit_fur"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/market/buy-result.test.ts`
Expected: FAIL on `totalPrice` / `garnished` missing from the returned objects.

- [ ] **Step 3: Return the extra fields from both buy functions**

In `src/services/marketService.ts`, `buyListing`: the garnishment block and return (currently lines 160-170) become:

```ts
  // Garnishment: apply AFTER transaction succeeds (seller payout is earned income)
  let garnished = 0;
  try {
    garnished = (await applyGarnishment(listing.sellerId, fees.sellerPayout)).garnished;
    if (garnished > 0) {
      await prisma.wallet.update({
        where: { userId: listing.sellerId },
        data: { balance: { decrement: garnished } },
      });
    }
  } catch { /* Card service unavailable — skip */ }

  questBus.emit("economy:market_buy", { discordId: buyerDiscordId });
  return { itemName, amount: listing.amount, fees, sellerId: listing.sellerId, totalPrice: listing.totalPrice, garnished };
```

In `src/services/huntPartService.ts`, the last line of `buyHuntPartListing` becomes:

```ts
  return { partName: formatPartName(listing.partKey), amount: listing.amount, fees, sellerId: listing.sellerId, totalPrice: listing.totalPrice };
```

- [ ] **Step 4: Run the return-shape test to verify it passes**

Run: `npx vitest run test/market/buy-result.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing notice test**

Create `test/dm/market-notice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { marketSaleNotice } from "../../src/services/dmNoticeService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb } from "./helpers";

const sale = {
  sellerId: "s",
  name: "Wooden Rifle",
  amount: 2,
  totalPrice: 100_000,
  fees: { sellerFee: 10_000, sellerPayout: 90_000 },
};

describe("marketSaleNotice", () => {
  it("market thumbnail, quantity, item, price, fee, net, and the market hint", () => {
    const c = marketSaleNotice(sale);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Market));
    const t = containerText(c);
    expect(t).toContain("## Your listing sold!");
    expect(t).toContain(
      `**2× Wooden Rifle** sold for **${fmtCurrency(100_000)}**. After the **${fmtCurrency(10_000)}** fee you received **${fmtCurrency(90_000)}**.`,
    );
    expect(t).toContain("-# List more in `!market`. Manage these DMs with `!settings`.");
    expect(t).not.toContain("delinquent card");
  });

  it("mentions garnishment only when some of the payout went to a delinquent card", () => {
    const t = containerText(marketSaleNotice({ ...sale, garnished: 22_500 }));
    expect(t).toContain(`**${fmtCurrency(22_500)}** went to your delinquent card.`);
    expect(containerText(marketSaleNotice({ ...sale, garnished: 0 }))).not.toContain("delinquent card");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run test/dm/market-notice.test.ts`
Expected: FAIL, `marketSaleNotice` is not exported.

- [ ] **Step 7: Add the market notice to `dmNoticeService.ts`**

Append to the end of the file:

```ts
export type MarketSale = {
  sellerId: string;
  name: string;
  amount: number;
  totalPrice: number;
  fees: { sellerFee: number; sellerPayout: number };
  /** Part of the payout taken by a delinquent card. Only item sales garnish today. */
  garnished?: number;
};

export function marketSaleNotice(sale: MarketSale): ContainerBuilder {
  let body =
    `**${sale.amount}× ${sale.name}** sold for **${fmtCurrency(sale.totalPrice)}**. ` +
    `After the **${fmtCurrency(sale.fees.sellerFee)}** fee you received **${fmtCurrency(sale.fees.sellerPayout)}**.`;
  const garnished = sale.garnished ?? 0;
  if (garnished > 0) body += `\n**${fmtCurrency(garnished)}** went to your delinquent card.`;
  return noticeContainer(Mascot.Emotes.Market, "Your listing sold!", body, `-# List more in \`!market\`. ${SETTINGS_HINT}.`);
}

export async function notifyMarketSale(client: Client, sale: MarketSale): Promise<void> {
  await sendOptOutDm(client, sale.sellerId, "market", marketSaleNotice(sale));
}
```

- [ ] **Step 8: Fire the notice from the three buy call sites**

`src/commands/economy/market.ts`: add to the imports

```ts
import { notifyMarketSale } from "../../services/dmNoticeService";
```

After `const result = await buyHuntPartListing(ownerId, listingId);` (about line 306) add:

```ts
        void notifyMarketSale(interaction.client, { ...result, name: result.partName });
```

After `const result = await buyListing(ownerId, listingId);` (about line 380) add:

```ts
        void notifyMarketSale(interaction.client, { ...result, name: result.itemName });
```

`src/index.ts`: add to the imports

```ts
import { notifyMarketSale } from "./services/dmNoticeService";
```

and after `const result = await buyListing(ownerId, listingId);` in the `bm_buy_confirm:` handler (about line 130) add:

```ts
        void notifyMarketSale(interaction.client, { ...result, name: result.itemName });
```

- [ ] **Step 9: Run the tests and type-check**

Run: `npx vitest run test/dm/market-notice.test.ts test/market/buy-result.test.ts`
Expected: PASS (4 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/services/marketService.ts src/services/huntPartService.ts src/services/dmNoticeService.ts src/commands/economy/market.ts src/index.ts test/market/buy-result.test.ts test/dm/market-notice.test.ts
git commit -m "feat(dm): DM sellers when a market listing sells

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 8: Settings panel inside the container

**Files:**
- Modify: `src/commands/general/settings.ts` (whole file)
- Test: `test/dm/settings.test.ts`

**Interfaces:**
- Consumes: `DM_NOTICE_TYPES`, `DmNoticeGroup`, `DmNoticeType`, `DmPrefs`, `isDmNoticeType`, `isNoticeEnabled`, `getDmPrefs`, `noticeTypesInGroup`, `setNoticeTypeEnabled`, `setMasterEnabled` (Task 2); `Mascot`, `getEmoteUrl`.
- Produces: `buildSettingsPayload(ownerId: string, prefs: DmPrefs)` (exported for tests); `handleSettings`, `handleSettingsInteraction` keep their signatures.

- [ ] **Step 1: Write the failing test**

Create `test/dm/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ButtonStyle, ComponentType } from "discord.js";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { DM_NOTICE_TYPES } from "../../src/services/dmPrefsService";

const on = { remindersEnabled: true, disabledReminders: [] as string[] };
const off = { remindersEnabled: false, disabledReminders: [] as string[] };

function containerJson(prefs: { remindersEnabled: boolean; disabledReminders: string[] }) {
  const payload = buildSettingsPayload("owner", prefs);
  expect(payload.components).toHaveLength(1);
  return payload.components[0].toJSON() as any;
}

function countComponents(node: any): number {
  let n = 1;
  for (const c of node.components ?? []) n += countComponents(c);
  if (node.accessory) n += 1;
  return n;
}

function buttons(container: any): any[] {
  return container.components
    .filter((c: any) => c.type === ComponentType.ActionRow)
    .flatMap((r: any) => r.components);
}

describe("settings panel", () => {
  it("keeps every button inside the one container", () => {
    const json = containerJson(on);
    expect(json.type).toBe(ComponentType.Container);
    const ids = buttons(json).map((b) => b.custom_id);
    expect(ids).toContain("settings:master:owner");
    for (const type of Object.keys(DM_NOTICE_TYPES)) expect(ids).toContain(`settings:toggle:${type}:owner`);
    expect(ids).toHaveLength(1 + Object.keys(DM_NOTICE_TYPES).length);
  });

  it("stays well under Discord's 40-component cap, master off included", () => {
    expect(countComponents(containerJson(on))).toBeLessThan(35);
    expect(countComponents(containerJson(off))).toBeLessThan(35);
  });

  it("groups cooldown alarms before account notices and lists the always-on alerts", () => {
    const texts = containerJson(on).components
      .filter((c: any) => c.type === ComponentType.TextDisplay)
      .map((c: any) => c.content as string);
    const cooldownAt = texts.indexOf("### Cooldown alarms");
    const accountAt = texts.indexOf("### Account notices");
    expect(cooldownAt).toBeGreaterThan(-1);
    expect(accountAt).toBeGreaterThan(cooldownAt);
    expect(texts[texts.length - 1]).toBe("-# Security alerts (robbery, padlock, tax raid) are always on.");
  });

  it("header is a section with the settings emote as thumbnail", () => {
    const header = containerJson(on).components[0];
    expect(header.type).toBe(ComponentType.Section);
    expect(header.components[0].content).toContain("## Your Settings");
    expect(header.accessory.media.url).toMatch(/^https:\/\/cdn\.discordapp\.com\/emojis\//);
  });

  it("master off: red master, every type button disabled, the re-enable hint shown", () => {
    const json = containerJson(off);
    const all = buttons(json);
    const master = all.find((b) => b.custom_id === "settings:master:owner");
    expect(master.label).toBe("All DMs: OFF");
    expect(master.style).toBe(ButtonStyle.Danger);
    for (const b of all.filter((b) => b.custom_id.startsWith("settings:toggle:"))) expect(b.disabled).toBe(true);
    const texts = json.components.filter((c: any) => c.type === ComponentType.TextDisplay).map((c: any) => c.content);
    expect(texts.some((t: string) => t.startsWith("-# Reminders are currently off."))).toBe(true);
  });

  it("master on: green master, no re-enable hint", () => {
    const json = containerJson(on);
    const master = buttons(json).find((b) => b.custom_id === "settings:master:owner");
    expect(master.label).toBe("All DMs: ON");
    expect(master.style).toBe(ButtonStyle.Success);
    const texts = json.components.filter((c: any) => c.type === ComponentType.TextDisplay).map((c: any) => c.content);
    expect(texts.some((t: string) => t.startsWith("-# Reminders are currently off."))).toBe(false);
  });

  it("a disabled type reads OFF in grey while the others stay green", () => {
    const all = buttons(containerJson({ remindersEnabled: true, disabledReminders: ["card"] }));
    const card = all.find((b) => b.custom_id === "settings:toggle:card:owner");
    expect(card.label).toBe("Card statements: OFF");
    expect(card.style).toBe(ButtonStyle.Secondary);
    const daily = all.find((b) => b.custom_id === "settings:toggle:daily:owner");
    expect(daily.label).toBe("Daily reward: ON");
    expect(daily.style).toBe(ButtonStyle.Success);
  });

  it("puts at most four buttons in a row", () => {
    const rows = containerJson(on).components.filter((c: any) => c.type === ComponentType.ActionRow);
    for (const row of rows) expect(row.components.length).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/dm/settings.test.ts`
Expected: FAIL, `buildSettingsPayload` is not exported (and the old shape has four top-level components).

- [ ] **Step 3: Rewrite `settings.ts`**

Replace the whole file with:

```ts
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import {
    DM_NOTICE_TYPES,
    DmNoticeGroup,
    DmNoticeType,
    DmPrefs,
    getDmPrefs,
    isDmNoticeType,
    isNoticeEnabled,
    noticeTypesInGroup,
    setMasterEnabled,
    setNoticeTypeEnabled,
} from "../../services/dmPrefsService";

const GROUPS: { group: DmNoticeGroup; heading: string }[] = [
    { group: "cooldown", heading: "Cooldown alarms" },
    { group: "account", heading: "Account notices" },
];
const BUTTONS_PER_ROW = 4;

function chunk<T>(items: T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
    return rows;
}

function divider() {
    return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

/** The whole panel is one container; every button row lives inside it. */
export function buildSettingsPayload(ownerId: string, prefs: DmPrefs) {
    const container = new ContainerBuilder();
    const intro = "## Your Settings\nFortuna DMs you when these happen. Toggle what you want.";
    const thumb = getEmoteUrl(Mascot.Emotes.Settings);
    if (thumb) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(intro))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)),
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(intro));
    }

    // Auto-pause (closed DMs) leaves the master off; we can't distinguish it
    // from a manual off, so the hint shows whenever the master is off — the
    // advice is accurate in both cases.
    if (!prefs.remindersEnabled) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "-# Reminders are currently off. If your DMs were closed, allow DMs from server members, then turn the master switch back on.",
            ),
        );
    }

    container.addSeparatorComponents(divider());
    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`settings:master:${ownerId}`)
                .setLabel(prefs.remindersEnabled ? "All DMs: ON" : "All DMs: OFF")
                .setStyle(prefs.remindersEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
    );

    const typeButton = (type: DmNoticeType) => {
        const on = isNoticeEnabled(prefs, type);
        return new ButtonBuilder()
            .setCustomId(`settings:toggle:${type}:${ownerId}`)
            .setLabel(`${DM_NOTICE_TYPES[type].label}: ${on ? "ON" : "OFF"}`)
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!prefs.remindersEnabled);
    };

    for (const { group, heading } of GROUPS) {
        container.addSeparatorComponents(divider());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}`));
        for (const row of chunk(noticeTypesInGroup(group), BUTTONS_PER_ROW)) {
            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(...row.map(typeButton)),
            );
        }
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("-# Security alerts (robbery, padlock, tax raid) are always on."),
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as number,
        allowedMentions: { parse: [] },
    };
}

export async function handleSettings(message: Message) {
    if (!message.guildId) return;
    await ensureUserAndWallet(message.author.id, message.guildId, message.author.tag);
    const prefs = await getDmPrefs(message.author.id);
    return message.reply(buildSettingsPayload(message.author.id, prefs));
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
        const prefs = await getDmPrefs(ownerId);
        await setMasterEnabled(ownerId, !prefs.remindersEnabled);
    } else if (action === "toggle") {
        const type = parts[2];
        if (!isDmNoticeType(type)) {
            return interaction.reply({ content: "Unknown setting.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const prefs = await getDmPrefs(ownerId);
        const currentlyOn = !prefs.disabledReminders.includes(type);
        await setNoticeTypeEnabled(ownerId, type, !currentlyOn);
    } else {
        return interaction.reply({ content: "Unknown setting.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const prefs = await getDmPrefs(ownerId);
    return interaction.update(buildSettingsPayload(ownerId, prefs)).catch(() => {});
}
```

- [ ] **Step 4: Run the test and type-check**

Run: `npx vitest run test/dm/settings.test.ts`
Expected: PASS (8 tests).

Run: `npm run typecheck`
Expected: no errors. (The `prisma` import is gone from this file; `noticeTypesInGroup` drives the rows, so `TYPE_ORDER` is gone too.)

- [ ] **Step 5: Commit**

```bash
git add src/commands/general/settings.ts test/dm/settings.test.ts
git commit -m "feat(settings): move DM toggles inside the container and group them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```

---

### Task 9: Whole-tree verification

**Files:** none new. Fix anything the checks surface.

- [ ] **Step 1: Type-check the whole tree**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: PASS. New files: `test/dm/notice-container`, `prefs`, `notices`, `send`, `card-notice`, `market-notice`, `settings`, `test/card/settlement-outcomes`, `test/market/buy-result`.

- [ ] **Step 3: Grep for stragglers**

Run:

```bash
grep -rn --include=*.ts "victimNotifyService\|REMINDER_TYPES\|getReminderPrefs\|setReminderTypeEnabled\|isReminderType\|buildDmContent" src test
grep -rn --include=*.ts "users\.fetch(.*)\.\(then\|catch\)" src/services | grep -v dmNoticeService
```

Expected: both empty. The second confirms the only DM send path left in services is `dmNoticeService.sendDm` (the `removeItem` admin command fetches a user for its username only, and lives under `src/commands`).

- [ ] **Step 4: Spec cross-check**

Confirm each row of the spec's notice table has a builder and a test: robbed, padlock, tax raid (Task 3); cooldown single and multi (Task 4); card weekly with four titles (Task 6); market sale with garnish line (Task 7). Confirm the settings panel has ten toggles in two groups inside one container (Task 8).

- [ ] **Step 5: Manual smoke (needs a dev bot, optional)**

With the bot running against a dev token: `!settings` shows one card with grouped buttons and the settings emote; toggling a type re-renders inside the card. Rob yourself from an alt to receive the robbed DM. If any of these misbehave, treat it as a bug to fix before reporting done.

- [ ] **Step 6: Commit any fixes**

Only if Steps 1-3 required changes:

```bash
git add -A src test
git commit -m "fix(dm): tidy leftovers from the DM notice migration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019A3LY7oS6AAVD6uDWPri7o"
```
