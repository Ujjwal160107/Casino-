import type { ModuleDoc } from "../types";

const crimeAndHeat: ModuleDoc = {
  slug: "crime-and-heat",
  title: "Crime & Heat",
  tagline: "Fifty-eight crimes, zero dice — every job is a skill check, and the taxman is watching.",
  icon: "Siren",
  forBeginners: {
    what: "Crime in Fortuna isn't a slot machine — it's a heist minigame. !crime deals you a board of five jobs, each needing specific gear from the shop or crafting bench. Commit to one and you play timed multiple-choice stages; answer every stage right and the payout is yours. Get one wrong and you eat the fine — and maybe a cell.",
    firstCommands: ["!crime", "!jail", "!rob @user"],
    tip: "Success is 100% skill. There is no hidden success percentage — read the scenario, pick the answer that a professional would pick, and don't let the timer beat you.",
  },
  screenshot: {
    src: "/cards/card_crime.png",
    alt: "Lady Fortuna in cuffs — the crime module",
    caption: "The Crime card",
    aspect: "aspect-[572/863]",
    maxWidth: "max-w-xs",
  },
  sections: [
    {
      heading: "The crime board",
      body: [
        "!crime opens a board of five crimes drawn from a 58-crime catalog themed around every corner of Fortuna — pickpocketing and ATM skims, office payroll fraud, university transcript rings, wildlife smuggling, cockfight fixing, and full legendary heists. The board holds for 10 minutes, and each roll has a 5% chance of surfacing a legendary job.",
        "Every crime requires gear: standard crimes need one specific item, legendaries need three. A Bank Vault Heist wants an Eclipse Mask, a Corporate Blessing, and a Sniper Rifle in your inventory before you can even attempt it. The board shows you what's missing — that's your shopping list.",
      ],
    },
    {
      heading: "Tiers, payouts & fines",
      body: [
        "Tier decides everything about a crime: how many minigame stages you play, how tight the timer runs, what a win pays, and what a loss costs. Committing to a crime starts your 1-hour crime cooldown whether you win or lose.",
      ],
      table: {
        title: "Crime tiers",
        columns: ["Tier", "Stages", "Timer/stage", "Payout", "Fine on fail", "Jail risk on fail"],
        rows: [
          ["Petty", "1", "15s", "50,000 – 120,000", "25,000 – 60,000", "None"],
          ["Medium", "2", "15s", "100,000 – 220,000", "60,000 – 140,000", "None"],
          ["High", "2", "18s", "180,000 – 350,000", "120,000 – 240,000", "10% → 20 min"],
          ["Elite", "3", "18s", "300,000 – 550,000", "200,000 – 400,000", "20% → 45 min"],
          ["Legendary", "3", "20s", "500,000 – 1,200,000", "350,000 – 700,000", "35% → 60 min"],
        ],
      },
      note: "Each stage offers 3–4 options with exactly one correct answer. A wrong pick or a timeout fails the whole crime instantly — there are no partial payouts.",
    },
    {
      heading: "Prep items: paid in payout, not luck",
      body: [
        "The gear a crime requires isn't just a key — it's a bonus. Every prep item carries a payout bonus that fattens the take when you succeed. The best in class: Corporate Blessing +10%, Eclipse Mask +12%, Wolf Fang Dagger +10%, Cheat Sheet +5% with the highest-tier UNI jobs. Crafted hunt gear slots in too: Python Skin Cloak +7%, Arctic Wolf Spirit Charm +8%, Komodo Venom Flask +9%.",
        "One item does something rarer: the crafted Fox Tail Talisman gives a 20% chance that a failed crime's fine is cut in half. Crown of Greed also touches crime from the sidelines — +25% on crime income, but +25% on crime fines too.",
      ],
    },
    {
      heading: "Heat: the meter behind the crimes",
      body: [
        "Every successful crime adds a flat +20 heat. Heat decays 10 per hour on its own and clears completely if you stay clean for 72 hours. The number to respect is 100: once you cross it, every hourly police scan has a 40% chance of triggering a TAX RAID that seizes 10–25% of your wallet and resets your heat to zero.",
        "Fortuna warns you inside the crime results once you pass 70 heat. Five successful crimes back-to-back puts you at 100 — at one crime per hour with 10/hour decay, you gain a net +10 per crime, so a long session will walk you into raid territory.",
      ],
      note: "Raids only touch your wallet. Money in the bank is untouchable — bank your crime money the moment it lands.",
    },
    {
      heading: "Robbery: PvP crime",
      body: [
        "!rob @user takes a shot at another player's wallet on a 5-minute cooldown. Base success is 45%, shifted by Luck (roughly ±5% at the extremes), +12% if you're wearing an Eclipse Mask, and +5% if your target is cursed with Demonic Harp vulnerability — all clamped between 5% and 85%.",
        "A successful rob steals 8–20% of the target's wallet, hard-capped at 250,000. Thieves Gloves multiply the take ×1.25 (6 robs or 6 hours), Eclipse Mask adds +15%, a crafted Wolf Fang Dagger +10%. Failure costs a 60,000–120,000 fine — and if you failed wearing the Eclipse Mask, an extra 300,000–900,000 backlash on top.",
        "Defense is real: a Padlock (175,000) blocks one robbery outright, and the crafted Crocodile Hide Armor blocks one attempt for 24 hours. Both are consumed when they trigger.",
      ],
    },
    {
      heading: "Jail & bail",
      body: [
        "Only failed high/elite/legendary crimes can jail you, at the odds in the tier table. While jailed, most of the game is locked — work, crime, shop, casino, claims, bank, cards — until the sentence runs out or you pay.",
        "!jail shows your remaining sentence with a Pay Bail button, and !bail pays it directly: a flat 1,000 Fortunes, regardless of sentence. Release is automatic when time expires.",
      ],
    },
    {
      heading: "Getting better at crime",
      body: [
        "Learn the scenarios, not the odds. The minigames repeat from a fixed catalog — every stage you've seen before is a stage you can't fail. Petty and medium crimes are free practice: no jail risk, cheap fines, same scenario style as the big jobs.",
        "Buy the gear once, profit forever. Prep items aren't consumed by crimes — a Business Briefcase or Cheat Sheet you already own for its day job doubles as a permanent crime key with a payout bonus attached.",
        "Bank between jobs, always. The fine on a failed legendary can hit 700,000 and drains your wallet to zero if you can't cover it — and heat raids only see the wallet. A rich wallet is the only thing crime can actually take from you.",
        "Respect the clock more than the police. The 1-hour crime cooldown means heat decays 10 while you gain 20 — every crime is net +10 heat. Take a break every 4–5 successes, or accept that the raid is a matter of when, not if.",
      ],
    },
  ],
  commandIds: ["crime", "rob", "jail", "bail", "use", "iteminfo"],
  proTips: [
    "Petty crimes have no jail risk and a 1-stage minigame — they're the highest success-per-effort in the module while you learn the scenario pool.",
    "Legendary crimes need all three items in inventory before they're even playable. Assemble the kit during the week; commit when the board offers one.",
    "Crown of Greed cuts both ways in crime: +25% payouts, +25% fines. Run it only on crimes you're confident reading.",
    "Rob right after someone wins big at the casino — winnings sit in the wallet, and the 250,000 cap means a fat wallet loses the same as a modest one. Bank yours before you gloat.",
    "Fox Tail Talisman is 150,000 coins of cheap insurance for elite/legendary attempts — a 20% shot at halving a 700,000 fine.",
  ],
};

export default crimeAndHeat;
