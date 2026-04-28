import {
    Interaction,
    ButtonInteraction,
    ModalSubmitInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { applyForLoan, repayLoan, createInvestment, getFinancialSummary, checkMaturedInvestments } from "../services/bankingService";
import { getGuildConfig } from "../services/guildConfigService";
import { logToChannel } from "../utils/discordLogger";
import { fmtCurrency } from "../utils/format";
import { Mascot } from "../config/branding";
import {
    buildBankInvestmentsContainer,
    buildBankLoansContainer,
    buildBankMainContainer,
    buildBankMessageContainer,
} from "../commands/economy/bank";

const EPHEMERAL_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

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
    const displayName = interaction.member && "displayName" in interaction.member
        ? interaction.member.displayName
        : (user.globalName || user.username);
    const avatarUrl = user.displayAvatarURL();

    switch (customId) {
        case "bank_refresh":
        case "bank_main_btn": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const container = buildBankMainContainer(displayName, avatarUrl, summary, config);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_loans": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const container = buildBankLoansContainer(displayName, avatarUrl, summary, config);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_invest": {
            const summary = await getFinancialSummary(user.id, guildId);
            const config = await getGuildConfig(guildId);
            const container = buildBankInvestmentsContainer(displayName, avatarUrl, summary, config);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_deposit_withdraw": {
            const config = await getGuildConfig(guildId);
            await interaction.reply({
                components: [
                    buildBankMessageContainer(
                        "Deposit and Withdraw",
                        `Use \`${config.prefix}deposit <amount>\` or \`${config.prefix}withdraw <amount>\` for basic banking.`,
                    ),
                ],
                flags: EPHEMERAL_V2_FLAGS,
            });
            break;
        }
        case "loan_apply_btn": {
            const config = await getGuildConfig(guildId);
            if ((config as any).disabledCommands && (config as any).disabledCommands.includes("loan")) {
                return interaction.reply({
                    components: [buildBankMessageContainer("Loan System", "The loan system is currently disabled.", 0xE74C3C)],
                    flags: EPHEMERAL_V2_FLAGS,
                });
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
            const container = new ContainerBuilder()
                .setAccentColor(0x2ECC71)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent("## Select Investment Type"),
                    new TextDisplayBuilder().setContent("Choose the type of investment you want to make."),
                );

            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("invest_type_select")
                        .setPlaceholder("Select type")
                        .addOptions(
                            new StringSelectMenuOptionBuilder().setLabel("Fixed Deposit (FD)").setValue("FD").setDescription("One time deposit locked for a period."),
                            new StringSelectMenuOptionBuilder().setLabel("Recurring Deposit (RD)").setValue("RD").setDescription("Recurring deposit track."),
                        ),
                );
            await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "invest_collect_btn": {
            const results = await checkMaturedInvestments(user.id, guildId);
            if (results.length === 0) {
                await interaction.reply({
                    components: [buildBankMessageContainer("Investment Collection", "No matured investments to collect yet.")],
                    flags: EPHEMERAL_V2_FLAGS,
                });
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
                await interaction.reply({
                    components: [
                        buildBankMessageContainer(
                            "Investments Collected",
                            `Collected **${results.length}** investments for a total of **${fmtCurrency(total, config.currencyEmoji)}**.`,
                            0x2ECC71,
                        ),
                    ],
                    flags: EPHEMERAL_V2_FLAGS,
                });
            }
            break;
        }
    }
}

async function handleModal(interaction: ModalSubmitInteraction) {
    const { customId, fields, user, guildId } = interaction;
    if (!guildId) return;

    await interaction.deferReply({ flags: EPHEMERAL_V2_FLAGS });

    try {
        if (customId === "loan_apply_modal") {
            const config = await getGuildConfig(guildId);
            if ((config as any).disabledCommands && (config as any).disabledCommands.includes("loan")) throw new Error("Loan system is disabled.");

            const userCheck = await getFinancialSummary(user.id, guildId);
            if ((userCheck as any).isLoanBanned) throw new Error("You are banned from taking loans.");

            const amountStr = fields.getTextInputValue("loan_amount");
            const amount = parseInt(amountStr, 10);
            if (isNaN(amount)) throw new Error("Invalid amount.");

            const result = await applyForLoan(user.id, guildId, amount);

            await logToChannel(interaction.client, {
                guild: interaction.guild!,
                type: "ECONOMY",
                title: "Loan Approved",
                description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount, config.currencyEmoji)}\n**Repayment:** ${fmtCurrency(result.totalRepayment, config.currencyEmoji)}\n**Due:** ${result.dueDate.toLocaleDateString()}`,
                color: 0x00FF00
            });

            await interaction.editReply({
                components: [
                    buildBankMessageContainer(
                        "Loan Approved",
                        `Received **${fmtCurrency(amount, config.currencyEmoji)}**. You must repay **${fmtCurrency(result.totalRepayment, config.currencyEmoji)}** by ${result.dueDate.toLocaleDateString()}.`,
                        0x2ECC71,
                    ),
                ],
            });
        } else if (customId === "loan_repay_modal") {
            const amountStr = fields.getTextInputValue("repay_amount");
            let amount = parseInt(amountStr, 10);
            if (isNaN(amount)) {
                if (amountStr.toLowerCase() === "all") {
                    const summary = await getFinancialSummary(user.id, guildId);
                    if (summary.activeLoans.length > 0) amount = summary.activeLoans.reduce((sum, loan) => sum + loan.totalRepayment, 0);
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

            await interaction.editReply({
                components: [
                    buildBankMessageContainer(
                        "Loan Repaid",
                        `Paid **${fmtCurrency(result.paid, config.currencyEmoji)}**. Status: **${result.status}**. Remaining: **${fmtCurrency(result.remaining, config.currencyEmoji)}**.`,
                        0x2ECC71,
                    ),
                ],
            });
        } else if (customId.startsWith("invest_create_modal")) {
            const amount = parseInt(fields.getTextInputValue("invest_amount"), 10);
            const days = parseInt(fields.getTextInputValue("invest_days"), 10);

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
                await interaction.editReply({
                    components: [
                        buildBankMessageContainer(
                            "Fixed Deposit Created",
                            `Created a fixed deposit of **${fmtCurrency(amount, config.currencyEmoji)}** for **${days} days**.`,
                            0x2ECC71,
                        ),
                    ],
                });
            } else {
                await createInvestment(user.id, guildId, "RD", amount, days);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Recurring Deposit Created",
                    description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount, config.currencyEmoji)}\n**Duration:** ${days} days`,
                    color: 0xFFA500
                });
                await interaction.editReply({
                    components: [
                        buildBankMessageContainer(
                            "Recurring Deposit Created",
                            `Created a recurring deposit of **${fmtCurrency(amount, config.currencyEmoji)}** for **${days} days**.`,
                            0x2ECC71,
                        ),
                    ],
                });
            }
        }
    } catch (err: any) {
        await interaction.editReply({
            components: [
                buildBankMessageContainer("Bank Error", err.message, 0xE74C3C),
            ],
        });
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
