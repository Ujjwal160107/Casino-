import { Message } from "discord.js";
import { getPortfolio } from "../../services/stockService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { errorContainer, plainContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";

export async function handleMyStocks(message: Message) {
    if (!message.guildId) return;

    const pf = await getPortfolio(message.author.id);
    if (!pf || pf.holdings.length === 0) {
        return message.reply(v2Reply(errorContainer("Portfolio Empty", "You don't own any stocks.")));
    }

    let totalValue = 0;
    let totalCost = 0;

    const lines = pf.holdings.map(h => {
        const val = h.stock.currentPrice * h.quantity;
        const cost = h.avgBuyPrice * h.quantity;
        totalValue += val;
        totalCost += cost;

        const pnl = val - cost;
        const pnlIcon = pnl >= 0 ? Mascot.Emotes.Graph : Mascot.Emotes.GraphDown;
        const pnlStr = pnl >= 0 ? `+${fmtCurrency(pnl)}` : `-${fmtCurrency(Math.abs(pnl))}`;

        return `**${h.stock.symbol}**: ${h.quantity} shares @ ${fmtCurrency(h.stock.currentPrice)} (Avg: ${h.avgBuyPrice})\nValue: **${fmtCurrency(val)}** (${pnlIcon} ${pnlStr})`;
    });

    const totalPnl = totalValue - totalCost;
    const totalPnlStr = totalPnl >= 0 ? `+${fmtCurrency(totalPnl)}` : `-${fmtCurrency(Math.abs(totalPnl))}`;

    const body = `**Total Value:** ${fmtCurrency(totalValue)}\n**Total Profit:** ${totalPnlStr}\n\n${lines.join("\n\n")}`;
    const container = plainContainer(
        `## 📊 Stock Portfolio: ${message.author.username}\n${body}`,
        nextStepHint("mystocks")!,
    );

    return message.reply(v2Reply(container));
}
