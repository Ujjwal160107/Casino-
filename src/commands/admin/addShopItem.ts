import { Message } from "discord.js";
import { createShopItem } from "../../services/shopService";
import { successEmbed, errorEmbed, infoEmbed } from "../../utils/embed";
import { parseSmartAmount, fmtCurrency } from "../../utils/format";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { ItemEffect } from "../../services/effectService";
import { createTextCollector } from "../../utils/collectorHelper";
import { Mascot } from "../../config/branding";

interface ItemBuilder {
  name: string;
  price: number;
  description: string;
  itemType: string;
  consumable: boolean;
  effects: ItemEffect[];
}

export async function handleAddShopItem(message: Message, args: string[]) {
  if (!message.member || !(await canExecuteAdminCommand(message, message.member))) return;
  if (!message.guild) return;

  // Type guard for text channels
  if (!message.channel.isSendable()) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Error", "This command must be used in a text channel.")]
    });
  }

  if (args.length < 2) {
    return message.reply({
      embeds: [errorEmbed(
        message.author,
        "Invalid Usage",
        "Usage: `!add-shop-item <name> <price>`\n\n" +
        "This will start an interactive setup process!"
      )]
    });
  }

  const builder: ItemBuilder = {
    name: args[0],
    price: parseSmartAmount(args[1]),
    description: "No description",
    itemType: "COLLECTIBLE",
    consumable: false,
    effects: []
  };

  if (isNaN(builder.price) || builder.price <= 0) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Invalid Price", "Price must be a positive number.")]
    });
  }

  await message.reply({
    embeds: [infoEmbed(
      message.author,
      "🛒 Shop Item Builder Started",
      `Creating: **${builder.name}** for ${fmtCurrency(builder.price)}\n\n` +
      "Reply to each prompt below. Type `skip` to use defaults or `cancel` to abort."
    )]
  });

  // Step 1: Description
  // @ts-ignore - guild text channels support send
  await message.channel.send("📝 **Step 1/4:** Enter item description (or `skip`):");
  const desc = await awaitTextResponse(message);
  if (desc === "CANCEL") return message.reply(`${Mascot.Emotes.Decline} Cancelled.`);
  if (desc && desc !== "SKIP") builder.description = desc;

  // Step 2: Item Type
  // @ts-ignore - guild text channels support send
  await message.channel.send(
    "📦 **Step 2/4:** Select item type:\n" +
    "`1` - Collectible (default)\n" +
    "`2` - Consumable (used once)\n" +
    "`3` - Role Item\n" +
    "`4` - Buff Item"
  );
  const typeChoice = await awaitTextResponse(message);
  if (typeChoice === "CANCEL") return message.reply(`${Mascot.Emotes.Decline} Cancelled.`);

  if (typeChoice === "2") {
    builder.itemType = "CONSUMABLE";
    builder.consumable = true;
  } else if (typeChoice === "3") {
    builder.itemType = "ROLE";
  } else if (typeChoice === "4") {
    builder.itemType = "BUFF";
  }

  // Step 3: Consumable toggle (if not already set)
  if (!builder.consumable) {
    // @ts-ignore - guild text channels support send
    await message.channel.send("🔄 **Step 3/4:** Make this item consumable? (`yes`/`no` or `skip`):");
    const consumableChoice = await awaitTextResponse(message);
    if (consumableChoice === "CANCEL") return message.reply(`${Mascot.Emotes.Decline} Cancelled.`);
    if (consumableChoice?.toLowerCase() === "yes") builder.consumable = true;
  } else {
    // @ts-ignore - guild text channels support send
    await message.channel.send("🔄 **Step 3/4:** Item is consumable (auto-set).");
  }

  // Step 4: Effects
  // @ts-ignore - guild text channels support send
  await message.channel.send(
    "✨ **Step 4/4:** Add effects? (`yes`/`no` or `skip`):\n" +
    "Effects include: XP multipliers, roles, money, level boosts, custom messages"
  );
  const addEffects = await awaitTextResponse(message);
  if (addEffects === "CANCEL") return message.reply(`${Mascot.Emotes.Decline} Cancelled.`);

  if (addEffects?.toLowerCase() === "yes") {
    await configureEffects(message, builder);
  }

  // Create the item
  try {
    await createShopItem(
      message.guildId!,
      builder.name,
      builder.price,
      builder.description,
      undefined,
      builder.itemType,
      builder.effects,
      builder.consumable
    );

    const effectsList = builder.effects.length > 0
      ? "\n\n**Effects:**\n" + formatEffectList(builder.effects)
      : "";

    await message.reply({
      embeds: [successEmbed(
        message.author,
        `${Mascot.Emotes.Accept} Item Created!`,
        `**${builder.name}** added to shop!\n\n` +
        `💰 Price: ${fmtCurrency(builder.price)}\n` +
        `📦 Type: ${builder.itemType}\n` +
        `🔄 Consumable: ${builder.consumable ? "Yes" : "No"}\n` +
        `✨ Effects: ${builder.effects.length}${effectsList}`
      )]
    });
  } catch (err: any) {
    await message.reply({
      embeds: [errorEmbed(message.author, "Error", err.message || "Failed to create item.")]
    });
  }
}

async function configureEffects(message: Message, builder: ItemBuilder) {
  let adding = true;

  while (adding) {
    // @ts-ignore - guild text channels support send
    await message.channel.send(
      "✨ **Select effect type:**\n" +
      "`1` - XP Multiplier (temp)\n" +
      "`2` - Level Boost (instant)\n" +
      "`3` - Money Reward\n" +
      "`4` - Permanent Role\n" +
      "`5` - Temporary Role\n" +
      "`6` - Custom Message\n" +
      "`done` - Finish adding effects"
    );

    const choice = await awaitTextResponse(message);
    if (choice === "CANCEL" || choice?.toLowerCase() === "done") {
      adding = false;
      continue;
    }

    const effect = await buildEffect(message, choice);
    if (effect) {
      builder.effects.push(effect);
      // @ts-ignore - guild text channels support send
      await message.channel.send(`${Mascot.Emotes.Accept} Effect added! Total effects: ${builder.effects.length}`);
    }

    if (builder.effects.length >= 5) {
      // @ts-ignore - guild text channels support send
      await message.channel.send("ℹ️ Maximum 5 effects. Moving on...");
      adding = false;
    }
  }
}

async function buildEffect(message: Message, choice: string | undefined): Promise<ItemEffect | null> {
  try {
    switch (choice) {
      case "1": // XP Multiplier
        // @ts-ignore - guild text channels support send
        await message.channel.send("⚡ Enter XP multiplier (e.g., `2` for 2x, `1.5` for 1.5x):");
        const multStr = await awaitTextResponse(message);
        if (multStr === "CANCEL") return null;
        const multiplier = parseFloat(multStr!);
        if (isNaN(multiplier)) throw new Error("Invalid multiplier");

        // @ts-ignore - guild text channels support send

        await message.channel.send("⏱️ Enter duration (e.g., `30 seconds`, `1 hour`, `2 days`):");
        const durStr = await awaitTextResponse(message);
        if (durStr === "CANCEL") return null;
        const duration = parseDuration(durStr!);
        if (!duration) throw new Error("Invalid duration format");

        return { type: "XP_MULTIPLIER", multiplier, duration };

      case "2": // Level Boost
        // @ts-ignore - guild text channels support send
        await message.channel.send("📈 Enter number of levels to grant (e.g., `5`):");
        const levelStr = await awaitTextResponse(message);
        if (levelStr === "CANCEL") return null;
        const levels = parseInt(levelStr!);
        if (isNaN(levels)) throw new Error("Invalid level count");

        return { type: "LEVEL_BOOST", levels };

      case "3": // Money
        // @ts-ignore - guild text channels support send
        await message.channel.send("💰 Enter amount of money (e.g., `10000`, `50k`):");
        const amountStr = await awaitTextResponse(message);
        if (amountStr === "CANCEL") return null;
        const amount = parseSmartAmount(amountStr!);
        if (isNaN(amount)) throw new Error("Invalid amount");

        return { type: "MONEY", amount };

      case "4": // Permanent Role
        // @ts-ignore - guild text channels support send
        await message.channel.send("👑 Mention the role or paste role ID:");
        const permRoleStr = await awaitTextResponse(message);
        if (permRoleStr === "CANCEL") return null;

        const permRoleId = extractRoleId(permRoleStr!, message);
        if (!permRoleId) throw new Error("Invalid role");

        return { type: "ROLE_PERMANENT", roleId: permRoleId };

      case "5": // Temporary Role
        // @ts-ignore - guild text channels support send
        await message.channel.send("⏱️ Mention the role or paste role ID:");
        const tempRoleStr = await awaitTextResponse(message);
        if (tempRoleStr === "CANCEL") return null;

        const tempRoleId = extractRoleId(tempRoleStr!, message);
        if (!tempRoleId) throw new Error("Invalid role");

        // @ts-ignore - guild text channels support send

        await message.channel.send("⏱️ Enter duration (e.g., `30 seconds`, `7 days`):");
        const tempDurStr = await awaitTextResponse(message);
        if (tempDurStr === "CANCEL") return null;
        const tempDuration = parseDuration(tempDurStr!);
        if (!tempDuration) throw new Error("Invalid duration format");

        return { type: "ROLE_TEMPORARY", roleId: tempRoleId, duration: tempDuration };

      case "6": // Custom Message
        // @ts-ignore - guild text channels support send
        await message.channel.send("💬 Enter the message to display when item is used:");
        const customMsg = await awaitTextResponse(message);
        if (customMsg === "CANCEL") return null;

        return { type: "CUSTOM_MESSAGE", message: customMsg };

      default:
        // @ts-ignore - guild text channels support send
        await message.channel.send(`${Mascot.Emotes.Fail} Invalid choice. Skipping effect.`);
        return null;
    }
  } catch (err: any) {
    // @ts-ignore - guild text channels support send
    await message.channel.send(`${Mascot.Emotes.Fail} Error: ${err.message}. Skipping effect.`);
    return null;
  }
}

async function awaitTextResponse(message: Message): Promise<string | undefined> {
  const collector = createTextCollector(
    message,
    (m: Message) => m.author.id === message.author.id,
    { time: 60_000, max: 1 }
  );

  return new Promise((resolve) => {
    collector.on("collect", (m: Message) => {
      if (m.content.toLowerCase() === "cancel") {
        resolve("CANCEL");
      } else if (m.content.toLowerCase() === "skip") {
        resolve("SKIP");
      } else {
        resolve(m.content);
      }
    });

    collector.on("end", (collected: any) => {
      if (collected.size === 0) resolve(undefined);
    });
  });
}

function extractRoleId(input: string, message: Message): string | undefined {
  // Try mention first
  const mention = input.match(/<@&(\d+)>/);
  if (mention) return mention[1];

  // Try raw ID
  const rawId = input.replace(/[<@&>]/g, "");
  if (/^\d+$/.test(rawId)) {
    const role = message.guild?.roles.cache.get(rawId);
    if (role) return rawId;
  }

  return undefined;
}

function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1, sec: 1, second: 1, seconds: 1,
    m: 60, min: 60, minute: 60, minutes: 60,
    h: 3600, hr: 3600, hour: 3600, hours: 3600,
    d: 86400, day: 86400, days: 86400
  };

  return value * (multipliers[unit] || 0);
}

function formatEffectList(effects: ItemEffect[]): string {
  return effects.map((effect, i) => {
    let desc = `${i + 1}. `;
    switch (effect.type) {
      case "XP_MULTIPLIER":
        desc += `⚡ ${effect.multiplier}x XP for ${formatDuration(effect.duration!)}`;
        break;
      case "LEVEL_BOOST":
        desc += `📈 +${effect.levels} levels`;
        break;
      case "MONEY":
        desc += `💰 ${effect.amount?.toLocaleString()} coins`;
        break;
      case "ROLE_PERMANENT":
        desc += `👑 Permanent role <@&${effect.roleId}>`;
        break;
      case "ROLE_TEMPORARY":
        desc += `⏱️ Temp role <@&${effect.roleId}> for ${formatDuration(effect.duration!)}`;
        break;
      case "CUSTOM_MESSAGE":
        desc += `💬 "${effect.message}"`;
        break;
    }
    return desc;
  }).join("\n");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

