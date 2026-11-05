import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { syncWarBoards, announceWarResult, announceBid } from "../../src/ui/crimeFamily/turfAnnounce";
import { settleWar } from "../../src/services/crimeFamily/warService";
import { fakeClient } from "./fakeClient";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo, seedRacket, seedWar, seedContribution, flushTestKeys } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Racket", "War", "WarContribution"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:render:war:*"); });

async function sides() {
  const mk = async (ch: string) => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, homeGuildId: "g1", homeChannelId: ch, members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(10) }, { userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
    return { f, boss, ub, s };
  };
  return { a: await mk("ch-a"), d: await mk("ch-d") };
}
const boards = async (id: string) => (await testPrisma.war.findUnique({ where: { id } }))!.boards as any[];

describe("turf announcer", () => {
  it("posts one board per family home channel with the banner, then edits without files; the Street gets none", async () => {
    const { a, d } = await sides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient();
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect(c.calls.filter((x) => x.op === "send").map((x) => [x.channelId, x.payload.files?.length])).toEqual([["ch-a", 1], ["ch-d", 1]]);
    expect((await boards(w.id)).map((b) => [b.side, b.hasBanner, b.dead])).toEqual([["ATK", true, false], ["DEF", true, false]]);
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect(c.calls.filter((x) => x.op === "edit").every((x) => !x.payload.files?.length)).toBe(true);
    const street = await seedWar({ racketKey: "pawn_row", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: "" });
    await syncWarBoards(c.client, street.id, new Date(), { force: true });
    expect((await boards(street.id)).map((b) => b.side)).toEqual(["ATK"]);
  });

  it("a minute refresh is debounced; a dead board gets one repost, then stops (edge 28)", async () => {
    const { a, d } = await sides();
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient();
    await syncWarBoards(c.client, w.id, new Date());
    const n = c.calls.length;
    await syncWarBoards(c.client, w.id, new Date());
    expect(c.calls.length).toBe(n);                                      // held by cf:render:war:<id>
    const broken = fakeClient({ failEdit: new Set(["ch-d"]), failSend: new Set(["ch-d"]) });
    await syncWarBoards(broken.client, w.id, new Date(), { force: true });
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ dead: true });
    const before = broken.calls.length;
    await syncWarBoards(broken.client, w.id, new Date(), { force: true });
    expect(broken.calls.slice(before).every((x) => x.channelId === "ch-a")).toBe(true);
  });

  it("a board deleted again after its one successful repost is marked dead without a second repost (edge 28)", async () => {
    const { a, d } = await sides();
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    await syncWarBoards(fakeClient().client, w.id, new Date(), { force: true });
    const deleted = fakeClient({ failEdit: new Set(["ch-d"]) });
    await syncWarBoards(deleted.client, w.id, new Date(), { force: true });
    expect(deleted.calls.filter((x) => x.op === "send" && x.channelId === "ch-d")).toHaveLength(1);    // the one repost
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ dead: false });
    await syncWarBoards(deleted.client, w.id, new Date(), { force: true });
    expect(deleted.calls.filter((x) => x.op === "send" && x.channelId === "ch-d")).toHaveLength(1);    // no second repost
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ dead: true, messageId: "" });
  });

  it("a first post that fails gets one more try on the next sync, then the board is dead (edge 28)", async () => {
    const { a, d } = await sides();
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient({ failSend: new Set(["ch-d"]) });
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ messageId: "", dead: false });
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    expect(c.calls.filter((x) => x.op === "send" && x.channelId === "ch-d")).toHaveLength(2);
    expect((await boards(w.id)).find((b) => b.side === "DEF")).toMatchObject({ dead: true });
  });

  it("a result edits live boards to S21, posts a notice in both home channels and DMs only contributors", async () => {
    const { a, d } = await sides();
    await seedRacket("docks_numbers", { ownerFamilyId: d.f.id });
    const w = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", topBid: 2_100_000, topBidderFamilyId: a.f.id, defenderFamilyId: d.f.id });
    const c = fakeClient();
    await syncWarBoards(c.client, w.id, new Date(), { force: true });
    await seedContribution({ warId: w.id, familyId: a.f.id, userId: a.s, side: "ATK", hits: 1 });
    await testPrisma.war.update({ where: { id: w.id }, data: { status: "SETTLING" } });
    const s = (await settleWar(w.id, new Date()))!;
    await announceWarResult(c.client, s, new Date());
    const edits = c.calls.filter((x) => x.op === "edit");
    expect(edits.slice(-2).every((x) => !/"type":1[,}]/.test(JSON.stringify(x.payload.components.map((c: any) => c.toJSON()))))).toBe(true); // no ActionRow
    expect(c.calls.filter((x) => x.op === "send").slice(-2).map((x) => x.channelId).sort()).toEqual(["ch-a", "ch-d"]);
    expect([...c.dm.keys()]).toEqual([a.s]);
  });

  it("a bid DMs the owner's officers; an outbid DMs the outbid family's officers", async () => {
    const { a, d } = await sides();
    const c = fakeClient();
    await announceBid(c.client, { warId: "w", racketKey: "docks_numbers", racketName: "Dockside Numbers", amount: 2_310_000, familyId: a.f.id, familyLabel: "[A] A", startsAt: new Date(), bidClosesAt: new Date(), ownerFamilyId: d.f.id, previous: { familyId: d.f.id, amount: 2_100_000 } });
    expect(Object.fromEntries(c.dm)).toEqual({ [d.boss]: 2, [d.ub]: 2 });
  });
});
