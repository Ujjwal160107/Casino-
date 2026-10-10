import { describe, it, expect, afterAll, vi } from "vitest";
import type { Client } from "discord.js";
import { routeMessage } from "../../src/commandRouter";
import { seedUser, resetUser } from "../helpers";
import { fakeMessage, replyText } from "./fakeMessage";

// The router's import graph reaches image rendering; the native canvas binding
// is not built in the test environment and nothing dispatched here draws.
vi.mock("canvas", () => ({}));

const GUILD = "900000000000000001";

// A fresh player per case: handlers provision rows (bank, cards) that
// resetUser does not know about, which would make a reused id un-reseedable.
let next = 200;
const used: string[] = [];
async function freshUser(overrides = {}) {
  const id = `100000000000000${next++}`;
  used.push(id);
  await seedUser(id, overrides);
  return id;
}

async function route(content: string, authorId: string) {
  const { message, reply } = fakeMessage(content, { authorId, guildId: GUILD });
  await routeMessage({} as Client, message, "/");
  return reply.mock.calls.map((c) => replyText(c[0])).join("\n");
}

describe("routeMessage dispatch", () => {
  afterAll(() => Promise.all(used.map((id) => resetUser(id))));

  it.each(["setrob", "set-rob"])("reaches the setrob handler for %s", async (cmd) => {
    const out = await route(`!${cmd}`, await freshUser());
    expect(out).not.toContain("Removed Command");
    // No member on the fake message, so the handler's own permission gate answers.
    expect(out).toContain("No Permission");
  });

  const RESTRICTED_ALIASES = [
    "transfer", "give", "ask", "ask-money", "askmoney", "creditcard", "credit-card",
    "steal", "store", "slot", "cock-fight", "cock", "stocks", "stock-market", "stockmarket",
    "job", "myjob", "bm", "black-market", "blackmarket", "cockstore", "cock-store", "cs",
  ];

  it.each(RESTRICTED_ALIASES)("keeps a jailed player out of %s", async (cmd) => {
    const id = await freshUser({ isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) });
    const out = await route(`!${cmd}`, id);
    expect(out).toContain("You are in Jail");
  });

  it.each(["give", "store", "cock", "myjob", "credit-card", "slot"])("still routes the %s alias when free", async (cmd) => {
    const out = await route(`!${cmd}`, await freshUser());
    expect(out).not.toContain("Unknown Command");
    expect(out).not.toContain("You are in Jail");
  });

  it.each(["mycards", "my-cards", "mycard"])("routes %s to the card dashboard", async (cmd) => {
    const out = await route(`!${cmd}`, await freshUser());
    expect(out).not.toContain("Unknown Command");
    expect(out.length).toBeGreaterThan(0);
  });
});
