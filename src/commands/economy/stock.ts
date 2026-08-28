import {
  AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, Message, MessageFlags,
  SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder,
} from "discord.js";
import {
  getAllStocks, getPortfolio, buyStock, sellStock,
  initGlobalMarket, getActiveForecasts, getRecentEvents,
} from "../../services/stockService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";
import path from "path";
import { nextStepHint } from "../../config/nextSteps";

const STOCK_ACCENT_COLOR = 0x9b59b6;
const STOCK_BANNER_NAME = "stock_market.jpg";
const STOCK_BANNER_URL = `attachment://${STOCK_BANNER_NAME}`;

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function textContainer(title: string, body: string, color = STOCK_ACCENT_COLOR) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function riskLabel(volatility: number) {
  if (volatility > 24) return `${Mascot.Emotes.Alert} Extreme Risk`;
  if (volatility > 12) return `${Mascot.Emotes.Alert} High Risk`;
  if (volatility > 6) return `${Mascot.Emotes.Graph} Moderate`;
  return `${Mascot.Emotes.Accept} Stable`;
}

function changePct(current: number, previous: number) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function rumorLine(type: string, direction: string) {
  const up = direction === "UP";
  switch (type) {
    case "CRASH": return `${Mascot.Emotes.Alert} Crash rumored`;
    case "SLUMP": return `${Mascot.Emotes.GraphDown} Bearish slump rumored`;
    case "RALLY": return `${Mascot.Emotes.GraphUp} Rally rumored`;
    case "BOOM": return `${Mascot.Emotes.GraphUp} Big breakout rumored`;
    default: return up ? `${Mascot.Emotes.GraphUp} Bullish chatter` : `${Mascot.Emotes.GraphDown} Bearish chatter`;
  }
}

function statusBadge(status: string) {
  if (status === "DELISTING") return `${Mascot.Emotes.Alert} DELISTING — sell only`;
  return "";
}

async function buildMarketContainer(prefix: string) {
  const stocks = await getAllStocks();
  const forecasts = await getActiveForecasts();
  const forecastBySymbol = new Map(forecasts.map((f) => [f.symbol, f]));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.GraphUp} Global Stock Market\n` +
        `> One market, all servers. Prices move on a 30-minute tick.\n` +
        `> Read the rumors, mind the risk — most blind trades lose.`,
      ),
    )
    .addSeparatorComponents(separator());

  stocks.forEach((stock, index) => {
    const pct = changePct(stock.currentPrice, stock.previousPrice);
    const trend = pct >= 0 ? Mascot.Emotes.GraphUp : Mascot.Emotes.GraphDown;
    const pctText = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% this tick`;
    const forecast = forecastBySymbol.get(stock.symbol);
    const badge = statusBadge(stock.status);

    const lines = [
      `**Price:** ${fmtCurrency(stock.currentPrice)} (${pctText})`,
      `**Risk:** ${riskLabel(stock.volatility)}`,
    ];
    if (forecast) lines.push(`**News:** ${rumorLine(forecast.type, forecast.direction)}`);
    if (badge) lines.push(badge);

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${trend} ${stock.symbol} - ${stock.name}`),
          new TextDisplayBuilder().setContent(lines.join("\n")),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`stock_buy:${stock.symbol}`)
            .setLabel(stock.status === "ACTIVE" ? `Buy ${stock.symbol}` : "Sell only")
            .setStyle(stock.status === "ACTIVE" ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(trend)
            .setDisabled(stock.status !== "ACTIVE"),
        ),
    );
    if (index < stocks.length - 1) container.addSeparatorComponents(separator());
  });

  return container
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(STOCK_BANNER_URL).setDescription("Stock market banner"),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Use \`${prefix}stock buy <symbol> <qty>\`, \`${prefix}stock sell <symbol> <qty>\`, ` +
        `\`${prefix}stock portfolio\`, or \`${prefix}stock news\`.\n` +
        `${Mascot.Emotes.Alert} **Stocks are risky** — the market drifts down and any stock can delist to ` +
        `near-zero. Learn the rules first: \`${prefix}stock help\`.`,
      ),
    );
}

async function buildPortfolioContainer(discordId: string, username: string) {
  const pf = await getPortfolio(discordId);
  if (!pf || pf.holdings.length === 0) {
    return textContainer("Portfolio Empty", "You don't own any stocks.", 0xe74c3c);
  }

  let totalValue = 0;
  let totalCost = 0;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Graph} Stock Portfolio: ${username}`))
    .addSeparatorComponents(separator());

  pf.holdings.forEach((holding, index) => {
    const value = holding.stock.currentPrice * holding.quantity;
    const cost = holding.avgBuyPrice * holding.quantity;
    totalValue += value;
    totalCost += cost;
    const pnl = value - cost;
    const pnlIcon = pnl >= 0 ? Mascot.Emotes.GraphUp : Mascot.Emotes.GraphDown;
    const pnlText = pnl >= 0 ? `+${fmtCurrency(pnl)}` : `-${fmtCurrency(Math.abs(pnl))}`;

    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${pnlIcon} ${holding.stock.symbol} - ${holding.stock.name}`),
          new TextDisplayBuilder().setContent(
            `**Shares:** ${holding.quantity}\n` +
            `**Current:** ${fmtCurrency(holding.stock.currentPrice)} | **Avg:** ${fmtCurrency(holding.avgBuyPrice)}\n` +
            `**Value:** ${fmtCurrency(value)} (${pnlText})`,
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`stock_holding_${holding.stock.symbol}`)
            .setLabel(holding.stock.symbol)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(pnlIcon)
            .setDisabled(true),
        ),
    );
    if (index < pf.holdings.length - 1) container.addSeparatorComponents(separator());
  });

  const totalPnl = totalValue - totalCost;
  const totalPnlText = totalPnl >= 0 ? `+${fmtCurrency(totalPnl)}` : `-${fmtCurrency(Math.abs(totalPnl))}`;

  return container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Total Value:** ${fmtCurrency(totalValue)}\n**Total Profit/Loss:** ${totalPnlText}`,
      ),
    );
}

function buildHelpContainer(prefix: string) {
  // All numbers below are pulled from src/config/stockConfig.ts so the guide
  // stays in lockstep with the engine. If you retune the market, update here.
  const eventTable = [
    "EVENT        MOVE (per hit)      TELEGRAPHED   ODDS",
    "Minor Dip    -3% to -8%          no (instant)   38%",
    "Minor Gain   +2% to +6%          no (instant)   25%",
    "Slump        -2% to -4% / tick   yes, 3-6 ticks 16%",
    "Rally        +8% to +20%         yes            10%",
    "Crash        -15% to -35%        yes             9%",
    "Boom         +20% to +45%        yes             2%",
  ].join("\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.GraphUp} How the Stock Market Works\n` +
        `One **global market**, shared by every server. Prices update on a **30-minute tick**. ` +
        `The market is built to **drift downward** — passive buy-and-hold slowly bleeds, so you profit by ` +
        `**trading the rumors**, not by sitting on shares.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Graph} What moves a price each tick\n` +
        `**1. Baseline drift** — every tick each stock shifts a random **-3.0% to +0.5%**. ` +
        `The average is **negative** (a built-in house edge), and higher-volatility stocks ` +
        `swing *and* bleed harder.\n` +
        `**2. Events** — roughly a **30% base chance per tick** for a stock to trigger an event ` +
        `(rising with volatility, up to **85%**). Down-events outweigh up-events, which is why ` +
        `the market leans bearish.`,
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Alert} Event table\n` +
        "```\n" + eventTable + "\n```" +
        `Magnitudes are amplified further by a stock's volatility. **Telegraphed** events post as a ` +
        `**🔮 RUMOR** one tick (30 min) *before* they hit — but a rumor only comes true **~65%** of the ` +
        `time; the other **~35%** are **fakeouts** (no move). Check \`${prefix}stock news\` for live rumors.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Currency} Slippage (trading cost)\n` +
        `Your fill price moves against you based on order size vs. the stock's **liquidity**: ` +
        `**impact = 0.5 × (qty ÷ liquidity)**, capped at **40%**. Buys fill *above* the shown price, ` +
        `sells *below* it. A big order can cost up to **40% each way (80% round-trip)** — ` +
        `**keep each order well under the stock's liquidity.**`,
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.GraphDown} Delisting / bankruptcy\n` +
        `If a stock falls below **3% of its starting price** and stays there, it enters ` +
        `**DELISTING** (sell-only) after **4 ticks** and is fully **DELISTED** after **8 ticks**. ` +
        `On delisting, remaining holders are paid out at the crashed price (near-zero) and the stock is ` +
        `replaced by a fresh IPO. Prices have a hard floor of **1** and **do not auto-recover** — ` +
        `a dead stock can wipe your position.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Accept} Risk tiers\n` +
        `Each stock has a **volatility** rating that sets its swing size, event frequency and drift:\n` +
        `• **Stable** (vol ≤6) — e.g. FRTN, VEGA. Slow, small moves.\n` +
        `• **Moderate** (vol 7–12) — e.g. ACES.\n` +
        `• **High** (vol 13–24) — e.g. LUCK, CHIP, JACK. Big swings.\n` +
        `• **Extreme** (vol >24) — e.g. BUST. Biggest booms, and the ones most likely to delist to zero.`,
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Sparks} Strategy\n` +
        `• The market bleeds by default — **don't buy-and-hold blindly.**\n` +
        `• Trade the rumors: buy ahead of a **Rally/Boom**, dump before a **Crash/Slump** — but remember ` +
        `**~35% are fakeouts**, so never bet the farm on one.\n` +
        `• Size orders **below liquidity** to dodge slippage.\n` +
        `• Extreme-risk stocks can 2× or go near-zero — **only risk what you can afford to lose.**\n` +
        `• A single Crash can strip **15–35%** instantly; spread your bets.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Commands:** \`${prefix}stock\` (market) · \`${prefix}stock buy <sym> <qty>\` · ` +
        `\`${prefix}stock sell <sym> <qty>\` · \`${prefix}stock portfolio\` · \`${prefix}stock news\` · ` +
        `\`${prefix}my-stocks\` (holdings)`,
      ),
    );
}

async function buildNewsContainer() {
  const events = await getRecentEvents(12);
  if (events.length === 0) return textContainer("Market News", "No market activity yet. Check back after the next tick.");

  const lines = events.map((e) => {
    const tag = e.status === "FORECAST" ? "🔮 RUMOR" : "📰";
    return `${tag} **${e.symbol}** — ${rumorLine(e.type, e.direction)} (${e.magnitudePct >= 0 ? "+" : ""}${e.magnitudePct.toFixed(1)}%)`;
  });
  return textContainer("Market News & Rumors", lines.join("\n"));
}

export async function handleStock(message: Message, args: string[]) {
  if (!message.guildId) return;
  await initGlobalMarket();

  const sub = args[0]?.toLowerCase();
  const prefix = await getGuildPrefix(message.guildId);

  if (sub === "buy") {
    const symbol = args[1];
    const qty = parseInt(args[2], 10);
    if (!symbol || isNaN(qty)) {
      return message.reply({ components: [textContainer("Stock Purchase", `Usage: \`${prefix}stock buy <symbol> <quantity>\``)], flags: MessageFlags.IsComponentsV2 });
    }
    try {
      const res = await buyStock(message.author.id, symbol, qty);
      const buyContainer = textContainer("Stock Purchased",
        `Bought **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
        `(slippage ${res.impactPct.toFixed(1)}%).\nTotal **${fmtCurrency(res.cost)}**. You now own **${res.newQty}** shares.`,
        0x2ecc71)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("stock_trade", prefix)!));
      return message.reply({
        components: [buyContainer],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e: any) {
      return message.reply({ components: [textContainer("Purchase Failed", e.message, 0xe74c3c)], flags: MessageFlags.IsComponentsV2 });
    }
  }

  if (sub === "sell") {
    const symbol = args[1];
    const qty = parseInt(args[2], 10);
    if (!symbol || isNaN(qty)) {
      return message.reply({ components: [textContainer("Stock Sale", `Usage: \`${prefix}stock sell <symbol> <quantity>\``)], flags: MessageFlags.IsComponentsV2 });
    }
    try {
      const res = await sellStock(message.author.id, symbol, qty);
      const profitText = res.profit >= 0 ? `+${fmtCurrency(res.profit)}` : `-${fmtCurrency(Math.abs(res.profit))}`;
      const sellContainer = textContainer("Stock Sold",
        `Sold **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
        `(slippage ${res.impactPct.toFixed(1)}%).\nReceived **${fmtCurrency(res.value)}**. Profit/Loss: **${profitText}**.`,
        0x2ecc71)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("stock_trade", prefix)!));
      return message.reply({
        components: [sellContainer],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (e: any) {
      return message.reply({ components: [textContainer("Sale Failed", e.message, 0xe74c3c)], flags: MessageFlags.IsComponentsV2 });
    }
  }

  if (sub === "portfolio" || sub === "port") {
    return message.reply({ components: [await buildPortfolioContainer(message.author.id, message.author.username)], flags: MessageFlags.IsComponentsV2 });
  }

  if (sub === "news") {
    return message.reply({ components: [await buildNewsContainer()], flags: MessageFlags.IsComponentsV2 });
  }

  if (sub === "help" || sub === "guide" || sub === "rules" || sub === "?") {
    return message.reply({ components: [buildHelpContainer(prefix)], flags: MessageFlags.IsComponentsV2 });
  }

  // __dirname, not cwd — matches imageUtils/profileStyles and resolves to
  // dist/assets, so deploys don't have to ship src/ alongside the build.
  const file = new AttachmentBuilder(path.join(__dirname, "../../assets/stock_market.jpg"), { name: STOCK_BANNER_NAME });
  return message.reply({ components: [await buildMarketContainer(prefix)], files: [file], flags: MessageFlags.IsComponentsV2 });
}
