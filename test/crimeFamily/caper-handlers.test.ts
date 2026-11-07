import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import prisma from "../../src/utils/prisma";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { planCaper, joinCaper } from "../../src/services/crimeFamily/caperLobbyService";
import { CPR_IDS } from "../../src/ui/crimeFamily/ids";
import { caperTier } from "../../src/data/crimeFamilyCatalog";
import { fakeButton, fakeSelect, said } from "./fakeInteraction";
import { testPrisma, resetFamilies, ensureUniqueIndexes, withCfConfig, flushTestKeys } from "../helpers";
import { caperCrew, seedRunning, fakeCaperClient, G, CH } from "./caperFixtures";

const R3 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER"] as const;
const T1 = ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] as const;
const wallet = async (id: string) => (await testPrisma.wallet.findUnique({ where: { userId: id } }))!.balance;
const seat = (caperId: string, userId: string) => testPrisma.caperCrew.findFirstOrThrow({ where: { caperId, userId } });
const press = async <T>(i: T) => { await handleCrimeFamilyInteraction(i as any); return i as any; };
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);

/** Lets the first `n` prisma.$transaction calls through, then throws make() on every later one. */
function failTransactionsAfter(n: number, make: () => Error) {
  const original = prisma.$transaction.bind(prisma);
  let calls = 0;
  return vi.spyOn(prisma, "$transaction").mockImplementation((async (...args: unknown[]) => {
    if (++calls > n) throw make();
    return (original as (...a: unknown[]) => Promise<unknown>)(...args);
  }) as never);
}

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "Caper", "CaperCrew"]));
beforeEach(async () => { await resetFamilies(); await flushTestKeys("cf:*"); });

describe("cpr: planner routes", () => {
  it("plan from a Soldier is refused with no caper", () => open(async () => {
    const { ids } = await caperCrew({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    const i = await press(fakeSelect(CPR_IDS.plan(ids.LOOKOUT), ["1"], { userId: ids.LOOKOUT, guildId: G, channelId: CH, client: fc.client }));
    expect(said(i)).toContain("Only a Capo or above can plan a crew heist.");
    expect(await testPrisma.caper.count()).toBe(0);
  }));

  it("plan while closed", async () => {
    const { bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: G, channelId: CH, client: fakeCaperClient().client }));
    expect(said(i)).toContain("Crime Families are not open in this server yet.");
    expect(await testPrisma.caper.count()).toBe(0);
  });

  it("plan in a channel missing Attach Files outside the home guild", () => open(async () => {
    const { family, bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    await testPrisma.family.update({ where: { id: family.id }, data: { homeGuildId: "g9", homeChannelId: "c9" } });
    const fc = fakeCaperClient({ missingPerms: { [CH]: ["AttachFiles"] } });
    const before = await wallet(bossId);
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: G, channelId: CH, client: fc.client }));
    expect(said(i)).toContain("I need Attach Files in this channel to post the lobby.");
    expect(await testPrisma.caper.count()).toBe(0);
    expect(await wallet(bossId)).toBe(before);
    expect(fc.sent).toHaveLength(0);
  }));

  it("plan posts the card and answers with its jump link", () => open(async () => {
    const { family, bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    const fc = fakeCaperClient();
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: G, channelId: CH, client: fc.client }));
    expect(fc.sent).toHaveLength(1);
    expect(fc.sent[0].payload.files).toHaveLength(1);
    expect((await testPrisma.caper.findFirstOrThrow({ where: { familyId: family.id } })).messageId).toBe("m1");
    expect(said(i)).toContain(`Lobby posted: https://discord.com/channels/${G}/${CH}/m1`);
  }));
});

describe("cpr: lobby and GO routes", () => {
  it("join from another guild and from a DM seats the member (A4, A20)", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const fc = fakeCaperClient();
    const far = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: "g2", client: fc.client }));
    expect(said(far)).not.toContain("another server");
    const dm = await press(fakeSelect(CPR_IDS.join(c.id), ["SAFECRACKER"], { userId: f.ids.SAFECRACKER, guildId: null, client: fc.client }));
    expect(said(dm)).not.toContain("not open");
    expect((await testPrisma.caperCrew.findMany({ where: { caperId: c.id } })).map((r) => r.role).sort()).toEqual(["LOOKOUT", "MASTERMIND", "SAFECRACKER"]);
  }));

  it("a DM join while switched off says 'not open yet' and seats nobody (Review Focus 5)", async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    const before = (await testPrisma.wallet.findUnique({ where: { userId: f.ids.LOOKOUT } }))!.balance;
    const off = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: null, client: fakeCaperClient().client }));
    expect(said(off)).toContain("Crime Families are not open yet.");
    expect(said(off)).not.toContain("in this server");
    await withCfConfig({ enabled: true, allowGuildIds: ["g9"] }, async () => {
      const on = await press(fakeSelect(CPR_IDS.join(c.id), ["LOOKOUT"], { userId: f.ids.LOOKOUT, guildId: null, client: fakeCaperClient().client }));
      expect(said(on)).not.toContain("not open");
    });
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: f.ids.LOOKOUT } })).toBe(1);
    expect((await testPrisma.wallet.findUnique({ where: { userId: f.ids.LOOKOUT } }))!.balance).toBe(before - caperTier(1).stake); // one stake (50,000), once
  });

  it("plan from a DM is refused (the lobby needs a server channel)", () => open(async () => {
    const { bossId } = await caperCrew({ tier: 1, roles: [...R3] });
    const i = await press(fakeSelect(CPR_IDS.plan(bossId), ["1"], { userId: bossId, guildId: null, client: fakeCaperClient().client }));
    expect(said(i)).toContain("Crime Families are not open in this server yet.");
    expect(await testPrisma.caper.count()).toBe(0);
  }));

  it("brief from the public card defers ephemerally; Refresh from the brief defers as an update", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3] });
    const pub = await press(fakeButton(CPR_IDS.brief(caper.id), { userId: ids.LOOKOUT, guildId: G }));
    expect(pub.deferReply).toHaveBeenCalledTimes(1);
    expect(pub.ephemeral).toBe(true);
    expect(said(pub)).toContain("Tell <@");
    const refresh = await press(fakeButton(CPR_IDS.brief(caper.id), { userId: ids.LOOKOUT, guildId: G, ephemeralSource: true }));
    expect(refresh.deferUpdate).toHaveBeenCalledTimes(1);
    expect(refresh.deferReply).not.toHaveBeenCalled();
  });

  it("a dark seat's option press is refused", async () => {
    // leakAt = goEndsAt − 30 s is 10 s in the past at press time
    const goEndsAt = new Date(Date.now() + 20_000);
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], startedAt: new Date(Date.now() - 100_000), goEndsAt, picks: { LOOKOUT: "none" } });
    await testPrisma.caperCrew.updateMany({ where: { caperId: caper.id, userId: ids.LOOKOUT }, data: { briefOpened: true, briefOpenedAt: new Date(+goEndsAt - 30_000) } });   // opened exactly at leakAt
    const i = await press(fakeButton(CPR_IDS.act(caper.id, 0), { userId: ids.LOOKOUT, guildId: G, ephemeralSource: true }));
    expect(said(i)).toContain("You went dark: this seat counts as a miss.");
    expect((await seat(caper.id, ids.LOOKOUT)).choice).toBe(-1);
  });

  it("the last lock resolves the caper", async () => {
    const { caper, ids, answers } = await seedRunning({ tier: 1, roles: [...R3], picks: { SAFECRACKER: "none" } });
    await press(fakeButton(CPR_IDS.act(caper.id, answers.seats.SAFECRACKER!.correct), { userId: ids.SAFECRACKER, guildId: G, ephemeralSource: true, client: fakeCaperClient().client }));
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: caper.id } })).status).toBe("RESOLVED");
  });

  it("a committed last lock whose resolve fails shows the brief, not a refusal (the sweeper settles it)", async () => {
    const { caper, ids, answers } = await seedRunning({ tier: 1, roles: [...R3], picks: { SAFECRACKER: "none" } });
    const tx = failTransactionsAfter(1, () => new Error("settle down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let i: any;
    try {
      i = await press(fakeButton(CPR_IDS.act(caper.id, answers.seats.SAFECRACKER!.correct), { userId: ids.SAFECRACKER, guildId: G, ephemeralSource: true, client: fakeCaperClient().client }));
    } finally { tx.mockRestore(); errors.mockRestore(); }
    expect((await seat(caper.id, ids.SAFECRACKER)).choice).toBe(answers.seats.SAFECRACKER!.correct);
    expect(said(i)).toContain("Tell <@");
    expect(said(i)).not.toContain("Something went wrong.");
  });

  it("a committed last join whose auto-start fails is not refused (the press or the sweeper starts it)", () => open(async () => {
    const f = await caperCrew({ tier: 1, roles: [...T1] });
    const c = await planCaper({ uid: f.ids.MASTERMIND, tier: 1, guildId: G, channelId: CH });
    for (const r of ["LOOKOUT", "SAFECRACKER"] as const) await joinCaper({ caperId: c.id, uid: f.ids[r], role: r });
    const tx = failTransactionsAfter(1, () => new Error("Write conflict"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let i: any;
    try {
      i = await press(fakeSelect(CPR_IDS.join(c.id), ["DRIVER"], { userId: f.ids.DRIVER, guildId: G, client: fakeCaperClient().client }));
    } finally { tx.mockRestore(); errors.mockRestore(); }
    expect(await testPrisma.caperCrew.count({ where: { caperId: c.id, userId: f.ids.DRIVER } })).toBe(1);
    expect((await testPrisma.caper.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("LOBBY");
    expect(said(i)).not.toContain("Vault busy, try again.");
  }));

  it("a jailed crew member can still open the brief and lock (edge 5)", async () => {
    const { caper, ids } = await seedRunning({ tier: 1, roles: [...R3], picks: { LOOKOUT: "none" } });
    await testPrisma.user.update({ where: { discordId: ids.LOOKOUT }, data: { isJailed: true, jailReleaseTime: new Date(Date.now() + 3_600_000) } });
    const b = await press(fakeButton(CPR_IDS.brief(caper.id), { userId: ids.LOOKOUT, guildId: G }));
    expect(said(b)).toContain("Tell <@");
    await press(fakeButton(CPR_IDS.act(caper.id, 1), { userId: ids.LOOKOUT, guildId: G, ephemeralSource: true, client: fakeCaperClient().client }));
    expect((await seat(caper.id, ids.LOOKOUT)).choice).toBe(1);
  });

  it("another user's S27 opener is not theirs", async () => {
    const db = vi.spyOn(prisma.caper, "findUnique");
    const i = await press(fakeButton(CPR_IDS.openBrief("65f000000000000000000001", "111111111111111111"), { userId: "222222222222222222" }));
    expect(said(i)).toContain("This panel is not yours.");
    expect(db).not.toHaveBeenCalled();
    db.mockRestore();
  });
});
