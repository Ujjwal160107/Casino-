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

export type StageAnswerResult =
  | { outcome: "correct"; nextStageIndex: number | null; run: CrimeRun }
  | { outcome: "wrong"; correctLabel: string; failedStage: number; run: CrimeRun }
  | { outcome: "expired"; correctLabel: string; failedStage: number; run: CrimeRun }
  | { outcome: "invalid" };

export async function getCrimeRun(userId: string): Promise<CrimeRun | null> {
  return redisService.get<CrimeRun>(RUN_KEY(userId));
}

export function getCurrentStageForRun(run: CrimeRun): CrimeMinigameStage | undefined {
  const stages = getStagesForCrime(run.crimeKey);
  return stages?.[run.stageIndex];
}

export function isStageTimedOut(run: CrimeRun, stage: CrimeMinigameStage): boolean {
  return Date.now() > run.stageStartedAt + stage.timeSeconds * 1000;
}

function correctOptionLabel(stageDef: CrimeMinigameStage): string {
  return stageDef.options.find((o) => o.correct)?.label ?? "Unknown";
}

async function persistRun(run: CrimeRun): Promise<void> {
  await redisService.set(RUN_KEY(run.ownerId), run, RUN_TTL);
}

// Compare-and-swap on the raw stored run: replace (or delete, when ARGV[2] is
// empty) only if the key still holds exactly the value this caller read. Two
// clicks racing on the same stage both read the same run; only one may move it
// on, so a run can never resolve twice (double payout, or success + fine).
const RUN_CAS_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) end
return 1`;

async function swapRun(ownerId: string, expectedRaw: string, next: CrimeRun | null): Promise<boolean> {
  const won = await redisService
    .getInstance()
    .eval(RUN_CAS_SCRIPT, 1, RUN_KEY(ownerId), expectedRaw, next ? JSON.stringify(next) : "", RUN_TTL);
  return won === 1;
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

/**
 * Terminal outcomes ("wrong", "expired", final "correct") have already removed
 * the run atomically: the caller that receives one is the only one allowed to
 * resolve it. A losing concurrent click gets "invalid".
 */
export async function submitStageAnswer(
  userId: string,
  runId: string,
  stageIndex: number,
  optionIndex: number,
): Promise<StageAnswerResult> {
  // Read the raw value: the CAS below compares against exactly what we saw.
  const raw = await redisService.getInstance().get(RUN_KEY(userId));
  if (!raw) return { outcome: "invalid" };
  const run = JSON.parse(raw) as CrimeRun;
  if (run.runId !== runId) return { outcome: "invalid" };
  if (run.stageIndex !== stageIndex) return { outcome: "invalid" };

  const stages = getStagesForCrime(run.crimeKey);
  const stageDef = stages?.[stageIndex];
  if (!stageDef) return { outcome: "invalid" };

  if (isStageTimedOut(run, stageDef)) {
    if (!await swapRun(userId, raw, null)) return { outcome: "invalid" };
    return {
      outcome: "expired",
      correctLabel: correctOptionLabel(stageDef),
      failedStage: stageIndex + 1,
      run,
    };
  }

  const option = stageDef.options[optionIndex];
  if (!option) return { outcome: "invalid" };

  if (!option.correct) {
    if (!await swapRun(userId, raw, null)) return { outcome: "invalid" };
    return {
      outcome: "wrong",
      correctLabel: correctOptionLabel(stageDef),
      failedStage: stageIndex + 1,
      run,
    };
  }

  const nextIndex = stageIndex + 1;
  if (nextIndex >= stages!.length) {
    if (!await swapRun(userId, raw, null)) return { outcome: "invalid" };
    return { outcome: "correct", nextStageIndex: null, run };
  }

  const updated: CrimeRun = {
    ...run,
    stageIndex: nextIndex,
    stageStartedAt: Date.now(),
  };
  if (!await swapRun(userId, raw, updated)) return { outcome: "invalid" };
  return { outcome: "correct", nextStageIndex: nextIndex, run: updated };
}
