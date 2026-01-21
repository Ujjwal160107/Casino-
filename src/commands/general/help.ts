import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Colors,
  PermissionsBitField,
  GuildMember,
  ButtonInteraction,
  StringSelectMenuInteraction,
  AttachmentBuilder
} from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot, getEmoteUrl } from "../../config/branding";
import path from "path";

interface CommandInfo {
  name: string;
  aliases: string[];
  description: string;
}

interface CategoryData {
  id: string;
  label: string;
  description: string;
  emoji: string;
  commands: CommandInfo[];
}

export async function handleHelp(message: Message) {
  const config = await getGuildConfig(message.guildId!);
  const prefix = config.prefix || "!";

  // Use Love emote for thumbnail
  const thumbnail = getEmoteUrl(Mascot.Emotes.Love);

  // --- 1. Define Categories & Commands ---
  // Note: We list the primary command in 'name' and strictly alternative aliases in 'aliases'.
  // The router handles hyphenated vs non-hyphenated, so we display the most readable version (usually hyphenated or single word).

  const lifeCommands: CommandInfo[] = [
    { name: "work", aliases: ["job"], description: "Work a shift at your job." },
    { name: "my-job", aliases: ["myjob"], description: "View your current job status." },
    { name: "jobs", aliases: ["joblist", "careers"], description: "List available jobs." },
    { name: "apply", aliases: [], description: "Apply for a job (e.g., `!apply Janitor`)." },
    { name: "education", aliases: ["school"], description: "View education status." },
    { name: "study", aliases: [], description: "Study to increase intelligence." },
    { name: "enroll", aliases: [], description: "Enroll in a university program." },
    { name: "marry", aliases: ["propose"], description: "Propose to another user." },
    { name: "family", aliases: ["spouse"], description: "View your family details." },
    { name: "divorce", aliases: [], description: "Divorce your current spouse." },
    { name: "properties", aliases: ["realestate"], description: "View available properties." },
    { name: "buy-property", aliases: ["buyprop"], description: "Buy a listed property." },
    { name: "my-properties", aliases: ["portfolio"], description: "View your owned properties." },
    { name: "collect-rent", aliases: ["rent"], description: "Collect rent from your properties." }
  ];

  const economyCommands: CommandInfo[] = [
    { name: "balance", aliases: ["bal"], description: "Check your wallet and bank balance." },
    { name: "deposit", aliases: ["dep"], description: "Deposit cash into your bank." },
    { name: "withdraw", aliases: ["with"], description: "Withdraw cash from your bank." },
    { name: "transfer", aliases: ["give", "pay"], description: "Transfer money to another user." },
    { name: "bank", aliases: [], description: "View detailed bank info." },
    { name: "daily", aliases: [], description: "Claim daily reward." },
    { name: "weekly", aliases: [], description: "Claim weekly reward." },
    { name: "monthly", aliases: [], description: "Claim monthly reward." },
    { name: "shop", aliases: ["store"], description: "View the item shop." },
    { name: "buy", aliases: [], description: "Buy an item from the shop." },
    { name: "inventory", aliases: ["inv"], description: "View your items." },
    { name: "use", aliases: [], description: "Use an item from inventory." },
    { name: "equip", aliases: [], description: "Equip an item." },
    { name: "rob", aliases: ["steal"], description: "Attempt to rob a user." },
    { name: "crime", aliases: [], description: "Commit a crime for cash." },
    { name: "beg", aliases: [], description: "Beg for some change." },
    { name: "slut", aliases: [], description: "Risky income method." },
    { name: "market", aliases: ["bm"], description: "Access the black market." },
    { name: "stock", aliases: ["stocks"], description: "View the stock market." },
    { name: "leaderboard", aliases: ["lb", "top"], description: "View server wealth leaderboard." },
    { name: "credit", aliases: ["score"], description: "Check your credit score." },
  ];

  const casinoCommands: CommandInfo[] = [
    { name: "bet", aliases: ["roulette"], description: "Play roulette." },
    { name: "blackjack", aliases: ["bj"], description: "Play blackjack." },
    { name: "slots", aliases: [], description: "Spin the slot machine." },
    { name: "coinflip", aliases: ["cf"], description: "Flip a coin." },
    { name: "cockfight", aliases: [], description: "Bet on a cockfight." },
    { name: "chicken", aliases: [], description: "Manage your fighting chicken." },
    { name: "russian-roulette", aliases: ["rr"], description: "High stakes survival game." },
    { name: "casino-guide", aliases: ["games"], description: "Detailed guide for casino games." }
  ];

  const generalCommands: CommandInfo[] = [
    { name: "help", aliases: [], description: "Show this menu." },
    { name: "guide", aliases: [], description: "New player guide." },
    { name: "profile", aliases: ["p", "userinfo"], description: "View user profile." },

  ];

  const categories: CategoryData[] = [
    { id: "life", label: "Life", description: "Jobs, Education, Marriage, Property", emoji: "🌱", commands: lifeCommands },
    { id: "economy", label: "Economy", description: "Money, Banking, Shop, Crime", emoji: "💵", commands: economyCommands },
    { id: "casino", label: "Casino", description: "Gambling & Games", emoji: "🎰", commands: casinoCommands },
    { id: "general", label: "General", description: "Profile, Guide, Rank", emoji: "📜", commands: generalCommands },
    { id: "admin", label: "Admin", description: "Server Configuration", emoji: "⚙️", commands: [] } // Content handled specially
  ];

  // --- 2. Helper Functions ---

  const generateEmbed = (category: CategoryData, page: number = 1): EmbedBuilder => {
    const embed = new EmbedBuilder()
      .setColor(Mascot.Colors.Base as any)
      .setTitle(`${category.emoji} ${category.label} Commands`)
      .setThumbnail(thumbnail);

    if (category.id === "admin") {
      embed.setDescription("🔒 **Admin Configuration**\n\nPlease check out the **Web Dashboard** or the **Online Documentation** for a full list of administrative commands and settings configuration.");
      return embed;
    }

    // Pagination Logic
    const itemsPerPage = 8;
    const totalPages = Math.ceil(category.commands.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const currentCommands = category.commands.slice(start, end);

    let description = "";
    for (const cmd of currentCommands) {
      const aliasStr = cmd.aliases.length > 0 ? ` *(${cmd.aliases.join(", ")})*` : "";
      description += `**\`${prefix}${cmd.name}\`**${aliasStr}\n> ${cmd.description}\n\n`;
    }

    embed.setDescription(description || "No commands found.");
    embed.setFooter({ text: `Page ${page}/${totalPages} • Use the dropdown to switch categories` });
    return embed;
  };

  const generateComponents = (categoryId: string, page: number, totalPages: number): ActionRowBuilder<any>[] => {
    const rows: ActionRowBuilder<any>[] = [];

    // Dropdown Row
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("help_category_select")
      .setPlaceholder("Select a category")
      .addOptions(
        categories.map(cat =>
          new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setValue(cat.id)
            .setDescription(cat.description)
            .setEmoji(cat.emoji as any)
            .setDefault(cat.id === categoryId)
        )
      );

    rows.push(new ActionRowBuilder().addComponents(selectMenu));

    // Pagination Buttons Row (only if needed and not admin)
    if (categoryId !== "admin" && totalPages > 1) {
      const btnRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`help_prev_${categoryId}_${page}`)
            .setLabel("◀ Backward")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),
          new ButtonBuilder()
            .setCustomId(`help_next_${categoryId}_${page}`)
            .setLabel("Forward ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
        );
      rows.push(btnRow);
    }

    return rows;
  };

  // --- 3. Initial Reply ---

  const landingEmbed = new EmbedBuilder()
    .setTitle(`${Mascot.Emotes.Success} Help Menu`)
    .setDescription(`Welcome to the **${Mascot.Name}** help menu.\n\nSelect a category from the dropdown below to view available commands.\n\n**Server Prefix:** \`${prefix}\``)
    .setColor(Mascot.Colors.Base as any)
    .setThumbnail(thumbnail)
    .addFields(
      { name: "🔗 Quick Links", value: `[Dashboard](${Mascot.Links.Dashboard}) • [Docs](${Mascot.Links.Docs}) • [Support Server](${Mascot.Links.Support})` }
    );

  const initialComponents = generateComponents("none", 1, 1);

  const reply = await message.reply({
    embeds: [landingEmbed],
    components: initialComponents
  });

  // --- 4. Content Collector ---

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id,
    time: 120_000 // 2 minutes
  });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.isStringSelectMenu()) {
        const selectedId = interaction.values[0];
        const category = categories.find(c => c.id === selectedId);
        if (!category) return;

        const embed = generateEmbed(category, 1);
        const totalPages = Math.ceil(category.commands.length / 8) || 1;
        const components = generateComponents(selectedId, 1, totalPages);

        await interaction.update({ embeds: [embed], components: components });
      }
      else if (interaction.isButton()) {
        // ID format: help_<prev|next>_<categoryId>_<currentPage>
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const catId = parts[2];
        const currentPage = parseInt(parts[3]);

        const category = categories.find(c => c.id === catId);
        if (!category) return;

        const totalPages = Math.ceil(category.commands.length / 8) || 1;
        let newPage = currentPage;
        if (action === "prev" && currentPage > 1) newPage--;
        if (action === "next" && currentPage < totalPages) newPage++;

        const embed = generateEmbed(category, newPage);
        const components = generateComponents(catId, newPage, totalPages);

        await interaction.update({ embeds: [embed], components: components });
      }
    } catch (error) {
      console.error("Help command interaction error:", error);
    }
  });

  collector.on("end", () => {
    // Optionally disable components
    reply.edit({ components: [] }).catch(() => { });
  });
}