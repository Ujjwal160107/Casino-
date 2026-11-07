// test/crimeFamily/caper-play.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { openBrief, lockChoice, shareIntel } from "../../src/services/crimeFamily/caperPlayService";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
import { buildCaperCardView } from "../../src/services/crimeFamily/caperQueries";
import { seedRunning, seedLobby } from "./caperFixtures";

const R = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const row = (caperId: string, userId: string) => testPrisma.caperCrew.findFirst({ where: { caperId, userId } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("brief and lock (8.4 step 6)", () => {
  it("opening the brief stamps briefOpenedAt once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], dark: ["LOOKOUT"] });
    const t1 = new Date(+caper.startedAt + 5_000); const t2 = new Date(+t1 + 5_000);
    await openBrief(caper.id, ids.LOOKOUT, t1); await openBrief(caper.id, ids.LOOKOUT, t2);
    expect(await row(caper.id, ids.LOOKOUT)).toMatchObject({ briefOpened: true, briefOpenedAt: t1 });
  });

  it("refuses before GO, after GO, on a resolved caper and for a stranger (Review Focus 3)", async () => {
    const lobby = await seedLobby({ tier: 1, roles: [...R] });
    await expect(openBrief(lobby.caper.id, lobby.ids.LOOKOUT)).rejects.toThrow("The brief opens at GO.");
    await resetFamilies();
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R] });
    await expect(openBrief(caper.id, ids.LOOKOUT, caper.goEndsAt)).rejects.toThrow("Too late.");
    await expect(openBrief(caper.id, "999999999999999999")).rejects.toThrow("You are not in this crew heist.");
    await testPrisma.caper.update({ where: { id: caper.id }, data: { status: "RESOLVED", liveSlot: caper.id } });
    await expect(openBrief(caper.id, ids.LOOKOUT, caper.startedAt)).rejects.toThrow("Too late.");
    await expect(lockChoice(caper.id, ids.LOOKOUT, 0, caper.startedAt)).rejects.toThrow("Too late.");
  });

  it("locks one choice per member; a concurrent double press writes once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], picks: { LOOKOUT: "none" } });
    const now = new Date(+caper.startedAt + 10_000);
    const rs = await Promise.allSettled([lockChoice(caper.id, ids.LOOKOUT, 1, now), lockChoice(caper.id, ids.LOOKOUT, 2, now)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of rs) if (r.status === "rejected") expect(r.reason.message).toMatch(/^(Locked in already\.|Vault busy, try again\.)$/);
    expect([1, 2]).toContain((await row(caper.id, ids.LOOKOUT))!.choice);
    await expect(lockChoice(caper.id, ids.LOOKOUT, 3, now)).rejects.toThrow("Locked in already.");
    await expect(lockChoice(caper.id, ids.LOOKOUT, 4, now)).rejects.toThrow("Pick one of the four options.");
  });

  it("reports allLocked on the last lock", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], picks: { LOOKOUT: "none", SAFECRACKER: "none" } });
    const now = new Date(+caper.startedAt + 10_000);
    expect((await lockChoice(caper.id, ids.LOOKOUT, 0, now)).allLocked).toBe(false);
    expect((await lockChoice(caper.id, ids.SAFECRACKER, 0, now)).allLocked).toBe(true);
  });

  it("a dark seat cannot lock; a seat whose holder went dark locks with leaked = true", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], dark: ["LOOKOUT"], picks: { LOOKOUT: "none", MASTERMIND: "none" } });
    const leakAt = new Date(+caper.goEndsAt - 30_000);
    await openBrief(caper.id, ids.LOOKOUT, leakAt);                                  // opened at leakAt: dark
    await expect(lockChoice(caper.id, ids.LOOKOUT, 0, leakAt)).rejects.toThrow("You went dark: this seat counts as a miss.");
    await lockChoice(caper.id, ids.MASTERMIND, 0, leakAt);                           // Mastermind's holder (next) is the Lookout
    expect(await row(caper.id, ids.MASTERMIND)).toMatchObject({ choice: 0, leaked: true });
  });
});

describe("the relayed mark (amendment 5.3, G8)", () => {
  it("a lock after the holder shared is marked relayed; the card view carries it; a lock without a share is not (G8)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], picks: { MASTERMIND: "none", LOOKOUT: "none" }, shared: ["LOOKOUT"] });
    const now = new Date();
    await lockChoice(caper.id, ids.MASTERMIND, 0, now);                      // the Mastermind's holder is the Lookout
    await lockChoice(caper.id, ids.LOOKOUT, 0, now);                         // the Lookout's holder (Safecracker) did not share
    const rows = await testPrisma.caperCrew.findMany({ where: { caperId: caper.id } });
    expect(Object.fromEntries(rows.map((r) => [r.role, r.relayed]))).toEqual({ MASTERMIND: true, LOOKOUT: false, SAFECRACKER: false });
    expect((await buildCaperCardView(caper.id, now))!.seats.find((s) => s.role === "MASTERMIND")!.relayed).toBe(true);
  });
});

describe("share (amendment 5.3)", () => {
  it("records one share and returns the nudge for the seat it answers", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], picks: { MASTERMIND: "none" } });
    const now = new Date();
    const { brief, nudge } = await shareIntel(caper.id, ids.LOOKOUT, now);           // the Lookout holds the Mastermind's answer
    expect(brief).toMatchObject({ shared: true, canShare: false });
    expect(nudge).toEqual({ userId: ids.MASTERMIND, tierName: "Pawnshop Back Room", goEndsAt: caper.goEndsAt });
    expect(await testPrisma.caperCrew.findFirst({ where: { caperId: caper.id, userId: ids.LOOKOUT } })).toMatchObject({ sharedIntel: true, sharedAt: now });
    expect((await openBrief(caper.id, ids.MASTERMIND, now)).relayed).not.toBeNull();
  });

  it("refuses from the wrong state and writes nothing (Review Focus 3)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R], dark: ["SAFECRACKER"] });
    const now = new Date();
    const leakAt = new Date(+caper.goEndsAt - 30_000);
    await expect(shareIntel(caper.id, ids.SAFECRACKER, now)).rejects.toThrow("Open your brief first.");
    await expect(shareIntel(caper.id, ids.SAFECRACKER, leakAt)).rejects.toThrow("You went dark: this seat counts as a miss.");
    await expect(shareIntel(caper.id, "not-in-crew", now)).rejects.toThrow("You are not in this crew heist.");
    await expect(shareIntel(caper.id, ids.LOOKOUT, caper.goEndsAt)).rejects.toThrow("Too late.");
    await shareIntel(caper.id, ids.LOOKOUT, now);
    await expect(shareIntel(caper.id, ids.LOOKOUT, now)).rejects.toThrow("Already shared.");
    expect(await testPrisma.caperCrew.count({ where: { caperId: caper.id, sharedIntel: true } })).toBe(1);
    await testPrisma.caper.update({ where: { id: caper.id }, data: { status: "SETTLING" } });
    await expect(shareIntel(caper.id, ids.MASTERMIND, now)).rejects.toThrow("Too late.");
  });

  it("skips the nudge when the recipient already locked or went dark (G7), but still records the share", async () => {
    const locked = await seedRunning({ tier: 1, roles: [...R] });                     // every seat locked
    expect((await shareIntel(locked.caper.id, locked.ids.LOOKOUT, new Date())).nudge).toBeNull();
    const dark = await seedRunning({ tier: 1, roles: [...R], picks: { MASTERMIND: "none" }, dark: ["MASTERMIND"] });
    const leakAt = new Date(+dark.caper.goEndsAt - 30_000);
    expect((await shareIntel(dark.caper.id, dark.ids.LOOKOUT, leakAt)).nudge).toBeNull();
    expect(await testPrisma.caperCrew.count({ where: { sharedIntel: true, caperId: { in: [locked.caper.id, dark.caper.id] } } })).toBe(2);
  });
});
