import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { redisService } from "../../src/services/redisService";
import { setNx, touchActivity } from "../../src/services/crimeFamily/activity";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { inviteMember, acceptInvite } from "../../src/services/crimeFamily/membershipService";
import { depositToVault } from "../../src/services/crimeFamily/vaultService";
import { executePayday } from "../../src/services/crimeFamily/paydayService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";
import { planCaper, joinCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { parseAnswers } from "../../src/services/crimeFamily/intelRing";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { onSeatsChanged, resolveAndAnnounce, announceLobby } from "../../src/ui/crimeFamily/caperFlow";
import { caperCrew, fakeCaperClient, G, CH } from "../crimeFamily/caperFixtures";

// Redis never guards family money or membership (spec 14.3): an outage must
// not stop a single family write, and the activity throttle writes anyway.

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const member = (id: string) => testPrisma.familyMember.findUniqueOrThrow({ where: { userId: id } });
const redisDown = () => vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); });

const activeRule = { key: "test", label: "test seats", need: 1, count: async () => 1 };

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);
afterEach(() => vi.restoreAllMocks());

describe("activity throttle (14.3 cf:active)", () => {
  it("setNx reports set, then held, while Redis is up", async () => {
    const key = "cf:test:setnx";
    await testRedis().del(key);
    expect(await setNx(key, 60)).toBe("set");
    expect(await setNx(key, 60)).toBe("held");
  });

  it("a second touch within the hour leaves lastActiveAt unchanged", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    await testRedis().del(`cf:active:${boss}`);
    const first = new Date("2026-11-04T10:00:00Z");
    await touchActivity(boss, first);
    expect(+(await member(boss)).lastActiveAt).toBe(+first);
    await touchActivity(boss, new Date("2026-11-04T10:30:00Z"));
    expect(+(await member(boss)).lastActiveAt).toBe(+first);
  });
});

describe("with Redis down", () => {
  it("setNx returns error and touchActivity still writes lastActiveAt", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    redisDown();
    expect(await setNx("cf:test:down", 60)).toBe("error");
    const now = new Date("2026-11-04T12:00:00Z");
    await expect(touchActivity(boss, now)).resolves.toBeUndefined();
    expect(+(await member(boss)).lastActiveAt).toBe(+now);
  });

  it("createFamily, invite/accept and depositToVault succeed with correct balances", async () => {
    const boss = await seedEligibleUser({ wallet: 15_000_000 });
    const joinerId = await seedEligibleUser({ wallet: 2_000_000 });
    redisDown();
    const family = await createFamily({ uid: boss, username: "b", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" });
    expect(await wallet(boss)).toBe(5_000_000);

    const inv = await inviteMember({ inviterId: boss, inviteeId: joinerId, guildId: "g1", channelId: "c1" });
    expect((await acceptInvite(inv.id, joinerId)).member).toMatchObject({ familyId: family.id, role: "SOLDIER" });

    expect(await depositToVault(joinerId, 1_000_000)).toMatchObject({ tax: 50_000, net: 950_000 });
    expect(await wallet(joinerId)).toBe(1_000_000);
    expect(await testPrisma.family.findUnique({ where: { id: family.id } })).toMatchObject({ treasury: 950_000 });
  });

  it("executePayday pays every eligible member", async () => {
    ACTIVITY_RULES.push(activeRule);
    try {
      const boss = await seedEligibleUser();
      const soldiers = [await seedEligibleUser(), await seedEligibleUser()];
      const family = await seedFamily({
        bossId: boss, earnings: 3_000_000, lastPaydayAt: daysAgo(8),
        members: soldiers.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
      });
      redisDown();
      expect(await executePayday(family.id, boss, { earnings: 3_000_000, count: 3 })).toMatchObject({ status: "paid" });
      for (const id of [boss, ...soldiers]) expect(await wallet(id)).toBe(950_000);
    } finally {
      ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(activeRule), 1);
    }
  });
});

describe("capers with Redis down", () => {
  const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
  const bal = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
  const text = (payload: any) => JSON.stringify(payload.components.map((c: any) => c.toJSON()));
  let down: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => { await resetFamilies(); down = vi.spyOn(redisService, "getInstance").mockImplementation(() => { throw new Error("down"); }); });
  afterEach(() => down.mockRestore());

  it("plan → joins → auto-start → locks → settle pays exactly the stored outcome, and every state renders", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const mid = await postCaperCard(fc.client, c.id, CH);
    for (const r of ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const) {
      const j = await joinCaper({ caperId: c.id, uid: f.ids[r], role: r, guildId: G });
      await onSeatsChanged(fc.client, c.id, j.full);                     // un-debounced render, then the auto-start
    }
    const run = await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } });
    expect(run.status).toBe("RUNNING");
    const base = new Map(await Promise.all(Object.values(f.ids).map(async (id) => [id, await bal(id)] as const)));   // after every stake
    const earnings0 = (await testPrisma.family.findUniqueOrThrow({ where: { id: f.family.id } })).earnings;
    const answers = parseAnswers(run.answers)!;
    const t = new Date(+run.startedAt + 5_000);
    for (const r of T1) { await openBrief(c.id, f.ids[r], t); await lockChoice(c.id, f.ids[r], answers.seats[r]!.correct, t); }
    await resolveAndAnnounce(fc.client, c.id, new Date(+run.goEndsAt + 1_000), new Date(0));
    const done = await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } });
    expect(done.status).toBe("RESOLVED");
    const cut = done.outcome === "CLEAN" ? 280_000 : 98_000;             // T1 n=4 (8.6)
    for (const id of Object.values(f.ids)) expect(await bal(id)).toBe(base.get(id)! + cut);
    expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.family.id } })).earnings).toBe(earnings0 + Math.floor((done.pool * 10) / 100));
    const cards = fc.edits.filter((e) => e.messageId === mid).map((e) => e.payload);
    expect(cards.some((p) => text(p).includes(`cpr:join:${c.id}`))).toBe(true);                                   // LOBBY
    expect(cards.some((p) => text(p).includes(`cpr:brief:${c.id}`))).toBe(true);                                  // GO (S13)
    expect(cards.some((p) => (p.files ?? []).some((x: any) => x.name.startsWith("cf_result_")))).toBe(true);      // result (S15)
  });

  it("announceLobby still DMs a qualified member (the lobby-DM cap fails open)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    expect(await announceLobby(fc.client, c.id)).toEqual(expect.arrayContaining([f.ids.LOOKOUT, f.ids.SAFECRACKER, f.ids.DRIVER]));
    expect(fc.dms.get(f.ids.LOOKOUT)).toBe(1);
  });
});
