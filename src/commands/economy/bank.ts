import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import {
    checkMaturedInvestments,
    createInvestment,
    getFinancialSummary,
} from "../../services/bankingService";
import { ensureBankingUser } from "../../services/bankService";
import {
    applyForCardTier,
    getCardDisplaySnapshot,
    getCardEligibilitySummary,
    getCardPayMinimumAmount,
    issueCard,
    upgradeCard,
} from "../../services/creditCardService";
import {
    BANKING_CONFIG,
    CARD_TIER_ORDER,
    CardTierConfig,
    getCardTierConfig,
} from "../../utils/economyConfig";
import { fmtCurrency, parseSmartAmount } from "../../utils/format";
import { getGuildPrefix } from "../../utils/guildContext";
import { Mascot } from "../../config/branding";
import { nextStepHint } from "../../config/nextSteps";

const BANK_ACCENT_COLOR = 0x9B59B6;
const CARD_ACCENT_COLOR = 0x5865F2;

export const data = {
    name: "bank",
    description: "Manage your finances: bank balance, investments, credit score, and cards.",
};

type FinancialSummary = Awaited<ReturnType<typeof getFinancialSummary>>;
type CardEligibilitySummary = Awaited<ReturnType<typeof getCardEligibilitySummary>>;
export type BankCardView = "catalog" | "apply" | "mine";

const CARD_ASSET_NAMES: Record<string, string> = {
    STARTER: "starter_card",
    GOLD: "gold_card",
    PLATINUM: "platinum_card",
    BLACK: "black_card",
};

function bankId(action: string, ownerId: string, detail?: string) {
    return detail ? `bank:${action}:${detail}:${ownerId}` : `bank:${action}:${ownerId}`;
}

export function parseBankCustomId(customId: string) {
    if (!customId.startsWith("bank:")) {
        return { action: customId, detail: null as string | null, ownerId: null as string | null };
    }

    const [, action, maybeDetail, maybeOwner] = customId.split(":");
    return maybeOwner
        ? { action, detail: maybeDetail, ownerId: maybeOwner }
        : { action, detail: null as string | null, ownerId: maybeDetail ?? null };
}

export function buildBankMessageContainer(title: string, body: string, accentColor = BANK_ACCENT_COLOR) {
    return new ContainerBuilder()
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

function buildBankActionRow(ownerId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("deposit_withdraw", ownerId))
            .setLabel("Deposit/Withdraw")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(Mascot.Emotes.Currency),
        new ButtonBuilder()
            .setCustomId(bankId("invest", ownerId))
            .setLabel("Investments")
            .setStyle(ButtonStyle.Success)
            .setEmoji(Mascot.Emotes.Graph),
        new ButtonBuilder()
            .setCustomId(bankId("cards", ownerId))
            .setLabel("Cards")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(Mascot.Emotes.Credit),
        new ButtonBuilder()
            .setCustomId(bankId("refresh", ownerId))
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(Mascot.Emotes.Refresh),
    );
}

function buildBankSectionNavRow(ownerId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("main", ownerId))
            .setLabel("Main Menu")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(bankId("cards", ownerId))
            .setLabel("Cards")
            .setStyle(ButtonStyle.Primary),
    );
}

function formatCardTransactionLine(tx: { type: string; amount: number; meta: unknown; createdAt: Date }) {
    const meta = (tx.meta ?? {}) as Record<string, unknown>;
    const when = `<t:${Math.floor(tx.createdAt.getTime() / 1000)}:d>`;
    switch (tx.type) {
        case "PURCHASE":
            return `${when} · Purchase **${fmtCurrency(tx.amount)}**${meta.itemName ? ` — ${meta.itemName}` : ""}`;
        case "PAYMENT":
            return `${when} · Payment **${fmtCurrency(tx.amount)}**`;
        case "WITHDRAW":
            return `${when} · Withdraw **${fmtCurrency(tx.amount)}**`;
        case "INTEREST":
            return `${when} · Interest **${fmtCurrency(tx.amount)}**`;
        case "STATEMENT":
            return `${when} · Statement **${fmtCurrency(tx.amount)}**`;
        case "GARNISHMENT":
            return `${when} · Garnishment **${fmtCurrency(tx.amount)}**`;
        default:
            return `${when} · ${tx.type} **${fmtCurrency(tx.amount)}**`;
    }
}

function buildCardPayRow(
    card: NonNullable<CardEligibilitySummary["card"]>,
    ownerId: string,
    _openStatement: CardEligibilitySummary["openStatement"],
) {
    const canPay = card.currentBalance > 0;
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("card_pay_min", ownerId))
            .setLabel("Pay Minimum")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(Mascot.Emotes.Credit)
            .setDisabled(!canPay),
        new ButtonBuilder()
            .setCustomId(bankId("card_pay_full", ownerId))
            .setLabel("Pay Full Balance")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!canPay),
        new ButtonBuilder()
            .setCustomId(bankId("card_pay_custom", ownerId))
            .setLabel("Pay Custom")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!canPay),
    );
}

function buildCardMineActionRow(ownerId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("cards_my_refresh", ownerId))
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(Mascot.Emotes.Refresh),
    );
}

function buildCardMineBody(summary: CardEligibilitySummary, prefix: string) {
    const card = summary.card!;
    const tier = getCardTierConfig(card.tier);
    const userScore = summary.user?.creditScore ?? 500;
    const snap = getCardDisplaySnapshot(card);
    const openStatement = summary.openStatement;
    const utilization = Math.round(snap.utilizationPct * 100);
    const dueTs = snap.cycleEndsAt
        ? `<t:${Math.floor(snap.cycleEndsAt.getTime() / 1000)}:F> (<t:${Math.floor(snap.cycleEndsAt.getTime() / 1000)}:R>)`
        : "Pending first cycle";
    const payMin = getCardPayMinimumAmount(card, openStatement);

    const lines = [
        `### ${formatTierName(card.tier)} Card`,
        `Credit score required: **${tier.reqScore}** · Your score: **${userScore}**`,
        `Status: **${card.status}**`,
        `Balance owed: **${fmtCurrency(card.currentBalance)} / ${fmtCurrency(card.creditLimit)}** (${utilization}% used)`,
        `Projected minimum due: **${fmtCurrency(payMin)}**`,
        `Payment due (cycle ends): **${dueTs}**`,
        `Last statement balance: **${fmtCurrency(card.statementBalance)}**`,
        `Weekly spend cap: **${fmtCurrency(card.spentThisCycle)} / ${fmtCurrency(card.weeklySpendCap)}**`,
        `Weekly withdraw cap: **${fmtCurrency(card.withdrawnThisCycle)} / ${fmtCurrency(card.weeklyWithdrawCap)}**`,
        `-# Card payments use **wallet** balance. Move funds from bank with \`${prefix}withdraw\` first.`,
    ];

    if (card.status === "DELINQUENT") {
        lines.push("", `${Mascot.Emotes.Fail} **Delinquent** — pay at least the minimum before the payment due date to avoid further penalties.`);
    }
    if (card.status === "LOCKED") {
        lines.push("", `${Mascot.Emotes.Lock} **Locked** — pay off your full balance to rehabilitate your card.`);
    }

    if (openStatement) {
        const stmtDue = `<t:${Math.floor(openStatement.dueAt.getTime() / 1000)}:F>`;
        lines.push(
            "",
            `**Open statement (${openStatement.cycleKey})**`,
            `Balance: **${fmtCurrency(openStatement.statementBalance)}** · Paid: **${fmtCurrency(openStatement.amountPaid)}** · Min due: **${fmtCurrency(openStatement.minimumDue)}** · Due: **${stmtDue}**`,
        );
    }

    const txs = card.transactions ?? [];
    if (txs.length > 0) {
        lines.push("", "**Recent activity**", ...txs.slice(0, 5).map(formatCardTransactionLine));
    }

    if (card.currentBalance <= 0) {
        lines.push("", "-# No balance due right now.");
    }

    return lines.join("\n");
}

function buildCardNavRow(activeView: BankCardView, ownerId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("main", ownerId))
            .setLabel("Main Menu")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(bankId("cards", ownerId))
            .setLabel("Card Catalog")
            .setStyle(activeView === "catalog" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeView === "catalog"),
        new ButtonBuilder()
            .setCustomId(bankId("cards_apply", ownerId))
            .setLabel("Apply for Cards")
            .setStyle(activeView === "apply" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeView === "apply"),
        new ButtonBuilder()
            .setCustomId(bankId("cards_my", ownerId))
            .setLabel("My Cards")
            .setStyle(activeView === "mine" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(activeView === "mine"),
    );
}

function buildApplyBestRow(summary: CardEligibilitySummary, ownerId: string) {
    const bestEligible = summary.eligibleTier;
    const currentTier = summary.card ? getCardTierConfig(summary.card.tier) : null;
    const canApply = Boolean(bestEligible && (!currentTier || bestEligible.creditLimit > currentTier.creditLimit));

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("cards_apply_best", ownerId))
            .setLabel("Apply Best Eligible")
            .setStyle(canApply ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(canApply ? Mascot.Emotes.Credit : Mascot.Emotes.Lock)
            .setDisabled(!canApply),
    );
}

function buildTierApplyRow(row: CardEligibilitySummary["tiers"][number], summary: CardEligibilitySummary, ownerId: string) {
    const currentTier = summary.card ? getCardTierConfig(summary.card.tier) : null;
    const canApply = row.eligible && !row.alreadyOwned && (!currentTier || row.tier.creditLimit > currentTier.creditLimit);
    let label = "Locked";
    let style = ButtonStyle.Secondary;
    let emoji = Mascot.Emotes.Lock;

    if (row.alreadyOwned) {
        label = "Owned";
        emoji = "✅";
    } else if (canApply) {
        label = `Apply ${formatTierName(row.tier.tier)}`;
        style = ButtonStyle.Success;
        emoji = Mascot.Emotes.Credit;
    }

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(bankId("card_apply", ownerId, row.tier.tier))
            .setLabel(label)
            .setEmoji(emoji)
            .setStyle(style)
            .setDisabled(!canApply),
    );
}

function resolveCardAsset(tier: string) {
    const baseName = CARD_ASSET_NAMES[tier.toUpperCase()];
    if (!baseName) return null;

    const assetDir = path.resolve(__dirname, "../../assets");
    const filePath = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
        .map((ext) => path.join(assetDir, `${baseName}${ext}`))
        .find((candidate) => fs.existsSync(candidate));

    if (!filePath) return null;
    return {
        filePath,
        attachmentName: `${baseName}${path.extname(filePath)}`,
    };
}

function formatMinimumDueRule(tier: CardTierConfig) {
    return `${tier.minimumDuePct}% of statement or ${fmtCurrency(tier.minimumDueFloor)}, whichever is higher`;
}

function formatTierName(tier: string) {
    return tier
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatTierEligibility(tier: CardTierConfig, summary: CardEligibilitySummary) {
    const row = summary.tiers.find((item) => item.tier.tier === tier.tier);
    if (row?.alreadyOwned) return "Already owns it";
    if (row?.eligible) return "Eligible";
    return "Locked";
}

function addAssetOrFallback(section: SectionBuilder, files: AttachmentBuilder[], tier: string) {
    const asset = resolveCardAsset(tier);
    if (!asset) {
        section.addTextDisplayComponents(new TextDisplayBuilder().setContent("Image: unavailable"));
        return;
    }

    section.setThumbnailAccessory(
        new ThumbnailBuilder()
            .setURL(`attachment://${asset.attachmentName}`)
            .setDescription(`${formatTierName(tier)} card`),
    );
    files.push(new AttachmentBuilder(asset.filePath, { name: asset.attachmentName }));
}

function addCardTierSections(container: ContainerBuilder, summary: CardEligibilitySummary, files: AttachmentBuilder[]) {
    for (const tierName of CARD_TIER_ORDER) {
        const tier = getCardTierConfig(tierName);
        const section = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `### ${formatTierName(tier.tier)} Card`,
                    `Credit score required: **${tier.reqScore}**`,
                    `Required career tier: **${tier.reqCareerTier}**`,
                    `Credit limit: **${fmtCurrency(tier.creditLimit)}**`,
                    `Weekly interest: **${tier.weeklyInterestPct}%**`,
                    `Minimum due: **${formatMinimumDueRule(tier)}**`,
                    `Weekly spend cap: **${fmtCurrency(tier.weeklySpendCap)}**`,
                    `Weekly withdraw cap: **${fmtCurrency(tier.weeklyWithdrawCap)}**`,
                    `Status: **${formatTierEligibility(tier, summary)}**`,
                ].join("\n"),
            ),
        );

        addAssetOrFallback(section, files, tier.tier);

        container
            .addSectionComponents(section)
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    }
}

export async function buildBankCardsPayload(
    discordId: string,
    displayName: string,
    view: BankCardView = "catalog",
    guildId?: string,
) {
    const summary = await getCardEligibilitySummary(discordId);
    const prefix = guildId ? await getGuildPrefix(guildId) : "!";
    const files: AttachmentBuilder[] = [];
    const container = new ContainerBuilder();

    if (view === "mine") {
        const card = summary.card;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${displayName}'s Fortuna Cards`));

        if (!card) {
            const userScore = summary.user?.creditScore ?? 500;
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `You do not have a Fortuna Card yet.\n**Starter** requires credit score **${getCardTierConfig("STARTER").reqScore}** · Your score: **${userScore}**\nUse **Apply for Cards** or \`!card issue\`.`,
            ));
        } else {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(buildCardMineBody(summary, prefix)),
            );
            container.addActionRowComponents(buildCardPayRow(card, discordId, summary.openStatement));
            container.addActionRowComponents(buildCardMineActionRow(discordId));
        }

        container.addActionRowComponents(buildCardNavRow("mine", discordId));
        return { components: [container], files };
    }

    if (view === "apply") {
        const bestEligible = summary.eligibleTier;

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent("## Apply for Fortuna Cards"),
            new TextDisplayBuilder().setContent(
                [
                    `Credit score: **${summary.user?.creditScore ?? 500}**`,
                    `Career tier: **${summary.careerTier}**`,
                    `Best eligible tier: **${bestEligible?.tier ?? "None"}**`,
                ].join("\n"),
            ),
        );
        container.addActionRowComponents(buildApplyBestRow(summary, discordId));

        for (const row of summary.tiers) {
            const status = row.alreadyOwned ? "already owned" : row.eligible ? "unlocked / eligible" : "locked";
            const missing = row.locked
                ? ` Missing: ${[
                    row.scoreMet ? null : `score ${row.tier.reqScore}`,
                    row.careerMet ? null : `career tier ${row.tier.reqCareerTier}`,
                ].filter(Boolean).join(", ")}`
                : "";

            const section = new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    [
                        `### ${formatTierName(row.tier.tier)} Card`,
                        `Status: **${status}**${missing}`,
                        `Credit score required: **${row.tier.reqScore}**`,
                        `Required career tier: **${row.tier.reqCareerTier}**`,
                        `Credit limit: **${fmtCurrency(row.tier.creditLimit)}**`,
                    ].join("\n"),
                ),
            );

            addAssetOrFallback(section, files, row.tier.tier);

            container
                .addSectionComponents(section)
                .addActionRowComponents(buildTierApplyRow(row, summary, discordId))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        }

        container.addActionRowComponents(buildCardNavRow("apply", discordId));
        return { components: [container], files };
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("## Fortuna Cards"),
        new TextDisplayBuilder().setContent(
            `Browse card tiers and requirements. Each tier needs a minimum credit score and career tier to apply.\nYour credit score: **${summary.user?.creditScore ?? 500}**`,
        ),
    );
    addCardTierSections(container, summary, files);
    container.addActionRowComponents(buildCardNavRow("catalog", discordId));
    return { components: [container], files };
}

export async function buildMyCardsPayload(discordId: string, displayName: string, guildId?: string) {
    return buildBankCardsPayload(discordId, displayName, "mine", guildId);
}

export async function applyBestEligibleCard(discordId: string) {
    const summary = await getCardEligibilitySummary(discordId);
    if (!summary.card) return issueCard(discordId);

    const bestEligible = summary.eligibleTier;
    if (!bestEligible || bestEligible.creditLimit <= summary.card.creditLimit) {
        throw new Error(`You are not eligible for a higher tier than ${summary.card.tier}.`);
    }

    return upgradeCard(discordId);
}

export async function applySelectedCardTier(discordId: string, tier: string) {
    return applyForCardTier(discordId, tier);
}

export function buildBankMainContainer(
    displayName: string,
    avatarUrl: string,
    summary: FinancialSummary,
    ownerId: string,
) {
    return new ContainerBuilder()
        .addSectionComponents(
            buildBankHeaderSection(
                `${displayName}'s Financial Dashboard`,
                "Manage your wallet, bank, investments, credit score, and cards.",
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
                `### ${Mascot.Emotes.Money} Net Worth\n${fmtCurrency(summary.netWorth)}`,
            ),
            new TextDisplayBuilder().setContent(
                `### Wallet / Bank\nWallet: **${fmtCurrency(summary.walletBalance)}**\nBank: **${fmtCurrency(summary.bankBalance)}**`,
            ),
            new TextDisplayBuilder().setContent(
                `### ${Mascot.Emotes.Credit} Credit Score\n${summary.creditScore}`,
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
        .addActionRowComponents(buildBankActionRow(ownerId))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(nextStepHint("bank")!));
}

export function buildBankInvestmentsContainer(
    displayName: string,
    avatarUrl: string,
    summary: FinancialSummary,
    ownerId: string,
) {
    const container = new ContainerBuilder()
        .addSectionComponents(
            buildBankHeaderSection(
                `${displayName}'s Investment Portfolio`,
                `FD Rate: **${BANKING_CONFIG.fdInterestRate}% APR**\nRD Rate: **${BANKING_CONFIG.rdInterestRate}% APR**`,
                avatarUrl,
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder()
                .setDivider(true)
                .setSpacing(SeparatorSpacingSize.Small),
        );

    if (summary.investments.length > 0) {
        summary.investments.forEach((investment) => {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${investment.type}\nPrincipal: **${fmtCurrency(investment.amount)}**\nRate: **${investment.interestRate}% APR**\nMatures: <t:${Math.floor(investment.maturityDate.getTime() / 1000)}:R>`,
                ),
            );
        });
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent("No active investments."));
    }

    return container.addActionRowComponents(buildBankSectionNavRow(ownerId));
}

export async function execute(message: Message | any, args: string[]) {
    const user = message.author || message.user;
    if (!user) return;

    await ensureBankingUser(user.id, user.username);

    const member = message.member;
    const displayName = member?.displayName || user.globalName || user.username;
    const avatarUrl = user.displayAvatarURL();
    const subCommand = args[0]?.toLowerCase();

    if (subCommand === "loan" || subCommand === "loans" || subCommand === "repay") {
        return message.reply({
            components: [buildBankMessageContainer("Cards Handle Credit", "Direct bank loans are no longer available. Use the Cards section for credit access.", CARD_ACCENT_COLOR)],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    if (subCommand === "fd" || subCommand === "rd") {
        const amount = parseSmartAmount(args[1] || "", Infinity);
        const durationDays = Math.floor(Number(args[2]));
        if (isNaN(amount) || amount <= 0 || isNaN(durationDays) || durationDays <= 0) {
            return message.reply({
                components: [buildBankMessageContainer("New Investment", `Usage: \`!bank ${subCommand} <amount> <days>\``, 0xE74C3C)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        try {
            const result = await createInvestment(user.id, subCommand.toUpperCase() as "FD" | "RD", amount, durationDays);
            return message.reply({
                components: [
                    buildBankMessageContainer(
                        "Investment Created",
                        `${result.type}: **${fmtCurrency(result.amount)}** locked at **${result.interestRate}% APR**.\nMatures: <t:${Math.floor(result.maturityDate.getTime() / 1000)}:R>`,
                        0x2ECC71,
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (e) {
            return message.reply({
                components: [buildBankMessageContainer("Investment Failed", (e as Error).message, 0xE74C3C)],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }

    if (subCommand === "collect") {
        const results = await checkMaturedInvestments(user.id);
        const payout = results.reduce((sum, item: any) => sum + (item?.payout || 0), 0);
        return message.reply({
            components: [
                buildBankMessageContainer(
                    "Matured Investments",
                    results.length > 0
                        ? `Collected **${fmtCurrency(payout)}** from **${results.length}** matured investment(s).`
                        : "No matured investments are ready to collect.",
                    results.length > 0 ? 0x2ECC71 : BANK_ACCENT_COLOR,
                ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    const summary = await getFinancialSummary(user.id);

    if (subCommand === "investments" || subCommand === "invest") {
        return message.reply({
            components: [buildBankInvestmentsContainer(displayName, avatarUrl, summary, user.id)],
            flags: MessageFlags.IsComponentsV2,
        });
    }

    if (subCommand === "cards" || subCommand === "card") {
        const payload = await buildBankCardsPayload(user.id, displayName, "catalog", message.guildId!);
        return message.reply({
            ...payload,
            flags: MessageFlags.IsComponentsV2,
        });
    }

    const container = buildBankMainContainer(displayName, avatarUrl, summary, user.id);
    await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}
