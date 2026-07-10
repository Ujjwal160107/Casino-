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
import { getCardPayMinimumAmount, payCard, getCardSummary } from "../services/creditCardService";
import { parseSmartAmount } from "../utils/format";
import { getGuildPrefix } from "../utils/guildContext";
import {
    ensureDeferredEphemeralReply,
    ensureDeferredUpdate,
    safeEditReply,
    safeFollowUp,
    safeReply,
} from "../utils/interactionHelpers";

const EPHEMERAL_V2_FLAGS = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function buildBankEphemeralReply(title: string, body: string, accentColor = 0x5865F2) {
    return {
        components: [buildBankMessageContainer(title, body, accentColor)],
        flags: EPHEMERAL_V2_FLAGS,
    };
}

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
        const payload = {
            components: [buildBankMessageContainer("Bank Session", "This bank session belongs to another user.", 0xE74C3C)],
            flags: EPHEMERAL_V2_FLAGS,
        };
        if (interaction.deferred || interaction.replied) {
            await safeFollowUp(interaction, payload);
        } else {
            await safeReply(interaction, payload);
        }
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
            await ensureDeferredUpdate(interaction);
            const summary = await getFinancialSummary(user.id);
            const container = buildBankMainContainer(displayName, avatarUrl, summary, user.id);
            await safeEditReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_invest":
        case "invest": {
            await ensureDeferredUpdate(interaction);
            const summary = await getFinancialSummary(user.id);
            const container = buildBankInvestmentsContainer(displayName, avatarUrl, summary, user.id);
            await safeEditReply(interaction, { components: [container], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_loans":
        case "loan_apply_btn":
        case "loan_repay_btn": {
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            await safeEditReply(interaction, buildBankEphemeralReply(
                "Cards Handle Credit",
                "Direct bank loans are no longer available. Use the Cards section for credit access.",
            ));
            break;
        }
        case "bank_cards":
        case "cards": {
            await ensureDeferredUpdate(interaction);
            const payload = await buildBankCardsPayload(user.id, displayName, "catalog", guildId);
            await safeEditReply(interaction, { ...payload, flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_cards_apply":
        case "cards_apply": {
            await ensureDeferredUpdate(interaction);
            const payload = await buildBankCardsPayload(user.id, displayName, "apply", guildId);
            await safeEditReply(interaction, { ...payload, flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "bank_cards_my":
        case "cards_my":
        case "cards_my_refresh": {
            await ensureDeferredUpdate(interaction);
            const payload = await buildBankCardsPayload(user.id, displayName, "mine", guildId);
            await safeEditReply(interaction, { ...payload, flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "card_pay_min": {
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            try {
                const summary = await getCardSummary(user.id);
                if (!summary.card) throw new Error("You do not have a card.");
                const amount = getCardPayMinimumAmount(summary.card, summary.openStatement);
                if (amount <= 0) throw new Error("No minimum payment is due right now.");
                const result = await payCard(user.id, amount);
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Payment Posted",
                    `Paid **${fmtCurrency(result.paid)}** toward your card.\nNew balance: **${fmtCurrency(result.card.currentBalance)}**\nUse **Refresh** on My Cards to update the dashboard.`,
                    0x2ECC71,
                ));
            } catch (err) {
                await safeEditReply(interaction, buildBankEphemeralReply("Payment Failed", (err as Error).message, 0xE74C3C));
            }
            break;
        }
        case "card_pay_full": {
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            try {
                const summary = await getCardSummary(user.id);
                if (!summary.card) throw new Error("You do not have a card.");
                if (summary.card.currentBalance <= 0) throw new Error("Your card has no balance to pay.");
                const result = await payCard(user.id, summary.card.currentBalance);
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Payment Posted",
                    `Paid **${fmtCurrency(result.paid)}** — card balance cleared.\nUse **Refresh** on My Cards to update the dashboard.`,
                    0x2ECC71,
                ));
            } catch (err) {
                await safeEditReply(interaction, buildBankEphemeralReply("Payment Failed", (err as Error).message, 0xE74C3C));
            }
            break;
        }
        case "card_pay_custom": {
            const modal = new ModalBuilder()
                .setCustomId(`bank:card_pay_modal:${user.id}`)
                .setTitle("Pay Credit Card");
            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("pay_amount")
                        .setLabel("Amount to pay from wallet")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("e.g. 50000 or all")
                        .setRequired(true),
                ),
            );
            await interaction.showModal(modal);
            break;
        }
        case "cards_apply_best": {
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            try {
                const card = await applyBestEligibleCard(user.id);
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Card Updated",
                    `Your **${card.tier}** Fortuna Card is active.\nLimit: **${fmtCurrency(card.creditLimit)}**`,
                    0x2ECC71,
                ));
            } catch (err) {
                await safeEditReply(interaction, buildBankEphemeralReply("Card Application Failed", (err as Error).message, 0xE74C3C));
            }
            break;
        }
        default: {
            if (!customId.startsWith("bank_card_apply_") && action !== "card_apply") break;
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            try {
                const tier = action === "card_apply" ? parsedId.detail! : customId.replace("bank_card_apply_", "");
                const card = await applySelectedCardTier(user.id, tier);
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Card Updated",
                    `Your **${card.tier}** Fortuna Card is active.\nLimit: **${fmtCurrency(card.creditLimit)}**`,
                    0x2ECC71,
                ));
            } catch (err) {
                await safeEditReply(interaction, buildBankEphemeralReply("Card Application Failed", (err as Error).message, 0xE74C3C));
            }
            break;
        }
        case "bank_deposit_withdraw":
        case "deposit_withdraw": {
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            const prefix = await getGuildPrefix(guildId);
            await safeEditReply(interaction, buildBankEphemeralReply(
                "Deposit and Withdraw",
                `Use \`${prefix}deposit <amount>\` or \`${prefix}withdraw <amount>\` for basic banking.`,
            ));
            break;
        }
        case "invest_new_btn": {
            await ensureDeferredUpdate(interaction);
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
            await safeEditReply(interaction, { components: [container, row], flags: MessageFlags.IsComponentsV2 });
            break;
        }
        case "invest_collect_btn": {
            await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);
            const results = await checkMaturedInvestments(user.id);
            if (results.length === 0) {
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Investment Collection",
                    "No matured investments to collect yet.",
                ));
            } else {
                const total = results.reduce((sum, item) => sum + (item?.payout ?? 0), 0);
                const prefix = await getGuildPrefix(guildId);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Investment Collected",
                    description: `**User:** ${user.tag}\n**Investments:** ${results.length}\n**Total Payout:** ${fmtCurrency(total)}`,
                    color: 0x00FF00
                });
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Investments Collected",
                    `Collected **${results.length}** investments for a total of **${fmtCurrency(total)}**.`,
                    0x2ECC71,
                ));
            }
            break;
        }
    }
}

async function handleModal(interaction: ModalSubmitInteraction) {
    const { customId, fields, user, guildId } = interaction;
    if (!guildId) return;

    await ensureDeferredEphemeralReply(interaction, EPHEMERAL_V2_FLAGS);

    try {
        if (customId.startsWith("bank:card_pay_modal:")) {
            const ownerId = customId.split(":")[2];
            if (ownerId !== user.id) throw new Error("This payment session belongs to another user.");
            const summary = await getCardSummary(user.id);
            if (!summary.card) throw new Error("You do not have a card.");
            const rawAmount = fields.getTextInputValue("pay_amount");
            const amount = parseSmartAmount(rawAmount, summary.card.currentBalance);
            const result = await payCard(user.id, amount);
            await safeEditReply(interaction, buildBankEphemeralReply(
                "Payment Posted",
                `Paid **${fmtCurrency(result.paid)}**.\nNew card balance: **${fmtCurrency(result.card.currentBalance)}**`,
                0x2ECC71,
            ));
            return;
        }

        if (customId.startsWith("invest_create_modal")) {
            const amount = parseInt(fields.getTextInputValue("invest_amount"), 10);
            const days = parseInt(fields.getTextInputValue("invest_days"), 10);

            if (isNaN(amount) || isNaN(days)) throw new Error("Invalid numbers provided.");

            const prefix = await getGuildPrefix(guildId);

            if (customId.endsWith("_FD")) {
                await createInvestment(user.id, "FD", amount, days);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Fixed Deposit Created",
                    description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount)}\n**Duration:** ${days} days`,
                    color: 0xFFA500
                });
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Fixed Deposit Created",
                    `Created a fixed deposit of **${fmtCurrency(amount)}** for **${days} days**.`,
                    0x2ECC71,
                ));
            } else {
                await createInvestment(user.id, "RD", amount, days);
                await logToChannel(interaction.client, {
                    guild: interaction.guild!,
                    type: "ECONOMY",
                    title: "Recurring Deposit Created",
                    description: `**User:** ${user.tag}\n**Amount:** ${fmtCurrency(amount)}\n**Duration:** ${days} days`,
                    color: 0xFFA500
                });
                await safeEditReply(interaction, buildBankEphemeralReply(
                    "Recurring Deposit Created",
                    `Created a recurring deposit of **${fmtCurrency(amount)}** for **${days} days**.`,
                    0x2ECC71,
                ));
            }
        }
    } catch (err: any) {
        await safeEditReply(interaction, buildBankEphemeralReply("Bank Error", err.message, 0xE74C3C));
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
