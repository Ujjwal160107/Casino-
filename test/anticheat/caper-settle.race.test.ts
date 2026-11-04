import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
const fail = vi.hoisted(() => ({ at: 0, calls: 0 }));
vi.mock("../../src/services/walletService", async (orig) => {
  const m = await orig<typeof import("../../src/services/walletService")>();
  return { ...m, creditWalletInTx: async (...a: Parameters<typeof m.creditWalletInTx>) => {
    if (fail.at && ++fail.calls === fail.at) throw new Error("boom");
    return m.creditWalletInTx(...a);
  } };
});
const { resolveCaper, settleCaper } = await import("../../src/services/crimeFamily/caperSettleService");
import { startedSeatsSince, startedCapersSince } from "../../src/services/crimeFamily/caperQueries";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";
import { testPrisma, resetFamilies, ensureUniqueIndexes } from "../helpers";
import { seedRunning, scriptedRng, txCount } from "../crimeFamily/caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const user = (id: string) => testPrisma.user.findUnique({ where: { discordId: id } });
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const caperRow = (id: string) => testPrisma.caper.findUnique({ where: { id } });
const after = (c: { goEndsAt: Date }) => new Date(+c.goEndsAt + 1_000);
const OLD_BOOT = new Date(0);
beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); fail.at = 0; fail.calls = 0; });

describe("settlement (8.8)", () => {
  it("CLEAN pays each locked seat once, credits the vault cut and XP once and counts the seat", async () => {
    const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    expect(await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]))).toEqual({ caperId: caper.id, status: "settled", resolvedNow: true, outcome: "CLEAN" });
    for (const id of Object.values(ids)) {
      expect(await wallet(id)).toBe(280_000);
      expect((await user(id))!.crimeHeat).toBe(20);
    }
    expect(await txCount("caper_cut", Object.values(ids))).toBe(3);
    const mw = await testPrisma.wallet.findUnique({ where: { userId: ids.MASTERMIND } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: mw!.id, type: "caper_cut" } })).toMatchObject({ amount: 280_000, isEarned: true });
    expect(await fam(family.id)).toMatchObject({ earnings: 105_000, xp: 150 });
    expect((await testPrisma.familyMember.findMany({ where: { familyId: family.id } })).every((m) => m.capers === 1)).toBe(true);
    expect(await caperRow(caper.id)).toMatchObject({ status: "RESOLVED", liveSlot: caper.id, outcome: "CLEAN", roll: 0.5, pool: 1_050_000, crewShare: 840_000, vaultPaid: true });
    expect((await testPrisma.caperCrew.findMany({ where: { caperId: caper.id } })).every((r) => r.settled && r.passed && r.liveSlot === caper.id)).toBe(true);
  });

  it("MESSY from one unlocked seat: that seat gets 0 and its share is never minted", async () => {
    const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { SAFECRACKER: "none" } });
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    expect([await wallet(ids.MASTERMIND), await wallet(ids.LOOKOUT), await wallet(ids.SAFECRACKER)]).toEqual([98_000, 98_000, 0]);
    expect(await fam(family.id)).toMatchObject({ earnings: 36_750, xp: 60 });
    expect((await user(ids.SAFECRACKER))!.crimeHeat).toBe(30);
  });

  it("BUST writes fine, heat and jail with each seat; a longer sentence is kept (T2)", async () => {
    const now = new Date();
    const { caper, family, ids } = await seedRunning({ tier: 2, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"], picks: { LOOKOUT: "wrong", SAFECRACKER: "wrong" }, wallet: 1_000_000, startedAt: new Date(+now - 200_000) });
    const later = new Date(+now + 9_000_000);
    await testPrisma.user.update({ where: { discordId: ids.SAFECRACKER }, data: { isJailed: true, jailReleaseTime: later } });
    // roll, then one jail roll per seat in ring order: MM jailed (0 < 0.2), LO free, SC jailed, DR free
    await resolveCaper(caper.id, now, OLD_BOOT, scriptedRng([5_000, 0, 9_999, 0, 9_999]));
    for (const id of Object.values(ids)) {
      expect(await wallet(id)).toBe(700_000);
      expect((await user(id))!.crimeHeat).toBe(45);
    }
    expect(await user(ids.MASTERMIND)).toMatchObject({ isJailed: true, jailReleaseTime: new Date(+now + 1_200_000) });
    expect(await user(ids.SAFECRACKER)).toMatchObject({ isJailed: true, jailReleaseTime: later });
    expect((await user(ids.LOOKOUT))!.isJailed).toBe(false);
    expect(await testPrisma.audit.count({ where: { type: "caper_fine", userId: { in: Object.values(ids) } } })).toBe(4);
    expect(await fam(family.id)).toMatchObject({ earnings: 0, xp: 30 });
  });

  it("two concurrent settlers draw once: every seat's money comes from one outcome", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], status: "SETTLING" });
    await Promise.allSettled([settleCaper(caper.id, after(caper), scriptedRng([0])), settleCaper(caper.id, after(caper), scriptedRng([9_999]))]);
    await settleCaper(caper.id, after(caper), scriptedRng([0]));                       // resume whatever the loser left
    const c = (await caperRow(caper.id))!;
    const cut = c.outcome === "CLEAN" ? 280_000 : 98_000;
    expect([c.roll, c.outcome]).toEqual(c.roll === 0 ? [0, "MESSY"] : [0.9999, "CLEAN"]);
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(cut);
    expect(await txCount("caper_cut", Object.values(ids))).toBe(3);
  });

  it("a crash after seat 2's credit resumes without paying anyone twice, using the first draw", async () => {
    const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3], status: "SETTLING" });
    fail.at = 2;
    await expect(settleCaper(caper.id, after(caper), scriptedRng([5_000]))).rejects.toThrow("boom");
    expect((await caperRow(caper.id))!.status).toBe("SETTLING");
    fail.at = 0;
    expect(await settleCaper(caper.id, after(caper), scriptedRng([0]))).toEqual({ resolvedNow: true, outcome: "CLEAN" });
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(280_000);
    expect((await fam(family.id))!.earnings).toBe(105_000);
  });

  it("the last lock's settle racing the sweeper pays one set (edge 25)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await Promise.allSettled([resolveCaper(caper.id, new Date(+caper.startedAt + 10_000), OLD_BOOT, scriptedRng([5_000])), resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]))]);
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(280_000);
  });

  it("an unlocked seat before goEndsAt is not due", async () => {
    const { caper } = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" } });
    expect((await resolveCaper(caper.id, new Date(+caper.startedAt + 10_000), OLD_BOOT)).status).toBe("not_due");
    expect((await caperRow(caper.id))!.status).toBe("RUNNING");
  });

  it.each([["inside the GO", 50_000], ["after the GO ended, still unsettled (C1)", 150_000]] as const)(
    "VOID: a restart %s with an unlocked seat refunds every stake and records nothing", async (_n, bootOffset) => {
      const startedAt = new Date(Date.now() - 200_000);
      const { caper, family, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" }, startedAt });
      expect(await resolveCaper(caper.id, after(caper), new Date(+startedAt + bootOffset))).toMatchObject({ status: "void", outcome: "VOID" });
      expect(await caperRow(caper.id)).toMatchObject({ status: "CANCELLED", outcome: "VOID", liveSlot: caper.id });
      for (const id of Object.values(ids)) { expect(await wallet(id)).toBe(50_000); expect((await user(id))!.crimeHeat).toBe(0); }
      const lw = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
      expect(await testPrisma.transaction.findFirst({ where: { walletId: lw!.id, type: "caper_stake_refund" } })).toMatchObject({ isEarned: false });
      expect((await testPrisma.caperCrew.findMany({ where: { caperId: caper.id } })).every((r) => !r.started && r.refunded && r.liveSlot === caper.id)).toBe(true);
      expect(await startedSeatsSince(ids.MASTERMIND, new Date(0))).toHaveLength(0);
      expect(await startedCapersSince(family.id, new Date(0))).toHaveLength(0);
      expect(await fam(family.id)).toMatchObject({ earnings: 0, xp: 0 });
    });

  it("a boot before startedAt settles normally; every seat locked never VOIDs", async () => {
    const startedAt = new Date(Date.now() - 200_000);
    const a = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" }, startedAt });
    expect((await resolveCaper(a.caper.id, after(a.caper), new Date(+startedAt - 1), scriptedRng([5_000]))).outcome).toBe("MESSY");
    await resetFamilies();
    const b = await seedRunning({ tier: 1, roles: [...R3], startedAt });
    expect((await resolveCaper(b.caper.id, after(b.caper), new Date(+startedAt + 50_000), scriptedRng([5_000]))).outcome).toBe("CLEAN");
  });

  it("corrupt answers on a RUNNING caper: VOID with refunds and a caper_corrupt audit (edge 63)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { answers: {} } });
    expect((await resolveCaper(caper.id, after(caper), OLD_BOOT)).status).toBe("void");
    expect(await testPrisma.audit.count({ where: { type: "caper_corrupt", userId: ids.MASTERMIND } })).toBe(1);
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(3);
  });

  it("a cut above MAX_SAFE_BALANCE is clamped and the excess is never minted (edge 20)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.wallet.update({ where: { userId: ids.LOOKOUT }, data: { balance: MAX_SAFE_BALANCE - 100_000 } });
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    expect(await wallet(ids.LOOKOUT)).toBe(MAX_SAFE_BALANCE);
    const w = await testPrisma.wallet.findUnique({ where: { userId: ids.LOOKOUT } });
    expect(await testPrisma.transaction.findFirst({ where: { walletId: w!.id, type: "caper_cut" } })).toMatchObject({ amount: 100_000, meta: expect.objectContaining({ capped: true }) });
  });

  it("the vault cut retries dues arrears (7.4)", async () => {
    const { caper, family } = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.family.update({ where: { id: family.id }, data: { duesArrears: 1 } });
    await resolveCaper(caper.id, after(caper), OLD_BOOT, scriptedRng([5_000]));
    expect(await fam(family.id)).toMatchObject({ earnings: 65_000, duesArrears: 0 });
  });
});
