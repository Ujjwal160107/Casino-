import { Message } from "discord.js";
import { ensureBankForUser } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { ensureUserAndWallet } from "../../services/walletService";
import { balanceEmbed, errorEmbed } from "../../utils/embed";

export async function handleBalance(message: Message) {
  const targetUser = message.mentions.users.first() ?? message.author;
  const guildId = message.guildId;

  if (!guildId) return;

  if (targetUser.bot) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Error", "Bots do not have wallets.")]
    });
  }

  const user = await ensureUserAndWallet(targetUser.id, guildId, targetUser.tag);
  const bank = await ensureBankForUser(user.discordId, targetUser.tag);
  const config = await getGuildConfig(guildId);

  return message.reply({
    embeds: [
      balanceEmbed(
        targetUser,
        user.wallet?.balance ?? 0,
        bank.balance,
        config.currencyEmoji
      )
    ]
  });
}
