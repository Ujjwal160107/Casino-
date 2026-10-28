import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testRedis, flushTestKeys } from "../helpers";
import { startCrimeRun, submitStageAnswer, getCrimeRun, stageOptionOrder, CrimeRun } from "../../src/services/crimeRunService";
import { CRIME_MINIGAME_CATALOG } from "../../src/data/crimeMinigameCatalog";
import { redisService } from "../../src/services/redisService";

// The final stage used to be resolvable by every click that read the run before
// the handler cleared it: a double-click paid twice, and a wrong + right click
// pair produced a payout AND a fine. Terminal answers must claim the run.

const id = "crime-run-race-1";
const [crimeKey, stages] = Object.entries(CRIME_MINIGAME_CATALOG).find(([, s]) => s.length >= 2)!;
const last = stages.length - 1;

// Buttons are shuffled per stage: find the button position showing an option.
const button = (run: CrimeRun, stage: number, correct: boolean) =>
  stageOptionOrder(run, stages[stage]).findIndex((i) => stages[stage].options[i].correct === correct);

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
      submitStageAnswer(id, run.runId, last, button(run, last, true)),
      submitStageAnswer(id, run.runId, last, button(run, last, true)),
    ]);
    expect(results.filter((r) => r.outcome === "correct")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "invalid")).toHaveLength(1);
    expect(await getCrimeRun(id)).toBeNull();
  });

  it("a wrong and a right click cannot both resolve", async () => {
    const run = await runAtFinalStage();
    const results = await Promise.all([
      submitStageAnswer(id, run.runId, last, button(run, last, false)),
      submitStageAnswer(id, run.runId, last, button(run, last, true)),
    ]);
    expect(results.filter((r) => r.outcome !== "invalid")).toHaveLength(1);
  });

  it("a stage-advance click cannot resurrect a run another click already failed", async () => {
    const { run } = await startCrimeRun(id, crimeKey, "g1");
    const results = await Promise.all([
      submitStageAnswer(id, run.runId, 0, button(run, 0, false)),
      submitStageAnswer(id, run.runId, 0, button(run, 0, true)),
    ]);
    expect(results.filter((r) => r.outcome !== "invalid")).toHaveLength(1);
    if (results[0].outcome === "wrong") expect(await getCrimeRun(id)).toBeNull();
  });
});

describe("crime stage button order", () => {
  it("does not always put the correct option on the same button", async () => {
    const positions = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const { run } = await startCrimeRun(id, crimeKey, "g1");
      positions.add(button(run, 0, true));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("pressing the button that shows the correct option advances the run", async () => {
    const { run } = await startCrimeRun(id, crimeKey, "g1");
    const result = await submitStageAnswer(id, run.runId, 0, button(run, 0, true));
    expect(result.outcome).toBe("correct");
  });

  it("pressing the button that shows a wrong option fails the run", async () => {
    const { run } = await startCrimeRun(id, crimeKey, "g1");
    const result = await submitStageAnswer(id, run.runId, 0, button(run, 0, false));
    expect(result.outcome).toBe("wrong");
  });
});
