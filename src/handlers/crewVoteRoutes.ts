// VOTE_ROUTES: the no-confidence vote presses (amendment 4.5). `crew:vt:*` are
// owner-scoped (S2's Vote button, S35); `crew:vote:<yes|no>:<voteId>` is
// shared, from S34, the S25 vote card and the opened-vote DM, and authorised
// against the vote's snapshot and membership. Imports no other route table.
import { requireMembership } from "../services/crimeFamily/familyQueries";
import { castBallot, getVoteStartView, getVoteView, openVoteOf, startVote } from "../services/crimeFamily/voteService";
import type { CfPayload } from "../ui/crimeFamily/kit";
import { announceVoteStart, requestVoteRender } from "../ui/crimeFamily/voteAnnounce";
import { buildVoteSeatCard, buildVoteStartConfirm } from "../ui/crimeFamily/voteScreens";
import type { CfRoute, CfRouteTable } from "./crimeFamilyRouter";
import { assertEnabled, auto, notice, owner, show, showThenAnnounce, update } from "./crewRouteKit";

const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

/** The S25 vote card while the caller's family has an open vote, else S35 (F20). */
export async function voteEntryScreen(uid: string): Promise<CfPayload> {
  const now = new Date();
  const { family } = await requireMembership(uid);
  const open = await openVoteOf(family.id);
  const view = open ? await getVoteView(open.id, uid, now) : null;
  if (view) return buildVoteSeatCard(view);
  return buildVoteStartConfirm(await getVoteStartView(uid, now));
}

/** `crew:vt:ok:<owner>` (S35 Start vote). */
const startRoute: CfRoute = async (i, args) => {
  assertEnabled();
  const vote = await startVote(owner(args));
  return showThenAnnounce(i, notice(`Vote started. It closes ${rel(vote.closesAt)}.`), () => announceVoteStart(i.client, vote.id));
};

/** `crew:vote:<yes|no>:<voteId>`: the reply names only the pressed choice (F21). */
const ballotRoute: CfRoute = async (i, [answer, voteId]) => {
  assertEnabled();
  const choice = answer === "yes" ? "YES" : "NO";
  const vote = await castBallot(voteId, i.user.id, choice);
  await show(i, notice(`Your ballot: ${choice}. You can change it until ${rel(vote.closesAt)}. Ballots are secret.`));
  void requestVoteRender(i.client, vote.id);
};

const entryRoute: CfRoute = async (i, args) => show(i, await voteEntryScreen(owner(args)));

export const VOTE_ROUTES: CfRouteTable = {
  /** `crew:open:vote:<owner>` (`!crew vote`'s S27 opener): more specific than CREW_ROUTES' `open`, so it wins in the merged table. */
  "open:vote": auto(entryRoute),
  "vt:start": auto(entryRoute),
  "vt:ok": update(startRoute),
  "vt:cancel": update((i) => show(i, notice("Cancelled."))),
  vote: { scope: "shared", ack: "ephemeral", run: ballotRoute },
};
