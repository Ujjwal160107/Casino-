import type { ModuleDoc } from "../types";

const gettingStarted: ModuleDoc = {
  slug: "getting-started",
  title: "Getting Started",
  tagline: "From zero to your first bet in ten minutes.",
  icon: "Sparkles",
  forBeginners: {
    what: "Fortuna is an economy and casino that lives inside Discord. You earn Fortunes (the currency), work jobs, study for degrees, build credit, raise a fighting chicken — and gamble it all away if you like. Your account is yours, not the server's: the same wallet follows you to every server Fortuna is in.",
    firstCommands: ["!start", "!help", "!tutorial"],
    tip: "Everything runs on the ! prefix by default. If a server changed it, mention the bot and it will tell you the prefix.",
  },
  screenshot: {
    src: "/fortuna_world.jpg",
    alt: "The world of Fortuna — casino, stock exchange, social hub, and police station in one pixel-art city",
    caption: "The world of Fortuna — every district is a module",
    aspect: "aspect-[256/143]",
  },
  sections: [
    {
      heading: "One account, every server",
      body: [
        "Your wallet, bank, job, degrees, credit card, chicken, and stress are all attached to your Discord account. Switch servers and it all comes with you — no starting over, no per-server grinding. Even the shop, the stock market, and the Black Market are global.",
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
        "The fastest honest start: claim !daily for 100,000 Fortunes, then !apply waiter — no degree, no interview prep needed, 32,000 a shift once you pass five easy questions. Work shifts with !work every hour.",
        "Once you have 10,000 or more in your wallet, the casino opens up. !coinflip 10000 is the cheapest lesson in probability you'll ever buy — and at neutral luck it's a genuinely fair coin.",
      ],
      table: {
        title: "The starter path",
        columns: ["Step", "Command", "What happens"],
        rows: [
          ["1", "!start", "Account created, 1,000 Fortunes"],
          ["2", "!daily", "Claim 100,000 Fortunes (every 24h)"],
          ["3", "!jobs → !apply waiter", "Pass a 5-question interview, get hired"],
          ["4", "!shop job", "Buy the Service Uniform (250,000) when you can — it's required to work"],
          ["5", "!work", "Earn your first paycheck, every hour"],
          ["6", "!quests", "Five daily tasks worth 560,000+ — most complete themselves"],
        ],
      },
    },
    {
      heading: "Where the money comes from",
      body: [
        "Steady income: !daily (100,000/24h, untaxed), !weekly (800,000/7d), !monthly (4,000,000/30d), !work shifts, and !vote on top.gg (5,000 every 12h, untaxed). Daily quests via !quests add up to 560,000 a day before streak bonuses.",
        "Risky income: !beg and !slut are free rolls, the !crime board is a skill minigame paying up to 1,200,000 a job, and !rob takes from other players — with real consequences. Passive income: zoo animals, property rent, stocks, and fixed deposits, once you can afford the entry ticket.",
        "The fine print: weekly, monthly, and work income is taxed 8%. Daily, vote, and quest money is clean.",
      ],
    },
    {
      heading: "The one rule that matters",
      body: [
        "Robbers and police raids can only touch your wallet — never your bank. !deposit all costs nothing, takes one second, and is the difference between a bad beat and a clean escape.",
        "When you're ready to go deeper: every system on this site has its own page in the sidebar — the real odds at the casino, every animal a rifle can catch, what each degree unlocks, and the credit card fine print. The docs quote the bot's actual code, not vibes.",
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
    "quests",
    "ping",
  ],
  proTips: [
    "Deposit what you don't plan to bet — !deposit all. Robbers can only touch your wallet, never your bank.",
    "Claim !daily, !weekly, and !monthly on cooldown even when you're broke. Especially when you're broke.",
    "Open !quests before you play, not after — most of the board completes itself while you work and gamble anyway.",
    "Read a game's real odds in the Casino docs before you bet. Coinflip is fair; slots keeps 4%. Knowing that is worth more than any starter grind.",
  ],
};

export default gettingStarted;
