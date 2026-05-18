import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  ActivityType,
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  Interaction,
  Partials,
  REST,
  Routes
} from "discord.js";
import prisma from "./utils/prisma";
import { routeMessage } from "./commandRouter";
import { getGuildSettings } from "./services/guildSettingsService";
import { safeInteractionReply } from "./utils/interactionHelpers";
import { initEmojiRegistry, listEmojiKeys } from "./utils/emojiRegistry";
import { handleBankInteraction } from "./handlers/bankInteractionHandler";
import { handleMarketInteraction } from "./handlers/marketInteractionHandler";
import { handleInventoryInteraction } from "./handlers/inventoryInteractionHandler";
import { guildCreateListener } from "./listeners/guildCreateListener";
import { Mascot } from "./config/branding";
import {
  handleGlobalEconomyReminderInteraction,
  maybeSendGlobalEconomyReminder
} from "./services/globalEconomyReminderService";
import { initScheduler } from "./scheduler";

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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  client.user?.setActivity("Did you check out the recent alert?", { type: ActivityType.Playing });

  try {
    await prisma.$connect();
    console.log("Prisma connected");
  } catch (err) {
    console.error("Prisma connection failed:", err);
    process.exit(1);
  }

  await initEmojiRegistry(client);
  console.log("Emoji registry keys:", listEmojiKeys().slice(0, 200));

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

    if (id.startsWith("bank_") || id.startsWith("bank:") || id.startsWith("loan_") || id.startsWith("invest_") || id.startsWith("repay_")) {
      return await handleBankInteraction(interaction);
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

    if (id.startsWith("ask_")) {
      const { handleAskInteraction } = require("./handlers/askInteractionHandler");
      return await handleAskInteraction(interaction);
    }

    if (id === "pay_bail") {
      const { handleJailInteraction } = require("./handlers/jailInteractionHandler");
      return await handleJailInteraction(interaction);
    }

    if (id.startsWith("hunt_") || id.startsWith("zoo_")) {
      const { handleHuntInteraction } = require("./handlers/huntInteractionHandler");
      return await handleHuntInteraction(interaction);
    }

    if (id === "global_economy_form_filled") {
      return await handleGlobalEconomyReminderInteraction(interaction as any);
    }
  } catch (err) {
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
      await maybeSendGlobalEconomyReminder(message, contentToProcess).catch((err) => {
        console.error("Global economy reminder error:", err);
      });
    } finally {
      (message as any).content = originalContent;
    }
  } catch (err: any) {
    if (err.code === 10008 || err.code === 50035) return;

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
