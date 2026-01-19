
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
      { name: "💰 Economy", value: "`/balance` - Check balance\n`/deposit` - Deposit to bank\n`/withdraw` - Withdraw from bank\n`/transfer` - Send money\n`/shop` - View shop\n`/buy` - Buy items\n`/inventory` - View items" },
      { name: "🎲 Games", value: "`/blackjack` - Play Blackjack\n`/slots` - Play Slots\n`/roulette` - Play Roulette\n`/coinflip` - Flip a coin\n`/cockfight` - Challenge user\n`/russianroulette` - Play Russian Roulette" },
      { name: "🧬 Life", value: "`/work` - Work shift\n`/jobs` - Browse jobs\n`/crime` - Commit crime\n`/education` - View education\n`/degrees` - View degrees" },
      { name: "🛠 Admin", value: "`/add-money` - Add funds\n`/set-income` - Config income\n`/setup` - Config server" }
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}