import {
  ContainerBuilder,
  Message,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { useItem } from "../../services/shopService";
import { handleSpecialItemUse } from "../../services/shopItemEffects";
import { GENERAL_SHOP_CATALOG, HUNT_SHOP_CATALOG, JOB_SHOP_CATALOG, UNI_SHOP_CATALOG, COCK_SHOP_CATALOG } from "../../utils/shopCatalog";
import { seedCockShop } from "../../services/shopService";

const USE_ACCENT_COLOR = 0x3498DB;

function v2Container(title: string, body: string, accentColor = USE_ACCENT_COLOR) {
  return new ContainerBuilder()
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

const FEED_SHORTHANDS: Record<string, string> = {
  basic: "Basic Feed",
  protein: "Protein Feed",
  champion: "Champion Feed",
};

function findCatalogKeyByName(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "komodo venom flask") return "komodo_venom_flask";
  const all = [...GENERAL_SHOP_CATALOG, ...HUNT_SHOP_CATALOG, ...JOB_SHOP_CATALOG, ...UNI_SHOP_CATALOG, ...COCK_SHOP_CATALOG];
  const stripApostrophes = (s: string) => s.replace(/['’]/g, "");
  return (
    all.find(i => i.name.toLowerCase() === normalized)?.key ??
    all.find(i => stripApostrophes(i.name.toLowerCase()) === stripApostrophes(normalized))?.key ??
    null
  );
}

function getCatalogNameByKey(key: string): string | null {
  const all = [...GENERAL_SHOP_CATALOG, ...HUNT_SHOP_CATALOG, ...JOB_SHOP_CATALOG, ...UNI_SHOP_CATALOG, ...COCK_SHOP_CATALOG];
  return all.find(i => i.key === key)?.name ?? null;
}

const HUNT_PATH_MODES: Record<string, string> = {
  safe: "safe",
  safer: "safe",
  risky: "risky",
  riskier: "risky",
};

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

  // --- Feed shorthand + amount parsing ---
  // "!use basic 5", "!use basic feed 5", "!use protein", "!use champion feed"
  let feedAmount = 1;
  let resolvedArgs = [...args];

  if (args.length > 0) {
    const firstWord = args[0]?.toLowerCase();
    if (FEED_SHORTHANDS[firstWord]) {
      const fullName = FEED_SHORTHANDS[firstWord];
      // Check if last arg is a number (amount)
      const lastArg = args[args.length - 1];
      const parsed = parseInt(lastArg, 10);
      if (!isNaN(parsed) && parsed > 0 && args.length > 1) {
        feedAmount = parsed;
        // Remove the amount from args, replace with full name
        resolvedArgs = fullName.split(" ");
      } else if (args[1]?.toLowerCase() === "feed") {
        // "basic feed 5" or "basic feed"
        const amountArg = args[2];
        if (amountArg && !isNaN(parseInt(amountArg, 10))) {
          feedAmount = parseInt(amountArg, 10);
        }
        resolvedArgs = fullName.split(" ");
      } else {
        resolvedArgs = fullName.split(" ");
      }
    } else {
      // Check for trailing number on non-shorthand feed items: "!use basic feed 5"
      const lastArg = args[args.length - 1];
      const parsed = parseInt(lastArg, 10);
      if (!isNaN(parsed) && parsed > 0 && args.length > 1) {
        const nameWithoutAmount = args.slice(0, -1).join(" ").toLowerCase();
        if (Object.values(FEED_SHORTHANDS).some(n => n.toLowerCase() === nameWithoutAmount)) {
          feedAmount = parsed;
          resolvedArgs = args.slice(0, -1);
        }
      }
    }
  }

  let { itemName, targetId } = parseTargetAndItemName(resolvedArgs);

  if (!itemName) {
    return message.reply({
      components: [v2Container("Invalid Usage", "Usage: `use <item name>` or `use <item name> @user` for targeted items")],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  // Resolve catalog key first — if it's a special item, we run validation BEFORE consuming
  let catalogKey = findCatalogKeyByName(itemName);

  // Hunter's Compass takes a trailing path argument: "use hunters compass risky|safe"
  let extraArg: string | undefined;
  if (!catalogKey) {
    const words = itemName.trim().split(/\s+/);
    const lastWord = words[words.length - 1]?.toLowerCase();
    if (words.length > 1 && HUNT_PATH_MODES[lastWord]) {
      const strippedName = words.slice(0, -1).join(" ");
      if (findCatalogKeyByName(strippedName) === "hunters_compass") {
        catalogKey = "hunters_compass";
        itemName = strippedName;
        extraArg = HUNT_PATH_MODES[lastWord];
      }
    }
  }

  if (catalogKey) {
    if (catalogKey === "loaded_dice_of_ruin") {
      return message.reply({
        components: [v2Container("Loaded Dice of Ruin", "This relic is rolled with the `roll` command, not `use`.")],
        flags: MessageFlags.IsComponentsV2,
      });
    }

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
    const canonicalName = getCatalogNameByKey(catalogKey) ?? itemName;
    const inv = await prisma.inventory.findMany({
      where: { userId: message.author.id },
      include: { shopItem: true },
    }) as any[];

    const entry = inv.find((i: any) =>
      (normalize(i.shopItem.name) === normalize(itemName) ||
        normalize(i.shopItem.name) === normalize(canonicalName)) && i.amount > 0
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
      // Seed cock shop for cock items
      const cockItem = COCK_SHOP_CATALOG.find(i => i.key === catalogKey);
      if (cockItem) await seedCockShop(message.guildId!);

      // For feed items with amount > 1, loop through feed actions
      const isFeed = ["basic_feed", "protein_feed", "champion_feed"].includes(catalogKey);
      if (isFeed && feedAmount > 1) {
        if (entry.amount < feedAmount) {
          return message.reply({
            components: [v2Container("Error", `You only have **${entry.amount}x ${entry.shopItem.name}** but tried to use ${feedAmount}.`, 0xE74C3C)],
            flags: MessageFlags.IsComponentsV2,
          });
        }

        let totalConsumed = 0;
        let lastResult: any = null;
        for (let i = 0; i < feedAmount; i++) {
          const result = await handleSpecialItemUse(catalogKey, message.author.id, message.guildId!, message.member, undefined);
          if (!result || !result.success) { lastResult = result; break; }
          lastResult = result;
          totalConsumed++;
        }

        if (totalConsumed > 0) {
          if (entry.amount <= totalConsumed) {
            await prisma.inventory.delete({ where: { id: entry.id } });
          } else {
            await prisma.inventory.update({ where: { id: entry.id }, data: { amount: { decrement: totalConsumed } } });
          }
        }

        const color = totalConsumed > 0 ? 0x2ECC71 : 0xE74C3C;
        const msg = lastResult?.message || "No feeds processed.";
        return message.reply({
          components: [v2Container(entry.shopItem.name, msg, color)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      // Run the special handler BEFORE consuming
      const specialResult = await handleSpecialItemUse(
        catalogKey,
        message.author.id,
        message.guildId!,
        message.member,
        targetId ?? undefined,
        extraArg,
      );

      if (specialResult) {
        // Consume only if the handler says to (defaults to true)
        const shouldConsume = specialResult.success && specialResult.shouldConsume !== false;
        if (shouldConsume) {
          await consumeInventoryItem(message.author.id, entry.shopItem.name);
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
