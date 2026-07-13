# Victim DM Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instantly DM a player when they get robbed (who + amount) or when their Padlock is consumed blocking a robbery — always on, independent of `!settings`.

**Architecture:** A tiny `victimNotifyService` with two fire-and-forget DM functions, called from rob.ts's success path and padlock-block branch. No schema, no scheduler, no prefs reads.

**Tech Stack:** TypeScript, discord.js v14.

**Spec:** `docs/superpowers/specs/2026-07-13-victim-notifications-design.md`

## Global Constraints

- **Always on:** never read `remindersEnabled`/`disabledReminders`; never touch `reminderDmFailCount`. Fully independent of the cooldown-alarm system.
- **Never break the robbery flow:** both functions catch and swallow every error internally; call sites use `void fn(...)`.
- DM copy exactly per spec (🚨 robbed / 🔒 padlock), amounts via `fmtCurrency`, `in **{server}**` omitted when guild name is null.
- Verification: `npx tsc --noEmit` (bot) and `cd dashboard && npx next build` (site) — no test runner exists.
- Commits: conventional style + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: victimNotifyService + rob.ts hooks + settings note

**Files:**
- Create: `src/services/victimNotifyService.ts`
- Modify: `src/commands/economy/rob.ts` (padlock branch ~line 58–63; success reply ~line 127)
- Modify: `src/commands/general/settings.ts` (one container line)

**Interfaces:**
- Produces: `notifyRobbed(client: Client, victimId: string, robberName: string, amount: number, guildName: string | null): Promise<void>`, `notifyPadlockUsed(client: Client, victimId: string, robberName: string, guildName: string | null): Promise<void>`.

- [ ] **Step 1: Create `src/services/victimNotifyService.ts`:**

```ts
import { Client } from "discord.js";
import { fmtCurrency } from "../utils/format";

// Security notices sent when something is done TO a player. Deliberately
// independent of the cooldown-alarm settings: always on, never counted
// against reminderDmFailCount, all failures swallowed.

async function sendDm(client: Client, userId: string, content: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    await user.send({ content }).catch(() => {});
  } catch {
    // Never let a notification failure surface to gameplay.
  }
}

export async function notifyRobbed(
  client: Client,
  victimId: string,
  robberName: string,
  amount: number,
  guildName: string | null,
): Promise<void> {
  const where = guildName ? ` in **${guildName}**` : "";
  await sendDm(
    client,
    victimId,
    `🚨 **You've been robbed!** **${robberName}** lifted **${fmtCurrency(amount)}** from your wallet${where}.\n` +
      "-# Wallet money can be robbed — bank what you don't need with `!deposit`.",
  );
}

export async function notifyPadlockUsed(
  client: Client,
  victimId: string,
  robberName: string,
  guildName: string | null,
): Promise<void> {
  const where = guildName ? ` in **${guildName}**` : "";
  await sendDm(
    client,
    victimId,
    `🔒 **Your Padlock just paid for itself.** **${robberName}** tried to rob you${where} — it blocked the hit and broke in the process.\n` +
      "-# Padlocks are single-use. Grab another: `!shop buy padlock`.",
  );
}
```

- [ ] **Step 2: Hook rob.ts.** Add import:

```ts
import { notifyRobbed, notifyPadlockUsed } from "../../services/victimNotifyService";
```

Padlock branch — change:

```ts
    const victimPadlocked = await checkPadlock(targetUser.id);
    if (victimPadlocked) {
        void notifyPadlockUsed(
            message.client,
            targetUser.id,
            message.member?.displayName ?? message.author.username,
            message.guild?.name ?? null,
        );
        return message.reply({
            embeds: [errorEmbed(message.author, "Robbery Blocked!", `**${targetUser.displayName}** has a **Padlock** active — their wallet is protected. Your attempt was foiled.`)]
        });
    }
```

Success path — directly after the `prisma.$transaction` result and before the success `return message.reply(...)`:

```ts
        void notifyRobbed(
            message.client,
            targetUser.id,
            message.member?.displayName ?? message.author.username,
            result.robAmount,
            message.guild?.name ?? null,
        );
```

- [ ] **Step 3: Settings transparency line.** In `src/commands/general/settings.ts`, in `buildSettingsPayload`, after the master/type rows are defined, add to the container (after the separator, before returning — i.e. as a final TextDisplay on the container):

```ts
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            "-# Security alerts (robbery, padlock) are always on.",
        ),
    );
```

Place this AFTER the `autoPaused` block so it renders under the header section.

- [ ] **Step 4: Typecheck:**

Run: `npx tsc --noEmit`
Expected: 0 new errors (compare to pre-change count).

- [ ] **Step 5: Commit**

```bash
git add src/services/victimNotifyService.ts src/commands/economy/rob.ts src/commands/general/settings.ts
git commit -m "feat(notify): always-on victim DMs for robbery and padlock consumption"
```

---

### Task 2: Website docs sentence

**Files:**
- Modify: `dashboard/src/content/modules/economy.ts` ("Robbing & getting robbed" section body)

- [ ] **Step 1:** Append one sentence to the last body paragraph of the rob section (match surrounding voice), e.g.:

```text
Victims aren't left guessing: Fortuna DMs you who robbed you and for exactly how much — and when your Padlock takes the hit for you.
```

- [ ] **Step 2: Build the site:**

Run: `cd dashboard && npx next build`
Expected: compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/content/modules/economy.ts
git commit -m "docs(web): note victim DMs in the rob docs"
```

## Plan Self-Review Notes (already applied)

- The Step 1 first code block contained a call-signature bug (missing `victimId` argument); the corrected block below it is the authoritative version — implementer uses the corrected functions with the original `sendDm` helper.
- Spec coverage: service ✓, both hooks ✓, settings line ✓, docs sentence ✓, always-on independence ✓ (no prefs imports anywhere).
- rob.ts identifiers verified against current source: `targetUser.id`, `targetUser.displayName`, `message.member?.displayName`, `result.robAmount`, `message.guild?.name`.
