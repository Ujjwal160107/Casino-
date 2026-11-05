import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
const boom = vi.hoisted(() => ({ id: "" }));
vi.mock("../../src/services/crimeFamily/caperSettleService", async (orig) => {
  const m = await orig<typeof import("../../src/services/crimeFamily/caperSettleService")>();
  return { ...m, resolveCaper: async (...a: Parameters<typeof m.resolveCaper>) => { if (a[0] === boom.id) throw new Error("boom"); return m.resolveCaper(...a); } };
});
const { sweepCapers } = await import("../../src/services/crimeFamily/caperSweeper");
import { testPrisma, resetFamilies, ensureUniqueIndexes, flushTestKeys, withCfConfig } from "../helpers";
import { seedLobby, seedRunning, fakeCaperClient, setCaperUpdatedAt, txCount } from "./caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const BOOT = new Date(0);                                         // booted long before every seeded startedAt: no C1 VOID
const caperRow = (id: string) => testPrisma.caper.findUniqueOrThrow({ where: { id } });
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const board = (id: string, messageId: string) => testPrisma.caper.update({ where: { id }, data: { messageId } });
const fileNames = (payload: any): string[] => (payload.files ?? []).map((f: any) => f.name);
const dueRun = () => ({ tier: 1 as const, roles: [...R3], startedAt: new Date(Date.now() - 200_000) });   // goEndsAt 80 s ago

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); boom.id = ""; });

describe("sweepCapers (spec 15)", () => {
  it("a lobby past its close starts when the required roles are filled", async () => {
    const now = new Date();
    const { caper } = await seedLobby({ tier: 1, roles: [...R3], now: new Date(+now - 601_000) });   // lobbyClosesAt = now − 1 s
    await board(caper.id, "m0");
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, now, BOOT);
    expect((await caperRow(caper.id)).status).toBe("RUNNING");
    expect(fc.sent.filter((s) => Array.isArray(s.payload.allowedMentions?.users))).toHaveLength(1);
  });

  it("a lobby past its close without the required roles is cancelled with refunds and the 30-minute cooldown", async () => {
    const now = new Date();
    const { caper, family, ids } = await seedLobby({ tier: 1, roles: ["MASTERMIND", "LOOKOUT"], now: new Date(+now - 601_000) });
    await board(caper.id, "m0");
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, now, BOOT);
    expect(await caperRow(caper.id)).toMatchObject({ status: "CANCELLED", outcome: "CANCELLED" });
    expect(await txCount("caper_stake_refund", Object.values(ids))).toBe(2);
    expect(+(await testPrisma.family.findUniqueOrThrow({ where: { id: family.id } })).nextCaperAt).toBe(+now + 1_800_000);
    // runStart first draws the "waiting" note on the lobby card; the cancel render is the last edit.
    expect(fc.edits.filter((e) => e.messageId === "m0").at(-1)!.payload.attachments).toEqual([]);
  });

  it("a due lobby starts on the clock at its own start, not the sweep's earlier now: the GO window is whole", async () => {
    const stale = new Date(Date.now() - 30_000);                                                        // earlier jobs ate 30 s
    const { caper } = await seedLobby({ tier: 1, roles: [...R3], now: new Date(+stale - 601_000) });
    const before = Date.now();
    await sweepCapers(fakeCaperClient().client, stale, BOOT);
    const row = await caperRow(caper.id);
    expect(row.status).toBe("RUNNING");
    expect(+row.startedAt).toBeGreaterThanOrEqual(before);
    expect(+row.goEndsAt).toBe(+row.startedAt + 120_000);
  });

  it("a RUNNING caper past goEndsAt resolves and the card shows the result", async () => {
    const { caper } = await seedRunning(dueRun());
    await board(caper.id, "m0");
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, new Date(), BOOT);
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
    expect(fc.edits.some((e) => e.messageId === "m0" && fileNames(e.payload).some((n) => n.startsWith("cf_result_")))).toBe(true);
  });

  it("a restart VOID through the sweeper", async () => {
    const run = dueRun();
    const { caper, ids } = await seedRunning({ ...run, picks: { LOOKOUT: "none" } });
    await sweepCapers(fakeCaperClient().client, new Date(), new Date(+run.startedAt + 50_000));
    expect(await caperRow(caper.id)).toMatchObject({ status: "CANCELLED", outcome: "VOID" });
    for (const id of Object.values(ids)) expect(await wallet(id)).toBe(50_000);
  });

  it("a SETTLING caper is resumed", async () => {
    const { caper } = await seedRunning({ tier: 1, roles: [...R3], status: "SETTLING" });
    await sweepCapers(fakeCaperClient().client, new Date(), BOOT);
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
  });

  it("re-renders each LOBBY card once and recently ended cards only", async () => {
    const now = new Date();
    const a = await seedLobby({ tier: 1, roles: [...R3], now });                    // open lobby, closes in 600 s
    const b = await seedRunning({ tier: 1, roles: [...R3] });                       // goEndsAt in the future: not due
    const c = await seedRunning({ tier: 1, roles: [...R3] });
    await board(a.caper.id, "mA");
    for (const [x, mid, ago] of [[b, "mB", 60_000], [c, "mC", 600_000]] as const) {
      await testPrisma.caper.update({ where: { id: x.caper.id }, data: { status: "RESOLVED", liveSlot: x.caper.id, outcome: "CLEAN", messageId: mid } });
      await setCaperUpdatedAt(x.caper.id, new Date(+now - ago));
    }
    const fc = fakeCaperClient();
    await sweepCapers(fc.client, now, BOOT);
    expect(fc.edits.map((e) => e.messageId).sort()).toEqual(["mA", "mB"]);
  });

  it("one failing caper does not stop the others", async () => {
    const x = await seedRunning(dueRun());
    const y = await seedRunning(dueRun());
    boom.id = x.caper.id;
    await sweepCapers(fakeCaperClient().client, new Date(), BOOT);
    expect((await caperRow(x.caper.id)).status).toBe("RUNNING");
    expect((await caperRow(y.caper.id)).status).toBe("RESOLVED");
  });

  it("runs while the feature is off", () => withCfConfig({ enabled: false }, async () => {
    const { caper } = await seedRunning(dueRun());
    await sweepCapers(fakeCaperClient().client, new Date(), BOOT);
    expect((await caperRow(caper.id)).status).toBe("RESOLVED");
  }));
});
