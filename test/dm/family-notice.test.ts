import { describe, it, expect } from "vitest";
import { DM_NOTICE_TYPES, isCooldownReminderType } from "../../src/services/dmPrefsService";
import { familyInviteNotice, notifyMany } from "../../src/services/dmNoticeService";
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
