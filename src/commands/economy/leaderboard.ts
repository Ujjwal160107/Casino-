import {
    ActionRowBuilder,
    ComponentType,
    ContainerBuilder,
    Message,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";
import { getNetWorthMany, NetWorthBreakdown } from "../../services/netWorthService";

type LbType = "net" | "cash" | "bank" | "shifts" | "passive";

const TITLES: Record<LbType, string> = {
    net: "Net Worth Leaderboard",
    cash: "Cash Leaderboard",
    bank: "Bank Leaderboard",
    shifts: "Top Workers",
    passive: "Passive Income Leaderboard",
};

const SUBTITLES: Record<LbType, string> = {
    net: "True net worth — everything you own, priced",
    cash: "Highest wallet balance",
    bank: "Bank balance + active FD/RD deposits",
    shifts: "Most lifetime shifts worked",
    passive: "Highest income per day — property rent + zoo",
};

type LbUser = {
    discordId: string;
    username: string | null;
    walletBalance: number;
    bankBalance: number;
    shiftsWorked: number;
    net?: NetWorthBreakdown;
};

function rankLabel(i: number): string {
    if (i === 0) return Mascot.Emotes.MedalGold;
    if (i === 1) return Mascot.Emotes.MedalSilver;
    if (i === 2) return Mascot.Emotes.MedalBronze;
    return `**${i + 1}.**`;
}

function valueOf(u: LbUser, type: LbType): number {
    switch (type) {
        case "net": return u.net?.total ?? (u.walletBalance + u.bankBalance);
        case "cash": return u.walletBalance;
        case "bank": return u.bankBalance + (u.net?.investments ?? 0);
        case "shifts": return u.shiftsWorked;
        case "passive": return u.net?.passiveIncomePerDay ?? 0;
    }
}

function formatValue(u: LbUser, type: LbType): string {
    if (type === "shifts") return `${u.shiftsWorked.toLocaleString()} shifts`;
    if (type === "passive") return `${fmtCurrency(valueOf(u, type))}/day`;
    return fmtCurrency(valueOf(u, type));
}

function sortUsers(users: LbUser[], type: LbType): LbUser[] {
    return [...users].sort((a, b) => valueOf(b, type) - valueOf(a, type));
}

function buildRankingsText(users: LbUser[], type: LbType): string {
    const top10 = sortUsers(users, type).slice(0, 10);
    if (top10.length === 0) return "No players found.";
    return top10
        .map((u, i) => {
            const name = (u.username ?? "Unknown").replace(/`/g, "");
            return `${rankLabel(i)} \`${name}\` — ${formatValue(u, type)}`;
        })
        .join("\n");
}

function buildYourRankText(users: LbUser[], ownerId: string, type: LbType): string | null {
    const sorted = sortUsers(users, type);
    const idx = sorted.findIndex((u) => u.discordId === ownerId);
    if (idx === -1) return null;
    const u = sorted[idx];
    return `${Mascot.Emotes.Think} You are ranked **#${idx + 1}** — ${formatValue(u, type)}`;
}

function buildTypeSelect(active: LbType, ownerId: string, disabled = false) {
    const options: [LbType, string, string][] = [
        ["net", "Net Worth", "Everything you own, priced"],
        ["cash", "Cash", "Wallet only"],
        ["bank", "Bank", "Bank + FD/RD deposits"],
        ["passive", "Passive Income", "Income per day — rent + zoo"],
        ["shifts", "Shifts", "Lifetime shifts worked"],
    ];
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`lb:type:${ownerId}`)
            .setPlaceholder("Board")
            .setDisabled(disabled)
            .addOptions(options.map(([value, label, description]) =>
                new StringSelectMenuOptionBuilder()
                    .setValue(value)
                    .setLabel(label)
                    .setDescription(description)
                    .setDefault(value === active),
            )),
    );
}

function buildLeaderboardContainer(
    users: LbUser[],
    type: LbType,
    ownerId: string,
    expired = false,
) {
    const thumbUrl = getEmoteUrl(type === "shifts" ? Mascot.Emotes.JobWorking : Mascot.Emotes.Money);

    const header = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.MedalGold} ${TITLES[type]}`),
        new TextDisplayBuilder().setContent(`${SUBTITLES[type]} · Global`),
    );
    if (thumbUrl) {
        header.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl).setDescription(TITLES[type]));
    }

    const container = new ContainerBuilder()
        .addSectionComponents(header)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildRankingsText(users, type)));

    const yourRank = buildYourRankText(users, ownerId, type);
    if (yourRank) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(yourRank));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(buildTypeSelect(type, ownerId, expired));

    return container;
}

async function loadUsers(): Promise<LbUser[]> {
    const users = await prisma.user.findMany({ include: { wallet: true, bank: true } });
    return users.map((u: any) => ({
        discordId: u.discordId,
        username: u.username ?? null,
        walletBalance: u.wallet?.balance ?? 0,
        bankBalance: u.bank?.balance ?? 0,
        shiftsWorked: u.shiftsWorked ?? 0,
    }));
}

async function attachNetWorth(users: LbUser[]): Promise<void> {
    const missing = users.filter((u) => !u.net);
    if (missing.length === 0) return;
    const map = await getNetWorthMany(missing.map((u) => u.discordId));
    for (const u of missing) {
        const b = map.get(u.discordId);
        if (b) u.net = b;
    }
}

export async function handleLeaderboard(message: Message, args: string[]) {
    const ownerId = message.author.id;

    let currentType: LbType = "net";
    const arg = args[0]?.toLowerCase();
    if (arg === "cash") currentType = "cash";
    if (arg === "bank") currentType = "bank";
    if (arg === "net") currentType = "net";
    if (arg === "shifts" || arg === "work" || arg === "shift" || arg === "employees" || arg === "employee") currentType = "shifts";

    // Global only. A server board needs the server's member list, which
    // requires the privileged GuildMembers intent Discord denied us.
    const allUsers = await loadUsers();

    const render = async (): Promise<ContainerBuilder> => {
        if (currentType === "net" || currentType === "bank" || currentType === "passive") {
            await attachNetWorth(allUsers);
        }
        return buildLeaderboardContainer(allUsers, currentType, ownerId);
    };

    const sent = await message.reply({
        components: [await render()],
        flags: MessageFlags.IsComponentsV2,
    });

    const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120_000,
    });

    collector.on("collect", async (i) => {
        if (i.user.id !== ownerId) {
            await i.reply({ content: "This leaderboard was opened by someone else.", ephemeral: true });
            return;
        }
        const kind = i.customId.split(":")[1];
        const value = i.values[0];
        if (kind === "type") currentType = value as LbType;
        await i.update({
            components: [await render()],
            flags: MessageFlags.IsComponentsV2,
        });
    });

    collector.on("end", async () => {
        try {
            await sent.edit({
                components: [buildLeaderboardContainer(allUsers, currentType, ownerId, true)],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch { }
    });
}
