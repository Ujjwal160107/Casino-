import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import {
  DM_NOTICE_TYPES,
  MAX_DM_FAILS,
  getDmPrefs,
  isCooldownReminderType,
  isDmNoticeType,
  isNoticeEnabled,
  noticeTypesInGroup,
  recordDmDelivered,
  recordDmFailed,
  setMasterEnabled,
  setNoticeTypeEnabled,
} from "../../src/services/dmPrefsService";

describe("DM_NOTICE_TYPES registry", () => {
  it("splits cooldown types (with a command) from account types (without)", () => {
    expect(noticeTypesInGroup("cooldown")).toEqual(["daily", "weekly", "monthly", "crime", "hunt", "work", "vote"]);
    expect(noticeTypesInGroup("account")).toEqual(["card", "market", "investment"]);
    for (const t of noticeTypesInGroup("cooldown")) expect(isCooldownReminderType(t)).toBe(true);
    for (const t of noticeTypesInGroup("account")) expect(isCooldownReminderType(t)).toBe(false);
  });

  it("recognises only registered keys", () => {
    expect(isDmNoticeType("card")).toBe(true);
    expect(isDmNoticeType("bogus")).toBe(false);
    expect(isCooldownReminderType("card")).toBe(false);
    expect(DM_NOTICE_TYPES.card.label).toBe("Card statements");
    expect(DM_NOTICE_TYPES.market.label).toBe("Market sales");
  });
});

describe("DM prefs", () => {
  const id = "dm-prefs-1";
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it("defaults to everything on", async () => {
    const prefs = await getDmPrefs(id);
    expect(prefs.remindersEnabled).toBe(true);
    expect(isNoticeEnabled(prefs, "card")).toBe(true);
  });

  it("toggling one type leaves the others alone", async () => {
    await setNoticeTypeEnabled(id, "card", false);
    const prefs = await getDmPrefs(id);
    expect(isNoticeEnabled(prefs, "card")).toBe(false);
    expect(isNoticeEnabled(prefs, "market")).toBe(true);
    await setNoticeTypeEnabled(id, "card", true);
    expect(isNoticeEnabled(await getDmPrefs(id), "card")).toBe(true);
  });

  it("master off disables every type; master on clears the strike count", async () => {
    await testPrisma.user.update({ where: { discordId: id }, data: { reminderDmFailCount: 2 } });
    await setMasterEnabled(id, false);
    expect(isNoticeEnabled(await getDmPrefs(id), "daily")).toBe(false);
    await setMasterEnabled(id, true);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.remindersEnabled).toBe(true);
    expect(user?.reminderDmFailCount).toBe(0);
  });

  it("three failures in a row pause the master and reset the count", async () => {
    for (let i = 1; i < MAX_DM_FAILS; i++) {
      expect(await recordDmFailed(id)).toEqual({ paused: false });
    }
    expect(await recordDmFailed(id)).toEqual({ paused: true });
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.remindersEnabled).toBe(false);
    expect(user?.reminderDmFailCount).toBe(0);
  });

  it("a delivered DM resets the strike count", async () => {
    await recordDmFailed(id);
    await recordDmDelivered(id);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.reminderDmFailCount).toBe(0);
  });
});
