import type { ModuleDoc } from "../types";

const lifeAndSocial: ModuleDoc = {
  slug: "life-and-social",
  title: "Life & Social",
  tagline: "Marriage, quests, and the stress meter that ties every other system together.",
  icon: "Heart",
  forBeginners: {
    what: "Fortuna's social layer covers marriage with a shared vault, daily quests with streak bonuses, and a stress meter that will humble you if you ignore it.",
    firstCommands: ["!quests", "!relax", "!family"],
    tip: "The first quest reroll each day is free — use it on whatever task you'd rather not grind.",
  },
  screenshot: {
    src: "/screenshots/docs-life-and-social.png",
    alt: "Life & Social in Discord",
  },
  sections: [
    {
      heading: "Marriage",
      body: [
        "!marry <@user> sends a proposal, and if they accept, a joint vault opens up between you. Right now the whole system is free — no cost to propose, no fee to end it — so the only real cost is the one you agree to.",
        "!family is the relationship dashboard: check the joint vault, deposit or withdraw from it, or run affection actions like hug, kiss, date, or the wildcard chaos option. When it stops being funny, !divorce ends it cleanly.",
      ],
    },
    {
      heading: "Daily quests",
      body: [
        "!quests opens a board of daily tasks, each with its own difficulty, a progress bar, and a reward attached. Keep a streak going and the rewards scale up with it, so missing a day costs more than that day alone.",
        "Claim finished quests right from the board, and if one of them doesn't suit you, the first reroll each day is free — swap it for something else without losing anything.",
      ],
    },
    {
      heading: "Stress & relaxing",
      body: [
        "Job stress and education stress both run 0–100 in the background, climbing every time you !work or !study. !relax is the one command that touches both at once, with four options at different prices and different strength.",
        "Values are clamped, so stress never goes negative or past 100 no matter how much you spend. And if both meters already read zero, Fortuna won't even charge you — there's nothing left to relax.",
      ],
      table: {
        title: "Relax options",
        columns: ["Option", "Cost", "Job stress", "Education stress"],
        rows: [
          ["Quick Break", "25,000", "-8", "-8"],
          ["Gym Session", "75,000", "-20", "-15"],
          ["Meditation Retreat", "150,000", "-35", "-35"],
          ["Weekend Getaway", "350,000", "-75", "-60"],
        ],
      },
    },
    {
      heading: "Money between friends",
      body: [
        "!transfer <@user> <amount> sends Fortunes directly, minus a 5% transfer tax on the way out. Asking instead of sending, !ask <@user> <amount> [reason] drops an Accept/Decline/Block card in their channel instead of you asking twice.",
        "None of it means anything without bragging rights — !leaderboard defaults to net worth, and !leaderboard cash or !leaderboard work switch to the wallet-only and top-earner boards.",
      ],
    },
  ],
  commandIds: ["marry", "divorce", "family", "quests", "relax", "transfer", "ask", "leaderboard"],
  proTips: [
    "Use the joint vault for shared savings you don't want a rob or raid to touch alone — deposits work the same as your own bank.",
    "Reroll your worst daily quest first — it's free once a day, and there's no reason to grind a task you'd rather skip.",
    "Check both stress numbers before spending on !relax — if either one still shows a hit, Quick Break's 25,000 covers more ground than doing nothing.",
  ],
};

export default lifeAndSocial;
