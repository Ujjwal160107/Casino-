"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAskInteraction = handleAskInteraction;
const discord_js_1 = require("discord.js");
const walletService_1 = require("../services/walletService");
const discordLogger_1 = require("../utils/discordLogger");
const branding_1 = require("../config/branding");
async function handleAskInteraction(interaction) {
    if (!interaction.isButton())
        return;
    if (!interaction.guild)
        return;
    const [action, requesterId, amountStr] = interaction.customId.split(":");
    const mentionMatch = interaction.message.content.match(/<@!?(\d+)>/);
    const targetUserId = mentionMatch ? mentionMatch[1] : null;
    if (!targetUserId || interaction.user.id !== targetUserId) {
        return interaction.reply({ content: `${branding_1.Mascot.Emotes.Decline} This request is not for you.`, ephemeral: true });
    }
    try {
        await interaction.deferUpdate();
        if (action === "ask_decline") {
            const embed = discord_js_1.EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0xFF0000)
                .setFooter({ text: `Declined by ${interaction.user.username}` });
            await interaction.editReply({ components: [], embeds: [embed] });
            await (0, discordLogger_1.logToChannel)(interaction.client, {
                guild: interaction.guild,
                type: "ECONOMY",
                title: "Money Request Declined",
                description: `**From:** <@${requesterId}>\n**To:** ${interaction.user.tag}\n**Amount:** ${amountStr}\n**Status:** Declined`,
                color: 0xFF0000
            });
            return;
        }
        if (action === "ask_accept") {
            const amount = parseInt(amountStr);
            try {
                await (0, walletService_1.transferMoney)(interaction.user.id, requesterId, amount, interaction.guildId);
                const embed = discord_js_1.EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x00FF00)
                    .setFooter({ text: `Accepted by ${interaction.user.username} • Transfer Complete` });
                await interaction.editReply({ components: [], embeds: [embed] });
                await (0, discordLogger_1.logToChannel)(interaction.client, {
                    guild: interaction.guild,
                    type: "ECONOMY",
                    title: "Money Request Accepted",
                    description: `**From:** <@${requesterId}>\n**To:** ${interaction.user.tag}\n**Amount:** ${amount}\n**Status:** Accepted & Transferred`,
                    color: 0x00FF00
                });
            }
            catch (error) {
                if (error.message === "Insufficient funds.") {
                    return interaction.followUp({ content: `${branding_1.Mascot.Emotes.Fail} You do not have enough funds in your **wallet** to fulfill this request.`, ephemeral: true });
                }
                return interaction.followUp({ content: `${branding_1.Mascot.Emotes.Fail} Transfer failed: ${error.message}`, ephemeral: true });
            }
        }
    }
    catch (err) {
        console.error("Ask interaction error:", err);
    }
}
//# sourceMappingURL=askInteractionHandler.js.map