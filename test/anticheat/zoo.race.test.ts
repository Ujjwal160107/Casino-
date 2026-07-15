import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("zoo claim CAS", () => {
  const id = "zoo-race-1";
  beforeEach(() => seedUser(id, { lastZooClaim: new Date(Date.now() - 5 * 3_600_000) }));
  afterAll(() => resetUser(id));

  it("only one concurrent claim advances lastZooClaim", async () => {
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    const prior = user!.lastZooClaim;
    const now = new Date();
    const claim = () => conditionalClaim(() =>
      testPrisma.user.updateMany({ where: { discordId: id, lastZooClaim: prior }, data: { lastZooClaim: now } }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
