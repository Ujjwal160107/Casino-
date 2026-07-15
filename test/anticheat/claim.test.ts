import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cooldownClaim, conditionalClaim } from "../../src/anticheat/claim";
import { testRedis, flushTestKeys } from "../helpers";

// Point the app's redisService at the test instance for this suite.
process.env.REDIS_URL = process.env.TEST_REDIS_URL;

describe("cooldownClaim", () => {
  beforeEach(() => flushTestKeys("ac_claim:*"));
  afterAll(() => testRedis().quit());

  it("grants the claim when the key is free", async () => {
    const c = await cooldownClaim("unit", "userA", 60);
    expect(c.ok).toBe(true);
  });

  it("rejects a second concurrent claim for the same scope+user", async () => {
    const [a, b] = await Promise.all([
      cooldownClaim("unit", "userB", 60),
      cooldownClaim("unit", "userB", 60),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const loser = a.ok ? b : a;
    expect(loser.retryAtUnix).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("release() frees the key for the next claim", async () => {
    const first = await cooldownClaim("unit", "userC", 60);
    expect(first.ok).toBe(true);
    await first.release();
    const second = await cooldownClaim("unit", "userC", 60);
    expect(second.ok).toBe(true);
  });
});

describe("conditionalClaim", () => {
  it("returns true only when exactly one row changed", async () => {
    expect(await conditionalClaim(async () => ({ count: 1 }))).toBe(true);
    expect(await conditionalClaim(async () => ({ count: 0 }))).toBe(false);
    expect(await conditionalClaim(async () => ({ count: 2 }))).toBe(false);
  });
});
