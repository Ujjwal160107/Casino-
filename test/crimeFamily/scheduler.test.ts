import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
const { schedule } = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock("node-cron", () => ({ default: { schedule }, schedule }));
const { CF_SCHEDULES, registerCrimeFamilyJobs, runJobs, chargeFamilyDues, runSuccession, autoPayday, sweepInvites } = await import("../../src/services/crimeFamily/scheduler");
import { ACTIVITY_RULES } from "../../src/services/crimeFamily/extensions";
import { fakeDmClient } from "../dm/helpers";
import { testPrisma, seedEligibleUser, seedFamily, resetFamilies, ensureUniqueIndexes, daysAgo } from "../helpers";

const DAY = 864e5;
const fam = (id: string) => testPrisma.family.findUnique({ where: { id } });
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
function fakeClient(o: { dead?: boolean } = {}) {
  const dm = fakeDmClient();
  const sent: any[] = []; const edits: [string, any][] = [];
  const channel = {
    isTextBased: () => true,
    send: vi.fn(async (p: any) => { sent.push(p); return { id: `m${sent.length}` }; }),
    messages: { edit: vi.fn(async (id: string, p: any) => { edits.push([id, p]); return {}; }) },
  };
  (dm.client as any).channels = { fetch: vi.fn(async () => { if (o.dead) throw Object.assign(new Error("Unknown Channel"), { code: 10003 }); return channel; }) };
  return { client: dm.client, dm: dm.sent, sent, edits };
}
const allActive = { key: "all", label: "all", need: 0, count: async () => 1 };
async function dueFamily(now: Date) {
  const boss = await seedEligibleUser(); const s = await seedEligibleUser();
  const f = await seedFamily({ bossId: boss, earnings: 1_000_000, lastPaydayAt: new Date(+now - 8 * DAY - 60_000), members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
  return { f, boss, s };
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("crime family jobs (15)", () => {
  it("registers each schedule in UTC with noOverlap", () => {
    registerCrimeFamilyJobs({} as any);
    expect(schedule.mock.calls.map((c) => [c[0], c[2]])).toEqual(CF_SCHEDULES.map((s) => [s.cron, expect.objectContaining({ timezone: "Etc/UTC", noOverlap: true })]));
  });

  it("one failing job does not stop the next in its schedule", async () => {
    const ran: string[] = [];
    await runJobs({} as any, [{ name: "a", run: async () => { ran.push("a"); throw new Error("x"); } }, { name: "b", run: async () => { ran.push("b"); } }]);
    expect(ran).toEqual(["a", "b"]);
  });

  it("dues: hourly runs charge once a day; a missed 00:10 is charged at the next hour; the first miss DMs Boss and Underboss", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, level: 2, earnings: 80_000, members: [{ userId: ub, role: "UNDERBOSS" }] });
    const c = fakeClient();
    await chargeFamilyDues(c.client, new Date("2026-11-05T01:10:00Z"));   // the 00:10 run never happened
    await chargeFamilyDues(c.client, new Date("2026-11-05T02:10:00Z"));
    expect((await fam(f.id))!.earnings).toBe(0);
    expect(c.dm.size).toBe(0);
    await chargeFamilyDues(c.client, new Date("2026-11-06T00:10:00Z"));
    await chargeFamilyDues(c.client, new Date("2026-11-07T00:10:00Z"));
    expect((await fam(f.id))!.duesArrears).toBe(2);
    expect(Object.fromEntries(c.dm)).toEqual({ [boss]: 1, [ub]: 1 });
  });

  it("succession: one S23 per inactivity episode, ended by the Boss's return; auto handover at 14 days edits it", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, homeChannelId: "home", members: [{ userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(20) }] });
    const setActive = (uid: string, d: Date) => testPrisma.familyMember.update({ where: { userId: uid }, data: { lastActiveAt: d } });
    const c = fakeClient();
    await setActive(boss, new Date(+now - 7 * DAY - 60_000));
    await runSuccession(c.client, now); await runSuccession(c.client, now);
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0].allowedMentions).toEqual({ parse: [], users: [ub] });
    expect(await fam(f.id)).toMatchObject({ claimNoticeFor: boss, claimChannelId: "home", claimMessageId: "m1" });
    await setActive(boss, now);                                           // the Boss is back (P22)
    await runSuccession(c.client, now);
    expect(c.edits.at(-1)![0]).toBe("m1");
    expect(JSON.stringify(c.edits.at(-1)![1])).toContain("The Boss is back.");
    expect(await fam(f.id)).toMatchObject({ claimNoticeFor: "", claimChannelId: "", claimMessageId: "" });   // no later edit of the old S23
    const later = new Date(+now + 7 * DAY + 60_000);                      // gone again for 7 days
    await runSuccession(c.client, later);
    expect(c.sent).toHaveLength(2);
    const muchLater = new Date(+now + 14 * DAY + 60_000);
    await setActive(ub, muchLater);
    await runSuccession(c.client, muchLater);
    expect((await fam(f.id))!.bossId).toBe(ub);
    expect(c.edits.at(-1)![0]).toBe("m2");
    expect(JSON.stringify(c.edits.at(-1)![1])).toContain(`Chair handed to <@${ub}>`);
  });

  it("autoPayday pays at lastPaydayAt + 8 days with earnings ≥ 500,000, once", async () => {
    const now = new Date();
    ACTIVITY_RULES.push(allActive);
    try {
      const { f, boss, s } = await dueFamily(now);
      const early = await seedFamily({ bossId: await seedEligibleUser(), earnings: 1_000_000, lastPaydayAt: new Date(+now - 8 * DAY + 60_000) });
      const c = fakeClient();
      await autoPayday(c.client, now); await autoPayday(c.client, now);
      expect([await wallet(boss), await wallet(s)]).toEqual([475_000, 475_000]);
      expect((await fam(f.id))!.earnings).toBe(0);
      expect((await fam(early.id))!.earnings).toBe(1_000_000);
      expect(c.sent).toHaveLength(1);
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("a dead home channel: payday still pays, DMs go, nothing throws (Review Focus 5)", async () => {
    const now = new Date();
    ACTIVITY_RULES.push(allActive);
    try {
      const { f, boss, s } = await dueFamily(now);
      const c = fakeClient({ dead: true });
      await expect(autoPayday(c.client, now)).resolves.toBeUndefined();
      expect([await wallet(boss), await wallet(s)]).toEqual([475_000, 475_000]);
      expect([...c.dm.keys()].sort()).toEqual([boss, s].sort());
      expect((await fam(f.id))!.earnings).toBe(0);
    } finally { ACTIVITY_RULES.pop(); }
  });

  it("sweepInvites expires due invites and edits their cards once", async () => {
    const now = new Date();
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss });
    const inv = await testPrisma.familyInvite.create({ data: { familyId: f.id, inviterId: boss, inviteeId: "x", guildId: "g1", channelId: "c1", messageId: "m9", expiresAt: new Date(+now - 1_000) } });
    const c = fakeClient();
    await sweepInvites(c.client, now); await sweepInvites(c.client, now);
    expect(c.edits.map((e) => e[0])).toEqual(["m9"]);
    expect(JSON.stringify(c.edits[0][1])).toContain("Expired");
    expect((await testPrisma.familyInvite.findUnique({ where: { id: inv.id } }))!.status).toBe("EXPIRED");
  });
});

it("sweepCapers runs in the minute schedule after sweepInvites", () => {
  expect(CF_SCHEDULES.find((s) => s.cron === "* * * * *")!.jobs.map((j) => j.name)).toEqual(["sweepInvites", "sweepCapers"]);
});
