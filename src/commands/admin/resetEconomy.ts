import { Message, PermissionsBitField } from "discord.js";
import prisma from "../../utils/prisma";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { logToChannel } from "../../utils/discordLogger";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getGuildConfig } from "../../services/guildConfigService";

import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleResetEconomy(message: Message, args: string[]) {
  try {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
      return message.reply({ embeds: [errorEmbed(message.author, "No Permission", "Admins or Bot Commanders only.")] });
    }
    const config = await getGuildConfig(message.guildId!);
    const token = args[0]?.toLowerCase();
    if (token !== "confirm") {
      const embed = errorEmbed(message.author, "Confirmation Required", `This will wipe wallets, banks, transactions and audits. Run \`${config.prefix}reseteconomy confirm\` to proceed.`);
      const shockedUrl = getEmoteUrl(Mascot.Emotes.Shocked);
      if (shockedUrl) embed.setThumbnail(shockedUrl);

      return message.reply({
        embeds: [embed]
      });
    }
    try {
      await prisma.$transaction([
        prisma.transaction.deleteMany({}),
        prisma.audit.deleteMany({}),
        prisma.wallet.updateMany({ data: { balance: 0 } }),
        prisma.bank.updateMany({ data: { balance: 0 } }),
        prisma.inventory.deleteMany({}),
        prisma.marketListing.deleteMany({}),
        prisma.loan.deleteMany({}),
        prisma.investment.deleteMany({}),
        prisma.user.updateMany({ data: { creditScore: 500 } })
      ]);
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "🔥 ECONOMY RESET 🔥",
        description: `**Admin:** ${message.author.tag} (${message.author.id})\n\nALL user data, wallets, banks, investments, and items were wiped.`,
        color: 0x000000
      });

      const embed = successEmbed(message.author, "Economy Reset", "All wallets, banks, inventories & items zeroed; transactions & audits deleted.");
      const shockedUrl = getEmoteUrl(Mascot.Emotes.Shocked);
      if (shockedUrl) embed.setThumbnail(shockedUrl);

      return message.reply({
        embeds: [embed]
      });
    } catch (innerErr) {
      console.error("Reset transaction failed:", innerErr);
      return message.reply({
        embeds: [errorEmbed(message.author, "Reset Failed", "Failed while resetting. Check server logs.")]
      });
    }
  } catch (err) {
    console.error("handleResetEconomy error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Internal Error", "Failed to reset economy.")] });
  }
}