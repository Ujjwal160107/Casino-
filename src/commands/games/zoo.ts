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
import { feedSpecies, getZooStatus, removeAnimalsByKey, ZooSlot } from "../../services/zooService";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { seedZooProperties } from "../../services/propertyService";
import { getAnimal, ZOO_CAPACITY, ZOO_PROPERTY_DEFS } from "../../utils/animalCatalog";
import { fmtCurrency, fmtAmount } from "../../utils/format";
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
  incomePerDay: number;
  feedBillPerDay: number;
  claimable: boolean;
  nextClaim: Date | null;
  hungryCount: number;
  zooName: string | null;
  zooKey: string | null;
  nextTier: { key: string; name: string; price: number } | null;
  /** Non-zero only right after a status refresh purges starved animals or evicts over-capacity ones. */
  died: { animalKey: string; count: number }[];
  evicted: number;
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
  const { slots, maxSlots, incomePerDay, feedBillPerDay, claimable, nextClaim, hungryCount, zooName, zooKey, nextTier, died, evicted } = view;

  const files: AttachmentBuilder[] = [];
  const container = new ContainerBuilder();

  const deathLine = died.length > 0
    ? `\n${Mascot.Emotes.Decline} Starved and lost: ${died.map((d) => `${d.count}x ${getAnimal(d.animalKey)?.name ?? d.animalKey}`).join(", ")}`
    : "";
  const evictedLine = evicted > 0
    ? `\n${evicted} animal${evicted !== 1 ? "s" : ""} over capacity — sent back to inventory. Use \`!zoo remove\` before housing more, or upgrade your zoo.`
    : "";

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${Mascot.Emotes.Sparks} Your ${zooName ?? "Zoo"}\n` +
      `**${slots.length}/${maxSlots}** animal types | **+${fmtCurrency(incomePerDay)}/day** | feed **${fmtCurrency(feedBillPerDay)}/day**` +
      (hungryCount > 0 ? `\n${hungryCount} hungry animal${hungryCount !== 1 ? "s" : ""} earning nothing — \`!zoo feed <animal>\`` : "") +
      deathLine +
      evictedLine
    )
  );

  const hoursLeft = nextClaim ? Math.ceil((nextClaim.getTime() - Date.now()) / 3_600_000) : 0;
  // Plain number, not fmtCurrency — button labels don't render <:fortunes:…>.
  const collectLabel = claimable
    ? `Collect ${fmtAmount(incomePerDay)}`
    : `Next collect in ${hoursLeft}h`;

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`zoo_collect:${discordId}`)
      .setLabel(collectLabel)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!claimable || incomePerDay <= 0)
  );

  // One Feed All button, never one per species — ComponentsV2 caps at 40
  // components and a full zoo already spends most of them on slot sections.
  if (hungryCount > 0) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`zoo_feed_all:${discordId}`)
        .setLabel(`Feed All (${hungryCount})`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  // Single-slot upgrade ladder: offer the next-bigger zoo if one exists.
  if (nextTier) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_property_${nextTier.key}`)
        // Button labels don't render custom-emoji markup, so use a plain number
        // (fmtCurrency embeds the <:fortunes:…> emoji, which shows as raw text here).
        .setLabel(`Upgrade to ${nextTier.name} (${fmtAmount(nextTier.price)})`)
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
  const sorted = [...slots].sort((a, b) => b.incomePerDay - a.incomePerDay);
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

    const hungerLine = slot.hungryCount > 0
      ? `\n⚠️ **${slot.hungryCount} hungry** — dies in ${Math.max(0, Math.floor((slot.soonestDeathMs ?? 0) / 3_600_000))}h`
      : "";

    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${slot.count}x** ${emojiDisplay} **${slot.def.name}** — ${slot.def.rarity}\n` +
          `${Mascot.Emotes.Currency} +${fmtCurrency(slot.incomePerDay)}/day · feed ${fmtCurrency(slot.feedCostPerDay)}/day` +
          hungerLine
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
      return `**${slot.count}x** ${emojiDisplay} **${slot.def.name}** — ${slot.def.rarity} · +${fmtCurrency(slot.incomePerDay)}/day${slot.hungryCount > 0 ? ` · ⚠️ ${slot.hungryCount} hungry` : ""}`;
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
  const status = await getZooStatus(discordId);

  let nextTier: ZooView["nextTier"] = null;
  if (status.zooKey) {
    const def = ZOO_PROPERTY_DEFS.find((d) => (ZOO_CAPACITY[d.key] ?? 0) > (ZOO_CAPACITY[status.zooKey!] ?? 0));
    if (def) {
      const nextProp = await prisma.property.findFirst({ where: { key: def.key } });
      nextTier = { key: def.key, name: def.name, price: nextProp?.price ?? def.price };
    }
  }

  const view: ZooView = {
    slots: status.slots,
    maxSlots: status.tier?.types ?? 0,
    incomePerDay: status.incomePerDay,
    feedBillPerDay: status.feedBillPerDay,
    claimable: status.claimable,
    nextClaim: status.nextClaim,
    hungryCount: status.slots.reduce((s, x) => s + x.hungryCount, 0),
    zooName: status.zooName,
    zooKey: status.zooKey,
    nextTier,
    died: status.died,
    evicted: status.evicted,
  };

  const { components } = buildZooPayload(discordId, view, guild);
  return components[0];
}

export async function handleZoo(message: Message, args: string[]) {
  const guildId = message.guildId!;
  const discordId = message.author.id;

  await seedZooProperties(guildId);

  // !zoo feed <name> — spend one feed of the right rarity per hungry animal.
  if ((args[0] ?? "").toLowerCase() === "feed") {
    const raw = args.slice(1).join(" ").trim();
    if (!raw) {
      return message.reply(v2Reply(errorContainer("Zoo Feed", "Usage: `!zoo feed <animal name>` — or use the **Feed All** button on `!zoo`.")));
    }
    const query = raw.toLowerCase();
    const status = await getZooStatus(discordId);
    const match =
      status.slots.find((s) => s.def.name.toLowerCase() === query || s.animalKey.toLowerCase() === query) ??
      status.slots.find((s) => s.def.name.toLowerCase().includes(query));
    if (!match) {
      return message.reply(v2Reply(errorContainer("Zoo Feed", `You have no **${raw}** in your zoo.`)));
    }
    const result = await feedSpecies(discordId, match.animalKey);
    if (result.fed === 0 && result.missing.length === 0) {
      return message.reply(v2Reply(successContainer("Zoo Feed", `Your **${match.def.name}** are already fed. Nothing spent.`)));
    }
    const shortfall = result.missing.length
      ? `\nStill hungry: **${result.missing.reduce((s, m) => s + m.units, 0)}** — buy more feed in the Hunt Store.`
      : "";
    return message.reply(v2Reply(successContainer(
      "Zoo Feed",
      `Fed **${result.fed}x ${match.def.name}**. They earn again on your next collect.${shortfall}`,
    )));
  }

  // !zoo remove <name> — remove a species from the zoo. Overflow types in a big
  // zoo don't get their own Remove button, so this keeps them manageable.
  if ((args[0] ?? "").toLowerCase() === "remove") {
    const raw = args.slice(1).join(" ").trim();
    const query = raw.toLowerCase();
    if (!query) {
      return message.reply(v2Reply(errorContainer("Zoo Remove", "Usage: `!zoo remove <animal name>`")));
    }
    const slots = (await getZooStatus(discordId)).slots;
    const match =
      slots.find((s) => s.def.name.toLowerCase() === query || s.animalKey.toLowerCase() === query) ??
      slots.find((s) => s.def.name.toLowerCase().includes(query));
    if (!match) {
      return message.reply(v2Reply(errorContainer("Zoo Remove", `You have no **${raw}** in your zoo.`)));
    }
    const { count } = await removeAnimalsByKey(discordId, match.animalKey);
    return message.reply(v2Reply(successContainer("Zoo Updated", `Removed **${count}x ${match.def.name}** from your zoo. Use \`!hunt\` to catch more.`)));
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
            `Price: **${fmtCurrency(def.price)}**\nCapacity: **${capacity} animal types**${def.key === "world_zoo" ? " · the only zoo that can house a Legendary" : ""}\n-# ${def.description}`
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
    const status = await getZooStatus(discordId);
    const lines = status.slots
      .slice()
      .sort((a, b) => b.incomePerDay - a.incomePerDay)
      .map((s) => `${s.count}x ${s.def.name} (${s.def.rarity})${s.hungryCount > 0 ? ` — ${s.hungryCount} hungry` : ""}`)
      .join(", ");
    return message.reply(v2Reply(successContainer(
      `Your ${status.zooName ?? "Zoo"}`,
      `**${status.slots.length}/${status.tier?.types ?? 0}** animal types | **+${fmtCurrency(status.incomePerDay)}/day**\n` +
        (status.claimable ? "Ready to collect — use the button on `!zoo`.\n" : "") +
        (lines ? `\n${lines}` : "Your zoo is empty."),
    )));
  }
}
