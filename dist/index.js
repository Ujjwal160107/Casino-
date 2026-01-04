"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("./utils/prisma"));
const commandRouter_1 = require("./commandRouter");
const guildConfigService_1 = require("./services/guildConfigService");
const interactionHelpers_1 = require("./utils/interactionHelpers");
const emojiRegistry_1 = require("./utils/emojiRegistry");
const xpListener_1 = require("./listeners/xpListener");
const chatMoneyListener_1 = require("./listeners/chatMoneyListener");
const bankInteractionHandler_1 = require("./handlers/bankInteractionHandler");
const marketInteractionHandler_1 = require("./handlers/marketInteractionHandler");
const inventoryInteractionHandler_1 = require("./handlers/inventoryInteractionHandler");
const guildDeleteListener_1 = require("./listeners/guildDeleteListener");
const guildCreateListener_1 = require("./listeners/guildCreateListener");
const scheduler_1 = require("./scheduler");
const slashCommands = new Map();
const slashData = [];
const slashDir = path_1.default.join(__dirname, "commands", "slash");
if (fs_1.default.existsSync(slashDir)) {
    for (const file of fs_1.default.readdirSync(slashDir)) {
        if (!file.endsWith(".ts") && !file.endsWith(".js"))
            continue;
        const mod = require(path_1.default.join(slashDir, file));
        if (mod && mod.data && mod.execute) {
            slashCommands.set(mod.data.name, mod);
            slashData.push(mod.data.toJSON());
            console.log(`Loaded slash command: ${mod.data.name}`);
        }
    }
}
else {
    console.log("No slash commands directory found; skipping slash load.");
}
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("DISCORD_TOKEN is missing in your .env");
    process.exit(1);
}
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.MessageContent, discord_js_1.GatewayIntentBits.GuildMembers], partials: [discord_js_1.Partials.Channel], });
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user?.tag}`);
    try {
        await prisma_1.default.$connect();
        console.log("📦 Prisma connected");
    }
    catch (err) {
        console.error("Prisma connection failed:", err);
        process.exit(1);
    }
    await (0, emojiRegistry_1.initEmojiRegistry)(client);
    console.log("Emoji registry keys:", (0, emojiRegistry_1.listEmojiKeys)().slice(0, 200));
    (0, xpListener_1.setupXpListener)(client);
    (0, chatMoneyListener_1.setupChatMoneyListener)(client);
    (0, guildDeleteListener_1.guildDeleteListener)(client);
    (0, guildCreateListener_1.guildCreateListener)(client);
    (0, scheduler_1.initScheduler)(client);
    if (slashData.length > 0) {
        const rest = new discord_js_1.REST({ version: "10" }).setToken(token);
        try {
            for (const [guildId] of client.guilds.cache) {
                try {
                    await rest.put(discord_js_1.Routes.applicationGuildCommands(client.user.id, guildId), { body: slashData, });
                    console.log(`Registered ${slashData.length} slash command(s) in guild ${guildId}`);
                }
                catch (gerr) {
                    console.warn(`Failed to register slash commands in guild ${guildId}:`, gerr);
                }
            }
        }
        catch (err) {
            console.error("Error while registering slash commands:", err);
        }
    }
    else {
        console.log("No slash commands to register.");
    }
});
client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const ci = interaction;
            const module = slashCommands.get(ci.commandName);
            if (!module) {
                return ci.reply({ content: "Unknown command.", ephemeral: true });
            }
            return await module.execute(ci);
        }
        const id = interaction.customId || "";
        if (id.startsWith("bank_") || id.startsWith("loan_") || id.startsWith("invest_") || id.startsWith("repay_")) {
            return await (0, bankInteractionHandler_1.handleBankInteraction)(interaction);
        }
        if (id.startsWith("market_") || id.startsWith("sell_")) {
            return await (0, marketInteractionHandler_1.handleMarketInteraction)(interaction);
        }
        if (id.startsWith("inv_")) {
            return await (0, inventoryInteractionHandler_1.handleInventoryInteraction)(interaction);
        }
        if (id.startsWith("enroll_confirm_") || id.startsWith("claim_scholarship_") || id.startsWith("stress_") || id.startsWith("confirm_stress_") || id === "cancel_stress" || id.startsWith("dropout_") || id.startsWith("work_") || id.startsWith("promote_confirm_")) {
            const { handleLifeInteraction } = require("./handlers/lifeInteractionHandler");
            return await handleLifeInteraction(interaction);
        }
        if (id.startsWith("ask_")) {
            const { handleAskInteraction } = require("./handlers/askInteractionHandler");
            return await handleAskInteraction(interaction);
        }
        if (id.startsWith("setup_") || id.startsWith("modal_setup_") || id.startsWith("select_setup_")) {
            const { handleSetupInteraction } = require("./handlers/setupHandler");
            return await handleSetupInteraction(interaction);
        }
        if (id === "pay_bail") {
            const { handleJailInteraction } = require("./handlers/jailInteractionHandler");
            return await handleJailInteraction(interaction);
        }
    }
    catch (err) {
        console.error("Interaction error:", err);
        await (0, interactionHelpers_1.safeInteractionReply)(interaction, { content: "Internal error while processing interaction.", ephemeral: true });
    }
});
client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot)
            return;
        if (!message.guild)
            return;
        const cfg = await (0, guildConfigService_1.getGuildConfig)(message.guild.id);
        const prefix = cfg?.prefix ?? "!";
        // Check for bot mention
        if (message.mentions.has(client.user) && !message.mentions.everyone) {
            const rawContent = message.content.replace(/<@!?[0-9]+>/g, "").trim();
            if (!rawContent) {
                const supportLink = "https://discord.gg/7bZm4gwcwt";
                return message.reply(`**Need Help?**\nJoin our support server: ${supportLink}\nUse \`${prefix}help\` or \`${prefix}guide\` to get started!`);
            }
        }
        if (!message.content.startsWith(prefix))
            return;
        const contentWithoutPrefix = message.content.slice(prefix.length).trim();
        if (!contentWithoutPrefix)
            return;
        const originalContent = message.content;
        try {
            message.content = "!" + contentWithoutPrefix;
            await (0, commandRouter_1.routeMessage)(client, message, prefix);
        }
        finally {
            message.content = originalContent;
        }
    }
    catch (err) {
        console.error("Message handler error:", err);
        try {
            await message.reply("An internal error occurred while processing your command.");
        }
        catch (replyErr) {
            console.error("Failed to notify user about message handler error:", replyErr);
        }
    }
});
client.login(token);
//# sourceMappingURL=index.js.map