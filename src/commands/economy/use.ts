import {
  ContainerBuilder,
  Message,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import { useItem } from "../../services/shopService";
import { handleSpecialItemUse } from "../../services/shopItemEffects";
import { GENERAL_SHOP_CATALOG } from "../../utils/shopCatalog";

const USE_ACCENT_COLOR = 0x3498DB;

function v2Container(title: string, body: string, accentColor = USE_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function findCatalogKeyByName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  const item = GENERAL_SHOP_CATALOG.find(i => i.name.toLowerCase() === normalized);
  return item?.key ?? null;
}

export async function handleUse(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  const itemName = args.join(" ");

  if (!itemName) {
    return message.reply({
      components: [v2Container("Invalid Usage", "Usage: `use <item name>`")],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  try {
    const { item, results } = await useItem(
      message.author.id,
      message.guildId!,
      itemName,
      message.member
    );

    const catalogKey = findCatalogKeyByName(item.name);

    if (catalogKey) {
      const specialResult = await handleSpecialItemUse(
        catalogKey,
        message.author.id,
        message.guildId!,
        message.member
      );

      if (specialResult) {
        const color = specialResult.success ? 0x2ECC71 : 0xE74C3C;
        return message.reply({
          components: [v2Container(item.name, specialResult.message, color)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }

    const allMessages = results.map(r => r.message);
    const body = allMessages.length > 0 ? allMessages.join("\n") : "✨ Item used successfully!";

    return message.reply({
      components: [v2Container(`Used: ${item.name}`, body, 0x2ECC71)],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (err: any) {
    return message.reply({
      components: [v2Container("Error", err.message || "Failed to use item.", 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}
