import {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import { getAllStocks, getPortfolio, buyStock, sellStock, initStocks } from "../../services/stockService";
import { fmtCurrency } from "../../utils/format";
import { getGuildConfig } from "../../services/guildConfigService";
import { Mascot } from "../../config/branding";

const STOCK_ACCENT_COLOR = 0x9B59B6;
const STOCK_BANNER_NAME = "stock_market.jpg";
const STOCK_BANNER_URL = `attachment://${STOCK_BANNER_NAME}`;

function separator() {
    return new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small);
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
    if (volatility > 20) return `${Mascot.Emotes.Alert} Extreme Risk`;
    if (volatility > 10) return `${Mascot.Emotes.Alert} High Risk`;
    if (volatility > 5) return `${Mascot.Emotes.Graph} Moderate`;
    return `${Mascot.Emotes.Accept} Stable`;
}

function buildMarketContainer(stocks: Awaited<ReturnType<typeof getAllStocks>>, emoji: string, prefix: string) {
    const container = new ContainerBuilder()
        .setAccentColor(STOCK_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${Mascot.Emotes.GraphUp} Global Stock Market\n` +
                `> Market prices refresh on this server's stock timer.\n` +
                `> Buy low, sell high, and keep an eye on volatility.`,
            ),
        )
        .addSeparatorComponents(separator());

    stocks.forEach((stock, index) => {
        const trend = stock.currentPrice >= stock.basePrice ? Mascot.Emotes.GraphUp : Mascot.Emotes.GraphDown;
        const change = stock.currentPrice - stock.basePrice;
        const changeText = change >= 0
            ? `+${fmtCurrency(change, emoji)} vs base`
            : `-${fmtCurrency(Math.abs(change), emoji)} vs base`;

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${trend} ${stock.symbol} - ${stock.name}`),
                    new TextDisplayBuilder().setContent(
                        `**Price:** ${fmtCurrency(stock.currentPrice, emoji)}\n` +
                        `**Risk:** ${riskLabel(stock.volatility)} (${stock.volatility}% volatility)\n` +
                        `**Movement:** ${changeText}`,
                    ),
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

        if (index < stocks.length - 1) {
            container.addSeparatorComponents(separator());
        }
    });

    return container
        .addSeparatorComponents(separator())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(STOCK_BANNER_URL)
                    .setDescription("Stock market banner"),
            ),
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `Use \`${prefix}stock buy <symbol> <qty>\`, \`${prefix}stock sell <symbol> <qty>\`, or \`${prefix}stock portfolio\`.`,
            ),
        );
}

async function buildPortfolioContainer(guildId: string, discordId: string, username: string, emoji: string) {
    const pf = await getPortfolio(guildId, discordId);
    if (!pf || pf.holdings.length === 0) {
        return textContainer("Portfolio Empty", "You don't own any stocks.", 0xE74C3C);
    }

    let totalValue = 0;
    let totalCost = 0;

    const container = new ContainerBuilder()
        .setAccentColor(STOCK_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Graph} Stock Portfolio: ${username}`),
        )
        .addSeparatorComponents(separator());

    pf.holdings.forEach((holding, index) => {
        const value = holding.stock.currentPrice * holding.quantity;
        const cost = holding.avgBuyPrice * holding.quantity;
        totalValue += value;
        totalCost += cost;

        const pnl = value - cost;
        const pnlIcon = pnl >= 0 ? Mascot.Emotes.GraphUp : Mascot.Emotes.GraphDown;
        const pnlText = pnl >= 0 ? `+${fmtCurrency(pnl, emoji)}` : `-${fmtCurrency(Math.abs(pnl), emoji)}`;

        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${pnlIcon} ${holding.stock.symbol} - ${holding.stock.name}`),
                    new TextDisplayBuilder().setContent(
                        `**Shares:** ${holding.quantity}\n` +
                        `**Current:** ${fmtCurrency(holding.stock.currentPrice, emoji)} | **Avg:** ${fmtCurrency(holding.avgBuyPrice, emoji)}\n` +
                        `**Value:** ${fmtCurrency(value, emoji)} (${pnlText})`,
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

        if (index < pf.holdings.length - 1) {
            container.addSeparatorComponents(separator());
        }
    });

    const totalPnl = totalValue - totalCost;
    const totalPnlText = totalPnl >= 0 ? `+${fmtCurrency(totalPnl, emoji)}` : `-${fmtCurrency(Math.abs(totalPnl), emoji)}`;

    return container
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Total Value:** ${fmtCurrency(totalValue, emoji)}\n` +
                `**Total Profit/Loss:** ${totalPnlText}`,
            ),
        );
}

export async function handleStock(message: Message, args: string[]) {
    if (!message.guildId) return;
    await initStocks(message.guildId);

    const sub = args[0]?.toLowerCase();
    const config = await getGuildConfig(message.guildId);
    const emoji = config.currencyEmoji || Mascot.Emotes.Blackcoin;
    const prefix = config.prefix || "!";

    if (sub === "buy") {
        const symbol = args[1];
        const qty = parseInt(args[2]);
        if (!symbol || isNaN(qty)) {
            return message.reply({
                components: [textContainer("Stock Purchase", `Usage: \`${prefix}stock buy <symbol> <quantity>\``)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        try {
            const res = await buyStock(message.guildId, message.author.id, symbol, qty);
            return message.reply({
                components: [
                    textContainer(
                        "Stock Purchased",
                        `Bought **${qty}x ${res.stock.symbol}** for **${fmtCurrency(res.cost, emoji)}**.\nYou now own **${res.newQty}** shares.`,
                        0x2ECC71,
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e: any) {
            return message.reply({
                components: [textContainer("Purchase Failed", e.message, 0xE74C3C)],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }

    if (sub === "sell") {
        const symbol = args[1];
        const qty = parseInt(args[2]);
        if (!symbol || isNaN(qty)) {
            return message.reply({
                components: [textContainer("Stock Sale", `Usage: \`${prefix}stock sell <symbol> <quantity>\``)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        try {
            const res = await sellStock(message.guildId, message.author.id, symbol, qty);
            const profitText = res.profit >= 0 ? `+${fmtCurrency(res.profit, emoji)}` : `-${fmtCurrency(Math.abs(res.profit), emoji)}`;
            return message.reply({
                components: [
                    textContainer(
                        "Stock Sold",
                        `Sold **${qty}x ${res.stock.symbol}** for **${fmtCurrency(res.value, emoji)}**.\nProfit/Loss: **${profitText}**.`,
                        0x2ECC71,
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e: any) {
            return message.reply({
                components: [textContainer("Sale Failed", e.message, 0xE74C3C)],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }

    if (sub === "portfolio" || sub === "port") {
        return message.reply({
            components: [await buildPortfolioContainer(message.guildId, message.author.id, message.author.username, emoji)],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    const stocks = await getAllStocks(message.guildId);
    const file = new AttachmentBuilder("./src/assets/stock_market.jpg", { name: STOCK_BANNER_NAME });

    return message.reply({
        components: [buildMarketContainer(stocks, emoji, prefix)],
        files: [file],
        flags: MessageFlags.IsComponentsV2,
    });
}
