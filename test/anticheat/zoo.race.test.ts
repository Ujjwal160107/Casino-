import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim, userDateUnchanged } from "../../src/anticheat/claim";
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
      testPrisma.user.updateMany({ where: { discordId: id, ...userDateUnchanged("lastZooClaim", prior) }, data: { lastZooClaim: now } }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});

// Regression: a user who has NEVER claimed zoo income has an *absent* lastZooClaim
// field (user.create never writes it, the column has no default). Prisma reads it
// back as null, but Prisma's MongoDB connector does NOT match an absent field with
// a plain `{ lastZooClaim: null }` filter — so the window CAS matched zero rows and
// these users were stuck on "Already collecting — try again in a moment." forever.
// See src/anticheat/claim.ts:userDateUnchanged.
describe("zoo claim CAS — never-claimed user (absent lastZooClaim)", () => {
  const id = "zoo-race-absent";
  beforeEach(() => seedUser(id)); // no lastZooClaim override -> field is absent in Mongo
  afterAll(() => resetUser(id));

  it("reads lastZooClaim back as null when the field was never written", async () => {
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user!.lastZooClaim).toBeNull();
  });

  it("a plain `{ lastZooClaim: null }` filter does NOT match an absent field (the bug)", async () => {
    const bugged = await conditionalClaim(() =>
      testPrisma.user.updateMany({
        where: { discordId: id, lastZooClaim: null },
        data: { lastZooClaim: new Date() },
      }));
    expect(bugged).toBe(false); // count 0 — exactly what stuck players hit
  });

  it("userDateUnchanged matches the absent field so the first claim wins", async () => {
    const won = await conditionalClaim(() =>
      testPrisma.user.updateMany({
        where: { discordId: id, ...userDateUnchanged("lastZooClaim", null) },
        data: { lastZooClaim: new Date() },
      }));
    expect(won).toBe(true);
  });

  it("only one of two concurrent first-claims wins (no double-credit)", async () => {
    const claim = () => conditionalClaim(() =>
      testPrisma.user.updateMany({
        where: { discordId: id, ...userDateUnchanged("lastZooClaim", null) },
        data: { lastZooClaim: new Date() },
      }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
