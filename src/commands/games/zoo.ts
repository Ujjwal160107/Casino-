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
import { getZooStatus, ZooSlot } from "../../services/huntService";
import { seedZooProperties } from "../../services/propertyService";
import { ZOO_CAPACITY, RARITY_INCOME, ZOO_PROPERTY_DEFS } from "../../utils/animalCatalog";
import { fmtCurrency } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import prisma from "../../utils/prisma";
import { AnimalEmojis, Mascot } from "../../config/branding";

const RARITY_COLOR: Record<string, string> = {
  Common: "⬜",
  Uncommon: "🟩",
  Rare: "🟦",
  Legendary: "🟨",
};

const ZOO_ASSET_MAP: Record<string, string> = {
  mini_zoo:  "mini zoo",
  city_zoo:  "city zoo",
  world_zoo: "world zoo",
};

function resolveAsset(assetName: string, prefix = ""): { filePath: string; attachmentName: string } | null {
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

export async function buildZooContainer(
  discordId: string,
  username: string,
  guildId: string,
  guild: import("discord.js").Guild | null
): Promise<ContainerBuilder> {
  const { slots, maxSlots, ratePerHour, hoursPending, zooName, zooKey } = await getZooStatus(discordId, guildId);

  const pendingIncome = Math.floor(ratePerHour * hoursPending);
  const collectDisabled = hoursPending < 1;

  const files: AttachmentBuilder[] = [];
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${Mascot.Emotes.Sparks} Your ${zooName ?? "Zoo"}\n` +
      `**${slots.length}/${maxSlots}** animal types | **+${fmtCurrency(ratePerHour)}/hr** | **~${fmtCurrency(ratePerHour * 24)}/day** max`
    )
  );

  const collectLabel = collectDisabled
    ? "Nothing to collect yet"
    : `Collect ${fmtCurrency(pendingIncome)} (${hoursPending}h accumulated)`;

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`zoo_collect:${discordId}`)
      .setLabel(collectLabel)
      .setStyle(ButtonStyle.Success)
      .setDisabled(collectDisabled)
  );

  // Single-slot upgrade ladder: offer the next-bigger zoo if one exists.
  const nextTier = zooKey
    ? ZOO_PROPERTY_DEFS.find((d) => (ZOO_CAPACITY[d.key] ?? 0) > (ZOO_CAPACITY[zooKey] ?? 0))
    : null;
  if (nextTier) {
    const nextProp = await prisma.property.findFirst({ where: { key: nextTier.key } });
    const nextPrice = nextProp?.price ?? nextTier.price;
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_property_${nextTier.key}`)
        .setLabel(`Upgrade to ${nextTier.name} (${fmtCurrency(nextPrice)})`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  container.addActionRowComponents(actionRow);

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  if (slots.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Your zoo is empty. Use `!hunt` to catch animals, then send them here!")
    );
  } else {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const emojiDisplay = emojiInline(slot.def.emojiKey, guild) ?? AnimalEmojis[slot.def.key] ?? "";

      if (i > 0) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
        );
      }

      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${slot.count}x** ${emojiDisplay} **${slot.def.name}** — ${slot.def.rarity}\n` +
            `${Mascot.Emotes.Currency} +${fmtCurrency(slot.incomePerHour)}/hr (${slot.count}x ${fmtCurrency(RARITY_INCOME[slot.def.rarity])})`
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`zoo_remove:${slot.animalKey}:${discordId}`)
            .setLabel(`Remove All`)
            .setStyle(ButtonStyle.Danger),
        );

      if (slot.def.asset) {
        const asset = resolveAsset(slot.def.asset, "zoo_");
        if (asset && !files.find((f) => (f as any).name === asset.attachmentName)) {
          section.setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(`attachment://${asset.attachmentName}`)
              .setDescription(slot.def.name),
          );
          files.push(new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }));
        }
      }

      container.addSectionComponents(section);
    }
  }

  (container as any).__files = files;
  return container;
}

export async function handleZoo(message: Message, _args: string[]) {
  const guildId = message.guildId!;
  const discordId = message.author.id;

  await seedZooProperties(guildId);

  const ownedZoo = await prisma.ownedProperty.findFirst({
    where: {
      userId: discordId,
      property: { key: { in: Object.keys(ZOO_CAPACITY) } },
    },
  });

  if (!ownedZoo) {
    const files: AttachmentBuilder[] = [];
    const noZooContainer = new ContainerBuilder();

    noZooContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.Sparks} No Zoo Found\n\nYou don't own a zoo yet! Purchase a zoo property to start housing animals and earning passive income.`
      )
    );
    noZooContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

    for (const def of ZOO_PROPERTY_DEFS) {
      const capacity = ZOO_CAPACITY[def.key];
      const assetName = ZOO_ASSET_MAP[def.key];
      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### ${def.name}`),
          new TextDisplayBuilder().setContent(
            `Price: **${fmtCurrency(def.price)}**\nCapacity: **${capacity} animal types**\n-# ${def.description}`
          ),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`buy_property_${def.key}`)
            .setLabel(`Buy`)
            .setStyle(ButtonStyle.Primary),
        );

      if (assetName) {
        const asset = resolveAsset(assetName, "nozoo_");
        if (asset && !files.find((f) => (f as any).name === asset.attachmentName)) {
          section.setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(`attachment://${asset.attachmentName}`)
              .setDescription(def.name),
          );
          files.push(new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }));
        }
      }

      noZooContainer.addSectionComponents(section);
    }

    noZooContainer.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    noZooContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Use \`!properties\` to browse and buy.`)
    );

    return message.reply({
      components: [noZooContainer],
      files,
      flags: MessageFlags.IsComponentsV2,
    });
  }

  const container = await buildZooContainer(discordId, message.author.username, guildId, message.guild);
  const files: AttachmentBuilder[] = (container as any).__files ?? [];

  return message.reply({
    components: [container],
    files,
    flags: MessageFlags.IsComponentsV2,
  });
}
