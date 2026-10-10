import { describe, it, expect, afterAll, vi } from "vitest";
import type { Message } from "discord.js";
import { handleAddMoney } from "../../src/commands/admin/addMoney";
import { handleSetMoney } from "../../src/commands/admin/setMoney";
import { BOT_DEVELOPER_ID } from "../../src/utils/developerAccess";
import { testPrisma, testRedis, seedUser, resetUser } from "../helpers";

const GUILD = "900000000000000001";

function adminMessage() {
  const reply = vi.fn(async (_p: unknown) => ({}) as Message);
  const message = {
    author: { id: BOT_DEVELOPER_ID, tag: "dev#0001" },
    member: {},
    guildId: GUILD,
    guild: { id: GUILD },
    client: {},
    reply,
  } as unknown as Message;
  return { message, reply };
}

const HANDLERS = { "add-money": handleAddMoney, "set-money": handleSetMoney };

describe("admin money commands' target", () => {
  // A fresh player per case: the commands write bank, audit and transaction
  // rows that resetUser does not clear, so a reused id cannot be reseeded.
  let next = 950;
  const used: string[] = [];
  afterAll(() => Promise.all(used.map((id) => resetUser(id))));

  it.each(["add-money", "set-money"] as const)("%s refuses a target that is not a user id", async (name) => {
    const { message, reply } = adminMessage();
    await HANDLERS[name](message, ["notauser", "100"]);

    expect(JSON.stringify(reply.mock.calls)).toContain("Invalid User");
    expect(await testPrisma.user.findUnique({ where: { discordId: "notauser" } })).toBeNull();
  });

  it.each([
    ["add-money", "wallet"],
    ["add-money", "bank"],
    ["set-money", "wallet"],
    ["set-money", "bank"],
  ] as const)("%s (%s) drops the target's cached profile", async (name, target) => {
    const real = `100000000000000${next++}`;
    used.push(real);
    await seedUser(real);
    await testRedis().set(`user:${real}`, JSON.stringify({ stale: true }));

    const { message } = adminMessage();
    await HANDLERS[name](message, [`<@${real}>`, "500", target]);

    expect(await testRedis().get(`user:${real}`)).toBeNull();
  });
});
