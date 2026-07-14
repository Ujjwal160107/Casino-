import type { ModuleDoc } from "../types";

const itemsAndShop: ModuleDoc = {
  slug: "items-and-shop",
  title: "Items & Shop",
  tagline: "Six storefronts, ninety-odd items, and a black market — every edge in Fortuna is for sale.",
  icon: "ShoppingBag",
  forBeginners: {
    what: "The shop sells tools that change the rules: buffs that fatten payouts, shields that block robbers and taxes, gear your job literally requires, and chaos items that gamble on themselves. One catalog is shared across every server, stock is unlimited, and everything here lists the real effect — not the flavor text.",
    firstCommands: ["!shop", "!inventory", "!use lucky coin"],
    tip: "!shop buy card <item> charges your Fortuna Card instead of your wallet — but Mystery Box, Treasure Map, Pandora Box, Loaded Dice of Ruin, and Devil Contract are cash-only by design.",
  },
  sections: [
    {
      heading: "How the shop works",
      body: [
        "!shop opens six tabs: GENERAL, HUNT, JOB, UNI, COCK, and COSMETICS. Buy with !shop buy <item> from your wallet, or !shop buy card <item> to put it on your Fortuna Card (needs an active card, obeys your credit limit and weekly spend cap, and asks for confirmation first).",
        "Items are consumed by !use — which understands batching (!use protein 3), targeting (!use demonic harp @user), and feed shorthands. A use that does nothing doesn't burn the item: a Bandage with no cooldown to clear, Stress Pills at zero stress, and similar no-ops are refunded on the spot.",
        "There is no shop buy-back. Selling is the Quick Sell button inside !inventory — usually 50% of the shop price, occasionally 30–45% — or a real listing on the Black Market where other players pay full price.",
      ],
    },
    {
      heading: "General store, page 1: the workhorses",
      body: [
        "The cheap half of the general store is the everyday toolkit — protection, cooldown control, and payout boosts you'll cycle through constantly.",
      ],
      table: {
        title: "General store — essentials",
        columns: ["Item", "Price", "Real effect"],
        rows: [
          ["Tax Shield", "10,000", "Blocks the 8% income tax AND 5% transfer tax for 1 hour (unlimited triggers while active). 6h use cooldown"],
          ["Bandage", "25,000", "Clears your most recent casino game cooldown. 6h use cooldown"],
          ["Counterfeit Kit", "50,000", "Next income claim (daily/weekly/monthly/work) +25% — 2h window, one use"],
          ["Lucky Coin", "75,000", "Next casino payout +50% — 5-minute window, one use. 6h use cooldown"],
          ["Thieves Gloves", "100,000", "Rob loot +25% for 6 robberies or 6 hours"],
          ["Energy Drink", "125,000", "Work cooldown reduced by 1 hour. 8h use cooldown"],
          ["Padlock", "175,000", "Blocks one robbery against you (24h shelf life, breaks on use)"],
          ["Mystery Box", "250,000", "Daily: Instant roll: 30% → 75,000 · 50% → 100,000 · 20% → 500,000 (avg ~172k)"],
          ["Treasure Map", "400,000", "Daily gamble: 25% treasure (60% → 1.5M · 30% → 2.2M · 10% → 4M) / 75% dead end: 150k–300k fine (wallet, then bank) + 25% chance of −15 Luck for 1h"],
        ],
      },
      note: "Do the math before you gamble on crates: every crate is net-negative on average — the house always keeps an edge. All gamble crates are cash-only and limited to one use per 24 hours.",
    },
    {
      heading: "General store, page 2: the dark shelf",
      body: [
        "The expensive half trades in luck, curses, and deals with consequences. Most stack to 1 — you hold one at a time.",
      ],
      table: {
        title: "General store — power items",
        columns: ["Item", "Price", "Real effect"],
        rows: [
          ["Loaded Dice of Ruin", "2,500,000", "Reusable daily relic: every surviving !roll improves its prize odds and raises its shatter risk. Rewards are secured before shattering; a replacement resets to roll 0"],
          ["Celestial Harp", "450,000", "+25 Luck for 6 hours"],
          ["Demonic Harp", "600,000", "Target: −25 Luck for 6h + easier to rob (+5% success, +5% loot against them)"],
          ["Pandora Box", "750,000", "Daily chaos roll: 25% money 300k–1.5M · 20% +15 Luck 2h · 20% rare item · 20% −15 Luck 2h · 15% lose 200k–900k (wallet, then bank)"],
          ["Eclipse Mask", "850,000", "Next rob: +12% success, +15% loot — but a failed rob adds a 300k–900k backlash"],
          ["Mirror of Fate", "900,000", "Reflects the next targeted curse back at its caster (24h, one trigger)"],
          ["Crown of Greed", "1,000,000", "For 1 hour: all income +25% AND all losses +25% (win profits up, losing stakes up)"],
          ["Devil Contract", "1,250,000", "Daily: 30% jackpot 2.5M–3.5M / 70% short-changed 300k–700k; your next 3 income claims pay −20% either way"],
          ["Soul Ledger", "1,500,000", "Watches your next loss ≥ 300,000; 24h later, resolve it: 50% refund of 1.5× the loss, 50% nothing"],
        ],
      },
    },
    {
      heading: "The Luck system",
      body: [
        "Luck is a hidden 0–100 meter, base 50, moved by items and crafts: Celestial Harp +25, Pandora Box ±15, Demonic Harp −25 (on a target), Komodo Venom Flask −20 (on a target), crafted Rabbit Foot Charm +3, crafted Arctic Wolf Spirit Charm +15. Modifiers from different sources stack.",
        "Where it bites: coinflip win chance runs 44%–56% across the luck range, slots' win threshold shifts ±2.5%, blackjack quietly rigs the dealer's draws up to 4% in your favor (or against you), and robbery success moves about ±5%. Roulette and Russian Roulette ignore luck entirely.",
      ],
    },
    {
      heading: "Job store: gear and shift boosters",
      body: [
        "Page one is required equipment — every job sector demands its gear before you can work a shift, and gear wears down (5–12 durability per shift) until it breaks: Work Laptop 800,000 (tech), Medical Kit 1,200,000 (medical), Business Briefcase 600,000 (business), Legal Case File 700,000 (legal), Service Uniform 250,000 (service), Mechanic Toolkit 950,000 (trade), Freelance Starter Pack 350,000 (freelance).",
        "Page two is the consumables that make shifts pay:",
      ],
      table: {
        title: "Job consumables",
        columns: ["Item", "Price", "Real effect"],
        rows: [
          ["Stress Pills", "150,000", "Job stress −20. 6h use cooldown"],
          ["Energy Flask", "200,000", "Work cooldown −2 hours. 8h use cooldown"],
          ["Repair Coupon", "300,000", "Restores one broken gear item to 100 durability"],
          ["Premium Tools Oil", "350,000", "Halves gear wear for 5 shifts"],
          ["Lucky Tie", "400,000", "+10% success on interviews and work events for 24h"],
          ["Warranty Card", "450,000", "Blocks the next gear break (7-day shelf life)"],
          ["Focus Headphones", "500,000", "2× job XP for the next 3 shifts"],
          ["Emergency Pager", "600,000", "Rescues one failed shift or critical work event"],
          ["Overtime Contract", "750,000", "Clears work cooldown now; +15 stress; next shift 60% event chance + gear risk. 12h use cooldown"],
          ["Black Market Resume", "900,000", "65% → +3–8 lifetime shifts / 35% → +10–25 stress. 24h use cooldown"],
          ["Corporate Blessing", "1,500,000", "Next shift: 40% → 2–3× pay / 60% → +25 stress and heavy gear damage"],
        ],
      },
    },
    {
      heading: "UNI store: study accelerants",
      body: [
        "Everything here multiplies !study — see the Education docs for how XP, exams, and scholarships play together.",
      ],
      table: {
        title: "UNI items",
        columns: ["Item", "Price", "Real effect"],
        rows: [
          ["Coffee Thermos", "80,000", "Clears the 30-min study cooldown; +8 stress; once per 4h (refunded if no cooldown)"],
          ["Textbook Bundle", "120,000", "1.4× study XP for 3 sessions — 15% wrong-chapter (0 XP) risk each"],
          ["Calculator Pro", "150,000", "+30% fail rescue + 1.1× XP for 3 sessions"],
          ["Focus Notes", "160,000", "+45 bonus XP on your next successful study + cancels one negative event"],
          ["Study Laptop", "180,000", "1.15× XP, −6 stress, +10% fail rescue for 5 sessions"],
          ["Cheat Sheet", "250,000", "Next exam: 70% → +25% of required XP / 30% → caught: −15% XP, +15 stress, −10% wallet"],
          ["Lab Kit", "300,000", "1.15× XP, +10% rescue, amplified (±) study events for 3 sessions"],
          ["Tutor Pass", "400,000", "1 session: can't fail, 1.6× XP, guaranteed positive event, −10 stress"],
          ["Scholarship Letter", "750,000", "Instant roll: 45% → 50k–200k coins / 35% → +25–150 edu XP / 20% → nothing +5 stress (1h cooldown)"],
        ],
      },
    },
    {
      heading: "HUNT, COCK & COSMETICS",
      body: [
        "The HUNT tab sells the four rifles, the hunt buffs — including the reusable Hunter's Compass, a once-a-day pick between a risky and a safe hunting path — and recipe blueprints; every number is in the Hunting & Animals docs. Every player receives a chicken automatically; the COCK tab sells its feed, medicine, and equipment — covered wall-to-wall in Chickens & Cockfights.",
        "COSMETICS is 18 tiers of pure flex, from the Velvet Name Tag at 50,000 to the Reality Crown at 1,000,000,000. They do nothing mechanical — but they set your Flex Rank on !profile, and several add profile luck: Fortuna Bracelet +5, Platinum Crown +8, Celestial Halo +10, Fortune Dragon Cloak +12, Crown of Immortals +15, Fortuna's Signature +20, Reality Crown +25.",
      ],
    },
    {
      heading: "The Black Market (!market)",
      body: [
        "Fortuna's player-to-player trading floor, shared across every server, wallet-only. List with the Sell button, browse and buy with the hub, cancel any time. Sellers pay a 10% fee on completion; buyers pay 5% on top of the sticker price.",
        "You can run 5 active listings at once, priced between 1,000 and 50,000,000, and unsold listings return to you after 7 days. Chickens and other unique leveled items can't be listed. Animal parts trade in their own parallel market with identical fees and limits.",
      ],
      note: "Market sale proceeds are garnished 25% if your credit card is delinquent — the bank gets paid before you do.",
    },
    {
      heading: "Getting better with items",
      body: [
        "Buy timing, not inventory. Almost every buff is a short window — Lucky Coin lasts 5 minutes, Counterfeit Kit 2 hours, Crown of Greed 1 hour. Buy immediately before the action they boost, never in advance.",
        "Learn the stacking rule: income multipliers compound. Counterfeit Kit (×1.25) + Crown of Greed (×1.25) on a !monthly claim turns 4,000,000 into ~6,250,000 before tax — the two cost 1,050,000 combined. That's the single best item play in the game, once per month.",
        "Respect the two-way items. Crown of Greed inflates your casino losses and crime fines by the same 25% it adds to wins. Eclipse Mask's backlash can cost more than three successful robs earn. Devil Contract's 3-claim income penalty applies even when the devil short-changes you — never sign right before a weekly/monthly claim.",
        "Padlock is the cheapest peace of mind in Fortuna — 175,000 to void a robbery that could take 250,000. Re-buy it whenever it breaks and your wallet is worth robbing.",
      ],
    },
  ],
  commandIds: ["shop", "inventory", "use", "equip", "iteminfo", "market"],
  proTips: [
    "No crate is net-positive anymore — Treasure Map is a 25% shot at 1.5M+ with a real fine on the other 75%. Gamble for the thrill, not the math.",
    "Items are never consumed on a failed or pointless use — you can't waste a Bandage with no cooldown or a Repair Coupon with nothing broken.",
    "Soul Ledger turns one catastrophic casino loss into a coin flip for a 1.5× refund. Activate it before a max-bet blackjack session, not after.",
    "Quick Sell pays 50% at best — anything valuable deserves a Black Market listing at 90%+ of shop price instead.",
    "Mirror of Fate quietly counters the whole curse meta: a Demonic Harp bounced back is 600,000 of someone else's money working for you.",
  ],
};

export default itemsAndShop;
