import {
    Message,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder,
} from "discord.js";
import * as path from "path";
import { Mascot } from "../../config/branding";
import { getGuildPrefix } from "../../utils/guildContext";

export async function handleTutorial(message: Message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "guide_banner.png");
    const attachment = new AttachmentBuilder(bannerPath, { name: "guide_banner.png" });

    const prefix = await getGuildPrefix(message.guildId!);
    

    const mainEmbed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.University} ${Mascot.Name} - Tutorial`)
        .setDescription(
            `Welcome to the **${Mascot.Name}** Tutorial! ${Mascot.Emotes.FortunaSparkle}\n\n` +
            `This tutorial will guide you through the features of the bot, from getting started to becoming a tycoon.\n` +
            `Use the menu below to navigate through the tutorial steps.`
        )
        .setColor(Mascot.Colors.Base as any)
        .setImage("attachment://guide_banner.png")
        .setFooter({ text: `Server Prefix: ${prefix}` });

    const menu = new StringSelectMenuBuilder()
        .setCustomId("tutorial_menu")
        .setPlaceholder("Select a tutorial step...")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("1. Getting Started")
                .setDescription("Daily, Weekly, Monthly rewards")
                .setValue("tutorial_start")
                .setEmoji(Mascot.Emotes.MoneyBag as any),
            new StringSelectMenuOptionBuilder()
                .setLabel("2. Casino")
                .setDescription("Learn about casino games")
                .setValue("tutorial_casino")
                .setEmoji(Mascot.Emotes.Casino as any),
            new StringSelectMenuOptionBuilder()
                .setLabel("3. Career & Studies")
                .setDescription("Studying and Freelancing")
                .setValue("tutorial_career")
                .setEmoji(Mascot.Emotes.University as any),
            new StringSelectMenuOptionBuilder()
                .setLabel("4. Life Economy")
                .setDescription("Marriage, Properties, Stocks")
                .setValue("tutorial_life")
                .setEmoji(Mascot.Emotes.Love as any),
            new StringSelectMenuOptionBuilder()
                .setLabel("5. Marketplace")
                .setDescription("Stores and Server Items")
                .setValue("tutorial_market")
                .setEmoji(Mascot.Emotes.Shop as any)
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    const sent = await message.reply({
        embeds: [mainEmbed],
        files: [attachment],
        components: [row]
    });

    const collector = sent.createMessageComponentCollector({
        time: 300_000,
        filter: (i) => i.user.id === message.author.id
    });

    collector.on("collect", async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;
        const value = interaction.values[0];
        let guideEmbed: EmbedBuilder;

        switch (value) {
            case "tutorial_start":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.MoneyBag} 1. Getting Started`)
                    .setColor(Mascot.Colors.Success as any)
                    .setDescription(
                        `The first step to wealth is claiming your free rewards!\n\n` +
                        `**Regular Rewards:**\n` +
                        `${Mascot.Emotes.Gem} \`${prefix}daily\` - Claim your daily reward.\n` +
                        `${Mascot.Emotes.MedalSilver} \`${prefix}weekly\` - Claim your weekly reward.\n` +
                        `${Mascot.Emotes.MedalGold} \`${prefix}monthly\` - Claim your monthly reward.\n\n` +
                        `*Don't forget to claim these regularly to build your initial capital!*`
                    )
                    .setImage("attachment://guide_banner.png");
                break;

            case "tutorial_casino":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Casino} 2. Casino Games`)
                    .setColor(Mascot.Colors.Fail as any) // Casino usually associated with risk/red
                    .setDescription(
                        `Once you have some money, you might want to try your luck at the casino.\n\n` +
                        `**Learning the Ropes:**\n` +
                        `We have a dedicated guide for all our casino games.\n` +
                        `👉 Use \`${prefix}casino\` to view the rules and payouts for each game.\n\n` +
                        `*Remember: The house always wins... eventually. Gamble responsibly!*`
                    )
                    .setImage("attachment://guide_banner.png");
                break;

            case "tutorial_career":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.University} 3. Career & Studies`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `To earn a steady income, you need to work and study.\n\n` +
                        `**Education:**\n` +
                        `${Mascot.Emotes.Pencil} \`${prefix}enroll\` - Enroll in a course (e.g. Computer Science).\n` +
                        `${Mascot.Emotes.University} \`${prefix}study\` - Study to improve your grades and graduate.\n\n` +
                        `**Work:**\n` +
                        `${Mascot.Emotes.FortunaWorking} \`${prefix}work\` - Do freelance work to earn money while studying.\n` +
                        `*Better education leads to better paying jobs in the future!*`
                    )
                    .setImage("attachment://guide_banner.png");
                break;

            case "tutorial_life":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Love} 4. Life Economy`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `Build a life beyond just money.\n\n` +
                        `**Relationships:**\n` +
                        `${Mascot.Emotes.Love} \`${prefix}marry <user>\` - Find a partner and get married.\n\n` +
                        `**Assets:**\n` +
                        `${Mascot.Emotes.Bank} \`${prefix}properties\` - Buy properties to earn passive rent income.\n` +
                        `${Mascot.Emotes.Stonks} \`${prefix}stocks\` - Invest in the stock market for long-term gains.\n\n` +
                        `*Diversify your income streams for maximum wealth!*`
                    )
                    .setImage("attachment://guide_banner.png");
                break;

            case "tutorial_market":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Shop} 5. Marketplace`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `Spend your hard-earned cash on items.\n\n` +
                        `**Shopping:**\n` +
                        `${Mascot.Emotes.Shop} \`${prefix}shop\` - View shared catalog items.\n` +
                        `🏪 \`${prefix}store\` - View **server-specific** items added by your server admins.\n\n` +
                        `*Server items are unique to each community!*`
                    )
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
        } catch {
            // Message might be deleted
        }
    });
}
