import { describe, it, expect } from "vitest";
import { ComponentType } from "discord.js";
import { noticeContainer } from "../../src/utils/componentsV2";
import { Mascot, getEmoteUrl } from "../../src/config/branding";

describe("noticeContainer", () => {
  it("puts the emote's CDN image in the section thumbnail and the title above the body", () => {
    const json = noticeContainer(Mascot.Emotes.Gun, "Title", "Body").toJSON() as any;
    const section = json.components[0];
    expect(section.type).toBe(ComponentType.Section);
    expect(section.components[0].content).toBe("## Title\nBody");
    expect(section.accessory.type).toBe(ComponentType.Thumbnail);
    expect(section.accessory.media.url).toBe(getEmoteUrl(Mascot.Emotes.Gun));
  });

  it("adds the hint after a separator only when given", () => {
    const withHint = noticeContainer(Mascot.Emotes.Gun, "T", "B", "-# hint").toJSON() as any;
    expect(withHint.components.map((c: any) => c.type)).toEqual([
      ComponentType.Section,
      ComponentType.Separator,
      ComponentType.TextDisplay,
    ]);
    expect(withHint.components[2].content).toBe("-# hint");

    const without = noticeContainer(Mascot.Emotes.Gun, "T", "B").toJSON() as any;
    expect(without.components).toHaveLength(1);
  });

  it("never sets an accent color", () => {
    const json = noticeContainer(Mascot.Emotes.Gun, "T", "B").toJSON() as any;
    expect(json.accent_color).toBeUndefined();
  });
});
