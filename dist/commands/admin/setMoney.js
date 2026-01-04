"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetMoney = handleSetMoney;
const prisma_1 = __importDefault(require("../../utils/prisma"));
const walletService_1 = require("../../services/walletService");
const bankService_1 = require("../../services/bankService");
const embed_1 = require("../../utils/embed");
const format_1 = require("../../utils/format");
const discordLogger_1 = require("../../utils/discordLogger");
const guildConfigService_1 = require("../../services/guildConfigService");
const permissionUtils_1 = require("../../utils/permissionUtils");
async function handleSetMoney(message, args) {
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Access Denied", "You need Administrator or Bot Commander permissions.")] });
    }
    if (args.length < 2) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", "Usage: `!set-money @user <amount> [wallet/bank]`")] });
    }
    const mention = args[0];
    const amountStr = args[1];
    const amount = (0, format_1.parseSmartAmount)(amountStr);
    const typeArg = args[2]?.toLowerCase();
    const targetType = typeArg === "bank" ? "bank" : "wallet";
    if (isNaN(amount) || amount < 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", "Please specify a valid positive amount (0 or more).")] });
    }
    const config = await (0, guildConfigService_1.getGuildConfig)(message.guildId);
    const emoji = config.currencyEmoji;
    const discordId = mention.replace(/[<@!>]/g, "");
    const target = await (0, walletService_1.ensureUserAndWallet)(discordId, message.guildId, "Unknown");
    if (targetType === "bank") {
        const bank = await (0, bankService_1.ensureBankForUser)(target.id);
        const oldBalance = bank.balance;
        const [_, updatedBank] = await prisma_1.default.$transaction([
            prisma_1.default.transaction.create({
                data: {
                    walletId: target.wallet.id,
                    amount: amount - oldBalance, // The "change" amount for the transaction log
                    type: "admin_set_bank",
                    meta: { by: message.author.id, oldBalance, newBalance: amount },
                    isEarned: false
                }
            }),
            prisma_1.default.bank.update({
                where: { id: bank.id },
                data: { balance: amount }
            }),
            prisma_1.default.audit.create({
                data: {
                    guildId: message.guildId ?? undefined,
                    userId: target.id,
                    type: "admin_set_money",
                    meta: { amount, oldBalance, target: "bank", by: message.author.id }
                }
            })
        ]);
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Money Set (Bank)",
            description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Old Balance:** ${(0, format_1.fmtCurrency)(oldBalance, emoji)}\n**New Balance:** ${(0, format_1.fmtCurrency)(updatedBank.balance, emoji)}`,
            color: 0xFFA500
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Money Set", `Set ${mention}'s **Bank** balance to **${(0, format_1.fmtCurrency)(updatedBank.balance, emoji)}**.`)]
        });
    }
    else {
        // Wallet
        const oldBalance = target.wallet.balance;
        const [_, updatedWallet] = await prisma_1.default.$transaction([
            prisma_1.default.transaction.create({
                data: {
                    walletId: target.wallet.id,
                    amount: amount - oldBalance,
                    type: "admin_set_wallet",
                    meta: { by: message.author.id, oldBalance, newBalance: amount },
                    isEarned: false
                }
            }),
            prisma_1.default.wallet.update({
                where: { id: target.wallet.id },
                data: { balance: amount }
            }),
            prisma_1.default.audit.create({
                data: {
                    guildId: message.guildId ?? undefined,
                    userId: target.id,
                    type: "admin_set_money",
                    meta: { amount, oldBalance, target: "wallet", by: message.author.id }
                }
            })
        ]);
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ADMIN",
            title: "Money Set (Wallet)",
            description: `**Admin:** ${message.author.tag} (${message.author.id})\n**Target:** <@${target.discordId}>\n**Old Balance:** ${(0, format_1.fmtCurrency)(oldBalance, emoji)}\n**New Balance:** ${(0, format_1.fmtCurrency)(updatedWallet.balance, emoji)}`,
            color: 0xFFA500
        });
        return message.reply({
            embeds: [(0, embed_1.successEmbed)(message.author, "Money Set", `Set ${mention}'s **Wallet** balance to **${(0, format_1.fmtCurrency)(updatedWallet.balance, emoji)}**.`)]
        });
    }
}
//# sourceMappingURL=setMoney.js.map