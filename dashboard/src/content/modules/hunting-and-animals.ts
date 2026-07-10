import type { ModuleDoc } from "../types";

const huntingAndAnimals: ModuleDoc = {
  slug: "hunting-and-animals",
  title: "Hunting & Animals",
  tagline: "Four rifles, sixteen animals, seventeen recipes — the wilderness is an economy of its own.",
  icon: "Crosshair",
  forBeginners: {
    what: "Hunting is a full production chain: buy a rifle, hunt animals on a cooldown, then decide what each catch becomes — sold for quick cash, displayed in a zoo for passive income, broken into parts for the Black Market, or crafted into gear that buffs hunting, robbery, crime, cockfights, and even studying.",
    firstCommands: ["!shop hunt", "!hunt", "!zoo"],
    tip: "No rifle, no hunt — the Wooden Rifle (500,000) is the entry ticket. Hunts never fail; the rifle only decides how often you go out and how rare the catch can be.",
  },
  sections: [
    {
      heading: "Rifles: your tier decides everything",
      body: [
        "Every hunt uses the best rifle you own, automatically. The tier sets three things at once: how long the cooldown runs, how many rarity rolls you get per hunt, and which rarities are even possible. A Wooden Rifle only ever finds Commons; the Legendary Rifle is the only gun in the game that can bring back a Legendary animal.",
        "Rifles are permanent equipment — no durability, no re-buying. And upgrading is instant gratification: buying a strictly better rifle clears your active hunt cooldown on the spot, so the upgrade always pays off with an immediate hunt.",
      ],
      table: {
        title: "Rifle tiers (!shop hunt)",
        columns: ["Rifle", "Price", "Cooldown", "Rolls per hunt", "Common", "Uncommon", "Rare", "Legendary"],
        rows: [
          ["Wooden Rifle", "500,000", "8h", "1", "100%", "—", "—", "—"],
          ["Iron Rifle", "1,500,000", "6h", "1–2", "70%", "30%", "—", "—"],
          ["Sniper Rifle", "4,000,000", "4h", "1–3", "50%", "35%", "15%", "—"],
          ["Legendary Rifle", "12,000,000", "2h", "2–4", "30%", "35%", "25%", "10%"],
        ],
      },
      note: "Hunts always succeed — there is no miss, no jail risk, no heat. The only cost of hunting is the cooldown.",
    },
    {
      heading: "How a hunt resolves",
      body: [
        "Each hunt makes 1–4 rarity rolls depending on your rifle. Every roll picks a rarity by the weights above, then a random species of that rarity, then a quantity: Commons come 3–6 at a time, Uncommons 1–3, Rares 1–2, and a Legendary is always a single animal.",
        "Three shop consumables stack the deck for your next hunt, each lasting 24 hours or one hunt, whichever comes first. Echo Whistle (600,000) gives a 35% chance of one bonus animal matching your best catch of the hunt. Bait Box (750,000) guarantees at least 2 rarity rolls — pointless on a Legendary Rifle, transformative on Iron. Camouflage Kit (1,200,000) shifts the odds themselves: +10% Rare, +5% Legendary, −15% Common.",
        "The Hunter's Compass (2,250,000) is the permanent version: once per day, point it down a path for your next hunt — !use hunters compass risky for +8% Rare and +4% Legendary, or !use hunters compass safe for +15% Uncommon. It's equipment, never consumed, and stacks with the buffs above (Rare caps at 40%, Legendary at 20%).",
      ],
    },
    {
      heading: "The animal catalog",
      body: [
        "Sixteen species across four rarities. Every animal has a flat sell value, an hourly zoo income, and a set of parts it can be broken into. One caught animal carries one of each of its parts.",
      ],
      table: {
        title: "All 16 animals",
        columns: ["Animal", "Rarity", "Sell value", "Zoo income/hr", "Parts"],
        rows: [
          ["Rabbit", "Common", "8,000", "500", "meat, fur"],
          ["Squirrel", "Common", "6,000", "500", "fur"],
          ["Fox", "Common", "10,000", "500", "fur, tail"],
          ["Duck", "Common", "7,000", "500", "feathers, meat"],
          ["Deer", "Uncommon", "60,000", "2,000", "venison, antlers, hide"],
          ["Boar", "Uncommon", "65,000", "2,000", "tusk, meat"],
          ["Wolf", "Uncommon", "70,000", "2,000", "pelt, fang"],
          ["Eagle", "Uncommon", "75,000", "2,000", "feathers, talons"],
          ["Black Bear", "Rare", "280,000", "8,000", "pelt, claws"],
          ["Snow Leopard", "Rare", "320,000", "8,000", "pelt"],
          ["Crocodile", "Rare", "260,000", "8,000", "hide, teeth"],
          ["Python", "Rare", "240,000", "8,000", "skin"],
          ["White Tiger", "Legendary", "900,000", "25,000", "pelt, fangs"],
          ["Komodo Dragon", "Legendary", "1,000,000", "25,000", "scales, venom"],
          ["Arctic Wolf", "Legendary", "950,000", "25,000", "fur, fangs"],
          ["Golden Eagle", "Legendary", "850,000", "25,000", "feathers, talons"],
        ],
      },
    },
    {
      heading: "Parts: what drops are worth",
      body: [
        "Instead of selling an animal whole, Store Parts breaks it down into materials — the animal is gone, and its parts land in your hunt inventory to be crafted with or sold on the Black Market. Legendary parts are where the real money hides: a single Komodo Dragon venom sac is worth more than a third of the whole animal's sell price, and you need those parts for the best recipes anyway.",
      ],
      table: {
        title: "Part values (sell / market baseline)",
        columns: ["Part", "Value", "Part", "Value"],
        rows: [
          ["Fur", "6,000", "Pelt", "25,000"],
          ["Meat", "5,000", "Fang", "22,000"],
          ["Feathers", "5,500", "Talons", "20,000"],
          ["Tail", "4,000", "Skin (python)", "80,000"],
          ["Venison", "18,000", "Teeth", "90,000"],
          ["Antlers", "22,000", "Claws", "100,000"],
          ["Hide", "15,000", "Scales", "300,000"],
          ["Tusk", "30,000", "Fangs (legendary)", "340,000"],
          ["—", "—", "Venom", "380,000"],
        ],
      },
      note: "Storing parts destroys the animal — it can no longer be zoo'd or sold whole. Decide what each catch is for before you hit the button.",
    },
    {
      heading: "Crafting: recipes & what they unlock",
      body: [
        "!hunt craft opens the workshop. Common and Uncommon recipes unlock automatically the first time you catch a contributing species; Rare and Legendary recipes stay hidden until you use a Rare Blueprint (500,000) or Legendary Blueprint (2,000,000) from the hunt shop, each of which unlocks one random recipe of its tier — and refunds itself if you already know them all.",
        "Every recipe costs parts plus coins, and the outputs are not trophies — they're buffs that reach into nearly every other system in Fortuna.",
      ],
      table: {
        title: "All 17 recipes",
        columns: ["Recipe", "Tier", "Coins", "Materials", "What it does"],
        rows: [
          ["Rabbit Foot Charm", "Common", "75,000", "3 rabbit fur, 2 rabbit meat", "+3 Luck for 2h"],
          ["Duck Feather Quill", "Common", "90,000", "5 duck feathers", "Next successful study +25 education XP"],
          ["Fox Tail Talisman", "Common", "150,000", "3 fox tail, 3 fox fur", "Next failed crime: 20% chance the fine is halved"],
          ["Wolf Fang Dagger", "Uncommon", "400,000", "4 wolf fang, 2 wolf pelt", "Next successful rob steals +10% more"],
          ["Deer Antler Crown", "Uncommon", "500,000", "4 deer antlers, 3 deer hide", "Cosmetic collectible, +4 profile luck"],
          ["Eagle Talon Gloves", "Uncommon", "650,000", "3 eagle talons, 4 eagle feathers", "Next hunt +8% Rare chance"],
          ["Black Bear War Vest", "Rare", "1,500,000", "3 bear pelt, 2 bear claws", "Next cockfight: your bird's combat score ×1.08"],
          ["Crocodile Hide Armor", "Rare", "1,750,000", "3 croc hide, 2 croc teeth", "Blocks one robbery against you (24h)"],
          ["Python Skin Cloak", "Rare", "1,250,000", "3 python skin", "Crime prep item: +7% crime payout"],
          ["Snow Leopard Mantle", "Rare", "2,000,000", "2 leopard pelt", "Cosmetic collectible, +8 profile luck"],
          ["White Tiger Crown", "Legendary", "7,500,000", "2 tiger pelt, 2 tiger fangs", "Cosmetic collectible, +18 profile luck"],
          ["Komodo Venom Flask", "Legendary", "5,000,000", "2 venom, 1 scales", "Use on @user: −20 Luck for 2h"],
          ["Komodo Scale Rifle Kit", "Legendary", "8,000,000", "3 scales, 2 golden eagle talons", "Next hunt +7% Legendary chance"],
          ["Arctic Wolf Spirit Charm", "Legendary", "6,000,000", "2 arctic fur, 2 arctic fangs", "+15 Luck for 6h"],
          ["Golden Eagle Crown", "Legendary", "6,500,000", "3 GE feathers, 2 GE talons", "Zoo income +10% for 7 days"],
          ["Apex Trophy Case", "Legendary", "15,000,000", "1 tiger fangs, 1 scales, 1 arctic fangs, 1 GE talons", "Endgame trophy, +25 profile luck"],
        ],
      },
      note: "\"Next X\" buffs hold for 3 days if unused, then expire. Six crafts double as crime prep gear: Fox Tail Talisman, Wolf Fang Dagger, Python Skin Cloak, Rabbit Foot Charm, Arctic Wolf Spirit Charm, and Komodo Venom Flask — see the Crime & Heat docs.",
    },
    {
      heading: "The zoo: passive income from your catches",
      body: [
        "Housing animals needs a zoo property from !properties — Mini Zoo (1,800,000) holds 5 species, City Zoo (15,000,000) holds 10, World Zoo (75,000,000) holds 16, and capacities stack if you own more than one. Capacity counts distinct species, not headcount: once a species has a slot, every extra copy of it is free income.",
        "Income runs per animal per hour by rarity — 500 for Common, 2,000 Uncommon, 8,000 Rare, 25,000 Legendary. It accrues for at most 24 hours, so collect at least daily via the !zoo Collect button (minimum 1 hour between collections). A crafted Golden Eagle Crown boosts all zoo income by 10% for a week.",
        "The math favors patience: a Legendary animal sells once for ~900,000 but earns 600,000 every single day on display. Anything Rare or better earns back its sell price in under two days — zoo first, sell never, unless you need cash today.",
      ],
    },
    {
      heading: "Selling parts on the Black Market",
      body: [
        "Animal parts have their own player-to-player market inside !market and the hunt inventory. You can run up to 5 active part listings at once, priced anywhere from 1,000 to 50,000,000, and they expire back to you after 7 days. Buyers pay your price +5%; you receive it −10% — price your Legendary parts above the flat part value, because crafters who need that last venom sac will pay for the convenience.",
      ],
    },
    {
      heading: "Getting better at hunting",
      body: [
        "Rush the Sniper Rifle. The Wooden Rifle's 8-hour cooldown means three hunts a day of pure Commons; the Sniper's 4-hour clock with a 15% Rare chance changes what a day of hunting is worth. The Legendary Rifle is the endgame — 2-hour cooldown, guaranteed 2+ rolls, and the only path to Legendary animals — but don't starve the rest of your economy for it.",
        "Build the zoo before you liquidate anything. Every animal you sell is one-time money; every animal housed is a pension. Fill your species slots first, then sell or dismantle the duplicates beyond what the zoo counts.",
        "Time your buffs. Camouflage Kit + a Legendary Rifle hunt is the highest-value single action in the module — Rare capped at 40% and Legendary at 20% for one hunt. Never burn a Camouflage Kit on a Wooden or Iron Rifle; those tiers can't roll Rare at all, so the buff does nothing.",
        "Craft with a purpose. Eagle Talon Gloves before a buffed hunt, Golden Eagle Crown when your zoo is full, War Vest before a big cockfight, Crocodile Hide Armor when your wallet is fat and robbers are circling. Buffs expire after 3 days unused — craft them when you're about to need them, not before.",
      ],
    },
  ],
  commandIds: ["hunt", "zoo", "shop", "market", "inventory", "properties", "iteminfo"],
  proTips: [
    "Buying a better rifle instantly clears your hunt cooldown — time upgrades for when your cooldown is longest to squeeze out a free hunt.",
    "Bait Box is wasted on the Legendary Rifle (which already rolls 2+) — it's an Iron Rifle tool. Camouflage Kit is wasted on anything below Sniper.",
    "A Rare animal earns its entire sell price back in about 40 hours of zoo time. Sell Commons, zoo everything Rare and above.",
    "Blueprints refund themselves if you've unlocked everything in their tier — there is zero risk in buying one whenever you have spare cash.",
    "Legendary parts (venom 380k, fangs 340k, scales 300k) out-earn most whole animals. If your zoo already houses that species, Store Parts beats Sell.",
  ],
};

export default huntingAndAnimals;
