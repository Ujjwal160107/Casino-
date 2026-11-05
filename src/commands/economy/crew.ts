// `!crew` (alias `!mob`, slash `/crew action target`): the Crime Families
// command (spec 13.1). One table maps each subaction to a handler; private
// screens and modals reply with an S27 opener whose button opens them, and
// every refusal is a public one-line errorContainer. Jail is enforced in the
// services that move money or membership, so viewing works in jail.
import type { GuildBasedChannel, Message } from "discord.js";
import { FAMILY_ROLES } from "../../data/crimeFamilyCatalog";
import { BAD_AMOUNT, homeScreen, NOT_OPEN_HERE, topScreen } from "../../handlers/crewInteractionHandler";
import { touchActivity } from "../../services/crimeFamily/activity";
import { claimChair, demoteMember, promoteMember } from "../../services/crimeFamily/chairService";
import { buildDashboardView, countMembers, familyLabel, getFamilyByTag, requireMembership, toInviteView } from "../../services/crimeFamily/familyQueries";
import { forceRenameFamily, setHomeChannel } from "../../services/crimeFamily/familyService";
import { LEADERBOARD_SORTS } from "../../services/crimeFamily/leaderboard";
import {
  acceptInviteByTag, declineInviteByTag, inviteMember, setInviteMessage,
} from "../../services/crimeFamily/membershipService";
import { FamilyError } from "../../services/crimeFamily/tx";
import { depositToVault, resolveDepositAmount } from "../../services/crimeFamily/vaultService";
import { InsufficientFundsError } from "../../services/walletService";
import { announceChairChange, announceInvite, announceRoleChange, resolveInviteCard } from "../../ui/crimeFamily/announce";
import { buildDashboard, buildInviteCard } from "../../ui/crimeFamily/familyScreens";
import { CREW_IDS, type CrewOpenKind } from "../../ui/crimeFamily/ids";
import { buildNotice, buildOpener, type CfPayload } from "../../ui/crimeFamily/kit";
import { missingBotPermissions } from "../../ui/crimeFamily/post";
import { errorContainer, successContainer, v2Quiet } from "../../utils/componentsV2";
import { isCrimeFamilyOpen } from "../../utils/economyConfig";
import { fmtFortunes } from "../../utils/format";
import { resolvePlayerTarget } from "../../utils/playerTarget";

export type CrewCtx = { message: Message; args: string[] /* after the subaction */; uid: string; guildId: string; channelId: string; prefix: string };

const TITLE = "Crime Families";
const BOT_COPY = "Bots can't join a family.";

const show = (ctx: CrewCtx, payload: CfPayload) => ctx.message.reply(payload);
const notice = (ctx: CrewCtx, text: string) => show(ctx, buildNotice(text));

/** The player named by args[0]; a FamilyError (shown as the refusal) when it does not resolve. */
async function targetOf(ctx: CrewCtx, verb: string): Promise<string> {
  const target = await resolvePlayerTarget(ctx.message, ctx.args[0], { verb, bot: BOT_COPY });
  if ("error" in target) throw new FamilyError(target.error);
  return target.id;
}

function tagOf(ctx: CrewCtx, sub: string): string {
  const tag = ctx.args[0];
  if (!tag) throw new FamilyError(`Usage: \`${ctx.prefix}crew ${sub} <TAG>\``);
  return tag;
}

/** S27 for a screen or modal that only its owner may open. */
function opener(kind: CrewOpenKind, summary: string, label: string) {
  return (ctx: CrewCtx) => show(ctx, buildOpener(`<@${ctx.uid}>: ${summary}`, { customId: CREW_IDS.open(kind, ctx.uid), label }));
}

function targetOpener(kind: "kick" | "chair", verb: string, summary: (target: string) => string, label: string) {
  return async (ctx: CrewCtx) => {
    const target = await targetOf(ctx, verb);
    return show(ctx, buildOpener(`<@${ctx.uid}>: ${summary(target)}`, { customId: CREW_IDS.openTarget(kind, target, ctx.uid), label }));
  };
}

function rankChange(action: "promote" | "demote") {
  return async (ctx: CrewCtx) => {
    const target = await targetOf(ctx, action === "promote" ? "Promote" : "Demote");
    const { family, newRole } = await (action === "promote" ? promoteMember : demoteMember)(ctx.uid, target);
    await announceRoleChange(ctx.message.client, family, action === "promote" ? "promoted" : "demoted", target, newRole);
    return notice(ctx, `<@${target}> is now **${FAMILY_ROLES[newRole].name}** of **${familyLabel(family)}**.`);
  };
}

/**
 * S4 in this channel (pinging only the invitee), stored for the sweeper, then
 * the invitee's DM. The invite stands even if the card could not be posted,
 * so the DM still goes, without a jump link.
 */
async function invite(ctx: CrewCtx) {
  const inviteeId = await targetOf(ctx, "Invite");
  const created = await inviteMember({ inviterId: ctx.uid, inviteeId, guildId: ctx.guildId, channelId: ctx.channelId });
  let cardId: string | null = null;
  try {
    const card = await show(ctx, buildInviteCard(toInviteView(created, await countMembers(created.familyId))));
    cardId = card.id;
    await setInviteMessage(created.id, card.id);
    return card;
  } finally {
    await announceInvite(ctx.message.client, created, cardId);
  }
}

async function deposit(ctx: CrewCtx) {
  const now = new Date();
  const amount = await resolveDepositAmount(ctx.uid, ctx.args[0] ?? "", now);
  if (amount === null) throw new FamilyError(BAD_AMOUNT);
  const d = await depositToVault(ctx.uid, amount, now);
  return notice(ctx, `Deposited ${fmtFortunes(d.net)} to the vault (${fmtFortunes(d.tax)} tax burned).`);
}

async function home(ctx: CrewCtx) {
  const missing = missingBotPermissions(ctx.message.channel as GuildBasedChannel, ctx.message.client.user!.id);
  if (missing.length) throw new FamilyError(`I need ${missing.join(", ")} in this channel to post family cards here.`);
  await setHomeChannel(ctx.uid, ctx.guildId, ctx.channelId);
  return notice(ctx, `Family cards now post in <#${ctx.channelId}>.`);
}

async function info(ctx: CrewCtx) {
  const family = await getFamilyByTag(tagOf(ctx, "info"));
  if (!family) throw new FamilyError("No family with that tag.");
  return show(ctx, buildDashboard(await buildDashboardView(family.id, ctx.uid, new Date()), { art: true }));
}

async function accept(ctx: CrewCtx) {
  const { family, inviteId } = await acceptInviteByTag(ctx.uid, tagOf(ctx, "accept"));
  await resolveInviteCard(ctx.message.client, inviteId, `Accepted by <@${ctx.uid}>`);
  return notice(ctx, `You joined **${familyLabel(family)}**. Open it with \`${ctx.prefix}crew\`.`);
}

async function decline(ctx: CrewCtx) {
  const declined = await declineInviteByTag(ctx.uid, tagOf(ctx, "decline"));
  await resolveInviteCard(ctx.message.client, declined.id, "Declined");
  return notice(ctx, "Invite declined.");
}

async function claim(ctx: CrewCtx) {
  const { family } = await requireMembership(ctx.uid);
  const move = await claimChair(family.id, ctx.uid);
  await announceChairChange(ctx.message.client, move.family, "claimed", move.oldBossId, move.newBossId);
  return notice(ctx, `You are now the Boss of **${familyLabel(move.family)}**.`);
}

export const CREW_SUBACTIONS: Readonly<Record<string, (ctx: CrewCtx) => Promise<unknown>>> = {
  dashboard: async (ctx) => show(ctx, await homeScreen(ctx.uid)),
  create: async (ctx) => show(ctx, buildOpener(`<@${ctx.uid}>: found your own crime family.`, { customId: CREW_IDS.createOpen(ctx.uid), label: "Create…" })),
  invite,
  accept,
  decline,
  leave: opener("leave", "leave your family.", "Leave…"),
  kick: targetOpener("kick", "Kick", (t) => `kick <@${t}> from the family.`, "Kick…"),
  promote: rankChange("promote"),
  demote: rankChange("demote"),
  handover: targetOpener("chair", "Hand over to", (t) => `hand the chair to <@${t}>.`, "Hand over…"),
  deposit,
  vault: opener("vault", "your family's vault.", "Open vault"),
  payday: opener("payday", "run payday.", "Open payday"),
  levelup: opener("level", "level up the family.", "Level up…"),
  log: opener("log", "the family ledger.", "Open log"),
  top: async (ctx) => show(ctx, await topScreen(ctx.uid, LEADERBOARD_SORTS[0].key, true)),
  info,
  home,
  rename: opener("rename", "rename the family.", "Rename…"),
  disband: opener("disband", "disband the family.", "Disband…"),
  claim,
};

/** Runs one subaction; a FamilyError or a short wallet is a public one-line refusal titled `title`. */
export async function replyOrRefuse(message: Message, run: () => Promise<unknown>, title = TITLE): Promise<unknown> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof FamilyError || err instanceof InsufficientFundsError) {
      return message.reply(v2Quiet(errorContainer(title, err.message)));
    }
    console.error(`[crimeFamily] ${message.content} failed:`, err);
    return message.reply(v2Quiet(errorContainer(title, "Something went wrong.")));
  }
}

/** `prefix` is the router's: the guild's prefix, or "/" for a slash user. */
export async function handleCrew(message: Message, args: string[], prefix: string): Promise<unknown> {
  if (!isCrimeFamilyOpen(message.guildId)) return message.reply(v2Quiet(errorContainer(TITLE, NOT_OPEN_HERE)));
  const uid = message.author.id;
  void touchActivity(uid);
  const guildId = message.guildId!;
  const sub = args[0]?.toLowerCase() ?? "dashboard";
  const run = CREW_SUBACTIONS[sub];
  if (!run) {
    return message.reply(v2Quiet(errorContainer(TITLE, `Usage: \`${prefix}crew [${Object.keys(CREW_SUBACTIONS).join(" | ")}]\``)));
  }
  const ctx: CrewCtx = { message, args: args.slice(1), uid, guildId, channelId: message.channelId, prefix };
  return replyOrRefuse(message, () => run(ctx));
}

/** `crew-forcerename <TAG> <new name>`: the developer's rename (spec 6.2), no fee and no cooldown. */
export async function handleCrewForceRename(message: Message, args: string[]): Promise<unknown> {
  const [tag, ...nameParts] = args;
  if (!tag || nameParts.length === 0) {
    return message.reply(v2Quiet(errorContainer(TITLE, "Usage: `crew-forcerename <TAG> <new name>`")));
  }
  return replyOrRefuse(message, async () => {
    const family = await forceRenameFamily(tag, nameParts.join(" "), message.author.id);
    return message.reply(v2Quiet(successContainer("Family Renamed", `**[${family.tag}]** is now **${family.name}**.`)));
  });
}
