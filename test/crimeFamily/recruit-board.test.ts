import { describe, it, expect, beforeEach } from "vitest";
import { getBoardView, getFamilyCardView } from "../../src/services/crimeFamily/recruitQueries";
import { buildFamilyCard } from "../../src/ui/crimeFamily/recruitScreens";
import { FAMILY_LEVELS } from "../../src/data/crimeFamilyCatalog";
import { visibleText } from "./visibleText";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies } from "../helpers";

beforeEach(resetFamilies);

let n = 0;
/** A recruiting family whose memberCount, activeMembers and requirements are set directly (the board reads only Family). */
async function listed(o: { level?: number; members?: number; active?: number; req?: Record<string, number>; recruiting?: boolean; pitch?: string } = {}) {
  return seedFamily({ bossId: await seedEligibleUser(), tag: `B${++n}`, level: o.level ?? 1,
    data: { recruiting: o.recruiting ?? true, recruitPitch: o.pitch ?? "We run heists every night.", memberCount: o.members ?? 1, activeMembers: o.active ?? 0, ...o.req } });
}

describe("recruitment board (amendment 8.3)", () => {
  it("sorts by level, members and activity", async () => {
    const a = await listed({ level: 9, members: 3, active: 1 });
    const b = await listed({ level: 2, members: 9, active: 2 });
    const c = await listed({ level: 5, members: 5, active: 4 });
    const viewer = await seedEligibleUser();
    const order = async (sort: "lvl" | "mem" | "act") => (await getBoardView(viewer, sort, false, 0, new Date())).rows.map((r) => r.familyId);
    expect(await order("lvl")).toEqual([a.id, c.id, b.id]);
    expect(await order("mem")).toEqual([b.id, c.id, a.id]);
    expect(await order("act")).toEqual([c.id, b.id, a.id]);
  });

  it("13 families page 6, 6, 1; a page past the end clamps to the last (Review Focus 5)", async () => {
    for (let k = 0; k < 13; k++) await listed();
    const viewer = await seedEligibleUser();
    const sizes = await Promise.all([0, 1, 2].map(async (p) => (await getBoardView(viewer, "lvl", false, p, new Date())).rows.length));
    expect(sizes).toEqual([6, 6, 1]);
    expect(await getBoardView(viewer, "lvl", false, 9, new Date())).toMatchObject({ page: 2, pages: 3 });
  });

  it("a full family never appears, at every level", async () => {
    const viewer = await seedEligibleUser();
    for (const l of FAMILY_LEVELS) {
      await resetFamilies();
      const full = await listed({ level: l.level, members: l.memberCap });
      const room = await listed({ level: l.level, members: l.memberCap - 1 });
      const ids = (await getBoardView(viewer, "lvl", false, 0, new Date())).rows.map((r) => r.familyId);
      expect(ids, `L${l.level}`).toEqual([room.id]);
      expect(ids).not.toContain(full.id);
    }
  });

  it("I qualify hides every family with one failing requirement and explains an empty view", async () => {
    const viewer = await seedEligibleUser({ wallet: 1_000_000, shifts: 400, fortunaAgeDays: 400 });
    await listed({ req: { recruitMinNetWorth: 2_000_000 } });
    await listed({ req: { recruitMinShifts: 401 } });
    await listed({ req: { recruitMinAgeDays: 401 } });
    await listed({ req: { recruitMinHeists: 1 } });
    const open = await listed();
    const v = await getBoardView(viewer, "lvl", true, 0, new Date());
    expect(v.rows.map((r) => r.familyId)).toEqual([open.id]);
    await testPrisma.family.update({ where: { id: open.id }, data: { recruitMinHeists: 1 } });
    expect(await getBoardView(viewer, "lvl", true, 0, new Date())).toMatchObject({ rows: [], emptyReason: "No recruiting family's requirements fit you yet." });
    const young = await seedEligibleUser({ fortunaAgeDays: 1 });
    const gated = await getBoardView(young, "lvl", true, 0, new Date());
    expect(gated.rows).toEqual([]);
    expect(gated.emptyReason).toMatch(/days/);                           // the failing family_join gate's `need`
  });

  it("an empty board says nobody is recruiting", async () => {
    await listed({ recruiting: false });
    expect((await getBoardView(await seedEligibleUser(), "lvl", false, 0, new Date())).emptyReason).toBe("No family is recruiting right now.");
  });

  it("Review Focus 3: a pitch renders escaped, with no pings", async () => {
    const f = await listed({ pitch: "**bold** # Big <t:0:R> @here" });
    const card = buildFamilyCard(await getFamilyCardView(f.id, await seedEligibleUser(), new Date()));
    const text = visibleText(card);
    expect(text).toContain("\\*\\*bold\\*\\*");
    expect(text).toContain("\\# Big");
    expect(card.allowedMentions).toEqual({ parse: [] });
  });
});
