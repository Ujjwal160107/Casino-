# Fortuna Website V2 Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public website (`dashboard/` Next.js app) as a flat, playful, personality-driven site: new landing page, complete `/commands` reference, 10 module docs pages, restyled changelog/legal, with team page, admin page, and every "AI-feel" visual effect removed.

**Architecture:** Typed content data (`src/content/`) rendered by shared flat UI primitives. Pages are server components; interactivity (commands search, nav) is in small client components. Existing next-auth Discord OAuth, Prisma, Redis, and top.gg review fetching stay untouched.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (CSS-first `@theme` tokens), framer-motion (restrained), next-auth v4, lucide-react, `next/font` (Bricolage Grotesque, Inter, JetBrains Mono).

**Spec:** `docs/superpowers/specs/2026-07-05-website-v2-refactor-design.md`
**Content source of truth:** `docs/superpowers/specs/2026-07-05-website-v2-refactor-command-inventory.md` (referred to below as **INVENTORY**). Every number shown on the site must come from INVENTORY — never invent or estimate values.
**Design rationale:** `docs/superpowers/specs/2026-07-05-website-v2-refactor-competitor-research.md`

## Global Constraints

- **Working directory:** all `npm` commands run in `dashboard/`. Build = `npm run build` (runs prisma generate first; needs `../prisma/schema.prisma`, which exists). No test runner exists — verification is build + grep + Playwright browser smoke.
- **BANNED CSS (grep-enforced in Task 11):** any `gradient` (incl. `bg-gradient-*`, `bg-clip-text`), `backdrop-blur`, glassmorphism (translucent panel + blur), particles, glow shadows (`drop-shadow-[0_0_...`, `shadow-[0_0_...`), floating/parallax animations. Flat surfaces + 1px hairline borders only.
- **Color tokens (exact):** bg `#0E0F13`, panel `#15171C`, panel-2 `#1B1E24`, line `#26282F`, ink `#F2F3F5`, muted `#9BA0AA`, gold `#FFB627` (primary accent), gold-deep `#E09B00` (hover), felt `#2F9E6E`, chip `#E5484D`, card-blue `#4C8DFF`. Accent is GOLD — never blurple/violet for Fortuna UI (Discord-colored elements inside `DiscordMockup` are the only exception).
- **Fonts:** display = Bricolage Grotesque (`font-display`), body = Inter (`font-body`), mono = JetBrains Mono (`font-mono`). All via `next/font/google` — no `<link>` font tags.
- **Voice:** every user-facing string is in-character (confident dealer energy). No corporate filler ("Engage your community", "Level up your server"). Headings may be questions or commands. Empty states too.
- **Honesty:** no fabricated stats or server counts. Only real numbers from INVENTORY and real top.gg reviews.
- **V2 framing:** copy says "one wallet across every server" (avoid the word "global" as jargon); gambling is wallet-only; the only per-server setting is the prefix; credit cards can never fund gambling.
- **Prefix in copy:** always `!` (e.g. `!work`). Command strings render in `font-mono`.
- **Accessibility:** visible `:focus-visible` outline (gold), `prefers-reduced-motion` respected globally, body text contrast ≥ 4.5:1 (muted `#9BA0AA` on `#0E0F13` passes), CTA text is dark-on-gold (`#0E0F13` on `#FFB627`).
- **Skills (user-mandated):** implementers of Tasks 6–9 must load `frontend-design` and `ui-ux-pro-max` before writing UI code, and follow `motion-design` restraint rules (no motion longer than 500ms, opacity/transform only, `once: true`). Task 12 must run the `web-design-guidelines` review.
- **Keep untouched:** `src/lib/auth.ts`, `src/lib/prisma.ts`, `src/lib/redis.ts`, `src/lib/cache.ts`, `src/lib/topgg-reviews.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/components/Providers.tsx`, `prisma/`, `src/types/next-auth.d.ts`.
- **External URLs (exact):** bot invite `https://discord.com/oauth2/authorize?client_id=1371816936857669702&permissions=268823672&scope=bot%20applications.commands` · support server `https://discord.gg/Y5P44UCH2Y` · vote `https://top.gg/bot/1371816936857669702?s=0825a328ae527`.
- **Commit style:** conventional commits, one commit per task, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

## File Map

| Task | Creates | Modifies | Deletes |
|------|---------|----------|---------|
| 1 | `public/cards/*.png` | `src/app/globals.css`, `src/app/layout.tsx` | — |
| 2 | `src/components/ui/{Panel,Tag,CommandString,SectionHeader,FadeUp,DiscordMockup}.tsx` | — | — |
| 3 | `src/content/types.ts`, `src/content/commands.ts` | — | — |
| 4 | `src/content/modules/{getting-started,economy,bank-and-credit,casino}.ts`, `src/content/modules/index.ts` | — | — |
| 5 | `src/content/modules/{jobs-and-careers,education,items-and-shop,hunting-and-animals,investments,life-and-social}.ts` | `src/content/modules/index.ts` | — |
| 6 | `src/lib/links.ts` | `src/components/LandingNavbar.tsx`, `src/components/Footer.tsx`, `src/components/MobileSidebar.tsx` (full rewrites) | — |
| 7 | `src/components/landing/{Hero,WhatYouDo,FeatureSplit,LandingFeatures,BeginnerPath,FinalCTA}.tsx` | `src/app/page.tsx`, `src/components/landing/TopGGReviews.tsx` | old `src/components/Hero.tsx` |
| 8 | `src/app/commands/page.tsx` (new file at this path), `src/components/commands/CommandsExplorer.tsx` | — | — |
| 9 | `src/app/docs/[module]/page.tsx`, `src/components/docs/{DocsSidebar,ModuleRenderer}.tsx` | `src/app/docs/page.tsx` (full rewrite), `next.config.ts` (redirect) | — |
| 10 | — | `src/app/changelog/page.tsx`, `src/app/policy/page.tsx`, `src/app/terms/page.tsx` (restyle in place) | — |
| 11 | — | — | `src/app/team/`, `src/app/commands/admin/`, `src/app/docs/commands/`, `src/components/{AmbientBackground,CursorSpotlight,FloatingParticles,InteractiveCardDeck,PokerCard,FeatureSection,GeneralSidebar}.tsx`, `src/components/ui/{BackgroundParticles,GlassCard,ScrollReveal,TextGlow}.tsx`, `src/components/docs/SharedDocs.tsx` |
| 12 | — | fixes from QA findings | — |

Note on Task 8/11 ordering: `src/app/commands/admin/page.tsx` still exists (and imports old components) until Task 11 deletes it. That is fine — it keeps compiling because old components are only deleted in Task 11, after their last consumers are gone.

---

### Task 1: Design foundation — tokens, fonts, metadata, card assets

**Files:**
- Modify (replace entire file): `dashboard/src/app/globals.css`
- Modify (replace entire file): `dashboard/src/app/layout.tsx`
- Create: `dashboard/public/cards/` (4 PNGs copied from bot assets)

**Interfaces:**
- Produces: Tailwind utility classes from `@theme` tokens — `bg-bg`, `bg-panel`, `bg-panel-2`, `border-line`, `text-ink`, `text-muted`, `bg-gold`, `text-gold`, `bg-gold-deep`, `text-felt`, `bg-felt`, `text-chip`, `bg-chip`, `text-card-blue`, `bg-card-blue`, `font-display`, `font-body`, `font-mono`. Every later task uses these class names exactly.

- [ ] **Step 1: Read the current `layout.tsx`** (`dashboard/src/app/layout.tsx`) and note anything besides fonts/metadata/Providers (e.g. a `Toaster` from sonner). Whatever extra providers/elements exist must be preserved in the rewrite below.

- [ ] **Step 2: Copy card art into the site's public assets:**

```bash
mkdir -p dashboard/public/cards
cp src/assets/starter_card.png src/assets/gold_card.png src/assets/platinum_card.png src/assets/black_card.png dashboard/public/cards/
```

Expected: 4 files in `dashboard/public/cards/`.

- [ ] **Step 3: Replace `dashboard/src/app/globals.css` entirely with:**

```css
@import "tailwindcss";

@theme {
  --color-bg: #0e0f13;
  --color-panel: #15171c;
  --color-panel-2: #1b1e24;
  --color-line: #26282f;
  --color-ink: #f2f3f5;
  --color-muted: #9ba0aa;
  --color-gold: #ffb627;
  --color-gold-deep: #e09b00;
  --color-felt: #2f9e6e;
  --color-chip: #e5484d;
  --color-card-blue: #4c8dff;

  --font-display: var(--font-bricolage), ui-sans-serif, system-ui, sans-serif;
  --font-body: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
}

body {
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
}

::selection {
  background-color: color-mix(in srgb, var(--color-gold) 30%, transparent);
}

:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Replace `dashboard/src/app/layout.tsx` entirely with** (re-adding any extra providers/elements found in Step 1 — e.g. if a sonner `Toaster` was present, keep it inside `<Providers>`):

```tsx
import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Fortuna — Get rich. Go broke. Repeat.",
    template: "%s · Fortuna",
  },
  description:
    "Fortuna is an economy and casino inside Discord — one wallet across every server. Work jobs, earn degrees, build credit, and bet it all on black.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="bg-bg font-body text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify the build still passes** (old pages still use old classes/components — they must keep compiling; missing old token names like `bg-background` may break old pages' *styling* but not the build):

```bash
cd dashboard && npm run build
```

Expected: build succeeds. If it fails on a missing CSS variable used via `@apply` in an old file, replace that `@apply` usage with plain classes inline in that file (do not re-add old tokens).

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/app/globals.css dashboard/src/app/layout.tsx dashboard/public/cards
git commit -m "feat(web): flat design tokens, fonts, metadata, card assets"
```

---

### Task 2: Flat UI primitives

**Files:**
- Create: `dashboard/src/components/ui/Panel.tsx`
- Create: `dashboard/src/components/ui/Tag.tsx`
- Create: `dashboard/src/components/ui/CommandString.tsx`
- Create: `dashboard/src/components/ui/SectionHeader.tsx`
- Create: `dashboard/src/components/ui/FadeUp.tsx`
- Create: `dashboard/src/components/ui/DiscordMockup.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils` (exists), Tailwind tokens from Task 1.
- Produces (exact exports used by Tasks 6–10):
  - `Panel({ className?, children })`
  - `Tag({ color?: "gold" | "felt" | "chip" | "blue" | "neutral", children })`
  - `CommandString({ command, className? })` — client, click-to-copy
  - `SectionHeader({ eyebrow?, title, sub?, align?: "left" | "center" })`
  - `FadeUp({ children, delay?, className? })` — client, viewport fade-up
  - `DiscordMockup({ children, className? })`, `MockMessage({ author, isBot?, children })`, `MockEmbed({ title?, accent?, children })`, `MockButtons({ buttons: { label: string; style?: "primary" | "secondary" | "success" | "danger" }[] })`

- [ ] **Step 1: Create `dashboard/src/components/ui/Panel.tsx`:**

```tsx
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-line bg-panel", className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `dashboard/src/components/ui/Tag.tsx`:**

```tsx
import { cn } from "@/lib/utils";

const STYLES = {
  gold: "bg-gold/15 text-gold border-gold/30",
  felt: "bg-felt/15 text-felt border-felt/30",
  chip: "bg-chip/15 text-chip border-chip/30",
  blue: "bg-card-blue/15 text-card-blue border-card-blue/30",
  neutral: "bg-panel-2 text-muted border-line",
} as const;

export function Tag({
  color = "neutral",
  className,
  children,
}: {
  color?: keyof typeof STYLES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        STYLES[color],
        className
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Create `dashboard/src/components/ui/CommandString.tsx`:**

```tsx
"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommandString({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — do nothing
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy command"
      className={cn(
        "group inline-flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-1.5 font-mono text-sm text-ink transition-colors hover:border-gold/40",
        className
      )}
    >
      {command}
      {copied ? (
        <Check size={14} className="text-felt" />
      ) : (
        <Copy size={14} className="text-muted group-hover:text-gold" />
      )}
    </button>
  );
}
```

- [ ] **Step 4: Create `dashboard/src/components/ui/SectionHeader.tsx`:**

```tsx
import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("mb-10", align === "center" && "text-center")}>
      {eyebrow && (
        <p className="mb-2 font-mono text-sm font-medium uppercase tracking-widest text-gold">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 max-w-2xl text-lg text-muted">{sub}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Create `dashboard/src/components/ui/FadeUp.tsx`:**

```tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 6: Create `dashboard/src/components/ui/DiscordMockup.tsx`** (Discord's own flat palette is allowed *inside this component only*):

```tsx
import { cn } from "@/lib/utils";

const BTN_STYLES = {
  primary: "bg-[#5865f2] text-white",
  secondary: "bg-[#4e5058] text-white",
  success: "bg-[#248046] text-white",
  danger: "bg-[#da373c] text-white",
} as const;

export function DiscordMockup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-[#313338] p-4 text-left text-[15px] leading-relaxed",
        className
      )}
      aria-label="Preview of Fortuna running in Discord"
    >
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function MockMessage({
  author,
  isBot = false,
  children,
}: {
  author: string;
  isBot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 h-9 w-9 shrink-0 rounded-full",
          isBot ? "bg-gold" : "bg-[#5865f2]"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {author}
          {isBot && (
            <span className="ml-1.5 rounded bg-[#5865f2] px-1 py-px align-middle text-[10px] font-bold uppercase text-white">
              App
            </span>
          )}
          <span className="ml-1.5 text-xs font-normal text-[#949ba4]">
            Today
          </span>
        </p>
        <div className="text-[#dbdee1]">{children}</div>
      </div>
    </div>
  );
}

export function MockEmbed({
  title,
  accent = "#ffb627",
  children,
}: {
  title?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-1 max-w-md rounded border-l-4 bg-[#2b2d31] p-3"
      style={{ borderLeftColor: accent }}
    >
      {title && <p className="mb-1 font-semibold text-white">{title}</p>}
      <div className="text-sm text-[#dbdee1]">{children}</div>
    </div>
  );
}

export function MockButtons({
  buttons,
}: {
  buttons: { label: string; style?: keyof typeof BTN_STYLES }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {buttons.map((b) => (
        <span
          key={b.label}
          className={cn(
            "rounded px-3.5 py-1.5 text-sm font-medium",
            BTN_STYLES[b.style ?? "secondary"]
          )}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Verify the build:**

```bash
cd dashboard && npm run build
```

Expected: build succeeds (new components are not yet imported anywhere — that's fine).

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/components/ui
git commit -m "feat(web): flat UI primitives (Panel, Tag, CommandString, SectionHeader, FadeUp, DiscordMockup)"
```

---

### Task 3: Content types + complete commands data

**Files:**
- Create: `dashboard/src/content/types.ts`
- Create: `dashboard/src/content/commands.ts`

**Interfaces:**
- Produces (used by Tasks 4, 5, 8, 9):
  - Types: `ModuleId`, `Command`, `KeyTable`, `DocSection`, `ModuleDoc` (exact shapes below)
  - Data: `COMMANDS: Command[]` (65 entries), `MODULE_LABELS: Record<ModuleId, string>`, `getCommand(id: string): Command | undefined`

- [ ] **Step 1: Create `dashboard/src/content/types.ts`:**

```ts
export type ModuleId = "general" | "economy" | "casino" | "life";

export interface Command {
  /** anchor slug used as the row id and #hash target, e.g. "work" */
  id: string;
  /** primary trigger including prefix, e.g. "!work" */
  name: string;
  /** alias triggers WITHOUT prefix, e.g. ["job", "myjob"] */
  aliases: string[];
  module: ModuleId;
  /** one-line description, in-voice */
  short: string;
  /** usage syntax, e.g. "!blackjack <bet>" */
  usage: string;
  args?: { name: string; desc: string }[];
  examples: string[];
  /** human-readable, e.g. "30 min (shared casino cooldown)" */
  cooldown?: string;
  keyNumbers?: { label: string; value: string }[];
  /** true when the command opens buttons/menus/modals */
  interactive?: boolean;
  /** true when the command is blocked while jailed */
  jailBlocked?: boolean;
}

export interface KeyTable {
  title?: string;
  columns: string[];
  rows: string[][];
}

export interface DocSection {
  heading: string;
  /** paragraphs of body copy */
  body: string[];
  table?: KeyTable;
  /** optional emphasized warning/note line */
  note?: string;
}

export interface ModuleDoc {
  slug: string;
  title: string;
  tagline: string;
  /** lucide-react icon name rendered by the docs UI, e.g. "Coins" */
  icon: string;
  forBeginners: {
    what: string;
    firstCommands: string[];
    tip: string;
  };
  sections: DocSection[];
  /** Command ids (from commands.ts) listed on this page */
  commandIds: string[];
  proTips: string[];
}
```

- [ ] **Step 2: Create `dashboard/src/content/commands.ts`.** Transcribe EVERY command from INVENTORY into a `Command` entry. The file must contain exactly these 65 ids (this list is the coverage contract — no additions, no omissions):

```text
general (5): help, casino, tutorial, start, ping
economy (34): balance, deposit, withdraw, transfer, ask, crime, beg, slut,
  jail, bail, daily, weekly, monthly, vote, rob, shop, inventory, use, equip,
  iteminfo, bank, card, mycards, credit, stock, my-stocks, market,
  leaderboard, profile, properties, buy-property, sell-property,
  my-properties, collect-rent
casino (11): coinflip, slots, blackjack, bet, roulette-guide, rr, cockfight,
  chicken, feed, hunt, zoo
life (15): work, jobs, apply, career, relax, education, degrees, enroll,
  exam, study, dropout, marry, divorce, family, quests
```

Transcription rules (all data from INVENTORY, per command):
- `aliases`: every alias listed in INVENTORY (e.g. leaderboard gets `["lb", "top", "rich", "lb-wallet", "lbwallet", "cashlb"]`; shop gets `["store", "buy", "cockstore", "cock-store", "cs"]`; the bot-source `games` folder maps to module `"casino"`).
- `jailBlocked: true` for exactly this set (from the router's jail restriction list): work, crime, beg, slut, rob, shop, market, bet, blackjack, slots, coinflip, cockfight, chicken, withdraw, deposit, transfer, daily, weekly, monthly, bank, card, stock.
- `cooldown` for: casino games (coinflip "20 min", slots "25 min", blackjack "30 min", bet/roulette "30 min", cockfight "45 min" — suffix each with " (shared casino cooldown)"), crime "1 hour", beg "45 sec", slut "2 min", rob "5 min", daily "24 h", weekly "7 days", monthly "30 days", vote "12 h", study "5 min".
- `keyNumbers` must carry the real numbers: payouts, ranges, taxes, bet limits, prices (examples in Step 3). Casino games each include a `Bets` entry with "10,000 – <per-game max>" from the GAME_BET_LIMITS section of INVENTORY (coinflip 500k, slots 750k, blackjack 1M, roulette 1M, rr 750k, cockfight 1M).
- `interactive: true` wherever INVENTORY marks "Interactive: yes".
- `roulette-guide` entry: name `!roulette-guide`, aliases `["roul-guide", "rouletteguide", "roulguide"]`, short "Opens the roulette payout menu so you know what x36 feels like before you chase it."

File skeleton with three complete example entries showing the exact register and level of detail required for ALL 65 (the remaining 62 follow this pattern from INVENTORY):

```ts
import type { Command, ModuleId } from "./types";

export const MODULE_LABELS: Record<ModuleId, string> = {
  general: "General",
  economy: "Economy",
  casino: "Casino",
  life: "Life",
};

export const COMMANDS: Command[] = [
  // ── general ────────────────────────────────────────────────
  // ... help, casino, tutorial, start, ping ...

  // ── economy ────────────────────────────────────────────────
  {
    id: "bank",
    name: "!bank",
    aliases: [],
    module: "economy",
    short:
      "Your bank dashboard — savings, fixed & recurring deposits, and the door to credit cards.",
    usage:
      "!bank [fd <amount> <days> | rd <amount> <days> | collect | investments | cards]",
    args: [
      { name: "fd <amount> <days>", desc: "Open a fixed deposit (10% APR)." },
      { name: "rd <amount> <days>", desc: "Open a recurring deposit (8% APR)." },
      { name: "collect", desc: "Collect matured investments." },
      { name: "investments", desc: "List your active FDs and RDs." },
      { name: "cards", desc: "Open the credit cards hub." },
    ],
    examples: ["!bank", "!bank fd 500000 7", "!bank cards"],
    keyNumbers: [
      { label: "Fixed deposit", value: "10% APR" },
      { label: "Recurring deposit", value: "8% APR" },
    ],
    interactive: true,
    jailBlocked: true,
  },

  // ── casino ─────────────────────────────────────────────────
  {
    id: "blackjack",
    name: "!blackjack",
    aliases: ["bj"],
    module: "casino",
    short:
      "Play a full hand against the dealer. Dealer hits to 17. Try not to cry.",
    usage: "!blackjack <bet>",
    args: [
      { name: "bet", desc: "Wallet amount to stake (10,000 – 1,000,000)." },
    ],
    examples: ["!blackjack 250000", "!bj 10000"],
    cooldown: "30 min (shared casino cooldown)",
    keyNumbers: [
      { label: "Blackjack pays", value: "2.5x" },
      { label: "Win pays", value: "2x" },
      { label: "Push", value: "bet returned" },
      { label: "Bets", value: "10,000 – 1,000,000" },
    ],
    interactive: true,
    jailBlocked: true,
  },

  // ── life ───────────────────────────────────────────────────
  {
    id: "work",
    name: "!work",
    aliases: ["job", "myjob"],
    module: "life",
    short: "Clock a shift at your job. Pay is real, and so is the stress.",
    usage: "!work",
    examples: ["!work"],
    keyNumbers: [
      { label: "Income tax", value: "8%" },
      { label: "Job pay range", value: "30,000 – 450,000 per shift" },
    ],
    interactive: true,
    jailBlocked: true,
  },

  // ... remaining entries ...
];

export function getCommand(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id);
}
```

- [ ] **Step 3: Run the coverage check** — every id present, count exact:

```bash
cd dashboard && for id in help casino tutorial start ping balance deposit withdraw transfer ask crime beg slut jail bail daily weekly monthly vote rob shop inventory use equip iteminfo bank card mycards credit stock my-stocks market leaderboard profile properties buy-property sell-property my-properties collect-rent coinflip slots blackjack bet roulette-guide rr cockfight chicken feed hunt zoo work jobs apply career relax education degrees enroll exam study dropout marry divorce family quests; do grep -q "id: \"$id\"" src/content/commands.ts || echo "MISSING: $id"; done; echo "count: $(grep -c 'id: \"' src/content/commands.ts)"
```

Expected output: no `MISSING:` lines, then `count: 65`.

- [ ] **Step 4: Verify the build:**

```bash
cd dashboard && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/content
git commit -m "feat(web): typed content schema + complete command reference data (65 commands)"
```

---

### Task 4: Module docs data — part 1 (getting-started, economy, bank-and-credit, casino)

**Files:**
- Create: `dashboard/src/content/modules/getting-started.ts`
- Create: `dashboard/src/content/modules/economy.ts`
- Create: `dashboard/src/content/modules/bank-and-credit.ts`
- Create: `dashboard/src/content/modules/casino.ts`
- Create: `dashboard/src/content/modules/index.ts`

**Interfaces:**
- Consumes: `ModuleDoc` from `@/content/types` (Task 3).
- Produces: each file default-exports a `ModuleDoc`; `index.ts` exports `MODULE_DOCS: ModuleDoc[]` (ordered) and `getModuleDoc(slug: string): ModuleDoc | undefined` — used by Task 9's docs pages.

Writing rules for ALL module files (Tasks 4 and 5):
- Every number transcribed from INVENTORY. If INVENTORY doesn't state a number, the docs don't state it either.
- Voice: in-character dealer energy; helpful, never corporate. Address the reader as "you".
- `forBeginners.what` = 2–3 plain-language sentences a brand-new player understands. `firstCommands` = 2–3 command strings with prefix. `tip` = one honest warning or shortcut.
- `sections` = 3–6 `DocSection`s per module, each `body` paragraph 2–4 sentences. Use `table` for any set of ≥3 numbers.
- `commandIds` must reference ids that exist in `commands.ts` (Task 3 list).
- V2 framing everywhere: "your balance follows you to every server", wallet-only gambling, prefix is the only per-server setting.

- [ ] **Step 1: Create `dashboard/src/content/modules/getting-started.ts`** — complete file, use verbatim:

```ts
import type { ModuleDoc } from "../types";

const gettingStarted: ModuleDoc = {
  slug: "getting-started",
  title: "Getting Started",
  tagline: "From zero to your first bet in ten minutes.",
  icon: "Sparkles",
  forBeginners: {
    what: "Fortuna is an economy and casino that lives inside Discord. You earn Fortunes (the currency), work jobs, study for degrees, build credit — and gamble it all away if you like. Your account is yours, not the server's: the same wallet follows you to every server Fortuna is in.",
    firstCommands: ["!start", "!help", "!tutorial"],
    tip: "Everything runs on the ! prefix by default. If a server changed it, mention the bot and it will tell you the prefix.",
  },
  sections: [
    {
      heading: "One account, every server",
      body: [
        "Your wallet, bank, job, degrees, credit card, and stress are all attached to your Discord account. Switch servers and it all comes with you — no starting over, no per-server grinding.",
        "The only thing a server controls is the command prefix. Everything else is yours.",
      ],
    },
    {
      heading: "Create your account",
      body: [
        "Run !start and Fortuna opens your account with 1,000 Fortunes in your wallet. That's not much — it's meant to sting. The economy starts at the bottom.",
        "Check what you have at any time with !balance, and see the full picture — career, education, relationship, net worth — with !profile.",
      ],
    },
    {
      heading: "Your first 10 minutes",
      body: [
        "The fastest honest start: claim !daily for 100,000 Fortunes, then look at !jobs and !apply for something with no degree requirement — waiting tables pays around 30,000 a shift. Work shifts with !work.",
        "Once you have 10,000 or more in your wallet, the casino opens up. !coinflip 10000 is the cheapest lesson in probability you'll ever buy.",
      ],
      table: {
        title: "The starter path",
        columns: ["Step", "Command", "What happens"],
        rows: [
          ["1", "!start", "Account created, 1,000 Fortunes"],
          ["2", "!daily", "Claim 100,000 Fortunes (every 24h)"],
          ["3", "!jobs → !apply <job>", "Get hired, no degree needed"],
          ["4", "!work", "Earn your first paycheck"],
          ["5", "!blackjack 10000", "Meet the dealer"],
        ],
      },
    },
    {
      heading: "Where the money comes from",
      body: [
        "Steady income: !daily (100,000 / 24h), !weekly (800,000 / 7d), !monthly (4,000,000 / 30d), and !work shifts. Voting for Fortuna on top.gg with !vote pays 5,000 every 12 hours.",
        "Risky income: !beg and !slut are quick grinds, !crime pays 100,000–220,000 when it works (35% of the time), and !rob takes from other players — with consequences when it doesn't.",
        "Note the fine print: weekly, monthly, and work income is taxed 8%. Daily isn't.",
      ],
    },
    {
      heading: "If you get stuck",
      body: [
        "!help opens the full in-Discord command menu, and !tutorial walks you through every system as paginated lessons.",
        "!ping shows bot status if things feel slow. And the support server is one click away in the footer of this site.",
      ],
    },
  ],
  commandIds: [
    "start",
    "help",
    "tutorial",
    "profile",
    "balance",
    "daily",
    "jobs",
    "apply",
    "work",
    "ping",
  ],
  proTips: [
    "Deposit what you don't plan to bet — !deposit all. Robbers can only touch your wallet, never your bank.",
    "Claim !daily, !weekly, and !monthly on cooldown even when you're broke. Especially when you're broke.",
    "Read a game's rules with !casino before you bet. The payout tables are public for a reason.",
  ],
};

export default gettingStarted;
```

- [ ] **Step 2: Create `dashboard/src/content/modules/economy.ts`** following the same shape. Required content (all values from INVENTORY):
  - `slug: "economy"`, `title: "Economy & Money"`, `tagline` in voice, `icon: "Coins"`.
  - `forBeginners`: wallet vs bank in plain words; firstCommands `["!balance", "!deposit all", "!daily"]`; tip about rob only touching wallets.
  - Sections (5): **Wallet vs bank** (deposit/withdraw, `all` + smart amounts); **Claim income** with table — daily 100,000 / 24h / untaxed; weekly 800,000 / 7d / 8% tax; monthly 4,000,000 / 30d / 8% tax; vote 5,000 / 12h; **Grinding** with table — beg: 45s cd, 70% success, 8,000–15,000; slut: 2min cd, 55%, 12,000–22,000; crime: 1h cd, 35%, 100,000–220,000 payout, 60,000–140,000 fine, +20 heat; **Robbing & getting robbed** — rob: 5min cd, 45% base success (5–85% clamp), steals 8–20% of victim wallet capped 250,000, fail penalty 60,000–120,000, item interactions exist (Padlock defends, Thief Gloves help, etc. — point to Items docs); **Jail, heat & taxes** — jail blocks a long list of commands (name a few), bail via !bail (default fine 1,000, default sentence 10 min), heat: crime adds +20, at 100 a raid can seize 10–25% of wallet, heat decays 10/hr; transfers taxed 5%, income taxed 8%.
  - `commandIds`: balance, deposit, withdraw, transfer, ask, daily, weekly, monthly, vote, beg, slut, crime, rob, jail, bail, leaderboard, profile.
  - 3 proTips (bank early; watch heat after crime sprees; !ask beats begging friends).

- [ ] **Step 3: Create `dashboard/src/content/modules/bank-and-credit.ts`.** Required content:
  - `slug: "bank-and-credit"`, `title: "Bank & Credit Cards"`, `icon: "CreditCard"`.
  - `forBeginners`: what a credit card does here (spend the bank's money, pay it back weekly, score goes up or your income gets garnished); firstCommands `["!bank", "!credit", "!card issue"]`; tip: never miss the minimum due.
  - Sections (5): **The bank dashboard** (fd/rd/collect/investments — FD 10% APR, RD 8% APR); **Card tiers** with the full table — STARTER: score 300, career tier 0, limit 1.5M, 12%/wk interest, 750k weekly spend cap, 250k weekly withdraw cap; GOLD: 500, tier 2, 6M, 8%, 3M, 1M; PLATINUM: 700, tier 3, 20M, 5%, 10M, 3M; BLACK: 850, tier 4, 60M, 3%, 25M, 8M; **How the weekly cycle works** — statements generate weekly; minimum due = 12% of statement or the tier floor (75k/150k/400k/1M), whichever is higher; pay full +30 score, pay minimum +20, miss −45 (repeat −60); 1–2 misses = DELINQUENT, 3 = LOCKED; delinquent/locked cards garnish 25% of your income; score clamps 300–850; **Spending & cash advances** — shop purchases via "buy card", cash advance via !card withdraw, repay from wallet with !card pay; upgrades need under 50% utilization; close needs zero balance; one card per person; **The house rule** — credit cards can NEVER fund gambling; casino bets come from your wallet only.
  - `commandIds`: bank, card, mycards, credit, deposit, withdraw.
  - 3 proTips (e.g. pay full every week to climb score fast; career tier gates cards as much as score; garnishment hits work/weekly/monthly income).

- [ ] **Step 4: Create `dashboard/src/content/modules/casino.ts`.** Required content:
  - `slug: "casino"`, `title: "Casino Games"`, `icon: "Dice5"`.
  - `forBeginners`: 6 games, all bets from wallet, everything has a cooldown; firstCommands `["!casino", "!coinflip 10000", "!slots 10000"]`; tip: !casino opens every game's guide in Discord.
  - Sections (5): **House rules** — wallet-only (no bank, no credit card), min bet 10,000, one active game at a time (5-min lock), shared casino cooldowns per game; **Cooldowns & limits** table — coinflip 20 min / max 500k; slots 25 min / 750k; blackjack 30 min / 1M; roulette 30 min / 1M; russian roulette (no shared cd listed — omit) / 750k; cockfight 45 min / 1M; **Game guide** — one short paragraph per game: coinflip (2x, pick heads/tails or use buttons), slots (payout table: 7️⃣ 20x, 💎 10x, 🔔 5x, grapes/melon 3x, cherry/banana 2x), blackjack (dealer hits to 17, blackjack 2.5x, win 2x, push returns bet, Hit/Stand buttons), roulette via !bet (single number x36, dozens/columns x3, colors/halves/odd-even x2), russian roulette (2–6 players, 60s lobby, last one standing takes the pot), cockfight (train a chicken first — see Hunting & Animals; 60s side-bet window); **Reading the table** — roulette-guide command, casino guide hub; **Items that touch the casino** — Lucky Coin, Crown of Greed, Soul Ledger exist and modify stakes/payouts (point to Items docs for details).
  - `commandIds`: casino, coinflip, slots, blackjack, bet, roulette-guide, rr, cockfight.
  - 3 proTips (e.g. blackjack has the best odds per INVENTORY payouts; never chase the x36; cooldowns are per-game — rotate games instead of waiting).

- [ ] **Step 5: Create `dashboard/src/content/modules/index.ts`:**

```ts
import type { ModuleDoc } from "../types";
import gettingStarted from "./getting-started";
import economy from "./economy";
import bankAndCredit from "./bank-and-credit";
import casino from "./casino";

export const MODULE_DOCS: ModuleDoc[] = [
  gettingStarted,
  economy,
  bankAndCredit,
  casino,
];

export function getModuleDoc(slug: string): ModuleDoc | undefined {
  return MODULE_DOCS.find((m) => m.slug === slug);
}
```

- [ ] **Step 6: Verify build:**

```bash
cd dashboard && npm run build
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/content/modules
git commit -m "feat(web): docs content for getting-started, economy, bank-and-credit, casino"
```

---

### Task 5: Module docs data — part 2 (remaining six modules)

**Files:**
- Create: `dashboard/src/content/modules/jobs-and-careers.ts`
- Create: `dashboard/src/content/modules/education.ts`
- Create: `dashboard/src/content/modules/items-and-shop.ts`
- Create: `dashboard/src/content/modules/hunting-and-animals.ts`
- Create: `dashboard/src/content/modules/investments.ts`
- Create: `dashboard/src/content/modules/life-and-social.ts`
- Modify: `dashboard/src/content/modules/index.ts`

**Interfaces:**
- Consumes: `ModuleDoc` type; same writing rules as Task 4.
- Produces: `MODULE_DOCS` now contains all 10 docs in this exact order: getting-started, economy, bank-and-credit, casino, jobs-and-careers, education, items-and-shop, hunting-and-animals, investments, life-and-social.

- [ ] **Step 1: Create `jobs-and-careers.ts`.** Required content (INVENTORY values):
  - `slug: "jobs-and-careers"`, `title: "Jobs & Careers"`, `icon: "Briefcase"`.
  - `forBeginners`: get hired, work shifts, get promoted; firstCommands `["!jobs", "!apply waiter", "!work"]`; tip: no degree needed for tier-0 service jobs.
  - Sections (4): **Getting hired** (!jobs browse, !apply by name, requirements = degrees + XP + sometimes the previous job in the chain); **Career tiers** — tiers 0–4 gate credit cards; sector examples table: service (Waiter/Sous Chef, tier 0, no degree), trade (Apprentice→Master Mechanic, tiers 1–2, Trade License), tech (IT Intern→Lead Engineer, tiers 1–4, BS Computer Science), business (Sales Intern→Manager, tiers 1–3), legal (Paralegal→Partner, tiers 2–4, LLB/LLM), medical (Resident→Chief of Medicine, tiers 2–4, MBBS + MD/PhD); **Pay & tax** — shifts pay 30,000 (entry) to 450,000 (Chief of Medicine), all work income taxed 8%, delinquent credit cards garnish 25%; **Stress** — working builds job stress (0–100), manage it with !relax (link Life & Social).
  - `commandIds`: jobs, apply, work, career, relax, education.
  - 3 proTips.

- [ ] **Step 2: Create `education.ts`.** Required content:
  - `slug: "education"`, `title: "Education"`, `icon: "GraduationCap"`.
  - `forBeginners`: degrees unlock better jobs (and jobs unlock better credit cards); firstCommands `["!education", "!enroll high school diploma", "!study"]`; tip: study is on a 5-minute cooldown minigame — do it while you grind.
  - Sections (4): **How school works** (!enroll by degree name, !study for XP every 5 min via minigame, !exam to graduate, !dropout to quit); **Degree catalog** — full price table: High School Diploma 150k, Trade License 300k, BA Fine Arts 900k, BS Computer Science 1.2M, LLB 2.5M, MBBS 4M, LLM 6M, MD/PhD 10M; **Paying for it** (wallet or credit card enrollment paths, scholarships exist as milestones on the dashboard); **Education stress** (studying builds stress; !relax reduces it; !degrees lists what you've earned).
  - `commandIds`: education, enroll, study, exam, dropout, degrees, relax.
  - 3 proTips.

- [ ] **Step 3: Create `items-and-shop.ts`.** Required content:
  - `slug: "items-and-shop"`, `title: "Items & Shop"`, `icon: "ShoppingBag"`.
  - `forBeginners`: the shop sells tools that change the rules (protect your wallet, boost payouts); firstCommands `["!shop", "!inventory", "!iteminfo padlock"]`; tip: !shop buy card <item> puts it on credit.
  - Sections (4): **The shop** — categories GENERAL / HUNT / JOB / UNI / COCK / COSMETICS; buy with wallet (`!shop buy`) or credit (`!shop buy card`), sell back with `!shop sell`; **Your inventory** (!inventory categories, !use for consumables incl. targeted uses, !equip for chicken weapon/armor/accessory slots, !iteminfo for details); **Items that matter** — name the known effects from INVENTORY without inventing details: Padlock (rob defense), Thief Gloves / Eclipse Mask (rob offense), Lucky Coin (income/coinflip luck), Crown of Greed (stake/payout modifier), Counterfeit Kit / Devil Contract (daily multipliers), Soul Ledger (casino interplay), transfer-tax shield item exists; frame as "spotted in the wild — exact numbers live in !iteminfo"; **The Black Market** — player-to-player listings via !market: 5% buyer fee + 10% seller fee, listings expire in 7 days, max 5 listings per player, wallet-only.
  - `commandIds`: shop, inventory, use, equip, iteminfo, market.
  - 3 proTips.

- [ ] **Step 4: Create `hunting-and-animals.ts`.** Required content:
  - `slug: "hunting-and-animals"`, `title: "Hunting & Animals"`, `icon: "Crosshair"`.
  - `forBeginners`: buy a rifle, hunt animals, build a zoo, raise a fighting chicken; firstCommands `["!shop hunt", "!hunt", "!chicken"]`; tip: no rifle = no hunt; the shop's HUNT tab is step one.
  - Sections (4): **Hunting** (!hunt needs a rifle from !shop hunt; each rifle tier has its own cooldown; !hunt craft opens crafting); **Your zoo** (!zoo shows captured animals; capacity and income scale with rarity; requires a zoo property — link Investments); **Fighting chickens** (!chicken to view, name, train; traits matter; !feed boosts combat stats; !equip arms it with weapon/armor/accessory); **Cockfights** (!cockfight — stat-based combat with side bets and a 60-second bet window, max bet 1M, 45-min cooldown; animal parts sell on the Black Market).
  - `commandIds`: hunt, zoo, chicken, feed, equip, cockfight, shop, market.
  - 3 proTips.

- [ ] **Step 5: Create `investments.ts`.** Required content:
  - `slug: "investments"`, `title: "Investments"`, `icon: "TrendingUp"`.
  - `forBeginners`: put money to work — stocks tick every 30 minutes, property pays rent; firstCommands `["!stock", "!properties", "!my-stocks"]`; tip: stocks can be delisted — the DELISTING badge is not decoration.
  - Sections (4): **The stock market** — one market shared by every server; prices move every 30 minutes; buy/sell by symbol and quantity; risk/volatility labels, forecasts and rumors via !stock news; **Tracking your portfolio** (!my-stocks per-position and total P/L; !stock portfolio); **Real estate** (browse !properties, !buy-property / !sell-property by key, rent accrues passively, collect with !collect-rent, see holdings with !my-properties); **Bank products** (FD 10% APR / RD 8% APR — link Bank & Credit).
  - `commandIds`: stock, my-stocks, properties, buy-property, sell-property, my-properties, collect-rent, bank.
  - 3 proTips.

- [ ] **Step 6: Create `life-and-social.ts`.** Required content:
  - `slug: "life-and-social"`, `title: "Life & Social"`, `icon: "Heart"`.
  - `forBeginners`: marriage with a shared vault, daily quests with streaks, and a stress meter that will humble you; firstCommands `["!quests", "!relax", "!family"]`; tip: the first quest reroll each day is free.
  - Sections (4): **Marriage** (!marry proposal flow, currently free — no cost, no divorce fee; !family dashboard with joint vault deposit/withdraw and affection actions: hug, kiss, date, chaos; !divorce when it stops being funny); **Daily quests** (!quests board with difficulty tiers, progress bars, rewards, streak bonuses; claim and reroll buttons — first reroll free); **Stress & relaxing** — full table: Quick Break 25,000 (−8 job / −8 edu), Gym Session 75,000 (−20 / −15), Meditation Retreat 150,000 (−35 / −35), Weekend Getaway 350,000 (−75 / −60); stress clamps 0–100; you're never charged if both stress values are already 0; **Money between friends** (!transfer with 5% tax, !ask requests with Accept/Decline/Block buttons, !leaderboard bragging rights: net worth, cash, and work boards).
  - `commandIds`: marry, divorce, family, quests, relax, transfer, ask, leaderboard.
  - 3 proTips.

- [ ] **Step 7: Update `dashboard/src/content/modules/index.ts`** — replace entirely with:

```ts
import type { ModuleDoc } from "../types";
import gettingStarted from "./getting-started";
import economy from "./economy";
import bankAndCredit from "./bank-and-credit";
import casino from "./casino";
import jobsAndCareers from "./jobs-and-careers";
import education from "./education";
import itemsAndShop from "./items-and-shop";
import huntingAndAnimals from "./hunting-and-animals";
import investments from "./investments";
import lifeAndSocial from "./life-and-social";

export const MODULE_DOCS: ModuleDoc[] = [
  gettingStarted,
  economy,
  bankAndCredit,
  casino,
  jobsAndCareers,
  education,
  itemsAndShop,
  huntingAndAnimals,
  investments,
  lifeAndSocial,
];

export function getModuleDoc(slug: string): ModuleDoc | undefined {
  return MODULE_DOCS.find((m) => m.slug === slug);
}
```

- [ ] **Step 8: Verify commandIds referenced by all 10 modules exist in commands.ts** (quick sanity — run and eyeball for empty output):

```bash
cd dashboard && node -e "
const fs = require('fs');
const cmds = fs.readFileSync('src/content/commands.ts','utf8');
const dir = 'src/content/modules';
for (const f of fs.readdirSync(dir)) {
  if (f === 'index.ts') continue;
  const src = fs.readFileSync(dir + '/' + f, 'utf8');
  const m = src.match(/commandIds:\s*\[([^\]]*)\]/s);
  if (!m) { console.log('NO commandIds:', f); continue; }
  for (const id of m[1].match(/\"[^\"]+\"/g) || []) {
    if (!cmds.includes('id: ' + id)) console.log('BAD id', id, 'in', f);
  }
}
console.log('check done');
"
```

Expected: only `check done`.

- [ ] **Step 9: Verify build:**

```bash
cd dashboard && npm run build
```

Expected: success.

- [ ] **Step 10: Commit**

```bash
git add dashboard/src/content/modules
git commit -m "feat(web): docs content for jobs, education, items, hunting, investments, life"
```

---

### Task 6: Site chrome — navbar, footer, mobile menu (rewrites in place)

**Files:**
- Create: `dashboard/src/lib/links.ts`
- Modify (replace entire file): `dashboard/src/components/LandingNavbar.tsx`
- Modify (replace entire file): `dashboard/src/components/Footer.tsx`
- Modify (replace entire file): `dashboard/src/components/MobileSidebar.tsx`

**Interfaces:**
- Consumes: `signIn`/`signOut` from `next-auth/react`; UI primitives from Task 2.
- Produces: same export names and prop shapes as before, so every page (old and new) keeps compiling: `LandingNavbar({ user?, hideLogin? })`, `Footer()`, `MobileSidebar({ isOpen, onClose, user? })`. Plus `INVITE_URL`, `SUPPORT_URL`, `VOTE_URL` from `@/lib/links` — the single source for external URLs, also consumed by Task 7.

**Before writing UI code: load the `frontend-design` and `ui-ux-pro-max` skills** (Global Constraints).

- [ ] **Step 0: Create `dashboard/src/lib/links.ts`:**

```ts
export const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1371816936857669702&permissions=268823672&scope=bot%20applications.commands";
export const SUPPORT_URL = "https://discord.gg/Y5P44UCH2Y";
export const VOTE_URL =
  "https://top.gg/bot/1371816936857669702?s=0825a328ae527";
```

- [ ] **Step 1: Replace `dashboard/src/components/LandingNavbar.tsx` entirely with:**

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { LogOut, Menu } from "lucide-react";
import { MobileSidebar } from "./MobileSidebar";
import { INVITE_URL } from "@/lib/links";

const LINKS = [
  { href: "/commands", label: "Commands" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

interface LandingNavbarProps {
  user?: { name?: string | null; image?: string | null };
  hideLogin?: boolean;
}

export function LandingNavbar({ user, hideLogin }: LandingNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="/fortuna_icon.png"
            alt=""
            className="h-8 w-8 rounded-lg border border-line"
          />
          <span className="font-display text-lg font-bold tracking-wide text-ink">
            FORTUNA
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative hidden md:block">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 transition-colors hover:border-gold/40"
              >
                {user.image ? (
                  <Image
                    src={user.image}
                    width={24}
                    height={24}
                    alt=""
                    className="rounded-full"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-2 text-xs font-bold text-muted">
                    {user.name?.charAt(0) ?? "?"}
                  </span>
                )}
                <span className="max-w-[10rem] truncate text-sm font-medium text-ink">
                  {user.name}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-panel">
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-chip transition-colors hover:bg-panel-2"
                    >
                      <LogOut size={15} />
                      Cash out (sign out)
                    </button>
                  </div>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                </>
              )}
            </div>
          ) : (
            !hideLogin && (
              <button
                onClick={() => signIn("discord", { callbackUrl: "/" })}
                className="hidden rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-gold/40 hover:text-ink md:block"
              >
                Log in
              </button>
            )
          )}

          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-lg bg-gold px-4 py-2 text-sm font-bold text-bg transition-colors hover:bg-gold-deep md:block"
          >
            Add to Discord
          </a>

          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-muted transition-colors hover:text-ink md:hidden"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </nav>

      <MobileSidebar
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        user={user}
      />
    </header>
  );
}
```

- [ ] **Step 2: Replace `dashboard/src/components/MobileSidebar.tsx` entirely with:**

```tsx
"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { X } from "lucide-react";
import { INVITE_URL } from "@/lib/links";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user?: { name?: string | null; image?: string | null };
}

const LINKS = [
  { href: "/commands", label: "Commands" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

export function MobileSidebar({ isOpen, onClose, user }: MobileSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-bg md:hidden">
      <div className="flex h-16 items-center justify-between border-b border-line px-6">
        <span className="font-display text-lg font-bold text-ink">FORTUNA</span>
        <button
          onClick={onClose}
          className="p-2 text-muted"
          aria-label="Close menu"
        >
          <X size={22} />
        </button>
      </div>
      <div className="flex flex-col gap-1 p-6">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="rounded-lg px-3 py-3 text-lg font-medium text-ink hover:bg-panel"
          >
            {l.label}
          </Link>
        ))}
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 rounded-lg bg-gold px-4 py-3 text-center font-bold text-bg"
        >
          Add to Discord
        </a>
        {user ? (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-2 rounded-lg border border-line px-4 py-3 text-sm font-medium text-chip"
          >
            Sign out
          </button>
        ) : (
          <button
            onClick={() => signIn("discord", { callbackUrl: "/" })}
            className="mt-2 rounded-lg border border-line px-4 py-3 text-sm font-medium text-muted"
          >
            Log in with Discord
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `dashboard/src/components/Footer.tsx` entirely with:**

```tsx
import Link from "next/link";
import { INVITE_URL, SUPPORT_URL, VOTE_URL } from "@/lib/links";

const COLUMNS: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}[] = [
  {
    title: "Play",
    links: [
      { href: "/commands", label: "Commands" },
      { href: "/docs/casino", label: "Casino games" },
      { href: "/docs/bank-and-credit", label: "Credit cards" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/docs/getting-started", label: "Getting started" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: SUPPORT_URL, label: "Support server", external: true },
      { href: VOTE_URL, label: "Vote on top.gg", external: true },
      { href: INVITE_URL, label: "Add to Discord", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/policy", label: "Privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-6 py-14 md:grid-cols-6">
        <div className="col-span-2 space-y-3">
          <p className="font-display text-xl font-bold text-ink">FORTUNA</p>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            An economy and casino inside Discord. One wallet across every
            server. The house appreciates your business.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-sm font-bold text-ink">{col.title}</h3>
            <ul className="space-y-2">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-6 text-center">
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} Fortuna. The Fortunes are fake. The
          grudges are real.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Verify build** (old pages import these same names — everything must compile; old pages will look off-theme until their own tasks, which is fine):

```bash
cd dashboard && npm run build
```

Expected: success. If any old page passed now-removed props to these components (e.g. anything besides `user`/`hideLogin`), remove that prop at the call site.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/links.ts dashboard/src/components/LandingNavbar.tsx dashboard/src/components/Footer.tsx dashboard/src/components/MobileSidebar.tsx
git commit -m "feat(web): flat navbar, footer, mobile menu; drop dead premium/team/refund links"
```

---

### Task 7: Landing page rebuild

**Files:**
- Create: `dashboard/src/components/landing/Hero.tsx`
- Create: `dashboard/src/components/landing/WhatYouDo.tsx`
- Create: `dashboard/src/components/landing/FeatureSplit.tsx`
- Create: `dashboard/src/components/landing/LandingFeatures.tsx`
- Create: `dashboard/src/components/landing/BeginnerPath.tsx`
- Create: `dashboard/src/components/landing/FinalCTA.tsx`
- Modify (replace entire file): `dashboard/src/app/page.tsx`
- Modify (restyle, keep data logic): `dashboard/src/components/landing/TopGGReviews.tsx`
- Delete: `dashboard/src/components/Hero.tsx` (the old hero — its only consumer was `page.tsx`)

**Interfaces:**
- Consumes: Task 2 primitives, Task 6 chrome (`LandingNavbar`, `Footer`, `INVITE_URL`, `SUPPORT_URL`), card PNGs in `/cards/` (Task 1).
- Produces: default export page at `/`.

**Before writing UI code: load the `frontend-design` and `ui-ux-pro-max` skills.**

- [ ] **Step 1: Create `dashboard/src/components/landing/Hero.tsx`:**

```tsx
import {
  DiscordMockup,
  MockButtons,
  MockEmbed,
  MockMessage,
} from "@/components/ui/DiscordMockup";
import { FadeUp } from "@/components/ui/FadeUp";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-20 lg:grid-cols-2">
      <div>
        <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-ink md:text-7xl">
          Get rich.
          <br />
          <span className="text-gold">Go broke.</span>
          <br />
          Repeat.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          Fortuna is an economy and casino inside Discord — one wallet across
          every server. Work jobs, earn degrees, build credit, and bet it all
          on black.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-gold px-7 py-3.5 text-center text-base font-bold text-bg transition-colors hover:bg-gold-deep"
          >
            Add to Discord
          </a>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-line bg-panel px-7 py-3.5 text-center text-base font-bold text-ink transition-colors hover:border-gold/40"
          >
            Play in our server
          </a>
        </div>
        <p className="mt-6 font-mono text-sm text-muted">
          6 casino games · 8 degrees · 4 credit cards · 1 wallet everywhere
        </p>
      </div>

      <FadeUp>
        <DiscordMockup>
          <MockMessage author="riko">
            <p className="font-mono">!blackjack 250000</p>
          </MockMessage>
          <MockMessage author="Lady Fortuna" isBot>
            <MockEmbed title="Blackjack — 250,000 on the line">
              <p>
                Dealer shows <strong>K♠</strong>
              </p>
              <p>
                Your hand: <strong>A♥ 9♣</strong> — 20
              </p>
              <p className="mt-1 text-[#949ba4]">
                Blackjack pays 2.5x. Dealer hits to 17.
              </p>
            </MockEmbed>
            <MockButtons
              buttons={[
                { label: "Hit", style: "primary" },
                { label: "Stand", style: "success" },
              ]}
            />
          </MockMessage>
        </DiscordMockup>
      </FadeUp>
    </section>
  );
}
```

- [ ] **Step 2: Create `dashboard/src/components/landing/WhatYouDo.tsx`:**

```tsx
import { Panel } from "@/components/ui/Panel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FadeUp } from "@/components/ui/FadeUp";
import { Briefcase, CreditCard, Dice5, Swords } from "lucide-react";

const CELLS = [
  {
    icon: Dice5,
    color: "text-gold",
    title: "Bet",
    body: "Blackjack, roulette, slots, coinflip, cockfights, and Russian roulette. Real payout tables, real cooldowns, wallet-only stakes.",
  },
  {
    icon: Briefcase,
    color: "text-felt",
    title: "Earn",
    body: "Apply for jobs, clock shifts, study for degrees, climb from waiter to Chief of Medicine. The paycheck grows with the title.",
  },
  {
    icon: CreditCard,
    color: "text-card-blue",
    title: "Borrow",
    body: "Four credit card tiers with weekly statements. Pay on time and your score climbs. Miss, and the house garnishes your wages.",
  },
  {
    icon: Swords,
    color: "text-chip",
    title: "Compete",
    body: "Rob wallets, top leaderboards, marry rich, and settle scores in quests. Every server is the same economy — nobody escapes it.",
  },
];

export function WhatYouDo() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeader
        eyebrow="The pitch"
        title="So what do you actually do?"
        sub="It's a life sim wearing a casino's suit. Four ways in, no way out."
      />
      <FadeUp>
        <Panel className="grid gap-px overflow-hidden bg-line sm:grid-cols-2">
          {CELLS.map((c) => (
            <div key={c.title} className="bg-panel p-8">
              <c.icon size={22} className={c.color} />
              <h3 className="mt-3 font-display text-xl font-bold text-ink">
                {c.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted">{c.body}</p>
            </div>
          ))}
        </Panel>
      </FadeUp>
    </section>
  );
}
```

- [ ] **Step 3: Create `dashboard/src/components/landing/FeatureSplit.tsx`:**

```tsx
import { cn } from "@/lib/utils";
import { FadeUp } from "@/components/ui/FadeUp";

export function FeatureSplit({
  eyebrow,
  title,
  body,
  bullets,
  media,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  media: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
      <div className={cn(flip && "lg:order-2")}>
        <p className="mb-2 font-mono text-sm font-medium uppercase tracking-widest text-gold">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2.5 text-ink">
              <span aria-hidden className="mt-0.5 select-none text-gold">
                ♦
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <FadeUp className={cn(flip && "lg:order-1")}>{media}</FadeUp>
    </div>
  );
}
```

- [ ] **Step 4: Create `dashboard/src/components/landing/LandingFeatures.tsx`** — three `FeatureSplit` instances (casino / credit cards / life sim):

```tsx
import Image from "next/image";
import {
  DiscordMockup,
  MockButtons,
  MockEmbed,
  MockMessage,
} from "@/components/ui/DiscordMockup";
import { FeatureSplit } from "./FeatureSplit";

const CARDS = [
  { src: "/cards/starter_card.png", alt: "Starter card", rot: "-rotate-6" },
  { src: "/cards/gold_card.png", alt: "Gold card", rot: "-rotate-2" },
  { src: "/cards/platinum_card.png", alt: "Platinum card", rot: "rotate-2" },
  { src: "/cards/black_card.png", alt: "Black card", rot: "rotate-6" },
];

export function LandingFeatures() {
  return (
    <section className="border-y border-line bg-panel/40">
      <FeatureSplit
        eyebrow="The casino"
        title="Six games. Published odds. No mercy."
        body="Every payout table is public and every bet comes from your wallet — the bank can't save you and the credit card isn't allowed in the building."
        bullets={[
          "Blackjack pays 2.5x, dealer hits to 17",
          "Roulette single number pays x36",
          "Slots top out at 20x on triple sevens",
          "Russian roulette: 2–6 players, last one standing takes the pot",
        ]}
        media={
          <DiscordMockup>
            <MockMessage author="mara">
              <p className="font-mono">!bet 100000 red</p>
            </MockMessage>
            <MockMessage author="Lady Fortuna" isBot>
              <MockEmbed title="Roulette" accent="#e5484d">
                <p>
                  The ball lands on <strong>17 black</strong>.
                </p>
                <p className="mt-1 text-[#949ba4]">
                  100,000 to the house. Reds pay 2x. Numbers pay 36x.
                </p>
              </MockEmbed>
            </MockMessage>
          </DiscordMockup>
        }
      />

      <FeatureSplit
        flip
        eyebrow="Credit cards"
        title="Borrow like a king. Repay like clockwork."
        body="Four tiers from Starter to Black — real limits, weekly statements, and a credit score that remembers everything. Miss payments and the house garnishes a quarter of your income."
        bullets={[
          "Starter: 1.5M limit at 12% weekly",
          "Black: 60M limit at 3% — score 850 and a tier-4 career required",
          "Pay in full: +30 score. Miss: −45 and falling",
          "Cards can never fund gambling. House rules.",
        ]}
        media={
          <div className="flex items-center justify-center py-6">
            {CARDS.map((c, i) => (
              <Image
                key={c.src}
                src={c.src}
                alt={c.alt}
                width={190}
                height={120}
                className={`${c.rot} ${i > 0 ? "-ml-16" : ""} rounded-xl border border-line`}
              />
            ))}
          </div>
        }
      />

      <FeatureSplit
        eyebrow="The life sim"
        title="Study. Work. Stress. Relax. Repeat."
        body="Eight degrees gate twenty-plus jobs across six sectors. Shifts pay up to 450,000 — and build stress you'll pay to burn off. It's capitalism with a dealer's smile."
        bullets={[
          "Degrees from 150k (High School) to 10M (MD/PhD)",
          "Careers from waiter to Chief of Medicine",
          "Stress is real: relax options from 25k to 350k",
          "8% income tax on wages. Nobody escapes it.",
        ]}
        media={
          <DiscordMockup>
            <MockMessage author="dev_ansh">
              <p className="font-mono">!work</p>
            </MockMessage>
            <MockMessage author="Lady Fortuna" isBot>
              <MockEmbed title="Shift complete — Senior Engineer" accent="#2f9e6e">
                <p>
                  You shipped on a Friday. Paid <strong>231,150</strong> after
                  tax.
                </p>
                <p className="mt-1 text-[#949ba4]">
                  Job stress +12 · try !relax before it costs you
                </p>
              </MockEmbed>
              <MockButtons
                buttons={[{ label: "View career", style: "secondary" }]}
              />
            </MockMessage>
          </DiscordMockup>
        }
      />
    </section>
  );
}
```

- [ ] **Step 5: Create `dashboard/src/components/landing/BeginnerPath.tsx`:**

```tsx
import Link from "next/link";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Panel } from "@/components/ui/Panel";
import { FadeUp } from "@/components/ui/FadeUp";

const STEPS = [
  {
    cmd: "!start",
    text: "Open your account. 1,000 Fortunes to your name.",
    href: "/docs/getting-started",
  },
  {
    cmd: "!daily",
    text: "Claim 100,000 free Fortunes. Every day. No catch.",
    href: "/docs/economy",
  },
  {
    cmd: "!work",
    text: "Get a job, clock a shift, cash a paycheck.",
    href: "/docs/jobs-and-careers",
  },
  {
    cmd: "!blackjack 10000",
    text: "Sit at the table. Learn what 2.5x feels like.",
    href: "/docs/casino",
  },
];

export function BeginnerPath() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeader
        eyebrow="New player?"
        title="Your first 10 minutes"
        sub="Four commands between you and your first bad decision."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <FadeUp key={s.cmd} delay={i * 0.06}>
            <Link href={s.href} className="block h-full">
              <Panel className="h-full p-6 transition-colors hover:border-gold/40">
                <p className="font-mono text-sm text-gold">step {i + 1}</p>
                <p className="mt-2 font-mono text-lg font-bold text-ink">
                  {s.cmd}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.text}
                </p>
              </Panel>
            </Link>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create `dashboard/src/components/landing/FinalCTA.tsx`:**

```tsx
import { INVITE_URL } from "@/lib/links";

export function FinalCTA() {
  return (
    <section className="border-t border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          Stop scrolling. Start grinding.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-muted">
          The table's open and the seat is free. What happens after that is on
          you.
        </p>
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block rounded-xl bg-gold px-8 py-4 text-lg font-bold text-bg transition-colors hover:bg-gold-deep"
        >
          Add Fortuna to Discord
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Replace `dashboard/src/app/page.tsx` entirely with:**

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { WhatYouDo } from "@/components/landing/WhatYouDo";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { BeginnerPath } from "@/components/landing/BeginnerPath";
import { TopGGReviews } from "@/components/landing/TopGGReviews";
import { FinalCTA } from "@/components/landing/FinalCTA";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <Hero />
      <WhatYouDo />
      <LandingFeatures />
      <BeginnerPath />
      <TopGGReviews />
      <FinalCTA />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 8: Delete the old hero:**

```bash
rm dashboard/src/components/Hero.tsx
```

Then grep for any other importers and fix if found: `grep -rn "components/Hero" dashboard/src` — expected: no matches.

- [ ] **Step 9: Restyle `dashboard/src/components/landing/TopGGReviews.tsx` in place.** Read the file first. KEEP: its data fetching (`lib/topgg-reviews.ts`), review mapping, and any caching. REPLACE: all presentation with the new system —
  - Section wrapper: `<section className="mx-auto max-w-6xl px-6 py-20">`.
  - `SectionHeader` with `eyebrow="Word on the street"`, `title="What players say"`, sub in voice (e.g. "Real reviews from top.gg. We didn't pay them. We can't afford to.").
  - Grid `sm:grid-cols-2 lg:grid-cols-3`, max 6 reviews, each a `Panel` with `p-6`: star rating rendered as gold ♦ repeated (aria-label "N out of 5"), the review text in `text-muted`, reviewer name in `text-ink font-medium`.
  - If the fetch returns nothing, render `null` (existing behavior).
  - Remove every old styling import (GlassCard, motion, glow, gradient classes). No framer-motion here.

- [ ] **Step 10: Verify build + visual smoke:**

```bash
cd dashboard && npm run build
```

Expected: success. Then `npm run dev` and load `http://localhost:3000` with the Playwright browser tools: hero mockup renders, card fan shows 4 PNGs, all four landing CTAs point at the right URLs, no gradient/glass/particle visuals anywhere.

- [ ] **Step 11: Commit**

```bash
git add -A dashboard/src/components/landing dashboard/src/app/page.tsx dashboard/src/components/Hero.tsx
git commit -m "feat(web): rebuild landing page — flat hero, feature splits, beginner path, reviews, final CTA"
```

---

### Task 8: Commands page

**Files:**
- Create: `dashboard/src/app/commands/page.tsx`
- Create: `dashboard/src/components/commands/CommandsExplorer.tsx`

**Interfaces:**
- Consumes: `COMMANDS`, `MODULE_LABELS` from `@/content/commands`; `Command`, `ModuleId` from `@/content/types`; Task 2 primitives; Task 6 chrome.
- Produces: `/commands` route; every command row carries `id={cmd.id}` so `/commands#work` deep-links (used by docs in Task 9).

**Before writing UI code: load the `frontend-design` and `ui-ux-pro-max` skills.**

- [ ] **Step 1: Create `dashboard/src/components/commands/CommandsExplorer.tsx`:**

```tsx
"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Command, ModuleId } from "@/content/types";
import { MODULE_LABELS } from "@/content/commands";
import { Tag } from "@/components/ui/Tag";
import { CommandString } from "@/components/ui/CommandString";
import { cn } from "@/lib/utils";

const MODULE_COLORS: Record<ModuleId, "gold" | "felt" | "chip" | "blue"> = {
  general: "blue",
  economy: "felt",
  casino: "gold",
  life: "chip",
};

const FILTERS: ("all" | ModuleId)[] = [
  "all",
  "general",
  "economy",
  "casino",
  "life",
];

export function CommandsExplorer({ commands }: { commands: Command[] }) {
  const [query, setQuery] = useState("");
  const [module, setModule] = useState<"all" | ModuleId>("all");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((c) => {
      if (module !== "all" && c.module !== module) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [commands, query, module]);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands, aliases, anything…"
          aria-label="Search commands"
          className="w-full max-w-md rounded-xl border border-line bg-panel px-4 py-2.5 text-ink placeholder:text-muted focus:border-gold/50 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setModule(f)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                module === f
                  ? "border-gold bg-gold text-bg"
                  : "border-line bg-panel text-muted hover:text-ink"
              )}
            >
              {f === "all" ? "All" : MODULE_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 font-mono text-sm text-muted">
        {filtered.length} command{filtered.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel p-10 text-center text-muted">
          The deck&apos;s empty. Try another word.
        </p>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
          {filtered.map((c) => {
            const isOpen = open === c.id;
            return (
              <div key={c.id} id={c.id} className="scroll-mt-24">
                <button
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-panel-2"
                >
                  <span className="font-mono text-base font-bold text-ink">
                    {c.name}
                  </span>
                  {c.aliases.slice(0, 3).map((a) => (
                    <Tag key={a}>{a}</Tag>
                  ))}
                  <span className="hidden flex-1 truncate text-sm text-muted sm:block">
                    {c.short}
                  </span>
                  <Tag color={MODULE_COLORS[c.module]}>
                    {MODULE_LABELS[c.module]}
                  </Tag>
                  {c.interactive && <Tag color="blue">buttons</Tag>}
                  <ChevronDown
                    size={16}
                    className={cn(
                      "text-muted transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="space-y-4 border-t border-line bg-panel-2 px-5 py-5">
                    <p className="text-ink sm:hidden">{c.short}</p>
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                        Usage
                      </p>
                      <CommandString command={c.usage} />
                    </div>
                    {c.args && c.args.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                          Arguments
                        </p>
                        <ul className="space-y-1">
                          {c.args.map((a) => (
                            <li key={a.name} className="text-sm">
                              <span className="font-mono text-gold">
                                {a.name}
                              </span>{" "}
                              <span className="text-muted">— {a.desc}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
                        Examples
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {c.examples.map((e) => (
                          <CommandString key={e} command={e} />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {c.cooldown && (
                        <p>
                          <span className="text-muted">Cooldown:</span>{" "}
                          <span className="font-medium text-ink">
                            {c.cooldown}
                          </span>
                        </p>
                      )}
                      {c.jailBlocked && (
                        <p className="font-medium text-chip">
                          Blocked while jailed
                        </p>
                      )}
                      {c.aliases.length > 0 && (
                        <p>
                          <span className="text-muted">Aliases:</span>{" "}
                          <span className="font-mono text-ink">
                            {c.aliases.join(", ")}
                          </span>
                        </p>
                      )}
                    </div>
                    {c.keyNumbers && c.keyNumbers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {c.keyNumbers.map((k) => (
                          <span
                            key={k.label}
                            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm"
                          >
                            <span className="text-muted">{k.label}: </span>
                            <span className="font-mono font-medium text-gold">
                              {k.value}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `dashboard/src/app/commands/page.tsx`:**

```tsx
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { CommandsExplorer } from "@/components/commands/CommandsExplorer";
import { COMMANDS } from "@/content/commands";

export const metadata: Metadata = {
  title: "Commands",
  description:
    "Every Fortuna command — usage, examples, cooldowns, payouts, and aliases. The whole deck, face up.",
};

export default async function CommandsPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          The whole deck, face up.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every command Fortuna answers to — {COMMANDS.length} of them, with
          usage, cooldowns, and the numbers behind each one. Default prefix is{" "}
          <span className="font-mono text-ink">!</span> (servers can change
          it).
        </p>
        <div className="mt-10">
          <CommandsExplorer commands={COMMANDS} />
        </div>
      </div>
      <Footer />
    </main>
  );
}
```

- [ ] **Step 3: Verify build + smoke:**

```bash
cd dashboard && npm run build
```

Expected: success. Then dev-server smoke with Playwright: `/commands` renders all rows; searching "black" narrows to blackjack (+ any alias matches); the Casino pill filters; clicking a row expands usage/examples; `/commands#work` scrolls to the work row.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/commands/page.tsx dashboard/src/components/commands
git commit -m "feat(web): searchable commands reference with module filters and expandable detail"
```

---

### Task 9: Docs hub + module pages + redirect

**Files:**
- Modify (replace entire file): `dashboard/src/app/docs/page.tsx`
- Create: `dashboard/src/app/docs/[module]/page.tsx`
- Create: `dashboard/src/components/docs/DocsSidebar.tsx`
- Create: `dashboard/src/components/docs/ModuleRenderer.tsx`
- Modify: `dashboard/next.config.ts` (add `/docs/commands` → `/commands` redirect)

**Interfaces:**
- Consumes: `MODULE_DOCS`, `getModuleDoc` from `@/content/modules`; `getCommand` from `@/content/commands`; Task 2 primitives; Task 6 chrome.
- Produces: `/docs` and `/docs/[module]` routes for all 10 slugs.

**Before writing UI code: load the `frontend-design` and `ui-ux-pro-max` skills.**

- [ ] **Step 1: Create `dashboard/src/components/docs/DocsSidebar.tsx`:**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDoc } from "@/content/types";
import { cn } from "@/lib/utils";

export function DocsSidebar({ modules }: { modules: ModuleDoc[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs navigation" className="space-y-1">
      {modules.map((m) => {
        const href = `/docs/${m.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={m.slug}
            href={href}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-gold/15 text-gold"
                : "text-muted hover:bg-panel hover:text-ink"
            )}
          >
            {m.title}
          </Link>
        );
      })}
      <Link
        href="/commands"
        className="mt-3 block rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        All commands →
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Create `dashboard/src/components/docs/ModuleRenderer.tsx`:**

```tsx
import Link from "next/link";
import * as icons from "lucide-react";
import type { ModuleDoc } from "@/content/types";
import { getCommand } from "@/content/commands";
import { Panel } from "@/components/ui/Panel";
import { CommandString } from "@/components/ui/CommandString";

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon =
    (icons as unknown as Record<string, icons.LucideIcon>)[name] ??
    icons.BookOpen;
  return <Icon className={className} />;
}

export function ModuleRenderer({ doc }: { doc: ModuleDoc }) {
  return (
    <article className="min-w-0 max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <ModuleIcon name={doc.icon} className="h-7 w-7 text-gold" />
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          {doc.title}
        </h1>
      </div>
      <p className="text-lg text-muted">{doc.tagline}</p>

      {/* For Beginners callout */}
      <Panel className="mt-8 border-felt/40 bg-felt/10 p-6">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-felt">
          For beginners
        </p>
        <p className="leading-relaxed text-ink">{doc.forBeginners.what}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {doc.forBeginners.firstCommands.map((c) => (
            <CommandString key={c} command={c} />
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          <span className="font-bold text-felt">Tip:</span>{" "}
          {doc.forBeginners.tip}
        </p>
      </Panel>

      {/* Sections */}
      {doc.sections.map((s) => (
        <section key={s.heading} className="mt-12">
          <h2 className="font-display text-2xl font-bold text-ink">
            {s.heading}
          </h2>
          {s.body.map((p, i) => (
            <p key={i} className="mt-3 leading-relaxed text-muted">
              {p}
            </p>
          ))}
          {s.table && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse overflow-hidden rounded-xl border border-line text-sm">
                {s.table.title && (
                  <caption className="border border-b-0 border-line bg-panel-2 px-4 py-2 text-left font-bold text-ink">
                    {s.table.title}
                  </caption>
                )}
                <thead>
                  <tr className="bg-panel-2 text-left">
                    {s.table.columns.map((c) => (
                      <th
                        key={c}
                        className="border-b border-line px-4 py-2.5 font-bold text-ink"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((row, ri) => (
                    <tr key={ri} className="bg-panel">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="border-b border-line px-4 py-2.5 text-muted first:font-mono first:text-ink"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.note && (
            <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">
              {s.note}
            </p>
          )}
        </section>
      ))}

      {/* Related commands */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-ink">
          Commands in this module
        </h2>
        <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-panel">
          {doc.commandIds.map((id) => {
            const cmd = getCommand(id);
            if (!cmd) return null;
            return (
              <Link
                key={id}
                href={`/commands#${id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-panel-2"
              >
                <span className="font-mono font-bold text-ink">{cmd.name}</span>
                <span className="truncate text-sm text-muted">{cmd.short}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Pro tips */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-ink">Pro tips</h2>
        <ul className="mt-4 space-y-2.5">
          {doc.proTips.map((t) => (
            <li key={t} className="flex gap-2.5 text-muted">
              <span aria-hidden className="mt-0.5 select-none text-gold">
                ♦
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
```

- [ ] **Step 3: Create `dashboard/src/app/docs/[module]/page.tsx`:**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { ModuleRenderer } from "@/components/docs/ModuleRenderer";
import { MODULE_DOCS, getModuleDoc } from "@/content/modules";

export function generateStaticParams() {
  return MODULE_DOCS.map((m) => ({ module: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  const { module } = await params;
  const doc = getModuleDoc(module);
  if (!doc) return {};
  return { title: `${doc.title} — Docs`, description: doc.tagline };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const doc = getModuleDoc(module);
  if (!doc) notFound();

  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <div className="mx-auto flex max-w-6xl gap-12 px-6 pb-24 pt-12">
        <aside className="sticky top-24 hidden w-56 shrink-0 self-start lg:block">
          <DocsSidebar modules={MODULE_DOCS} />
        </aside>
        <ModuleRenderer doc={doc} />
      </div>
      <Footer />
    </main>
  );
}
```

- [ ] **Step 4: Replace `dashboard/src/app/docs/page.tsx` entirely with:**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import * as icons from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Panel } from "@/components/ui/Panel";
import { MODULE_DOCS } from "@/content/modules";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Fortuna works — every system explained, from your first 1,000 Fortunes to your first missed credit card payment.",
};

function CardIcon({ name }: { name: string }) {
  const Icon =
    (icons as unknown as Record<string, icons.LucideIcon>)[name] ??
    icons.BookOpen;
  return <Icon className="h-6 w-6 text-gold" />;
}

export default async function DocsHub() {
  const session = await getServerSession(authOptions);
  const [starter, ...rest] = MODULE_DOCS;

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          Know the house. Beat the house.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every Fortuna system, documented — the odds, the prices, the taxes,
          and the fine print the dealer reads fast.
        </p>

        <Link href={`/docs/${starter.slug}`} className="mt-10 block">
          <Panel className="border-gold/40 p-8 transition-colors hover:border-gold">
            <p className="font-mono text-sm font-medium uppercase tracking-widest text-gold">
              Start here
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">
              {starter.title}
            </h2>
            <p className="mt-2 max-w-xl text-muted">{starter.tagline}</p>
          </Panel>
        </Link>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}`}>
              <Panel className="h-full p-6 transition-colors hover:border-gold/40">
                <CardIcon name={m.icon} />
                <h2 className="mt-3 font-display text-lg font-bold text-ink">
                  {m.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {m.tagline}
                </p>
              </Panel>
            </Link>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
```

- [ ] **Step 5: Add the redirect in `dashboard/next.config.ts`.** Read the file; add a `redirects` entry to the existing config object (keep everything already there):

```ts
async redirects() {
  return [
    {
      source: "/docs/commands",
      destination: "/commands",
      permanent: true,
    },
  ];
},
```

Note: the old `src/app/docs/commands/page.tsx` still exists until Task 11. A filesystem route wins over a redirect, so the redirect takes effect once Task 11 deletes that folder — that is expected and fine.

- [ ] **Step 6: Verify build + smoke:**

```bash
cd dashboard && npm run build
```

Expected: success, with all 10 `/docs/[module]` pages in the static output. Playwright smoke: `/docs` hub shows Start-here card + 9 module cards; `/docs/casino` renders the For-Beginners felt panel, cooldown/limits table, command links to `/commands#...`; `/docs/nope` 404s.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/app/docs dashboard/src/components/docs dashboard/next.config.ts
git commit -m "feat(web): docs hub + 10 module pages with for-beginners callouts; redirect /docs/commands"
```

---

### Task 10: Restyle changelog, privacy policy, and terms in place

**Files:**
- Modify: `dashboard/src/app/changelog/page.tsx`
- Modify: `dashboard/src/app/policy/page.tsx`
- Modify: `dashboard/src/app/terms/page.tsx`

**Interfaces:**
- Consumes: Task 2 primitives, Task 6 chrome.
- Produces: same routes, same content, new skin.

Rules for all three pages (content is PRESERVED — this is a reskin, not a rewrite):
1. Read each file first. Keep every piece of actual content: changelog entries/dates, legal paragraphs, headings, contact info.
2. Page shell becomes: `LandingNavbar` (with session user where the page already fetches it; add `getServerSession` if the page is a server component and doesn't) → content column `mx-auto max-w-3xl px-6 pb-24 pt-16` → `Footer`.
3. Page `h1` uses `font-display text-4xl font-extrabold tracking-tight text-ink`; section headings `font-display text-2xl font-bold text-ink`; body text `text-muted leading-relaxed`; links `text-gold hover:text-gold-deep`.
4. Replace every old-styling construct: `GlassCard` → `Panel` (p-6/p-8), gradient text → plain `text-ink`/`text-gold`, `motion.*` wrappers → plain elements (legal pages need zero motion), particles/spotlight/glow → delete, `bg-[#0a0a0a]`/zinc colors → token classes (`bg-bg`, `text-muted`, `border-line`).
5. Changelog entries: each release becomes a `Panel className="p-6"` with the version/date as a `font-mono text-sm text-gold` line. If the changelog page imports version data from elsewhere, keep that import untouched.

- [ ] **Step 1: Restyle `changelog/page.tsx`** per the rules above.
- [ ] **Step 2: Restyle `policy/page.tsx`** per the rules above.
- [ ] **Step 3: Restyle `terms/page.tsx`** per the rules above.
- [ ] **Step 4: Verify build + smoke:**

```bash
cd dashboard && npm run build
```

Expected: success. Playwright smoke: all three pages render with the new chrome, no gradient/glass remnants, all original text present (spot-check one legal paragraph and one changelog entry against `git show HEAD -- <file>`).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/app/changelog dashboard/src/app/policy dashboard/src/app/terms
git commit -m "feat(web): restyle changelog, privacy, and terms to flat design system"
```

---

### Task 11: Delete V1 pages, dead components, and banned styling

**Files:**
- Delete: `dashboard/src/app/team/` (whole folder)
- Delete: `dashboard/src/app/commands/admin/` (whole folder — the public `/commands` page from Task 8 stays)
- Delete: `dashboard/src/app/docs/commands/` (whole folder — redirect from Task 9 takes over)
- Delete: `dashboard/src/components/AmbientBackground.tsx`, `CursorSpotlight.tsx`, `FloatingParticles.tsx`, `InteractiveCardDeck.tsx`, `PokerCard.tsx`, `FeatureSection.tsx`, `GeneralSidebar.tsx`
- Delete: `dashboard/src/components/ui/BackgroundParticles.tsx`, `GlassCard.tsx`, `ScrollReveal.tsx`, `TextGlow.tsx`
- Delete: `dashboard/src/components/docs/SharedDocs.tsx`

**Interfaces:**
- Consumes: nothing. Produces: a codebase where the banned-styling greps return zero.

- [ ] **Step 1: Delete the folders and files:**

```bash
rm -rf dashboard/src/app/team dashboard/src/app/commands/admin dashboard/src/app/docs/commands
rm -f dashboard/src/components/AmbientBackground.tsx dashboard/src/components/CursorSpotlight.tsx dashboard/src/components/FloatingParticles.tsx dashboard/src/components/InteractiveCardDeck.tsx dashboard/src/components/PokerCard.tsx dashboard/src/components/FeatureSection.tsx dashboard/src/components/GeneralSidebar.tsx
rm -f dashboard/src/components/ui/BackgroundParticles.tsx dashboard/src/components/ui/GlassCard.tsx dashboard/src/components/ui/ScrollReveal.tsx dashboard/src/components/ui/TextGlow.tsx
rm -f dashboard/src/components/docs/SharedDocs.tsx
```

- [ ] **Step 2: Find and fix any survivors that still import the deleted files:**

```bash
grep -rn "GlassCard\|BackgroundParticles\|FloatingParticles\|CursorSpotlight\|AmbientBackground\|TextGlow\|InteractiveCardDeck\|PokerCard\|ScrollReveal\|SharedDocs\|GeneralSidebar\|FeatureSection" dashboard/src || echo CLEAN
```

Expected: `CLEAN`. If a file still imports one of these, that file was missed by its owning task — restyle it now using the Task 10 rules (do NOT re-create the deleted component).

- [ ] **Step 3: Run the banned-styling greps:**

```bash
grep -rn "gradient" dashboard/src || echo NO-GRADIENTS
grep -rn "backdrop-blur" dashboard/src || echo NO-BLUR
grep -rn "shadow-\[0_0\|drop-shadow-\[0_0" dashboard/src || echo NO-GLOW
grep -rn "/team\|/premium\|/refund" dashboard/src || echo NO-DEAD-LINKS
```

Expected: all four `NO-*` lines. Fix any hit (the `/docs/commands` string may legitimately appear only in `next.config.ts` as the redirect source — that one is allowed).

- [ ] **Step 4: Verify build:**

```bash
cd dashboard && npm run build
```

Expected: success; `/team`, `/commands/admin`, `/docs/commands` no longer in the route list.

- [ ] **Step 5: Commit**

```bash
git add -A dashboard/src
git commit -m "chore(web): remove team page, admin commands page, and all V1 glass/particle/gradient components"
```

---

### Task 12: Final QA — full smoke, accessibility review, fixes

**Files:**
- Modify: whatever the findings require (expect small copy/contrast/focus fixes).

**Interfaces:**
- Consumes: the finished site. Produces: the verified site.

- [ ] **Step 1: Full production build, zero warnings that matter:**

```bash
cd dashboard && npm run build
```

Expected: success. Route list contains exactly: `/`, `/commands`, `/docs`, `/docs/[module]` (10 static paths), `/changelog`, `/policy`, `/terms`, `/api/auth/[...nextauth]`.

- [ ] **Step 2: Playwright smoke pass** (dev server or `npm start` after build). Check and note results for each:
  - `/` — hero, mockups, card fan, reviews (or gracefully absent), all CTAs resolve; no horizontal scroll at 375px width.
  - `/commands` — search, filter pills, expand/collapse, copy button copies, `#blackjack` anchor works.
  - `/docs` + all 10 module pages — sidebar active state, For-Beginners panel, tables scroll on mobile width instead of overflowing.
  - `/docs/commands` — redirects to `/commands`.
  - `/changelog`, `/policy`, `/terms` — render with new chrome.
  - `/team` — 404s.
  - Login button starts the Discord OAuth flow (clicking it navigates to Discord's authorize page — do not complete login).
- [ ] **Step 3: Run the `web-design-guidelines` skill review** over `dashboard/src` (focus: contrast, focus states, keyboard nav on the commands accordion, reduced-motion, touch targets ≥ 44px on filter pills and nav). Fix every finding it rates important.
- [ ] **Step 4: Voice pass** — read every user-visible string on `/`, `/commands`, `/docs` hub. Kill any corporate filler that slipped in ("engage", "supercharge", "ultimate", "seamless", "empower"). Numbers must match INVENTORY exactly — spot-check five against the appendix (blackjack 2.5x, daily 100,000, Starter limit 1.5M, degree ladder 150k–10M, transfer tax 5%).
- [ ] **Step 5: Commit fixes**

```bash
git add -A dashboard/src
git commit -m "fix(web): QA pass — accessibility, copy, and smoke-test fixes"
```

---

## Plan Self-Review Notes (already applied)

- Old `/docs/commands` page and `/commands/admin` deletion deliberately deferred to Task 11 so Tasks 1–10 never break the build; the Task 9 redirect activates once Task 11 removes the filesystem route.
- `LandingNavbar`/`Footer`/`MobileSidebar` keep their export names and prop shapes so old pages compile throughout.
- `INVITE_URL`/`SUPPORT_URL`/`VOTE_URL` live in `src/lib/links.ts` and are consumed by `LandingNavbar`, `Footer`, `Hero`, `FinalCTA`, `MobileSidebar` — single source for external URLs, no circular imports.
- The 65-id list in Task 3 matches INVENTORY's coverage confirmation (5 general + 34 economy + 11 casino + 15 life).
- All `commandIds` used in Tasks 4–5 exist in the Task 3 id list (checked per module; Task 5 Step 8 re-verifies mechanically).
