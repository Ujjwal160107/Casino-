import { describe, it, expect, afterAll, vi } from "vitest";

// The router's import graph reaches image rendering; the native canvas binding
// is not built in the test environment and no gate under test draws anything.
vi.mock("canvas", () => ({}));
import type { Client } from "discord.js";
import { routeMessage } from "../../src/commandRouter";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { fakeMessage, replyText } from "./fakeMessage";

describe("routeMessage outside a guild", () => {
  const id = "100000000000000101";
  afterAll(() => resetUser(id));

  it("refuses a banned user's DM command instead of running it ungated", async () => {
    await seedUser(id, { isBanned: true });
    const { message, reply } = fakeMessage("!daily", { authorId: id, guildId: null });

    await routeMessage({} as Client, message, "/");

    expect(reply).toHaveBeenCalledTimes(1);
    expect(replyText(reply.mock.calls[0][0])).toContain("only work inside a server");
    // The daily handler never ran, so no reward landed in the wallet.
    const wallet = await testPrisma.wallet.findUnique({ where: { userId: id } });
    expect(wallet?.balance).toBe(0);
  });
});
