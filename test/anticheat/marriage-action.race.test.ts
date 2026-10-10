import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import prisma from "../../src/utils/prisma";
import { runAffectionAction } from "../../src/services/life/marriageService";

// Couple actions read their cooldown outside the transaction, so an action
// that read the marriage before another committed paid the vault reward again.

const a = "couple-race-a";
const b = "couple-race-b";
let marriageId: string;

async function cleanup() {
  await testPrisma.marriage.deleteMany({ where: { spouse1Id: a } });
  await resetUser(a);
  await resetUser(b);
}

beforeEach(async () => {
  await cleanup();
  await seedUser(a);
  await seedUser(b);
  // lastHugAt is deliberately left unset (absent in Mongo), like a couple
  // that never hugged — the guard must still let the first hug through.
  const marriage = await testPrisma.marriage.create({ data: { spouse1Id: a, spouse2Id: b } });
  marriageId = marriage.id;
});
afterAll(cleanup);

async function vault() {
  return (await testPrisma.marriage.findUnique({ where: { id: marriageId } }))!;
}

describe("runAffectionAction cooldown claim", () => {
  it("the first hug on a never-hugged marriage succeeds", async () => {
    const res = await runAffectionAction(a, "A", "hug");
    expect(res.success).toBe(true);
    expect((await vault()).lastHugAt).not.toBeNull();
  });

  it("pays once when a second hug read the marriage before the first committed", async () => {
    const delegate = prisma.marriage as any;
    const original = delegate.findFirst;
    let first = true;
    let inner: Awaited<ReturnType<typeof runAffectionAction>> | undefined;
    delegate.findFirst = async (args: any) => {
      const snapshot = await original.call(delegate, args);
      if (first) {
        first = false;
        inner = await runAffectionAction(b, "B", "hug");
      }
      return snapshot;
    };
    let outer;
    try {
      outer = await runAffectionAction(a, "A", "hug");
    } finally {
      delegate.findFirst = original;
    }

    expect(inner!.success).toBe(true);
    expect(outer.success).toBe(false);
    expect((await vault()).jointBalance).toBe((inner as any).reward);
  });
});
