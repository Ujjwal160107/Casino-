# Investment Returns & Card-Exclusive Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players see what their FDs/RDs paid (DM on maturity + a Recent Returns history in the bank), and eight shop items become card-exclusive: buyable only on credit with a Fortuna Card of a named tier or higher.

**Architecture:** Part 1 records `completedAt` / `interestEarned` / `payout` on the `Investment` row inside the one function that already matures deposits, then a new notifier service turns the cron's matured batch into one DM per player through the existing reminder plumbing and prefs; the bank Investments tab reads a new history query. Part 2 adds one optional `requiresCardTier` flag to catalog entries, enforced at the single purchase seam (`buyItem` → `chargeCardPurchaseTx`), with the tier comparison living in the card service and display changes confined to the item info card and the card tier screens.

**Tech Stack:** Node.js / TypeScript, discord.js v14 Components V2, Prisma on MongoDB, Vitest with mongodb-memory-server (`npx vitest run <file>`), `npm run typecheck` (`tsc --noEmit`).

**Spec:** `docs/superpowers/specs/2026-09-05-investment-returns-and-card-exclusive-items-design.md`

## Global Constraints

- New Prisma fields on existing models are **optional** (`Type?`); `db push` does not backfill and the Mongo connector throws on a required field a document lacks.
- Filtering an optional Mongo field for "present" uses `{ isSet: true }`. Never `{ not: null }`.
- Testers (`isTester(userId, member)`) bypass purchase gates exactly like the existing `creditBlocked` / balance / role checks (`!tester` on every check).
- Discord Components V2: never let a list grow the component count; pack list lines into one `TextDisplayBuilder`. Action rows hold at most 5 buttons.
- Card tier enum values stay uppercase in data and errors from services (`GOLD`); UI labels use `formatCardTierName` (`Gold`).
- Card-exclusive rule: `paymentSource === "card"`, card `status === "ACTIVE"`, and `cardTierMeets(card.tier, item.requiresCardTier)`. Wallet purchase refused.
- Default gated set (tier → items): STARTER → Celestial Harp, Demonic Harp · GOLD → Crown of Greed, Royal Cape · PLATINUM → Platinum Crown, Void Wings · BLACK → Celestial Halo, Emperor's Throne. Every gated price must be `<=` its tier's `weeklySpendCap` and `creditLimit`.
- The DM respects `remindersEnabled` and a new `"investment"` entry in `disabledReminders`; testers never get it.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8
  ```
- Tests need `.env.test` (present) and run serially. Run one file at a time: `npx vitest run test/bank/investment-returns.test.ts`.

## File map

| File | Responsibility in this change |
|---|---|
| `prisma/schema.prisma` | `Investment` gains `completedAt`, `interestEarned`, `payout` |
| `src/services/bankingService.ts` | record payout on maturity; `processAllInvestments` returns results; `getInvestmentReturns` |
| `src/services/cooldownReminderService.ts` | `investment` reminder type; extracted `sendReminderDm` |
| `src/services/investmentNotifyService.ts` (new) | build + send the maturity DM |
| `src/scheduler.ts` | pass the matured batch to the notifier |
| `src/commands/general/settings.ts` | "Investment payouts" toggle |
| `src/commands/economy/bank.ts` | Recent Returns section; "Unlocks" line on tier screens |
| `src/handlers/bankInteractionHandler.ts` | fetch returns for the Investments tab |
| `src/utils/economyConfig.ts` | `cardTierMeets`, `formatCardTierName` |
| `src/utils/shopCatalog.ts` | `requiresCardTier` flag, 8 entries, `getCardExclusiveItems` |
| `src/services/creditCardService.ts` | `chargeCardPurchaseTx` tier check |
| `src/services/shopService.ts` | `findCatalogEntry`; card-exclusive gate in `buyItem` |
| `src/commands/economy/shop.ts` | item info card: badge, buttons, hints |
| `dashboard/src/content/modules/bank-and-credit.ts`, `items-and-shop.ts` | docs |
| `test/bank/*.test.ts`, `test/reminders/*.test.ts`, `test/shop/*.test.ts` | tests |

---

### Task 1: Record what a deposit paid when it matures

**Files:**
- Modify: `prisma/schema.prisma:323-339` (model `Investment`)
- Modify: `src/services/bankingService.ts:75-131` (`matureInvestment`, `processAllInvestments`)
- Modify: `src/scheduler.ts:27-28`
- Test: `test/bank/investment-returns.test.ts` (new)

**Interfaces:**
- Consumes: `calculateInvestmentPayout` (already in the file), `MAX_SAFE_BALANCE`.
- Produces:
  - `Investment` rows gain `completedAt: Date | null`, `interestEarned: number | null`, `payout: number | null`.
  - `export type MaturedInvestment = { id; type; principal; interest; payout; durationDays; capped; investment: Investment; bank: Bank }` (the existing return of `matureInvestment`, now non-null and named).
  - `processAllInvestments(): Promise<MaturedInvestment[]>` (was `Promise<number>`).

- [ ] **Step 1: Write the failing tests**

Create `test/bank/investment-returns.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { processAllInvestments } from "../../src/services/bankingService";
import { MAX_SAFE_BALANCE } from "../../src/utils/economyConfig";

// Matured FDs/RDs used to flip to COMPLETED and credit the bank with no record
// of what they paid. These tests pin the payout fields that the maturity DM and
// the bank history read.

const id = "bank-invest-returns";
const DAY_MS = 24 * 60 * 60 * 1000;

async function resetAll() {
  await testPrisma.investment.deleteMany({ where: { userId: id } });
  await testPrisma.bank.deleteMany({ where: { userId: id } });
  await resetUser(id);
}

async function seedBank(balance: number) {
  await seedUser(id);
  await testPrisma.bank.create({ data: { userId: id, balance } });
}

// maturityDate = now − maturedDaysAgo; startDate = maturityDate − lockedDays.
// A negative maturedDaysAgo puts maturity in the future.
function seedInvestment(
  over: Partial<{ type: string; amount: number; lockedDays: number; maturedDaysAgo: number }> = {},
) {
  const lockedDays = over.lockedDays ?? 10;
  const maturedDaysAgo = over.maturedDaysAgo ?? 1;
  const maturityDate = new Date(Date.now() - maturedDaysAgo * DAY_MS);
  return testPrisma.investment.create({
    data: {
      userId: id,
      type: over.type ?? "FD",
      amount: over.amount ?? 365_000,
      interestRate: 10,
      startDate: new Date(maturityDate.getTime() - lockedDays * DAY_MS),
      maturityDate,
      status: "ACTIVE",
    },
  });
}

beforeEach(resetAll);

describe("matureInvestment records what the deposit paid", () => {
  it("writes completedAt, interestEarned and payout, and credits the bank", async () => {
    await seedBank(0);
    // 365,000 at 10% APR for 10 days = 1,000 interest exactly.
    const inv = await seedInvestment();

    const matured = await processAllInvestments();
    const mine = matured.find((m) => m.id === inv.id);
    expect(mine?.payout).toBe(366_000);
    expect(mine?.investment.userId).toBe(id);

    const row = await testPrisma.investment.findUnique({ where: { id: inv.id } });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.interestEarned).toBe(1000);
    expect(row?.payout).toBe(366_000);
    expect(row?.completedAt).toBeInstanceOf(Date);

    const bank = await testPrisma.bank.findUnique({ where: { userId: id } });
    expect(bank?.balance).toBe(366_000);
  });

  it("keeps the pre-cap interest when the bank cap truncates the payout", async () => {
    await seedBank(MAX_SAFE_BALANCE);
    const inv = await seedInvestment();

    await processAllInvestments();

    const row = await testPrisma.investment.findUnique({ where: { id: inv.id } });
    expect(row?.status).toBe("COMPLETED");
    expect(row?.interestEarned).toBe(1000);
    expect(row?.payout).toBe(0);
  });

  it("leaves a deposit that has not matured alone", async () => {
    await seedBank(0);
    const inv = await seedInvestment({ maturedDaysAgo: -5 });

    await processAllInvestments();

    const row = await testPrisma.investment.findUnique({ where: { id: inv.id } });
    expect(row?.status).toBe("ACTIVE");
    expect(row?.completedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/bank/investment-returns.test.ts`
Expected: the first two tests FAIL (`interestEarned` is `undefined`, and `matured.find` is not a function because `processAllInvestments` returns a number). The third passes already; that is fine.

- [ ] **Step 3: Add the three optional fields to the schema**

In `prisma/schema.prisma`, replace the whole `model Investment { … }` block (lines 323–339, including the stale RD comments inside it) with:

```prisma
model Investment {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  user         User     @relation(fields: [userId], references: [discordId])
  userId       String
  type         String   // FD, RD
  amount       Float
  interestRate Int      // Stored as percentage
  startDate    DateTime @default(now())
  maturityDate DateTime
  status       String   // ACTIVE, COMPLETED, WITHDRAWN

  // Written once, when the deposit matures. Optional on purpose: `db push`
  // does not backfill, and Prisma's Mongo connector throws reading a required
  // field that a document lacks. Legacy COMPLETED rows never get these, so
  // history filters on `completedAt: { isSet: true }`.
  completedAt    DateTime?
  interestEarned Float?   // what the deposit earned before the bank cap
  payout         Float?   // what was actually credited to the bank

  updatedAt    DateTime @updatedAt
}
```

Then regenerate the client:

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Record the fields in `matureInvestment` and return the batch from `processAllInvestments`**

In `src/services/bankingService.ts`, change the `investment.update` call inside `matureInvestment` (currently `data: { status: "COMPLETED" }`) to:

```ts
            const updatedInvestment = await trx.investment.update({
                where: { id: investment.id },
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    interestEarned: calculated.interest,
                    payout,
                }
            });
```

Directly after the closing `}` of `matureInvestment`, add:

```ts
export type MaturedInvestment = NonNullable<Awaited<ReturnType<typeof matureInvestment>>>;
```

Replace the whole `processAllInvestments` function with:

```ts
export async function processAllInvestments(): Promise<MaturedInvestment[]> {
    const investments = await prisma.investment.findMany({
        where: {
            status: "ACTIVE",
            maturityDate: { lte: new Date() }
        },
        select: { id: true }
    });

    const matured: MaturedInvestment[] = [];
    for (const investment of investments) {
        const result = await matureInvestment(investment.id);
        if (result) matured.push(result);
    }
    return matured;
}
```

- [ ] **Step 5: Fix the scheduler's log line**

In `src/scheduler.ts`, replace:

```ts
      const processedCount = await processAllInvestments();
      console.log(`Processed ${processedCount} matured investments.`);
```

with:

```ts
      const matured = await processAllInvestments();
      console.log(`Processed ${matured.length} matured investments.`);
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run test/bank/investment-returns.test.ts`
Expected: 3 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/services/bankingService.ts src/scheduler.ts test/bank/investment-returns.test.ts
git commit -m "feat(bank): record interest and payout when a deposit matures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 2: Investment returns history query

**Files:**
- Modify: `src/services/bankingService.ts` (imports at line 2; new function after `processAllInvestments`)
- Test: `test/bank/investment-returns.test.ts`

**Interfaces:**
- Consumes: the fields from Task 1.
- Produces:
  - `getInvestmentReturns(discordId: string, limit = 5): Promise<{ recent: Investment[]; lifetimeInterest: number }>`
  - `export type InvestmentReturns = Awaited<ReturnType<typeof getInvestmentReturns>>`

- [ ] **Step 1: Write the failing tests**

In `test/bank/investment-returns.test.ts`, change the service import to:

```ts
import { getInvestmentReturns, processAllInvestments } from "../../src/services/bankingService";
```

and append at the end of the file:

```ts
describe("getInvestmentReturns", () => {
  function completedRow(over: { daysAgo: number; amount: number; interestEarned: number; type?: string }) {
    return testPrisma.investment.create({
      data: {
        userId: id,
        type: over.type ?? "FD",
        amount: over.amount,
        interestRate: 10,
        startDate: new Date(),
        maturityDate: new Date(),
        status: "COMPLETED",
        completedAt: new Date(Date.now() - over.daysAgo * DAY_MS),
        interestEarned: over.interestEarned,
        payout: over.amount + over.interestEarned,
      },
    });
  }

  it("returns the newest matured deposits first, skips legacy rows, and sums lifetime interest", async () => {
    await seedBank(0);
    // Legacy: completed before payout recording existed. No completedAt, no payout.
    await testPrisma.investment.create({
      data: {
        userId: id, type: "FD", amount: 1, interestRate: 10,
        startDate: new Date(), maturityDate: new Date(), status: "COMPLETED",
      },
    });
    for (let i = 0; i < 6; i++) {
      await completedRow({ daysAgo: i, amount: 1000 * (i + 1), interestEarned: 10 * (i + 1) });
    }

    const returns = await getInvestmentReturns(id);

    expect(returns.recent).toHaveLength(5);
    expect(returns.recent[0].amount).toBe(1000);
    expect(returns.recent[4].amount).toBe(5000);
    expect(returns.recent.every((r) => r.completedAt instanceof Date)).toBe(true);
    // 10 + 20 + … + 60: every recorded return counts, not just the five shown.
    expect(returns.lifetimeInterest).toBe(210);
  });

  it("is empty for a player with no recorded returns", async () => {
    await seedBank(0);
    const returns = await getInvestmentReturns(id);
    expect(returns.recent).toEqual([]);
    expect(returns.lifetimeInterest).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/bank/investment-returns.test.ts`
Expected: the two new tests FAIL with "getInvestmentReturns is not a function".

- [ ] **Step 3: Implement the query**

In `src/services/bankingService.ts`, change the Prisma import on line 2 to:

```ts
import { Investment, Prisma, PrismaClient } from "@prisma/client";
```

After `processAllInvestments`, add:

```ts
export async function getInvestmentReturns(discordId: string, limit = 5) {
    // Only rows matured after payout recording shipped carry completedAt; legacy
    // COMPLETED rows have nothing to show. `isSet` is the Mongo-native way to ask
    // for "field present" — `not: null` does not match a missing field.
    const where: Prisma.InvestmentWhereInput = {
        userId: discordId,
        status: "COMPLETED",
        completedAt: { isSet: true },
    };
    const [recent, totals] = await Promise.all([
        prisma.investment.findMany({ where, orderBy: { completedAt: "desc" }, take: limit }),
        prisma.investment.aggregate({ where, _sum: { interestEarned: true } }),
    ]);
    return { recent, lifetimeInterest: totals._sum.interestEarned ?? 0 };
}

export type InvestmentReturns = Awaited<ReturnType<typeof getInvestmentReturns>>;
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run test/bank/investment-returns.test.ts`
Expected: 5 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/bankingService.ts test/bank/investment-returns.test.ts
git commit -m "feat(bank): query recent investment returns and lifetime interest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 3: Shared DM sender, `investment` reminder type, settings toggle

**Files:**
- Modify: `src/services/cooldownReminderService.ts:5-13` (REMINDER_TYPES), `:137-193` (processDueReminders)
- Modify: `src/commands/general/settings.ts:24` (TYPE_ORDER)
- Test: `test/reminders/send-reminder-dm.test.ts` (new)

**Interfaces:**
- Consumes: `getReminderPrefs`, `cancelAll`, `MAX_DM_FAILS` (all already in the file).
- Produces:
  - `REMINDER_TYPES.investment` → `ReminderType` now includes `"investment"`.
  - `export async function sendReminderDm(client: Client, discordId: string, content: string): Promise<boolean>` — true when delivered. Success resets `reminderDmFailCount`; the third consecutive failure sets `remindersEnabled: false` and clears pending reminders.

- [ ] **Step 1: Write the failing tests**

Create `test/reminders/send-reminder-dm.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Client } from "discord.js";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { sendReminderDm } from "../../src/services/cooldownReminderService";

// The closed-DM bookkeeping used to live inline in processDueReminders. It is
// now one helper so the investment notifier gets the same auto-pause behaviour.

const id = "reminder-send-dm";

function fakeClient(send: () => Promise<unknown>): Client {
  return { users: { fetch: async () => ({ send }) } } as unknown as Client;
}

async function user() {
  return testPrisma.user.findUnique({ where: { discordId: id } });
}

beforeEach(async () => {
  await resetUser(id);
});

it("resets the fail count after a delivered DM", async () => {
  await seedUser(id, { reminderDmFailCount: 2 });

  const delivered = await sendReminderDm(fakeClient(async () => ({})), id, "hi");

  expect(delivered).toBe(true);
  expect((await user())?.reminderDmFailCount).toBe(0);
});

it("counts a failed DM while under the limit", async () => {
  await seedUser(id, { reminderDmFailCount: 0 });

  const delivered = await sendReminderDm(fakeClient(async () => { throw new Error("closed DMs"); }), id, "hi");

  expect(delivered).toBe(false);
  const row = await user();
  expect(row?.reminderDmFailCount).toBe(1);
  expect(row?.remindersEnabled).toBe(true);
});

it("switches reminders off on the third failed DM in a row", async () => {
  await seedUser(id, { reminderDmFailCount: 2 });

  const delivered = await sendReminderDm(fakeClient(async () => { throw new Error("closed DMs"); }), id, "hi");

  expect(delivered).toBe(false);
  const row = await user();
  expect(row?.remindersEnabled).toBe(false);
  expect(row?.reminderDmFailCount).toBe(0);
});

it("reports not delivered when the user cannot be fetched", async () => {
  await seedUser(id);
  const client = { users: { fetch: async () => { throw new Error("Unknown User"); } } } as unknown as Client;

  expect(await sendReminderDm(client, id, "hi")).toBe(false);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/reminders/send-reminder-dm.test.ts`
Expected: FAIL with "sendReminderDm is not a function".

- [ ] **Step 3: Add the reminder type and extract the sender**

In `src/services/cooldownReminderService.ts`, change `REMINDER_TYPES` to:

```ts
export const REMINDER_TYPES = {
  daily: { label: "Daily reward", command: "!daily" },
  weekly: { label: "Weekly reward", command: "!weekly" },
  monthly: { label: "Monthly reward", command: "!monthly" },
  crime: { label: "Crime board", command: "!crime" },
  hunt: { label: "Hunt", command: "!hunt" },
  work: { label: "Work shift", command: "!work" },
  vote: { label: "Vote", command: "!vote" },
  // Not a cooldown: matured FD/RD payouts. Never enqueued; listed here so the
  // settings toggles and getReminderPrefs govern it like every other DM.
  investment: { label: "Investment payouts", command: "!bank invest" },
} as const;
```

Replace everything from the `/** Called by the per-minute cron …` comment through the end of `processDueReminders` with:

```ts
/**
 * Send one DM and keep the closed-DM bookkeeping: a delivered DM resets the
 * fail count; MAX_DM_FAILS failures in a row switch reminders off for that
 * player. Returns whether the DM was delivered.
 */
export async function sendReminderDm(client: Client, discordId: string, content: string): Promise<boolean> {
  const discordUser = await client.users.fetch(discordId).catch(() => null);
  if (!discordUser) return false;

  try {
    await discordUser.send({ content });
    await prisma.user.update({
      where: { discordId },
      data: { reminderDmFailCount: 0 },
    }).catch(() => {});
    return true;
  } catch {
    // DMs closed or blocked — count it; auto-pause after MAX_DM_FAILS in a row.
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: { reminderDmFailCount: true },
    });
    const fails = (user?.reminderDmFailCount ?? 0) + 1;
    if (fails >= MAX_DM_FAILS) {
      await prisma.user.update({
        where: { discordId },
        data: { remindersEnabled: false, reminderDmFailCount: 0 },
      }).catch(() => {});
      await cancelAll(discordId);
    } else {
      await prisma.user.update({
        where: { discordId },
        data: { reminderDmFailCount: fails },
      }).catch(() => {});
    }
    return false;
  }
}

/** Called by the per-minute cron. Drains due reminders, one combined DM per player. */
export async function processDueReminders(client: Client): Promise<void> {
  const due = await prisma.cooldownReminder.findMany({
    where: { dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: BATCH_SIZE,
  });
  if (due.length === 0) return;

  // Delete the batch up front: fire-once semantics regardless of DM outcome.
  await prisma.cooldownReminder.deleteMany({ where: { id: { in: due.map((r) => r.id) } } });

  const byUser = new Map<string, ReminderType[]>();
  for (const row of due) {
    if (!isReminderType(row.type)) continue; // unknown types are dropped silently
    const list = byUser.get(row.discordId) ?? [];
    list.push(row.type);
    byUser.set(row.discordId, list);
  }

  for (const [discordId, types] of byUser) {
    try {
      const prefs = await getReminderPrefs(discordId);
      if (!prefs.remindersEnabled) continue;
      const active = types.filter((t) => !prefs.disabledReminders.includes(t));
      if (active.length === 0) continue;

      await sendReminderDm(client, discordId, buildDmContent(active));
    } catch (err) {
      console.error(`processDueReminders failed for ${discordId}:`, err);
    }
  }
}
```

- [ ] **Step 4: Add the settings toggle**

In `src/commands/general/settings.ts` line 24, change `TYPE_ORDER` to:

```ts
const TYPE_ORDER: ReminderType[] = ["daily", "weekly", "monthly", "crime", "hunt", "work", "vote", "investment"];
```

(Row 1 keeps four buttons; row 2 becomes hunt, work, vote, investment — four buttons, under the five-per-row cap.)

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run test/reminders/send-reminder-dm.test.ts`
Expected: 4 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/cooldownReminderService.ts src/commands/general/settings.ts test/reminders/send-reminder-dm.test.ts
git commit -m "refactor(reminders): extract sendReminderDm and add an investment payout toggle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 4: Maturity DM notifier wired into the cron

**Files:**
- Create: `src/services/investmentNotifyService.ts`
- Modify: `src/scheduler.ts:3-4` (imports), `:27-28` (after the log line)
- Test: `test/bank/investment-notify.test.ts` (new)

**Interfaces:**
- Consumes: `MaturedInvestment` (Task 1), `getReminderPrefs` + `sendReminderDm` (Task 3), `isTester`, `fmtCurrency`, `fmtAmount`.
- Produces:
  - `buildMaturedInvestmentDm(matured: MaturedInvestment[]): string`
  - `notifyMaturedInvestments(client: Client, matured: MaturedInvestment[]): Promise<void>` — one DM per player, never throws.

- [ ] **Step 1: Write the failing tests**

Create `test/bank/investment-notify.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Client } from "discord.js";
import { testPrisma, seedUser, resetUser } from "../helpers";
import type { MaturedInvestment } from "../../src/services/bankingService";
import {
  buildMaturedInvestmentDm,
  notifyMaturedInvestments,
} from "../../src/services/investmentNotifyService";

const a = "invest-notify-a";
const b = "invest-notify-b";

function matured(
  userId: string,
  over: Partial<{ type: string; amount: number; interestEarned: number; payout: number; days: number }> = {},
): MaturedInvestment {
  const amount = over.amount ?? 365_000;
  const interestEarned = over.interestEarned ?? 1000;
  const payout = over.payout ?? amount + interestEarned;
  const now = new Date();
  const investment = {
    id: "inv", userId, type: over.type ?? "FD", amount, interestRate: 10,
    startDate: now, maturityDate: now, status: "COMPLETED",
    completedAt: now, interestEarned, payout, updatedAt: now,
  };
  return {
    id: "inv", type: investment.type, principal: amount,
    interest: Math.max(0, payout - amount), payout,
    durationDays: over.days ?? 10, capped: payout < amount + interestEarned,
    investment,
    bank: { id: "bank", userId, balance: payout, createdAt: now, updatedAt: now },
  } as unknown as MaturedInvestment;
}

function fakeClient() {
  const send = vi.fn(async () => ({}));
  const client = { users: { fetch: vi.fn(async () => ({ send })) } } as unknown as Client;
  return { client, send };
}

function sentContent(send: ReturnType<typeof vi.fn>, call: number): string {
  return (send.mock.calls[call][0] as { content: string }).content;
}

beforeEach(async () => {
  await resetUser(a);
  await resetUser(b);
});

describe("buildMaturedInvestmentDm", () => {
  it("lists every deposit with principal, payout and interest", () => {
    const text = buildMaturedInvestmentDm([
      matured(a),
      matured(a, { type: "RD", amount: 50_000, interestEarned: 54, days: 1 }),
    ]);
    expect(text).toContain("**FD**");
    expect(text).toContain("365,000");
    expect(text).toContain("366,000");
    expect(text).toContain("+1,000 interest");
    expect(text).toContain("**RD**");
    expect(text).toContain("locked for 1 day ");
    expect(text).not.toContain("bank was full");
    expect(text).toContain("`!settings`");
  });

  it("adds the shortfall line only when the bank cap cut the payout", () => {
    const text = buildMaturedInvestmentDm([matured(a, { payout: 365_500 })]);
    expect(text).toContain("500 of this payout was lost");
  });
});

describe("notifyMaturedInvestments", () => {
  it("sends one DM per player covering all their deposits", async () => {
    await seedUser(a);
    await seedUser(b);
    const { client, send } = fakeClient();

    await notifyMaturedInvestments(client, [matured(a), matured(a, { type: "RD" }), matured(b)]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(sentContent(send, 0)).toContain("**RD**");
    expect(sentContent(send, 0)).toContain("**FD**");
  });

  it("respects the master switch", async () => {
    await seedUser(a, { remindersEnabled: false });
    const { client, send } = fakeClient();

    await notifyMaturedInvestments(client, [matured(a)]);

    expect(send).not.toHaveBeenCalled();
  });

  it("respects the per-type toggle", async () => {
    await seedUser(a, { disabledReminders: ["investment"] });
    const { client, send } = fakeClient();

    await notifyMaturedInvestments(client, [matured(a)]);

    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing for an empty batch", async () => {
    const { client, send } = fakeClient();
    await notifyMaturedInvestments(client, []);
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/bank/investment-notify.test.ts`
Expected: FAIL — cannot resolve `../../src/services/investmentNotifyService`.

- [ ] **Step 3: Create the notifier**

Create `src/services/investmentNotifyService.ts`:

```ts
import { Client } from "discord.js";
import { MaturedInvestment } from "./bankingService";
import { getReminderPrefs, sendReminderDm } from "./cooldownReminderService";
import { isTester } from "../utils/developerAccess";
import { fmtAmount, fmtCurrency } from "../utils/format";

const FOOTER = "-# Manage these DMs with `!settings` in any server with Fortuna.";

// interestEarned is what the deposit earned; payout is what the bank cap let
// through. The difference is money the player never received.
function shortfall(m: MaturedInvestment): number {
  return Math.max(0, m.investment.amount + (m.investment.interestEarned ?? 0) - m.payout);
}

export function buildMaturedInvestmentDm(matured: MaturedInvestment[]): string {
  const lines = matured.map((m) => {
    const inv = m.investment;
    const days = `${m.durationDays} day${m.durationDays === 1 ? "" : "s"}`;
    const earned = fmtAmount(inv.interestEarned ?? 0);
    return `• **${inv.type}** — ${fmtCurrency(inv.amount)} locked for ${days} → paid **${fmtCurrency(m.payout)}** (+${earned} interest)`;
  });

  const lost = matured.reduce((sum, m) => sum + shortfall(m), 0);
  const parts = ["💰 **Investment matured!**", ...lines];
  if (lost > 0) parts.push(`-# Your bank was full, so ${fmtAmount(lost)} of this payout was lost.`);
  parts.push(FOOTER);
  return parts.join("\n");
}

/** One DM per player for a batch matured by the cron. Never throws. */
export async function notifyMaturedInvestments(client: Client, matured: MaturedInvestment[]): Promise<void> {
  const byUser = new Map<string, MaturedInvestment[]>();
  for (const m of matured) {
    const list = byUser.get(m.investment.userId) ?? [];
    list.push(m);
    byUser.set(m.investment.userId, list);
  }

  for (const [discordId, list] of byUser) {
    try {
      if (isTester(discordId)) continue;
      const prefs = await getReminderPrefs(discordId);
      if (!prefs.remindersEnabled || prefs.disabledReminders.includes("investment")) continue;
      await sendReminderDm(client, discordId, buildMaturedInvestmentDm(list));
    } catch (err) {
      console.error(`notifyMaturedInvestments failed for ${discordId}:`, err);
    }
  }
}
```

- [ ] **Step 4: Wire it into the scheduler**

In `src/scheduler.ts`, add the import after the `bankingService` import:

```ts
import { notifyMaturedInvestments } from "./services/investmentNotifyService";
```

and directly after `console.log(\`Processed ${matured.length} matured investments.\`);` add:

```ts
      await notifyMaturedInvestments(client, matured).catch((err) => console.error("Investment DM error:", err));
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run test/bank/investment-notify.test.ts`
Expected: 6 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/investmentNotifyService.ts src/scheduler.ts test/bank/investment-notify.test.ts
git commit -m "feat(bank): DM players when an FD or RD matures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 5: Recent Returns in the bank Investments tab, plus the FD doc line

**Files:**
- Modify: `src/commands/economy/bank.ts:17-21` (imports), `:547-583` (`buildBankInvestmentsContainer`), `:649-654` (`investments` branch of `execute`)
- Modify: `src/handlers/bankInteractionHandler.ts:17` (import), `:96-102` (`case "invest"`)
- Modify: `dashboard/src/content/modules/bank-and-credit.ts:32`
- Test: `test/bank/investments-tab.test.ts` (new)

**Interfaces:**
- Consumes: `getInvestmentReturns`, `InvestmentReturns` (Task 2), `fmtAmount`, `fmtCurrency`.
- Produces: `buildBankInvestmentsContainer(displayName, avatarUrl, summary, ownerId, returns: InvestmentReturns)` — fifth parameter is new and required.

- [ ] **Step 1: Write the failing tests**

Create `test/bank/investments-tab.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBankInvestmentsContainer } from "../../src/commands/economy/bank";
import type { InvestmentReturns } from "../../src/services/bankingService";

// Builder-only test: no DB. Verifies the Recent Returns block is one packed
// TextDisplay (the 40-component cap) and that the numbers render.

const summary = { netWorth: 0, walletBalance: 0, bankBalance: 0, creditScore: 500, investments: [] } as any;
const AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

function completed(over: Partial<{ amount: number; interestEarned: number; payout: number }> = {}) {
  const amount = over.amount ?? 100_000;
  const interestEarned = over.interestEarned ?? 1000;
  const now = new Date();
  return {
    id: "inv", userId: "u", type: "FD", amount, interestRate: 10,
    startDate: now, maturityDate: now, status: "COMPLETED",
    completedAt: now, interestEarned, payout: over.payout ?? amount + interestEarned, updatedAt: now,
  } as InvestmentReturns["recent"][number];
}

function render(returns: InvestmentReturns) {
  const json = buildBankInvestmentsContainer("Yash", AVATAR, summary, "u", returns).toJSON() as any;
  return { json, text: JSON.stringify(json) };
}

describe("buildBankInvestmentsContainer", () => {
  it("shows lifetime interest and one line per recent return in a single text block", () => {
    const { json, text } = render({
      recent: [completed(), completed({ amount: 50_000, interestEarned: 54 })],
      lifetimeInterest: 1054,
    });
    expect(text).toContain("Lifetime interest earned:");
    expect(text).toContain("1,054");
    expect(text).toContain("### Recent returns");
    expect(text).toContain("101,000");
    expect(text).toContain("(+1,000)");
    expect(text).toContain("50,054");
    // header section, separator, "No active investments", separator, recent returns, nav row
    expect(json.components).toHaveLength(6);
  });

  it("flags a bank-cap shortfall on the line", () => {
    const { text } = render({ recent: [completed({ payout: 100_500 })], lifetimeInterest: 1000 });
    expect(text).toContain("bank full, −500");
  });

  it("says so when there is no history yet", () => {
    const { text } = render({ recent: [], lifetimeInterest: 0 });
    expect(text).toContain("No matured deposits yet.");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/bank/investments-tab.test.ts`
Expected: FAIL — "Lifetime interest earned" not found (the fifth argument is ignored today).

- [ ] **Step 3: Extend the container builder**

In `src/commands/economy/bank.ts`, change the `bankingService` import (lines 17–21) to:

```ts
import {
    checkMaturedInvestments,
    createInvestment,
    getFinancialSummary,
    getInvestmentReturns,
    InvestmentReturns,
} from "../../services/bankingService";
```

and the format import (line 37) to:

```ts
import { fmtAmount, fmtCurrency, parseSmartAmount } from "../../utils/format";
```

Replace the whole `buildBankInvestmentsContainer` function with:

```ts
export function buildBankInvestmentsContainer(
    displayName: string,
    avatarUrl: string,
    summary: FinancialSummary,
    ownerId: string,
    returns: InvestmentReturns,
) {
    const container = new ContainerBuilder()
        .addSectionComponents(
            buildBankHeaderSection(
                `${displayName}'s Investment Portfolio`,
                [
                    `FD Rate: **${BANKING_CONFIG.fdInterestRate}% APR**`,
                    `RD Rate: **${BANKING_CONFIG.rdInterestRate}% APR**`,
                    `Lifetime interest earned: **${fmtCurrency(returns.lifetimeInterest)}**`,
                ].join("\n"),
                avatarUrl,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        );

    if (summary.investments.length > 0) {
        summary.investments.forEach((investment) => {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${investment.type}\nPrincipal: **${fmtCurrency(investment.amount)}**\nRate: **${investment.interestRate}% APR**\nMatures: <t:${Math.floor(investment.maturityDate.getTime() / 1000)}:R>`,
                ),
            );
        });
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent("No active investments."));
    }

    container
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Recent returns\n${formatRecentReturns(returns.recent)}`),
        );

    return container.addActionRowComponents(buildBankSectionNavRow(ownerId));
}

// One line per matured deposit, packed into a single TextDisplay so a long
// history never eats into the 40-component cap.
function formatRecentReturns(recent: InvestmentReturns["recent"]): string {
    if (recent.length === 0) return "-# No matured deposits yet.";
    return recent
        .map((inv) => {
            const earned = inv.interestEarned ?? 0;
            const payout = inv.payout ?? 0;
            const lost = Math.max(0, inv.amount + earned - payout);
            const when = inv.completedAt ? `<t:${Math.floor(inv.completedAt.getTime() / 1000)}:R>` : "";
            const shortfall = lost > 0 ? ` · ⚠ bank full, −${fmtAmount(lost)}` : "";
            return `${inv.type} · **${fmtCurrency(inv.amount)}** → **${fmtCurrency(payout)}** (+${fmtAmount(earned)}) · ${when}${shortfall}`;
        })
        .join("\n");
}
```

- [ ] **Step 4: Update both call sites**

In `src/commands/economy/bank.ts` `execute`, replace the `investments` branch with:

```ts
    if (subCommand === "investments" || subCommand === "invest") {
        const returns = await getInvestmentReturns(user.id);
        return message.reply({
            components: [buildBankInvestmentsContainer(displayName, avatarUrl, summary, user.id, returns)],
            flags: MessageFlags.IsComponentsV2,
        });
    }
```

In `src/handlers/bankInteractionHandler.ts`, change line 17 to:

```ts
import { createInvestment, getFinancialSummary, getInvestmentReturns, checkMaturedInvestments } from "../services/bankingService";
```

and replace `case "invest"` with:

```ts
        case "invest": {
            await ensureDeferredUpdate(interaction);
            const [summary, returns] = await Promise.all([
                getFinancialSummary(user.id),
                getInvestmentReturns(user.id),
            ]);
            const container = buildBankInvestmentsContainer(displayName, avatarUrl, summary, user.id, returns);
            await safeEditReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
```

- [ ] **Step 5: Update the FD doc paragraph**

In `dashboard/src/content/modules/bank-and-credit.ts`, replace the string on line 32 (starts "At maturity the payout lands back in your bank automatically") with:

```ts
        "At maturity the payout lands back in your bank automatically — Fortuna checks every minute, DMs you the principal, interest and payout (toggle it under !settings), and the Investments tab keeps your last five returns plus lifetime interest earned. There is no early withdrawal: an FD is locked until its date, full stop. That's the entire risk.",
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run test/bank/investments-tab.test.ts`
Expected: 3 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/commands/economy/bank.ts src/handlers/bankInteractionHandler.ts dashboard/src/content/modules/bank-and-credit.ts test/bank/investments-tab.test.ts
git commit -m "feat(bank): show recent returns and lifetime interest in the investments tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 6: Card tier helpers, catalog flag, and the gated set

**Files:**
- Modify: `src/utils/economyConfig.ts:272-274` (after `getCardTierConfig`)
- Modify: `src/utils/shopCatalog.ts:1-19` (import + interface), the eight entries, and after `SHOP_CATALOG` (line ~1262)
- Modify: `src/commands/economy/bank.ts:32-37` (import), `:330-336` (delete local `formatTierName`)
- Test: `test/shop/card-exclusive.test.ts` (new)

**Interfaces:**
- Produces:
  - `cardTierMeets(cardTier: string, minTier: CardTierName): boolean`
  - `formatCardTierName(tier: string): string` — `"GOLD"` → `"Gold"` (moved from `bank.ts`'s private `formatTierName`)
  - `ShopCatalogItem.requiresCardTier?: CardTierName`
  - `getCardExclusiveItems(tier: CardTierName): ShopCatalogItem[]`

- [ ] **Step 1: Write the failing tests**

Create `test/shop/card-exclusive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CARD_TIERS, cardTierMeets, formatCardTierName } from "../../src/utils/economyConfig";
import { SHOP_CATALOG, getCardExclusiveItems } from "../../src/utils/shopCatalog";

describe("cardTierMeets", () => {
  it("accepts the same tier and anything above it", () => {
    expect(cardTierMeets("GOLD", "GOLD")).toBe(true);
    expect(cardTierMeets("BLACK", "STARTER")).toBe(true);
    expect(cardTierMeets("PLATINUM", "GOLD")).toBe(true);
  });

  it("rejects a lower tier", () => {
    expect(cardTierMeets("STARTER", "GOLD")).toBe(false);
    expect(cardTierMeets("GOLD", "BLACK")).toBe(false);
  });

  it("ranks an unknown tier as Starter, like getCardTierConfig", () => {
    expect(cardTierMeets("MYSTERY", "STARTER")).toBe(true);
    expect(cardTierMeets("MYSTERY", "GOLD")).toBe(false);
  });
});

describe("formatCardTierName", () => {
  it("title-cases the enum value", () => {
    expect(formatCardTierName("GOLD")).toBe("Gold");
    expect(formatCardTierName("STARTER")).toBe("Starter");
  });
});

describe("card-exclusive catalog invariants", () => {
  const gated = SHOP_CATALOG.filter((item) => item.requiresCardTier);

  it("gates exactly the agreed eight items", () => {
    expect(gated.map((item) => item.key).sort()).toEqual([
      "celestial_halo",
      "celestial_harp",
      "crown_of_greed",
      "demonic_harp",
      "emperors_throne",
      "platinum_crown",
      "royal_cape",
      "void_wings",
    ]);
  });

  it("never combines a card gate with a credit block", () => {
    for (const item of gated) expect(item.creditBlocked, item.key).toBeFalsy();
  });

  it("keeps every gated price inside its tier's weekly spend cap and credit limit", () => {
    for (const item of gated) {
      const tier = CARD_TIERS[item.requiresCardTier!];
      expect(item.price, item.key).toBeLessThanOrEqual(tier.weeklySpendCap);
      expect(item.price, item.key).toBeLessThanOrEqual(tier.creditLimit);
    }
  });

  it("lists exclusives per tier in catalog order", () => {
    expect(getCardExclusiveItems("STARTER").map((i) => i.name)).toEqual(["Celestial Harp", "Demonic Harp"]);
    expect(getCardExclusiveItems("GOLD").map((i) => i.name)).toEqual(["Crown of Greed", "Royal Cape"]);
    expect(getCardExclusiveItems("PLATINUM").map((i) => i.name)).toEqual(["Platinum Crown", "Void Wings"]);
    expect(getCardExclusiveItems("BLACK").map((i) => i.name)).toEqual(["Celestial Halo", "Emperor's Throne"]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/shop/card-exclusive.test.ts`
Expected: FAIL — `cardTierMeets is not a function` (and the invariant block finds zero gated items).

- [ ] **Step 3: Add the tier helpers**

In `src/utils/economyConfig.ts`, directly after `getCardTierConfig` (ends line 274), add:

```ts
/** Does a card of `cardTier` satisfy a `minTier` requirement? Unknown tiers rank as Starter. */
export function cardTierMeets(cardTier: string, minTier: CardTierName): boolean {
  const have = CARD_TIER_ORDER.indexOf(getCardTierConfig(cardTier).tier);
  return have >= CARD_TIER_ORDER.indexOf(minTier);
}

/** "GOLD" → "Gold". Display form only; data and service errors keep the uppercase enum. */
export function formatCardTierName(tier: string): string {
  return tier
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
```

- [ ] **Step 4: Move `bank.ts` onto the shared formatter**

In `src/commands/economy/bank.ts`:

1. Change the `economyConfig` import (lines 32–37) to:

```ts
import {
    BANKING_CONFIG,
    CARD_TIER_ORDER,
    CardTierConfig,
    formatCardTierName,
    getCardTierConfig,
} from "../../utils/economyConfig";
```

2. Delete the local function (lines 330–336):

```ts
function formatTierName(tier: string) {
    return tier
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
```

3. Rename every remaining call in the file:

Run (Git Bash): `sed -i 's/formatTierName(/formatCardTierName(/g' src/commands/economy/bank.ts`

Then confirm nothing else references the old name:

Run: `grep -rn "formatTierName" src`
Expected: no output.

- [ ] **Step 5: Add the catalog flag and the eight entries**

In `src/utils/shopCatalog.ts`:

1. After line 1 (`import { ItemEffect } …`) add:

```ts
import type { CardTierName } from "./economyConfig";
```

2. In `ShopCatalogItem`, after `creditBlocked?: boolean;` add:

```ts
  // Card-exclusive: only buyable on credit with an ACTIVE Fortuna Card of this
  // tier or higher. Never set together with creditBlocked (tested).
  requiresCardTier?: CardTierName;
```

3. Add one line to each of the eight entries, placed directly after the `itemType:` line of that entry:

| key | line to insert |
|---|---|
| `celestial_harp` | `    requiresCardTier: "STARTER",` |
| `demonic_harp` | `    requiresCardTier: "STARTER",` |
| `crown_of_greed` | `    requiresCardTier: "GOLD",` |
| `royal_cape` | `    requiresCardTier: "GOLD",` |
| `platinum_crown` | `    requiresCardTier: "PLATINUM",` |
| `void_wings` | `    requiresCardTier: "PLATINUM",` |
| `celestial_halo` | `    requiresCardTier: "BLACK",` |
| `emperors_throne` | `    requiresCardTier: "BLACK",` |

For example, `celestial_harp` becomes:

```ts
    itemType: "CONSUMABLE",
    requiresCardTier: "STARTER",
    maxStack: 1,
```

4. After the `SHOP_CATALOG` array (closing `];` around line 1262), add:

```ts
export function getCardExclusiveItems(tier: CardTierName): ShopCatalogItem[] {
  return SHOP_CATALOG.filter((item) => item.requiresCardTier === tier);
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run test/shop/card-exclusive.test.ts`
Expected: 8 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/utils/economyConfig.ts src/utils/shopCatalog.ts src/commands/economy/bank.ts test/shop/card-exclusive.test.ts
git commit -m "feat(shop): flag eight catalog items as card-exclusive by tier

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 7: Enforce the card gate in the purchase path

**Files:**
- Modify: `src/services/creditCardService.ts:3-13` (import), `:373-378` (`chargeCardPurchaseTx`)
- Modify: `src/services/shopService.ts:17-25` (`getItemEffectSource`), `:160` (`totalPrice`), `:171-186` (card/wallet checks), `:254-261` (charge call)
- Test: `test/shop/card-exclusive.test.ts`

**Interfaces:**
- Consumes: `cardTierMeets`, `CardTierName`, `ShopCatalogItem.requiresCardTier` (Task 6).
- Produces:
  - `chargeCardPurchaseTx(trx, discordId, amount, meta = {}, opts: { minTier?: CardTierName } = {})` — throws `This item needs a **GOLD** Fortuna Card or higher. Your card: **STARTER**.` when the tier is too low. The existing caller in `educationService.ts` passes no `opts` and is unaffected.
  - `buyItem` throws `**Royal Cape** is card-exclusive. Buy it on credit with a **GOLD** Fortuna Card or higher: \`shop buy card royal cape\`.` on a wallet attempt.

- [ ] **Step 1: Write the failing tests**

Append to `test/shop/card-exclusive.test.ts`. Add these imports at the top of the file:

```ts
import { beforeEach } from "vitest";
import { testPrisma, seedUser, resetUser } from "../helpers";
import { buyItem, seedCosmeticsShop, seedGeneralShop } from "../../src/services/shopService";
import { TESTER_IDS } from "../../src/utils/developerAccess";
```

and append at the end:

```ts
describe("buyItem enforces the card gate", () => {
  const id = "shop-card-exclusive";
  const GUILD = "test-guild";

  async function reset() {
    const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
    if (card) {
      await testPrisma.cardTransaction.deleteMany({ where: { cardId: card.id } });
      await testPrisma.cardStatement.deleteMany({ where: { cardId: card.id } });
      await testPrisma.creditCard.delete({ where: { id: card.id } });
    }
    await testPrisma.bank.deleteMany({ where: { userId: id } });
    await resetUser(id);
  }

  async function giveCard(tier: "STARTER" | "GOLD") {
    const cfg = CARD_TIERS[tier];
    await testPrisma.creditCard.create({
      data: {
        userId: id,
        tier,
        status: "ACTIVE",
        creditLimit: cfg.creditLimit,
        weeklyInterestPct: cfg.weeklyInterestPct,
        weeklySpendCap: cfg.weeklySpendCap,
        weeklyWithdrawCap: cfg.weeklyWithdrawCap,
      },
    });
  }

  beforeEach(async () => {
    await reset();
    await seedUser(id, { wallet: { create: { balance: 50_000_000 } } });
    await seedGeneralShop(GUILD);
    await seedCosmeticsShop(GUILD);
  });

  it("refuses a wallet purchase of a card-exclusive item, even with the coins", async () => {
    await expect(buyItem(GUILD, id, "Celestial Harp")).rejects.toThrow(/card-exclusive/);
  });

  it("refuses a credit purchase when the card tier is too low", async () => {
    await giveCard("STARTER");
    await expect(buyItem(GUILD, id, "Royal Cape", undefined, false, "card")).rejects.toThrow(/needs a \*\*GOLD\*\* Fortuna Card/);
  });

  it("charges the card and hands over the item when the tier qualifies", async () => {
    await giveCard("GOLD");

    const purchase = await buyItem(GUILD, id, "Royal Cape", undefined, false, "card");

    expect(purchase.cardInfo?.currentBalance).toBe(2_500_000);
    const card = await testPrisma.creditCard.findUnique({ where: { userId: id } });
    const txs = await testPrisma.cardTransaction.findMany({ where: { cardId: card!.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe("PURCHASE");
    const inv = await testPrisma.inventory.findFirst({ where: { userId: id }, include: { shopItem: true } });
    expect(inv?.shopItem.name).toBe("Royal Cape");
    expect(inv?.amount).toBe(1);
  });

  it("still refuses credit-blocked items on a card", async () => {
    await giveCard("GOLD");
    await expect(buyItem(GUILD, id, "Mystery Box", undefined, false, "card")).rejects.toThrow(/cannot be purchased with a credit card/);
  });

  it("lets testers buy a gated item from the wallet", async () => {
    TESTER_IDS.add(id);
    try {
      const purchase = await buyItem(GUILD, id, "Celestial Harp");
      expect(purchase.item.name).toBe("Celestial Harp");
    } finally {
      TESTER_IDS.delete(id);
    }
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/shop/card-exclusive.test.ts`
Expected: the first two new tests FAIL (the wallet purchase succeeds; the Starter-card purchase succeeds). The other three may pass already.

- [ ] **Step 3: Add the tier check to the card charge**

In `src/services/creditCardService.ts`, change the `economyConfig` import to:

```ts
import {
  calculateMinimumDue,
  CARD_SCORE_RULES,
  CARD_TIER_ORDER,
  CardTierConfig,
  CardTierName,
  cardTierMeets,
  clampCardScore,
  getCardTierConfig,
  getCycleKey,
  getEligibleCardTier,
  MAX_SAFE_BALANCE
} from "../utils/economyConfig";
```

Replace the head of `chargeCardPurchaseTx` (signature through the `ACTIVE` check) with:

```ts
export async function chargeCardPurchaseTx(
  trx: any,
  discordId: string,
  amount: number,
  meta: any = {},
  opts: { minTier?: CardTierName } = {},
) {
  const purchaseAmount = requireIntAmount(amount);
  const card = await trx.creditCard.findUnique({ where: { userId: discordId } });
  if (!card) throw new Error("You do not have a card.");
  if (card.status !== "ACTIVE") throw new Error("Only active cards can be used for purchases.");
  if (opts.minTier && !cardTierMeets(card.tier, opts.minTier)) {
    throw new Error(`This item needs a **${opts.minTier}** Fortuna Card or higher. Your card: **${card.tier}**.`);
  }
```

The credit-limit and spend-cap checks that follow stay as they are.

- [ ] **Step 4: Gate wallet purchases in `buyItem` and pass the tier to the charge**

In `src/services/shopService.ts`:

1. Replace `getItemEffectSource` (lines 17–25) with a shared lookup plus the original:

```ts
// Catalog entry for a DB shop row: by key when the row carries one, else by
// name (rows created before catalogKey existed only have a name).
function findCatalogEntry(item: { catalogKey?: string | null; name: string }): ShopCatalogItem | undefined {
  return SHOP_CATALOG.find((entry) => entry.key === item.catalogKey || entry.name.toLowerCase() === item.name.toLowerCase());
}

function getItemEffectSource(item: { catalogKey?: string | null; name: string; emoji?: string | null }): ItemEffectSource {
  const catalog = findCatalogEntry(item);
  return {
    key: item.catalogKey ?? catalog?.key,
    name: item.name,
    emojiKey: catalog?.asset ?? item.catalogKey ?? undefined,
    emoji: item.emoji ?? undefined,
  };
}
```

2. In `buyItem`, directly after `const totalPrice = item.price * qty;` add:

```ts
  const catalogEntry = findCatalogEntry(item);
```

3. Replace the block that starts `if (paymentSource === "card" && !tester) {` and ends with the wallet-balance `else if … }` (lines 171–186) with:

```ts
    // Card-exclusive items must go on the card; refuse before the balance check
    // so a rich wallet still gets the right message.
    if (catalogEntry?.requiresCardTier && paymentSource !== "card" && !tester) {
      throw new Error(
        `**${item.name}** is card-exclusive. Buy it on credit with a **${catalogEntry.requiresCardTier}** Fortuna Card or higher: \`shop buy card ${item.name.toLowerCase()}\`.`,
      );
    }

    if (paymentSource === "card" && !tester) {
      if (catalogEntry?.creditBlocked) {
        throw new Error(`**${item.name}** cannot be purchased with a credit card.`);
      }
    } else if (user.wallet.balance < totalPrice && !tester) {
      throw new Error(
        qty > 1
          ? `You need ${totalPrice.toLocaleString("en-US")} coins to buy ${qty}x ${item.name}.`
          : `You need ${totalPrice.toLocaleString("en-US")} coins to buy this.`,
      );
    }
```

(The old `allCatalogs` array and its `find` go away; `findCatalogEntry` replaces them.)

4. Change the charge call (around line 255) to pass the tier:

```ts
      const result = await chargeCardPurchaseTx(tx, userId, totalPrice, {
        type: "shop_purchase",
        itemName: item.name,
        quantity: qty,
        guildId,
      }, { minTier: catalogEntry?.requiresCardTier });
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run test/shop/card-exclusive.test.ts`
Expected: 13 passed.

Run: `npm run typecheck`
Expected: exits 0.

Also re-run the existing purchase test to be sure nothing regressed:

Run: `npx vitest run test/zoo/feed-purchase.test.ts`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add src/services/creditCardService.ts src/services/shopService.ts test/shop/card-exclusive.test.ts
git commit -m "feat(shop): card-exclusive items can only be charged to a qualifying Fortuna Card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 8: Item info card: badge, buttons, and hints

**Files:**
- Modify: `src/commands/economy/shop.ts:25` (imports), `:58-63` (`replyShopInfoCard`), `:835-931` (`buildItemInfoCard`)
- Test: `test/shop/item-info-card.test.ts` (new)

**Interfaces:**
- Consumes: `cardTierMeets`, `formatCardTierName` (Task 6), `ShopCatalogItem.requiresCardTier`, `getCatalogItem` (already exported from `shopCatalog.ts`).
- Produces: `export function buildItemInfoCard(item: ShopCatalogItem, ownerId: string, card: { status: string; tier: string } | null = null)` — the third parameter replaces the old `canUseCredit` boolean.

- [ ] **Step 1: Write the failing tests**

Create `test/shop/item-info-card.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildItemInfoCard } from "../../src/commands/economy/shop";
import { getCatalogItem } from "../../src/utils/shopCatalog";

// Builder-only: the item detail card is the one place a shopper learns an
// item is card-exclusive, so its buttons and hints are pinned here.

const cape = getCatalogItem("royal_cape")!;   // GOLD-exclusive
const shield = getCatalogItem("tax_shield")!; // ordinary item

function render(item: typeof cape, card: { status: string; tier: string } | null) {
  const payload = buildItemInfoCard(item, "u", card);
  const [container, row] = payload.components as any[];
  return {
    text: JSON.stringify(container.toJSON()),
    buttons: row.toJSON().components as Array<{ custom_id: string; disabled?: boolean }>,
  };
}

describe("buildItemInfoCard for a card-exclusive item", () => {
  it("hides the wallet button and disables credit when the shopper has no card", () => {
    const { text, buttons } = render(cape, null);
    expect(text).toContain("Gold Card exclusive");
    expect(buttons.map((b) => b.custom_id)).toEqual(["shop_buy_card:royal_cape:u"]);
    expect(buttons[0].disabled).toBe(true);
    expect(text).toContain("Requires an active **Gold** Fortuna Card");
  });

  it("tells a lower-tier holder to upgrade", () => {
    const { text, buttons } = render(cape, { status: "ACTIVE", tier: "STARTER" });
    expect(buttons[0].disabled).toBe(true);
    expect(text).toContain("Your **Starter** card doesn't qualify");
  });

  it("treats a non-active card like no card", () => {
    const { text, buttons } = render(cape, { status: "LOCKED", tier: "BLACK" });
    expect(buttons[0].disabled).toBe(true);
    expect(text).toContain("Requires an active **Gold** Fortuna Card");
  });

  it("enables credit when the card qualifies", () => {
    const { buttons } = render(cape, { status: "ACTIVE", tier: "PLATINUM" });
    expect(buttons[0].disabled).toBeFalsy();
  });
});

describe("buildItemInfoCard for an ordinary item", () => {
  it("keeps the wallet button and offers credit to an active card", () => {
    const { text, buttons } = render(shield, { status: "ACTIVE", tier: "STARTER" });
    expect(buttons.map((b) => b.custom_id)).toEqual(["shop_buy:tax_shield:u", "shop_buy_card:tax_shield:u"]);
    expect(text).not.toContain("Card exclusive");
  });

  it("keeps the wallet button and the apply hint without a card", () => {
    const { text, buttons } = render(shield, null);
    expect(buttons.map((b) => b.custom_id)).toEqual(["shop_buy:tax_shield:u"]);
    expect(text).toContain("Credit purchases require an **ACTIVE** Fortuna Card");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run test/shop/item-info-card.test.ts`
Expected: FAIL — `buildItemInfoCard` is not exported (import resolves to `undefined`).

- [ ] **Step 3: Rewrite the info card**

In `src/commands/economy/shop.ts`:

1. Add after the `fmtCurrency` import on line 25:

```ts
import { cardTierMeets, formatCardTierName } from "../../utils/economyConfig";
```

2. Replace `replyShopInfoCard` (lines 58–63) with:

```ts
async function replyShopInfoCard(interaction: ShopPanelInteraction, item: ShopCatalogItem, ownerId: string) {
  if (!await ensureDeferredEphemeralReply(interaction, SHOP_EPHEMERAL_V2)) return;
  const cardSummary = await getCardSummary(ownerId);
  await safeEditReply(interaction, buildItemInfoCard(item, ownerId, cardSummary.card));
}
```

3. Replace the whole `buildItemInfoCard` function with:

```ts
type ShopperCard = { status: string; tier: string } | null;

export function buildItemInfoCard(item: ShopCatalogItem, ownerId: string, card: ShopperCard = null) {
  const isLoadedDice = item.key === LOADED_DICE_ITEM_KEY;
  const typeLabel = item.consumable ? "Consumable" : item.itemType === "EQUIPMENT" ? "Equipment" : "Collectible";
  const usableLabel = item.usable ? "Yes" : "No";
  const maxStackLabel = isLoadedDice ? "1 active die" : item.maxStack === 1 ? "1 (one-time use)" : item.maxStack ? String(item.maxStack) : "Unlimited";

  const canUseCredit = card?.status === "ACTIVE";
  const minTier = item.requiresCardTier;
  const meetsTier = !minTier || (canUseCredit && cardTierMeets(card!.tier, minTier));

  const asset = resolveShopItemThumbnailAsset(item.key);
  const assetPath = asset?.filePath ?? null;
  const hasAsset = asset !== null;
  const safeName = asset?.attachmentName ?? null;
  const attachmentRef = safeName ? `attachment://${safeName}` : null;

  const headline = [
    `## ${item.name}`,
    `${Mascot.Emotes.Currency} **${formatAmount(item.price)}**`,
    minTier ? `-# ${Mascot.Emotes.Credit} **${formatCardTierName(minTier)} Card exclusive** · credit only` : null,
  ].filter(Boolean).join("\n");

  const container = new ContainerBuilder();

  // Header: use SectionBuilder with thumbnail if asset available, else plain TextDisplay
  if (hasAsset && attachmentRef && safeName) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headline))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(attachmentRef)
            .setDescription(item.name),
        ),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headline));
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(item.description),
    );

  if (isLoadedDice) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# Roll this relic with `!roll` once every 24 hours."),
    );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Type: ${typeLabel} • Usable: ${usableLabel} • Max stack: ${maxStackLabel}`,
      ),
    );

  const buyRow = new ActionRowBuilder<ButtonBuilder>();
  const buyCardBtn = new ButtonBuilder()
    .setCustomId(`shop_buy_card:${item.key}:${ownerId}`)
    .setLabel("Buy (Credit)")
    .setStyle(ButtonStyle.Primary)
    .setEmoji(Mascot.Emotes.Credit);

  if (minTier) {
    // Card-exclusive: no wallet button at all; credit only when the tier qualifies.
    buyRow.addComponents(buyCardBtn.setDisabled(!meetsTier));
    if (!meetsTier) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          canUseCredit
            ? `-# Your **${formatCardTierName(card!.tier)}** card doesn't qualify. Upgrade with \`!card upgrade\`.`
            : `-# Requires an active **${formatCardTierName(minTier)}** Fortuna Card or higher. Apply with \`!card\`.`,
        ),
      );
    }
  } else {
    const currencyEmoji = extractEmojiForAPI(Mascot.Emotes.Currency);
    const buyBtn = new ButtonBuilder()
      .setCustomId(`shop_buy:${item.key}:${ownerId}`)
      .setLabel(`Buy — ${formatAmount(item.price)}`)
      .setStyle(ButtonStyle.Success);
    if (currencyEmoji) buyBtn.setEmoji(currencyEmoji);
    buyRow.addComponents(buyBtn);

    if (!item.creditBlocked && canUseCredit) {
      buyRow.addComponents(buyCardBtn);
    } else if (!item.creditBlocked && !canUseCredit) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("-# Credit purchases require an **ACTIVE** Fortuna Card — use `!mycards` or `!bank` → Apply."),
      );
    }
  }

  const files: AttachmentBuilder[] = [];
  if (hasAsset && assetPath && safeName) {
    files.push(new AttachmentBuilder(assetPath, { name: safeName }));
  }

  return {
    components: [container, buyRow],
    files,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  } as any;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run test/shop/item-info-card.test.ts`
Expected: 6 passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/shop.ts test/shop/item-info-card.test.ts
git commit -m "feat(shop): show the card-exclusive tier and credit-only buttons on the item card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 9: "Unlocks" line on the card screens, and the Part 2 docs

**Files:**
- Modify: `src/commands/economy/bank.ts` (imports; `addCardTierSections` ~line 360; apply-view loop ~line 434)
- Modify: `dashboard/src/content/modules/items-and-shop.ts:11`, `:54-55`, `:59`, `:121`
- Modify: `dashboard/src/content/modules/bank-and-credit.ts:62-66` (tiers body), `:96-101` (strategy body)

**Interfaces:**
- Consumes: `getCardExclusiveItems` (Task 6), `CardTierName`.
- Produces: `formatTierUnlocks(tier: CardTierName): string | null` (private to `bank.ts`).

No new automated test: `getCardExclusiveItems` is covered in Task 6 and the line is a one-liner; `npm run typecheck` plus the manual smoke check below cover it.

- [ ] **Step 1: Add the helper and use it on both tier screens**

In `src/commands/economy/bank.ts`:

1. Add `CardTierName` to the `economyConfig` import and add a `shopCatalog` import after it:

```ts
import {
    BANKING_CONFIG,
    CARD_TIER_ORDER,
    CardTierConfig,
    CardTierName,
    formatCardTierName,
    getCardTierConfig,
} from "../../utils/economyConfig";
import { getCardExclusiveItems } from "../../utils/shopCatalog";
```

2. Directly above `function addCardTierSections(` add:

```ts
// The card-exclusive items are what make a tier worth applying for, so every
// tier screen says what it unlocks.
function formatTierUnlocks(tier: CardTierName): string | null {
    const items = getCardExclusiveItems(tier);
    if (items.length === 0) return null;
    return `Unlocks: ${items.map((item) => `**${item.name}**`).join(", ")}`;
}
```

3. In `addCardTierSections`, replace the `new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent([ … ].join("\n")))` construction with:

```ts
        const lines = [
            `### ${formatCardTierName(tier.tier)} Card`,
            `Credit score required: **${tier.reqScore}**`,
            `Required career tier: **${tier.reqCareerTier}**`,
            `Credit limit: **${fmtCurrency(tier.creditLimit)}**`,
            `Weekly interest: **${tier.weeklyInterestPct}%**`,
            `Minimum due: **${formatMinimumDueRule(tier)}**`,
            `Weekly spend cap: **${fmtCurrency(tier.weeklySpendCap)}**`,
            `Weekly withdraw cap: **${fmtCurrency(tier.weeklyWithdrawCap)}**`,
            `Status: **${formatTierEligibility(tier, summary)}**`,
        ];
        const unlocks = formatTierUnlocks(tierName);
        if (unlocks) lines.push(unlocks);

        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(lines.join("\n")),
        );
```

4. In the `view === "apply"` loop of `buildBankCardsPayload`, replace the `new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent([ … ].join("\n")))` construction with:

```ts
            const lines = [
                `### ${formatCardTierName(row.tier.tier)} Card`,
                `Status: **${status}**${missing}`,
                `Credit score required: **${row.tier.reqScore}**`,
                `Required career tier: **${row.tier.reqCareerTier}**`,
                `Credit limit: **${fmtCurrency(row.tier.creditLimit)}**`,
            ];
            const unlocks = formatTierUnlocks(row.tier.tier);
            if (unlocks) lines.push(unlocks);

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(lines.join("\n")),
            );
```

- [ ] **Step 2: Update the items docs**

In `dashboard/src/content/modules/items-and-shop.ts`:

1. Replace the `tip:` string (line 11) with:

```ts
    tip: "!shop buy card <item> charges your Fortuna Card instead of your wallet — but Mystery Box, Treasure Map, Pandora Box, Loaded Dice of Ruin, and Devil Contract are cash-only by design. Eight items go the other way: card-exclusive and credit-only. Celestial Harp and Demonic Harp need a STARTER card, Crown of Greed and Royal Cape a GOLD, Platinum Crown and Void Wings a PLATINUM, Celestial Halo and Emperor's Throne a BLACK.",
```

2. In the "General store — power items" table, change these three rows:

```ts
          ["Celestial Harp", "450,000", "STARTER Card exclusive, credit only. +25 Luck for 6 hours"],
          ["Demonic Harp", "600,000", "STARTER Card exclusive, credit only. Target: −25 Luck for 6h + easier to rob (+5% success, +5% loot against them)"],
```

```ts
          ["Crown of Greed", "1,000,000", "GOLD Card exclusive, credit only. For 1 hour: all income +25% AND all losses +25% (win profits up, losing stakes up)"],
```

3. Replace the COSMETICS paragraph (line 121) with:

```ts
        "COSMETICS is 18 tiers of pure flex, from the Velvet Name Tag at 50,000 to the Reality Crown at 1,000,000,000. They do nothing mechanical — but they set your Flex Rank on !profile, and several add profile luck: Fortuna Bracelet +5, Platinum Crown +8, Celestial Halo +10, Fortune Dragon Cloak +12, Crown of Immortals +15, Fortuna's Signature +20, Reality Crown +25. Five of them are card-exclusive and can only be charged to a Fortuna Card of the right tier: Royal Cape (GOLD), Platinum Crown and Void Wings (PLATINUM), Celestial Halo and Emperor's Throne (BLACK).",
```

- [ ] **Step 3: Update the bank docs**

In `dashboard/src/content/modules/bank-and-credit.ts`:

1. In "The Fortuna Card: tiers" `body` array, append a third string after the `!card issue` paragraph:

```ts
        "Each tier also unlocks card-exclusive shop items that can only be bought on credit with that tier or higher — STARTER: Celestial Harp, Demonic Harp · GOLD: Crown of Greed, Royal Cape · PLATINUM: Platinum Crown, Void Wings · BLACK: Celestial Halo, Emperor's Throne. The weekly spend cap paces them: a BLACK card can charge Emperor's Throne (25,000,000) exactly once a week, and a STARTER card can never charge Royal Cape at all.",
```

2. In "Getting better with the bank" `body` array, append a fifth string:

```ts
        "Exclusives are the reason to climb. Holding a card isn't enough — the card-exclusive items must be charged to it, and the tier's weekly spend cap is the throttle. A GOLD card buys Royal Cape in one charge; pay it off Monday and the +30 score moves you toward PLATINUM and its Void Wings.",
```

- [ ] **Step 4: Typecheck both projects**

Run: `npm run typecheck`
Expected: exits 0.

Run (from the dashboard): `cd dashboard && npx tsc --noEmit`
Expected: exits 0. (The content files are plain typed data; a missing comma or quote shows up here.)

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/bank.ts dashboard/src/content/modules/items-and-shop.ts dashboard/src/content/modules/bank-and-credit.ts
git commit -m "feat(cards): list what each tier unlocks, and document card-exclusive items

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LekYjKxykkLrsqKL5VTzU8"
```

---

### Task 10: Full test run and manual smoke check

**Files:** none modified.

- [ ] **Step 1: Run every test file touched or adjacent**

Run: `npx vitest run test/bank test/reminders test/shop test/zoo/feed-purchase.test.ts`
Expected: all passed.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 2: Push the schema to the dev database**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." No data migration is needed; the three fields are optional.

- [ ] **Step 3: Manual smoke check against the dev bot**

With the dev token in a test guild:

1. `!bank fd 365000 1` from a bank balance, then in Mongo set that investment's `maturityDate` to a minute ago. Within a minute the cron matures it: expect a DM listing `FD — 365,000 locked for 1 day → paid 365,100 (+100 interest)` and the bank balance up by 365,100.
2. `!bank invest`: expect `Lifetime interest earned: 100` in the header and one line under `Recent returns`.
3. `!settings`: expect an `Investment payouts: ON` button on the second row; toggle it off, repeat step 1, expect no DM.
4. `!shop`, open Celestial Harp: with no card expect a `Starter Card exclusive · credit only` line, no wallet Buy button, a disabled Buy (Credit), and the apply hint. `!shop buy celestial harp` expect the card-exclusive refusal.
5. `!card issue` (Starter), reopen Celestial Harp: Buy (Credit) enabled; buy it; `!mycards` shows the purchase. Open Royal Cape: disabled with the "doesn't qualify" hint.
6. `!bank cards`: every tier section ends with an `Unlocks:` line.

- [ ] **Step 4: Record the outcome**

If any smoke step fails, fix it in the task that owns that file, re-run that task's tests, and commit with a `fix(...)` message before continuing.
