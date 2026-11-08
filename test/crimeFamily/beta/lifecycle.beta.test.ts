// Beta QA (LIFE): family lifecycle and membership, played as hostile players
// through the real services and the real crew: router. Every confirmed bug is
// an it.fails("BUG-LIFE-<n>: ...") that flips once the product is fixed.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { CRIME_FAMILY_CONFIG } from "../../../src/utils/economyConfig";
import { levelDef } from "../../../src/data/crimeFamilyCatalog";
import { renameFamily } from "../../../src/services/crimeFamily/familyService";
import {
  acceptInvite, declineInvite, leaveFamily, kickMember, listPendingInvites, expireInvites,
} from "../../../src/services/crimeFamily/membershipService";
import { promoteMember, demoteMember, handOverChair, claimChair, autoHandover } from "../../../src/services/crimeFamily/chairService";
import { disbandFamily } from "../../../src/services/crimeFamily/disbandService";
import { levelUp } from "../../../src/services/crimeFamily/progression";
import { checkMemberEligibility } from "../../../src/services/crimeFamily/eligibility";
import { applyToFamily, acceptApplication } from "../../../src/services/crimeFamily/recruitService";
import { checkFamilyName, checkFamilyTag } from "../../../src/services/crimeFamily/names";
import { joinsPerFamilyFor, capoCapFor } from "../../../src/services/crimeFamily/sizeRules";
import { runSuccession, sweepInvites } from "../../../src/services/crimeFamily/scheduler";
import { setInviteMessage } from "../../../src/services/crimeFamily/membershipService";
import { seedLobby, seedRunning } from "../caperFixtures";
import { handleCrimeFamilyInteraction } from "../../../src/handlers/crimeFamilyRouter";
import { CREW_IDS, encodeName } from "../../../src/ui/crimeFamily/ids";
import { fakeButton, fakeModal, said } from "../fakeInteraction";
import { fakeClient } from "../fakeClient";
import {
  testPrisma, seedEligibleUser, seedFamily, seedVote, seedWar, resetFamilies, ensureUniqueIndexes, daysAgo, withCfConfig,
} from "../../helpers";
import {
  DAY, HOUR, at, wallet, moneySnapshot, found, invite, recruit, bringIn, assertFamilyInvariants, rejections, fulfilled,
} from "./lifecycle.helpers";

const FEE = CRIME_FAMILY_CONFIG.createFee;
const open = <T>(fn: () => Promise<T>) => withCfConfig({ enabled: true }, fn);
const BUSY = /Vault busy, try again\./;

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite", "FamilyVote", "FamilyBallot", "PaydayShare"]));
beforeEach(resetFamilies);

// ── Founding: the gates, including the 2026-11-08 deed and card rule ─────────

describe("LIFE founding gates", () => {
  it("a Shack is not enough: refused before any debit, the refusal names the Apartment", async () => {
    const uid = await seedEligibleUser({ wallet: 20_000_000, property: "shack" });
    await expect(found(uid, "Shack Boys", "SHK")).rejects.toThrow(/own a property tier 2\+ \(Apartment or better\) \(you have a Shack\)/);
    expect(await wallet(uid)).toBe(20_000_000);
    expect(await testPrisma.family.count()).toBe(0);
  });

  it("no property at all, or only a deed sold before Confirm, is refused", async () => {
    const none = await seedEligibleUser({ wallet: 20_000_000, property: null });
    await expect(found(none, "Homeless Crew", "HML")).rejects.toThrow(/no property/);
    const seller = await seedEligibleUser({ wallet: 20_000_000 });
    await testPrisma.ownedProperty.deleteMany({ where: { userId: seller } });   // sold between the modal and Confirm
    await expect(found(seller, "Sold Out", "SLD")).rejects.toThrow(/no property/);
    expect(await testPrisma.family.count()).toBe(0);
  });

  it("deeds outside the regular catalog (zoo, custom) never count, even pricey ones", async () => {
    const uid = await seedEligibleUser({ wallet: 20_000_000, property: "zoo_safari_park" });
    await expect(found(uid, "Zoo Crew", "ZOO")).rejects.toThrow(/no property/);
  });

  it("a better deed and card (House, Black) pass; Apartment + Gold is the exact minimum", async () => {
    const a = await seedEligibleUser({ wallet: 20_000_000, property: "house", card: { tier: "BLACK" } });
    const b = await seedEligibleUser({ wallet: 20_000_000, property: "apartment", card: { tier: "GOLD" } });
    await expect(found(a, "House Money", "HSE")).resolves.toMatchObject({ bossId: a });
    await expect(found(b, "Gold Minimum", "GLD")).resolves.toMatchObject({ bossId: b });
  });

  it.each(["LOCKED", "DELINQUENT", "CLOSED"])("a Gold card that is %s is refused and the status is named", async (status) => {
    const uid = await seedEligibleUser({ wallet: 20_000_000, card: { tier: "GOLD", status } });
    await expect(found(uid, "Bad Credit", "BCR")).rejects.toThrow(new RegExp(`a Gold card \\(${status.toLowerCase()}\\)`));
    expect(await wallet(uid)).toBe(20_000_000);
  });

  it("an ACTIVE Starter card or no card is refused; a lowercase 'platinum' tier still counts", async () => {
    const starter = await seedEligibleUser({ wallet: 20_000_000, card: { tier: "STARTER" } });
    await expect(found(starter, "Starter Pack", "STP")).rejects.toThrow(/an active Gold card or better \(you have a Starter card\)/);
    const none = await seedEligibleUser({ wallet: 20_000_000, card: null });
    await expect(found(none, "No Card", "NOC")).rejects.toThrow(/\(you have no card\)/);
    const lower = await seedEligibleUser({ wallet: 20_000_000, card: { tier: "platinum" } });
    await expect(found(lower, "Lower Case", "LWC")).resolves.toMatchObject({ bossId: lower });
  });

  it("the deed and card are a founding gate only: locking the card and selling the deed after founding keeps the Boss's family and powers", async () => {
    const boss = await seedEligibleUser({ wallet: 20_000_000 });
    const fam = await found(boss, "Paper Empire", "PAP");
    await testPrisma.creditCard.updateMany({ where: { userId: boss }, data: { status: "LOCKED", tier: "STARTER" } });
    await testPrisma.ownedProperty.deleteMany({ where: { userId: boss } });
    const u = await recruit();
    const inv = await invite(boss, u);
    await acceptInvite(inv.id, u);
    expect((await testPrisma.family.findUnique({ where: { id: fam.id } }))!.memberCount).toBe(2);
    await assertFamilyInvariants();
  });

  it("wallet short by 1: Insufficient funds, no family, no ledger, no audit, wallet untouched", async () => {
    const uid = await seedEligibleUser({ wallet: FEE - 1, property: "house" });
    await testPrisma.property.update({ where: { key: "house" }, data: { price: 10_000_000 } });   // net worth 19,999,999 ≥ 15M
    try {
      await expect(found(uid, "Nearly Made", "ALM")).rejects.toThrow("Insufficient funds.");
      expect(await wallet(uid)).toBe(FEE - 1);
      expect(await testPrisma.family.count()).toBe(0);
      expect(await testPrisma.familyLedger.count()).toBe(0);
      expect(await testPrisma.audit.count({ where: { userId: uid, type: "family_create" } })).toBe(0);
    } finally {
      await testPrisma.property.update({ where: { key: "house" }, data: { price: 0 } });
    }
  });

  it("exactly the fee in the wallet (net worth from a deed) founds and leaves 0", async () => {
    const uid = await seedEligibleUser({ wallet: FEE, property: "house" });
    await testPrisma.property.update({ where: { key: "house" }, data: { price: 5_000_000 } });
    try {
      await found(uid, "Exact Change", "EXC");
      expect(await wallet(uid)).toBe(0);
    } finally {
      await testPrisma.property.update({ where: { key: "house" }, data: { price: 0 } });
    }
  });

  it("net worth 14,999,999 is refused even with the fee in the wallet", async () => {
    const uid = await seedEligibleUser({ wallet: 14_999_999 });
    await expect(found(uid, "Nearly Rich", "NRR")).rejects.toThrow(/≥ 15,000,000 net worth \(you have 14,999,999\)/);
  });

  it("heat 70 and a fresh LEFT exit (72 h) block founding; 71 h 59 m still blocked, 72 h passes", async () => {
    const hot = await seedEligibleUser({ wallet: 20_000_000, heat: 70 });
    await expect(found(hot, "Hot Heads", "HOT")).rejects.toThrow(/heat below 70/);
    const now = new Date();
    const leaver = await seedEligibleUser({ wallet: 20_000_000 });
    await testPrisma.familyExit.create({ data: { userId: leaver, familyId: "65f0000000000000000000ab", reason: "LEFT", leftAt: now } });
    await expect(found(leaver, "Fresh Start", "FRS", at(now, 72 * HOUR - 60_000))).rejects.toThrow(/no recent family exit/);
    await expect(found(leaver, "Fresh Start", "FRS", at(now, 72 * HOUR))).resolves.toMatchObject({ bossId: leaver });
  });
});

describe("LIFE the 10,000,000 fee under races", () => {
  it("five concurrent creates by one player (different names): one family, one debit", async () => {
    const uid = await seedEligibleUser({ wallet: 60_000_000 });
    const rs = await Promise.allSettled(["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((n, k) => found(uid, `${n} Crew`, `T${k}`)));
    expect(fulfilled(rs)).toBe(1);
    for (const m of rejections(rs)) expect(m).toMatch(/^(You are already in a family\.|Vault busy, try again\.)$/);
    expect(await testPrisma.family.count()).toBe(1);
    expect(await wallet(uid)).toBe(50_000_000);
    await assertFamilyInvariants();
  });

  it("a double-click on the same Confirm: one family, one debit", async () => {
    const uid = await seedEligibleUser({ wallet: 30_000_000 });
    const rs = await Promise.allSettled([found(uid, "Double Tap", "DBL"), found(uid, "Double Tap", "DBL")]);
    expect(fulfilled(rs)).toBe(1);
    expect(await wallet(uid)).toBe(20_000_000);
  });

  it("four players race for one tag typed differently (vla, VLA, ' Vla '): one family, the losers keep their money", async () => {
    const ids = await Promise.all([0, 1, 2, 3].map(() => seedEligibleUser({ wallet: 15_000_000 })));
    const tags = ["vla", "VLA", " Vla ", "vLa"];
    const rs = await Promise.allSettled(ids.map((id, k) => found(id, `Crew Number ${k}`, tags[k])));
    expect(fulfilled(rs)).toBe(1);
    for (const m of rejections(rs)) expect(m).toMatch(/^(Name or tag taken\.|Vault busy, try again\.)$/);
    const wallets = await Promise.all(ids.map(wallet));
    expect(wallets.filter((w) => w === 5_000_000)).toHaveLength(1);
    expect(wallets.filter((w) => w === 15_000_000)).toHaveLength(3);
  });

  it("founding races accepting an invite: the player ends in exactly one family and pays only if founding won", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss, tag: "INV" });
    const u = await seedEligibleUser({ wallet: 15_000_000 });
    const inv = await invite(boss, u);
    const rs = await Promise.allSettled([found(u, "My Own Crew", "OWN"), acceptInvite(inv.id, u)]);
    expect(fulfilled(rs)).toBe(1);
    const m = await testPrisma.familyMember.findUnique({ where: { userId: u } });
    const founded = rs[0].status === "fulfilled";
    expect(await wallet(u)).toBe(founded ? 5_000_000 : 15_000_000);
    expect(m!.role).toBe(founded ? "BOSS" : "SOLDIER");
    await assertFamilyInvariants();
  });

  it("founding, an invite accept and an application accept all at once: still one family", async () => {
    const b1 = await seedEligibleUser(); const b2 = await seedEligibleUser();
    const f1 = await seedFamily({ bossId: b1, tag: "ONE" });
    const f2 = await seedFamily({ bossId: b2, tag: "TWO", data: { recruiting: true } });
    const u = await seedEligibleUser({ wallet: 15_000_000 });
    const inv = await invite(b1, u);
    const app = await applyToFamily({ applicantId: u, familyId: f2.id, message: "let me in", guildId: "g1", channelId: "c1" });
    const rs = await Promise.allSettled([found(u, "Third Way", "TRD"), acceptInvite(inv.id, u), acceptApplication(app.id, b2)]);
    expect(fulfilled(rs)).toBe(1);
    expect(await testPrisma.familyMember.count({ where: { userId: u } })).toBe(1);
    const where = (await testPrisma.familyMember.findUnique({ where: { userId: u } }))!.familyId;
    if (rs[0].status === "rejected") expect([f1.id, f2.id]).toContain(where);
    expect(await wallet(u)).toBe(rs[0].status === "fulfilled" ? 5_000_000 : 15_000_000);
    await assertFamilyInvariants();
  });
});

describe("LIFE names and tags", () => {
  it.each([
    ["Velvet​Ante", "zero-width joiner"],
    ["Vеlvet Ante", "Cyrillic e homoglyph"],
    ["**Bold Crew**", "markdown"],
    ["@everyone Crew", "mass ping"],
    ["<@123456789012345678>", "user mention"],
    ["Street Kings", "reserved Street"],
    ["St-reet Kings", "Street split by a hyphen"],
    ["The Streets", "Streets"],
    ["Mod Squad", "mod"],
    ["Velvet\tAnte", "tab"],
    ["Velvet Ante", "no-break space"],
    ["x".repeat(25), "25 chars"],
  ])("refuses %j (%s)", (name) => {
    expect(checkFamilyName(name).ok).toBe(false);
  });

  it("trims and folds case for the unique key; a 24-char name with ' and - passes", () => {
    expect(checkFamilyName("  Velvet Ante  ")).toEqual({ ok: true, name: "Velvet Ante", nameKey: "velvet ante" });
    const long = "O'Brien-Gambino Crew 123";
    expect(long).toHaveLength(24);
    expect(checkFamilyName(long).ok).toBe(true);
  });

  it("tags: case-folded, 2-4 ASCII; homoglyphs, symbols and reserved words refused", () => {
    expect(checkFamilyTag(" vla ")).toEqual({ ok: true, tag: "VLA", tagKey: "VLA" });
    for (const bad of ["А1", "V-L", "V:A", "A", "ABCDE", "MOD", "HERE", "COPS", "🙂🙂"]) expect(checkFamilyTag(bad).ok).toBe(false);
  });

  it("two families cannot hold names that differ only by case or outer spaces", async () => {
    const a = await seedEligibleUser({ wallet: 15_000_000 }); const b = await seedEligibleUser({ wallet: 15_000_000 });
    await found(a, "Velvet Ante", "VA1");
    await expect(found(b, "  VELVET ANTE ", "VA2")).rejects.toThrow("Name or tag taken.");
    expect(await wallet(b)).toBe(15_000_000);
  });
});

describe("LIFE founding through the crew: router", () => {
  it("modal → confirm card → Confirm founds; a stranger pressing the Confirm is refused; a forged Confirm with a reserved name is refused", async () => {
    await open(async () => {
      const uid = await seedEligibleUser({ wallet: 15_000_000 });
      const modal = fakeModal(CREW_IDS.modal("create", uid), { name: "Router Crew", tag: "rtc" }, { userId: uid });
      await handleCrimeFamilyInteraction(modal as any);
      expect(said(modal)).toContain(CREW_IDS.createOk("RTC", "Router Crew", uid));

      const stranger = await seedEligibleUser({ wallet: 15_000_000 });
      const steal = fakeButton(CREW_IDS.createOk("RTC", "Router Crew", uid), { userId: stranger });
      await handleCrimeFamilyInteraction(steal as any);
      expect(said(steal)).toMatch(/not yours/);

      const forged = fakeButton(`crew:create:ok:STR:${encodeName("Street Kings")}:${stranger}`, { userId: stranger });
      await handleCrimeFamilyInteraction(forged as any);
      expect(said(forged)).toMatch(/That name is not allowed\./);
      expect(await wallet(stranger)).toBe(15_000_000);

      const ok = fakeButton(CREW_IDS.createOk("RTC", "Router Crew", uid), { userId: uid, ephemeralSource: true });
      await handleCrimeFamilyInteraction(ok as any);
      expect(await testPrisma.family.findUnique({ where: { tagKey: "RTC" } })).toMatchObject({ bossId: uid, name: "Router Crew" });
      expect(await wallet(uid)).toBe(5_000_000);
    });
  });

  it("a Confirm pressed from a DM is refused (founding needs a server)", async () => {
    await open(async () => {
      const uid = await seedEligibleUser({ wallet: 15_000_000 });
      const dm = fakeButton(CREW_IDS.createOk("DMC", "Dm Crew", uid), { userId: uid, guildId: null });
      await handleCrimeFamilyInteraction(dm as any);
      expect(said(dm)).toMatch(/not open in this server/);
      expect(await testPrisma.family.count()).toBe(0);
    });
  });
});

// ── Invites ──────────────────────────────────────────────────────────────────

describe("LIFE invites", () => {
  it("the inviter's 3-per-7-days cap refuses the 4th invite before any row is written", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    for (let k = 0; k < 3; k++) await bringIn(boss);
    await expect(invite(boss, await recruit())).rejects.toThrow("You can bring in 3 members per 7 days.");
  });

  it("BUG-LIFE-1: a declined invitee can be re-invited (and re-pinged) at once, without limit", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const victim = await recruit();
    let lastErr: unknown = null;
    for (let k = 0; k < 10; k++) {
      try {
        const inv = await invite(boss, victim);
        await declineInvite(inv.id, victim);
      } catch (err) { lastErr = err; break; }
    }
    // Expected: some re-invite cooldown after a decline (applications wait reapplyAfterDeclineSeconds).
    expect(lastErr).not.toBeNull();
  });

  it("an invite expires at expiresAt exactly: accept refused, invite listing empty, sweeper expires it once", async () => {
    const now = new Date();
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const u = await recruit();
    const inv = await invite(boss, u, now);
    const end = at(now, CRIME_FAMILY_CONFIG.inviteTtlSeconds * 1000);
    expect(await listPendingInvites(u, at(end, -1))).toHaveLength(1);
    expect(await listPendingInvites(u, end)).toHaveLength(0);
    await expect(acceptInvite(inv.id, u, end)).rejects.toThrow("Invite expired.");
    expect((await expireInvites(end)).map((r) => r.id)).toEqual([inv.id]);
    expect(await expireInvites(end)).toEqual([]);
  });

  it("jailed, banned and ineligible invitees can be invited but the accept is refused and the invite stays PENDING", async () => {
    const boss = await seedEligibleUser();
    await seedFamily({ bossId: boss });
    const jailed = await seedEligibleUser({ wallet: 2_000_000, jailedUntil: new Date(Date.now() + DAY) });
    const banned = await seedEligibleUser({ wallet: 2_000_000, ban: { expiresAt: null } });
    const young = await seedEligibleUser({ wallet: 2_000_000, discordAgeDays: 30 });
    const i1 = await invite(boss, jailed); const i2 = await invite(boss, banned); const i3 = await invite(boss, young);
    await expect(acceptInvite(i1.id, jailed)).rejects.toThrow("You can't do that while in jail.");
    await expect(acceptInvite(i2.id, banned)).rejects.toThrow(/not banned/);
    await expect(acceptInvite(i3.id, young)).rejects.toThrow(/≥ 90 days Discord age/);
    expect(await testPrisma.familyInvite.count({ where: { status: "PENDING" } })).toBe(3);
    expect(await testPrisma.familyMember.count()).toBe(1);
  });

  it("accept after the family filled is 'Family is full.'; the same invite works once a seat frees", async () => {
    const boss = await seedEligibleUser();
    const soldiers = await Promise.all(Array.from({ length: 8 }, () => recruit()));
    const f = await seedFamily({ bossId: boss, members: soldiers.map((userId) => ({ userId, role: "SOLDIER" as const })) });
    const late = await recruit();
    const iLate = await invite(boss, late);
    await bringIn(boss);   // 10 of 10
    await expect(acceptInvite(iLate.id, late)).rejects.toThrow("Family is full.");
    expect((await testPrisma.familyInvite.findUnique({ where: { id: iLate.id } }))!.status).toBe("PENDING");
    await leaveFamily(soldiers[3]);
    const { member } = await acceptInvite(iLate.id, late);
    expect(member.seat).toBe(5);   // seat 5 was the leaver's (Boss 1, soldiers 2..9)
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(10);
    await assertFamilyInvariants();
  });

  it("a triple-click on Accept seats once and memberCount moves by one", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss });
    const u = await recruit();
    const inv = await invite(boss, u);
    const rs = await Promise.allSettled([acceptInvite(inv.id, u), acceptInvite(inv.id, u), acceptInvite(inv.id, u)]);
    expect(fulfilled(rs)).toBe(1);
    for (const m of rejections(rs)) expect(m).toMatch(/^(Invite expired\.|You are already in a family\.|Vault busy, try again\.)$/);
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(2);
    await assertFamilyInvariants();
  });

  it("invite, then kick the inviting Capo: the invite is gone and Accept reads 'Invite expired.'", async () => {
    const boss = await seedEligibleUser(); const capo = await seedEligibleUser({ wallet: 2_000_000 });
    await seedFamily({ bossId: boss, members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }] });
    const u = await recruit();
    const inv = await invite(capo, u);
    await kickMember(boss, capo);
    await expect(acceptInvite(inv.id, u)).rejects.toThrow("Invite expired.");
    expect(await testPrisma.familyMember.findUnique({ where: { userId: u } })).toBeNull();
  });

  it("kicking the inviter while the invitee presses Accept: either the join stands with an ACCEPTED invite or nothing happened", async () => {
    for (let round = 0; round < 4; round++) {
      await resetFamilies();
      const boss = await seedEligibleUser(); const capo = await seedEligibleUser({ wallet: 2_000_000 });
      const f = await seedFamily({ bossId: boss, members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }] });
      const u = await recruit();
      const inv = await invite(capo, u);
      await Promise.allSettled([kickMember(boss, capo), acceptInvite(inv.id, u)]);
      const row = await testPrisma.familyInvite.findUnique({ where: { id: inv.id } });
      const joined = await testPrisma.familyMember.findUnique({ where: { userId: u } });
      if (joined) expect(row!.status).toBe("ACCEPTED");
      else expect(row).toBeNull();
      expect(await testPrisma.familyMember.findUnique({ where: { userId: capo } })).toBeNull();
      expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(joined ? 2 : 1);
      await assertFamilyInvariants();
    }
  });

  it("decline then accept the same invite: refused; a press on a deleted invite reads expired, not a crash", async () => {
    await open(async () => {
      const boss = await seedEligibleUser();
      await seedFamily({ bossId: boss });
      const u = await recruit();
      const inv = await invite(boss, u);
      const dec = fakeButton(CREW_IDS.invite("decline", inv.id), { userId: u });
      await handleCrimeFamilyInteraction(dec as any);
      expect(said(dec)).toMatch(/Invite declined/);
      const acc = fakeButton(CREW_IDS.invite("accept", inv.id), { userId: u });
      await handleCrimeFamilyInteraction(acc as any);
      expect(said(acc)).toMatch(/Invite expired/);
      const ghost = fakeButton(CREW_IDS.invite("accept", "65f00000000000000000dead"), { userId: u });
      await handleCrimeFamilyInteraction(ghost as any);
      expect(said(ghost)).toMatch(/Invite expired/);
      const other = await recruit();
      const inv2 = await invite(boss, other);
      const hijack = fakeButton(CREW_IDS.invite("accept", inv2.id), { userId: u });
      await handleCrimeFamilyInteraction(hijack as any);
      expect(said(hijack)).toMatch(/This invite is not for you/);
      expect(await testPrisma.familyMember.count()).toBe(1);
    });
  });
});

// ── Joining: caps and cooldowns ──────────────────────────────────────────────

describe("LIFE joining caps and cooldowns", () => {
  it.each([1, 4, 7, 10])("level %i: the weekly join cap is joinsPerFamilyFor(level) and holds across officers", async (level) => {
    const now = new Date();
    const boss = await seedEligibleUser();
    const officers = await Promise.all([0, 1, 2].map(() => seedEligibleUser({ wallet: 2_000_000 })));
    const f = await seedFamily({
      bossId: boss, level,
      members: officers.map((userId, k) => ({ userId, role: (k === 0 ? "UNDERBOSS" : "CAPO") as any, joinedAt: daysAgo(30) })),
    });
    const cap = joinsPerFamilyFor(level);
    const inviters = [boss, ...officers];
    let joined = 0;
    for (let k = 0; k < cap; k++) { await bringIn(inviters[Math.floor(k / 3)], now); joined++; }
    expect(joined).toBe(cap);
    await expect(invite(inviters[3], await recruit(), now)).rejects.toThrow(`Your family can take ${cap} new members per 7 days.`);
    // a week later the window frees
    await expect(bringIn(inviters[3], at(now, 7 * DAY + 1))).resolves.toBeTruthy();
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(4 + cap + 1);
    await assertFamilyInvariants();
  });

  it("hop cooldowns: KICKED 24 h, LEFT 72 h, DISBANDED 24 h, and 14 days before rejoining the same family", async () => {
    const now = new Date();
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, level: 10 });
    const otherBoss = await seedEligibleUser();
    await seedFamily({ bossId: otherBoss, level: 10 });

    const kicked = await bringIn(boss, now);
    await kickMember(boss, kicked, now);
    const k1 = await invite(otherBoss, kicked, at(now, 23 * HOUR));
    await expect(acceptInvite(k1.id, kicked, at(now, 23 * HOUR))).rejects.toThrow(/no recent family exit/);
    await acceptInvite(k1.id, kicked, at(now, 24 * HOUR));

    const leaver = await bringIn(boss, now);
    await leaveFamily(leaver, now);
    const l1 = await invite(otherBoss, leaver, at(now, 71 * HOUR));
    await expect(acceptInvite(l1.id, leaver, at(now, 71 * HOUR))).rejects.toThrow(/no recent family exit/);
    await acceptInvite(l1.id, leaver, at(now, 72 * HOUR));

    const back = await bringIn(boss, now);
    await kickMember(boss, back, now);
    const r1 = await invite(boss, back, at(now, 13 * DAY));
    await expect(acceptInvite(r1.id, back, at(now, 13 * DAY))).rejects.toThrow(/≥ 14 days since you left this family/);
    await testPrisma.familyInvite.deleteMany({ where: { id: r1.id } });
    const r2 = await invite(boss, back, at(now, 14 * DAY));
    await expect(acceptInvite(r2.id, back, at(now, 14 * DAY))).resolves.toBeTruthy();
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(2);
    await assertFamilyInvariants();
  });

  it("disband: every member waits 24 h to join; the Boss waits 7 days to found again; the name and tag are free at once", async () => {
    const now = new Date();
    const boss = await seedEligibleUser({ wallet: 30_000_000 });
    await found(boss, "Short Lived", "SHL", now);
    const m = await bringIn(boss, now);
    await disbandFamily(boss, "shl", now);
    const reuse = await seedEligibleUser({ wallet: 15_000_000 });
    await expect(found(reuse, "Short Lived", "SHL", now)).resolves.toMatchObject({ tagKey: "SHL" });
    const i1 = await invite(reuse, m, at(now, 23 * HOUR));
    await expect(acceptInvite(i1.id, m, at(now, 23 * HOUR))).rejects.toThrow(/no recent family exit/);
    await acceptInvite(i1.id, m, at(now, 24 * HOUR));
    expect((await checkMemberEligibility(boss, "found", { now: at(now, 6 * DAY) })).failures.map((x) => x.gate)).toEqual(["refound_cooldown"]);
    expect((await checkMemberEligibility(boss, "found", { now: at(now, 7 * DAY) })).ok).toBe(true);
    expect((await checkMemberEligibility(boss, "family_join", { now: at(now, 24 * HOUR) })).ok).toBe(true);
  });
});

// ── Leave, kick, ranks ───────────────────────────────────────────────────────

describe("LIFE leave and kick", () => {
  async function ranked() {
    const ids = await Promise.all([0, 1, 2, 3, 4].map(() => seedEligibleUser({ wallet: 2_000_000 })));
    const [boss, ub, capo, capo2, soldier] = ids;
    const f = await seedFamily({
      bossId: boss, level: 3,
      members: [
        { userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(30) }, { userId: capo, role: "CAPO", joinedAt: daysAgo(30) },
        { userId: capo2, role: "CAPO", joinedAt: daysAgo(30) }, { userId: soldier, role: "SOLDIER", joinedAt: daysAgo(30) },
      ],
    });
    return { f, boss, ub, capo, capo2, soldier };
  }

  it("the kick matrix: Soldiers kick nobody; a Capo kicks only Soldiers; nobody kicks up or sideways; the Boss can't be kicked", async () => {
    const { boss, ub, capo, capo2, soldier } = await ranked();
    const NO = "You don't have permission to do that.";
    await expect(kickMember(soldier, capo)).rejects.toThrow(NO);
    await expect(kickMember(capo, capo2)).rejects.toThrow(NO);
    await expect(kickMember(capo, ub)).rejects.toThrow(NO);
    await expect(kickMember(ub, boss)).rejects.toThrow(NO);
    await expect(kickMember(capo, capo)).rejects.toThrow(NO);
    await kickMember(capo, soldier);
    await kickMember(ub, capo2);
    await kickMember(boss, ub);
    await assertFamilyInvariants();
  });

  it("a Boss with members can't leave, even during an open vote; an Underboss can leave during the vote", async () => {
    const { f, boss, ub, capo, capo2, soldier } = await ranked();
    await seedVote({ familyId: f.id, bossId: boss, starterId: capo, eligibleIds: [ub, capo, capo2, soldier] });
    await expect(leaveFamily(boss)).rejects.toThrow(/Hand over the chair first/);
    await expect(handOverChair(boss, ub)).rejects.toThrow("No handover while a no-confidence vote is open.");
    await expect(kickMember(boss, soldier)).rejects.toThrow("No kicks while a no-confidence vote is open.");
    await expect(promoteMember(boss, soldier)).rejects.toThrow(/No promotions or demotions/);
    await expect(disbandFamily(boss, f.tag)).rejects.toThrow(/No disband while a no-confidence vote is open/);
    await leaveFamily(ub);
    await assertFamilyInvariants();
  });

  it("kicks are frozen during an ACTIVE turf war; a member who fought in a live war cannot leave", async () => {
    const { f, boss, soldier, capo } = await ranked();
    const otherBoss = await seedEligibleUser();
    const g = await seedFamily({ bossId: otherBoss });
    const war = await seedWar({ racketKey: "docks_numbers", status: "ACTIVE", attackerFamilyId: f.id, defenderFamilyId: g.id });
    await expect(kickMember(boss, soldier)).rejects.toThrow("No kicks during an active turf war.");
    await testPrisma.warContribution.create({ data: { warId: war.id, familyId: f.id, userId: capo, side: "ATK", nextHitAt: new Date(0) } });
    await expect(leaveFamily(capo)).rejects.toThrow(/stay until it resolves/);
    await leaveFamily(soldier);   // never fought
    await assertFamilyInvariants();
  });

  it("a solo Boss is pointed to disband; leaving twice concurrently counts once", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss });
    await expect(leaveFamily(boss)).rejects.toThrow(/use `!crew disband`/);
    const u = await bringIn(boss);
    const rs = await Promise.allSettled([leaveFamily(u), leaveFamily(u), leaveFamily(u)]);
    expect(fulfilled(rs)).toBe(1);
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(1);
    expect(await testPrisma.familyExit.count({ where: { userId: u } })).toBe(1);
  });

  it("the kick confirm through the router: the S26 owner only; a forged target from another family is refused", async () => {
    await open(async () => {
      const { boss, soldier } = await ranked();
      const outsider = await seedEligibleUser();
      await seedFamily({ bossId: outsider });
      const notMine = fakeButton(CREW_IDS.confirm("kick", "ok", soldier, boss), { userId: soldier });
      await handleCrimeFamilyInteraction(notMine as any);
      expect(said(notMine)).toMatch(/not yours/);
      const forged = fakeButton(CREW_IDS.confirm("kick", "ok", outsider, boss), { userId: boss, ephemeralSource: true });
      await handleCrimeFamilyInteraction(forged as any);
      expect(said(forged)).toMatch(/is not in your family/);
      expect(await testPrisma.familyMember.findUnique({ where: { userId: outsider } })).not.toBeNull();
      const ok = fakeButton(CREW_IDS.confirm("kick", "ok", soldier, boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
      await handleCrimeFamilyInteraction(ok as any);
      expect(said(ok)).toMatch(/was kicked/);
      await assertFamilyInvariants();
    });
  });
});

describe("LIFE ranks", () => {
  it("Capo cap is floor(members/5) with a floor of 1: 9 members hold 1 Capo, the 10th member opens a 2nd seat", async () => {
    const boss = await seedEligibleUser();
    const rich = await Promise.all(Array.from({ length: 8 }, () => seedEligibleUser({ wallet: 10_000_000 })));
    const f = await seedFamily({ bossId: boss, members: rich.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
    expect(capoCapFor(9)).toBe(1);
    await promoteMember(boss, rich[0]);
    await expect(promoteMember(boss, rich[1])).rejects.toThrow("Capo seats are full (1/1 for 9 members).");
    await bringIn(boss);
    await expect(promoteMember(boss, rich[1])).resolves.toMatchObject({ newRole: "CAPO" });
    expect((await testPrisma.familyMember.findUnique({ where: { userId: rich[1] } }))!.roleSlot).toBe("CAPO2");
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.memberCount).toBe(10);
  });

  it("the 10,000,000 bar: 9,999,999 refused for Capo and Underboss, exactly 10,000,000 passes; a Capo who later goes broke keeps every power", async () => {
    const boss = await seedEligibleUser();
    const poor = await seedEligibleUser({ wallet: 9_999_999 }); const rich = await seedEligibleUser({ wallet: 10_000_000 });
    await seedFamily({ bossId: boss, level: 5, members: [poor, rich].map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })) });
    await expect(promoteMember(boss, poor)).rejects.toThrow(/Promotion needs .*10,000,000.* net worth/);
    await promoteMember(boss, rich);
    await testPrisma.wallet.update({ where: { userId: rich }, data: { balance: 0 } });
    await expect(promoteMember(boss, rich)).rejects.toThrow(/Promotion needs/);    // Capo → Underboss re-checks
    const t = await recruit();
    await expect(invite(rich, t)).resolves.toMatchObject({ status: "PENDING" });   // grandfathered Capo still invites
    expect((await testPrisma.familyMember.findUnique({ where: { userId: rich } }))!.role).toBe("CAPO");
  });

  it("demotions set officerUntil = now + 7 d; a promotion does not; an Underboss can't touch another officer's rank above Capo", async () => {
    const now = new Date();
    const boss = await seedEligibleUser();
    const ub = await seedEligibleUser({ wallet: 10_000_000 }); const capo = await seedEligibleUser({ wallet: 10_000_000 });
    await seedFamily({ bossId: boss, level: 5, members: [
      { userId: ub, role: "UNDERBOSS", joinedAt: daysAgo(30) }, { userId: capo, role: "CAPO", joinedAt: daysAgo(30) },
    ] });
    await expect(promoteMember(ub, capo, now)).rejects.toThrow("You don't have permission to do that.");
    await demoteMember(ub, capo, now);
    const row = await testPrisma.familyMember.findUnique({ where: { userId: capo } });
    expect(row).toMatchObject({ role: "SOLDIER", roleSlot: capo });
    expect(+row!.officerUntil).toBe(+now + CRIME_FAMILY_CONFIG.voteOfficerGraceSeconds * 1000);
    await promoteMember(ub, capo, at(now, 1000));
    expect(+(await testPrisma.familyMember.findUnique({ where: { userId: capo } }))!.officerUntil).toBe(+row!.officerUntil);
    await assertFamilyInvariants();
  });
});

// ── The chair ────────────────────────────────────────────────────────────────

describe("LIFE the chair", () => {
  it("claim: a Capo can't claim; the Underboss claims at exactly 7 days; the old Boss becomes a Soldier", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const capo = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS" }, { userId: capo, role: "CAPO" }] });
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: at(now, -7 * DAY) } });
    await expect(claimChair(f.id, capo, now)).rejects.toThrow("You don't have permission to do that.");
    await expect(claimChair(f.id, ub, at(now, -1))).rejects.toThrow("The Boss is still active.");
    const move = await claimChair(f.id, ub, now);
    expect(move.newBossId).toBe(ub);
    expect(await testPrisma.familyMember.findUnique({ where: { userId: boss } })).toMatchObject({ role: "SOLDIER", roleSlot: boss });
    await assertFamilyInvariants();
  });

  it("autoHandover heir order: an inactive Underboss is skipped for the earliest active Capo; 13d 23h is not due", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const capoOld = await seedEligibleUser(); const capoNew = await seedEligibleUser(); const soldier = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, level: 5, members: [
      { userId: ub, role: "UNDERBOSS", lastActiveAt: at(now, -8 * DAY) },
      { userId: capoNew, role: "CAPO", joinedAt: daysAgo(5), lastActiveAt: now },
      { userId: capoOld, role: "CAPO", joinedAt: daysAgo(20), lastActiveAt: now },
      { userId: soldier, role: "SOLDIER", capers: 99, lastActiveAt: now },
    ] });
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: at(now, -14 * DAY + HOUR) } });
    expect(await autoHandover(f.id, now)).toBeNull();
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: at(now, -14 * DAY) } });
    expect((await autoHandover(f.id, now))!.newBossId).toBe(capoOld);
    await assertFamilyInvariants();
  });

  it("an Underboss claim during an open vote commits and voids the vote with no cooldown", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const capo = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS" }, { userId: capo, role: "CAPO" }, { userId: s, role: "SOLDIER" }] });
    const vote = await seedVote({ familyId: f.id, bossId: boss, starterId: capo, eligibleIds: [ub, capo, s] });
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: at(now, -8 * DAY) } });
    await claimChair(f.id, ub, now);
    const v = await testPrisma.familyVote.findUnique({ where: { id: vote.id } });
    expect(v).toMatchObject({ status: "VOID" });
    expect(+v!.cooldownUntil).toBe(+v!.closedAt);
  });

  it("claim and handover race: exactly one chair move", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS" }, { userId: s, role: "SOLDIER" }] });
    await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: at(now, -8 * DAY) } });
    const rs = await Promise.allSettled([claimChair(f.id, ub, now), handOverChair(boss, s, now)]);
    expect(fulfilled(rs)).toBe(1);
    const fam = await testPrisma.family.findUnique({ where: { id: f.id } });
    expect([ub, s]).toContain(fam!.bossId);
    await assertFamilyInvariants();
  });

  it("BUG-LIFE-2: after a claim, a later handover rewrites the old, resolved S23 claim card", async () => {
    await open(async () => {
      const now = new Date();
      const boss = await seedEligibleUser(); const ub = await seedEligibleUser(); const s = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, members: [{ userId: ub, role: "UNDERBOSS" }, { userId: s, role: "SOLDIER" }] });
      await testPrisma.familyMember.update({ where: { userId: boss }, data: { lastActiveAt: at(now, -8 * DAY) } });
      const fc = fakeClient();
      await runSuccession(fc.client as any, now);
      const s23 = (await testPrisma.family.findUnique({ where: { id: f.id } }))!.claimMessageId;
      expect(s23).not.toBe("");
      const claim = fakeButton(CREW_IDS.claim(f.id), { userId: ub, client: fc.client });
      await handleCrimeFamilyInteraction(claim as any);
      expect(said(claim)).toMatch(/You are now the Boss/);
      const editsAfterClaim = fc.edits.filter(([id]) => id === s23).length;
      expect(editsAfterClaim).toBe(1);   // "Chair claimed by <@ub>"
      // Weeks later the new Boss hands the chair on: the old card about the first Boss must not change again.
      const hand = fakeButton(CREW_IDS.confirm("chair", "ok", s, ub), { userId: ub, ephemeralSource: true, client: fc.client });
      await handleCrimeFamilyInteraction(hand as any);
      expect(said(hand)).toMatch(/is now the Boss/);
      expect(fc.edits.filter(([id]) => id === s23).length).toBe(1);
    });
  });

  it("BUG-LIFE-3: when a Boss gets the chair back after a claim, the hourly job rewrites the old resolved S23 to 'The Boss is back.'", async () => {
    const now = new Date();
    const a = await seedEligibleUser(); const b = await seedEligibleUser();
    const f = await seedFamily({ bossId: a, members: [{ userId: b, role: "UNDERBOSS" }] });
    await testPrisma.familyMember.update({ where: { userId: a }, data: { lastActiveAt: at(now, -8 * DAY) } });
    const fc = fakeClient();
    await runSuccession(fc.client as any, now);                     // S23 for A's absence
    const s23 = (await testPrisma.family.findUnique({ where: { id: f.id } }))!.claimMessageId;
    expect(s23).not.toBe("");
    await claimChair(f.id, b, now);                                  // B claims (the card now reads "Chair claimed by B")
    await handOverChair(b, a, at(now, HOUR));                       // later B hands the chair back to A
    await testPrisma.familyMember.update({ where: { userId: a }, data: { lastActiveAt: at(now, HOUR) } });
    const before = fc.edits.filter(([id]) => id === s23).length;
    await runSuccession(fc.client as any, at(now, 2 * HOUR));       // the hourly job sees A active
    expect(fc.edits.filter(([id]) => id === s23).length).toBe(before);   // the old card must not be rewritten
  });
});

// ── Rename ───────────────────────────────────────────────────────────────────

describe("LIFE stale buttons and cards", () => {
  it("BUG-LIFE-4: a double-click on S5 Promote lifts a Soldier two ranks, to Underboss", async () => {
    await open(async () => {
      const boss = await seedEligibleUser(); const s = await seedEligibleUser({ wallet: 10_000_000 });
      await seedFamily({ bossId: boss, members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
      const press = () => {
        const i = fakeButton(CREW_IDS.rank("promote", s, "SOLDIER", boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
        return handleCrimeFamilyInteraction(i as any).then(() => i);
      };
      await Promise.all([press(), press()]);   // both presses were rendered for a Soldier
      expect((await testPrisma.familyMember.findUnique({ where: { userId: s } }))!.role).toBe("CAPO");
    });
  });

  it("the same stale press on a level-up confirm is refused (contrast: S8 carries the level it was rendered for)", async () => {
    await open(async () => {
      const boss = await seedEligibleUser();
      const f = await seedFamily({ bossId: boss, xp: 3_000, treasury: 10_000_000 });
      const press = () => {
        const i = fakeButton(CREW_IDS.levelOk(1, boss), { userId: boss, ephemeralSource: true, client: fakeClient().client });
        return handleCrimeFamilyInteraction(i as any).then(() => i);
      };
      await Promise.all([press(), press()]);
      expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.level).toBe(2);
    });
  });

  it("BUG-LIFE-5: an S4 invite card stays live forever when its invite is closed by a disband or a kick of the inviter", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const capo = await seedEligibleUser();
    await seedFamily({ bossId: boss, tag: "SCD", members: [{ userId: capo, role: "CAPO", joinedAt: daysAgo(10) }] });
    const a = await recruit(); const b = await recruit();
    const byCapo = await invite(capo, a, now); await setInviteMessage(byCapo.id, "card-capo");
    const byBoss = await invite(boss, b, now); await setInviteMessage(byBoss.id, "card-boss");
    await kickMember(boss, capo, now);          // closes the Capo's invite
    await disbandFamily(boss, "SCD", now);      // closes the Boss's invite; the family is gone
    const fc = fakeClient();
    await sweepInvites(fc.client as any, at(now, 2 * DAY));   // the minute job, long after both expiries
    const editedCards = fc.edits.map(([id]) => id);
    expect(editedCards).toEqual(expect.arrayContaining(["card-capo", "card-boss"]));
  });
});

describe("LIFE heists and membership", () => {
  it("a lobby seat blocks leaving but not a kick (the kick refunds the stake); a running heist blocks the kick", async () => {
    const lobby = await seedLobby({ roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    await expect(leaveFamily(lobby.ids.LOOKOUT)).rejects.toThrow(/seated in a live crew heist/);
    const before = await wallet(lobby.ids.LOOKOUT);
    await kickMember(lobby.bossId, lobby.ids.LOOKOUT);
    expect(await wallet(lobby.ids.LOOKOUT)).toBeGreaterThan(before);
    expect(await testPrisma.caperCrew.count({ where: { caperId: lobby.caper.id, userId: lobby.ids.LOOKOUT } })).toBe(0);
    await assertFamilyInvariants();
    await resetFamilies();
    const run = await seedRunning({ roles: ["MASTERMIND", "LOOKOUT", "SAFECRACKER", "DRIVER"] });
    await expect(kickMember(run.bossId, run.ids.DRIVER)).rejects.toThrow(/is in a running crew heist/);
    await assertFamilyInvariants();
  });
});

describe("LIFE rename", () => {
  it("Boss only; 2,000,000 from the vault earnings first; the tag never changes; once per 30 days", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, name: "Old Name", tag: "OLD", treasury: 5_000_000, earnings: 500_000, members: [{ userId: ub, role: "UNDERBOSS" }],
      data: { lastRenamedAt: daysAgo(31, now) } });
    await expect(renameFamily(ub, "Coup Name", now)).rejects.toThrow("You don't have permission to do that.");
    const r = await renameFamily(boss, "New Name", now);
    expect(r).toMatchObject({ name: "New Name", nameKey: "new name", tag: "OLD", tagKey: "OLD", earnings: 0, treasury: 3_500_000 });
    await expect(renameFamily(boss, "Newer Name", at(now, 29 * DAY))).rejects.toThrow("You can rename once every 30 days.");
    await expect(renameFamily(boss, "Newer Name", at(now, 30 * DAY))).resolves.toMatchObject({ name: "Newer Name", tag: "OLD" });
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.treasury).toBe(1_500_000);
    expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: "rename_fee" } })).toBe(2);
  });

  it("a short vault or a taken name charges nothing and keeps the cooldown open", async () => {
    const boss = await seedEligibleUser(); const other = await seedEligibleUser();
    await seedFamily({ bossId: other, name: "Taken Name", tag: "TKN" });
    const f = await seedFamily({ bossId: boss, name: "Poor Crew", tag: "PRC", treasury: 1_999_999, data: { lastRenamedAt: daysAgo(31) } });
    await expect(renameFamily(boss, "Rich Crew")).rejects.toThrow(/The vault is short/);
    await testPrisma.family.update({ where: { id: f.id }, data: { treasury: 5_000_000 } });
    await expect(renameFamily(boss, "taken  name")).rejects.toThrow("No double spaces.");
    await expect(renameFamily(boss, "TAKEN NAME")).rejects.toThrow("Name taken.");
    const fresh = await testPrisma.family.findUnique({ where: { id: f.id } });
    expect(fresh).toMatchObject({ name: "Poor Crew", treasury: 5_000_000 });
    await expect(renameFamily(boss, "Rich Crew")).resolves.toMatchObject({ treasury: 3_000_000 });
  });

  it("three concurrent renames: one name, one fee", async () => {
    const boss = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, treasury: 10_000_000, data: { lastRenamedAt: daysAgo(31) } });
    const rs = await Promise.allSettled(["Name One", "Name Two", "Name Three"].map((n) => renameFamily(boss, n)));
    expect(fulfilled(rs)).toBe(1);
    for (const m of rejections(rs)) expect(m).toMatch(/^(You can rename once every 30 days\.|Vault busy, try again\.)$/);
    expect((await testPrisma.family.findUnique({ where: { id: f.id } }))!.treasury).toBe(8_000_000);
    expect(await testPrisma.familyLedger.count({ where: { familyId: f.id, type: "rename_fee" } })).toBe(1);
  });
});

// ── Disband ──────────────────────────────────────────────────────────────────

describe("LIFE disband", () => {
  it("closes invites and applications, burns the vault (held bid escrow included), frees the rackets; money is conserved", async () => {
    const now = new Date();
    const boss = await seedEligibleUser(); const s = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "DSB", treasury: 4_000_000, earnings: 1_000_000, lastPaydayAt: daysAgo(1, now),
      members: [{ userId: s, role: "SOLDIER" }], data: { recruiting: true } });
    const invitee = await recruit();
    const inv = await invite(boss, invitee);
    const applicant = await recruit();
    const app = await applyToFamily({ applicantId: applicant, familyId: f.id, message: "hello there", guildId: "g1", channelId: "c1" });
    await seedWar({ racketKey: "neon_strip", status: "BIDDING", topBid: 750_000, topBidderFamilyId: f.id });
    await testPrisma.racket.updateMany({ where: { key: "neon_strip" }, data: { ownerFamilyId: f.id } });
    const before = await moneySnapshot();
    const out = await disbandFamily(boss, " dsb ", now);
    expect(out.burned).toBe(5_750_000);
    const after = await moneySnapshot();
    expect(before.total + 750_000 - out.burned).toBe(after.total);   // escrow re-entered the vault, then burned with it
    await expect(acceptInvite(inv.id, invitee)).rejects.toThrow("Invite expired.");
    expect((await expireInvites(now)).map((r) => r.id)).toEqual([inv.id]);   // the sweeper closes it, and its card, like any expiry
    expect((await testPrisma.familyInvite.findUnique({ where: { id: app.id } }))!.status).toBe("EXPIRED");
    expect(out.expiredApplications.map((a) => a.id)).toEqual([app.id]);
    expect(await testPrisma.war.findFirst({ where: { racketKey: "neon_strip" } })).toMatchObject({ topBid: 0, topBidderFamilyId: "" });
    expect(await testPrisma.racket.count({ where: { ownerFamilyId: f.id } })).toBe(0);
    expect(await testPrisma.familyExit.findMany({ where: { familyId: f.id }, orderBy: { userId: "asc" } })).toHaveLength(2);
    expect(await testPrisma.familyMember.count()).toBe(0);
    await assertFamilyInvariants();
  });

  it("a non-Boss, a wrong tag, and a live heist lobby each refuse disband", async () => {
    const boss = await seedEligibleUser(); const ub = await seedEligibleUser();
    const f = await seedFamily({ bossId: boss, tag: "LBY", members: [{ userId: ub, role: "UNDERBOSS" }] });
    await expect(disbandFamily(ub, "LBY")).rejects.toThrow("Only the Boss can disband the family.");
    await expect(disbandFamily(boss, "LBX")).rejects.toThrow("Type the tag exactly: LBY");
    await testPrisma.caper.create({ data: { familyId: f.id, tier: 1, status: "LOBBY", liveSlot: "LIVE", plannerId: boss, guildId: "g1", channelId: "c1",
      lobbyClosesAt: new Date(Date.now() + 600_000) } });
    await expect(disbandFamily(boss, "LBY")).rejects.toThrow("A crew heist is in its lobby.");
  });

  it("disband races an accept and a promotion: either the family is gone with every exit recorded, or the join landed first", async () => {
    for (let round = 0; round < 3; round++) {
      await resetFamilies();
      const now = new Date();
      const boss = await seedEligibleUser(); const s = await seedEligibleUser({ wallet: 10_000_000 });
      const f = await seedFamily({ bossId: boss, tag: "RCE", members: [{ userId: s, role: "SOLDIER", joinedAt: daysAgo(10) }] });
      const u = await recruit();
      const inv = await invite(boss, u, now);
      await Promise.allSettled([disbandFamily(boss, "RCE", now), acceptInvite(inv.id, u, now), promoteMember(boss, s, now)]);
      const fam = await testPrisma.family.findUnique({ where: { id: f.id } });
      expect(fam).toBeNull();   // disband retries until it commits (5 attempts)
      const exits = await testPrisma.familyExit.findMany({ where: { familyId: f.id } });
      const joined = exits.some((e) => e.userId === u);
      expect(exits.length).toBe(joined ? 3 : 2);
      if (joined) expect((await testPrisma.familyInvite.findUnique({ where: { id: inv.id } }))!.status).toBe("ACCEPTED");
      else await expect(acceptInvite(inv.id, u, now)).rejects.toThrow("Invite expired.");
      await assertFamilyInvariants();
    }
  });
});

// ── memberCount and double membership under chaos ────────────────────────────

describe("LIFE chaos", () => {
  it("24 concurrent joins, leaves, kicks, promotions and demotions across two families keep every invariant", async () => {
    const now = new Date();
    const bA = await seedEligibleUser(); const bB = await seedEligibleUser();
    const sa = await Promise.all(Array.from({ length: 8 }, () => seedEligibleUser({ wallet: 12_000_000 })));
    const fA = await seedFamily({ bossId: bA, level: 10, tag: "CHA", members: sa.map((userId) => ({ userId, role: "SOLDIER" as const, joinedAt: daysAgo(10) })),
      data: { recruiting: true } });
    const fB = await seedFamily({ bossId: bB, level: 10, tag: "CHB" });
    const invitees = await Promise.all(Array.from({ length: 6 }, () => recruit()));
    const invsA = await Promise.all(invitees.slice(0, 3).map((u) => invite(bA, u, now)));
    const invsB = await Promise.all(invitees.slice(1).map((u) => invite(bB, u, now)));   // five invitees also hold an invite from B (pending cap 5)
    const applicant = await recruit();
    const app = await applyToFamily({ applicantId: applicant, familyId: fA.id, message: "count me in", guildId: "g1", channelId: "c1", now });
    const ops: Promise<unknown>[] = [
      acceptApplication(app.id, bA, now), acceptApplication(app.id, bA, now),
      ...invsA.map((inv) => acceptInvite(inv.id, inv.inviteeId, now)),
      ...invsB.map((inv) => acceptInvite(inv.id, inv.inviteeId, now)),
      leaveFamily(sa[0], now), leaveFamily(sa[1], now),
      kickMember(bA, sa[2], now), kickMember(bA, sa[3], now),
      promoteMember(bA, sa[4], now), promoteMember(bA, sa[5], now), promoteMember(bA, sa[6], now),
      demoteMember(bA, sa[4], now), handOverChair(bA, sa[7], now), kickMember(bA, sa[7], now),
      leaveFamily(sa[2], now), kickMember(bA, sa[0], now), promoteMember(bA, sa[1], now),
    ];
    const rs = await Promise.allSettled(ops);
    for (const m of rejections(rs)) expect(m).not.toMatch(/Something went wrong|Unique constraint|P20\d\d/);
    await assertFamilyInvariants();
    for (const u of invitees) expect(await testPrisma.familyMember.count({ where: { userId: u } })).toBeLessThanOrEqual(1);
    const a = await testPrisma.family.findUnique({ where: { id: fA.id } }); const b = await testPrisma.family.findUnique({ where: { id: fB.id } });
    expect(a!.memberCount + b!.memberCount).toBe(await testPrisma.familyMember.count());
  });
});

// ── A family grows from 1 to 30 members across all ten levels ────────────────

describe("LIFE growth simulation", () => {
  it("founder → 30 members at level 10 over weeks, officers rotating, the chair handed on, every invariant after every step", async () => {
    const start = new Date();
    let now = start;
    const boss0 = await seedEligibleUser({ wallet: 25_000_000 });
    const fam = await found(boss0, "Long Haul", "LHL", now);
    const famRow = () => testPrisma.family.findUniqueOrThrow({ where: { id: fam.id } });
    const rows = () => testPrisma.familyMember.findMany({ where: { familyId: fam.id } });
    let boss = boss0;
    const levelTo = async (level: number) => {
      const def = levelDef(level);
      await testPrisma.family.update({ where: { id: fam.id }, data: { xp: def.xpToReach, treasury: { increment: def.fee }, duesArrears: 0 } });
      await levelUp(fam.id, boss, level - 1, now);
    };
    const invitersNow = async () => (await rows()).filter((m) => m.role !== "SOLDIER").map((m) => m.userId);
    let week = 0;
    let handed = false;
    while ((await famRow()).memberCount < 30) {
      const f = await famRow();
      // level up whenever the roster is at the cap
      if (f.memberCount >= levelDef(f.level).memberCap) { await levelTo(f.level + 1); await assertFamilyInvariants(); continue; }
      const room = levelDef(f.level).memberCap - f.memberCount;
      const budget = Math.min(room, joinsPerFamilyFor(f.level));
      const inviters = await invitersNow();
      let joinedThisWeek = 0;
      for (const inviter of inviters) {
        for (let k = 0; k < CRIME_FAMILY_CONFIG.acceptedInvitesPerInviterPer7d && joinedThisWeek < budget; k++) {
          await bringIn(inviter, now, 10_000_000);   // everyone clears the 10M promotion bar
          joinedThisWeek++;
        }
      }
      // fill the Capo seats the size now allows; make sure there is an Underboss
      const members = await rows();
      if (!members.some((m) => m.role === "UNDERBOSS")) {
        const capo = members.find((m) => m.role === "CAPO");   // with Capo seats full, a Capo steps up
        if (capo) await promoteMember(boss, capo.userId, now);
        else { const s = members.find((m) => m.role === "SOLDIER")!; await promoteMember(boss, s.userId, now); await promoteMember(boss, s.userId, now); }
      }
      for (const s of (await rows()).filter((m) => m.role === "SOLDIER")) {
        const fresh = await famRow();
        const capos = (await rows()).filter((m) => m.role === "CAPO").length;
        if (capos >= capoCapFor(fresh.memberCount)) break;
        await promoteMember(boss, s.userId, now);
      }
      // mid-way: the founder hands the chair to the Underboss and stays as a Soldier
      if (!handed && (await famRow()).memberCount >= 15) {
        const ub = (await rows()).find((m) => m.role === "UNDERBOSS")!;
        await handOverChair(boss, ub.userId, now);
        boss = ub.userId;
        handed = true;
        await promoteMember(boss, boss0, now).catch((e) => expect(e.message).toMatch(/Capo seats are full/));   // the old Boss climbs back to Capo if a seat is free
      }
      await assertFamilyInvariants();
      week++;
      now = at(start, week * 7 * DAY + week);   // next rolling window
      expect(week).toBeLessThan(20);
    }
    const final = await famRow();
    expect(final).toMatchObject({ level: 10, memberCount: 30, bossId: boss });
    const roster = await rows();
    expect(roster.filter((m) => m.role === "CAPO")).toHaveLength(6);
    expect(roster.filter((m) => m.role === "UNDERBOSS")).toHaveLength(1);
    expect(new Set(roster.map((m) => m.seat))).toEqual(new Set(Array.from({ length: 30 }, (_, k) => k + 1)));
    // the 31st is refused, by the seat and not by a drifted count
    const extra = await recruit();
    const inv = await invite(boss, extra, now);
    await expect(acceptInvite(inv.id, extra, now)).rejects.toThrow("Family is full.");
    await assertFamilyInvariants();
  }, 120_000);
});
