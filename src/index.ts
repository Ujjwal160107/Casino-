import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  ActivityType,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  Interaction,
  MessageFlags,
  Partials,
  REST,
  Routes
} from "discord.js";
import prisma from "./utils/prisma";
import { routeMessage } from "./commandRouter";
import { getGuildSettings } from "./services/guildSettingsService";
import { isInteractionExpiredError, safeInteractionReply, shouldEarlyAcknowledgeInIndex, shouldIgnoreInteractionError, tryEarlyAcknowledge, ensureDeferredUpdate, safeEditReply, safeReply } from "./utils/interactionHelpers";
import { initEmojiRegistry, listEmojiKeys } from "./utils/emojiRegistry";
import { handleBankInteraction } from "./handlers/bankInteractionHandler";
import { handleMarketInteraction } from "./handlers/marketInteractionHandler";
import { handleInventoryInteraction } from "./handlers/inventoryInteractionHandler";
import { handleShopBuyInteraction, handleShopUseInteraction, handleShopBuyCardInteraction, handleShopBuyCardConfirmInteraction, handleShopBuyCardCancelInteraction } from "./commands/economy/shop";
import { guildCreateListener } from "./listeners/guildCreateListener";
import { Mascot } from "./config/branding";
import {
  handleGlobalEconomyReminderInteraction
} from "./services/globalEconomyReminderService";
import { initScheduler } from "./scheduler";
import { backfillStarterChickens } from "./services/starterChickenService";

const slashCommands = new Map<string, any>();
const slashData: any[] = [];
const slashDir = path.join(__dirname, "commands", "slash");

if (fs.existsSync(slashDir)) {
  for (const file of fs.readdirSync(slashDir)) {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
    const mod = require(path.join(slashDir, file));
    if (mod && mod.data && mod.execute) {
      slashCommands.set(mod.data.name, mod);
      slashData.push(mod.data.toJSON());
      console.log(`Loaded slash command: ${mod.data.name}`);
    }
  }
} else {
  console.log("No slash commands directory found; skipping slash load.");
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing in your .env");
  process.exit(1);
}

const client = new Client({
  // No privileged intents. Discord denied MessageContent for this use case
  // (their position: a command bot should use slash commands) and the grant
  // lapsed on 2026-08-19. Commands still work via @mention and DM, which
  // Discord delivers content for without the intent -- see the mention branch
  // below. Restore MessageContent/GuildMembers here only if a future
  // application is approved.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  client.user?.setActivity("V2 is finally out! Check what's new in changelog", { type: ActivityType.Playing });

  try {
    await prisma.$connect();
    console.log("Prisma connected");
  } catch (err) {
    console.error("Prisma connection failed:", err);
    process.exit(1);
  }

  await initEmojiRegistry(client);
  console.log("Emoji registry keys:", listEmojiKeys().slice(0, 200));

  void backfillStarterChickens()
    .then((created) => console.log(`Starter chicken backfill complete: ${created} provisioned.`))
    .catch((error) => console.error("Starter chicken backfill failed:", error));

  const { initQuestListeners } = require("./services/questService");
  initQuestListeners();

  guildCreateListener(client);
  initScheduler(client);

  if (slashData.length <= 0) {
    console.log("No slash commands to register.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    for (const [guildId] of client.guilds.cache) {
      try {
        await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), {
          body: slashData
        });
        console.log(`Registered ${slashData.length} slash command(s) in guild ${guildId}`);
      } catch (guildError) {
        console.warn(`Failed to register slash commands in guild ${guildId}:`, guildError);
      }
    }
  } catch (err) {
    console.error("Error while registering slash commands:", err);
  }
});

client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const commandInteraction = interaction as ChatInputCommandInteraction;
      const module = slashCommands.get(commandInteraction.commandName);
      if (!module) {
        return commandInteraction.reply({ content: "Unknown command.", ephemeral: true });
      }
      return await module.execute(commandInteraction);
    }

    const id = (interaction as any).customId || "";

    if (interaction.isModalSubmit() && id.startsWith("inv2_market_modal:")) {
      const { handleInv2ModalSubmit } = require("./commands/economy/inventory");
      if (await handleInv2ModalSubmit(interaction as import("discord.js").ModalSubmitInteraction)) return;
    }

    if (interaction.isButton()) {
      const { handleInv2EphemeralInteraction } = require("./commands/economy/inventory");
      if (await handleInv2EphemeralInteraction(interaction as import("discord.js").ButtonInteraction)) return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && shouldEarlyAcknowledgeInIndex(id)) {
      await tryEarlyAcknowledge(interaction, id);
    }

    if (id.startsWith("bank_") || id.startsWith("bank:") || id.startsWith("invest_")) {
      return await handleBankInteraction(interaction);
    }

    if (id.startsWith("bm_buy_confirm:") && interaction.isButton()) {
      const parts = id.split(":");
      const listingId = parts[1];
      const ownerId = parts[2];
      if (interaction.user.id !== ownerId) {
        await safeReply(interaction, { content: "Not yours.", flags: MessageFlags.Ephemeral });
        return;
      }
      try {
        const { buyListing } = require("./services/marketService");
        await ensureDeferredUpdate(interaction);
        const result = await buyListing(ownerId, listingId);
        await safeEditReply(interaction, {
          content: `✅ Bought **${result.itemName}** (x${result.amount}) for **${result.fees.buyerTotal.toLocaleString()}**!`,
          components: [],
        });
      } catch (err: any) {
        if (isInteractionExpiredError(err)) return;
        if (interaction.deferred || interaction.replied) {
          await safeEditReply(interaction, { content: `❌ ${err.message}`, components: [] });
        } else {
          await safeReply(interaction, { content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
        }
      }
      return;
    }

    if (id.startsWith("market_") || id.startsWith("sell_") || id.startsWith("buy_property_") || id.startsWith("property_page_") || id === "cancel_property_buy") {
      return await handleMarketInteraction(interaction);
    }

    if (id.startsWith("inv_")) {
      return await handleInventoryInteraction(interaction as any);
    }

    if (
      id.startsWith("enroll_confirm_") ||
      id.startsWith("claim_scholarship_") ||
      id.startsWith("relax:") ||
      id.startsWith("stress_") ||
      id.startsWith("confirm_stress_") ||
      id === "cancel_stress" ||
      id.startsWith("dropout_") ||
      id.startsWith("work_") ||
      id.startsWith("promote_confirm_") ||
      id.startsWith("edu_stress_") ||
      id.startsWith("confirm_edu_stress_")
    ) {
      const { handleLifeInteraction } = require("./handlers/lifeInteractionHandler");
      return await handleLifeInteraction(interaction);
    }

    if (id.startsWith("help:")) {
      const { handleHelpInteraction } = require("./commands/general/help");
      return await handleHelpInteraction(interaction);
    }

    if (id.startsWith("tut:")) {
      const { handleTutorialInteraction } = require("./commands/general/tutorial");
      return await handleTutorialInteraction(interaction);
    }

    if (id.startsWith("settings:")) {
      const { handleSettingsInteraction } = require("./commands/general/settings");
      return await handleSettingsInteraction(interaction);
    }

    if (id.startsWith("ask_")) {
      const { handleAskInteraction } = require("./handlers/askInteractionHandler");
      return await handleAskInteraction(interaction);
    }

    if (id.startsWith("crime:")) {
      const { handleCrimeInteraction } = require("./handlers/crimeInteractionHandler");
      return await handleCrimeInteraction(interaction);
    }

    if (id.startsWith("heat:")) {
      const { handleHeatInteraction } = require("./handlers/heatInteractionHandler");
      return await handleHeatInteraction(interaction);
    }

    if (id === "pay_bail") {
      const { handleJailInteraction } = require("./handlers/jailInteractionHandler");
      return await handleJailInteraction(interaction);
    }

    if (id.startsWith("hunt_") || id.startsWith("zoo_")) {
      const { handleHuntInteraction } = require("./handlers/huntInteractionHandler");
      return await handleHuntInteraction(interaction);
    }

    if (id.startsWith("shop_buy_card_confirm:") && interaction.isButton()) {
      return await handleShopBuyCardConfirmInteraction(interaction as import("discord.js").ButtonInteraction);
    }

    if (id.startsWith("shop_buy_card_cancel:") && interaction.isButton()) {
      return await handleShopBuyCardCancelInteraction(interaction as import("discord.js").ButtonInteraction);
    }

    if (id.startsWith("shop_buy_card:") && interaction.isButton()) {
      return await handleShopBuyCardInteraction(interaction as import("discord.js").ButtonInteraction);
    }

    if (id.startsWith("shop_buy:") && interaction.isButton()) {
      return await handleShopBuyInteraction(interaction as import("discord.js").ButtonInteraction);
    }

    if (id.startsWith("shop_use:") && interaction.isButton()) {
      return await handleShopUseInteraction(interaction as import("discord.js").ButtonInteraction);
    }

    if (id.startsWith("stock_buy:") || id.startsWith("stock_buy_modal:")) {
      const { handleStockInteraction } = require("./handlers/stockInteractionHandler");
      return await handleStockInteraction(interaction);
    }

    if (id === "global_economy_form_filled") {
      return await handleGlobalEconomyReminderInteraction(interaction as any);
    }
  } catch (err) {
    if (shouldIgnoreInteractionError(err)) return;
    console.error("Interaction error:", err);
    await safeInteractionReply(interaction, {
      content: "Internal error while processing interaction.",
      ephemeral: true
    });
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot || !message.guild) return;

    const settings = await getGuildSettings(message.guild.id);
    const prefix = settings.prefix ?? "!";

    let isCommand = false;
    let contentToProcess = "";

    if (message.content.startsWith(prefix)) {
      isCommand = true;
      contentToProcess = message.content.slice(prefix.length).trim();
    } else if (message.mentions.has(client.user!) && !message.mentions.everyone) {
      const mentionRegex = new RegExp(`^<@!?${client.user!.id}>`);
      if (mentionRegex.test(message.content)) {
        const rawContent = message.content.replace(mentionRegex, "").trim();
        if (!rawContent) {
          return message.reply(
            `**Need Help?**\nView all commands: <${Mascot.Links.CommandList}>\nJoin support: ${Mascot.Links.Support}\nOr use \`${prefix}help\` to start!`
          );
        }

        isCommand = true;
        contentToProcess = rawContent;
      }
    }

    if (!isCommand || !contentToProcess) return;

    const originalContent = message.content;
    try {
      (message as any).content = "!" + contentToProcess;
      await routeMessage(client, message, prefix);
    } finally {
      (message as any).content = originalContent;
    }
  } catch (err: any) {
    if (err.code === 50035) {
      // Invalid Form Body — the reply payload itself was rejected by Discord.
      // Don't reply (we likely can't), but never swallow this silently: it
      // means a command produced an invalid message and the user saw nothing.
      console.error("Message handler: reply rejected with 50035 Invalid Form Body:", err);
      return;
    }
    if (err.code === 10008) return;

    console.error("Message handler error:", err);
    try {
      await message.reply("An internal error occurred while processing your command.");
    } catch (replyErr: any) {
      if (replyErr.code !== 50035 && replyErr.code !== 10008) {
        console.error("Failed to notify user about message handler error:", replyErr);
      }
    }
  }
});

client.login(token);
