// The one transaction helper for Crime Families: every money or membership
// write runs in runFamilyTx, and every refusal a player may read is a FamilyError.
import { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";
import { fmtFortunes } from "../../utils/format";
import { isTransientWriteConflict, withTransactionRetry } from "../walletService";

/** A refusal whose message is safe to show the player. */
export class FamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FamilyError";
  }
}

/** The vault cannot cover a spend. */
export class VaultShort extends FamilyError {
  constructor(public readonly need: number, public readonly have: number) {
    super(`The vault is short: needs ${fmtFortunes(need)}, has ${fmtFortunes(have)}.`);
    this.name = "VaultShort";
  }
}

/** A lost CAS inside a family transaction. The message contains "write conflict", so it is retried. */
export class VaultBusy extends Error {
  constructor() {
    super("Vault write conflict");
    this.name = "VaultBusy";
  }
}

/**
 * Runs fn in one Mongo transaction, retrying transient conflicts (including
 * VaultBusy and P2034). An exhausted retry becomes "Vault busy, try again.".
 */
export async function runFamilyTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, attempts = 3): Promise<T> {
  try {
    return await withTransactionRetry(() => prisma.$transaction(fn, { maxWait: 5_000, timeout: 15_000 }), attempts);
  } catch (err) {
    if (isTransientWriteConflict(err)) throw new FamilyError("Vault busy, try again.");
    throw err;
  }
}

/**
 * Writes the family document so concurrent writers that both touch it conflict.
 * The new updatedAt is always later than the one this transaction reads: Mongo
 * skips a $set to the value already stored, and a skipped write conflicts with
 * nothing, so two writers in the same millisecond would otherwise both commit.
 */
export async function touchFamily(tx: Prisma.TransactionClient, familyId: string, now: Date): Promise<void> {
  const { updatedAt } = await tx.family.findUniqueOrThrow({ where: { id: familyId }, select: { updatedAt: true } });
  await tx.family.update({ where: { id: familyId }, data: { updatedAt: new Date(Math.max(now.getTime(), updatedAt.getTime() + 1)) } });
}

/** A P2002, optionally on the named unique index (Prisma's `<Model>_<fields>_key`). Never catch it inside a transaction. */
export function isUniqueViolation(err: unknown, indexName?: string): boolean {
  const e = err as { code?: unknown; meta?: { target?: unknown } } | null;
  if (e?.code !== "P2002") return false;
  return indexName === undefined || String(e.meta?.target).includes(indexName);
}
