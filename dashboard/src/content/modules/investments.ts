import type { ModuleDoc } from "../types";

const investments: ModuleDoc = {
  slug: "investments",
  title: "Investments",
  tagline: "Stocks that tick on a clock, property that pays rent while you sleep.",
  icon: "TrendingUp",
  forBeginners: {
    what: "Put your money to work instead of letting it sit. Stocks tick every 30 minutes whether you're watching or not, and property pays rent passively once you own it.",
    firstCommands: ["!stock", "!properties", "!my-stocks"],
    tip: "Stocks can be delisted — the DELISTING badge is not decoration, it's a deadline.",
  },
  screenshot: {
    src: "/screenshots/docs-investments.png",
    alt: "Investments in Discord",
  },
  sections: [
    {
      heading: "The stock market",
      body: [
        "There's exactly one stock market in Fortuna, shared by every server the bot is in — the price you see is the price everyone sees. It ticks every 30 minutes, so timing a buy right before a move is mostly luck.",
        "!stock buy <symbol> <qty> and !stock sell <symbol> <qty> handle the actual trading. Each listing carries a risk and volatility label so you know what you're getting into, and !stock news surfaces forecasts and rumors that hint at where a price might be headed — read it as a lean, not a guarantee.",
      ],
      note: "Watch for the DELISTING badge — a stock flagged this way is on its way out of the market, and holding through it is a bet with a deadline.",
    },
    {
      heading: "Tracking your portfolio",
      body: [
        "!my-stocks breaks down every position you're holding with its own profit and loss, plus a running total across all of them. !stock portfolio pulls up the same information from inside the stock dashboard itself, if you'd rather not switch commands.",
      ],
    },
    {
      heading: "Real estate",
      body: [
        "!properties browses everything currently for sale. Buying and selling both work by key rather than name — !buy-property <key> locks in a purchase, !sell-property <key> hands it back.",
        "Once you own something, rent accrues on its own without you doing anything — !collect-rent sweeps whatever's built up across every property straight into your wallet. !my-properties lists your full portfolio if you want the overview first.",
      ],
    },
    {
      heading: "Bank products",
      body: [
        "If stocks and property both feel like too much risk, the bank itself pays out two guaranteed rates: a fixed deposit at 10% APR for money you can lock away, and a recurring deposit at 8% APR if you'd rather contribute over time. Both live under !bank — see Bank & Credit for the full mechanics of opening and collecting them.",
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
    "Read !stock news before you buy — rumors don't guarantee a move, but ignoring them entirely is leaving information on the table.",
    "Build a habit around !collect-rent. Rent doesn't expire, but it also doesn't do anything for you sitting uncollected.",
    "A DELISTING badge means the clock is running — decide whether you're selling or riding it out before the market makes the call for you.",
  ],
};

export default investments;
