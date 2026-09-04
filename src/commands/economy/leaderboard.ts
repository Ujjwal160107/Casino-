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
type LbScope = "global" | "server";

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

function buildScopeSelect(active: LbScope, ownerId: string, disabled = false) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`lb:scope:${ownerId}`)
            .setPlaceholder("Scope")
            .setDisabled(disabled)
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setValue("global").setLabel("Global")
                    .setDescription("Every Fortuna player, every server")
                    .setDefault(active === "global"),
                new StringSelectMenuOptionBuilder()
                    .setValue("server").setLabel("This Server")
                    .setDescription("Only players in this server")
                    .setDefault(active === "server"),
            ),
    );
}

function buildLeaderboardContainer(
    users: LbUser[],
    type: LbType,
    scope: LbScope,
    ownerId: string,
    expired = false,
) {
    const thumbUrl = getEmoteUrl(type === "shifts" ? Mascot.Emotes.JobWorking : Mascot.Emotes.Money);
    const scopeLabel = scope === "global" ? "Global" : "This server";

    const header = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.MedalGold} ${TITLES[type]}`),
        new TextDisplayBuilder().setContent(`${SUBTITLES[type]} · ${scopeLabel}`),
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
        .addActionRowComponents(buildTypeSelect(type, ownerId, expired))
        .addActionRowComponents(buildScopeSelect(scope, ownerId, expired));

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

    let currentScope: LbScope = "global";

    const allUsers = await loadUsers();
    let serverMemberIds: Set<string> | null = null;

    // Server scope needs the whole member list, which requires the privileged
    // GuildMembers intent we no longer hold. Fall back to global rather than
    // throwing, so the leaderboard still renders.
    const scopedUsers = async (): Promise<LbUser[]> => {
        if (currentScope === "global") return allUsers;
        if (!serverMemberIds) {
            try {
                const members = await message.guild!.members.fetch();
                serverMemberIds = new Set(members.keys());
            } catch {
                currentScope = "global";
                return allUsers;
            }
        }
        return allUsers.filter((u) => serverMemberIds!.has(u.discordId));
    };

    const render = async (): Promise<ContainerBuilder> => {
        const users = await scopedUsers();
        if (currentType === "net" || currentType === "bank" || currentType === "passive") {
            await attachNetWorth(users);
        }
        return buildLeaderboardContainer(users, currentType, currentScope, ownerId);
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
        if (kind === "scope") currentScope = value as LbScope;
        await i.update({
            components: [await render()],
            flags: MessageFlags.IsComponentsV2,
        });
    });

    collector.on("end", async () => {
        try {
            const users = await scopedUsers();
            await sent.edit({
                components: [buildLeaderboardContainer(users, currentType, currentScope, ownerId, true)],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch { }
    });
}
