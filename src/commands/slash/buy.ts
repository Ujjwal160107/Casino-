
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Colors, GuildMember } from "discord.js";
import { ensureUserAndWallet } from "../../services/walletService";
import { buyItem } from "../../services/shopService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";

export const data = new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy a specific item by name")
    .addStringOption((opt) => opt.setName("item").setDescription("Name of the item").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const itemName = interaction.options.getString("item", true);
    await interaction.deferReply();
    const config = await getGuildConfig(interaction.guildId!);
    const emoji = config.currencyEmoji;

    try {
        await ensureUserAndWallet(interaction.user.id, interaction.guildId!, interaction.user.tag);
        const { item, results } = await buyItem(interaction.guildId!, interaction.user.id, itemName);

        if (item.roleId && interaction.guild) {
            const role = interaction.guild.roles.cache.get(item.roleId);
            if (role) {
                const member = interaction.member as GuildMember;
                try { await member.roles.add(role); } catch { }
            }
        }

        await interaction.editReply({ embeds: [successEmbed(interaction.user, "Purchase Successful", `You bought **${item.name}**!`)] });

        if (results && results.length > 0) {
            const customMessages = results.filter((r: any) => r.type === "CUSTOM_MESSAGE");
            const otherEffects = results.filter((r: any) => r.type !== "CUSTOM_MESSAGE");

            for (const msgEffect of customMessages) {
                const msgEmbed = new EmbedBuilder().setColor(Colors.Gold).setDescription(msgEffect.message);
                if (interaction.channel && 'send' in interaction.channel) {
                    await (interaction.channel as any).send({ embeds: [msgEmbed] });
                }
            }

            if (otherEffects.length > 0) {
                const effectMsg = otherEffects.map((r: any) => r.message).join("\n");
                const effectEmbed = new EmbedBuilder().setColor(Colors.Gold).setDescription(effectMsg);
                await interaction.followUp({ embeds: [effectEmbed] });
            }
        }
    } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Failed", (err as Error).message)] });
    }
}
