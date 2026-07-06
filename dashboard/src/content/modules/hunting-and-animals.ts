import type { ModuleDoc } from "../types";

const huntingAndAnimals: ModuleDoc = {
  slug: "hunting-and-animals",
  title: "Hunting & Animals",
  tagline: "Buy a rifle, fill a zoo, raise a fighter — every animal earns its keep somehow.",
  icon: "Crosshair",
  forBeginners: {
    what: "Hunting starts a whole chain: buy a rifle, hunt animals, build a zoo out of what you catch, and raise a fighting chicken on the side.",
    firstCommands: ["!shop hunt", "!hunt", "!chicken"],
    tip: "No rifle, no hunt. The shop's HUNT tab is step one, before !hunt does anything at all.",
  },
  screenshot: {
    src: "/screenshots/docs-hunting-and-animals.png",
    alt: "Hunting & Animals in Discord",
  },
  sections: [
    {
      heading: "Hunting",
      body: [
        "!hunt sends you out with whatever rifle you're carrying, and without one it goes nowhere — !shop hunt is where every tier of rifle is sold. Higher tiers hunt better, but they also run their own cooldown, so upgrading changes your pacing, not just your odds.",
        "!hunt craft opens a separate crafting payload for turning what you've caught into gear and goods — check it after a good haul instead of letting parts sit in your inventory.",
      ],
    },
    {
      heading: "Your zoo",
      body: [
        "!zoo displays every animal you've captured and put on display. Both how many you can hold and how much they earn scale with rarity — a common catch pads the count, a rare one pads the income.",
        "Running a zoo at all needs a zoo property under your name — see the Investments docs for buying real estate, since this is one of the few places hunting and property ownership overlap.",
      ],
    },
    {
      heading: "Fighting chickens",
      body: [
        "!chicken is your bird's dashboard: name it, train it, or pull up its traits to see the stats you're working with. Traits aren't cosmetic — they shape how your chicken performs when it actually fights.",
        "!feed boosts its combat stats directly, and !equip arms it with a weapon, armor, or accessory, one slot each. Do both before a fight, not after.",
      ],
    },
    {
      heading: "Cockfights",
      body: [
        "!cockfight pits two trained birds against each other in stat-based combat, with a 60-second window for side bets before the fight resolves. Max bet is 1,000,000, and the shared casino cooldown runs 45 minutes after.",
        "Whatever your hunts and fights leave behind doesn't have to sit in a drawer — animal parts move on the Black Market via !market, same fees and limits as everything else there.",
      ],
    },
  ],
  commandIds: ["hunt", "zoo", "chicken", "feed", "equip", "cockfight", "shop", "market"],
  proTips: [
    "Buy the rifle tier that matches your patience — a faster cooldown beats a marginally better catch rate if you hunt often.",
    "Feed and equip your chicken before every fight, not just the first one. Stats reset expectations, not memory.",
    "Sell spare animal parts on the Black Market instead of letting them clutter your inventory — the 7-day expiry doesn't wait.",
  ],
};

export default huntingAndAnimals;
