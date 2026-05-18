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
import { createInvestment, getFinancialSummary, checkMaturedInvestments } from "../services/bankingService";
import { getGuildConfig } from "../services/guildConfigService";
import { logToChannel } from "../utils/discordLogger";
import { fmtCurrency } from "../utils/format";
import { Mascot } from "../config/branding";
import {
    buildBankInvestmentsContainer,
    buildBankMainContainer,
    buildBankMessageContainer,
    buildBankCardsPayload,
    applySelectedCardTier,
    applyBestEligibleCard,
    parseBankCustomId,
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
    const parsedId = parseBankCustomId(customId);
    const action = parsedId.action;

    if (parsedId.ownerId && parsedId.ownerId !== user.id) {
        await interaction.reply({
            components: [buildBankMessageContainer("Bank Session", "This bank session belongs to another user.", 0xE74C3C)],
            flags: EPHEMERAL_V2_FLAGS,
        });
        return;
    }

    const displayName = interaction.member && "displayName" in interaction.member
        ? interaction.member.displayName
        : (user.globalName || user.username);
    const avatarUrl = user.displayAvatarURL();

    switch (action) {
        case "bank_refresh":
        case "refresh":
        case "bank_main_btn":
        case "main": {
            const summary = await getFinancialSummary(user.id);
            const container = buildBankMainContainer(displayName, avatarUrl, summary, user.id);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_invest":
        case "invest": {
            const summary = await getFinancialSummary(user.id);
            const container = buildBankInvestmentsContainer(displayName, avatarUrl, summary, user.id);
            await interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_loans":
        case "loan_apply_btn":
        case "loan_repay_btn": {
            await interaction.reply({
                components: [buildBankMessageContainer("Cards Handle Credit", "Direct bank loans are no longer available. Use the Cards section for credit access.", 0x5865F2)],
                flags: EPHEMERAL_V2_FLAGS,
            });
            break;
        }
        case "bank_cards":
        case "cards": {
            await interaction.deferUpdate();
            const payload = await buildBankCardsPayload(user.id, displayName, "catalog");
            await interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_cards_apply":
        case "cards_apply": {
            await interaction.deferUpdate();
            const payload = await buildBankCardsPayload(user.id, displayName, "apply");
            await interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_cards_my":
        case "cards_my": {
            await interaction.deferUpdate();
            const payload = await buildBankCardsPayload(user.id, displayName, "mine");
            await interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "cards_apply_best": {
            await interaction.deferReply({ flags: EPHEMERAL_V2_FLAGS });
            try {
                const card = await applyBestEligibleCard(user.id);
                await interaction.editReply({
                    components: [
                        buildBankMessageContainer(
                            "Card Updated",
                            `Your **${card.tier}** Fortuna Card is active.\nLimit: **${fmtCurrency(card.creditLimit)}**`,
                            0x2ECC71,
                        ),
                    ],
                });
            } catch (err) {
                await interaction.editReply({
                    components: [buildBankMessageContainer("Card Application Failed", (err as Error).message, 0xE74C3C)],
                });
            }
            break;
        }
        default: {
            if (!customId.startsWith("bank_card_apply_") && action !== "card_apply") break;
            await interaction.deferReply({ flags: EPHEMERAL_V2_FLAGS });
            try {
                const tier = action === "card_apply" ? parsedId.detail! : customId.replace("bank_card_apply_", "");
                const card = await applySelectedCardTier(user.id, tier);
                await interaction.editReply({
                    components: [
                        buildBankMessageContainer(
                            "Card Updated",
                            `Your **${card.tier}** Fortuna Card is active.\nLimit: **${fmtCurrency(card.creditLimit)}**`,
                            0x2ECC71,
                        ),
                    ],
                });
            } catch (err) {
                await interaction.editReply({
                    components: [buildBankMessageContainer("Card Application Failed", (err as Error).message, 0xE74C3C)],
                });
            }
            break;
        }
        case "bank_deposit_withdraw":
        case "deposit_withdraw": {
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
            const results = await checkMaturedInvestments(user.id);
            if (results.length === 0) {
                await interaction.reply({
                    components: [buildBankMessageContainer("Investment Collection", "No matured investments to collect yet.")],
                    flags: EPHEMERAL_V2_FLAGS,
                });
            } else {
                const total = results.reduce((sum, item) => sum + (item?.payout ?? 0), 0);
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
        if (customId.startsWith("invest_create_modal")) {
            const amount = parseInt(fields.getTextInputValue("invest_amount"), 10);
            const days = parseInt(fields.getTextInputValue("invest_days"), 10);

            if (isNaN(amount) || isNaN(days)) throw new Error("Invalid numbers provided.");

            const config = await getGuildConfig(guildId);

            if (customId.endsWith("_FD")) {
                await createInvestment(user.id, "FD", amount, days);
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
                await createInvestment(user.id, "RD", amount, days);
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
