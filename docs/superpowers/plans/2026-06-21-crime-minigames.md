# Crime Minigames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace crime commit RNG with crime-specific multi-stage button minigames; pass all stages = success, fail any = failure; 1hr cooldown starts on Commit Crime.

**Architecture:** Add `crimeMinigameCatalog.ts` (58 crimes × 1–3 stages) and `crimeRunService.ts` (Redis run state). Refactor `crimeService.ts` into deterministic success/failure resolvers. Extend `crimeUi.ts` + `crimeInteractionHandler.ts` for CV2 stage screens and `crime:mg:` button routing. No DB migration.

**Tech Stack:** TypeScript, discord.js v14 (Components V2), Redis via `redisService`, Prisma inventory checks, existing crime overhaul modules.

**Spec:** `docs/superpowers/specs/2026-06-21-crime-minigames-design.md`

## Global Constraints

- **Pass/fail:** All-or-nothing — pass every stage = success; fail any stage or timeout = failure; **no final RNG**
- **Stages per tier:** Petty **1** · Medium **2** · High **2** · Elite **3** · Legendary **3**
- **Timers:** Petty/Medium **15s** · High/Elite **18s** · Legendary **20s**
- **Prep items:** Gate only at commit — **no mid-run assists**
- **Cooldown:** **3600s** on **Commit Crime** (before stage 1), success or fail
- **UI:** Components V2 only (`ContainerBuilder`, `TextDisplayBuilder`, `ButtonBuilder`); **Mascot custom emotes** — no default Unicode emoji; **never use legacy embeds** on CV2 message edits
- **Luck:** Does **not** affect minigame outcomes; Crown/Devil still modify payout/fine on resolve
- **Redis run TTL:** **900s** (15 min), key `crime_run:{userId}`
- **Catalog scope:** All **58** crimes in `crimeCatalog.ts` must have complete stage sets at launch

---

## File map

| Task | Create | Modify |
|------|--------|--------|
| 1 | `src/data/crimeMinigameCatalog.ts` (scaffold), `src/scripts/validateCrimeMinigameCatalog.ts` | — |
| 2 | `src/services/crimeRunService.ts` | — |
| 3 | — | `src/services/crimeService.ts` |
| 4 | — | `src/commands/economy/crimeUi.ts` |
| 5 | — | `src/handlers/crimeInteractionHandler.ts` |
| 6 | `crimeMinigameCatalog.ts` (General + Job crimes) | — |
| 7 | `crimeMinigameCatalog.ts` (Uni + Hunt crimes) | — |
| 8 | `crimeMinigameCatalog.ts` (Cock + Legendary crimes) | — |
| 9 | — | `docs/superpowers/specs/2026-06-21-crime-module-overhaul-design.md` (cross-link only) |
| 10 | — | Final QA + typecheck |

**Unchanged unless regression:** `crime.ts`, `crimePrepWhitelist.ts`, `crimeCatalog.ts`, `interactionHelpers.ts` (already routes `crime:` prefix).

---

### Task 1: Minigame types, tier helpers, and catalog validation

**Files:**
- Create: `src/data/crimeMinigameCatalog.ts`
- Create: `src/scripts/validateCrimeMinigameCatalog.ts`

**Interfaces:**
- Consumes: `CrimeTier`, `CRIME_CATALOG`, `getCrimeByKey` from `src/data/crimeCatalog.ts`
- Produces:
  - `CrimeMinigameStage` interface
  - `STAGE_COUNT_BY_TIER: Record<CrimeTier, number>`
  - `DEFAULT_TIMER_BY_TIER: Record<CrimeTier, number>`
  - `getStageCountForTier(tier: CrimeTier): number`
  - `getStagesForCrime(crimeKey: string): CrimeMinigameStage[] | undefined`
  - `hasMinigameCatalog(crimeKey: string): boolean`
  - `validateCrimeMinigameCatalog(): string[]` — returns error strings (empty = pass)
  - `CRIME_MINIGAME_CATALOG: Record<string, CrimeMinigameStage[]>` — starts empty `{}`

- [ ] **Step 1: Create catalog scaffold**

```ts
// src/data/crimeMinigameCatalog.ts
import { CRIME_CATALOG, CrimeTier } from "./crimeCatalog";

export interface CrimeMinigameStage {
  id: string;
  crimeKey: string;
  stageIndex: number;
  title: string;
  prompt: string;
  options: { label: string; correct: boolean }[];
  timeSeconds: number;
}

export const STAGE_COUNT_BY_TIER: Record<CrimeTier, number> = {
  petty: 1,
  medium: 2,
  high: 2,
  elite: 3,
  legendary: 3,
};

export const DEFAULT_TIMER_BY_TIER: Record<CrimeTier, number> = {
  petty: 15,
  medium: 15,
  high: 18,
  elite: 18,
  legendary: 20,
};

export function getStageCountForTier(tier: CrimeTier): number {
  return STAGE_COUNT_BY_TIER[tier];
}

export const CRIME_MINIGAME_CATALOG: Record<string, CrimeMinigameStage[]> = {};

export function getStagesForCrime(crimeKey: string): CrimeMinigameStage[] | undefined {
  return CRIME_MINIGAME_CATALOG[crimeKey];
}

export function hasMinigameCatalog(crimeKey: string): boolean {
  const stages = CRIME_MINIGAME_CATALOG[crimeKey];
  return !!stages && stages.length > 0;
}

function validateStage(stage: CrimeMinigameStage, expectedCount: number): string[] {
  const errors: string[] = [];
  const correctCount = stage.options.filter((o) => o.correct).length;
  if (correctCount !== 1) {
    errors.push(`${stage.id}: must have exactly one correct option (found ${correctCount})`);
  }
  if (stage.options.length < 3 || stage.options.length > 4) {
    errors.push(`${stage.id}: must have 3–4 options (found ${stage.options.length})`);
  }
  if (stage.stageIndex < 0 || stage.stageIndex >= expectedCount) {
    errors.push(`${stage.id}: stageIndex ${stage.stageIndex} out of range 0..${expectedCount - 1}`);
  }
  if (stage.crimeKey !== stage.id.split("_s")[0] && !stage.id.startsWith(stage.crimeKey)) {
    // soft check — id should contain crimeKey prefix
  }
  return errors;
}

export function validateCrimeMinigameCatalog(): string[] {
  const errors: string[] = [];
  for (const crime of CRIME_CATALOG) {
    const expected = getStageCountForTier(crime.tier);
    const stages = CRIME_MINIGAME_CATALOG[crime.key];
    if (!stages || stages.length === 0) {
      errors.push(`Missing stages for crime: ${crime.key}`);
      continue;
    }
    if (stages.length !== expected) {
      errors.push(`${crime.key}: expected ${expected} stages, got ${stages.length}`);
    }
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].stageIndex !== i) {
        errors.push(`${crime.key}: stage at index ${i} has stageIndex ${stages[i].stageIndex}`);
      }
      errors.push(...validateStage(stages[i], expected));
    }
  }
  return errors;
}

/** Helper for authoring — call at bottom of catalog file as crimes are added */
export function stage(
  crimeKey: string,
  stageIndex: number,
  title: string,
  prompt: string,
  options: { label: string; correct: boolean }[],
  timeSeconds: number,
): CrimeMinigameStage {
  return {
    id: `${crimeKey}_s${stageIndex + 1}`,
    crimeKey,
    stageIndex,
    title,
    prompt,
    options,
    timeSeconds,
  };
}
```

- [ ] **Step 2: Create validation script**

```ts
// src/scripts/validateCrimeMinigameCatalog.ts
import { validateCrimeMinigameCatalog } from "../data/crimeMinigameCatalog";

const errors = validateCrimeMinigameCatalog();
if (errors.length > 0) {
  console.error("Crime minigame catalog validation FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("Crime minigame catalog validation passed.");
```

- [ ] **Step 3: Run validation — expect FAIL**

Run:
```powershell
npx ts-node src/scripts/validateCrimeMinigameCatalog.ts
```
Expected: exit code **1** with `Missing stages for crime: pickpocket_alley` (and 57 more).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit code **0**

- [ ] **Step 5: Commit**

```powershell
git add src/data/crimeMinigameCatalog.ts src/scripts/validateCrimeMinigameCatalog.ts
git commit -m "feat(crime): add minigame catalog scaffold and validation"
```

---

### Task 2: Crime run service (Redis lifecycle)

**Files:**
- Create: `src/services/crimeRunService.ts`

**Interfaces:**
- Consumes: `redisService`, `getStagesForCrime`, `hasMinigameCatalog`, `getCrimeByKey`, `getStageCountForTier`
- Produces:

```ts
export interface CrimeRun {
  runId: string;
  ownerId: string;
  crimeKey: string;
  guildId: string;
  stageIndex: number;
  stageStartedAt: number;
  boardSessionId?: string;
}

export type StageAnswerResult =
  | { outcome: "correct"; nextStageIndex: number | null; run: CrimeRun }
  | { outcome: "wrong"; correctLabel: string; failedStage: number; run: CrimeRun }
  | { outcome: "expired"; correctLabel: string; failedStage: number; run: CrimeRun }
  | { outcome: "invalid" };

export async function startCrimeRun(
  userId: string,
  crimeKey: string,
  guildId: string,
  boardSessionId?: string,
): Promise<{ run: CrimeRun; stage: CrimeMinigameStage }>;

export async function getCrimeRun(userId: string): Promise<CrimeRun | null>;
export async function clearCrimeRun(userId: string): Promise<void>;

export async function submitStageAnswer(
  userId: string,
  runId: string,
  stageIndex: number,
  optionIndex: number,
): Promise<StageAnswerResult>;

export function isStageTimedOut(run: CrimeRun, stage: CrimeMinigameStage): boolean;
export function getCurrentStageForRun(run: CrimeRun): CrimeMinigameStage | undefined;
```

- [ ] **Step 1: Implement Redis key + helpers**

```ts
// src/services/crimeRunService.ts
import { randomBytes } from "crypto";
import { redisService } from "./redisService";
import {
  CrimeMinigameStage,
  getStagesForCrime,
  hasMinigameCatalog,
} from "../data/crimeMinigameCatalog";
import { getCrimeByKey } from "../data/crimeCatalog";

const RUN_TTL = 900;
const RUN_KEY = (userId: string) => `crime_run:${userId}`;

export interface CrimeRun {
  runId: string;
  ownerId: string;
  crimeKey: string;
  guildId: string;
  stageIndex: number;
  stageStartedAt: number;
  boardSessionId?: string;
}

export async function getCrimeRun(userId: string): Promise<CrimeRun | null> {
  return redisService.get<CrimeRun>(RUN_KEY(userId));
}

export async function clearCrimeRun(userId: string): Promise<void> {
  await redisService.del(RUN_KEY(userId));
}

export function getCurrentStageForRun(run: CrimeRun): CrimeMinigameStage | undefined {
  const stages = getStagesForCrime(run.crimeKey);
  return stages?.[run.stageIndex];
}

export function isStageTimedOut(run: CrimeRun, stage: CrimeMinigameStage): boolean {
  return Date.now() > run.stageStartedAt + stage.timeSeconds * 1000;
}

async function persistRun(run: CrimeRun): Promise<void> {
  await redisService.set(RUN_KEY(run.ownerId), run, RUN_TTL);
}

export async function startCrimeRun(
  userId: string,
  crimeKey: string,
  guildId: string,
  boardSessionId?: string,
): Promise<{ run: CrimeRun; stage: CrimeMinigameStage }> {
  const crime = getCrimeByKey(crimeKey);
  if (!crime) throw new Error("Unknown crime.");
  if (!hasMinigameCatalog(crimeKey)) throw new Error("This job has no minigame stages yet.");

  const stages = getStagesForCrime(crimeKey)!;
  const run: CrimeRun = {
    runId: randomBytes(8).toString("hex"),
    ownerId: userId,
    crimeKey,
    guildId,
    stageIndex: 0,
    stageStartedAt: Date.now(),
    boardSessionId,
  };
  await persistRun(run);
  return { run, stage: stages[0] };
}
```

- [ ] **Step 2: Implement submitStageAnswer**

```ts
export type StageAnswerResult =
  | { outcome: "correct"; nextStageIndex: number | null; run: CrimeRun }
  | { outcome: "wrong"; correctLabel: string; failedStage: number; run: CrimeRun }
  | { outcome: "expired"; correctLabel: string; failedStage: number; run: CrimeRun }
  | { outcome: "invalid" };

function correctOptionLabel(stage: CrimeMinigameStage): string {
  return stage.options.find((o) => o.correct)?.label ?? "Unknown";
}

export async function submitStageAnswer(
  userId: string,
  runId: string,
  stageIndex: number,
  optionIndex: number,
): Promise<StageAnswerResult> {
  const run = await getCrimeRun(userId);
  if (!run || run.runId !== runId) return { outcome: "invalid" };
  if (run.stageIndex !== stageIndex) return { outcome: "invalid" };

  const stages = getStagesForCrime(run.crimeKey);
  const stage = stages?.[stageIndex];
  if (!stage) return { outcome: "invalid" };

  if (isStageTimedOut(run, stage)) {
    return {
      outcome: "expired",
      correctLabel: correctOptionLabel(stage),
      failedStage: stageIndex + 1,
      run,
    };
  }

  const option = stage.options[optionIndex];
  if (!option) return { outcome: "invalid" };

  if (!option.correct) {
    return {
      outcome: "wrong",
      correctLabel: correctOptionLabel(stage),
      failedStage: stageIndex + 1,
      run,
    };
  }

  const nextIndex = stageIndex + 1;
  if (nextIndex >= stages.length) {
    return { outcome: "correct", nextStageIndex: null, run };
  }

  const updated: CrimeRun = {
    ...run,
    stageIndex: nextIndex,
    stageStartedAt: Date.now(),
  };
  await persistRun(updated);
  return { outcome: "correct", nextStageIndex: nextIndex, run: updated };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit code **0**

- [ ] **Step 4: Commit**

```powershell
git add src/services/crimeRunService.ts
git commit -m "feat(crime): add Redis crime run service for minigame stages"
```

---

### Task 3: Refactor crimeService — remove RNG, split resolve paths

**Files:**
- Modify: `src/services/crimeService.ts`

**Interfaces:**
- Consumes: existing wallet/jail/heat/cooldown helpers
- Produces:
  - `CrimePreview` (replaces `CrimeOddsPreview` for UI)
  - `computeCrimePreview(userId, crime): Promise<CrimePreview>` — payout range only, no success %
  - `resolveCrimeSuccess(userId, username, crimeKey, guildId): Promise<CrimeExecuteResult>`
  - `resolveCrimeFailure(userId, username, crimeKey, guildId): Promise<CrimeExecuteResult>`
  - **Remove** RNG success roll from `executeCrime` — either delete `executeCrime` or make it throw directing callers to run service
  - **Remove** `setCooldown` from resolve functions (cooldown moves to confirm handler)

- [ ] **Step 1: Add CrimePreview and computeCrimePreview**

Replace success-chance display logic. Keep payout bonus from prep; drop luck/success math:

```ts
export interface CrimePreview {
  stageCount: number;
  payoutMin: number;
  payoutMax: number;
  payoutBonus: number;
}

export async function computeCrimePreview(userId: string, crime: CrimeDefinition): Promise<CrimePreview> {
  const { payoutBonus } = sumPrepBonuses(crime.requiredItems);
  const payoutMult = 1 + payoutBonus;
  const { getStageCountForTier } = await import("../data/crimeMinigameCatalog");
  return {
    stageCount: getStageCountForTier(crime.tier),
    payoutMin: Math.floor(crime.payoutMin * payoutMult),
    payoutMax: Math.floor(crime.payoutMax * payoutMult),
    payoutBonus,
  };
}
```

Prefer static import at top instead of dynamic:

```ts
import { getStageCountForTier } from "../data/crimeMinigameCatalog";
```

- [ ] **Step 2: Split executeCrime into resolveCrimeSuccess / resolveCrimeFailure**

Extract the `if (won) { ... }` block into `resolveCrimeSuccess` and the else block into `resolveCrimeFailure`. **Delete** these lines from both:

```ts
await setCooldown(userId, GRINDING_COMMANDS.crime.commandName, GRINDING_COMMANDS.crime.cooldownSeconds);
```

**Delete** from success path only — cooldown now set on commit.

Keep in both resolvers:
- `clearCrimeSession(userId)`
- `LAST_RESULT_KEY` redis write
- Crown/Devil on payout (success) / fine (failure)
- Jail roll on failure (RNG stays for jail only)
- Fox Tail fine guard on failure

Remove from resolve paths:
- `computeCrimeOdds` / `Math.random() < successChance`
- `applyLuckToChance`

- [ ] **Step 3: Deprecate computeCrimeOdds**

Either remove export and update all imports to `computeCrimePreview`, or keep `computeCrimeOdds` as thin wrapper that throws — prefer **replace all usages** in Task 4.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`  
Expected: errors in `crimeUi.ts` and `crimeInteractionHandler.ts` until Task 4/5 — **temporarily** update imports in those files to use new function names if needed, or complete Tasks 4–5 in same PR batch before final typecheck.

- [ ] **Step 5: Commit**

```powershell
git add src/services/crimeService.ts
git commit -m "refactor(crime): split success/failure resolve, remove commit RNG"
```

---

### Task 4: Crime UI — stage payload, board/prep copy, custom ID parsing

**Files:**
- Modify: `src/commands/economy/crimeUi.ts`

**Interfaces:**
- Consumes: `CrimeRun`, `CrimeMinigameStage`, `computeCrimePreview`, `getStageCountForTier`, `getStagesForCrime`
- Produces:
  - `buildCrimeStagePayload(run, stage, crimeName, totalStages)`
  - `crimeMinigameCustomId(ownerId, runId, stageIndex, optionIndex)`
  - `parseCrimeCustomId` extended to detect `action === "mg"`
  - Updated `buildCrimeBoardPayload` — stage count + payout, no success %
  - Updated `buildCrimePrepPayload` — stage count, payout bonus lines only (drop success % from gear lines)
  - `buildCrimeFailureResultPayload(...)` or extend `buildCrimeResultPayload` with optional `failedStage` + `correctLabel`

- [ ] **Step 1: Extend parseCrimeCustomId for minigame buttons**

```ts
export function parseCrimeCustomId(customId: string) {
  const parts = customId.split(":");
  const action = parts[1] ?? "";
  if (action === "mg") {
    return {
      action,
      ownerId: parts[2] ?? "",
      runId: parts[3] ?? "",
      stageIndex: Number(parts[4]),
      optionIndex: Number(parts[5]),
      sessionId: undefined,
      crimeKey: undefined,
    };
  }
  return {
    action,
    ownerId: parts[2] ?? "",
    sessionId: parts[3] ?? "",
    crimeKey: parts[4],
    runId: undefined,
    stageIndex: undefined,
    optionIndex: undefined,
  };
}

export function crimeMinigameCustomId(
  ownerId: string,
  runId: string,
  stageIndex: number,
  optionIndex: number,
) {
  return `crime:mg:${ownerId}:${runId}:${stageIndex}:${optionIndex}`;
}
```

- [ ] **Step 2: Update board lines**

Replace `computeCrimeOdds` + `formatPct(odds.successChance)` with:

```ts
const preview = await computeCrimePreview(ownerId, crime);
lines.push(
  `${Mascot.Emotes.Accept} **${tierLabel(crime.tier)}** · ${crime.name} · ${preview.stageCount} stage${preview.stageCount > 1 ? "s" : ""} · ${fmtCurrency(preview.payoutMin)}–${fmtCurrency(preview.payoutMax)}`,
);
```

Select menu description: `${tierLabel(crime.tier)} · ${preview.stageCount} stages`

- [ ] **Step 3: Update prep screen**

```ts
const preview = await computeCrimePreview(ownerId, crime);
const gearLines = crime.requiredItems.map((key) => {
  const prep = getCrimePrepItem(key)!;
  const craftTag = prep.source === "hunt_craft" ? " · Hunt Craft" : "";
  return `${Mascot.Emotes.Tick} **${prep.name}** · +${Math.round(prep.payoutBonus * 100)}% payout${craftTag}`;
});

// Body copy:
`This job has **${preview.stageCount} stage${preview.stageCount > 1 ? "s" : ""}**. Pass all to succeed.\n\n` +
`Required gear (must own all):\n\n${gearLines.join("\n")}\n\n` +
`Payout ${fmtCurrency(preview.payoutMin)}–${fmtCurrency(preview.payoutMax)} · ` +
`Fail fine ${fmtCurrency(crime.fineMin)}–${fmtCurrency(crime.fineMax)}`
```

- [ ] **Step 4: Add buildCrimeStagePayload**

```ts
export function buildCrimeStagePayload(
  run: CrimeRun,
  stage: CrimeMinigameStage,
  crimeName: string,
  totalStages: number,
) {
  const stageNum = stage.stageIndex + 1;
  const deadlineUnix = Math.floor((run.stageStartedAt + stage.timeSeconds * 1000) / 1000);

  const container = new ContainerBuilder()
    .setAccentColor(CRIME_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.Gun} ${crimeName} — Stage ${stageNum}/${totalStages}`,
      ),
      new TextDisplayBuilder().setContent(stage.prompt),
      new TextDisplayBuilder().setContent(
        `-# ${stage.timeSeconds}s limit · ends <t:${deadlineUnix}:R> · Wrong choice fails the job`,
      ),
    )
    .addSeparatorComponents(separator());

  const buttons = stage.options.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(crimeMinigameCustomId(run.ownerId, run.runId, stage.stageIndex, i))
      .setLabel(opt.label.slice(0, 80))
      .setStyle(ButtonStyle.Secondary),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(0, 5));

  return { components: [container, row], flags: CRIME_V2_FLAGS };
}
```

Import `CrimeRun` from `crimeRunService`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit code **0** (after Task 3 import fixes)

- [ ] **Step 6: Commit**

```powershell
git add src/commands/economy/crimeUi.ts
git commit -m "feat(crime): add minigame stage UI and replace success % with stage count"
```

---

### Task 5: Wire crimeInteractionHandler — commit starts run, mg submits answers

**Files:**
- Modify: `src/handlers/crimeInteractionHandler.ts`

**Interfaces:**
- Consumes: `startCrimeRun`, `submitStageAnswer`, `clearCrimeRun`, `getCrimeRun`, `isStageTimedOut`, `getCurrentStageForRun`, `resolveCrimeSuccess`, `resolveCrimeFailure`, `buildCrimeStagePayload`, `setCooldown`, `hasMinigameCatalog`, `getStageCountForTier`, `getStagesForCrime`
- Produces: working end-to-end handler for `confirm` + `crime:mg:` flows

- [ ] **Step 1: Add early branch for minigame buttons (before session check)**

At top of handler, after owner/guild checks:

```ts
const parsed = parseCrimeCustomId(customId);

if (parsed.action === "mg" && interaction.isButton()) {
  if (interaction.user.id !== parsed.ownerId) {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Decline} This stage is not yours.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  if (!await ensureDeferredUpdate(interaction)) return;
  return handleMinigameAnswer(interaction, parsed);
}
```

Implement `handleMinigameAnswer` in same file:

```ts
async function handleMinigameAnswer(
  interaction: ButtonInteraction,
  parsed: ReturnType<typeof parseCrimeCustomId>,
) {
  const { ownerId, runId, stageIndex, optionIndex } = parsed;
  if (!runId || stageIndex === undefined || optionIndex === undefined) return;

  const run = await getCrimeRun(ownerId!);
  if (!run) {
    return safeEditReply(interaction, buildCrimeResultPayload(
      `${Mascot.Emotes.Fail} Crime Expired`,
      "Your run expired. Cooldown still applies — try again later.",
      0xe74c3c,
    ));
  }

  const result = await submitStageAnswer(ownerId!, runId, stageIndex, optionIndex);
  const crime = getCrimeByKey(run.crimeKey)!;

  if (result.outcome === "invalid") {
    return safeReply(interaction, {
      content: `${Mascot.Emotes.Alert} That choice is no longer valid.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (result.outcome === "wrong" || result.outcome === "expired") {
    const resolve = await resolveCrimeFailure(ownerId!, interaction.user.username, run.crimeKey, interaction.guild!.id);
    await clearCrimeRun(ownerId!);
    const failNote = `\n\nFailed at stage **${result.failedStage}**. Correct move: **${result.correctLabel}**`;
    return finishCrimeResult(interaction, resolve, failNote);
  }

  if (result.nextStageIndex === null) {
    const resolve = await resolveCrimeSuccess(ownerId!, interaction.user.username, run.crimeKey, interaction.guild!.id);
    await clearCrimeRun(ownerId!);
    return finishCrimeResult(interaction, resolve);
  }

  const stages = getStagesForCrime(run.crimeKey)!;
  const nextStage = stages[result.nextStageIndex];
  const total = getStageCountForTier(crime.tier);
  return safeEditReply(interaction, buildCrimeStagePayload(result.run, nextStage, crime.name, total));
}
```

Extract shared `finishCrimeResult` from existing confirm success/fail logging block.

- [ ] **Step 2: Rewrite confirm handler**

Replace `executeCrime(...)` call with:

```ts
import { setCooldown } from "../services/cooldownService";
import { GRINDING_COMMANDS } from "../utils/economyConfig";
import { hasMinigameCatalog } from "../data/crimeMinigameCatalog";
import { startCrimeRun } from "../services/crimeRunService";
import { resolveCrimeSuccess, resolveCrimeFailure, clearCrimeSession } from "../services/crimeService";
import { getCrimeByKey } from "../data/crimeCatalog";
import { getStageCountForTier, getStagesForCrime } from "../data/crimeMinigameCatalog";

// inside confirm:
if (!hasMinigameCatalog(crimeKey)) {
  return safeReply(interaction, {
    content: `${Mascot.Emotes.Alert} This job is not ready yet.`,
    flags: MessageFlags.Ephemeral,
  });
}

await setCooldown(ownerId, GRINDING_COMMANDS.crime.commandName, GRINDING_COMMANDS.crime.cooldownSeconds);
await clearCrimeSession(ownerId);

const crime = getCrimeByKey(crimeKey)!;
const { run, stage } = await startCrimeRun(ownerId, crimeKey, interaction.guild.id, sessionId);
const total = getStageCountForTier(crime.tier);
await safeEditReply(interaction, buildCrimeStagePayload(run, stage, crime.name, total));
```

Remove old `executeCrime` import.

- [ ] **Step 3: Timeout handling on button click**

`submitStageAnswer` already checks `isStageTimedOut` when player clicks. If player never clicks, crime stays in Redis until TTL — acceptable for v1 (cooldown already spent). Optional: document in help text.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit code **0**

- [ ] **Step 5: Commit**

```powershell
git add src/handlers/crimeInteractionHandler.ts
git commit -m "feat(crime): wire minigame stage interactions and commit flow"
```

---

### Task 6: Author minigame catalog — General + Job crimes (20 crimes)

**Files:**
- Modify: `src/data/crimeMinigameCatalog.ts`

**Crime keys to author (stage counts in parentheses):**

| Key | Stages |
|-----|--------|
| pickpocket_alley | 1 |
| counterfeit_stamps | 1 |
| parking_meter_shake | 1 |
| back_alley_dice | 1 |
| resume_forge | 1 |
| thesis_plagiarism | 1 |
| feed_racket | 1 |
| atm_skim | 2 |
| tax_dodge | 2 |
| lottery_scam | 2 |
| office_expense_fraud | 2 |
| overtime_skim | 2 |
| payroll_redirect | 2 |
| vip_briefcase_lift | 2 |
| stamp_forgery | 2 |
| gear_resale | 2 |
| contract_breach_scam | 2 |
| client_kickback | 2 |
| shell_company_flip | 3 |
| audit_bribe | 3 |

**Authoring rules:**
- Prompts reference the **crime name or unique scenario**
- Petty: 3 options, one obvious correct
- Medium/High: 3–4 options
- Elite (in later tasks): 4 options, tighter distractors
- Use `DEFAULT_TIMER_BY_TIER[crime.tier]` for `timeSeconds`
- Register in catalog:

```ts
import { getCrimeByKey } from "./crimeCatalog";

function registerCrimeStages(crimeKey: string, stages: CrimeMinigameStage[]) {
  CRIME_MINIGAME_CATALOG[crimeKey] = stages;
}

registerCrimeStages("pickpocket_alley", [
  stage(
    "pickpocket_alley",
    0,
    "Target selection",
    "A merchant is distracted haggling. Where do you strike?",
    [
      { label: "Outer coat pocket", correct: true },
      { label: "Hand him a flyer", correct: false },
      { label: "Bump him hard", correct: false },
    ],
    DEFAULT_TIMER_BY_TIER.petty,
  ),
]);

registerCrimeStages("office_expense_fraud", [
  stage("office_expense_fraud", 0, "Receipt forgery", "Accounting flagged your lunch receipt. What's your move?", [
    { label: "Submit matching vendor receipt", correct: true },
    { label: "Claim the charge was a mistake", correct: false },
    { label: "Blame the intern", correct: false },
  ], DEFAULT_TIMER_BY_TIER.medium),
  stage("office_expense_fraud", 1, "Audit dodge", "Finance wants the original invoice. You:", [
    { label: "Produce the forged copy from briefcase", correct: true },
    { label: "Admit the expense", correct: false },
    { label: "Delete the email thread", correct: false },
    { label: "Offer to pay cash", correct: false },
  ], DEFAULT_TIMER_BY_TIER.medium),
]);

// ... all 20 crimes
```

- [ ] **Step 1:** Author all 20 crime stage sets using `registerCrimeStages`
- [ ] **Step 2:** Run partial validation — expect failures only for Uni/Hunt/Cock/Legendary keys

Run:
```powershell
npx ts-node src/scripts/validateCrimeMinigameCatalog.ts
```
Expected: exit code **1** with ~38 missing crimes remaining

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```powershell
git add src/data/crimeMinigameCatalog.ts
git commit -m "feat(crime): add minigame stages for General and Job crimes"
```

---

### Task 7: Author minigame catalog — Uni + Hunt crimes (20 crimes)

**Files:**
- Modify: `src/data/crimeMinigameCatalog.ts`

**Crime keys:**

| Key | Stages |
|-----|--------|
| exam_swap | 2 |
| scholarship_forgery | 2 |
| tuition_launder | 2 |
| grade_broker | 2 |
| fake_transcript_ring | 2 |
| poacher_run | 2 |
| permit_forgery | 2 |
| ranger_bribe | 2 |
| reserve_trespass | 2 |
| lab_chemical_theft | 2 |
| lab_equipment_fence | 2 |
| bait_warehouse_heist | 2 |
| trophy_black_market | 2 |
| wildlife_smuggle | 2 |
| stealth_trail_lift | 2 |
| dean_bribe | 3 |
| campus_pill_lab | 3 |
| night_vision_poach | 3 |
| sniper_escape_route | 3 |
| eclipse_night_rob | 3 |

- [ ] **Step 1:** Author all 20 crime stage sets
- [ ] **Step 2:** Run validation — expect ~18 crimes still missing (Cock + Legendary)

Run: `npx ts-node src/scripts/validateCrimeMinigameCatalog.ts`  
Expected: exit code **1**

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```powershell
git add src/data/crimeMinigameCatalog.ts
git commit -m "feat(crime): add minigame stages for Uni and Hunt crimes"
```

---

### Task 8: Author minigame catalog — Cock + Legendary crimes (18 crimes)

**Files:**
- Modify: `src/data/crimeMinigameCatalog.ts`

**Crime keys:**

| Key | Stages |
|-----|--------|
| fight_fix | 2 |
| spurs_smuggling | 2 |
| arena_gate_crash | 2 |
| champion_doping | 2 |
| cockfight_heist | 2 |
| arena_security_bribe | 2 |
| betting_ring_skim | 3 |
| underground_title_fraud | 3 |
| blood_sport_launder | 3 |
| executive_embezzle | 3 |
| bank_vault_heist | 3 |
| drug_pipeline_deal | 3 |
| armored_truck_hit | 3 |
| money_laundering_ring | 3 |
| casino_backroom_skim | 3 |
| port_smuggling_run | 3 |
| hostage_ransom_plot | 3 |
| black_market_auction_raid | 3 |

Legendary crimes use **4 options**, **20s** timer, heist-pressure copy. Example for `bank_vault_heist`:

```ts
registerCrimeStages("bank_vault_heist", [
  stage("bank_vault_heist", 0, "Camera cycle", "The vault camera sweeps every 8 seconds. How do you enter the service corridor?", [
    { label: "Use maintenance keycard", correct: true },
    { label: "Kick the service door", correct: false },
    { label: "Ask the guard for directions", correct: false },
    { label: "Wait in the lobby", correct: false },
  ], 20),
  stage("bank_vault_heist", 1, "Alarm panel", "The alarm panel is blinking amber. You:", [
    { label: "Bypass with corporate codes", correct: true },
    { label: "Cut power to the whole block", correct: false },
    { label: "Smash the panel", correct: false },
    { label: "Call the security desk", correct: false },
  ], 20),
  stage("bank_vault_heist", 2, "Extraction", "Sirens in the distance. Exit plan:", [
    { label: "Rooftop sniper cover to the van", correct: true },
    { label: "Front door with mask off", correct: false },
    { label: "Hide in the vault overnight", correct: false },
    { label: "Split up and walk", correct: false },
  ], 20),
]);
```

- [ ] **Step 1:** Author all 18 crime stage sets
- [ ] **Step 2:** Run full catalog validation — expect PASS

Run:
```powershell
npx ts-node src/scripts/validateCrimeMinigameCatalog.ts
```
Expected: `Crime minigame catalog validation passed.` exit code **0**

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```powershell
git add src/data/crimeMinigameCatalog.ts
git commit -m "feat(crime): complete minigame catalog for all 58 crimes"
```

---

### Task 9: Spec cross-link and prep whitelist copy cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-crime-module-overhaul-design.md` (addendum paragraph only)

- [ ] **Step 1:** Add at top or §Summary:

```markdown
> **Minigames addendum:** Success is determined by crime-specific minigame stages, not RNG. See [2026-06-21-crime-minigames-design.md](./2026-06-21-crime-minigames-design.md).
```

- [ ] **Step 2:** Grep for stale success % references in crime module

Run:
```powershell
rg "successChance|computeCrimeOdds|formatPct" src/commands/economy/crimeUi.ts src/handlers/crimeInteractionHandler.ts src/services/crimeService.ts
```
Expected: **0 matches** in UI/handler (service may keep `sumPrepBonuses.successBonus` internally unused — optional cleanup)

- [ ] **Step 3: Commit**

```powershell
git add docs/superpowers/specs/2026-06-21-crime-module-overhaul-design.md
git commit -m "docs(crime): link minigames addendum to overhaul spec"
```

---

### Task 10: Final verification and manual QA

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`  
Expected: exit code **0**

- [ ] **Step 2: Catalog validation**

Run: `npx ts-node src/scripts/validateCrimeMinigameCatalog.ts`  
Expected: exit code **0**

- [ ] **Step 3: Grep CV2 safety**

Run:
```powershell
rg "embeds:" src/handlers/crimeInteractionHandler.ts src/commands/economy/crimeUi.ts
```
Expected: **0 matches** in crime result/stage paths

- [ ] **Step 4: Manual Discord QA checklist**

| Scenario | Expected |
|----------|----------|
| `,crime` board | Shows `N stages` not success % |
| Petty crime, correct answer | 1 stage → success payout, cooldown active |
| Petty crime, wrong answer | Fail fine, cooldown active, shows failed stage + correct move |
| Medium crime | Pass S1, fail S2 → failure |
| Legendary crime | 3 stages, 4 buttons each, 20s footer |
| Commit without catalog (dev) | Blocked with "not ready yet" |
| CV2 result after fail | No Discord 50035 embed error |
| Prep items | Not consumed; still required at commit |
| Jail on elite fail | Still possible (~20% roll) |

- [ ] **Step 5: Commit** (if any QA fixes)

```powershell
git add -A
git commit -m "fix(crime): address minigame QA findings"
```

---

## Spec coverage self-review

| Spec section | Task |
|--------------|------|
| All-or-nothing pass/fail | Tasks 2, 3, 5 |
| Crime-specific stages (58 crimes) | Tasks 6, 7, 8 |
| Tier stage counts + timers | Task 1 |
| Prep gate only | Tasks 3, 5 (no mid-run buffs) |
| Cooldown on Commit Crime | Task 5 |
| CV2 stage + result UI | Tasks 4, 5 |
| Board/prep stage count copy | Task 4 |
| Failure shows stage + correct move | Tasks 4, 5 |
| `crime:mg:` routing | Tasks 4, 5 |
| Remove success RNG | Task 3 |
| Crown/Devil on resolve only | Task 3 |
| Luck excluded from minigame | Task 3 |
| Redis run TTL 900s | Task 2 |
| Missing catalog blocks commit | Tasks 1, 5 |
| No DB migration | All tasks |
| Testing plan | Task 10 |

**Placeholder scan:** No TBD/TODO steps. All interfaces named with signatures.

---

## Execution note

This repo has **no Jest/Vitest**. Validation uses `src/scripts/validateCrimeMinigameCatalog.ts` + `npx tsc --noEmit` instead of unit tests. Manual Discord QA in Task 10 covers interaction timing and CV2 edit behavior.
