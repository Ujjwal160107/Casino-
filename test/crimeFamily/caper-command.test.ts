import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { handleCaper, parseRoleArg } from "../../src/commands/economy/caper";
import { planCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig } from "../helpers";
import { caperCrew, seedRunning, fakeCaperClient, setCaperUpdatedAt, G, CH } from "./caperFixtures";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const fileNames = (payload: any): string[] => (payload.files ?? []).map((f: any) => f.name);
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);

/** Runs `!caper <args>` as uid in channelId; `said()` is every reply payload as JSON. */
async function run(fc: ReturnType<typeof fakeCaperClient>, uid: string, args: string[], channelId = CH) {
  const reply = vi.fn(async (_p: unknown) => ({ id: "r1" }));
  const message = { client: fc.client, guildId: G, guild: { id: G }, channelId, channel: fc.channel(channelId), author: { id: uid, username: "T", bot: false }, reply } as any;
  await handleCaper(message, args);
  return { reply, said: () => JSON.stringify(reply.mock.calls) };
}
async function lobby() {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const fc = fakeCaperClient({ members: Object.values(f.ids) });
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
  return { ...f, fc, c };
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

describe("parseRoleArg (Review Focus 2)", () => {
  it.each([["LOOKOUT", "LOOKOUT"], ["lookout", "LOOKOUT"], [" Safecracker ", "SAFECRACKER"], ["safe cracker", "SAFECRACKER"], ["Safe-Cracker", "SAFECRACKER"], ["safe_cracker", "SAFECRACKER"], ["mastermind", "MASTERMIND"], ["hacker", "HACKER"], ["boss", null], [undefined, null]] as const)(
    "%s → %s", (raw, want) => expect(parseRoleArg(raw)).toBe(want));
});

describe("!caper", () => {
  it("join refusals name the reason and debit nothing (Review Focus 2)", () => open(async () => {
    const { ids, fc } = await lobby();
    const before = await wallet(ids.LOOKOUT);
    expect((await run(fc, ids.LOOKOUT, ["join", "mastermind"])).said()).toContain("The Mastermind seat belongs to the planner.");
    expect((await run(fc, ids.LOOKOUT, ["join", "hacker"])).said()).toContain("That role is not part of this caper.");
    expect((await run(fc, ids.LOOKOUT, ["join", "wizard"])).said()).toContain("Unknown role. Roles: Lookout, Safecracker, Driver, Muscle, Hacker.");
    expect(await wallet(ids.LOOKOUT)).toBe(before);
  }));

  it("!caper join safe cracker seats the member as SAFECRACKER (the whole remainder is the role)", () => open(async () => {
    const { ids, fc, c } = await lobby();
    await run(fc, ids.SAFECRACKER, ["join", "safe", "cracker"]);
    expect(await testPrisma.caperCrew.findFirst({ where: { caperId: c.id, userId: ids.SAFECRACKER } })).toMatchObject({ role: "SAFECRACKER" });
  }));

  it("!caper plan 1 posts S12 and stores its id; plan 9 is refused", () => open(async () => {
    const { family, ids } = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient();
    expect((await run(fc, ids.MASTERMIND, ["plan", "9"])).said()).toContain("Pick a tier from 1 to 4.");
    await run(fc, ids.MASTERMIND, ["plan", "1"]);
    expect(fc.sent).toHaveLength(1);
    expect(fileNames(fc.sent[0].payload)).toEqual(["cf_caper_t1.png"]);
    expect((await testPrisma.caper.findFirstOrThrow({ where: { familyId: family.id } })).messageId).toBe("m1");
  }));

  it("!caper join lookout from another channel replies S25 with the jump link and an Open brief button", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const mid = await postCaperCard(fc.client, c.id, CH);
    const m = await run(fc, ids.LOOKOUT, ["join", "lookout"], "c2");
    expect(m.said()).toContain(`https://discord.com/channels/${G}/${CH}/${mid}`);
    expect(m.said()).toContain(`cpr:brief:${c.id}`);
  }));

  it("!caper with a live lobby in this guild reposts it (Review Focus 4)", () => open(async () => {
    const { ids, fc, c } = await lobby();
    const mid = await postCaperCard(fc.client, c.id, CH);
    await run(fc, ids.LOOKOUT, [], "c2");
    expect(fc.sent.map((s) => s.channelId)).toEqual([CH, "c2"]);
    expect(JSON.stringify(fc.edits.find((e) => e.messageId === mid)!.payload.components.map((x: any) => x.toJSON()))).toContain("Lobby moved");
  }));

  it("!caper reposts a dead result from 10 minutes ago and shows S11 for one from 2 hours ago (C7)", () => open(async () => {
    const r = await seedRunning({ tier: 1, roles: [...R3] });
    await testPrisma.caper.update({ where: { id: r.caper.id }, data: { status: "RESOLVED", liveSlot: r.caper.id, outcome: "CLEAN", messageId: "" } });
    await setCaperUpdatedAt(r.caper.id, new Date(Date.now() - 600_000));
    const fc = fakeCaperClient();
    await run(fc, r.ids.LOOKOUT, []);
    expect(fc.sent).toHaveLength(1);
    expect(fileNames(fc.sent[0].payload)).toEqual(["cf_result_clean.png"]);
    await testPrisma.caper.update({ where: { id: r.caper.id }, data: { messageId: "" } });
    await setCaperUpdatedAt(r.caper.id, new Date(Date.now() - 7_200_000));
    const m = await run(fc, r.ids.LOOKOUT, []);
    expect(fc.sent).toHaveLength(1);
    expect(m.said()).toContain("How a caper works");
  }));

  it("!caper brief with a running seat replies an S27 opener; without one, No caper is running.", async () => {
    const r = await seedRunning({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    expect((await run(fc, r.ids.LOOKOUT, ["brief"])).said()).toContain(CPR_IDS.openBrief(r.caper.id, r.ids.LOOKOUT));
    await testPrisma.caper.update({ where: { id: r.caper.id }, data: { status: "RESOLVED", liveSlot: r.caper.id } });
    await testPrisma.caperCrew.updateMany({ where: { caperId: r.caper.id }, data: { liveSlot: r.caper.id } });
    expect((await run(fc, r.ids.LOOKOUT, ["brief"])).said()).toContain("No caper is running.");
  });
});
