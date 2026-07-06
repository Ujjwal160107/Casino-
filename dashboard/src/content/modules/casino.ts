import type { ModuleDoc } from "../types";

const casino: ModuleDoc = {
  slug: "casino",
  title: "Casino Games",
  tagline: "Six tables, one wallet, every bet on the house's terms.",
  icon: "Dice5",
  forBeginners: {
    what: "Fortuna runs six casino games — coinflip, slots, blackjack, roulette, russian roulette, and cockfight. Every bet comes straight out of your wallet, and every game has its own cooldown, so you can't just spam one table.",
    firstCommands: ["!casino", "!coinflip 10000", "!slots 10000"],
    tip: "Run !casino before you sit down anywhere — it opens every game's guide and payout table right inside Discord.",
  },
  screenshot: {
    src: "/screenshots/docs-casino.png",
    alt: "Casino Games in Discord",
  },
  sections: [
    {
      heading: "House rules",
      body: [
        "Every casino bet comes from your wallet — never your bank, never a credit card. If it's not in your wallet, you can't bet it.",
        "The floor-wide minimum bet is 10,000 Fortunes, and you can only run one active game at a time — starting a new one while another is in progress locks for 5 minutes. On top of that, each game tracks its own cooldown, and that cooldown follows your account across every server, so pace yourself.",
      ],
    },
    {
      heading: "Cooldowns & limits",
      body: [
        "Min bet across the board is 10,000. Cooldowns are per game, not shared between games, so a coinflip cooldown doesn't stop you from sitting down at blackjack — but each cooldown is shared across every server, since your account is global.",
      ],
      table: {
        title: "Cooldowns & max bets",
        columns: ["Game", "Cooldown", "Max bet"],
        rows: [
          ["!coinflip", "20 min", "500,000"],
          ["!slots", "25 min", "750,000"],
          ["!blackjack", "30 min", "1,000,000"],
          ["!bet (roulette)", "30 min", "1,000,000"],
          ["!rr (russian roulette)", "—", "750,000"],
          ["!cockfight", "45 min", "1,000,000"],
        ],
      },
    },
    {
      heading: "Game guide",
      body: [
        "Coinflip is the simplest table in the house: call heads or tails, or just use the buttons, and a win pays 2x.",
        "Slots pays on three-reel symbols: 7️⃣ pays 20x, 💎 pays 10x, 🔔 pays 5x, grapes and melon pay 3x, and cherry and banana pay 2x. The jackpot symbols are rare on purpose.",
        "Blackjack plays a full hand against the dealer, who hits to 17. A natural blackjack pays 2.5x, a normal win pays 2x, and a push just returns your bet — Hit and Stand buttons handle your turn.",
        "Roulette runs through !bet <amount> <space>: a single number pays x36, dozens and columns pay x3, and colors, halves, or odd/even pay x2.",
        "Russian roulette seats 2–6 players in a 60-second lobby, then works through one bullet at a time — whoever's left standing takes the whole pot.",
        "Cockfight needs a trained chicken first (see Hunting & Animals for raising one), then runs a 60-second side-bet window before the two birds fight it out.",
      ],
    },
    {
      heading: "Reading the table",
      body: [
        "Before you sit down anywhere, !casino opens the full guide hub — a button for every game's rules, payouts, and odds, right inside Discord. Roulette gets its own dedicated !roulette-guide, complete with the payout image, so you're not guessing what a dozen or a column actually covers.",
        "Neither command costs anything or touches a cooldown — read them as often as you like.",
      ],
    },
    {
      heading: "Items that touch the casino",
      body: [
        "A handful of items reach directly into the casino's math. Lucky Coin nudges odds in your favor, Crown of Greed adjusts stakes and payouts, and Soul Ledger has its own targeted effect on games it's used in.",
        "None of that is guesswork you need to do at the table — check the Items docs for exactly what each one does before you buy in.",
      ],
    },
  ],
  commandIds: [
    "casino",
    "coinflip",
    "slots",
    "blackjack",
    "bet",
    "roulette-guide",
    "rr",
    "cockfight",
  ],
  proTips: [
    "Blackjack's 2x/2.5x payouts are the best odds on the floor per the numbers — start there if you're testing strategy, not luck.",
    "The x36 single-number bet in roulette is the biggest number on this page and the easiest way to lose fast. Play the outside bets if you want to last.",
    "Cooldowns are per game, not shared — rotate between coinflip, slots, and blackjack instead of waiting out one clock.",
  ],
};

export default casino;
