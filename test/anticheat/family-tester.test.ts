import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { BOT_DEVELOPER_ID } from "../../src/utils/developerAccess";
import { createFamily } from "../../src/services/crimeFamily/familyService";
import { depositToVault } from "../../src/services/crimeFamily/vaultService";
import { executePayday } from "../../src/services/crimeFamily/paydayService";
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

// D34: testers get no Crime Families bypass. Every fee, tax, cap, interval
// and gate applies to an allowlisted developer exactly as to anyone else.

const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const create = () => createFamily({ uid: BOT_DEVELOPER_ID, username: "dev", name: "Velvet Ante", tag: "VLA", guildId: "g1", channelId: "c1" });

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember"]));
beforeEach(resetFamilies);

describe("testers get no family bypass (D34)", () => {
  it("createFamily debits the full 10,000,000", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000 });
    await create();
    expect(await wallet(BOT_DEVELOPER_ID)).toBe(30_000_000);
  });

  it("depositToVault charges 5% and holds the daily cap", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000 });
    const f = await seedFamily({ bossId: BOT_DEVELOPER_ID });
    const day = new Date("2026-11-04T10:00:00Z");
    expect(await depositToVault(BOT_DEVELOPER_ID, 20_000_000, day)).toMatchObject({ tax: 1_000_000, net: 19_000_000 });
    await expect(depositToVault(BOT_DEVELOPER_ID, 5_000_001, day)).rejects.toThrow(/cap/i);
    expect(await wallet(BOT_DEVELOPER_ID)).toBe(20_000_000);
    expect(await testPrisma.family.findUnique({ where: { id: f.id } })).toMatchObject({ treasury: 19_000_000 });
  });

  it("executePayday refuses before 7 days", async () => {
    const rule = { key: "test", label: "test seats", need: 1, count: async () => 1 };
    ACTIVITY_RULES.push(rule);
    try {
      await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 0 });
      const soldier = await seedEligibleUser();
      const f = await seedFamily({
        bossId: BOT_DEVELOPER_ID, earnings: 3_000_000, lastPaydayAt: daysAgo(6),
        members: [{ userId: soldier, role: "SOLDIER", joinedAt: daysAgo(10) }],
      });
      expect(await executePayday(f.id, BOT_DEVELOPER_ID, { earnings: 3_000_000, count: 2 })).toMatchObject({ status: "changed", reason: "Payday is not due yet." });
      expect(await wallet(BOT_DEVELOPER_ID)).toBe(0);
    } finally {
      ACTIVITY_RULES.splice(ACTIVITY_RULES.indexOf(rule), 1);
    }
  });

  it("a failing gate still fails", async () => {
    await seedEligibleUser({ id: BOT_DEVELOPER_ID, wallet: 40_000_000, shifts: 59 });
    await expect(create()).rejects.toThrow(/shifts/i);
    expect(await wallet(BOT_DEVELOPER_ID)).toBe(40_000_000);
  });

  it("no crime family service imports isTester", () => {
    const dir = path.join(__dirname, "../../src/services/crimeFamily");
    const offenders = fs.readdirSync(dir).filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("isTester"));
    expect(offenders).toEqual([]);
  });
});
