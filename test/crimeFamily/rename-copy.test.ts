// test/crimeFamily/rename-copy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import type { Client } from "discord.js";
import { visibleText } from "./visibleText";
import { crimeFamilyWorstCases } from "../../src/scripts/fixtures/crimeFamilyScreens";
import * as dm from "../../src/services/dmNoticeService";
import { DM_NOTICE_TYPES } from "../../src/services/dmPrefsService";
import { SPECS } from "../../src/slash/registry";
import { routeMessage } from "../../src/commandRouter";
import { fakeMessage, replyText } from "../router/fakeMessage";
import { CATEGORIES, buildModuleView } from "../../src/commands/general/help";
import { LESSONS } from "../../src/commands/general/tutorial";
import { buildCrimeBoardPayload } from "../../src/commands/economy/crimeUi";
import { resolveAndAnnounce } from "../../src/ui/crimeFamily/caperFlow";
import { seedEligibleUser, withCfConfig, resetFamilies } from "../helpers";
import { seedRunning, fakeCaperClient } from "./caperFixtures";

// As test/router/dispatch.test.ts: the router's import graph reaches canvas, which is not built here.
// routeMessage loads command handlers through a lazy require() that fakeMessage sends through ts-node,
// so vi.mock never sees it: the routing cases assert on the reply text instead.
vi.mock("canvas", () => ({}));
const logToChannel = vi.hoisted(() => vi.fn(async (_client: unknown, _options: unknown) => undefined));
vi.mock("../../src/utils/discordLogger", () => ({ logToChannel }));

const OLD = /\bcapers?\b/i;
async function route(content: string, authorId: string): Promise<string> {
  const { message, reply } = fakeMessage(content, { authorId, guildId: "g1" });
  await routeMessage({} as Client, message, "!");
  return reply.mock.calls.map((c) => replyText(c[0])).join("\n");
}

beforeEach(resetFamilies);

describe("Crew Heist rename (amendment 9)", () => {
  it("no worst-case screen shows 'caper'", () => {
    for (const c of crimeFamilyWorstCases()) expect(visibleText(c.payload), c.label).not.toMatch(OLD);
  });
  it("no DM builder or DM pref label shows 'caper'", () => {
    const at = new Date();
    const built = [
      dm.caperLobbyNotice({ tierName: "Warehouse Job", stake: 300_000, closesAt: at, familyLabel: "[VLA] Velvet Ante", jumpUrl: "https://discord.com/channels/1/2/3" }),
      dm.caperGoNotice({ tierName: "Warehouse Job", goEndsAt: at, jumpUrl: "https://discord.com/channels/1/2/3" }),
      dm.turfNeglectNotice({ racketName: "Docks", strikes: 1, max: 3 }),
    ];
    for (const c of built) expect(visibleText(c)).not.toMatch(OLD);
    expect(DM_NOTICE_TYPES.caper).toEqual({ label: "Crew heist", command: "!heist", group: "cooldown" });
    expect(DM_NOTICE_TYPES.caper_lobby.label).toBe("Crew heist lobby");
  });
  it("help, tutorial and slash say heist", () => {
    const cat = CATEGORIES.find((c) => c.id === "crimefamilies")!;
    const help = visibleText(buildModuleView(cat, "!")).replace(/crewheist\W+caper\W+capers/gi, "");   // the alias list may name them
    expect(help).not.toMatch(OLD);
    expect(JSON.stringify(LESSONS.find((l) => l.id === "crimefamilies"))).not.toMatch(/`\{p\}caper/);
    expect(JSON.stringify(LESSONS.find((l) => l.id === "crimefamilies"))).not.toMatch(OLD);
    expect(SPECS.some((s) => s.name === "heist")).toBe(true);
    expect(SPECS.some((s) => s.name === "caper")).toBe(false);
  });
  it.each(["!heist", "!crewheist", "!caper", "!capers"])("%s routes to the heist handler", async (cmd) => {
    // The heist handler's own non-member refusal (caper.ts `view`); `!crew` would show S1 instead.
    const on = await withCfConfig({ enabled: true, allowGuildIds: null }, async () => route(cmd, await seedEligibleUser()));
    expect(on).not.toContain("Unknown Command");
    expect(on).toContain("You are not in a crime family. Start with");
    // `view` refuses a non-member before the guild gate, so `plan` (gated first) shows the switch.
    const off = await withCfConfig({ enabled: false }, async () => route(`${cmd} plan 1`, await seedEligibleUser()));
    expect(off).toContain("Crime Families are not open in this server yet.");
    const usage = await withCfConfig({ enabled: true, allowGuildIds: null }, async () => route(`${cmd} nope`, await seedEligibleUser()));
    expect(usage).toContain("!heist [plan");
  });
  it("the settled-heist trade log says crew heist", async () => {
    await withCfConfig({ caperTradeLogMinPool: 1 }, async () => {
      logToChannel.mockClear();
      const run = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
      const fc = fakeCaperClient({ members: Object.values(run.ids) });
      const result = await resolveAndAnnounce(fc.client, run.caper.id, new Date(+run.caper.goEndsAt! + 1_000), new Date(0));
      expect(result).toMatchObject({ status: "settled", resolvedNow: true });
      expect(logToChannel).toHaveBeenCalledTimes(1);
      for (const [, options] of logToChannel.mock.calls) expect(visibleText(options)).not.toMatch(OLD);
      expect(visibleText(logToChannel.mock.calls[0][1])).toContain("Crew heist resolved");
    });
  });
  it("the solo !crime board keeps its Legendary tier", async () => {
    const uid = await seedEligibleUser();
    const payload = await buildCrimeBoardPayload(uid, { sessionId: "s1", ownerId: uid, crimeKeys: ["bank_vault_heist"], createdAt: Date.now() }, "!");
    expect(visibleText(payload)).toContain("Legendary");
  });
  it("the website's Crime Families pages and command list say crew heist", () => {
    const root = path.resolve(__dirname, "../../dashboard/src/content");
    for (const file of ["modules/crime-families.ts", "modules/crime-and-heat.ts", "commands.ts"]) {
      const text = readFileSync(path.join(root, file), "utf8")
        .split("\n")
        .filter((line) => !line.includes("aliases:") && !/^\s*(\/\/|\/?\*)/.test(line))   // code comments keep internal names
        .join("\n")
        .replace(/\/art\/[^"'`\s)]*/g, "");
      const hit = text.split("\n").find((line) => OLD.test(line));
      expect(hit, file).toBeUndefined();
    }
  });
});
