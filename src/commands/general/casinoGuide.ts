import {
    Message,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    AttachmentBuilder
} from "discord.js";
import * as path from "path";
import { Mascot } from "../../config/branding";

export async function handleCasinoGuide(message: Message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "casino_banner.png");
    const attachment = new AttachmentBuilder(bannerPath, { name: "casino_banner.png" });

    const mainEmbed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.Casino} Fortuna's Casino - Game Guides`)
        .setDescription(
            `Welcome to **Fortuna's Casino**! ${Mascot.Emotes.Success}\n\n` +
            `Select a game below to learn how to play and increase your chances of winning!\n\n` +
            `${Mascot.Emotes.Cards} Each game has unique rules and strategies\n` +
            `${Mascot.Emotes.Dices} Practice makes perfect!\n` +
            `${Mascot.Emotes.Seven} Good luck and gamble responsibly!`
        )
        .setColor(Mascot.Colors.Base as any)
        .setImage("attachment://casino_banner.png")
        .setFooter({ text: "Click any button below to view game guides" });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("guide_blackjack")
            .setLabel("Blackjack")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(Mascot.Emotes.Bj),
        new ButtonBuilder()
            .setCustomId("guide_roulette")
            .setLabel("Roulette")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(Mascot.Emotes.Dices),
        new ButtonBuilder()
            .setCustomId("guide_slots")
            .setLabel("Slots")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(Mascot.Emotes.Seven),
        new ButtonBuilder()
            .setCustomId("guide_coinflip")
            .setLabel("Coinflip")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(Mascot.Emotes.Blackcoin)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("guide_cockfight")
            .setLabel("Cockfight")
            .setStyle(ButtonStyle.Success)
            .setEmoji(Mascot.Emotes.Chicken),
        new ButtonBuilder()
            .setCustomId("guide_feed")
            .setLabel("Feed")
            .setStyle(ButtonStyle.Success)
            .setEmoji(Mascot.Emotes.Banana),
        new ButtonBuilder()
            .setCustomId("guide_russianroulette")
            .setLabel("Russian Roulette")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(Mascot.Emotes.Gun)
    );

    const sent = await message.reply({
        embeds: [mainEmbed],
        files: [attachment],
        components: [row1, row2]
    });

    const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300_000, // 5 minutes
        filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
        let guideEmbed: EmbedBuilder;

        switch (interaction.customId) {
            case "guide_blackjack":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Bj} Blackjack - How to Play`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `**Objective:** Beat the dealer by getting as close to 21 as possible without going over.\n\n` +
                        `**Card Values:**\n` +
                        `${Mascot.Emotes.Cards} Number cards (2-10) = Face value\n` +
                        `${Mascot.Emotes.Cards} Face cards (J, Q, K) = 10 points\n` +
                        `${Mascot.Emotes.Cards} Ace = 1 or 11 points (automatically adjusted)\n\n` +
                        `**How to Play:**\n` +
                        `${Mascot.Emotes.Success} You and the dealer each receive 2 cards\n` +
                        `${Mascot.Emotes.Success} Dealer's first card is hidden\n` +
                        `${Mascot.Emotes.Success} Choose to **Hit** (draw card) or **Stand** (keep hand)\n` +
                        `${Mascot.Emotes.Success} If you go over 21, you **bust** and lose\n` +
                        `${Mascot.Emotes.Success} Dealer must draw until reaching 17 or higher\n\n` +
                        `**Winning Conditions:**\n` +
                        `${Mascot.Emotes.Seven} **Blackjack** (Ace + 10-value card) = 2.5x payout!\n` +
                        `${Mascot.Emotes.Success} Higher score than dealer without busting = 2x payout\n` +
                        `${Mascot.Emotes.Confused} Same score as dealer = Push (bet returned)\n` +
                        `${Mascot.Emotes.Fail} Bust or lower score = Lose your bet\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Stand on 17 or higher\n` +
                        `${Mascot.Emotes.Think} Hit on 11 or lower\n` +
                        `${Mascot.Emotes.Think} Watch the dealer's visible card!`
                    )
                    .setFooter({ text: "Command: ,blackjack <amount> or ,bj <amount>" });
                break;

            case "guide_roulette":
                const roulBannerPath = path.join(process.cwd(), "src", "assets", "roulette_guide.png");
                const roulAttachment = new AttachmentBuilder(roulBannerPath, { name: "roulette_guide.png" });

                guideEmbed = new EmbedBuilder()
                    .setTitle(`Roulette - How to Play`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `**Objective:** Predict where the ball will land on the roulette wheel.\n\n` +
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
                        `- Multiple bets can be placed on different outcomes.`
                    )
                    .setImage("attachment://roulette_guide.png")
                    .setFooter({ text: "Command: ,bet <amount> <choice> or ,roulette <amount> <choice>" });

                await interaction.reply({ embeds: [guideEmbed], files: [roulAttachment], ephemeral: true });
                return; // Return early as we handled the reply manually due to file attachment

            case "guide_slots":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Seven} Slots - How to Play`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `**Objective:** Match 3 symbols in a row to win!\n\n` +
                        `**Symbols & Payouts:**\n` +
                        `${Mascot.Emotes.Seven} **7 7 7** - JACKPOT! 10x your bet\n` +
                        `${Mascot.Emotes.Cherry} **🍒 🍒 🍒** - 5x your bet\n` +
                        `${Mascot.Emotes.Watermelonm} **🍉 🍉 🍉** - 4x your bet\n` +
                        `${Mascot.Emotes.Grapes} **🍇 🍇 🍇** - 3x your bet\n` +
                        `${Mascot.Emotes.Banana} **🍌 🍌 🍌** - 2x your bet\n\n` +
                        `**How to Play:**\n` +
                        `${Mascot.Emotes.Success} Choose your bet amount\n` +
                        `${Mascot.Emotes.Dices} Pull the lever (automatically spins)\n` +
                        `${Mascot.Emotes.Sparks} 3 reels spin and show random symbols\n` +
                        `${Mascot.Emotes.Success} Win if all 3 symbols match!\n\n` +
                        `**Winning:**\n` +
                        `${Mascot.Emotes.Success} Match all 3 symbols to win\n` +
                        `${Mascot.Emotes.Fail} Any mismatch = You lose your bet\n` +
                        `${Mascot.Emotes.Seven} The rarer the symbol, the higher the payout!\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Slots are pure luck - no strategy needed\n` +
                        `${Mascot.Emotes.Think} Set a budget and stick to it\n` +
                        `${Mascot.Emotes.Think} Chase the jackpot, but gamble responsibly!`
                    )
                    .setFooter({ text: "Command: ,slots <amount>" });
                break;

            case "guide_coinflip":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Blackcoin} Coinflip - How to Play`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `**Objective:** Predict whether the coin will land on Heads or Tails.\n\n` +
                        `**How to Play:**\n` +
                        `${Mascot.Emotes.Success} Choose your bet amount\n` +
                        `${Mascot.Emotes.Success} Choose **Heads (H)** or **Tails (T)**\n` +
                        `${Mascot.Emotes.Dices} The coin flips!\n` +
                        `${Mascot.Emotes.Success} If you guessed correctly, you win 2x your bet\n\n` +
                        `**Odds:**\n` +
                        `${Mascot.Emotes.Graph} **50/50** chance to win\n` +
                        `${Mascot.Emotes.GraphUp} **2x payout** when you win\n\n` +
                        `**Commands:**\n` +
                        `${Mascot.Emotes.Cards} \`,coinflip <amount> h\` - Bet on Heads\n` +
                        `${Mascot.Emotes.Cards} \`,coinflip <amount> t\` - Bet on Tails\n` +
                        `${Mascot.Emotes.Cards} \`,cf <amount> h/t\` - Short version\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Simple 50/50 odds - perfect for beginners\n` +
                        `${Mascot.Emotes.Think} Quick and easy way to double your money\n` +
                        `${Mascot.Emotes.Think} Past flips don't affect future results!`
                    )
                    .setFooter({ text: "Command: ,coinflip <amount> <h|t> or ,cf <amount> <h|t>" });
                break;

            case "guide_cockfight":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Chicken} Cockfight - How to Play`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `**Objective:** Battle your rooster against opponents and win the fight!\n\n` +
                        `**How to Play:**\n` +
                        `${Mascot.Emotes.Success} Purchase a rooster from the Server Store (\`,store\`)\n` +
                        `${Mascot.Emotes.Success} Place your bet and enter the arena\n` +
                        `${Mascot.Emotes.CockfightShield} Your rooster's stats determine fight outcome\n` +
                        `${Mascot.Emotes.Dices} Battle automatically resolves based on stats\n\n` +
                        `**Rooster Stats:**\n` +
                        `${Mascot.Emotes.Spear} **Attack** - Damage dealt to opponent\n` +
                        `${Mascot.Emotes.CockfightShield} **Defense** - Reduces incoming damage\n` +
                        `${Mascot.Emotes.Fast} **Speed** - Determines who attacks first\n` +
                        `${Mascot.Emotes.GraphUp} **Level** - Overall rooster strength\n\n` +
                        `**Winning:**\n` +
                        `${Mascot.Emotes.Success} Stronger roosters have better win chances\n` +
                        `${Mascot.Emotes.GraphUp} Win fights to level up your rooster\n` +
                        `${Mascot.Emotes.Money} Winners take the pot!\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Train and upgrade your rooster regularly\n` +
                        `${Mascot.Emotes.Think} Feed your rooster to boost performance\n` +
                        `${Mascot.Emotes.Think} Higher level roosters dominate the arena!`
                    )
                    .setFooter({ text: "Commands: ,cockfight <amount> | ,cockstore | ,feed" });
                break;

            case "guide_feed":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Banana} Feed - How to Play`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `**Objective:** Feed your rooster to improve its stats for cockfights!\n\n` +
                        `**How to Play:**\n` +
                        `${Mascot.Emotes.Success} Own a rooster (purchase from \`,cockstore\`)\n` +
                        `${Mascot.Emotes.Banana} Use the feed command to boost your rooster\n` +
                        `${Mascot.Emotes.GraphUp} Your rooster's stats increase\n` +
                        `${Mascot.Emotes.CockfightShield} Better stats = Better fight performance\n\n` +
                        `**What Feeding Does:**\n` +
                        `${Mascot.Emotes.Spear} Increases **Attack** power\n` +
                        `${Mascot.Emotes.CockfightShield} Boosts **Defense** capabilities\n` +
                        `${Mascot.Emotes.Fast} Improves **Speed** stats\n` +
                        `${Mascot.Emotes.GraphUp} Overall enhancement to combat ability\n\n` +
                        `**Strategic Uses:**\n` +
                        `${Mascot.Emotes.Success} Feed before important cockfights\n` +
                        `${Mascot.Emotes.Success} Maintain your rooster's competitive edge\n` +
                        `${Mascot.Emotes.Success} Regular feeding = Stronger rooster\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Well-fed roosters win more fights\n` +
                        `${Mascot.Emotes.Think} Feed regularly to keep stats high\n` +
                        `${Mascot.Emotes.Think} Investment in feeding pays off in victories!`
                    )
                    .setFooter({ text: "Command: ,feed" });
                break;

            case "guide_russianroulette":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Gun} Russian Roulette - How to Play`)
                    .setColor("#E74C3C")
                    .setDescription(
                        `**Objective:** Survive the deadly game of chance!\n\n` +
                        `**How to Play:**\n` +
                        `${Mascot.Emotes.Alert} Place your bet to join the game\n` +
                        `${Mascot.Emotes.Gun} A revolver with 1 bullet and 5 empty chambers\n` +
                        `${Mascot.Emotes.Dices} The cylinder spins randomly\n` +
                        `${Mascot.Emotes.Shocked} Pull the trigger and hope for the best!\n\n` +
                        `**Odds:**\n` +
                        `${Mascot.Emotes.Success} **5/6 chance** to survive (83.3%)\n` +
                        `${Mascot.Emotes.Fail} **1/6 chance** to get shot (16.7%)\n` +
                        `${Mascot.Emotes.Money} Survivors win big payouts!\n\n` +
                        `**Winning:**\n` +
                        `${Mascot.Emotes.Success} If you survive, multiply your bet\n` +
                        `${Mascot.Emotes.Rip} If the bullet fires, you lose everything\n` +
                        `${Mascot.Emotes.Alert} High risk, high reward gameplay\n\n` +
                        `**WARNING:**\n` +
                        `${Mascot.Emotes.Alert} This is the riskiest casino game\n` +
                        `${Mascot.Emotes.Alert} Only for the boldest gamblers\n` +
                        `${Mascot.Emotes.Alert} One wrong pull could cost you big!\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Not for the faint of heart\n` +
                        `${Mascot.Emotes.Think} Only bet what you can afford to lose\n` +
                        `${Mascot.Emotes.Think} Luck is your only ally here!`
                    )
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
        } catch {
            // Message might be deleted
        }
    });
}
