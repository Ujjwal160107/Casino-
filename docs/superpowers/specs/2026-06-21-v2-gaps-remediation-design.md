# V2 Gaps Remediation Design



Last updated: 2026-06-21



## Goal



Close the remaining functional and architectural gaps after the V1 logic migration and recent economy/jobs/education refactors — without an embed→ComponentsV2 UI pass, without stock subsystem work, and **without changing degree prices in code**.



## Non-goals



- Embed → ComponentsV2 UI migration (games, economy quick commands, life gameplay panels)

- Stock feature migration (`stock.ts`, `myStocks.ts`, `stockService` behavior)

- Full rewrite or file split of `lifeInteractionHandler.ts`

- Global degree/shop catalog schema change (degrees remain seeded per `guildId` for now)

- **Degree price rebalancing or scholarship formula changes** — `DEGREE_PRICES` in `economyConfig.ts` stay as-is; docs are updated to match code

- GPA as a user-facing or progression stat (retired; XP only)



## Context (gaps to close)



| Gap | Problem | Target outcome |

|-----|---------|----------------|

| Life duplicate entry points | `!education`/`!jobs` V2 dashboards coexist with `!enroll`, `!study`, `!apply`, `!degrees` embed paths | One canonical command per flow; legacy commands redirect |

| `lifeInteractionHandler` reliability | ~34 raw `reply`/`deferReply`/`deferUpdate`/`editReply` calls; enroll fix was partial | All life buttons use safe interaction helpers; no double-ack |

| GPA legacy shim | `currentGpa`, `migrateGpaToXp`, exam “Final Score X/10”, `finalGpa` display | XP-only progression in services and UI; legacy DB fields migrated/read-only |

| Economy product drift | `!credit` standalone; bet limits in `gameUtils.ts`; `FORTUNA_V2_ECONOMY.md` stale degree table | `!credit` → bank/cards; limits in `economyConfig`; **docs match existing code prices** |

| `!ask` money requests | Accept/Decline only; no way to stop repeat requests | Accept · Decline · **Block**; blocked requesters cannot ask again until target runs `!ask unblock` |

| Minor handlers | `jailInteractionHandler` raw defer/reply | Safe helpers, consistent with shop/bank fixes |



## Approaches



### Approach A — Reliability + routing first (recommended)



Phase 1 harden life/jail interactions. Phase 2 redirect legacy life commands. Phase 3 economy wiring + doc sync. Phase 4 XP-only education cleanup. Phase 5 ask block flow.



**Pros:** Low risk, unblocks users immediately, no UI rewrite.  

**Cons:** `lifeInteractionHandler` stays large; embed gameplay remains.



### Approach B — Life consolidation first



Redirect/remove duplicate commands before interaction fixes.



**Pros:** Less duplicate code paths sooner.  

**Cons:** Users hitting broken buttons during transition if reliability not fixed first.



### Approach C — Big-bang (life handler split + V2 UI + schema)



**Not recommended** — violates stated constraints and prior scope decisions.



## Recommended design (Approach A)



### 1. Interaction reliability



**Rule:** Life/education/work buttons are **never** early-acked in `index.ts` (already done). Each handler branch must:



1. Owner check → `safeReply` ephemeral

2. Ack → `ensureDeferredEphemeralReply`, `ensureDeferredUpdate`, or `safeDeferReply` (public for `work_shift` only)

3. Async work

4. Response → `safeEditReply`, `safeUpdate`, or `safeFollowUp`



**Files:** `lifeInteractionHandler.ts`, `jailInteractionHandler.ts`, `askInteractionHandler.ts`



**`work_shift` exception:** Uses `safeDeferReply({ ephemeral: false })` for public minigame messages.



### 2. Life route consolidation (logic only)



| Legacy command | New behavior |

|--------------|--------------|

| `!enroll` | Reply with short message + link to `!education`. No duplicate embed enrollment UI. |

| `!study` | Redirect to `!education` when enrolled; otherwise explain enrollment required. |

| `!degrees` / `!mydegrees` | V2 container listing earned degrees with **Final XP** (not GPA). |

| `!apply` | Keep embed interview for now (jobs V2 launches it); canonical browse is `!jobs`. |



Education dashboard enroll buttons continue routing through `index.ts` → `lifeInteractionHandler` → `enroll()`.



### 3. Economy alignment



- **`!credit`:** Thin redirect to `!bank` / cards flow.

- **Bet limits:** Move `V2_DEFAULT_MIN_BET`, `V2_GAME_MAX_BETS` from `gameUtils.ts` to `economyConfig.ts` as `GAME_BET_LIMITS`.

- **Docs:** Update `FORTUNA_V2_ECONOMY.md` degree table to match **current** `DEGREE_PRICES` (150k–10M). Do not change code values to match old docs.



### 4. Education XP-only (service layer)



- Progression stat: **`educationXp` / `xpRequired`** only.

- Remove GPA from enroll writes, exam messages, degree lists, and admin commands.

- One-time `migrateGpaToXp` for legacy rows where `educationXp === 0 && currentGpa > 0`.

- Graduation stores **`finalXp`** (effective XP at completion); stop writing 0–10 “GPA scores” for new rows.

- Scholarship payouts: **unchanged formula** (`tuitionPerSem * currentSemester * multiplier`) — not a price refactor.

- **Schema:** Add `finalXp` on `UserDegree`; defer dropping `currentGpa` / `finalGpa` until no reads remain.



### 5. `!ask` money requests



**Command:** `!ask @user <amount> [reason]`



**Recipient UI:** three buttons on the public request message:



| Button | Action |

|--------|--------|

| Accept | Transfer wallet funds (existing behavior) |

| Decline | Mark declined; disable buttons |

| Block | Record block; disable buttons; requester cannot `!ask` this user again |



**Persistence:** `AskBlock` model — `(blockerId = target, blockedId = requester)`.



**Unblock:** `!ask unblock @user` — target removes block; requester may ask again.



**Pre-check:** Before posting a new request, reject if `isAskBlocked(targetId, requesterId)`.



### 6. Verification



- `npx tsc --noEmit` passes

- Manual smoke: enroll, scholarship claim, work shift, relax, jail bail, ask block/unblock, coinflip bet limits

- Grep: no raw `interaction.deferReply` in `lifeInteractionHandler.ts`

- Grep: no user-facing “GPA” in education commands/services



## Success criteria



- No “Internal error while processing interaction” on life/education/work buttons under normal load

- Legacy life commands don’t duplicate enrollment/study UIs

- `FORTUNA_V2_ECONOMY.md` degree table matches `economyConfig.ts` (code unchanged)

- Education uses XP as the only progression stat in services and user copy

- `!ask` supports accept, decline, block, and unblock with persistent block enforcement

