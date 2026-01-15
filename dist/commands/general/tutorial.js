"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTutorial = handleTutorial;
const discord_js_1 = require("discord.js");
const path = __importStar(require("path"));
const branding_1 = require("../../config/branding");
const guildConfigService_1 = require("../../services/guildConfigService");
async function handleTutorial(message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "guide_banner.png");
    const attachment = new discord_js_1.AttachmentBuilder(bannerPath, { name: "guide_banner.png" });
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const prefix = config.prefix || "!";
    const mainEmbed = new discord_js_1.EmbedBuilder()
        .setTitle(`${branding_1.Mascot.Emotes.University} ${branding_1.Mascot.Name} - Tutorial`)
        .setDescription(`Welcome to the **${branding_1.Mascot.Name}** Tutorial! ${branding_1.Mascot.Emotes.FortunaSparkle}\n\n` +
        `This tutorial will guide you through the features of the bot, from getting started to becoming a tycoon.\n` +
        `Use the menu below to navigate through the tutorial steps.`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setImage("attachment://guide_banner.png")
        .setFooter({ text: `Server Prefix: ${prefix}` });
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId("tutorial_menu")
        .setPlaceholder("Select a tutorial step...")
        .addOptions(new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("1. Getting Started")
        .setDescription("Daily, Weekly, Monthly rewards")
        .setValue("tutorial_start")
        .setEmoji(branding_1.Mascot.Emotes.MoneyBag), new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("2. Casino")
        .setDescription("Learn about casino games")
        .setValue("tutorial_casino")
        .setEmoji(branding_1.Mascot.Emotes.Casino), new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("3. Career & Studies")
        .setDescription("Studying and Freelancing")
        .setValue("tutorial_career")
        .setEmoji(branding_1.Mascot.Emotes.University), new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("4. Life Economy")
        .setDescription("Marriage, Properties, Stocks")
        .setValue("tutorial_life")
        .setEmoji(branding_1.Mascot.Emotes.Love), new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("5. Marketplace")
        .setDescription("Stores and Server Items")
        .setValue("tutorial_market")
        .setEmoji(branding_1.Mascot.Emotes.Shop));
    const row = new discord_js_1.ActionRowBuilder().addComponents(menu);
    const sent = await message.reply({
        embeds: [mainEmbed],
        files: [attachment],
        components: [row]
    });
    const collector = sent.createMessageComponentCollector({
        time: 300000,
        filter: (i) => i.user.id === message.author.id
    });
    collector.on("collect", async (interaction) => {
        if (!interaction.isStringSelectMenu())
            return;
        const value = interaction.values[0];
        let guideEmbed;
        switch (value) {
            case "tutorial_start":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.MoneyBag} 1. Getting Started`)
                    .setColor(branding_1.Mascot.Colors.Success)
                    .setDescription(`The first step to wealth is claiming your free rewards!\n\n` +
                    `**Regular Rewards:**\n` +
                    `${branding_1.Mascot.Emotes.Gem} \`${prefix}daily\` - Claim your daily reward.\n` +
                    `${branding_1.Mascot.Emotes.MedalSilver} \`${prefix}weekly\` - Claim your weekly reward.\n` +
                    `${branding_1.Mascot.Emotes.MedalGold} \`${prefix}monthly\` - Claim your monthly reward.\n\n` +
                    `*Don't forget to claim these regularly to build your initial capital!*`)
                    .setImage("attachment://guide_banner.png");
                break;
            case "tutorial_casino":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Casino} 2. Casino Games`)
                    .setColor(branding_1.Mascot.Colors.Fail) // Casino usually associated with risk/red
                    .setDescription(`Once you have some money, you might want to try your luck at the casino.\n\n` +
                    `**Learning the Ropes:**\n` +
                    `We have a dedicated guide for all our casino games.\n` +
                    `👉 Use \`${prefix}casino\` to view the rules and payouts for each game.\n\n` +
                    `*Remember: The house always wins... eventually. Gamble responsibly!*`)
                    .setImage("attachment://guide_banner.png");
                break;
            case "tutorial_career":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.University} 3. Career & Studies`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`To earn a steady income, you need to work and study.\n\n` +
                    `**Education:**\n` +
                    `${branding_1.Mascot.Emotes.Pencil} \`${prefix}enroll\` - Enroll in a course (e.g. Computer Science).\n` +
                    `${branding_1.Mascot.Emotes.University} \`${prefix}study\` - Study to improve your grades and graduate.\n\n` +
                    `**Work:**\n` +
                    `${branding_1.Mascot.Emotes.FortunaWorking} \`${prefix}work\` - Do freelance work to earn money while studying.\n` +
                    `*Better education leads to better paying jobs in the future!*`)
                    .setImage("attachment://guide_banner.png");
                break;
            case "tutorial_life":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Love} 4. Life Economy`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`Build a life beyond just money.\n\n` +
                    `**Relationships:**\n` +
                    `${branding_1.Mascot.Emotes.Love} \`${prefix}marry <user>\` - Find a partner and get married.\n\n` +
                    `**Assets:**\n` +
                    `${branding_1.Mascot.Emotes.Bank} \`${prefix}properties\` - Buy properties to earn passive rent income.\n` +
                    `${branding_1.Mascot.Emotes.Stonks} \`${prefix}stocks\` - Invest in the stock market for long-term gains.\n\n` +
                    `*Diversify your income streams for maximum wealth!*`)
                    .setImage("attachment://guide_banner.png");
                break;
            case "tutorial_market":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Shop} 5. Marketplace`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`Spend your hard-earned cash on items.\n\n` +
                    `**Shopping:**\n` +
                    `${branding_1.Mascot.Emotes.Shop} \`${prefix}shop\` - View global bot items.\n` +
                    `🏪 \`${prefix}store\` - View **server-specific** items added by your server admins.\n\n` +
                    `*Server items are unique to each community!*`)
                    .setImage("attachment://guide_banner.png");
                break;
            default:
                return;
        }
        await interaction.reply({ embeds: [guideEmbed], ephemeral: true });
    });
    collector.on("end", async () => {
        try {
            await sent.edit({ components: [] });
        }
        catch {
            // Message might be deleted
        }
    });
}
//# sourceMappingURL=tutorial.js.map