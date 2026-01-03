import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from "discord.js";
import { errorEmbed, successEmbed } from "../../utils/embed";
import { canExecuteAdminCommand } from "../../utils/permissionUtils";
import { getShopItems, resetShop } from "../../services/shopService";
import { Mascot } from "../../config/branding";

export async function handleResetShop(message: Message, args: string[]) {
    // Permission check
    if (!(await canExecuteAdminCommand(message, message.member!))) {
        return message.reply({ embeds: [errorEmbed(message.author, "Access Denied", "Admins only.")] });
    }

    // Count items
    const items = await getShopItems(message.guildId!, "GENERAL");
    if (items.length === 0) {
        return message.reply("The general shop is already empty.");
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("confirm_reset_shop").setLabel("Confirm Reset").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cancel_reset_shop").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.reply({
        content: `Are you sure you want to delete ALL **${items.length}** items from the **General Store**?\nThis cannot be undone.`,
        components: [row]
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on("collect", async (i: ButtonInteraction) => {
        if (i.user.id !== message.author.id) {
            return i.reply({ content: "Not your command.", ephemeral: true });
        }

        if (i.customId === "cancel_reset_shop") {
            await i.update({ content: "Reset cancelled.", components: [] });
            collector.stop();
            return;
        }

        if (i.customId === "confirm_reset_shop") {
            await resetShop(message.guildId!, "GENERAL");
            await i.update({ content: `${Mascot.Emotes.Success} **General Store** completely reset.`, components: [] });
            collector.stop();
        }
    });

    collector.on("end", async (collected, reason) => {
        if (reason === "time") {
            msg.edit({ components: [] }).catch(() => { });
        }
    });
}
