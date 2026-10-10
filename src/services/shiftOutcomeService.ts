import prisma from "../utils/prisma";
import { questBus } from "./questEvents";
import { applyIncomeTax } from "./taxService";

export interface ShiftOutcome {
  discordId: string;
  jobId: string;
  /** How the shift was played: the minigame type ("button", "typing") or "event". */
  shiftType: string;
  /** Counted as a completed shift (lifetime shift credit). */
  success: boolean;
  /** Gross pay already credited to the wallet for this shift (0 when none). */
  earnings: number;
}

/**
 * The bookkeeping every finished shift shares, however it was played: income
 * tax on what was paid, the work log row, and the quest event. Work-event
 * shifts used to pay out through their own path and skipped all three.
 */
export async function recordShiftOutcome(outcome: ShiftOutcome) {
  const tax = outcome.earnings > 0
    ? await applyIncomeTax(outcome.discordId, outcome.earnings)
    : { net: 0, taxPaid: 0, shielded: false };

  await prisma.workLog.create({
    data: {
      userId: outcome.discordId,
      jobId: outcome.jobId,
      shiftType: outcome.shiftType,
      success: outcome.success,
      earnings: outcome.earnings,
    },
  });

  if (outcome.success) questBus.emit("work:complete", { discordId: outcome.discordId });
  // EARN_WORK ("earn 100k+ from work") listens for this; nothing emitted it.
  if (outcome.earnings > 0) questBus.emit("work:earn", { discordId: outcome.discordId, amount: outcome.earnings });

  return tax;
}
