# Education Shop Redesign + Study-Loop Anti-Exploit — Design

**Date:** 2026-07-14

## Problem

Two connected issues in the Uni (education) module:

1. **The Uni Store items are bland.** 6 of the 9 items are near-identical study-XP
   multipliers/bonuses (Study Laptop, Textbook Bundle, Lab Kit, Calculator Pro,
   Focus Notes, Tutor Pass). Only Cheat Sheet carries a real downside; only
   Scholarship Letter has a use cooldown. Every item effectively "grants XP and
   does nothing else."

2. **The study cooldown is trivially bypassed.** Base study CD is
   `DEFAULT_STUDY_COOLDOWN_SECONDS = 300` (5 min), and **Coffee Thermos** (80k)
   clears it with **no per-use cooldown**. So `study → thermos → study → thermos …`
   grinds a whole degree in minutes. Education XP is real economic power (degrees
   grant permanent Intelligence + income multipliers), so this is not cosmetic.
   The earlier buff-cooldown work
   ([2026-07-13-buff-item-use-cooldowns-design.md](2026-07-13-buff-item-use-cooldowns-design.md))
   explicitly **excluded** Coffee Thermos on the reasoning "trivial 5-min CD, XP
   not money" — that reasoning is now considered wrong.

**Secondary gap found during design:** `lastStudy` is only written on a
*successful* study ([educationService.ts:332](../../../src/services/educationService.ts#L332));
`study.ts` returns before calling `study()` on a minigame failure. So a **failed
minigame applies no cooldown** and can be retried instantly. This is a second
bypass and is closed here.

## Goals

- Raise the study cooldown to a solid **30 minutes**, reducible/clearable by buffs
  but **not spammable**.
- Redesign all **9** Uni Store items into **distinct identities** (keeping the
  same keys/names — no DB seed or inventory churn), with **real downsides on
  several of them** (mostly education-internal: XP loss, stress, burnout, blocked
  sessions; a few modest money fines).

## Non-goals

- No change to degree XP requirements or base per-session XP. The 30-min CD
  already slows progression ~6×, which is the intended pacing effect. Revisit
  only if the grind proves too slow in play.
- No renaming/replacing of item identities (keys and display names are stable).
- No changes to the General/Job/Hunt/Cock stores.

## Decisions (confirmed with the user)

- **CD mechanic:** rate-limited clear + daily cap (not reduced-CD buffs, not a
  daily-cap-only ceiling).
- **Lineup:** keep all 9 items, redesign each effect.
- **Losses:** a mix, mostly education-internal, with a few modest money fines.

---

## Part A — Study-loop backbone (anti-exploit)

### A1. Base cooldown 5 min → 30 min

`DEFAULT_STUDY_COOLDOWN_SECONDS`: `300` → `1800` in
[economyConfig.ts](../../../src/utils/economyConfig.ts). Consumed by the study
gate ([study.ts:56](../../../src/commands/life/study.ts#L56)) and by Coffee
Thermos ([shopItemEffects.ts:1028](../../../src/services/shopItemEffects.ts#L1028)).

### A2. Cooldown applies on attempt (win OR lose)

Today `lastStudy` is set inside `study()`, which only runs on a minigame win, so
failures escape the CD. Fix: in `study.ts`, once the CD + daily-cap gate passes,
**record the attempt immediately** — set `lastStudy = now` and increment the daily
counter — *before* running the minigame. The existing `lastStudy` write inside
`study()` stays (idempotent on the success path).

Effect: one real study attempt per 30 minutes, whether you pass or fail. Rescue
items (Calculator Pro, Lab Kit, Study Laptop, Tutor Pass) exist precisely to
protect that 30-minute investment.

> **Tunable:** if a full 30-min penalty on failure feels too harsh in play, a
> failed attempt can instead set a shorter CD (e.g. 10 min). Default here is the
> full 30 min on any attempt.

### A3. Daily study cap (backstop)

New config `STUDY_DAILY_CAP = 16`. A Redis counter `study_count:<discordId>`
increments per attempt (see A2) and resets at local midnight — the same pattern
as `cock_feed_count` ([shopItemEffects.ts:1161-1165](../../../src/services/shopItemEffects.ts#L1161)).
When the counter reaches the cap, `study.ts` blocks with a "come back tomorrow"
message before the minigame runs. Testers bypass.

Rationale: at a 30-min CD the natural ceiling is ~48/day, but Coffee Thermos
clears compress that. 16 attempts ≈ a full day of dedicated legit studying (a High
School Diploma is ~12 base studies), so normal players rarely hit it; it exists to
hard-cap clear-spam abuse. The cap counts **attempts**, not successes.

> **Tunable:** cap value, and attempts-vs-successes counting.

### A4. Coffee Thermos — rate-limited + burnout cost

- Wrap `handleCoffeeThermos` in `withBuffCooldown("coffee_thermos", …)` with a
  **4h** per-use cooldown (add `coffee_thermos: 4 * 3600` to
  `BUFF_ITEM_COOLDOWN_SECONDS`).
- On a successful clear, **+8 education stress** (`userEducation.stress`, clamped
  to 100). Chain-clearing accelerates burnout.
- Unchanged: if there is no active study CD, the use is a no-op refund
  (`shouldConsume:false`) → `withBuffCooldown` releases the claim, so a wasted
  Thermos never eats its 4h cooldown.

---

## Part B — The 9 redesigned items

Same keys/names. Each owns a dimension instead of all being XP multipliers.
**4 safe (no downside), 5 risk (real downside).** All numbers tunable.

### Safe items

| Item (key) | Price | Effect |
|---|---|---|
| **Study Laptop** (`study_laptop`) | 180k | *Endurance rig.* Next **5** sessions: **1.15× XP, −6 stress, +10% fail-rescue** each. Steady all-rounder; study longer without burning out. |
| **Calculator Pro** (`calculator_pro`) | 150k | *Precision.* Next **3** sessions: **+30% fail-rescue** + **1.1× XP**. Pure "stop fumbling the minigame." |
| **Focus Notes** (`focus_notes`) | 160k | *Airtight notes.* Next successful session: **+45 flat XP** and **neutralizes a negative study event** if one rolls. One-shot. |
| **Tutor Pass** (`tutor_pass`) | 400k | *Private tutor.* Next 1 session: **1.6× XP, cannot fail the minigame, guaranteed positive study event, −10 stress.** Premium guaranteed great session. Does **not** clear the CD. |

### Risk items

| Item (key) | Price | Upside | Downside |
|---|---|---|---|
| **Textbook Bundle** (`textbook_bundle`) | 120k | Next **3** sessions: **1.4× XP**. | **15% per session: "wrong chapter" → 0 XP** that session (stress still applies). |
| **Lab Kit** (`lab_kit`) | 300k | Next **3** sessions: **1.15× XP, +10% rescue**, study events **70% biased positive** and **+50% magnitude** when positive. | If a **negative** event fires, its penalty is **+50%** too. High variance. |
| **Coffee Thermos** (`coffee_thermos`) | 80k | **Clears the 30-min study CD** instantly. | **+8 stress** + **4h per-use CD** (see A4). No-op refunded if no active CD. |
| **Cheat Sheet** (`cheat_sheet`) | 250k | On next exam: **70% → +25% of required XP**. | **30% caught → −15% current XP, +15 stress, −10% wallet.** (Existing behavior, kept.) |
| **Scholarship Letter** (`scholarship_letter`) | 750k | **45% coins (50k–200k)**, **35% education XP (+25–150)**. | **20% rejected → nothing + 5 stress.** 1h use CD. (Existing roll, kept, with the +5 stress sting added.) |

**Dimension coverage:** XP (Laptop / Textbook / Focus / Tutor), fail-rescue
(Calculator / Laptop / Tutor), events (Lab / Focus / Tutor), stress (Laptop − /
Coffee + / Tutor −), CD-clear (Coffee), exam (Cheat), money (Scholarship / Cheat).
No two items feel the same.

---

## Part C — Implementation touchpoints

### C1. `study()` signature refactor (educationService.ts)

Change `study(userId, guildId, bonusXp = 0)` →
`study(userId, guildId, modifiers = {})` where `modifiers` is:

```ts
interface StudyModifiers {
  bonusXp?: number;               // existing behavior (buff XP + focus/craft bonuses)
  stressDelta?: number;           // Study Laptop (-6) / Tutor Pass (-10) → applied to userEducation.stress
  wrongChapterHit?: boolean;      // Textbook Bundle rolled a wrong-chapter miss → session XP = 0
  eventImmunity?: boolean;        // Focus Notes → neutralize a negative event this session
  eventBiasPositive?: boolean;    // Lab Kit → 70% chance the rolled event is positive
  eventAmplify?: boolean;         // Lab Kit → +50% magnitude on the rolled event (both directions)
  guaranteedPositiveEvent?: boolean; // Tutor Pass → force a positive event this session
}
```

The event block ([educationService.ts:296-319](../../../src/services/educationService.ts#L296))
honors these flags:

- `guaranteedPositiveEvent`: force the 25% roll on and pick from positive events.
- `eventBiasPositive`: if an event rolls, 70% chance to (re)pick a positive one.
- `eventAmplify`: multiply the applied `xpMod`/`stressMod`/`moneyMod` by 1.5.
- `eventImmunity`: if the resolved event is negative, null it out (no XP/stress hit).
- `wrongChapterHit`: set the base `xpGain` to 0 for this session (stress still
  applies), before events.

"Positive event" = `xpMod > 0` on a `success`/guaranteed-success outcome (helper
that filters `STUDY_EVENTS`).

Callers: `study.ts` (below). No other callers exist (verified).

### C2. `study.ts` gate + per-session rolls

1. Replace the 5-min gate with the 30-min gate (A1) and add the daily-cap gate
   (A3), both before the minigame. On pass, record the attempt (A2).
2. Read the redesigned redis buff payloads. New/changed shapes:
   - `study_laptop`: `{ sessionsLeft, xpMult: 1.15, stressDelta: -6, failRescue: 0.10 }`
   - `textbook_bundle`: `{ sessionsLeft, xpMult: 1.4, wrongChapterChance: 0.15 }`
   - `lab_kit`: `{ sessionsLeft, xpMult: 1.15, failRescue: 0.10, eventBiasPositive: true, eventAmplify: true }`
   - `calculator_pro`: `{ sessionsLeft, xpMult: 1.1, failRescue: 0.30 }`
   - `focus_notes`: `{ active: true, bonusXp: 45, eventImmunity: true }`
   - `tutor_pass`: `{ active: true, xpMult: 1.6, guaranteedPass: true, guaranteedPositiveEvent: true, stressDelta: -10 }`
3. Compute `xpMultiplier` (cap 2.0, unchanged), `failReduction` (cap **0.90**),
   and `guaranteedPass` (Tutor). Roll Textbook's wrong-chapter once → set
   `wrongChapterHit`.
4. Fail handling: if `guaranteedPass` or rescue succeeds, treat as win. On a real
   fail, the attempt is already recorded (A2), so the CD stands.
5. On success, build the `modifiers` object and call `study()`. Apply
   `stressDelta` from Laptop/Tutor to `userEducation.stress` (clamped) — either
   inside `study()` via a `modifiers.stressDelta` field or right after; keep it in
   the service for a single source of truth. Decrement session buffs as today.

> Consolidation: fold `stressDelta` into `StudyModifiers` so all stress math lives
> in `study()`.

### C3. `shopItemEffects.ts` handler rewrites

Rewrite the redis payloads in `handleStudyLaptop`, `handleTextbookBundle`,
`handleLabKit`, `handleCalculatorPro`, `handleFocusNotes`, `handleTutorPass` to
match C2. Rewrite `handleCoffeeThermos` per A4 (stress + `withBuffCooldown`).
`handleCheatSheet` (exam) and `handleScholarshipLetter` stay functionally the same
(Scholarship gains +5 stress on reject). Update user-facing messages to describe
the new effects + Coffee Thermos's 4h cooldown.

### C4. Copy updates

- `shopCatalog.ts`: `description` + `shortDescription` for all 9 Uni items,
  including Coffee Thermos's "once every 4h" note.
- Dashboard: `dashboard/src/content/modules/items-and-shop.ts` and
  `education.ts` — item table + any study-cooldown references (5 min → 30 min).

---

## Invariants preserved

- **Testers bypass** the study CD, the daily cap, and item use-cooldowns.
- **No-op uses are refunded** (`shouldConsume:false`) — Coffee Thermos with no
  active CD releases its 4h claim; other pointless uses do not consume.
- **Redis-down fails open** for cooldown/cap checks (consistent with existing
  gamble/buff-item behavior); the Postgres `lastStudy` gate still bounds abuse.
- **xpMultiplier capped at 2.0**; new **failReduction capped at 0.90** (Tutor's
  guaranteed pass is a separate boolean, not part of the sum).

## Rollout / migration

None required. Item keys/names are unchanged, so existing inventories and the DB
seed are untouched. Buff payload shape changes are forward-only: any buff Redis
keys set before deploy simply expire (short TTLs) or read as absent fields
(treated as defaults). No data migration.

## Test plan (behavioral)

- Study CD is 30 min; a **failed** minigame still blocks re-study for 30 min.
- Daily cap blocks the 17th attempt; resets after midnight; testers bypass.
- Coffee Thermos clears the CD, adds +8 stress, and cannot be reused for 4h; using
  it with no active CD neither consumes it nor starts the 4h cooldown.
- Textbook Bundle occasionally yields 0 XP (wrong chapter) but still adds stress.
- Lab Kit skews events positive and amplifies them; amplified negatives hurt more.
- Focus Notes cancels a negative event; Tutor Pass cannot fail and forces a
  positive event.
- Stacked rescue never exceeds 90%; xpMultiplier never exceeds 2.0.
