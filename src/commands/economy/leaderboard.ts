import { Message, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, fmtAmount } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleLeaderboard(message: Message, args: string[]) {
  const config = await getGuildConfig(message.guildId!);
  const emoji = config.currencyEmoji;
  const eGraphRaw = emojiInline("graph", message.guild) || "📈";
  const eWalletRaw = emojiInline("wallet", message.guild) || "👛";
  const eMedal1 = emojiInline("medal1", message.guild) || "🥇";
  const eMedal2 = emojiInline("medal2", message.guild) || "🥈";
  const eMedal3 = emojiInline("medal3", message.guild) || "🥉";
  const parseBtnEmoji = (raw: string) => raw.match(/:(\d+)>/)?.[1] ?? (raw.match(/^\d+$/) ? raw : raw);
  const btnGraph = parseBtnEmoji(eGraphRaw);
  const btnWallet = parseBtnEmoji(eWalletRaw);
  let initialType = "net";
  if (args[0]?.toLowerCase() === "cash") initialType = "cash";

  if (args[0]?.toLowerCase() === "work" || args[0]?.toLowerCase() === "shift" || args[0]?.toLowerCase() === "employee") initialType = "employees";
  let currentType = initialType;
  const users = await prisma.user.findMany({
    where: { guildId: message.guildId! },
    include: { wallet: true, bank: true },
  });
  const getSorted = (t: string) => {
    return [...users].sort((a, b) => {
      if (t === "employees") {
        return (b.shiftsWorked || 0) - (a.shiftsWorked || 0);
      }
      const netA = (a.wallet?.balance ?? 0) + (t === "net" ? (a.bank?.balance ?? 0) : 0);
      const netB = (b.wallet?.balance ?? 0) + (t === "net" ? (b.bank?.balance ?? 0) : 0);
      return netB - netA;
    });
  };


  const getEmbedData = (t: string, sortedUsers: any[]) => {
    const top10 = sortedUsers.slice(0, 10);
    const desc = top10.map((u, i) => {
      let valStr = "";
      if (t === "employees") {
        valStr = `${u.shiftsWorked || 0} Shifts`;
      } else {
        const val = (u.wallet?.balance ?? 0) + (t === "net" ? (u.bank?.balance ?? 0) : 0);
        valStr = fmtCurrency(val, emoji);
      }
      let rankDisplay = `**${i + 1}.**`;
      if (i === 0) rankDisplay = eMedal1;
      if (i === 1) rankDisplay = eMedal2;
      if (i === 2) rankDisplay = eMedal3;
      return `${rankDisplay} **${u.username}** — ${valStr}`;
    }).join("\n");
    let title = "";
    let thumbUrl = null;
    if (t === "net") {
      title = `Net Worth Leaderboard`;
      thumbUrl = getEmoteUrl(Mascot.Emotes.Money); // Or Think as it was before? "Think" was inline. Money fits Net Worth better.
      // Actually original was Think. Let's use Money for "Net Worth".
      // Wait, "Think" was used for Net Worth in the file I viewed. 
      // "Think" seems weird for LB. "Money" is better.
      thumbUrl = getEmoteUrl(Mascot.Emotes.Money);
    }
    else if (t === "cash") {
      title = `Cash Leaderboard`;
      thumbUrl = getEmoteUrl(Mascot.Emotes.Money);
    } else if (t === "employees") {
      title = `Hardest Workers`;
      thumbUrl = getEmoteUrl(Mascot.Emotes.JobWorking);
    }
    return { title, desc, topUsers: top10, thumbUrl };
  };
  const initialSorted = getSorted(currentType);
  if (initialSorted.length === 0) {
    // Just some safety, though usually empty array is fine
  }

  const { title, desc, thumbUrl } = getEmbedData(currentType, initialSorted);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(Mascot.Colors.Base as any)
    .setDescription(desc || "No users found.")
    .setFooter({ text: `${Mascot.Name} • Top 10 Leaders` });

  if (thumbUrl) embed.setThumbnail(thumbUrl);
  const getButtons = (activeType: string) => {
    const bNet = new ButtonBuilder().setCustomId("lb_net").setLabel("Net Worth").setStyle(activeType === "net" ? ButtonStyle.Primary : ButtonStyle.Secondary);
    const bCash = new ButtonBuilder().setCustomId("lb_cash").setLabel("Cash Only").setStyle(activeType === "cash" ? ButtonStyle.Primary : ButtonStyle.Secondary);

    const bWork = new ButtonBuilder().setCustomId("lb_employees").setLabel("Top Employees").setStyle(activeType === "employees" ? ButtonStyle.Primary : ButtonStyle.Secondary);
    try { bNet.setEmoji(btnGraph); } catch { bNet.setEmoji("📈"); }
    try { bCash.setEmoji(btnWallet); } catch { bCash.setEmoji("👛"); }

    try { bWork.setEmoji(Mascot.Emotes.JobWorking); } catch { }
    return new ActionRowBuilder<ButtonBuilder>().addComponents(bNet, bCash, bWork);
  };
  const sent = await message.reply({ embeds: [embed], components: [getButtons(currentType)] });
  const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on("collect", async (i) => {
    if (i.customId === "lb_net") currentType = "net";
    if (i.customId === "lb_cash") currentType = "cash";

    if (i.customId === "lb_employees") currentType = "employees";
    const newSorted = getSorted(currentType);
    const { title: newTitle, desc: newDesc, thumbUrl: newThumb } = getEmbedData(currentType, newSorted);
    embed.setTitle(newTitle).setDescription(newDesc).setFooter({ text: `${Mascot.Name} • Top 10 Leaders` });
    if (newThumb) embed.setThumbnail(newThumb);
    else embed.setThumbnail(null);
    await i.update({ embeds: [embed], components: [getButtons(currentType)] });
  });
  collector.on("end", () => {
    try {
      const disabledRow = getButtons(currentType);
      disabledRow.components.forEach(c => c.setDisabled(true));
      sent.edit({ components: [disabledRow] }).catch(() => { });
    } catch { }
  });
}
