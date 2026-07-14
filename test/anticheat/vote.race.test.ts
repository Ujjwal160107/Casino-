import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

// Mirrors the exact CAS the vote fix uses, proven against the real DB.
async function claimVoteWindow(discordId: string, prior: Date | null, now: Date) {
  return conditionalClaim(() =>
    testPrisma.user.updateMany({
      where: { discordId, lastVote: prior },
      data: { lastVote: now },
    })
  );
}

describe("vote window CAS", () => {
  const id = "vote-race-1";
  beforeEach(() => seedUser(id, { lastVote: null }));
  afterAll(() => resetUser(id));

  it("only one of two concurrent claims wins", async () => {
    const now = new Date();
    const [a, b] = await Promise.all([
      claimVoteWindow(id, null, now),
      claimVoteWindow(id, null, now),
    ]);
    expect([a, b].filter(Boolean).length).toBe(1);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.lastVote?.getTime()).toBe(now.getTime());
  });
});
