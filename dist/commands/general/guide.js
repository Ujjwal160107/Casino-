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
exports.handleGuide = handleGuide;
const discord_js_1 = require("discord.js");
const path = __importStar(require("path"));
const branding_1 = require("../../config/branding");
const guildConfigService_1 = require("../../services/guildConfigService");
async function handleGuide(message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "guide_banner.png");
    const attachment = new discord_js_1.AttachmentBuilder(bannerPath, { name: "guide_banner.png" });
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const prefix = config.prefix || "!";
    const mainEmbed = new discord_js_1.EmbedBuilder()
        .setTitle(`${branding_1.Mascot.Emotes.University} ${branding_1.Mascot.Name} - Complete Guide`)
        .setDescription(`Welcome to the ultimate guide for **${branding_1.Mascot.Name}**! ${branding_1.Mascot.Emotes.FortunaSparkle}\n\n` +
        `Here you will learn how to start your journey, earn money, build a life, and play in the casino.\n` +
        `Use the menu below to navigate through the different sections.`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setImage("attachment://guide_banner.png")
        .setFooter({ text: `Server Prefix: ${prefix}` });
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setCustomId("guide_menu")
        .setPlaceholder("Select a topic to learn about...")
        .addOptions(new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("Getting Started")
        .setDescription("How to earn money and start playing")
        .setValue("guide_start")
        .setEmoji(branding_1.Mascot.Emotes.MoneyBag), new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("Life Economy")
        .setDescription("Jobs, Education, Marriage & Property")
        .setValue("guide_life")
        .setEmoji(branding_1.Mascot.Emotes.University), new discord_js_1.StringSelectMenuOptionBuilder()
        .setLabel("Casino")
        .setDescription("Gambling games and strategies")
        .setValue("guide_casino")
        .setEmoji(branding_1.Mascot.Emotes.Casino));
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
            case "guide_start":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.MoneyBag} Getting Started`)
                    .setColor(branding_1.Mascot.Colors.Success)
                    .setDescription(`Here is how you can start earning money and building your wealth:\n\n` +
                    `**Income Commands:**\n` +
                    `${branding_1.Mascot.Emotes.FortunaWorking} \`${prefix}work\` - Start a work shift to earn money. (Requires a job)\n` +
                    `${branding_1.Mascot.Emotes.Redcoin} \`${prefix}beg\` - Beg for some spare change.\n` +
                    `${branding_1.Mascot.Emotes.Gun} \`${prefix}crime\` - Commit a crime for high rewards (but high risk!).\n` +
                    `${branding_1.Mascot.Emotes.Banana} \`${prefix}slut\` - A risky way to earn fast cash.\n\n` +
                    `**Daily Rewards:**\n` +
                    `${branding_1.Mascot.Emotes.Gem} \`${prefix}daily\` - Claim your daily reward.\n` +
                    `${branding_1.Mascot.Emotes.MedalSilver} \`${prefix}weekly\` - Claim your weekly reward.\n` +
                    `${branding_1.Mascot.Emotes.MedalGold} \`${prefix}monthly\` - Claim your monthly reward.\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Check your balance with \`${prefix}bal\`\n` +
                    `${branding_1.Mascot.Emotes.Think} Deposit money to your bank with \`${prefix}dep all\` to keep it safe!`)
                    .setImage("attachment://guide_banner.png");
                break;
            case "guide_life":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.University} Life Economy`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`Build your virtual life with these features:\n\n` +
                    `**Career & Education:**\n` +
                    `${branding_1.Mascot.Emotes.University} \`${prefix}university\` - View available degrees to study.\n` +
                    `${branding_1.Mascot.Emotes.Pencil} \`${prefix}study\` - Study to increase your intelligence and graduate.\n` +
                    `${branding_1.Mascot.Emotes.JobPromotion} \`${prefix}jobs\` - View available jobs. Better degrees = Better jobs!\n` +
                    `${branding_1.Mascot.Emotes.FortunaWorking} \`${prefix}apply <job>\` - Apply for a job.\n\n` +
                    `**Properties:**\n` +
                    `${branding_1.Mascot.Emotes.Bank} \`${prefix}properties\` - View real estate for sale.\n` +
                    `${branding_1.Mascot.Emotes.MoneyBag} \`${prefix}buyprop <name>\` - Buy a property to earn passive income.\n` +
                    `${branding_1.Mascot.Emotes.Redcoin} \`${prefix}collect-rent\` - Collect rent from your properties.\n\n` +
                    `**Social:**\n` +
                    `${branding_1.Mascot.Emotes.Love} \`${prefix}marry <user>\` - Propose to someone.\n` +
                    `${branding_1.Mascot.Emotes.FortunaHeart} \`${prefix}family\` - View your family tree.`)
                    .setImage("attachment://guide_banner.png");
                break;
            case "guide_casino":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Casino} Casino Games`)
                    .setColor(branding_1.Mascot.Colors.Fail)
                    .setDescription(`**Feeling lucky?** Visit the casino to multiply your wealth!\n\n` +
                    `We have a variety of games including:\n` +
                    `${branding_1.Mascot.Emotes.Dices} **Roulette**\n` +
                    `${branding_1.Mascot.Emotes.Bj} **Blackjack**\n` +
                    `${branding_1.Mascot.Emotes.Seven} **Slots**\n` +
                    `${branding_1.Mascot.Emotes.Blackcoin} **Coinflip**\n\n` +
                    `${branding_1.Mascot.Emotes.Alert} **WANT TO LEARN TO PLAY?**\n` +
                    `Run the command \`${prefix}casino\` to view detailed guides and rules for each game!`)
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
//# sourceMappingURL=guide.js.map