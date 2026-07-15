import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cooldownClaim } from "../../src/anticheat/claim";
import { testRedis, flushTestKeys } from "../helpers";

process.env.REDIS_URL = process.env.TEST_REDIS_URL;

describe("work active-shift lock", () => {
  const id = "work-race-1";
  beforeEach(() => flushTestKeys("ac_claim:work_active:*"));
  afterAll(() => testRedis().quit());

  it("blocks a second concurrent shift for the same user", async () => {
    const [a, b] = await Promise.all([
      cooldownClaim("work_active", id, 300),
      cooldownClaim("work_active", id, 300),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
  });

  it("allows a different user to start a shift", async () => {
    const a = await cooldownClaim("work_active", "work-user-A", 300);
    const b = await cooldownClaim("work_active", "work-user-B", 300);
    expect(a.ok && b.ok).toBe(true);
  });
});
