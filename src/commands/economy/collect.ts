import { Message, EmbedBuilder } from "discord.js";
import { claimRoleIncome } from "../../services/roleIncomeService";
import { ensureBankForUser } from "../../services/bankService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, infoEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { sendPaginatedEmbed } from "../../utils/pagination";

export async function handleCollectRoleIncome(message: Message, args: string[]) {
    if (!message.guild || !message.member) return;

    await ensureBankForUser(message.author.id, message.guild.id);
    const config = await getGuildConfig(message.guild.id);
    const roleIds = message.member.roles.cache.map(r => r.id);

    try {
        const result = await claimRoleIncome(message.author.id, message.guild.id, roleIds);

        // Case 1: Success (Claimed something)
        if (result.totalClaimed > 0) {
            const details = result.details.map(d => {
                // Find next claim time for this specific role from "status" array
                const stat = result.status.find(s => s.roleId === d.roleId);
                const nextTime = stat?.nextClaimAt ? Math.floor(stat.nextClaimAt.getTime() / 1000) : Math.floor(Date.now() / 1000) + 86400;

                return `• <@&${d.roleId}>: ${fmtCurrency(d.amount, config.currencyEmoji)}\n  Next Claim: <t:${nextTime}:F> (<t:${nextTime}:R>)`;
            }).join("\n\n");

            await logToChannel(message.client, {
                guild: message.guild!,
                type: "ECONOMY",
                title: "Income Collected",
                description: `**User:** ${message.author.tag}\n**Total:** ${fmtCurrency(result.totalClaimed, config.currencyEmoji)}`,
                color: 0x00FF00
            });

            // For claimed items, we assume list isn't huge (usually claiming all at once).
            // But if > 5 claimed, we could paginate too, but success usually fits in one unless crazy.
            // Let's keep success simple for now as per request focusing on "when is their next role income claimable".
            const embed = successEmbed(message.author, "Income Collected!", `You collected a total of **${fmtCurrency(result.totalClaimed, config.currencyEmoji)}**!\n\n${details}`);
            return message.reply({ embeds: [embed] });
        }

        // Case 2: No Income Claimed (Show Next Claim Times)
        if (!result.status || result.status.length === 0) {
            return message.reply({ embeds: [infoEmbed(message.author, "Role Income", "You have no collectible role income configured for your roles.")] });
        }

        // Create status list
        // Filter out AUTOMATIC incomes if they ended up here (service handles it but safety check)
        // result.status only contains eligible COLLECTIBLE ones as per our service update.

        const statusItems = result.status.map(s => {
            const ts = Math.floor(s.nextClaimAt.getTime() / 1000);
            return {
                roleId: s.roleId,
                text: `**Role:** <@&${s.roleId}>\n**Amount:** ${fmtCurrency(s.amount, config.currencyEmoji)}\n**Next Claim:** <t:${ts}:F> (<t:${ts}:R>)`
            };
        });

        const ITEMS_PER_PAGE = 5;
        const totalPages = Math.ceil(statusItems.length / ITEMS_PER_PAGE);

        if (statusItems.length <= ITEMS_PER_PAGE) {
            // Single Page
            const embed = infoEmbed(message.author, "Role Income Status", "You have no income to collect right now.\nHere is when you can claim next:");
            statusItems.forEach(item => {
                embed.addFields({ name: "\u200b", value: item.text });
            });
            return message.reply({ embeds: [embed] });
        } else {
            // Pagination
            const embeds = [];
            for (let i = 0; i < totalPages; i++) {
                const embed = infoEmbed(message.author, "Role Income Status", `Page ${i + 1}/${totalPages}\nYou have no income to collect right now.\nHere is when you can claim next:`);
                const pageItems = statusItems.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
                pageItems.forEach(item => {
                    embed.addFields({ name: "\u200b", value: item.text });
                });
                embeds.push(embed);
            }
            await sendPaginatedEmbed(message, embeds);
        }

    } catch (err) {
        return message.reply(`Error collecting income: ${(err as Error).message}`);
    }
}
