import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import prisma from "../../src/utils/prisma";
import { resolveVaultWithdrawRequest } from "../../src/services/life/marriageService";

// Approving a Couple Vault withdrawal checked PENDING and jointBalance outside
// its transaction: a second approval that read the request before the first
// committed paid the requester again and drove jointBalance negative.

const requester = "vault-race-req";
const spouse = "vault-race-sp";
const AMOUNT = 1_000;
let marriageId: string;
let requestId: string;

async function cleanup() {
  await testPrisma.marriageVaultRequest.deleteMany({ where: { requesterId: requester } });
  await testPrisma.marriage.deleteMany({ where: { spouse1Id: requester } });
  await resetUser(requester);
  await resetUser(spouse);
}

beforeEach(async () => {
  await cleanup();
  await seedUser(requester);
  await seedUser(spouse);
  const marriage = await testPrisma.marriage.create({
    data: { spouse1Id: requester, spouse2Id: spouse, jointBalance: AMOUNT },
  });
  marriageId = marriage.id;
  const request = await testPrisma.marriageVaultRequest.create({
    data: {
      marriageId,
      requesterId: requester,
      spouseId: spouse,
      amount: AMOUNT,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  requestId = request.id;
});
afterAll(cleanup);

async function balances() {
  const wallet = await testPrisma.wallet.findUnique({ where: { userId: requester } });
  const marriage = await testPrisma.marriage.findUnique({ where: { id: marriageId } });
  return { wallet: wallet!.balance, joint: marriage!.jointBalance };
}

describe("resolveVaultWithdrawRequest", () => {
  it("pays once when a second approval read the request before the first committed", async () => {
    // Deterministic interleave: the second approval's read happens, then the
    // first approval runs to completion, then the second continues on its
    // stale PENDING snapshot.
    const delegate = prisma.marriageVaultRequest as any;
    const original = delegate.findUnique;
    let first = true;
    delegate.findUnique = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first) {
        first = false;
        await resolveVaultWithdrawRequest(requestId, spouse, true);
      }
      return snapshot;
    };
    try {
      await resolveVaultWithdrawRequest(requestId, spouse, true).catch(() => undefined);
    } finally {
      delegate.findUnique = original;
    }

    expect(await balances()).toEqual({ wallet: AMOUNT, joint: 0 });
  });

  it("pays once under concurrent double-click", async () => {
    await Promise.allSettled([
      resolveVaultWithdrawRequest(requestId, spouse, true),
      resolveVaultWithdrawRequest(requestId, spouse, true),
    ]);
    expect(await balances()).toEqual({ wallet: AMOUNT, joint: 0 });
  });
});
