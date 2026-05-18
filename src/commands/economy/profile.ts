import {
  ActionRowBuilder,
  AttachmentBuilder,
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
import fs from "fs";
import path from "path";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { getJob, getJobPay } from "../../services/jobService";
import { getCardSummary } from "../../services/creditCardService";

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

function formatCardTier(tier: string) {
  return tier
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const CARD_ASSET_NAMES: Record<string, string> = {
  STARTER: "starter_card",
  GOLD: "gold_card",
  PLATINUM: "platinum_card",
  BLACK: "black_card",
};

function resolveCardAsset(tier: string) {
  const baseName = CARD_ASSET_NAMES[tier.toUpperCase()];
  if (!baseName) return null;

  const assetDir = path.resolve(__dirname, "../../assets");
  const filePath = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
    .map((ext) => path.join(assetDir, `${baseName}${ext}`))
    .find((candidate) => fs.existsSync(candidate));

  if (!filePath) return null;
  return {
    filePath,
    attachmentName: `${baseName}${path.extname(filePath)}`,
  };
}

async function getProfilePortfolioValue(discordId: string) {
  const portfolio = await prisma.portfolio.findUnique({
    where: { userId: discordId },
    include: { holdings: { include: { stock: true } } },
  });

  return portfolio
    ? portfolio.holdings.reduce((sum, holding) => sum + (holding.stock.currentPrice * holding.quantity), 0)
    : 0;
}

async function getProfilePropertySummary(discordId: string) {
  const ownedProperties = await prisma.ownedProperty.findMany({
    where: { userId: discordId },
    include: { property: true },
  });

  return {
    propertyCount: ownedProperties.length,
    propertyNames: ownedProperties.map((op) => op.property.name),
  };
}

export async function getProfilePayload(targetUser: DiscordUser, guildId: string, displayName = targetUser.username): Promise<{ container: ContainerBuilder; files: AttachmentBuilder[] }> {
  let userDb = await prisma.user.findUnique({
    where: { discordId: targetUser.id },
    include: {
      wallet: true,
      bank: true,
      loans: true,
      currentEducation: { include: { degree: true } },
      degrees: { include: { degree: true } },
      inventory: { include: { shopItem: true } },
      workLogs: false,
    },
  });

  if (!userDb) {
    await ensureUserAndWallet(targetUser.id, guildId, targetUser.username);
    userDb = await prisma.user.findUnique({
      where: { discordId: targetUser.id },
      include: {
        wallet: true,
        bank: true,
        loans: true,
        currentEducation: { include: { degree: true } },
        degrees: { include: { degree: true } },
        inventory: { include: { shopItem: true } },
        workLogs: false,
      },
    });
    if (!userDb) throw new Error("Failed to initialize user.");
  }

  const config = await getGuildConfig(guildId);
  const emoji = config.currencyEmoji || Mascot.Emotes.Blackcoin;
  const cardSummary = await getCardSummary(targetUser.id);

  const walletBal = userDb.wallet?.balance || 0;
  const bankBal = userDb.bank?.balance || 0;
  const loanDebt = userDb.loans.reduce((sum, loan) => sum + (loan.status === "ACTIVE" ? loan.totalRepayment : 0), 0);

  const stockValue = await getProfilePortfolioValue(targetUser.id);

  const invValue = userDb.inventory.reduce((sum, item) => sum + ((item.shopItem?.price ?? 0) * item.amount), 0);
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

  const chickenItem = userDb.inventory.find((i) => i.shopItem?.name.toLowerCase() === "chicken");
  let chickenDisplay = "No Chicken";
  if (chickenItem) {
    const meta = (chickenItem.meta as any) || {};
    const level = meta.level || 0;
    const wins = meta.wins || 0;
    const name = meta.name || "Chicken";
    chickenDisplay = `${Mascot.Emotes.Chicken} **${name}** (Lvl ${level} | ${wins} Wins)`;
  }

  const RIFLE_PRIORITY_PROFILE = ["legendary rifle", "sniper rifle", "iron rifle", "wooden rifle"];
  let rifleDisplay = "None";
  for (const rName of RIFLE_PRIORITY_PROFILE) {
    const found = userDb.inventory.find((i) => i.shopItem?.name.toLowerCase() === rName);
    if (found) { rifleDisplay = found.shopItem!.name; break; }
  }

  const { propertyCount, propertyNames } = await getProfilePropertySummary(targetUser.id);
  const propertyDisplay = propertyNames.length > 0 ? propertyNames.join(", ") : "None";
  const cardDisplay = cardSummary.card
    ? [
      `**Tier:** ${formatCardTier(cardSummary.card.tier)}`,
      `**Status:** ${cardSummary.card.status}`,
      `**Balance:** ${fmtCurrency(cardSummary.card.currentBalance, emoji)}`,
      `**Statement:** ${fmtCurrency(cardSummary.card.statementBalance, emoji)}`,
      cardSummary.card.dueAt ? `**Due:** <t:${Math.floor(cardSummary.card.dueAt.getTime() / 1000)}:R>` : null,
    ].filter(Boolean).join("\n")
    : "No Fortuna Card owned";
  const files: AttachmentBuilder[] = [];
  const cardAsset = cardSummary.card ? resolveCardAsset(cardSummary.card.tier) : null;
  const cardText = new TextDisplayBuilder().setContent(
    `### ${Mascot.Emotes.Credit} Fortuna Card\n${cardDisplay}`,
  );

  const container = new ContainerBuilder()
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
        `### ${Mascot.Emotes.Meditation} Stress\n` +
        `**Job Stress:** ${userDb.jobStress}/100\n` +
        `**Education Stress:** ${userDb.currentEducation ? `${userDb.currentEducation.stress}/100 (${userDb.currentEducation.degree.name})` : "Not enrolled"}`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Graph} Assets & Liabilities\n` +
        `**Inventory Value:** ${fmtCurrency(invValue, emoji)}\n` +
        `**Active Debt:** ${fmtCurrency(loanDebt, emoji)}\n` +
        `**Rifle:** ${rifleDisplay}\n` +
        `**Properties (${propertyCount}):** ${propertyDisplay}\n` +
        `**Chicken:** ${chickenDisplay}`,
      ),
    );

  container.addSeparatorComponents(separator());

  if (cardAsset && cardSummary.card) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(cardText)
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(`attachment://${cardAsset.attachmentName}`)
            .setDescription(`${formatCardTier(cardSummary.card!.tier)} card`),
        ),
    );
  } else {
    container.addTextDisplayComponents(cardText);
  }

  container
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${Mascot.Emotes.Graduate} Education\n${trimBlock(degrees)}`,
      ),
    );

  if (cardAsset && cardSummary.card) {
    files.push(new AttachmentBuilder(cardAsset.filePath, { name: cardAsset.attachmentName }));
  }

  return { container, files };
}

export async function getProfileContainer(targetUser: DiscordUser, guildId: string, displayName = targetUser.username): Promise<ContainerBuilder> {
  return (await getProfilePayload(targetUser, guildId, displayName)).container;
}

export async function handleProfile(message: Message, args: string[]) {
  const targetUser = message.mentions.users.first() || message.author;
  const guildId = message.guildId!;

  try {
    const targetMember = await message.guild?.members.fetch(targetUser.id).catch(() => null);
    const displayName = targetMember?.displayName || targetUser.globalName || targetUser.username;
    const payload = await getProfilePayload(targetUser, guildId, displayName);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("prof_refresh")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔄"),
    );

    const reply = await message.reply({
      components: [payload.container, row],
      files: payload.files,
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
          const newPayload = await getProfilePayload(targetUser, guildId, displayName);
          await i.update({
            components: [newPayload.container, row],
            files: newPayload.files,
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
        components: [payload.container],
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
