import { describe, it, expect, afterAll } from "vitest";
import { seedUser, resetUser } from "../helpers";
import { activeBanMessage } from "../../src/services/banService";

// Buttons, menus and modals bypass the command router, so index.ts gates them
// with activeBanMessage. It must agree with the router's rule.

const id = "ban-gate-1";
const hour = 60 * 60 * 1000;

afterAll(() => resetUser(id));

describe("activeBanMessage", () => {
  it("lets an unbanned user act", async () => {
    await seedUser(id);
    expect(await activeBanMessage(id)).toBeNull();
  });

  it("lets a user act once a timed ban has expired", async () => {
    await seedUser(id, { isBanned: true, banExpiresAt: new Date(Date.now() - hour) });
    expect(await activeBanMessage(id)).toBeNull();
  });

  it("blocks a user during a timed ban", async () => {
    await seedUser(id, { isBanned: true, banExpiresAt: new Date(Date.now() + hour) });
    expect(await activeBanMessage(id)).toMatch(/banned from the casino until/);
  });

  it("blocks a permanently banned user", async () => {
    await seedUser(id, { isBanned: true, banExpiresAt: null });
    expect(await activeBanMessage(id)).toBe("You are permanently banned from the casino.");
  });

  it("lets an unknown user act", async () => {
    await resetUser(id);
    expect(await activeBanMessage(id)).toBeNull();
  });
});
