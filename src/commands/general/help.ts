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
  StringSelectMenuInteraction
} from "discord.js";
import { getGuildConfig } from "../../services/guildConfigService";
import { emojiInline } from "../../utils/emojiRegistry";
import { Mascot } from "../../config/branding";

interface AdminPageData {
  title: string;
  fields: Array<{ name: string; value: string }>;
  pageNumber: number;
  totalPages: number;
}

function createAdminPages(prefix: string, eSettings: string): AdminPageData[] {
  return [
    {
      title: `${eSettings} Admin Configuration - Page 1/3`,
      pageNumber: 1,
      totalPages: 3,
      fields: [
        {
          name: "🏦 **Old Economy Control**",
          value:
            `\`${prefix}addmoney <user> <amount>\`\n` +
            `\`${prefix}removemoney <user> <amount> [bank]\`\n` +
            `\`${prefix}reseteconomy confirm\``
        },
        {
          name: "📈 **Modern Economy Config**",
          value:
            `\`${prefix}setloan / setfd / setrd <0-100>\` (Interest Rates)\n` +
            `\`${prefix}settax <0-100>\` (Black Market Tax %)`
        },
        {
          name: "💳 **Credit & Loans**",
          value:
            `\`${prefix}score [user]\`: View credit profile\n` +
            `\`${prefix}view-credit-tiers\`: List tiers\n` +
            `\`${prefix}set-credit-config <score> <loan> <time>\`\n` +
            `\`${prefix}delete-credit-tier <score>\`\n` +
            `\`${prefix}set-credit-score @user <amount>\`\n` +
            `\`${prefix}set-max-loans <amount>\`\n` +
            `\`${prefix}set-credit-cap <score>\`\n` +
            `\`${prefix}set-credit-reward/penalty <amount>\``
        }
      ]
    },
    {
      title: `${eSettings} Admin Configuration - Page 2/3`,
      pageNumber: 2,
      totalPages: 3,
      fields: [
        {
          name: "🛒 **Shop Management**",
          value:
            `\`${prefix}shopadd <price> <name>\` (Quick Add)\n` +
            `\`${prefix}manageitem [name]\` (Interactive Edit/Delete)`
        },
        {
          name: "⚙️ **Settings**",
          value:
            `\`${prefix}viewconfig\`\n` +
            `\`${prefix}setprefix <symbol>\`\n` +
            `\`${prefix}setcurrency <symbol>\`\n` +
            `\`${prefix}setemoji <emoji>\`\n` +
            `\`${prefix}addemoji <name> <url>\`\n` +
            `\`${prefix}setstartmoney <amount>\`\n` +
            `\`${prefix}minbet <amount>\``
        },
        {
          name: "🛡️ **Moderation**",
          value:
            `\`${prefix}casino-ban <user> [reason]\`\n` +
            `\`${prefix}casino-unban <user>\`\n` +
            `\`${prefix}casino-ban-list\``
        }
      ]
    },
    {
      title: `${eSettings} Admin Configuration - Page 3/3`,
      pageNumber: 3,
      totalPages: 3,
      fields: [
        {
          name: "👮 **Robbery Settings**",
          value:
            `\`${prefix}setrob success/fine <0-100>\`\n` +
            `\`${prefix}setrob cooldown <seconds>\`\n` +
            `\`${prefix}setrob immunity <add/remove> <role>\``
        },
        {
          name: "💰 **Income Settings**",
          value:
            `\`${prefix}setincome <cmd> <min|max> <amount>\`\n` +
            `\`${prefix}setincomecooldown <cmd> <seconds>\`\n` +
            `\`${prefix}set-role-income @Role <amt> <time>\``
        }
      ]
    }
  ];
}

function createPaginationButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("admin_prev")
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 1),
    new ButtonBuilder()
      .setCustomId("admin_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages)
  );
}

export async function handleHelp(message: Message) {
  const config = await getGuildConfig(message.guildId!);
  const prefix = config.prefix || "!";
  const idEconomy = "1445732360204193824";
  const strEconomy = `<a:money:${idEconomy}>`;
  const incomeRaw = config.currencyEmoji || "💰";
  const idIncome = incomeRaw.match(/:(\d+)>/)?.[1] ?? (incomeRaw.match(/^\d+$/) ? incomeRaw : undefined);
  const idGames = "1445732641545654383";
  const strGames = `<a:casino:${idGames}>`;
  const eAdminRaw = emojiInline("settings", message.guild!) || "⚙️";
  const idAdmin = eAdminRaw.match(/:(\d+)>/)?.[1];

  const getMenuEmoji = (id?: string, fallback = "❓") => {
    if (id && /^\d+$/.test(id)) return { id };
    return fallback;
  };

  const createDropdownRow = () => {
    const options = [
      new StringSelectMenuOptionBuilder()
        .setLabel("Economy")
        .setValue("economy")
        .setDescription("Money, Banking, Shop, Leaderboard")
        .setEmoji(getMenuEmoji(idEconomy, "💰") as any),
      new StringSelectMenuOptionBuilder()
        .setLabel("Income")
        .setValue("income")
        .setDescription("Work, Beg, Crime")
        .setEmoji(idIncome ? { id: idIncome } : (incomeRaw.match(/^\d+$/) ? { id: incomeRaw } : "💸") as any),
      new StringSelectMenuOptionBuilder()
        .setLabel("Games")
        .setValue("games")
        .setDescription("Roulette, Slots, Blackjack, Coinflip")
        .setEmoji(getMenuEmoji(idGames, "🎰") as any),
      new StringSelectMenuOptionBuilder()
        .setLabel("Admin")
        .setValue("admin")
        .setDescription("Server Configuration & Management")
        .setEmoji(idAdmin ? { id: idAdmin } : "⚙️" as any),
    ];
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("help_select").setPlaceholder("Select a category").addOptions(options)
    );
  };

  const overview = new EmbedBuilder()
    .setTitle(`${Mascot.Emotes.Success} ${Mascot.Name} — Help Menu`)
    .setDescription(`Use the dropdown below to explore commands.\nServer Prefix: \`${prefix}\``)
    .setColor(Mascot.Colors.Base as any)
    .setThumbnail(message.client.user?.displayAvatarURL() ?? null);

  const row = createDropdownRow();

  const sent = await message.reply({ embeds: [overview], components: [row] });

  const collector = sent.createMessageComponentCollector({
    time: 60_000,
    filter: (i) => i.user.id === message.author.id,
  });

  let currentAdminPage = 1;

  collector.on("collect", async (i) => {
    if (i.isStringSelectMenu()) {
      const val = i.values[0];
      let embed = new EmbedBuilder().setColor(Mascot.Colors.Base as any);

      if (val === "economy") {
        embed.setTitle(`${strEconomy} Economy & Shop`)
          .addFields(
            { name: `\`${prefix}profile\``, value: "View your stats, net worth & credit score." },
            { name: `\`${prefix}credit\``, value: "💳 **Credit Profile** (Score, Loan Limits, Active Loan)." },
            { name: `\`${prefix}bank\``, value: "🏦 **Financial Dashboard** (Loans, Investments, Net Worth)." },
            { name: `\`${prefix}bm\``, value: "🏴‍☠️ **Black Market** (Buy/Sell/List Items Globaly)." },
            { name: `\`${prefix}bal [user]\``, value: "Check wallet and bank balance." },
            { name: `\`${prefix}lb\``, value: "View Server Leaderboard (Net Worth)." },
            { name: `\`${prefix}lb-wallet\``, value: "View Cash-only Leaderboard." },
            { name: `\`${prefix}shop\``, value: "View and buy items from the store." },
            { name: `\`${prefix}inv\``, value: "View your purchased items." },
            { name: `\`${prefix}dep <amount|all>\``, value: "Deposit money to bank." },
            { name: `\`${prefix}with <amount|all>\``, value: "Withdraw money from bank." },
            { name: `\`${prefix}rob <user>\``, value: "Attempt to steal from a user." },
            { name: `\`${prefix}rank [user]\``, value: "Check your current level and XP." },
            { name: `\`${prefix}set-theme <color>\``, value: "Customize your profile embed color." },
            { name: `\`${prefix}transfer <amount> <user>\``, value: "Gift money to another user." }
          );
        await i.reply({ embeds: [embed], ephemeral: true });
      }
      else if (val === "income") {
        embed.setTitle(`${config.currencyEmoji} Income Commands`)
          .addFields(
            { name: `\`${prefix}work\``, value: "Earn standard income." },
            { name: `\`${prefix}beg\``, value: "Small earnings with low cooldown." },
            { name: `\`${prefix}crime\``, value: "High risk, high reward." },
            { name: `\`${prefix}slut\``, value: "Risky income command." },
            { name: `\`${prefix}collect\``, value: "Claim role income." }
          );
        await i.reply({ embeds: [embed], ephemeral: true });
      }
      else if (val === "games") {
        embed.setTitle(`${strGames} Games`)
          .addFields(
            { name: `\`${prefix}bet <amount> <choice>\``, value: "Play Roulette (Red, Black, Odd, Even, 0-36)." },
            { name: `\`${prefix}bj <amount>\``, value: "Play Blackjack against the dealer." },
            { name: `\`${prefix}slots <amount>\``, value: "Spin the slot machine." },
            { name: `\`${prefix}cf <amount> <h|t>\``, value: "Flip a coin (Heads/Tails)." }
          );
        await i.reply({ embeds: [embed], ephemeral: true });
      }
      else if (val === "admin") {
        const member = i.member as GuildMember;
        if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await i.reply({ content: "🚫 **Access Denied:** Administrators only.", ephemeral: true });
          return;
        }

        const eSettings = emojiInline("settings", message.guild!) || "⚙️";
        const adminPages = createAdminPages(prefix, eSettings);
        currentAdminPage = 1;

        const pageData = adminPages[currentAdminPage - 1];
        embed.setTitle(pageData.title).addFields(pageData.fields);

        const buttonRow = createPaginationButtons(currentAdminPage, pageData.totalPages);
        const adminMsg = await i.reply({ embeds: [embed], components: [buttonRow], ephemeral: true, fetchReply: true });

        const adminCollector = adminMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60_000,
          filter: (btnI) => btnI.user.id === message.author.id
        });

        adminCollector.on("collect", async (btnI) => {
          if (btnI.customId === "admin_prev" && currentAdminPage > 1) {
            currentAdminPage--;
          } else if (btnI.customId === "admin_next" && currentAdminPage < adminPages.length) {
            currentAdminPage++;
          }

          const newPageData = adminPages[currentAdminPage - 1];
          const newEmbed = new EmbedBuilder()
            .setColor(Mascot.Colors.Base as any)
            .setTitle(newPageData.title)
            .addFields(newPageData.fields);

          const newButtonRow = createPaginationButtons(currentAdminPage, newPageData.totalPages);
          await btnI.update({ embeds: [newEmbed], components: [newButtonRow] });
        });
      }
    }
  });

  collector.on("end", () => {
  });
}