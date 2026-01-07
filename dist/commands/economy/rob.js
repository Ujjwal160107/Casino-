"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRob = handleRob;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const walletService_1 = require("../../services/walletService");
const guildConfigService_1 = require("../../services/guildConfigService");
const cooldown_1 = require("../../utils/cooldown");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const branding_1 = require("../../config/branding");
const jailService_1 = require("../../services/jailService");
async function handleRob(message, args) {
    const targetUser = message.mentions.members?.first();
    if (!targetUser)
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Mention a user to rob.")] });
    if (targetUser.id === message.author.id)
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "You cannot rob yourself.")] });
    if (targetUser.user.bot)
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Error", "Bots are broke.")] });
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const cdKey = `rob:${message.guildId}:${message.author.id}`;
    const remaining = (0, cooldown_1.checkCooldown)(cdKey, config.robCooldown);
    if (remaining > 0) {
        const expire = (0, cooldown_1.getCooldownExpiry)(cdKey);
        const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);
        // Custom cooldown embed with Angry thumbnail
        const embed = (0, embed_1.errorEmbed)(message.author, "Cooldown", `Wait <t:${ts}:R>.`);
        // errorEmbed sets Fail thumbnail by default. We want Angry.
        const angryUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Angry);
        if (angryUrl)
            embed.setThumbnail(angryUrl);
        return message.reply({ embeds: [embed] });
    }
    const isImmune = targetUser.roles.cache.some(r => config.robImmuneRoles.includes(r.id));
    if (isImmune)
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Failed", `**${targetUser.displayName}** is immune!`)] });
    const robber = await (0, walletService_1.ensureUserAndWallet)(message.author.id, message.guildId, message.author.tag);
    const victim = await (0, walletService_1.ensureUserAndWallet)(targetUser.id, message.guildId, targetUser.user.tag);
    if (!victim.wallet || victim.wallet.balance <= 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Failed", "Target has no money.")] });
    }
    const roll = Math.random() * 100;
    if (roll < config.robSuccessPct) {
        const percent = Math.floor(Math.random() * 41) + 10;
        const robAmount = Math.floor((victim.wallet.balance * percent) / 100);
        await prisma_1.default.$transaction([prisma_1.default.wallet.update({ where: { id: victim.wallet.id }, data: { balance: { decrement: robAmount } } }), prisma_1.default.transaction.create({ data: { walletId: victim.wallet.id, amount: -robAmount, type: "robbed_by", meta: { robber: robber.discordId } } }), prisma_1.default.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { increment: robAmount } } }), prisma_1.default.transaction.create({ data: { walletId: robber.wallet.id, amount: robAmount, type: "rob_win", meta: { victim: victim.discordId }, isEarned: true } })]);
        return message.reply({ embeds: [(0, embed_1.successEmbed)(message.author, "Robbery Successful! 🥷", `${branding_1.Mascot.Emotes.Money} Stole **${(0, format_1.fmtCurrency)(robAmount, emoji)}** from **${targetUser.displayName}**!`)] });
    }
    else {
        const releaseTime = await (0, jailService_1.jailUser)(robber.id, message.guildId);
        let fineAmount = Math.max(Math.floor((robber.wallet.balance * config.robFinePct) / 100), 50);
        let msg = `You paid a fine of **${(0, format_1.fmtCurrency)(fineAmount, emoji)}** and have been **sent to jail**!`;
        // PERK: Legal Partner (10% Discount)
        if (robber.jobId === "law_partner") {
            const discount = Math.floor(fineAmount * 0.10);
            fineAmount -= discount;
            msg = `You paid a fine of **${(0, format_1.fmtCurrency)(fineAmount, emoji)}** and have been **sent to jail**!\n(⚖️ **Legal Partner Discount**: -${(0, format_1.fmtCurrency)(discount, emoji)})`;
        }
        msg += `\n\n👮 **Sentence:** <t:${Math.floor(releaseTime.getTime() / 1000)}:R>`;
        await prisma_1.default.$transaction([prisma_1.default.wallet.update({ where: { id: robber.wallet.id }, data: { balance: { decrement: fineAmount } } }), prisma_1.default.transaction.create({ data: { walletId: robber.wallet.id, amount: -fineAmount, type: "rob_fine", meta: { victim: victim.discordId } } })]);
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Caught! 🚔", msg)] });
    }
}
//# sourceMappingURL=rob.js.map