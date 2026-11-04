import type { ModuleDoc } from "../types";

// Numbers come from CRIME_FAMILY_CONFIG (src/utils/economyConfig.ts) and
// src/data/crimeFamilyCatalog.ts. Capers and Turf add their own sections when
// they ship; rows that depend on them are marked "with Capers" / "with Turf".
const crimeFamilies: ModuleDoc = {
  slug: "crime-families",
  title: "Crime Families",
  tagline: "A crew of up to 12 players with ranks, a vault nobody can rob, and ten family levels to buy.",
  icon: "Users",
  forBeginners: {
    what: "A crime family is a crew of 6 to 12 players. Members pay into a shared vault, the vault pays the family's dues and level fees, and once a week the earned part of the vault is split between the members who played. Deposits never come back out: the vault is for the family, not for parking cash.",
    firstCommands: ["!crew"],
    tip: "You don't need to found a family to play. Joining needs 1,000,000 net worth and 20 shifts; founding needs 15,000,000, 60 shifts and 10,000,000 to burn. Get invited first.",
  },
  screenshot: {
    src: "/art/cf-fortuna-don.png",
    alt: "Lady Fortuna as the family Don",
    caption: "The Don",
    aspect: "aspect-square",
    maxWidth: "max-w-sm",
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
          ["Plan a caper (with Capers)", "yes", "yes", "yes", "no", "no"],
          ["Take a caper seat (with Capers)", "yes", "yes", "yes", "yes", "no"],
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
          ["Earnings", "10% of every caper pool (with Capers), racket income and refunded bids (with Turf)", "Dues, level fees, rename (first); racket bids (only from earnings, with Turf); Payday", "Only through Payday"],
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
          ["Active member", "2 started caper seats (with Capers) or 3 correct war hits (with Turf) in the last 7 days"],
          ["Account", "20 shifts, Discord 90 days, Fortuna 14 days, not banned; jail does not block payday"],
        ],
      },
      note: "Being active is the gate most members miss. Until Capers ships nobody counts as active, so Payday has nobody to pay and earnings stay in the vault.",
    },
    {
      heading: "Levels",
      body: [
        "A level needs both its XP and its fee. XP is cumulative and never spent; the fee comes from the vault, earnings first, and is burned. Only the Boss or Underboss can level up, and not while dues are in arrears. The full climb from L2 to L10 costs 172,000,000 in fees.",
        "Levels give capacity, unlocks, faster family cooldowns and a better crest. No level ever multiplies income, raises a payout or cuts a stake.",
      ],
      table: {
        title: "Family levels",
        columns: ["Level", "XP to reach", "Fee", "Members", "Rackets (with Turf)", "Caper tier unlocked (with Capers)", "Family caper cooldown", "Crest"],
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
          ["Caper, Clean / Messy / Bust (with Capers)", "Tier 1 150/60/20, Tier 2 225/90/30, Tier 3 300/120/40, Tier 4 375/150/50"],
          ["Racket cycle paid (with Turf)", "20 per cycle, none on a neglected cycle"],
          ["Correct war hit (with Turf)", "5"],
          ["War won (with Turf)", "300 × 1 / 1.5 / 2 for a Corner / District / Crown racket"],
          ["Deposits, Payday", "0"],
        ],
      },
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
  commandIds: ["crew", "family"],
  proTips: [
    "Treasury never reaches a wallet, even on disband. Deposit only what the family will spend on dues and level fees.",
    "\"!crew deposit all\" stops at the 25,000,000 daily cap, so it never refuses a big wallet.",
    "Leaving costs you 72 hours before you can join anyone and 14 days before you can return to the same family. Being kicked costs 24 hours.",
    "The Underboss can claim the chair after the Boss has been gone 7 days. Without an Underboss the chair waits for the 14-day automatic handover.",
  ],
};

export default crimeFamilies;
