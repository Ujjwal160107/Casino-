# V2 Gaps Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close post-refactor functional gaps (life reliability, route consolidation, economy wiring, XP-only education, ask-money block flow) without embed UI migration, stock work, or degree price changes.

**Architecture:** Phase 1 interaction safe helpers; Phase 2 legacy command redirects; Phase 3 bet limits + credit redirect + doc sync (docs follow code, not the reverse); Phase 4 XP-only education cleanup; Phase 5 `!ask` accept/decline/block + unblock.

**Tech Stack:** TypeScript, discord.js, Prisma/MongoDB, existing `interactionHelpers.ts` and `economyConfig.ts`

**Spec:** `docs/superpowers/specs/2026-06-21-v2-gaps-remediation-design.md`

**Degree prices:** Do **not** change `DEGREE_PRICES` in code. Current values in `economyConfig.ts` are canonical. Task 8 updates `FORTUNA_V2_ECONOMY.md` to match code.

**Education model:** GPA is retired. Progression, scholarships, exams, and user-facing copy use **XP only**.

---

## File map

| Phase | Create | Modify | Delete |
|-------|--------|--------|--------|
| 1 | — | `lifeInteractionHandler.ts`, `jailInteractionHandler.ts` | — |
| 2 | — | `enroll.ts`, `study.ts`, `education.ts`, `commandRouter.ts` | — |
| 3 | — | `economyConfig.ts` (bet limits only), `gameUtils.ts`, `credit.ts`, `commandRouter.ts`, `FORTUNA_V2_ECONOMY.md` | — |
| 4 | — | `educationService.ts`, `educationAdmin.ts`, `prisma/schema.prisma` (optional `finalXp`) | — |
| 5 | `askService.ts` | `ask.ts`, `askInteractionHandler.ts`, `commandRouter.ts`, `prisma/schema.prisma` | — |

**Explicitly out of scope:** `stock*.ts`, game embed files, `balance.ts`/`deposit.ts` embed UI, `lifeInteractionHandler` file split, **degree price rebalancing**, scholarship formula changes.

**Already done (skip unless regression):** `jailInteractionHandler.ts` and `askInteractionHandler.ts` safe interaction helpers.

---

### Task 1: Finish lifeInteractionHandler safe interaction helpers

**Files:**
- Modify: `src/handlers/lifeInteractionHandler.ts`

**Context:** Enroll path already uses `ensureDeferredEphemeralReply` / `safeEditReply`. ~8 branches still call raw `interaction.deferReply`, `deferUpdate`, or `reply`.

- [ ] **Step 1: Add missing imports** (if not present):

```ts
import {
  ensureDeferredEphemeralReply,
  ensureDeferredUpdate,
  safeDeferReply,
  safeEditReply,
  safeFollowUp,
  safeReply,
  safeUpdate,
} from "../utils/interactionHelpers";
```

- [ ] **Step 2: Replace each raw ack** using this mapping:

| Branch | Ack helper |
|--------|------------|
| `relax:` wrong owner | `safeReply` + ephemeral flags |
| `relax:` success path | `ensureDeferredUpdate` then `safeEditReply` with ComponentsV2 |
| `claim_scholarship_` | already partial — ensure all paths use `safeEditReply` |
| `edu_stress_` / `stress_` | `ensureDeferredUpdate` fallback `ensureDeferredEphemeralReply` |
| `dropout_confirm` | `ensureDeferredUpdate` + `safeEditReply` |
| `dropout_cancel` | `safeUpdate` |
| `work_resign`, `work_promote_`, promote confirm | `ensureDeferredEphemeralReply` + `safeEditReply` |
| `work_resign_confirm` | `ensureDeferredUpdate` + `safeEditReply` |
| `work_shift` | `safeDeferReply(interaction, { ephemeral: false })` |
| Work validation errors after public defer | `safeFollowUp` ephemeral (keep existing deleteReply pattern) |

- [ ] **Step 3: Grep verification**

Run:
```powershell
rg "interaction\.(deferReply|deferUpdate|reply)\(" src/handlers/lifeInteractionHandler.ts
```
Expected: **0 matches** (only `safe*` / `ensure*` helpers remain).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit code 0

---

### Task 2: Harden jail interaction handler

**Files:**
- Modify: `src/handlers/jailInteractionHandler.ts`

**Status:** Likely complete — verify, do not regress.

- [ ] **Step 1: Confirm** `ensureDeferredEphemeralReply` + `safeEditReply` are used (no raw `deferReply` / `editReply`).

- [ ] **Step 2: Confirm** `pay_bail` early-ack in `index.ts` remains compatible (idempotent defer).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit`

---

### Task 3: Redirect legacy `!enroll` to V2 education flow

**Files:**
- Modify: `src/commands/life/enroll.ts`
- Modify: `src/commandRouter.ts` (only if alias changes needed)

- [ ] **Step 1: Replace `handleEnroll` body** with thin redirect (keep embed-free text reply):

```ts
import { getGuildPrefix } from "../../utils/guildContext";
import { Mascot } from "../../config/branding";

export async function handleEnroll(message: Message, args: string[]) {
  if (!message.guild) return;
  const prefix = await getGuildPrefix(message.guild.id);
  const query = args.join(" ").trim();
  const hint = query
    ? `Try \`${prefix}education\` and use the Enroll button for **${query}**.`
    : `Use \`${prefix}education\` to browse programs and enroll with the Enroll button.`;
  return message.reply(`${Mascot.Emotes.Graduate} Enrollment moved to the education dashboard.\n${hint}`);
}
```

- [ ] **Step 2: Keep `handleExam` export** if still routed from `commandRouter.ts` — do not break exam command.

- [ ] **Step 3: Manual smoke** — `!enroll` shows redirect; `!education` enroll button still works.

---

### Task 4: Redirect legacy `!study` to education dashboard

**Files:**
- Modify: `src/commands/life/study.ts`

- [ ] **Step 1: At top of `handleStudy`**, after guild check:

```ts
const prefix = await getGuildPrefix(message.guild.id);
const user = await prisma.user.findUnique({
  where: { discordId: message.author.id },
  include: { currentEducation: { include: { degree: true } } },
});
if (!user?.currentEducation) {
  return message.reply(`You are not enrolled. Use \`${prefix}education\` to enroll first.`);
}
return message.reply(
  `Study sessions are started from your education dashboard.\nRun \`${prefix}education\` — then use \`${prefix}study\` only if you need the classic study minigame.`
);
```

**Decision:** If user wants to keep classic minigame for power users, gate behind `args[0] === "classic"` and only then run existing embed logic. Default path = redirect.

- [ ] **Step 2: Document in file comment** which path is canonical.

---

### Task 5: Unify `!degrees` with education data (XP display)

**Files:**
- Modify: `src/commands/life/education.ts` — `handleListDegrees`

- [ ] **Step 1: Replace embed in `handleListDegrees`** with ComponentsV2 container (reuse `buildTextOnlyContainer` pattern from same file):

```ts
const lines = user.degrees.map((ud) => {
  const finalXp = ud.finalXp ?? Math.round((ud.finalGpa / 10) * ud.degree.xpRequired); // legacy fallback only
  return `${Mascot.Emotes.Graduate} **${ud.degree.name}** — Final XP **${finalXp}/${ud.degree.xpRequired}** · <t:${Math.floor(ud.obtainedAt.getTime() / 1000)}:D>`;
});
return message.reply({
  components: [buildTextOnlyContainer("Earned Degrees", lines.join("\n") || "None", 0xF1C40F)],
  flags: MessageFlags.IsComponentsV2,
});
```

Use `finalXp` after Task 9 adds the field. Do not label anything as GPA.

- [ ] **Step 2: Router** — keep `degrees` / `mydegrees` aliases pointing to `handleListDegrees`.

---

### Task 6: Move game bet limits into economyConfig

**Files:**
- Modify: `src/utils/economyConfig.ts`
- Modify: `src/utils/gameUtils.ts`

- [ ] **Step 1: Add to `economyConfig.ts`:**

```ts
export const GAME_BET_LIMITS = {
  defaultMin: 10_000,
  defaultMax: 1_000_000,
  perGameMax: {
    coinflip: 500_000,
    slots: 750_000,
    blackjack: 1_000_000,
    roulette: 1_000_000,
    russian_roulette: 750_000,
    rr: 750_000,
    cockfight: 1_000_000,
    chicken: 1_000_000,
  },
} as const;
```

- [ ] **Step 2: Update `gameUtils.ts`:**

```ts
import { GAME_BET_LIMITS } from "./economyConfig";

export function getGameBetLimits(gameKey: string): { min: number; max: number } {
  const perGame = GAME_BET_LIMITS.perGameMax as Record<string, number | undefined>;
  return {
    min: GAME_BET_LIMITS.defaultMin,
    max: perGame[gameKey] ?? GAME_BET_LIMITS.defaultMax,
  };
}
```

Remove local `V2_DEFAULT_*` constants from `gameUtils.ts`.

- [ ] **Step 3: Run** `npx tsc --noEmit`

---

### Task 7: Redirect `!credit` to bank/cards flow

**Files:**
- Modify: `src/commands/economy/credit.ts`
- Modify: `src/commandRouter.ts` (optional alias note)

- [ ] **Step 1: Replace `handleCredit` body:**

```ts
import { getGuildPrefix } from "../../utils/guildContext";
import { Mascot } from "../../config/branding";

export async function handleCredit(message: Message, _args: string[]) {
  if (!message.guild) return;
  const prefix = await getGuildPrefix(message.guild.id);
  return message.reply(
    `${Mascot.Emotes.FortunaSparkle} Credit cards and loan details live in \`${prefix}bank\` → **Cards**.\n` +
    `Use \`${prefix}card info\` for a quick summary. The standalone credit profile command is retired.`
  );
}
```

- [ ] **Step 2: Optional enhancement** — import and call `buildBankCardsPayload` from `bank.ts` for users who want immediate cards view (only if it doesn't create circular imports; otherwise text redirect only).

- [ ] **Step 3: Update `help.ts` entry** for credit to mention bank (text only).

---

### Task 8: Sync FORTUNA_V2_ECONOMY.md to match code (docs only)

**Files:**
- Modify: `FORTUNA_V2_ECONOMY.md`

**Do not change** `DEGREE_PRICES` or any tuition values in code. Update the markdown file only.

- [ ] **Step 1: Replace Degrees table** with current `DEGREE_PRICES` from `economyConfig.ts`:

| Degree | Cost (Fortunes) |
| --- | ---: |
| High School Diploma | 150,000 |
| Trade License | 300,000 |
| BA Fine Arts | 900,000 |
| BS Computer Science | 1,200,000 |
| Bachelor of Laws (LLB) | 2,500,000 |
| MBBS | 4,000,000 |
| Master of Laws (LLM) | 6,000,000 |
| Doctor of Medicine (MD) / Ph.D. | 10,000,000 |

- [ ] **Step 2: Add `GAME_BET_LIMITS` section** (after Task 6) documenting default min/max and per-game caps.

- [ ] **Step 3: Add education note** — progression is XP-based; GPA is deprecated/removed from user-facing docs.

- [ ] **Step 4: Update “Last updated” date** and keep note: source of truth is `src/utils/economyConfig.ts`.

---

### Task 9: Education service XP-only cleanup

**Files:**
- Modify: `src/services/educationService.ts`
- Modify: `src/commands/admin/educationAdmin.ts`
- Modify: `prisma/schema.prisma` — add optional `finalXp Int?` on `UserDegree`

**Do not change** degree prices or scholarship payout formulas (`tuitionPerSem * currentSemester * multiplier` stays as-is).

- [ ] **Step 1: Enroll** — stop setting `currentGpa` on create; initialize `educationXp: 0` only.

- [ ] **Step 2: One-time legacy read** — keep `migrateGpaToXp` only for rows where `educationXp === 0 && currentGpa > 0`; after migration set `educationXp` and zero `currentGpa`. Remove GPA from all new logic paths.

- [ ] **Step 3: User-facing strings** — grep `educationService.ts`, life commands, and handlers for “GPA”, “Sem ”, “Final Score X/10”; replace with XP progress (`educationXp/xpRequired`).

- [ ] **Step 4: Exam completion** — persist `finalXp = effectiveXp` on `UserDegree`; return messages say “Final XP”. Stop writing scaled 0–10 scores to `finalGpa` for new graduations (legacy field read-only).

- [ ] **Step 5: Enrolled error** — change `Sem ${currentSemester}` to `XP ${educationXp}/${degree.xpRequired}`.

- [ ] **Step 6: Admin** — rename or replace `set-gpa` with `set-education-xp` (or deprecate with redirect message). No admin command should reference GPA.

- [ ] **Step 7: Typecheck** — `npx tsc --noEmit`

---

### Task 10: Refactor `!ask` — accept, decline, block, unblock

**Files:**
- Create: `src/services/askService.ts`
- Modify: `prisma/schema.prisma`
- Modify: `src/commands/economy/ask.ts`
- Modify: `src/handlers/askInteractionHandler.ts`
- Modify: `src/commandRouter.ts` (optional `help.ts` line)

**Behavior:**

- `!ask @user <amount> [reason]` — requester asks target for money (unchanged intent).
- Target sees **three buttons:** Accept · Decline · **Block**.
- **Block:** target will not receive future `!ask` requests from that requester until unblocked.
- **Unblock:** `!ask unblock @user` removes the block (target runs this).

- [ ] **Step 1: Prisma model**

```prisma
model AskBlock {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  blockerId String   // user who blocked incoming asks
  blockedId String   // user who may not ask again
  createdAt DateTime @default(now())

  @@unique([blockerId, blockedId])
  @@index([blockedId])
}
```

Run `npx prisma generate` (and `db push` in dev).

- [ ] **Step 2: `askService.ts`**

```ts
export async function isAskBlocked(blockerId: string, requesterId: string): Promise<boolean>
export async function blockRequester(blockerId: string, requesterId: string): Promise<void>
export async function unblockRequester(blockerId: string, requesterId: string): Promise<boolean>
```

- [ ] **Step 3: `handleAsk`** — before posting request:

```ts
if (await isAskBlocked(targetUser.id, message.author.id)) {
  return message.reply({ embeds: [errorEmbed(..., "You are blocked from asking this user for money. They must run `!ask unblock @you` to allow requests again.")] });
}
```

Add third button:

```ts
new ButtonBuilder()
  .setCustomId(`ask_block:${message.author.id}`)
  .setLabel("Block")
  .setStyle(ButtonStyle.Secondary)
```

Update footer: “Accept transfers immediately. Block prevents future requests from this user.”

- [ ] **Step 4: `askInteractionHandler`** — handle `ask_block`:

- Owner check (only target can click).
- `ensureDeferredUpdate` + `safeEditReply` — disable all buttons; set embed footer to `Blocked by {username}`.
- Call `blockRequester(interaction.user.id, requesterId)`.
- Ephemeral `safeFollowUp` to blocker confirming block.

Accept/decline flows unchanged except all three buttons disabled after any action.

- [ ] **Step 5: Unblock subcommand** in `handleAsk`:

```ts
if (args[0]?.toLowerCase() === "unblock") {
  const target = message.mentions.users.first();
  if (!target) return usage error;
  const removed = await unblockRequester(message.author.id, target.id);
  return message.reply(removed ? `Unblocked ${target.username}. They can ask you for money again.` : `${target.username} was not blocked.`);
}
```

- [ ] **Step 6: Typecheck + smoke**

| Flow | Expected |
|------|----------|
| `!ask @user 100 pizza` | Target gets Accept / Decline / Block |
| Target clicks Block | Buttons disabled; requester cannot ask again |
| Requester tries `!ask` again | Blocked error message |
| Target runs `!ask unblock @requester` | Requester can ask again |

---

### Task 11: Verification and smoke checklist

- [ ] **Step 1: Static checks**

```powershell
npx tsc --noEmit
rg "interaction\.(deferReply|deferUpdate)\(" src/handlers/lifeInteractionHandler.ts
rg "getGuildConfig|guildConfigService" src/
rg -i "gpa" src/services/educationService.ts src/commands/life/
```

Expected: no raw defer in life handler; no GPA in user-facing education strings (legacy DB field names OK in migration code only).

- [ ] **Step 2: Manual Discord smoke**

| Flow | Expected |
|------|----------|
| `!education` → Enroll button | Ephemeral success/failure, no internal error |
| `!enroll` | Redirect message to `!education` |
| `!study` (default) | Redirect to education dashboard |
| `!degrees` | V2 container, XP labels only |
| `!work` → Start Shift | Public shift flow starts |
| `!relax` button | Dashboard updates |
| `!credit` | Redirect to `!bank` |
| `!coinflip 50000` | Respects limits from `GAME_BET_LIMITS` |
| `!jail` → Pay Bail | No interaction error |
| `!ask` → Block → unblock | Block enforced; unblock restores asks |

- [ ] **Step 3: Document deferred items** in spec under Non-goals if any smoke fails scope (stocks, embed games UI).

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Life interaction reliability | 1, 2 |
| Life route consolidation | 3, 4, 5 |
| Economy bet limits + credit redirect | 6, 7 |
| Doc sync (code → docs, no price refactor) | 8 |
| XP-only education (no GPA) | 9 |
| Ask accept / decline / block | 10 |
| Verification | 11 |

No TBD placeholders. Stock, embed UI, and degree price rebalancing explicitly excluded.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-21-v2-gaps-remediation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints

Which approach do you want?
