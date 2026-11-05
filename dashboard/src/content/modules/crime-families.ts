import type { ModuleDoc } from "../types";

// Numbers come from CRIME_FAMILY_CONFIG (src/utils/economyConfig.ts) and
// src/data/crimeFamilyCatalog.ts; the expected-value tables are pinned by
// test/crimeFamily/caper-math.test.ts. Turf adds its own sections when it
// ships; rows that depend on it are marked "with Turf".
const crimeFamilies: ModuleDoc = {
  slug: "crime-families",
  title: "Crime Families",
  tagline: "A crew of up to 12 players with ranks, a vault nobody can rob, ten family levels to buy, and capers you can only pull off together.",
  icon: "Users",
  forBeginners: {
    what: "A crime family is a crew of 6 to 12 players. Members pay into a shared vault, the vault pays the family's dues and level fees, and once a week the earned part of the vault is split between the members who played. Deposits never come back out: the vault is for the family, not for parking cash.",
    firstCommands: ["!crew", "!caper"],
    tip: "You don't need to found a family to play. Joining needs 1,000,000 net worth and 20 shifts; founding needs 15,000,000, 60 shifts and 10,000,000 to burn. Get invited first.",
  },
  screenshot: {
    src: "/art/cf-caper-t4.png",
    alt: "The Diamond Exchange Vault, the Tier 4 caper",
    caption: "Diamond Exchange Vault",
    aspect: "aspect-[960/336]",
  },
  sections: [
    {
      heading: "What a family is",
      body: [
        "Families are global. Your family, its vault and its dashboard follow you to every server the bot is in, and you can only be in one family at a time.",
        "!crew opens your family dashboard: crest, level, XP, members, vault balances and the buttons your rank allows. With no family it shows the Create card instead. Every family also has a home channel, set where it was founded and moved with !crew home, where payday cards and chair notices are posted.",
        "Viewing works in jail. Anything that moves money or members (deposit, invite, accept) checks jail when you press it.",
      ],
    },
    {
      heading: "Founding a family",
      body: [
        "!crew create (or the Create button) opens a form for the name and tag, then a confirm card. Confirm burns the fee from your wallet and makes you the Boss. The fee is a sink, not an investment: founding pays nothing that membership doesn't.",
      ],
      table: {
        title: "Requirements to found",
        columns: ["Requirement", "Value"],
        rows: [
          ["Fee (from wallet, burned)", "10,000,000"],
          ["Net worth", "15,000,000 or more"],
          ["Lifetime shifts", "60 or more"],
          ["Fortuna profile age", "30 days or more"],
          ["Discord account age", "180 days or more"],
          ["Heat", "below 70"],
          ["Jail / ban", "not jailed, not banned"],
          ["Family", "not already in one"],
          ["Hop cooldown", "clear (see Hop cooldowns)"],
          ["After disbanding as Boss", "7 days before founding again"],
        ],
      },
    },
    {
      heading: "Names and tags",
      body: [
        "Names and tags are unique across the whole bot, compared without case. Spaces at the ends are trimmed and a lowercase tag is uppercased for you, so \"vla\" becomes VLA.",
        "The blocked words are matched anywhere inside the name or tag after stripping everything but letters and digits, so \"Badminton Club\" (admin), \"Model Citizens\" (mod) and \"Where Eagles Dare\" (here) are refused too. \"Street\" is reserved for the city's unowned turf.",
      ],
      table: {
        title: "Name rules",
        columns: ["Field", "Rule"],
        rows: [
          ["Name", "3–24 characters: letters, digits, spaces, ' and -; starts and ends with a letter or digit; no double spaces"],
          ["Tag", "2–4 characters, A–Z and 0–9 only"],
          ["Blocked words", "fortuna, admin, staff, mod, discord, police, cops, street, everyone, here, and slurs"],
          ["Rename", "Boss only, 2,000,000 from the vault, once per 30 days; the tag can never change"],
        ],
      },
    },
    {
      heading: "Ranks and permissions",
      body: [
        "Every family has one Boss, at most one Underboss, at most three Capos and any number of Soldiers. A member who joined less than 72 hours ago shows as an Associate: they can view and deposit but can't take a caper seat or act in a war yet. The Boss is never an Associate.",
        "!crew promote and !crew demote move a member one rank at a time, and only to a rank below your own. The chair itself moves only by !crew handover, a claim, or the automatic handover. Your rank is re-read on every press, so an old button never carries a rank you've since lost.",
      ],
      table: {
        title: "Who can do what",
        columns: ["Action", "Boss", "Underboss", "Capo", "Soldier", "Associate"],
        rows: [
          ["View dashboard, log, leaderboard", "yes", "yes", "yes", "yes", "yes"],
          ["Deposit", "yes", "yes", "yes", "yes", "yes"],
          ["Invite", "yes", "yes", "yes", "no", "no"],
          ["Kick", "anyone", "Capo and below", "Soldier only", "no", "no"],
          ["Promote / demote", "up to Underboss", "up to Capo", "no", "no", "no"],
          ["Hand over the chair", "yes", "no", "no", "no", "no"],
          ["Plan a caper", "yes", "yes", "yes", "no", "no"],
          ["Take a caper seat", "yes", "yes", "yes", "yes", "no"],
          ["Payday, level up, bid (bid with Turf)", "yes", "yes", "no", "no", "no"],
          ["Scout and hit in a war (with Turf)", "yes", "yes", "yes", "yes", "no"],
          ["Home channel, rename, disband", "yes", "no", "no", "no", "no"],
          ["Claim the chair from an inactive Boss", "no", "after 7 days", "no", "no", "no"],
        ],
      },
    },
    {
      heading: "Joining a family",
      body: [
        "A Capo or higher runs !crew invite <user> with a mention, an ID or an exact username. The invite card pings only you and you get a DM. Press Accept on the card, or type !crew accept <TAG> from any server; !crew decline <TAG> turns it down. An invite lasts 24 hours.",
        "Invites are capped so nobody can stuff a family with alts: at most 5 pending invites per family, at most 3 accepted invites per inviter in any 7 days, and at most 5 new members per family in any 7 days. You can't invite yourself, a bot, someone already in your family or someone in another family.",
        "Accepting checks the join gates below and takes the lowest free seat. If the family is full you get \"Family is full\" and the invite stays open until it expires.",
      ],
      table: {
        title: "Join gates and member caps",
        columns: ["Gate", "Value"],
        rows: [
          ["Discord account age", "90 days or more"],
          ["Fortuna profile age", "14 days or more"],
          ["Net worth", "1,000,000 or more"],
          ["Lifetime shifts", "20 or more"],
          ["Jail / ban", "not jailed, not banned"],
          ["Hop cooldown", "clear"],
          ["Same family again", "14 days after you left or were kicked"],
          ["Member cap", "6 at L1, 7 at L2, 8 at L3–4, 10 at L5–6, 12 at L7–10"],
        ],
      },
    },
    {
      heading: "Leaving, kicks and hop cooldowns",
      body: [
        "!crew leave and !crew kick <user> both go through a confirm card. A Boss can't leave while other members remain: hand the chair over first. A Boss who is the only member is told to use !crew disband instead. Leaving also cancels any pending invites you sent.",
        "Your last exit sets a cooldown before you can join or found again:",
      ],
      table: {
        title: "Hop cooldowns",
        columns: ["Last exit", "Before joining any family", "Before founding", "Before rejoining the same family"],
        rows: [
          ["Left", "72 hours", "72 hours", "14 days"],
          ["Kicked", "24 hours", "24 hours", "14 days"],
          ["Disbanded, as a member", "24 hours", "24 hours", "family is gone"],
          ["Disbanded, as the Boss", "24 hours", "7 days", "family is gone"],
        ],
      },
    },
    {
      heading: "The vault: two buckets",
      body: [
        "The vault holds two balances. Treasury is what members deposit; it is locked for good and can never reach a wallet, not even on disband. Earnings is what the family's play earns; it is the only money Payday can pay out.",
        "Every spend takes earnings first and only dips into treasury for what earnings can't cover. A rich member's deposit can never pay a fee that earnings would have paid, so money can't be laundered through the vault.",
        "The vault is not part of anyone's net worth, isn't on any leaderboard, and can't be robbed or raided.",
      ],
      table: {
        title: "Treasury and earnings",
        columns: ["Bucket", "Filled by", "Spent on", "Reaches a wallet?"],
        rows: [
          ["Treasury", "Member deposits, after the 5% tax", "Dues, level fees, rename, only after earnings is empty", "Never. Burned on disband."],
          ["Earnings", "10% of every caper pool, racket income and refunded bids (with Turf)", "Dues, level fees, rename (first); racket bids (only from earnings, with Turf); Payday", "Only through Payday"],
        ],
      },
    },
    {
      heading: "Deposits",
      body: [
        "!crew deposit <amount> or the Deposit button moves wallet money into the treasury. Amounts take the usual shorthand: 250k, 5m, 2.5k or 1,000,000. \"all\", \"max\" and \"allin\" deposit your whole wallet or whatever is left of today's cap, whichever is smaller, so a 40,000,000 wallet deposits 25,000,000.",
        "Deposits give no XP: money can't buy levels, only fees once the XP is earned.",
      ],
      table: {
        title: "Deposit rules",
        columns: ["Rule", "Value"],
        rows: [
          ["Who", "Any member who isn't jailed"],
          ["Source", "Wallet only (no bank, no card)"],
          ["Minimum", "10,000"],
          ["Daily cap", "25,000,000 per member per UTC day"],
          ["Tax", "5%, burned (Tax Shield never applies)"],
          ["Credited", "Treasury gets the amount minus the tax"],
          ["XP", "0"],
        ],
      },
    },
    {
      heading: "Dues and arrears",
      body: [
        "Once per UTC day the vault pays dues of 40,000 × the family level, earnings first. When the vault can't cover it, the family falls a day into arrears instead, and the Boss and Underboss get a DM on the first missed day. The dashboard shows how many days are owed; !crew vault shows the exact amount.",
        "While dues are in arrears the family can't level up or bid on turf. Capers, joining, deposits, Payday and wars carry on. Every deposit and every earnings credit retries the arrears in full and clears them if the vault can pay.",
      ],
      table: {
        title: "What the vault pays for",
        columns: ["Spend", "Amount", "When"],
        rows: [
          ["Daily dues", "40,000 × level (40,000 at L1, 400,000 at L10)", "Once per UTC day, automatically"],
          ["Level-up fee", "2,000,000 → 50,000,000 (see Levels)", "Boss or Underboss presses Level up"],
          ["Rename", "2,000,000", "Boss, once per 30 days"],
          ["Racket bid escrow (with Turf)", "From earnings only", "Refunded if outbid, burned when the war settles"],
        ],
      },
    },
    {
      heading: "Payday",
      body: [
        "Payday is the only way money leaves the vault for a wallet. The Boss or Underboss opens !crew payday to see a preview: every eligible member with their gross, tax and net, and every ineligible member with the reason. Confirm pays them all at once.",
        "The split is equal: gross = the lower of earnings ÷ eligible members (rounded down) and 1,000,000. Each share is taxed 5%, so the most anyone takes home is 950,000 a week. Whatever the cap leaves behind stays in earnings for next week or for level fees.",
        "If nobody presses Payday within 24 hours of it falling due (8 days after the last one) and earnings are at least 500,000, the bot pays it automatically with the same rules. Paid members get a DM; members who missed out get a DM naming the gate they missed.",
      ],
      table: {
        title: "Payday rules",
        columns: ["Rule", "Value"],
        rows: [
          ["Who presses", "Boss or Underboss; automatic 24 hours after it falls due"],
          ["How often", "Once per 7 days; the first one 7 days after founding"],
          ["Earnings needed", "500,000 or more"],
          ["Cap per member", "1,000,000 gross (950,000 net) per payday"],
          ["Tax", "5% of each share, burned"],
          ["Tenure", "In the family 7 days or more"],
          ["Active member", "2 started caper seats or 3 correct war hits (with Turf) in the last 7 days"],
          ["Account", "20 shifts, Discord 90 days, Fortuna 14 days, not banned; jail does not block payday"],
        ],
      },
      note: "Being active is the gate most members miss. A member who sat in fewer than 2 started capers in the last 7 days gets nothing from this Payday.",
    },
    {
      heading: "Levels",
      body: [
        "A level needs both its XP and its fee. XP is cumulative and never spent; the fee comes from the vault, earnings first, and is burned. Only the Boss or Underboss can level up, and not while dues are in arrears. The full climb from L2 to L10 costs 172,000,000 in fees.",
        "Levels give capacity, unlocks, faster family cooldowns and a better crest. No level ever multiplies income, raises a payout or cuts a stake.",
      ],
      table: {
        title: "Family levels",
        columns: ["Level", "XP to reach", "Fee", "Members", "Rackets (with Turf)", "Caper tier unlocked", "Family caper cooldown", "Crest"],
        rows: [
          ["1", "0", "—", "6", "1", "Tier 1", "3h00", "Bronze"],
          ["2", "1,000", "2,000,000", "7", "1", "—", "3h00", "Bronze"],
          ["3", "3,000", "4,000,000", "8", "1", "Tier 2", "3h00", "Bronze"],
          ["4", "6,000", "6,000,000", "8", "2", "—", "2h45", "Silver"],
          ["5", "10,000", "10,000,000", "10", "2", "Tier 3", "2h45", "Silver"],
          ["6", "16,000", "14,000,000", "10", "2", "—", "2h30", "Silver"],
          ["7", "24,000", "20,000,000", "12", "3", "—", "2h30", "Gold"],
          ["8", "34,000", "28,000,000", "12", "3", "Tier 4", "2h30", "Gold"],
          ["9", "46,000", "38,000,000", "12", "3", "—", "2h00", "Gold"],
          ["10", "60,000", "50,000,000", "12", "3", "—", "2h00", "Crowned gold"],
        ],
      },
    },
    {
      heading: "Earning XP",
      body: [
        "Family XP comes only from playing together. Money moved in or out of the vault never earns any.",
      ],
      table: {
        title: "XP sources",
        columns: ["Source", "XP"],
        rows: [
          ["Caper, Clean / Messy / Bust", "Tier 1 150/60/20, Tier 2 225/90/30, Tier 3 300/120/40, Tier 4 375/150/50"],
          ["Racket cycle paid (with Turf)", "20 per cycle, none on a neglected cycle"],
          ["Correct war hit (with Turf)", "5"],
          ["War won (with Turf)", "300 × 1 / 1.5 / 2 for a Corner / District / Crown racket"],
          ["Deposits, Payday", "0"],
        ],
      },
    },
    {
      heading: "Capers: the family heist",
      body: [
        "A caper is a heist the family runs together in one server. A Capo or higher plans it with !caper, and a lobby card posts in the channel. For 10 minutes members pick a role from the \"Join as…\" select or type !caper join <role>; every seat pays its stake when it sits down. Once the required roles are filled the planner presses Start, or the caper starts by itself the moment every seat up to the tier's maximum is taken.",
        "Then comes the GO: 120 seconds in which each member opens their own brief and answers one question. Nobody holds their own answer. Each brief shows the answer to a crewmate's question, so the crew has to talk it through in the channel. The number of wrong or missing answers decides whether the job is Clean, Messy or a Bust.",
        "Capers are the family's main income. Every caper puts 10% of its pool into the vault's earnings and gives the family XP, and 2 started seats in 7 days is what makes a member active for Payday.",
      ],
      table: {
        title: "The four tiers",
        columns: ["", "Tier 1", "Tier 2", "Tier 3", "Tier 4"],
        rows: [
          ["Name", "Pawnshop Back Room", "Payroll Van", "Racetrack Cashier Cage", "Diamond Exchange Vault"],
          ["Family level to plan", "1", "3", "5", "8"],
          ["Crew size", "3–4", "4–5", "5–6", "5–6"],
          ["Required roles", "Mastermind, Lookout, Safecracker", "+ Driver", "+ Muscle", "Mastermind, Lookout, Safecracker, Driver, Muscle"],
          ["Optional role", "Driver", "Muscle", "Hacker", "Hacker"],
          ["Pool per seat", "350,000", "550,000", "850,000", "1,200,000"],
          ["Stake per seat (burned at Start)", "50,000", "100,000", "175,000", "300,000"],
          ["Bust fine per seat", "150,000", "300,000", "500,000", "750,000"],
          ["Jail on a Bust (per seat)", "none", "20% chance, 20 minutes", "35% chance, 45 minutes", "50% chance, 60 minutes"],
          ["Heat added Clean / Messy / Bust", "20 / 30 / 40", "25 / 35 / 45", "30 / 40 / 50", "40 / 50 / 60"],
          ["Heat to join and at Start", "below 70", "below 60", "below 50", "below 40"],
          ["Patrol chance (a perfect run turns Messy)", "10%", "15%", "20%", "25%"],
          ["Lifetime shifts", "20 or more", "60 or more", "150 or more", "300 or more"],
          ["Fortuna profile age", "14 days or more", "30 days or more", "30 days or more", "45 days or more"],
          ["Net worth", "2,000,000 or more", "8,000,000 or more", "20,000,000 or more", "40,000,000 or more"],
          ["Discord account age / time in the family", "90 days / 72 hours", "90 days / 72 hours", "90 days / 72 hours", "90 days / 72 hours"],
          ["Family XP Clean / Messy / Bust", "150 / 60 / 20", "225 / 90 / 30", "300 / 120 / 40", "375 / 150 / 50"],
        ],
      },
    },
    {
      heading: "Roles and prep items",
      body: [
        "Every seat is a role, and every role needs at least one of its prep items in your inventory. Items are only checked, never used up: a caper never takes an item from you. Ten of the items are shop consumables, though, and if you use one elsewhere after joining you fail the re-check at Start and lose the seat (your stake comes back).",
        "The planner always takes the Mastermind seat. Every role has at least one item that is not a consumable, so you never need to rebuy gear for a seat.",
        "Your best owned item for the role sets your seat's bonus at Start. The crew edge is the average bonus over the filled seats, and it lowers the patrol chance (see Outcome math). The weakest items give an edge of 0.0733 (3 seats) to 0.08 (6 seats); the best items give 0.1333 (3 or 6 seats), 0.13 (4 seats) or 0.132 (5 seats).",
      ],
      table: {
        title: "Roles, in seat order",
        columns: ["Seat", "Role", "Prep items (bonus)", "Best bonus", "The role's question"],
        rows: [
          ["1", "Mastermind (always the planner)", "Business Briefcase 0.10, Legal Case File 0.09, Black Market Resume 0.12, Corporate Blessing 0.15", "0.15", "Which floor holds the cash"],
          ["2", "Lookout", "Hunting Permit 0.09, Camouflage Kit 0.12, Lucky Coin 0.08, Rabbit Foot Charm 0.06, Fox Tail Talisman 0.05", "0.12", "Which guard shift change to wait for"],
          ["3", "Safecracker", "Mechanic Toolkit 0.08, Thieves Gloves 0.12, Lab Kit 0.11, Calculator Pro 0.09, Cheat Sheet 0.13", "0.13", "Which dial colour opens it"],
          ["4", "Driver", "Iron Spurs 0.10, Guard Vest 0.08, Arctic Wolf Spirit Charm 0.12", "0.12", "Which escape route is clear"],
          ["5", "Muscle", "Wooden Rifle 0.08, Iron Rifle 0.10, Sniper Rifle 0.14, Wolf Fang Dagger 0.10", "0.14", "Which door is unguarded"],
          ["6", "Hacker", "Counterfeit Kit 0.10, Eclipse Mask 0.14, Python Skin Cloak 0.12, Komodo Venom Flask 0.11", "0.14", "Which camera feed to loop"],
        ],
      },
    },
    {
      heading: "The intel ring and the leak",
      body: [
        "At Start the bot lines the filled seats up in the seat order above (a missing Driver is simply skipped) and deals every seat 4 options from its role's 6 labels, one of them correct. Each seat's correct answer is shown only to the next seat in the ring, and the last seat's to the Mastermind. So every member holds intel for someone else and needs intel from someone else. A blind guess is right 1 time in 4.",
        "Your brief says \"Tell @next: <answer>\" for the intel you hold, and \"<question>? @previous has your intel\" for your own call. Example: a Payroll Van with 5 seats runs Mastermind, Lookout, Safecracker, Driver, Muscle. The Muscle holds the Driver's escape route (\"Tell @Driver: the clear route is Canal Street\") and gets the door answer from the Mastermind.",
        "The leak covers a member who goes AFK. A seat is dark if its member had not opened the brief before the last 30 seconds of the GO. From that point, the seat that needed the dark member's intel sees it in their own brief (\"Your contact went dark. The intel leaked: Canal Street\"). The dark seat itself can't answer and counts as a miss. A member who opened the brief and then walked away is not dark: their partner gets no leak and has to guess or be told.",
        "Going dark on purpose to read every leak doesn't work: each dark seat is a miss, so a crew that tries it Busts. One genuine AFK costs exactly one miss, so the best that crew can do is Messy.",
      ],
      table: {
        title: "Answer labels (6 per role)",
        columns: ["Role", "Labels"],
        rows: [
          ["Mastermind", "Basement, Ground Floor, Mezzanine, 2nd Floor, 3rd Floor, Roof Office"],
          ["Lookout", "9:00 PM, 10:15 PM, 11:30 PM, 12:45 AM, 2:00 AM, 3:15 AM"],
          ["Safecracker", "Crimson, Amber, Jade, Cobalt, Violet, Ivory"],
          ["Driver", "Harbor Bypass, Canal Street, Old Rail Road, Market Alley, Bridge Ramp, Tunnel 9"],
          ["Muscle", "Loading Bay, Staff Door, Fire Exit, Skylight, Kitchen Door, Side Gate"],
          ["Hacker", "CAM-01, CAM-02, CAM-03, CAM-04, CAM-05, CAM-06"],
        ],
      },
    },
    {
      heading: "A caper, step by step",
      body: [
        "Plan. A Capo, Underboss or Boss runs !caper and picks a tier, or types !caper plan <1-4>. The family's level must unlock the tier, the family can't be under investigation (3 or more members at heat 100 or above), the family cooldown must be over, the family must have started fewer than 4 capers in the last 24 hours, and the planner must pass every seat gate for the Mastermind seat. The planner's stake is taken at once. If the bot can't post in the channel, the lobby goes to the family's home channel when it is in the same server; otherwise the plan is refused with the missing permission.",
        "Lobby: 10 minutes. The card lists every open role. Members who aren't seated, are in this server, pass the tier's gates and have a free seat get a \"Caper lobby open\" DM with a link (at most 3 lobby calls a day, and none for 2 hours after a lobby is cancelled). Joining works from the card or with !caper join <role> anywhere in the lobby's server; another channel gets a small \"joined\" card with a link back. Role names ignore case and spaces, so \"safe cracker\" works.",
        "Leave before Start with the Leave button or !caper leave, and your stake comes straight back. If the Mastermind leaves, the whole caper is cancelled and every stake is refunded.",
        "Start. The planner presses Start (or types !caper start) once the required roles are filled; the caper also starts on its own when the last seat up to the maximum fills, or when the lobby closes with the required roles filled. Start re-checks every seat: jail, ban, heat, net worth (your paid stake counts towards it), prep items and your seat count. A seat that fails is removed and refunded and the card says it \"got pinched\". If that leaves a required role empty, the lobby stays open until its 10 minutes are up. From Start the stakes are spent, and the family cooldown begins.",
        "GO: 120 seconds. A new message mentions every crew member with an Open brief button, and each member gets a \"Caper GO\" DM. Open your brief (the button or !caper brief), press Refresh to see the time left and any leaked intel, and lock one of the 4 options. One answer per member, and it can't be changed. The card shows how many have locked in, never who is right.",
        "Result. The caper resolves the moment the last answer locks, or when the GO ends. The result card lists every seat's cut, fine and jail time. There is no result DM.",
        "If the lobby closes without its required roles, or the planner or the Boss cancels it (!caper cancel), every stake is refunded and the family waits 30 minutes before the next caper. If the bot restarts during a GO before every seat has answered, the run is void: every stake is refunded and nothing else happens (no heat, fine, jail, XP or vault cut), and the void run doesn't count towards anyone's seat limit or the family's 4 a day.",
      ],
      table: {
        title: "Seat gates, checked in this order",
        columns: ["#", "Gate"],
        rows: [
          ["1", "In this family for 72 hours or more (no Associates), and acting in the lobby's server"],
          ["2", "Not jailed, not banned"],
          ["3", "Heat below the tier's ceiling"],
          ["4", "Lifetime shifts, Fortuna profile age and Discord account age for the tier"],
          ["5", "Net worth for the tier, counted fresh (never the cached leaderboard figure)"],
          ["6", "Owns at least one prep item for the role"],
          ["7", "No other live caper seat"],
          ["8", "Fewer than 2 started seats in the last 24 hours"],
        ],
      },
    },
    {
      heading: "Outcome math",
      body: [
        "A miss is a wrong answer, a seat that never locked one, or a dark seat. Misses decide the outcome; with no misses, one roll against the patrol chance decides between Clean and Messy (\"a patrol car turned the corner\"). The roll is drawn once when the caper resolves and stored, so a restart can never re-roll it.",
        "Patrol chance = the tier's patrol base × (1 − crew edge) + 0.002 × the highest heat in the crew at Start, capped at 60%. Because the heat ceiling caps that heat (39 at most at Tier 4), heat adds at most 7.8 points at Tier 4 and 13.8 at Tier 1. Example: a Tier 4 crew with edge 0.10 and heat 0 has a patrol chance of 22.5%.",
        "No buff, luck charm or income multiplier ever touches a caper, and caper cuts pay no income tax: the fence below takes its place.",
      ],
      table: {
        title: "Misses and the outcome",
        columns: ["Crew size", "Clean", "Messy", "Bust"],
        rows: [
          ["3 or 4 seats", "0 misses and the patrol roll passes", "1 miss, or 0 misses and the patrol roll fails", "2 or more misses"],
          ["5 or 6 seats", "0 misses and the patrol roll passes", "1–2 misses, or 0 misses and the patrol roll fails", "3 or more misses"],
        ],
      },
    },
    {
      heading: "Payouts and exact cuts",
      body: [
        "The pool is the tier's pool per seat × the seats filled at Start × 100% on Clean, 35% on Messy and 0 on a Bust. 80% of the pool is the crew share, 10% goes to the vault's earnings, and the last 10% is the fence: it is never paid to anyone.",
        "Every seat is weighted the same, Mastermind included: cut = crew share ÷ seats, rounded down. A seat that never locked an answer, or went dark, gets 0, and its share is not paid to anyone else. The rounding remainder is never paid either. Cuts land in your wallet as earned income, so card debt garnishment applies like any other earning.",
      ],
      table: {
        title: "Exact cuts (every seat locked an answer)",
        columns: ["Tier", "Seats", "Pool, Clean", "Crew share, Clean", "Vault cut, Clean", "Cut, Clean", "Pool, Messy", "Vault cut, Messy", "Cut, Messy"],
        rows: [
          ["1", "3", "1,050,000", "840,000", "105,000", "280,000", "367,500", "36,750", "98,000"],
          ["1", "4", "1,400,000", "1,120,000", "140,000", "280,000", "490,000", "49,000", "98,000"],
          ["2", "4", "2,200,000", "1,760,000", "220,000", "440,000", "770,000", "77,000", "154,000"],
          ["2", "5", "2,750,000", "2,200,000", "275,000", "440,000", "962,500", "96,250", "154,000"],
          ["3", "5", "4,250,000", "3,400,000", "425,000", "680,000", "1,487,500", "148,750", "238,000"],
          ["3", "6", "5,100,000", "4,080,000", "510,000", "680,000", "1,785,000", "178,500", "238,000"],
          ["4", "5", "6,000,000", "4,800,000", "600,000", "960,000", "2,100,000", "210,000", "336,000"],
          ["4", "6", "7,200,000", "5,760,000", "720,000", "960,000", "2,520,000", "252,000", "336,000"],
        ],
      },
    },
    {
      heading: "When it goes wrong",
      body: [
        "Every seat takes the outcome's heat, whether or not it answered. On a Bust every seat also pays the tier's fine, wallet first and then bank (the bank can go into debt), and rolls separately for jail at the tier's rate. Bail is the usual 1,000. Prep items are always kept, and the stake is gone on every outcome except a void run.",
      ],
      table: {
        title: "Consequences by outcome",
        columns: ["Outcome", "Money", "Heat", "Jail", "Prep items"],
        rows: [
          ["Clean", "Full cut", "Clean heat per seat", "None", "Kept"],
          ["Messy", "Cut from 35% of the pool", "Messy heat per seat", "None", "Kept"],
          ["Bust", "No cut; each seat pays the Bust fine", "Bust heat per seat", "Per-seat roll at the tier's rate", "Kept"],
        ],
      },
    },
    {
      heading: "Caper caps and cooldowns",
      body: [
        "Seats and family capers are counted over a rolling 24 hours from each Start, not per UTC day. When your second seat in 24 hours starts, the bot DMs you the moment your first seat frees up (the \"Family caper\" cooldown alarm in !settings).",
      ],
      table: {
        title: "Limits",
        columns: ["Limit", "Value"],
        rows: [
          ["Seats per player", "2 started seats per rolling 24 hours; 1 live seat at a time"],
          ["Capers per family", "4 started per rolling 24 hours; 1 live at a time"],
          ["Family cooldown, from Start", "3h00 at L1–3, 2h45 at L4–5, 2h30 at L6–8, 2h00 at L9–10"],
          ["Cancelled or expired lobby", "30 minutes"],
          ["Lobby / GO / leak point", "10 minutes / 120 seconds / the last 30 seconds of the GO"],
          ["Lobby call DMs", "3 per player per 24 hours; none for 2 hours after a cancel"],
          ["Solo crime cooldown", "Not touched. Heat is the budget the two share."],
        ],
      },
    },
    {
      heading: "Expected value: realistic play",
      body: [
        "These figures assume a crew edge of 0.10 (typical gear), heat 0, and every seat locking an answer that is right 90% of the time. Every seat is paid the same, so one seat's expected value is the crew's average. Net = gross cut − stake − expected fine.",
      ],
      table: {
        title: "Per-step pass rate 90%",
        columns: ["Tier", "Seats", "Clean", "Messy", "Bust", "Gross per seat", "Stake", "Expected fine", "Net per caper", "Net per day (2 seats)", "Vault per caper"],
        rows: [
          ["1", "3", "66.34%", "30.86%", "2.80%", "215,993", "50,000", "4,200", "161,793", "323,586", "80,997"],
          ["1", "4", "59.71%", "35.06%", "5.23%", "201,538", "50,000", "7,845", "143,693", "287,386", "100,769"],
          ["2", "4", "56.75%", "38.02%", "5.23%", "308,258", "100,000", "15,690", "192,568", "385,137", "154,129"],
          ["2", "5", "51.08%", "48.07%", "0.86%", "298,763", "100,000", "2,568", "196,195", "392,390", "186,727"],
          ["3", "5", "48.42%", "50.72%", "0.86%", "449,980", "175,000", "4,280", "270,700", "541,400", "281,237"],
          ["3", "6", "43.58%", "54.84%", "1.58%", "426,843", "175,000", "7,925", "243,918", "487,836", "320,132"],
          ["4", "5", "45.76%", "53.38%", "0.86%", "618,685", "300,000", "6,420", "312,265", "624,530", "386,678"],
          ["4", "6", "41.19%", "57.23%", "1.58%", "587,679", "300,000", "11,887", "275,792", "551,584", "440,759"],
        ],
      },
      note: "A bigger crew isn't always better for the seats. The optional seat lowers everyone's net at Tier 1, Tier 3 and Tier 4, because one more seat is one more chance to miss. Only at Tier 2 does the fifth seat pay, since a 5-seat crew needs 3 misses to Bust. The vault always gets more from a bigger crew.",
    },
    {
      heading: "Expected value: a strong crew",
      body: [
        "The same assumptions with answers right 95% of the time, which is what a crew that calls its intel clearly in the channel gets.",
      ],
      table: {
        title: "Per-step pass rate 95%",
        columns: ["Tier", "Seats", "Net per caper", "Net per day (2 seats)"],
        rows: [
          ["1", "4", "179,422", "358,844"],
          ["2", "5", "244,900", "489,800"],
          ["3", "6", "327,781", "655,562"],
          ["4", "6", "389,069", "778,138"],
        ],
      },
    },
    {
      heading: "Expected value: perfect play",
      body: [
        "With every answer right only the patrol roll is left. Because every seat is paid the same, this is also the planner's ceiling: a Capo who plans and sits as Mastermind on both daily runs earns 1,049,600 a day at Tier 4, not more.",
        "For scale: a realistic Tier 4 seat pair (551,584 a day) is below a World Zoo (866,000 a day net) and well below a top shift line (2.58–4.14M a day). Perfect Tier 4 play is about a Legendary Rifle (1,459,000 a day) minus a third, at a far higher entry cost: 40M net worth, 300 lifetime shifts, a level 8 family and a 300,000 stake per run. A Tier 1 seat (287,386 a day) is about a City Zoo (388,000) minus a quarter.",
      ],
      table: {
        title: "Per-step pass rate 100%",
        columns: ["Tier", "Clean (edge 0.10)", "Net per caper", "Net per day", "Best gear: net per day (seats, edge)", "Paid out per caper, crew + vault (max seats, best gear)"],
        rows: [
          ["1", "91.0%", "213,620", "427,240", "428,453 (3, 0.1333)", "1,188,747 (4, 0.13)"],
          ["2", "86.5%", "301,390", "602,780", "605,526 (5, 0.132)", "2,265,541 (5, 0.132)"],
          ["3", "82.0%", "425,440", "850,880", "856,773 (6, 0.1333)", "4,072,860 (6, 0.1333)"],
          ["4", "77.5%", "519,600", "1,039,200", "1,049,600 (6, 0.1333)", "5,567,400 (6, 0.1333)"],
        ],
      },
    },
    {
      heading: "Getting better at capers",
      body: [
        "Open your brief early, well before the last 30 seconds. A brief opened late makes your seat dark: you can't answer, it counts as a miss, and your partner reads your intel as a leak instead of hearing it from you.",
        "Say your intel to the right person. Your brief names who needs it (\"Tell @next\"), and the answer you need is with someone else. Call it in the channel with their name, read your own answer back, and only then lock. A wrong lock can't be undone.",
        "Keep your heat below the tier's ceiling before the lobby opens. Heat is checked when you join and again at Start, so a solo crime in the lobby's 10 minutes can push you over and get you pinched. The highest heat in the crew also raises the patrol chance for everyone.",
        "Bring the best item for your role. The crew edge is the average of every seat's best item, and at Tier 4 the gap between the weakest and best gear is several points of patrol chance on every run. The top items are Corporate Blessing (Mastermind), Camouflage Kit (Lookout), Cheat Sheet (Safecracker), Arctic Wolf Spirit Charm (Driver), and Sniper Rifle or Eclipse Mask (Muscle, Hacker).",
        "An AFK seat costs the crew one miss, not the job: its partner gets the leak, and the seat itself is paid nothing. In a 3- or 4-seat crew one more miss on top of it is a Bust, so a seat you aren't sure will turn up is a real risk.",
        "Fill the optional role for the family, not for your own cut. At 90% per answer the extra seat lowers each seat's net at Tier 1, Tier 3 and Tier 4 and raises it slightly at Tier 2, but it always raises the vault's cut. A strong crew that rarely misses loses little by filling it; a shaky crew is better off leaving it empty, especially at Tier 1, where 4 seats still Bust on 2 misses.",
      ],
    },
    {
      heading: "Succession",
      body: [
        "Any !crew command or family button keeps you marked active. A Boss who goes quiet doesn't freeze the family.",
        "The automatic heir is the Underboss; if there isn't one, the Capo who joined first; then the Soldier with the most capers, ties to who joined first. The heir must have been active in the last 7 days; if nobody qualifies, nothing changes. The old Boss becomes a Soldier.",
      ],
      table: {
        title: "When the Boss goes inactive",
        columns: ["Boss inactive for", "What happens"],
        rows: [
          ["7 days", "A notice posts in the home channel and the Underboss gets a Claim the chair button (!crew claim). If the Boss comes back first, the notice says so."],
          ["14 days", "The chair passes to the heir automatically and every member gets a DM."],
        ],
      },
    },
    {
      heading: "Disbanding",
      body: [
        "!crew disband (Boss only) shows the exact amount that will be burned, then asks you to type the family tag to confirm.",
        "If the last payday was 7 or more days ago, eligible members get one final payday with the normal 1,000,000 cap and 5% tax; tenure still counts, but the 500,000 minimum does not. Everything else in treasury and earnings is burned. Nobody gets their deposits back. Pending invites expire, every member gets a DM, and the name and tag are freed.",
      ],
      note: "A Boss who disbands waits 7 days before founding again. Members wait 24 hours before joining anywhere.",
    },
    {
      heading: "The family leaderboard",
      body: [
        "!crew top ranks the top 10 families by XP or by war wins, plus your own family's rank. Each line shows the crest, [TAG] Name, level and members (and rackets held, with Turf). No vault and no family net worth is ever shown. !crew info <TAG> opens any family's public dashboard.",
      ],
    },
    {
      heading: "Getting better at Crime Families",
      body: [
        "Recruit players who will actually play. Payday pays only members who were active in the last 7 days, and the split is per eligible member, so a big roster of idle friends earns nothing and dilutes nothing either. Twelve members who play are worth more than twelve names.",
        "Deposit to keep pace with your XP, not ahead of it. A level needs its XP before the fee matters, and the fee is all the treasury is for. Parking money in the vault before the family has the XP only locks it away for good.",
        "Keep dues paid. At L10 dues are 400,000 a day; a few dry days put the family in arrears and block levelling until a deposit or a payout of earnings clears them. A steady stream of small deposits is cheaper than one rescue.",
        "Decide each week: pay out or level up. Earnings pay the fee or go out as Payday, never both. A young family usually levels first, since each level unlocks bigger capers and more members; a family at L8 or above can pay out the 950,000-a-member cap and still fund the last fees from what the cap leaves behind.",
        "Pick an Underboss you trust and who logs in. They can run Payday and level up, and they take the chair if you vanish for 14 days.",
      ],
    },
  ],
  commandIds: ["crew", "caper", "family"],
  proTips: [
    "Treasury never reaches a wallet, even on disband. Deposit only what the family will spend on dues and level fees.",
    "\"!crew deposit all\" stops at the 25,000,000 daily cap, so it never refuses a big wallet.",
    "Leaving costs you 72 hours before you can join anyone and 14 days before you can return to the same family. Being kicked costs 24 hours.",
    "The Underboss can claim the chair after the Boss has been gone 7 days. Without an Underboss the chair waits for the 14-day automatic handover.",
  ],
};

export default crimeFamilies;
