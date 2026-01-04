"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetEconomyConfig = handleSetEconomyConfig;
const format_1 = require("../../utils/format");
const guildConfigService_1 = require("../../services/guildConfigService");
const embed_1 = require("../../utils/embed");
const permissionUtils_1 = require("../../utils/permissionUtils");
const discordLogger_1 = require("../../utils/discordLogger");
async function handleSetEconomyConfig(message, args, type) {
    if (!message.guild)
        return;
    if (!message.member || !(await (0, permissionUtils_1.canExecuteAdminCommand)(message, message.member))) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Permission Denied", "You need Administrator or Bot Commander permissions to use this command.")] });
    }
    const valueStr = args[0];
    const value = (0, format_1.parseSmartAmount)(valueStr);
    if (isNaN(value) || value < 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Value", "Please provide a valid positive number.")] });
    }
    let field = "";
    let name = "";
    let suffix = "";
    switch (type) {
        case "loan":
            field = "loanInterestRate";
            name = "Loan Interest Rate";
            suffix = "%";
            break;
        case "fd":
            field = "fdInterestRate";
            name = "Fixed Deposit (FD) Rate";
            suffix = "%";
            break;
        case "rd":
            field = "rdInterestRate";
            name = "Recurring Deposit (RD) Rate";
            suffix = "%";
            break;
        case "tax":
            field = "marketTax";
            name = "Black Market Tax";
            suffix = "%";
            break;
        case "credit-reward":
            field = "creditScoreReward";
            name = "Credit Score Reward (On-Time repayment)";
            suffix = " pts";
            break;
        case "credit-penalty":
            field = "creditScorePenalty";
            name = "Credit Score Penalty (Late repayment)";
            suffix = " pts";
            break;
        case "credit-cap":
            field = "maxCreditScore";
            name = "Max Credit Score Cap";
            suffix = " pts";
            break;
        case "min-credit-cap":
            field = "minCreditScore";
            name = "Min Credit Score Cap";
            suffix = " pts";
            break;
        case "max-loans":
            if (value < 1)
                return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Limit", "Max active loans must be at least 1.")] });
            field = "maxActiveLoans";
            name = "Max Active Loans";
            suffix = "";
            break;
        case "bank-limit":
            field = "bankLimit";
            name = "Bank Capacity Limit";
            suffix = "";
            break;
        case "wallet-limit":
            field = "walletLimit";
            name = "Wallet Capacity Limit";
            suffix = "";
            break;
        case "daily-amount":
            field = "dailyAmount";
            name = "Daily Reward Amount";
            suffix = "";
            break;
        case "weekly-amount":
            field = "weeklyAmount";
            name = "Weekly Reward Amount";
            suffix = "";
            break;
        case "monthly-amount":
            field = "monthlyAmount";
            name = "Monthly Reward Amount";
            suffix = "";
            break;
    }
    await (0, guildConfigService_1.updateGuildConfig)(message.guild.id, { [field]: value });
    await (0, discordLogger_1.logToChannel)(message.client, {
        guild: message.guild,
        type: "ADMIN",
        title: "Economy Config Updated",
        description: `**Setting:** ${name}\n**New Value:** ${value}${suffix}\n**Updated By:** ${message.author.tag}`,
        color: 0xFFA500
    });
    return message.reply({
        embeds: [(0, embed_1.successEmbed)(message.author, "Configuration Updated", `Successfully set **${name}** to **${value}${suffix}**.`)]
    });
}
//# sourceMappingURL=setEconomyConfig.js.map