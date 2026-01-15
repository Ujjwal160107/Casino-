"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAddMoney = handleAddMoney;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const walletService_1 = require("../../services/walletService");
const bankService_1 = require("../../services/bankService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const discordLogger_1 = require("../../utils/discordLogger");
const guildConfigService_1 = require("../../services/guildConfigService");
const permissionUtils_1 = require("../../utils/permissionUtils");
const branding_1 = require("../../config/branding");
async function handleAddMoney(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }
    // Cap at 32-bit signed integer max to prevent DB crashes
    const MAX_INT = 2147483647;
    if (args.length < 2) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", "Usage: `!add-money @user/@role <amount> [wallet/bank]`")] });
    }
    const mention = args[0];
    const amountStr = args[1];
    let amount = (0, format_1.parseSmartAmount)(amountStr);
    // Cap amount to prevent DB crashes and handle "Infinity" request
    if (amount === Infinity || amount > MAX_INT) {
        amount = MAX_INT;
    }
    const typeArg = args[2]?.toLowerCase();
    const targetType = typeArg === "bank" ? "bank" : "wallet";
    if (isNaN(amount) || amount <= 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", "Usage: `!add-money @user <amount> [wallet/bank]`")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    // --- ROLE HANDLING ---
    if (mention.startsWith("<@&")) {
        const roleId = mention.replace(/[<@&>]/g, "");
        console.log(`[AddMoney] Processing Role: ${roleId}`);
        const role = await message.guild.roles.fetch(roleId);
        if (!role) {
            console.log(`[AddMoney] Role not found for ID: ${roleId}`);
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Role Not Found", "Could not find that role.")] });
        }
        // Ensure members are fetched
        console.log("[AddMoney] Fetching guild members...");
        await message.guild.members.fetch();
        console.log(`[AddMoney] Role Members Size: ${role.members.size}`);
        const statusMsg = await message.reply(`${branding_1.Mascot.Emotes.Refresh} Processing payment to **${role.members.size}** members...`);
        let count = 0;
        // Helper function for batch processing
        const processMember = async (member) => {
            if (member.user.bot)
                return;
            try {
                console.log(`[AddMoney] Processing member: ${member.user.tag} (${member.id})`);
                const target = await (0, walletService_1.ensureUserAndWallet)(member.id, message.guildId, member.user.username);
                if (targetType === "bank") {
                    const bank = await (0, bankService_1.ensureBankForUser)(target.id);
                    await prisma_1.default.$transaction([
                        prisma_1.default.transaction.create({
                            data: { walletId: target.wallet.id, amount, type: "admin_add_bank", meta: { by: message.author.id, role: role.name }, isEarned: false }
                        }),
                        prisma_1.default.bank.update({ where: { id: bank.id }, data: { balance: { increment: amount } } })
                    ]);
                }
                else {
                    await prisma_1.default.$transaction([
                        prisma_1.default.transaction.create({
                            data: { walletId: target.wallet.id, amount, type: "admin_add", meta: { by: message.author.id, role: role.name }, isEarned: false }
                        }),
                        prisma_1.default.wallet.update({ where: { id: target.wallet.id }, data: { balance: { increment: amount } } })
                    ]);
                }
                count++;
            }
            catch (e) {
                console.error(`Failed to add money to ${member.user.tag}:`, e);
            }
        };
        const members = Array.from(role.members.values());
        // batch in simple parallel
        await Promise.all(members.map(processMember));
        console.log(`[AddMoney] Finished. Count: ${count}`);
        return statusMsg.edit({
            content: "",
            embeds: [(0, embed_1.successEmbed)(message.author, "Role Payment Complete", `Added **${(0, format_1.fmtCurrency)(amount, emoji)}** to **${count}** users in **${role.name}** (**${targetType === "bank" ? "Bank" : "Wallet"}**).`)]
        });
    }
    // --- SINGLE USER HANDLING ---
    const discordId = mention.replace(/[<@!>]/g, "");
    const target = await (0, walletService_1.ensureUserAndWallet)(discordId, message.guildId, "Unknown");
    if (targetType === "bank") {
        const bank = await (0, bankService_1.ensureBankForUser)(target.id);
        const [_, updatedBank] = await prisma_1.default.$transaction([
            prisma_1.default.transaction.create({
                data: {
                    walletId: target.wallet.id,
                    amount,
                    type: "admin_add_bank",
                    meta: { by: message.author.id },
                    isEarned: false
                }
            }),
            prisma_1.default.bank.update({
                where: { id: bank.id },
                data: { balance: { increment: amount } }
            }),
            prisma_1.default.audit.create({
                data: {
                    guildId: message.guildId ?? undefined,
                    userId: target.id,
                    type: "admin_add",
                    meta: { amount, target: "bank", by: message.author.id }
                }
            })
        ]);
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Money Added (Bank)",
            description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Amount:** +${(0, format_1.fmtCurrency)(amount, emoji)}\n**New Bank Balance:** ${(0, format_1.fmtCurrency)(updatedBank.balance, emoji)}`,
            color: 0x00FF00
        });
        const displayAmount = amount === MAX_INT ? "Infinity" : (0, format_1.fmtCurrency)(amount, emoji);
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Money Added", `Added **${displayAmount}** to ${mention}'s **Bank**.\nNew Balance: **${(0, format_1.fmtCurrency)(updatedBank.balance, emoji)}**`)]
        });
    }
    else {
        const [_, updatedWallet] = await prisma_1.default.$transaction([
            prisma_1.default.transaction.create({
                data: {
                    walletId: target.wallet.id,
                    amount,
                    type: "admin_add",
                    meta: { by: message.author.id },
                    isEarned: false
                }
            }),
            prisma_1.default.wallet.update({
                where: { id: target.wallet.id },
                data: { balance: { increment: amount } }
            }),
            prisma_1.default.audit.create({
                data: {
                    guildId: message.guildId ?? undefined,
                    userId: target.id,
                    type: "admin_add",
                    meta: { amount, target: "wallet", by: message.author.id }
                }
            })
        ]);
        if (updatedWallet) {
            await (0, discordLogger_1.logToChannel)(message.client, {
                guild: message.guild,
                type: "ADMIN",
                title: "Money Added (Wallet)",
                description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Amount:** +${(0, format_1.fmtCurrency)(amount, emoji)}\n**New Wallet Balance:** ${(0, format_1.fmtCurrency)(updatedWallet.balance, emoji)}`,
                color: 0x00FF00
            });
            const displayAmount = amount === MAX_INT ? "Infinity" : (0, format_1.fmtCurrency)(amount, emoji);
            return message.reply({
                embeds: [(0, embed_1.successEmbed)(message.author, "Money Added", `Added **${displayAmount}** to ${mention}'s **Wallet**.\nNew Balance: **${(0, format_1.fmtCurrency)(updatedWallet.balance, emoji)}**`)]
            });
        }
    }
}
//# sourceMappingURL=addMoney.js.map