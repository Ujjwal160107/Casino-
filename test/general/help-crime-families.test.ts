// test/general/help-crime-families.test.ts
import { describe, it, expect, vi } from "vitest";
import { Mascot } from "../../src/config/branding";

const allPages = (h: typeof import("../../src/commands/general/help")) =>
  [1, 2, 3, 4].map((p) => JSON.stringify(h.buildMainMenu("!", p, "u").toJSON())).join("\n");

describe("help and tutorial (19.3)", () => {
  it("shows the cf_crest_1 app emoji when it is loaded", async () => {
    vi.resetModules();
    const { setEmojiRecord } = await import("../../src/utils/emojiRegistry");
    setEmojiRecord("cf_crest_1", { id: "1234567890123456789", name: "cf_crest_1" });
    const help = await import("../../src/commands/general/help");
    expect(allPages(help)).toContain("<:cf_crest_1:1234567890123456789>");
    const cat = help.CATEGORIES.find((c) => c.id === "crimefamilies")!;
    expect(JSON.stringify(help.buildModuleView(cat, "!").toJSON())).toContain("<:cf_crest_1:1234567890123456789>");
  });

  it("falls back to the Gun emote in a fresh module without it", async () => {
    vi.resetModules();
    const help = await import("../../src/commands/general/help");
    const pages = allPages(help);
    expect(pages).toContain("Crime Families");
    expect(pages).toContain(Mascot.Emotes.Gun);
    expect(pages).not.toContain("cf_crest_1");
  });

  it("the tutorial has a Crime Families lesson that points to {p}crew", async () => {
    const { LESSONS } = await import("../../src/commands/general/tutorial");
    const l = LESSONS.find((x) => x.id === "crimefamilies")!;
    expect(l).toMatchObject({ label: "Crime Families", emote: Mascot.Emotes.Gun });
    expect(l.howToUse.join(" ")).toContain("{p}crew");
  });
});
