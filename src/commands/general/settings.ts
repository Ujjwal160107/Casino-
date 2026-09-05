import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ContainerBuilder,
    Message,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} from "discord.js";
import prisma from "../../utils/prisma";
import { ensureUserAndWallet } from "../../services/walletService";
import {
    DM_NOTICE_TYPES,
    DmNoticeType,
    isDmNoticeType,
    getDmPrefs,
    setNoticeTypeEnabled,
    setMasterEnabled,
} from "../../services/dmPrefsService";

const TYPE_ORDER: DmNoticeType[] = ["daily", "weekly", "monthly", "crime", "hunt", "work", "vote"];

function buildSettingsPayload(
    ownerId: string,
    prefs: { remindersEnabled: boolean; disabledReminders: string[] },
    autoPaused: boolean,
) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("## Your Settings — Cooldown alarms"),
            new TextDisplayBuilder().setContent(
                "Fortuna DMs you the moment these cooldowns lift. Toggle what you want.",
            ),
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
        );

    if (autoPaused) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "-# Reminders are currently off. If your DMs were closed, allow DMs from server members, then turn the master switch back on.",
            ),
        );
    }

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            "-# Security alerts (robbery, padlock) are always on.",
        ),
    );

    const masterRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`settings:master:${ownerId}`)
            .setLabel(prefs.remindersEnabled ? "All reminders: ON" : "All reminders: OFF")
            .setStyle(prefs.remindersEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
    );

    const typeButton = (type: DmNoticeType) => {
        const on = prefs.remindersEnabled && !prefs.disabledReminders.includes(type);
        return new ButtonBuilder()
            .setCustomId(`settings:toggle:${type}:${ownerId}`)
            .setLabel(`${DM_NOTICE_TYPES[type].label}: ${on ? "ON" : "OFF"}`)
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!prefs.remindersEnabled);
    };

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...TYPE_ORDER.slice(0, 4).map(typeButton),
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...TYPE_ORDER.slice(4).map(typeButton),
    );

    return {
        components: [container, masterRow, row1, row2],
        flags: MessageFlags.IsComponentsV2 as number,
        allowedMentions: { parse: [] },
    };
}

async function loadPrefsWithPauseFlag(discordId: string) {
    const user = await prisma.user.findUnique({
        where: { discordId },
        select: { remindersEnabled: true, disabledReminders: true },
    });
    const prefs = {
        remindersEnabled: user?.remindersEnabled ?? true,
        disabledReminders: user?.disabledReminders ?? [],
    };
    // Auto-pause (closed DMs) leaves the master off; we can't distinguish it
    // from a manual off, so the hint shows whenever the master is off — the
    // advice is accurate in both cases.
    return { prefs, autoPaused: !prefs.remindersEnabled };
}

export async function handleSettings(message: Message) {
    if (!message.guildId) return;
    await ensureUserAndWallet(message.author.id, message.guildId, message.author.tag);
    const { prefs, autoPaused } = await loadPrefsWithPauseFlag(message.author.id);
    return message.reply(buildSettingsPayload(message.author.id, prefs, autoPaused));
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

    const { prefs, autoPaused } = await loadPrefsWithPauseFlag(ownerId);
    return interaction.update(buildSettingsPayload(ownerId, prefs, autoPaused)).catch(() => {});
}
