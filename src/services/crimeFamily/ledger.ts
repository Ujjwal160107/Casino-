// FamilyLedger: one row per vault movement (and XP award), written inside the
// family transaction that moved the money, paged newest first for S7.
import { Prisma } from "@prisma/client";
import prisma from "../../utils/prisma";

export type LedgerType =
  | "create_fee" | "deposit" | "deposit_tax" | "payday" | "payday_tax" | "payday_clamp_return" | "caper_cut" | "racket_income"
  | "racket_neglect" | "dues" | "dues_missed" | "level_fee" | "rename_fee" | "bid_escrow" | "bid_refund" | "war_bid_burn"
  | "disband_burn" | "xp";

export type LedgerRow = {
  familyId: string;
  actorId: string; // discordId or "system"
  type: LedgerType;
  amount: number; // signed, vault perspective
  treasuryAfter: number;
  earningsAfter: number;
  meta?: Record<string, unknown>;
};

export type LedgerLine = {
  at: Date;
  type: LedgerType;
  actorId: string;
  amount: number;
  treasuryAfter: number;
  earningsAfter: number;
  meta: Record<string, unknown> | null;
};

/** Writes one row and returns its id (F6: the payday row's id is the payday's runKey). */
export async function writeLedger(tx: Prisma.TransactionClient, row: LedgerRow): Promise<string> {
  const { meta, ...rest } = row;
  const { id } = await tx.familyLedger.create({
    data: { ...rest, ...(meta ? { meta: meta as Prisma.InputJsonObject } : {}) }, select: { id: true },
  });
  return id;
}

/** One page of the family's ledger, newest first; page is clamped into [0, pages - 1]. */
export async function readLedgerPage(familyId: string, page: number, pageSize: number): Promise<{ rows: LedgerLine[]; page: number; pages: number }> {
  const total = await prisma.familyLedger.count({ where: { familyId } });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const rows = await prisma.familyLedger.findMany({
    where: { familyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: clamped * pageSize,
    take: pageSize,
  });
  return {
    rows: rows.map((r) => ({
      at: r.createdAt,
      type: r.type as LedgerType,
      actorId: r.actorId,
      amount: r.amount,
      treasuryAfter: r.treasuryAfter,
      earningsAfter: r.earningsAfter,
      meta: (r.meta as Record<string, unknown> | null) ?? null,
    })),
    page: clamped,
    pages,
  };
}
