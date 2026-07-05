# Fortuna Website V2 Refactor — Design Spec

Date: 2026-07-05
Status: Approved by Ujjwal (visual direction, scope, architecture, and full design approved in brainstorming session)

Companion documents:

- [Command inventory appendix](2026-07-05-website-v2-refactor-command-inventory.md) — exhaustive, code-accurate inventory of every live player-facing command (54 command files; several files expose multiple commands — e.g. properties has 5, marriage 3, jail 2 — all documented) with aliases, usage, cooldowns, payouts, and system constants. This is the single source of truth for the commands page and docs content.
- [Competitor research appendix](2026-07-05-website-v2-refactor-competitor-research.md) — analysis of Dank Memer, MEE6, UnbelievaBoat, Carl-bot, Tatsu, ProBot, OwO, Karuta, Sofi sites; genre conventions and design recommendations.

## Goal

Rebuild the public website (Next.js app in `dashboard/`) as a modern, flat, personality-driven marketing + reference site for Fortuna V2 — the global-economy Discord casino bot. Kill the "AI-generated SaaS template" look entirely (no gradients, no glassmorphism, no particles, no glow). Ship new, complete, code-accurate docs and commands reference. Remove V1-era and dead surface area.

## Decisions Made (locked)

1. **Visual direction:** Flat playful (Dank Memer-like) — bold flat colors, chunky rounded type, casino iconography as flat shapes. Zero gradients.
2. **Docs scope:** Document everything live in the bot today, including partially-migrated systems (shop, stocks, property, marriage). All content framed by V2 rules.
3. **Changelog:** kept. **Team page:** deleted. **Admin commands:** excluded from public site; `/commands/admin` page deleted.
4. **Content architecture:** typed TypeScript data files rendered by shared components. No MDX, no new dependencies.
5. **Discord OAuth (next-auth):** kept as-is functionally — Login button → avatar + sign-out dropdown. No dashboard behind it yet (future work builds on top).

## Sitemap

| Route | Action |
|---|---|
| `/` | Rebuild landing page (7 sections, below) |
| `/commands` | NEW top-level searchable command reference (every player-facing command) |
| `/docs` | NEW docs hub (getting-started card + module card grid) |
| `/docs/[module]` | NEW 10 module doc pages (static params from content data) |
| `/docs/commands` | 301 redirect → `/commands` (old URL) |
| `/changelog` | Keep, restyle to new design system |
| `/policy` | Keep URL and content, restyle |
| `/terms` | Keep URL and content, restyle |
| `/team` | DELETE |
| `/commands/admin` | DELETE |

Dead-link cleanup: remove navbar "Premium" button (no href, no product), footer links to `/premium` and `/refund` (pages don't exist). External links kept: support server `https://discord.gg/Y5P44UCH2Y`, top.gg vote link, bot invite URL (client id `1371816936857669702`).

## Design System

- **Surfaces:** warm near-black base `#0E0F13`; flat panels `#15171C`; 1px hairline borders `#26282F`. Light text `#F2F3F5`, muted `#9BA0AA`.
- **Accent:** chip-gold/amber (approx `#FFB627`) for primary CTAs and highlights. NOT blurple/purple (genre-saturated per research). Secondary flat colors used only for small tags/chips: felt green `#2F9E6E`, chip red `#E5484D`, card blue `#4C8DFF`.
- **Typography:** Bricolage Grotesque (via `next/font/google`) for display/headlines; Inter for body; JetBrains Mono for command strings and code.
- **Decoration:** sparse flat card-suit / dice-pip / chip glyphs at ~5% opacity as the only ornament. No images-as-backgrounds on the landing hero.
- **Voice:** every string in-character (confident dealer energy). Section titles as commands/questions ("So what do you actually do?", "Stop scrolling. Start grinding."). Applies to empty states and 404 too.
- **Motion:** restrained. Hover/press states, simple fade-up on scroll-in. framer-motion stays as the tool; floating/parallax/particle animations are banned.
- **Honesty:** no fabricated stats (no fake server counts). Social proof = real top.gg reviews via existing `lib/topgg-reviews.ts`.
- **Deleted components:** `GlassCard`, `BackgroundParticles`, `FloatingParticles`, `CursorSpotlight`, `AmbientBackground`, `TextGlow`, `InteractiveCardDeck`, `PokerCard`, `ScrollReveal` (replace with a minimal fade-up primitive or plain CSS).
- **New shared primitives:** flat `Panel`, `Tag`/`Chip`, `CommandString` (mono, copy-on-click), `DiscordMockup` (see below), section header with in-voice eyebrow.

### DiscordMockup component

Hand-built, pixel-faithful fake Discord message component: avatar, bot name + APP badge, timestamp, message content, embed-style container, and a Discord-style button row (e.g. Hit / Stand). Reused across landing sections with different content (blackjack round, work shift result, credit card statement). Research finding: this is the single most persuasive element in the genre (UnbelievaBoat's blackjack mockup). Content must reflect real Fortuna output formats and real numbers.

## Landing Page (7 sections, in order)

1. **Navbar** — flat full-width bar (no floating pill, no blur): logo + FORTUNA wordmark; links Commands, Docs, Changelog; right side: Login (OAuth, unchanged behavior) + gold "Add to Discord" button. Mobile: existing sidebar pattern, restyled flat.
2. **Hero** — left-aligned. Chunky display headline in voice (working copy: "GET RICH. GO BROKE. REPEAT."). One-line pitch leading with V2's real differentiator: one account, every server (e.g. "Fortuna is a global economy and casino inside Discord — one wallet across every server. Earn, gamble, build credit, and go broke with friends."). CTAs: primary "Add to Discord" (invite URL), secondary "Play in our server" (support server invite — try-before-install). Right column: `DiscordMockup` showing a live blackjack hand with Hit/Stand buttons.
3. **"So what do you actually do?"** — flat 2×2 grid inside one panel: Earn (jobs, degrees, daily grind), Bet (6 casino games, wallet-only), Borrow (credit cards with real consequences), Compete (rob, leaderboards, marriage). Left-aligned text, small flat icons.
4. **Three alternating two-column feature sections** (media side alternates left/right):
   - **Casino:** roulette/slots `DiscordMockup`; copy cites real payout numbers (single number x36, slots 7️⃣ 20x, blackjack pays 2.5x).
   - **Credit cards:** real card art from bot `src/assets/*_card.png` (copy assets into `dashboard/public/`); 4 tiers with real limits (Starter 1.5M → Black 60M), the weekly statement cycle, and the threat of garnishment. This is Fortuna's signature system — sell the consequences.
   - **Life sim:** work/study `DiscordMockup`; 8 degrees, 20+ jobs, career tiers, stress and the `!relax` economy.
5. **"Your first 10 minutes"** — beginner path strip, 4 steps as flat cards: `!start` (1,000 Fortunes) → `!work` → `!daily` (100,000) → first bet (`!blackjack 10000`). Each step links to relevant docs module.
6. **Player reviews** — real top.gg reviews (existing `TopGGReviews` data source), restyled as flat quote cards. Keep `lib/topgg-reviews.ts`, `lib/cache.ts`, `lib/redis.ts`.
7. **Final CTA + footer** — in-voice CTA banner ("Stop scrolling. Start grinding." + Add to Discord), then 4-column footer mini-sitemap: Play (Commands, Casino docs, Leaderboards docs), Learn (Docs, Getting Started, Changelog), Community (Support server, Vote on top.gg), Legal (Terms, Privacy). Copyright line. No dead links.

## Commands Page (`/commands`)

- Header: in-voice title + one-liner + command count computed from the data array at build time (never hardcoded).
- Controls: search box (matches name, aliases, description) + module filter pills: All · General · Economy · Casino · Life (+ result count). Client component; content itself statically rendered from data.
- Rows: stacked full-width expandable rows (not cards). Collapsed: `!command` in mono + alias chips + one-line description + module tag + "interactive" tag where the command opens buttons/menus. Expanded: usage syntax, argument explanations, 1–2 realistic examples, cooldown, key numbers (bet limits, payouts, prices, taxes), copy-to-clipboard for the base command.
- Every command row has a stable anchor id (`#work`) so docs pages can deep-link.
- Data source: `src/content/commands.ts` — every entry transcribed from the command inventory appendix. Every player-facing command, no omissions. Admin/developer commands excluded.
- Global facts surfaced on this page: default prefix `!` (per-server configurable), no slash commands (prefix-based bot), jail blocks a listed set of commands, casino global cooldowns, default bet limits (min 10,000 / max 1,000,000 with per-game caps).

## Docs (`/docs` + `/docs/[module]`)

**Hub page:** in-voice hero, prominent "Start here" card → getting-started, then a card grid of the other 9 modules (icon, title, one-line hook).

**10 modules** (slugs): `getting-started`, `economy`, `bank-and-credit`, `casino`, `jobs-and-careers`, `education`, `items-and-shop`, `hunting-and-animals`, `investments`, `life-and-social`.

Module → content mapping (from inventory):

| Module | Covers |
|---|---|
| getting-started | What Fortuna is, V2 one-account-everywhere model, prefix, `!start`, `!help`, `!tutorial`, `!profile`, `!ping`, the first-10-minutes path, where money comes from |
| economy | Wallet vs bank, `!balance`, `!deposit`/`!withdraw`, `!transfer` (5% tax) / `!ask`, `!daily`/`!weekly`/`!monthly`/`!vote` (amounts, cooldowns, 8% income tax), `!beg`/`!slut`, `!crime` (payouts, heat), `!rob` (mechanics, item interactions), jail & bail, tax/heat scanner, `!leaderboard` |
| bank-and-credit | `!bank` dashboard, FD (10% APR) / RD (8% APR) investments, the full credit card system: 4 tiers with real limits/interest/caps, eligibility (score + career tier), weekly statements, minimum due, score changes (+30 full / +20 min / −45 miss / −60 repeat), DELINQUENT/LOCKED states, 25% garnishment, `!card`/`!mycards`/`!credit` |
| casino | All 6 games with full payout tables, bet limits, cooldowns; wallet-only rule (no bank/card betting); active-game lock; `!coinflip`, `!slots`, `!blackjack`, `!bet` (roulette), `!rr`, `!cockfight` + `!casino` guide command |
| jobs-and-careers | `!jobs`/`!apply`/`!work`/`!career`, career tiers 0–4, degree requirements, pay ranges (30k–450k), job stress, work events, garnishment interaction |
| education | 8 degrees with real prices (150k–10M), `!enroll`/`!study` (5-min cooldown, minigame)/`!exam`/`!dropout`/`!degrees`, scholarships, education stress, why degrees matter (jobs + card tiers) |
| items-and-shop | `!shop` categories (GENERAL/HUNT/JOB/UNI/COCK/COSMETICS), buying with wallet vs credit card, `!inventory`, `!use`/`!equip`/`!iteminfo`, notable items and effects (Padlock, Lucky Coin, Crown of Greed, etc.), Black Market (`!market`, 5%+10% fees, 7-day expiry, 5 listings max) |
| hunting-and-animals | `!hunt` (rifles from shop, crafting), `!zoo` (capacity/income by rarity, needs zoo property), `!chicken` (train, traits, equip), `!feed`, cockfight preparation |
| investments | Global stock market (`!stock` buy/sell/portfolio/news, 30-min ticks, risk labels, delistings), `!my-stocks` P/L, real estate (`!properties` browse/buy/sell, rent collection) |
| life-and-social | Marriage (`!marry`/`!divorce`/`!family`, joint vault, affection actions), daily quests (`!quests`, streaks, rerolls), stress & `!relax` (4 options with real prices), social money features recap |

**Every module page uses the same skeleton** (rendered from typed data):

1. Title + in-voice tagline
2. **"For Beginners" callout** — visually distinct felt-green panel: plain-language "what is this system", the first 2–3 commands to try, and one warning/tip. This satisfies the required beginners field on every module.
3. "How it works" sections (structured prose)
4. Key-numbers tables (payouts, prices, tiers, cooldowns — all values from the inventory appendix, never invented)
5. Related commands list (each linking to `/commands#anchor`)
6. Pro tips (in-voice)

**Layout:** left sticky sidebar (module nav), content column with on-page section links on wide screens. Mobile: collapsible nav.

**V2 framing rules for all docs copy:** one account across all servers (never say "global" in a jargon way — say "your balance follows you to every server"); gambling is wallet-only; the only per-server setting is the prefix; credit cards can't fund gambling.

## Content Architecture

```
dashboard/src/content/
  commands.ts          // Command[] — every player-facing command, typed
  modules/
    getting-started.ts // ModuleDoc each
    economy.ts
    bank-and-credit.ts
    casino.ts
    jobs-and-careers.ts
    education.ts
    items-and-shop.ts
    hunting-and-animals.ts
    investments.ts
    life-and-social.ts
  types.ts             // Command, ModuleDoc, DocSection, KeyNumberTable types
```

Sketch of core types:

```ts
type Command = {
  id: string;            // anchor slug, e.g. "work"
  name: string;          // "!work"
  aliases: string[];
  module: "general" | "economy" | "casino" | "life";
  short: string;         // one-liner
  usage: string;         // "!blackjack <bet>"
  args?: { name: string; desc: string }[];
  examples: string[];
  cooldown?: string;     // human-readable, e.g. "30 min (casino)"
  keyNumbers?: { label: string; value: string }[];
  interactive?: boolean; // buttons/menus
};

type ModuleDoc = {
  slug: string;
  title: string;
  tagline: string;
  icon: string;          // lucide icon name
  forBeginners: { what: string; firstCommands: string[]; tip: string };
  sections: DocSection[];        // heading + paragraphs + optional table/callout
  commandIds: string[];          // links into /commands
  proTips: string[];
};
```

`/docs/[module]/page.tsx` uses `generateStaticParams` over the module registry. One renderer, ten data files.

## Out of Scope / Kept Untouched

- next-auth config, `lib/auth.ts`, Prisma/Redis wiring — unchanged.
- No dashboard/app functionality behind login (explicitly deferred; OAuth kept as the foundation).
- Bot code (`src/`) untouched except copying card PNG assets into `dashboard/public/`.
- No premium/pricing page, no blog, no status page (future candidates).
- Changelog content itself (restyle only).
- Legal copy in `/policy` and `/terms` (restyle only).

## Error Handling / Edge Cases

- Commands search with zero results → in-voice empty state ("The deck's empty. Try another word.").
- Unknown `/docs/[module]` slug → `notFound()`.
- top.gg reviews fetch failure → section renders nothing (existing behavior preserved).
- All external links `rel="noopener noreferrer"`.
- Old `/docs/commands` URL redirects permanently to `/commands` (next.config redirect).

## Testing / Verification

- `npm run build` in `dashboard/` passes (static generation of all docs/commands pages).
- Manual pass with Playwright: landing, commands (search + filter + expand + copy), each docs module, changelog, policy, terms, login flow smoke test, mobile viewport check.
- Web-design-guidelines skill review pass over the finished UI (accessibility: contrast on gold-on-dark CTAs, focus states, reduced-motion).
- Grep-verify: no `gradient`, `backdrop-blur`, `GlassCard`, particle/glow classes remain in `dashboard/src`.
- Link check: no references to `/team`, `/premium`, `/refund`, `/commands/admin`, `/docs/commands` (except the redirect).

## Implementation Skills (per user request)

Implementation phase must use: `ui-ux-pro-max` (design intelligence), `frontend-design` (aesthetic direction), `motion-design` (the restrained motion pass), `web-design-guidelines` (final compliance review). Content accuracy comes from the command inventory appendix, not memory.
