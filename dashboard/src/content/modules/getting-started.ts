import type { ModuleDoc } from "../types";

const gettingStarted: ModuleDoc = {
  slug: "getting-started",
  title: "Getting Started",
  tagline: "From zero to your first bet in ten minutes.",
  icon: "Sparkles",
  forBeginners: {
    what: "Fortuna is an economy and casino that lives inside Discord. You earn Fortunes (the currency), work jobs, study for degrees, build credit — and gamble it all away if you like. Your account is yours, not the server's: the same wallet follows you to every server Fortuna is in.",
    firstCommands: ["!start", "!help", "!tutorial"],
    tip: "Everything runs on the ! prefix by default. If a server changed it, mention the bot and it will tell you the prefix.",
  },
  screenshot: {
    src: "/screenshots/docs-getting-started.png",
    alt: "Getting started with Fortuna in Discord",
  },
  sections: [
    {
      heading: "One account, every server",
      body: [
        "Your wallet, bank, job, degrees, credit card, and stress are all attached to your Discord account. Switch servers and it all comes with you — no starting over, no per-server grinding.",
        "The only thing a server controls is the command prefix. Everything else is yours.",
      ],
    },
    {
      heading: "Create your account",
      body: [
        "Run !start and Fortuna opens your account with 1,000 Fortunes in your wallet. That's not much — it's meant to sting. The economy starts at the bottom.",
        "Check what you have at any time with !balance, and see the full picture — career, education, relationship, net worth — with !profile.",
      ],
    },
    {
      heading: "Your first 10 minutes",
      body: [
        "The fastest honest start: claim !daily for 100,000 Fortunes, then look at !jobs and !apply for something with no degree requirement — waiting tables pays around 30,000 a shift. Work shifts with !work.",
        "Once you have 10,000 or more in your wallet, the casino opens up. !coinflip 10000 is the cheapest lesson in probability you'll ever buy.",
      ],
      table: {
        title: "The starter path",
        columns: ["Step", "Command", "What happens"],
        rows: [
          ["1", "!start", "Account created, 1,000 Fortunes"],
          ["2", "!daily", "Claim 100,000 Fortunes (every 24h)"],
          ["3", "!jobs → !apply <job>", "Get hired, no degree needed"],
          ["4", "!work", "Earn your first paycheck"],
          ["5", "!blackjack 10000", "Meet the dealer"],
        ],
      },
    },
    {
      heading: "Where the money comes from",
      body: [
        "Steady income: !daily (100,000 / 24h), !weekly (800,000 / 7d), !monthly (4,000,000 / 30d), and !work shifts. Voting for Fortuna on top.gg with !vote pays 5,000 every 12 hours.",
        "Risky income: !beg and !slut are quick grinds, !crime pays 100,000–220,000 when it works (35% of the time), and !rob takes from other players — with consequences when it doesn't.",
        "Note the fine print: weekly, monthly, and work income is taxed 8%. Daily isn't.",
      ],
    },
    {
      heading: "If you get stuck",
      body: [
        "!help opens the full in-Discord command menu, and !tutorial walks you through every system as paginated lessons.",
        "!ping shows bot status if things feel slow. And the support server is one click away in the footer of this site.",
      ],
    },
  ],
  commandIds: [
    "start",
    "help",
    "tutorial",
    "profile",
    "balance",
    "daily",
    "jobs",
    "apply",
    "work",
    "ping",
  ],
  proTips: [
    "Deposit what you don't plan to bet — !deposit all. Robbers can only touch your wallet, never your bank.",
    "Claim !daily, !weekly, and !monthly on cooldown even when you're broke. Especially when you're broke.",
    "Read a game's rules with !casino before you bet. The payout tables are public for a reason.",
  ],
};

export default gettingStarted;
