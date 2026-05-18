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
} from "discord.js";
import { hunt, HuntGroup } from "../../services/huntService";
import { seedHuntShop } from "../../services/shopService";
import { ZOO_CAPACITY, RIFLE_TIERS, RARITY_INCOME } from "../../utils/animalCatalog";
import { fmtCurrency } from "../../utils/format";
import { errorEmbed } from "../../utils/embed";
import { AnimalEmojis } from "../../config/branding";
import prisma from "../../utils/prisma";

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

export async function handleHunt(message: Message, _args: string[]) {
  const guildId = message.guildId!;
  const ownerId = message.author.id;

  await seedHuntShop(guildId);

  let result: Awaited<ReturnType<typeof hunt>>;
  try {
    result = await hunt(ownerId, message.author.username, guildId);
  } catch (err: any) {
    if (err.message === "NO_RIFLE") {
      return message.reply({
        embeds: [errorEmbed(message.author, "No Rifle", "You need a rifle to go hunting! Visit `!shop hunt` to buy one.")],
      });
    }
    if (err.message === "COOLDOWN") {
      const readyAt = Math.floor((Date.now() + err.ttl * 1000) / 1000);
      return message.reply({
        embeds: [errorEmbed(message.author, "Hunt Cooldown", `Your rifle needs time to cool down. Ready <t:${readyAt}:R>.`)],
      });
    }
    console.error("handleHunt error:", err);
    return message.reply({ embeds: [errorEmbed(message.author, "Error", "Something went wrong while hunting.")] });
  }

  const { groups, rifleName } = result;
  const totalCaught = groups.reduce((sum, g) => sum + g.count, 0);

  const hasZoo = !!(await prisma.ownedProperty.findFirst({
    where: {
      userId: ownerId,
      property: { key: { in: Object.keys(ZOO_CAPACITY) } },
    },
  }));

  const tier = RIFLE_TIERS[rifleName];
  const readyAt = Math.floor((Date.now() + tier.cooldownSeconds * 1000) / 1000);
  const rifleDisplay = rifleName.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Hunt Results\n**${rifleDisplay}** — caught **${totalCaught}** animal${totalCaught !== 1 ? "s" : ""} (${groups.length} type${groups.length !== 1 ? "s" : ""})`
    )
  );

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const emojiDisplay = AnimalEmojis[group.def.key] ?? "";
    const zooPerDay = RARITY_INCOME[group.def.rarity] * group.count * 24;
    const totalSell = group.def.sellValue * group.count;

    if (i > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojiDisplay} **${group.count}×** **${group.def.name}** — ${group.def.rarity}\n` +
        `Sell: **${fmtCurrency(totalSell)}** | Zoo: **+${fmtCurrency(zooPerDay)}/day**`
      ),
    );

    container.addActionRowComponents(buildGroupRow(group, ownerId, hasZoo));
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Next hunt <t:${readyAt}:R>`)
  );

  return message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}
