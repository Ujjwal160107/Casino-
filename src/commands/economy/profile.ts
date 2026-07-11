import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  User as DiscordUser,
} from "discord.js";
import fs from "fs";
import path from "path";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { getJob, getJobPay } from "../../services/jobService";
import { getCardSummary } from "../../services/creditCardService";
import { getLuckBreakdown } from "../../services/shopBuffs";
import { COSMETICS_SHOP_CATALOG } from "../../utils/shopCatalog";
import { getAffectionTier, getMarriage, MAX_AFFECTION } from "../../services/life/marriageService";
import { getGuildPrefix } from "../../utils/guildContext";
import { redisService } from "../../services/redisService";

const PROFILE_ACCENT_COLOR = 0x9B59B6;

type ProfilePage = "overview" | "wealth" | "career" | "cosmetics" | "education" | "relationship";

const PROFILE_PAGES: Array<{ key: ProfilePage; label: string; description: string; emoji: string }> = [
  { key: "overview", label: "Overview", description: "Net worth, flex, credit, luck", emoji: Mascot.Emotes.Success },
  { key: "wealth", label: "Wealth", description: "Wallet, bank, card, debt", emoji: Mascot.Emotes.MoneyBag },
  { key: "career", label: "Career", description: "Job, stress, assets", emoji: Mascot.Emotes.JobWorking },
  { key: "cosmetics", label: "Cosmetics", description: "Flex rank and collection", emoji: Mascot.Emotes.Sparks },
  { key: "education", label: "Education", description: "Degree XP and completed degrees", emoji: Mascot.Emotes.Graduate },
  { key: "relationship", label: "Relationship", description: "Marriage and affection", emoji: Mascot.Emotes.Love },
];

const COSMETIC_LUCK: Record<string, number> = {
  lucky_pocket_charm: 2,
  fortuna_bracelet: 5,
  platinum_crown: 8,
  celestial_halo: 10,
  fortune_dragon_cloak: 12,
  crown_of_immortals: 15,
  fortunas_signature: 20,
  reality_crown: 25,
  deer_antler_crown: 4,
  snow_leopard_mantle: 8,
  white_tiger_crown: 18,
  apex_trophy_case: 25,
};

type ProfileInventoryItem = {
  amount: number;
  shopItem?: {
    name: string;
    category: string;
    price: number;
  } | null;
};

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function trimBlock(value: string, maxLength = 700) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function progressBar(current: number, max: number, size = 10) {
  const safeMax = Math.max(1, max);
  const filled = Math.max(0, Math.min(size, Math.round((current / safeMax) * size)));
  return `${Mascot.Emotes.XpFull.repeat(filled)}${Mascot.Emotes.XpEmpty.repeat(size - filled)}`;
}

function textContainer(title: string, body: string, color = PROFILE_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function extractEmojiForAPI(s: string): { name: string; id: string; animated?: boolean } | undefined {
  const match = s.match(/^<(a?):(\w+):(\d+)>$/);
  if (!match) return undefined;
  const emoji: { name: string; id: string; animated?: boolean } = { name: match[2], id: match[3] };
  if (match[1] === "a") emoji.animated = true;
  return emoji;
}

function buildProfileControls(ownerId: string, currentPage: ProfilePage, disabled = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`profile_page:${ownerId}`)
    .setPlaceholder("Switch profile view...")
    .setDisabled(disabled);

  for (const page of PROFILE_PAGES) {
    const option: any = {
      label: page.label,
      value: page.key,
      description: page.description,
      default: page.key === currentPage,
    };
    const emoji = extractEmojiForAPI(page.emoji);
    if (emoji) option.emoji = emoji;
    menu.addOptions(option);
  }

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`prof_refresh:${ownerId}`)
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(Mascot.Emotes.Refresh)
      .setDisabled(disabled),
  );

  return [selectRow, buttonRow];
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

function getCosmeticRank(totalValue: number) {
  if (totalValue >= 1_000_000_000) return "Reality Bender";
  if (totalValue >= 500_000_000) return "Fortuna Signed";
  if (totalValue >= 100_000_000) return "Immortal Flex";
  if (totalValue >= 25_000_000) return "Endgame Collector";
  if (totalValue >= 2_500_000) return "Luxury Regular";
  if (totalValue >= 500_000) return "Styled";
  return "Fresh Fit";
}

function getCosmeticSummary(inventory: ProfileInventoryItem[]) {
  const catalogByName = new Map(COSMETICS_SHOP_CATALOG.map((item) => [item.name.toLowerCase(), item]));
  const owned = inventory
    .map((slot) => {
      const shopItem = slot.shopItem;
      if (!shopItem) return null;
      const catalogItem = catalogByName.get(shopItem.name.toLowerCase());
      if (!catalogItem && shopItem.category !== "COSMETICS") return null;
      const key = catalogItem?.key ?? shopItem.name.toLowerCase().replace(/\s+/g, "_");
      const price = catalogItem?.price ?? shopItem.price ?? 0;
      return {
        key,
        name: catalogItem?.name ?? shopItem.name,
        price,
        amount: slot.amount,
        luck: COSMETIC_LUCK[key] ?? 0,
      };
    })
    .filter((item): item is { key: string; name: string; price: number; amount: number; luck: number } => !!item)
    .sort((a, b) => b.price - a.price);

  const totalValue = owned.reduce((sum, item) => sum + item.price * item.amount, 0);
  const cosmeticLuck = owned.reduce((sum, item) => sum + item.luck, 0);
  const showcase = owned.slice(0, 5).map((item) => `- **${item.name}** (${fmtCurrency(item.price)})`).join("\n");

  return {
    count: owned.reduce((sum, item) => sum + item.amount, 0),
    uniqueCount: owned.length,
    totalValue,
    cosmeticLuck,
    rank: owned.length > 0 ? getCosmeticRank(totalValue) : "No Flex Yet",
    best: owned[0]?.name ?? "None",
    showcase: showcase || "- No cosmetics owned",
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

function rankUsers<T>(items: T[], valueOf: (item: T) => number, idOf: (item: T) => string, targetId: string) {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const index = sorted.findIndex((item) => idOf(item) === targetId);
  return index >= 0 ? index + 1 : null;
}

const LEADERBOARD_DATASET_CACHE_KEY = "profile:leaderboard_dataset";
// Rank precision doesn't need to be real-time, and this dataset is read on
// every !profile view but only changes via the huge number of wallet/bank
// mutation call sites — a short TTL is the practical way to cache it rather
// than wiring invalidation into every earning/spending command.
const LEADERBOARD_DATASET_CACHE_TTL = 20;

type LeaderboardUser = {
  discordId: string;
  shiftsWorked: number;
  wallet: { balance: number } | null;
  bank: { balance: number } | null;
};

async function getLeaderboardDataset(): Promise<LeaderboardUser[]> {
  const cached = await redisService.get<LeaderboardUser[]>(LEADERBOARD_DATASET_CACHE_KEY);
  if (cached) return cached;

  const users = await prisma.user.findMany({
    select: {
      discordId: true,
      shiftsWorked: true,
      wallet: { select: { balance: true } },
      bank: { select: { balance: true } },
    },
  });
  await redisService.set(LEADERBOARD_DATASET_CACHE_KEY, users, LEADERBOARD_DATASET_CACHE_TTL);
  return users;
}

async function getGlobalLeaderboardRanks(discordId: string) {
  const users = await getLeaderboardDataset();

  const total = users.length;
  const netRank = rankUsers(
    users,
    (user) => (user.wallet?.balance ?? 0) + (user.bank?.balance ?? 0),
    (user) => user.discordId,
    discordId,
  );
  const cashRank = rankUsers(
    users,
    (user) => user.wallet?.balance ?? 0,
    (user) => user.discordId,
    discordId,
  );
  const workRank = rankUsers(
    users,
    (user) => user.shiftsWorked ?? 0,
    (user) => user.discordId,
    discordId,
  );

  return { total, netRank, cashRank, workRank };
}

export async function getProfilePayload(
  targetUser: DiscordUser,
  guildId: string,
  displayName = targetUser.username,
  page: ProfilePage = "overview",
): Promise<{ container: ContainerBuilder; files: AttachmentBuilder[] }> {
  let userDb = await prisma.user.findUnique({
    where: { discordId: targetUser.id },
    include: {
      wallet: true,
      bank: true,
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
        currentEducation: { include: { degree: true } },
        degrees: { include: { degree: true } },
        inventory: { include: { shopItem: true } },
        workLogs: false,
      },
    });
    if (!userDb) throw new Error("Failed to initialize user.");
  }

  const prefix = await getGuildPrefix(guildId);
  
  const cardSummary = await getCardSummary(targetUser.id);
  const marriage = await getMarriage(targetUser.id).catch(() => null);

  const walletBal = userDb.wallet?.balance || 0;
  const bankBal = userDb.bank?.balance || 0;
  const cardDebt = cardSummary.card?.currentBalance ?? 0;
  const stockValue = await getProfilePortfolioValue(targetUser.id);
  const invValue = userDb.inventory.reduce((sum, item) => sum + ((item.shopItem?.price ?? 0) * item.amount), 0);
  const netWorth = walletBal + bankBal + stockValue + invValue - cardDebt;
  const cosmeticSummary = getCosmeticSummary(userDb.inventory);
  const ranks = page === "overview" ? await getGlobalLeaderboardRanks(targetUser.id) : null;
  const rankText = ranks
    ? [
      `**Net:** ${ranks.netRank ? `#${ranks.netRank}` : "Unranked"} / ${ranks.total}`,
      `**Cash:** ${ranks.cashRank ? `#${ranks.cashRank}` : "Unranked"} / ${ranks.total}`,
      `**Work:** ${ranks.workRank ? `#${ranks.workRank}` : "Unranked"} / ${ranks.total}`,
    ].join("\n")
    : "";

  let jobDisplay = "Unemployed";
  let salaryDisplay = "0";
  if (userDb.jobId) {
    const job = getJob(userDb.jobId);
    if (job) {
      const pay = await getJobPay(job, guildId);
      jobDisplay = `${job.emoji} ${job.title} (${job.sector})`;
      salaryDisplay = fmtCurrency(pay);
    }
  }

  const degrees = userDb.degrees.map((d) => `- ${d.degree.name}`).join("\n") || "- No Degrees";
  const educationDisplay = userDb.currentEducation
    ? [
      `**Degree:** ${userDb.currentEducation.degree.name}`,
      `**XP:** ${progressBar(userDb.currentEducation.educationXp, userDb.currentEducation.degree.xpRequired)} ${userDb.currentEducation.educationXp}/${userDb.currentEducation.degree.xpRequired}`,
      `**Stress:** ${userDb.currentEducation.stress}/100`,
      `**Completed:** ${userDb.degrees.length}`,
    ].join("\n")
    : `**Current:** Not enrolled\n**Completed:** ${userDb.degrees.length}`;

  const chickenItem = userDb.inventory.find((i) => i.shopItem?.name.toLowerCase() === "chicken");
  const chickenDisplay = chickenItem
    ? `${Mascot.Emotes.Chicken} **${((chickenItem.meta as any) || {}).name || "Chicken"}** (Lvl ${((chickenItem.meta as any) || {}).level || 0} | ${((chickenItem.meta as any) || {}).wins || 0} Wins)`
    : "No Chicken";

  const luckData = await getLuckBreakdown(targetUser.id);
  const luckMod = luckData.total - 50;
  const luckModText = luckMod > 0 ? ` (+${luckMod} active)` : luckMod < 0 ? ` (${luckMod} cursed)` : "";
  const combinedLuck = Math.min(100, luckData.total + cosmeticSummary.cosmeticLuck);

  let marriageDisplay = "Not married";
  if (marriage) {
    const spouse = marriage.spouse1Id === targetUser.id ? marriage.spouse2 : marriage.spouse1;
    const tier = getAffectionTier(marriage.affection);
    marriageDisplay = [
      `**Spouse:** ${spouse.username}`,
      `**Affection:** ${progressBar(marriage.affection, MAX_AFFECTION)} ${marriage.affection}/${MAX_AFFECTION}`,
      `**Tier:** ${tier.name}`,
      `**Couple Vault:** ${fmtCurrency(marriage.jointBalance)}`,
    ].join("\n");
  }

  const riflePriority = ["legendary rifle", "sniper rifle", "iron rifle", "wooden rifle"];
  const rifleDisplay = riflePriority
    .map((name) => userDb.inventory.find((i) => i.shopItem?.name.toLowerCase() === name)?.shopItem?.name)
    .find(Boolean) ?? "None";

  const { propertyCount, propertyNames } = await getProfilePropertySummary(targetUser.id);
  const propertyDisplay = propertyNames.length > 0 ? trimBlock(propertyNames.join(", "), 180) : "None";
  const cardDisplay = cardSummary.card
    ? [
      `**Tier:** ${formatCardTier(cardSummary.card.tier)}`,
      `**Status:** ${cardSummary.card.status}`,
      `**Balance:** ${fmtCurrency(cardSummary.card.currentBalance)}`,
      `**Statement:** ${fmtCurrency(cardSummary.card.statementBalance)}`,
      cardSummary.card.dueAt ? `**Due:** <t:${Math.floor(cardSummary.card.dueAt.getTime() / 1000)}:R>` : null,
    ].filter(Boolean).join("\n")
    : "No Fortuna Card owned";

  const pageContent: Record<ProfilePage, { title: string; body: string }> = {
    overview: {
      title: `${Mascot.Emotes.Success} Overview`,
      body:
        `**Net Worth:** ${fmtCurrency(netWorth)}\n` +
        `**Flex Rank:** ${cosmeticSummary.rank}\n` +
        `**Profile Luck:** ${combinedLuck}/100\n` +
        `**Credit Score:** ${userDb.creditScore}\n\n` +
        `### ${Mascot.Emotes.MedalGold} Ranks\n${rankText}`,
    },
    wealth: {
      title: `${Mascot.Emotes.MoneyBag} Wealth`,
      body:
        `**Wallet:** ${fmtCurrency(walletBal)}\n` +
        `**Bank:** ${fmtCurrency(bankBal)}\n` +
        `**Stocks:** ${fmtCurrency(stockValue)}\n` +
        `**Inventory:** ${fmtCurrency(invValue)}\n` +
        `**Active Debt (card):** ${fmtCurrency(cardDebt)}\n\n` +
        `### ${Mascot.Emotes.Credit} Fortuna Card\n${cardDisplay}`,
    },
    career: {
      title: `${Mascot.Emotes.JobWorking} Career`,
      body:
        `**Job:** ${jobDisplay}\n` +
        `**Salary:** ${salaryDisplay}/shift\n` +
        `**Shifts:** ${userDb.shiftsWorked}\n` +
        `**Job Stress:** ${userDb.jobStress}/100\n` +
        `**Rifle:** ${rifleDisplay}\n` +
        `**Properties:** ${propertyCount} (${propertyDisplay})\n` +
        `**Chicken:** ${chickenDisplay}`,
    },
    cosmetics: {
      title: `${Mascot.Emotes.Sparks} Cosmetics`,
      body:
        `**Rank:** ${cosmeticSummary.rank}\n` +
        `**Owned:** ${cosmeticSummary.uniqueCount}/${COSMETICS_SHOP_CATALOG.length} unique (${cosmeticSummary.count} total)\n` +
        `**Value:** ${fmtCurrency(cosmeticSummary.totalValue)}\n` +
        `**Best Flex:** ${cosmeticSummary.best}\n` +
        `**Cosmetic Luck:** +${cosmeticSummary.cosmeticLuck}\n\n` +
        trimBlock(cosmeticSummary.showcase, 500),
    },
    education: {
      title: `${Mascot.Emotes.Graduate} Education`,
      body: `${educationDisplay}\n\n**Degrees:**\n${trimBlock(degrees, 500)}`,
    },
    relationship: {
      title: `${Mascot.Emotes.Love} Relationship`,
      body: marriageDisplay,
    },
  };

  const activePage = pageContent[page] ? page : "overview";
  const selected = pageContent[activePage];
  const files: AttachmentBuilder[] = [];
  const cardAsset = cardSummary.card ? resolveCardAsset(cardSummary.card.tier) : null;

  const container = new ContainerBuilder()
    .setAccentColor(PROFILE_ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${displayName}'s Profile`),
          new TextDisplayBuilder().setContent(`-# ${PROFILE_PAGES.find((p) => p.key === activePage)?.label ?? "Overview"} view`),
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(targetUser.displayAvatarURL({ size: 256 }))
            .setDescription(`${targetUser.username}'s avatar`),
        ),
    )
    .addSeparatorComponents(separator());

  if (activePage === "wealth" && cardAsset && cardSummary.card) {
    files.push(new AttachmentBuilder(cardAsset.filePath, { name: cardAsset.attachmentName }));
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${selected.title}\n${selected.body}`))
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(`attachment://${cardAsset.attachmentName}`)
            .setDescription(`${formatCardTier(cardSummary.card!.tier)} card`),
        ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${selected.title}\n${selected.body}`),
    );
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
    const ownerId = message.author.id;
    let currentPage: ProfilePage = "overview";
    let payload = await getProfilePayload(targetUser, guildId, displayName, currentPage);
    const controls = (disabled = false) => buildProfileControls(ownerId, currentPage, disabled);

    const reply = await message.reply({
      components: [payload.container, ...controls()],
      files: payload.files,
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== ownerId) {
        return i.reply({
          components: [textContainer("Profile Session", "Not your session.", 0xE74C3C)],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }

      if (i.isStringSelectMenu() && i.customId === `profile_page:${ownerId}`) {
        currentPage = i.values[0] as ProfilePage;
        await i.deferUpdate();
        try {
          const newPayload = await getProfilePayload(targetUser, guildId, displayName, currentPage);
          payload = newPayload;
          await i.editReply({
            components: [newPayload.container, ...controls()],
            files: newPayload.files,
          });
        } catch {
          await i.editReply({
            components: [textContainer("Profile Failed", "Failed to switch profile view.", 0xE74C3C)],
          });
        }
        return;
      }

      if (i.isButton() && i.customId === `prof_refresh:${ownerId}`) {
        await i.deferUpdate();
        try {
          const newPayload = await getProfilePayload(targetUser, guildId, displayName, currentPage);
          payload = newPayload;
          await i.editReply({
            components: [newPayload.container, ...controls()],
            files: newPayload.files,
          });
        } catch {
          await i.editReply({
            components: [textContainer("Refresh Failed", "Failed to refresh profile.", 0xE74C3C)],
          });
        }
      }
    });

    collector.on("end", () => {
      reply.edit({
        components: [payload.container, ...controls(true)],
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
