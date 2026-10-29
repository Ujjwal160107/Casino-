import { describe, it, expect, vi, afterAll } from "vitest";
import type { Client } from "discord.js";
import { testPrisma, seedUser, resetUser } from "../helpers";

vi.mock("../../src/services/dmNoticeService", () => ({ notifyTaxRaid: async () => {} }));

import { executeRaid } from "../../src/services/taxService";

// A raid used to zero heat even when it seized nothing, so banking the wallet
// before the hourly scan cleared 100+ heat for free instead of paying a Fixer.

const id = "heat-raid-1";
const client = {} as Client;
const heatOf = async () => (await testPrisma.user.findUnique({ where: { discordId: id } }))!.crimeHeat;

afterAll(() => resetUser(id));

describe("executeRaid", () => {
  it("keeps heat when the wallet is empty", async () => {
    await seedUser(id, { crimeHeat: 120 });
    const result = await executeRaid(id, client);
    expect(result.seized).toBe(0);
    expect(await heatOf()).toBe(120);
  });

  it("keeps heat when the wallet is too small to seize anything", async () => {
    await seedUser(id, { crimeHeat: 120, wallet: { create: { balance: 3 } } });
    const result = await executeRaid(id, client);
    expect(result.seized).toBe(0);
    expect(await heatOf()).toBe(120);
  });

  it("seizes part of the wallet and clears heat", async () => {
    await seedUser(id, { crimeHeat: 120, wallet: { create: { balance: 1_000_000 } } });
    const result = await executeRaid(id, client);
    expect(result.seized).toBeGreaterThanOrEqual(100_000);
    expect(result.seized).toBeLessThanOrEqual(250_000);
    expect(await heatOf()).toBe(0);
  });
});
