import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import { getGuildConfig } from "../../services/guildConfigService";
import { checkCooldown, getCooldownExpiry } from "../../utils/cooldown";
import { successEmbed, errorEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";

export async function handleRob(message: Message, args: string[]) {
    const targetUser = message.mentions.members?.first();
    if (!targetUser) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Mention a user to rob.")] });
    if (targetUser.id === message.author.id) return message.reply({ embeds: [errorEmbed(message.author, "Error", "You cannot rob yourself.")] });
    if (targetUser.user.bot) return message.reply({ embeds: [errorEmbed(message.author, "Error", "Bots are broke.")] });
    const config = await getGuildConfig(message.guildId!);
    const emoji = config.currencyEmoji;
    const cdKey = `rob:${message.guildId}:${message.author.id}`;

    const remaining = checkCooldown(cdKey, config.robCooldown);
    if (remaining > 0) {
        const expire = getCooldownExpiry(cdKey);
        const ts = expire ? Math.floor(expire / 1000) : Math.floor(Date.now() / 1000 + remaining);

        // Custom cooldown embed with Angry thumbnail
        const embed = errorEmbed(message.author, "Cooldown", `Wait <t:${ts}:R>.`);
        // errorEmbed sets Fail thumbnail by default. We want Angry.
        const angryUrl = getEmoteUrl(Mascot.Emotes.Angry);
        if (angryUrl) embed.setThumbnail(angryUrl);

        return message.reply({ embeds: [embed] });
    }
    const isImmune = targetUser.roles.cache.some(r => config.robImmuneRoles.includes(r.id));
    if (isImmune) return message.reply({ embeds: [errorEmbed(message.author, "Failed", `**${targetUser.displayName}** is immune!`)] });
    const robber = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
    const victim = await ensureUserAndWallet(targetUser.id, message.guildId!, targetUser.user.tag);
    if (!victim.wallet || victim.wallet.balance <= 0) {
        return message.reply({ embeds: [errorEmbed(message.author, "Failed", "Target has no money.")] });
    }
    const roll = Math.random() * 100;
    if (roll < config.robSuccessPct) {
        const percent = Math.floor(Math.random() * 41) + 10;
        const robAmount = Math.floor((victim.wallet.balance * percent) / 100);
        await prisma.$transaction([prisma.wallet.update({ where: { id: victim.wallet.id }, data: { balance: { decrement: robAmount } } }), prisma.transaction.create({ data: { walletId: victim.wallet.id, amount: -robAmount, type: "robbed_by", meta: { robber: robber.discordId } } }), prisma.wallet.update({ where: { id: robber.wallet!.id }, data: { balance: { increment: robAmount } } }), prisma.transaction.create({ data: { walletId: robber.wallet!.id, amount: robAmount, type: "rob_win", meta: { victim: victim.discordId }, isEarned: true } })]);
        return message.reply({ embeds: [successEmbed(message.author, "Robbery Successful! 🥷", `${Mascot.Emotes.Money} Stole **${fmtCurrency(robAmount, emoji)}** from **${targetUser.displayName}**!`)] });
    } else {
        let fineAmount = Math.max(Math.floor((robber.wallet!.balance * config.robFinePct) / 100), 50);
        let msg = `You paid a fine of **${fmtCurrency(fineAmount, emoji)}**.`;

        // PERK: Legal Partner (10% Discount)
        if (robber.jobId === "law_partner") {
            const discount = Math.floor(fineAmount * 0.10);
            fineAmount -= discount;
            msg = `You paid a fine of **${fmtCurrency(fineAmount, emoji)}**.\n(⚖️ **Legal Partner Discount**: -${fmtCurrency(discount, emoji)})`;
        }

        await prisma.$transaction([prisma.wallet.update({ where: { id: robber.wallet!.id }, data: { balance: { decrement: fineAmount } } }), prisma.transaction.create({ data: { walletId: robber.wallet!.id, amount: -fineAmount, type: "rob_fine", meta: { victim: victim.discordId } } })]);
        return message.reply({ embeds: [errorEmbed(message.author, "Caught! 🚔", msg)] });
    }
}