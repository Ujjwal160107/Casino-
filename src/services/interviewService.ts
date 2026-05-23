import { INTERVIEW_SCENARIOS, InterviewScenario, InterviewChoice } from "../data/interviewScenarios";
import { redisService } from "./redisService";

export interface InterviewResult {
  scenario: InterviewScenario;
  choiceIndex: number;
  choice: InterviewChoice;
  rolled: number;
  success: boolean;
  scoreGained: number;
}

export interface InterviewSession {
  scenarios: InterviewScenario[];
  results: InterviewResult[];
  totalScore: number;
  passed: boolean;
  luckyTieActive: boolean;
}

const PASS_THRESHOLD = 60;
const QUESTIONS_PER_INTERVIEW = 5;

export function getInterview(sector: string): { scenarios: InterviewScenario[] } {
  const sectorScenarios = INTERVIEW_SCENARIOS.filter(s => s.sector === sector);
  const globalScenarios = INTERVIEW_SCENARIOS.filter(s => s.sector === "all");

  // Pick 2 sector-specific (or fallback to global if not enough)
  const shuffledSector = [...sectorScenarios].sort(() => Math.random() - 0.5);
  const shuffledGlobal = [...globalScenarios].sort(() => Math.random() - 0.5);

  const selected: InterviewScenario[] = [];
  selected.push(...shuffledSector.slice(0, 2));
  selected.push(...shuffledGlobal.slice(0, QUESTIONS_PER_INTERVIEW - selected.length));

  // Fill remaining from global if sector was short
  if (selected.length < QUESTIONS_PER_INTERVIEW) {
    selected.push(...shuffledGlobal.slice(selected.length, QUESTIONS_PER_INTERVIEW));
  }

  // Deduplicate and trim to 5
  const unique = Array.from(new Map(selected.map(s => [s.id, s])).values()).slice(0, QUESTIONS_PER_INTERVIEW);
  return { scenarios: unique };
}

export async function resolveInterviewChoice(
  scenario: InterviewScenario,
  choiceIndex: number,
  discordId: string,
): Promise<InterviewResult> {
  const choice = scenario.choices[choiceIndex];
  if (!choice) throw new Error("Invalid choice index");

  // Lucky Tie boost
  const tieData = await redisService.get<{ active: boolean }>(`lucky_tie:${discordId}`);
  const tieBoost = tieData?.active ? 0.10 : 0;

  const rolled = Math.random();
  const success = rolled < (choice.successChance + tieBoost);
  const scoreGained = success ? choice.scoreOnSuccess : 0;

  return {
    scenario,
    choiceIndex,
    choice,
    rolled,
    success,
    scoreGained,
  };
}

export function evaluateInterview(results: InterviewResult[], luckyTieActive: boolean): InterviewSession {
  const totalScore = results.reduce((sum, r) => sum + r.scoreGained, 0);
  const passed = totalScore >= PASS_THRESHOLD;
  return {
    scenarios: results.map(r => r.scenario),
    results,
    totalScore,
    passed,
    luckyTieActive,
  };
}
