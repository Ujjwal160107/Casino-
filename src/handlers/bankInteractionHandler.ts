import {
    Interaction,
    ButtonInteraction,
    ModalSubmitInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from "discord.js";
import { applyForLoan, repayLoan, createInvestment, getFinancialSummary, checkMaturedInvestments, calculateCreditLimits } from "../services/bankingService";
import { getGuildConfig } from "../services/guildConfigService";
import { safeInteractionReply } from "../utils/interactionHelpers";
import { ensureBankForUser } from "../services/bankService";
import { logToChannel } from "../utils/discordLogger";
import { fmtCurrency, formatDuration } from "../utils/format";
import { Mascot } from "../config/branding";

export async function handleBankInteraction(interaction: Interaction) {
    if (interaction.isButton()) {
        await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
    }
}

async function handleButton(interaction: ButtonInteraction) {
    const { customId, user, guildId } = interaction;
    if (!guildId) return;

    switch (customId) {
        case "bank_refresh": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const embed = new EmbedBuilder()
                .setTitle(`<:bankk:1445689134181126167> ${user.username}'s Financial Dashboard`)
                .setColor("#FFD700")
                .setDescription(`Welcome to the ${config.currencyName} Bank.`)
                .addFields(
                    { name: "<:MoneyBag:1446970451606896781> Net Worth", value: `${config.currencyEmoji} ${summary.netWorth.toLocaleString('en-US')}`, inline: true },
                    { name: "<a:credits:1445689337172721716> Credit Score", value: `${summary.creditScore}`, inline: true },
                    {
                        name: "<:OnLoan:1446971056865935381> Active Loans", value: summary.activeLoans.length > 0
                            ? `**${summary.activeLoans.length} Active**\nOldest due: <t:${Math.floor(summary.activeLoans[0].dueDate.getTime() / 1000)}:R>`
                            : "None", inline: true
                    },
                    { name: "<:graph:1445689267861979197> Investments", value: `${summary.investments.length} Active`, inline: true }
                );
            await interaction.update({ embeds: [embed] });
            break;
        }
        case "bank_loans": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const isLoanSystemEnabled = !((config as any).disabledCommands && (config as any).disabledCommands.includes("loan"));
            const limits = calculateCreditLimits(summary.creditScore, (config as any));

            const embed = new EmbedBuilder()
                .setTitle("<a:credits:1445689337172721716> Loan Management")
                .setColor(summary.activeLoans.length > 0 ? "#FFA500" : "#00FF00")
                .addFields(
                    { name: "Credit Score", value: `**${summary.creditScore}**`, inline: true },
                    { name: "Max Loan", value: `${fmtCurrency(limits.maxLoan, config.currencyEmoji)}`, inline: true },
                    { name: "Max Duration", value: `${formatDuration(limits.maxDays * 86400000)}`, inline: true }
                );

            if (summary.activeLoans.length > 0) {
                const loanFields = summary.activeLoans.map((loan, i) => {
                    const isOverdue = new Date() > new Date(loan.dueDate);
                    const status = isOverdue ? "**OVERDUE**" : "Active";
                    const dueTimestamp = Math.floor(loan.dueDate.getTime() / 1000);
                    return {
                        name: `Loan #${i + 1} (${status})`,
                        value: `**Principal:** ${fmtCurrency(loan.amount, config.currencyEmoji)}\n**Repayment:** ${fmtCurrency(loan.totalRepayment, config.currencyEmoji)}\n**Due:** <t:${dueTimestamp}:R> (${loan.dueDate.toLocaleDateString()})`,
                        inline: false
                    };
                });
                const maxLoans = (config as any).maxActiveLoans || 1;
                embed.setDescription(`**Active Loans (${summary.activeLoans.length}/${maxLoans})**\nRepayments are applied to the oldest loan first.`)
                    .addFields(loanFields);
                const anyOverdue = summary.activeLoans.some(l => new Date() > new Date(l.dueDate));
                if (anyOverdue) embed.setColor("#FF0000");
            } else {
                if (isLoanSystemEnabled) {
                    if ((summary as any).isLoanBanned) {
                        embed.setDescription(`🚫 **You are banned from taking loans.**\nIf you believe this is a mistake, contact an administrator.`);
                        embed.setColor("#FF0000");
                    } else {
                        embed.setDescription(`You are eligible for a loan based on your credit score.\n**Interest Rate:** ${config.loanInterestRate}%`);
                    }
                } else {
                    embed.setDescription(`🚫 **Loan System is currently Disabled**\nNew loans cannot be taken at this time.`);
                    embed.setColor("#808080");
                }
            }

            const row = new ActionRowBuilder<ButtonBuilder>();
            const maxLoans = config.maxActiveLoans || 1;
            if (summary.activeLoans.length < maxLoans && isLoanSystemEnabled && !(summary as any).isLoanBanned) {
                row.addComponents(
                    new ButtonBuilder().setCustomId("loan_apply_btn").setLabel("Apply for Loan").setStyle(ButtonStyle.Success)
                );
            }
            if (summary.activeLoans.length > 0) {
                row.addComponents(
                    new ButtonBuilder().setCustomId("loan_repay_btn").setLabel("Repay Loan").setStyle(ButtonStyle.Primary).setEmoji("1445689337172721716")
                );
            }
            row.addComponents(
                new ButtonBuilder().setCustomId("bank_main_btn").setLabel("Back").setStyle(ButtonStyle.Secondary)
            );
            await interaction.update({ embeds: [embed], components: [row] });
            break;
        }
        case "bank_invest": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const embed = new EmbedBuilder()
                .setTitle("📈 Investment Portfolio")
                .setDescription(`Grow your wealth with Fixed Deposits (FD) or Recurring Deposits (RD).\n\n**Rates:**\nFD: ${config.fdInterestRate}%\nRD: ${config.rdInterestRate}%`)
                .setColor("#55FF55")
                .addFields(
                    {
                        name: "📘 How it Works",
                        value: "• **FD (Fixed Deposit):** Lock a lump sum for a set time (High Interest).\n• **RD (Recurring Deposit):** Similar to FD but typically for regular savings (Medium Interest).\n• **Maturity:** Funds + Interest are automatically returned to your bank after the duration ends."
                    }
                );
            if (summary.investments.length > 0) {
                const desc = summary.investments.map(i =>
                    `• **${i.type}**: ${config.currencyEmoji} ${i.amount} (Matures: ${i.maturityDate.toLocaleDateString()})`
                ).join("\n");
                embed.addFields({ name: "Your Investments", value: desc.slice(0, 1024) });
            } else {
                embed.addFields({ name: "Your Investments", value: "None active." });
            }
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId("invest_new_btn").setLabel("New Investment").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("invest_collect_btn").setLabel("Collect Matured").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("bank_main_btn").setLabel("Back").setStyle(ButtonStyle.Secondary)
                );
            await interaction.update({ embeds: [embed], components: [row] });
            break;
        }
        case "bank_deposit_withdraw": {
            const config = await getGuildConfig(guildId);
            await interaction.reply({ content: `Use \`${config.prefix}deposit <amount>\` or \`${config.prefix}withdraw <amount>\` for basic banking.`, ephemeral: true });
            break;
        }
        case "bank_main_btn": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const embed = new EmbedBuilder()
                .setTitle(`<:bankk:1445689134181126167> ${user.username}'s Financial Dashboard`)
                .setColor("#FFD700")
                .setDescription(`Welcome to the ${config.currencyName} Bank.`)
                .addFields(
                    { name: "<:MoneyBag:1446970451606896781> Net Worth", value: `${config.currencyEmoji} ${summary.netWorth.toLocaleString('en-US')}`, inline: true },
                    { name: "<a:credits:1445689337172721716> Credit Score", value: `${summary.creditScore}`, inline: true },
                    {
                        name: "<:OnLoan:1446971056865935381> Active Loans", value: summary.activeLoans.length > 0
                            ? `**${summary.activeLoans.length} Active**`
                            : "None", inline: true
                    },
                    { name: "<:graph:1445689267861979197> Investments", value: `${summary.investments.length} Active`, inline: true }
                );
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId("bank_deposit_withdraw").setLabel("Deposit/Withdraw").setStyle(ButtonStyle.Secondary).setEmoji("1446974393463869600"),
                    new ButtonBuilder().setCustomId("bank_loans").setLabel("Loans").setStyle(ButtonStyle.Primary).setEmoji("1446971056865935381"),
                    new ButtonBuilder().setCustomId("bank_invest").setLabel("Investments").setStyle(ButtonStyle.Success).setEmoji("1445689267861979197"),
                    new ButtonBuilder().setCustomId("bank_refresh").setLabel("Refresh").setStyle(ButtonStyle.Secondary).setEmoji("1446971490078560287")
                );
            await interaction.update({ embeds: [embed], components: [row] });
            break;
        }
        case "loan_apply_btn": {
            const config = await getGuildConfig(guildId);
            if ((config as any).disabledCommands && (config as any).disabledCommands.includes("loan")) {
                return interaction.reply({ content: "🚫 The loan system is currently disabled.", ephemeral: true });
            }
            const modal = new ModalBuilder()
                .setCustomId("loan_apply_modal")
                .setTitle("Apply for Loan");

            const amountInput = new TextInputBuilder()
                .setCustomId("loan_amount")
                .setLabel("Amount to borrow")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. 1000")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
            await interaction.showModal(modal);
            break;
        }
        case "loan_repay_btn": {
            const modal = new ModalBuilder()
                .setCustomId("loan_repay_modal")
                .setTitle("Repay Loan");

            const amountInput = new TextInputBuilder()
                .setCustomId("repay_amount")
                .setLabel("Amount to repay")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. 500 or 'all'")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
            await interaction.showModal(modal);
            break;
        }
        case "invest_new_btn": {
            const embed = new EmbedBuilder()
                .setTitle("Select Investment Type")
                .setDescription("Choose the type of investment you want to make.");

            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("invest_type_select")
                        .setPlaceholder("Select type")
                        .addOptions(
                            new StringSelectMenuOptionBuilder().setLabel("Fixed Deposit (FD)").setValue("FD").setDescription("One time deposit, lock for period."),
                            new StringSelectMenuOptionBuilder().setLabel("Recurring Deposit (RD)").setValue("RD").setDescription("Recurring deposit (Demo: Treated as locked deposit)")
                        )
                );
            await interaction.update({ embeds: [embed], components: [row] });
            break;
        }
        case "invest_collect_btn": {
            const results = await checkMaturedInvestments(user.id, guildId);
            if (results.length === 0) {
                await interaction.reply({ content: "No matured investments to collect yet.", ephemeral: true });
            } else {
                const total = results.reduce((a, b) => a + b.payout, 0);
                const config = await getGuildConfig(guildId);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Investment Collected",
                    description: `**User:** ${user.tag}\n**Investments:** ${results.length}\n**Total Payout:** ${fmtCurrency(total, config.currencyEmoji)}`,
                    color: 0x00FF00
                });
                await interaction.reply({ content: `Collected **${results.length}** investments for a total of **${total}**!`, ephemeral: true });
            }
            break;
        }
    }
}

async function handleModal(interaction: ModalSubmitInteraction) {
    const { customId, fields, user, guildId } = interaction;
    if (!guildId) return;

    await interaction.deferReply({ ephemeral: true });

    try {
        if (customId === "loan_apply_modal") {
            const config = await getGuildConfig(guildId);
            if ((config as any).disabledCommands && (config as any).disabledCommands.includes("loan")) throw new Error("Loan system is disabled.");

            const userCheck = await getFinancialSummary(user.id, guildId);
            if ((userCheck as any).isLoanBanned) throw new Error("You are banned from taking loans.");

            const amountStr = fields.getTextInputValue("loan_amount");
            const amount = parseInt(amountStr);
            if (isNaN(amount)) throw new Error("Invalid amount.");

            const result = await applyForLoan(user.id, guildId, amount);

            await logToChannel(interaction.client, {
                guild: interaction.guild!,
                type: "ECONOMY",
                title: "Loan Approved",
                description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount, config.currencyEmoji)}\n**Repayment:** ${fmtCurrency(result.totalRepayment, config.currencyEmoji)}\n**Due:** ${result.dueDate.toLocaleDateString()}`,
                color: 0x00FF00
            });

            await interaction.editReply({ content: `${Mascot.Emotes.Accept} Loan approved! Received **${amount}**. You must repay **${result.totalRepayment}** by ${result.dueDate.toLocaleDateString()}.` });

        } else if (customId === "loan_repay_modal") {
            const amountStr = fields.getTextInputValue("repay_amount");
            let amount = parseInt(amountStr);
            if (isNaN(amount)) {
                if (amountStr.toLowerCase() === 'all') {
                    const summary = await getFinancialSummary(user.id, guildId);
                    if (summary.activeLoans.length > 0) amount = summary.activeLoans.reduce((sum, l) => sum + l.totalRepayment, 0);
                    else amount = 0;
                } else {
                    throw new Error("Invalid amount.");
                }
            }

            const result = await repayLoan(user.id, guildId, amount);
            const config = await getGuildConfig(guildId);

            await logToChannel(interaction.client, {
                guild: interaction.guild!,
                type: "ECONOMY",
                title: "Loan Repayment",
                description: `**User:** ${user.tag}\n**Paid:** ${fmtCurrency(result.paid, config.currencyEmoji)}\n**Status:** ${result.status}\n**Remaining:** ${fmtCurrency(result.remaining, config.currencyEmoji)}`,
                color: 0x00AAFF
            });

            await interaction.editReply({ content: `💸 Repaid **${result.paid}**. Status: **${result.status}**. Remaining: **${result.remaining}**.` });

        } else if (customId.startsWith("invest_create_modal")) {
            const amount = parseInt(fields.getTextInputValue("invest_amount"));
            const days = parseInt(fields.getTextInputValue("invest_days"));

            if (isNaN(amount) || isNaN(days)) throw new Error("Invalid numbers provided.");

            const config = await getGuildConfig(guildId);

            if (customId.endsWith("_FD")) {
                await createInvestment(user.id, guildId, "FD", amount, days);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Fixed Deposit Created",
                    description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount, config.currencyEmoji)}\n**Duration:** ${days} days`,
                    color: 0xFFA500
                });
                await interaction.editReply({ content: `${Mascot.Emotes.Accept} Created Fixed Deposit of **${amount}** for **${days} days**.` });
            } else {
                await createInvestment(user.id, guildId, "RD", amount, days);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Recurring Deposit Created",
                    description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount, config.currencyEmoji)}\n**Duration:** ${days} days`,
                    color: 0xFFA500
                });
                await interaction.editReply({ content: `${Mascot.Emotes.Accept} Created Recurring Deposit of **${amount}** for **${days} days**.` });
            }
        }
    } catch (err: any) {
        await interaction.editReply({ content: `${Mascot.Emotes.Fail} Error: ${err.message}` });
    }
}

async function handleSelectMenu(interaction: any) {
    if (interaction.customId === "invest_type_select") {
        const selected = interaction.values[0];
        const modal = new ModalBuilder()
            .setCustomId(`invest_create_modal_${selected}`)
            .setTitle(`Create ${selected}`);

        const amountInput = new TextInputBuilder()
            .setCustomId("invest_amount")
            .setLabel("Amount")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const daysInput = new TextInputBuilder()
            .setCustomId("invest_days")
            .setLabel("Duration (Days)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g. 7")
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(daysInput)
        );

        await interaction.showModal(modal);
    }
}