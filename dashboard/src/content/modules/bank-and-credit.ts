import type { ModuleDoc } from "../types";

const bankAndCredit: ModuleDoc = {
  slug: "bank-and-credit",
  title: "Bank & Credit Cards",
  tagline: "Deposits that grow on a timer, credit that grows teeth if you miss a Monday.",
  icon: "CreditCard",
  forBeginners: {
    what: "The bank is three things: a vault robbers can't touch, a deposit desk paying guaranteed interest through FDs and RDs, and the issuer of the Fortuna Card — a real credit card with weekly statements, a credit score, and a collections department that garnishes your income if you ghost it.",
    firstCommands: ["!bank", "!bank fd 500000 30", "!card issue"],
    tip: "Your plain bank balance earns NOTHING. Any coin sitting in the bank for more than a day should be inside a fixed deposit instead.",
  },
  screenshot: {
    src: "/cards/gold_card.png",
    alt: "The GOLD tier Fortuna Card",
    caption: "The GOLD card — 6,000,000 limit at 8% weekly",
    aspect: "aspect-square",
    maxWidth: "max-w-sm",
  },
  sections: [
    {
      heading: "The bank dashboard",
      body: [
        "!bank is the hub: net worth (wallet + bank + locked investments), balances, credit score, and buttons into Investments and Cards. Money moves in and out with !deposit <amount|all> and !withdraw <amount|all> — both accept smart amounts like 500k, 2m, or all.",
        "What the bank does for you: everything in it is immune to money stolen by !rob and to heat raids. Crime and robbery failure penalties are different: they drain the wallet first, then charge any remainder to the bank, which can become negative debt. Deposits repay that debt before becoming savings. The bank also pays no interest on an idle positive balance; growth only comes from the two deposit products below.",
      ],
    },
    {
      heading: "Fixed Deposits (FD): the real product",
      body: [
        "!bank fd <amount> <days> locks money from your BANK balance (deposit it first) at 10% APR simple interest, prorated by the day: interest = amount × 10% × days ÷ 365. Any amount, any duration from 1 day up, and you can run as many FDs at once as you like.",
        "At maturity the payout lands back in your bank automatically — Fortuna checks every minute, and !bank collect sweeps anything the automation hasn't. There is no early withdrawal: an FD is locked until its date, full stop. That's the entire risk.",
      ],
      table: {
        title: "What an FD pays (10% APR, simple)",
        columns: ["Principal", "7 days", "30 days", "90 days", "365 days"],
        rows: [
          ["1,000,000", "1,917", "8,219", "24,657", "100,000"],
          ["10,000,000", "19,178", "82,191", "246,575", "1,000,000"],
          ["100,000,000", "191,780", "821,917", "2,465,753", "10,000,000"],
        ],
      },
      note: "Interest is simple, not compounding — a 365-day FD pays the same as twelve 30-day FDs rolled by hand, so pick the duration that matches when you'll want the money.",
    },
    {
      heading: "Recurring Deposits (RD): read this before opening one",
      body: [
        "!bank rd <amount> <days> looks like the FD's sibling, but the math is different: RDs pay 8% APR with a further ×0.5 factor — an effective ~4% annualized, less than half the FD's rate. Despite the 'recurring' name, there are no installments: it's a single lump sum from your bank, locked to maturity exactly like an FD.",
        "In plain terms: for any amount and any duration, the FD strictly out-pays the RD. The RD exists; the FD is the one you want.",
      ],
      table: {
        title: "FD vs RD, side by side (1,000,000 locked)",
        columns: ["Duration", "FD pays (10% APR)", "RD pays (~4% effective)"],
        rows: [
          ["30 days", "8,219", "3,287"],
          ["90 days", "24,657", "9,863"],
          ["365 days", "100,000", "40,000"],
        ],
      },
    },
    {
      heading: "The Fortuna Card: tiers",
      body: [
        "One card per player, four tiers, and every tier gates on BOTH numbers: your credit score (everyone starts at 500) and your career tier from the Jobs ladder. A perfect score with a Waiter's career tier still caps you — the card desk checks your business card too.",
        "!card issue grants the best tier you qualify for; !card upgrade moves you up later, but only if your utilization is under 50% and the card isn't delinquent. !credit shows exactly where you stand against every tier.",
      ],
      table: {
        title: "Card tiers",
        columns: ["Tier", "Score", "Career tier", "Limit", "Weekly interest", "Min due floor", "Spend cap/wk", "Cash advance cap/wk"],
        rows: [
          ["STARTER", "300", "0", "1,500,000", "12%", "75,000", "750,000", "250,000"],
          ["GOLD", "500", "2", "6,000,000", "8%", "150,000", "3,000,000", "1,000,000"],
          ["PLATINUM", "700", "3", "20,000,000", "5%", "400,000", "10,000,000", "3,000,000"],
          ["BLACK", "850", "4", "60,000,000", "3%", "1,000,000", "25,000,000", "8,000,000"],
        ],
      },
    },
    {
      heading: "The weekly cycle: statements, score, and misses",
      body: [
        "Every Monday at 00:00, each card generates a statement of its balance and settles the previous one. Your minimum due is 12% of the statement or the tier's floor, whichever is higher. Payments come from your wallet via !card pay <amount|all> or the Pay Minimum / Pay Full buttons.",
        "Settlement is the only thing that moves your credit score: pay the statement in full for +30, pay at least the minimum for +20 (and one old miss is forgiven from your streak), miss entirely for −45 — or −60 if it's a repeat. Score is clamped between 300 and 850, and nothing else in the game touches it: not gambling, not crime, not robbery. Just Mondays.",
        "A miss also charges interest — the tier's weekly rate on whatever went unpaid, stacked onto your balance (which can grow to 1.5× your limit this way). One miss marks the card DELINQUENT; three consecutive misses LOCK it.",
      ],
      note: "Delinquent and locked cards garnish 25% of every income payout — work shifts, weekly, monthly, even your Black Market sale proceeds — until the balance is cleared. A locked card unlocks only at a zero balance.",
    },
    {
      heading: "Spending & cash advances",
      body: [
        "Charge purchases anywhere the shop sells: !shop buy card <item>, tuition on enrollment, and more — all against your limit and the weekly spend cap. Five items are cash-only by design: Mystery Box, Treasure Map, Pandora Box, Loaded Dice of Ruin, and Devil Contract.",
        "!card withdraw <amount> is a cash advance straight to your wallet, against the same limit but under the (much smaller) weekly withdraw cap. And the iron rule: card money never gambles. Every casino bet comes from your wallet — no card, no bank balance, no exceptions.",
        "Done with a card? !card close requires a zero balance. Closing and reissuing later starts the paperwork fresh.",
      ],
    },
    {
      heading: "Getting better with the bank",
      body: [
        "Ladder your FDs. Instead of one giant year-long lock, run several 30-day FDs opened a week apart — something matures every week, so you keep liquidity without giving up the 10% rate. Lock long only what you're sure you won't miss.",
        "Treat the card as a score machine first, credit second. Small charge, pay in full Monday, +30 score — that loop runs you from 500 to BLACK's 850 requirement in 12 clean weeks, faster than any spending spree, with zero interest paid.",
        "The garnish math is brutal: at 25% of all income, a delinquent card costs a Chief of Medicine over 100,000 per shift. If you're ever choosing between the minimum due and anything else, pay the minimum due.",
        "Career tier is half the gate — plan it with the Jobs docs. GOLD needs tier 2 (Junior Developer, Paralegal, Master Mechanic...), BLACK needs tier 4 (Lead Engineer, Chief of Medicine, Partner). No ladder, no BLACK card, whatever your score.",
      ],
    },
  ],
  commandIds: ["bank", "card", "mycards", "credit", "deposit", "withdraw"],
  proTips: [
    "FD everything idle. 10,000,000 sitting in plain bank for a month is 82,191 in interest you chose not to earn.",
    "Never open an RD expecting FD returns — it pays less than half the rate for the same lock. The table above is the whole argument.",
    "Pay in full, not just the minimum: +30 beats +20, and the minimum leaves a balance that next week's statement grows teeth on.",
    "Time big buys right after Monday's statement — you get almost a full week of float before the charge appears on one.",
    "Utilization above 50% freezes upgrades. Pay down before you apply, not after the rejection.",
  ],
};

export default bankAndCredit;
