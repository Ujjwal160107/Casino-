import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  EmbedBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  User as DiscordUser,
} from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { getJob, getJobPay } from "../../services/jobService";
import { getPortfolio } from "../../services/stockService";
import { PropertyService } from "../../services/propertyService";

const PROFILE_ACCENT_COLOR = 0x9B59B6;

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function trimBlock(value: string, maxLength = 900) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function textContainer(title: string, body: string, color = PROFILE_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

export async function getProfileContainer(targetUser: DiscordUser, guildId: string, displayName = targetUser.username): Promise<ContainerBuilder> {
  let userDb = await prisma.user.findUnique({
    where: { discordId_guildId: { discordId: targetUser.id, guildId } },
    include: {
      wallet: true,
      bank: true,
      loans: true,
      degrees: { include: { degree: true } },
      inventory: { include: { shopItem: true } },
      workLogs: false,
    },
  });

  if (!userDb) {
    await ensureUserAndWallet(targetUser.id, guildId, targetUser.username);
    userDb = await prisma.user.findUnique({
      where: { discordId_guildId: { discordId: targetUser.id, guildId } },
      include: {
        wallet: true,
        bank: true,
        loans: true,
        degrees: { include: { degree: true } },
        inventory: { include: { shopItem: true } },
        workLogs: false,
      },
    });
    if (!userDb) throw new Error("Failed to initialize user.");
  }

  const config = await getGuildConfig(guildId);
  const emoji = config.currencyEmoji || Mascot.Emotes.Blackcoin;

  const walletBal = userDb.wallet?.balance || 0;
  const bankBal = userDb.bank?.balance || 0;
  const loanDebt = userDb.loans.reduce((sum, loan) => sum + (loan.status === "ACTIVE" ? loan.totalRepayment : 0), 0);

  const portfolio = await getPortfolio(guildId, targetUser.id);
  const stockValue = portfolio
    ? portfolio.holdings.reduce((sum, h) => sum + (h.stock.currentPrice * h.quantity), 0)
    : 0;

  const invValue = userDb.inventory.reduce((sum, item) => sum + (item.shopItem.price * item.amount), 0);
  const netWorth = walletBal + bankBal + stockValue + invValue - loanDebt;

  let jobDisplay = "Unemployed";
  let salaryDisplay = "0";
  if (userDb.jobId) {
    const job = getJob(userDb.jobId);
    if (job) {
      const pay = await getJobPay(job, guildId);
      jobDisplay = `${job.emoji} ${job.title} (${job.sector})`;
      salaryDisplay = fmtCurrency(pay, emoji);
    }
  }

  const degrees = userDb.degrees.map((d) => `- ${d.degree.name}`).join("\n") || "- No Degrees";

  const chickenItem = userDb.inventory.find((i) => i.shopItem.name.toLowerCase() === "chicken");
  let chickenDisplay = "No Chicken";
  if (chickenItem) {
    const meta = (chickenItem.meta as any) || {};
    const level = meta.level || 0;
    const wins = meta.wins || 0;
    const name = meta.name || "Chicken";
    chickenDisplay = `${Mascot.Emotes.Chicken} **${name}** (Lvl ${level} | ${wins} Wins)`;
  }

  const ownedProperties = await PropertyService.getOwnedProperties(targetUser.id, guildId);
  const propertyCount = ownedProperties.length;
  const totalPropertyIncome = ownedProperties.reduce((sum, p) => sum + p.property.incomePerCycle, 0);

  return new ContainerBuilder()
    .setAccentColor(PROFILE_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.Success} ${displayName}'s Profile`),
          new TextDisplayBuilder().setContent(`Credit Score: **${userDb.creditScore}**`),
          new TextDisplayBuilder().setContent("A snapshot of your entire life so far."),
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(targetUser.displayAvatarURL({ size: 256 }))
            .setDescription(`${targetUser.username}'s avatar`),
        ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.MoneyBag} Wealth\n` +
        `**Wallet:** ${fmtCurrency(walletBal, emoji)}\n` +
        `**Bank:** ${fmtCurrency(bankBal, emoji)}\n` +
        `**Stocks:** ${fmtCurrency(stockValue, emoji)}\n` +
        `**Net Worth:** ${fmtCurrency(netWorth, emoji)}`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.JobWorking} Career\n` +
        `**Job:** ${jobDisplay}\n` +
        `**Salary:** ${salaryDisplay}/shift\n` +
        `**Shifts:** ${userDb.shiftsWorked}\n` +
        `**Stress:** ${userDb.jobStress}%`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Graph} Assets & Liabilities\n` +
        `**Inventory Value:** ${fmtCurrency(invValue, emoji)}\n` +
        `**Active Debt:** ${fmtCurrency(loanDebt, emoji)}\n` +
        `**Properties:** ${propertyCount} (Income: ${fmtCurrency(totalPropertyIncome, emoji)})\n` +
        `**Chicken:** ${chickenDisplay}`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Graduate} Education\n${trimBlock(degrees)}`,
      ),
    );
}

export async function handleProfile(message: Message, args: string[]) {
  const targetUser = message.mentions.users.first() || message.author;
  const guildId = message.guildId!;

  try {
    const targetMember = await message.guild?.members.fetch(targetUser.id).catch(() => null);
    const displayName = targetMember?.displayName || targetUser.globalName || targetUser.username;
    const container = await getProfileContainer(targetUser, guildId, displayName);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("prof_refresh")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔄"),
    );

    const reply = await message.reply({
      components: [container, row],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({
          components: [textContainer("Profile Session", "Not your session.", 0xE74C3C)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }

      if (i.customId === "prof_refresh") {
        try {
          const newContainer = await getProfileContainer(targetUser, guildId, displayName);
          await i.update({
            components: [newContainer, row],
            flags: MessageFlags.IsComponentsV2,
          });
        } catch {
          await i.reply({
            components: [textContainer("Refresh Failed", "Failed to refresh profile.", 0xE74C3C)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }
      }
    });

    collector.on("end", () => {
      reply.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    });
  } catch (e: any) {
    console.error("Profile Error:", e);
    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("Error")
          .setDescription("Failed to load profile."),
      ],
    });
  }
}
