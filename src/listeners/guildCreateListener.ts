import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ContainerBuilder,
  Guild,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  TextChannel,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { Mascot } from "../config/branding";

export const guildCreateListener = (client: Client) => {
  console.log("Guild Create Listener Registered");

  client.on("guildCreate", async (guild: Guild) => {
    console.log(`[GuildCreate] Bot joined guild: ${guild.name} (${guild.id})`);

    try {
      const heading = `## Thanks for adding ${Mascot.Name}!`;
      const body =
        `I'm here to handle your server's economy, games, and life systems.\n\n` +
        `Here are some quick links to help you get started:\n\n` +
        "**Getting Started:** Use `!help` to browse commands and `!set-prefix` if you want a different prefix.\n" +
        `**Documentation:** [Docs](${Mascot.Links.Docs})\n` +
        `**Support:** [Support Server](${Mascot.Links.Support})`;

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel("Documentation").setStyle(ButtonStyle.Link).setURL(Mascot.Links.Docs),
        new ButtonBuilder().setLabel("Support Server").setStyle(ButtonStyle.Link).setURL(Mascot.Links.Support)
      );

      const container = new ContainerBuilder();
      const avatarUrl = client.user?.displayAvatarURL();
      if (avatarUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(heading),
              new TextDisplayBuilder().setContent(body),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
        );
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(heading),
          new TextDisplayBuilder().setContent(body),
        );
      }
      container.addActionRowComponents(row);

      let targetChannel: TextChannel | null = null;
      const me = guild.members.me;
      if (!me) return;

      if (guild.systemChannel && guild.systemChannel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel])) {
        targetChannel = guild.systemChannel;
      } else {
        const channel = guild.channels.cache.find((candidate) =>
          (candidate.type === ChannelType.GuildText || candidate.type === ChannelType.GuildAnnouncement) &&
          candidate.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
        );

        if (channel) {
          targetChannel = channel as TextChannel;
        }
      }

      if (targetChannel) {
        await targetChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
    } catch (error) {
      console.error(`[GuildCreate] Error sending welcome message in ${guild.name}:`, error);
    }
  });
};
