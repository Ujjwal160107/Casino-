import type { ModuleDoc } from "../types";

const bankAndCredit: ModuleDoc = {
  slug: "bank-and-credit",
  title: "Bank & Credit Cards",
  tagline: "Spend the bank's money, pay it back, or watch your score pay for it.",
  icon: "CreditCard",
  forBeginners: {
    what: "A Fortuna Card lets you spend money you don't have yet — the bank fronts it, and you pay it back on a weekly statement. Pay in full and your credit score climbs; pay the minimum and it still climbs, just slower; miss it and your score drops and your income gets garnished.",
    firstCommands: ["!bank", "!credit", "!card issue"],
    tip: "Never miss the minimum due. A missed statement costs more in score than two paid-in-full statements earn back.",
  },
  screenshot: {
    src: "/screenshots/docs-bank-and-credit.png",
    alt: "Bank & Credit Cards in Discord",
  },
  sections: [
    {
      heading: "The bank dashboard",
      body: [
        "!bank is your dashboard for everything beyond a plain savings balance. Open a fixed deposit with fd <amount> <days> for a locked-in 10% APR, or a recurring deposit with rd <amount> <days> at 8% APR if you'd rather contribute over time.",
        "Check investments to see what's active, and collect once they mature to sweep the payout into your bank. The same command also opens the door to credit cards — !bank cards jumps straight to the cards hub.",
      ],
    },
    {
      heading: "Card tiers",
      body: [
        "Four tiers, each gated by both credit score and career tier — you need both, not one or the other, to qualify. Score climbs from a 300 floor to an 850 ceiling; career tier comes from your job.",
        "Higher tiers unlock a much bigger credit limit and lower weekly interest, at the cost of needing more of both to get in the door. Check what you're eligible for with !credit, and apply with !card issue once you qualify.",
      ],
      table: {
        title: "Card tiers",
        columns: [
          "Tier",
          "Score needed",
          "Career tier",
          "Credit limit",
          "Weekly interest",
          "Weekly spend cap",
          "Weekly withdraw cap",
        ],
        rows: [
          ["STARTER", "300", "0", "1,500,000", "12%", "750,000", "250,000"],
          ["GOLD", "500", "2", "6,000,000", "8%", "3,000,000", "1,000,000"],
          ["PLATINUM", "700", "3", "20,000,000", "5%", "10,000,000", "3,000,000"],
          ["BLACK", "850", "4", "60,000,000", "3%", "25,000,000", "8,000,000"],
        ],
      },
    },
    {
      heading: "How the weekly cycle works",
      body: [
        "Every card generates a statement on a roughly weekly cycle. Your minimum due is 12% of that statement's balance or the tier's floor — 75,000 for STARTER, 150,000 for GOLD, 400,000 for PLATINUM, 1,000,000 for BLACK — whichever is higher.",
        "Pay the statement in full and your score climbs +30; pay just the minimum and it still climbs, +20. Miss it entirely and your score drops −45 (−60 if you miss again right after). Miss once or twice and the card goes DELINQUENT; miss three times and it's LOCKED. Score is clamped between 300 and 850 no matter what.",
        "Delinquent and locked cards don't just sit there quietly — they garnish 25% of your income until you settle up.",
      ],
    },
    {
      heading: "Spending & cash advances",
      body: [
        "Spend on credit at the shop with buy card <item> instead of a plain buy — it charges your card instead of your wallet. Need cash instead of goods, use !card withdraw <amount> for a cash advance against your limit, and pay any of it back from your wallet with !card pay <amount>.",
        "Upgrading to a higher tier needs your utilization under 50% first — pay it down before you try. Closing a card requires a zero balance, and you can only ever hold one Fortuna Card at a time.",
      ],
    },
    {
      heading: "The house rule",
      body: [
        "Whatever's on your card, it can never touch the casino. Every bet at !blackjack, !coinflip, !slots, roulette, or any other table comes out of your wallet, full stop — no card, no bank balance, no exceptions.",
        "Keep that boundary in mind when you're managing both accounts: your card is for spending and building credit, your wallet is for gambling. They don't mix.",
      ],
    },
  ],
  commandIds: ["bank", "card", "mycards", "credit", "deposit", "withdraw"],
  proTips: [
    "Pay your statement in full every week if you can — +30 score beats +20, and score compounds into better tiers fast.",
    "Career tier gates cards just as hard as score does. A high score with a low career tier still won't get you approved.",
    "Garnishment isn't optional — it skims 25% straight off !work, !weekly, and !monthly income the moment your card goes delinquent.",
  ],
};

export default bankAndCredit;
