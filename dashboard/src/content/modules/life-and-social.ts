import type { ModuleDoc } from "../types";

const lifeAndSocial: ModuleDoc = {
  slug: "life-and-social",
  title: "Life & Social",
  tagline: "A marriage that pays dividends (or divorces you for neglect), quests with streaks, and the stress meter under it all.",
  icon: "Heart",
  forBeginners: {
    what: "Fortuna's social layer has real machinery: marriage runs on an affection meter that multiplies rewards into a shared vault, daily quests pay up to 840,000 a day with a streak, and two stress meters quietly tax your work and studies until you spend to reset them.",
    firstCommands: ["!quests", "!family", "!relax"],
    tip: "Marriage needs a Ring from the shop — it's consumed when your proposal is accepted. Budget for the ring before you kneel.",
  },
  screenshot: {
    src: "/art/daily-quest.jpg",
    alt: "Lady Fortuna holding the daily quest board",
    caption: "The daily quest board",
    aspect: "aspect-square",
    maxWidth: "max-w-sm",
  },
  sections: [
    {
      heading: "Marriage: proposal to power couple",
      body: [
        "!marry @user sends a proposal with a 60-second accept window — both of you must be unmarried, and you need a Ring in your inventory (consumed on acceptance). The marriage starts at 25/1000 affection, and affection is the whole game: it sets a multiplier on every reward the two of you earn together.",
        "Affection grows through !family's actions, each on its own cooldown, each paying coins into the couple vault: hug (2h, +12–20 affection, 3,000–8,000), kiss (4h, +25–38, 7,500–16,000), date (20h, +45–70, 30,000–80,000 — costs 75,000), make love (24h, +75–110, 25,000–55,000), and chaos (24h, a wildcard that can pay 60,000 or COST you affection).",
      ],
      table: {
        title: "Affection tiers (reward multiplier)",
        columns: ["Tier", "Affection", "Multiplier"],
        rows: [
          ["Cold Roommates", "0 – 99", "×1.00"],
          ["Flirty Partners", "100 – 249", "×1.05"],
          ["Sweethearts", "250 – 499", "×1.10"],
          ["Power Couple", "500 – 799", "×1.15"],
          ["Obsessed Lovers", "800+", "×1.25"],
        ],
      },
      note: "Neglect is mechanical: after 3 idle days affection starts decaying (15/day, growing to 75), at 7 days the marriage is flagged at-risk, and at 10 days with two warnings Fortuna auto-divorces you. Love is a cooldown rotation.",
    },
    {
      heading: "The couple vault",
      body: [
        "Action rewards land in a joint vault, and either partner can deposit instantly from their own wallet — it's a second bank, equally immune to robbery. Withdrawing is the trust exercise: a withdrawal creates a request your spouse has 10 minutes to approve or decline. Nobody drains the vault solo.",
        "!divorce (with confirmation) ends it cleanly and splits the vault 50/50. There's no fee — the cost is the affection multiplier you grinded.",
      ],
    },
    {
      heading: "Daily quests: the second paycheck",
      body: [
        "!quests deals five tasks a day — always 2 easy (30,000 each), 2 medium (100,000 each), 1 hard (300,000) — drawn from a 26-quest pool across casino, work, education, cockfighting, market, and social play. Full board = 560,000 base.",
        "The streak multiplies it: claim the full board on consecutive days for +10% (day 2) up to +50% (day 7 and beyond) — a maintained streak pays 840,000 a day. Missing a day only drops the streak by one step, not to zero.",
        "Hate a task? Reroll it: the first reroll each day is free, the second and third cost 50,000 each — same difficulty, different task. Progress cross-credits generously (any casino win counts toward the generic gamble quests), so most boards complete themselves while you play normally.",
      ],
    },
    {
      heading: "Stress: the meter behind work and school",
      body: [
        "Two meters, both 0–100: job stress rises ~5 per shift (10 on a failed one), education stress ~20 per study session reduced by discipline. Past 80 job stress, shifts start burning out (50% chance of a wasted hour); past 90 education stress, studies risk torching 100 XP. High stress is the most expensive thing in the game that doesn't show a price tag.",
        "!relax buys both meters down at once — one purchase, two meters:",
      ],
      table: {
        title: "Relax options",
        columns: ["Option", "Cost", "Job stress", "Education stress", "Cost per point (job)"],
        rows: [
          ["Quick Break", "25,000", "−8", "−8", "3,125"],
          ["Gym Session", "75,000", "−20", "−15", "3,750"],
          ["Meditation Retreat", "150,000", "−35", "−35", "~4,285"],
          ["Weekend Getaway", "350,000", "−75", "−60", "~4,667"],
        ],
      },
      note: "Stress Pills from the job shop (150,000, −20 job stress only) beat the Gym Session's price-per-point only if your education meter is already clean. If both meters read zero, !relax refuses your money.",
    },
    {
      heading: "Getting better at the social game",
      body: [
        "Run the affection rotation like cooldowns, because it is one: hug every 2 hours you're online, kiss every 4, date daily, make love daily. A couple that keeps the rotation hits Obsessed Lovers in about a week — from then on every action pays 25% extra, forever, into a vault nobody can rob.",
        "Guard the quest streak harder than the quests. The difference between a day-7 streak and a fresh board is 280,000 every single day — if you only have five minutes, spend it clearing the two easy quests and whatever's nearly done, because a claimed board is what keeps the streak alive.",
        "Reroll strategically: burn the free reroll on the hard quest if it demands a system you don't play (no chicken, no cockfight wins). A 300,000 quest you can't finish is worth more as a reroll than the 30,000 one you'd finish anyway.",
        "Relax at thresholds, not on schedule: work until job stress nears 75, then buy the biggest option you can afford — bigger packages carry slightly worse cost-per-point but save you cooldown time, so the Weekend Getaway is for when you're deep in both meters at once.",
      ],
    },
  ],
  commandIds: ["marry", "divorce", "family", "quests", "relax", "transfer", "ask", "leaderboard"],
  proTips: [
    "Chaos is the only affection action that can go negative (−8 to −25) — gamble it at high affection where the tier can absorb it, never at 90/100 approaching a tier line.",
    "The couple vault is a second rob-proof bank with a two-key lock. Park shared savings there even if you never touch the affection game.",
    "Quest streaks drop one step per missed day instead of resetting — a day-7 streak survives a bad day at +35%. Don't rage-quit the system over one miss.",
    "The 20-hour date cooldown drifts earlier each day — date right after the quest reset and it's reliably available daily despite costing 75,000.",
    "Auto-divorce at 10 idle days splits the vault 50/50 — if a marriage is ending anyway, whoever cares less about the vault balance should NOT be the one holding the deposits.",
  ],
};

export default lifeAndSocial;
