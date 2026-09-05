import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { cooldownNotice, notifyCooldownsLifted, sendOptOutDm } from "../../src/services/dmNoticeService";
import { setNoticeTypeEnabled } from "../../src/services/dmPrefsService";
import { processDueReminders } from "../../src/services/cooldownReminderService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

describe("cooldownNotice", () => {
  it("single type: cooldown thumbnail, label, command, settings hint", () => {
    const c = cooldownNotice(["daily"]);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Cooldown));
    const t = containerText(c);
    expect(t).toContain("## Cooldown lifted!");
    expect(t).toContain("Your **daily reward** is ready. Use `!daily`.");
    expect(t).toContain("-# Manage these DMs with `!settings` in any server with Fortuna.");
  });

  it("several types become a bullet list", () => {
    const t = containerText(cooldownNotice(["daily", "work"]));
    expect(t).toContain("## Cooldowns lifted!");
    expect(t).toContain("• **Daily reward** — `!daily`");
    expect(t).toContain("• **Work shift** — `!work`");
  });
});

describe("sendOptOutDm", () => {
  const id = "dm-send-1";
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it("sends when enabled and clears the strike count", async () => {
    await testPrisma.user.update({ where: { discordId: id }, data: { reminderDmFailCount: 2 } });
    const { client, sent } = fakeDmClient();
    await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBe(1);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.reminderDmFailCount).toBe(0);
  });

  it("sends nothing when that type is off", async () => {
    await setNoticeTypeEnabled(id, "daily", false);
    const { client, sent } = fakeDmClient();
    await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBeUndefined();
  });

  it("sends nothing when the master is off", async () => {
    await seedUser(id, { remindersEnabled: false });
    const { client, sent } = fakeDmClient();
    await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBeUndefined();
  });

  it("three closed-DM failures in a row pause the master", async () => {
    const { client, sent } = fakeDmClient([id]);
    for (let i = 0; i < 3; i++) await sendOptOutDm(client, id, "daily", cooldownNotice(["daily"]));
    expect(sent.get(id)).toBeUndefined();
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.remindersEnabled).toBe(false);
    expect(user?.reminderDmFailCount).toBe(0);
  });
});

describe("processDueReminders", () => {
  const id = "dm-drain-1";
  const past = () => new Date(Date.now() - 60_000);
  beforeEach(async () => {
    await seedUser(id);
    await testPrisma.cooldownReminder.deleteMany({ where: { discordId: id } });
  });
  afterAll(async () => {
    await testPrisma.cooldownReminder.deleteMany({ where: { discordId: id } });
    await resetUser(id);
  });

  it("DMs one combined notice and removes the rows", async () => {
    await testPrisma.cooldownReminder.createMany({
      data: [
        { discordId: id, type: "daily", dueAt: past() },
        { discordId: id, type: "work", dueAt: past() },
      ],
    });
    const { client, sent } = fakeDmClient();
    await processDueReminders(client);
    expect(sent.get(id)).toBe(1);
    expect(await testPrisma.cooldownReminder.count({ where: { discordId: id } })).toBe(0);
  });

  it("skips a type the player switched off", async () => {
    await setNoticeTypeEnabled(id, "daily", false);
    await testPrisma.cooldownReminder.create({ data: { discordId: id, type: "daily", dueAt: past() } });
    const { client, sent } = fakeDmClient();
    await processDueReminders(client);
    expect(sent.get(id)).toBeUndefined();
  });

  it("notifyCooldownsLifted counts a closed DM against the strike count", async () => {
    const { client } = fakeDmClient([id]);
    await notifyCooldownsLifted(client, id, ["daily"]);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.reminderDmFailCount).toBe(1);
  });
});
