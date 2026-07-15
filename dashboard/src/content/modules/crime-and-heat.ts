import type { ModuleDoc } from "../types";

const crimeAndHeat: ModuleDoc = {
  slug: "crime-and-heat",
  title: "Crime & Heat",
  tagline: "Skill-based heists, PvP robbery, and the attention that follows both.",
  icon: "Siren",
  forBeginners: {
    what: "Crime in Fortuna is a timed heist minigame. Pick a job from !crime, bring its required gear, and clear every stage for the payout. A bad answer costs a fine and may put you in jail. Successful crimes and robbery attempts build Heat, so watch it with !heat.",
    firstCommands: ["!crime", "!heat", "!rob @user"],
    tip: "Heat is manageable when you plan it. Check !heat before another high-risk job, use passive decay, and save the active reductions for when attention starts to build.",
  },
  screenshot: {
    src: "/cards/card_crime.png",
    alt: "Lady Fortuna in cuffs - the crime module",
    caption: "The Crime card",
    aspect: "aspect-[572/863]",
    maxWidth: "max-w-xs",
  },
  sections: [
    {
      heading: "The crime board",
      body: [
        "!crime opens a board of five jobs from a 58-crime catalog. Each job requires particular gear and uses timed multiple-choice stages. Clear every stage and the payout is yours; a wrong answer or timeout fails the whole job.",
        "Standard crimes require one prep item and legendary jobs require three. The board clearly shows what is missing, so it doubles as a shopping list.",
      ],
    },
    {
      heading: "Tiers, payouts, and fines",
      body: [
        "Tier determines stages, time pressure, payout, fine, and jail risk. Starting a crime spends its one-hour cooldown whether you win or lose.",
      ],
      table: {
        title: "Crime tiers",
        columns: ["Tier", "Stages", "Timer/stage", "Payout", "Fine on fail", "Jail risk"],
        rows: [
          ["Petty", "1", "15s", "50,000 - 120,000", "25,000 - 60,000", "None"],
          ["Medium", "2", "15s", "100,000 - 220,000", "60,000 - 140,000", "None"],
          ["High", "2", "18s", "180,000 - 350,000", "120,000 - 240,000", "10%"],
          ["Elite", "3", "18s", "300,000 - 550,000", "200,000 - 400,000", "20%"],
          ["Legendary", "3", "20s", "500,000 - 1,200,000", "350,000 - 700,000", "35%"],
        ],
      },
    },
    {
      heading: "Heat and laying low",
      body: [
        "Successful crimes add heat by tier: petty +16, medium +20, high +26, elite +32, and legendary +40. Robbery adds +15 on success or +10 when you are caught. Heat naturally falls by 10 every hour.",
        "!heat is your Heat & Lay Low dashboard. It shows your current level, the next passive decay, and raid danger. Lay Low is free, removes up to 15 heat, and is available every 6 hours. At 40 heat, Call a Fixer removes up to 35 heat every 12 hours; the wallet fee scales with the heat you have built.",
        "At 100 heat you are Wanted. Every hourly scan then has a 40% chance to trigger a tax raid that seizes 10-25% of your wallet and resets heat to zero.",
      ],
      note: "Raids only touch wallet money. Banking protects cash from raids, but it does not protect it from crime or robbery fines.",
    },
    {
      heading: "Robbery: PvP crime",
      body: [
        "!rob @user attempts to steal 8-20% of another player's wallet. Luck, Thief Gloves, Eclipse Mask, and certain crafted gear can influence the result. A failed robbery costs a fine, can send you to jail, and still creates heat.",
        "Padlocks and Crocodile Hide Armor can block a robbery attempt. Victims receive a direct message when they are robbed or when their Padlock is used.",
      ],
    },
    {
      heading: "Jail and bail",
      body: [
        "Failed high, elite, and legendary crimes can jail you. While jailed, most earning, banking, shopping, and casino actions are unavailable until release or bail.",
        "!jail shows your remaining sentence and !bail lets you leave early for the standard 1,000 Fortunes bail.",
      ],
    },
  ],
  commandIds: ["crime", "heat", "rob", "jail", "bail", "use", "iteminfo"],
  proTips: [
    "Use !heat before another crime when you are already Noticed or Watched.",
    "Bank crime money between jobs to keep it outside the reach of a raid.",
    "Lay Low is free, so use it before paying a fixer whenever its cooldown is ready.",
    "A robbery adds Heat even when it fails, so account for the fine, jail, and attention together.",
  ],
};

export default crimeAndHeat;
