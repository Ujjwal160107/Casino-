import { Message } from "discord.js";
import { GRINDING_COMMANDS } from "../../utils/economyConfig";
import { checkCooldown, formatDiscordRelativeTime, setCooldown } from "../../services/cooldownService";
import { addBalance } from "../../services/walletService";
import { checkLuckyCoin } from "../../services/shopBuffs";
import { errorContainer, successContainer, v2Reply } from "../../utils/componentsV2";
import { nextStepHint } from "../../config/nextSteps";
import { fmtCurrency } from "../../utils/format";

type GrindCommand = "beg" | "slut";

const BEG_WIN_MESSAGES = [
  "A stranger took pity on your dramatic sidewalk speech and handed you **{amount}**.",
  "You played the world's saddest song and earned **{amount}**.",
  "You held up a cardboard sign with premium font choices and made **{amount}**.",
  "Someone paid you **{amount}** to stop explaining your life story.",
  "You found a generous crowd and walked away with **{amount}**."
];

const BEG_LOSS_MESSAGES = [
  "You begged with confidence, but everyone walked past.",
  "You picked the wrong street and made absolutely nothing.",
  "Your performance was moving, but apparently not wallet-moving.",
  "Someone gave you advice instead of coins. Tragic.",
  "You rattled the cup. The cup rattled back empty."
];

const SLUT_WIN_MESSAGES = [
  "You worked the corner and made **{amount}**.",
  "You sold premium attention and collected **{amount}**.",
  "You flirted like rent was due and earned **{amount}**.",
  "You made questionable choices with excellent margins: **{amount}**.",
  "You turned charm into cash and walked away with **{amount}**."
];

const SLUT_LOSS_MESSAGES = [
  "You got all dressed up and nobody booked.",
  "Your client vanished before payment. Brutal.",
  "You tried to sell mystique, but the market was closed.",
  "You fumbled the pitch and made nothing.",
  "You learned that confidence is not legal tender."
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomMessage(messages: string[], amount?: number) {
  const message = messages[Math.floor(Math.random() * messages.length)];
  return amount === undefined ? message : message.replace("{amount}", fmtCurrency(amount));
}

export async function handleIncome(message: Message) {
  const [cmd] = message.content.slice(1).split(/\s+/);
  const commandKey = cmd.toLowerCase() as GrindCommand;

  if (!["beg", "slut"].includes(commandKey)) {
    return message.reply(v2Reply(errorContainer("Unknown", "Use: !beg or !slut")));
  }

  const config = GRINDING_COMMANDS[commandKey];
  const cooldown = await checkCooldown(message.author.id, config.commandName);

  if (cooldown.active && cooldown.expiresAt) {
    return message.reply(
      v2Reply(errorContainer("Cooldown Active", `You can use \`${commandKey}\` again ${formatDiscordRelativeTime(cooldown.expiresAt)}.`))
    );
  }

  const reserved = await setCooldown(message.author.id, config.commandName, config.cooldownSeconds);
  if (reserved.active && reserved.expiresAt) {
    return message.reply(
      v2Reply(errorContainer("Cooldown Active", `You can use \`${commandKey}\` again ${formatDiscordRelativeTime(reserved.expiresAt)}.`))
    );
  }

  const won = Math.random() < config.winRate;

  if (!won) {
    const failMessages = commandKey === "beg" ? BEG_LOSS_MESSAGES : SLUT_LOSS_MESSAGES;
    return message.reply(
      v2Reply(errorContainer(`${commandKey.toUpperCase()} FAILED`, randomMessage(failMessages)))
    );
  }

  const luckyCoinMult = await checkLuckyCoin(message.author.id);
  const amount = Math.floor(randomInt(config.payoutMin, config.payoutMax) * luckyCoinMult);
  const result = await addBalance(message.author.id, message.author.username, amount, `${commandKey}_income`, { command: commandKey }, true);
  const winMessages = commandKey === "beg" ? BEG_WIN_MESSAGES : SLUT_WIN_MESSAGES;
  const capNotice = result.capped ? "\n\nYour wallet hit the maximum balance limit, so part of this payout was withheld." : "";

  const winBody = `${randomMessage(winMessages, result.appliedAmount)}${capNotice}`;

  return message.reply(
    v2Reply(
      successContainer(
        `${commandKey.toUpperCase()} SUCCESS`,
        `${winBody}\n\n**Wallet:** ${fmtCurrency(result.newBalance)}`,
        { hint: nextStepHint("beg") }
      )
    )
  );
}
