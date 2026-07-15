# Anti-Cheat Phase 1 — Prevention Core (Atomic Claims & Race Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven money-duplication races in the faucets by routing every time/state-gated payout through a shared atomic claim primitive, so spamming a button/command can never produce more than one payout.

**Architecture:** Introduce `src/anticheat/claim.ts` with two primitives — `cooldownClaim` (Redis `SET NX EX`, for reserving a lock before an action) and `conditionalClaim` (a compare-and-swap over a Mongo `updateMany` that succeeds only when it changes exactly one row). Each faucet is migrated to **reserve the claim, then credit** — never credit then mark. Introduce Vitest with a hybrid strategy: pure logic gets fast unit tests; the race guarantees are proven by integration tests that fire concurrent calls against a live Redis + Mongo.

**Tech Stack:** TypeScript (CommonJS), Prisma + MongoDB (replica set), ioredis, Vitest.

## Global Constraints

- User identity is `discordId` only. Never use `discordId_guildId` or `User.id`. (`where: { discordId }`.)
- **Reserve-then-credit:** every faucet must reserve its claim before crediting; a failed claim credits nothing.
- Credit through the existing `addBalance(discordId, username, amount, type, meta, earned)` from `src/services/walletService.ts` where a faucet currently uses a raw `wallet.update({ increment })`, so balance caps, garnishment, and transaction logging apply uniformly. Do not change `addBalance`'s signature.
- **The DB conditional-claim (`conditionalClaim`) is the authoritative durable guard**; Redis (`cooldownClaim`) is a burst-guard only. `cooldownClaim` fails **open** on Redis error (matches existing `cooldownService`); `conditionalClaim` never falls back to a non-atomic path.
- Preserve every existing tester/dev bypass exactly as it is today (`isTester(discordId)` / `isTester(id, member)` from `src/utils/developerAccess.ts`). Testers keep bypassing cooldowns.
- All work happens on the local `anticheat-system` branch. **Local commits only — never push.**
- `npm run typecheck` must pass at the end of every task (the repo has no other build gate for source correctness).
- Vitest integration tests require `TEST_REDIS_URL` and `TEST_DATABASE_URL` (a **separate database name** on a Mongo **replica set** — `addBalance` uses `$transaction`, which Mongo only allows on a replica set). Never point these at production data.

---

### Task 1: Vitest test harness & integration fixtures

**Files:**
- Modify: `package.json` (add devDeps + scripts)
- Create: `vitest.config.ts`
- Create: `test/setupEnv.ts`
- Create: `test/helpers.ts`
- Create: `.env.test.example`
- Create: `test/smoke.test.ts` (throwaway proof the runner works; deleted in Step 8)

**Interfaces:**
- Produces:
  - `testRedis(): Redis` — an ioredis client bound to `TEST_REDIS_URL`.
  - `testPrisma: PrismaClient` — a Prisma client bound to `TEST_DATABASE_URL`.
  - `seedUser(discordId: string, overrides?: Partial<Prisma.UserCreateInput>): Promise<User>` — upserts a `User` with a wallet (balance default `0`), applying overrides.
  - `resetUser(discordId: string): Promise<void>` — deletes the user + wallet + dependent rows used by these tests.
  - `flushTestKeys(pattern: string): Promise<void>` — deletes matching Redis keys.

- [ ] **Step 1: Add Vitest and test scripts**

Edit `package.json` — add to `devDependencies`:

```json
"vitest": "^2.1.9"
```

(`dotenv` is already under `dependencies` (`^17.2.3`) — do NOT add it again anywhere.)

Add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:integration": "vitest run --dir test"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: completes without error; `node_modules/vitest` exists.

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setupEnv.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Integration tests mutate shared Redis/Mongo — run serially to avoid cross-test interference.
    fileParallelism: false,
  },
});
```

- [ ] **Step 4: Write `test/setupEnv.ts`**

```ts
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.test if present, else fall back to .env. Integration tests REQUIRE
// TEST_REDIS_URL and TEST_DATABASE_URL to be set (see .env.test.example).
config({ path: resolve(process.cwd(), ".env.test") });

if (!process.env.TEST_REDIS_URL || !process.env.TEST_DATABASE_URL) {
  throw new Error(
    "Integration tests require TEST_REDIS_URL and TEST_DATABASE_URL. Copy .env.test.example to .env.test and fill them in (use a throwaway DB name)."
  );
}

// Point Prisma and the app's redisService at the test instances for the whole
// process, so every test file (and the app code it imports) uses them.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL;
```

(With `REDIS_URL` set here, the `process.env.REDIS_URL = process.env.TEST_REDIS_URL` line at the top of the Redis-touching test files is redundant but harmless — keep or drop it.)

- [ ] **Step 5: Write `.env.test.example`**

```bash
# Copy to .env.test and fill in. Use a SEPARATE database name from production.
TEST_REDIS_URL=redis://127.0.0.1:6379/15
# Must be a Mongo replica set (addBalance uses transactions). Use a throwaway DB name.
TEST_DATABASE_URL=mongodb://127.0.0.1:27017/fortuna_test?replicaSet=rs0
```

- [ ] **Step 6: Write `test/helpers.ts`**

```ts
import Redis from "ioredis";
import { PrismaClient, Prisma, User } from "@prisma/client";

let _redis: Redis | null = null;
export function testRedis(): Redis {
  if (!_redis) _redis = new Redis(process.env.TEST_REDIS_URL!);
  return _redis;
}

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL! } },
});

export async function seedUser(
  discordId: string,
  overrides: Partial<Prisma.UserCreateInput> = {}
): Promise<User> {
  await resetUser(discordId);
  return testPrisma.user.create({
    data: {
      discordId,
      username: "TestUser",
      wallet: { create: { balance: 0 } },
      ...overrides,
    },
  });
}

export async function resetUser(discordId: string): Promise<void> {
  await testPrisma.userEducation.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.dailyQuest.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.caughtAnimal.deleteMany({ where: { discordId } }).catch(() => {});
  await testPrisma.ownedProperty.deleteMany({ where: { userId: discordId } }).catch(() => {});
  const wallet = await testPrisma.wallet.findUnique({ where: { userId: discordId } }).catch(() => null);
  if (wallet) await testPrisma.transaction.deleteMany({ where: { walletId: wallet.id } }).catch(() => {});
  await testPrisma.wallet.deleteMany({ where: { userId: discordId } }).catch(() => {});
  await testPrisma.user.deleteMany({ where: { discordId } }).catch(() => {});
}

export async function flushTestKeys(pattern: string): Promise<void> {
  const redis = testRedis();
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}
```

- [ ] **Step 7: Write `test/smoke.test.ts` and run it**

```ts
import { describe, it, expect } from "vitest";
import { testRedis } from "./helpers";

describe("harness smoke", () => {
  it("can round-trip a redis key", async () => {
    const redis = testRedis();
    await redis.set("smoke:1", "ok", "EX", 5);
    expect(await redis.get("smoke:1")).toBe("ok");
    await redis.del("smoke:1");
  });
});
```

Run: `npm run test:integration -- test/smoke.test.ts`
Expected: 1 passed. (If it errors on missing env, create `.env.test` from the example first.)

- [ ] **Step 8: Delete the smoke test and commit**

```bash
rm test/smoke.test.ts
git add package.json package-lock.json vitest.config.ts test/setupEnv.ts test/helpers.ts .env.test.example
git commit -m "test: add Vitest harness and integration fixtures for anti-cheat"
```

---

### Task 2: The `atomicClaim` primitive

**Files:**
- Create: `src/anticheat/claim.ts`
- Test: `test/anticheat/claim.test.ts`

**Interfaces:**
- Consumes: `redisService` from `src/services/redisService.ts`.
- Produces:
  - `type CooldownClaim = { ok: boolean; retryAtUnix?: number; release: () => Promise<void> }`
  - `cooldownClaim(scope: string, discordId: string, ttlSeconds: number): Promise<CooldownClaim>` — key `ac_claim:{scope}:{discordId}`. `ok:true` + working `release()` when the key was free; `ok:false` + `retryAtUnix` when already held. Fails open (`ok:true`, no-op release) on Redis error.
  - `conditionalClaim(run: () => Promise<{ count: number }>): Promise<boolean>` — returns `true` iff `run()` resolved `{ count: 1 }`. Any other count (0 or >1) returns `false`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cooldownClaim, conditionalClaim } from "../../src/anticheat/claim";
import { testRedis, flushTestKeys } from "../helpers";

// Point the app's redisService at the test instance for this suite.
process.env.REDIS_URL = process.env.TEST_REDIS_URL;

describe("cooldownClaim", () => {
  beforeEach(() => flushTestKeys("ac_claim:*"));
  afterAll(() => testRedis().quit());

  it("grants the claim when the key is free", async () => {
    const c = await cooldownClaim("unit", "userA", 60);
    expect(c.ok).toBe(true);
  });

  it("rejects a second concurrent claim for the same scope+user", async () => {
    const [a, b] = await Promise.all([
      cooldownClaim("unit", "userB", 60),
      cooldownClaim("unit", "userB", 60),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const loser = a.ok ? b : a;
    expect(loser.retryAtUnix).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("release() frees the key for the next claim", async () => {
    const first = await cooldownClaim("unit", "userC", 60);
    expect(first.ok).toBe(true);
    await first.release();
    const second = await cooldownClaim("unit", "userC", 60);
    expect(second.ok).toBe(true);
  });
});

describe("conditionalClaim", () => {
  it("returns true only when exactly one row changed", async () => {
    expect(await conditionalClaim(async () => ({ count: 1 }))).toBe(true);
    expect(await conditionalClaim(async () => ({ count: 0 }))).toBe(false);
    expect(await conditionalClaim(async () => ({ count: 2 }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- test/anticheat/claim.test.ts`
Expected: FAIL — cannot resolve `../../src/anticheat/claim`.

- [ ] **Step 3: Write the implementation**

```ts
// src/anticheat/claim.ts
import { redisService } from "../services/redisService";

export type CooldownClaim = {
  ok: boolean;
  retryAtUnix?: number;
  release: () => Promise<void>;
};

const NOOP_RELEASE = async () => {};

/**
 * Atomically reserve a lock BEFORE running an action (Redis SET NX EX).
 * ok:true + a working release() when the key was free; ok:false + retryAtUnix
 * when it is already held. Fails OPEN on Redis error (ok:true, no-op release) to
 * match existing cooldown behavior — callers that must never double-run rely on
 * conditionalClaim as the durable guard, not this.
 */
export async function cooldownClaim(
  scope: string,
  discordId: string,
  ttlSeconds: number
): Promise<CooldownClaim> {
  const key = `ac_claim:${scope}:${discordId}`;
  try {
    const redis = redisService.getInstance();
    const res = await redis.set(key, "1", "EX", ttlSeconds, "NX");
    if (res === "OK") {
      return { ok: true, release: async () => { await redisService.del(key); } };
    }
    const ttl = await redis.ttl(key);
    return {
      ok: false,
      retryAtUnix: Math.floor((Date.now() + Math.max(ttl, 0) * 1000) / 1000),
      release: NOOP_RELEASE,
    };
  } catch (err) {
    console.error(`anticheat.cooldownClaim error for ${key}`, err);
    return { ok: true, release: NOOP_RELEASE }; // fail open
  }
}

/**
 * Runs an atomic Mongo conditional update (updateMany with a guard predicate)
 * and returns true iff THIS caller changed exactly one row — i.e. it won the
 * compare-and-swap. Concurrent losers see count 0. This is the authoritative
 * durable guard for state/timestamp faucets.
 */
export async function conditionalClaim(
  run: () => Promise<{ count: number }>
): Promise<boolean> {
  const { count } = await run();
  return count === 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- test/anticheat/claim.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/anticheat/claim.ts test/anticheat/claim.test.ts
git commit -m "feat(anticheat): add atomicClaim primitive (cooldownClaim + conditionalClaim)"
```

---

### Task 3: Fix the vote double-claim race

**Files:**
- Modify: `src/commands/economy/vote.ts:83-104`
- Test: `test/anticheat/vote.race.test.ts`

**Interfaces:**
- Consumes: `conditionalClaim` (Task 2); `addBalance` from `src/services/walletService.ts`.
- Produces: no new exports; `handleVote` credits at most once per `lastVote` window.

**Bug today:** `vote.ts:85-93` increments the wallet, then separately writes `lastVote`, then writes a transaction — three non-atomic awaits. Concurrent `!vote` calls all read the same stale `lastVote`, all pass the 12h check, all credit +100k.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

// Mirrors the exact CAS the vote fix uses, proven against the real DB.
async function claimVoteWindow(discordId: string, prior: Date | null, now: Date) {
  return conditionalClaim(() =>
    testPrisma.user.updateMany({
      where: { discordId, lastVote: prior },
      data: { lastVote: now },
    })
  );
}

describe("vote window CAS", () => {
  const id = "vote-race-1";
  beforeEach(() => seedUser(id, { lastVote: null }));
  afterAll(() => resetUser(id));

  it("only one of two concurrent claims wins", async () => {
    const now = new Date();
    const [a, b] = await Promise.all([
      claimVoteWindow(id, null, now),
      claimVoteWindow(id, null, now),
    ]);
    expect([a, b].filter(Boolean).length).toBe(1);
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    expect(user?.lastVote?.getTime()).toBe(now.getTime());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- test/anticheat/vote.race.test.ts`
Expected: FAIL — `../../src/anticheat/claim` import resolves (Task 2 done), but if run before Task 2 it fails there. With Task 2 present it should actually PASS at the CAS level — that is expected; this test locks the CAS contract. Proceed to wire it into `handleVote`.

- [ ] **Step 3: Apply the fix in `vote.ts`**

Replace the `if (hasVoted) { ... }` credit block (currently `vote.ts:83-104`) with:

```ts
    if (hasVoted) {
        // Reserve the vote window atomically BEFORE crediting. Concurrent !vote
        // calls all read the same stale lastVote; only one CAS can flip it.
        const { conditionalClaim } = require("../../anticheat/claim");
        const claimed = await conditionalClaim(() =>
            prisma.user.updateMany({
                where: { discordId: user.discordId, lastVote: user.lastVote ?? null },
                data: { lastVote: now },
            })
        );

        if (!claimed) {
            const readyAt = new Date(now.getTime() + cooldown);
            return message.reply(v2Reply(
                errorContainer("Already Claimed", `You already claimed this vote reward. Come back <t:${Math.floor(readyAt.getTime() / 1000)}:R>.`)
            ));
        }

        void enqueueReminder(user.discordId, "vote", new Date(now.getTime() + cooldown));

        // Credit through addBalance so caps + logging + garnishment apply uniformly.
        const { addBalance } = require("../../services/walletService");
        await addBalance(user.discordId, message.author.username, voteReward, "vote_reward", { source: "top.gg" }, true);

        const container = successContainer(
            `${Mascot.Emotes.Success} Vote Verified!`,
            `Thank you for voting for **Fortuna**!\n\nYou have received **${voteReward.toLocaleString()} ${GLOBAL_CURRENCY_EMOJI}**.`,
            { hint: nextStepHint("vote") }
        );

        return message.reply(v2Reply(container));

    } else {
```

(Use a top-of-file `import { conditionalClaim } from "../../anticheat/claim";` and `import { addBalance } from "../../services/walletService";` instead of the inline `require`s if you prefer — either is fine; the file already mixes styles. Ensure the import path is `../../anticheat/claim` from `src/commands/economy/`.)

- [ ] **Step 4: Run the race test and typecheck**

Run: `npm run test:integration -- test/anticheat/vote.race.test.ts`
Expected: PASS (1 passed).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/vote.ts test/anticheat/vote.race.test.ts
git commit -m "fix(anticheat): close vote double-claim race with window CAS"
```

---

### Task 4: Fix the daily-quest reward double-claim race

**Files:**
- Modify: `src/services/questService.ts:225-255`
- Test: `test/anticheat/quest.race.test.ts`

**Interfaces:**
- Consumes: `conditionalClaim` (Task 2); `addBalance`.
- Produces: `claimQuestReward` credits at most once per quest.

**Bug today:** `questService.ts:226-250` reads the quest with `rewardClaimed:false`, then updates streak, then flips `rewardClaimed:true` — non-conditional. Concurrent claims both read `false` and both credit.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("quest reward CAS", () => {
  const id = "quest-race-1";
  let questId: string;
  beforeEach(async () => {
    await seedUser(id);
    const q = await testPrisma.dailyQuest.create({
      data: {
        userId: id, dayKey: "2026-07-14",
        tasks: [{ key: "x", reward: 30000, completed: true, difficulty: "EASY" }],
        completed: true, rewardClaimed: false,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    questId = q.id;
  });
  afterAll(() => resetUser(id));

  it("only one concurrent claim flips rewardClaimed", async () => {
    const claim = () => conditionalClaim(() =>
      testPrisma.dailyQuest.updateMany({
        where: { id: questId, rewardClaimed: false },
        data: { rewardClaimed: true, totalReward: 30000, streakBonus: 0 },
      }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails/passes at CAS level**

Run: `npm run test:integration -- test/anticheat/quest.race.test.ts`
Expected: PASS at the CAS level (locks the contract). Now wire it into the service.

- [ ] **Step 3: Apply the fix in `questService.ts`**

Replace lines `225-255` (the body of `claimQuestReward`) with:

```ts
export async function claimQuestReward(discordId: string): Promise<{ totalReward: number; streakBonus: number; newStreak: number }> {
  const quest = await prisma.dailyQuest.findFirst({
    where: { userId: discordId, completed: true, rewardClaimed: false },
    orderBy: { createdAt: "desc" },
  });

  if (!quest) throw new Error("No completed quest to claim.");

  const tasks = quest.tasks as unknown as QuestTask[];
  const baseReward = tasks.reduce((sum, t) => sum + t.reward, 0);

  const user = await prisma.user.findUnique({ where: { discordId } });
  const newStreak = (user?.questStreak ?? 0) + 1;
  const bonusPct = getStreakBonus(newStreak);
  const streakBonus = Math.floor(baseReward * bonusPct);
  const totalReward = baseReward + streakBonus;

  // Reserve the reward atomically BEFORE crediting: only the CAS that flips
  // rewardClaimed false->true may credit. Concurrent claims see count 0.
  const { conditionalClaim } = require("../anticheat/claim");
  const claimed = await conditionalClaim(() =>
    prisma.dailyQuest.updateMany({
      where: { id: quest.id, rewardClaimed: false },
      data: { rewardClaimed: true, totalReward, streakBonus },
    })
  );
  if (!claimed) throw new Error("Reward already claimed.");

  await prisma.user.update({
    where: { discordId },
    data: { questStreak: newStreak, lastQuestComplete: new Date() },
  });

  await addBalance(discordId, user?.username ?? "Unknown", totalReward, "quest_reward", { streak: newStreak, bonus: streakBonus }, true);

  return { totalReward, streakBonus, newStreak };
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:integration -- test/anticheat/quest.race.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/questService.ts test/anticheat/quest.race.test.ts
git commit -m "fix(anticheat): close daily-quest reward double-claim race with CAS"
```

---

### Task 5: Fix the scholarship double-claim race

**Files:**
- Modify: `src/services/educationService.ts:450-483`
- Test: `test/anticheat/scholarship.race.test.ts`

**Interfaces:**
- Consumes: `conditionalClaim` (Task 2); `addBalance`.
- Produces: `claimScholarship` credits each milestone at most once.

**Bug today:** `educationService.ts:462` checks `scholarshipsClaimed.includes(milestone)` OUTSIDE the transaction, then the `$transaction` at `469-478` pushes unconditionally. Concurrent claims both pass the check and both push + credit.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("scholarship CAS", () => {
  const id = "scholar-race-1";
  let eduId: string;
  let degreeId: string;
  beforeEach(async () => {
    await seedUser(id);
    const deg = await testPrisma.degree.create({
      data: { guildId: "global", name: "TestDeg", type: "BACHELORS", tuitionPerSem: 1000, xpRequired: 600 },
    });
    degreeId = deg.id;
    const edu = await testPrisma.userEducation.create({
      data: { userId: id, degreeId: deg.id, educationXp: 600, currentSemester: 1, scholarshipsClaimed: [] },
    });
    eduId = edu.id;
  });
  afterAll(async () => {
    await resetUser(id);
    await testPrisma.degree.deleteMany({ where: { id: degreeId } }).catch(() => {});
  });

  it("only one concurrent claim pushes the milestone", async () => {
    const claim = () => conditionalClaim(() =>
      testPrisma.userEducation.updateMany({
        where: { id: eduId, NOT: { scholarshipsClaimed: { has: 100 } } },
        data: { scholarshipsClaimed: { push: 100 } },
      }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
    const edu = await testPrisma.userEducation.findUnique({ where: { id: eduId } });
    expect(edu?.scholarshipsClaimed).toEqual([100]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes at CAS level**

Run: `npm run test:integration -- test/anticheat/scholarship.race.test.ts`
Expected: PASS (locks the CAS contract).

- [ ] **Step 3: Apply the fix in `educationService.ts`**

Replace lines `459-482` (from `const pct = ...` through `return amount;`) with:

```ts
    const pct = edu.educationXp / edu.degree.xpRequired;
    const requiredPct = milestone / 100;
    if (pct < requiredPct) throw new Error("XP requirement not met.");
    if (edu.scholarshipsClaimed.includes(milestone)) throw new Error("Scholarship already claimed.");

    let multiplier = 1.5;
    if (milestone === 100) multiplier = 2;

    const amount = edu.degree.tuitionPerSem * edu.currentSemester * multiplier;

    // Reserve the milestone atomically BEFORE crediting. The CAS pushes the
    // milestone only if it is still absent; concurrent claims see count 0.
    const { conditionalClaim } = require("../anticheat/claim");
    const claimed = await conditionalClaim(() =>
        prisma.userEducation.updateMany({
            where: { id: edu.id, NOT: { scholarshipsClaimed: { has: milestone } } },
            data: { scholarshipsClaimed: { push: milestone } },
        })
    );
    if (!claimed) throw new Error("Scholarship already claimed.");

    await addBalance(userId, user.username, amount, "scholarship", { milestone }, true);

    await invalidateUserCache(userId, guildId);

    return amount;
```

(Confirm `addBalance` is imported in `educationService.ts`; if not, add `import { addBalance } from "./walletService";` at the top. The old `$transaction` wallet increment is replaced by `addBalance`.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:integration -- test/anticheat/scholarship.race.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/educationService.ts test/anticheat/scholarship.race.test.ts
git commit -m "fix(anticheat): close scholarship double-claim race with milestone CAS"
```

---

### Task 6: Fix the zoo-income double-claim race

**Files:**
- Modify: `src/services/huntService.ts:471-507`
- Test: `test/anticheat/zoo.race.test.ts`

**Interfaces:**
- Consumes: `conditionalClaim` (Task 2); `addBalance`.
- Produces: `claimZooIncome` credits at most once per `lastZooClaim` window.

**Bug today:** `huntService.ts:500-504` credits via `addBalance`, THEN writes `lastZooClaim` in a separate await. Concurrent claims all read the same `lastZooClaim` and all credit.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("zoo claim CAS", () => {
  const id = "zoo-race-1";
  beforeEach(() => seedUser(id, { lastZooClaim: new Date(Date.now() - 5 * 3_600_000) }));
  afterAll(() => resetUser(id));

  it("only one concurrent claim advances lastZooClaim", async () => {
    const user = await testPrisma.user.findUnique({ where: { discordId: id } });
    const prior = user!.lastZooClaim;
    const now = new Date();
    const claim = () => conditionalClaim(() =>
      testPrisma.user.updateMany({ where: { discordId: id, lastZooClaim: prior }, data: { lastZooClaim: now } }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes at CAS level**

Run: `npm run test:integration -- test/anticheat/zoo.race.test.ts`
Expected: PASS.

- [ ] **Step 3: Apply the fix in `huntService.ts`**

Replace lines `498-506` (from `const zooBoost = ...` through `return { claimed: totalIncome, hoursSinceLastClaim: cappedHours };`) with:

```ts
  const zooBoost = await getCraftEffect(discordId, `crafted_zoo_boost:${discordId}`, "zoo_boost", (v) => ({ multiplier: v }));
  const totalIncome = Math.floor(ratePerHour * cappedHours * (zooBoost?.multiplier ?? 1));

  // Reserve the claim window atomically BEFORE crediting. Advancing lastZooClaim
  // from the exact value we read is the CAS; concurrent claims lose (count 0).
  const { conditionalClaim } = require("../anticheat/claim");
  const claimed = await conditionalClaim(() =>
    prisma.user.updateMany({
      where: { discordId, lastZooClaim: user?.lastZooClaim ?? null },
      data: { lastZooClaim: new Date() },
    })
  );
  if (!claimed) {
    const err = new Error("Already collecting — try again in a moment.");
    (err as any).code = "TOO_SOON";
    throw err;
  }

  await addBalance(discordId, username, totalIncome, "zoo_income", {
    hours: cappedHours,
    slotCount: slots.length,
  });

  return { claimed: totalIncome, hoursSinceLastClaim: cappedHours };
```

Note: when `user?.lastZooClaim` is `null` (first claim, resolved from earliest `caughtAt`), the CAS matches `lastZooClaim: null`, which is correct — the first winning claim sets it to now and any concurrent claim sees a non-null value and loses.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:integration -- test/anticheat/zoo.race.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/huntService.ts test/anticheat/zoo.race.test.ts
git commit -m "fix(anticheat): close zoo-income double-claim race with window CAS"
```

---

### Task 7: Fix the property-collect double-claim race

**Files:**
- Modify: `src/services/propertyService.ts:285-319`
- Test: `test/anticheat/property.race.test.ts`

**Interfaces:**
- Consumes: `conditionalClaim` (Task 2).
- Produces: `collectIncome` counts each property's income and the zoo income at most once per cycle.

**Bug today:** `propertyService.ts:289` updates each `lastCollected` unconditionally inside the collect loop, and `316` writes `lastZooClaim` unconditionally. Concurrent collects read the same set and both credit. (Property also shares `lastZooClaim` with Task 6, so `!zoo` and `!collect-rent` race each other — the CAS closes that too.)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { conditionalClaim } from "../../src/anticheat/claim";
import { testPrisma, seedUser, resetUser } from "../helpers";

describe("property collect CAS", () => {
  const id = "prop-race-1";
  let opId: string;
  let propId: string;
  beforeEach(async () => {
    await seedUser(id);
    const prop = await testPrisma.property.create({
      data: { guildId: "global", key: "test_farm_race", name: "Farm", description: "d",
        basePrice: 1000, price: 1000, incomePerCycle: 50000, incomeCycleHours: 24 },
    });
    propId = prop.id;
    const op = await testPrisma.ownedProperty.create({
      data: { userId: id, propertyId: prop.id, purchasedPrice: 1000,
        lastCollected: new Date(Date.now() - 48 * 3_600_000) },
    });
    opId = op.id;
  });
  afterAll(async () => {
    await resetUser(id);
    await testPrisma.property.deleteMany({ where: { id: propId } }).catch(() => {});
  });

  it("only one concurrent collect advances lastCollected", async () => {
    const op = await testPrisma.ownedProperty.findUnique({ where: { id: opId } });
    const prior = op!.lastCollected;
    const now = new Date();
    const claim = () => conditionalClaim(() =>
      testPrisma.ownedProperty.updateMany({ where: { id: opId, lastCollected: prior }, data: { lastCollected: now } }));
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a, b].filter(Boolean).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes at CAS level**

Run: `npm run test:integration -- test/anticheat/property.race.test.ts`
Expected: PASS.

- [ ] **Step 3: Apply the fix in `propertyService.ts`**

Replace the property collect loop (lines `285-290`) with a conditional claim per property — only count income for the property whose `lastCollected` this call actually advanced:

```ts
  const { conditionalClaim } = require("../anticheat/claim");

  for (const op of collectable) {
    const claimed = await conditionalClaim(() =>
      prisma.ownedProperty.updateMany({
        where: { id: op.id, lastCollected: op.lastCollected },
        data: { lastCollected: now },
      })
    );
    if (!claimed) continue; // a concurrent collect already took this property's cycle
    const income = op.property.incomePerCycle;
    result.propertyBreakdown.push({ name: op.property.name, income });
    result.propertyTotal += income;
  }
```

Then replace the zoo credit guard (lines `315-317`) with a conditional claim on `lastZooClaim`:

```ts
      if (result.zooTotal > 0) {
        const zooClaimed = await conditionalClaim(() =>
          prisma.user.updateMany({
            where: { discordId, lastZooClaim: lastClaim },
            data: { lastZooClaim: now },
          })
        );
        if (!zooClaimed) {
          // A concurrent zoo/property collect already took this window — drop zoo income.
          result.zooTotal = 0;
          result.zooBreakdown = [];
        }
      }
```

(`lastClaim` is the value read at `propertyService.ts:293` — `user?.lastZooClaim ?? null`. The CAS matches it exactly, mirroring Task 6 so the two paths cannot both pay.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:integration -- test/anticheat/property.race.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/propertyService.ts test/anticheat/property.race.test.ts
git commit -m "fix(anticheat): close property + zoo collect double-claim race with CAS"
```

---

### Task 8: Fix the hunt double-yield race

**Files:**
- Modify: `src/services/huntService.ts:80-88` and `:187-190`
- Test: `test/anticheat/hunt.race.test.ts`

**Interfaces:**
- Consumes: `redisService`.
- Produces: `hunt` reserves the cooldown key with `SET NX` **before** creating loot; only one concurrent hunt yields animals.

**Bug today:** `huntService.ts:82-88` reads the cooldown TTL (read-only), loot is created at `164-178`, and the cooldown is set at `187-190` (plain `set`, not `NX`). Concurrent hunts all see `ttl <= 0` and all create full batches.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testRedis, flushTestKeys } from "../helpers";

process.env.REDIS_URL = process.env.TEST_REDIS_URL;

// Proves the SET NX reservation the hunt fix uses: only one concurrent caller
// can reserve hunt:<id>.
describe("hunt reservation", () => {
  const id = "hunt-race-1";
  beforeEach(() => flushTestKeys("hunt:*"));
  afterAll(() => testRedis().quit());

  it("only one of two concurrent reservations succeeds", async () => {
    const redis = testRedis();
    const key = `hunt:${id}`;
    const [a, b] = await Promise.all([
      redis.set(key, "1", "EX", 60, "NX"),
      redis.set(key, "1", "EX", 60, "NX"),
    ]);
    expect([a, b].filter((r) => r === "OK").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes at reservation level**

Run: `npm run test:integration -- test/anticheat/hunt.race.test.ts`
Expected: PASS.

- [ ] **Step 3: Apply the fix in `huntService.ts`**

Replace the read-only cooldown check (lines `80-88`):

```ts
  const tier = RIFLE_TIERS[rifleName];
  const huntKey = `hunt:${discordId}`;
  const redis = redisService.getInstance();

  // Reserve the cooldown atomically BEFORE rolling/creating loot. SET NX keeps the
  // existing hunt:<id> key so status displays that read its TTL keep working.
  if (!isTester(discordId)) {
    const reserved = await redis.set(huntKey, "1", "EX", tier.cooldownSeconds, "NX");
    if (reserved !== "OK") {
      const ttl = await redis.ttl(huntKey);
      const err = new Error("COOLDOWN");
      (err as any).ttl = Math.max(ttl, 0);
      throw err;
    }
    void enqueueReminder(discordId, "hunt", new Date(Date.now() + tier.cooldownSeconds * 1000));
  }
```

Then delete the now-duplicate cooldown set at the end (lines `187-190`):

```ts
  // DELETE these lines — the reservation is now taken up-front:
  // if (!isTester(discordId)) {
  //   await redis.set(huntKey, "1", "EX", tier.cooldownSeconds);
  //   void enqueueReminder(discordId, "hunt", new Date(Date.now() + tier.cooldownSeconds * 1000));
  // }
```

(The rifle check at `77` still throws `NO_RIFLE` before the reservation, so a rifle-less attempt never consumes the cooldown.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:integration -- test/anticheat/hunt.race.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/huntService.ts test/anticheat/hunt.race.test.ts
git commit -m "fix(anticheat): reserve hunt cooldown before loot creation (SET NX)"
```

---

### Task 9: Fix the work-shift parallel-farming race

**Files:**
- Modify: `src/handlers/lifeInteractionHandler.ts:731` (insert after the cooldown-check block)
- Test: `test/anticheat/workshift.lock.test.ts`

**Interfaces:**
- Consumes: `cooldownClaim` (Task 2).
- Produces: a second concurrent `work_shift` for the same user is rejected while a shift is in flight.

**Bug today:** `lifeInteractionHandler.ts:719-731` reads `userData.lastShift` and only writes it at settle (30–45s later, `:979`/`:1157`). Every concurrent "Start Shift" click reads the same stale `lastShift`, all pass, all play, all pay. **Fix:** acquire a short active-shift lock (`SET NX`, TTL 300s) the instant the cooldown check passes. The lock's TTL is far shorter than the 1h `lastShift` gate, so it auto-expires and never blocks a legit next shift; no release plumbing needed. An abandoned shift simply frees after 300s.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { cooldownClaim } from "../../src/anticheat/claim";
import { testRedis, flushTestKeys } from "../helpers";

process.env.REDIS_URL = process.env.TEST_REDIS_URL;

describe("work active-shift lock", () => {
  const id = "work-race-1";
  beforeEach(() => flushTestKeys("ac_claim:work_active:*"));
  afterAll(() => testRedis().quit());

  it("blocks a second concurrent shift for the same user", async () => {
    const [a, b] = await Promise.all([
      cooldownClaim("work_active", id, 300),
      cooldownClaim("work_active", id, 300),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
  });

  it("allows a different user to start a shift", async () => {
    const a = await cooldownClaim("work_active", "work-user-A", 300);
    const b = await cooldownClaim("work_active", "work-user-B", 300);
    expect(a.ok && b.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes at lock level**

Run: `npm run test:integration -- test/anticheat/workshift.lock.test.ts`
Expected: PASS.

- [ ] **Step 3: Apply the fix in `lifeInteractionHandler.ts`**

Immediately AFTER the cooldown-check block that ends at line `731` (the `if (now - lastShift < cooldownMs && !_isTesterWork(...)) { ... return ... }`), and BEFORE the `// --- STRESS CHECK ---` at line `733`, insert:

```ts
        // Active-shift lock: reserve atomically so spamming "Start Shift" cannot run
        // parallel shifts. TTL (300s) is far under the 1h lastShift gate, so it auto-
        // expires and never blocks a legitimate next shift. Testers bypass.
        const { cooldownClaim } = require("../anticheat/claim");
        if (!_isTesterWork(user.id, interaction.member)) {
            const shiftLock = await cooldownClaim("work_active", user.id, 300);
            if (!shiftLock.ok) {
                await interaction.deleteReply().catch(() => { });
                return safeFollowUp(interaction, { content: `${Mascot.Emotes.Angry} You're already on a shift — finish it first!`, flags: MessageFlags.Ephemeral });
            }
        }
```

(`_isTesterWork` is already defined at line `726`. No release call is needed — the lock is intentionally left to expire.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test:integration -- test/anticheat/workshift.lock.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual smoke check (documented, not automated)**

Because the full `work_shift` handler drives a Discord minigame, verify in a dev server after deploy: click "Start Shift" twice rapidly → the second click returns "You're already on a shift"; after finishing one shift, the normal 1h cooldown applies. Note this in the PR description.

- [ ] **Step 6: Commit**

```bash
git add src/handlers/lifeInteractionHandler.ts test/anticheat/workshift.lock.test.ts
git commit -m "fix(anticheat): block parallel work shifts with an active-shift lock"
```

---

### Task 10: Full-suite verification & plan wrap-up

**Files:**
- None (verification only)

- [ ] **Step 1: Run the whole anti-cheat suite**

Run: `npm run test:integration`
Expected: all tests in `test/anticheat/*` pass.

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Confirm the branch state**

Run: `git log --oneline -12` and `git branch --show-current`
Expected: on `anticheat-system`; commits for Tasks 1–9 present. **Do not push.**

---

## Notes for the implementer

- Every faucet fix follows the same shape: compute the payout amount from the values you READ, run the CAS/lock to reserve, and only credit if the reservation won. If you find yourself crediting before reserving, stop — that is the exact bug being fixed.
- `require("../anticheat/claim")` vs a top-of-file `import` — either works; match the surrounding file's dominant style. Paths: from `src/commands/economy/` use `../../anticheat/claim`; from `src/services/` and `src/handlers/` use `../anticheat/claim`.
- These tasks are independent after Task 2. If executing with subagents, Tasks 3–9 can each be dispatched against the completed Task 2 without ordering constraints between them.
- This plan is Phase 1's prevention half only. The unified-logging half (`ledger.recordMovement` + backfilling the silent marriage-vault / market / hunt-part paths) is a separate follow-up plan, as is Phase 2 (guard + restrictions + limits).
