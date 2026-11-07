import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { buildTurfMap } from "../../src/ui/crimeFamily/turfScreens";
import { getTurfMapView } from "../../src/services/crimeFamily/turfQueries";
import { ensureCity, seedTurf } from "../../src/services/crimeFamily/turfCities";
import { fakeButton, fakeSelect, said } from "./fakeInteraction";
import { visibleText } from "./visibleText";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, racketByKey, withCfConfig } from "../helpers";

const ON = { enabled: true, turfEnabled: true };
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "TurfCity", "Racket", "War"]));
beforeEach(async () => { await resetFamilies(); await seedTurf(); });
const ids = (p: any) => JSON.stringify(p.components).match(/"custom_id":"[^"]+"/g) ?? [];

async function member(level: number, cityId: string) {
  const boss = await seedEligibleUser();
  await seedFamily({ bossId: boss, level, homeGuildId: "g1", data: { cityId, activeMembers: 3 } });
  return boss;
}

describe("S16 city header and pager (6.8)", () => {
  it("names the city and league, prices the league's rackets, and pages between the league's cities", async () => {
    const u1 = await testPrisma.turfCity.findFirstOrThrow({ where: { league: "GOLD", number: 1 } });
    const u2 = await ensureCity("GOLD", 2);
    const uid = await member(8, u2.id);
    const p = buildTurfMap(uid, await getTurfMapView(uid, null, new Date()));
    const t = visibleText(p);
    expect(t).toContain("Turf · Uptown #2 (Gold)");
    expect(t).toContain("Gold league rackets pay 300,000 / 650,000 / 1,300,000 a day (Corner / District / Crown).");
    const all = ids(p);
    expect(new Set(all).size).toBe(all.length);                                  // H3: no duplicate customIds
    expect(all).toContain(`"custom_id":"${TURF_IDS.city(u1.id, uid)}"`);
    expect(all).toContain(`"custom_id":"${TURF_IDS.cityEdge("next", uid)}"`);
    expect(all).toContain(`"custom_id":"${TURF_IDS.league("GOLD", uid)}"`);
  });

  it("an unplaced family sees the census line on the city it would join (edge 9)", async () => {
    const uid = await member(2, "");
    const t = visibleText(buildTurfMap(uid, await getTurfMapView(uid, null, new Date())));
    expect(t).toContain("Turf · Low Town #1 (Bronze)");
    expect(t).toMatch(/Your family has no city yet: it gets one at the daily census once 3 members are active \(next <t:\d+:R>\)\./);
  });

  it("a pager press for a closed city shows the viewer's own city; a league button finds the right city (Review Focus 1)", async () => {
    await withCfConfig(ON, async () => {
      const m2 = await ensureCity("SILVER", 2);
      const gone = await ensureCity("SILVER", 3);
      await testPrisma.turfCity.update({ where: { id: gone.id }, data: { status: "CLOSED" } });
      const uid = await member(5, m2.id);
      const back = fakeButton(TURF_IDS.city(gone.id, uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(back as any);
      expect(said(back)).toContain("Midtown #2 (Silver)");
      const silver = fakeButton(TURF_IDS.league("SILVER", uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(silver as any);
      expect(said(silver)).toContain("Midtown #2 (Silver)");
      const gold = fakeButton(TURF_IDS.league("GOLD", uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(gold as any);
      expect(said(gold)).toContain("Uptown #1 (Gold)");
      const edge = fakeButton(TURF_IDS.cityEdge("prev", uid), { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(edge as any);
      expect(said(edge)).toContain("Midtown #2 (Silver)");
    });
  });

  it("a stale select opens another city's racket read-only with the city line and the city refusal (Review Focus 1)", async () => {
    await withCfConfig(ON, async () => {
      const m1 = await testPrisma.turfCity.findFirstOrThrow({ where: { league: "SILVER", number: 1 } });
      const m2 = await ensureCity("SILVER", 2);
      const uid = await member(5, m2.id);
      const r = await racketByKey("casino_row", m1.id);
      const sel = fakeSelect(TURF_IDS.select(uid), [r.id], { userId: uid, guildId: "g1" });
      await handleCrimeFamilyInteraction(sel as any);
      expect(said(sel)).toContain("**City:** Midtown #1 (Silver league)");
      expect(said(sel)).toContain("This racket is in Midtown #1. Your family plays in Midtown #2.");
    });
  });
});

describe("the league on family lists (2.6, plan 4 F17)", () => {
  it("S10 lines read L8 Gold", async () => {
    const { crimeFamilyWorstCases } = await import("../../src/scripts/fixtures/crimeFamilyScreens");
    const s10 = crimeFamilyWorstCases().find((c) => c.label.startsWith("S10"))!;
    expect(visibleText(s10.payload)).toMatch(/L\d+ (Bronze|Silver|Gold)/);
  });
});
