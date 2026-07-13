import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { checkJailStatus, payBail } from "../../services/jailService";
import { ensureUserAndWallet } from "../../services/walletService";
import { fmtCurrency, formatDuration } from "../../utils/format";
import { successContainer, errorContainer, infoContainer, statusContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { DEFAULT_JAIL_FINE } from "../../utils/economyConfig";

const POLICE_EMOTE = "<:fortuna_police:1457053051582939237>";

export async function handleJail(message: Message) {
    const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);

    const status = await checkJailStatus(user.discordId);

    if (!status.isJailed) {
        return message.reply(
            v2Reply(infoContainer("Clean Record", "You are currently **not** in jail."))
        );
    }

    const desc = [
        "You are currently incarcerated.",
        `**Release In:** ${status.releaseTime ? `<t:${Math.floor(status.releaseTime.getTime() / 1000)}:R>` : "N/A"}`,
        `**Bail Cost:** ${fmtCurrency(DEFAULT_JAIL_FINE)}`,
    ].join("\n");

    const container = statusContainer("info", `${POLICE_EMOTE} JAIL STATUS`, desc, {
        thumbnailUrl: "https://cdn.discordapp.com/emojis/1457053051582939237.png",
        hint: nextStepHint("jail"),
    });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("pay_bail")
                .setLabel(`Pay Bail (${fmtCurrency(DEFAULT_JAIL_FINE, "")})`)
                .setStyle(ButtonStyle.Danger)
        );

    container.addActionRowComponents(row);

    return message.reply(v2Reply(container));
}

export async function handleBail(message: Message) {
    const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);
    const status = await checkJailStatus(user.discordId);

    if (!status.isJailed) {
        return message.reply(
            v2Reply(errorContainer("Not Jailed", "You are not in jail, why are you trying to pay bail?"))
        );
    }

    const result = await payBail(user.discordId, message.guildId!);

    if (result.success) {
        return message.reply(
            v2Reply(successContainer("Bail Paid", result.message, { hint: nextStepHint("bail") }))
        );
    } else {
        return message.reply(
            v2Reply(errorContainer("Bail Failed", result.message))
        );
    }
}
