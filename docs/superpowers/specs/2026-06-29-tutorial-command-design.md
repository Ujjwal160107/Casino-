# Tutorial Command Redesign — Design

Last updated: 2026-06-29

## Goal

Replace the stale embed-based `tutorial` command with a Components V2 **"How to Play"** guide that teaches players *how to progress* and *how each system works* — distinct from `help` (command reference) and `casino` (per-game rules).

## Non-goals

- Changing `help` or `casino` (they stay as-is; the tutorial links to them).
- Documenting every command/subcommand — that is `help`'s job. The tutorial teaches mechanics and strategy.
- New assets — reuse the existing `src/assets/guide_banner.png`.
- Any default/Unicode emoji. **Branding emotes from `branding.ts` only**, everywhere (titles, sections, nav stays text-only).

## Context

| Existing | State |
|----------|-------|
| `tutorial.ts` (`handleTutorial`, routes `tutorial`/`guide`) | Old `EmbedBuilder` + select menu; **stale** content (GPA/grades, server-specific `store`). Pre-V2. To be rewritten. |
| `casinoGuide.ts` (`casino`) | Modern Components V2: sections + button-per-row + pagination + ephemeral details. **Pattern to follow.** |
| `help.ts` (`help`) | Components V2 module menu: sections (text left, button right), separators, bottom nav, ephemeral module views, persistent routing via `help:` prefix in `index.ts`. **Pattern to follow.** |

## Decisions (from brainstorming)

- **Structure:** Hybrid — a static **New Player Path** plus **Learn a System** deep-dives.
- **Path style:** Static numbered path + system buttons (one home screen, like help).
- **Lessons:** Mirror all **16 help modules**, each a *how-to-play* deep-dive (not a command list).
- **Approach:** Rewrite `tutorial.ts`; keep `tutorial`/`guide` aliases; route buttons globally (persistent), so the home menu never expires.
- **Banner:** Show `guide_banner.png` on the home screen.

## Architecture

Single file `src/commands/general/tutorial.ts`, self-contained (does not import help's data). One new interaction route in `index.ts`.

### Data

```ts
interface SystemLesson {
  id: string;        // matches a help module id, e.g. "economy"
  label: string;     // "Economy"
  emote: string;     // Mascot.Emotes.* (branding only)
  teaser: string;    // one line shown on the home section
  howItWorks: string;
  howToUse: string[]; // concrete steps with real commands ({p} = prefix)
  tip: string;
  next?: string;      // cross-link line, e.g. "Game rules: {p}casino"
}
```

`LESSONS: SystemLesson[]` holds all 16, in progression-friendly order. `{p}` is replaced with the guild prefix at render time.

### Customs IDs / routing

- `tut:module:<id>` — open a lesson as an ephemeral message (anyone may click).
- `tut:nav:<page>:<authorId>` — paginate the home; **author-locked** (non-owner gets an ephemeral "run `{p}tutorial`").
- `tut:page` — disabled page indicator button.
- `index.ts`: add `if (id.startsWith("tut:")) return handleTutorialInteraction(interaction);` (placed near the `help:` route; not early-acked, so the handler owns the reply/update).

### Home screen (public, Components V2, stays put)

`ContainerBuilder` (accent `0x9b59b6`):
1. Title `## {Mascot.Name} — How to Play` + one-line intro + `Server Prefix: {prefix}`.
2. Separator.
3. **New Player Path** — numbered steps (static text), always visible:
   1. Claim free rewards — `{p}daily` / `{p}weekly` / `{p}monthly`.
   2. Earn your first money — `{p}work`, `{p}crime`, or the casino.
   3. Bank it & get a card — `{p}bank`, then `{p}card issue`.
   4. Pick a money-maker — a job (`{p}jobs`), hunting (`{p}hunt`), or a degree (`{p}education`).
   5. Invest & grow — `{p}stock` and `{p}properties`.
   6. Build your legacy — `{p}marry`, climb `{p}leaderboard`, check `{p}profile`.
4. Separator.
5. `### Learn a System` header.
6. Up to **6 system sections per page**: `SectionBuilder` with text (`### {emote} {label}` + teaser) on the left and a `View` button (`tut:module:<id>`, Secondary) on the right; separator between sections.
7. Bottom **nav row** (only if >1 page): `Previous` (Primary) · `Page x/y` (Secondary, disabled) · `Next` (Primary). Author-locked. Plain text labels (no emoji).
8. Banner via `MediaGalleryBuilder` referencing `attachment://guide_banner.png`; the file is attached on the initial `message.reply`. On nav `update`, components are rebuilt without passing `files`/`attachments` again so the existing attachment persists (same approach as `casinoGuide`). **Fallback:** if the banner does not survive `update()` in testing, render it only on page 1.

16 modules ÷ 6 = **3 pages**. Component budget on the busiest page ≈ container(1) + title(1) + sep(1) + path(1) + sep(1) + header(1) + 6×[section+text+button+sep=4]=24 + nav[row+3]=4 + banner[sep+gallery]=2 ≈ **36** (< 40 cap).

### System lesson (ephemeral, opened by `View`)

`ContainerBuilder`:
- `## {emote} {label}`
- Separator
- `**How it works**\n{howItWorks}`
- `**How to use**` + each `howToUse` step as `- {step}`
- `**Tip:** {tip}`
- `**Where next:** {next}` (when present) — every lesson ends by pointing to `{p}help` for the full command list.
- Separators between subsections.

## Lesson content (all 16, V2-accurate)

> Mechanics reflect current V2: global economy per Discord user, wallet-only gambling, XP-based education (no GPA), Fortuna Cards (no loans).

1. **Economy** (MoneyBag) — *Teaser:* The money basics. *Works:* Your wallet is spending/gambling cash; the bank is safe storage; your balance is global across servers. *Use:* `{p}balance`; `{p}deposit <amt>`; `{p}withdraw <amt>`; `{p}transfer @user <amt>`. *Tip:* Keep gambling money in your wallet and savings in the bank — robbers can only take your wallet. *Next:* `{p}help` Economy.
2. **Banking & Cards** (Bank) — *Teaser:* Grow savings and unlock credit. *Works:* Fixed/Recurring deposits earn interest over days; a Fortuna Card lets you spend on credit and is settled weekly. *Use:* `{p}bank fd <amt> <days>`; `{p}card issue`; `{p}mycards`; `{p}card pay <amt>`. *Tip:* Pay your card before the weekly due date to avoid delinquency and protect your credit score. *Next:* `{p}credit`, `{p}help` Banking.
3. **Rewards** (Lootbox) — *Teaser:* Free money on a timer. *Works:* Daily/weekly/monthly claims plus voting rewards. *Use:* `{p}daily`; `{p}weekly`; `{p}monthly`; `{p}vote`. *Tip:* Set `{p}vote reminder` so you never miss a claim. *Next:* `{p}help` Rewards.
4. **Hustle, Crime & Jail** (Police) — *Teaser:* Fast, risky cash. *Works:* Crime and robbing pay well but can land you in jail; begging is low-risk. *Use:* `{p}crime`; `{p}rob @user`; `{p}beg`; if jailed, `{p}jail` then `{p}bail`. *Tip:* Crime risk rises as you push it — bank your winnings before the next attempt. *Next:* `{p}help` Hustle.
5. **Casino Games** (Casino) — *Teaser:* Bet your wallet, win big. *Works:* All games use wallet funds only, within bet limits. *Use:* `{p}coinflip <amt>`, `{p}slots <amt>`, `{p}blackjack <amt>`, `{p}bet <amt> <space>`. *Tip:* The house has an edge — set a budget. *Next:* full rules at `{p}casino`.
6. **Hunting & Zoo** (Gun) — *Teaser:* Hunt, craft, collect. *Works:* Buy a rifle, hunt animals (cooldown between hunts), craft gear from loot, and build a zoo. *Use:* `{p}shop hunt` for a rifle; `{p}hunt`; `{p}hunt craft`; `{p}zoo`. *Tip:* Craft consumables (bait, camouflage) to catch rarer animals. *Next:* `{p}help` Hunting.
7. **Shop & Items** (Inventory) — *Teaser:* Spend cash on gear. *Works:* Category stores (general, hunt, job, uni, cock, cosmetics) sell items you keep in your inventory; some are consumable or equippable. *Use:* `{p}shop`; `{p}shop buy <item>`; `{p}inventory`; `{p}use <item>` / `{p}equip <item>`. *Tip:* Buy on credit with `{p}shop buy card <item>` only if you can pay the card back. *Next:* `{p}help` Shop.
8. **Black Market** (Trade) — *Teaser:* Trade with other players. *Works:* A player-to-player marketplace to list and buy rare items (fees apply). *Use:* `{p}market` to browse, list, and buy. *Tip:* Compare a listing's total (with fees) against the shop price before buying. *Next:* `{p}help` Black Market.
9. **Stock Market** (GraphUp) — *Teaser:* Trade shares on one global market. *Works:* Prices move every 30 minutes on news/events; big orders pay slippage; most blind trades lose. *Use:* `{p}stock`; `{p}stock news`; `{p}stock buy <symbol> <qty>`; `{p}stock portfolio`. *Tip:* Read `{p}stock news` for rumors and avoid stocks heading for delisting. *Next:* `{p}my-stocks`, `{p}help` Stock.
10. **Real Estate** (Gem) — *Teaser:* Passive rent income. *Works:* Buy properties that generate rent you collect over time. *Use:* `{p}properties`; `{p}buy-property <key>`; `{p}collect-rent`; `{p}my-properties`. *Tip:* Reinvest rent into more properties to compound passive income. *Next:* `{p}help` Real Estate.
11. **Jobs & Career** (JobWorking) — *Teaser:* A steady paycheck. *Works:* Apply to a job, work shifts for income, and climb the career ladder; working builds stress. *Use:* `{p}jobs`; `{p}apply <job>`; `{p}work`; `{p}career`; `{p}relax`. *Tip:* Use `{p}relax` to clear stress, and earn degrees to qualify for higher-paying jobs. *Next:* `{p}help` Jobs.
12. **Education** (Graduate) — *Teaser:* Degrees unlock better jobs. *Works:* Enroll in a degree, study to gain XP, then pass the final exam to graduate; progression is XP-based. *Use:* `{p}education`; `{p}enroll <degree>`; `{p}study`; `{p}exam`; `{p}degrees`. *Tip:* Study regularly to hit the XP needed for finals; degrees give permanent perks. *Next:* `{p}help` Education.
13. **Marriage & Family** (Love) — *Teaser:* Partner up and share a vault. *Works:* Propose and marry another player to unlock a joint vault and couple actions. *Use:* `{p}marry @user`; `{p}family`; `{p}family deposit <amt>`; `{p}divorce`. *Tip:* Use the joint vault to pool savings with a trusted partner. *Next:* `{p}help` Marriage.
14. **Quests** (Scroll) — *Teaser:* Daily goals for rewards. *Works:* Daily quests/missions track actions and pay out on completion. *Use:* `{p}quests`. *Tip:* Check `{p}quests` early and plan your day's activities around them. *Next:* `{p}help` Quests.
15. **Profile & Leaderboards** (MedalGold) — *Teaser:* Track progress and rank up. *Works:* Your profile shows wealth, career, education, and relationship pages; leaderboards rank players. *Use:* `{p}profile`; `{p}leaderboard`; `{p}leaderboard cash`. *Tip:* Net worth counts bank + investments + property minus card debt — pay debt to climb. *Next:* `{p}help` Profile.
16. **General** (Settings) — *Teaser:* Setup and guides. *Works:* Onboarding, guides, and server settings. *Use:* `{p}start`; `{p}help`; `{p}casino`; `{p}set-prefix <prefix>`. *Tip:* New here? Run `{p}start`, then follow the New Player Path above. *Next:* `{p}help` General.

## Error handling

- Missing module on a button → ephemeral "That lesson is no longer available."
- Nav by non-owner → ephemeral redirect to run their own `{p}tutorial`.
- Banner attach failure → caught; fall back to sending the menu without the file (log the error), matching `casinoGuide`'s try/catch.

## Testing / verification

- `npx tsc --noEmit` passes.
- Manual smoke: `{p}tutorial` shows the path + 6 system buttons + banner + nav; `Next`/`Previous` page through 3 pages and stay author-locked; each `View` opens the correct ephemeral lesson; the home menu is never replaced; buttons still work after the original collector window (persistent routing).

## Success criteria

- A new player can read `{p}tutorial`, follow the ordered path, and open any of the 16 system lessons to learn how it works and which commands to run.
- No default/Unicode emojis anywhere; branding emotes only.
- Old stale tutorial content (GPA, server `store`) is gone.
- `help` and `casino` are unchanged and linked from the tutorial.
