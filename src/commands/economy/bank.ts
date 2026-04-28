import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    GuildMember,
    Message,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    SectionBuilder,
    TextDisplayBuilder,
} from "discord.js";
import { getFinancialSummary, repayLoan, calculateCreditLimits } from "../../services/bankingService";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency, formatDuration, parseSmartAmount } from "../../utils/format";
import { ensureUserAndWallet } from "../../services/walletService";
import { Mascot } from "../../config/branding";

const BANK_ACCENT_COLOR = 0x9B59B6;

export const data = {
    name: "bank",
    description: "Manage your finances: Loans, Investments, and Credit Score.",
};

type FinancialSummary = Awaited<ReturnType<typeof getFinancialSummary>>;

export function buildBankMessageContainer(title: string, body: string, accentColor = BANK_ACCENT_COLOR) {
    return new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}`),
            new TextDisplayBuilder().setContent(body),
        );
}

function buildBankHeaderSection(title: string, subtitle: string, avatarUrl: string) {
    return new SectionBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}`),
            new TextDisplayBuilder().setContent(subtitle),
        )
        .setThumbnailAccessory(
            new ThumbnailBuilder()
                .setURL(avatarUrl)
                .setDescription(`${title} avatar`),
        );
}

export function buildBankMainContainer(
    displayName: string,
    avatarUrl: string,
    summary: FinancialSummary,
    config: Awaited<ReturnType<typeof getGuildConfig>>,
) {
    const oldestLoan = summary.activeLoans.length > 0 ? summary.activeLoans[0] : null;

    return new ContainerBuilder()
        .setAccentColor(BANK_ACCENT_COLOR)
        .addSectionComponents(
            buildBankHeaderSection(
                `${displayName}'s Financial Dashboard`,
                `Welcome to the ${config.currencyName} Bank. Manage your assets and liabilities here.`,
                avatarUrl,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${Mascot.Emotes.Money} Net Worth\n${config.currencyEmoji} ${summary.netWorth.toLocaleString("en-US")}`,
            ),
            new TextDisplayBuilder().setContent(
                `### ${Mascot.Emotes.Credit} Credit Score\n${summary.creditScore}`,
            ),
            new TextDisplayBuilder().setContent(
                `### ${config.currencyEmoji} Active Loans\n${summary.activeLoans.length > 0
                    ? `${summary.activeLoans.length} active${oldestLoan ? `\nOldest due: <t:${Math.floor(oldestLoan.dueDate.getTime() / 1000)}:R>` : ""}`
                    : "None"}`,
            ),
            new TextDisplayBuilder().setContent(
                `### ${Mascot.Emotes.Think} Investments\n${summary.investments.length} active`,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("bank_deposit_withdraw")
                    .setLabel("Deposit/Withdraw")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(config.currencyEmoji),
                new ButtonBuilder()
                    .setCustomId("bank_loans")
                    .setLabel("Loans")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(Mascot.Emotes.Credit),
                new ButtonBuilder()
                    .setCustomId("bank_invest")
                    .setLabel("Investments")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(Mascot.Emotes.Graph),
                new ButtonBuilder()
                    .setCustomId("bank_refresh")
                    .setLabel("Refresh")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(Mascot.Emotes.Refresh),
            ),
        );
}

export function buildBankLoansContainer(
    displayName: string,
    avatarUrl: string,
    summary: FinancialSummary,
    config: Awaited<ReturnType<typeof getGuildConfig>>,
) {
    const isLoanSystemEnabled = !((config as any).disabledCommands && (config as any).disabledCommands.includes("loan"));
    const limits = calculateCreditLimits(summary.creditScore, config as any);
    const maxLoans = (config as any).maxActiveLoans || 1;
    const anyOverdue = summary.activeLoans.some((loan) => new Date() > new Date(loan.dueDate));
    const accentColor = anyOverdue ? 0xE74C3C : (summary.activeLoans.length > 0 ? 0xF39C12 : 0x2ECC71);
    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addSectionComponents(
            buildBankHeaderSection(
                `${displayName}'s Loan Management`,
                `Credit Score: **${summary.creditScore}**\nMax Loan: **${fmtCurrency(limits.maxLoan, config.currencyEmoji)}**\nMax Duration: **${formatDuration(limits.maxDays * 86400000)}**`,
                avatarUrl,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        );

    if (summary.activeLoans.length > 0) {
        summary.activeLoans.forEach((loan, index) => {
            const isOverdue = new Date() > new Date(loan.dueDate);
            const status = isOverdue ? "OVERDUE" : "Active";
            const dueTimestamp = Math.floor(loan.dueDate.getTime() / 1000);
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### Loan #${index + 1} (${status})\nPrincipal: **${fmtCurrency(loan.amount, config.currencyEmoji)}**\nRepayment: **${fmtCurrency(loan.totalRepayment, config.currencyEmoji)}**\nDue: <t:${dueTimestamp}:R> (${loan.dueDate.toLocaleDateString()})`,
                ),
            );

            if (index < summary.activeLoans.length - 1) {
                container.addSeparatorComponents(
                    new SeparatorBuilder()
                        .setDivider(true)
                        .setSpacing(SeparatorSpacingSize.Small),
                );
            }
        });
    } else if ((summary as any).isLoanBanned) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`You are banned from taking loans. Contact an administrator if this seems incorrect.`),
        );
    } else if (!isLoanSystemEnabled) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`Loan system is currently disabled. New loans cannot be taken right now.`),
        );
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`You are eligible for a loan based on your credit score.\nInterest Rate: **${config.loanInterestRate}%**`),
        );
    }

    const row = new ActionRowBuilder<ButtonBuilder>();
    if (summary.activeLoans.length < maxLoans && isLoanSystemEnabled && !(summary as any).isLoanBanned) {
        row.addComponents(
            new ButtonBuilder().setCustomId("loan_apply_btn").setLabel("Apply for Loan").setStyle(ButtonStyle.Success),
        );
    }
    if (summary.activeLoans.length > 0) {
        row.addComponents(
            new ButtonBuilder().setCustomId("loan_repay_btn").setLabel("Repay Loan").setStyle(ButtonStyle.Primary),
        );
    }
    row.addComponents(
        new ButtonBuilder().setCustomId("bank_main_btn").setLabel("Back").setStyle(ButtonStyle.Secondary),
    );

    return container
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(row);
}

export function buildBankInvestmentsContainer(
    displayName: string,
    avatarUrl: string,
    summary: FinancialSummary,
    config: Awaited<ReturnType<typeof getGuildConfig>>,
) {
    const container = new ContainerBuilder()
        .setAccentColor(0x2ECC71)
        .addSectionComponents(
            buildBankHeaderSection(
                `${displayName}'s Investment Portfolio`,
                `Grow your wealth with Fixed Deposits and Recurring Deposits.\nFD Rate: **${config.fdInterestRate}%**\nRD Rate: **${config.rdInterestRate}%**`,
                avatarUrl,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `Fixed Deposit: lock a lump sum for a set time.\nRecurring Deposit: lock funds on the recurring deposit track.\nMatured funds are returned to your bank with interest.`,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        );

    if (summary.investments.length > 0) {
        summary.investments.forEach((investment, index) => {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${investment.type}\n${config.currencyEmoji} ${investment.amount.toLocaleString("en-US")}\nMatures: ${investment.maturityDate.toLocaleDateString()}`,
                ),
            );

            if (index < summary.investments.length - 1) {
                container.addSeparatorComponents(
                    new SeparatorBuilder()
                        .setDivider(true)
                        .setSpacing(SeparatorSpacingSize.Small),
                );
            }
        });
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`No active investments.`),
        );
    }

    return container
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("invest_new_btn").setLabel("New Investment").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("invest_collect_btn").setLabel("Collect Matured").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("bank_main_btn").setLabel("Back").setStyle(ButtonStyle.Secondary),
            ),
        );
}

export async function execute(message: Message | any, args: string[]) {
    const user = message.author || message.user;
    const guildId = message.guildId;
    if (!user || !guildId) return;
    const member = message.member as GuildMember | undefined;
    const displayName = member?.displayName || user.globalName || user.username;
    const avatarUrl = user.displayAvatarURL();

    const config = await getGuildConfig(guildId);
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "repay") {
        const amountStr = args[1];
        if (!amountStr) {
            return message.reply({
                components: [
                    buildBankMessageContainer("Bank Repayment", `Usage: \`${config.prefix}bank repay <amount>\``),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const userWallet = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
        const amount = parseSmartAmount(amountStr, userWallet.wallet!.balance);
        if (isNaN(amount) || amount <= 0) {
            return message.reply({
                components: [
                    buildBankMessageContainer("Bank Repayment", "Invalid amount.", 0xE74C3C),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        try {
            await repayLoan(user.id, guildId, amount);
            return message.reply({
                components: [
                    buildBankMessageContainer("Loan Repaid", `Repaid **${fmtCurrency(amount, config.currencyEmoji)}** toward your loan.`, 0x2ECC71),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e) {
            return message.reply({
                components: [
                    buildBankMessageContainer("Repayment Failed", (e as Error).message, 0xE74C3C),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }

    const summary = await getFinancialSummary(user.id, guildId);
    const container = buildBankMainContainer(displayName, avatarUrl, summary, config);

    await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}
