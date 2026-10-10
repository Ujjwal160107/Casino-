import { describe, it, expect, afterEach, vi } from "vitest";
import { redisService } from "../../src/services/redisService";
import { handleSpecialItemUse } from "../../src/services/shopItemEffects";

// setIfNotExists failed open on Redis errors, and it is the claim behind every
// item cooldown — so during an outage Energy Drinks etc. had no cooldown at all.

const uid = "cooldown-claim-redis-down-user";

describe("item cooldown claims fail closed when Redis errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("setIfNotExists reports not-claimed on a Redis error", async () => {
    vi.spyOn(redisService, "getInstance").mockImplementation(() => {
      throw new Error("redis down");
    });
    expect(await redisService.setIfNotExists(`test_claim:${uid}`, 1, 10)).toBe(false);
  });

  it("a buff item does not resolve while its cooldown can't be claimed", async () => {
    vi.spyOn(redisService, "getInstance").mockImplementation(() => {
      throw new Error("redis down");
    });
    const result = await handleSpecialItemUse("energy_drink", uid, "g");
    expect(result?.success).toBe(false);
    expect(result?.shouldConsume).toBe(false);
  });
});
