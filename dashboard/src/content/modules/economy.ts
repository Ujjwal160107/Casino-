import type { ModuleDoc } from "../types";

const economy: ModuleDoc = {
  slug: "economy",
  title: "Economy & Money",
  tagline: "Two accounts, one wallet that follows you everywhere.",
  icon: "Coins",
  forBeginners: {
    what: "Your money lives in two places: the wallet, which is cash on hand you can spend and gamble with, and the bank, which is a safe place to stash it. Everything you earn — jobs, daily claims, grinds — lands in your wallet first, and it's up to you to move it to safety.",
    firstCommands: ["!balance", "!deposit all", "!daily"],
    tip: "Rob and heat raids can only touch your wallet. Whatever's in the bank stays yours.",
  },
  screenshot: {
    src: "/screenshots/docs-economy.png",
    alt: "Economy & Money in Discord",
  },
  sections: [
    {
      heading: "Wallet vs bank",
      body: [
        "Your money lives in two places: the wallet, which is cash on hand you can spend at the casino and shops but which robbers and heat raids can reach, and the bank, which is safe from both but has to be moved back before you can spend it.",
        "Move it either direction with !deposit <amount|all> and !withdraw <amount|all>. Type all to sweep everything in one shot, or a specific number — Fortuna's amount parser also understands smart shorthand, not just exact digits, so you don't have to do the math by hand.",
      ],
    },
    {
      heading: "Claim your income",
      body: [
        "Four commands pay you just for showing up: !daily, !weekly, !monthly, and !vote for backing Fortuna on top.gg. Daily and vote payouts skip the taxman — weekly and monthly take an 8% cut before they hit your wallet.",
        "Stack them: claim daily every day, weekly every week, monthly every month, and vote every 12 hours if you can. None of them cost anything to attempt, so missing one is just money left on the table.",
      ],
      table: {
        title: "Free income",
        columns: ["Command", "Reward", "Cooldown", "Tax"],
        rows: [
          ["!daily", "100,000", "24h", "None"],
          ["!weekly", "800,000", "7 days", "8%"],
          ["!monthly", "4,000,000", "30 days", "8%"],
          ["!vote", "5,000", "12h", "None"],
        ],
      },
    },
    {
      heading: "Grinding for cash",
      body: [
        "When cooldowns line up against you and the casino feels too rich, three commands turn a few seconds of your time into cash: !beg, !slut, and !crime. The first two are safe — you either get paid or you don't, no downside.",
        "Crime is different: it pays the best of the three but adds +20 heat every time it succeeds, and fails loud with a real fine and jail time. Run the safe grinds on cooldown between everything else; save crime for when you can absorb the risk.",
      ],
      table: {
        title: "Grind commands",
        columns: ["Command", "Cooldown", "Success rate", "Payout on win", "Fine on fail"],
        rows: [
          ["!beg", "45 sec", "70%", "8,000 – 15,000", "—"],
          ["!slut", "2 min", "55%", "12,000 – 22,000", "—"],
          ["!crime", "1 hour", "35%", "100,000 – 220,000", "60,000 – 140,000"],
        ],
      },
    },
    {
      heading: "Robbing and getting robbed",
      body: [
        "!rob <@user> takes a swing at someone else's wallet directly (5-minute cooldown) — never their bank, which is exactly why banking your cash matters. Base success sits at 45%, though items and defenses on both sides can push that anywhere from 5% to 85%.",
        "A successful rob steals 8–20% of the target's wallet, capped at 250,000; a failed one costs you a 60,000–120,000 fine. Items change the math on both sides — a Padlock or Thief Gloves can swing the odds, and several other items interact with rob in ways this page won't fully spell out. Check the Items docs for the complete list before you plan around them.",
      ],
    },
    {
      heading: "Jail, heat & taxes",
      body: [
        "Get caught and you're jailed — locked out of a long list of commands including !work, !crime, !shop, !bet, !blackjack, !daily, !weekly, !bank, and !card, among others, until your sentence runs out or you pay your way free. !jail shows your sentence and drops a Pay Bail button; !bail pays it directly. The default fine is 1,000 Fortunes for a default 10-minute sentence.",
        "Separately, heat tracks how hot you are with the law: every successful !crime adds +20. Cross 100 and you risk a raid that seizes 10–25% of your wallet — heat decays 10 points an hour if you lay low.",
        "Two taxes run in the background regardless: transfers via !transfer take 5%, and income from !weekly, !monthly, and !work is taxed 8%. !daily is the one clean paycheck in the game.",
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
    "crime",
    "rob",
    "jail",
    "bail",
    "leaderboard",
    "profile",
  ],
  proTips: [
    "Bank what you're not actively using — !deposit all — before you !crime or !rob. Wallets get robbed and raided; banks don't.",
    "Watch your heat after a crime spree. It only decays 10/hr, and a raid at 100 heat can cost you a quarter of your wallet.",
    "!ask beats begging friends directly — it drops an Accept/Decline card in chat instead of you asking twice.",
  ],
};

export default economy;
