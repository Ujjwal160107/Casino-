import type { ModuleDoc } from "../types";

const casino: ModuleDoc = {
  slug: "casino",
  title: "Casino Games",
  tagline: "Six tables, one cursed relic, and published odds — the house tells you exactly how it wins.",
  icon: "Dice5",
  forBeginners: {
    what: "Fortuna runs six table games plus the Loaded Dice of Ruin. Every bet is wallet cash only, while !roll requires the 2,500,000 shop relic and runs once per day. Cooldowns follow your account across every server. The odds below are the real ones from the bot's code, not marketing.",
    firstCommands: ["!casino", "!coinflip 10000", "!blackjack 10000"],
    tip: "Coinflip at neutral luck is a genuinely fair 50/50 for 2× — the only zero-house-edge table in the building. Raise your Luck and it's better than fair.",
  },
  screenshot: {
    src: "/cards/card_casino.png",
    alt: "Lady Fortuna working the casino floor",
    caption: "The Casino card",
    aspect: "aspect-[579/862]",
    maxWidth: "max-w-xs",
  },
  sections: [
    {
      heading: "House rules",
      body: [
        "Wallet only — no bank money, no credit card, ever. Minimum bet is 10,000 everywhere; maximums and cooldowns are per game, so a coinflip cooldown never blocks a blackjack hand. Interactive games (coinflip with buttons, blackjack) also hold a 5-minute single-game lock, so you can't run two at once.",
        "One item cheats the clock: a Bandage (25,000) clears your most recent casino cooldown — it's the cheapest item in the general store for a reason.",
      ],
      table: {
        title: "Limits & cooldowns",
        columns: ["Game", "Cooldown", "Max bet"],
        rows: [
          ["!coinflip", "20 min", "500,000"],
          ["!slots", "25 min", "750,000"],
          ["!blackjack", "30 min", "1,000,000"],
          ["!bet (roulette)", "30 min", "1,000,000"],
          ["!rr (russian roulette)", "none", "750,000"],
          ["!cockfight", "45 min", "1,000,000"],
          ["!roll", "24 hours", "Loaded Dice item"],
        ],
      },
      note: "Bets take smart amounts: all, 250k, 1m. !cf is the shorthand for coinflip; !bj for blackjack.",
    },
    {
      heading: "Coinflip: the fair coin (mostly)",
      body: [
        "Call heads or tails (h/t work) for a 2× payout. The base chance is a true 50% — but your hidden Luck stat bends it, from 44% at rock-bottom luck to 56% at maxed luck. That makes coinflip the only game where item buffs literally change the coin: a Celestial Harp (+25 luck) pushes you to ~53%, which at 2× payout is a player-edge game.",
      ],
    },
    {
      heading: "Slots: the real paytable",
      body: [
        "One spin, three reels, and the outcome is decided by a single weighted roll — these are the exact probabilities, which the machine itself never shows you:",
      ],
      table: {
        title: "Slots odds & payouts",
        columns: ["Triple", "Chance", "Pays", "Return contribution"],
        rows: [
          ["7️⃣ Seven", "0.5%", "20×", "10%"],
          ["💎 Gem", "1.5%", "10×", "15%"],
          ["🔔 Bell", "4.0%", "5×", "20%"],
          ["🍇/🍈 Grapes or Melon", "7.0%", "3×", "21%"],
          ["🍒/🍌 Cherry or Banana", "15.0%", "2×", "30%"],
          ["Any win", "28.0%", "—", "96% RTP"],
        ],
      },
      note: "96% return-to-player at neutral luck — a 4% house edge. Luck shifts the win threshold by up to ±2.5 percentage points, so maxed luck pushes slots to roughly break-even.",
    },
    {
      heading: "Blackjack: best odds if you play it straight",
      body: [
        "A full hand against a dealer who stands on 17, from a single 52-card deck. Natural blackjack pays 2.5×, a regular win 2×, a push returns your bet. Double Down is available on your first two cards if your wallet covers double the bet; there's no split and no insurance. Take longer than 60 seconds and the hand auto-surrenders — the timer is a real opponent.",
        "The quiet part: your Luck rigs the dealer. Whenever the dealer sits at 12–16, high luck gives up to a 4% chance the next card is forced to bust them (low luck forces a safe card instead). Combined with sound basic strategy, buffed blackjack is the strongest skill-adjacent table in the house.",
      ],
    },
    {
      heading: "Roulette: European wheel, full board",
      body: [
        "!bet <amount> <choice> spins a single-zero European wheel — 37 pockets, and the 0 kills every outside bet. Order doesn't matter (!bet red 25k works), and choices must be one token: 1-12, 19-36, 2nd.",
      ],
      table: {
        title: "Roulette bets",
        columns: ["Choice", "Covers", "Pays", "True odds"],
        rows: [
          ["red / black", "18 numbers", "2×", "48.6%"],
          ["odd / even", "18 numbers", "2×", "48.6%"],
          ["1-18 / 19-36", "18 numbers", "2×", "48.6%"],
          ["1-12 / 13-24 / 25-36", "12 numbers", "3×", "32.4%"],
          ["1st / 2nd / 3rd (columns)", "12 numbers", "3×", "32.4%"],
          ["single number 0–36", "1 number", "36×", "2.7%"],
        ],
      },
      note: "Every roulette bet carries the same ~2.7% house edge — the single zero is the entire business model. Lucky Coin applies here; Luck itself does not.",
    },
    {
      heading: "Russian roulette: PvP, no house cut",
      body: [
        "!rr start <bet> opens a 60-second lobby in the channel; 2–6 players join with !rr join, each paying the buy-in up front (refunded if the lobby doesn't fill to two). The revolver's chambers escalate — 1-in-6, then 1-in-5, down to a certainty — so exactly one player dies, and the survivors split the entire pot evenly.",
        "There's no cooldown, no house cut, and no item or luck effects — pure PvP variance. In a 6-player game you're risking one buy-in for a 5-in-6 chance at a 20% profit.",
      ],
    },
    {
      heading: "Cockfight: the sixth table",
      body: [
        "!cockfight @user <bet> is a stat battle between two trained chickens with a 60-second spectator side-bet window (side winners take 1.5× their stake; the fight winner takes both entries plus every side bet). It's the deepest game in the casino because you can grind the odds in your favor before ever betting — full breakdown in the Chickens & Cockfights docs.",
      ],
    },
    {
      heading: "Loaded Dice of Ruin: a relic that remembers",
      body: [
        "Buy one Loaded Dice of Ruin for 2,500,000, then use !roll once every 24 hours. A die remembers its own roll count: each survival pushes more probability into Rare, Epic, and Mythic rewards while its shatter chance rises.",
        "The reward is committed before the shatter check, so a breaking die never steals the prize it just rolled. Shattering removes the relic; a replacement starts from roll 0, but the player-level daily cooldown still has to finish. Global Luck never changes these published odds.",
      ],
      note: "Use !iteminfo Loaded Dice of Ruin to see your completed roll count and next available roll.",
    },
    {
      heading: "Items at the tables",
      body: [
        "Lucky Coin (75,000): +50% on your next game payout within 5 minutes — works on coinflip, slots, blackjack, and roulette. Used on a won 1,000,000 blackjack hand, that's an extra million.",
        "Crown of Greed (1,000,000): for an hour, winning profits pay +25% — and losing stakes cost +25%. Applies to coinflip, slots, and blackjack; roulette is exempt.",
        "Soul Ledger (1,500,000): arms a watcher on your next loss of 300,000+. Twenty-four hours later, resolve it for a 50/50 shot at a refund of 1.5× the loss. Luck items (Celestial Harp +25, Pandora Box ±15) move coinflip, slots, and blackjack as described above.",
      ],
    },
    {
      heading: "Getting better at the casino",
      body: [
        "Play the edges, not the vibes. Ranked by house edge at neutral luck: coinflip 0%, roulette outside bets ~2.7%, slots ~4%. Blackjack depends on your play — near coin-flip if you hit and stand sensibly, terrible if you don't. Everything gets better with Luck except roulette and RR, which ignore it.",
        "Rotate the floor. Six separate cooldowns mean a full circuit — coinflip, slots, blackjack, roulette, cockfight — is available roughly every half hour. Waiting on one cooldown to replay one game is leaving turns on the table.",
        "Size bets to survive variance: max-bet coinflip at 56% luck is still a 44% chance to lose half a million. The buffed-play pattern that works is Lucky Coin + luck buff + a single planned max bet on coinflip or blackjack — a one-shot, positive-EV strike, with Soul Ledger armed underneath in case it goes wrong.",
        "The stack that matters: Celestial Harp (6 hours) covers a dozen casino cooldown cycles; Lucky Coins are one payout each. Buy the harp once, then spend coins only on your biggest planned bet of each cycle.",
      ],
    },
  ],
  commandIds: [
    "casino",
    "coinflip",
    "slots",
    "roll",
    "blackjack",
    "bet",
    "roulette-guide",
    "rr",
    "cockfight",
  ],
  proTips: [
    "Coinflip with a luck buff is mathematically the best bet in Fortuna — a 53%+ chance at 2× has positive expected value.",
    "Blackjack's 60-second timer auto-surrenders your whole bet. Never start a hand you can't finish.",
    "The 36× single number is the same house edge as red/black — but the variance will end your bankroll first. Outside bets last; straight-up numbers are lottery tickets.",
    "Russian roulette is the only zero-edge multiplayer game: no cooldown, no cut. It's also the fastest way to lose a full buy-in in one click. Both facts are true.",
    "Bandage (25,000) exists so a hot streak doesn't have to wait 30 minutes — but it has its own 6-hour use cooldown, so it saves your single most impatient moment per cycle, not every cooldown.",
  ],
};

export default casino;
