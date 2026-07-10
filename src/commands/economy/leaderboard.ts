import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";

type LbType = "net" | "cash" | "employees";

const ACCENT: Record<LbType, number> = {
    net: 0x9B59B6,
    cash: 0x2ECC71,
    employees: 0xE67E22,
};

const TITLES: Record<LbType, string> = {
    net: "Net Worth Leaderboard",
    cash: "Cash Leaderboard",
    employees: "Top Employees",
};

const SUBTITLES: Record<LbType, string> = {
    net: "Richest players · wallet + bank",
    cash: "Highest wallet balance",
    employees: "Most shifts worked",
};

function lbId(type: LbType, ownerId: string) {
    return `lb:${type}:${ownerId}`;
}

function rankLabel(i: number): string {
    if (i === 0) return Mascot.Emotes.MedalGold;
    if (i === 1) return Mascot.Emotes.MedalSilver;
    if (i === 2) return Mascot.Emotes.MedalBronze;
    return `**${i + 1}.**`;
}

function sortUsers(users: any[], type: LbType) {
    return [...users].sort((a, b) => {
        if (type === "employees") return ((b as any).shiftsWorked || 0) - ((a as any).shiftsWorked || 0);
        const valA = (a.wallet?.balance ?? 0) + (type === "net" ? (a.bank?.balance ?? 0) : 0);
        const valB = (b.wallet?.balance ?? 0) + (type === "net" ? (b.bank?.balance ?? 0) : 0);
        return valB - valA;
    });
}

function buildRankingsText(users: any[], type: LbType): string {
    const top10 = sortUsers(users, type).slice(0, 10);
    if (top10.length === 0) return "No players found.";
    return top10.map((u, i) => {
        const val = type === "employees"
            ? `${((u as any).shiftsWorked || 0).toLocaleString()} shifts`
            : fmtCurrency((u.wallet?.balance ?? 0) + (type === "net" ? (u.bank?.balance ?? 0) : 0));
        return `${rankLabel(i)} **${u.username ?? "Unknown"}** — ${val}`;
    }).join("\n");
}

function buildYourRankText(users: any[], ownerId: string, type: LbType): string | null {
    const sorted = sortUsers(users, type);
    const idx = sorted.findIndex(u => u.discordId === ownerId);
    if (idx === -1) return null;
    const u = sorted[idx];
    const val = type === "employees"
        ? `${((u as any).shiftsWorked || 0).toLocaleString()} shifts`
        : fmtCurrency((u.wallet?.balance ?? 0) + (type === "net" ? (u.bank?.balance ?? 0) : 0));
    return `${Mascot.Emotes.Think} You are ranked **#${idx + 1}** — ${val}`;
}

function buildTabRow(active: LbType, ownerId: string, disabled = false) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(lbId("net", ownerId))
            .setLabel("Net Worth")
            .setStyle(active === "net" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(Mascot.Emotes.Graph)
            .setDisabled(disabled || active === "net"),
        new ButtonBuilder()
            .setCustomId(lbId("cash", ownerId))
            .setLabel("Cash Only")
            .setStyle(active === "cash" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(Mascot.Emotes.Currency)
            .setDisabled(disabled || active === "cash"),
        new ButtonBuilder()
            .setCustomId(lbId("employees", ownerId))
            .setLabel("Top Employees")
            .setStyle(active === "employees" ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji(Mascot.Emotes.JobWorking)
            .setDisabled(disabled || active === "employees"),
    );
}

function buildLeaderboardContainer(users: any[], type: LbType, ownerId: string, expired = false) {
    const thumbUrl = getEmoteUrl(type === "employees" ? Mascot.Emotes.JobWorking : Mascot.Emotes.Money);
    const rankings = buildRankingsText(users, type);
    const yourRank = buildYourRankText(users, ownerId, type);

    const header = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.MedalGold} ${TITLES[type]}`),
        new TextDisplayBuilder().setContent(SUBTITLES[type]),
    );
    if (thumbUrl) {
        header.setThumbnailAccessory(
            new ThumbnailBuilder().setURL(thumbUrl).setDescription(TITLES[type]),
        );
    }

    const container = new ContainerBuilder()
        .setAccentColor(ACCENT[type])
        .addSectionComponents(header)
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(rankings));

    if (yourRank) {
        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${yourRank}`));
    }

    container
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(buildTabRow(type, ownerId, expired));

    return container;
}

export async function handleLeaderboard(message: Message, args: string[]) {
    const ownerId = message.author.id;

    let currentType: LbType = "net";
    const arg = args[0]?.toLowerCase();
    if (arg === "cash") currentType = "cash";
    if (arg === "work" || arg === "shift" || arg === "employees" || arg === "employee") currentType = "employees";

    const users = await prisma.user.findMany({
        include: { wallet: true, bank: true },
    });

    const sent = await message.reply({
        components: [buildLeaderboardContainer(users, currentType, ownerId)],
        flags: MessageFlags.IsComponentsV2,
    });

    const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000,
    });

    collector.on("collect", async (i) => {
        if (i.user.id !== ownerId) {
            await i.reply({ content: "This leaderboard was opened by someone else.", ephemeral: true });
            return;
        }
        const parts = i.customId.split(":");
        currentType = (parts[1] as LbType) ?? currentType;
        await i.update({
            components: [buildLeaderboardContainer(users, currentType, ownerId)],
            flags: MessageFlags.IsComponentsV2,
        });
    });

    collector.on("end", async () => {
        try {
            await sent.edit({
                components: [buildLeaderboardContainer(users, currentType, ownerId, true)],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch { }
    });
}
