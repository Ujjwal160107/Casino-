import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createFamily, forceRenameFamily } from "../../src/services/crimeFamily/familyService";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes } from "../helpers";

const todayKey = () => new Date().toISOString().slice(0, 10);

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const create = (uid: string, name = "Velvet Ante", tag = "VLA") => createFamily({ uid, username: "u", name, tag, guildId: "g1", channelId: "c1" });

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("createFamily (6.1)", () => {
  it("burns 10,000,000 and seats the founder as Boss", async () => {
    const uid = await seedEligibleUser({ wallet: 15_000_000 });
    const fam = await create(uid);
    expect(await wallet(uid)).toBe(5_000_000);
    expect(fam).toMatchObject({ level: 1, nameKey: "velvet ante", tagKey: "VLA", bossId: uid, homeGuildId: "g1", homeChannelId: "c1", duesDayKey: todayKey() });
    expect(await testPrisma.familyMember.findUnique({ where: { userId: uid } })).toMatchObject({ role: "BOSS", roleSlot: "BOSS", seat: 1 });
    expect(await testPrisma.familyLedger.findFirst({ where: { familyId: fam.id } })).toMatchObject({ type: "create_fee", amount: 0, meta: { paid: 10_000_000 } });
    expect(await testPrisma.audit.count({ where: { userId: uid, type: "family_create" } })).toBe(1);
  });

  it("refuses a failing gate before any debit", async () => {
    const uid = await seedEligibleUser({ wallet: 15_000_000, shifts: 59 });
    await expect(create(uid)).rejects.toThrow(/shifts/i);
    expect(await wallet(uid)).toBe(15_000_000);
  });

  it("forceRenameFamily applies the name rules and maps a taken name", async () => {
    await seedFamily({ bossId: await seedEligibleUser(), name: "Taken Name", tag: "TKN" });
    const f = await seedFamily({ bossId: await seedEligibleUser(), tag: "VLA" });
    await expect(forceRenameFamily("VLA", "Velvet  Ante", "admin")).rejects.toThrow("No double spaces.");
    await expect(forceRenameFamily("VLA", "taken name", "admin")).rejects.toThrow("Name taken.");
    expect(await forceRenameFamily("vla", "Fresh Name", "admin")).toMatchObject({ id: f.id, name: "Fresh Name", nameKey: "fresh name" });
  });

  it("one user double-creating gets one family and one debit", async () => {
    const uid = await seedEligibleUser({ wallet: 25_000_000 });
    await Promise.allSettled([create(uid, "Alpha Crew", "ALP"), create(uid, "Beta Crew", "BET")]);
    expect(await testPrisma.family.count()).toBe(1);
    expect(await wallet(uid)).toBe(15_000_000);
  });

  it("two users racing for one name: one family, the loser keeps their money", async () => {
    const a = await seedEligibleUser({ wallet: 15_000_000 });
    const b = await seedEligibleUser({ wallet: 15_000_000 });
    const rs = await Promise.allSettled([create(a, "Velvet Ante", "VLA"), create(b, "velvet ante", "VLB")]);
    expect(rs.filter((r) => r.status === "rejected").map((r: any) => r.reason.message)).toEqual(["Name or tag taken."]);
    expect([await wallet(a), await wallet(b)].sort((x, y) => x - y)).toEqual([5_000_000, 15_000_000]);
  });
});
