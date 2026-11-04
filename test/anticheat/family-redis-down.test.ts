import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { redisService } from "../../src/services/redisService";
import { setNx, touchActivity } from "../../src/services/crimeFamily/activity";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { inviteMember, acceptInvite } from "../../src/services/crimeFamily/membershipService";
import { depositToVault } from "../../src/services/crimeFamily/vaultService";
import { executePayday } from "../../src/services/crimeFamily/paydayService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, testRedis, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

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
