// test/general/help-crime-families.test.ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("the Crime Families category lists !heist with its subcommands", async () => {
    vi.resetModules();
    const help = await import("../../src/commands/general/help");
    const cat = help.CATEGORIES.find((c) => c.id === "crimefamilies")!;
    expect(cat.commands.find((c) => c.name === "heist")).toMatchObject({ aliases: ["crewheist", "caper", "capers"] });
    expect(JSON.stringify(help.buildModuleView(cat, "!").toJSON())).toContain("!heist join lookout");
  });

  it("the crew entry lists board, recruit and vote and says families hold up to 30 members", async () => {
    vi.resetModules();
    const help = await import("../../src/commands/general/help");
    const crew = help.CATEGORIES.find((c) => c.id === "crimefamilies")!.commands.find((c) => c.name === "crew")!;
    const subs = (crew.subcommands ?? []).join("\n");
    expect(subs).toContain("board [TAG]");
    expect(subs).toContain("recruit —");
    expect(subs).toContain("vote [start]");
    expect(crew.description).toContain("up to 30 members");
  });

  it("the tutorial lesson says 10 to 30 players and points to {p}crew board", async () => {
    const { LESSONS } = await import("../../src/commands/general/tutorial");
    const l = LESSONS.find((x) => x.id === "crimefamilies")!;
    expect(l.howItWorks).toContain("10 to 30 players");
    expect(l.howToUse.join(" ")).toContain("`{p}crew board`");
  });

  it("the heist and turf entries say they work from any server and the brief carries Share", async () => {
    vi.resetModules();
    const help = await import("../../src/commands/general/help");
    const cmds = help.CATEGORIES.find((c) => c.id === "crimefamilies")!.commands;
    const heist = cmds.find((c) => c.name === "heist")!;
    expect(heist.description).toContain("from any server");
    expect((heist.subcommands ?? []).find((s) => s.startsWith("brief"))).toContain("Share");
    const turf = cmds.find((c) => c.name === "turf")!;
    expect((turf.subcommands ?? []).find((s) => s.startsWith("war"))).toContain("from any server");
  });

  it("the tutorial lesson says crew heists and turf wars work from any server and points to Share", async () => {
    const { LESSONS } = await import("../../src/commands/general/tutorial");
    const l = LESSONS.find((x) => x.id === "crimefamilies")!;
    expect(l.howToUse.join(" ")).toContain("`{p}heist brief` — open your brief and Share the intel you hold");
    expect(l.howItWorks).toContain("work from any server");
  });

  it("the turf entry and the tutorial lesson speak of leagues and the family's city", async () => {
    vi.resetModules();
    const help = await import("../../src/commands/general/help");
    const turf = help.CATEGORIES.find((c) => c.id === "crimefamilies")!.commands.find((c) => c.name === "turf")!;
    expect(turf.description).toContain("league");
    const subs = turf.subcommands ?? [];
    expect(subs.find((s) => s.startsWith("racket"))).toContain("in your family's city");
    expect(subs.find((s) => s.startsWith("bid"))).toContain("in your family's city");
    const { LESSONS } = await import("../../src/commands/general/tutorial");
    const l = LESSONS.find((x) => x.id === "crimefamilies")!;
    expect(l.howToUse.find((x) => x.startsWith("`{p}turf`"))).toContain("your league's city");
  });

  it("the website module documents leagues, cities and per-league income", () => {
    const doc = readFileSync(join(__dirname, "../../dashboard/src/content/modules/crime-families.ts"), "utf8");
    for (const s of ["Low Town", "Midtown", "Uptown", "1,800,000", "4,300,000", "6,400,000 a day per city", "40 active families"]) {
      expect(doc).toContain(s);
    }
    expect(doc).not.toContain("6,400,000 a day (44,800,000 a week) across the whole bot");
    expect(doc).not.toContain("District rackets need family level 4");
  });
});
