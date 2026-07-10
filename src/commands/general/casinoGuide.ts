import {
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    AttachmentBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import * as path from "path";
import { Mascot } from "../../config/branding";
import { CHERRY, BANANA, GRAPES, MELON, BELL, GEM, SEVEN } from "../games/slots";
import { getGuildPrefix } from "../../utils/guildContext";

const CASINO_ACCENT_COLOR = 0x9B59B6;
const CASINO_BANNER_NAME = "casino_banner.png";
const CASINO_BANNER_URL = `attachment://${CASINO_BANNER_NAME}`;
const ROULETTE_GUIDE_NAME = "roulette_guide.png";
const ROULETTE_GUIDE_URL = `attachment://${ROULETTE_GUIDE_NAME}`;
const GUIDES_PER_PAGE = 5;

type GuideListItem = {
    customId: string;
    label: string;
    emoji: string;
    style: ButtonStyle;
    title: string;
    description: string;
};

function separator() {
    return new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small);
}

function buildGuideContainer(title: string, body: string, accentColor = CASINO_ACCENT_COLOR, imageUrl?: string, imageDescription?: string) {
    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}`),
        )
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(body),
        );

    if (imageUrl) {
        container.addSeparatorComponents(separator());
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(imageUrl)
                    .setDescription(imageDescription || title),
            ),
        );
    }

    return container;
}

function buildCasinoHomeContainer(
    prefix: string,
    guides: GuideListItem[],
    page = 1,
) {
    const totalPages = getGuideTotalPages(guides);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (safePage - 1) * GUIDES_PER_PAGE;
    const visibleGuides = guides.slice(startIndex, startIndex + GUIDES_PER_PAGE);
    const container = new ContainerBuilder()
        .setAccentColor(CASINO_ACCENT_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${Mascot.Emotes.Casino} ${Mascot.Name} Casino\n` +
                `> Pick a game guide below from its own row.\n` +
                `> Use buttons for quick help, then run the listed commands when you're ready to play.`,
            ),
        )
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${Mascot.Emotes.Cards} Game Guides`),
        );

    visibleGuides.forEach((guide, index) => {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${startIndex + index + 1}. ${guide.title}`),
                    new TextDisplayBuilder().setContent(`${guide.description}\nCommand: \`${guideCommandPreview(prefix, guide.customId)}\``),
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(guide.customId)
                        .setLabel(guide.label)
                        .setStyle(guide.style)
                        .setEmoji(guide.emoji),
                ),
        );

        if (index < visibleGuides.length - 1) {
            container.addSeparatorComponents(separator());
        }
    });

    return container
        .addSeparatorComponents(separator())
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                    .setURL(CASINO_BANNER_URL)
                    .setDescription(`${Mascot.Name} casino banner`),
            ),
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`Page ${safePage}/${totalPages}`),
        );
}

function getGuideTotalPages(guides: GuideListItem[]) {
    return Math.max(1, Math.ceil(guides.length / GUIDES_PER_PAGE));
}

function guideCommandPreview(prefix: string, customId: string) {
    switch (customId) {
        case "guide_blackjack": return `${prefix}blackjack <amount>`;
        case "guide_roulette": return `${prefix}roulette <amount> <choice>`;
        case "guide_slots": return `${prefix}slots <amount>`;
        case "guide_coinflip": return `${prefix}coinflip <amount> <h|t>`;
        case "guide_cockfight": return `${prefix}cockfight <amount>`;
        case "guide_feed": return `${prefix}feed`;
        case "guide_russianroulette": return `${prefix}russianroulette <amount>`;
        default: return `${prefix}casino`;
    }
}

function buildGuidePageNavigationRow(page: number, totalPages: number, disabled = false) {
    const safeTotalPages = Math.max(1, totalPages);
    const safePage = Math.min(Math.max(page, 1), safeTotalPages);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`casino_guide_page_prev_${Math.max(1, safePage - 1)}`)
            .setLabel("Prev")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || safePage <= 1),
        new ButtonBuilder()
            .setCustomId(`casino_guide_page_next_${Math.min(safeTotalPages, safePage + 1)}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || safePage >= safeTotalPages),
    );
}

export async function handleCasinoGuide(message: Message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "casino_banner.png");
    const attachment = new AttachmentBuilder(bannerPath, { name: CASINO_BANNER_NAME });
    const prefix = await getGuildPrefix(message.guildId!);
    

    const guideItems: GuideListItem[] = [
        {
            customId: "guide_blackjack",
            label: "Blackjack",
            emoji: Mascot.Emotes.Bj,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Bj} Blackjack`,
            description: "Beat the dealer by getting close to 21 without busting.",
        },
        {
            customId: "guide_roulette",
            label: "Roulette",
            emoji: Mascot.Emotes.Dices,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Dices} Roulette`,
            description: "Predict the wheel result with number, color, range, dozen, or column bets.",
        },
        {
            customId: "guide_slots",
            label: "Slots",
            emoji: Mascot.Emotes.Seven,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Seven} Slots`,
            description: "Spin three reels and match symbols for multiplier payouts.",
        },
        {
            customId: "guide_coinflip",
            label: "Coinflip",
            emoji: Mascot.Emotes.Blackcoin,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Blackcoin} Coinflip`,
            description: "Choose heads or tails for a fast 50/50 double-or-nothing bet.",
        },
        {
            customId: "guide_cockfight",
            label: "Cockfight",
            emoji: Mascot.Emotes.Chicken,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Chicken} Cockfight`,
            description: "Battle with rooster stats, upgrades, and arena wagers.",
        },
        {
            customId: "guide_feed",
            label: "Feed",
            emoji: Mascot.Emotes.Banana,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Banana} Feed`,
            description: "Boost your rooster before fights by improving its combat stats.",
        },
        {
            customId: "guide_russianroulette",
            label: "Russian Roulette",
            emoji: Mascot.Emotes.Gun,
            style: ButtonStyle.Primary,
            title: `${Mascot.Emotes.Gun} Russian Roulette`,
            description: "High-risk survival betting with one dangerous chamber.",
        },
    ];
    let currentPage = 1;
    const totalGuidePages = getGuideTotalPages(guideItems);

    let sent;
    try {
        sent = await message.reply({
            components: [
                buildCasinoHomeContainer(prefix, guideItems, currentPage),
                buildGuidePageNavigationRow(currentPage, totalGuidePages),
            ],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        console.error("Failed to send casino guide V2 panel:", err);
        return message.reply("Casino guide could not be rendered. Check the bot logs for the Discord API validation error.");
    }

    const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300_000, // 5 minutes
        filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
        let guideContainer: ContainerBuilder;

        if (interaction.customId.startsWith("casino_guide_page_")) {
            const customIdParts = interaction.customId.split("_");
            currentPage = parseInt(customIdParts[customIdParts.length - 1] || "1", 10) || 1;

            await interaction.update({
                components: [
                    buildCasinoHomeContainer(prefix, guideItems, currentPage),
                    buildGuidePageNavigationRow(currentPage, totalGuidePages),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
            return;
        }

        switch (interaction.customId) {
            case "guide_blackjack":
                guideContainer = buildGuideContainer(
                    `${Mascot.Emotes.Bj} Blackjack - How to Play`,
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
                        `${Mascot.Emotes.Think} Watch the dealer's visible card!\n\n` +
                        `**Command:** \`${prefix}blackjack <amount>\` or \`${prefix}bj <amount>\``
                );
                break;

            case "guide_roulette":
                const roulBannerPath = path.join(process.cwd(), "src", "assets", "roulette_guide.png");
                const roulAttachment = new AttachmentBuilder(roulBannerPath, { name: ROULETTE_GUIDE_NAME });

                guideContainer = buildGuideContainer(
                    `Roulette - How to Play`,
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
                        `- Multiple bets can be placed on different outcomes.\n\n` +
                        `**Command:** \`${prefix}bet <amount> <choice>\` or \`${prefix}roulette <amount> <choice>\``,
                    CASINO_ACCENT_COLOR,
                    ROULETTE_GUIDE_URL,
                    "Roulette guide board",
                );

                await interaction.reply({
                    components: [guideContainer],
                    files: [roulAttachment],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
                return;

            case "guide_slots":
                guideContainer = buildGuideContainer(
                    `${Mascot.Emotes.Seven} Slots - How to Play`,
                        `**Objective:** Match 3 symbols in a row to win!\n\n` +
                        `**Symbols & Payouts:**\n` +
                        `${SEVEN} ${SEVEN} ${SEVEN} - **20x** Payout\n` +
                        `${GEM} ${GEM} ${GEM} - **10x** Payout\n` +
                        `${BELL} ${BELL} ${BELL} - **5x** Payout\n` +
                        `${GRAPES} / ${MELON} - **3x** Payout\n` +
                        `${CHERRY} / ${BANANA} - **2x** Payout\n\n` +
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
                        `${Mascot.Emotes.Think} Chase the jackpot, but gamble responsibly!\n\n` +
                        `**Command:** \`${prefix}slots <amount>\``
                );
                break;

            case "guide_coinflip":
                guideContainer = buildGuideContainer(
                    `${Mascot.Emotes.Blackcoin} Coinflip - How to Play`,
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
                        `${Mascot.Emotes.Think} Past flips don't affect future results!\n\n` +
                        `**Command:** \`${prefix}coinflip <amount> <h|t>\` or \`${prefix}cf <amount> <h|t>\``
                );
                break;

            case "guide_cockfight":
                guideContainer = buildGuideContainer(
                    `${Mascot.Emotes.Chicken} Cockfight - How to Play`,
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
                        `${Mascot.Emotes.Think} Higher level roosters dominate the arena!\n\n` +
                        `**Commands:** \`${prefix}cockfight <amount>\` | \`${prefix}cockstore\` | \`${prefix}feed\``
                );
                break;

            case "guide_feed":
                guideContainer = buildGuideContainer(
                    `${Mascot.Emotes.Banana} Feed - How to Play`,
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
                        `${Mascot.Emotes.Think} Investment in feeding pays off in victories!\n\n` +
                        `**Command:** \`${prefix}feed\``
                );
                break;

            case "guide_russianroulette":
                guideContainer = buildGuideContainer(
                    `${Mascot.Emotes.Gun} Russian Roulette - How to Play`,
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
                        `${Mascot.Emotes.Think} Luck is your only ally here!\n\n` +
                        `**Command:** \`${prefix}russianroulette <amount>\` or \`${prefix}rr <amount>\``,
                    0xE74C3C,
                );
                break;

            default:
                return;
        }

        await interaction.reply({
            components: [guideContainer],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
    });

    collector.on("end", async () => {
        try {
            await sent.edit({
                components: [
                    buildCasinoHomeContainer(prefix, guideItems, currentPage),
                    buildGuidePageNavigationRow(currentPage, totalGuidePages, true),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch {
            // Message might be deleted
        }
    });
}
