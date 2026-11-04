import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { runFamilyTx, VaultBusy, FamilyError, isUniqueViolation } from "../../src/services/crimeFamily/tx";
import { writeLedger, readLedgerPage } from "../../src/services/crimeFamily/ledger";
import { testPrisma, ensureUniqueIndexes, resetFamilies, seedFamily, seedEligibleUser } from "../helpers";

beforeAll(() => ensureUniqueIndexes(["Family", "FamilyMember", "FamilyInvite"]));
beforeEach(resetFamilies);

describe("family transaction kit", () => {
  it("unique indexes exist with Prisma's names", async () => {
    const fam = await seedFamily({ bossId: await seedEligibleUser() });
    const err = await testPrisma.familyMember.create({ data: { familyId: fam.id, userId: fam.bossId, role: "SOLDIER", roleSlot: "x", seat: 9 } }).catch((e) => e);
    expect(isUniqueViolation(err, "FamilyMember_userId_key")).toBe(true);
  });

  it("retries a VaultBusy and succeeds", async () => {
    let calls = 0;
    expect(await runFamilyTx(async () => { if (++calls === 1) throw new VaultBusy(); return "ok"; })).toBe("ok");
    expect(calls).toBe(2);
  });

  it("turns an exhausted VaultBusy into a player message", async () => {
    await expect(runFamilyTx(async () => { throw new VaultBusy(); })).rejects.toThrow(new FamilyError("Vault busy, try again."));
  });

  it("turns an exhausted Mongo write conflict (P2034) into the same message", async () => {
    let calls = 0;
    const p2034 = Object.assign(new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"), { code: "P2034" });
    await expect(runFamilyTx(async () => { calls++; throw p2034; })).rejects.toThrow(new FamilyError("Vault busy, try again."));
    expect(calls).toBe(3);
  });

  it("does not retry a FamilyError", async () => {
    let calls = 0;
    await expect(runFamilyTx(async () => { calls++; throw new FamilyError("no"); })).rejects.toThrow("no");
    expect(calls).toBe(1);
  });

  it("never retries or rewrites a FamilyError whose message looks transient (a family named Deadlock)", async () => {
    let calls = 0;
    const err = new FamilyError("[DLK] Deadlock: write conflict, transaction failed");
    await expect(runFamilyTx(async () => { calls++; throw err; })).rejects.toBe(err);
    expect(calls).toBe(1);
  });

  it("pages the ledger newest first and clamps the page", async () => {
    const fam = await seedFamily({ bossId: await seedEligibleUser() });
    await runFamilyTx(async (tx) => { for (let i = 0; i < 16; i++) await writeLedger(tx, { familyId: fam.id, actorId: "system", type: "dues", amount: -i, treasuryAfter: 0, earningsAfter: 0 }); });
    const p = await readLedgerPage(fam.id, 9, 15);
    expect([p.page, p.pages, p.rows.length]).toEqual([1, 2, 1]);
  });
});
