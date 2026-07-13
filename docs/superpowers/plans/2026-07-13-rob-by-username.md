# Rob by Username Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `!rob` accepts a mention, a raw user ID, or an exact username (case-insensitive) resolved against Fortuna's player database — enabling cross-server robbery.

**Architecture:** A `resolveRobTarget` helper in rob.ts normalizes all three input forms to `{ id, name }`; the rest of the command is a mechanical rename from the old GuildMember fields. No new files, no schema changes.

**Tech Stack:** TypeScript, discord.js v14, Prisma (MongoDB — string filters support `mode: "insensitive"`).

**Spec:** `docs/superpowers/specs/2026-07-13-rob-by-username-design.md`

## Global Constraints

- Resolution order exactly: mention → 17–20 digit ID → exact case-insensitive username. Never create an account for the target (`prisma.user.findUnique/findMany` only — no ensure).
- Error copy verbatim from the spec ("No Fortuna player named **{name}**…", "Multiple players share that name…").
- Existing behavior preserved: self-rob error, bot-mention error, padlock/armor/DM flow untouched apart from the field rename.
- Verification: `npx tsc --noEmit` (0 new errors); site build for the docs task.
- Commits: conventional + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Target resolution in rob.ts

**Files:**
- Modify: `src/commands/economy/rob.ts` (target block at ~lines 30–33; every `targetUser.*` reference — grep lists 17 sites)

**Interfaces:**
- Produces (file-local): `resolveRobTarget(message: Message, args: string[]): Promise<{ id: string; name: string } | { error: string }>`.

- [ ] **Step 1: Add the resolver** above `handleRob` in `src/commands/economy/rob.ts`:

```ts
type RobTarget = { id: string; name: string };

async function resolveRobTarget(
    message: Message,
    args: string[],
): Promise<RobTarget | { error: string }> {
    const mention = message.mentions.members?.first();
    if (mention) {
        if (mention.user.bot) return { error: "Bots are broke." };
        return { id: mention.id, name: mention.displayName };
    }

    const raw = args[0]?.replace(/[<@!>]/g, "").trim();
    if (!raw) {
        return { error: "Rob who? Mention them, or use their username or user ID." };
    }

    if (/^\d{17,20}$/.test(raw)) {
        const target = await prisma.user.findUnique({ where: { discordId: raw } });
        if (!target) return { error: "No Fortuna player with that ID." };
        const member = message.guild?.members.cache.get(raw);
        return { id: target.discordId, name: member?.displayName ?? target.username };
    }

    const matches = await prisma.user.findMany({
        where: { username: { equals: raw, mode: "insensitive" } },
        take: 2,
    });
    if (matches.length === 0) {
        return { error: `No Fortuna player named **${raw}**. Names must match exactly — or use their user ID.` };
    }
    if (matches.length > 1) {
        return { error: "Multiple players share that name — rob them by user ID instead." };
    }
    const member = message.guild?.members.cache.get(matches[0].discordId);
    return { id: matches[0].discordId, name: member?.displayName ?? matches[0].username };
}
```

- [ ] **Step 2: Replace the target block.** Replace:

```ts
    const targetUser = message.mentions.members?.first();
    if (!targetUser) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Mention a user to rob.")] });
    if (targetUser.id === message.author.id) return message.reply({ embeds: [errorEmbed(message.author, "Error", "You cannot rob yourself.")] });
    if (targetUser.user.bot) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Bots are broke.")] });
```

with:

```ts
    const resolved = await resolveRobTarget(message, args);
    if ("error" in resolved) {
        return message.reply({ embeds: [errorEmbed(message.author, "Error", resolved.error)] });
    }
    const target = resolved;
    if (target.id === message.author.id) return message.reply({ embeds: [errorEmbed(message.author, "Error", "You cannot rob yourself.")] });
```

- [ ] **Step 3: Rename the remaining references** (grep `targetUser` — 14 remaining sites): `targetUser.id` → `target.id`; `targetUser.displayName` → `target.name`; `targetUser.user.username` → `target.name` (the `ensureBankingUser` call — the target's account already exists for ID/username paths; for the mention path `ensureBankingUser` keeps its create-if-missing role using the display name, which matches how usernames are stored elsewhere).

Run: `grep -n "targetUser" src/commands/economy/rob.ts`
Expected: no matches.

- [ ] **Step 4: Typecheck:**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy/rob.ts
git commit -m "feat(rob): rob by username or user ID - cross-server robbery"
```

---

### Task 2: Website docs

**Files:**
- Modify: `dashboard/src/content/commands.ts` (rob entry)
- Modify: `dashboard/src/content/modules/crime-and-heat.ts` (robbery section)

- [ ] **Step 1:** rob entry: `usage: "!rob <@user | username>"`, add/extend `args` with `{ name: "@user | username", desc: "A mention, exact username, or user ID — works across servers." }`, and extend `examples` with `"!rob riko"`.
- [ ] **Step 2:** crime-and-heat robbery section body — append one sentence to the first paragraph: `"You don't even need them in the room: !rob works by exact username or user ID, across every server Fortuna is in."`
- [ ] **Step 3:** Build: `cd dashboard && npx next build` — expected: success.
- [ ] **Step 4: Commit**

```bash
git add dashboard/src/content/commands.ts dashboard/src/content/modules/crime-and-heat.ts
git commit -m "docs(web): rob works by username across servers"
```

## Plan Self-Review Notes (already applied)

- Spec coverage: resolution order ✓, no account creation for target ✓ (resolver only reads; mention path unchanged semantics), error copy ✓, docs ✓.
- `mode: "insensitive"` is valid for Prisma MongoDB string filters.
- The success-embed and fine-path `targetUser.id` references are covered by the Step 3 rename (verified count: 17 total references, 3 replaced in Step 2, 14 renamed in Step 3).
