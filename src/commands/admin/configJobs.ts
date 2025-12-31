import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { Mascot } from "../../config/branding";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { updateGuildConfig } from "../../services/guildConfigService";

export async function handleConfigJobs(message: Message, args: string[]) {
    if (!message.guild) return;

    // Permission check
    if (!message.member?.permissions.has("Administrator")) {
        return message.reply({ embeds: [errorEmbed(message.author, "Permission Denied", "You need Administrator permissions.")] });
    }

    const sub = args[0]?.toLowerCase();

    if (sub === "set-sector") {
        const sector = args[1]?.toLowerCase();
        const amount = parseInt(args[2]);
        const validSectors = ["tech", "medical", "business", "legal", "service", "trade", "freelance"];

        if (!sector || !validSectors.includes(sector) || isNaN(amount) || amount <= 0) {
            return message.reply(`Usage: \`!config-jobs set-sector <Sector> <BasePay>\`\nValid Sectors: ${validSectors.join(", ")}`);
        }

        const config = await prisma.guildConfig.findUnique({ where: { guildId: message.guild.id } });
        const currentSectors = (config?.jobSectorBasePay as Record<string, number>) || {};

        currentSectors[sector] = amount;

        await updateGuildConfig(message.guild.id, { jobSectorBasePay: currentSectors });

        return message.reply({ embeds: [successEmbed(message.author, "Sector Base Pay Updated", `**${sector}** jobs now have a base pay of **${amount}**.`)] });
    }

    if (sub === "set-level") {
        const level = args[1]; // Intern, Junior, Senior, Lead, Executive, Freelance
        const amount = parseFloat(args[2]);
        const validLevels = ["Intern", "Junior", "Senior", "Lead", "Executive", "Freelance"];

        if (!level || !validLevels.includes(level) || isNaN(amount) || amount <= 0) {
            return message.reply(`Usage: \`!config-jobs set-level <Level> <Multiplier>\`\nValid Levels: ${validLevels.join(", ")}`);
        }

        const config = await prisma.guildConfig.findUnique({ where: { guildId: message.guild.id } });
        const currentLevels = (config?.jobLevelMultipliers as Record<string, number>) || {};

        currentLevels[level] = amount;

        await updateGuildConfig(message.guild.id, { jobLevelMultipliers: currentLevels });

        return message.reply({ embeds: [successEmbed(message.author, "Level Multiplier Updated", `**${level}** jobs now earn **${amount}x** base pay.`)] });
    }

    if (sub === "reset") {
        await updateGuildConfig(message.guild.id, { jobSectorBasePay: {}, jobLevelMultipliers: {} });
        return message.reply({ embeds: [successEmbed(message.author, "Reset Complete", "All job salaries restored to default values.")] });
    }

    // Info/Default
    const config = await prisma.guildConfig.findUnique({ where: { guildId: message.guild.id } });
    const sectors = (config?.jobSectorBasePay as Record<string, number>) || {};
    const levels = (config?.jobLevelMultipliers as Record<string, number>) || {};
    const p = config?.prefix || "!";

    let sectorText = "Default (Code Defined)";
    if (Object.keys(sectors).length > 0) {
        sectorText = Object.entries(sectors).map(([k, v]) => `**${k}**: ${v}`).join("\n");
    }

    let levelText = "Default (1.0x)";
    if (Object.keys(levels).length > 0) {
        levelText = Object.entries(levels).map(([k, v]) => `**${k}**: ${v}x`).join("\n");
    }

    const embed = new EmbedBuilder()
        .setTitle(`${Mascot.Emotes.JobWorking} Job Salary Configuration`)
        .setDescription("Customize how much jobs pay on this server.\n`Final Pay = Sector Base * Level Multiplier`")
        .addFields(
            { name: "Sector Base Pay", value: sectorText, inline: true },
            { name: "Level Multipliers", value: levelText, inline: true },
            { name: "Commands", value: `\`set-sector <sec> <amt>\`\n\`set-level <lvl> <x>\`\n\`reset\`` },
            { name: "Example", value: `\`${p}config-jobs set-sector tech 3000\`\n\`${p}config-jobs set-level Junior 1.2\`` }
        )
        .setColor(Mascot.Colors.Base as any);

    return message.reply({ embeds: [embed] });
}
