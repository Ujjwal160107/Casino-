// The minute vote sweeper (amendment 4.3, A42): closes due votes and
// announces each result, then announces any start or result still silent
// after voteAnnounceGraceSeconds (a crash between a commit and its
// announcement). Every write is a CAS in the service it calls, so a doubled
// or missed minute is harmless; one vote's failure never stops the rest.
import type { Client } from "discord.js";
import { safely } from "../../ui/crimeFamily/caperFlow";
import { announceVoteResult, announceVoteStart } from "../../ui/crimeFamily/voteAnnounce";
import type { CfJob } from "./scheduler";
import { closeVote, votesDue } from "./voteService";

export async function sweepVotes(client: Client, now: Date): Promise<void> {
  const due = await votesDue(now);
  for (const voteId of due.close) {
    await safely(`sweepVotes close ${voteId}`, async () => {
      if (await closeVote(voteId, now)) await announceVoteResult(client, voteId);
    });
  }
  for (const voteId of due.announceStart) await announceVoteStart(client, voteId);
  for (const voteId of due.announceResult) await announceVoteResult(client, voteId);
}

export const SWEEP_VOTES_JOB: CfJob = { name: "sweepVotes", run: (client, now) => sweepVotes(client, now) };
