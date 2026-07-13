# Components V2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every classic Discord embed from `src/` and replace it with Discord Components V2 containers in the minimal, stripe-free Dank Memer style, with curated `-# Tip:` next-step hints linking modules.

**Architecture:** A central kit (`src/utils/componentsV2.ts`) provides status/plain container builders and a `v2Reply()` payload wrapper that enforces the house rules (no accent color, no footer, no timestamp). A curated hint map (`src/config/nextSteps.ts`) supplies cross-module tips. Files migrate in module batches; each command migrates atomically with any handler that later edits its messages.

**Tech Stack:** TypeScript, discord.js 14.25.1 (ContainerBuilder / TextDisplayBuilder / SectionBuilder / SeparatorBuilder / ThumbnailBuilder / MediaGalleryBuilder, `MessageFlags.IsComponentsV2`), Prisma, ts-node scripts for payload audits.

**Spec:** `docs/superpowers/specs/2026-07-13-components-v2-migration-design.md`

## Global Constraints

- **No `setAccentColor` anywhere** — it renders the colored side stripe that must not exist.
- **No footer line** ("Lady Fortuna • Play Responsibly"), **no `setTimestamp()`**, **no `setAuthor` user header** — titles carry names where needed (`## Yash's Balance`).
- Mascot reaction thumbnails stay on status messages; game-asset thumbnails stay everywhere.
- Every V2 send carries `MessageFlags.IsComponentsV2`; edits/updates restate the flag (house style, see bankInteractionHandler).
- A message sent as V2 can never be edited into an embed message → command + its collectors/handlers migrate in the same commit.
- Hard limits per message: ≤ 40 total components, ≤ 4000 chars across TextDisplays, ≤ 10 attachments.
- `content:`-only plain-text replies (e.g. `STORE_MOVED_MESSAGE`) are legal and stay; `content:`/`embeds:` may never combine with the V2 flag.
- Hints appear on **success outputs only** — never on error replies, never on admin commands.
- No unit-test framework exists. The test cycle per task = `npm run typecheck` + `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` + grep gates.
- Never commit `.claude/settings.json`.
- All commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Conversion Recipe (referenced by every batch task)

### API mapping

| Old embed part | V2 replacement |
|---|---|
| `errorEmbed(user, title, desc)` | `errorContainer(title, desc)` |
| `successEmbed(user, title, desc)` | `successContainer(title, desc, { hint: nextStepHint("<key>") })` (hint only where the task lists a key) |
| `infoEmbed(user, title, desc)` | `infoContainer(title, desc)` |
| `balanceEmbed(user, w, b, e)` | `statusContainer("info", \`${username}'s Balance\`, \`**Wallet:** ${fmtCurrency(w, e)}\n**Bank:** ${fmtCurrency(b, e)}\`, { thumbnailUrl: getEmoteUrl(Mascot.Emotes.Money) ?? undefined, hint: nextStepHint("balance") })` |
| `new EmbedBuilder().setTitle(t).setDescription(d)` | `plainContainer(\`## ${t}\n${d}\`)` or a hand-built ContainerBuilder for rich screens |
| `.addFields({name, value})` | markdown lines in a TextDisplay: `**Name**\nvalue` (stacked) or `**Name:** value` (inline-ish) |
| `.setThumbnail(url)` | wrap the text in a `SectionBuilder` + `.setThumbnailAccessory(new ThumbnailBuilder().setURL(url))` |
| `.setImage(url)` | `container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url)))` |
| `.setFooter(...)`, `.setTimestamp()`, `.setAuthor(...)`, `.setColor(...)` | **dropped** (by design) |
| `message.reply({ embeds: [x] })` | `message.reply(v2Reply(x))` |
| `message.reply({ embeds: [x], files })` | `message.reply(v2Reply(x, files))` |
| `channel.send({ embeds: [x] })` / `user.send({ embeds: [x] })` | same shape with `v2Reply(...)` |
| `i.reply({ embeds: [x], flags: MessageFlags.Ephemeral })` | `i.reply(v2Reply(x, undefined, MessageFlags.Ephemeral))` |
| `i.update({ embeds: [x], components: [row] })` | `i.update({ components: [container], flags: MessageFlags.IsComponentsV2 })` — action rows go INSIDE the container via `container.addActionRowComponents(row)` |

### Rules

1. **Buttons/selects move inside the container** (`addActionRowComponents`). Do not leave them as top-level `components` next to a container.
2. **Existing V2 files** (mixed files like cockfight, slots, coinflip, hunt): convert remaining embed sites to match the file's own container style, not the kit, when the file already has bespoke builders. Kit is for simple status replies.
3. **Import hygiene:** remove `utils/embed` imports; drop now-unused `EmbedBuilder`, `Colors` imports; add kit/nextSteps imports.
4. **Long lists** must respect the 40-component ceiling — follow hunt.ts's `MAX_DETAILED_GROUPS` pattern (`src/commands/games/hunt.ts:88-92`): detail the top N, overflow as plain text lines.
5. **Per-file done-gate** (run for every migrated file):
   `rg -n "EmbedBuilder|embeds:\s*\[|setFooter\(|setTimestamp\(|setAuthor\(|setAccentColor\(" <file>` → zero matches.

### Worked example — `src/commands/economy/deposit.ts` (before → after)

Before (current file, abridged):
```ts
import { Message } from "discord.js";
import { depositToBank, ensureBankingUser, getBankByUserId } from "../../services/bankService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";

export async function handleDeposit(message: Message, args: string[]) {
  const user = await ensureBankingUser(message.author.id, message.author.username);
  const wallet = user.wallet!;
  const amountStr = args[0];

  if (!amountStr) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Usage: `!dep <amount/all>`")] });
  }

  const amount = parseSmartAmount(amountStr, wallet.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Amount", "Please enter a valid positive number.")] });
  }

  try {
    const { actualAmount, capped } = await depositToBank(wallet.id, user.discordId, amount);
    const updatedBank = await getBankByUserId(user.discordId);
    const partialMsg = capped ? " (Wallet cap reached)" : "";

    return message.reply({
      embeds: [
        successEmbed(
          message.author,
          capped ? "Partial Deposit" : "Deposit Successful",
          `Deposited **${fmtCurrency(actualAmount)}**${partialMsg}.\nBank balance: **${fmtCurrency(updatedBank?.balance ?? 0)}**`
        )
      ]
    });
  } catch (err) {
    return message.reply({ embeds: [errorEmbed(message.author, "Failed", (err as Error).message)] });
  }
}
```

After:
```ts
import { Message } from "discord.js";
import { depositToBank, ensureBankingUser, getBankByUserId } from "../../services/bankService";
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";

export async function handleDeposit(message: Message, args: string[]) {
  const user = await ensureBankingUser(message.author.id, message.author.username);
  const wallet = user.wallet!;
  const amountStr = args[0];

  if (!amountStr) {
    return message.reply(v2Reply(errorContainer("Invalid Amount", "Usage: `!dep <amount/all>`")));
  }

  const amount = parseSmartAmount(amountStr, wallet.balance);
  if (isNaN(amount) || amount <= 0) {
    return message.reply(v2Reply(errorContainer("Invalid Amount", "Please enter a valid positive number.")));
  }

  try {
    const { actualAmount, capped } = await depositToBank(wallet.id, user.discordId, amount);
    const updatedBank = await getBankByUserId(user.discordId);
    const partialMsg = capped ? " (Wallet cap reached)" : "";

    return message.reply(
      v2Reply(
        successContainer(
          capped ? "Partial Deposit" : "Deposit Successful",
          `Deposited **${fmtCurrency(actualAmount)}**${partialMsg}.\nBank balance: **${fmtCurrency(updatedBank?.balance ?? 0)}**`,
          { hint: nextStepHint("deposit") }
        )
      )
    );
  } catch (err) {
    return message.reply(v2Reply(errorContainer("Failed", (err as Error).message)));
  }
}
```

---

### Task 0: Commit pending hunt WIP

The working tree has uncommitted, finished work: `src/commands/games/hunt.ts` (modified) and `src/scripts/checkHuntPayload.ts` (untracked). Commit it as-is so migration diffs stay clean. Do NOT add `.claude/settings.json`.

**Files:**
- Commit: `src/commands/games/hunt.ts`, `src/scripts/checkHuntPayload.ts`

- [ ] **Step 1: Verify the tree typechecks**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 2: Run the existing payload check**

Run: `npx ts-node --transpile-only src/scripts/checkHuntPayload.ts`
Expected: `PASS: payload is within the 40-component limit`

- [ ] **Step 3: Commit**

```powershell
git add src/commands/games/hunt.ts src/scripts/checkHuntPayload.ts
git commit -m @'
fix(hunt): cap detailed groups to stay under the 40-component V2 limit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 1: V2 kit + next-step hints config

**Files:**
- Create: `src/utils/componentsV2.ts`
- Create: `src/config/nextSteps.ts`

**Interfaces:**
- Consumes: `Mascot`, `getEmoteUrl` from `src/config/branding`; `fmtCurrency` from `src/utils/format`.
- Produces (used by every later task):
  - `statusContainer(kind: "info"|"success"|"error", title: string, desc?: string, opts?: {hint?: string; thumbnailUrl?: string}): ContainerBuilder`
  - `infoContainer / successContainer / errorContainer(title, desc?, opts?)` — same opts
  - `plainContainer(...blocks: string[]): ContainerBuilder`
  - `v2Reply(containers: ContainerBuilder | ContainerBuilder[], files?: AttachmentBuilder[], extraFlags?: number): { components; files?; flags: number }`
  - `nextStepHint(key: string, prefix?: string): string | undefined` (default prefix `"!"`, returns a `-# Tip: …` line)

- [ ] **Step 1: Write `src/utils/componentsV2.ts`**

```ts
import {
    AttachmentBuilder,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import { Mascot, getEmoteUrl } from "../config/branding";

export type StatusKind = "info" | "success" | "error";

const KIND_EMOTE: Record<StatusKind, string> = {
    info: Mascot.Emotes.Think,
    success: Mascot.Emotes.Success,
    error: Mascot.Emotes.Fail,
};

export interface StatusOptions {
    /** Pre-formatted "-# ..." line — use nextStepHint() from config/nextSteps. */
    hint?: string;
    /** Override the mascot image (attachment:// or CDN url). */
    thumbnailUrl?: string;
}

/**
 * Minimal status container: text left, mascot reaction thumbnail right.
 * House rules enforced here: no accent color, no footer, no timestamp.
 */
export function statusContainer(kind: StatusKind, title: string, desc?: string, opts?: StatusOptions): ContainerBuilder {
    const container = new ContainerBuilder();
    const body = `## ${title}` + (desc ? `\n${desc}` : "");
    const thumbUrl = opts?.thumbnailUrl ?? getEmoteUrl(KIND_EMOTE[kind]);

    if (thumbUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    }

    if (opts?.hint) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
        );
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(opts.hint));
    }
    return container;
}

export function infoContainer(title: string, desc?: string, opts?: StatusOptions) {
    return statusContainer("info", title, desc, opts);
}

export function successContainer(title: string, desc?: string, opts?: StatusOptions) {
    return statusContainer("success", title, desc, opts);
}

export function errorContainer(title: string, desc?: string, opts?: StatusOptions) {
    return statusContainer("error", title, desc, opts);
}

/** Bare container from markdown blocks (one TextDisplay per block). */
export function plainContainer(...blocks: string[]): ContainerBuilder {
    const container = new ContainerBuilder();
    for (const block of blocks) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
    }
    return container;
}

/**
 * Standard ComponentsV2 payload for reply / send / edit / update.
 * House style restates the flag on edits (see bankInteractionHandler).
 */
export function v2Reply(
    containers: ContainerBuilder | ContainerBuilder[],
    files?: AttachmentBuilder[],
    extraFlags: number = 0,
) {
    return {
        components: Array.isArray(containers) ? containers : [containers],
        ...(files && files.length ? { files } : {}),
        flags: MessageFlags.IsComponentsV2 | extraFlags,
    };
}
```

- [ ] **Step 2: Write `src/config/nextSteps.ts`**

```ts
/**
 * Curated cross-module "what next" hints, shown as -# small text on SUCCESS
 * outputs only — never on errors, never on admin commands.
 * {p} is replaced with the prefix at render time (default "!").
 * Keys are stable slugs, not command names — outcome variants get their own key.
 */
const NEXT_STEPS: Record<string, string> = {
    balance: "Wallets can be robbed — bank it with `{p}deposit`",
    deposit: "Upgrade capacity and earn interest in `{p}bank`",
    withdraw: "Wallet cash is rob-bait — a padlock from `{p}shop` slows thieves down",
    daily: "Stack `{p}weekly`, `{p}monthly`, and `{p}vote` rewards too",
    weekly: "Don't miss `{p}daily` and `{p}vote`",
    monthly: "Keep the streak: `{p}daily` and `{p}weekly`",
    vote: "Claim `{p}daily` while you're here",
    bank: "Need credit? `{p}card issue` gets you a Fortuna Card",
    card: "Keep your score healthy — check `{p}credit`",
    credit: "Manage cards with `{p}mycards`",
    beg: "Ready for bigger scores? Try `{p}crime`",
    crime_success: "Deposit it before someone robs you — `{p}deposit`",
    crime_jailed: "Check `{p}jail`, pay `{p}bail` to get out early",
    rob_success: "Bank the loot fast — `{p}deposit`",
    jail: "Pay `{p}bail` to get out early",
    bail: "Stay clean… or don't: `{p}crime`",
    shop_buy: "`{p}equip` gear, `{p}use` consumables, `{p}iteminfo` for details",
    inventory: "`{p}use`, `{p}equip`, or `{p}iteminfo <item>`",
    market: "Rare loot comes from `{p}hunt`",
    stock_trade: "Track P/L with `{p}my-stocks`",
    mystocks: "Trade with `{p}stock buy` / `{p}stock sell`",
    properties: "Collect income with `{p}collect-rent`",
    buy_property: "Collect income with `{p}collect-rent`",
    collect_rent: "Browse more with `{p}properties`",
    casino: "New here? `{p}casinoguide` explains every game",
    cockfight: "Raise your own fighter: `{p}chicken`",
    chicken: "Ready to fight? `{p}cockfight <amount>`",
    feed: "Train it too: `{p}chicken train`",
    jobs: "Apply with `{p}apply <job>`",
    apply: "Start your first shift: `{p}work`",
    work: "Promotions live in `{p}career`; stressed? `{p}relax`",
    career: "Better jobs unlock with degrees — `{p}education`",
    relax: "Back to the grind: `{p}work`",
    education: "Enroll with `{p}enroll <degree>`, then `{p}study`",
    enroll: "Hit the books: `{p}study`",
    study: "Ready? `{p}exam`. Stressed? `{p}relax`",
    exam_pass: "Higher-tier jobs just unlocked — `{p}jobs`",
    dropout: "Re-enroll anytime: `{p}enroll <degree>`",
    start: "Take the `{p}tutorial`, then grab your `{p}daily`",
    tutorial: "Grab `{p}daily`, get a job via `{p}jobs`, or hit `{p}casinoguide`",
};

/** Returns a "-# Tip: …" line for the key, or undefined if the key has no hint. */
export function nextStepHint(key: string, prefix: string = "!"): string | undefined {
    const hint = NEXT_STEPS[key];
    return hint ? `-# Tip: ${hint.split("{p}").join(prefix)}` : undefined;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add src/utils/componentsV2.ts src/config/nextSteps.ts
git commit -m @'
feat(v2): components V2 kit + next-step hint map

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: Payload audit script

**Files:**
- Create: `src/scripts/checkV2Payloads.ts` (absorbs `checkHuntPayload.ts`)
- Delete: `src/scripts/checkHuntPayload.ts`

**Interfaces:**
- Consumes: `buildHuntResultPayload` from `src/commands/games/hunt`; kit functions from Task 1.
- Produces: a CLI gate every later task runs. Exit 1 on any violation.

- [ ] **Step 1: Write `src/scripts/checkV2Payloads.ts`**

```ts
/**
 * ComponentsV2 payload audit. Discord rejects messages with > 40 total
 * components or > 4000 chars of text (50035 Invalid Form Body) — swallowed
 * silently by the global handler, so we gate on it here.
 *
 * Run: npx ts-node --transpile-only src/scripts/checkV2Payloads.ts
 */
import { buildHuntResultPayload } from "../commands/games/hunt";
import { ANIMAL_CATALOG } from "../utils/animalCatalog";
import type { HuntGroup } from "../services/huntService";
import { statusContainer, plainContainer } from "../utils/componentsV2";
import { nextStepHint } from "../config/nextSteps";

let failures = 0;

function countComponents(node: any): number {
    if (!node || typeof node !== "object") return 0;
    let count = 1;
    for (const child of node.components ?? []) count += countComponents(child);
    if (node.accessory) count += countComponents(node.accessory);
    return count;
}

function countChars(node: any): number {
    if (!node || typeof node !== "object") return 0;
    let chars = typeof node.content === "string" ? node.content.length : 0;
    for (const child of node.components ?? []) chars += countChars(child);
    if (node.accessory) chars += countChars(node.accessory);
    return chars;
}

function check(label: string, payload: { components: any[]; files?: any[] }) {
    const json = payload.components.map((c: any) => (typeof c.toJSON === "function" ? c.toJSON() : c));
    const components = json.reduce((sum: number, c: any) => sum + countComponents(c), 0);
    const chars = json.reduce((sum: number, c: any) => sum + countChars(c), 0);
    const files = payload.files?.length ?? 0;
    const ok = components <= 40 && chars <= 4000 && files <= 10;
    console.log(`${ok ? "PASS" : "FAIL"}: ${label} — ${components}/40 components, ${chars}/4000 chars, ${files}/10 files`);
    if (!ok) failures++;
}

// --- Kit sanity: worst-case long status message with a hint ---
const longDesc = "x".repeat(600);
check("statusContainer(success, long desc, hint)", {
    components: [statusContainer("success", "A Long Title For Auditing", longDesc, { hint: nextStepHint("deposit") })],
});
check("plainContainer x3 blocks", { components: [plainContainer("## A", "B".repeat(1000), "-# c")] });

// --- Hunt worst case: 5 species, zoo owned, recipe unlock (regression from checkHuntPayload) ---
const defs = ANIMAL_CATALOG.slice(0, 5);
const groups: HuntGroup[] = defs.map((def) => ({ animalKey: def.key, count: 3, def, ids: [] }));
check(
    "hunt worst case",
    buildHuntResultPayload("123456789012345678", groups, "legendary rifle", ["Fox Fur Cloak"], true),
);

if (failures > 0) {
    console.log(`\n${failures} payload(s) exceed Discord limits`);
    process.exit(1);
}
console.log("\nAll payloads within Discord limits");
```

- [ ] **Step 2: Run it (this is the failing/passing test)**

Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: 3 PASS lines + `All payloads within Discord limits`, exit 0.

- [ ] **Step 3: Delete the absorbed script**

```powershell
Remove-Item src/scripts/checkHuntPayload.ts
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -A src/scripts
git commit -m @'
feat(scripts): generalize hunt payload check into checkV2Payloads gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Strip accent colors from all existing V2 files

**Files (Modify — all 33):**
`src/commands/general/settings.ts`, `src/commands/economy/shop.ts`, `src/commands/economy/profile.ts`, `src/handlers/lifeInteractionHandler.ts`, `src/commands/life/work.ts`, `src/commands/life/jobs.ts`, `src/commands/economy/properties.ts`, `src/commands/games/cockfight.ts`, `src/services/globalEconomyReminderService.ts`, `src/services/huntCraftService.ts`, `src/handlers/marketInteractionHandler.ts`, `src/handlers/huntInteractionHandler.ts`, `src/handlers/bankInteractionHandler.ts`, `src/commands/life/relax.ts`, `src/commands/life/marriage.ts`, `src/commands/life/education.ts`, `src/commands/life/dailyQuest.ts`, `src/commands/life/career.ts`, `src/commands/general/tutorial.ts`, `src/commands/general/help.ts`, `src/commands/general/casinoGuide.ts`, `src/commands/games/slots.ts`, `src/commands/games/coinflip.ts`, `src/commands/economy/use.ts`, `src/commands/economy/stock.ts`, `src/commands/economy/leaderboard.ts`, `src/commands/economy/market.ts`, `src/commands/economy/inventory.ts`, `src/commands/economy/crimeUi.ts`, `src/commands/economy/card.ts`, `src/commands/economy/credit.ts`, `src/commands/economy/bank.ts`, `src/commands/admin/globalAnnouncement.ts`

- [ ] **Step 1: Enumerate every occurrence (76 expected)**

Run: `rg -n "setAccentColor" src/`

- [ ] **Step 2: Remove each call**

Two shapes exist; handle both:
- Chained: `new ContainerBuilder().setAccentColor(0x9b59b6)` → `new ContainerBuilder()`
- Statement: `container.setAccentColor(...);` → delete the line (including multi-line arguments).

Do NOT touch `Mascot.Colors` definitions in branding.ts yet (cleaned up in Task 10 if unreferenced).

- [ ] **Step 3: Verify zero remain**

Run: `rg -n "setAccentColor" src/`
Expected: no matches (exit 1).

- [ ] **Step 4: Typecheck + payload gate**

Run: `npm run typecheck` then `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`
Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add -A src/
git commit -m @'
style(v2): remove all container accent colors — no side stripe anywhere

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: commandRouter to V2 + delete dead pagination util

**Files:**
- Modify: `src/commandRouter.ts` (embed sites at lines 193-208, 222-226, 228-232, 244-253, 604-628)
- Delete: `src/utils/pagination.ts` (zero callers — dead code)

**Interfaces:**
- Consumes: `errorContainer`, `v2Reply` from `src/utils/componentsV2`; `getEmoteUrl`, `Mascot` from branding (both already imported).

- [ ] **Step 1: Swap imports**

Replace `import { errorEmbed } from "./utils/embed";` with:
```ts
import { errorContainer, v2Reply } from "./utils/componentsV2";
```

- [ ] **Step 2: Convert the five reply sites**

Temp-ban reply (`getUserRecord`):
```ts
await message.reply(
    v2Reply(errorContainer(
        "Banned",
        `You are banned from the casino until <t:${Math.floor(user.banExpiresAt.getTime() / 1000)}:R>.`
    ))
);
```
Permanent ban:
```ts
await message.reply(v2Reply(errorContainer("Banned", "You are permanently banned from the casino.")));
```
Developer-only:
```ts
return message.reply(v2Reply(errorContainer("Developer Only", DEVELOPER_ONLY_COMMAND_MESSAGE)));
```
Legacy-removed:
```ts
return message.reply(v2Reply(errorContainer("Removed Command", LEGACY_SYSTEM_REMOVED_MESSAGE)));
```
Jail restriction:
```ts
return message.reply(
    v2Reply(errorContainer(
        `${Mascot.Emotes.Lock} You are in Jail`,
        `You cannot perform this action while incarcerated. Use \`${prefix}jail\` to check your status or \`${prefix}bail\` to pay your way out.`
    ))
);
```
Default case (both branches keep the Think mascot via `thumbnailUrl` override):
```ts
default: {
    const validCommands = [ /* unchanged list */ ];
    const thinkUrl = getEmoteUrl(Mascot.Emotes.Think) ?? undefined;
    const bestMatch = findBestMatch(normalized, validCommands);

    if (bestMatch) {
        return message.reply(
            v2Reply(errorContainer("Unknown Command", `Did you mean \`${prefix}${bestMatch}\`?`, { thumbnailUrl: thinkUrl }))
        );
    }

    return message.reply(
        v2Reply(errorContainer(
            "Unknown Command",
            `Command not found. Try: \`${prefix}bal\`, \`${prefix}bank\`, \`${prefix}profile\`, \`${prefix}help\`.`,
            { thumbnailUrl: thinkUrl }
        ))
    );
}
```

- [ ] **Step 3: Delete dead pagination util**

```powershell
Remove-Item src/utils/pagination.ts
```
(Verified zero callers: `rg -n "sendPaginatedEmbed" src/` matches only its own definition.)

- [ ] **Step 4: Gates**

Run: `npm run typecheck`; `rg -n "EmbedBuilder|embeds:\s*\[" src/commandRouter.ts` → zero matches.

- [ ] **Step 5: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): router error/ban/jail replies on components V2; drop dead pagination util

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: Batch 1a — economy simple commands

Apply the Conversion Recipe to each file. These are all `message.reply({embeds:[...]})` status patterns with no collectors.

**Files (Modify):** with hint keys to wire on the main success site:
- `src/commands/economy/balance.ts` — replace `balanceEmbed` with the Recipe's balance mapping (statusContainer with Money-emote `thumbnailUrl` + hint `balance`)
- `src/commands/economy/deposit.ts` — hint `deposit` (worked example above, follow it exactly)
- `src/commands/economy/withdrawBank.ts` — hint `withdraw`
- `src/commands/economy/daily.ts` — hint `daily`
- `src/commands/economy/weekly.ts` — hint `weekly`
- `src/commands/economy/monthly.ts` — hint `monthly`
- `src/commands/economy/vote.ts` — hint `vote` (errors only today; wire hint only if a success site exists)
- `src/commands/economy/transfer.ts` — no hint
- `src/commands/economy/crime.ts` — errorEmbed sites only (crime UI is already V2 in crimeUi.ts); wire `crime_success`/`crime_jailed` hints into the V2 result containers in `src/commands/economy/crimeUi.ts` at the win/jail outcome builders
- `src/commands/economy/incomeCommands.ts` — hint `beg` on success
- `src/commands/economy/myStocks.ts` — errors only; the V2 portfolio screen gets hint `mystocks`
- `src/commands/economy/iteminfo.ts` — no hint
- `src/commands/economy/equip.ts` — no hint

- [ ] **Step 1: Convert every listed file per the Recipe**
- [ ] **Step 2: Gates**

Run: `npm run typecheck`
Run: `rg -n "EmbedBuilder|embeds:\s*\[|utils/embed" src/commands/economy/balance.ts src/commands/economy/deposit.ts src/commands/economy/withdrawBank.ts src/commands/economy/daily.ts src/commands/economy/weekly.ts src/commands/economy/monthly.ts src/commands/economy/vote.ts src/commands/economy/transfer.ts src/commands/economy/crime.ts src/commands/economy/incomeCommands.ts src/commands/economy/myStocks.ts src/commands/economy/iteminfo.ts src/commands/economy/equip.ts` → zero matches.
Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` → pass.

- [ ] **Step 3: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): economy simple commands on components V2 with next-step hints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: Batch 1b — economy flows + hints into existing V2 economy screens

**Files (Modify, atomic pairs in one commit):**
- `src/commands/economy/ask.ts` + `src/handlers/askInteractionHandler.ts` (accept/decline flow edits the message — convert together)
- `src/commands/economy/jail.ts` (hints: `jail` on status view, `bail` on successful bail) + `src/handlers/jailInteractionHandler.ts`
- `src/commands/economy/rob.ts` — hint `rob_success` on the success reply only
- `src/commands/economy/profile.ts` — convert the 1 remaining embed site to the file's existing V2 style

**Hints into already-V2 files (add `-# Tip:` line via `nextStepHint(key)` appended to the main container, after a no-divider small separator):**
- `src/commands/economy/bank.ts` → key `bank` (main dashboard container)
- `src/commands/economy/card.ts` → key `card`
- `src/commands/economy/credit.ts` → key `credit`
- `src/commands/economy/shop.ts` → key `shop_buy` (on the purchase-success container only, not the browse screen)
- `src/commands/economy/inventory.ts` → key `inventory`
- `src/commands/economy/market.ts` → key `market` (browse screen)
- `src/commands/economy/stock.ts` → key `stock_trade` (buy/sell success containers)
- `src/commands/economy/properties.ts` → keys `properties` (browse), `buy_property` (purchase success), `collect_rent` (collect success)

- [ ] **Step 1: Convert the four embed files per Recipe (flows atomically)**
- [ ] **Step 2: Wire hints into the eight V2 files**
- [ ] **Step 3: Gates**

Run: `npm run typecheck`
Run: `rg -n "EmbedBuilder|embeds:\s*\[|utils/embed" src/commands/economy/ask.ts src/handlers/askInteractionHandler.ts src/commands/economy/jail.ts src/handlers/jailInteractionHandler.ts src/commands/economy/rob.ts src/commands/economy/profile.ts` → zero matches.
Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` → pass.

- [ ] **Step 4: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): economy flows (ask/jail/rob/profile) on V2; hints across economy screens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 7: Batch 2a — casino game loops

These games edit their own messages mid-game (collectors) — each file converts fully in this task. All casino-game success/result containers get hint key `casino`.

**Files (Modify):**
- `src/commands/games/blackjack.ts` (12 embed sites; game loop `i.update` — action rows go inside the container)
- `src/commands/games/roulette.ts` (10 sites; includes `handleRouletteMenu` guide screen)
- `src/commands/games/russianRoulette.ts` (20 sites; multiplayer lobby edits)
- `src/commands/games/slots.ts` (5 remaining sites; file already has V2 patterns — match them)
- `src/commands/games/coinflip.ts` (8 remaining sites; same)

- [ ] **Step 1: Convert per Recipe** — lobby/game-state screens are `plainContainer`/bespoke containers; keep every stat line and button; buttons via `container.addActionRowComponents(row)`.
- [ ] **Step 2: Gates**

Run: `npm run typecheck`
Run: `rg -n "EmbedBuilder|embeds:\s*\[|utils/embed" src/commands/games/blackjack.ts src/commands/games/roulette.ts src/commands/games/russianRoulette.ts src/commands/games/slots.ts src/commands/games/coinflip.ts` → zero matches.
Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` → pass.

- [ ] **Step 3: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): casino game loops (blackjack/roulette/rr/slots/coinflip) on components V2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 8: Batch 2b — chicken/cockfight/feed + hunt remnants

**Files (Modify):**
- `src/commands/games/chicken.ts` (28 embed sites — the biggest game file; stats screen uses fields → markdown lines; hint `chicken` on main view)
- `src/commands/games/cockfight.ts` (19 remaining sites; already partly V2 — match its containers; hint `cockfight` on match-result success)
- `src/commands/games/feed.ts` (1 site; hint `feed` on success)
- `src/commands/games/hunt.ts` (3 remaining `errorEmbed` sites → `errorContainer`; result payload untouched)
- `src/handlers/huntInteractionHandler.ts` (4 `successEmbed` sites → `successContainer`, match file's V2 style)

- [ ] **Step 1: Convert per Recipe (chicken first — it's the long one)**
- [ ] **Step 2: Gates**

Run: `npm run typecheck`
Run: `rg -n "EmbedBuilder|embeds:\s*\[|utils/embed" src/commands/games/chicken.ts src/commands/games/cockfight.ts src/commands/games/feed.ts src/commands/games/hunt.ts src/handlers/huntInteractionHandler.ts` → zero matches.
Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` → pass.

- [ ] **Step 3: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): chicken, cockfight, feed, and hunt remnants on components V2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 9: Batch 3 — life module + lifeInteractionHandler

**Files (Modify, one commit — the handler serves all these commands' buttons):**
- `src/handlers/lifeInteractionHandler.ts` (24 embed sites — largest single file; already half-V2, match its container style)
- `src/commands/life/apply.ts` (hint `apply` on hire success)
- `src/commands/life/enroll.ts` (hints: `enroll` on enroll success, `exam_pass` on exam pass in `handleExam`)
- `src/commands/life/study.ts` (hint `study` on study-session success)
- `src/commands/life/dropout.ts` (hint `dropout` on confirmation success)
- `src/commands/life/education.ts` (4 remaining errorEmbed sites; dashboard already V2 — add hint `education` to its main container)

**Hints into already-V2 life files:**
- `src/commands/life/jobs.ts` → `jobs`; `src/commands/life/work.ts` → `work` (shift result); `src/commands/life/career.ts` → `career`; `src/commands/life/relax.ts` → `relax` (activity result)

- [ ] **Step 1: Convert per Recipe (lifeInteractionHandler first, then commands)**
- [ ] **Step 2: Gates**

Run: `npm run typecheck`
Run: `rg -n "EmbedBuilder|embeds:\s*\[|utils/embed" src/handlers/lifeInteractionHandler.ts src/commands/life/apply.ts src/commands/life/enroll.ts src/commands/life/study.ts src/commands/life/dropout.ts src/commands/life/education.ts` → zero matches.
Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` → pass.

- [ ] **Step 3: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): life module (apply/enroll/study/dropout/education + handler) on components V2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 10: Batch 4 — general + admin commands

Admin commands get **no hints** (rule). `testwelcome`/`start` banner images use MediaGallery (Recipe `setImage` mapping).

**Files (Modify):**
- General: `src/commands/general/ping.ts`, `src/commands/general/start.ts` (hint `start`), plus hint `tutorial` into already-V2 `src/commands/general/tutorial.ts`
- Admin: `src/commands/admin/setPrefix.ts`, `setMoney.ts`, `addMoney.ts`, `removeMoney.ts`, `removeItem.ts`, `resetEconomy.ts`, `resetShop.ts`, `addShopItem.ts`, `manageShop.ts`, `manageCreditScore.ts`, `adminProperty.ts`, `educationAdmin.ts`, `addEmoji.ts`, `testwelcome.ts`

- [ ] **Step 1: Convert per Recipe**
- [ ] **Step 2: Gates**

Run: `npm run typecheck`
Run: `rg -n "EmbedBuilder|embeds:\s*\[|utils/embed" src/commands/general/ src/commands/admin/` → zero matches.
Run: `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts` → pass.

- [ ] **Step 3: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): general + admin commands on components V2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 11: Batch 5 — services/listeners + teardown

**Files:**
- Modify: `src/services/taxService.ts` (DM embed → `v2Reply(statusContainer(...))` via `user.send`), `src/utils/discordLogger.ts` (ops log embed → `plainContainer` lines), `src/listeners/guildCreateListener.ts` (welcome embed → container; banner via MediaGallery)
- Delete: `src/utils/embed.ts`
- Maybe modify: `src/config/branding.ts` (remove `Mascot.Colors` ONLY if `rg -n "Mascot.Colors" src/` has zero matches after the deletions)

- [ ] **Step 1: Convert the three files per Recipe**
- [ ] **Step 2: Delete the old helper**

```powershell
Remove-Item src/utils/embed.ts
```

- [ ] **Step 3: Repo-wide sweep — the migration's definition of done**

Run each; ALL must return zero matches in `src/`:
```
rg -n "EmbedBuilder" src/
rg -n "embeds:\s*\[" src/
rg -n "utils/embed" src/
rg -n "setAccentColor|setFooter\(|setTimestamp\(" src/
```

- [ ] **Step 4: Conditional Colors cleanup**

Run: `rg -n "Mascot.Colors" src/` — if zero matches, delete the `Colors` block from `src/config/branding.ts`; else leave it.

- [ ] **Step 5: Full gates**

Run: `npm run typecheck`; `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`; `npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add -A src/
git commit -m @'
feat(v2): services + listeners on components V2; delete legacy embed helper

Embeds are now fully removed from the bot.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 12: Live smoke test, fix, and push to main

- [ ] **Step 1: Start the bot**

Run: `npm run dev` (background). Expected: login success, no startup errors.

- [ ] **Step 2: Exercise commands in the test guild** (user drives or dev exercises where possible), watching logs for `50035`, `50006`, `Invalid Form Body`, or unhandled rejections. Minimum checklist — one command per migrated surface:
`!balance`, `!deposit 100`, `!withdraw 100`, `!daily`, `!vote`, `!beg`, `!crime`, `!jail`, `!rob @user`, `!ask @user 10`, `!blackjack 100` (play a full hand), `!bet 100 red`, `!rr 100`, `!slots 100`, `!coinflip 100`, `!chicken`, `!cockfight 100`, `!feed`, `!hunt`, `!jobs`, `!apply <job>`, `!work`, `!study`, `!enroll <degree>`, `!education`, `!start`, `!help`, an unknown command (router default), one admin command (`!addmoney`), `!testwelcome`.

- [ ] **Step 3: Fix anything that errors** (repeat Steps 1-2 until clean), committing fixes as `fix(v2): <what>` with the co-author trailer.

- [ ] **Step 4: Push**

```powershell
git push origin main
```
Expected: success; remote `main` contains all batch commits.
