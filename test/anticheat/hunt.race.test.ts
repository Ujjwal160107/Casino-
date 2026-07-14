import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testRedis, flushTestKeys } from "../helpers";

process.env.REDIS_URL = process.env.TEST_REDIS_URL;

// Proves the SET NX reservation the hunt fix uses: only one concurrent caller
// can reserve hunt:<id>.
describe("hunt reservation", () => {
  const id = "hunt-race-1";
  beforeEach(() => flushTestKeys("hunt:*"));
  afterAll(() => testRedis().quit());

  it("only one of two concurrent reservations succeeds", async () => {
    const redis = testRedis();
    const key = `hunt:${id}`;
    const [a, b] = await Promise.all([
      redis.set(key, "1", "EX", 60, "NX"),
      redis.set(key, "1", "EX", 60, "NX"),
    ]);
    expect([a, b].filter((r) => r === "OK").length).toBe(1);
  });
});
