import { describe, it, expect, beforeEach } from "vitest";
import { routeMessage } from "../../src/commandRouter";
import { fakeMessage, replyText } from "./fakeMessage";
import { seedEligibleUser, seedFamily, resetFamilies, withCfConfig } from "../helpers";

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
});
