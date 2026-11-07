import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { handleCaper } from "../../src/commands/economy/caper";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { joinCaper, planCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { openBrief } from "../../src/services/crimeFamily/caperPlayService";
import { parseAnswers } from "../../src/services/crimeFamily/intelRing";
import type { CaperRoleKey } from "../../src/data/crimeFamilyCatalog";
import { CRIME_FAMILY_CONFIG } from "../../src/utils/economyConfig";
import { leaveFamily } from "../../src/services/crimeFamily/membershipService";
import { postCaperCard } from "../../src/ui/crimeFamily/caperCard";
import { announceLobby, onSeatsChanged, runCancel, runStart } from "../../src/ui/crimeFamily/caperFlow";
import { CPR_IDS, TURF_IDS } from "../../src/ui/crimeFamily/ids";
import { announceWarSoon } from "../../src/ui/crimeFamily/turfAnnounce";
import prisma from "../../src/utils/prisma";
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig, seedEligibleUser, seedFamily, seedWar, seedRacket, daysAgo } from "../helpers";
import { caperCrew, fakeCaperClient, seedRunning, G, CH } from "./caperFixtures";
import { fakeButton, fakeSelect, said } from "./fakeInteraction";
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

  it("a committed join whose card read fails keeps the seat and shows no error, by press or by !heist join", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    const findUnique = prisma.caper.findUnique;
    const real = findUnique.bind(prisma.caper);
    const seated = () => testPrisma.caperCrew.count({ where: { caperId: c.id, userId: { in: [ids.LOOKOUT, ids.SAFECRACKER] } } });
    let base = 0;
    // Every caper read after this join's seat commits fails (a Mongo blip right after the transaction).
    const spy = vi.spyOn(prisma.caper, "findUnique").mockImplementation((async (args: any) =>
      (await seated()) > base ? Promise.reject(new Error("Mongo blip")) : real(args)) as any);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const i = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: ids.LOOKOUT, guildId: "g2", messageId: "s25-lobby", client: fc.client }));
      expect(said(i)).not.toContain("Something went wrong.");
      base = 1;
      const cmd = await heist(fc, ids.SAFECRACKER, ["join", "safecracker"]);
      expect(cmd.text).toContain("Seated as Safecracker.");
      expect(cmd.text).not.toContain("Something went wrong.");
    } finally {
      spy.mockRestore(); error.mockRestore();
      Object.assign(prisma.caper, { findUnique });   // mockRestore writes undefined back on Prisma's model proxy
    }
    expect(await seated()).toBe(2);
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

describe("DM personal cards (amendment 5.2, 5.5)", () => {
  it("lobby DMs reach every qualified unseated member with no shared server, carrying Join as…", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();                             // the fake client knows no guild members at all
    expect((await announceLobby(fc.client, c.id)).sort()).toEqual([ids.LOOKOUT, ids.SAFECRACKER, ids.DRIVER].sort());
    expect(JSON.stringify(fc.lastDm.get(ids.DRIVER))).toContain(CPR_IDS.join(c.id));
    expect(visibleText(fc.lastDm.get(ids.DRIVER))).toContain("Pick a role below to join from here.");
  }));

  it("a join from the lobby DM seats the member and edits the DM into the S25 seated card (edge 7)", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    const i = await press(fakeSelect(CPR_IDS.join(c.id), ["DRIVER"], { userId: ids.DRIVER, guildId: null, messageId: "dm-1", client: fc.client }));
    const card = i.editReply.mock.calls.at(-1)[0];
    expect(visibleText(card)).toContain(`<@${ids.DRIVER}> seated as **Driver**`);
    expect(JSON.stringify(card)).toContain(CPR_IDS.brief(c.id));
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: ids.DRIVER } })).toBe(1);
  }));

  it("a stale lobby DM (started, cancelled, member left) is refused, charges nothing and is not edited (Review Focus 1)", () => open(async () => {
    const started = await lobbyWithCard();
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: started.c.id, uid: started.ids[r], role: r });
    await runStart(started.fc.client, started.c.id, { kind: "press", uid: started.ids.MASTERMIND });
    const cancelled = await lobbyWithCard();
    await runCancel(cancelled.fc.client, cancelled.c.id, cancelled.ids.MASTERMIND);
    const left = await lobbyWithCard();
    await leaveFamily(left.ids.DRIVER);
    for (const [k, expected] of [[started, "Lobby closed."], [cancelled, "Lobby closed."], [left, "You are not in a crime family."]] as const) {
      const before = (await testPrisma.wallet.findUnique({ where: { userId: k.ids.DRIVER } }))!.balance;
      const i = await press(fakeSelect(CPR_IDS.join(k.c.id), ["DRIVER"], { userId: k.ids.DRIVER, guildId: null, messageId: "dm-old", client: k.fc.client }));
      expect(said(i)).toContain(expected);
      expect(i.editReply.mock.calls.every((call: any[]) => !visibleText(call[0]).includes("seated as"))).toBe(true);
      expect((await testPrisma.wallet.findUnique({ where: { userId: k.ids.DRIVER } }))!.balance).toBe(before);
      expect(await testPrisma.caperCrew.count({ where: { caperId: k.c.id, userId: k.ids.DRIVER } })).toBe(0);
    }
  }));

  it("the GO DM carries Open brief, and pressing it in the DM opens the brief", () => open(async () => {
    const { ids, fc, c } = await lobbyWithCard();
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: c.id, uid: ids[r], role: r });
    const { full } = await joinCaper({ caperId: c.id, uid: ids.DRIVER, role: "DRIVER" });
    await onSeatsChanged(fc.client, c.id, full);                                // full lobby: auto-start, GO DMs
    expect(JSON.stringify(fc.lastDm.get(ids.SAFECRACKER))).toContain(CPR_IDS.brief(c.id));
    const i = await press(fakeButton(CPR_IDS.brief(c.id), { userId: ids.SAFECRACKER, guildId: null, messageId: "dm-go", client: fc.client }));
    expect(said(i)).toContain("Safecracker brief");
  }));
});

describe("war actions from a DM (amendment 5.2, 5.5)", () => {
  const ON = { enabled: true, turfEnabled: true };
  async function warFamily(status: "ARMED" | "ACTIVE", racketKey: string) {
    const boss = await seedEligibleUser({ wallet: 100_000 }); const s = await seedEligibleUser({ wallet: 100_000 });
    const fam = await seedFamily({ bossId: boss, homeGuildId: G, homeChannelId: CH, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    await seedRacket(racketKey);
    const w = await seedWar({ racketKey, status, topBid: 2_100_000, topBidderFamilyId: fam.id, defenderFamilyId: "" });
    return { boss, s, fam, w };
  }

  it("the war-soon DM carries Scout and the three Hits", () => withCfConfig(ON, async () => {
    const { s, w } = await warFamily("ARMED", "docks_numbers");
    const fc = fakeCaperClient();
    await announceWarSoon(fc.client, w.id, new Date());
    const dm = JSON.stringify(fc.lastDm.get(s));
    for (const id of [TURF_IDS.scout(w.id), TURF_IDS.hit(w.id, "docks"), TURF_IDS.hit(w.id, "main"), TURF_IDS.hit(w.id, "alleys")]) expect(dm).toContain(id);
    expect(visibleText(fc.lastDm.get(s))).toContain("from any server");
  }));

  it("DM war buttons at the wrong time or from a member who left are refused with no row and no debit (Review Focus 4)", () => withCfConfig(ON, async () => {
    const armed = await warFamily("ARMED", "docks_numbers");
    const scout = (uid: string, warId: string) => press(fakeButton(TURF_IDS.scout(warId), { userId: uid, guildId: null }));
    expect(said(await scout(armed.s, armed.w.id))).toContain("The war has not started yet.");
    await testPrisma.war.update({ where: { id: armed.w.id }, data: { status: "SETTLING" } });
    expect(said(await press(fakeButton(TURF_IDS.hit(armed.w.id, "docks"), { userId: armed.s, guildId: null })))).toContain("This war is over.");
    const live = await warFamily("ACTIVE", "casino_row");
    await leaveFamily(live.s);
    expect(said(await scout(live.s, live.w.id))).toContain("Not your war.");
    expect(await testPrisma.warContribution.count({ where: { userId: { in: [armed.s, live.s] } } })).toBe(0);
    expect((await testPrisma.wallet.findUnique({ where: { userId: armed.s } }))!.balance).toBe(100_000);
  }));
});

describe("the intel relay through Discord (amendment 5.3, 5.8)", () => {
  it("a crew in three places with no shared chat locks every call right through Share (edge 1)", () => open(async () => {
    const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
    const f = await caperCrew({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    await postCaperCard(fc.client, c.id, CH);
    await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: "g2", messageId: "s25", client: fc.client }));
    await press(fakeSelect(CPR_IDS.join(c.id), ["SAFECRACKER"], { userId: f.ids.SAFECRACKER, guildId: null, messageId: "dm", client: fc.client }));
    await runStart(fc.client, c.id, { kind: "press", uid: f.ids.MASTERMIND });
    const where = { [f.ids.MASTERMIND]: G, [f.ids.LOOKOUT]: "g2", [f.ids.SAFECRACKER]: null } as Record<string, string | null>;
    for (const uid of Object.values(f.ids)) await press(fakeButton(CPR_IDS.brief(c.id), { userId: uid, guildId: where[uid], client: fc.client }));
    // the second join's trailing S13 render (debounce.ts) must land before the snapshot, as caper-flow.test.ts:114 waits for it
    await new Promise((r) => setTimeout(r, CRIME_FAMILY_CONFIG.caperRenderDebounceSeconds * 1000 + 100));
    const dmsBefore = new Map(fc.dms), sends = fc.sent.length, edits = fc.edits.length;
    for (const uid of Object.values(f.ids)) await press(fakeButton(CPR_IDS.share(c.id), { userId: uid, guildId: where[uid], ephemeralSource: true, client: fc.client }));
    for (const uid of Object.values(f.ids)) expect(fc.dms.get(uid)).toBe((dmsBefore.get(uid) ?? 0) + 1);   // one intel DM each
    expect([fc.sent.length, fc.edits.length]).toEqual([sends, edits]);                 // the relay posts and edits nothing in any channel
    for (const uid of Object.values(f.ids)) {
      const b = await openBrief(c.id, uid);
      expect(b.relayed).not.toBeNull();
      await press(fakeButton(CPR_IDS.act(c.id, b.call.options.indexOf(b.relayed!)), { userId: uid, guildId: where[uid], ephemeralSource: true, client: fc.client }));
    }
    const answers = parseAnswers((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).answers)!;
    const rows = await testPrisma.caperCrew.findMany({ where: { caperId: c.id } });
    expect(rows.every((r) => r.relayed && r.choice === answers.seats[r.role as CaperRoleKey]!.correct)).toBe(true);
  }), 10_000);

  it("Share from the wrong state is refused with no row change and no DM (Review Focus 3)", () => open(async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER"], picks: { MASTERMIND: "none" }, dark: ["SAFECRACKER"] });
    const fc = fakeCaperClient();
    const share = (uid: string) => press(fakeButton(CPR_IDS.share(caper.id), { userId: uid, guildId: null, ephemeralSource: true, client: fc.client }));
    expect(said(await share("outsider"))).toContain("You are not in this crew heist.");
    expect(said(await share(ids.SAFECRACKER))).toContain("Open your brief first.");
    await share(ids.LOOKOUT);
    expect(said(await share(ids.LOOKOUT))).toContain("Already shared.");
    await testPrisma.caper.update({ where: { id: caper.id }, data: { status: "RESOLVED" } });
    expect(said(await share(ids.MASTERMIND))).toContain("Too late.");
    expect(await testPrisma.caperCrew.count({ where: { caperId: caper.id, sharedIntel: true } })).toBe(1);
    expect([...fc.dms.values()].reduce((a, b) => a + b, 0)).toBe(1);                  // only the Lookout's one share nudged
  }));
});
