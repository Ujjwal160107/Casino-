// The route helpers every `crew:` route table shares (CREW_ROUTES, VOTE_ROUTES
// and the recruitment routes). A leaf: it imports no route table, so a table
// module can be loaded first without reading another table half-initialised.
import { FamilyError } from "../services/crimeFamily/tx";
import { buildNotice, type CfPayload } from "../ui/crimeFamily/kit";
import { CRIME_FAMILY_CONFIG } from "../utils/economyConfig";
import { safeEditReply } from "../utils/interactionHelpers";
import type { CfInteraction, CfRoute, CfRouteEntry } from "./crimeFamilyRouter";

const NOT_OPEN = "Crime Families are not open yet.";

export const show = async (i: CfInteraction, payload: CfPayload) => { await safeEditReply(i, payload); };

/** Shows the result, then runs its announcer (which never throws) even if the edit failed: the action has committed. */
export const showThenAnnounce = async (i: CfInteraction, payload: CfPayload | Promise<CfPayload>, announce: () => Promise<unknown>) => {
  try {
    await show(i, await payload);
  } finally {
    await announce();
  }
};

export const notice = (text: string) => buildNotice(text);
export const owner = (args: string[]) => args[args.length - 1];

export const auto = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "auto", run });
export const update = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "update", run });

/** Presses that work from DMs check only the kill switch, never the guild (F1). */
export function assertEnabled(): void {
  if (!CRIME_FAMILY_CONFIG.enabled) throw new FamilyError(NOT_OPEN);
}
