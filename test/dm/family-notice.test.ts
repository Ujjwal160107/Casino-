import { describe, it, expect } from "vitest";
import { DM_NOTICE_TYPES, isCooldownReminderType } from "../../src/services/dmPrefsService";
import { caperGoNotice, caperLobbyNotice, familyArrearsNotice, familyInviteNotice, notifyMany, turfWarSoonNotice } from "../../src/services/dmNoticeService";
import { briefRow, joinSelectRow } from "../../src/ui/crimeFamily/caperScreens";
import { warActionRow } from "../../src/ui/crimeFamily/turfScreens";
import { cfPayload } from "../../src/ui/crimeFamily/kit";
import { countComponents } from "../crimeFamily/layoutHelpers";
import { visibleText } from "../crimeFamily/visibleText";
import { containerText, containerThumb, fakeDmClient } from "./helpers";
import { seedUser, seedEligibleUser, seedFamily, seedApplication, resetFamilies, daysAgo } from "../helpers";
import { sendApplicationDigests } from "../../src/ui/crimeFamily/recruitAnnounce";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { fakeClient } from "../crimeFamily/fakeClient";

const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);
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

const CAPER = "65f0000000000000000000aa";

describe("caper DM notices (13.4)", () => {
  it("caper is a cooldown reminder for !heist; caper_lobby is an account notice with no command", () => {
    expect(DM_NOTICE_TYPES.caper).toEqual({ label: "Crew heist", command: "!heist", group: "cooldown" });
    expect(isCooldownReminderType("caper")).toBe(true);
    expect(DM_NOTICE_TYPES.caper_lobby).toEqual({ label: "Crew heist lobby", group: "account" });
    expect(isCooldownReminderType("caper_lobby")).toBe(false);
  });
  it("the lobby call names the tier, stake and close time and links the card", () => {
    const t = containerText(caperLobbyNotice({ familyLabel: "[VLA] Velvet Ante", tierName: "Payroll Van", stake: 100_000, closesAt: new Date(1_800_000_000_000), jumpUrl: "https://discord.com/channels/1/2/3" }, joinSelectRow(CAPER, ["LOOKOUT"])));
    for (const s of ["Payroll Van", "100,000", "<t:1800000000:R>", "https://discord.com/channels/1/2/3"]) expect(t).toContain(s);
  });
  it("the GO call uses the cf_caper emoji as its thumbnail when loaded, the Gun emote otherwise", () => {
    expect(containerThumb(caperGoNotice({ tierName: "x", goEndsAt: new Date(), jumpUrl: null }, briefRow(CAPER)))).toContain("1456729243399753752");
    setEmojiRecord("cf_caper", { id: "1234567890123456780", name: "cf_caper" });
    expect(containerThumb(caperGoNotice({ tierName: "x", goEndsAt: new Date(), jumpUrl: null }, briefRow(CAPER)))).toContain("1234567890123456780");
  });
  it("the lobby, GO and war-soon DMs carry their rows: 8, 8 and 11 components (amendment 5.5)", () => {
    const at = new Date(1_800_000_000_000);
    const lobby = cfPayload(caperLobbyNotice({ familyLabel: "[VLA] Velvet Ante", tierName: "Payroll Van", stake: 100_000, closesAt: at, jumpUrl: null }, joinSelectRow(CAPER, ["LOOKOUT"])));
    expect(countComponents(lobby)).toBe(8);
    expect(JSON.stringify(lobby)).toContain(`cpr:join:${CAPER}`);
    const go = cfPayload(caperGoNotice({ tierName: "Payroll Van", goEndsAt: at, jumpUrl: null }, briefRow(CAPER)));
    expect(countComponents(go)).toBe(8);
    expect(JSON.stringify(go)).toContain(`cpr:brief:${CAPER}`);
    const war = cfPayload(turfWarSoonNotice({ racketName: "Docks Numbers", side: "DEF", startsAt: at, channelUrl: "" }, warActionRow("65f0000000000000000000bb")));
    expect(countComponents(war)).toBe(11);
    expect(visibleText(war)).toContain("Scout and hit from the buttons below");
  });
  it("the action row sits under the body and the settings footnote stays last", () => {
    const go = caperGoNotice({ tierName: "Payroll Van", goEndsAt: new Date(1_800_000_000_000), jumpUrl: null }, briefRow(CAPER)).toJSON() as any;
    const types = go.components.map((c: any) => c.type);
    expect(types).toEqual([9, 1, 14, 10]); // section, action row, separator, footnote text
  });
});

describe("recruit DM notices (amendment 8.10)", () => {
  it("recruit is an account notice with no command", () => {
    expect(DM_NOTICE_TYPES.recruit).toEqual({ label: "Family applications", group: "account" });
    expect(isCooldownReminderType("recruit")).toBe(false);
  });
  it("the settings panel is 31 components with DMs on and 32 off", () => {
    expect(count(buildSettingsPayload("o", { remindersEnabled: true, disabledReminders: [] }).components[0].toJSON())).toBe(31);
    expect(count(buildSettingsPayload("o", { remindersEnabled: false, disabledReminders: [] }).components[0].toJSON())).toBe(32);
  });
  it("officer digests: one DM per officer per 6-hour window, and only for new applications", async () => {
    await resetFamilies();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const capo = await seedEligibleUser(); const soldier = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS" }, { userId: capo, role: "CAPO" }, { userId: soldier, role: "SOLDIER" }],
      data: { recruiting: true, recruitPitch: "We run heists every night.", appDigestAt: daysAgo(1) } });
    const t0 = new Date();
    await seedApplication({ familyId: f.id, applicantId: "701", createdAt: t0 });
    const c = fakeClient();
    await sendApplicationDigests(c.client as any, new Date(+t0 + 1_000));
    await sendApplicationDigests(c.client as any, new Date(+t0 + 2_000));
    expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 1, [ub]: 1, [capo]: 1 });
    await sendApplicationDigests(c.client as any, new Date(+t0 + 6 * 3_600_000 + 2_000));    // a window later, nothing new
    expect(c.dm.get(boss)).toBe(1);
    await seedApplication({ familyId: f.id, applicantId: "702", createdAt: new Date(+t0 + 6 * 3_600_000 + 3_000) });
    await sendApplicationDigests(c.client as any, new Date(+t0 + 12 * 3_600_000 + 4_000));
    expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 2, [ub]: 2, [capo]: 2 });
  });
});
