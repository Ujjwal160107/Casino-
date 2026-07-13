import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  Message,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import { hunt, HuntGroup } from "../../services/huntService";
import { seedHuntShop } from "../../services/shopService";
import { ZOO_CAPACITY, RIFLE_TIERS, RARITY_INCOME } from "../../utils/animalCatalog";
import { fmtCurrency } from "../../utils/format";
import { errorContainer, v2Reply } from "../../utils/componentsV2";
import { AnimalEmojis } from "../../config/branding";
import prisma from "../../utils/prisma";
import { buildHuntCraftPayload } from "../../services/huntCraftService";

function resolveAnimalAsset(assetName: string, prefix = ""): { filePath: string; attachmentName: string } | null {
  const assetDirs = [
    path.resolve(process.cwd(), "src", "assets"),
    path.resolve(process.cwd(), "assets"),
  ];
  for (const dir of assetDirs) {
    const filePath = [".png", ".jpg", ".jpeg", ".webp"]
      .map((ext) => path.join(dir, `${assetName}${ext}`))
      .find((f) => fs.existsSync(f));
    if (filePath) {
      const safeName = (prefix + assetName).replace(/\s+/g, "_");
      return { filePath, attachmentName: `${safeName}${path.extname(filePath)}` };
    }
  }
  return null;
}

function buildGroupRow(
  group: HuntGroup,
  ownerId: string,
  hasZoo: boolean
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hunt_sell:${group.animalKey}:${ownerId}`)
      .setLabel(`Sell${group.count > 1 ? ` (×${group.count})` : ""}`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`hunt_market:${group.animalKey}:${ownerId}`)
      .setLabel("Black Market")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`hunt_store_parts:${group.animalKey}:${ownerId}`)
      .setLabel("Store Parts")
      .setStyle(ButtonStyle.Secondary),
  );

  if (hasZoo) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`hunt_zoo:${group.animalKey}:${ownerId}`)
        .setLabel("Send to Zoo")
        .setStyle(ButtonStyle.Primary),
    );
  }

  return row;
}

function buildGlobalRow(ownerId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hunt_sell_all:${ownerId}`)
      .setLabel("Sell All")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`inv2_hunt_craft:${ownerId}`)
      .setLabel("Craft")
      .setStyle(ButtonStyle.Secondary),
  );
}

// Discord rejects ComponentsV2 messages with more than 40 total components
// (50035 Invalid Form Body). Each detailed group costs up to 9 components
// (separator + section + text + thumbnail + action row + 4 buttons), so only
// the top groups get their own section/buttons; the rest render as text.
const MAX_DETAILED_GROUPS = 3;

const RARITY_SORT: Record<string, number> = { Legendary: 0, Rare: 1, Uncommon: 2, Common: 3 };

export function buildHuntResultPayload(
  ownerId: string,
  groups: HuntGroup[],
  rifleName: string,
  newlyUnlockedRecipes: string[],
  hasZoo: boolean,
): { components: ContainerBuilder[]; files: AttachmentBuilder[]; flags: number } {
  const totalCaught = groups.reduce((sum, g) => sum + g.count, 0);
  const tier = RIFLE_TIERS[rifleName];

  const sorted = [...groups].sort((a, b) => {
    const byRarity = (RARITY_SORT[a.def.rarity] ?? 9) - (RARITY_SORT[b.def.rarity] ?? 9);
    if (byRarity !== 0) return byRarity;
    return b.def.sellValue * b.count - a.def.sellValue * a.count;
  });
  const detailed = sorted.slice(0, MAX_DETAILED_GROUPS);
  const overflow = sorted.slice(MAX_DETAILED_GROUPS);
  const readyAt = Math.floor((Date.now() + tier.cooldownSeconds * 1000) / 1000);
  const rifleDisplay = rifleName.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

  const container = new ContainerBuilder();
  const files: AttachmentBuilder[] = [];

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Hunt Results\n**${rifleDisplay}** — caught **${totalCaught}** animal${totalCaught !== 1 ? "s" : ""} (${groups.length} type${groups.length !== 1 ? "s" : ""})`
    )
  );

  for (let i = 0; i < detailed.length; i++) {
    const group = detailed[i];
    const emojiDisplay = AnimalEmojis[group.def.key] ?? "";
    const zooPerDay = RARITY_INCOME[group.def.rarity] * group.count * 24;
    const totalSell = group.def.sellValue * group.count;

    if (i > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
      );
    }

    const section = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojiDisplay} **${group.count}×** **${group.def.name}** — ${group.def.rarity}\n` +
        `Sell: **${fmtCurrency(totalSell)}** | Zoo: **+${fmtCurrency(zooPerDay)}/day**`,
      ),
    );

    if (group.def.asset) {
      const asset = resolveAnimalAsset(group.def.asset, `hunt_${group.def.key}_`);
      if (asset && !files.some((f) => f.name === asset.attachmentName)) {
        section.setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(`attachment://${asset.attachmentName}`)
            .setDescription(group.def.name),
        );
        files.push(new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }));
      }
    }

    container.addSectionComponents(section);
    container.addActionRowComponents(buildGroupRow(group, ownerId, hasZoo));
  }

  if (overflow.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true),
    );
    const overflowLines = overflow.map((group) => {
      const emojiDisplay = AnimalEmojis[group.def.key] ?? "";
      const zooPerDay = RARITY_INCOME[group.def.rarity] * group.count * 24;
      const totalSell = group.def.sellValue * group.count;
      return `${emojiDisplay} **${group.count}×** **${group.def.name}** — ${group.def.rarity} · Sell: **${fmtCurrency(totalSell)}** | Zoo: **+${fmtCurrency(zooPerDay)}/day**`;
    });
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        overflowLines.join("\n") + "\n-# Manage these with **Sell All** below, `!zoo`, or the black market."
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Next hunt <t:${readyAt}:R>`)
  );
  if (newlyUnlockedRecipes.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        newlyUnlockedRecipes.map((name) => `-# New recipe discovered: **${name}**!`).join("\n")
      )
    );
  }
  container.addActionRowComponents(buildGlobalRow(ownerId));

  return {
    components: [container],
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

export async function handleHunt(message: Message, args: string[]) {
  const guildId = message.guildId!;
  const ownerId = message.author.id;

  await seedHuntShop(guildId);

  if ((args[0] ?? "").toLowerCase() === "craft") {
    return message.reply(await buildHuntCraftPayload(ownerId, ownerId, 1));
  }

  let result: Awaited<ReturnType<typeof hunt>>;
  try {
    result = await hunt(ownerId, message.author.username, guildId);
  } catch (err: any) {
    if (err.message === "NO_RIFLE") {
      return message.reply(v2Reply(errorContainer("No Rifle", "You need a rifle to go hunting! Visit `!shop hunt` to buy one.")));
    }
    if (err.message === "COOLDOWN") {
      const readyAt = Math.floor((Date.now() + err.ttl * 1000) / 1000);
      return message.reply(v2Reply(errorContainer("Hunt Cooldown", `Your rifle needs time to cool down. Ready <t:${readyAt}:R>.`)));
    }
    console.error("handleHunt error:", err);
    return message.reply(v2Reply(errorContainer("Error", "Something went wrong while hunting.")));
  }

  const { groups, rifleName, newlyUnlockedRecipes } = result;

  const hasZoo = !!(await prisma.ownedProperty.findFirst({
    where: {
      userId: ownerId,
      property: { key: { in: Object.keys(ZOO_CAPACITY) } },
    },
  }));

  const payload = buildHuntResultPayload(ownerId, groups, rifleName, newlyUnlockedRecipes, hasZoo);

  try {
    return await message.reply(payload);
  } catch (err) {
    // The cooldown is already consumed and the animals are saved — never let a
    // render failure eat the hunt silently. Fall back to a plain-text summary.
    console.error("handleHunt: hunt results reply failed, sending fallback:", err);
    const totalCaught = groups.reduce((sum, g) => sum + g.count, 0);
    const summary = groups.map((g) => `${g.count}× ${g.def.name}`).join(", ");
    const readyAt = Math.floor((Date.now() + RIFLE_TIERS[rifleName].cooldownSeconds * 1000) / 1000);
    return message.reply({
      content:
        `**Hunt Results** — you caught **${totalCaught}** animal${totalCaught !== 1 ? "s" : ""}: ${summary}.\n` +
        `Your catch is saved — manage it with \`!zoo\`, the black market, or \`!hunt craft\`.\n` +
        `-# Next hunt <t:${readyAt}:R>`,
    });
  }
}
