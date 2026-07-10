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
        "Five regular properties, each ownable once per player, paying rent on a 24-hour cycle collected via !collect-rent (uncollected rent waits for you — the cycle just needs 24h between claims). Sell-back is 75% of current value.",
        "Prices are dynamic: every copy sold anywhere in the world raises that property's price 5%. Early buyers lock in the floor and enjoy the appreciation on sell-back.",
      ],
      table: {
        title: "Property catalog",
        columns: ["Property", "Base price", "Rent / 24h", "Days to break even"],
        rows: [
          ["Shack", "1,800,000", "12,000", "150"],
          ["Apartment", "5,400,000", "36,000", "150"],
          ["House", "16,000,000", "108,000", "~148"],
          ["Mansion", "47,000,000", "312,000", "~151"],
          ["Private Island", "126,000,000", "840,000", "150"],
        ],
      },
      note: "Zoo properties (Mini 1.8M / City 15M / World 75M) are the exception to the flat-rent rule — their income comes from the animals you house, and a full zoo dramatically out-earns any regular deed. See Hunting & Animals.",
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
        "Order of operations for idle cash: property first (permanent, robbery-proof, ~0.67% per day forever), FDs for money with a known date, stocks only with money you can watch. Rent plus a full zoo is the closest thing Fortuna has to financial independence.",
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
    "Buy properties early: +5% per copy sold globally means popular servers inflate deeds fast, and your 75% sell-back is computed on the NEW price.",
    "All five regular properties pay back in ~150 days — buy in whatever order you can afford; there's no wrong pick, only idle cash.",
    "DELISTING = sell-only and roughly a 2–4 hour fuse. If you're not deliberately gambling on the bounce that can't come, take the pennies.",
    "Check !my-stocks before claiming victory — slippage means your real cost basis is higher than the chart price you remember buying at.",
  ],
};

export default investments;
