import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { PermissionFlagsBits, type Message } from "discord.js";
import { handleCrew } from "../../src/commands/economy/crew";
import { resolvePlayerTarget } from "../../src/utils/playerTarget";
import { routeMessage } from "../../src/commandRouter";
import { BOT_DEVELOPER_ID } from "../../src/utils/developerAccess";
import { CREW_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeDmClient } from "../dm/helpers";
import { fakeMessage, replyText } from "../router/fakeMessage";
import { testPrisma, seedUser, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, withCfConfig } from "../helpers";

const CREW_COPY = { verb: "Invite", bot: "Bots can't join a family." };

/** A guild message with the slices `!crew` reads: channel permissions, mentions, a client that DMs, replies with ids. */
function crewMessage(authorId: string, o: { mention?: { id: string; bot: boolean }; missing?: bigint[] } = {}) {
  const dm = fakeDmClient();
  const reply = vi.fn(async (_p: unknown) => ({ id: `r${reply.mock.calls.length}` }));
  const missing = new Set(o.missing ?? []);
  const client = Object.assign(dm.client, { user: { id: "bot" } });
  const message = {
    guildId: "g1",
    channelId: "c-new",
    guild: { id: "g1", members: { cache: new Map() } },
    channel: { id: "c-new", permissionsFor: () => ({ has: (flag: bigint) => !missing.has(flag) }) },
    author: { id: authorId, username: "CrewTest", bot: false },
    client,
    mentions: { members: { first: () => (o.mention ? { id: o.mention.id, user: { bot: o.mention.bot }, displayName: "M" } : undefined) } },
    reply,
  } as unknown as Message;
  const said = (n = 0) => replyText(reply.mock.calls[n][0]);
  return { message, reply, dm: dm.sent, said };
}

const crew = async (uid: string, line: string, o: Parameters<typeof crewMessage>[1] = {}) => {
  const m = crewMessage(uid, o);
  await withCfConfig({ enabled: true }, () => handleCrew(m.message, line.split(/\s+/).filter(Boolean)));
  return m;
};

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("resolvePlayerTarget (Review Focus 3)", () => {
  it("refuses a bot mention with the caller's copy", async () => {
    const { message } = crewMessage("u1", { mention: { id: "b1", bot: true } });
    expect(await resolvePlayerTarget(message, "<@b1>", CREW_COPY)).toEqual({ error: "Bots can't join a family." });
  });
  it("refuses an unknown id and an ambiguous name", async () => {
    const { message } = crewMessage("u1");
    expect(await resolvePlayerTarget(message, "99999999999999999", CREW_COPY)).toEqual({ error: "No Fortuna player with that ID." });
    await seedUser("100000000000009101", { username: "SameNameCrew" });
    await seedUser("100000000000009102", { username: "SameNameCrew" });
    expect(await resolvePlayerTarget(message, "samenamecrew", CREW_COPY))
      .toEqual({ error: "Multiple players share that name — invite them by user ID instead." });
  });
  it("!crew invite yourself is refused and writes no invite", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const m = await crew(boss, `invite ${boss}`);
    expect(m.said()).toContain("You can't invite yourself.");
    expect(await testPrisma.familyInvite.count()).toBe(0);
    expect(m.dm.size).toBe(0);
  });
});

describe("!crew", () => {
  it("invite posts S4 pinging only the invitee, stores the card and DMs them", async () => {
    const boss = await seedEligibleUser(); const invitee = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const m = await crew(boss, `invite ${invitee}`);
    expect(m.reply.mock.calls[0][0]).toMatchObject({ allowedMentions: { parse: [], users: [invitee] } });
    expect(await testPrisma.familyInvite.findFirst({ where: { inviteeId: invitee } })).toMatchObject({ messageId: "r1", channelId: "c-new" });
    expect([...m.dm.keys()]).toEqual([invitee]);
  });

  it("deposit refuses bad amounts; `all` clamps to the day's cap, then the cap refuses (Review Focus 1, P21)", async () => {
    const boss = await seedEligibleUser({ wallet: 40_000_000 });
    const f = await seedFamily({ bossId: boss });
    for (const bad of ["-5m", "abc"]) expect((await crew(boss, `deposit ${bad}`)).said()).toContain("Enter a positive amount like 250k or 5m");
    await crew(boss, "deposit all");
    expect((await testPrisma.wallet.findUnique({ where: { userId: boss } }))!.balance).toBe(15_000_000);
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.treasury).toBe(23_750_000);
    expect((await crew(boss, "deposit all")).said()).toContain("Daily deposit cap reached (0 left today).");
  });

  it("private subactions reply with an S27 opener owned by the caller", async () => {
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER" }] });
    const openers: [string, string][] = [
      ["vault", CREW_IDS.open("vault", boss)], ["payday", CREW_IDS.open("payday", boss)], ["levelup", CREW_IDS.open("level", boss)],
      ["log", CREW_IDS.open("log", boss)], ["leave", CREW_IDS.open("leave", boss)], ["rename", CREW_IDS.open("rename", boss)],
      ["disband", CREW_IDS.open("disband", boss)], ["create", CREW_IDS.createOpen(boss)],
      [`kick ${s}`, CREW_IDS.openTarget("kick", s, boss)], [`handover ${s}`, CREW_IDS.openTarget("chair", s, boss)],
    ];
    for (const [line, id] of openers) expect((await crew(boss, line)).said(), line).toContain(`"custom_id":"${id}"`);
  });

  it("home in a channel missing Attach Files names it and does not move home", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss });
    const m = await crew(boss, "home", { missing: [PermissionFlagsBits.AttachFiles] });
    expect(m.said()).toContain("Attach Files");
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.homeChannelId).toBe("c-home");
    await crew(boss, "home");
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.homeChannelId).toBe("c-new");
  });

  it("crew-forcerename renames with no fee for the developer and is Developer Only for anyone else", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "VLA", earnings: 1_000_000 });
    const other = fakeMessage("!crew-forcerename VLA Hijacked Name", { authorId: boss, guildId: "g1" });
    await routeMessage({} as any, other.message, "!");
    expect(replyText(other.reply.mock.calls[0][0])).toContain("Developer Only");
    const dev = fakeMessage("!crew-forcerename VLA New Name", { authorId: BOT_DEVELOPER_ID, guildId: "g1" });
    await routeMessage({} as any, dev.message, "!");
    expect(await testPrisma.family.findUnique({ where: { id: f.id } })).toMatchObject({ name: "New Name", earnings: 1_000_000, treasury: 0 });
  });
});
