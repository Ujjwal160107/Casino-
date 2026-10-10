import { describe, it, expect } from "vitest";
import { Collection } from "discord.js";
import { scopeMentionsToCommand } from "../../src/utils/commandMentions";

function fakeMentions(...ids: string[]) {
  const users = new Collection(ids.map((id) => [id, { id }] as [string, { id: string }]));
  const members = new Collection(ids.map((id) => [id, { id }] as [string, { id: string }]));
  return { users, members } as any;
}

describe("scopeMentionsToCommand", () => {
  it("drops the bot that was @mentioned to invoke the command", () => {
    const mentions = fakeMentions("bot");
    scopeMentionsToCommand(mentions, "profile");
    expect(mentions.users.first()).toBeUndefined();
    expect(mentions.members.size).toBe(0);
  });

  it("drops the replied-to user and keeps the typed target", () => {
    const mentions = fakeMentions("bot", "replied-to", "111");
    scopeMentionsToCommand(mentions, "rob <@111>");
    expect([...mentions.users.keys()]).toEqual(["111"]);
    expect([...mentions.members.keys()]).toEqual(["111"]);
  });

  it("accepts the legacy <@!id> nickname mention form", () => {
    const mentions = fakeMentions("bot", "222");
    scopeMentionsToCommand(mentions, "profile <@!222>");
    expect(mentions.users.first()?.id).toBe("222");
  });
});
