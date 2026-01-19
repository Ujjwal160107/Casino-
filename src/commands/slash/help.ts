
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("List all available commands");

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("📖 Casino Bot Commands")
    .setDescription("All commands are now available as top-level slash commands!")
    .setColor(Colors.Gold)
    .addFields(
      { name: "💰 Economy", value: "`/balance` `/deposit` `/withdraw` `/transfer` `/shop` `/buy` `/inventory` `/use` `/bank` `/credit` `/profile`" },
      { name: "🏠 Properties", value: "`/properties` `/buy-property` `/my-properties` `/collect-rent`" },
      { name: "💍 Social", value: "`/marry` `/divorce` `/family`" },
      { name: "📈 Stocks", value: "`/stocks` `/buy-stock` `/sell-stock` `/my-stocks`" },
      { name: "🎲 Games", value: "`/blackjack` `/slots` `/roulette` `/coinflip` `/cockfight` `/russianroulette`" },
      { name: "🧬 Life", value: "`/work` `/jobs` `/crime` `/black-market` `/education` `/degrees`" },
      { name: "🛠 Admin", value: "`/add-money` `/set-income` `/setup`" }
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}