import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  PermissionFlagsBits,
  TextChannel
} from "discord.js";
import { Mascot } from "../config/branding";

export const guildCreateListener = (client: Client) => {
  console.log("Guild Create Listener Registered");

  client.on("guildCreate", async (guild: Guild) => {
    console.log(`[GuildCreate] Bot joined guild: ${guild.name} (${guild.id})`);

    try {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`Thanks for adding ${Mascot.Name}!`)
        .setDescription(
          `I'm here to handle your server's economy, games, and life systems.\n\nHere are some quick links to help you get started:`
        )
        .addFields(
          { name: "Getting Started", value: "Use `!help` to browse commands and `!set-prefix` if you want a different prefix.", inline: false },
          { name: "Documentation", value: `[Docs](${Mascot.Links.Docs})`, inline: true },
          { name: "Support", value: `[Support Server](${Mascot.Links.Support})`, inline: true }
        )
        .setColor(0x9b59b6)
        .setThumbnail(client.user?.displayAvatarURL() || "")
        .setFooter({ text: "Let's make this server awesome!" })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel("Documentation").setStyle(ButtonStyle.Link).setURL(Mascot.Links.Docs),
        new ButtonBuilder().setLabel("Support Server").setStyle(ButtonStyle.Link).setURL(Mascot.Links.Support)
      );

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
        await targetChannel.send({ embeds: [welcomeEmbed], components: [row] });
      }
    } catch (error) {
      console.error(`[GuildCreate] Error sending welcome message in ${guild.name}:`, error);
    }
  });
};
