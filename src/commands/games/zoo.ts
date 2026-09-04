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
import { feedSpecies, getZooStatus, houseAnimals, removeAnimalsByKey, ZooSlot } from "../../services/zooService";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { seedZooProperties } from "../../services/propertyService";
import { ANIMAL_CATALOG, AnimalRarity, getAnimal, RARITY_FEED_KEY, ZOO_CAPACITY, ZOO_PROPERTY_DEFS } from "../../utils/animalCatalog";
import { HUNT_SHOP_CATALOG } from "../../utils/shopCatalog";
import { fmtCurrency, fmtAmount } from "../../utils/format";
import { emojiInline } from "../../utils/emojiRegistry";
import prisma from "../../utils/prisma";
import { AnimalEmojis, Mascot } from "../../config/branding";
import { ASSET_DIRS } from "../../utils/assetPaths";

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
  for (const dir of ASSET_DIRS) {
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
// more than 10 file attachments (50035 Invalid Form Body). Each slot costs a
// section + text + accessory + a thumbnail attachment, so six is what fits
// alongside the header, action row and navigation.
//
// Species beyond this used to be crammed into a compact text list at the
// bottom, which made them second-class: no thumbnail, no hunger bar, no Remove
// button. They now go on their own page instead, rendered identically.
const ZOO_SLOTS_PER_PAGE = 6;

/**
 * Factual, short note about animals a player just lost to starvation or
 * eviction — same wording wherever it's shown (the persistent view and the
 * ephemeral feed/collect replies) so the register never drifts between them.
 * Returns "" when there's nothing to report.
 */
export function formatCareNote(died: { animalKey: string; count: number }[], evicted: number): string {
  const deathPart = died.length > 0
    ? `${Mascot.Emotes.Decline} Starved and lost: ${died.map((d) => `${d.count}x ${getAnimal(d.animalKey)?.name ?? d.animalKey}`).join(", ")}`
    : "";
  const evictedPart = evicted > 0
    ? `${evicted} animal${evicted !== 1 ? "s" : ""} over capacity — sent back to inventory. Use \`!zoo remove\` before housing more, or upgrade your zoo.`
    : "";
  return [deathPart, evictedPart].filter(Boolean).map((line) => `\n${line}`).join("");
}

/**
 * Turns a FeedResult's `missing` lines into an instruction a player can act on:
 * the real shop item name and the exact command that buys that many of it.
 * "Buy feed in the Hunt Store" named a store that did not list feed at all, and
 * even now feed is sold by name rather than by numbered slot — so the command
 * is the useful thing to print. One helper, shared by `!zoo feed` and the Feed
 * All button, so the two can't drift.
 */
export function formatFeedShortfall(missing: { rarity: AnimalRarity; units: number }[]): string {
  if (missing.length === 0) return "";
  const total = missing.reduce((s, m) => s + m.units, 0);
  const buys = missing.map((m) => {
    const name = HUNT_SHOP_CATALOG.find((i) => i.key === RARITY_FEED_KEY[m.rarity])?.name ?? `${m.rarity} feed`;
    return `\`!buy ${m.units} ${name}\``;
  });
  return `**${total}** still hungry — buy feed with ${buys.join(" and ")} (browse it under \`!shop hunt\`).`;
}

/**
 * Widest a hunger bar may get. RARITY_STACK_LIMIT tops out at 4 (Common), so
 * within the rules one block per animal never exceeds this. The cap exists for
 * legacy rows that predate the limit -- the zoo exploit left accounts holding
 * hundreds of one species, and a block each would be thousands of characters.
 *
 * Payload cost drives this. Each block serialises as
 * `<:xp_full:1456569047758929931>`, about 30 characters, and a full zoo spends
 * nearly all of Discord's 4000-character ComponentsV2 budget before any bars.
 * See checkV2Payloads, which seeds the emoji registry so that number is real.
 */
const HUNGER_BAR_MAX = 4;

/**
 * Fed-to-total bar for one species.
 *
 * One block per animal while the stack fits in HUNGER_BAR_MAX, so the bar is
 * exact rather than a rounded proportion: three fed of four reads ▰▰▰▱ and
 * means precisely that.
 *
 * Over-sized legacy stacks fall back to a proportion, clamped at both ends so
 * the bar cannot lie -- any fed animal never shows fully empty, and any hungry
 * animal never shows fully full.
 */
function buildHungerBar(slot: ZooSlot, guild: import("discord.js").Guild | null): string {
  const full = emojiInline("xp_full", guild) ?? "▰";
  const empty = emojiInline("xp_empty", guild) ?? "▱";
  if (slot.count <= 0) return "";

  if (slot.count <= HUNGER_BAR_MAX) {
    return full.repeat(slot.fedCount) + empty.repeat(slot.count - slot.fedCount);
  }

  let filled = Math.round((slot.fedCount / slot.count) * HUNGER_BAR_MAX);
  if (slot.fedCount > 0 && filled === 0) filled = 1;
  if (slot.hungryCount > 0 && filled === HUNGER_BAR_MAX) filled = HUNGER_BAR_MAX - 1;
  return full.repeat(filled) + empty.repeat(HUNGER_BAR_MAX - filled);
}

/** Pure renderer — no DB access, so it can be unit-checked (see checkV2Payloads). */
export function buildZooPayload(
  discordId: string,
  view: ZooView,
  guild: import("discord.js").Guild | null,
  page = 1,
): { components: ContainerBuilder[]; files: AttachmentBuilder[] } {
  const { slots, maxSlots, incomePerDay, feedBillPerDay, claimable, nextClaim, hungryCount, zooName, zooKey, nextTier, died, evicted } = view;

  const files: AttachmentBuilder[] = [];
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${Mascot.Emotes.Sparks} Your ${zooName ?? "Zoo"}\n` +
      `**${slots.length}/${maxSlots}** animal types | **+${fmtCurrency(incomePerDay)}/day** | feed **${fmtCurrency(feedBillPerDay)}/day**` +
      (hungryCount > 0 ? `\n${hungryCount} hungry animal${hungryCount !== 1 ? "s" : ""} earning nothing — \`!zoo feed <animal>\`` : "") +
      formatCareNote(died, evicted)
    )
  );

  const hoursLeft = nextClaim ? Math.ceil((nextClaim.getTime() - Date.now()) / 3_600_000) : 0;
  // Plain number, not fmtCurrency — button labels don't render <:fortunes:…>.
  const collectLabel = !claimable
    ? `Next collect in ${hoursLeft}h`
    : incomePerDay <= 0
      ? "Nothing to collect yet"
      : `Collect ${fmtAmount(incomePerDay)}`;

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

  // Sorted by income so the most valuable species lead, then paged. Every slot
  // renders the same way whichever page it lands on.
  const sorted = [...slots].sort((a, b) => b.incomePerDay - a.incomePerDay);
  const totalPages = Math.max(1, Math.ceil(sorted.length / ZOO_SLOTS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const detailed = sorted.slice((safePage - 1) * ZOO_SLOTS_PER_PAGE, safePage * ZOO_SLOTS_PER_PAGE);

  for (let i = 0; i < detailed.length; i++) {
    const slot = detailed[i];
    const emojiDisplay = emojiInline(slot.def.emojiKey, guild) ?? AnimalEmojis[slot.def.key] ?? "";

    if (i > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
      );
    }

    // Hunger is tracked per animal, not per species, so a slot can hold both
    // fed and hungry animals -- the bar shows that split rather than a single
    // fed/hungry verdict for the whole row.
    const bar = buildHungerBar(slot, guild);
    const hungerLine = slot.hungryCount > 0
      ? `\n${bar} ${slot.fedCount}/${slot.count} fed — ⚠️ **${slot.hungryCount} hungry**, dies in ${Math.max(0, Math.floor((slot.soonestDeathMs ?? 0) / 3_600_000))}h`
      : `\n${bar} ${slot.count}/${slot.count} fed`;

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

  if (totalPages > 1) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`zoo_page:${safePage - 1}:${discordId}`)
          .setLabel("Prev")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 1),
        // A disabled button is the page indicator: a text component would cost
        // one of the 40 either way, and this keeps the row self-contained.
        new ButtonBuilder()
          .setCustomId("zoo_page_indicator")
          .setLabel(`Page ${safePage}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`zoo_page:${safePage + 1}:${discordId}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages),
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
  guild: import("discord.js").Guild | null,
  page = 1,
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

  const { components } = buildZooPayload(discordId, view, guild, page);
  return components[0];
}

export async function handleZoo(message: Message, args: string[]) {
  const guildId = message.guildId!;
  const discordId = message.author.id;

  await seedZooProperties(guildId);

  // !zoo add <name> — house animals from inventory. The "Send to zoo" button on
  // a hunt result is the only other route into houseAnimals, and it dies with
  // the message it was posted on; eviction (over-cap trims, zoo sales) is
  // routine, so re-housing has to be reachable from a command too.
  if ((args[0] ?? "").toLowerCase() === "add") {
    const raw = args.slice(1).join(" ").trim();
    if (!raw) {
      return message.reply(v2Reply(errorContainer("Zoo Add", "Usage: `!zoo add <animal name>` — houses animals of that species from your inventory.")));
    }
    const query = raw.toLowerCase();
    // Matched against the catalog, not the zoo's current slots: the animal
    // being added is in inventory, so by definition it is not in a slot yet.
    const def =
      ANIMAL_CATALOG.find((a) => a.name.toLowerCase() === query || a.key.toLowerCase() === query) ??
      ANIMAL_CATALOG.find((a) => a.name.toLowerCase().includes(query));
    if (!def) {
      return message.reply(v2Reply(errorContainer("Zoo Add", `There's no animal called **${raw}**.`)));
    }
    // Captured before houseAnimals, which runs its own purge/eviction pass and
    // discards the result — same reason as the feed branch below.
    const status = await getZooStatus(discordId);
    const careNote = formatCareNote(status.died, status.evicted);
    const { housed, reason } = await houseAnimals(discordId, def.key);
    if (housed === 0) {
      return message.reply(v2Reply(errorContainer("Zoo Add", `${reason ?? "Couldn't house that animal."}${careNote}`)));
    }
    return message.reply(v2Reply(successContainer(
      "Zoo Updated",
      `Housed **${housed}x ${def.name}**. Feed them with \`!zoo feed ${def.name}\` so they earn on your next collect.${careNote}`,
    )));
  }

  // !zoo feed <name> — spend one feed of the right rarity per hungry animal.
  if ((args[0] ?? "").toLowerCase() === "feed") {
    const raw = args.slice(1).join(" ").trim();
    if (!raw) {
      return message.reply(v2Reply(errorContainer("Zoo Feed", "Usage: `!zoo feed <animal name>` — or use the **Feed All** button on `!zoo`.")));
    }
    const query = raw.toLowerCase();
    // Captured before feedSpecies mutates anything below, so this reflects the
    // same purge/eviction pass feedSpecies would otherwise run and discard —
    // the only way to surface it to the player at all.
    const status = await getZooStatus(discordId);
    const careNote = formatCareNote(status.died, status.evicted);
    const match =
      status.slots.find((s) => s.def.name.toLowerCase() === query || s.animalKey.toLowerCase() === query) ??
      status.slots.find((s) => s.def.name.toLowerCase().includes(query));
    if (!match) {
      return message.reply(v2Reply(errorContainer("Zoo Feed", `You have no **${raw}** in your zoo.${careNote}`)));
    }
    const result = await feedSpecies(discordId, match.animalKey);
    if (result.fed === 0 && result.missing.length === 0) {
      return message.reply(v2Reply(successContainer("Zoo Feed", `Your **${match.def.name}** are already fed. Nothing spent.${careNote}`)));
    }
    if (result.fed === 0) {
      return message.reply(v2Reply(errorContainer(
        "Zoo Feed",
        `You have no feed for your **${match.def.name}**.\n${formatFeedShortfall(result.missing)}${careNote}`,
      )));
    }
    const shortfall = result.missing.length ? `\n${formatFeedShortfall(result.missing)}` : "";
    return message.reply(v2Reply(successContainer(
      "Zoo Feed",
      `Fed **${result.fed}x ${match.def.name}**. They earn again on your next collect.${shortfall}${careNote}`,
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
