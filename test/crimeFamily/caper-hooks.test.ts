import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { leaveFamily, kickMember } from "../../src/services/crimeFamily/membershipService";
import { disbandFamily } from "../../src/services/crimeFamily/disbandService";
import { isActiveMember } from "../../src/services/crimeFamily/eligibility";
import { runFamilyTx } from "../../src/services/crimeFamily/tx";
import { cancelCaperInTx, removeSeatInTx } from "../../src/services/crimeFamily/caperRefunds";
import { testPrisma, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";
import { seedLobby, seedRunning, txCount } from "./caperFixtures";

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const crew = (caperId: string) => testPrisma.caperCrew.findMany({ where: { caperId } });
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "Caper", "CaperCrew"]));
beforeEach(resetFamilies);

describe("caper family hooks (6.4, 7.3)", () => {
  it("leave is refused while seated in a LOBBY or a RUNNING caper", async () => {
    const lobby = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await expect(leaveFamily(lobby.ids.LOOKOUT)).rejects.toThrow("You are seated in a live crew heist. Leave its lobby with `!heist leave`, or wait for it to finish.");
    await resetFamilies();
    const run = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await expect(leaveFamily(run.ids.SAFECRACKER)).rejects.toThrow(/seated in a live crew heist/);
  });

  it("kicking a LOBBY seat deletes it and refunds the stake as unearned income", async () => {
    const { caper, ids, bossId } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const before = await wallet(ids.LOOKOUT);
    await kickMember(bossId, ids.LOOKOUT);
    expect((await crew(caper.id)).map((r) => r.role).sort()).toEqual(["MASTERMIND", "SAFECRACKER"]);
    expect(await wallet(ids.LOOKOUT)).toBe(before + 50_000);
    const w = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: w!.id, type: "caper_stake_refund" } })).toMatchObject({ amount: 50_000, isEarned: false });
    expect((await testPrisma.caper.findUnique({ where: { id: caper.id } }))!.seatsVersion).toBe(1);
  });

  it("kicking the Mastermind cancels the lobby, refunds every stake once and sets the 30-minute cooldown", async () => {
    const now = new Date();
    const { caper, ids, bossId, family } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], plannerRank: "CAPO" });
    const before = await Promise.all(Object.values(ids).map(wallet));
    await kickMember(bossId, ids.MASTERMIND, now);
    expect(await testPrisma.caper.findUnique({ where: { id: caper.id } })).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED", liveSlot: caper.id });
    expect((await crew(caper.id)).every((r) => r.refunded && r.liveSlot === caper.id)).toBe(true);
    expect(await Promise.all(Object.values(ids).map(wallet))).toEqual(before.map((b) => b + 50_000));
    expect(+(await testPrisma.family.findUnique({ where: { id: family.id } }))!.nextCaperAt).toBe(+now + 1_800_000);
  });

  it("kicking a member seated in a RUNNING caper is refused", async () => {
    const { ids, bossId } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    await expect(kickMember(bossId, ids.LOOKOUT)).rejects.toThrow(`<@${ids.LOOKOUT}> is in a running crew heist.`);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: ids.LOOKOUT } })).not.toBeNull();
  });

  it.each([["LOBBY", "A crew heist is in its lobby."], ["RUNNING", "A crew heist is running."], ["SETTLING", "A crew heist is running."]] as const)(
    "disband is refused while a caper is %s", async (status, msg) => {
      const seeded = status === "LOBBY"
        ? await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] })
        : await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], status });
      await expect(disbandFamily(seeded.bossId, seeded.family.tag)).rejects.toThrow(msg);
    });

  it("two started seats in 7 days make a member active for payday; one does not", async () => {
    const { ids } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], startedAt: daysAgo(6) });
    expect((await isActiveMember(ids.LOOKOUT, new Date())).active).toBe(false);
    await testPrisma.caperCrew.create({ data: { caperId: "65f000000000000000000009", familyId: "65f000000000000000000009", userId: ids.LOOKOUT, role: "LOOKOUT", liveSlot: "65f000000000000000000009", stake: 50_000, started: true, startedAt: daysAgo(1) } });
    expect((await isActiveMember(ids.LOOKOUT, new Date())).active).toBe(true);
  });

  it("primitives: removing a seat twice or from a closed lobby, and cancelling twice, refund once", async () => {
    const { caper, ids } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] });
    const [row] = (await crew(caper.id)).filter((r) => r.role === "LOOKOUT");
    await runFamilyTx((tx) => removeSeatInTx(tx, row, "leave"));
    await expect(runFamilyTx((tx) => removeSeatInTx(tx, row, "leave"))).rejects.toThrow("That seat is already gone.");
    const rs = await Promise.allSettled([runFamilyTx((tx) => cancelCaperInTx(tx, caper.id, new Date())), runFamilyTx((tx) => cancelCaperInTx(tx, caper.id, new Date()))]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(3);   // 1 leave + 2 cancel refunds
  });
});
