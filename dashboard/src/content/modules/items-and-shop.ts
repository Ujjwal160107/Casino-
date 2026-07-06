import type { ModuleDoc } from "../types";

const itemsAndShop: ModuleDoc = {
  slug: "items-and-shop",
  title: "Items & Shop",
  tagline: "Six categories, two ways to pay, and a black market for whatever the shop won't buy back.",
  icon: "ShoppingBag",
  forBeginners: {
    what: "The shop doesn't just sell decoration — it sells tools that change the rules underneath you. Some protect your wallet from a rob, some boost a payout, some just look good on your profile.",
    firstCommands: ["!shop", "!inventory", "!iteminfo padlock"],
    tip: "!shop buy card <item> puts the purchase on your Fortuna Card instead of your wallet.",
  },
  screenshot: {
    src: "/screenshots/docs-items-and-shop.png",
    alt: "Items & Shop in Discord",
  },
  sections: [
    {
      heading: "The shop",
      body: [
        "!shop opens the full storefront, split into six categories: GENERAL, HUNT, JOB, UNI, COCK, and COSMETICS. Browse by category or jump straight to buying with !shop buy <item>, which charges your wallet.",
        "Don't have the cash on hand? !shop buy card <item> runs the same purchase through your Fortuna Card instead, with a confirm button before it commits. Changed your mind after buying, !shop sell <item> sells it back.",
      ],
    },
    {
      heading: "Your inventory",
      body: [
        "!inventory lists everything you own, filterable by the same categories as the shop — ALL, HUNT, JOB, UNI, COCK. Consumables get burned with !use <item>, which also handles targeted effects like !use Soul Ledger @user and feed shorthands like protein or champion.",
        "Gear for your fighting chicken goes through !equip <item> instead — weapon, armor, and accessory each get their own slot, and equipping a new item shows you what it replaced. Before you buy anything, !iteminfo <item> pulls the full spec sheet: price and effect, no surprises after.",
      ],
    },
    {
      heading: "Items that matter",
      body: [
        "A handful of items reach past their category and into the game's core math. Padlock strengthens your defense against !rob, while Thief Gloves and Eclipse Mask push the odds the other way when you're the one robbing. Lucky Coin nudges your luck on income grinds and coinflip; Crown of Greed adjusts stakes and payouts across multiple systems; Counterfeit Kit and Devil Contract both touch your !daily multiplier; Soul Ledger has its own targeted interplay with the casino. A transfer-tax shield item exists too, softening the bite on !transfer.",
      ],
      note: "Spotted in the wild — exact numbers live in !iteminfo. This page won't guess at math the bot can tell you directly.",
    },
    {
      heading: "The Black Market",
      body: [
        "!market is Fortuna's player-to-player trading floor — list something you own, browse what others are selling, or check your own active listings, all wallet-only with no credit involved.",
        "Selling costs a 10% fee and buying costs a 5% fee on top of the sticker price, so price accordingly. Listings expire after 7 days if nobody bites, and you can only run 5 of them at once — clear old ones before you list something new.",
      ],
    },
  ],
  commandIds: ["shop", "inventory", "use", "equip", "iteminfo", "market"],
  proTips: [
    "Check !iteminfo before you buy anything from HUNT or COSMETICS you don't recognize — the description tells you exactly what it does, no guessing required.",
    "!shop buy card keeps wallet cash free for the casino, but every Fortune spent this way sits on your statement until you pay it down.",
    "List early on the Black Market — a 7-day expiry means a slow sale is a wasted slot, and you're capped at 5 at a time.",
  ],
};

export default itemsAndShop;
