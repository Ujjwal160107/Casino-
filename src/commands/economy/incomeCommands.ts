import { Message, EmbedBuilder, Colors, AttachmentBuilder } from "discord.js";
import { getEmoteUrl } from "../../config/branding";
import { ensureUserAndWallet } from "../../services/walletService";
import { runIncomeCommand } from "../../services/incomeService";
import { getGuildConfig } from "../../services/guildConfigService";
import { successEmbed, errorEmbed, baseEmbed } from "../../utils/embed";
import { fmtCurrency } from "../../utils/format";
import { logToChannel } from "../../utils/discordLogger";
import { Mascot } from "../../config/branding";
import path from "path";

const BEG_MESSAGES = [
  "A sketchy looking dude gave you **{amount}** because he thought you were one of his dealers.",
  "You found **{amount}** on the floor provided by the government.",
  "A nice old lady gave you **{amount}** and called you 'sweetie'.",
  "You did a backflip for **{amount}**. Worth it.",
  "Someone mistook you for a trash can and threw **{amount}** at you.",
  "You sang a song so bad they paid you **{amount}** to stop.",
  "You found **{amount}** in a fountain. Dreams do come true.",
  "A pigeon dropped **{amount}** on your head. Lucky?",
  "You begged for hours and finally got **{amount}**. Time is money?",
  "A time traveler gave you **{amount}** and said 'invest in doge'."
];

const BEG_FAIL_MESSAGES = [
  "You begged a cop and he fined you **{amount}** for loitering.",
  "Someone stole your begging cup. You lost **{amount}** replacing it.",
  "You tripped and dropped **{amount}** into a sewer.",
  "A stray dog peed on your leg. You spent **{amount}** on soap.",
  "You tried to beg from a statue. Passersby laughed and stole **{amount}**.",
  "You asked a mime for money. He invisibly robbed you of **{amount}**.",
  "You begged the wrong mafia boss. You paid **{amount}** for 'protection'."
];

const SLUT_MESSAGES = [
  "You did 'favors' for a stranger and earned **{amount}**.",
  "You posted feet pics and made **{amount}**.",
  "You sold your bath water for **{amount}**. Weirdo.",
  "You danced on a mailbox and someone threw **{amount}** at you.",
  "You worked the corner and made **{amount}**.",
  "You let someone call you 'mommy' for an hour and earned **{amount}**.",
  "You streamed on OnlyFans for 10 minutes and made **{amount}**.",
  "You sold a jar of your farts for **{amount}**. Capitalism, baby.",
  "You dated a discord mod and he gave you **{amount}** for Nitro.",
  "You wore a maid outfit to Walmart and strangers gave you **{amount}**.",
  "You sold your used socks to a sniffing enthusiast for **{amount}**.",
  "You whispered 'UWU' in a stranger's ear and they paid you **{amount}** to leave.",
  "You accidentally became a sugar baby and got **{amount}** allowance.",
  "You sold 'premium' snaps that were just pictures of your elbow for **{amount}**.",
  "You pretended to be an e-girl and scammed a simp for **{amount}**."
];

const SLUT_FAIL_MESSAGES = [
  "You tried to seduce a cop and got fined **{amount}**.",
  "Your 'client' ran off without paying. You lost **{amount}** on cab fare.",
  "You broke a heel running from the shame. Replacement cost: **{amount}**.",
  "You got caught by your mom! She took **{amount}** as punishment."
];


function getRandomMessage(messages: string[], amount: string): string {
  const msg = messages[Math.floor(Math.random() * messages.length)];
  return msg.replace("{amount}", amount);
}

export async function handleIncome(message: Message) {
  const [cmd] = message.content.slice(1).split(/\s+/);
  const commandKey = cmd.toLowerCase();

  if (!["work", "beg", "slut"].includes(commandKey)) {
    return message.reply({ embeds: [errorEmbed(message.author, "Unknown", "Use: !work, !beg or !slut")] });
  }

  const config = await getGuildConfig(message.guildId!);
  const emoji = config.currencyEmoji;
  const user = await ensureUserAndWallet(message.author.id, message.guildId!, message.author.tag);

  try {
    const res = await runIncomeCommand({
      commandKey,
      discordId: message.author.id,
      guildId: message.guildId ?? null,
      userId: user.id,
      walletId: user.wallet!.id
    });

    if (res.success) {
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ECONOMY",
        title: `Income Success (${commandKey})`,
        description: `**User:** ${message.author.tag}\n**Amount:** ${fmtCurrency(res.amount, emoji)}`,
        color: 0x00FF00
      });

      let description = `You earned **${fmtCurrency(res.amount, emoji)}**!`;

      // Use custom messages if available, otherwise fallback
      if (res.messages && res.messages.success && res.messages.success.length > 0) {
        description = getRandomMessage(res.messages.success, fmtCurrency(res.amount, emoji));
      } else if (commandKey === "beg") {
        description = getRandomMessage(BEG_MESSAGES, fmtCurrency(res.amount, emoji));
      } else if (commandKey === "slut") {
        description = getRandomMessage(SLUT_MESSAGES, fmtCurrency(res.amount, emoji));
      }

      const branded = successEmbed(message.author, `${commandKey.toUpperCase()} SUCCESS`, description);

      const files: AttachmentBuilder[] = [];

      if (commandKey === "beg") {
        const thumbPath = path.join(process.cwd(), "src", "assets", "beg_thumbnail.png");
        const attachment = new AttachmentBuilder(thumbPath, { name: "beg_thumbnail.png" });
        files.push(attachment);
        branded.setThumbnail("attachment://beg_thumbnail.png");
      } else {
        const moneyUrl = getEmoteUrl(Mascot.Emotes.Money);
        if (moneyUrl) branded.setThumbnail(moneyUrl);
      }

      return message.reply({ embeds: [branded], files });

    } else {
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "ECONOMY",
        title: `Income Failed (${commandKey})`,
        description: `**User:** ${message.author.tag}\n**Penalty:** ${fmtCurrency(Math.abs(res.amount), emoji)}`,
        color: 0xFF0000
      });

      let description = `You lost **${fmtCurrency(Math.abs(res.amount), emoji)}**!`;

      // Use custom messages if available, otherwise fallback
      if (res.messages && res.messages.fail && res.messages.fail.length > 0) {
        description = getRandomMessage(res.messages.fail, fmtCurrency(Math.abs(res.amount), emoji));
      } else if (commandKey === "beg") {
        description = getRandomMessage(BEG_FAIL_MESSAGES, fmtCurrency(Math.abs(res.amount), emoji));
      } else if (commandKey === "slut") {
        description = getRandomMessage(SLUT_FAIL_MESSAGES, fmtCurrency(Math.abs(res.amount), emoji));
      }

      const branded = errorEmbed(message.author, `${commandKey.toUpperCase()} FAILED`, description);

      const files: AttachmentBuilder[] = [];

      if (commandKey === "beg") {
        const thumbPath = path.join(process.cwd(), "src", "assets", "beg_thumbnail.png");
        const attachment = new AttachmentBuilder(thumbPath, { name: "beg_thumbnail.png" });
        files.push(attachment);
        branded.setThumbnail("attachment://beg_thumbnail.png");
      }

      return message.reply({
        embeds: [branded],
        files
      });
    }
  } catch (err) {
    // Cooldown or other errors
    const isCooldown = (err as Error).message.toLowerCase().includes("wait");
    if (isCooldown) {
      const branded = errorEmbed(message.author, "Cooldown Active", (err as Error).message);
      const angryUrl = getEmoteUrl(Mascot.Emotes.Angry);
      if (angryUrl) branded.setThumbnail(angryUrl);
      return message.reply({ embeds: [branded] });
    }
    return message.reply({ embeds: [errorEmbed(message.author, "Error", (err as Error).message)] });
  }
}