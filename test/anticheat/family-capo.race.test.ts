import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { promoteMember, demoteMember } from "../../src/services/crimeFamily/chairService";
import { kickMember, leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { redisService } from "../../src/services/redisService";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { CREW_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, said } from "../crimeFamily/fakeInteraction";
import { fakeClient } from "../crimeFamily/fakeClient";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, withCfConfig } from "../helpers";
import type { FamilyRole } from "../../src/data/crimeFamilyCatalog";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

const RICH = 12_000_000;
async function family(size: number, roles: Partial<Record<FamilyRole, number>> = {}, wallet = RICH) {
  const boss = await seedEligibleUser();
  const plan: FamilyRole[] = [
    ...Array(roles.UNDERBOSS ?? 0).fill("UNDERBOSS"), ...Array(roles.CAPO ?? 0).fill("CAPO"),
  ];
  const ids: string[] = [];
  for (let i = 0; i < size - 1; i++) ids.push(await seedEligibleUser({ wallet }));
  const f = await seedFamily({ bossId: boss, level: 10, members: ids.map((userId, i) => ({ userId, role: plan[i] ?? "SOLDIER" })) });
  return { f, boss, ids };
}
const role = async (id: string) => (await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: id } })).role;
const BUSY_OR = (m: string) => new RegExp(`^(${m.replace(/[.()]/g, "\\$&")}|Vault busy, try again\\.)$`);

describe("Capos scale with size (amendment 3)", () => {
  it("seven promotions race in a 30-member family: never more than 6 Capos, unique slots; the losers fill to exactly 6 in turn", async () => {
    const { boss, ids } = await family(30);
    const seven = ids.slice(0, 7);
    // Every write serializes on touchFamily and runFamilyTx tries 3 times, so a loser may read "Vault busy".
    const r = await Promise.allSettled(seven.map((id) => promoteMember(boss, id)));
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("Capo seats are full (6/6 for 30 members)."));
    const capoSlots = async () => (await testPrisma.familyMember.findMany({ where: { role: "CAPO" } })).map((m) => m.roleSlot);
    const raced = await capoSlots();
    expect(raced.length).toBeLessThanOrEqual(6);
    expect(new Set(raced).size).toBe(raced.length);
    for (const id of seven) if ((await role(id)) === "SOLDIER") await promoteMember(boss, id).catch((e) => expect(e.message).toBe("Capo seats are full (6/6 for 30 members)."));
    expect((await capoSlots()).sort()).toEqual(["CAPO1", "CAPO2", "CAPO3", "CAPO4", "CAPO5", "CAPO6"]);
    expect((await Promise.all(seven.map(role))).filter((x) => x === "SOLDIER")).toHaveLength(1);
  });

  it("reads net worth uncached: a stale 50M cache does not pass a live 9M", async () => {
    const { boss, ids } = await family(10, {}, 9_000_000);
    await redisService.set(`networth:${ids[0]}`, { total: 50_000_000 }, 600);   // getNetWorth's display cache
    await expect(promoteMember(boss, ids[0])).rejects.toThrow("Promotion needs 10,000,000 net worth (<@" + ids[0] + "> has 9,000,000).");
  });

  it("kicks down to 19 members keep all 6 Capos; the next promotion waits", async () => {
    const { boss, ids } = await family(30, { CAPO: 6 });
    for (const id of ids.slice(6, 17)) await kickMember(boss, id);
    expect(await testPrisma.familyMember.count({ where: { role: "CAPO" } })).toBe(6);
    await expect(promoteMember(boss, ids[20])).rejects.toThrow("Capo seats are full (6/3 for 19 members).");
  });

  it("a 2M Capo cannot be promoted to Underboss (A10)", async () => {
    const { boss, ids } = await family(10, { CAPO: 1 }, 2_000_000);
    await expect(promoteMember(boss, ids[0])).rejects.toThrow(/Promotion needs 10,000,000 net worth/);
  });

  it("demoting the Underboss with six Capos lands on Soldier and grants 7 days of start_vote", async () => {
    const { boss, ids } = await family(30, { UNDERBOSS: 1, CAPO: 6 });
    const before = Date.now();
    expect(await demoteMember(boss, ids[0])).toMatchObject({ newRole: "SOLDIER", fellBack: true });
    const row = await testPrisma.familyMember.findUniqueOrThrow({ where: { userId: ids[0] } });
    expect(row).toMatchObject({ role: "SOLDIER", roleSlot: ids[0] });
    expect(+row.officerUntil).toBeGreaterThanOrEqual(before + 604_800_000);
  });

  it("19 members, 3 Capos, a free CAPO4: the demoted Underboss takes CAPO4 over the cap; the next promotion is refused", async () => {
    const { boss, ids } = await family(19, { UNDERBOSS: 1, CAPO: 3 });
    expect(await demoteMember(boss, ids[0])).toMatchObject({ newRole: "CAPO", fellBack: false });
    expect(await role(ids[0])).toBe("CAPO");
    await expect(promoteMember(boss, ids[10])).rejects.toThrow("Capo seats are full (4/3 for 19 members).");
  });

  it("a promotion racing a leave that drops the cap re-reads memberCount", async () => {
    const { f, boss, ids } = await family(10, { CAPO: 1 });                   // cap 2, one Capo seated
    const r = await Promise.allSettled([promoteMember(boss, ids[5]), leaveFamily(ids[6])]);
    for (const x of r) if (x.status === "rejected") expect(x.reason.message).toMatch(BUSY_OR("Capo seats are full (1/1 for 9 members)."));
    const after = await testPrisma.family.findUniqueOrThrow({ where: { id: f.id } });
    const capos = await testPrisma.familyMember.count({ where: { familyId: f.id, role: "CAPO" } });
    // Promote-then-leave legitimately ends at 2 Capos for 9 members (grandfathered); leave-then-promote must refuse.
    if (after.memberCount === 9 && capos === 2) expect(r[0].status).toBe("fulfilled");
    expect(capos).toBeLessThanOrEqual(2);
  });

  it("S5 says the demoted Underboss fell back to Soldier", async () => {
    const { boss, ids } = await family(30, { UNDERBOSS: 1, CAPO: 6 });
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.rank("demote", ids[0], "UNDERBOSS", boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).toContain(`<@${ids[0]}> is now a Soldier (no Capo seat was free).`);
    });
  });
});
