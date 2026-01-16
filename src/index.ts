import "dotenv/config"; import fs from "fs"; import path from "path"; import { Client, GatewayIntentBits, Partials, REST, Routes, ChatInputCommandInteraction, Interaction } from "discord.js"; import prisma from "./utils/prisma"; import { routeMessage } from "./commandRouter"; import { getGuildConfig } from "./services/guildConfigService"; import { safeInteractionReply } from "./utils/interactionHelpers"; import { initEmojiRegistry, listEmojiKeys } from "./utils/emojiRegistry"; import { setupXpListener } from "./listeners/xpListener"; import { setupChatMoneyListener } from "./listeners/chatMoneyListener"; import { setupCasinoDropListener } from "./listeners/casinoDropListener"; import { handleBankInteraction } from "./handlers/bankInteractionHandler"; import { handleMarketInteraction } from "./handlers/marketInteractionHandler"; import { handleInventoryInteraction } from "./handlers/inventoryInteractionHandler"; import { CasinoDropService } from "./services/casinoDropService";
import { guildDeleteListener } from "./listeners/guildDeleteListener";
import { guildCreateListener } from "./listeners/guildCreateListener";
import { initScheduler } from "./scheduler"; const slashCommands = new Map<string, any>(); const slashData: any[] = []; const slashDir = path.join(__dirname, "commands", "slash"); if (fs.existsSync(slashDir)) { for (const file of fs.readdirSync(slashDir)) { if (!file.endsWith(".ts") && !file.endsWith(".js")) continue; const mod = require(path.join(slashDir, file)); if (mod && mod.data && mod.execute) { slashCommands.set(mod.data.name, mod); slashData.push(mod.data.toJSON()); console.log(`Loaded slash command: ${mod.data.name}`); } } } else { console.log("No slash commands directory found; skipping slash load."); } const token = process.env.DISCORD_TOKEN; if (!token) { console.error("DISCORD_TOKEN is missing in your .env"); process.exit(1); } const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers], partials: [Partials.Channel], }); client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user?.tag}`); try { await prisma.$connect(); console.log("📦 Prisma connected"); } catch (err) { console.error("Prisma connection failed:", err); process.exit(1); } await initEmojiRegistry(client); console.log("Emoji registry keys:", listEmojiKeys().slice(0, 200)); setupXpListener(client);
  setupChatMoneyListener(client);
  setupCasinoDropListener(client);
  guildDeleteListener(client);
  guildCreateListener(client);
  initScheduler(client); if (slashData.length > 0) { const rest = new REST({ version: "10" }).setToken(token); try { for (const [guildId] of client.guilds.cache) { try { await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: slashData, }); console.log(`Registered ${slashData.length} slash command(s) in guild ${guildId}`); } catch (gerr) { console.warn(`Failed to register slash commands in guild ${guildId}:`, gerr); } } } catch (err) { console.error("Error while registering slash commands:", err); } } else { console.log("No slash commands to register."); }
}); client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) { const ci = interaction as ChatInputCommandInteraction; const module = slashCommands.get(ci.commandName); if (!module) { return ci.reply({ content: "Unknown command.", ephemeral: true }); } return await module.execute(ci); } const id = (interaction as any).customId || ""; if (id.startsWith("bank_") || id.startsWith("loan_") || id.startsWith("invest_") || id.startsWith("repay_")) { return await handleBankInteraction(interaction); } if (id.startsWith("market_") || id.startsWith("sell_")) { return await handleMarketInteraction(interaction); } if (id.startsWith("inv_")) {
      return await handleInventoryInteraction(interaction as any);
    }
    if (id.startsWith("enroll_confirm_") || id.startsWith("claim_scholarship_") || id.startsWith("stress_") || id.startsWith("confirm_stress_") || id === "cancel_stress" || id.startsWith("dropout_") || id.startsWith("work_") || id.startsWith("promote_confirm_") || id.startsWith("edu_stress_") || id.startsWith("confirm_edu_stress_")) {
      const { handleLifeInteraction } = require("./handlers/lifeInteractionHandler");
      return await handleLifeInteraction(interaction);
    }
    if (id.startsWith("ask_")) { const { handleAskInteraction } = require("./handlers/askInteractionHandler"); return await handleAskInteraction(interaction); }
    if (id.startsWith("setup_") || id.startsWith("modal_setup_") || id.startsWith("select_setup_")) {
      const { handleSetupInteraction } = require("./handlers/setupHandler");
      return await handleSetupInteraction(interaction);
    }
    if (id === "pay_bail") {
      const { handleJailInteraction } = require("./handlers/jailInteractionHandler");
      return await handleJailInteraction(interaction);
    }
    if (id.startsWith("casino_drop_claim_")) {
      return await CasinoDropService.handleClaim(interaction as any);
    }
  } catch (err) { console.error("Interaction error:", err); await safeInteractionReply(interaction, { content: "Internal error while processing interaction.", ephemeral: true }); }
}); client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const cfg = await getGuildConfig(message.guild.id);
    const prefix = cfg?.prefix ?? "!";

    let isCommand = false;
    let contentToProcess = "";

    // 1. Check for standard prefix
    if (message.content.startsWith(prefix)) {
      isCommand = true;
      contentToProcess = message.content.slice(prefix.length).trim();
    }
    // 2. Check for Mention Prefix
    else if (message.mentions.has(client.user!) && !message.mentions.everyone) {
      // Regex to match mention at the START of the string: ^<@!?ID>
      const mentionRegex = new RegExp(`^<@!?${client.user!.id}>`);
      if (mentionRegex.test(message.content)) {
        const rawContent = message.content.replace(mentionRegex, "").trim();

        if (!rawContent) {
          // Just a mention -> Help message
          const supportLink = "https://discord.gg/7bZm4gwcwt";
          return message.reply(`**Need Help?**\nJoin our support server: ${supportLink}\nUse \`${prefix}help\` or \`${prefix}guide\` to get started!`);
        } else {
          // Mention + Command -> Execute
          isCommand = true;
          contentToProcess = rawContent;
        }
      }
    }

    if (!isCommand || !contentToProcess) return;

    const originalContent = message.content;
    try {
      // Shim the content to look like a standard !command for routeMessage
      // routeMessage internally uses .slice(1), so we prepend a mock 1-char prefix.
      (message as any).content = "!" + contentToProcess;
      await routeMessage(client, message, prefix);
    } finally {
      (message as any).content = originalContent;
    }
  } catch (err: any) {
    // 10008: Unknown Message - Message was deleted before we could process/reply
    // 50035: Invalid Form Body - Often 'message_reference: Unknown message' if we try to reply to a deleted msg
    if (err.code === 10008 || err.code === 50035) return;

    console.error("Message handler error:", err);
    try {
      await message.reply("An internal error occurred while processing your command.");
    } catch (replyErr: any) {
      // Ignore Invalid Form Body (50035) or Unknown Message (10008) during error reply attempt
      if (replyErr.code !== 50035 && replyErr.code !== 10008) {
        console.error("Failed to notify user about message handler error:", replyErr);
      }
    }
  }
});
client.login(token);