import type { ModuleDoc } from "../types";

const chickensAndCockfights: ModuleDoc = {
  slug: "chickens-and-cockfights",
  title: "Chickens & Cockfights",
  tagline: "One bird, three stats, winner takes the whole pot — and losing can be fatal.",
  icon: "Swords",
  forBeginners: {
    what: "Buy a 25,000-coin chicken with a random trait, raise its Strength, Agility, and Defense through training and feed, arm it with equipment, then challenge other players' birds. The winner's owner takes both entry bets plus every side bet in the room. The loser's bird gets injured — or dies.",
    firstCommands: ["!shop cock", "!chicken", "!cockfight @user 10000"],
    tip: "You can only ever hold one chicken, and it can't be sold or traded. Its trait is rolled at purchase and permanent — a bad roll is worth knowing about early.",
  },
  sections: [
    {
      heading: "Your chicken",
      body: [
        "The Chicken sells in the shop's COCK tab for 25,000 — limit one per player, non-sellable, non-tradable. It starts at level 0 with 0 in every stat and a random permanent trait. !chicken is the dashboard: level, XP bar, win count, stats with trait and equipment bonuses, and an estimated win chance against level 0, 5, and 10 opponents.",
        "!chicken name <name> renames it (30 characters max), and !chicken top shows the global leaderboard by level. XP to reach the next level is (level + 1) × 100, and every cockfight win pays +50 XP on top of what you feed it.",
      ],
      table: {
        title: "Traits (rolled at purchase, permanent)",
        columns: ["Trait", "Strength", "Agility", "Defense"],
        rows: [
          ["Aggressive", "+2", "0", "−1"],
          ["Tank", "0", "−1", "+2"],
          ["Speedster", "−1", "+2", "0"],
          ["Balanced", "+1", "+1", "+1"],
          ["Fierce", "+3", "0", "−2"],
        ],
      },
      note: "Strength is worth 5 combat points per point; Agility and Defense are worth 3 each. Fierce's +3 STR is the best net trait (+9 combat), Balanced is +11 but spread thin — see the combat math below for why STR-heavy traits win.",
    },
    {
      heading: "Training & feeding",
      body: [
        "!chicken train <strength|agility|defense> buys a permanent +1 to that stat. Cost scales with level — 500 × (1 + level × 0.5) — and the session takes max(2, level) minutes to finish. You can pay 50% of the training cost again to halve the remaining time, or cancel for a consolation +10 XP. A Training Whistle (120,000) finishes any session instantly.",
        "Feed is pure XP, used through !feed or !use, with shorthand and batching: !use protein 3 feeds three Protein Feeds at once. The hard limit is 5 feeds per day across all feed types, resetting at midnight — so the ceiling on bought XP is 600/day with Champion Feed.",
      ],
      table: {
        title: "Feed & care items (!shop cock)",
        columns: ["Item", "Price", "Effect"],
        rows: [
          ["Basic Feed", "10,000", "+10 XP (shorthand: basic)"],
          ["Protein Feed", "45,000", "+35 XP (shorthand: protein)"],
          ["Champion Feed", "500,000", "+120 XP (shorthand: champion)"],
          ["Agility Vitamins", "60,000", "+1 to a random stat below 10 (stats cap at 10 this way)"],
          ["Feather Bandage", "75,000", "Instantly heals an injury (not a critical state)"],
          ["Training Whistle", "120,000", "Instantly completes active training"],
          ["Phoenix Serum", "900,000", "Saves a dying chicken + heals + finishes training (24h cooldown)"],
        ],
      },
    },
    {
      heading: "Equipment",
      body: [
        "Three slots — weapon, armor, accessory — filled with !equip <item>. The shop's COCK tab sells the two staples: Iron Spurs (300,000, weapon, +3 STR) and Guard Vest (350,000, armor, +4 DEF). The Guard Vest earns its price twice over: beyond the stats, it gives a 50% chance to save all your equipment when your bird loses a fight — normally a loss destroys everything it's wearing.",
        "From the hunting workshop, the Black Bear War Vest craft (3 bear pelts, 2 bear claws, 1,500,000) multiplies your bird's entire combat score by 1.08 for its next fight — the single biggest edge you can buy, consumed on use.",
      ],
    },
    {
      heading: "Cockfight: how combat actually works",
      body: [
        "!cockfight @user <bet> challenges another player, 10,000 minimum to 1,000,000 maximum, wallet only. They get 30 seconds to accept; both birds must be healthy — no fighting while injured, training, or critical. Both players' bets go into the pot, then a 60-second side-betting window opens for spectators (one bet each, 10k–1M, fighters can't bet).",
        "The fight itself is one probability roll, not the animation you watch. Each bird's combat score = (100 + level × 10) + STR × 5 + DEF × 3 + AGI × 3, after traits and equipment. Your win chance is simply yourScore ÷ (yourScore + theirScore). A level-5 bird with maxed stats roughly doubles a fresh bird's score.",
        "Payouts: the winning owner takes the ENTIRE pot — both entry bets plus every side bet, winning and losing ones alike. Side bettors who called it right get 1.5× their stake back (a +50% profit); wrong side bettors lose everything to the winner. Both fighters then go on a 45-minute cockfight cooldown.",
      ],
      note: "Combat weights make Strength king: one point of STR is 5 combat points versus 3 for AGI/DEF. When training, STR gives the most win probability per coin.",
    },
    {
      heading: "Losing: injury, critical, and death",
      body: [
        "The losing bird always pays a price. Normally it's an injury — recovery takes 2 hours plus 20 minutes per level the winner had, plus 5 minutes per point of the winner's total stats, capped at 12 hours. Injured birds can't fight or train until healed: pay the clinic (50,000 per 2 hours of remaining recovery, via the !chicken Heal button) or use a Feather Bandage. All equipped items are destroyed on a loss unless a Guard Vest saves them (50%).",
        "It can be worse. There's a death roll on every loss: 5% base + 2% per level the winner is above you, capped at 50%. Losing to a bird whose total stats triple yours is an automatic critical. A critical chicken has 24 hours to live — only a Phoenix Serum (900,000) can save it. If the timer runs out, the chicken dies permanently and you start over from the shop.",
      ],
      note: "Never fight far above your weight class. The death chance and the recovery time both scale with the gap — an underdog win pays the same pot, but an underdog loss can cost you the bird.",
    },
    {
      heading: "Getting better at cockfighting",
      body: [
        "Level before you fight. Levels feed the combat score directly (+10 per level) and your first fights decide whether you're the one inflicting 50% death rolls or eating them. Five Champion Feeds a day plus cheap early training (500 coins at level 0) builds a monster fast.",
        "Train Strength first — 5 combat points per coin-equivalent versus 3 for the other stats — then Defense once you're fighting regularly, because recovery time scales with the winner's stats and DEF keeps you out of critical range.",
        "Stack the fight, not the hope: Iron Spurs + Guard Vest + a Black Bear War Vest (×1.08) before a big-money match is nearly 25 combat points and insurance on your gear. Against an equal bird, that's the difference between a coin flip and a favorite.",
        "Side bets are the quiet money. A 1.5× payout for reading two stat sheets — !chicken shows estimated win rates — is better expected value than most casino tables, and your own bird risks nothing.",
      ],
    },
  ],
  commandIds: ["chicken", "cockfight", "feed", "equip", "shop", "use"],
  proTips: [
    "The 5-feeds-per-day cap is the real bottleneck on growth — never end a day with feeds unused if you're building a fighter.",
    "Guard Vest before Iron Spurs if you can only afford one: +4 DEF plus a 50% chance to keep all your gear on a loss beats +3 STR.",
    "A critical chicken is a 24-hour countdown, not a death sentence — but Phoenix Serum has its own 24h cooldown, so you can't save two disasters in a row.",
    "Winner takes ALL side bets too. A hyped fight with heavy spectator betting pays the winner several times the entry stake — invite a crowd.",
    "Fight opponents at or slightly below your level. The pot is the same; the death roll isn't.",
  ],
};

export default chickensAndCockfights;
