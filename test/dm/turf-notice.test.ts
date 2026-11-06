import { describe, it, expect } from "vitest";
import { ComponentType } from "discord.js";
import { DM_NOTICE_TYPES, isCooldownReminderType, noticeTypesInGroup } from "../../src/services/dmPrefsService";
import { turfOutbidNotice, turfNeglectNotice } from "../../src/services/dmNoticeService";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { containerText, containerThumb } from "./helpers";

const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);

describe("turf DM notices (13.4)", () => {
  it("turf is an account notice, with no command", () => {
    expect(DM_NOTICE_TYPES.turf).toEqual({ label: "Turf wars", group: "account" });
    expect(isCooldownReminderType("turf")).toBe(false);
    expect(noticeTypesInGroup("account").slice(-2)).toEqual(["turf", "recruit"]);
  });
  it("the settings panel is 31 components with DMs on and 32 off (13.4, amendment 8.10)", () => {
    expect(count(buildSettingsPayload("o", { remindersEnabled: true, disabledReminders: [] }).components[0].toJSON())).toBe(31);
    expect(count(buildSettingsPayload("o", { remindersEnabled: false, disabledReminders: [] }).components[0].toJSON())).toBe(32);
  });
  it("outbid and neglect copy carry the facts; the thumbnail falls back to the Gun emote", () => {
    const c = turfOutbidNotice({ racketName: "Casino Row Protection", amount: 10_010_000, refunded: 9_100_000, bidClosesAt: new Date() });
    expect(containerText(c)).toContain("You were outbid on Casino Row Protection: 10,010,000");
    expect(containerThumb(c)).toContain("1456729243399753752");
    expect(containerText(turfNeglectNotice({ racketName: "Pawn Row Fencing", strikes: 2, max: 3 }))).toContain("Neglect strike 2/3: play two crew heist seats this week to keep Pawn Row Fencing");
  });
});
