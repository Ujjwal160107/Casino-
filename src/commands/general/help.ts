import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Message,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder
} from "discord.js";
import { getGuildSettings } from "../../services/guildSettingsService";
import { Mascot, getEmoteUrl } from "../../config/branding";

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
  const settings = await getGuildSettings(message.guildId!);
  const prefix = settings.prefix || "!";
  const thumbnail = getEmoteUrl(Mascot.Emotes.Love) ?? undefined;

  const categories: CategoryData[] = [
    {
      id: "economy",
      label: "Economy",
      description: "Wallet, bank, rewards, and core money commands",
      emoji: "💸",
      commands: [
        { name: "balance", aliases: ["bal"], description: "Check your wallet, bank, and net worth." },
        { name: "bank", aliases: [], description: "Open the bank dashboard and cards flow." },
        { name: "deposit", aliases: ["dep"], description: "Move wallet money into the bank." },
        { name: "withdraw", aliases: ["with"], description: "Move bank money into your wallet." },
        { name: "transfer", aliases: ["give"], description: "Send money to another player." },
        { name: "daily", aliases: [], description: "Claim your daily reward." },
        { name: "weekly", aliases: [], description: "Claim your weekly reward." },
        { name: "monthly", aliases: [], description: "Claim your monthly reward." },
        { name: "credit", aliases: ["score"], description: "Check your credit score." }
      ]
    },
    {
      id: "life",
      label: "Life",
      description: "Jobs, education, profile, and stress management",
      emoji: "🌱",
      commands: [
        { name: "profile", aliases: ["p"], description: "View your profile, card, and stress status." },
        { name: "jobs", aliases: ["careers"], description: "Browse available jobs." },
        { name: "apply", aliases: [], description: "Apply to an available job by name." },
        { name: "work", aliases: ["job"], description: "Work a shift at your current job." },
        { name: "career", aliases: [], description: "View your career progress." },
        { name: "education", aliases: ["school"], description: "Open your education dashboard." },
        { name: "enroll", aliases: [], description: "Enroll in a degree program." },
        { name: "study", aliases: [], description: "Study your current program." },
        { name: "relax", aliases: ["chill"], description: "Reduce job and study stress." }
      ]
    },
    {
      id: "games",
      label: "Games",
      description: "Casino games that use wallet funds only",
      emoji: "🎰",
      commands: [
        { name: "coinflip", aliases: [], description: "Play heads or tails." },
        { name: "slots", aliases: [], description: "Spin the slots." },
        { name: "blackjack", aliases: ["bj"], description: "Play blackjack." },
        { name: "bet", aliases: ["roulette"], description: "Place a roulette bet." },
        { name: "russian-roulette", aliases: ["rr"], description: "Play russian roulette." },
        { name: "cockfight", aliases: ["cf"], description: "Start a cockfight match." },
        { name: "chicken", aliases: [], description: "Manage your fighting chicken." }
      ]
    },
    {
      id: "general",
      label: "General",
      description: "Guides and onboarding",
      emoji: "📘",
      commands: [
        { name: "help", aliases: [], description: "Open this help menu." },
        { name: "guide", aliases: ["tutorial"], description: "Read the quick-start guide." },
        { name: "dashboard", aliases: [], description: "Open the main player dashboard." },
        { name: "start", aliases: [], description: "Create your profile if you have not started yet." },
        { name: "set-prefix", aliases: ["setprefix"], description: "Change this server's command prefix." }
      ]
    }
  ];

  const itemsPerPage = 8;

  const renderCategory = (category: CategoryData, page = 1) => {
    const totalPages = Math.max(1, Math.ceil(category.commands.length / itemsPerPage));
    const start = (page - 1) * itemsPerPage;
    const commands = category.commands.slice(start, start + itemsPerPage);

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`${category.emoji} ${category.label} Commands`)
      .setDescription(
        commands
          .map((command) => {
            const aliases = command.aliases.length ? ` (${command.aliases.join(", ")})` : "";
            return `**\`${prefix}${command.name}\`**${aliases}\n> ${command.description}`;
          })
          .join("\n\n") || "No commands found."
      )
      .setFooter({ text: `Page ${page}/${totalPages}` });

    if (thumbnail) {
      embed.setThumbnail(thumbnail);
    }

    return { embed, totalPages };
  };

  const buildRows = (categoryId: string, page: number, totalPages: number) => {
    const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_category_select")
        .setPlaceholder("Select a category")
        .addOptions(
          categories.map((category) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(category.label)
              .setValue(category.id)
              .setDescription(category.description)
              .setEmoji(category.emoji)
              .setDefault(category.id === categoryId)
          )
        )
    );

    const rows: ActionRowBuilder<any>[] = [categoryRow];

    if (totalPages > 1) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`help_prev_${categoryId}_${page}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
          new ButtonBuilder()
            .setCustomId(`help_next_${categoryId}_${page}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
        )
      );
    }

    return rows;
  };

  const landingEmbed = new EmbedBuilder()
    .setTitle(`${Mascot.Name} Help`)
    .setDescription(
      `Welcome to the help menu.\n\nSelect a category below to browse commands.\n\n**Server Prefix:** \`${prefix}\``
    )
    .setColor(0x9b59b6)
    .addFields({
      name: "Quick Links",
      value: `[Dashboard](${Mascot.Links.Dashboard}) • [Commands](${Mascot.Links.CommandList}) • [Guide](${Mascot.Links.Docs}) • [Support](${Mascot.Links.Support})`
    });

  if (thumbnail) {
    landingEmbed.setThumbnail(thumbnail);
  }

  const reply = await message.reply({
    embeds: [landingEmbed],
    components: buildRows("economy", 1, 1)
  });

  const collector = reply.createMessageComponentCollector({
    filter: (interaction) => interaction.user.id === message.author.id,
    time: 120_000
  });

  collector.on("collect", async (interaction: StringSelectMenuInteraction | ButtonInteraction) => {
    try {
      if (interaction.isStringSelectMenu()) {
        const category = categories.find((item) => item.id === interaction.values[0]);
        if (!category) return;

        const { embed, totalPages } = renderCategory(category, 1);
        await interaction.update({
          embeds: [embed],
          components: buildRows(category.id, 1, totalPages)
        });
        return;
      }

      const [, direction, categoryId, rawPage] = interaction.customId.split("_");
      const category = categories.find((item) => item.id === categoryId);
      if (!category) return;

      const currentPage = Number(rawPage) || 1;
      const nextPage = direction === "next" ? currentPage + 1 : currentPage - 1;
      const { embed, totalPages } = renderCategory(category, nextPage);

      await interaction.update({
        embeds: [embed],
        components: buildRows(category.id, nextPage, totalPages)
      });
    } catch (error) {
      console.error("Help command interaction error:", error);
    }
  });

  collector.on("end", () => {
    reply.edit({ components: [] }).catch(() => {});
  });
}
