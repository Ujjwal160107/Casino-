# Global Shift Progression (jobXp Removal) — Design

**Date:** 2026-07-12
**Status:** Approved
**Scope:** `prisma/schema.prisma`, `src/services/jobService.ts`, `src/handlers/lifeInteractionHandler.ts`, `src/commands/life/apply.ts`, `src/commands/life/work.ts`, `src/commands/life/jobs.ts`, `src/services/shopItemEffects.ts`, `src/utils/shopCatalog.ts`, `src/data/workEvents.ts`, `dashboard/src/content/modules/jobs-and-careers.ts`. No Redis or MongoDB data migration.

## Problem

Job progression runs on `User.jobXp` (+10 per successful shift, −5 per fail, ±event
XP, ±Black Market Resume), which doesn't fit the V2 architecture and duplicates
what `shiftsWorked` already measures. Meanwhile `shiftsWorked` is reset to 0 on
hire and resign, so it can't serve as a progression metric, and `checkPromotion`'s
`reqShifts` parameter is plumbed but hardcoded to 0.

## Design

### Progression currency: lifetime shifts

- `User.shiftsWorked` becomes a lifetime counter: **remove the resets** on hire
  (`apply.ts:182`) and resign (`lifeInteractionHandler.ts:298`). Kept on promotion
  (already the case).
- Only **successful** shifts increment it — current behavior in both the minigame
  win path (`lifeInteractionHandler.ts:1014`) and the event path (`:488`) is kept.
  Failed and burnout shifts never increment.
- The counter never decreases.
- Side effect (accepted): the "Top Employees" leaderboard (`leaderboard.ts`) stops
  losing people's standing when they switch jobs.

### Job requirements: `reqXp` → `reqShifts`

`JobDefinition.reqXp` is renamed to `reqShifts` with these values (moderate curve,
~1 shift/hour cadence):

| reqShifts | Jobs |
|---|---|
| 0 | tech_intern, med_resident, biz_intern, srv_waiter, trd_apprentice, freelance_writer, freelance_uber, freelance_streamer |
| 5 | law_paralegal |
| 10 | tech_junior, med_general, biz_analyst |
| 20 | srv_chef |
| 30 | tech_senior, med_surgeon, biz_manager, law_associate, trd_mechanic |
| 60 | tech_lead |
| 100 | law_partner, med_chief |

- Degree and `reqJobId` requirements unchanged.
- The gate applies identically to direct application (`getJobApplicationStatus`,
  `jobService.ts:142-176`) and promotion (`checkPromotion`, `jobService.ts:207-225`
  — populate the existing `reqShifts` plumbing, delete the `reqXp`/`missingXp`
  path).
- Player-facing requirement text: `Shifts: N` in the jobs list
  (`jobs.ts` `formatRequirement`) and `Need N lifetime shifts (you have M)` in
  missing-requirement status.

### jobXp removal — all touchpoints

**Schema (`prisma/schema.prisma`):** remove `jobXp` from `User`. Also remove the
confirmed-dead fields `lastJobShift` and `lastJobPromotion` (zero references in
src/). Existing Mongo documents keep stray fields harmlessly; no migration script.
If `dashboard/prisma/schema.prisma` is a separate copy, apply the same removals.

**Shift flow (`lifeInteractionHandler.ts`):**
- Delete XP writes: minigame win `+xpGain` (`:1015`), minigame fail `−5` (`:1182`),
  event resolution `±xpGain` (`:486`), pager save `+2` (`:427-433`).
- Promotion-eligibility projections that used `jobXp + xpGain` (`:513, :547,
  :1032`) become projections on `shiftsWorked + 1` (event/win paths).
- Work events keep money/stress/rep effects; the `xp` field is removed from
  `data/workEvents.ts` entries and its resolution code.

**Hire (`apply.ts:182`):** on hire set only `jobId` and `lastShift: null` — do not
touch `shiftsWorked`, drop the `jobXp: 0` write. **Resign
(`lifeInteractionHandler.ts:298`):** keeps everything it does today EXCEPT the
`shiftsWorked: 0` and `jobXp: 0` writes, which are removed.

**Displays:**
- `work.ts:152` XP line removed; show lifetime shifts.
- `work.ts:69-70,117` promotion progress bar: driven by `shiftsWorked` vs next
  job's `reqShifts`.
- `profile.ts` career page already shows `shiftsWorked` — relabel to
  "Lifetime Shifts" if it says otherwise.

**Black Market Resume (`shopItemEffects.ts:925-946`, catalog entry):**
- 65% success → `shiftsWorked += randomInt(3, 8)` ("+3–8 lifetime shifts").
- 35% backfire → `jobStress` increase only (unchanged stress amount); the shift
  counter is never reduced.
- Catalog description rewritten with exact numbers and odds.

**Focus Headphones (`shopItemEffects.ts` handler + redis key, catalog entry):**
- Old effect (multiplies XP gain) dies with XP. New effect: **doubles sector-rep
  gain (+10 instead of +5) for the next 3 successful shifts** (redis-tracked uses,
  same consumption pattern as today's `focus_headphones` key).
- Catalog description rewritten with exact numbers.

**Dashboard docs (`dashboard/src/content/modules/jobs-and-careers.ts`):**
- 21-job table: "Job XP" column → "Lifetime Shifts" with the values above.
- Rewrite all XP mechanics copy: "+10 job XP per success", "−5 XP on loss",
  event "XP up to +100", "XP walls (150/300–500)", promotion carry-over text,
  Black Market Resume odds/effect, Focus Headphones effect.
- Promotion description: "hit the next rung's lifetime-shift requirement".

### Explicitly unchanged

- Sector reputation system (`JobReputation`, tiers, pay/stress/wear bonuses) —
  untouched; it remains the "quality" progression axis alongside the new
  "quantity" axis.
- Interview flow, gear requirements/durability, stress/burnout, jobStreak pay
  bonus, jobFailStreak demotion, cooldowns (`lastShift`), income tax, WorkLog.
- Credit-card `careerTier` mapping.
- Demotion behavior note (accepted): since lifetime shifts never decrease, a
  demoted player re-qualifies for promotion after their next successful shift —
  mirrors today's XP behavior (XP was also kept through demotion).

## Error handling

- Users hired before this change keep whatever `shiftsWorked` they have (fresh
  economy, values are small); stray `jobXp` values in old documents are ignored.
- `checkPromotion`/`getJobApplicationStatus` treat missing `shiftsWorked` as 0.

## Testing

- `npm run typecheck` + `npm run build`; dashboard `npx tsc --noEmit`.
- Grep gate: zero references to `jobXp`, `lastJobShift`, `lastJobPromotion`
  anywhere in `src/` or `dashboard/src/` after the change.
- Manual smoke (Discord): `!jobs` shows shift requirements; `!apply` to an entry
  job → work a shift → counter increments; resign → re-apply → counter kept;
  promotion button appears exactly at the threshold; Black Market Resume grants
  shifts; Focus Headphones doubles rep gain.

## Rollout

- Commit to `main` → CI (typecheck/build → prisma db push → webhook) → VPS.
  Cherry-pick to `fortuna-v2`.
- `prisma db push` updates the schema (field removals are non-destructive in
  MongoDB — existing documents simply retain ignored fields).
