// Every caper wallet write drops the getUser cache of each wallet it touched,
// after the commit, so no reader shows a pre-stake or pre-refund balance.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { planCaper, joinCaper, leaveCaper, cancelCaper, startCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { resolveCaper } from "../../src/services/crimeFamily/caperSettleService";
import { kickMember } from "../../src/services/crimeFamily/membershipService";
import { testPrisma, testRedis, resetFamilies, ensureUniqueIndexes, flushTestKeys } from "../helpers";
import { caperCrew, seedLobby, seedRunning, G, CH } from "./caperFixtures";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const cache = (ids: readonly string[]) => Promise.all(ids.map((id) => testRedis().set(`user:${id}`, "{}", "EX", 300)));
const cached = (ids: readonly string[]) => Promise.all(ids.map(async (id) => (await testRedis().exists(`user:${id}`)) === 1));
const none = (ids: readonly string[]) => ids.map(() => false);

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("user:*"); });

describe("caper wallet writes drop the user cache", () => {
  it("plan and join: the payer's stake", async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...T1] });
    await cache([ids.MASTERMIND, ids.LOOKOUT, ids.DRIVER]);
    const c = await planCaper({ uid: ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    expect(await cached([ids.MASTERMIND, ids.LOOKOUT])).toEqual([false, true]);
    await joinCaper({ caperId: c.id, uid: ids.LOOKOUT, role: "LOOKOUT", guildId: G });
    expect(await cached([ids.LOOKOUT, ids.DRIVER])).toEqual([false, true]);
  });

  it("leave refunds the leaver; the planner leaving refunds everyone", async () => {
    const { caper, ids } = await seedLobby({ tier: 1, roles: [...R3] });
    await cache(Object.values(ids));
    await leaveCaper(caper.id, ids.LOOKOUT);
    expect(await cached([ids.LOOKOUT, ids.SAFECRACKER])).toEqual([false, true]);
    await leaveCaper(caper.id, ids.MASTERMIND);
    expect(await cached(Object.values(ids))).toEqual(none(Object.values(ids)));
  });

  it("cancel refunds every seat", async () => {
    const { caper, ids } = await seedLobby({ tier: 1, roles: [...R3] });
    await cache(Object.values(ids));
    await cancelCaper(caper.id, ids.MASTERMIND);
    expect(await cached(Object.values(ids))).toEqual(none(Object.values(ids)));
  });

  it("Start refunds a pinched seat; a pinched planner refunds everyone", async () => {
    const jail = (id: string) => testPrisma.user.update({ where: { discordId: id }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    const a = await seedLobby({ tier: 1, roles: [...T1] });
    await cache(Object.values(a.ids));
    await jail(a.ids.DRIVER);
    expect(await startCaper(a.caper.id, { kind: "auto" })).toMatchObject({ status: "started" });
    expect(await cached([a.ids.DRIVER, a.ids.LOOKOUT])).toEqual([false, true]);

    await resetFamilies();
    const b = await seedLobby({ tier: 1, roles: [...R3] });
    await cache(Object.values(b.ids));
    await jail(b.ids.MASTERMIND);
    expect(await startCaper(b.caper.id, { kind: "auto" })).toMatchObject({ status: "cancelled" });
    expect(await cached(Object.values(b.ids))).toEqual(none(Object.values(b.ids)));
  });

  it("a voided run refunds every seat", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { answers: {} } });   // corrupt (edge 63)
    await cache(Object.values(ids));
    expect(await resolveCaper(caper.id, new Date(), new Date(0))).toMatchObject({ status: "void" });
    expect(await cached(Object.values(ids))).toEqual(none(Object.values(ids)));
  });

  it("a kick refunds the kicked seat; kicking the planner refunds everyone", async () => {
    const a = await seedLobby({ tier: 1, roles: [...R3] });
    await cache(Object.values(a.ids));
    await kickMember(a.bossId, a.ids.LOOKOUT);
    expect(await cached([a.ids.LOOKOUT, a.ids.SAFECRACKER])).toEqual([false, true]);

    await resetFamilies();
    const b = await seedLobby({ tier: 1, roles: [...R3], plannerRank: "CAPO" });
    await cache(Object.values(b.ids));
    await kickMember(b.bossId, b.ids.MASTERMIND);
    expect(await cached(Object.values(b.ids))).toEqual(none(Object.values(b.ids)));
  });
});
