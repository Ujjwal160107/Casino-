import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
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
import { Mascot, getEmoteUrl } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import {
    DM_NOTICE_TYPES,
    DmNoticeGroup,
    DmNoticeType,
    DmPrefs,
    getDmPrefs,
    isDmNoticeType,
    isNoticeEnabled,
    noticeTypesInGroup,
    setMasterEnabled,
    setNoticeTypeEnabled,
} from "../../services/dmPrefsService";

const GROUPS: { group: DmNoticeGroup; heading: string }[] = [
    { group: "cooldown", heading: "Cooldown alarms" },
    { group: "account", heading: "Account notices" },
];
const BUTTONS_PER_ROW = 4;

function chunk<T>(items: T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
    return rows;
}

function divider() {
    return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

/** The whole panel is one container; every button row lives inside it. */
export function buildSettingsPayload(ownerId: string, prefs: DmPrefs) {
    const container = new ContainerBuilder();
    const intro = "## Your Settings\nFortuna DMs you when these happen. Toggle what you want.";
    const thumb = getEmoteUrl(Mascot.Emotes.Settings);
    if (thumb) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(intro))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)),
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(intro));
    }

    // Auto-pause (closed DMs) leaves the master off; we can't distinguish it
    // from a manual off, so the hint shows whenever the master is off — the
    // advice is accurate in both cases.
    if (!prefs.remindersEnabled) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "-# Reminders are currently off. If your DMs were closed, allow DMs from server members, then turn the master switch back on.",
            ),
        );
    }

    container.addSeparatorComponents(divider());
    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`settings:master:${ownerId}`)
                .setLabel(prefs.remindersEnabled ? "All DMs: ON" : "All DMs: OFF")
                .setStyle(prefs.remindersEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
        ),
    );

    const typeButton = (type: DmNoticeType) => {
        const on = isNoticeEnabled(prefs, type);
        return new ButtonBuilder()
            .setCustomId(`settings:toggle:${type}:${ownerId}`)
            .setLabel(`${DM_NOTICE_TYPES[type].label}: ${on ? "ON" : "OFF"}`)
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!prefs.remindersEnabled);
    };

    for (const { group, heading } of GROUPS) {
        container.addSeparatorComponents(divider());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${heading}`));
        for (const row of chunk(noticeTypesInGroup(group), BUTTONS_PER_ROW)) {
            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(...row.map(typeButton)),
            );
        }
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent("-# Security alerts (robbery, padlock, tax raid) are always on."),
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as number,
        allowedMentions: { parse: [] },
    };
}

export async function handleSettings(message: Message) {
    if (!message.guildId) return;
    await ensureUserAndWallet(message.author.id, message.guildId, message.author.tag);
    const prefs = await getDmPrefs(message.author.id);
    return message.reply(buildSettingsPayload(message.author.id, prefs));
}

export async function handleSettingsInteraction(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":"); // settings:master:<owner> | settings:toggle:<type>:<owner>
    const action = parts[1];
    const ownerId = parts[parts.length - 1];

    if (interaction.user.id !== ownerId) {
        return interaction.reply({
            content: "These settings belong to someone else. Run `settings` yourself.",
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
    }

    if (action === "master") {
        const prefs = await getDmPrefs(ownerId);
        await setMasterEnabled(ownerId, !prefs.remindersEnabled);
    } else if (action === "toggle") {
        const type = parts[2];
        if (!isDmNoticeType(type)) {
            return interaction.reply({ content: "Unknown setting.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        const prefs = await getDmPrefs(ownerId);
        const currentlyOn = !prefs.disabledReminders.includes(type);
        await setNoticeTypeEnabled(ownerId, type, !currentlyOn);
    } else {
        return interaction.reply({ content: "Unknown setting.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const prefs = await getDmPrefs(ownerId);
    return interaction.update(buildSettingsPayload(ownerId, prefs)).catch(() => {});
}
