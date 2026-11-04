import { describe, it, expect } from "vitest";
import { DM_NOTICE_TYPES, isCooldownReminderType } from "../../src/services/dmPrefsService";
import { caperGoNotice, caperLobbyNotice, familyArrearsNotice, familyInviteNotice, notifyMany } from "../../src/services/dmNoticeService";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { containerText, containerThumb, fakeDmClient } from "./helpers";
import { seedUser } from "../helpers";
import { setEmojiRecord } from "../../src/utils/emojiRegistry";

describe("family DM notices (13.4)", () => {
  it("family is an account notice with no command", () => {
    expect(DM_NOTICE_TYPES.family).toEqual({ label: "Crime family", group: "account" });
    expect(isCooldownReminderType("family")).toBe(false);
  });
  it("the invite notice tells the player how to accept and links the card", () => {
    const c = familyInviteNotice({ familyLabel: "[VLA] Velvet Ante", inviterId: "1", tag: "VLA", expiresAt: new Date(Date.now() + 864e5), jumpUrl: "https://discord.com/channels/1/2/3" });
    expect(containerText(c)).toContain("!crew accept VLA");
    expect(containerText(c)).toContain("https://discord.com/channels/1/2/3");
  });
  it("the arrears notice prints days as a plain count, singular or plural", () => {
    expect(containerText(familyArrearsNotice({ familyLabel: "x", days: 1, owed: 5_000 }))).toContain("**In arrears:** 1 day\n");
    expect(containerText(familyArrearsNotice({ familyLabel: "x", days: 3, owed: 5_000 }))).toContain("**In arrears:** 3 days\n");
  });
  it("uses the Gun emote as the thumbnail while no cf emoji is loaded", () => {
    expect(containerThumb(familyInviteNotice({ familyLabel: "x", inviterId: "1", tag: "VLA", expiresAt: new Date(), jumpUrl: null }))).toContain("1456729243399753752");
  });
  it("respects the family toggle", async () => {
    await seedUser("fam-dm-off", { disabledReminders: ["family"] } as any);
    await seedUser("fam-dm-on");
    const dm = fakeDmClient();
    await notifyMany(dm.client, "family", ["fam-dm-off", "fam-dm-on"], () => familyInviteNotice({ familyLabel: "x", inviterId: "1", tag: "VLA", expiresAt: new Date(), jumpUrl: null }));
    expect([...dm.sent.keys()]).toEqual(["fam-dm-on"]);
  });
  it("uses the cf_crest_1 emoji as the thumbnail once it is loaded", () => {
    setEmojiRecord("cf_crest_1", { id: "1234567890123456789", name: "cf_crest_1" });
    expect(containerThumb(familyInviteNotice({ familyLabel: "x", inviterId: "1", tag: "VLA", expiresAt: new Date(), jumpUrl: null }))).toContain("1234567890123456789");
  });
});

describe("caper DM notices (13.4)", () => {
  const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);
  it("caper is a cooldown reminder for !caper; caper_lobby is an account notice with no command", () => {
    expect(DM_NOTICE_TYPES.caper).toEqual({ label: "Family caper", command: "!caper", group: "cooldown" });
    expect(isCooldownReminderType("caper")).toBe(true);
    expect(DM_NOTICE_TYPES.caper_lobby).toEqual({ label: "Caper lobby calls", group: "account" });
    expect(isCooldownReminderType("caper_lobby")).toBe(false);
  });
  it("the lobby call names the tier, stake and close time and links the card", () => {
    const t = containerText(caperLobbyNotice({ familyLabel: "[VLA] Velvet Ante", tierName: "Payroll Van", stake: 100_000, closesAt: new Date(1_800_000_000_000), jumpUrl: "https://discord.com/channels/1/2/3" }));
    for (const s of ["Payroll Van", "100,000", "<t:1800000000:R>", "https://discord.com/channels/1/2/3"]) expect(t).toContain(s);
  });
  it("the GO call uses the cf_caper emoji as its thumbnail when loaded, the Gun emote otherwise", () => {
    expect(containerThumb(caperGoNotice({ tierName: "x", goEndsAt: new Date(), jumpUrl: null }))).toContain("1456729243399753752");
    setEmojiRecord("cf_caper", { id: "1234567890123456780", name: "cf_caper" });
    expect(containerThumb(caperGoNotice({ tierName: "x", goEndsAt: new Date(), jumpUrl: null }))).toContain("1234567890123456780");
  });
  it("the settings panel is 29 components with DMs on and 30 off", () => {
    expect(count(buildSettingsPayload("o", { remindersEnabled: true, disabledReminders: [] }).components[0].toJSON())).toBe(29);
    expect(count(buildSettingsPayload("o", { remindersEnabled: false, disabledReminders: [] }).components[0].toJSON())).toBe(30);
  });
});
