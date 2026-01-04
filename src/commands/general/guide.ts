import {
    Message,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder,
    ComponentType,
    GuildMember
} from "discord.js";
import * as path from "path";
import { Mascot } from "../../config/branding";
import { getGuildConfig } from "../../services/guildConfigService";

export async function handleGuide(message: Message) {
    const bannerPath = path.join(process.cwd(), "src", "assets", "guide_banner.png");
    const attachment = new AttachmentBuilder(bannerPath, { name: "guide_banner.png" });

    const config = await getGuildConfig(message.guildId!);
    const prefix = config.prefix || "!";

    const mainEmbed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.University} ${Mascot.Name} - Complete Guide`)
        .setDescription(
            `Welcome to the ultimate guide for **${Mascot.Name}**! ${Mascot.Emotes.FortunaSparkle}\n\n` +
            `Here you will learn how to start your journey, earn money, build a life, and play in the casino.\n` +
            `Use the menu below to navigate through the different sections.`
        )
        .setColor(Mascot.Colors.Base as any)
        .setImage("attachment://guide_banner.png")
        .setFooter({ text: `Server Prefix: ${prefix}` });

    const menu = new StringSelectMenuBuilder()
        .setCustomId("guide_menu")
        .setPlaceholder("Select a topic to learn about...")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Getting Started")
                .setDescription("How to earn money and start playing")
                .setValue("guide_start")
                .setEmoji(Mascot.Emotes.MoneyBag as any),
            new StringSelectMenuOptionBuilder()
                .setLabel("Life Economy")
                .setDescription("Jobs, Education, Marriage & Property")
                .setValue("guide_life")
                .setEmoji(Mascot.Emotes.University as any),
            new StringSelectMenuOptionBuilder()
                .setLabel("Casino")
                .setDescription("Gambling games and strategies")
                .setValue("guide_casino")
                .setEmoji(Mascot.Emotes.Casino as any)
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
            case "guide_start":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.MoneyBag} Getting Started`)
                    .setColor(Mascot.Colors.Success as any)
                    .setDescription(
                        `Here is how you can start earning money and building your wealth:\n\n` +
                        `**Income Commands:**\n` +
                        `${Mascot.Emotes.FortunaWorking} \`${prefix}work\` - Start a work shift to earn money. (Requires a job)\n` +
                        `${Mascot.Emotes.Redcoin} \`${prefix}beg\` - Beg for some spare change.\n` +
                        `${Mascot.Emotes.Gun} \`${prefix}crime\` - Commit a crime for high rewards (but high risk!).\n` +
                        `${Mascot.Emotes.Banana} \`${prefix}slut\` - A risky way to earn fast cash.\n\n` +
                        `**Daily Rewards:**\n` +
                        `${Mascot.Emotes.Gem} \`${prefix}daily\` - Claim your daily reward.\n` +
                        `${Mascot.Emotes.MedalSilver} \`${prefix}weekly\` - Claim your weekly reward.\n` +
                        `${Mascot.Emotes.MedalGold} \`${prefix}monthly\` - Claim your monthly reward.\n\n` +
                        `**Tips:**\n` +
                        `${Mascot.Emotes.Think} Check your balance with \`${prefix}bal\`\n` +
                        `${Mascot.Emotes.Think} Deposit money to your bank with \`${prefix}dep all\` to keep it safe!`
                    )
                    .setImage("attachment://guide_banner.png");
                break;

            case "guide_life":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.University} Life Economy`)
                    .setColor(Mascot.Colors.Base as any)
                    .setDescription(
                        `Build your virtual life with these features:\n\n` +
                        `**Career & Education:**\n` +
                        `${Mascot.Emotes.University} \`${prefix}university\` - View available degrees to study.\n` +
                        `${Mascot.Emotes.Pencil} \`${prefix}study\` - Study to increase your intelligence and graduate.\n` +
                        `${Mascot.Emotes.JobPromotion} \`${prefix}jobs\` - View available jobs. Better degrees = Better jobs!\n` +
                        `${Mascot.Emotes.FortunaWorking} \`${prefix}apply <job>\` - Apply for a job.\n\n` +
                        `**Properties:**\n` +
                        `${Mascot.Emotes.Bank} \`${prefix}properties\` - View real estate for sale.\n` +
                        `${Mascot.Emotes.MoneyBag} \`${prefix}buyprop <name>\` - Buy a property to earn passive income.\n` +
                        `${Mascot.Emotes.Redcoin} \`${prefix}collect-rent\` - Collect rent from your properties.\n\n` +
                        `**Social:**\n` +
                        `${Mascot.Emotes.Love} \`${prefix}marry <user>\` - Propose to someone.\n` +
                        `${Mascot.Emotes.FortunaHeart} \`${prefix}family\` - View your family tree.`
                    )
                    .setImage("attachment://guide_banner.png");
                break;

            case "guide_casino":
                guideEmbed = new EmbedBuilder()
                    .setTitle(`${Mascot.Emotes.Casino} Casino Games`)
                    .setColor(Mascot.Colors.Fail as any)
                    .setDescription(
                        `**Feeling lucky?** Visit the casino to multiply your wealth!\n\n` +
                        `We have a variety of games including:\n` +
                        `${Mascot.Emotes.Dices} **Roulette**\n` +
                        `${Mascot.Emotes.Bj} **Blackjack**\n` +
                        `${Mascot.Emotes.Seven} **Slots**\n` +
                        `${Mascot.Emotes.Blackcoin} **Coinflip**\n\n` +
                        `${Mascot.Emotes.Alert} **WANT TO LEARN TO PLAY?**\n` +
                        `Run the command \`${prefix}casino\` to view detailed guides and rules for each game!`
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
