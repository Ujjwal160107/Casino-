import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  Message,
  MessageFlags,
  TextDisplayBuilder,
  User,
} from "discord.js";
import prisma from "../../utils/prisma";
import { Mascot } from "../../config/branding";
import { fmtCurrency, formatDuration, parseSmartAmount } from "../../utils/format";
import {
  AFFECTION_TIERS,
  MAX_AFFECTION,
  MarriageAction,
  applyMarriageDecay,
  checkHasRing,
  consumeRing,
  createVaultWithdrawRequest,
  depositToJoint,
  divorce,
  getAffectionTier,
  getMarriage,
  getSpouseId,
  isMarried,
  marry,
  resolveVaultWithdrawRequest,
  runAffectionAction,
} from "../../services/life/marriageService";
import { logToChannel } from "../../utils/discordLogger";
import { isTesterMember } from "../../utils/developerAccess";
import { getGuildPrefix } from "../../utils/guildContext";
import { MARRIAGE_CONFIG } from "../../utils/economyConfig";

const V2 = MessageFlags.IsComponentsV2 as any;
const LOVE_COLOR = 0xE056A0;
const WARN_COLOR = 0xF1C40F;
const FAIL_COLOR = 0xE74C3C;
const SUCCESS_COLOR = 0x2ECC71;

function container(title: string, body: string, color = LOVE_COLOR) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(body),
    );
}

function payload(title: string, body: string, color = LOVE_COLOR, rows: ActionRowBuilder<ButtonBuilder>[] = []) {
  return {
    components: [container(title, body, color), ...rows],
    flags: V2,
  };
}

function affectionBar(affection: number) {
  const full = Math.round((Math.max(0, Math.min(MAX_AFFECTION, affection)) / MAX_AFFECTION) * 10);
  return `${Mascot.Emotes.XpFull.repeat(full)}${Mascot.Emotes.XpEmpty.repeat(10 - full)}`;
}

function formatUnix(date: Date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function actionRows(ownerId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`marriage_action:hug:${ownerId}`).setLabel("Hug").setEmoji(Mascot.Emotes.Love).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`marriage_action:kiss:${ownerId}`).setLabel("Kiss").setEmoji(Mascot.Emotes.FortunaHeart).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`marriage_action:make_love:${ownerId}`).setLabel("Make Love").setEmoji(Mascot.Emotes.Sparks).setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`marriage_action:date:${ownerId}`).setLabel("Date Night").setEmoji(Mascot.Emotes.Currency).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`marriage_action:chaos:${ownerId}`).setLabel("Chaos Romance").setEmoji(Mascot.Emotes.Dices).setStyle(ButtonStyle.Danger),
    ),
  ];
}

function getSpouseRecord(marriage: NonNullable<Awaited<ReturnType<typeof getMarriage>>>, viewerId: string) {
  return marriage.spouse1Id === viewerId ? marriage.spouse2 : marriage.spouse1;
}

function getCooldownLine(label: string, lastAt: Date | null | undefined, cooldownMs: number) {
  if (!lastAt) return `${label}: Ready`;
  const readyAt = new Date(lastAt.getTime() + cooldownMs);
  if (readyAt.getTime() <= Date.now()) return `${label}: Ready`;
  return `${label}: ${formatUnix(readyAt)}`;
}

function buildDashboardPayload(
  marriage: NonNullable<Awaited<ReturnType<typeof getMarriage>>>,
  viewer: User,
  warning?: string | null,
) {
  const spouse = getSpouseRecord(marriage, viewer.id);
  const tier = getAffectionTier(marriage.affection);
  const inactiveAt = marriage.lastAffectionActionAt ?? marriage.marriedAt;
  const pendingRequest = marriage.vaultRequests?.find((request) => request.status === "PENDING");
  const warningLine = warning
    ? `\n${Mascot.Emotes.Alert} **Warning:** ${warning}`
    : marriage.decayWarnings > 0
      ? `\n${Mascot.Emotes.Alert} **Warning:** affection has started cooling down.`
      : "";

  const body = [
    `${Mascot.Emotes.Love} **Spouse:** <@${spouse.discordId}>`,
    `${Mascot.Emotes.Sparks} **Affection:** ${marriage.affection}/${MAX_AFFECTION}`,
    affectionBar(marriage.affection),
    `**Tier:** ${tier.name} (${tier.multiplier.toFixed(2)}x couple action rewards)`,
    `${Mascot.Emotes.Bank} **Couple Vault:** ${fmtCurrency(Math.floor(marriage.jointBalance))}`,
    `**Married:** ${formatUnix(marriage.marriedAt)}`,
    `**Last Affection:** ${formatUnix(inactiveAt)}${warningLine}`,
    "",
    `**Cooldowns**`,
    getCooldownLine("Hug", marriage.lastHugAt, 2 * 60 * 60 * 1000),
    getCooldownLine("Kiss", marriage.lastKissAt, 4 * 60 * 60 * 1000),
    getCooldownLine("Make Love", marriage.lastMakeLoveAt, 24 * 60 * 60 * 1000),
    getCooldownLine("Date Night", marriage.lastDateAt, 20 * 60 * 60 * 1000),
    getCooldownLine("Chaos Romance", marriage.lastChaosAt, 24 * 60 * 60 * 1000),
    "",
    pendingRequest
      ? `${Mascot.Emotes.Lock} **Pending Withdraw:** ${fmtCurrency(Math.floor(pendingRequest.amount))} awaiting <@${pendingRequest.spouseId}>.`
      : `${Mascot.Emotes.Lock} Withdrawals require spouse approval.`,
    marriage.lastDrama ? `\n**Last Drama:** ${marriage.lastDrama}` : "",
  ].filter(Boolean).join("\n");

  return payload(`${Mascot.Emotes.FortunaHeart} Marriage Dashboard`, body, LOVE_COLOR, actionRows(viewer.id));
}

async function sendDashboard(message: Message) {
  const decay = await applyMarriageDecay(message.author.id);
  if (decay.autoDivorced) {
    return message.reply(payload(
      `${Mascot.Emotes.Alert} Marriage Ended`,
      `${decay.warning}\n\nThe Couple Vault was split between both partners.`,
      FAIL_COLOR,
    ));
  }
  if (!decay.marriage) {
    return message.reply(payload(
      `${Mascot.Emotes.Confused} Not Married`,
      "You are single. Use `!marry @user` when you are ready for chaos with paperwork.",
      FAIL_COLOR,
    ));
  }

  const msg = await message.reply(buildDashboardPayload(decay.marriage, message.author, decay.warning));
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

  collector.on("collect", async (interaction) => {
    const [scope, rawAction, ownerId] = interaction.customId.split(":");
    if (scope !== "marriage_action" || ownerId !== message.author.id) return;
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        ...payload(`${Mascot.Emotes.Lock} Not Your Dashboard`, "Open your own spouse dashboard to use relationship actions.", FAIL_COLOR),
        flags: V2 | MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const result = await runAffectionAction(message.author.id, message.author.username, rawAction as MarriageAction);
      if (!result.success) {
        await interaction.reply({
          ...payload(`${Mascot.Emotes.Cooldown} Cooldown Active`, `That action is ready in **${formatDuration(result.cooldownMs ?? 0)}**.`, WARN_COLOR),
          flags: V2 | MessageFlags.Ephemeral,
        });
        return;
      }
      const updated = await getMarriage(message.author.id);
      if (updated) await interaction.update(buildDashboardPayload(updated, message.author));
    } catch (error: any) {
      await interaction.reply({
        ...payload(`${Mascot.Emotes.Fail} Action Failed`, error.message || "Something went wrong.", FAIL_COLOR),
        flags: V2 | MessageFlags.Ephemeral,
      });
    }
  });
}

async function deductMarriageCost(discordId: string, amount: number) {
  if (amount <= 0) return;
  const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
  if (!wallet || wallet.balance < amount) throw new Error("The proposer cannot afford the marriage fee.");
  await prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } }),
    prisma.transaction.create({
      data: { walletId: wallet.id, amount: -amount, type: "marriage_fee", meta: {}, isEarned: false },
    }),
  ]);
}

export async function handleMarry(message: Message, args: string[]) {
  if (!message.guildId || !message.guild) return;
  const target = message.mentions.users.first();
  if (!target || target.bot || target.id === message.author.id) {
    return message.reply(payload(
      `${Mascot.Emotes.Confused} Invalid Proposal`,
      "Mention a real user you want to marry.",
      FAIL_COLOR,
    ));
  }

  const prefix = await getGuildPrefix(message.guildId);
  if (!MARRIAGE_CONFIG.enabled) {
    return message.reply(payload(`${Mascot.Emotes.Lock} Marriage Disabled`, "Marriage is disabled in this server.", FAIL_COLOR));
  }

  if (await isMarried(message.author.id)) {
    return message.reply(payload(`${Mascot.Emotes.Alert} Already Married`, "You are already married.", FAIL_COLOR));
  }
  if (await isMarried(target.id)) {
    return message.reply(payload(`${Mascot.Emotes.Alert} Already Taken`, `<@${target.id}> is already married.`, FAIL_COLOR));
  }

  const dbUser = await prisma.user.findUnique({ where: { discordId: message.author.id } });
  if (MARRIAGE_CONFIG.cooldownSeconds > 0 && dbUser?.lastDivorcedAt && !isTesterMember(message.member)) {
    const cooldownMs = MARRIAGE_CONFIG.cooldownSeconds * 1000;
    const readyAt = new Date(dbUser.lastDivorcedAt.getTime() + cooldownMs);
    if (readyAt.getTime() > Date.now()) {
      return message.reply(payload(`${Mascot.Emotes.Cooldown} Marriage Cooldown`, `You can propose again ${formatUnix(readyAt)}.`, WARN_COLOR));
    }
  }

  const hasRing = await checkHasRing(message.author.id, message.guildId);
  if (!hasRing) {
    return message.reply(payload(`${Mascot.Emotes.Lock} Ring Needed`, "You need a Ring to propose. Buy one from the shop first.", FAIL_COLOR));
  }

  const costLine = MARRIAGE_CONFIG.cost > 0 ? `\n**Marriage Fee:** ${fmtCurrency(MARRIAGE_CONFIG.cost)} paid by <@${message.author.id}>.` : "";
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`marry:accept:${message.author.id}:${target.id}`).setLabel("Accept").setEmoji(Mascot.Emotes.Accept).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`marry:decline:${message.author.id}:${target.id}`).setLabel("Decline").setEmoji(Mascot.Emotes.Decline).setStyle(ButtonStyle.Danger),
  );

  const proposal = await message.reply(payload(
      `${Mascot.Emotes.Love} Marriage Proposal`,
      `<@${message.author.id}> is proposing to <@${target.id}>.\n\nDo you accept a relationship contract with romance, chaos, and a shared vault?${costLine}`,
      LOVE_COLOR,
      [row],
    ));

  const collector = proposal.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
  collector.on("collect", async (interaction) => {
    const [scope, action, proposerId, targetId] = interaction.customId.split(":");
    if (scope !== "marry" || proposerId !== message.author.id || targetId !== target.id) return;
    if (interaction.user.id !== target.id) {
      await interaction.reply({
        ...payload(`${Mascot.Emotes.Lock} Not For You`, "This proposal is waiting for the mentioned partner.", FAIL_COLOR),
        flags: V2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === "decline") {
      await interaction.update(payload(`${Mascot.Emotes.Decline} Proposal Declined`, `<@${target.id}> declined the proposal. Fortuna will not ask questions.`, FAIL_COLOR));
      collector.stop("answered");
      return;
    }

    try {
      await interaction.deferUpdate();
      if (await isMarried(proposerId)) throw new Error("The proposer is already married.");
      if (await isMarried(targetId)) throw new Error("You are already married.");
      if (!(await checkHasRing(proposerId, message.guildId!))) throw new Error("The proposer no longer has the Ring.");
      await deductMarriageCost(proposerId, MARRIAGE_CONFIG.cost);
      await consumeRing(proposerId, message.guildId!);
      await marry(proposerId, message.author.username, targetId, target.username, message.guildId!);

      await logToChannel(message.client, {
        guild: message.guild!,
        type: "TRADE",
        title: "Marriage Created",
        description: `**${message.author.tag}** married **${target.tag}**.`,
        color: LOVE_COLOR,
      });

      await proposal.edit(payload(
        `${Mascot.Emotes.FortunaHeart} Just Married`,
        `<@${proposerId}> and <@${targetId}> are now married.\n\nAffection starts at **25/${MAX_AFFECTION}**. Use \`${prefix}spouse\` to open the relationship dashboard.`,
        SUCCESS_COLOR,
      ));
      collector.stop("answered");
    } catch (error: any) {
      const failedPayload = payload(`${Mascot.Emotes.Fail} Proposal Failed`, error.message || "Marriage could not be created.", FAIL_COLOR);
      if (interaction.deferred || interaction.replied) {
        await proposal.edit(failedPayload).catch(() => undefined);
      } else {
        await interaction.update(failedPayload).catch(() => undefined);
      }
      collector.stop("answered");
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason !== "time") return;
    await proposal.edit(payload(`${Mascot.Emotes.Cooldown} Proposal Expired`, "The proposal timed out.", WARN_COLOR)).catch(() => undefined);
  });
}

export async function handleDivorce(message: Message) {
  if (!message.guildId || !message.guild) return;
  const marriage = await getMarriage(message.author.id);
  if (!marriage) {
    return message.reply(payload(`${Mascot.Emotes.Confused} Not Married`, "You are not married.", FAIL_COLOR));
  }

  const spouseId = getSpouseId(marriage, message.author.id);
  const prefix = await getGuildPrefix(message.guildId);
  const costLine = MARRIAGE_CONFIG.divorceCost > 0 ? `\n**Divorce Fee:** ${fmtCurrency(MARRIAGE_CONFIG.divorceCost)} paid by you.` : "";
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`marriage_divorce:confirm:${message.author.id}`).setLabel("Confirm Divorce").setEmoji(Mascot.Emotes.Decline).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`marriage_divorce:cancel:${message.author.id}`).setLabel("Cancel").setEmoji(Mascot.Emotes.Accept).setStyle(ButtonStyle.Secondary),
  );

  const msg = await message.reply(payload(
    `${Mascot.Emotes.Alert} Confirm Divorce`,
    `This will end your marriage with <@${spouseId}> and split the Couple Vault 50/50.${costLine}`,
    WARN_COLOR,
    [row],
  ));
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

  collector.on("collect", async (interaction) => {
    const parts = interaction.customId.split(":");
    if (parts[2] !== message.author.id) return;
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({
        ...payload(`${Mascot.Emotes.Lock} Not Your Divorce`, "Only the person who started this confirmation can click here.", FAIL_COLOR),
        flags: V2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (parts[1] === "cancel") {
      await interaction.update(payload(`${Mascot.Emotes.Accept} Divorce Cancelled`, "The relationship survives another day.", SUCCESS_COLOR));
      collector.stop("answered");
      return;
    }

    try {
      if (MARRIAGE_CONFIG.divorceCost > 0) await deductMarriageCost(message.author.id, MARRIAGE_CONFIG.divorceCost);
      const result = await divorce(message.author.id, "manual");
      await logToChannel(message.client, {
        guild: message.guild!,
        type: "TRADE",
        title: "Divorce Finalized",
        description: `**${message.author.tag}** divorced <@${spouseId}>.`,
        color: FAIL_COLOR,
      });
      await interaction.update(payload(
        `${Mascot.Emotes.Decline} Divorced`,
        `<@${result.spouseA}> and <@${result.spouseB}> are now divorced.\n\nVault split: ${fmtCurrency(result.firstShare)} / ${fmtCurrency(result.secondShare)}.`,
        FAIL_COLOR,
      ));
      collector.stop("answered");
    } catch (error: any) {
      await interaction.reply({
        ...payload(`${Mascot.Emotes.Fail} Divorce Failed`, error.message || "Could not divorce.", FAIL_COLOR),
        flags: V2 | MessageFlags.Ephemeral,
      });
    }
  });
}

async function handleActionCommand(message: Message, action: MarriageAction) {
  try {
    const result = await runAffectionAction(message.author.id, message.author.username, action);
    if (!result.success) {
      return message.reply(payload(`${Mascot.Emotes.Cooldown} Cooldown Active`, `That action is ready in **${formatDuration(result.cooldownMs ?? 0)}**.`, WARN_COLOR));
    }
    const actionResult = result as any;

    const body = [
      actionResult.drama,
      "",
      `${Mascot.Emotes.Sparks} **Affection:** ${actionResult.affectionBefore} → ${actionResult.affectionAfter} (${actionResult.affectionDelta >= 0 ? "+" : ""}${actionResult.affectionDelta})`,
      `${Mascot.Emotes.Currency} **Vault Reward:** ${fmtCurrency(actionResult.reward)}`,
      actionResult.cost > 0 ? `${Mascot.Emotes.Price} **Cost:** ${fmtCurrency(actionResult.cost)}` : "",
      `**Tier:** ${actionResult.tier.name} (${actionResult.tier.multiplier.toFixed(2)}x)`,
    ].filter(Boolean).join("\n");

    return message.reply(payload(`${Mascot.Emotes.Love} Marriage Action`, body, SUCCESS_COLOR));
  } catch (error: any) {
    return message.reply(payload(`${Mascot.Emotes.Fail} Action Failed`, error.message || "Something went wrong.", FAIL_COLOR));
  }
}

async function handleVaultBalance(message: Message) {
  const marriage = await getMarriage(message.author.id);
  if (!marriage) return message.reply(payload(`${Mascot.Emotes.Confused} Not Married`, "You do not have a Couple Vault.", FAIL_COLOR));
  return message.reply(payload(
    `${Mascot.Emotes.Bank} Couple Vault`,
    `**Balance:** ${fmtCurrency(Math.floor(marriage.jointBalance))}\nDeposits are instant. Withdrawals require spouse approval.`,
    LOVE_COLOR,
  ));
}

async function handleJointDeposit(message: Message, args: string[]) {
  const marriage = await getMarriage(message.author.id);
  if (!marriage) return message.reply(payload(`${Mascot.Emotes.Confused} Not Married`, "You do not have a Couple Vault.", FAIL_COLOR));

  const wallet = await prisma.wallet.findUnique({ where: { userId: message.author.id } });
  const amountArg = args[1];
  const amount = parseSmartAmount(amountArg, wallet?.balance ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return message.reply(payload(`${Mascot.Emotes.Confused} Invalid Amount`, "Use `!marriage deposit <amount|all>`.", FAIL_COLOR));
  }

  try {
    const newBalance = await depositToJoint(message.author.id, amount);
    return message.reply(payload(
      `${Mascot.Emotes.Bank} Deposit Complete`,
      `Deposited **${fmtCurrency(amount)}** into the Couple Vault.\n**New Vault Balance:** ${fmtCurrency(Math.floor(newBalance))}`,
      SUCCESS_COLOR,
    ));
  } catch (error: any) {
    return message.reply(payload(`${Mascot.Emotes.Fail} Deposit Failed`, error.message || "Could not deposit.", FAIL_COLOR));
  }
}

async function handleJointWithdraw(message: Message, args: string[]) {
  const marriage = await getMarriage(message.author.id);
  if (!marriage) return message.reply(payload(`${Mascot.Emotes.Confused} Not Married`, "You do not have a Couple Vault.", FAIL_COLOR));

  const amountArg = args[1];
  const amount = parseSmartAmount(amountArg, marriage.jointBalance);
  if (!Number.isFinite(amount) || amount <= 0) {
    return message.reply(payload(`${Mascot.Emotes.Confused} Invalid Amount`, "Use `!marriage withdraw <amount|all>`.", FAIL_COLOR));
  }

  try {
    const request = await createVaultWithdrawRequest(message.author.id, amount);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`marriage_vault:approve:${request.id}`).setLabel("Approve").setEmoji(Mascot.Emotes.Accept).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`marriage_vault:decline:${request.id}`).setLabel("Decline").setEmoji(Mascot.Emotes.Decline).setStyle(ButtonStyle.Danger),
    );

    const msg = await message.reply(payload(
        `${Mascot.Emotes.Lock} Vault Withdrawal Request`,
        `<@${message.author.id}> wants to withdraw **${fmtCurrency(amount)}** from the Couple Vault.\n\nOnly <@${request.spouseId}> can approve this. It expires ${formatUnix(request.expiresAt)}.`,
        WARN_COLOR,
        [row],
      ));

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10 * 60 * 1000 });
    collector.on("collect", async (interaction) => {
      const [scope, action, requestId] = interaction.customId.split(":");
      if (scope !== "marriage_vault" || requestId !== request.id) return;
      if (interaction.user.id !== request.spouseId) {
        await interaction.reply({
          ...payload(`${Mascot.Emotes.Lock} Spouse Approval Only`, "Only the spouse can approve or decline this withdrawal.", FAIL_COLOR),
          flags: V2 | MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        const approve = action === "approve";
        const result = await resolveVaultWithdrawRequest(request.id, interaction.user.id, approve);
        await interaction.update(payload(
          approve ? `${Mascot.Emotes.Accept} Withdrawal Approved` : `${Mascot.Emotes.Decline} Withdrawal Declined`,
          approve
            ? `Released **${fmtCurrency(amount)}** to <@${request.requesterId}>.\n**Vault Balance:** ${fmtCurrency(Math.floor(result.newBalance))}`
            : "The withdrawal request was declined.",
          approve ? SUCCESS_COLOR : FAIL_COLOR,
        ));
        collector.stop("answered");
      } catch (error: any) {
        await interaction.reply({
          ...payload(`${Mascot.Emotes.Fail} Vault Error`, error.message || "Could not resolve request.", FAIL_COLOR),
          flags: V2 | MessageFlags.Ephemeral,
        });
      }
    });

    collector.on("end", async (_collected, reason) => {
      if (reason !== "time") return;
      await msg.edit(payload(`${Mascot.Emotes.Cooldown} Request Expired`, "The vault withdrawal request expired.", WARN_COLOR)).catch(() => undefined);
    });
  } catch (error: any) {
    return message.reply(payload(`${Mascot.Emotes.Fail} Withdrawal Failed`, error.message || "Could not create withdrawal request.", FAIL_COLOR));
  }
}

export async function handleFamily(message: Message, args: string[] = []) {
  if (!message.guildId) return;
  const sub = args[0]?.toLowerCase();

  if (sub === "bank" || sub === "account" || sub === "bal" || sub === "vault") return handleVaultBalance(message);
  if (sub === "deposit" || sub === "dep") return handleJointDeposit(message, args);
  if (sub === "withdraw" || sub === "with") return handleJointWithdraw(message, args);
  if (sub === "hug") return handleActionCommand(message, "hug");
  if (sub === "kiss") return handleActionCommand(message, "kiss");
  if (sub === "date") return handleActionCommand(message, "date");
  if (sub === "chaos") return handleActionCommand(message, "chaos");
  if (sub === "make" && args[1]?.toLowerCase() === "love") return handleActionCommand(message, "make_love");
  if (sub === "makelove" || sub === "make-love" || sub === "sex") return handleActionCommand(message, "make_love");

  return sendDashboard(message);
}

export { AFFECTION_TIERS };
