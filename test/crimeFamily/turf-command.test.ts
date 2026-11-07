// test/crimeFamily/turf-command.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { handleTurf } from "../../src/commands/economy/turf";
import { fakeMessage, replyText } from "../router/fakeMessage";
import { fakeClient } from "./fakeClient";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { seedTurf } from "../../src/services/crimeFamily/turfCities";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, seedRacket, seedWar, withCfConfig, racketByKey, turfCity } from "../helpers";

const ON = { enabled: true, turfEnabled: true };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War"]));
beforeEach(async () => { await resetFamilies(); await seedTurf(); });
/** A non-member's or an unplaced Bronze family's racket resolves in Low Town #1 (H10). */
const lowTownRacket = async (key: string) =>
  (await racketByKey(key, (await testPrisma.turfCity.findFirstOrThrow({ where: { league: "BRONZE", number: 1 } })).id)).id;
const inGold = async () => ({ cityId: (await turfCity()).id });
async function run(text: string, authorId: string, guildId = "g1") {
  const f = fakeMessage(text, { authorId, guildId });
  Object.assign(f.message, { client: fakeClient().client, channelId: "c1" });
  await handleTurf(f.message, text.split(/\s+/).slice(1));
  return replyText(f.reply.mock.calls[0][0]);
}

describe("!turf (13.1)", () => {
  it("is refused while turf is closed", async () => {
    expect(await run("!turf", await seedEligibleUser())).toContain("Turf wars are not open in this server yet.");
  });

  it("every turf refusal is titled Turf, closed or not (one title for the command)", async () => {
    const u = await seedEligibleUser();
    expect(await run("!turf", u)).toContain("## Turf\\n");
    await withCfConfig(ON, async () => {
      const bad = await run("!turf racket casino", u);
      expect(bad).toContain("## Turf\\n");
      expect(bad).not.toContain("Crime Families");
    });
  });

  it("racket <key|n> posts an opener; an unknown key lists keys (Review Focus 2)", async () => {
    await withCfConfig(ON, async () => {
      const u = await seedEligibleUser();
      expect(await run("!turf racket 9", u)).toContain(TURF_IDS.openRacket(await lowTownRacket("casino_row"), u));
      expect(await run("!turf racket CASINO_ROW", u)).toContain(TURF_IDS.openRacket(await lowTownRacket("casino_row"), u));
      const bad = await run("!turf racket casino", u);
      expect(bad).toContain("Unknown racket.");
      expect(bad).toContain("9 casino_row");
    });
  });

  it("a racket key or number as the first argument opens that racket; anything else lists keys (the racket alias)", async () => {
    await withCfConfig(ON, async () => {
      const u = await seedEligibleUser();
      expect(await run("!racket 9", u)).toContain(TURF_IDS.openRacket(await lowTownRacket("casino_row"), u));
      expect(await run("!racket casino_row", u)).toContain(TURF_IDS.openRacket(await lowTownRacket("casino_row"), u));
      expect(await run("!racket nowhere", u)).toContain("Unknown racket.");
    });
  });

  it.each(["all", "-1", "1e7", "abc"])("bid %s is refused as an amount (Review Focus 1)", async (amount) => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, earnings: 5_000_000, data: await inGold() });
      await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      expect(await run(`!turf bid docks_numbers ${amount}`, boss)).toContain("Enter an amount like 2.1m or 2,100,000.");
    });
  });

  it("bid with short earnings refuses publicly without any vault amount (Review Focus 5)", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, earnings: 1_234_567, treasury: 76_543_210, data: await inGold() });
      await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      const t = await run("!turf bid 1 2.1m", boss);
      expect(t).toContain("Not enough earnings for this bid");
      expect(t).not.toMatch(/1,234,567|76,543,210/);
    });
  });

  it("bid places the bid and posts a public notice with the amount", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss, tag: "VLA", name: "Velvet Ante", earnings: 5_000_000, data: await inGold() });
      await seedWar({ racketKey: "docks_numbers", status: "BIDDING" });
      expect(await run("!turf bid docks_numbers 2.1m", boss)).toContain("[VLA] Velvet Ante bid 2,100,000 on Dockside Numbers.");
    });
  });

  it("with no city: an unplaced family's bid is refused with the census line and moves nothing (Review Focus 2)", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, level: 1, earnings: 50_000_000 });
      expect(await run("!turf racket 9", boss)).toContain(TURF_IDS.openRacket(await lowTownRacket("casino_row"), boss));
      expect(await run("!turf bid casino_row 9.1m", boss)).toMatch(/Your family has no city yet: it gets one at the daily census once 3 members are active \(next <t:\d+:R>\)\./);
      expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: "bid_escrow" } })).toBe(0);
      expect((await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } })).earnings).toBe(50_000_000);
    });
  });

  it("war posts the S25 card from any server", async () => {
    await withCfConfig(ON, async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, homeGuildId: "g1" });
      await seedRacket("pawn_row");
      const w = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: f.id, defenderFamilyId: "" });
      expect(await run("!turf war", boss, "g2")).toContain(TURF_IDS.scout(w.id));
      expect(await run("!turf war", boss, "g1")).toContain(TURF_IDS.scout(w.id));
    });
  });
});
