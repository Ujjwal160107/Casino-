import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { payBail } from "../../src/services/jailService";
import { DEFAULT_JAIL_FINE } from "../../src/utils/economyConfig";

// payBail checked "jailed" and the balance outside its write, so a double-click
// on Pay Bail charged the fine twice for one release.

const id = "bail-race-1";
const START = DEFAULT_JAIL_FINE * 5;

beforeEach(async () => {
  await seedUser(id, {
    isJailed: true,
    jailReleaseTime: new Date(Date.now() + 60 * 60 * 1000),
    wallet: { create: { balance: START } },
  });
});
afterAll(() => resetUser(id));

describe("payBail", () => {
  it("charges the fine once when bail is paid twice concurrently", async () => {
    const results = await Promise.all([payBail(id, "g1"), payBail(id, "g1")]);
    expect(results.filter((r) => r.success)).toHaveLength(1);

    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(START - DEFAULT_JAIL_FINE);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user!.isJailed).toBe(false);
  });

  it("does not charge a player who is no longer jailed", async () => {
    await testPrisma.user.update({ where: { discordId: id }, data: { isJailed: false, jailReleaseTime: null } });
    const result = await payBail(id, "g1");
    expect(result.success).toBe(false);
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet!.balance).toBe(START);
  });
});
