// The minute caper sweeper (spec 15): closes lobbies past lobbyClosesAt,
// resolves runs past goEndsAt, resumes SETTLING capers and heals the cards.
// It ignores CRIME_FAMILY_CONFIG.enabled so a live caper finishes under the
// kill switch (edge 58). Every write is a CAS in the service it calls, so a
// doubled or missed minute is harmless.
import type { Client } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { renderCaperCard } from "../../ui/crimeFamily/caperCard";
import { resolveAndAnnounce, runCancel, runStart } from "../../ui/crimeFamily/caperFlow";
import type { CfJob } from "./scheduler";

type Where = NonNullable<Parameters<typeof prisma.caper.findMany>[0]>["where"];

const idsWhere = async (where: Where): Promise<string[]> =>
  (await prisma.caper.findMany({ where, select: { id: true } })).map((c) => c.id);

/** Runs fn per caper; one caper's failure is logged and the sweep moves on. */
async function eachCaper(ids: string[], fn: (id: string) => Promise<unknown>): Promise<void> {
  for (const id of ids) {
    try {
      await fn(id);
    } catch (err) {
      console.error(`[crimeFamily] sweepCapers ${id} error`, err);
    }
  }
}

/** A closed lobby starts; one that cannot (pinched, missing roles) is cancelled with refunds and the D42 cooldown. */
async function closeLobby(client: Client, caperId: string, now: Date): Promise<void> {
  const result = await runStart(client, caperId, { kind: "sweeper" }, now);
  if (result.status === "pinched" || result.status === "waiting") await runCancel(client, caperId, null, now);
}

/**
 * Spec 15 (a)-(c) and (e), in that order. The card lists for (e) are read
 * before (a)-(c) run, so a caper this sweep starts or resolves is drawn once,
 * by the flow step that moved it.
 */
export async function sweepCapers(client: Client, now: Date, bootedAt?: Date): Promise<void> {
  const endedSince = new Date(now.getTime() - CRIME_FAMILY_CONFIG.caperEndedRerenderSeconds * 1000);
  const [dueLobbies, dueRuns, settling, openLobbies, ended] = await Promise.all([
    idsWhere({ status: "LOBBY", lobbyClosesAt: { lte: now } }),
    idsWhere({ status: "RUNNING", goEndsAt: { lte: now } }),
    idsWhere({ status: "SETTLING" }),
    idsWhere({ status: "LOBBY", lobbyClosesAt: { gt: now } }),
    idsWhere({ status: { in: ["RESOLVED", "CANCELLED"] }, updatedAt: { gte: endedSince } }),
  ]);
  await eachCaper(dueLobbies, (id) => closeLobby(client, id, now));
  await eachCaper([...dueRuns, ...settling], (id) => resolveAndAnnounce(client, id, now, bootedAt));
  await eachCaper([...openLobbies, ...ended], (id) => renderCaperCard(client, id, { now }));
}

export const SWEEP_CAPERS_JOB: CfJob = { name: "sweepCapers", run: (client, now) => sweepCapers(client, now) };
