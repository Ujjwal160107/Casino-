import { Message, EmbedBuilder, Colors } from "discord.js";
import { getEmoteUrl } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { runIncomeCommand } from "../../services/incomeService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed, baseEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { Mascot } from "../../config/branding";

export async function handleIncome(message: Message) {
  const [cmd] = message.content.slice(1).split(/\s+/);
  const commandKey = cmd.toLowerCase();

  if (!["work", "crime", "beg", "slut"].includes(commandKey)) {
    return message.reply({ embeds: [errorEmbed(message.author, "Unknown", "Use: !work, !crime, !beg or !slut")] });
  }

  const config = await getGuildConfig(message.guildId!);
  const emoji = config.currencyEmoji;
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);

  try {
    const res = await runIncomeCommand({
      commandKey,
      discordId: message.author.id,
      guildId: message.guildId ?? null,
      userId: user.id,
      walletId: user.wallet!.id
    });

    if (res.success) {
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ECONOMY",
        title: `Income Success (${commandKey})`,
        description: `**User:** ${message.author.tag}\n**Amount:** ${fmtCurrency(res.amount, emoji)}`,
        color: 0x00FF00
      });

      const branded = successEmbed(message.author, `${commandKey.toUpperCase()} SUCCESS`, `You earned **${fmtCurrency(res.amount, emoji)}**!`);
      const moneyUrl = getEmoteUrl(Mascot.Emotes.Money);
      if (moneyUrl) branded.setThumbnail(moneyUrl);

      return message.reply({ embeds: [branded] });

    } else {
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ECONOMY",
        title: `Income Failed (${commandKey})`,
        description: `**User:** ${message.author.tag}\n**Penalty:** ${fmtCurrency(Math.abs(res.amount), emoji)}`,
        color: 0xFF0000
      });
      return message.reply({
        embeds: [errorEmbed(message.author, `${commandKey.toUpperCase()} FAILED`, `You lost **${fmtCurrency(Math.abs(res.amount), emoji)}**!`)]
      });
    }
  } catch (err) {
    // Cooldown or other errors
    const isCooldown = (err as Error).message.toLowerCase().includes("wait");
    if (isCooldown) {
      const branded = errorEmbed(message.author, "Cooldown Active", (err as Error).message);
      const angryUrl = getEmoteUrl(Mascot.Emotes.Angry);
      if (angryUrl) branded.setThumbnail(angryUrl);
      return message.reply({ embeds: [branded] });
    }
    return message.reply({ embeds: [errorEmbed(message.author, "Error", (err as Error).message)] });
  }
}