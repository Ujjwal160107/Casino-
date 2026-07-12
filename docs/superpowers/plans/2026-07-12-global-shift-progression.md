# Global Shift Progression (jobXp Removal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace jobXp-based job progression with a lifetime `shiftsWorked` counter gating all 21 jobs (0/5/10/20/30/60/100), and remove `jobXp` (plus dead `lastJobShift`/`lastJobPromotion`) from the schema.

**Architecture:** Code first, schema last — Tasks 1–4 remove every `jobXp` read/write while the field still exists (typecheck stays green at each commit); Task 5 then deletes the fields from both Prisma schemas and regenerates the client; Tasks 6–7 update docs and ship. The promotion/application gate swaps to the `reqShifts` plumbing that already exists in `checkPromotion` (hardcoded 0 today).

**Tech Stack:** TypeScript strict, Prisma + MongoDB, ioredis (`redisService`), discord.js v14. No test framework — gates are `npm run typecheck`, `npm run build`, `cd dashboard && npx tsc --noEmit`, and grep assertions.

## Global Constraints

- NO Redis or MongoDB data migration — pure code changes; stray `jobXp` values in old documents are ignored.
- `shiftsWorked` is a lifetime counter: never reset, never decremented. Only SUCCESSFUL shifts increment it (the event path's unconditional increment must become conditional).
- The reqShifts table is exact: tech_intern 0, tech_junior 10, tech_senior 30, tech_lead 60, med_resident 0, med_general 10, med_surgeon 30, med_chief 100, biz_intern 0, biz_analyst 10, biz_manager 30, law_paralegal 5, law_associate 30, law_partner 100, srv_waiter 0, srv_chef 20, trd_apprentice 0, trd_mechanic 30, freelance_writer/uber/streamer 0.
- All player-facing copy states exact numbers; no vague wording.
- Sector reputation, gear, stress/burnout, jobStreak, jobFailStreak demotion, interviews, cooldowns (`lastShift`), income tax, WorkLog: UNCHANGED.
- Work on `main`; after final verification cherry-pick all commits to `fortuna-v2` and push both.

---

### Task 1: Gate swap — `reqXp` → `reqShifts` in jobService + display consumers

**Files:**
- Modify: `src/services/jobService.ts` (interface :14, JOBS :71-106, getJobApplicationStatus :166-169, checkPromotion :207-225, getPromotionProgress :237-256)
- Modify: `src/commands/life/jobs.ts:60` (formatRequirement)
- Modify: `src/commands/life/work.ts:68-72, 116-124` (promotion progress)
- Modify: `src/handlers/lifeInteractionHandler.ts:519, 559-566` (footer/next-job text using missingXp)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (Tasks 2/3 rely on): `checkPromotion(user, guildId?) → Promise<{ eligible: boolean; nextJob: JobDefinition | null; missingShifts: number }>` (missingXp REMOVED); `getPromotionProgress({ jobId, shiftsWorked }, guildId?)` (jobXp arg REMOVED); `JobDefinition.reqShifts?: number` (reqXp REMOVED).

Note: user objects still carry `jobXp` until Task 5 — passing them around stays type-safe; this task only stops the gate logic READING it.

- [ ] **Step 1: Interface + catalog values**

In `src/services/jobService.ts` replace line 14:

```ts
    reqShifts?: number; // Min lifetime shiftsWorked required to hold/promote to this job
```

(delete the `reqXp?: number;` line). Then in the `JOBS` array replace every `reqXp: <n>` with `reqShifts: <m>` per the Global Constraints table. Resulting per-line values: tech_intern `reqShifts: 0`, tech_junior `reqShifts: 10`, tech_senior `reqShifts: 30`, tech_lead `reqShifts: 60`, med_resident `reqShifts: 0`, med_general `reqShifts: 10`, med_surgeon `reqShifts: 30`, med_chief `reqShifts: 100`, biz_intern `reqShifts: 0`, biz_analyst `reqShifts: 10`, biz_manager `reqShifts: 30`, law_paralegal `reqShifts: 5`, law_associate `reqShifts: 30`, law_partner `reqShifts: 100`, srv_waiter `reqShifts: 0`, srv_chef `reqShifts: 20`, trd_apprentice `reqShifts: 0`, trd_mechanic `reqShifts: 30`, freelance_writer/freelance_uber/freelance_streamer `reqShifts: 0`.

- [ ] **Step 2: Application gate**

Replace `getJobApplicationStatus`'s signature line and XP block (:143, :166-169):

```ts
export function getJobApplicationStatus(
    user: { jobId?: string | null; shiftsWorked?: number; degrees?: { degree: { name: string } }[] },
    job: JobDefinition
) {
```

and

```ts
    const requiredShifts = job.reqShifts ?? 0;
    if (requiredShifts > 0 && (user.shiftsWorked ?? 0) < requiredShifts) {
        missing.push(`Need ${requiredShifts} lifetime shifts (you have ${user.shiftsWorked ?? 0})`);
    }
```

- [ ] **Step 3: Promotion gate**

Replace `checkPromotion` (:204-225) entirely:

```ts
/**
 * Checks if a user is eligible for a promotion based on lifetime shifts worked.
 */
export async function checkPromotion(user: any, _guildId?: string): Promise<{ eligible: boolean; nextJob: JobDefinition | null; missingShifts: number }> {
    if (!user.jobId) return { eligible: false, nextJob: null, missingShifts: 0 };

    // Find a job that requires this current job as a prereq
    const nextJob = JOBS.find(j => j.reqJobId === user.jobId);
    if (!nextJob) return { eligible: false, nextJob: null, missingShifts: 0 };

    const reqShifts = nextJob.reqShifts ?? 0;
    const missingShifts = Math.max(0, reqShifts - (user.shiftsWorked || 0));

    return { eligible: missingShifts === 0, nextJob, missingShifts };
}
```

and `getPromotionProgress` (:237-256):

```ts
export async function getPromotionProgress(
    user: { jobId?: string | null; shiftsWorked: number },
    guildId?: string
): Promise<{ eligible: boolean; nextJob: JobDefinition | null; missingShifts: number; progressText: string }> {
    const result = await checkPromotion(user, guildId);
    let progressText = "";
    if (!result.nextJob) {
        progressText = "At the top of your career path.";
    } else if (result.eligible) {
        progressText = `Ready for **${result.nextJob.title}**!`;
    } else {
        progressText = `Need: ${result.missingShifts} more shifts → ${result.nextJob.title}`;
    }
    return { ...result, progressText };
}
```

- [ ] **Step 4: Display consumers**

`src/commands/life/jobs.ts:60`: replace `if (job.reqXp) requirements.push(\`XP: ${job.reqXp}\`);` with:

```ts
    if (job.reqShifts) requirements.push(`Shifts: ${job.reqShifts}`);
```

`src/commands/life/work.ts:69-72`: replace the `getPromotionProgress` call with:

```ts
    const promo = await getPromotionProgress(
        { jobId: user.jobId, shiftsWorked: user.shiftsWorked },
        message.guildId!
    );
```

`src/commands/life/work.ts:116-124` (progress bar): replace the `xpPct` block with:

```ts
    } else if (promo.nextJob) {
        const reqShifts = promo.nextJob.reqShifts ?? 0;
        const shiftPct = Math.min(100, Math.floor((reqShifts - promo.missingShifts) / Math.max(1, reqShifts) * 100));
        const filled = Math.round(shiftPct / 10);
        const bar = "`[" + "█".repeat(filled) + "░".repeat(10 - filled) + "]`";
        careerProgressContent =
            `### Career Progress\n` +
            `Next: **${promo.nextJob.title}**\n` +
            `${bar} ${shiftPct}%\n` +
            promo.progressText;
    } else {
```

Also update the comment on :68 from `// Promotion progress (XP-based, correct)` to `// Promotion progress (lifetime-shift-based)`.

`src/handlers/lifeInteractionHandler.ts:519`: replace the footer line with:

```ts
                footerText = `Next Job: ${promoCheck.nextJob.title} (${promoCheck.missingShifts} shifts to go)`;
```

Then grep the file for any other `missingXp` reads (there is a second promotion block around :559-566 after the event embed) and apply the same replacement pattern — the text becomes `(${promoCheck.missingShifts} shifts to go)`.

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` → exit 0. Run: `grep -n "reqXp\|missingXp" src -r` → zero matches.

```bash
git add src/services/jobService.ts src/commands/life/jobs.ts src/commands/life/work.ts src/handlers/lifeInteractionHandler.ts
git commit -m "feat(jobs): gate applications and promotions on lifetime shifts, not XP"
```

---

### Task 2: Shift flow — remove XP writes, lifetime counter semantics

**Files:**
- Modify: `src/handlers/lifeInteractionHandler.ts` (event resolution ~:414-434, :482-492, :508-536, :540; minigame win ~:952-965, :1010-1021, :1032; minigame fail :1178-1185, :1191; resign :296-306; promote comment :265)
- Modify: `src/commands/life/apply.ts:180-183` (hire)
- Modify: `src/commands/life/work.ts:152` (XP display line)

**Interfaces:**
- Consumes: Task 1's `checkPromotion` (returns `missingShifts` only).
- Produces: shift paths free of `jobXp`; `shiftsWorked` incremented ONLY on success/pagerSaved in both paths; hire/resign no longer reset `shiftsWorked`.

- [ ] **Step 1: Event resolution path**

In `src/handlers/lifeInteractionHandler.ts`, event block (~:414-434): delete the Focus Headphones XP-boost block (:414-425, leave the redis key alone — Task 3 gives the item its new meaning) and the `xpGain` assignments. Replace the success/failure outcome block so it no longer computes `xpGain`:

```ts
        if (success || pagerSaved) {
            stressGain = pagerSaved ? 2 : (stress || 0);
            if (pagerSaved) eventNotes.push("Critical failure softened: no pay, +2 Stress");
        } else {
            earnings = 0;
            stressGain = (stress || 10) + 15;
            eventNotes.push(`Penalty: No Pay, +${stressGain} Stress`);
        }
```

(The `xp` destructured from `choice.outcome` becomes unused here; remove it from the destructuring. Task 4 strips it from the data.)

DB update (:482-492) — remove the `jobXp` line and make the shift increment conditional:

```ts
        await prisma.user.update({
            where: { discordId: userData.discordId },
            data: {
                wallet: { update: { balance: { increment: earnings } } },
                jobStress: Math.min(100, (userData.jobStress || 0) + stressGain), // Cap at 100
                shiftsWorked: success || pagerSaved ? { increment: 1 } : undefined,
                lastShift: new Date(),
                jobFailStreak: success || pagerSaved ? 0 : undefined // Reset fail streak on success or pager save
            }
        });
```

Promotion/demotion branching keyed on `xpGain` (:512, :525, :545): replace `if (xpGain > 0)` with `if (success || pagerSaved)` and `if (xpGain < 0)` with `if (!success && !pagerSaved)`. Replace both promotion projections `{ ...userData, jobXp: userData.jobXp + xpGain, shiftsWorked: userData.shiftsWorked + 1 }` with `{ ...userData, shiftsWorked: (userData.shiftsWorked ?? 0) + 1 }`.

Event result embed (:540): remove the XP segment from the description:

```ts
            .setDescription(`**${choice.label}**\n${msg}\n\n**Result:**\n${Mascot.Emotes.MoneyBag} ${fmtCurrency(earnings)}\n${Mascot.Emotes.Alert} +${stressGain} Stress`)
```

- [ ] **Step 2: Minigame win path**

Delete the Focus Headphones XP block (:952-965) and the `let xpGain = 10;` declaration. In the DB update (:1010-1021) remove the `jobXp: { increment: xpGain },` line (everything else stays, including `shiftsWorked: { increment: 1 }`). Replace the promotion projection (:1032):

```ts
            const promoCheck = await checkPromotion({ ...userData, shiftsWorked: (userData.shiftsWorked ?? 0) + 1 }, guild.id);
```

Then grep the win-embed section below (:1038-1170) for any `XP` display strings (e.g. a `+10 XP` line or `xpGain` reference) and remove them.

- [ ] **Step 3: Minigame fail path**

Replace the fail DB update (:1178-1185):

```ts
            await prisma.user.update({
                where: { discordId: user.id },
                data: {
                    lastShift: new Date(), // Trigger cooldown
                    jobStress: Math.min(100, (userData.jobStress || 0) + 10) // +10 Stress, capped at 100
                }
            });
```

and the penalty copy (:1191):

```ts
            const desc = `You messed up the task!\n\n**Correct Answer:** ${game.answer}\n\n**Penalty:**\n- No Pay\n- **+10 Stress**\n\nCome back in **${cooldownSeconds > 0 ? formatDuration(cooldownMs) : "a moment"}**.`;
```

- [ ] **Step 4: Hire, resign, promote comment**

`src/commands/life/apply.ts:180-183`:

```ts
    if (passed) {
        await prisma.user.update({
            where: { discordId },
            data: { jobId: job.id, lastShift: null }
        });
    }
```

`src/handlers/lifeInteractionHandler.ts` resign (:296-306): the update becomes `data: { jobId: null, lastShift: null }` and the embed description becomes:

```ts
                .setDescription("**You have resigned.**\n\nYou are now unemployed. Your lifetime shift count is preserved — it still counts toward future job requirements.")
```

Promote comment (:265): change `// keep jobXp, shiftsWorked, jobStress` to `// keep shiftsWorked, jobStress`.

- [ ] **Step 5: Work dashboard display**

`src/commands/life/work.ts:152`:

```ts
                `**Lifetime Shifts:** ${user.shiftsWorked}  |  **Streak:** ${user.jobStreak ?? 0}\n` +
```

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck` → exit 0. Run: `grep -n "jobXp" src/handlers/lifeInteractionHandler.ts src/commands/life/apply.ts src/commands/life/work.ts` → zero matches.

```bash
git add src/handlers/lifeInteractionHandler.ts src/commands/life/apply.ts src/commands/life/work.ts
git commit -m "feat(jobs): lifetime shiftsWorked - no resets on hire/resign, XP writes removed, fails never count"
```

---

### Task 3: Item rework — Black Market Resume + Focus Headphones

**Files:**
- Modify: `src/services/shopItemEffects.ts` (`handleBlackMarketResume` :925-946, `handleFocusHeadphones` :891 area)
- Modify: `src/utils/shopCatalog.ts` (`blackmarket_resume` :680-692, `focus_headphones` :611-623)
- Modify: `src/handlers/lifeInteractionHandler.ts` (rep grants :496 and :1024 gain focus-doubling)

**Interfaces:**
- Consumes: Task 2's cleaned shift paths (rep grants at the two call sites).
- Produces: redis key `focus_headphones:<id>` now shaped `{ shiftsLeft: number; repMult: number }`.

- [ ] **Step 1: Black Market Resume handler**

Replace `handleBlackMarketResume` (:925-946):

```ts
async function handleBlackMarketResume(discordId: string, guildId: string): Promise<ShopItemUseResult> {
  const roll = Math.random();
  if (roll < 0.65) {
    // Success: credit lifetime shifts toward job requirements
    const shiftBoost = randomInt(3, 8);
    await prisma.user.update({ where: { discordId }, data: { shiftsWorked: { increment: shiftBoost } } });
    return { success: true, message: `**Black Market Resume — Success!**\n\nThe résumé passed all checks. **+${shiftBoost} lifetime shifts** credited to your career record.` };
  } else {
    // Backfire: stress only — the lifetime shift counter never decreases
    const stressPenalty = randomInt(10, 25);
    const user = await prisma.user.findUnique({ where: { discordId } });
    await prisma.user.update({
      where: { discordId },
      data: { jobStress: Math.min(100, (user?.jobStress ?? 0) + stressPenalty) },
    });
    return { success: true, message: `**Black Market Resume — Exposed!**\n\nHR caught the forgery. Stress **+${stressPenalty}**. You're lucky you still have a job.` };
  }
}
```

- [ ] **Step 2: Focus Headphones handler**

Find the `focus_headphones` handler (redis set at :891). Replace its body's redis payload and message:

```ts
  await redisService.set(`focus_headphones:${discordId}`, { shiftsLeft: 3, repMult: 2 }, 86400 * 3); // 3 days max
  return { success: true, message: `**Focus Headphones on!**\n\nSector reputation gain is **doubled (+10 instead of +5)** for your next **3 successful shifts** (expires in 3 days).` };
```

- [ ] **Step 3: Wire rep doubling into both shift paths**

`src/handlers/lifeInteractionHandler.ts` minigame win rep grant (:1024) — replace:

```ts
            let shiftRepGain = 5;
            const focusRepData = await redisService.get<{ shiftsLeft: number; repMult: number }>(`focus_headphones:${user.id}`);
            if (focusRepData && focusRepData.shiftsLeft > 0 && focusRepData.repMult) {
                shiftRepGain = 5 * focusRepData.repMult;
                const focusRemaining = focusRepData.shiftsLeft - 1;
                if (focusRemaining <= 0) {
                    await redisService.del(`focus_headphones:${user.id}`);
                } else {
                    const focusTtl = await redisService.getInstance().ttl(`focus_headphones:${user.id}`);
                    if (focusTtl > 0) await redisService.set(`focus_headphones:${user.id}`, { ...focusRepData, shiftsLeft: focusRemaining }, focusTtl);
                }
                jobEffectNotes.push(`Focus Headphones: +${shiftRepGain} rep (${focusRemaining} shifts left)`);
            }
            const shiftRepResult = await _addShiftRep(user.id, job.sector, shiftRepGain, "shift_success");
```

Event rep grant (:496) — same pattern, base 8:

```ts
            let eventRepGain = 8;
            const focusEventData = await redisService.get<{ shiftsLeft: number; repMult: number }>(`focus_headphones:${user.id}`);
            if (focusEventData && focusEventData.shiftsLeft > 0 && focusEventData.repMult) {
                eventRepGain = 8 * focusEventData.repMult;
                const focusRemaining = focusEventData.shiftsLeft - 1;
                if (focusRemaining <= 0) {
                    await redisService.del(`focus_headphones:${user.id}`);
                } else {
                    const focusTtl = await redisService.getInstance().ttl(`focus_headphones:${user.id}`);
                    if (focusTtl > 0) await redisService.set(`focus_headphones:${user.id}`, { ...focusEventData, shiftsLeft: focusRemaining }, focusTtl);
                }
                eventNotes.push(`Focus Headphones: +${eventRepGain} rep (${focusRemaining} shifts left)`);
            }
            const eventRepResult = await _addEventRep(userData.discordId, job.sector, eventRepGain, "event_success");
```

(Old-shape redis values `{ shiftsLeft, xpMult }` lack `repMult` → the `focusRepData.repMult` guard makes them a harmless no-op that expires naturally. No data migration.)

- [ ] **Step 4: Catalog copy**

`src/utils/shopCatalog.ts` `focus_headphones` (:614-615, :622):

```ts
    description: "Premium noise-canceling headphones that boost concentration. Doubles sector reputation gain (+10 instead of +5) for your next 3 successful shifts. One use only.",
    shortDescription: "2x sector rep for next 3 shifts.",
```

and its effects message: `"Focus Headphones on! Sector rep doubled for your next 3 successful shifts."`

`blackmarket_resume` (:683-684):

```ts
    description: "A fabricated résumé that pads your career record. 65% chance to credit +3–8 lifetime shifts toward job requirements; 35% chance HR catches the forgery and you gain 10–25 stress instead.",
    shortDescription: "65%: +3–8 lifetime shifts. 35%: stress.",
```

- [ ] **Step 5: Verify + commit**

Run: `npm run typecheck` → exit 0. Run: `grep -n "xpMult" src/services/shopItemEffects.ts src/handlers/lifeInteractionHandler.ts` → only study items (study_laptop etc.) may match; zero matches for `focus_headphones` contexts.

```bash
git add src/services/shopItemEffects.ts src/utils/shopCatalog.ts src/handlers/lifeInteractionHandler.ts
git commit -m "feat(items): black market resume grants lifetime shifts; focus headphones double sector rep"
```

---

### Task 4: Strip `xp` from work events

**Files:**
- Modify: `src/services/jobService.ts:31` (WorkEvent outcome type)
- Modify: `src/data/workEvents.ts` (118 `xp:` occurrences)

**Interfaces:**
- Consumes: Task 2 (resolution code no longer reads `outcome.xp`).
- Produces: `WorkEvent.choices[].outcome` = `{ money?: number; stress: number }`.

- [ ] **Step 1: Remove the type field**

`src/services/jobService.ts:31`: delete the `xp?: number;` line from the `outcome` object type in `WorkEvent`.

- [ ] **Step 2: Strip the data**

Remove every `xp: <n>, ` from `src/data/workEvents.ts` outcome objects:

Run: `cd "c:\Users\ujjwa\OneDrive\Desktop\Casino-" && sed -i -E 's/xp: -?[0-9]+, //g' src/data/workEvents.ts` (Git Bash sed). Then `grep -c "xp:" src/data/workEvents.ts` → expected 0. If any stragglers remain (different spacing), fix them by hand.

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` → exit 0 (TS excess-property checks would flag any missed `xp:` in the data file). Run: `grep -rn "outcome.xp\|\.xp\b" src/handlers/lifeInteractionHandler.ts` → zero matches.

```bash
git add src/services/jobService.ts src/data/workEvents.ts
git commit -m "chore(jobs): remove dead xp field from work events"
```

---

### Task 5: Schema removal + profile relabel + grep gate

**Files:**
- Modify: `prisma/schema.prisma:70, 74-75`
- Modify: `dashboard/prisma/schema.prisma:58, 61-62` (stale copy, kept consistent)
- Modify: `src/commands/economy/profile.ts:435`

**Interfaces:**
- Consumes: Tasks 1–4 (zero `jobXp` references remain in code).
- Produces: `User` model without `jobXp`/`lastJobShift`/`lastJobPromotion`; regenerated Prisma client.

- [ ] **Step 1: Precondition grep**

Run: `grep -rn "jobXp\|lastJobShift\|lastJobPromotion" src dashboard/src` → MUST be zero matches. If not, a prior task missed a site — fix it there first.

- [ ] **Step 2: Remove fields from both schemas**

`prisma/schema.prisma`: delete line 70 (`jobXp       Int       @default(0)`) and lines 74-75 (`lastJobShift      DateTime?`, `lastJobPromotion  DateTime?`).
`dashboard/prisma/schema.prisma`: delete line 58 (`jobXp            Int       @default(0)`) and lines 61-62 (same two DateTime fields). Do NOT touch that file's `jobXpReqs` field (:353) — it belongs to a different model in the stale copy and is out of scope.

- [ ] **Step 3: Regenerate client + relabel profile**

Run: `npx prisma generate` → success.
`src/commands/economy/profile.ts:435`: change `` `**Shifts:** ${userDb.shiftsWorked}\n` `` to `` `**Lifetime Shifts:** ${userDb.shiftsWorked}\n` ``.

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run build` → both exit 0 (this proves no code still references the removed fields). Run: `cd dashboard && npx tsc --noEmit` → exit 0.

```bash
git add prisma/schema.prisma dashboard/prisma/schema.prisma src/commands/economy/profile.ts
git commit -m "feat(schema): drop jobXp and dead lastJobShift/lastJobPromotion from User"
```

---

### Task 6: Dashboard docs rewrite — jobs-and-careers.ts

**Files:**
- Modify: `dashboard/src/content/modules/jobs-and-careers.ts`

**Interfaces:** none — content strings. Read the whole file first; restructure claims per below, keep the file's existing table/prose format.

- [ ] **Step 1: Rewrite every XP claim**

Required content changes (exact new values):

1. The 21-job table's "Job XP" column → header **"Lifetime Shifts"**, values per job: IT Intern 0, Junior Developer 10, Senior Developer 30, Lead Engineer 60, Medical Resident 0, General Practitioner 10, Surgeon 30, Chief of Medicine 100, Sales Intern 0, Financial Analyst 10, Sales Manager 30, Paralegal 5, Associate Attorney 30, Partner 100, Waiter 0, Sous Chef 20, Apprentice Mechanic 0, Master Mechanic 30, Freelance Writer 0, Delivery Driver 0, Streamer 0.
2. "+10 job XP per success" claims (~:24, :65) → "every successful shift adds +1 to your lifetime shift count (a permanent career record that survives resignations and job changes)".
3. Loss line (~:65) "−5 XP, +10 stress" → "no pay, +10 stress — failed shifts never count toward your lifetime total".
4. Event claim (~:66) "XP up to +100" → remove the XP mention; events grant pay multipliers/stress per choice.
5. Promotion paragraph (~:81): "hit the next rung's lifetime-shift requirement — your shift count and stress carry over; the count never resets, even if you resign".
6. Demotion (~:82): keep "three consecutive failed shifts" — unchanged.
7. Black Market Resume (~:82): "65% for +3–8 lifetime shifts, 35% to backfire into 10–25 stress".
8. Focus Headphones (wherever listed): "doubles sector reputation gain (+10 instead of +5) for your next 3 successful shifts".
9. "XP walls (150 for tier 3, 300–500 for tier 4)" (~:96) → "shift walls (30 lifetime shifts for tier 3, 60–100 for the top rungs)".
10. Any other `XP` occurrence in this file relating to jobs → reworded to lifetime shifts. (`grep -n "XP" dashboard/src/content/modules/jobs-and-careers.ts` must come back clean of job-XP references when done.)

- [ ] **Step 2: Verify + commit**

Run: `cd dashboard && npx tsc --noEmit` → exit 0. Run: `grep -in "job xp\|jobxp" dashboard/src/content/modules/jobs-and-careers.ts` → zero matches.

```bash
git add dashboard/src/content/modules/jobs-and-careers.ts
git commit -m "docs(dashboard): jobs progression rewritten around lifetime shifts"
```

---

### Task 7: Final verification + ship

**Files:** none new.

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run build` → exit 0. Run: `cd dashboard && npx tsc --noEmit` → exit 0. Run: `grep -rn "jobXp\|reqXp\|missingXp\|lastJobShift\|lastJobPromotion" src dashboard/src prisma/schema.prisma` → zero matches.

- [ ] **Step 2: Ship**

```bash
git push origin main
git checkout fortuna-v2
git cherry-pick <first-task-commit>^..<last-task-commit>
git push origin fortuna-v2
git checkout main
```

Verify CI: `gh run list --branch main --limit 1` → success (webhook acks fast; VPS builds in background — deploy log shows "✅ Deploy complete!").

- [ ] **Step 3: Manual smoke test (Discord, user-driven)**

1. `!jobs` → requirement lines show "Shifts: N" per the table.
2. `!apply` to an entry job → work one successful shift → `!work` shows Lifetime Shifts +1.
3. Resign → re-apply → lifetime count unchanged.
4. Promotion button appears exactly at the threshold; Black Market Resume credits +3–8 shifts; Focus Headphones note shows doubled rep.
