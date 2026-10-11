import type { ModuleDoc } from "../types";

const casino: ModuleDoc = {
  slug: "casino",
  title: "Casino Games",
  tagline: "Six tables, one cursed relic, and published odds — the house tells you exactly how it wins.",
  icon: "Dice5",
  forBeginners: {
    what: "Fortuna runs six table games plus the Loaded Dice of Ruin. Every bet is wallet cash only, while !roll requires the 2,500,000 shop relic and runs once per day. Cooldowns follow your account across every server. The odds below are the real ones from the bot's code, not marketing.",
    firstCommands: ["!casino", "!coinflip 10000", "!blackjack 10000"],
    tip: "Coinflip is the lowest house edge in the building: 49% for 2× at neutral luck, a 2% edge. Luck can bend it, but even maxed Luck only gets it to 50/50. No amount of Luck makes any table pay you to play.",
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
      heading: "Coinflip: the smallest edge",
      body: [
        "Call heads or tails (h/t work) for a 2× payout. The base chance at neutral luck (50) is 49% — a 2% house edge, the smallest in the casino. Your hidden Luck stat bends it by 0.2 percentage points per 10 Luck: 48% at Luck 0, 49.5% with a Celestial Harp (+25, Luck 75), and exactly 50% at maxed Luck 100.",
        "That ceiling is the point: the best Luck in the game turns coinflip into a fair coin, never a favorable one. Luck shrinks the edge; it can't flip it.",
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
      note: "96% return-to-player at neutral luck — a 4% house edge. Luck only moves odds into or out of the 2× Cherry/Banana tier, by up to ±1.5 percentage points (13.5% at Luck 0, 15.75% at Luck 75, 16.5% at Luck 100). The jackpot tiers never move, so the return spans 93% (Luck 0) to 99% (Luck 100): maxed Luck still leaves a 1% house edge.",
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
        "Soul Ledger (1,500,000): arms a watcher on your next loss of 300,000+. Twenty-four hours later, resolve it for a 50/50 shot at a refund of 1.5× the loss. Luck items (Celestial Harp +25, Pandora Box ±15) move coinflip, slots, and blackjack as described above — on coinflip and slots that trims the house edge but never erases it.",
      ],
    },
    {
      heading: "Getting better at the casino",
      body: [
        "Play the edges, not the vibes. Ranked by house edge at neutral luck: coinflip 2%, roulette ~2.7% on every bet, slots 4%. Blackjack depends on your play — close to even if you hit and stand sensibly, terrible if you don't. Even at maxed Luck 100, coinflip only reaches break-even and slots still keep 1%; roulette and RR ignore Luck entirely. Luck is damage control, not an income source.",
        "Rotate the floor. Six separate cooldowns mean a full circuit — coinflip, slots, blackjack, roulette, cockfight — is available roughly every half hour. Waiting on one cooldown to replay one game is leaving turns on the table.",
        "Size bets to survive variance: a max-bet coinflip is a 51% chance to lose half a million at neutral luck, and still 50% at maxed Luck. The only thing at the tables that tips one bet in your favor is the Lucky Coin — +50% on the next payout turns a 49% shot at 2× into a 49% shot at 3×. It has a 6-hour use cooldown, so the pattern is one planned max bet per coin on coinflip, with Soul Ledger armed underneath in case it goes wrong.",
        "Don't buy Luck for the casino. A Celestial Harp (450,000, 6 hours) moves coinflip from 49% to 49.5% and slots from 96% to 97.5% — on a 500,000 coinflip that's worth about 5,000 a flip, so the harp would need ninety max bets to pay for itself, and it still can't make you a winner. Buy it for robbery or blackjack if you want it, and treat any casino benefit as a rounding error.",
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
    "No Luck level makes coinflip or slots profitable: maxed Luck gets coinflip to an exact 50/50 and slots to 99%. The only positive-EV bet at the tables is one carrying a Lucky Coin.",
    "Blackjack's 60-second timer auto-surrenders your whole bet. Never start a hand you can't finish.",
    "The 36× single number is the same house edge as red/black — but the variance will end your bankroll first. Outside bets last; straight-up numbers are lottery tickets.",
    "Russian roulette is the only zero-edge multiplayer game: no cooldown, no cut. It's also the fastest way to lose a full buy-in in one click. Both facts are true.",
    "Bandage (25,000) exists so a hot streak doesn't have to wait 30 minutes — but it has its own 6-hour use cooldown, so it saves your single most impatient moment per cycle, not every cooldown.",
  ],
};

export default casino;
