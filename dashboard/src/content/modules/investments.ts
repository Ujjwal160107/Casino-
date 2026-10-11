import type { ModuleDoc } from "../types";

const investments: ModuleDoc = {
  slug: "investments",
  title: "Investments",
  tagline: "Seven tickers on a 30-minute clock, five deeds that pay rent forever — and the fine print on both.",
  icon: "TrendingUp",
  forBeginners: {
    what: "Three ways to make money without a cooldown grind: a live stock market that ticks every 30 minutes (shared across every server), real estate that pays rent every 24 hours, and the bank's fixed deposits when you want a guaranteed number. Stocks are the only one that can lose.",
    firstCommands: ["!stock", "!properties", "!my-stocks"],
    tip: "Stock prices drift slightly DOWNWARD by design between events — buy-and-forget loses slowly. Stocks here are for trading the news, not passive holding.",
  },
  screenshot: {
    src: "/art/stock-market.jpg",
    alt: "Lady Fortuna's market — stock tickers, jackpot machines, and a rising chart",
    aspect: "aspect-[968/336]",
  },
  sections: [
    {
      heading: "The stock market: the board",
      body: [
        "One global market, seven listings, ticking every 30 minutes. Volatility is the personality of each stock — it scales both the size of every move and how often events hit it. Liquidity decides how much your own order moves the price against you.",
      ],
      table: {
        title: "The listings",
        columns: ["Symbol", "Company", "Base price", "Volatility", "Risk label"],
        rows: [
          ["FRTN", "Fortuna Holdings", "1,500", "3", "Stable"],
          ["VEGA", "Vega Resorts Intl.", "600", "5", "Stable"],
          ["ACES", "Aces High Gaming", "250", "8", "Moderate"],
          ["LUCK", "Lady Luck Lottery Co.", "120", "14", "High"],
          ["CHIP", "ChipCoin", "60", "20", "High"],
          ["JACK", "Jackpot Labs", "40", "24", "High"],
          ["BUST", "BustBet Inc.", "15", "30", "Extreme"],
        ],
      },
      note: "When a stock dies, a reserve company IPOs to replace it — RollDice Corp, House Edge Capital, and Wildcard Ventures are waiting in the wings.",
    },
    {
      heading: "How prices move (and why they sink)",
      body: [
        "Every tick, each stock takes a baseline drift drawn between −3% and +0.5%, scaled up by volatility — the average tick is negative. What makes money is the event engine: each tick also rolls roughly a 30–85% chance (rising with volatility) of an event, from minor dips and gains to multi-tick SLUMPS, RALLIES of 8–20%, CRASHES of 15–35%, and rare BOOMS of 20–45%.",
        "The big events are telegraphed: !stock news shows 🔮 RUMOR forecasts one tick ahead — and forecasts come true 65% of the time. That 65/35 split is the entire game: buying a rumored BOOM is a positive-EV bet, and it still fakes out one time in three.",
        "There are no flat trade fees — the cost is slippage. Your order impacts the fill price by up to 40% depending on size versus the stock's liquidity: trading 500 shares of thin BUST moves the market against you brutally; the same order in FRTN barely ripples. Trade deep stocks in size, thin stocks in slivers.",
      ],
    },
    {
      heading: "Delisting: the death spiral",
      body: [
        "A stock trading below 3% of its base price starts a delist watch. Four consecutive ticks down there flags it DELISTING — sell-only from that moment. Eight ticks and it's DELISTED: holders are auto-paid the final price (often pennies), and a reserve stock IPOs in its place.",
        "The DELISTING badge is therefore a countdown measured in hours, not days: four more bad ticks is two hours. Decide immediately — average down never, sell or ride to the floor.",
      ],
    },
    {
      heading: "Trading commands",
      body: [
        "!stock is the market board; !stock buy <symbol> <qty> and !stock sell <symbol> <qty> execute at slippage-adjusted prices; !stock news is the rumor mill; !my-stocks and !stock portfolio show every position with live profit and loss. Your average buy price is cost-averaged across purchases, so P&L is honest about what you actually paid.",
      ],
    },
    {
      heading: "Real estate: the rent table",
      body: [
        "Five regular properties, each ownable once per player, paying rent on a 24-hour cycle collected via !collect-rent. Uncollected rent banks for up to 3 days: collect any time inside that window and you're paid every full day owed, with the unfinished day still ticking toward the next one. Past 3 days the extra is lost — you're paid for 3 and the clock restarts from the moment you collect. Sell-back is 75% of the current price.",
        "Prices are dynamic: every copy bought anywhere in the world adds 5% of the base price to that property's sticker (every sell-back takes one sale off the count again) — but the price never goes above 1.5× base, so after ten net sales a deed stops getting dearer. Early buyers lock in the floor, and since sell-back is computed on the current price, a deed bought at base and sold at the cap returns 112.5% of what you paid.",
      ],
      table: {
        title: "Property catalog",
        columns: ["Property", "Base price", "Price cap (1.5×)", "Rent / 24h", "Days to break even (at base)"],
        rows: [
          ["Shack", "1,800,000", "2,700,000", "90,000", "20"],
          ["Apartment", "5,400,000", "8,100,000", "225,000", "24"],
          ["House", "16,000,000", "24,000,000", "570,000", "~28"],
          ["Mansion", "47,000,000", "70,500,000", "1,380,000", "~34"],
          ["Private Island", "126,000,000", "189,000,000", "3,150,000", "40"],
        ],
      },
      note: "Rent per coin falls as deeds get bigger: the Shack returns 5% of its base price a day, the Private Island 2.5%. At the 1.5× cap every payback stretches by half — 30 days for a Shack, 60 for an Island. Zoo properties (Mini 800,000 / City 5,000,000 / World 18,000,000 base) don't pay flat rent: their income is the fed animals you house, minus their feed — a fully stocked zoo nets 90,000 / 388,000 / 866,000 a day. Zoo income has no 3-day bank; it pays only what your fed animals earn on the day you collect. See Hunting & Animals.",
    },
    {
      heading: "The guaranteed shelf: FDs",
      body: [
        "When stocks feel like the casino with extra steps, the bank pays a locked 10% APR on fixed deposits of any size and duration — !bank fd <amount> <days>, prorated daily, no way to lose except waiting. The full mechanics (and why the 8% recurring deposit is a trap) live in the Bank & Credit docs.",
      ],
    },
    {
      heading: "Getting better at investing",
      body: [
        "Trade the news cycle, not the chart. The only durable edge is the 65% forecast: check !stock news every tick or two, buy rumored rallies/booms, exit after resolution. Holding through quiet periods just donates the negative drift.",
        "Size by liquidity, not conviction. Slippage charges you both ways — a round trip in a thin stock can eat 20%+ before the price moves at all. FRTN and VEGA absorb real size; BUST and JACK are for small, violent bets on telegraphed events.",
        "The volatile end is a lottery with better odds: BUST at volatility 30 catches the biggest booms AND sits closest to the delist floor. Never put rent money there — but a rumored BOOM on a 15-coin stock is the best risk/reward ticket on the board.",
        "Order of operations for idle cash: property first (robbery-proof, 2.5–5% of its price back every day), FDs for money with a known date, stocks only with money you can watch. Climb the deeds cheapest-first — each one's rent funds the next — and collect at least every third day so no rent ever falls off the 3-day bank. Rent plus a full zoo is the closest thing Fortuna has to financial independence.",
      ],
    },
  ],
  commandIds: [
    "stock",
    "my-stocks",
    "properties",
    "buy-property",
    "sell-property",
    "my-properties",
    "collect-rent",
    "bank",
  ],
  proTips: [
    "Forecasts hit 65% of the time — a rumored CRASH is a sell signal even if you like the stock. Re-enter after the fakeout resolves.",
    "Buy properties early: +5% per copy sold globally inflates deeds fast (up to the 1.5× cap), and your 75% sell-back is computed on the NEW price.",
    "Buy the cheapest deed first. The Shack pays itself back in 20 days, the Island in 40 — smaller deeds earn more per coin, so climb the ladder in order rather than saving for the big one.",
    "Rent banks for 3 days, not forever. A weekend away costs nothing; a week away throws four days of rent in the bin. Run !collect-rent at least every third day.",
    "DELISTING = sell-only and roughly a 2–4 hour fuse. If you're not deliberately gambling on the bounce that can't come, take the pennies.",
    "Check !my-stocks before claiming victory — slippage means your real cost basis is higher than the chart price you remember buying at.",
  ],
};

export default investments;
