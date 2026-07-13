import {
    Message,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder
} from "discord.js";
import { getJob, getJobPaySync, getRequiredGearKey, getPromotionProgress } from "../../services/jobService";
import { getSectorReputation } from "../../services/jobReputationService";
import { JOB_SHOP_CATALOG } from "../../utils/shopCatalog";
import { seedJobShop } from "../../services/shopService";
import { Mascot } from "../../config/branding";
import { globalCatalogGuildFilter } from "../../utils/globalCatalog";
import prisma from "../../utils/prisma";
import { fmtCurrency } from "../../utils/format";
import { getGuildPrefix } from "../../utils/guildContext";

function hexColorToNumber(color: unknown, fallback = 0x9B59B6) {
    if (typeof color === "number") return color;
    if (typeof color === "string") {
        const normalized = color.replace("#", "");
        const parsed = Number.parseInt(normalized, 16);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return fallback;
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function getStressColor(stress: number) {
    if (stress < 30) return "<:n_check:1451281806279311435>";
    if (stress < 70) return "<:alert_sign:1455458789934235738>";
    return "<:rip:1456569015639212032>";
}

export async function handleWork(message: Message) {
    if (!message.guild) return;
    const prefix = await getGuildPrefix(message.guild.id);

    const user = await prisma.user.findUnique({
        where: { discordId: message.author.id }
    });

    if (!user) return;

    if (!user.jobId) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${Mascot.Emotes.JobWorking} Employment Status`),
                new TextDisplayBuilder().setContent(`**Position:** Unemployed\nUse \`${prefix}jobs\` to browse available careers and apply.`)
            );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const job = getJob(user.jobId);
    if (!job) {
        return message.reply("Error: Your job ID is invalid. Please contact admin.");
    }

    // Promotion progress (lifetime-shift-based)
    const promo = await getPromotionProgress(
        { jobId: user.jobId, shiftsWorked: user.shiftsWorked },
        message.guildId!
    );

    // Reputation for this sector
    const repData = await getSectorReputation(user.discordId, job.sector);
    const repLine = `\n**Reputation:** ${repData.rep} — ${repData.tier.name}` +
      (repData.nextTier ? ` (${repData.repToNext} to ${repData.nextTier.name})` : " — Max Tier");

    // Gear status check
    let gearStatusLine = "";
    const gearKey = getRequiredGearKey(job.sector);
    if (gearKey && message.guildId) {
        await seedJobShop(message.guildId);
        const gearCatalogItem = JOB_SHOP_CATALOG.find(i => i.key === gearKey);
        if (gearCatalogItem) {
            const gearInDb = await prisma.shopItem.findFirst({
                where: globalCatalogGuildFilter({
                    name: { equals: gearCatalogItem.name, mode: "insensitive" },
                }),
            });
            const invRow = gearInDb
                ? await prisma.inventory.findUnique({
                    where: { userId_shopItemId: { userId: user.discordId, shopItemId: gearInDb.id } }
                })
                : null;
            if (!invRow || invRow.amount < 1) {
                gearStatusLine = `\n**Gear:** ${gearCatalogItem.name} — Missing — buy from \`!shop job\``;
            } else {
                const durability = (invRow.meta as any)?.durability ?? 100;
                if (durability <= 0) {
                    gearStatusLine = `\n**Gear:** ${gearCatalogItem.name} — Broken (0/100) — use Repair Coupon`;
                } else {
                    gearStatusLine = `\n**Gear:** ${gearCatalogItem.name} — Ready (${durability}/100)`;
                }
            }
        }
    }

    // Career progress section
    let careerProgressContent: string;
    if (promo.eligible && promo.nextJob) {
        careerProgressContent =
            `### ${Mascot.Emotes.JobPromotion} PROMOTION READY\n` +
            `**${promo.nextJob.title}** is waiting for you.\n` +
            `Click **Promote** to advance your career now.`;
    } else if (promo.nextJob) {
        const reqShifts = promo.nextJob.reqShifts ?? 0;
        const shiftPct = Math.min(100, Math.floor((reqShifts - promo.missingShifts) / Math.max(1, reqShifts) * 100));
        const filled = Math.round(shiftPct / 10);
        const bar = "`[" + "█".repeat(filled) + "░".repeat(10 - filled) + "]`";
        careerProgressContent =
            `### Career Progress\n` +
            `Next: **${promo.nextJob.title}**\n` +
            `${bar} ${shiftPct}%\n` +
            promo.progressText;
    } else {
        careerProgressContent = `### Career Progress\n${promo.progressText}`;
    }

    const accentColor = promo.eligible ? 0xF1C40F : hexColorToNumber(Mascot.Colors.Base);

    const container = new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## ${job.emoji} ${job.title}`),
                    new TextDisplayBuilder().setContent(
                        `**Sector:** ${capitalize(job.sector)} | **Level:** ${job.level}\n` +
                        `**Pay:** ${fmtCurrency(getJobPaySync(job))}/shift`
                    )
                )
                .setThumbnailAccessory((thumbnail) =>
                    thumbnail
                        .setURL(message.author.displayAvatarURL({ size: 256 }))
                        .setDescription(`${message.author.username}'s avatar`)
                )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### Shift Status\n` +
                `**Lifetime Shifts:** ${user.shiftsWorked}  |  **Streak:** ${user.jobStreak ?? 0}\n` +
                `**Stress:** ${getStressColor(user.jobStress ?? 0)} ${user.jobStress ?? 0}/100` +
                gearStatusLine +
                repLine
            ),
            new TextDisplayBuilder().setContent(careerProgressContent)
        );

    const buttons: ButtonBuilder[] = [
        new ButtonBuilder().setCustomId("work_shift").setLabel("Start Shift").setStyle(ButtonStyle.Success).setEmoji(Mascot.Emotes.JobWorking),
    ];
    if (promo.eligible && promo.nextJob) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`work_promote_${promo.nextJob.id}`)
                .setLabel(`Promote → ${promo.nextJob.title}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(Mascot.Emotes.JobPromotion)
        );
    }
    buttons.push(
        new ButtonBuilder().setCustomId("work_resign").setLabel("Resign").setStyle(ButtonStyle.Danger)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
}
