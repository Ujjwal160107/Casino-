import {
  ContainerBuilder,
  Message,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { useItem } from "../../services/shopService";
import { handleSpecialItemUse } from "../../services/shopItemEffects";
import { GENERAL_SHOP_CATALOG, HUNT_SHOP_CATALOG, JOB_SHOP_CATALOG, UNI_SHOP_CATALOG } from "../../utils/shopCatalog";

const USE_ACCENT_COLOR = 0x3498DB;

function v2Container(title: string, body: string, accentColor = USE_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function parseTargetAndItemName(args: string[]): { itemName: string; targetId: string | null } {
  if (args.length === 0) return { itemName: "", targetId: null };
  const last = args[args.length - 1];
  const mentionMatch = last.match(/^<@!?(\d+)>$/);
  const idMatch = last.match(/^(\d{17,19})$/);
  if (mentionMatch || idMatch) {
    const targetId = mentionMatch ? mentionMatch[1] : idMatch![1];
    const itemName = args.slice(0, -1).join(" ");
    return { itemName, targetId };
  }
  return { itemName: args.join(" "), targetId: null };
}

function findCatalogKeyByName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  const all = [...GENERAL_SHOP_CATALOG, ...HUNT_SHOP_CATALOG, ...JOB_SHOP_CATALOG, ...UNI_SHOP_CATALOG];
  return all.find(i => i.name.toLowerCase() === normalized)?.key ?? null;
}

/** Removes one unit of an item from inventory. Deletes the row if it was the last unit. */
async function consumeInventoryItem(discordId: string, itemName: string): Promise<void> {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const inv = await prisma.inventory.findMany({
    where: { userId: discordId },
    include: { shopItem: true },
  }) as any[];

  const entry = inv.find((i: any) => normalize(i.shopItem.name) === normalize(itemName) && i.amount > 0);
  if (!entry) return; // already gone or not found — no-op

  if (entry.amount <= 1) {
    await prisma.inventory.delete({ where: { id: entry.id } });
  } else {
    await prisma.inventory.update({ where: { id: entry.id }, data: { amount: { decrement: 1 } } });
  }
}

export async function handleUse(message: Message, args: string[]) {
  if (!message.guild || !message.member) return;

  const { itemName, targetId } = parseTargetAndItemName(args);

  if (!itemName) {
    return message.reply({
      components: [v2Container("Invalid Usage", "Usage: `use <item name>` or `use <item name> @user` for targeted items")],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  // Resolve catalog key first — if it's a special item, we run validation BEFORE consuming
  const catalogKey = findCatalogKeyByName(itemName);

  if (catalogKey) {
    if (catalogKey === "soul_ledger") {
      const existingLedger = await prisma.activeEffect.findFirst({
        where: {
          userId: message.author.id,
          effectType: "soul_ledger_watch",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (existingLedger) {
        try {
          const specialResult = await handleSpecialItemUse(
            catalogKey,
            message.author.id,
            message.guildId!,
            message.member,
            targetId ?? undefined,
          );

          if (specialResult) {
            const color = specialResult.success ? 0x2ECC71 : 0xE74C3C;
            return message.reply({
              components: [v2Container("Soul Ledger", specialResult.message, color)],
              flags: MessageFlags.IsComponentsV2,
            });
          }
        } catch (err: any) {
          return message.reply({
            components: [v2Container("Error", err.message || "Failed to use item.", 0xE74C3C)],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      }
    }

    // Verify the user actually owns this item before running the handler
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const inv = await prisma.inventory.findMany({
      where: { userId: message.author.id },
      include: { shopItem: true },
    }) as any[];

    const entry = inv.find((i: any) =>
      normalize(i.shopItem.name) === normalize(itemName) && i.amount > 0
    );

    if (!entry) {
      return message.reply({
        components: [v2Container("Error", `You don't own an item matching "**${itemName}**".`, 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (!entry.shopItem.usable) {
      return message.reply({
        components: [v2Container("Error", `**${entry.shopItem.name}** is not usable.`, 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    try {
      // Run the special handler BEFORE consuming
      const specialResult = await handleSpecialItemUse(
        catalogKey,
        message.author.id,
        message.guildId!,
        message.member,
        targetId ?? undefined,
      );

      if (specialResult) {
        // Consume only if the handler says to (defaults to true)
        const shouldConsume = specialResult.success && specialResult.shouldConsume !== false;
        if (shouldConsume) {
          await consumeInventoryItem(message.author.id, itemName);
        }

        const color = specialResult.success ? 0x2ECC71 : 0xE74C3C;
        return message.reply({
          components: [v2Container(entry.shopItem.name, specialResult.message, color)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch (err: any) {
      return message.reply({
        components: [v2Container("Error", err.message || "Failed to use item.", 0xE74C3C)],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }

  // Non-special item — use the standard useItem flow (handles effects + consumption)
  try {
    const { item, results } = await useItem(
      message.author.id,
      message.guildId!,
      itemName,
      message.member
    );

    const allMessages = results.map(r => r.message);
    const body = allMessages.length > 0 ? allMessages.join("\n") : "Item used successfully!";

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
