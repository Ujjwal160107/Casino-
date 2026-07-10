import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { errorEmbed } from "../../utils/embed";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { getGuildPrefix } from "../../utils/guildContext";
import { isAskBlocked, unblockRequester } from "../../services/askService";

export async function handleAsk(message: Message, args: string[]) {
  if (!message.guild) return;
  const prefix = await getGuildPrefix(message.guild.id);

  if (args[0]?.toLowerCase() === "unblock") {
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      return message.reply({
        embeds: [errorEmbed(message.author, "Invalid Usage", `Usage: \`${prefix}ask unblock @user\``)],
      });
    }
    const removed = await unblockRequester(message.author.id, targetUser.id);
    return message.reply(
      removed
        ? `Unblocked **${targetUser.username}**. They can ask you for money again.`
        : `**${targetUser.username}** was not on your block list.`,
    );
  }

  const targetUser = message.mentions.users.first();
  const amountStr = args.find((a) => !a.startsWith("<@") && !isNaN(parseSmartAmount(a)));
  const amount = amountStr ? parseSmartAmount(amountStr) : 0;
  const reasonIndex = args.indexOf(amountStr || "") + 1;
  const reason = args.slice(reasonIndex).join(" ") || "No reason provided";

  if (!targetUser || amount <= 0) {
    return message.reply({
      embeds: [errorEmbed(
        message.author,
        "Invalid Usage",
        `Usage: \`${prefix}ask @user <amount> [reason]\`\n` +
        `Example: \`${prefix}ask @Friend 100 For pizza\`\n` +
        `Unblock: \`${prefix}ask unblock @user\``,
      )],
    });
  }
  if (targetUser.id === message.author.id) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Target", "You cannot ask yourself for money.")] });
  }
  if (targetUser.bot) {
    return message.reply({ embeds: [errorEmbed(message.author, "Invalid Target", "You cannot ask bots for money.")] });
  }

  if (await isAskBlocked(targetUser.id, message.author.id)) {
    return message.reply({
      embeds: [errorEmbed(
        message.author,
        "Blocked",
        `You are blocked from asking **${targetUser.username}** for money. They must run \`${prefix}ask unblock @${message.author.username}\` to allow requests again.`,
      )],
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("💸 Money Request")
    .setDescription(`**${message.author.username}** is asking **${targetUser.username}** for money.`)
    .addFields(
      { name: "Amount", value: `${fmtCurrency(amount)}`, inline: true },
      { name: "Reason", value: reason, inline: true },
    )
    .setColor(0xFFFF00)
    .setFooter({ text: "Accept transfers immediately. Block prevents future requests from this user." });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ask_accept:${message.author.id}:${amount}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ask_decline:${message.author.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ask_block:${message.author.id}`)
      .setLabel("Block")
      .setStyle(ButtonStyle.Secondary),
  );

  return (message.channel as any).send({
    content: `<@${targetUser.id}>`,
    embeds: [embed],
    components: [row],
  });
}
