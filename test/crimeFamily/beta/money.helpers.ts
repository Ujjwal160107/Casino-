// Beta money harness: a strict balance sheet over everything a scenario's
// players and families hold, plus every recorded burn and mint, and a ledger
// chain check that every FamilyLedger row matches a real vault change.
//
// sheet() = wallets + banks − card debt (the tracked users)
//         + treasury + earnings (every live family)
//         + escrows (unstarted, unrefunded caper stakes; live bid escrow; unpaid payday shares at net)
//         + burns (ledger burns, burned stakes, fines, clamp burns, hit costs)
//         − mints (caper cuts to wallets and vaults, racket income).
// A scenario conserves money when sheet() is unchanged from its start.
import { testPrisma, seedEligibleUser, type SeedEligibleOpts } from "../../helpers";

const tracked = new Set<string>();

/** seedEligibleUser that also registers the user on the balance sheet. */
export async function player(opts: SeedEligibleOpts = {}): Promise<string> {
  const id = await seedEligibleUser(opts);
  tracked.add(id);
  return id;
}

/** Registers users seeded some other way (fixtures). */
export function track(...ids: string[]): void {
  for (const id of ids) tracked.add(id);
}

export function resetTracked(): void {
  tracked.clear();
}

const big = (n: number | null | undefined): bigint => {
  const v = n ?? 0;
  if (!Number.isFinite(v) || !Number.isInteger(v)) throw new Error(`non-integer money value ${v}`);
  return BigInt(v);
};
const sum = (xs: (number | null | undefined)[]) => xs.reduce<bigint>((a, x) => a + big(x), 0n);
const metaNum = (meta: unknown, key: string): number => Number((meta as Record<string, unknown> | null)?.[key] ?? 0);

export type Sheet = {
  wallets: bigint; banks: bigint; cardDebt: bigint; vault: bigint;
  stakeEscrow: bigint; bidEscrow: bigint; unpaidShares: bigint; burned: bigint; minted: bigint; total: bigint;
};

export async function sheet(): Promise<Sheet> {
  const users = [...tracked];
  const wallets = await testPrisma.wallet.findMany({ where: { userId: { in: users } } });
  const banks = await testPrisma.bank.findMany({ where: { userId: { in: users } } });
  const cards = await testPrisma.creditCard.findMany({ where: { userId: { in: users } } });
  const families = await testPrisma.family.findMany({ select: { treasury: true, earnings: true } });
  const crew = await testPrisma.caperCrew.findMany({ where: { userId: { in: users } } });
  const wars = await testPrisma.war.findMany({ where: { status: { in: ["BIDDING", "ARMED", "ACTIVE", "SETTLING"] } } });
  const shares = await testPrisma.paydayShare.findMany({ where: { paid: false } });
  const ledger = await testPrisma.familyLedger.findMany({});
  const walletIds = wallets.map((w) => w.id);
  const txs = await testPrisma.transaction.findMany({ where: { walletId: { in: walletIds }, type: { in: ["caper_cut", "turf_hit"] } } });
  const clampBurns = await testPrisma.audit.findMany({ where: { userId: { in: users }, type: "family_payday_clamp_burn" } });

  const stakeEscrow = sum(crew.filter((c) => !c.started && !c.refunded).map((c) => c.stake));
  const burnedStakes = sum(crew.filter((c) => c.started && !c.refunded).map((c) => c.stake));
  const fines = sum(crew.filter((c) => c.settled).map((c) => c.fine));
  const bidEscrow = sum(wars.map((w) => w.topBid));
  const unpaidShares = sum(shares.map((s) => s.net));

  let ledgerBurn = 0n;
  let ledgerMint = 0n;
  for (const r of ledger) {
    switch (r.type) {
      case "deposit_tax": case "payday_tax": case "war_bid_burn": ledgerBurn += big(metaNum(r.meta, "burned")); break;
      case "create_fee": ledgerBurn += big(metaNum(r.meta, "paid")); break;
      case "dues": case "level_fee": case "rename_fee": case "disband_burn": ledgerBurn += big(-r.amount); break;
      case "caper_cut": case "racket_income": ledgerMint += big(r.amount); break;
      default: break;
    }
  }
  const walletMint = sum(txs.filter((t) => t.type === "caper_cut").map((t) => t.amount));
  const hitBurn = sum(txs.filter((t) => t.type === "turf_hit").map((t) => -t.amount));
  const clampBurn = sum(clampBurns.map((a) => metaNum(a.meta, "burned")));

  const s = {
    wallets: sum(wallets.map((w) => w.balance)),
    banks: sum(banks.map((b) => b.balance)),
    cardDebt: sum(cards.map((c) => c.currentBalance)),
    vault: sum(families.flatMap((f) => [f.treasury, f.earnings])),
    stakeEscrow, bidEscrow, unpaidShares,
    burned: ledgerBurn + burnedStakes + fines + hitBurn + clampBurn,
    minted: ledgerMint + walletMint,
  };
  return { ...s, total: s.wallets + s.banks - s.cardDebt + s.vault + s.stakeEscrow + s.bidEscrow + s.unpaidShares + s.burned - s.minted };
}

/** Throws a readable diff when the sheet moved. */
export function expectConserved(before: Sheet, after: Sheet): void {
  if (before.total !== after.total) {
    const diff = Object.fromEntries(Object.keys(before).map((k) => [k, String((after as any)[k] - (before as any)[k])]));
    throw new Error(`money not conserved: total moved by ${after.total - before.total}; deltas ${JSON.stringify(diff)}`);
  }
}

/** The sheet must hold across fn. */
export async function conserved<T>(fn: () => Promise<T>): Promise<T> {
  const before = await sheet();
  const out = await fn();
  expectConserved(before, await sheet());
  return out;
}

/**
 * Every FamilyLedger row of the family, oldest first, must move treasury +
 * earnings by exactly its signed amount from the previous row's after values
 * (starting at `start`), and the last row must match the live family (or 0/0
 * when it was deleted). Valid for sequential scenarios.
 */
export async function expectLedgerChain(familyId: string, start: { treasury: number; earnings: number }): Promise<void> {
  const rows = await testPrisma.familyLedger.findMany({ where: { familyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let prev = start.treasury + start.earnings;
  rows.forEach((r, i) => {
    const after = r.treasuryAfter + r.earningsAfter;
    if (after - prev !== r.amount) {
      throw new Error(`ledger row ${i} (${r.type}, amount ${r.amount}) moved the vault by ${after - prev} (prev ${prev}, after ${after})`);
    }
    if (r.treasuryAfter < 0 || r.earningsAfter < 0) throw new Error(`ledger row ${i} (${r.type}) shows a negative bucket`);
    prev = after;
  });
  const fam = await testPrisma.family.findUnique({ where: { id: familyId } });
  const last = rows[rows.length - 1];
  if (fam && last && (fam.treasury !== last.treasuryAfter || fam.earnings !== last.earningsAfter)) {
    throw new Error(`last ledger row (${last.type}) says ${last.treasuryAfter}/${last.earningsAfter}, family holds ${fam.treasury}/${fam.earnings}`);
  }
  if (fam && !last && fam.treasury + fam.earnings !== prev) throw new Error("vault moved with no ledger row");
}

export async function walletOf(id: string): Promise<number> {
  return (await testPrisma.wallet.findUniqueOrThrow({ where: { userId: id } })).balance;
}

export async function familyOf(id: string) {
  return testPrisma.family.findUnique({ where: { id } });
}

/** Ledger rows of a family by type, oldest first. */
export function ledgerRows(familyId: string, type?: string) {
  return testPrisma.familyLedger.findMany({ where: { familyId, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}
