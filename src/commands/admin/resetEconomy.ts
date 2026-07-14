import { Message, PermissionsBitField } from "discord.js";
import prisma from "../../utils/prisma";
import { successContainer, errorContainer, v2Reply } from "../../utils/componentsV2";
import { logToChannel } from "../../utils/discordLogger";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";

import { Mascot, getEmoteUrl } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";

export async function handleResetEconomy(message: Message, args: string[]) {
  try {
    if (!message.member || !(await canExecuteAdminCommand(message, message.member))) {
      return message.reply(v2Reply(errorContainer("No Permission", "Admins or Bot Commanders only.")));
    }
    const prefix = await getGuildPrefix(message.guildId!);
    const token = args[0]?.toLowerCase();
    const shockedUrl = getEmoteUrl(Mascot.Emotes.Shocked) ?? undefined;
    if (token !== "confirm") {
      return message.reply(v2Reply(errorContainer(
        "Confirmation Required",
        `This will wipe wallets, banks, transactions and audits. Run \`${prefix}reseteconomy confirm\` to proceed.`,
        { thumbnailUrl: shockedUrl }
      )));
    }
    try {
      await prisma.$transaction([
        prisma.transaction.deleteMany({}),
        prisma.audit.deleteMany({}),
        prisma.wallet.updateMany({ data: { balance: 0 } }),
        prisma.bank.updateMany({ data: { balance: 0 } }),
        prisma.inventory.deleteMany({}),
        prisma.marketListing.deleteMany({}),
        prisma.cardTransaction.deleteMany({}),
        prisma.cardStatement.deleteMany({}),
        prisma.creditCard.deleteMany({}),
        prisma.investment.deleteMany({}),
        prisma.user.updateMany({ data: { creditScore: 500 } })
      ]);
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ADMIN",
        title: "ECONOMY RESET",
        description: `**Admin:** ${message.author.tag} (${message.author.id})\n\nALL user data, wallets, banks, investments, and items were wiped.`,
        color: 0x000000
      });

      return message.reply(v2Reply(successContainer(
        "Economy Reset",
        "All wallets, banks, inventories & items zeroed; transactions & audits deleted.",
        { thumbnailUrl: shockedUrl }
      )));
    } catch (innerErr) {
      console.error("Reset transaction failed:", innerErr);
      return message.reply(v2Reply(errorContainer("Reset Failed", "Failed while resetting. Check server logs.")));
    }
  } catch (err) {
    console.error("handleResetEconomy error:", err);
    return message.reply(v2Reply(errorContainer("Internal Error", "Failed to reset economy.")));
  }
}
