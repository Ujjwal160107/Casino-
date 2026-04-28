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
import prisma from "../utils/prisma";
import { Mascot } from "../config/branding";
import { ensureUserAndWallet } from "./walletService";

const FEEDBACK_FORM_URL = "https://forms.gle/sWAH2EyWVNhu3eYV7";
const REMINDER_ACCENT_COLOR = 0x9B59B6;
const REMINDER_LIMIT_PER_DAY = 2;

const EXCLUDED_COMMANDS = new Set([
  "global-announcement-preview",
  "globalannouncementpreview",
  "fortuna-global-preview",
  "fortunaglobalpreview",
  "global-announcement-send",
  "globalannouncementsend",
  "fortuna-global-send",
  "fortunaglobalsend",
]);

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function getUtcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildReminderContainer() {
  return new ContainerBuilder()
    .setAccentColor(REMINDER_ACCENT_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${Mascot.Emotes.Alert} Did you read Fortuna's recent alert?`,
      ),
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${Mascot.Emotes.FortunaSparkle} Fortuna is preparing to go global. This means moving toward a shared global economy across servers instead of every server having a fully separate economy.\n\n` +
        `${Mascot.Emotes.GraphUp} That can unlock bigger markets, wider competition, cross-server progression, and a lot of future improvements.\n\n` +
        `${Mascot.Emotes.Scroll} Please spend 2 minutes filling the feedback form so the devs know what to improve before this rollout.`,
      ),
    );
}

function buildReminderButtons() {
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
    new ButtonBuilder()
      .setCustomId("global_economy_form_filled")
      .setLabel("Yes, I filled the form")
      .setStyle(ButtonStyle.Success)
      .setEmoji(Mascot.Emotes.Accept),
  );
}

function buildReminderPayload(ephemeral = false) {
  return {
    components: [buildReminderContainer(), buildReminderButtons()],
    flags: ephemeral ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function normalizeCommand(commandContent: string) {
  return commandContent.trim().split(/\s+/)[0]?.toLowerCase() || "";
}

export async function maybeSendGlobalEconomyReminder(message: Message, commandContent: string) {
  if (!message.guildId || message.author.bot) return;

  const command = normalizeCommand(commandContent);
  if (!command || EXCLUDED_COMMANDS.has(command)) return;

  const user = await ensureUserAndWallet(message.author.id, message.guildId, message.author.tag);
  const fullUser = await prisma.user.findUnique({
    where: { discordId_guildId: { discordId: message.author.id, guildId: message.guildId } },
    select: {
      id: true,
      globalAnnouncementFormFilled: true,
      globalAnnouncementReminderDate: true,
      globalAnnouncementReminderCount: true,
    },
  });

  if (!fullUser || (fullUser.globalAnnouncementFormFilled ?? false)) return;

  const today = getUtcDayStart();
  const reminderDate = fullUser.globalAnnouncementReminderDate ? getUtcDayStart(fullUser.globalAnnouncementReminderDate) : null;
  const isSameDay = reminderDate?.getTime() === today.getTime();
  const reminderCount = isSameDay ? (fullUser.globalAnnouncementReminderCount ?? 0) : 0;

  if (reminderCount >= REMINDER_LIMIT_PER_DAY) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      globalAnnouncementReminderDate: today,
      globalAnnouncementReminderCount: reminderCount + 1,
    },
  });

  await message.reply(buildReminderPayload()).catch(() => { });
}

export async function handleGlobalEconomyReminderInteraction(interaction: ButtonInteraction) {
  if (!interaction.guildId) {
    return interaction.reply({
      content: "This reminder can only be updated inside a server.",
      ephemeral: true,
    });
  }

  await ensureUserAndWallet(interaction.user.id, interaction.guildId, interaction.user.tag);
  await prisma.user.update({
    where: { discordId_guildId: { discordId: interaction.user.id, guildId: interaction.guildId } },
    data: {
      globalAnnouncementFormFilled: true,
      globalAnnouncementReminderDate: getUtcDayStart(),
      globalAnnouncementReminderCount: REMINDER_LIMIT_PER_DAY,
    },
  });

  return interaction.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x2ECC71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${Mascot.Emotes.Accept} Thank you!**`),
          new TextDisplayBuilder().setContent("I will stop showing you the global economy reminder in this server."),
        ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}
