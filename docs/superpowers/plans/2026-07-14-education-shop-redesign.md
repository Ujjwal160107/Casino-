# Education Shop Redesign + Study-Loop Anti-Exploit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the study cooldown to 30 minutes (rate-limited clears + a daily cap so it can't be spammed) and redesign all 9 Uni Store items into distinct identities, several carrying real downsides.

**Architecture:** The study loop's cooldown/cap gate lives in `study.ts`; per-session XP/stress/event math lives in the `study()` service. We extend `study()` to take a `StudyModifiers` object so items can bias events, cancel setbacks, zero out a session, or adjust stress. Item effects are Redis buff payloads written by `shopItemEffects.ts` handlers and read by `study.ts`. Item identities/keys are unchanged, so no DB seed or inventory migration.

**Tech Stack:** TypeScript (CommonJS), discord.js v14, Prisma (PostgreSQL), ioredis. Bot source under `src/`; docs site under `dashboard/`.

## Global Constraints

- **No test runner exists** in this repo (no jest/vitest, no `test` script). The automated gate for every task is `npm run typecheck` (`tsc --noEmit`) run from the repo root. Behavioral correctness is verified by the manual Discord checks each task lists — there is no unit-test harness to add, and adding one is out of scope (YAGNI).
- **Base study cooldown:** exactly `1800` seconds (30 min).
- **Daily study cap:** exactly `16` attempts/day, reset at local midnight.
- **Coffee Thermos:** 4h per-use cooldown (`4 * 3600`), `+8` education stress on a real clear, refunded (`shouldConsume:false`) when there is no active cooldown.
- **Caps:** stacked `xpMultiplier` ≤ `2.0` (existing); stacked `failReduction` ≤ `0.90` (new).
- **Testers bypass** the study cooldown, the daily cap, and item use-cooldowns (`isTesterMember` / `isTester`).
- **Item keys/names are stable** — no seed, dashboard-inventory, or DB migration. Redis buff payload shape changes are forward-only (old keys carry short TTLs and simply expire).
- **Style:** match surrounding code; use `redisService` (not raw ioredis) for buff reads/writes; keep money math in whole coins.

---

## File Structure

- `src/utils/economyConfig.ts` — study cooldown constant + new daily-cap constant. (Task 1)
- `src/services/educationService.ts` — `StudyModifiers` interface, `study()` rewrite, positive-event helpers. (Task 2)
- `src/services/shopItemEffects.ts` — rewrite the 6 study-buff handlers, Coffee Thermos (stress + cooldown wrap), Scholarship reject sting; add `coffee_thermos` to the buff-cooldown map + switch case. (Task 3)
- `src/commands/life/study.ts` — 30-min gate, daily-cap gate, record-attempt, new buff payload shapes, modifier assembly, guaranteed-pass rescue. (Task 4)
- `src/utils/shopCatalog.ts` + `dashboard/src/content/modules/{education,items-and-shop}.ts` + `dashboard/src/content/commands.ts` — player-facing copy. (Task 5)

Sequencing note: Task 3 writes the Redis buff payload shapes; Task 4 reads them. The exact shapes are pinned in both tasks' **Interfaces** blocks — they MUST match field-for-field.

---

### Task 1: Study cooldown + daily-cap config

**Files:**
- Modify: `src/utils/economyConfig.ts:4`

**Interfaces:**
- Produces: `DEFAULT_STUDY_COOLDOWN_SECONDS = 1800` (existing name, new value); `STUDY_DAILY_CAP = 16` (new export).

- [ ] **Step 1: Change the cooldown and add the cap**

In `src/utils/economyConfig.ts`, replace line 4:

```ts
export const DEFAULT_STUDY_COOLDOWN_SECONDS = 300;
```

with:

```ts
export const DEFAULT_STUDY_COOLDOWN_SECONDS = 1800;
export const STUDY_DAILY_CAP = 16;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). `STUDY_DAILY_CAP` is unused for now — that's fine, it's a `const` export, not a local.

- [ ] **Step 3: Commit**

```bash
git add src/utils/economyConfig.ts
git commit -m "feat(uni): study cooldown 5m->30m + add STUDY_DAILY_CAP"
```

---

### Task 2: `study()` accepts a modifiers object

**Files:**
- Modify: `src/services/educationService.ts` (helpers near line 11-20; `study()` at 233-350)
- Modify: `src/commands/life/study.ts:197` (keep the single caller compiling)

**Interfaces:**
- Consumes: `STUDY_EVENTS`, `StudyEvent` (already imported at `educationService.ts:9`).
- Produces:
  - `export interface StudyModifiers { bonusXp?: number; stressDelta?: number; wrongChapterHit?: boolean; eventImmunity?: boolean; eventBiasPositive?: boolean; eventAmplify?: boolean; guaranteedPositiveEvent?: boolean; }`
  - `study(userId: string, guildId: string, modifiers?: StudyModifiers)` — same return shape as today: `{ msg, newXp, newStress, scholarship }`.

- [ ] **Step 1: Add positive-event helpers**

In `src/services/educationService.ts`, immediately after the `resolveEventOutcome` function (ends at line 20), add:

```ts
function isPositiveEvent(e: StudyEvent): boolean {
    return e.xpMod > 0 && e.outcome !== "failure";
}

function getPositiveStudyEvent(degreeType: string): StudyEvent {
    const eligible = STUDY_EVENTS.filter(
        e => (e.degreeType === degreeType || e.degreeType === "all") && isPositiveEvent(e)
    );
    if (eligible.length === 0) return getStudyEvent(degreeType);
    return eligible[Math.floor(Math.random() * eligible.length)];
}
```

- [ ] **Step 2: Add the `StudyModifiers` interface**

Directly above `export async function study(` (line 233), add:

```ts
export interface StudyModifiers {
    /** Buff XP already summed in study.ts (multipliers + focus/craft bonuses). */
    bonusXp?: number;
    /** Study Laptop (-6) / Tutor Pass (-10) — applied to this session's stress. */
    stressDelta?: number;
    /** Textbook Bundle rolled a wrong-chapter miss → this session earns 0 XP. */
    wrongChapterHit?: boolean;
    /** Focus Notes → neutralize a negative study event this session. */
    eventImmunity?: boolean;
    /** Lab Kit → 70% chance to re-pick a positive event when one rolls. */
    eventBiasPositive?: boolean;
    /** Lab Kit → +50% magnitude on the rolled event (both directions). */
    eventAmplify?: boolean;
    /** Tutor Pass → force a positive study event this session. */
    guaranteedPositiveEvent?: boolean;
}
```

- [ ] **Step 3: Replace the `study()` function body**

Replace the entire function from `export async function study(userId: string, guildId: string, bonusXp: number = 0) {` (line 233) through its closing `}` (line 350) with:

```ts
export async function study(userId: string, guildId: string, modifiers: StudyModifiers = {}) {
    const {
        bonusXp = 0,
        stressDelta = 0,
        wrongChapterHit = false,
        eventImmunity = false,
        eventBiasPositive = false,
        eventAmplify = false,
        guaranteedPositiveEvent = false,
    } = modifiers;

    const user = await prisma.user.findUnique({
        where: { discordId: userId },
        include: { currentEducation: { include: { degree: true } } }
    });

    if (!user || !user.currentEducation) throw new Error("You are not enrolled in any school.");

    const edu = user.currentEducation;

    // Lazy migration: if user has GPA progress but no XP, convert
    if (edu.educationXp === 0 && edu.currentGpa > 0) {
        const migratedXp = migrateGpaToXp(edu.currentGpa, edu.degree.xpRequired);
        await prisma.userEducation.update({ where: { id: edu.id }, data: { educationXp: migratedXp, currentGpa: 0 } });
        edu.educationXp = migratedXp;
    }

    // Check for Textbooks in Inventory (passive UNI_BOOK items)
    const inventory = await prisma.inventory.findMany({
        where: { userId: user.discordId, shopItem: { itemType: "UNI_BOOK" } },
        include: { shopItem: true }
    });

    let extraXp = 0;
    let bookUsedMsg = "";

    const bestBook = inventory.sort((a, b) => (b.shopItem.price - a.shopItem.price))[0];

    if (bestBook) {
        const effect = (bestBook.shopItem.effects as any[])?.find(e => e.type === "STUDY_BOOST");
        if (effect) {
            extraXp = Math.floor((effect.value || 0.2) * 100);
            bookUsedMsg = `\n📚 Used **${bestBook.shopItem.name}** (+${extraXp} XP).`;

            if (bestBook.shopItem.maxUses) {
                const meta = (bestBook.meta as any) || {};
                let usesLeft = meta.usesLeft !== undefined ? meta.usesLeft : bestBook.shopItem.maxUses;
                usesLeft -= 1;

                if (usesLeft <= 0) {
                    await prisma.inventory.delete({ where: { id: bestBook.id } });
                    bookUsedMsg += ` (Broken!)`;
                } else {
                    await prisma.inventory.update({
                        where: { id: bestBook.id },
                        data: { meta: { ...meta, usesLeft } }
                    });
                    bookUsedMsg += ` (${usesLeft} uses left)`;
                }
            }
        }
    }

    // Textbook Bundle wrong-chapter miss wastes the whole session's XP (stress still applies).
    const xpGain = wrongChapterHit ? 0 : Math.floor(50 + extraXp + bonusXp);
    const stressGain = Math.max(5, 20 - (user.discipline * 0.2));

    let newXp = edu.educationXp + xpGain;
    let newStress = Math.min(100, Math.max(0, edu.stress + stressGain + stressDelta));

    let msg: string;
    if (wrongChapterHit) {
        msg = `📕 **Wrong chapter!** You studied the wrong material — **0 XP** this session. Stress +${stressGain}.`;
    } else {
        msg = `You studied hard! XP: ${edu.educationXp} → **${newXp}** (+${xpGain}). Stress +${stressGain}.`;
        if (bonusXp > 0) msg += ` (Includes +${bonusXp} from buffs!)`;
        msg += bookUsedMsg;
    }

    // Study Events — 25% normally, forced on by Tutor Pass
    if (guaranteedPositiveEvent || Math.random() < 0.25) {
        let event = guaranteedPositiveEvent
            ? getPositiveStudyEvent(edu.degree.type)
            : getStudyEvent(edu.degree.type);

        // Lab Kit positive bias: 70% chance to re-pick a positive event
        if (!guaranteedPositiveEvent && eventBiasPositive && !isPositiveEvent(event) && Math.random() < 0.70) {
            event = getPositiveStudyEvent(edu.degree.type);
        }

        const success = guaranteedPositiveEvent ? true : resolveEventOutcome(event);
        const amp = eventAmplify ? 1.5 : 1.0;

        if (success) {
            const xpMod = Math.round(event.xpMod * amp);
            const stressMod = Math.round(event.stressMod * amp);
            newXp = Math.max(0, newXp + xpMod);
            newStress = Math.max(0, Math.min(100, newStress + stressMod));
            if (event.moneyMod) {
                const money = Math.round(event.moneyMod * amp);
                const wallet = await prisma.wallet.findUnique({ where: { userId: user.discordId } });
                if (wallet) await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: money } } });
                msg += `\n\n${Mascot.Emotes.Success} **${event.title}**\n${event.description}\n✅ Success! (+${xpMod} XP, ${stressMod >= 0 ? '+' : ''}${stressMod} Stress) +${money.toLocaleString()} coins`;
            } else {
                msg += `\n\n${Mascot.Emotes.Success} **${event.title}**\n${event.description}\n✅ Success! (+${xpMod} XP, ${stressMod >= 0 ? '+' : ''}${stressMod} Stress)`;
            }
        } else if (eventImmunity) {
            msg += `\n\n📝 **Focus Notes saved you.** A **${event.title}** setback was neutralized — no XP or stress lost.`;
        } else {
            const xpLoss = Math.round(Math.abs(event.xpMod) * amp);
            const stressAdd = Math.round(Math.abs(event.stressMod) * amp);
            newXp = Math.max(0, newXp - xpLoss);
            newStress = Math.max(0, Math.min(100, newStress + stressAdd));
            msg += `\n\n${Mascot.Emotes.Fail} **${event.title}**\n${event.description}\n❌ Failed! (-${xpLoss} XP, +${stressAdd} Stress)`;
        }
    }

    // Burnout Check
    if (newStress > 90 && Math.random() < 0.25) {
        newXp = Math.max(0, newXp - 100);
        msg += `\n\n${Mascot.Emotes.Alert} **BURNOUT!** You pushed yourself too hard. Lost **100 XP**. Take a break!`;
    }

    await prisma.userEducation.update({
        where: { id: edu.id },
        data: {
            educationXp: newXp,
            stress: newStress,
            lastStudy: new Date()
        }
    });

    await invalidateUserCache(userId, guildId);

    // Scholarship check at 75% and 100% of xpRequired
    let scholarship: { milestone: number, amount: number } | null = null;
    const pct = newXp / edu.degree.xpRequired;
    if (pct >= 1.0 && !edu.scholarshipsClaimed.includes(100)) {
        const amount = edu.degree.tuitionPerSem * edu.currentSemester * 2;
        scholarship = { milestone: 100, amount };
    } else if (pct >= 0.75 && !edu.scholarshipsClaimed.includes(75)) {
        const amount = edu.degree.tuitionPerSem * edu.currentSemester * 1.5;
        scholarship = { milestone: 75, amount };
    }

    return { msg, newXp, newStress, scholarship };
}
```

- [ ] **Step 4: Keep the caller compiling**

`study.ts:197` currently passes a number. Change that single call to pass a modifiers object (Task 4 expands it fully). In `src/commands/life/study.ts`, replace:

```ts
        const res = await study(message.author.id, message.guild!.id, bonusXp);
```

with:

```ts
        const res = await study(message.author.id, message.guild!.id, { bonusXp });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If it errors on `study(` arity elsewhere, grep confirms there are no other callers (`study.ts:197` is the only one) — re-check the edit.

- [ ] **Step 6: Commit**

```bash
git add src/services/educationService.ts src/commands/life/study.ts
git commit -m "feat(uni): study() takes a StudyModifiers object (events, stress, wrong-chapter)"
```

---

### Task 3: Redesign the Uni item handlers

**Files:**
- Modify: `src/services/shopItemEffects.ts` — switch case (line 107); `BUFF_ITEM_COOLDOWN_SECONDS` (516-525); `handleStudyLaptop` (1002), `handleTextbookBundle` (1007), `handleLabKit` (1012), `handleCalculatorPro` (1017), `handleCoffeeThermos` (1022), `handleFocusNotes` (1044), `handleTutorPass` (1054), `handleScholarshipLetter` (1059).

**Interfaces:**
- Produces (Redis buff payloads — Task 4 reads these EXACT shapes):
  - `study_laptop`: `{ sessionsLeft: 5, xpMult: 1.15, stressDelta: -6, failRescue: 0.10 }` (TTL 604800)
  - `textbook_bundle`: `{ sessionsLeft: 3, xpMult: 1.4, wrongChapterChance: 0.15 }` (TTL 172800)
  - `lab_kit`: `{ sessionsLeft: 3, xpMult: 1.15, failRescue: 0.10, eventBiasPositive: true, eventAmplify: true }` (TTL 259200)
  - `calculator_pro`: `{ sessionsLeft: 3, xpMult: 1.1, failRescue: 0.30 }` (TTL 172800)
  - `focus_notes`: `{ active: true, bonusXp: 45, eventImmunity: true }` (TTL 172800)
  - `tutor_pass`: `{ active: true, xpMult: 1.6, guaranteedPass: true, guaranteedPositiveEvent: true, stressDelta: -10 }` (TTL 172800)
- Consumes: `withBuffCooldown`, `DEFAULT_STUDY_COOLDOWN_SECONDS`, `redisService`, `prisma` (all already imported in this file).

- [ ] **Step 1: Register Coffee Thermos in the buff-cooldown map**

In `BUFF_ITEM_COOLDOWN_SECONDS` (line 516-525), add a line before the closing brace:

```ts
  coffee_thermos: 4 * 3600,      // clears the 30-min study cooldown — rate-limit the clear
```

- [ ] **Step 2: Wrap the Coffee Thermos switch case**

At line 107, replace:

```ts
    case "coffee_thermos":
      return handleCoffeeThermos(discordId, guildId);
```

with:

```ts
    case "coffee_thermos":
      return withBuffCooldown("coffee_thermos", discordId, () => handleCoffeeThermos(discordId, guildId));
```

- [ ] **Step 3: Rewrite the six study-buff handlers**

Replace `handleStudyLaptop` (1002-1005):

```ts
async function handleStudyLaptop(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`study_laptop:${discordId}`, { sessionsLeft: 5, xpMult: 1.15, stressDelta: -6, failRescue: 0.10 }, 604800);
  return { success: true, message: `**Study Laptop activated!**\n\nNext **5** study sessions: **1.15x XP**, **-6 stress**, and a **+10% fail-rescue** each (expires in 7 days).` };
}
```

Replace `handleTextbookBundle` (1007-1010):

```ts
async function handleTextbookBundle(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`textbook_bundle:${discordId}`, { sessionsLeft: 3, xpMult: 1.4, wrongChapterChance: 0.15 }, 172800);
  return { success: true, message: `**Textbook Bundle activated!**\n\nNext **3** sessions: **1.4x XP** — but a **15% chance each** you study the wrong chapter and gain **0 XP** that session (stress still applies). Expires in 48h.` };
}
```

Replace `handleLabKit` (1012-1015):

```ts
async function handleLabKit(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`lab_kit:${discordId}`, { sessionsLeft: 3, xpMult: 1.15, failRescue: 0.10, eventBiasPositive: true, eventAmplify: true }, 259200);
  return { success: true, message: `**Lab Kit activated!**\n\nNext **3** sessions: **1.15x XP**, **+10% fail-rescue**, and study events skew **positive** with **+50% magnitude** — but a negative event that slips through also hits **50% harder** (expires in 72h).` };
}
```

Replace `handleCalculatorPro` (1017-1020):

```ts
async function handleCalculatorPro(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`calculator_pro:${discordId}`, { sessionsLeft: 3, xpMult: 1.1, failRescue: 0.30 }, 172800);
  return { success: true, message: `**Calculator Pro activated!**\n\nNext **3** sessions: a strong **+30% fail-rescue** and **1.1x XP** (expires in 48h).` };
}
```

Replace `handleFocusNotes` (1044-1047):

```ts
async function handleFocusNotes(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`focus_notes:${discordId}`, { active: true, bonusXp: 45, eventImmunity: true }, 172800);
  return { success: true, message: `**Focus Notes activated!**\n\nYour next successful session gets **+45 bonus XP** and **cancels one negative study event** if it strikes (expires in 48h).` };
}
```

Replace `handleTutorPass` (1054-1057):

```ts
async function handleTutorPass(discordId: string): Promise<ShopItemUseResult> {
  await redisService.set(`tutor_pass:${discordId}`, { active: true, xpMult: 1.6, guaranteedPass: true, guaranteedPositiveEvent: true, stressDelta: -10 }, 172800);
  return { success: true, message: `**Tutor Pass activated!**\n\nYour next session **can't fail** the minigame, gives **1.6x XP**, **guarantees a positive study event**, and cuts **10 stress** (expires in 48h).` };
}
```

- [ ] **Step 4: Rewrite Coffee Thermos (stress + no-op refund)**

Replace `handleCoffeeThermos` (1022-1042):

```ts
async function handleCoffeeThermos(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const edu = await prisma.userEducation.findUnique({ where: { userId: discordId } });
  if (!edu || !edu.lastStudy) {
    return { success: true, shouldConsume: false, message: `You drink the coffee... but you have no study cooldown to clear. **Saved for later.**` };
  }

  const cooldownMs = DEFAULT_STUDY_COOLDOWN_SECONDS * 1000;
  const elapsed = Date.now() - new Date(edu.lastStudy).getTime();

  if (elapsed >= cooldownMs) {
    return { success: true, shouldConsume: false, message: `You drink the coffee... but your study cooldown already passed. **Saved for later.**` };
  }

  const pastTime = new Date(Date.now() - cooldownMs);
  const newStress = Math.min(100, edu.stress + 8);
  await prisma.userEducation.update({
    where: { userId: discordId },
    data: { lastStudy: pastTime, stress: newStress },
  });

  return { success: true, message: `**Study cooldown cleared!** You can study again now — but the caffeine crash costs you **+8 stress** (now ${newStress}/100).` };
}
```

Note: the no-op paths now return `shouldConsume:false` (was implicitly `true`). This means a wasted Thermos is **not** consumed and does **not** start its 4h cooldown — consistent with `withBuffCooldown`'s refund rule and every other no-op item. The catalog copy (Task 5) is updated to match.

- [ ] **Step 5: Add the Scholarship reject sting**

In `handleScholarshipLetter`, replace the final `else` branch (lines 1090-1092):

```ts
  } else {
    resultMsg = `**Scholarship Rejected.**\n\nYour application was not accepted this time. Better luck next time.`;
  }
```

with:

```ts
  } else {
    const eduReject = await prisma.userEducation.findUnique({ where: { userId: discordId } });
    if (eduReject) {
      await prisma.userEducation.update({
        where: { userId: discordId },
        data: { stress: Math.min(100, eduReject.stress + 5) },
      });
    }
    resultMsg = `**Scholarship Rejected.**\n\nYour application was not accepted this time.${eduReject ? " The rejection stings (**+5 stress**)." : ""} Better luck next time.`;
  }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/shopItemEffects.ts
git commit -m "feat(uni): redesign Uni item handlers + rate-limit Coffee Thermos with stress cost"
```

---

### Task 4: Wire the study command to the new gates and buffs

**Files:**
- Modify: `src/commands/life/study.ts` — import (14); gate + buff-read block (55-94); fail-rescue block (171-176); `study()` call (194-202).

**Interfaces:**
- Consumes: `STUDY_DAILY_CAP`, `DEFAULT_STUDY_COOLDOWN_SECONDS` (economyConfig); the Task 3 Redis buff payload shapes; `study(userId, guildId, StudyModifiers)` (Task 2).
- Produces: Redis key `study_count:<discordId>` (number, midnight TTL).

- [ ] **Step 1: Import the daily-cap constant**

Replace `study.ts:14`:

```ts
import { DEFAULT_STUDY_COOLDOWN_SECONDS } from "../../utils/economyConfig";
```

with:

```ts
import { DEFAULT_STUDY_COOLDOWN_SECONDS, STUDY_DAILY_CAP } from "../../utils/economyConfig";
```

- [ ] **Step 2: Replace the gate + buff-read block**

Replace the whole region from `// DB-Based Cooldown (Dynamic)` (line 55) through the `xpMultiplier = Math.min(xpMultiplier, 2.0);` line (line 94) with:

```ts
    // DB-Based Cooldown (30 min)
    const cooldownSeconds = DEFAULT_STUDY_COOLDOWN_SECONDS;
    const cooldownMs = cooldownSeconds * 1000;
    const lastStudyTime = user.currentEducation.lastStudy ? new Date(user.currentEducation.lastStudy).getTime() : 0;
    const now = Date.now();

    const testerBypass = isTesterMember(message.member);
    if (now - lastStudyTime < cooldownMs && !testerBypass) {
        const remainingMs = cooldownMs - (now - lastStudyTime);
        const expiresAt = Math.floor((now + remainingMs) / 1000);

        const angryUrl = getEmoteUrl(Mascot.Emotes.TeacherAngry);
        const cooldownContainer = errorContainer(
            "Cooldown",
            `You are tired of studying! Try again <t:${expiresAt}:R>.`,
            { hint: studyEducationNote(prefix), thumbnailUrl: angryUrl ?? undefined }
        );
        return message.reply(v2Reply(cooldownContainer));
    }

    const userId = message.author.id;

    // Daily study cap — anti-exploit backstop (testers bypass)
    const studyCountKey = `study_count:${userId}`;
    const dailyCount = (await redisService.get<number>(studyCountKey)) ?? 0;
    if (dailyCount >= STUDY_DAILY_CAP && !testerBypass) {
        const capContainer = errorContainer(
            "Daily Limit Reached",
            `You've studied **${STUDY_DAILY_CAP}** times today — your brain is full. Come back tomorrow.`,
            { hint: studyEducationNote(prefix) }
        );
        return message.reply(v2Reply(capContainer));
    }

    // Record the attempt up-front so the 30-min cooldown and the daily count apply
    // to ANY attempt past the gate — win OR lose — closing the fail-retry bypass.
    if (!testerBypass) {
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const secondsUntilMidnight = Math.max(1, Math.floor((midnight.getTime() - now) / 1000));
        await redisService.set(studyCountKey, dailyCount + 1, secondsUntilMidnight);
        await prisma.userEducation.update({
            where: { id: user.currentEducation.id },
            data: { lastStudy: new Date(now) },
        });
    }

    // Fetch active Uni Store buffs
    const [studyLaptop, textbookBundle, labKit, calcPro, focusNotes, tutorPass, craftedStudyXp] = await Promise.all([
      redisService.get<{ sessionsLeft: number; xpMult: number; stressDelta: number; failRescue: number }>(`study_laptop:${userId}`),
      redisService.get<{ sessionsLeft: number; xpMult: number; wrongChapterChance: number }>(`textbook_bundle:${userId}`),
      redisService.get<{ sessionsLeft: number; xpMult: number; failRescue: number; eventBiasPositive: boolean; eventAmplify: boolean }>(`lab_kit:${userId}`),
      redisService.get<{ sessionsLeft: number; xpMult: number; failRescue: number }>(`calculator_pro:${userId}`),
      redisService.get<{ active: boolean; bonusXp: number; eventImmunity: boolean }>(`focus_notes:${userId}`),
      redisService.get<{ active: boolean; xpMult: number; guaranteedPass: boolean; guaranteedPositiveEvent: boolean; stressDelta: number }>(`tutor_pass:${userId}`),
      redisService.get<{ bonusXp: number }>(`crafted_study_xp:${userId}`),
    ]);

    let xpMultiplier = 1.0;
    let failReduction = 0;
    let stressDelta = 0;
    let guaranteedPass = false;
    let eventBiasPositive = false;
    let eventAmplify = false;
    let eventImmunity = false;
    let guaranteedPositiveEvent = false;

    if (studyLaptop) { xpMultiplier *= studyLaptop.xpMult; failReduction += studyLaptop.failRescue; stressDelta += studyLaptop.stressDelta; }
    if (textbookBundle) { xpMultiplier *= textbookBundle.xpMult; }
    if (labKit) { xpMultiplier *= labKit.xpMult; failReduction += labKit.failRescue; eventBiasPositive = eventBiasPositive || !!labKit.eventBiasPositive; eventAmplify = eventAmplify || !!labKit.eventAmplify; }
    if (calcPro) { xpMultiplier *= calcPro.xpMult; failReduction += calcPro.failRescue; }
    if (tutorPass) { xpMultiplier *= tutorPass.xpMult; stressDelta += tutorPass.stressDelta; guaranteedPass = true; guaranteedPositiveEvent = true; }
    if (focusNotes) { eventImmunity = true; }
    xpMultiplier = Math.min(xpMultiplier, 2.0);
    failReduction = Math.min(failReduction, 0.90);

    // Textbook Bundle "wrong chapter" roll — once per attempt
    const wrongChapterHit = !!textbookBundle && Math.random() < textbookBundle.wrongChapterChance;
```

- [ ] **Step 3: Add guaranteed-pass to the rescue block**

Replace the fail-rescue block (lines 171-176):

```ts
    // Fail rescue: if user failed but has active buffs with failReduction, attempt rescue
    let rescued = false;
    if (!isWin && failReduction > 0 && Math.random() < failReduction) {
        isWin = true;
        rescued = true;
    }
```

with:

```ts
    // Guaranteed pass (Tutor Pass) or a fail-rescue roll from stacked buffs
    let rescued = false;
    if (!isWin && guaranteedPass) {
        isWin = true;
        rescued = true;
    } else if (!isWin && failReduction > 0 && Math.random() < failReduction) {
        isWin = true;
        rescued = true;
    }
```

- [ ] **Step 4: Pass the modifiers into `study()`**

Replace the `study()` call (currently `{ bonusXp }` after Task 2):

```ts
        const res = await study(message.author.id, message.guild!.id, { bonusXp });
```

with:

```ts
        const res = await study(message.author.id, message.guild!.id, {
            bonusXp,
            stressDelta,
            wrongChapterHit,
            eventImmunity,
            eventBiasPositive,
            eventAmplify,
            guaranteedPositiveEvent,
        });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (In particular, `userId` is now declared once in the gate block; confirm the old `const userId = message.author.id;` from the buff-fetch block is gone — it was inside the replaced region.)

- [ ] **Step 6: Manual behavioral verification (running bot + tester bypass OFF)**

These require a live bot with a non-tester account enrolled in a degree. Confirm each:

1. `!study`, win → normal XP. Immediately `!study` again → **"Cooldown … try again <t:…:R>"** (~30 min).
2. `!study`, **lose** the minigame → immediately `!study` again → **still on cooldown** (fail-retry closed).
3. Use `Coffee Thermos` → `!study` works immediately; education stress rose by 8; `use Coffee Thermos` again → **"still recharging"** (4h). With no active cooldown, `use Coffee Thermos` says "Saved for later" and is **not** consumed.
4. After 16 attempts in a day → 17th `!study` → **"Daily Limit Reached."**
5. Tester account → no cooldown, no cap.

- [ ] **Step 7: Commit**

```bash
git add src/commands/life/study.ts
git commit -m "feat(uni): 30-min study gate, daily cap, attempt recording, new buff wiring"
```

---

### Task 5: Player-facing copy (catalog + dashboard)

**Files:**
- Modify: `src/utils/shopCatalog.ts` — UNI item `description`/`shortDescription` (Study Laptop 715-716, Textbook Bundle 728-729, Lab Kit 741-742, Calculator Pro 753-754, Coffee Thermos 767-768, Focus Notes 780-781, Tutor Pass 806-807, Scholarship Letter 819-820).
- Modify: `dashboard/src/content/modules/items-and-shop.ts:105-113`
- Modify: `dashboard/src/content/modules/education.ts` (lines 9, 36, 38, 61, 67, 69)
- Modify: `dashboard/src/content/commands.ts:873`

**Interfaces:** none (string data only).

- [ ] **Step 1: Update `shopCatalog.ts` UNI descriptions**

Set each UNI item's `description` and `shortDescription` to:

```ts
// study_laptop
description: "Reliable study rig. For your next 5 study sessions: 1.15x XP, -6 stress, and a +10% chance to rescue a failed minigame. The steady all-rounder that keeps you studying without burning out.",
shortDescription: "5 sessions: 1.15x XP, -6 stress, +10% rescue.",

// textbook_bundle
description: "A stack of dense course books. Next 3 sessions: 1.4x study XP — but each session has a 15% chance you studied the wrong chapter and gain 0 XP (stress still applies). Cheap, high-average, with a sting.",
shortDescription: "3 sessions: 1.4x XP, 15% wrong-chapter risk.",

// lab_kit
description: "Volatile lab equipment. Next 3 sessions: 1.15x XP, +10% fail-rescue, and study events skew positive with +50% magnitude — but a negative event that slips through also hits 50% harder. High variance.",
shortDescription: "3 sessions: 1.15x XP, +10% rescue, amplified events.",

// calculator_pro
description: "A precision exam tool. Next 3 sessions: a strong +30% chance to rescue a failed minigame, plus 1.1x XP. The answer to 'I keep fumbling the questions.'",
shortDescription: "3 sessions: +30% fail-rescue + 1.1x XP.",

// coffee_thermos
description: "A jolt of caffeine that clears your 30-minute study cooldown so you can study again now. Costs +8 stress (the crash) and can only be used once every 4 hours. If you have no active cooldown, it's saved for later (not consumed).",
shortDescription: "Clears study cooldown; +8 stress; once per 4h.",

// focus_notes
description: "Airtight revision notes. Your next successful study session gains +45 bonus XP and neutralizes one negative study event if it strikes.",
shortDescription: "Next success: +45 XP + cancels one bad event.",

// tutor_pass
description: "A session with a private tutor. Your next study session cannot fail the minigame, grants 1.6x XP, guarantees a positive study event, and cuts 10 stress. The premium guaranteed great session.",
shortDescription: "1 session: no-fail, 1.6x XP, positive event, -10 stress.",

// scholarship_letter
description: "Submit for a chance at a large reward. 45% coin payout (50k-200k), 35% education XP (+25-150), 20% rejected (nothing, +5 stress). 1-hour cooldown between uses.",
shortDescription: "Roll: 45% coins / 35% XP / 20% reject (+5 stress). 1h CD.",
```

(Leave `cheat_sheet` copy unchanged — its behavior is unchanged.)

- [ ] **Step 2: Update the dashboard UNI item table**

In `dashboard/src/content/modules/items-and-shop.ts`, replace rows 105-113 with:

```ts
          ["Coffee Thermos", "80,000", "Clears the 30-min study cooldown; +8 stress; once per 4h (refunded if no cooldown)"],
          ["Textbook Bundle", "120,000", "1.4× study XP for 3 sessions — 15% wrong-chapter (0 XP) risk each"],
          ["Calculator Pro", "150,000", "+30% fail rescue + 1.1× XP for 3 sessions"],
          ["Focus Notes", "160,000", "+45 bonus XP on your next successful study + cancels one negative event"],
          ["Study Laptop", "180,000", "1.15× XP, −6 stress, +10% fail rescue for 5 sessions"],
          ["Cheat Sheet", "250,000", "Next exam: 70% → +25% of required XP / 30% → caught: −15% XP, +15 stress, −10% wallet"],
          ["Lab Kit", "300,000", "1.15× XP, +10% rescue, amplified (±) study events for 3 sessions"],
          ["Tutor Pass", "400,000", "1 session: can't fail, 1.6× XP, guaranteed positive event, −10 stress"],
          ["Scholarship Letter", "750,000", "Instant roll: 45% → 50k–200k coins / 35% → +25–150 edu XP / 20% → nothing +5 stress (1h cooldown)"],
```

- [ ] **Step 3: Update `commands.ts` study cooldown**

`dashboard/src/content/commands.ts:873`: change `cooldown: "5 min",` to `cooldown: "30 min",`.

- [ ] **Step 4: Update `education.ts` prose**

Apply these exact replacements in `dashboard/src/content/modules/education.ts`:

Line 9 — replace `grind !study minigames every 5 minutes for XP` with `grind !study minigames every 30 minutes for XP`.

Line 36 — replace heading `"Studying: the 5-minute loop"` with `"Studying: the 30-minute loop"`.

Line 38 — replace the whole string with:

```ts
        "!study runs one of five minigames — math, word scramble, reaction test, trivia, typing — on a 30-minute cooldown that applies whether you win or lose, and you can study at most 16 times a day. A win banks 50 XP base; a loss banks nothing. UNI shop items stack onto wins: the best owned study book adds ~+20 XP, multipliers like Study Laptop (1.15×) or Tutor Pass (1.6×) amplify further (multiplier total caps at 2×), and Focus Notes drops +45 on your next success. The crafted Duck Feather Quill from hunting adds +25 once.",
```

Line 61 — replace the whole string with:

```ts
        "Every study accelerant, ranked by what it does: Coffee Thermos (80,000) clears one 30-minute cooldown for +8 stress, once per 4h; Textbook Bundle (120,000) 1.4× for 3 sessions with a 15% wrong-chapter risk each; Calculator Pro (150,000) +30% fail rescue + 1.1× ×3; Focus Notes (160,000) +45 next win and cancels one bad event; Study Laptop (180,000) 1.15× + −6 stress + 10% rescue ×5; Cheat Sheet (250,000) the exam gamble; Lab Kit (300,000) 1.15× + 10% rescue with amplified events ×3; Tutor Pass (400,000) a no-fail 1.6× session with a guaranteed positive event ×1; Scholarship Letter (750,000) an instant roll — 45% for 50k–200k coins, 35% for 25–150 XP, 20% nothing +5 stress.",
```

Line 67 — replace `The 5-minute cooldown nests inside every other timer in Fortuna` with `The 30-minute cooldown nests inside every other timer in Fortuna`.

Line 69 — replace `turns a 50-XP session into 130+` with `turns a 50-XP session into 125+`.

- [ ] **Step 5: Typecheck the bot copy**

Run: `npm run typecheck`
Expected: PASS (covers `shopCatalog.ts`).

- [ ] **Step 6: Typecheck the dashboard copy**

Run: `cd dashboard && npx tsc --noEmit && cd ..`
Expected: PASS. If the dashboard has no local `tsc`, the edits are plain strings in typed arrays — confirm visually that quotes/commas are balanced and skip.

- [ ] **Step 7: Commit**

```bash
git add src/utils/shopCatalog.ts dashboard/src/content/modules/education.ts dashboard/src/content/modules/items-and-shop.ts dashboard/src/content/commands.ts
git commit -m "docs(uni): update item + study-cooldown copy for the redesign"
```

---

## Final verification

- [ ] **Full typecheck:** `npm run typecheck` → PASS.
- [ ] **Grep for stale study-cooldown copy:** `git grep -n "5-minute\|every 5 minutes\|5-min study" -- dashboard/src src` → only unrelated hits (casino/rob 5-min cooldowns), none about study.
- [ ] **Manual smoke (from Task 4 Step 6):** cooldown-on-fail, Coffee Thermos rate-limit + stress, daily cap, tester bypass all behave as described.
