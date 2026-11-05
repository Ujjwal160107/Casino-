// test/crimeFamily/caper-flow.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { ComponentType } from "discord.js";
import { planCaper, joinCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { openBrief, lockChoice } from "../../src/services/crimeFamily/caperPlayService";
import { parseAnswers } from "../../src/services/crimeFamily/intelRing";
import { postCaperCard, renderCaperCard, requestCaperRender } from "../../src/ui/crimeFamily/caperCard";
import { trailingRender } from "../../src/ui/crimeFamily/debounce";
import { onSeatsChanged, runStart, resolveAndAnnounce, announceLobby } from "../../src/ui/crimeFamily/caperFlow";
import { redisService } from "../../src/services/redisService";
import { testPrisma, testRedis, resetFamilies, ensureUniqueIndexes, flushTestKeys, seedEligibleUser } from "../helpers";
import { caperCrew, seedLobby, fakeCaperClient, setCaperUpdatedAt, G, CH } from "./caperFixtures";

const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const JOINERS = ["LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const caperRow = (id: string) => testPrisma.caper.findUniqueOrThrow({ where: { id } });
const json = (payload: any) => payload.components.map((c: any) => c.toJSON());
const text = (payload: any) => JSON.stringify(json(payload));
const types = (payload: any) => { const t: number[] = []; const walk = (x: any) => { if (x.type) t.push(x.type); (x.components ?? []).forEach(walk); if (x.accessory) walk(x.accessory); }; json(payload).forEach(walk); return t; };
const fileNames = (payload: any): string[] => (payload.files ?? []).map((f: any) => f.name);
const isGoCall = (s: { payload: any }) => Array.isArray(s.payload.allowedMentions?.users);

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

async function postedLobby(now = new Date()) {
  const f = await caperCrew({ tier: 1, roles: [...T1] });
  const fc = fakeCaperClient({ members: Object.values(f.ids) });
  const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
  const mid = await postCaperCard(fc.client, c.id, CH);
  return { ...f, fc, c, mid: mid! };
}

describe("caper card and flow (13.2, 8.4)", () => {
  it("plan → card → joins → auto-start → GO → result", async () => {
    const { ids, fc, c, mid } = await postedLobby();
    expect(fc.sent).toHaveLength(1);
    expect(fileNames(fc.sent[0].payload)).toEqual(["cf_caper_t1.png"]);
    expect(fc.sent[0].payload.allowedMentions).toEqual({ parse: [] });
    expect((await caperRow(c.id)).messageId).toBe(mid);

    for (const r of JOINERS) {
      const j = await joinCaper({ caperId: c.id, uid: ids[r], role: r, guildId: G });
      await onSeatsChanged(fc.client, c.id, j.full);
    }
    const run = await caperRow(c.id);
    expect(run.status).toBe("RUNNING");
    const goEdit = fc.edits.find((e) => e.messageId === mid && text(e.payload).includes(`cpr:brief:${c.id}`))!;
    expect(fileNames(goEdit.payload)).toEqual([]);
    const go = fc.sent.filter(isGoCall);
    expect(go).toHaveLength(1);
    expect([...go[0].payload.allowedMentions.users].sort()).toEqual(Object.values(ids).sort());
    for (const id of Object.values(ids)) expect(fc.dms.get(id)).toBe(1);   // the GO DM (caper_lobby)

    const answers = parseAnswers(run.answers)!;
    const t = new Date(+run.startedAt + 5_000);
    for (const r of T1) { await openBrief(c.id, ids[r], t); await lockChoice(c.id, ids[r], answers.seats[r]!.correct, t); }
    expect(await resolveAndAnnounce(fc.client, c.id, new Date(+run.goEndsAt + 1_000), new Date(0))).toMatchObject({ status: "settled", resolvedNow: true });
    const last = fc.edits.filter((e) => e.messageId === mid).at(-1)!;
    expect(fileNames(last.payload)[0]).toMatch(/^cf_result_(clean|messy)\.png$/);
    expect(last.payload.attachments).toEqual([]);
    expect(types(last.payload)).not.toContain(ComponentType.ActionRow);
  });

  it("Start racing the last join's auto-start posts one GO message (Review Focus 5)", async () => {
    const { ids, fc, c } = await postedLobby();
    for (const r of JOINERS) await joinCaper({ caperId: c.id, uid: ids[r], role: r, guildId: G });
    await Promise.allSettled([onSeatsChanged(fc.client, c.id, true), runStart(fc.client, c.id, { kind: "press", uid: ids.MASTERMIND })]);
    expect(fc.sent.filter(isGoCall)).toHaveLength(1);
    for (const id of Object.values(ids)) expect(fc.dms.get(id)).toBe(1);
  });

  it("a 50013 on render marks the board dead after one failed repost; the next render is skipped (Review Focus 4)", async () => {
    const { ids, fc, c } = await postedLobby();
    const ch = fc.channel(CH);
    fc.editFailures.push({ code: 50013 }); fc.sendFailures.push({ code: 50013 });
    expect(await renderCaperCard(fc.client, c.id)).toBe("dead");
    expect((await caperRow(c.id)).messageId).toBe("");
    const calls = ch.send.mock.calls.length + ch.messages.edit.mock.calls.length;
    expect(await renderCaperCard(fc.client, c.id)).toBe("skipped");
    expect(ch.send.mock.calls.length + ch.messages.edit.mock.calls.length).toBe(calls);
    let full = false;
    for (const r of JOINERS) full = (await joinCaper({ caperId: c.id, uid: ids[r], role: r, guildId: G })).full;
    expect(full).toBe(true);
    expect((await runStart(fc.client, c.id, { kind: "auto" })).status).toBe("started");
    for (const id of Object.values(ids)) expect(fc.dms.get(id)).toBe(1);
  });

  it("a rejected edit is retried once with the banner and attachments: [] (C5)", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    fc.editFailures.push({ code: 50035 });
    expect(await renderCaperCard(fc.client, caper.id)).toBe("ok");
    const edit = fc.channel(CH).messages.edit;
    expect(edit).toHaveBeenCalledTimes(2);
    expect(fileNames(edit.mock.calls[0][1])).toEqual([]);
    expect(fileNames(edit.mock.calls[1][1])).toEqual(["cf_caper_t1.png"]);
    expect(edit.mock.calls[1][1].attachments).toEqual([]);
  });

  it("the trailing debounce renders the last of two joins inside 2 s", async () => {
    const { ids, fc, c, mid } = await postedLobby();
    const edit = fc.channel(CH).messages.edit;
    await joinCaper({ caperId: c.id, uid: ids.LOOKOUT, role: "LOOKOUT", guildId: G });
    await requestCaperRender(fc.client, c.id);                      // "set": renders now
    await new Promise((r) => setTimeout(r, 100));
    await joinCaper({ caperId: c.id, uid: ids.SAFECRACKER, role: "SAFECRACKER", guildId: G });
    await requestCaperRender(fc.client, c.id);                      // "held": schedules one trailing render
    expect(edit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(2), { timeout: 4_000, interval: 50 });
    expect(edit.mock.calls[1][0]).toBe(mid);
    expect(text(edit.mock.calls[1][1])).toContain(`<@${ids.SAFECRACKER}>`);     // read from the DB at fire time
    await new Promise((r) => setTimeout(r, 2_100));
    expect(edit).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("lobby DMs: only eligible, unseated members in the lobby's guild; at most 3 per member per rolling 24 h; none within 2 h of a cancelled lobby", async () => {
    const now = new Date();
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const assoc = await seedEligibleUser({ wallet: 3_000_000, prepKeys: ["hunting_permit"] });
    // Associate is derived from tenure (plan 1 P20), never a stored role: a Soldier who joined now is one.
    await testPrisma.familyMember.create({ data: { familyId: f.family.id, userId: assoc, role: "SOLDIER", roleSlot: assoc, seat: 9, joinedAt: now } });
    await testPrisma.inventory.deleteMany({ where: { userId: f.ids.DRIVER } });                       // no prep item for any open role
    const fc = fakeCaperClient({ members: [f.ids.MASTERMIND, f.ids.LOOKOUT, f.ids.DRIVER, assoc] });   // the Safecracker is not in the guild
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
    expect(await announceLobby(fc.client, c.id, now)).toEqual([f.ids.LOOKOUT]);
    for (let k = 0; k < 3; k++) await announceLobby(fc.client, c.id, now);
    expect(fc.dms.get(f.ids.LOOKOUT)).toBe(3);
    const old = await testPrisma.caper.create({ data: { familyId: f.family.id, tier: 1, status: "CANCELLED", outcome: "CANCELLED", liveSlot: "old-cancel", plannerId: f.ids.MASTERMIND, guildId: G, channelId: CH, lobbyClosesAt: now } });
    await setCaperUpdatedAt(old.id, new Date(+now - 3_600_000));
    await flushTestKeys("cf:lobbydm:*");
    expect(await announceLobby(fc.client, c.id, now)).toEqual([]);
  });

  it("the lobby-DM counter is created with its 24 h TTL in one MULTI, and a Redis error still grants the DM (14.3)", async () => {
    const now = new Date();
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const fc = fakeCaperClient({ members: [f.ids.MASTERMIND, f.ids.LOOKOUT] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
    const redis = redisService.getInstance();
    const expire = vi.spyOn(redis, "expire").mockRejectedValue(new Error("EXPIRE lost"));   // a lone EXPIRE would leave the key forever
    try {
      expect(await announceLobby(fc.client, c.id, now)).toEqual([f.ids.LOOKOUT]);
    } finally { expire.mockRestore(); }
    const ttl = await testRedis().ttl(`cf:lobbydm:${f.ids.LOOKOUT}`);
    expect(ttl).toBeGreaterThan(86_300);
    expect(ttl).toBeLessThanOrEqual(86_400);
    expect(await testRedis().get(`cf:lobbydm:${f.ids.LOOKOUT}`)).toBe("1");
    const multi = vi.spyOn(redis, "multi").mockImplementation(() => { throw new Error("Redis down"); });
    try {
      await flushTestKeys("cf:lobbydm:*");
      expect(await announceLobby(fc.client, c.id, now)).toEqual([f.ids.LOOKOUT]);
    } finally { multi.mockRestore(); }
  });

  it("Start enqueues the caper reminder at the older seat's startedAt + 24 h", async () => {
    const now = new Date();
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const earlier = new Date(+now - 3 * 3_600_000);
    await testPrisma.caperCrew.create({ data: { caperId: "65f000000000000000000001", familyId: f.family.id, userId: f.ids.LOOKOUT, role: "LOOKOUT", liveSlot: "65f000000000000000000001", stake: 50_000, started: true, startedAt: earlier } });
    const fc = fakeCaperClient({ members: Object.values(f.ids) });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH, now });
    for (const r of JOINERS) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r, guildId: G, now });
    expect((await runStart(fc.client, c.id, { kind: "auto" }, now)).status).toBe("started");
    expect(await testPrisma.cooldownReminder.findMany({ where: { discordId: f.ids.LOOKOUT, type: "caper" } })).toMatchObject([{ dueAt: new Date(+earlier + 86_400_000) }]);
    expect(await testPrisma.cooldownReminder.count({ where: { discordId: f.ids.SAFECRACKER, type: "caper" } })).toBe(0);
  });

  it("!caper repost edits the old card to Lobby moved", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    const mid = await postCaperCard(fc.client, caper.id, "c2");
    expect(fc.sent.map((s) => s.channelId)).toEqual(["c2"]);
    const moved = fc.edits.find((e) => e.messageId === "m0")!;
    expect(moved.channelId).toBe(CH);
    expect(text(moved.payload)).toContain(`Lobby moved: https://discord.com/channels/${G}/c2/${mid}`);
    expect(moved.payload.attachments).toEqual([]);
    expect(await caperRow(caper.id)).toMatchObject({ channelId: "c2", messageId: mid });
  });

  // Another writer moves the board while this one is posting: send resolves only after the DB changed.
  const raceSend = (fc: ReturnType<typeof fakeCaperClient>, channelId: string, caperId: string, board: { channelId: string; messageId: string }) => {
    const send = fc.channel(channelId).send;
    const real = send.getMockImplementation()!;
    send.mockImplementationOnce(async (payload: any) => {
      await testPrisma.caper.update({ where: { id: caperId }, data: board });
      return real(payload);
    });
  };

  it("!caper losing the board CAS leaves the old card alone and retires its own post to Lobby moved", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    raceSend(fc, "c2", caper.id, { channelId: CH, messageId: "r9" });       // a dead-board render reposted r9 first
    expect(await postCaperCard(fc.client, caper.id, "c2")).toBeNull();
    const posted = fc.sent[0];
    expect(posted.channelId).toBe("c2");
    expect(fc.edits.some((e) => e.messageId === "m0")).toBe(false);
    expect(fc.edits).toHaveLength(1);
    expect(fc.edits[0]).toMatchObject({ channelId: "c2", messageId: "m1" });
    expect(text(fc.edits[0].payload)).toContain(`Lobby moved: https://discord.com/channels/${G}/${CH}/r9`);
    expect(await caperRow(caper.id)).toMatchObject({ channelId: CH, messageId: "r9" });
  });

  it("!caper losing the CAS to a board marked dead adopts its post", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    raceSend(fc, "c2", caper.id, { channelId: CH, messageId: "" });         // a render marked m0 dead and its repost failed
    const mid = await postCaperCard(fc.client, caper.id, "c2");
    expect(mid).toBe("m1");
    expect(fc.edits).toHaveLength(0);
    expect(await caperRow(caper.id)).toMatchObject({ channelId: "c2", messageId: mid });
  });

  it("a dead-board repost that loses its CAS is retired and the render is skipped (Review Focus 4)", async () => {
    const { caper } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"] });
    await testPrisma.caper.update({ where: { id: caper.id }, data: { messageId: "m0" } });
    const fc = fakeCaperClient();
    fc.editFailures.push({ code: 10008 });
    raceSend(fc, CH, caper.id, { channelId: "c2", messageId: "p7" });       // !caper won "" → p7 in c2
    expect(await renderCaperCard(fc.client, caper.id)).toBe("skipped");
    expect(fc.sent.map((s) => s.channelId)).toEqual([CH]);
    expect(fc.edits).toHaveLength(1);
    expect(fc.edits[0]).toMatchObject({ channelId: CH, messageId: "m1" });
    expect(text(fc.edits[0].payload)).toContain(`Lobby moved: https://discord.com/channels/${G}/c2/p7`);
    expect(await caperRow(caper.id)).toMatchObject({ channelId: "c2", messageId: "p7" });
  });

  it("an event held just after a trailing render fires still gets its own render", async () => {
    let renders = 0;
    const render = async () => { renders++; };
    const at = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await trailingRender("t", "x", 1, render);          // t=0: renders, main held to 1.0
    await at(100);
    await trailingRender("t", "x", 1, render);          // t=0.1: held, trailing render at 1.1 (pending TTL to 2.1)
    await at(1_100);
    await trailingRender("t", "x", 1, render);          // t=1.2: main expired, renders, main held to 2.2
    expect(renders).toBe(3);
    await at(300);
    await trailingRender("t", "x", 1, render);          // t=1.5: main held, pending cleared by the 1.1 render: schedules one
    await vi.waitFor(() => expect(renders).toBe(4), { timeout: 2_000, interval: 50 });
  }, 10_000);
});
