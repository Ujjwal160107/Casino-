// The one entry for `crew:`, `cpr:` and `turf:` presses (P7). It owns what
// every route shares: the owner check, the ack (before any DB or Redis call),
// error mapping and the activity touch. Plans 2 and 3 add route entries to
// CAPER_ROUTES / TURF_ROUTES; they never add their own checks.
import {
  MessageFlags,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { touchActivity } from "../services/crimeFamily/activity";
import { FamilyError } from "../services/crimeFamily/tx";
import { InsufficientFundsError } from "../services/walletService";
import { parseCfId, type CfPrefix } from "../ui/crimeFamily/ids";
import { rejectPress, safeDeferReply, safeDeferUpdate } from "../utils/interactionHelpers";
import { CAPER_ROUTES } from "./caperInteractionHandler";
import { CREW_ROUTES } from "./crewInteractionHandler";
import { RECRUIT_ROUTES } from "./crewRecruitRoutes";
import { VOTE_ROUTES } from "./crewVoteRoutes";
import { TURF_ROUTES } from "./turfInteractionHandler";

export type CfInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
export type CfRoute = (i: CfInteraction, args: string[]) => Promise<void>;

/**
 * scope "owner": the router refuses unless args.at(-1) === i.user.id; "modalOpener" is the same id check, then the
 * route's first await is showModal; "shared": no id check (the route authorises against DB rows).
 * ack "update": deferUpdate; "ephemeral": deferReply ephemeral; "modal": nothing (showModal is the ack);
 * "auto": deferUpdate when the pressed message is ephemeral, else deferReply ephemeral.
 */
export interface CfRouteEntry {
  scope: "owner" | "shared" | "modalOpener";
  ack: "update" | "ephemeral" | "modal" | "auto";
  run: CfRoute;
}

/** key = "<action>" or "<action>:<first arg>" (most specific wins). */
export type CfRouteTable = Readonly<Record<string, CfRouteEntry>>;

/** The router imports every table; no table imports the router's values or another table. */
const TABLES: Readonly<Record<CfPrefix, CfRouteTable>> = { crew: { ...CREW_ROUTES, ...VOTE_ROUTES, ...RECRUIT_ROUTES }, cpr: CAPER_ROUTES, turf: TURF_ROUTES };

const NO_ROUTE = "This button is no longer active.";

function fromEphemeral(i: CfInteraction): boolean {
  return !i.isModalSubmit() && !!i.message?.flags?.has(MessageFlags.Ephemeral);
}

/** Acknowledges per the entry; false when the interaction expired first. */
async function acknowledge(i: CfInteraction, ack: CfRouteEntry["ack"]): Promise<boolean> {
  const ephemeral = { flags: MessageFlags.Ephemeral } as const;
  if (ack === "modal") return true;
  if (ack === "ephemeral" || i.isModalSubmit()) return safeDeferReply(i, ephemeral);
  if (ack === "update" || fromEphemeral(i)) return safeDeferUpdate(i);
  return safeDeferReply(i, ephemeral);
}

/** The table's own entry for a key; never an Object.prototype member ("constructor", "__proto__") from a forged customId. */
function routeOf(table: CfRouteTable, key: string): CfRouteEntry | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export async function handleCrimeFamilyInteraction(i: CfInteraction): Promise<void> {
  const parsed = parseCfId(i.customId);
  if (!parsed) return;
  const table = TABLES[parsed.prefix];
  const entry = routeOf(table, `${parsed.action}:${parsed.args[0]}`) ?? routeOf(table, parsed.action);
  if (!entry) return rejectPress(i, NO_ROUTE);
  if (entry.scope !== "shared" && parsed.args[parsed.args.length - 1] !== i.user.id) return rejectPress(i, "This panel is not yours.");

  try {
    if (!(await acknowledge(i, entry.ack))) return;
    await entry.run(i, parsed.args);
  } catch (err) {
    if (err instanceof FamilyError || err instanceof InsufficientFundsError) {
      await rejectPress(i, err.message);
    } else {
      console.error(`[crimeFamily] ${i.customId} failed:`, err);
      await rejectPress(i, "Something went wrong.");
    }
  } finally {
    void touchActivity(i.user.id);
  }
}
