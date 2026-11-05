// The turf jobs (spec 15): tickWars every minute walks each war one step
// through its state machine and redraws the live boards; tickRackets at :05
// collects each owned racket's due cycles. Orchestration only: every write is
// a CAS in the service it calls, so a doubled or missed tick is harmless.
// `enabled && turfEnabled` gate only new turf (T1): wars already ARMED or
// later always run to the end.
import type { Client } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import {
  announceRacketCollect, announceWarResult, announceWarSoon, syncWarBoards,
} from "../../ui/crimeFamily/turfAnnounce";
import { collectRacket, racketEligibleMembers } from "./racketService";
import {
  activateWar, beginSettle, claimWarnSoon, closeBidding, openWarPeriods, recordWarTick, settleWar,
} from "./warService";

type WarWhere = NonNullable<Parameters<typeof prisma.war.findMany>[0]>["where"];

const turfOn = () => CRIME_FAMILY_CONFIG.enabled && CRIME_FAMILY_CONFIG.turfEnabled;

const warIds = async (where: WarWhere): Promise<string[]> =>
  (await prisma.war.findMany({ where, select: { id: true } })).map((w) => w.id);

/** Runs fn per war; one war's failure is logged and the tick moves on. */
async function eachWar(ids: string[], fn: (id: string) => Promise<unknown>): Promise<void> {
  for (const id of ids) {
    try {
      await fn(id);
    } catch (err) {
      console.error(`[crimeFamily] tickWars ${id} error`, err);
    }
  }
}

async function settleAndAnnounce(client: Client, warId: string, now: Date): Promise<void> {
  const settlement = await settleWar(warId, now);
  if (settlement) await announceWarResult(client, settlement, now);
}

/**
 * Spec 15 steps 1–7 in order. Each step reads its own list after the step
 * before it ran, so one tick can carry a war through several states after
 * downtime. A war this tick activated was just drawn with `force`, so step 5
 * only records its tick. A war whose step-5 tick failed is not settled this
 * tick: its downtime gap is unrecorded, and settling now would resolve a war
 * that should cancel (T2). It stays ACTIVE and the next tick records it.
 */
export async function tickWars(client: Client, now: Date): Promise<void> {
  const allowNew = turfOn();
  if (allowNew) {
    try {
      await openWarPeriods(now);
    } catch (err) {
      console.error("[crimeFamily] tickWars openWarPeriods error", err);
    }
  }

  await eachWar(await warIds({ status: "BIDDING", bidClosesAt: { lte: now } }), (id) => closeBidding(id, now, allowNew));

  const soonUntil = new Date(now.getTime() + CRIME_FAMILY_CONFIG.warSoonSeconds * 1000);
  await eachWar(await warIds({ status: "ARMED", startsAt: { gt: now, lte: soonUntil } }), async (id) => {
    if (await claimWarnSoon(id)) await announceWarSoon(client, id, now);
  });

  const drawn = new Set<string>();
  await eachWar(await warIds({ status: "ARMED", startsAt: { lte: now } }), async (id) => {
    if ((await activateWar(id, now)) !== "ACTIVE") return;
    drawn.add(id);
    await syncWarBoards(client, id, now, { force: true });
  });

  const untracked = new Set<string>();
  await eachWar(await warIds({ status: "ACTIVE" }), async (id) => {
    try {
      await recordWarTick(id, now);
    } catch (err) {
      untracked.add(id);
      throw err;
    }
    const war = await prisma.war.findUnique({ where: { id }, select: { endsAt: true } });
    if (war && war.endsAt > now && !drawn.has(id)) await syncWarBoards(client, id, now);
  });

  const ended = (await warIds({ status: "ACTIVE", endsAt: { lte: now } })).filter((id) => !untracked.has(id));
  await eachWar(ended, async (id) => {
    if (await beginSettle(id, now)) await settleAndAnnounce(client, id, now);
  });

  await eachWar(await warIds({ status: "SETTLING" }), (id) => settleAndAnnounce(client, id, now));
}

/** Hourly at :05: each owned racket's due cycles, with the owner's members counted once per family (9.3). */
export async function tickRackets(client: Client, now: Date): Promise<void> {
  if (!turfOn()) return;
  const rackets = await prisma.racket.findMany({ where: { ownerFamilyId: { not: "" } }, select: { id: true, ownerFamilyId: true } });
  const membersOf = new Map<string, Awaited<ReturnType<typeof racketEligibleMembers>>>();
  for (const r of rackets) {
    try {
      let members = membersOf.get(r.ownerFamilyId);
      if (!members) {
        members = await racketEligibleMembers(r.ownerFamilyId, now);
        membersOf.set(r.ownerFamilyId, members);
      }
      const out = await collectRacket(r.id, now, members.eligible.length);
      await announceRacketCollect(client, out, members);
    } catch (err) {
      console.error(`[crimeFamily] tickRackets ${r.id} error`, err);
    }
  }
}
