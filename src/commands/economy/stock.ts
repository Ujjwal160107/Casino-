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

const STOCK_ACCENT_COLOR = 0x9b59b6;
const STOCK_BANNER_NAME = "stock_market.jpg";
const STOCK_BANNER_URL = `attachment://${STOCK_BANNER_NAME}`;

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function textContainer(title: string, body: string, color = STOCK_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(color)
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
    .setAccentColor(STOCK_ACCENT_COLOR)
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
            .setCustomId(`stock_info_${stock.symbol}`)
            .setLabel(stock.symbol)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(trend)
            .setDisabled(true),
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
        `\`${prefix}stock portfolio\`, or \`${prefix}stock news\`.`,
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
    .setAccentColor(STOCK_ACCENT_COLOR)
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
      return message.reply({
        components: [textContainer("Stock Purchased",
          `Bought **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
          `(slippage ${res.impactPct.toFixed(1)}%).\nTotal **${fmtCurrency(res.cost)}**. You now own **${res.newQty}** shares.`,
          0x2ecc71)],
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
      return message.reply({
        components: [textContainer("Stock Sold",
          `Sold **${qty}x ${res.stock.symbol}** at avg **${fmtCurrency(res.avgPrice)}**/share ` +
          `(slippage ${res.impactPct.toFixed(1)}%).\nReceived **${fmtCurrency(res.value)}**. Profit/Loss: **${profitText}**.`,
          0x2ecc71)],
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

  const file = new AttachmentBuilder("./src/assets/stock_market.jpg", { name: STOCK_BANNER_NAME });
  return message.reply({ components: [await buildMarketContainer(prefix)], files: [file], flags: MessageFlags.IsComponentsV2 });
}
