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
exports.handleCasinoGuide = handleCasinoGuide;
const discord_js_1 = require("discord.js");
const path = __importStar(require("path"));
const branding_1 = require("../../config/branding");
async function handleCasinoGuide(message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "casino_banner.png");
    const attachment = new discord_js_1.AttachmentBuilder(bannerPath, { name: "casino_banner.png" });
    const mainEmbed = new discord_js_1.EmbedBuilder()
        .setTitle(`${branding_1.Mascot.Emotes.Casino} Fortuna's Casino - Game Guides`)
        .setDescription(`Welcome to **Fortuna's Casino**! ${branding_1.Mascot.Emotes.Success}\n\n` +
        `Select a game below to learn how to play and increase your chances of winning!\n\n` +
        `${branding_1.Mascot.Emotes.Cards} Each game has unique rules and strategies\n` +
        `${branding_1.Mascot.Emotes.Dices} Practice makes perfect!\n` +
        `${branding_1.Mascot.Emotes.Seven} Good luck and gamble responsibly!`)
        .setColor(branding_1.Mascot.Colors.Base)
        .setImage("attachment://casino_banner.png")
        .setFooter({ text: "Click any button below to view game guides" });
    const row1 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("guide_blackjack")
        .setLabel("Blackjack")
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setEmoji(branding_1.Mascot.Emotes.Bj), new discord_js_1.ButtonBuilder()
        .setCustomId("guide_roulette")
        .setLabel("Roulette")
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setEmoji(branding_1.Mascot.Emotes.Dices), new discord_js_1.ButtonBuilder()
        .setCustomId("guide_slots")
        .setLabel("Slots")
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setEmoji(branding_1.Mascot.Emotes.Seven), new discord_js_1.ButtonBuilder()
        .setCustomId("guide_coinflip")
        .setLabel("Coinflip")
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setEmoji(branding_1.Mascot.Emotes.Blackcoin));
    const row2 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId("guide_cockfight")
        .setLabel("Cockfight")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setEmoji(branding_1.Mascot.Emotes.Chicken), new discord_js_1.ButtonBuilder()
        .setCustomId("guide_feed")
        .setLabel("Feed")
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setEmoji(branding_1.Mascot.Emotes.Banana), new discord_js_1.ButtonBuilder()
        .setCustomId("guide_russianroulette")
        .setLabel("Russian Roulette")
        .setStyle(discord_js_1.ButtonStyle.Danger)
        .setEmoji(branding_1.Mascot.Emotes.Gun));
    const sent = await message.reply({
        embeds: [mainEmbed],
        files: [attachment],
        components: [row1, row2]
    });
    const collector = sent.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 300000, // 5 minutes
        filter: (i) => i.user.id === message.author.id
    });
    collector.on("collect", async (interaction) => {
        let guideEmbed;
        switch (interaction.customId) {
            case "guide_blackjack":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Bj} Blackjack - How to Play`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`**Objective:** Beat the dealer by getting as close to 21 as possible without going over.\n\n` +
                    `**Card Values:**\n` +
                    `${branding_1.Mascot.Emotes.Cards} Number cards (2-10) = Face value\n` +
                    `${branding_1.Mascot.Emotes.Cards} Face cards (J, Q, K) = 10 points\n` +
                    `${branding_1.Mascot.Emotes.Cards} Ace = 1 or 11 points (automatically adjusted)\n\n` +
                    `**How to Play:**\n` +
                    `${branding_1.Mascot.Emotes.Success} You and the dealer each receive 2 cards\n` +
                    `${branding_1.Mascot.Emotes.Success} Dealer's first card is hidden\n` +
                    `${branding_1.Mascot.Emotes.Success} Choose to **Hit** (draw card) or **Stand** (keep hand)\n` +
                    `${branding_1.Mascot.Emotes.Success} If you go over 21, you **bust** and lose\n` +
                    `${branding_1.Mascot.Emotes.Success} Dealer must draw until reaching 17 or higher\n\n` +
                    `**Winning Conditions:**\n` +
                    `${branding_1.Mascot.Emotes.Seven} **Blackjack** (Ace + 10-value card) = 2.5x payout!\n` +
                    `${branding_1.Mascot.Emotes.Success} Higher score than dealer without busting = 2x payout\n` +
                    `${branding_1.Mascot.Emotes.Confused} Same score as dealer = Push (bet returned)\n` +
                    `${branding_1.Mascot.Emotes.Fail} Bust or lower score = Lose your bet\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Stand on 17 or higher\n` +
                    `${branding_1.Mascot.Emotes.Think} Hit on 11 or lower\n` +
                    `${branding_1.Mascot.Emotes.Think} Watch the dealer's visible card!`)
                    .setFooter({ text: "Command: ,blackjack <amount> or ,bj <amount>" });
                break;
            case "guide_roulette":
                const roulBannerPath = path.join(process.cwd(), "src", "assets", "roulette_guide.png");
                const roulAttachment = new discord_js_1.AttachmentBuilder(roulBannerPath, { name: "roulette_guide.png" });
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`Roulette - How to Play`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`**Objective:** Predict where the ball will land on the roulette wheel.\n\n` +
                    `**Payout Multipliers:**\n` +
                    `[x36] Single Number\n` +
                    `[x 3] Dozens (1-12, 13-24, 25-36)\n` +
                    `[x 3] Columns (1st, 2nd, 3rd)\n` +
                    `[x 2] Halves (1-18, 19-36)\n` +
                    `[x 2] Odd/Even\n` +
                    `[x 2] Colours (red, black)\n\n` +
                    `**How to Play:**\n` +
                    `1. Use interactive buttons or commands to place bet.\n` +
                    `2. Choose your betting amount.\n` +
                    `3. Select your prediction (color, number, range).\n` +
                    `4. The wheel spins and determines the winner!\n\n` +
                    `**Special Rules:**\n` +
                    `- Landing on **0** wins only if you bet on it specifically.\n` +
                    `- Multiple bets can be placed on different outcomes.`)
                    .setImage("attachment://roulette_guide.png")
                    .setFooter({ text: "Command: ,bet <amount> <choice> or ,roulette <amount> <choice>" });
                await interaction.reply({ embeds: [guideEmbed], files: [roulAttachment], ephemeral: true });
                return; // Return early as we handled the reply manually due to file attachment
            case "guide_slots":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Seven} Slots - How to Play`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`**Objective:** Match 3 symbols in a row to win!\n\n` +
                    `**Symbols & Payouts:**\n` +
                    `${branding_1.Mascot.Emotes.Seven} **7 7 7** - JACKPOT! 10x your bet\n` +
                    `${branding_1.Mascot.Emotes.Cherry} **🍒 🍒 🍒** - 5x your bet\n` +
                    `${branding_1.Mascot.Emotes.Watermelonm} **🍉 🍉 🍉** - 4x your bet\n` +
                    `${branding_1.Mascot.Emotes.Grapes} **🍇 🍇 🍇** - 3x your bet\n` +
                    `${branding_1.Mascot.Emotes.Banana} **🍌 🍌 🍌** - 2x your bet\n\n` +
                    `**How to Play:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Choose your bet amount\n` +
                    `${branding_1.Mascot.Emotes.Dices} Pull the lever (automatically spins)\n` +
                    `${branding_1.Mascot.Emotes.Sparks} 3 reels spin and show random symbols\n` +
                    `${branding_1.Mascot.Emotes.Success} Win if all 3 symbols match!\n\n` +
                    `**Winning:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Match all 3 symbols to win\n` +
                    `${branding_1.Mascot.Emotes.Fail} Any mismatch = You lose your bet\n` +
                    `${branding_1.Mascot.Emotes.Seven} The rarer the symbol, the higher the payout!\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Slots are pure luck - no strategy needed\n` +
                    `${branding_1.Mascot.Emotes.Think} Set a budget and stick to it\n` +
                    `${branding_1.Mascot.Emotes.Think} Chase the jackpot, but gamble responsibly!`)
                    .setFooter({ text: "Command: ,slots <amount>" });
                break;
            case "guide_coinflip":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Blackcoin} Coinflip - How to Play`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`**Objective:** Predict whether the coin will land on Heads or Tails.\n\n` +
                    `**How to Play:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Choose your bet amount\n` +
                    `${branding_1.Mascot.Emotes.Success} Choose **Heads (H)** or **Tails (T)**\n` +
                    `${branding_1.Mascot.Emotes.Dices} The coin flips!\n` +
                    `${branding_1.Mascot.Emotes.Success} If you guessed correctly, you win 2x your bet\n\n` +
                    `**Odds:**\n` +
                    `${branding_1.Mascot.Emotes.Graph} **50/50** chance to win\n` +
                    `${branding_1.Mascot.Emotes.GraphUp} **2x payout** when you win\n\n` +
                    `**Commands:**\n` +
                    `${branding_1.Mascot.Emotes.Cards} \`,coinflip <amount> h\` - Bet on Heads\n` +
                    `${branding_1.Mascot.Emotes.Cards} \`,coinflip <amount> t\` - Bet on Tails\n` +
                    `${branding_1.Mascot.Emotes.Cards} \`,cf <amount> h/t\` - Short version\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Simple 50/50 odds - perfect for beginners\n` +
                    `${branding_1.Mascot.Emotes.Think} Quick and easy way to double your money\n` +
                    `${branding_1.Mascot.Emotes.Think} Past flips don't affect future results!`)
                    .setFooter({ text: "Command: ,coinflip <amount> <h|t> or ,cf <amount> <h|t>" });
                break;
            case "guide_cockfight":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Chicken} Cockfight - How to Play`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`**Objective:** Battle your rooster against opponents and win the fight!\n\n` +
                    `**How to Play:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Purchase a rooster from the Server Store (\`,store\`)\n` +
                    `${branding_1.Mascot.Emotes.Success} Place your bet and enter the arena\n` +
                    `${branding_1.Mascot.Emotes.CockfightShield} Your rooster's stats determine fight outcome\n` +
                    `${branding_1.Mascot.Emotes.Dices} Battle automatically resolves based on stats\n\n` +
                    `**Rooster Stats:**\n` +
                    `${branding_1.Mascot.Emotes.Spear} **Attack** - Damage dealt to opponent\n` +
                    `${branding_1.Mascot.Emotes.CockfightShield} **Defense** - Reduces incoming damage\n` +
                    `${branding_1.Mascot.Emotes.Fast} **Speed** - Determines who attacks first\n` +
                    `${branding_1.Mascot.Emotes.GraphUp} **Level** - Overall rooster strength\n\n` +
                    `**Winning:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Stronger roosters have better win chances\n` +
                    `${branding_1.Mascot.Emotes.GraphUp} Win fights to level up your rooster\n` +
                    `${branding_1.Mascot.Emotes.Money} Winners take the pot!\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Train and upgrade your rooster regularly\n` +
                    `${branding_1.Mascot.Emotes.Think} Feed your rooster to boost performance\n` +
                    `${branding_1.Mascot.Emotes.Think} Higher level roosters dominate the arena!`)
                    .setFooter({ text: "Commands: ,cockfight <amount> | ,cockstore | ,feed" });
                break;
            case "guide_feed":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Banana} Feed - How to Play`)
                    .setColor(branding_1.Mascot.Colors.Base)
                    .setDescription(`**Objective:** Feed your rooster to improve its stats for cockfights!\n\n` +
                    `**How to Play:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Own a rooster (purchase from \`,cockstore\`)\n` +
                    `${branding_1.Mascot.Emotes.Banana} Use the feed command to boost your rooster\n` +
                    `${branding_1.Mascot.Emotes.GraphUp} Your rooster's stats increase\n` +
                    `${branding_1.Mascot.Emotes.CockfightShield} Better stats = Better fight performance\n\n` +
                    `**What Feeding Does:**\n` +
                    `${branding_1.Mascot.Emotes.Spear} Increases **Attack** power\n` +
                    `${branding_1.Mascot.Emotes.CockfightShield} Boosts **Defense** capabilities\n` +
                    `${branding_1.Mascot.Emotes.Fast} Improves **Speed** stats\n` +
                    `${branding_1.Mascot.Emotes.GraphUp} Overall enhancement to combat ability\n\n` +
                    `**Strategic Uses:**\n` +
                    `${branding_1.Mascot.Emotes.Success} Feed before important cockfights\n` +
                    `${branding_1.Mascot.Emotes.Success} Maintain your rooster's competitive edge\n` +
                    `${branding_1.Mascot.Emotes.Success} Regular feeding = Stronger rooster\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Well-fed roosters win more fights\n` +
                    `${branding_1.Mascot.Emotes.Think} Feed regularly to keep stats high\n` +
                    `${branding_1.Mascot.Emotes.Think} Investment in feeding pays off in victories!`)
                    .setFooter({ text: "Command: ,feed" });
                break;
            case "guide_russianroulette":
                guideEmbed = new discord_js_1.EmbedBuilder()
                    .setTitle(`${branding_1.Mascot.Emotes.Gun} Russian Roulette - How to Play`)
                    .setColor("#E74C3C")
                    .setDescription(`**Objective:** Survive the deadly game of chance!\n\n` +
                    `**How to Play:**\n` +
                    `${branding_1.Mascot.Emotes.Alert} Place your bet to join the game\n` +
                    `${branding_1.Mascot.Emotes.Gun} A revolver with 1 bullet and 5 empty chambers\n` +
                    `${branding_1.Mascot.Emotes.Dices} The cylinder spins randomly\n` +
                    `${branding_1.Mascot.Emotes.Shocked} Pull the trigger and hope for the best!\n\n` +
                    `**Odds:**\n` +
                    `${branding_1.Mascot.Emotes.Success} **5/6 chance** to survive (83.3%)\n` +
                    `${branding_1.Mascot.Emotes.Fail} **1/6 chance** to get shot (16.7%)\n` +
                    `${branding_1.Mascot.Emotes.Money} Survivors win big payouts!\n\n` +
                    `**Winning:**\n` +
                    `${branding_1.Mascot.Emotes.Success} If you survive, multiply your bet\n` +
                    `${branding_1.Mascot.Emotes.Rip} If the bullet fires, you lose everything\n` +
                    `${branding_1.Mascot.Emotes.Alert} High risk, high reward gameplay\n\n` +
                    `**WARNING:**\n` +
                    `${branding_1.Mascot.Emotes.Alert} This is the riskiest casino game\n` +
                    `${branding_1.Mascot.Emotes.Alert} Only for the boldest gamblers\n` +
                    `${branding_1.Mascot.Emotes.Alert} One wrong pull could cost you big!\n\n` +
                    `**Tips:**\n` +
                    `${branding_1.Mascot.Emotes.Think} Not for the faint of heart\n` +
                    `${branding_1.Mascot.Emotes.Think} Only bet what you can afford to lose\n` +
                    `${branding_1.Mascot.Emotes.Think} Luck is your only ally here!`)
                    .setFooter({ text: "Command: ,russianroulette <amount> or ,rr <amount>" });
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
//# sourceMappingURL=casinoGuide.js.map