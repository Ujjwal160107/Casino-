import { describe, it, expect } from "vitest";
import { ButtonStyle, ComponentType } from "discord.js";
import { buildSettingsPayload } from "../../src/commands/general/settings";
import { DM_NOTICE_TYPES } from "../../src/services/dmPrefsService";

const on = { remindersEnabled: true, disabledReminders: [] as string[] };
const off = { remindersEnabled: false, disabledReminders: [] as string[] };

function containerJson(prefs: { remindersEnabled: boolean; disabledReminders: string[] }) {
  const payload = buildSettingsPayload("owner", prefs);
  expect(payload.components).toHaveLength(1);
  return payload.components[0].toJSON() as any;
}

function countComponents(node: any): number {
  let n = 1;
  for (const c of node.components ?? []) n += countComponents(c);
  if (node.accessory) n += 1;
  return n;
}

function buttons(container: any): any[] {
  return container.components
    .filter((c: any) => c.type === ComponentType.ActionRow)
    .flatMap((r: any) => r.components);
}

describe("settings panel", () => {
  it("keeps every button inside the one container", () => {
    const json = containerJson(on);
    expect(json.type).toBe(ComponentType.Container);
    const ids = buttons(json).map((b) => b.custom_id);
    expect(ids).toContain("settings:master:owner");
    for (const type of Object.keys(DM_NOTICE_TYPES)) expect(ids).toContain(`settings:toggle:${type}:owner`);
    expect(ids).toHaveLength(1 + Object.keys(DM_NOTICE_TYPES).length);
  });

  it("stays well under Discord's 40-component cap, master off included", () => {
    expect(countComponents(containerJson(on))).toBeLessThan(35);
    expect(countComponents(containerJson(off))).toBeLessThan(35);
  });

  it("groups cooldown alarms before account notices and lists the always-on alerts", () => {
    const texts = containerJson(on).components
      .filter((c: any) => c.type === ComponentType.TextDisplay)
      .map((c: any) => c.content as string);
    const cooldownAt = texts.indexOf("### Cooldown alarms");
    const accountAt = texts.indexOf("### Account notices");
    expect(cooldownAt).toBeGreaterThan(-1);
    expect(accountAt).toBeGreaterThan(cooldownAt);
    expect(texts[texts.length - 1]).toBe("-# Security alerts (robbery, padlock, tax raid) are always on.");
  });

  it("header is a section with the settings emote as thumbnail", () => {
    const header = containerJson(on).components[0];
    expect(header.type).toBe(ComponentType.Section);
    expect(header.components[0].content).toContain("## Your Settings");
    expect(header.accessory.media.url).toMatch(/^https:\/\/cdn\.discordapp\.com\/emojis\//);
  });

  it("master off: red master, every type button disabled, the re-enable hint shown", () => {
    const json = containerJson(off);
    const all = buttons(json);
    const master = all.find((b) => b.custom_id === "settings:master:owner");
    expect(master.label).toBe("All DMs: OFF");
    expect(master.style).toBe(ButtonStyle.Danger);
    for (const b of all.filter((b) => b.custom_id.startsWith("settings:toggle:"))) expect(b.disabled).toBe(true);
    const texts = json.components.filter((c: any) => c.type === ComponentType.TextDisplay).map((c: any) => c.content);
    expect(texts.some((t: string) => t.startsWith("-# Reminders are currently off."))).toBe(true);
  });

  it("master on: green master, no re-enable hint", () => {
    const json = containerJson(on);
    const master = buttons(json).find((b) => b.custom_id === "settings:master:owner");
    expect(master.label).toBe("All DMs: ON");
    expect(master.style).toBe(ButtonStyle.Success);
    const texts = json.components.filter((c: any) => c.type === ComponentType.TextDisplay).map((c: any) => c.content);
    expect(texts.some((t: string) => t.startsWith("-# Reminders are currently off."))).toBe(false);
  });

  it("a disabled type reads OFF in grey while the others stay green", () => {
    const all = buttons(containerJson({ remindersEnabled: true, disabledReminders: ["card"] }));
    const card = all.find((b) => b.custom_id === "settings:toggle:card:owner");
    expect(card.label).toBe("Card statements: OFF");
    expect(card.style).toBe(ButtonStyle.Secondary);
    const daily = all.find((b) => b.custom_id === "settings:toggle:daily:owner");
    expect(daily.label).toBe("Daily reward: ON");
    expect(daily.style).toBe(ButtonStyle.Success);
  });

  it("puts at most four buttons in a row", () => {
    const rows = containerJson(on).components.filter((c: any) => c.type === ComponentType.ActionRow);
    for (const row of rows) expect(row.components.length).toBeLessThanOrEqual(4);
  });
});
