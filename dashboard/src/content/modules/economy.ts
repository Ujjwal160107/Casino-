import type { ModuleDoc } from "../types";

const economy: ModuleDoc = {
  slug: "economy",
  title: "Economy & Money",
  tagline: "One wallet that follows you everywhere, four paychecks for showing up, and a taxman with fine print.",
  icon: "Coins",
  forBeginners: {
    what: "Your money lives in two places: the wallet — spendable, gambleable, and robbable — and the bank, which nothing hostile can touch. Everything you earn lands in the wallet first; the core skill of Fortuna's economy is deciding how much stays there.",
    firstCommands: ["!balance", "!daily", "!deposit all"],
    tip: "Robbers and heat raids can only reach your wallet. The habit that outearns any grind: !deposit all before you log off.",
  },
  screenshot: {
    src: "/cards/card_economy.png",
    alt: "Lady Fortuna tracking the global economy",
    caption: "The Global Economy card",
    aspect: "aspect-[290/431]",
    maxWidth: "max-w-xs",
  },
  sections: [
    {
      heading: "Wallet vs bank",
      body: [
        "The wallet is cash on hand — the only money the casino, shops, and other players' !rob attempts can see. The bank is the safe: immune to robbery and raids, but it must be withdrawn before it can be spent, and a plain bank balance earns no interest (fixed deposits do — see Bank & Credit).",
        "!deposit and !withdraw move money either way, and every amount field in Fortuna speaks shorthand: all, 250k, 1.5m, 2b all parse. New accounts start with exactly 1,000 Fortunes — the game means for the first hundred thousand to be earned.",
      ],
    },
    {
      heading: "The four free paychecks",
      body: [
        "Four claims pay you for showing up, and they stack with the income multiplier items — a Counterfeit Kit (+25%) or Crown of Greed (+25%) applied to a !monthly claim is the best item money in the game.",
      ],
      table: {
        title: "Claim income",
        columns: ["Command", "Pays", "Cooldown", "Tax"],
        rows: [
          ["!daily", "100,000", "24h", "none"],
          ["!weekly", "800,000", "7 days", "8%"],
          ["!monthly", "4,000,000", "30 days", "8%"],
          ["!vote (top.gg)", "5,000", "12h", "none"],
        ],
      },
      note: "!vote reminder toggles a DM ping when your next vote is ready. Missed claims don't accumulate — an unclaimed day is gone.",
    },
    {
      heading: "The grind commands",
      body: [
        "When everything else is on cooldown, !beg and !slut turn seconds into pocket money: beg succeeds 70% of the time for 8,000–15,000 on a 45-second cooldown; slut hits 55% for 12,000–22,000 every 2 minutes. Failure costs nothing but the cooldown — no fines, no risk. A Lucky Coin multiplies either payout ×1.5.",
        "The serious money in this family — the crime board, robbery, jail, and the heat meter — has its own full page: Crime & Heat. Short version: crime is a skill minigame paying up to 1,200,000, robbery takes 8–20% of a wallet (capped 250,000), and both are exactly why the bank exists.",
      ],
    },
    {
      heading: "Taxes: who takes a cut",
      body: [
        "Two taxes run in the background. Income tax takes 8% off !weekly, !monthly, and every !work paycheck. Transfer tax takes 5% of anything you send with !transfer — the recipient gets the rest. !daily and !vote are the clean money: never taxed.",
        "A Tax Shield (10,000 in the shop) suspends both taxes entirely for one hour — trivially worth it before a monthly claim (saves 320,000) or any large transfer. If your credit card has gone delinquent, a separate 25% garnishment also comes off all income until you settle up — that one has no shield.",
      ],
    },
    {
      heading: "Moving money between players",
      body: [
        "!transfer @user <amount> sends money directly, minus the 5% tax. !ask @user <amount> [reason] flips the direction politely — it drops an Accept / Decline / Block card on their screen. Getting blocked is permanent until they !ask unblock you, so don't spam it.",
        "Married? The couple vault in !family is a shared account with its own rules — deposits are instant, withdrawals need your spouse's sign-off. Details in Life & Social.",
      ],
    },
    {
      heading: "Keeping score",
      body: [
        "!balance is the quick look; !profile is the full dossier — six pages covering net worth (wallet + bank + stocks + inventory − card debt), career, education, cosmetics with your Flex Rank, relationship, and your hidden profile Luck out of 100. The Overview page also lists active item buffs and debuffs with item emojis and live time-remaining timestamps.",
        "!leaderboard is a page with two dropdowns: pick a board — Net Worth (default), Cash, Bank, Passive Income, or Shifts — and a scope, Global or This Server. Net Worth is the real thing: wallet, bank, FD/RD deposits, stocks, property, items, and animals all priced in. The Passive Income board ranks players by earnings per day from property rent and zoo animals. Your own rank shows even when you're not top ten.",
      ],
    },
    {
      heading: "Getting better with money",
      body: [
        "Claim discipline beats grinding: daily plus two votes is 110,000 per day untaxed — with weekly and monthly on top, the claim checklist alone clears 7,000,000 a month before you play a single hand. Set the vote reminder and never skip it.",
        "Batch your multipliers: hold your !monthly until you own a Counterfeit Kit and Crown of Greed, then claim all four paychecks inside one Tax Shield hour. Same claims, ~60% more money.",
        "The wallet is a working balance, not a savings account. Keep it at what you plan to bet or spend today; everything else goes to the bank, then into fixed deposits. Every rob report you ever read will be about someone who didn't.",
        "Watch the two leaks: a delinquent card's 25% garnish and untreated stress silently eat more than taxes ever will. The Bank & Credit and Jobs docs cover both cures.",
      ],
    },
  ],
  commandIds: [
    "balance",
    "deposit",
    "withdraw",
    "transfer",
    "ask",
    "daily",
    "weekly",
    "monthly",
    "vote",
    "beg",
    "slut",
    "leaderboard",
    "profile",
  ],
  proTips: [
    "!deposit all after every session. Every rob and every raid in Fortuna's history hit a wallet, never a bank.",
    "Tax Shield costs 10,000 and saves 320,000 on a single !monthly. It's not an item, it's a coupon.",
    "beg and slut have zero downside — failures cost nothing. Spam them between cooldowns forever.",
    "The vote paycheck is small but its 12-hour cycle means it doubles daily — and it's tax-free like !daily.",
    "Check !profile's Wealth page before big decisions — it's the only view that nets your card debt out of what you think you're worth.",
  ],
};

export default economy;
