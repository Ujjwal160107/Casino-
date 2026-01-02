"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLeaderboard = handleLeaderboard;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const emojiRegistry_1 = require("../../utils/emojiRegistry");
const branding_1 = require("../../config/branding");
async function handleLeaderboard(message, args) {
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const eGraphRaw = (0, emojiRegistry_1.emojiInline)("graph", message.guild) || "📈";
    const eWalletRaw = (0, emojiRegistry_1.emojiInline)("wallet", message.guild) || "👛";
    const eMedal1 = (0, emojiRegistry_1.emojiInline)("medal1", message.guild) || "🥇";
    const eMedal2 = (0, emojiRegistry_1.emojiInline)("medal2", message.guild) || "🥈";
    const eMedal3 = (0, emojiRegistry_1.emojiInline)("medal3", message.guild) || "🥉";
    const parseBtnEmoji = (raw) => raw.match(/:(\d+)>/)?.[1] ?? (raw.match(/^\d+$/) ? raw : raw);
    const btnGraph = parseBtnEmoji(eGraphRaw);
    const btnWallet = parseBtnEmoji(eWalletRaw);
    let initialType = "net";
    if (args[0]?.toLowerCase() === "cash")
        initialType = "cash";
    if (args[0]?.toLowerCase() === "level" || args[0]?.toLowerCase() === "xp")
        initialType = "level";
    if (args[0]?.toLowerCase() === "work" || args[0]?.toLowerCase() === "shift" || args[0]?.toLowerCase() === "employee")
        initialType = "employees";
    let currentType = initialType;
    const users = await prisma_1.default.user.findMany({
        where: { guildId: message.guildId },
        include: { wallet: true, bank: true },
    });
    const getSorted = (t) => {
        return [...users].sort((a, b) => {
            if (t === "level") {
                if (b.level !== a.level)
                    return b.level - a.level;
                return b.xp - a.xp;
            }
            if (t === "employees") {
                return (b.shiftsWorked || 0) - (a.shiftsWorked || 0);
            }
            const netA = (a.wallet?.balance ?? 0) + (t === "net" ? (a.bank?.balance ?? 0) : 0);
            const netB = (b.wallet?.balance ?? 0) + (t === "net" ? (b.bank?.balance ?? 0) : 0);
            return netB - netA;
        });
    };
    const getEmbedData = (t, sortedUsers) => {
        const top10 = sortedUsers.slice(0, 10);
        const desc = top10.map((u, i) => {
            let valStr = "";
            if (t === "level") {
                valStr = `Level ${u.level} (${(0, format_1.fmtAmount)(u.xp)} XP)`;
            }
            else if (t === "employees") {
                valStr = `${u.shiftsWorked || 0} Shifts`;
            }
            else {
                const val = (u.wallet?.balance ?? 0) + (t === "net" ? (u.bank?.balance ?? 0) : 0);
                valStr = (0, format_1.fmtCurrency)(val, emoji);
            }
            let rankDisplay = `**${i + 1}.**`;
            if (i === 0)
                rankDisplay = eMedal1;
            if (i === 1)
                rankDisplay = eMedal2;
            if (i === 2)
                rankDisplay = eMedal3;
            return `${rankDisplay} **${u.username}** — ${valStr}`;
        }).join("\n");
        let title = "";
        let thumbUrl = null;
        if (t === "net") {
            title = `Net Worth Leaderboard`;
            thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money); // Or Think as it was before? "Think" was inline. Money fits Net Worth better.
            // Actually original was Think. Let's use Money for "Net Worth".
            // Wait, "Think" was used for Net Worth in the file I viewed. 
            // "Think" seems weird for LB. "Money" is better.
            thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
        }
        else if (t === "cash") {
            title = `Cash Leaderboard`;
            thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Money);
        }
        else if (t === "employees") {
            title = `Hardest Workers`;
            thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.JobWorking);
        }
        else {
            title = `Level Leaderboard`;
            thumbUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Success); // Sparkle for levels?
        }
        return { title, desc, topUsers: top10, thumbUrl };
    };
    const initialSorted = getSorted(currentType);
    if (initialSorted.length === 0) {
        // Just some safety, though usually empty array is fine
    }
    const { title, desc, thumbUrl } = getEmbedData(currentType, initialSorted);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle(title)
        .setColor(branding_1.Mascot.Colors.Base)
        .setDescription(desc || "No users found.")
        .setFooter({ text: `${branding_1.Mascot.Name} • Top 10 Leaders` });
    if (thumbUrl)
        embed.setThumbnail(thumbUrl);
    const getButtons = (activeType) => {
        const bNet = new discord_js_1.ButtonBuilder().setCustomId("lb_net").setLabel("Net Worth").setStyle(activeType === "net" ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary);
        const bCash = new discord_js_1.ButtonBuilder().setCustomId("lb_cash").setLabel("Cash Only").setStyle(activeType === "cash" ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary);
        const bLevel = new discord_js_1.ButtonBuilder().setCustomId("lb_level").setLabel("Levels").setStyle(activeType === "level" ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary);
        const bWork = new discord_js_1.ButtonBuilder().setCustomId("lb_employees").setLabel("Top Employees").setStyle(activeType === "employees" ? discord_js_1.ButtonStyle.Primary : discord_js_1.ButtonStyle.Secondary);
        try {
            bNet.setEmoji(btnGraph);
        }
        catch {
            bNet.setEmoji("📈");
        }
        try {
            bCash.setEmoji(btnWallet);
        }
        catch {
            bCash.setEmoji("👛");
        }
        try {
            bLevel.setEmoji("⭐");
        }
        catch { }
        try {
            bWork.setEmoji(branding_1.Mascot.Emotes.JobWorking);
        }
        catch { }
        return new discord_js_1.ActionRowBuilder().addComponents(bNet, bCash, bLevel, bWork);
    };
    const sent = await message.reply({ embeds: [embed], components: [getButtons(currentType)] });
    const collector = sent.createMessageComponentCollector({ componentType: discord_js_1.ComponentType.Button, time: 60000 });
    collector.on("collect", async (i) => {
        if (i.customId === "lb_net")
            currentType = "net";
        if (i.customId === "lb_cash")
            currentType = "cash";
        if (i.customId === "lb_level")
            currentType = "level";
        if (i.customId === "lb_employees")
            currentType = "employees";
        const newSorted = getSorted(currentType);
        const { title: newTitle, desc: newDesc, thumbUrl: newThumb } = getEmbedData(currentType, newSorted);
        embed.setTitle(newTitle).setDescription(newDesc).setFooter({ text: `${branding_1.Mascot.Name} • Top 10 Leaders` });
        if (newThumb)
            embed.setThumbnail(newThumb);
        else
            embed.setThumbnail(null);
        await i.update({ embeds: [embed], components: [getButtons(currentType)] });
    });
    collector.on("end", () => {
        try {
            const disabledRow = getButtons(currentType);
            disabledRow.components.forEach(c => c.setDisabled(true));
            sent.edit({ components: [disabledRow] }).catch(() => { });
        }
        catch { }
    });
}
//# sourceMappingURL=leaderboard.js.map