import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  Guild,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import { Mascot } from "../../config/branding";
import { BOT_DEVELOPER_ID } from "../../utils/developerAccess";

const FEEDBACK_FORM_URL = "https://forms.gle/sWAH2EyWVNhu3eYV7";
const ANNOUNCEMENT_ACCENT_COLOR = 0x9B59B6;

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildAnnouncementContainer() {
  return new ContainerBuilder()
    .setAccentColor(ANNOUNCEMENT_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.Casino} Fortuna Dev Announcement\n` +
        `> Fortuna devs have something to tell you: **Fortuna is going global.**`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${Mascot.Emotes.FortunaSparkle} By global, we mean a shared Fortuna economy across servers instead of each server staying fully separate with its own isolated economy.\n\n` +
        `${Mascot.Emotes.GraphUp} This opens the door for bigger markets, wider competition, cross-server progression, and a stronger long-term economy for everyone.\n\n` +
        `${Mascot.Emotes.Scroll} There is still a lot of scope for improvement, so before we move further we want feedback from the people already using Fortuna: what feels good, what feels confusing, what should be added, and what needs polishing.\n\n` +
        `${Mascot.Emotes.FortunaThink} Please take a moment to share your thoughts through the feedback form. If you have bigger suggestions, bug reports, or want to talk directly with the team, join the support server.`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${Mascot.Emotes.Accept} Your feedback will help shape Fortuna before the global launch.\n` +
        `${Mascot.Emotes.Love} Thank you for building with us early.`,
      ),
    );
}

function buildAnnouncementButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Feedback Form")
      .setStyle(ButtonStyle.Link)
      .setEmoji(Mascot.Emotes.Pencil)
      .setURL(FEEDBACK_FORM_URL),
    new ButtonBuilder()
      .setLabel("Support Server")
      .setStyle(ButtonStyle.Link)
      .setEmoji(Mascot.Emotes.Channel)
      .setURL(Mascot.Links.Support),
  );
}

function buildAnnouncementPayload() {
  return {
    components: [buildAnnouncementContainer(), buildAnnouncementButtons()],
    flags: MessageFlags.IsComponentsV2 as const,
    allowedMentions: { parse: [] },
  };
}

function buildStatusContainer(title: string, body: string, color = ANNOUNCEMENT_ACCENT_COLOR) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body),
    );
}

function canPostToChannel(guild: Guild, channel: any) {
  if (!channel || !("send" in channel)) return false;
  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;

  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  return permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false;
}

async function findAnnouncementChannel(guild: Guild) {
  await guild.channels.fetch().catch(() => null);

  const generalChannel = guild.channels.cache.find((channel: any) =>
    channel.name?.toLowerCase() === "general" && canPostToChannel(guild, channel),
  );
  if (generalChannel) return { channel: generalChannel as any, source: "general" as const };

  if (guild.systemChannel && canPostToChannel(guild, guild.systemChannel)) {
    return { channel: guild.systemChannel, source: "system" as const };
  }

  const fallbackChannel = guild.channels.cache.find((channel: any) => canPostToChannel(guild, channel)) as any;
  return fallbackChannel
    ? { channel: fallbackChannel, source: "fallback" as const }
    : null;
}

function isOwner(message: Message) {
  return message.author.id === BOT_DEVELOPER_ID;
}

export async function handleGlobalAnnouncementPreview(message: Message) {
  if (!isOwner(message)) {
    return message.reply({
      components: [buildStatusContainer("No Permission", "Only the bot owner can preview this global announcement.", 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  return message.reply(buildAnnouncementPayload());
}

export async function handleGlobalAnnouncementSend(message: Message) {
  if (!isOwner(message)) {
    return message.reply({
      components: [buildStatusContainer("No Permission", "Only the bot owner can send this global announcement.", 0xE74C3C)],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  const results = {
    totalServers: message.client.guilds.cache.size,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    sentToGeneralChannels: 0,
    sentToSystemChannels: 0,
    sentToFallbackChannels: 0,
    failures: [] as string[],
  };

  const formatProgress = (currentGuild?: string) =>
    `Servers found: **${results.totalServers}**\n` +
    `Processed: **${results.processed}/${results.totalServers}**\n` +
    `Sent: **${results.sent}**\n` +
    `- General fallback: **${results.sentToGeneralChannels}**\n` +
    `- System fallback: **${results.sentToSystemChannels}**\n` +
    `- Other fallback: **${results.sentToFallbackChannels}**\n` +
    `Skipped: **${results.skipped}**\n` +
    `Failed: **${results.failed}**` +
    (currentGuild ? `\n\nCurrent server: **${currentGuild}**` : "");

  const progress = await message.reply({
    components: [buildStatusContainer("Global Announcement Progress", formatProgress("Starting broadcast..."))],
    flags: MessageFlags.IsComponentsV2,
  });

  let lastProgressEdit = 0;
  const updateProgress = async (currentGuild?: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressEdit < 1500 && results.processed < results.totalServers) return;
    lastProgressEdit = now;

    await progress.edit({
      components: [
        buildStatusContainer(
          "Global Announcement Progress",
          formatProgress(currentGuild),
          results.failed || results.skipped ? 0xF1C40F : ANNOUNCEMENT_ACCENT_COLOR,
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => { });
  };

  await updateProgress("Starting broadcast...", true);

  for (const guild of message.client.guilds.cache.values()) {
    await updateProgress(guild.name);

    try {
      const target = await findAnnouncementChannel(guild);
      if (!target) {
        results.skipped += 1;
        results.failures.push(`${guild.name}: no sendable general/system/fallback channel`);
        results.processed += 1;
        continue;
      }

      await target.channel.send(buildAnnouncementPayload());
      results.sent += 1;
      if (target.source === "general") results.sentToGeneralChannels += 1;
      if (target.source === "system") results.sentToSystemChannels += 1;
      if (target.source === "fallback") results.sentToFallbackChannels += 1;
    } catch (err) {
      results.failed += 1;
      results.failures.push(`${guild.name}: ${(err as Error).message}`);
    } finally {
      results.processed += 1;
      await updateProgress(guild.name);
    }
  }

  const failureText = results.failures.length > 0
    ? `\n\n**Notes:**\n${results.failures.slice(0, 8).map((failure) => `- ${failure}`).join("\n")}${results.failures.length > 8 ? "\n- More failures omitted from this summary." : ""}`
    : "";

  return progress.edit({
    components: [
      buildStatusContainer(
        "Global Announcement Complete",
        `${formatProgress()}${failureText}`,
        results.failed || results.skipped ? 0xF1C40F : 0x2ECC71,
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}
