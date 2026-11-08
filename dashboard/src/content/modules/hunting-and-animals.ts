import type { ModuleDoc } from "../types";

const huntingAndAnimals: ModuleDoc = {
  slug: "hunting-and-animals",
  title: "Hunting & Animals",
  tagline: "Four rifles, sixteen animals, sixteen recipes — the wilderness is an economy of its own.",
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
        "Every hunt uses the best rifle you own, automatically. The tier sets three things at once: how long the cooldown runs, how many rarity rolls you get per hunt, and which rarities are even possible. A Wooden Rifle's own odds only ever find Commons; the Legendary Rifle is the only gun with Legendary animals in its base odds.",
        "Rifles are permanent equipment — no durability, no re-buying. And upgrading is instant gratification: buying a strictly better rifle clears your active hunt cooldown on the spot, so the upgrade always pays off with an immediate hunt.",
      ],
      table: {
        title: "Rifle tiers (!shop hunt)",
        columns: ["Rifle", "Price", "Cooldown", "Rolls per hunt", "Common", "Uncommon", "Rare", "Legendary"],
        rows: [
          ["Wooden Rifle", "500,000", "8h", "1", "100%", "—", "—", "—"],
          ["Iron Rifle", "1,500,000", "6h", "1", "70%", "30%", "—", "—"],
          ["Sniper Rifle", "4,000,000", "4h", "1–2", "55%", "32%", "13%", "—"],
          ["Legendary Rifle", "12,000,000", "2h", "1–2", "55%", "32%", "11%", "2%"],
        ],
      },
      note: "Hunts always succeed — there is no miss, no jail risk, no heat. The only cost of hunting is the cooldown.",
    },
    {
      heading: "How a hunt resolves",
      body: [
        "Each hunt makes 1 or 2 rarity rolls depending on your rifle, and every roll brings back exactly one animal: it picks a rarity by the weights above, then a random species of that rarity. Wooden and Iron rifles always roll once; Sniper and Legendary rifles roll once or twice.",
        "Three shop consumables stack the deck for your next hunt, each lasting 24 hours or one hunt, whichever comes first. Echo Whistle (600,000) gives a 35% chance of one extra animal of the exact species of your best catch. Bait Box (750,000) guarantees at least 2 rolls — it doubles every Wooden or Iron hunt, but on a Sniper or Legendary Rifle it only changes the half of hunts that would have rolled once. Camouflage Kit (1,200,000) shifts the odds themselves: +8% Rare and +2% Legendary, both taken out of Common.",
        "The Hunter's Compass (2,250,000) is the permanent version: once per day, point it down a path for your next hunt — !use hunters compass risky for +6% Rare and +1% Legendary, or !use hunters compass safe for +15% Uncommon. It's equipment, never consumed, and stacks with the buffs above and with crafted hunt buffs — up to hard caps of 20% Rare and 5% Legendary per roll, whatever you stack.",
      ],
    },
    {
      heading: "The animal catalog",
      body: [
        "Sixteen species across four rarities. Every animal has a flat sell value, a daily zoo income while it's housed and fed, and a set of parts it can be broken into. One caught animal carries one of each of its parts.",
      ],
      table: {
        title: "All 16 animals",
        columns: ["Animal", "Rarity", "Sell value", "Zoo income/day (fed)", "Parts"],
        rows: [
          ["Rabbit", "Common", "20,000", "4,000", "meat, fur"],
          ["Squirrel", "Common", "16,000", "4,000", "fur"],
          ["Fox", "Common", "24,000", "4,000", "fur, tail"],
          ["Duck", "Common", "18,000", "4,000", "feathers, meat"],
          ["Deer", "Uncommon", "60,000", "16,000", "venison, antlers, hide"],
          ["Boar", "Uncommon", "65,000", "16,000", "tusk, meat"],
          ["Wolf", "Uncommon", "70,000", "16,000", "pelt, fang"],
          ["Eagle", "Uncommon", "75,000", "16,000", "feathers, talons"],
          ["Black Bear", "Rare", "280,000", "60,000", "pelt, claws"],
          ["Snow Leopard", "Rare", "320,000", "60,000", "pelt"],
          ["Crocodile", "Rare", "260,000", "60,000", "hide, teeth"],
          ["Python", "Rare", "240,000", "60,000", "skin"],
          ["White Tiger", "Legendary", "900,000", "200,000", "pelt, fangs"],
          ["Komodo Dragon", "Legendary", "1,000,000", "200,000", "scales, venom"],
          ["Arctic Wolf", "Legendary", "950,000", "200,000", "fur, fangs"],
          ["Golden Eagle", "Legendary", "850,000", "200,000", "feathers, talons"],
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
        title: "All 16 recipes",
        columns: ["Recipe", "Tier", "Coins", "Materials", "What it does"],
        rows: [
          ["Rabbit Foot Charm", "Common", "75,000", "3 rabbit fur, 2 rabbit meat", "+3 Luck for 2h"],
          ["Duck Feather Quill", "Common", "90,000", "5 duck feathers", "Next successful study +25 education XP"],
          ["Fox Tail Talisman", "Common", "150,000", "3 fox tail, 3 fox fur", "Next failed crime: 20% chance the fine is halved"],
          ["Wolf Fang Dagger", "Uncommon", "400,000", "4 wolf fang, 2 wolf pelt", "Next successful rob steals +10% more"],
          ["Deer Antler Crown", "Uncommon", "500,000", "4 deer antlers, 3 deer hide", "Cosmetic collectible, +4 profile luck"],
          ["Eagle Talon Gloves", "Uncommon", "650,000", "3 eagle talons, 4 eagle feathers", "Next hunt +6% Rare chance (within the 20% cap)"],
          ["Black Bear War Vest", "Rare", "1,500,000", "3 bear pelt, 2 bear claws", "Next cockfight: your bird's combat score ×1.08"],
          ["Crocodile Hide Armor", "Rare", "1,750,000", "3 croc hide, 2 croc teeth", "Blocks one robbery against you (24h)"],
          ["Python Skin Cloak", "Rare", "1,250,000", "3 python skin", "Crime prep item: +7% crime payout"],
          ["Snow Leopard Mantle", "Rare", "2,000,000", "2 leopard pelt", "Cosmetic collectible, +8 profile luck"],
          ["White Tiger Crown", "Legendary", "7,500,000", "2 tiger pelt, 2 tiger fangs", "Cosmetic collectible, +18 profile luck"],
          ["Komodo Venom Flask", "Legendary", "5,000,000", "2 venom, 1 scales", "Use on @user: −20 Luck for 2h"],
          ["Komodo Scale Rifle Kit", "Legendary", "8,000,000", "3 scales, 2 golden eagle talons", "Next hunt +2% Legendary chance (within the 5% cap)"],
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
        "Housing animals needs a zoo from !properties, and you only ever hold one: Mini Zoo (800,000), City Zoo (5,000,000), or World Zoo (18,000,000) at base price — zoo deeds follow the same +5%-per-sale pricing as regular property. Buying a bigger zoo replaces the old one with no refund, and your animals move across automatically; you can't buy a zoo the same size or smaller than the one you have.",
        "Three limits apply together: a cap on distinct species, a rarity mix those species must fit, and a per-species stack — up to 4 copies of a Common species, 3 of an Uncommon or a Rare, and a single copy of a Legendary. Only the World Zoo can house a Legendary.",
      ],
      table: {
        title: "Zoo tiers (fully stocked)",
        columns: ["Zoo", "Base price", "Species (C / U / R / L)", "Max animals", "Gross/day", "Feed/day", "Net/day"],
        rows: [
          ["Mini Zoo", "800,000", "5 (3 / 2 / 0 / 0)", "18", "144,000", "54,000", "90,000"],
          ["City Zoo", "5,000,000", "10 (4 / 4 / 2 / 0)", "34", "616,000", "228,000", "388,000"],
          ["World Zoo", "18,000,000", "14 (4 / 4 / 4 / 2)", "42", "1,376,000", "510,000", "866,000"],
        ],
      },
      note: "A fully stocked World Zoo is 16 Commons, 12 Uncommons, 12 Rares, and 2 Legendaries.",
    },
    {
      heading: "Feeding: the daily upkeep",
      body: [
        "A housed animal earns only while it's fed, and it's paid once per 24 hours when you press Collect on !zoo (or run !collect-rent, which pays rent and zoo together). Feeding takes one unit of the right feed from the shop per animal per day — spend it with !zoo feed <animal> or the Feed All button on !zoo. Feeding a full animal costs nothing; only hungry ones eat.",
        "A fresh catch arrives with one free fed day. When its feed runs out, an animal goes hungry — it earns nothing, but it costs nothing either — and an animal left hungry for 72 hours dies: gone, with no sell value and no parts. That clock runs everywhere, including your inventory, where animals can't be fed at all. An unhoused catch has 4 days (its free day plus 72 hours) to be housed, sold, or broken into parts, and selling your zoo turns every animal out onto the same clock.",
        "A crafted Golden Eagle Crown adds 10% to your zoo payout for a week.",
      ],
      table: {
        title: "Zoo economics per animal",
        columns: ["Rarity", "Income/day (fed)", "Feed", "Feed/day", "Net/day", "Max copies per species"],
        rows: [
          ["Common", "4,000", "Feed Sack", "1,500", "2,500", "4"],
          ["Uncommon", "16,000", "Game Feed", "6,000", "10,000", "3"],
          ["Rare", "60,000", "Prime Cuts", "22,000", "38,000", "3"],
          ["Legendary", "200,000", "Exotic Ration", "75,000", "125,000", "1"],
        ],
      },
      note: "Fed and housed, every animal earns back its own sell value in 6–10 days of net income — a Fox in about 10, a Komodo Dragon in 8 — and keeps paying after that. Zoo first, sell only what doesn't fit.",
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
        "Every rifle is worth firing now. Commons sell for 16,000–24,000, so even the Wooden Rifle's three single-Common hunts a day are real money — it pays back its 500,000 in about nine days of sell value alone. The Iron Rifle adds Uncommons (the second half of a Mini Zoo); the Sniper's 4-hour clock, second roll, and 13% Rare chance are what a City Zoo needs. The Legendary Rifle is the endgame — 2-hour cooldown and the only rifle with Legendaries in its base odds, at 2% a roll — but don't starve the rest of your economy for it.",
        "Start with a Mini Zoo. 800,000 for 90,000 a day net once its 12 Commons and 6 Uncommons are housed is about a 9-day payback — the best yield per coin of any deed in Fortuna. Climb to City and World as your rifles start bringing back Rares, and remember the upgrade replaces the old zoo with no refund.",
        "Fill the stacks, sell the overflow. Every animal you sell is one-time money; every animal housed and fed pays its sell value back within about ten days and keeps going. But a species that's at its stack limit (4 Common, 3 Uncommon or Rare, 1 Legendary) has no room for more, and an extra copy in your inventory dies 4 days after the catch — sell or part those the day you catch them.",
        "Feed before you collect. The payout counts only animals that are fed at the moment you press Collect, so the daily rhythm is Feed All, then Collect. Skipping a day costs that day's income; skipping three days kills the animal.",
        "Hunt buffs are for chasing a slot, not for profit. A hunt brings back one or two animals, so a Camouflage Kit adds under 60,000 of expected sell value to a Legendary Rifle hunt — for 1,200,000. Buy hunt consumables only when you're hunting a missing Rare or Legendary zoo slot, where the animal is worth 38,000–125,000 a day to you. And mind the caps: Camouflage Kit + a risky Compass already put a Legendary Rifle at the 20% Rare and 5% Legendary ceilings, so Eagle Talon Gloves or a Komodo Scale Rifle Kit on top of both are wasted.",
        "Craft with a purpose, and price it honestly. War Vest before a big cockfight, Crocodile Hide Armor when your wallet is fat and robbers are circling. The Golden Eagle Crown's +10% on a full World Zoo is about 137,600 a day — under 1,000,000 over its week, against a 6,500,000 craft fee plus parts — so it's a trophy, not an investment. Buffs expire after 3 days unused — craft them when you're about to need them, not before.",
      ],
    },
  ],
  commandIds: ["hunt", "zoo", "shop", "market", "inventory", "properties", "iteminfo"],
  proTips: [
    "Buying a better rifle instantly clears your hunt cooldown — time upgrades for when your cooldown is longest to squeeze out a free hunt.",
    "Bait Box doubles a Wooden or Iron hunt every time (those rifles always roll once); on a Sniper or Legendary Rifle it only helps the hunts that would have rolled once.",
    "A fed Rare nets 38,000 a day after its Prime Cuts and earns its whole sell price back in about a week. Zoo first, up to each species' stack limit — sell the rest before the 4-day clock runs out.",
    "Blueprints refund themselves if you've unlocked everything in their tier — there is zero risk in buying one whenever you have spare cash.",
    "Legendary parts (venom 380k, fangs 340k, scales 300k) out-earn most whole animals — but a whole Legendary always sells for more than its parts. Store Parts when you need them for a recipe or can list them on the Black Market above their flat value; otherwise, Sell.",
  ],
};

export default huntingAndAnimals;
