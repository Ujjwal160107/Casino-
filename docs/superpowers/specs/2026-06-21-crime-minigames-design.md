# Crime Minigames — Design Spec

**Date:** 2026-06-21  
**Status:** Approved for planning  
**Depends on:** [2026-06-21-crime-module-overhaul-design.md](./2026-06-21-crime-module-overhaul-design.md)  
**Command:** `,crime` (prefix-aware)

---

## 1. Summary

Replace the **RNG success roll** on crime commit with a **crime-specific minigame chain**. After the player confirms prep on a chosen job, they must pass **every stage** (all-or-nothing). Pass all → crime succeeds. Fail any stage or time out → crime fails. Required prep items remain a **gate only** (no mid-run assists). **1 hour cooldown** starts when the player clicks **Commit Crime**, before stage 1.

All minigames use **crime-themed button scenarios** written for the **exact crime** being run (not generic tag pools).

---

## 2. Goals

| Goal | Detail |
|------|--------|
| Skill-based outcomes | Minigame performance decides pass/fail — no success RNG |
| Immersion | Each of ~58 crimes has unique stage copy tied to that job |
| Reuse patterns | Same button-task engine as work/study; CV2 message edits like current crime UI |
| Preserve economy | Tier payout/fine/heat/jail rules from crime overhaul spec unchanged |
| Preserve prep | Fixed `requiredItems` mandatory gate unchanged |

## Non-goals (v1)

- Typing/memory minigames on crime (button-only for CV2 compatibility)
- Prep item assists during stages (+time, forgiveness, etc.)
- Consumable burn of required gear per attempt
- PvP or multiplayer crime stages
- Cooldown only on success

---

## 3. Decisions (resolved)

| Question | Decision |
|----------|----------|
| Pass/fail model | **All-or-nothing** — fail any stage = crime fail; pass all = success; no final RNG |
| Minigame content | **Crime-specific themed button scenarios** for the exact crime |
| Stages per tier | **Scaled:** Petty 1 · Medium 2 · High 2 · Elite 3 · Legendary 3 |
| Prep items | **Gate only** — no minigame assists |
| Cooldown | **Starts on Commit Crime** (before stage 1), success or fail |

---

## 4. Player Flow

```
,crime
  → [Board session — unchanged: 5 random crimes, 10 min TTL]
  → Select playable crime → Prep confirmation (required gear checklist)
  → [Commit Crime]
       1. Set 1hr shared cooldown (crime command)
       2. Clear board session (optional: keep last board hash for UX)
       3. Create crime_run in Redis
       4. Show Stage 1/N (CV2 container + timed button row)
  → For each stage:
       • Player picks one button within time limit
       • Wrong choice or timeout → resolveCrimeFailure → result CV2
       • Correct → advance to next stage or resolveCrimeSuccess if last
  → Result CV2 (success or fail — no legacy embeds)
```

**Abandon:** If the player ignores the timer, the stage fails and the crime resolves as a failure. Cooldown is already active.

---

## 5. Stages by Tier

| Tier | Stage count | Default timer | Difficulty |
|------|-------------|---------------|------------|
| Petty | 1 | 15s | 3 options, obvious best choice |
| Medium | 2 | 15s each | 3–4 options |
| High | 2 | 18s each | 4 options, closer distractors |
| Elite | 3 | 18s each | 4 options, tighter wording |
| Legendary | 3 | 20s each | 4 options, heist-pressure flavor |

Each stage:

```ts
export interface CrimeMinigameStage {
  id: string;              // e.g. "bank_vault_heist_s1"
  crimeKey: string;
  stageIndex: number;      // 0-based
  title: string;           // short header
  prompt: string;          // scenario text (crime-specific)
  options: { label: string; correct: boolean }[];  // exactly one correct
  timeSeconds: number;
}
```

**Validation:** Exactly one option has `correct: true`. Option count 3–4. `stageIndex` contiguous from 0..N-1 per crime.

---

## 6. Minigame Catalog

**File:** `src/data/crimeMinigameCatalog.ts`

**Structure:** Map or array keyed by `crimeKey` → ordered `CrimeMinigameStage[]`.

**Authoring scope:** All **58 crimes** from `crimeCatalog.ts` must have full stage sets at launch. Stages must reference the crime by name or unique scenario (e.g. Bank Vault Heist stage 1: choose bypass method; Pickpocket Alley: choose target pocket).

**Example (Bank Vault Heist — stage 1 of 3):**

- **Prompt:** "The vault camera sweeps every 8 seconds. How do you enter the service corridor?"
- **Options:** `[Use maintenance keycard ✓] [Kick the door] [Ask the guard]`

**Example (Pickpocket Alley — stage 1 of 1):**

- **Prompt:** "A merchant is distracted haggling. Where do you strike?"
- **Options:** `[Outer coat pocket ✓] [Hand him a flyer] [Bump him hard]`

**Anti-repeat (optional v1.1):** If a crime has multiple stage variants later, pick random variant; v1 uses fixed ordered stages only.

---

## 7. UI / UX

**Pattern:** Components V2 only (`ContainerBuilder`, `TextDisplayBuilder`, `ButtonBuilder`). Use **Mascot custom emotes** — no default Unicode emoji.

### 7.1 Stage screen

```
## {Mascot.Gun} Bank Vault Heist — Stage 2/3
The alarm panel is blinking amber...

[ Option A ] [ Option B ] [ Option C ] [ Option D ]

-# 18 seconds remaining · Wrong choice fails the job
```

- Progress line: `Stage {current}/{total}`
- Timer: Discord relative or countdown in footer; server validates `startedAt + timeSeconds`
- Buttons disabled after selection or timeout

### 7.2 Board / prep updates

Replace success **%** preview with **stage count**:

- `Medium · Office Expense Fraud · 2 stages · 100k–220k`
- Prep screen: `This job has **2 stages**. Pass all to succeed.`

### 7.3 Result screen

Keep existing `buildCrimeResultPayload()` CV2 pattern. On minigame fail, include:

- Failed stage number
- Correct option label (spoiler-friendly: "Correct move: **…**")

---

## 8. Interaction Routing

**Handler:** extend `crimeInteractionHandler.ts`

| Custom ID | Action |
|-----------|--------|
| `crime:confirm:{ownerId}:{sessionId}:{crimeKey}` | Start run + cooldown + stage 1 |
| `crime:mg:{ownerId}:{runId}:{stageIndex}:{optionIndex}` | Submit stage answer |
| `crime:back:…` | Unchanged (only before commit) |
| `crime:select:…` | Unchanged |

**Author validation:** `ownerId` must match interaction user.

**Run validation:**

- `crime_run:{userId}` exists and `runId` matches
- `stageIndex` matches run's current stage
- Cooldown already set for crime command
- Crime still in original board session crimeKeys (or store crimeKey on run)

---

## 9. Technical Architecture

```
src/data/crimeMinigameCatalog.ts   ~58 crimes × 1–3 stages
src/services/crimeRunService.ts      run lifecycle, stage advance, timeout
src/services/crimeService.ts         resolveCrimeSuccess / resolveCrimeFailure (no RNG pass)
src/commands/economy/crimeUi.ts      buildCrimeStagePayload, update board/prep copy
src/handlers/crimeInteractionHandler.ts
```

### 9.1 `crimeRunService.ts`

| Function | Purpose |
|----------|---------|
| `startCrimeRun(userId, crimeKey, guildId)` | Set cooldown, create Redis run, return stage 0 |
| `getCrimeRun(userId)` | Active run or null |
| `submitStageAnswer(userId, runId, stageIndex, optionIndex)` | Validate + advance or fail |
| `clearCrimeRun(userId)` | After resolve |

**Redis:** `crime_run:{userId}` TTL **900s** (15 min)

```ts
interface CrimeRun {
  runId: string;
  ownerId: string;
  crimeKey: string;
  guildId: string;
  stageIndex: number;
  stageStartedAt: number;  // ms epoch
  boardSessionId?: string;
}
```

### 9.2 `crimeService.ts` changes

- **Remove** `Math.random() < successChance` from commit path
- **Split** `executeCrime` into:
  - `resolveCrimeSuccess(userId, username, crimeKey, guildId)` — payout, heat, logging
  - `resolveCrimeFailure(userId, username, crimeKey, guildId)` — fine, jail roll, fine-guard, logging
- **Keep** `computeCrimeOdds` only for display deprecation OR replace with `getStageCountForCrime(crime)` on board
- **Passive buffs:** Crown of Greed / Devil Contract still modify payout/fine amounts on resolve; **luck does not** affect minigame outcomes

### 9.3 Cooldown order on commit

1. Validate ownership + required items + jail status
2. `setCooldown(userId, "crime", 3600)`
3. `startCrimeRun`
4. Render stage 1

If run creation fails after cooldown set, log error; cooldown stands (same as committing today).

---

## 10. Economy (unchanged from overhaul spec)

Success and failure payouts/fines/jail/heat use existing tier tables and `requiredItems` bonus stacking on **payout math only** (success path). Minigame pass/fail is binary.

| Tier | Jail on fail (after minigame fail) |
|------|-------------------------------------|
| Petty / Medium | Fine only |
| High | 10% · 20 min |
| Elite | 20% · 45 min |
| Legendary | 35% · 60 min |

Fox Tail Talisman `failFineGuard` still applies on failure when in `requiredItems`.

---

## 11. Error Handling

| Case | Behavior |
|------|----------|
| Run expired mid-chain | Treat as stage timeout → failure resolve |
| Double-click stage button | Idempotent: ignore second click if stage already advanced |
| Edit race / stale button | Reject if `stageIndex` ≠ run.current |
| CV2 result | Never use `embeds` on CV2 messages |
| Missing catalog stages for crime | Block commit in prep validation; dev error if catalog incomplete |

---

## 12. Testing Plan

- [ ] Petty crime: 1 stage pass → success payout
- [ ] Petty crime: wrong button → fail fine, cooldown active
- [ ] Medium: pass stage 1, fail stage 2 → failure
- [ ] Legendary: pass all 3 → success + heat
- [ ] Timeout on stage → failure
- [ ] Cooldown set on commit before stage 1 completes
- [ ] Required items validated at commit; not consumed
- [ ] Board shows stage count not success %
- [ ] All 58 crimes have correct stage count for tier
- [ ] CV2 stage + result messages (no 50035 embed error)
- [ ] `npx tsc --noEmit` clean

---

## 13. Migration / Rollout

1. Add `crimeMinigameCatalog.ts` with all stage content (largest work item)
2. Implement `crimeRunService` + handler routes
3. Refactor `crimeService` success/fail resolve (remove RNG)
4. Update `crimeUi` board/prep copy
5. Remove obsolete success % from previews
6. Manual QA: one crime per tier + one Legendary full chain

**No DB migration.** Redis keys only.

---

## 14. Approval

Design approved by user through brainstorming (2026-06-21).

**Next step:** Invoke `writing-plans` skill to produce implementation plan (catalog authoring + handler refactor in phases).
