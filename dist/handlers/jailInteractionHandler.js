"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleJailInteraction = handleJailInteraction;
const jailService_1 = require("../services/jailService");
const walletService_1 = require("../services/walletService");
const embed_1 = require("../utils/embed");
async function handleJailInteraction(interaction) {
    if (!interaction.isButton())
        return;
    if (interaction.customId !== "pay_bail")
        return;
    await interaction.deferReply({ ephemeral: true });
    const user = await (0, walletService_1.ensureUserAndWallet)(interaction.user.id, interaction.guildId, interaction.user.tag);
    const status = await (0, jailService_1.checkJailStatus)(user.id);
    if (!status.isJailed) {
        return interaction.editReply({
            embeds: [(0, embed_1.errorEmbed)(interaction.user, "Not Jailed", "You are not in jail!")]
        });
    }
    const result = await (0, jailService_1.payBail)(user.id, interaction.guildId);
    if (result.success) {
        return interaction.editReply({
            embeds: [(0, embed_1.successEmbed)(interaction.user, "Bail Paid", result.message)]
        });
    }
    else {
        return interaction.editReply({
            embeds: [(0, embed_1.errorEmbed)(interaction.user, "Bail Failed", result.message)]
        });
    }
}
//# sourceMappingURL=jailInteractionHandler.js.map