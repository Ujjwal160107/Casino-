# Leaderboard V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `!leaderboard` becomes a Components V2 page with type + scope dropdowns, where Net Worth is a player's true net worth (wallet, bank, investments, stocks, properties, animals, items) with passive income/day shown.

**Architecture:** New `netWorthService` computes a cached per-player breakdown (Redis, 600s TTL). `leaderboard.ts` is fully rewritten: four boards (net/cash/bank/shifts), two scopes (global/server), two StringSelect menus, owner-locked collector.

**Tech Stack:** TypeScript, discord.js v14 (StringSelectMenuBuilder), Prisma (MongoDB), ioredis via `redisService`.

**Spec:** `docs/superpowers/specs/2026-07-13-leaderboard-v2-design.md`

## Global Constraints

- Net worth breakdown fields exactly per spec: wallet, bank, investments (ACTIVE FD/RD `Investment.amount`), stocks (`quantity × Stock.currentPrice`), properties (`property.price`), animals (`getAnimal(animalKey).sellValue`), items (`Inventory.amount × ShopItem.price`), `passiveIncomePerDay` (property `incomePerCycle × Math.floor(24 / incomeCycleHours)` + `zooIncomePerHour × 24` for `inZoo` animals), `total` = the seven value fields (passive income is a rate, NOT in total).
- Redis cache key `networth:<discordId>`, TTL 600s; compute misses in chunks of 10; any sub-lookup failure → component = 0, logged, never thrown.
- Boards: `net`, `cash` (wallet), `bank` (bank + investments), `shifts` (`shiftsWorked`). Args: `cash|bank|net|shifts` preselect; `work`/`employees`/`employee`/`shift` → shifts (back-compat).
- Scopes: `global` default; `server` = intersect with `message.guild.members.fetch()` ids.
- Owner-locked, 120s collector, selects disabled on expiry — same lifecycle as the current file.
- Verification: `npx tsc --noEmit` 0 errors; site build for docs task.
- Commits: conventional + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: netWorthService

**Files:**
- Create: `src/services/netWorthService.ts`

**Interfaces:**
- Consumes: `prisma`, `redisService`, `getAnimal` from `../utils/animalCatalog`.
- Produces: `NetWorthBreakdown` (shape below), `getNetWorth(discordId): Promise<NetWorthBreakdown>`, `getNetWorthMany(discordIds: string[]): Promise<Map<string, NetWorthBreakdown>>`.

- [ ] **Step 1: Create `src/services/netWorthService.ts`:**

```ts
import prisma from "../utils/prisma";
import { redisService } from "./redisService";
import { getAnimal } from "../utils/animalCatalog";

export interface NetWorthBreakdown {
  wallet: number;
  bank: number;
  investments: number;
  stocks: number;
  properties: number;
  animals: number;
  items: number;
  passiveIncomePerDay: number;
  total: number;
}

const CACHE_TTL_SECONDS = 600;
const COMPUTE_CHUNK = 10;

const cacheKey = (discordId: string) => `networth:${discordId}`;

async function computeNetWorth(discordId: string): Promise<NetWorthBreakdown> {
  const breakdown: NetWorthBreakdown = {
    wallet: 0, bank: 0, investments: 0, stocks: 0,
    properties: 0, animals: 0, items: 0,
    passiveIncomePerDay: 0, total: 0,
  };

  const safely = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) {
      console.error(`netWorth ${label} failed for ${discordId}:`, err);
    }
  };

  await Promise.all([
    safely("wallet", async () => {
      const w = await prisma.wallet.findUnique({ where: { userId: discordId } });
      breakdown.wallet = w?.balance ?? 0;
    }),
    safely("bank", async () => {
      const b = await prisma.bank.findUnique({ where: { userId: discordId } });
      breakdown.bank = b?.balance ?? 0;
    }),
    safely("investments", async () => {
      const list = await prisma.investment.findMany({ where: { userId: discordId, status: "ACTIVE" } });
      breakdown.investments = list.reduce((s, i) => s + (i.amount || 0), 0);
    }),
    safely("stocks", async () => {
      const portfolio = await prisma.portfolio.findUnique({
        where: { userId: discordId },
        include: { holdings: { include: { stock: true } } },
      });
      breakdown.stocks = (portfolio?.holdings ?? []).reduce(
        (s, h) => s + h.quantity * (h.stock?.currentPrice ?? 0), 0);
    }),
    safely("properties", async () => {
      const owned = await prisma.ownedProperty.findMany({
        where: { userId: discordId },
        include: { property: true },
      });
      breakdown.properties = owned.reduce((s, o) => s + (o.property?.price ?? 0), 0);
      breakdown.passiveIncomePerDay += owned.reduce((s, o) => {
        const p = o.property;
        if (!p || !p.incomeCycleHours) return s;
        return s + p.incomePerCycle * Math.floor(24 / p.incomeCycleHours);
      }, 0);
    }),
    safely("animals", async () => {
      const caught = await prisma.caughtAnimal.findMany({ where: { discordId } });
      for (const c of caught) {
        const def = getAnimal(c.animalKey);
        if (!def) continue;
        breakdown.animals += def.sellValue ?? 0;
        if (c.inZoo) breakdown.passiveIncomePerDay += (def.zooIncomePerHour ?? 0) * 24;
      }
    }),
    safely("items", async () => {
      const inv = await prisma.inventory.findMany({
        where: { userId: discordId },
        include: { shopItem: true },
      });
      breakdown.items = inv.reduce((s, i) => s + i.amount * (i.shopItem?.price ?? 0), 0);
    }),
  ]);

  breakdown.total =
    breakdown.wallet + breakdown.bank + breakdown.investments +
    breakdown.stocks + breakdown.properties + breakdown.animals + breakdown.items;
  return breakdown;
}

export async function getNetWorth(discordId: string): Promise<NetWorthBreakdown> {
  const cached = await redisService.get<NetWorthBreakdown>(cacheKey(discordId));
  if (cached) return cached;
  const fresh = await computeNetWorth(discordId);
  await redisService.set(cacheKey(discordId), fresh, CACHE_TTL_SECONDS);
  return fresh;
}

export async function getNetWorthMany(discordIds: string[]): Promise<Map<string, NetWorthBreakdown>> {
  const result = new Map<string, NetWorthBreakdown>();
  const misses: string[] = [];

  for (const id of discordIds) {
    const cached = await redisService.get<NetWorthBreakdown>(cacheKey(id));
    if (cached) result.set(id, cached);
    else misses.push(id);
  }

  for (let i = 0; i < misses.length; i += COMPUTE_CHUNK) {
    const chunk = misses.slice(i, i + COMPUTE_CHUNK);
    const computed = await Promise.all(chunk.map(async (id) => [id, await computeNetWorth(id)] as const));
    for (const [id, breakdown] of computed) {
      result.set(id, breakdown);
      await redisService.set(cacheKey(id), breakdown, CACHE_TTL_SECONDS);
    }
  }

  return result;
}
```

- [ ] **Step 2: Typecheck:** `npx tsc --noEmit` — expected 0 errors. (If `prisma.bank` model name differs — check `grep -n "model Bank" prisma/schema.prisma` — adjust to the actual client accessor.)

- [ ] **Step 3: Commit**

```bash
git add src/services/netWorthService.ts
git commit -m "feat(economy): netWorthService - cached true net worth breakdown"
```

---

### Task 2: Rewrite leaderboard.ts

**Files:**
- Modify (replace entire file): `src/commands/economy/leaderboard.ts`

**Interfaces:**
- Consumes: `getNetWorthMany`, `NetWorthBreakdown` from `../../services/netWorthService`; existing `prisma`, `fmtCurrency`, `Mascot`, `getEmoteUrl`.
- Produces: `handleLeaderboard(message, args)` (same export name — commandRouter unchanged).

- [ ] **Step 1: Replace the entire file with:**

```ts
import {
    ActionRowBuilder,
    ComponentType,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getNetWorthMany, NetWorthBreakdown } from "../../services/netWorthService";

type LbType = "net" | "cash" | "bank" | "shifts";
type LbScope = "global" | "server";

const ACCENT: Record<LbType, number> = {
    net: 0x9B59B6,
    cash: 0x2ECC71,
    bank: 0x3498DB,
    shifts: 0xE67E22,
};

const TITLES: Record<LbType, string> = {
    net: "Net Worth Leaderboard",
    cash: "Cash Leaderboard",
    bank: "Bank Leaderboard",
    shifts: "Top Workers",
};

const SUBTITLES: Record<LbType, string> = {
    net: "True net worth — everything you own, priced",
    cash: "Highest wallet balance",
    bank: "Bank balance + active FD/RD deposits",
    shifts: "Most lifetime shifts worked",
};

type LbUser = {
    discordId: string;
    username: string | null;
    walletBalance: number;
    bankBalance: number;
    shiftsWorked: number;
    net?: NetWorthBreakdown;
};

function rankLabel(i: number): string {
    if (i === 0) return Mascot.Emotes.MedalGold;
    if (i === 1) return Mascot.Emotes.MedalSilver;
    if (i === 2) return Mascot.Emotes.MedalBronze;
    return `**${i + 1}.**`;
}

function valueOf(u: LbUser, type: LbType): number {
    switch (type) {
        case "net": return u.net?.total ?? (u.walletBalance + u.bankBalance);
        case "cash": return u.walletBalance;
        case "bank": return u.bankBalance + (u.net?.investments ?? 0);
        case "shifts": return u.shiftsWorked;
    }
}

function formatValue(u: LbUser, type: LbType): string {
    if (type === "shifts") return `${u.shiftsWorked.toLocaleString()} shifts`;
    const base = fmtCurrency(valueOf(u, type));
    if (type === "net" && u.net && u.net.passiveIncomePerDay > 0) {
        return `${base} · ⚡${fmtCurrency(u.net.passiveIncomePerDay)}/day`;
    }
    return base;
}

function sortUsers(users: LbUser[], type: LbType): LbUser[] {
    return [...users].sort((a, b) => valueOf(b, type) - valueOf(a, type));
}

function buildRankingsText(users: LbUser[], type: LbType): string {
    const top10 = sortUsers(users, type).slice(0, 10);
    if (top10.length === 0) return "No players found.";
    return top10
        .map((u, i) => `${rankLabel(i)} **${u.username ?? "Unknown"}** — ${formatValue(u, type)}`)
        .join("\n");
}

function buildYourRankText(users: LbUser[], ownerId: string, type: LbType): string | null {
    const sorted = sortUsers(users, type);
    const idx = sorted.findIndex((u) => u.discordId === ownerId);
    if (idx === -1) return null;
    const u = sorted[idx];
    let line = `${Mascot.Emotes.Think} You are ranked **#${idx + 1}** — ${formatValue(u, type)}`;
    if (type === "net" && u.net) {
        const b = u.net;
        line += `\n-# wallet ${fmtCurrency(b.wallet)} · bank ${fmtCurrency(b.bank + b.investments)} · stocks ${fmtCurrency(b.stocks)} · property ${fmtCurrency(b.properties)} · items ${fmtCurrency(b.items)} · animals ${fmtCurrency(b.animals)}`;
    }
    return line;
}

function buildTypeSelect(active: LbType, ownerId: string, disabled = false) {
    const options: [LbType, string, string][] = [
        ["net", "Net Worth", "Everything you own, priced"],
        ["cash", "Cash", "Wallet only"],
        ["bank", "Bank", "Bank + FD/RD deposits"],
        ["shifts", "Shifts", "Lifetime shifts worked"],
    ];
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`lb:type:${ownerId}`)
            .setPlaceholder("Board")
            .setDisabled(disabled)
            .addOptions(options.map(([value, label, description]) =>
                new StringSelectMenuOptionBuilder()
                    .setValue(value)
                    .setLabel(label)
                    .setDescription(description)
                    .setDefault(value === active),
            )),
    );
}

function buildScopeSelect(active: LbScope, ownerId: string, disabled = false) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`lb:scope:${ownerId}`)
            .setPlaceholder("Scope")
            .setDisabled(disabled)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setValue("global").setLabel("Global")
                    .setDescription("Every Fortuna player, every server")
                    .setDefault(active === "global"),
                new StringSelectMenuOptionBuilder()
                    .setValue("server").setLabel("This Server")
                    .setDescription("Only players in this server")
                    .setDefault(active === "server"),
            ),
    );
}

function buildLeaderboardContainer(
    users: LbUser[],
    type: LbType,
    scope: LbScope,
    ownerId: string,
    expired = false,
) {
    const thumbUrl = getEmoteUrl(type === "shifts" ? Mascot.Emotes.JobWorking : Mascot.Emotes.Money);
    const scopeLabel = scope === "global" ? "Global" : "This server";

    const header = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.MedalGold} ${TITLES[type]}`),
        new TextDisplayBuilder().setContent(`${SUBTITLES[type]} · ${scopeLabel}`),
    );
    if (thumbUrl) {
        header.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl).setDescription(TITLES[type]));
    }

    const container = new ContainerBuilder()
        .setAccentColor(ACCENT[type])
        .addSectionComponents(header)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildRankingsText(users, type)));

    const yourRank = buildYourRankText(users, ownerId, type);
    if (yourRank) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(yourRank));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(buildTypeSelect(type, ownerId, expired))
        .addActionRowComponents(buildScopeSelect(scope, ownerId, expired));

    return container;
}

async function loadUsers(): Promise<LbUser[]> {
    const users = await prisma.user.findMany({ include: { wallet: true, bank: true } });
    return users.map((u: any) => ({
        discordId: u.discordId,
        username: u.username ?? null,
        walletBalance: u.wallet?.balance ?? 0,
        bankBalance: u.bank?.balance ?? 0,
        shiftsWorked: u.shiftsWorked ?? 0,
    }));
}

async function attachNetWorth(users: LbUser[]): Promise<void> {
    const missing = users.filter((u) => !u.net);
    if (missing.length === 0) return;
    const map = await getNetWorthMany(missing.map((u) => u.discordId));
    for (const u of missing) {
        const b = map.get(u.discordId);
        if (b) u.net = b;
    }
}

export async function handleLeaderboard(message: Message, args: string[]) {
    const ownerId = message.author.id;

    let currentType: LbType = "net";
    const arg = args[0]?.toLowerCase();
    if (arg === "cash") currentType = "cash";
    if (arg === "bank") currentType = "bank";
    if (arg === "net") currentType = "net";
    if (arg === "shifts" || arg === "work" || arg === "shift" || arg === "employees" || arg === "employee") currentType = "shifts";

    let currentScope: LbScope = "global";

    const allUsers = await loadUsers();
    let serverMemberIds: Set<string> | null = null;

    const scopedUsers = async (): Promise<LbUser[]> => {
        if (currentScope === "global") return allUsers;
        if (!serverMemberIds) {
            const members = await message.guild!.members.fetch();
            serverMemberIds = new Set(members.keys());
        }
        return allUsers.filter((u) => serverMemberIds!.has(u.discordId));
    };

    const render = async (): Promise<ContainerBuilder> => {
        const users = await scopedUsers();
        if (currentType === "net" || currentType === "bank") {
            await attachNetWorth(users);
        }
        return buildLeaderboardContainer(users, currentType, currentScope, ownerId);
    };

    const sent = await message.reply({
        components: [await render()],
        flags: MessageFlags.IsComponentsV2,
    });

    const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120_000,
    });

    collector.on("collect", async (i) => {
        if (i.user.id !== ownerId) {
            await i.reply({ content: "This leaderboard was opened by someone else.", ephemeral: true });
            return;
        }
        const kind = i.customId.split(":")[1];
        const value = i.values[0];
        if (kind === "type") currentType = value as LbType;
        if (kind === "scope") currentScope = value as LbScope;
        await i.update({
            components: [await render()],
            flags: MessageFlags.IsComponentsV2,
        });
    });

    collector.on("end", async () => {
        try {
            const users = await scopedUsers();
            await sent.edit({
                components: [buildLeaderboardContainer(users, currentType, currentScope, ownerId, true)],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch { }
    });
}
```

- [ ] **Step 2: Typecheck:** `npx tsc --noEmit` — expected 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/economy/leaderboard.ts
git commit -m "feat(lb): V2 leaderboard page - type+scope dropdowns, true net worth with passive income"
```

---

### Task 3: Website docs

**Files:**
- Modify: `dashboard/src/content/commands.ts` (leaderboard entry)
- Modify: `dashboard/src/content/modules/economy.ts` (leaderboard mention, if present)

- [ ] **Step 1:** leaderboard entry: `usage: "!leaderboard [net|cash|bank|shifts]"`; update `short`/args to describe the four boards, the Global↔This Server scope dropdown, and that Net Worth prices everything owned (wallet, bank, FD/RD, stocks, property, items, animals) and shows passive income/day. Keep aliases as-is.
- [ ] **Step 2:** economy module: update any sentence describing the leaderboard boards (grep `leaderboard` in the module) to name the four boards + scopes.
- [ ] **Step 3:** Build: `cd dashboard && npx next build` — expected: success.
- [ ] **Step 4: Commit**

```bash
git add dashboard/src/content/commands.ts dashboard/src/content/modules/economy.ts
git commit -m "docs(web): leaderboard V2 - four boards, scopes, true net worth"
```

## Plan Self-Review Notes (already applied)

- Spec coverage: breakdown fields/cache/chunking ✓ (Task 1), four boards + scopes + selects + owner lock + expiry ✓ (Task 2), args back-compat incl. `work`→shifts and `!lb-wallet`→cash (router already passes `["cash"]`) ✓, docs ✓.
- `bank` board includes investments only when breakdowns are attached — `attachNetWorth` runs for both `net` AND `bank` types (see `render()`), so `u.net.investments` is populated when needed.
- Type consistency: `getNetWorthMany`/`NetWorthBreakdown` names match Task 1 exactly; `handleLeaderboard` export unchanged for the router.
- Prisma client accessor check in Task 1 Step 2 covers the only uncertain model name (`bank`).
