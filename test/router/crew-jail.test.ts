import { describe, it, expect, beforeEach } from "vitest";
import { routeMessage } from "../../src/commandRouter";
import { fakeMessage, replyText } from "./fakeMessage";
import { seedEligibleUser, seedFamily, resetFamilies, withCfConfig, testPrisma } from "../helpers";
import { seedRunning, seedLobby } from "../crimeFamily/caperFixtures";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";

beforeEach(resetFamilies);

describe("!crew routing", () => {
  it("a jailed member can view the dashboard but not deposit", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const boss = await seedEligibleUser({ wallet: 1_000_000, jailedUntil: new Date(Date.now() + 3600_000) });
      await seedFamily({ bossId: boss, tag: "VLA" });
      const view = fakeMessage("!crew", { authorId: boss, guildId: "g1" });
      await routeMessage({} as any, view.message, "!");
      expect(replyText(view.reply.mock.calls[0][0])).toContain("[VLA]");
      const dep = fakeMessage("!crew deposit 100k", { authorId: boss, guildId: "g1" });
      await routeMessage({} as any, dep.message, "!");
      expect(replyText(dep.reply.mock.calls[0][0])).toMatch(/jail/i);
    });
  });
  it("!mob is !crew; !family is still marriage and points to !crew", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, tag: "MOB" });
      const mob = fakeMessage("!mob", { authorId: boss, guildId: "g1" });
      await routeMessage({} as any, mob.message, "!");
      expect(replyText(mob.reply.mock.calls[0][0])).toContain("[MOB]");
    });
    const single = fakeMessage("!family", { authorId: await seedEligibleUser(), guildId: "g1" });
    await routeMessage({} as any, single.message, "!");
    const t = replyText(single.reply.mock.calls[0][0]);
    expect(t).toContain("Not Married");
    expect(t).toContain("Crime families are `!crew`.");
  });
  it("refuses while disabled or in a guild outside allowGuildIds", async () => {
    const u = await seedEligibleUser();
    const off = fakeMessage("!crew", { authorId: u, guildId: "g1" });
    await routeMessage({} as any, off.message, "!");
    expect(replyText(off.reply.mock.calls[0][0])).toContain("Crime Families are not open in this server yet.");
    await withCfConfig({ enabled: true, allowGuildIds: ["g2"] }, async () => {
      const other = fakeMessage("!crew", { authorId: u, guildId: "g1" });
      await routeMessage({} as any, other.message, "!");
      expect(replyText(other.reply.mock.calls[0][0])).toContain("Crime Families are not open in this server yet.");
    });
  });
  it("a jailed member can open the caper brief but cannot join (13.1)", async () => {
    await withCfConfig({ enabled: true }, async () => {
      const run = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
      await testPrisma.user.update({ where: { discordId: run.ids.LOOKOUT }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
      const brief = fakeMessage("!caper brief", { authorId: run.ids.LOOKOUT, guildId: "g1" });
      await routeMessage({} as any, brief.message, "!");
      expect(replyText(brief.reply.mock.calls[0][0])).toContain(`cpr:open:brief:${run.caper.id}:${run.ids.LOOKOUT}`);
    });
    await resetFamilies();
    await withCfConfig({ enabled: true }, async () => {
      const lobby = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
      const extra = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["mechanic_toolkit"], jailedUntil: new Date(Date.now() + 3_600_000) });
      await testPrisma.familyMember.create({ data: { familyId: lobby.family.id, userId: extra, role: "SOLDIER", roleSlot: extra, seat: 9, joinedAt: new Date(Date.now() - 10 * 864e5) } });
      const join = fakeMessage("!caper join safecracker", { authorId: extra, guildId: "g1" });
      await routeMessage({} as any, join.message, "!");
      expect(replyText(join.reply.mock.calls[0][0])).toMatch(/jail/i);
      expect(await testPrisma.caperCrew.count({ where: { userId: extra } })).toBe(0);
    });
  });
  it("a jailed player can open the turf map with !turf and !rackets (13.1)", async () => {
    await withCfConfig({ enabled: true, turfEnabled: true }, async () => {
      const uid = await seedEligibleUser({ jailedUntil: new Date(Date.now() + 3600_000) });
      for (const text of ["!turf", "!rackets"]) {
        const m = fakeMessage(text, { authorId: uid, guildId: "g1" });
        await routeMessage({} as any, m.message, "!");
        expect(replyText(m.reply.mock.calls[0][0]), text).toContain(TURF_IDS.select(uid));
      }
    });
  });
});
