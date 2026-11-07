import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { handleCaper } from "../../src/commands/economy/caper";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { planCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig, seedEligibleUser, seedFamily } from "../helpers";
import { caperCrew, fakeCaperClient, G, CH } from "./caperFixtures";
import { fakeSelect, said } from "./fakeInteraction";
import { visibleText } from "./visibleText";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);
const press = async (i: any) => { await handleCrimeFamilyInteraction(i); return i; };

/** `!heist <args>` as uid in another server's channel; the reply payloads as visible text and JSON. */
async function heist(fc: ReturnType<typeof fakeCaperClient>, uid: string, args: string[], guildId = "g2", channelId = "c-far") {
  const reply = vi.fn(async (_p: unknown) => ({ id: "r1" }));
  const message = { client: fc.client, guildId, guild: { id: guildId }, channelId, channel: fc.channel(channelId), author: { id: uid, username: "T", bot: false }, reply } as any;
  await handleCaper(message, args);
  return { text: reply.mock.calls.map((c) => visibleText(c[0])).join("\n"), json: JSON.stringify(reply.mock.calls) };
}

async function lobbyWithCard() {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const fc = fakeCaperClient();
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
  const cardId = (await postCaperCard(fc.client, c.id, CH))!;
  return { ...f, fc, c, cardId };
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

describe("personal cards (amendment 5.2, 5.4)", () => {
  it("!heist in another server posts the S25 lobby card; in the lobby's server it reposts the card", () => open(async () => {
    const { ids, fc, c, cardId } = await lobbyWithCard();
    const far = await heist(fc, ids.LOOKOUT, []);
    expect(far.text).toContain("crew heist lobby: Pawnshop Back Room");
    expect(far.text).toContain(`[Go to the lobby](https://discord.com/channels/${G}/${CH}/${cardId})`);
    expect(far.json).toContain(CPR_IDS.join(c.id));
    expect(far.text).not.toContain("another server");
    const sends = fc.sent.length;
    await heist(fc, ids.LOOKOUT, [], G, CH);
    expect(fc.sent.length).toBe(sends + 1);                                  // C7 repost in the lobby's own server
  }));

  it("join, brief, start and cancel work from another server", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    expect((await heist(fc, ids.LOOKOUT, ["join", "lookout"])).text).toContain("seated as **Lookout**");
    expect((await heist(fc, ids.SAFECRACKER, ["join", "safecracker"])).text).toContain("seated as **Safecracker**");
    await heist(fc, ids.MASTERMIND, ["start"]);
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("RUNNING");
    expect((await heist(fc, ids.LOOKOUT, ["brief"])).json).toContain(CPR_IDS.openBrief(c.id, ids.LOOKOUT));
    expect((await heist(fc, ids.LOOKOUT, [])).text).toContain("GO is live: open your brief.");
    expect((await heist(fc, ids.DRIVER, [])).text).toContain("crew heist is under way");
  }));

  it("cancel from another server refunds every stake", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    await heist(fc, ids.LOOKOUT, ["join", "lookout"]);
    expect((await heist(fc, ids.MASTERMIND, ["cancel"])).text).toContain("every stake was refunded");
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CANCELLED");
  }));

  it("a join on the shared card leaves it to the card writer; a join on an S25 lobby card edits that card to the presser's seat", () => open(async () => {
    const { ids, fc, c, cardId } = await lobbyWithCard();
    const onCard = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: ids.LOOKOUT, guildId: G, messageId: cardId, client: fc.client }));
    expect(onCard.editReply).not.toHaveBeenCalled();
    const off = await press(fakeSelect(CPR_IDS.join(c.id), ["SAFECRACKER"], { userId: ids.SAFECRACKER, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
    expect(visibleText(off.editReply.mock.calls.at(-1)[0])).toContain(`<@${ids.SAFECRACKER}> seated as **Safecracker**`);
  }));

  it("a join that fills the crew shows the GO-live card, not the lobby copy (G3, edge 7)", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    await heist(fc, ids.LOOKOUT, ["join", "lookout"]);
    await heist(fc, ids.SAFECRACKER, ["join", "safecracker"]);
    const last = await press(fakeSelect(CPR_IDS.join(c.id), ["DRIVER"], { userId: ids.DRIVER, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
    const text = visibleText(last.editReply.mock.calls.at(-1)[0]);
    expect(text).toContain("GO is live: open your brief.");
    expect(text).not.toContain("GO starts when");
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("RUNNING");
  }));

  it("an S25 lobby card pressed by another family's member is refused and not edited (Review Focus 2)", () => open(async () => {
    const { c, fc } = await lobbyWithCard();
    const outsider = await seedEligibleUser({ wallet: 9_000_000, prepKeys: ["camouflage_kit"] });
    await seedFamily({ bossId: await seedEligibleUser(), members: [{ userId: outsider, role: "SOLDIER" }] });
    const before = (await testPrisma.wallet.findUnique({ where: { userId: outsider } }))!.balance;
    const i = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: outsider, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
    expect(said(i)).toContain("This crew heist belongs to another family.");
    expect(i.editReply.mock.calls.every((call: any[]) => !visibleText(call[0]).includes("seated as"))).toBe(true);
    expect((await testPrisma.wallet.findUnique({ where: { userId: outsider } }))!.balance).toBe(before);
  }));
});
