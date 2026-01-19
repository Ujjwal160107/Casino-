
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import prisma from "../../utils/prisma";
import { updateGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed } from "../../utils/embed";

export const data = new SlashCommandBuilder()
    .setName("set-income")
    .setDescription("Configure income commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => opt.setName("command").setDescription("Command to config (work, beg, crime, rob)").setRequired(true).addChoices(
        { name: "Work", value: "work" },
        { name: "Beg", value: "beg" },
        { name: "Crime", value: "crime" },
        { name: "Rob", value: "rob" }
    ))
    .addStringOption(opt => opt.setName("field").setDescription("Field to update").setRequired(true).addChoices(
        { name: "Min Pay", value: "min" },
        { name: "Max Pay", value: "max" },
        { name: "Cooldown (sec)", value: "cooldown" },
        { name: "Success Rate (%)", value: "success" },
        { name: "Penalty (%)", value: "penalty" }
    ))
    .addNumberOption(opt => opt.setName("value").setDescription("New value").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    const cmd = interaction.options.getString("command", true);
    const field = interaction.options.getString("field", true);
    const val = interaction.options.getNumber("value", true);
    await interaction.deferReply();

    const updates: any = {};
    if (field === "min") updates.minPay = Math.floor(val);
    else if (field === "max") updates.maxPay = Math.floor(val);
    else if (field === "cooldown") updates.cooldown = Math.floor(val);
    else if (field === "success") updates.successPct = Math.floor(val);
    else if (field === "penalty") updates.failPenaltyPct = Math.floor(val);

    if (cmd === "rob") {
        const guildUpdates: any = {};
        if (field === "cooldown") guildUpdates.robCooldown = updates.cooldown;
        else if (field === "success") guildUpdates.robSuccessPct = updates.successPct;
        else if (field === "penalty") guildUpdates.robFinePct = updates.failPenaltyPct;
        else return interaction.editReply({ embeds: [errorEmbed(interaction.user, "Not Supported", "For 'rob', only cooldown, success, and penalty are valid.")] });

        await updateGuildConfig(interaction.guildId!, guildUpdates);
        return interaction.editReply({ embeds: [successEmbed(interaction.user, "Rob Config Updated", `Updated **rob**: ${field}=${val}`)] });
    }

    await prisma.incomeConfig.upsert({
        where: { guildId_commandKey: { guildId: interaction.guildId!, commandKey: cmd } },
        create: {
            guildId: interaction.guildId!, commandKey: cmd,
            minPay: updates.minPay ?? 50, maxPay: updates.maxPay ?? 150,
            cooldown: updates.cooldown ?? 60, successPct: updates.successPct ?? 100, failPenaltyPct: updates.failPenaltyPct ?? 50
        },
        update: updates
    });
    return interaction.editReply({ embeds: [successEmbed(interaction.user, "Config Updated", `**${cmd}** updated: ${field}=${val}`)] });
}
