import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testRedis, flushTestKeys } from "../helpers";
import { startCrimeRun, submitStageAnswer, getCrimeRun } from "../../src/services/crimeRunService";
import { CRIME_MINIGAME_CATALOG } from "../../src/data/crimeMinigameCatalog";
import { redisService } from "../../src/services/redisService";

// The final stage used to be resolvable by every click that read the run before
// the handler cleared it: a double-click paid twice, and a wrong + right click
// pair produced a payout AND a fine. Terminal answers must claim the run.

const id = "crime-run-race-1";
const [crimeKey, stages] = Object.entries(CRIME_MINIGAME_CATALOG).find(([, s]) => s.length >= 2)!;
const last = stages.length - 1;
const correctIdx = stages[last].options.findIndex((o) => o.correct);
const wrongIdx = stages[last].options.findIndex((o) => !o.correct);

async function runAtFinalStage() {
  const { run } = await startCrimeRun(id, crimeKey, "g1");
  const atLast = { ...run, stageIndex: last, stageStartedAt: Date.now() };
  await redisService.set(`crime_run:${id}`, atLast, 900);
  return atLast;
}

beforeEach(() => flushTestKeys(`crime_run:${id}`));
afterAll(async () => {
  await flushTestKeys(`crime_run:${id}`);
  await testRedis().quit();
});

describe("crime run terminal claim", () => {
  it("a double-clicked final answer resolves exactly once", async () => {
    const run = await runAtFinalStage();
    const results = await Promise.all([
      submitStageAnswer(id, run.runId, last, correctIdx),
      submitStageAnswer(id, run.runId, last, correctIdx),
    ]);
    expect(results.filter((r) => r.outcome === "correct")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "invalid")).toHaveLength(1);
    expect(await getCrimeRun(id)).toBeNull();
  });

  it("a wrong and a right click cannot both resolve", async () => {
    const run = await runAtFinalStage();
    const results = await Promise.all([
      submitStageAnswer(id, run.runId, last, wrongIdx),
      submitStageAnswer(id, run.runId, last, correctIdx),
    ]);
    expect(results.filter((r) => r.outcome !== "invalid")).toHaveLength(1);
  });

  it("a stage-advance click cannot resurrect a run another click already failed", async () => {
    const { run } = await startCrimeRun(id, crimeKey, "g1");
    const s0Correct = stages[0].options.findIndex((o) => o.correct);
    const s0Wrong = stages[0].options.findIndex((o) => !o.correct);
    const results = await Promise.all([
      submitStageAnswer(id, run.runId, 0, s0Wrong),
      submitStageAnswer(id, run.runId, 0, s0Correct),
    ]);
    expect(results.filter((r) => r.outcome !== "invalid")).toHaveLength(1);
    if (results[0].outcome === "wrong") expect(await getCrimeRun(id)).toBeNull();
  });
});
