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
import { getZooStatus, getZooSlots, removeAnimalsByKey, ZooSlot } from "../../services/huntService";
import { errorEmbed, successEmbed } from "../../utils/embed";
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

export interface ZooView {
  slots: ZooSlot[];
  maxSlots: number;
  ratePerHour: number;
  hoursPending: number;
  zooName: string | null;
  zooKey: string | null;
  nextTier: { key: string; name: string; price: number } | null;
}

// Discord rejects ComponentsV2 messages with more than 40 total components or
// more than 10 file attachments (50035 Invalid Form Body). Each detailed slot
// costs a section + text + accessory (+ a thumbnail attachment), so only the
// top slots get their own section; the rest render as compact text lines. This
// keeps a full zoo (up to 16 types) safely under both limits — without it, big
// zoos silently failed to render. Overflow types are removable with
// `!zoo remove <name>`.
const MAX_DETAILED_ZOO_SLOTS = 6;

/** Pure renderer — no DB access, so it can be unit-checked (see checkV2Payloads). */
export function buildZooPayload(
  discordId: string,
  view: ZooView,
  guild: import("discord.js").Guild | null,
): { components: ContainerBuilder[]; files: AttachmentBuilder[] } {
  const { slots, maxSlots, ratePerHour, hoursPending, zooName, zooKey, nextTier } = view;

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
  if (nextTier) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_property_${nextTier.key}`)
        .setLabel(`Upgrade to ${nextTier.name} (${fmtCurrency(nextTier.price)})`)
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
    (container as any).__files = files;
    return { components: [container], files };
  }

  // Most valuable animals get a detailed section + Remove button; the rest are
  // summarised as text so the message stays under Discord's limits.
  const sorted = [...slots].sort((a, b) => b.incomePerHour - a.incomePerHour);
  const detailed = sorted.slice(0, MAX_DETAILED_ZOO_SLOTS);
  const overflow = sorted.slice(MAX_DETAILED_ZOO_SLOTS);

  for (let i = 0; i < detailed.length; i++) {
    const slot = detailed[i];
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

  if (overflow.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    const overflowLines = overflow.map((slot) => {
      const emojiDisplay = emojiInline(slot.def.emojiKey, guild) ?? AnimalEmojis[slot.def.key] ?? "";
      return `**${slot.count}x** ${emojiDisplay} **${slot.def.name}** — ${slot.def.rarity} · +${fmtCurrency(slot.incomePerHour)}/hr`;
    });
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        overflowLines.join("\n") + "\n-# Remove any of these with `!zoo remove <name>`."
      )
    );
  }

  (container as any).__files = files;
  return { components: [container], files };
}

export async function buildZooContainer(
  discordId: string,
  username: string,
  guildId: string,
  guild: import("discord.js").Guild | null
): Promise<ContainerBuilder> {
  const status = await getZooStatus(discordId, guildId);

  let nextTier: ZooView["nextTier"] = null;
  if (status.zooKey) {
    const def = ZOO_PROPERTY_DEFS.find((d) => (ZOO_CAPACITY[d.key] ?? 0) > (ZOO_CAPACITY[status.zooKey!] ?? 0));
    if (def) {
      const nextProp = await prisma.property.findFirst({ where: { key: def.key } });
      nextTier = { key: def.key, name: def.name, price: nextProp?.price ?? def.price };
    }
  }

  const { components } = buildZooPayload(discordId, { ...status, nextTier }, guild);
  return components[0];
}

export async function handleZoo(message: Message, args: string[]) {
  const guildId = message.guildId!;
  const discordId = message.author.id;

  await seedZooProperties(guildId);

  // !zoo remove <name> — remove a species from the zoo. Overflow types in a big
  // zoo don't get their own Remove button, so this keeps them manageable.
  if ((args[0] ?? "").toLowerCase() === "remove") {
    const raw = args.slice(1).join(" ").trim();
    const query = raw.toLowerCase();
    if (!query) {
      return message.reply({ embeds: [errorEmbed(message.author, "Zoo Remove", "Usage: `!zoo remove <animal name>`")] });
    }
    const slots = await getZooSlots(discordId);
    const match =
      slots.find((s) => s.def.name.toLowerCase() === query || s.animalKey.toLowerCase() === query) ??
      slots.find((s) => s.def.name.toLowerCase().includes(query));
    if (!match) {
      return message.reply({ embeds: [errorEmbed(message.author, "Zoo Remove", `You have no **${raw}** in your zoo.`)] });
    }
    const { count } = await removeAnimalsByKey(discordId, match.animalKey);
    return message.reply({
      embeds: [successEmbed(message.author, "Zoo Updated", `Removed **${count}x ${match.def.name}** from your zoo. Use \`!hunt\` to catch more.`)],
    });
  }

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

  try {
    const container = await buildZooContainer(discordId, message.author.username, guildId, message.guild);
    const files: AttachmentBuilder[] = (container as any).__files ?? [];

    return await message.reply({
      components: [container],
      files,
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err) {
    // Never leave the player staring at nothing — fall back to a plain-text
    // summary if the rich view can't be sent for any reason.
    console.error("handleZoo: zoo view reply failed, sending fallback:", err);
    const { slots, maxSlots, ratePerHour, hoursPending, zooName } = await getZooStatus(discordId, guildId);
    const pending = Math.floor(ratePerHour * hoursPending);
    const lines = slots
      .slice()
      .sort((a, b) => b.incomePerHour - a.incomePerHour)
      .map((s) => `${s.count}x ${s.def.name} (${s.def.rarity})`)
      .join(", ");
    return message.reply({
      embeds: [
        successEmbed(
          message.author,
          `Your ${zooName ?? "Zoo"}`,
          `**${slots.length}/${maxSlots}** animal types | **+${fmtCurrency(ratePerHour)}/hr**\n` +
            (pending > 0 ? `Pending income: **${fmtCurrency(pending)}** (${hoursPending}h) — collect with the button on \`!zoo\`.\n` : "") +
            (lines ? `\n${lines}` : "Your zoo is empty."),
        ),
      ],
    });
  }
}
