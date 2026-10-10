import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import type { Client } from "discord.js";
import { routeMessage } from "../../src/commandRouter";
import { seedUser, resetUser } from "../helpers";
import { fakeMessage, replyText } from "./fakeMessage";

// The router's import graph reaches image rendering; the native canvas binding
// is not built in the test environment and nothing dispatched here draws.
vi.mock("canvas", () => ({}));

const GUILD = "900000000000000001";

async function route(content: string, authorId: string) {
  const { message, reply } = fakeMessage(content, { authorId, guildId: GUILD });
  await routeMessage({} as Client, message, "/");
  return reply.mock.calls.map((c) => replyText(c[0])).join("\n");
}

describe("routeMessage dispatch", () => {
  const id = "100000000000000201";
  beforeEach(() => seedUser(id));
  afterAll(() => resetUser(id));

  it.each(["setrob", "set-rob"])("reaches the setrob handler for %s", async (cmd) => {
    const out = await route(`!${cmd}`, id);
    expect(out).not.toContain("Removed Command");
    // No member on the fake message, so the handler's own permission gate answers.
    expect(out).toContain("No Permission");
  });
});
