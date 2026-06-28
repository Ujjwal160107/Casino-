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

function correctOptionLabel(stageDef: CrimeMinigameStage): string {
  return stageDef.options.find((o) => o.correct)?.label ?? "Unknown";
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
  const stageDef = stages?.[stageIndex];
  if (!stageDef) return { outcome: "invalid" };

  if (isStageTimedOut(run, stageDef)) {
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
    return {
      outcome: "wrong",
      correctLabel: correctOptionLabel(stageDef),
      failedStage: stageIndex + 1,
      run,
    };
  }

  const nextIndex = stageIndex + 1;
  if (nextIndex >= stages!.length) {
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
