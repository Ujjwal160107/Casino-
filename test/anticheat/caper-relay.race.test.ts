// test/anticheat/caper-relay.race.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { shareIntel } from "../../src/services/crimeFamily/caperPlayService";
import { resolveCaper } from "../../src/services/crimeFamily/caperSettleService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { setNoticeTypeEnabled } from "../../src/services/dmPrefsService";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
import { fakeCaperClient, seedRunning, scriptedRng, txCount } from "../crimeFamily/caperFixtures";
import { fakeButton } from "../crimeFamily/fakeInteraction";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const row = (caperId: string, userId: string) => testPrisma.caperCrew.findFirstOrThrow({ where: { caperId, userId } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("the share CAS (A18)", () => {
  it("two concurrent shares from one seat record one share and one nudge", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    const now = new Date();
    const rs = await Promise.allSettled([shareIntel(caper.id, ids.LOOKOUT, now), shareIntel(caper.id, ids.LOOKOUT, now)]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rs.find((r) => r.status === "rejected")).toMatchObject({ reason: { message: "Already shared." } });
    expect(rs.filter((r) => r.status === "fulfilled" && r.value.nudge !== null)).toHaveLength(1);
  });

  it("a share racing the settle draw either lands before it or reads Too late; the take is paid once", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });            // every seat locked: due before goEndsAt
    const t = new Date(+caper.startedAt + 10_000);
    const [share] = await Promise.allSettled([shareIntel(caper.id, ids.LOOKOUT, t), resolveCaper(caper.id, t, scriptedRng([5_000]))]);
    const shared = (await row(caper.id, ids.LOOKOUT)).sharedIntel;
    expect(share.status === "fulfilled").toBe(shared);
    if (share.status === "rejected") expect(share.reason.message).toBe("Too late.");
    await resolveCaper(caper.id, t, scriptedRng([5_000]));                               // finish whatever the race left
    expect(await txCount("caper_cut", Object.values(ids))).toBe(3);
    await expect(shareIntel(caper.id, ids.SAFECRACKER, t)).rejects.toThrow("Too late.");
  });

  it("a share at or after goEndsAt is refused and writes nothing", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    await expect(shareIntel(caper.id, ids.LOOKOUT, caper.goEndsAt)).rejects.toThrow("Too late.");
    expect((await row(caper.id, ids.LOOKOUT)).sharedIntel).toBe(false);
  });
});

describe("the nudge DM (A18)", () => {
  it("two concurrent Share presses send one nudge; with the caper_lobby toggle off the share records and no DM goes", async () => {
    const a = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    const fc = fakeCaperClient();
    const press = (uid: string, caperId: string) => handleCrimeFamilyInteraction(fakeButton(CPR_IDS.share(caperId), { userId: uid, guildId: null, ephemeralSource: true, client: fc.client }) as any);
    await Promise.all([press(a.ids.LOOKOUT, a.caper.id), press(a.ids.LOOKOUT, a.caper.id)]);
    expect(fc.dms.get(a.ids.MASTERMIND)).toBe(1);
    const b = await seedRunning({ tier: 1, roles: [...R3], picks: { MASTERMIND: "none" } });
    await setNoticeTypeEnabled(b.ids.MASTERMIND, "caper_lobby", false);
    await press(b.ids.LOOKOUT, b.caper.id);
    expect(fc.dms.get(b.ids.MASTERMIND) ?? 0).toBe(0);
    expect((await row(b.caper.id, b.ids.LOOKOUT)).sharedIntel).toBe(true);
  });
});
