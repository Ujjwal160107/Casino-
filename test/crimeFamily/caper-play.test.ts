// test/crimeFamily/caper-play.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
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
