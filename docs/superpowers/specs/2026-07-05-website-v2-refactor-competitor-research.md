# Discord Bot Website Research — Synthesis for Fortuna Redesign

Appendix to [website V2 refactor design spec](2026-07-05-website-v2-refactor-design.md). Researched live on 2026-07-05 via rendered browser sessions (screenshots studied) + page fetches. Fully captured: Dank Memer, MEE6, UnbelievaBoat, Carl-bot, Tatsu, ProBot, OwO, Karuta, Sofi.

## 1. Site-by-Site Findings

### Dank Memer (dankmemer.lol) — the benchmark

**IA / top nav:** `Commands · Changelog · Guides · Blogs · Store · Discord · Discovery` + `Login` right-aligned. Footer is 5 columns: Resources (FAQ, Guides, Changelogs, Timeline, Fishing Wiki, Fishing Completion), Community (Community Server, Blog posts, Server Discovery, Dankdle — a Wordle clone), Dank Memer (Store, Freemium, Rules, Commands, **Items**, **Pets**, Past Rewards), Support (Support Server, Contact, Refunds, Data Requests), Our Company (Team, Disclosure). Legal: Terms, Privacy.

**Landing page is radically short** (~2100px total, 3 sections):

1. **Hero:** pure black, giant white wordmark "Dank Memer", one gray line: *"Forget reality. Get rich, collect weird stuff, and flex on your friends in Discord's most chaotic economy game."* Two buttons: blue "Add to your Server" + dark "Play in our Server" (brilliant second CTA — try before install).
2. **"So, What Do You Actually Do?"** — subline *"It's a unique blend of a deep economy, rare collectibles, and social competition."* One dark card containing a 2×2 grid: "A Deep Virtual Economy" (*"Grind for cash, hunt for rare items… Trade, gift, or gamble your way to the top"*), "Compete or Collaborate", "Endless Collecting & Adventure" (*"the grind never stops"*), "Customize Your Gameplay". Small round blue icons, left-aligned text.
3. **"Stop Reading. Start Grinding."** final CTA → footer (footer repeats "Add Dank Memer to Your Server / Invite now").

**Design language:** pure-black flat dark theme, white geometric sans (Inter-like), single blue accent, zero gradients, zero glassmorphism, zero particles. Personality comes entirely from **copywriting and game content**, not decoration. Mascot = suited Pepe logo, used small.

**Commands page:** giant left-aligned page title, one-line description, **filter pills** (All / Fun / Currency / Config / Images / Games / Utility / Misc), then full-width stacked rows — not cards. Each row: `/8ball` + argument chip (`question`) + copy-to-clipboard icon, one-line description (*"Ask the magik 8ball a question."*), then colored tags: category (green), `pls` prefix-support (amber), `DMs` availability (blue). Lightweight — no cooldowns/examples inline.

**Guides ("Guides & Tutorials" at /tutorials):** search bar ("Search for anything…") + card grid where **every card thumbnail is a real Discord screenshot of the bot's output** (e.g., a Prestige embed, "Gilded Wooden Chest" with buttons). Titles like "Prestige — What do you lose?", "Skeleton Keys", "Fish Boosts". Docs are in-house, content-first, game-wiki flavored — not GitBook.

**Items page ("Gameplay Items"):** the killer feature. Filter pills by item type (Buff, Collectible, Debuff, Equipment, Loot Box, Pack, Sellable, Trinket) + search, grid of **pixel-art item sprites**, and a persistent right-hand detail panel: sprite, name ("A Plus"), rarity+type ("Epic Sellable"), italic flavor text, acquisition ("Found from the teacher job."). This is a game database, and it's what makes the site feel like a game site.

**Store:** header joke *"Fuel Badosz' lego hobby, today!"* (Badosz = a dev). Named sub tiers ("Meme Enthusiast" $3.99 → "Meme Mogul" $49.99) listing in-game perks, gem bundles, limited fishing bundles, "Best Value" decorated with sparkle kaomoji.

### UnbelievaBoat (unbelievaboat.com) — closest competitor category

**Nav:** Commands · Tags · FAQ · Premium | Invite · Support · Login. Footer: Status, Privacy, ToS, Discord, Twitter.
**Landing order:** (1) Hero card, centered: "The Ultimate **Economy** & **Game** Bot" (Economy/Game in periwinkle), sub *"Engage your community with a fully customisable economy, fun games, and moderation tools. Trusted by over 2 million servers."*, "Add to Discord" + "Explore Features". (2) **Stat bar**: 2 million SERVERS / 200 million USERS / 100+ COMMANDS / 99.9% UPTIME. (3–5) Alternating two-column feature sections, each with eyebrow label + headline + paragraph + green-check list, paired with a **faux Discord chat mockup**: "Build a Thriving Virtual Economy", "GAMES & FUN — Never a Dull Moment" (*"From Blackjack and Roulette to Animal Racing…"*) with a rendered **blackjack embed showing Hit / Stand / Double Down / Split buttons and card hands**, then moderation. (6) 3-step setup (Add → Configure → Have Fun). (7) 11-module feature grid. (8) Final CTA.
**Design:** near-black with a soft purple radial glow behind the hero (mild gradient), periwinkle accent, clean sans. The Discord mockups are the most persuasive element on the page.
**Commands page:** best-in-class. Sidebar with 17 categories + counts ("Economy 17"), search bar, **Prefix/Slash toggle**, Expand All/Collapse All, expandable rows revealing usage with copyable code blocks, 2–3 examples, permissions. 154 commands.
**Docs:** none beyond FAQ + Tags pages (docs subdomain doesn't resolve).

### MEE6 (mee6.xyz)

**Nav:** Plugins ▾ (mega-menu: Moderation & Server Management, Utilities, Social Alerts, Games & Fun, Bot Personalizer, Premium, MEE6 AI + "Spotlight" article cards), Resources ▾ (Tutorials, Support Portal, Discord), language switcher, Premium, Login with Discord. Top promo banner with **live countdown**: "Level Up For Less — Get 50% off".
**Landing:** left-aligned hero "The best all-in-one bot for Discord" + "Add to Discord"/"See features", **"Used by 20+ million servers"**. Then very long alternating SEO-copy sections (Welcome Messages, Custom Commands, Social Alerts, Reaction Roles, Leveling, Tickets, Automation, Polls), each ending in another "Add to Discord". Then **logo-wall social proof with member counts**: "Roblox 1.1m, PUBG MOBILE 641k, MrBeast Gaming 480K, Pokimane's 121k…". Then 3-up value props, tutorial teasers, final CTA "Build the best Discord server for free".
**Design:** dark navy, **flat cartoon blob mascots** (blue balls with viking helmets/crowns on a cliff scene), rounded friendly type, blue CTAs. Feels like a consumer game brand, not SaaS. Docs = Zendesk-style Support Portal + tutorial blog. No public commands list (dashboard-first product).

### Carl-bot (carl.gg)

**Nav:** Docs · Invite · Discord · Status · Games · Discover · Premium (gold pill) · Login.
**Landing:** flat **purple hero with Memphis-style doodle shapes** (dots, squiggles, rings), left-aligned "Supercharge Your Discord With Carl-bot.", sub "An All-in-one discord bot, trusted by **14,619,447 servers**." (live-looking precise number), single white pill "Add to Discord". Dark charcoal body separated from hero by a **wave divider**. "Why Carl-bot?" → 13 two-column cards (icon + title + dense one-liner + Learn more), e.g. Reaction Roles: *"Up to 250 reaction-roles pairs per server with unique, verify, reversed, binding and temporary modes."* Final CTA "Ready to upgrade your server?" with "Add to Discord" + "Read the docs". Footer: BotLabs legal set (Terms, Privacy, Copyright Dispute, GDPR, Cookies, EULA).
**Docs (docs.carl.gg):** Docsify-style open-source docs, hash routing, cover page ("Welcome to the Documentation — Don't be shy, we are open source", "Get Started" button), sidebar: Getting Started, Config, Personalization, Automod … Tags & Triggers, Utilities, FAQ. Copy is spec-dense and proud of numbers/limits.

### Tatsu (tatsu.gg)

**Nav:** feature-based: Tatsugotchi · Leveling · Economy · Utilities · Support Us · Login.
**Landing:** charcoal flat background scattered with **tiny flat confetti shapes** (x's, triangles, rings in blue/pink/white). Left hero, multicolor headline: "**LEVEL UP** (cyan, underlined) your **Discord** (periwinkle) community." Sub: *"Turn your community into THE place to be! Join more than 1,400,000 Discord servers…"*. Right side: **pixel-art/voxel characters in step cards** ("STEP 1 Add Tatsu", "STEP 2 Get Rewards") connected by dashed lines to floating chips ("Earn Currency & XP", "Chat"). Sections: "Take part in a global economy", store/items (2000+), **pets (Tatsugotchi)**, house building (1000+ furniture), profile/rank/wallet cards, custom store, leaderboards — each demonstrated with **animated GIFs of the actual bot**. Rounded, game-y typography. Flat, no gradients.

### ProBot (probot.io)

Dark near-black, **centered** hero with "NEW: Tickets Module" pill, "Make A Professional Discord Server!", generic sub, alternating feature blocks (Welcome images, Embeds, Reaction roles, Leveling) with UI screenshots, "Join over 10.200.000 servers" CTA. Periwinkle-on-dark, ad cookie wall. This is the **most generic/template-like** of the set — a useful anti-reference.

### OwO Bot (owobot.com)

Tiny site: sky-blue nav (HOME/HELP/STORE/LOGIN), dark hero, anime catgirl mascot peeking over the fold, headline "OwO! What's this?", in-character copy *"Hewwo! I'm OwO Bot!… Hunt, battle, and gamble your way to the top of the leaderboards."*, yellow "INVITE ME!" button, doodle confetti background. Even the cookie banner is in character ("…best experience on our website. **Nom.**"). Personality-per-pixel is extremely high.

### Karuta (karuta.com)

Almost no website: mascot avatar, two buttons (support server / invite), embedded top.gg card (898,795 servers), legal links. Proof that discovery happens inside Discord — the website's job is conversion + reference, not acquisition.

### Sofi (sofi.gg)

Dark anime-aesthetic card game site: minimal nav with **Command Palette search**, hero *"Enjoy the best card collecting game and go on epic raid with your guild on Discord."*, card-cosmetics feature grid (Frames, Albums, Events, Backgrounds, Layers), guide links, stats ("27 Million Users", 260,785 servers, 553k+ daily commands), and a distinctive **"Servers on the Rise"** grid showcasing communities that run Sofi.

## 2. Genre Conventions (common patterns across all sites)

1. **Dark theme is universal.** Every single site is dark — matching Discord's own UI. Accent is almost always Discord-adjacent blurple/periwinkle or blue.
2. **Hero formula:** headline + one-sentence pitch + primary "Add to Discord" (usually with Discord logo on the button) + secondary CTA (features/docs/try-it). Server-count social proof appears in or directly under the hero on 7/9 sites, often as a precise live number (Carl-bot's "14,619,447").
3. **Show the bot in Discord.** The best sites (UnbelievaBoat, Tatsu, Dank Memer guides, ProBot) prove the product with faux Discord chat mockups, real screenshots, or GIFs of embeds with buttons — not abstract illustrations.
4. **Alternating two-column feature sections** (media on one side, eyebrow + headline + checklist on the other) are the dominant body pattern; icon-grid-only pages (Carl-bot) read as older.
5. **Commands page = category sidebar/pills + search + expandable rows** with usage, examples, copy button. Slash/prefix toggle (UnbelievaBoat) is the modern touch.
6. **Docs are utilitarian**: Docsify/Zendesk/custom wiki with "Getting Started" first. Game-bots (Dank, Tatsu, Sofi) skip formal docs in favor of **guides/wiki content** (items, pets, strategies).
7. **Footer = mini-sitemap** (4–5 columns) + legal + socials, with the invite CTA repeated once more above it.
8. **Game-economy bots have game-store monetization** (tiers with in-game perks, gem bundles, limited offers), not SaaS pricing tables.

## 3. Why Dank Memer's site feels handcrafted (and others don't)

- **Voice everywhere.** Every string is written in-character: "Forget reality.", "So, What Do You Actually Do?", "Stop Reading. Start Grinding.", "Fuel Badosz' lego hobby, today!". ProBot/UnbelievaBoat use interchangeable marketing copy ("Engage your community…").
- **Restraint + one accent.** Pure black, white type, one blue. No glow, no gradient, no cards-with-borders-everywhere. The confidence reads as identity.
- **Content over decoration.** The site's depth is game data (Items with pixel sprites, flavor text, drop sources; Pets; Fishing Wiki; Changelog; Timeline), not marketing sections. It's a game's companion site, not a bot's brochure.
- **Real product as imagery.** Guide cards use actual Discord embeds as thumbnails; there are no stock illustrations anywhere.
- **Playable extras** (Dankdle, "Play in our Server" CTA) treat the visitor as a player, not a server admin.
- Anti-examples: ProBot (centered generic hero, template sections), UnbelievaBoat hero (purple glow + "The Ultimate X" phrasing) — competent but anonymous.

## 4. Recommendations for Fortuna (flat, no gradients, non-generic)

1. **Casino-table design language, not SaaS.** Flat near-black base with ONE saturated accent used like a casino felt/chip color (candidate: felt green or a hot amber/gold for coins — not blurple, which every bot uses). Sharp flat panels with 1px hairline borders; no glass, no glow, no particles. Let suit symbols, chips, dice pips, and card corners be the decorative system (tiny flat glyphs scattered sparsely, Tatsu-confetti-style, at ~5% opacity).
2. **Left-aligned hero with a voice, plus a "try it" second CTA.** One-line in-character promise + two buttons: "Add to Discord" + "Play in our server" (Dank Memer's try-before-install is the single best conversion idea to steal). Put a stat line under it as plain text, not a stat-card row.
3. **Lead with a faux Discord blackjack/roulette embed, done accurately.** UnbelievaBoat's blackjack mockup with Hit/Stand/Double Down/Split buttons is the most convincing artifact in the genre. Build one hand-coded, pixel-faithful Discord-message component (avatar, APP badge, timestamp, embed, button row) showing a real Fortuna game round, and reuse it in alternating two-column sections: one per pillar (Casino games / Economy & jobs / Credit cards / Leaderboards). Keep media alternating left/right so nothing is "centered-everything."
4. **Build a game database, not just a commands list.** Fortuna's equivalent of Dank Memer's Items page: a browsable page for games (house edge, min/max bet, payout table), items/credit cards (art, rarity, flavor text, how to obtain). Grid + persistent right-hand detail panel with flavor text. This one page does more "this is a real game" signaling than any amount of landing copy. *(Deferred beyond current scope; docs key-number tables carry this for now.)*
5. **Commands page: filter pills + search + stacked rows** (Dank Memer layout) with UnbelievaBoat's detail on expand: usage, 2 examples, cooldown, copy button, and tags (category color, "DMs", "requires account"). Categories should be game-flavored.
6. **Write every string in-character.** Section titles as questions/commands ("So how do I get rich?", "Stop scrolling. Start betting."), 404 pages, cookie notices, empty states — all in the dealer's voice. This is the cheapest, highest-leverage differentiator observed; it's the entire gap between Dank Memer and ProBot.
7. **Guides as screenshot-thumbnail cards** (search bar + grid, each card's image is a real Discord embed from the bot), replacing formal docs. *(Adapted: Fortuna keeps structured module docs per user requirement, written game-wiki-flavored.)*
8. **Footer as mini-sitemap with a joke,** repeating the invite CTA above it (universal pattern), 4 columns. Refund/gambling-disclaimer links matter in this genre (Dank, OwO, Karuta all carry Refund Policy prominently).

**Avoid list, validated against the genre:** purple/blurple accent (used by UnbelievaBoat, Carl-bot, ProBot, Karuta — it's the genre's beige), centered hero + 3-column icon grid (ProBot = the generic floor), radial glow behind hero text (UnbelievaBoat), and long SEO paragraphs (MEE6's body copy is unreadable filler). Dank Memer proves a 3-section landing page with strong voice beats all of it.
