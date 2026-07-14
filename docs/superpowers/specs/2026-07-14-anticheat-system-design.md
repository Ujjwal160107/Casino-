# Fortuna Anti-Cheat System — Design

**Date:** 2026-07-14
**Status:** Draft — pending review
**Scope:** New module `src/anticheat/`; instrumentation of existing money-movement
paths (`walletService.ts`, `transferService.ts`, `taxService.ts`, marriage/market/
hunt-part services); guard hooks in `commandRouter.ts` and `index.ts`; new Prisma
models; a new scheduler sweep. Reuses existing `Transaction`, `Audit`,
`User.isBanned/banExpiresAt`, jail, Redis-cooldown, and `logToChannel` primitives —
does not replace them. No economy data is wiped or migrated.

---

## 1. Problem

An audit of every faucet, every peer-to-peer value path, and the command lifecycle
found that the economy — while already defended by Redis `SET NX` cooldowns, casino
cooldowns, atomic buff-item cooldowns, transfer/market taxes, garnishment, balance
caps, and a crude crime-heat→IRS-raid anomaly response — has three classes of
unaddressed vulnerability.

### A. Money-duplication races (live exploits, highest severity)

Several faucets credit the payout and set the "already claimed" marker as **separate,
non-atomic** steps, so spamming the button/command runs N parallel claims that all
pass the same stale check.

| Faucet | File | Bug |
|---|---|---|
| **Work shift** | `handlers/lifeInteractionHandler.ts:623` | Reads stale `lastShift`; minigame keeps the race window open 30–45s; credits + writes `lastShift` only at the end. No reservation. Up to 450k × multipliers per parallel run. |
| **Vote** | `commands/economy/vote.ts` | Credits before writing `lastVote`, not in a transaction (100k each). |
| **Hunt** | `services/huntService.ts:52` | Cooldown set *after* loot creation, not `NX`. |
| **Zoo claim** | `services/huntService.ts:471` | Non-atomic `lastZooClaim` read-check-write. |
| **Property collect** | `services/propertyService.ts:250` | Non-atomic `lastCollected`; shares `lastZooClaim` with zoo — the two race each other. |
| **Scholarships** | `services/educationService.ts:450` | Milestone check outside the transaction; unconditional push (can be millions). |
| **Daily-quest reward** | `services/questService.ts:225` | Non-conditional `rewardClaimed` flip. |

Root cause is identical everywhere: **credit-then-mark** instead of **reserve-then-
credit**. Daily/weekly/monthly/beg/slut are already correct (they reserve via Redis
`NX` before paying) and serve as the reference pattern.

### B. Alt-funnel / RMT paths (how a farmed alt ships value to a main)

| Path | Tax | Cooldown | Cap | Attacker picks amount | Channel log | Audit row |
|---|---|---|---|---|---|---|
| **`ask`** | **0%** | none | none | **yes** | yes | **no** |
| **Marriage vault** | **0%** | none | none | **yes** | **no** | **no** |
| transfer / give | 5% (shield→0%) | none | none | **yes** | yes | yes |
| market items | 15% | none | 50M × 5 listings | **yes (price)** | **no** | **no** |
| hunt-part listings | 15% | none | 50M × 5 listings | **yes (price)** | **no** | **no** |
| rob | fail-fine only | 1h | %-based, capped | no | **no** | **no** |

- `ask` uses `walletService.transferMoney`, bypassing the 5% tax that the `transfer`
  command pays via `transferAnyFunds` — the cleanest funnel.
- Marriage vault (`services/life/marriageService.ts`) is a completely **unlogged**
  two-account pool: `depositToJoint` is instant/untaxed/one-sided; withdrawal needs
  spouse approval; divorce splits 50/50. Net 0% tax, no channel or `Audit` trail.
- The transfer tax-shield buff (`shopBuffs.checkTaxShield`) zeroes out the one path
  that does tax.

### C. Structural gaps that make detection & enforcement impossible today

- **No global guard.** Prefix commands pass through `commandRouter.routeMessage`
  (ban + jail checked at `commandRouter.ts:211,225`), but **button/select/modal
  interactions bypass all ban and jail checks** — `index.ts:109` dispatches straight
  to handlers.
- **Nothing can set a ban.** `User.isBanned/banExpiresAt` is enforced on the prefix
  path (with auto-expiry at `commandRouter.ts:184`) but **no code path anywhere sets
  it** — it can only be toggled by direct DB write. There is no inspect/freeze/ban
  dev tooling.
- **No alt/collusion detection.** Account age (derivable from the Discord snowflake),
  guild join timing (`GuildMembers` intent is on), and the transfer/market/marriage
  graph are all available but completely unread.
- **`isTester` role-name bypass** (`utils/developerAccess.ts:19`) — any role literally
  named "tester"/"testers" grants a full cooldown + shop-cost bypass in the global
  economy. **Left as-is per owner decision** (accepted risk); the anti-cheat engine
  must treat testers/dev as exempt so it never flags them.

---

## 2. Decisions (agreed during brainstorming)

- **Scope:** one cohesive architecture spec covering all four layers; implement in
  phases.
- **Philosophy:** balanced — hard prevention where structurally feasible, behavior
  detection for what can't be hard-blocked.
- **Detection target:** **behavior-based** — act on patterns (funneling, coordinated
  farming, dup abuse), not on attempts to prove two accounts are one person.
- **Enforcement:** graduated **auto-action plus a dev review queue** for override.
- **Friction:** moderate structural limits are acceptable (daily net-transfer cap,
  account-age gate, ask/vault cooldowns, closing the 0%-tax funnels).
- **Tester bypass:** unchanged (accepted risk).
- **Approach A** (layered in-process module reusing the `Transaction` ledger) with the
  cheap Redis real-time counters folded in for transfer-velocity and pairwise
  net-flow. Comprehensive logging is a first-class deliverable.

---

## 3. Architecture

One module, four cooperating layers, plugged into the two existing dispatch choke
points. No new infra — MongoDB + Redis + the existing `node-cron` scheduler.

```
src/anticheat/
  index.ts            — public barrel: guard(), recordMovement(), enforcement queries
  guard.ts            — the single pre-command gate (restriction + limit checks)
  claim.ts            — atomicClaim(): one claim-or-fail primitive every faucet uses
  limits.ts           — economic limits: daily net-transfer cap, account-age gate, cooldowns
  counters.ts         — Redis real-time counters: transfer velocity + pairwise net-flow
  ledger.ts           — recordMovement(): Transaction + Audit + channel log + counter bump
  restrictions.ts     — AccountRestriction state machine
  detection/
    engine.ts         — runAntiCheatSweep(client): scheduler-driven orchestration
    signals/
      velocity.ts · funnel.ts · faucetAbuse.ts · newAccountFunnel.ts
    score.ts          — combine signals → risk score + confidence → RiskFlag
  enforcement.ts      — risk → graduated auto-action + review-queue write
  review.ts           — dev review queue (list / resolve / override)
  config.ts           — every threshold/tunable, env-overridable
  logging.ts          — low-level channel-log helpers over logToChannel; the single
                        place that formats MODERATION/ECONOMY embeds. Called by
                        ledger.ts (money movement) and enforcement.ts/commands
                        (restriction actions) — one logging path, two callers.
  commands/           — dev tooling: inspect · flags · restrict · unrestrict · review
  types.ts
```

**Data flow:**

- **Write-path (Layer 0):** every faucet calls `atomicClaim()` before crediting;
  every money-movement path calls `ledger.recordMovement()`, which is also where
  `limits.ts` enforces caps/age gates and `counters.ts` bumps the real-time signals.
  Logging, limits, and real-time detection all ride one instrumented write path.
- **Read-path (Layer 1):** `guard()` runs at both choke points, loads the user's
  `AccountRestriction`, and short-circuits per state.
- **Detection (Layer 2):** an hourly sweep reads `Transaction` + `MoneyEdge` +
  counters, runs the behavior signals, scores them, and writes `RiskFlag` rows.
  Real-time counters let the guard react between sweeps.
- **Enforcement (Layer 3):** high-confidence flags → graduated auto-action + a
  reversible `ReviewItem`; lower confidence → queue only. Every action is logged.

---

## 4. Layer 0 — Prevention & Logging

### 4.1 `claim.ts` — the atomic claim primitive

Generalizes the pattern proven in `shopItemEffects.withBuffCooldown` and
`cooldownService.setCooldown`. Two flavors, one rule — **reserve, then credit:**

- **Cooldown-claim** (time-gated faucets): `SET key NX EX` *before* running the
  action; keep on a real payout, release on validation-failure or no-op (buff-cooldown
  semantics). Reserves at the *start* of the action, closing wide race windows.
- **DB conditional-claim** (state-flag faucets): an atomic Mongo
  `updateMany({ where: { <id + flag-still-unclaimed / lastX == priorValue> }, data })`,
  acting only if `count === 1` — a compare-and-swap. Redis `NX` fronts the burst; the
  conditional update is the durable truth.

Fail-open policy matches existing cooldowns (Redis error → allow), except the DB
conditional-claim is always authoritative so a Redis outage cannot double-credit.

### 4.2 Race-fix migration

Each faucet in §1.A is migrated onto `atomicClaim`:

| Faucet | Fix |
|---|---|
| work shift | reserve `claim("work", id, 3600)` at shift **start**; conditional `lastShift` update on settle |
| vote | `NX` claim on the 12h window + conditional `lastVote` update in one transaction |
| hunt | `NX` claim before loot creation |
| zoo claim | conditional `updateMany({ where: { lastZooClaim: prior } })` |
| property collect | per-property conditional `lastCollected` update; single owner of the zoo timestamp |
| scholarships | conditional update requiring the milestone still absent, inside the transaction |
| daily-quest reward | `updateMany({ where: { rewardClaimed: false } })`; act only if `count === 1` |

### 4.3 `limits.ts` — economic limits

- **Daily net-transfer cap** per sender, **shared across all P2P out-paths**
  (transfer + ask + market overpay + vault deposit) via a per-day Redis rolling
  counter. Over cap → soft-blocked with a clear message. Default configurable.
- **Account-age gate:** sending *or* receiving a transfer/ask/vault requires the
  Discord account (snowflake `createdTimestamp`) ≥ `MIN_ACCOUNT_AGE_DAYS` (default 7).
- **Per-path cooldowns** on `ask` and vault deposit (neither has one today).

### 4.4 Funnel closures

- **`ask` routed through the taxed path** (`transferAnyFunds`) so it pays the same
  transfer tax as `transfer`; also counted toward the shared daily cap.
- **Tax-shield scoped to income tax only**, so it can no longer zero out transfer tax.
- **Marriage vault** deposit/withdraw/split routed through `recordMovement` (logged +
  counted; see §4.5).

### 4.5 `ledger.ts` — unified logging (the logging deliverable)

One function `recordMovement({ type, from, to, amount, meta, guildId, channelId })`
that **every** money-movement path calls. It:

1. writes the `Transaction` row(s) (as today),
2. writes an `Audit` row for P2P and enforcement events (closes the gap where only
   `transfer` + bank deposit write audits),
3. posts to the `MODERATION`/`ECONOMY` Discord channel via `logToChannel` (closes the
   marriage-vault + market/hunt-part channel-log gaps),
4. bumps the Redis velocity + `MoneyEdge` net-flow counters.

Backfills the currently-silent paths: marriage vault deposit/withdraw/split, market
buy/sale, hunt-part buy/sale, ask. All movement `type`s are normalized into one
`MovementType` enum in `types.ts` so the detection engine has a clean taxonomy.

---

## 5. Layer 1 — The Guard

`guard(ctx: { discordId, member?, commandName, isMoneyCommand, isP2P })` returns
`allow | block(reason) | limit(caps)`.

- **Prefix hook:** insert at `commandRouter.ts:210`, immediately after
  `getUserRecord`, mirroring the existing `if (user === "blocked") return;`.
- **Interaction hook:** insert at the top of the `interactionCreate` callback
  (`index.ts:109`), extract `interaction.user.id`, run guard, reply ephemeral +
  return on block. **This closes the total ban/jail bypass on buttons.**
- **Check order:** tester/dev exempt → load `AccountRestriction` → `BANNED`
  (reuse `isBanned` path) → `SHADOWBAN` (UI works, money mutations silently no-op,
  excluded from leaderboards) → `FROZEN` (block money commands, allow reads) →
  `SOFT_LIMIT` (allow with reduced caps).
- A `commandName` classification map (money-gaining / P2P / neutral) tells the guard
  what to restrict.
- Fail-open on infrastructure error (never lock everyone out on a Redis/DB blip),
  logged loudly.

---

## 6. Layer 2 — Detection (behavior-based)

### 6.1 `counters.ts` — real-time (bumped on the write-path)

- **Transfer velocity** — rolling P2P outflow per user per window (1h / 24h),
  bucketed Redis counters.
- **Pairwise net-flow (`MoneyEdge`)** — directed A→B net value over a rolling window;
  the funnel signature is high net-flow concentrated on one edge. Redis holds the hot
  window, flushed periodically to the durable `MoneyEdge` model.
- **Faucet burst fingerprint** — same-faucet claim cadence; an abnormal cadence signals
  automation even when atomic claims hold, and cross-checks that a claim has not
  silently regressed.

### 6.2 `detection/signals/` — hourly sweep (reads `Transaction` + `MoneyEdge` + counters)

- **funnel.ts** — A→B net ≥ threshold with reverse-flow ≈ 0 (one-directional), plus
  many-alts→one-main fan-in; boosted when the receiver dumps the value into
  games/spends.
- **velocity.ts** — earn/transfer rates anomalous vs. the user's own baseline *and* the
  population (top-0.1% volume, or earn rates only reachable by parallel-claim
  automation).
- **faucetAbuse.ts** — *impossible* earn counts (more shifts/votes/claims than the
  cooldowns physically permit in the window) — a durable backstop that catches a
  regressed atomic claim — plus the burst fingerprints from §6.1.
- **newAccountFunnel.ts** — young-snowflake / recent-join accounts that primarily
  *emit* value to an established account; correlated creation/join timing as a
  corroborating (never sole) signal.

### 6.3 `score.ts`

Each signal emits `{ score 0–100, confidence 0–1, evidence }`. Combined by configurable
weights into an overall risk score + confidence → writes a `RiskFlag`, idempotent per
`(discordId, category, windowStart)` so sweeps never spam. Testers/dev skipped
entirely.

---

## 7. Layer 3 — Enforcement & Admin

### 7.1 Graduated response (`enforcement.ts`)

Maps `(score, confidence)` → action tier, mirroring the auto-IRS-raid precedent:

| Tier | Trigger | Action |
|---|---|---|
| Observe | low score / low confidence | **queue only**, no auto-action |
| Throttle | medium + high confidence | **SOFT_LIMIT** — reduced transfer caps, faucet throttle |
| Contain | high + high confidence | **FROZEN** (money commands blocked) or **SHADOWBAN** for suspected funnels |
| Remove | egregious + very high confidence (e.g. active dup exploit) | **temp BAN** via `isBanned/banExpiresAt` |

- Auto-action **always** also writes a `ReviewItem` for override. Every restriction
  records `appliedBy: "auto"|devId`, `expiresAt`, and `reason` — fully reversible.
- **Idempotent with hysteresis:** never escalate the same window twice; auto-actions
  carry a cooldown so restrictions cannot flap.
- **Shadowban is preferred over freeze for suspected funnels** — a frozen account just
  makes a new alt, whereas a shadowbanned one keeps "earning" into a void.

### 7.2 Review queue (`review.ts`)

`ReviewItem { discordId, riskFlagIds[], suggestedAction, status, resolvedBy, note }`.
Posts a summary to the MODERATION channel with dev-only, ownership-checked action
buttons (approve suggested action / dismiss / escalate).

### 7.3 User-facing messages with appeal path

Every restriction embed the user sees (ban, freeze, soft-limit hit) ends with an
appeal line — *"If you believe this is a mistake, you can appeal in our support
server: `<SUPPORT_SERVER_URL>`"* — using a configurable invite link. The existing ban
message in `getUserRecord` gets the same line. Shadowban stays silent by design.

### 7.4 Dev tooling (`commands/`, developer-only via `isBotDeveloper`)

- `!ac inspect @user` — balances, account age, recent Transactions/Bets, current
  restriction, open flags, top `MoneyEdge`s (funnel partners).
- `!ac flags [@user]` — open flags sorted by score.
- `!ac review` — the review queue.
- `!ac restrict @user <soft|freeze|shadow|ban> [duration] [reason]` /
  `!ac unrestrict @user` — the currently-missing manual enforcement capability.
- All actions logged via `ledger` → MODERATION channel.

---

## 8. Data model (new Prisma models)

```prisma
model AccountRestriction {
  id        String    @id @default(auto()) @map("_id") @db.ObjectId
  discordId String    @unique
  state     String    @default("NONE") // NONE, SOFT_LIMIT, FROZEN, SHADOWBAN, BANNED
  reason    String?
  appliedBy String    // "auto" or a developer discordId
  riskScore Int?
  meta      Json?     // caps for SOFT_LIMIT, etc.
  expiresAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  @@index([state, expiresAt])
}

model RiskFlag {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  discordId   String
  category    String   // FUNNEL, VELOCITY, FAUCET_ABUSE, NEW_ACCOUNT_FUNNEL
  score       Int
  confidence  Float
  evidence    Json
  windowStart DateTime
  windowEnd   DateTime
  status      String   @default("OPEN") // OPEN, ACTIONED, DISMISSED, EXPIRED
  createdAt   DateTime @default(now())
  @@unique([discordId, category, windowStart])
  @@index([status, score])
  @@index([discordId])
}

model MoneyEdge {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  fromId      String
  toId        String
  totalAmount Float    @default(0)
  txnCount    Int      @default(0)
  windowKey   String   // rolling-window bucket key
  lastAt      DateTime @default(now())
  @@unique([fromId, toId, windowKey])
  @@index([toId, windowKey])
  @@index([fromId, windowKey])
}

model ReviewItem {
  id              String    @id @default(auto()) @map("_id") @db.ObjectId
  discordId       String
  riskFlagIds     String[]
  suggestedAction String    // SOFT_LIMIT, FREEZE, SHADOWBAN, BAN
  status          String    @default("PENDING") // PENDING, ACTIONED, DISMISSED
  resolvedBy      String?
  note            String?
  createdAt       DateTime  @default(now())
  resolvedAt      DateTime?
  @@index([status])
}
```

`AccountRestriction` is the single source of truth for all restriction states; the
`BANNED` state is mirrored into `User.isBanned/banExpiresAt` so legacy readers stay
correct, but the guard treats `AccountRestriction` as authoritative. Existing
`Transaction`, `Audit`, and jail models are reused unchanged.

---

## 9. Config (`config.ts`, env-overridable, defaults in code)

- **Master switches:** `ANTICHEAT_ENABLED` (kill switch); **`ANTICHEAT_ENFORCE`**
  (detection-only *shadow mode* vs. auto-action — the key rollout lever).
- **Limits:** `DAILY_NET_TRANSFER_CAP`, `MIN_ACCOUNT_AGE_DAYS` (7), `ASK_COOLDOWN`,
  `VAULT_DEPOSIT_COOLDOWN`.
- **Detection:** funnel net-flow amount + directionality ratio + window; velocity
  multipliers; new-account age; scoring weights; action-tier cutoffs
  (score × confidence → SOFT/FREEZE/SHADOW/BAN).
- **Ops:** `SUPPORT_SERVER_URL` (appeal link); moderation log channel (reuse
  `LOG_CHANNEL_ID` or a dedicated one).

Existing economy constants (tax rates, `MAX_SAFE_BALANCE`, cooldowns) stay in
`economyConfig.ts`; anti-cheat config references them.

---

## 10. Error handling & safety

- **Shadow-mode-first rollout** (`ANTICHEAT_ENFORCE=false`): the detection engine
  scores, flags, and populates the review queue but takes **no auto-action** until the
  false-positive rate is confirmed against live data. This is the single most
  important safety property — it prevents nuking a legitimate whale or active trader on
  day one.
- **Guard fails open** on infrastructure error (never lock everyone out), logged
  loudly.
- **DB conditional-claim is always authoritative** so a Redis outage cannot
  double-credit a faucet.
- **Testers/dev are exempt** at both the guard and the detection engine.
- **All auto-actions are reversible** and mirrored into the review queue.
- **Idempotency/hysteresis** on flags and enforcement prevents duplicate flags and
  restriction flapping.

---

## 11. Testing

- **`atomicClaim` concurrency test** — N parallel claims resolve to exactly one
  payout; a per-faucet regression test that reproduces the work-shift dup exploit and
  asserts it is now impossible.
- **Signal tests** on synthetic ledgers — a known funnel is flagged; a legitimate
  whale / active trader is **not** flagged (false-positive guard).
- **Scoring/threshold tests** — tier cutoffs map to the right action.
- **Guard tests** — each restriction state → correct verdict; tester/dev exempt;
  interaction path now guarded.
- **Limits tests** — daily cap shared across all P2P paths; account-age gate blocks
  young accounts; `ask` is now taxed.
- **Enforcement tests** — idempotency, hysteresis, reversibility, review-item creation.

Tests are written per phase, TDD-first, before the implementation of each unit.

---

## 12. Phased rollout

Each phase is independently shippable and becomes its own implementation plan under
this umbrella spec.

1. **Phase 1 — Prevention core:** `claim.ts` + migrate the 7 race faucets +
   `ledger.recordMovement` unified logging + backfill the silent paths. Highest ROI,
   needs no detection.
2. **Phase 2 — Guard + restrictions + limits:** `guard.ts` at both choke points,
   `AccountRestriction`, `limits.ts` (caps, age gate, ask-tax, cooldowns), manual
   `!ac inspect/restrict/unrestrict` tooling. Closes the interaction bypass; provides
   the missing manual ban/freeze.
3. **Phase 3 — Detection in shadow mode:** counters + `MoneyEdge` + signals + scoring +
   hourly sweep + review queue, `ANTICHEAT_ENFORCE=false`. Observe and tune against
   real data (~1 week).
4. **Phase 4 — Auto-enforcement:** flip `ANTICHEAT_ENFORCE=true`, wire graduated
   auto-actions to the queue, ship appeal messaging. Turn the key only once thresholds
   are trustworthy.

Standard CI (typecheck/build → `prisma db push` → deploy webhook). The new Prisma
models are additive; no existing data is migrated or wiped. Existing balances,
inventories, cooldown keys, and bans are untouched.

---

## 13. Out of scope

- **`isTester` role-name bypass** — left as-is per owner decision (accepted risk); the
  engine only ensures testers/dev are never flagged.
- **Rebalancing individual shop items / faucet payouts** — this spec hardens *how*
  value moves, not *how much* each faucet pays (covered by separate specs).
- **Cross-shard coordination beyond Redis** — current deployment is single-process;
  Redis is the shared-state boundary.
- **Machine-learning risk models** — the signal engine is deterministic and
  rule-based; ML is a possible future iteration once labelled data accrues from the
  review queue.
- **Rob / PvP balance** — rob is a weak funnel (capped %, cooldown, penalty) and is
  monitored, not restructured.
