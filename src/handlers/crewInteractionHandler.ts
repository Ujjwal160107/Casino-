// CREW_ROUTES: every `crew:` press. The router has already checked the owner
// and acknowledged; each route re-reads membership and role from the DB,
// calls one service, runs the matching announcer and renders a screen.
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { FamilyRole } from "../data/crimeFamilyCatalog";
import { demoteMember, claimChair, handOverChair, promoteMember } from "../services/crimeFamily/chairService";
import { disbandFamily, previewDisband } from "../services/crimeFamily/disbandService";
import { checkMemberEligibility, eligibilityError } from "../services/crimeFamily/eligibility";
import { createFamily, renameFamily } from "../services/crimeFamily/familyService";
import {
  buildDashboardView, countMembers, familyLabel, getMembership, requireMembership, toInviteView,
} from "../services/crimeFamily/familyQueries";
import { getLeaderboard, LEADERBOARD_SORTS } from "../services/crimeFamily/leaderboard";
import { readLedgerPage } from "../services/crimeFamily/ledger";
import { acceptInvite, declineInvite, kickMember, leaveFamily, listPendingInvites } from "../services/crimeFamily/membershipService";
import { checkFamilyName, checkFamilyTag } from "../services/crimeFamily/names";
import { executePayday, previewPayday } from "../services/crimeFamily/paydayService";
import { can } from "../services/crimeFamily/permissions";
import { levelUp } from "../services/crimeFamily/progression";
import { FamilyError } from "../services/crimeFamily/tx";
import { depositToVault, getVaultView, resolveDepositAmount } from "../services/crimeFamily/vaultService";
import { announceChairChange, announceDisband, announcePayday, announceRoleChange, resolveInviteCard } from "../ui/crimeFamily/announce";
import {
  buildConfirm, buildCreateConfirm, buildDashboard, buildDisbandConfirm, buildLedgerPage, buildLeaderboard,
  buildLevelUpConfirm, buildManagePanel, buildMyInvites, buildNoFamilyCard, buildPaydayPreview, buildVaultPanel,
} from "../ui/crimeFamily/familyScreens";
import { CREW_IDS, decodeName, type CrewConfirmKind, type CrewModalKind } from "../ui/crimeFamily/ids";
import { buildNotice, type CfPayload } from "../ui/crimeFamily/kit";
import { CRIME_FAMILY_CONFIG, isCrimeFamilyOpen } from "../utils/economyConfig";
import { fmtFortunes } from "../utils/format";
import { safeEditReply } from "../utils/interactionHelpers";
import type { CfInteraction, CfRoute, CfRouteEntry, CfRouteTable } from "./crimeFamilyRouter";

export const NOT_OPEN_HERE = "Crime Families are not open in this server yet.";
const NOT_OPEN = "Crime Families are not open yet.";
const ONLY_OFFICERS = "Only the Boss or Underboss can run payday.";
const ONLY_BOSS_DISBAND = "Only the Boss can disband the family.";
export const BAD_AMOUNT = "Enter a positive amount like 250k or 5m";

const days = (seconds: number) => Math.round(seconds / 86_400);
const show = async (i: CfInteraction, payload: CfPayload) => { await safeEditReply(i, payload); };
const notice = (text: string) => buildNotice(text);
const owner = (args: string[]) => args[args.length - 1];

function assertCreateOpen(i: CfInteraction): void {
  if (!isCrimeFamilyOpen(i.guildId)) throw new FamilyError(NOT_OPEN_HERE);
}

function assertInvitesOpen(): void {
  if (!CRIME_FAMILY_CONFIG.enabled) throw new FamilyError(NOT_OPEN);
}

// ── Modals (opened with no I/O before showModal) ─────────────────────────────

const input = (id: string, label: string, max: number, placeholder: string) =>
  new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true)
      .setMaxLength(max).setPlaceholder(placeholder),
  );

const MODALS: Readonly<Record<CrewModalKind, { title: string; inputs: () => ActionRowBuilder<TextInputBuilder>[] }>> = {
  create: {
    title: "Found a crime family",
    inputs: () => [input("name", "Family name (3-24 characters)", 24, "Velvet Ante"), input("tag", "Tag (2-4 letters or digits)", 4, "VLA")],
  },
  deposit: { title: "Deposit to the vault", inputs: () => [input("amount", "Amount", 20, "250k, 5m or all")] },
  rename: { title: "Rename the family", inputs: () => [input("name", "New name (3-24 characters)", 24, "Velvet Ante")] },
  disband: { title: "Disband the family", inputs: () => [input("tag", "Type your family's tag to confirm", 4, "VLA")] },
};

function modalOpener(kind: CrewModalKind): CfRouteEntry {
  return {
    scope: "modalOpener",
    ack: "modal",
    run: async (i, args) => {
      if (i.isModalSubmit()) return;
      const modal = new ModalBuilder().setCustomId(CREW_IDS.modal(kind, owner(args))).setTitle(MODALS[kind].title);
      modal.addComponents(...MODALS[kind].inputs());
      await i.showModal(modal);
    },
  };
}

// ── Screens ──────────────────────────────────────────────────────────────────

/** S2 for a member, S1 for anyone else. Always into a message that does not hold the art. */
export async function homeScreen(uid: string): Promise<CfPayload> {
  const now = new Date();
  const membership = await getMembership(uid);
  if (membership) return buildDashboard(await buildDashboardView(membership.family.id, uid, now), { art: true });
  const [join, found] = await Promise.all([
    checkMemberEligibility(uid, "family_join", { now }),
    checkMemberEligibility(uid, "found", { now }),
  ]);
  return buildNoFamilyCard(uid, join, found);
}

async function vaultScreen(uid: string, note?: string): Promise<CfPayload> {
  const { family } = await requireMembership(uid);
  return buildVaultPanel(uid, await getVaultView(family.id, uid, new Date()), note);
}

async function manageScreen(uid: string, selected: string | null): Promise<CfPayload> {
  const { family } = await requireMembership(uid);
  const view = await buildDashboardView(family.id, uid, new Date());
  if (!view.viewer.canManage) throw new FamilyError("Only a Capo or above can manage members.");
  return buildManagePanel(uid, view, selected);
}

async function logScreen(uid: string, page: number): Promise<CfPayload> {
  const { family } = await requireMembership(uid);
  return buildLedgerPage(uid, await readLedgerPage(family.id, page, CRIME_FAMILY_CONFIG.ledgerPageSize));
}

export async function topScreen(uid: string, sort: string, art: boolean): Promise<CfPayload> {
  const membership = await getMembership(uid);
  return buildLeaderboard(uid, await getLeaderboard(sort, membership?.family.id ?? null), { art });
}

async function invitesScreen(uid: string): Promise<CfPayload> {
  const invites = await listPendingInvites(uid, new Date());
  const views = await Promise.all(invites.map(async (inv) => toInviteView(inv, await countMembers(inv.familyId))));
  return buildMyInvites(uid, views);
}

async function paydayScreen(uid: string): Promise<CfPayload> {
  const now = new Date();
  const { family, member } = await requireMembership(uid);
  if (!can({ role: member.role as FamilyRole, joinedAt: member.joinedAt }, "payday", now)) throw new FamilyError(ONLY_OFFICERS);
  return buildPaydayPreview(uid, await previewPayday(family.id, now));
}

async function levelScreen(uid: string): Promise<CfPayload> {
  const { family } = await requireMembership(uid);
  return buildLevelUpConfirm(uid, await getVaultView(family.id, uid, new Date()));
}

async function disbandScreen(uid: string): Promise<CfPayload> {
  const { family } = await requireMembership(uid);
  if (family.bossId !== uid) throw new FamilyError(ONLY_BOSS_DISBAND);
  return buildDisbandConfirm(uid, family.tag, await previewDisband(family.id));
}

const CONSEQUENCES: Readonly<Record<CrewConfirmKind, (target: string) => string>> = {
  leave: () => `You can't join or found a family for ${days(CRIME_FAMILY_CONFIG.hopCooldownSeconds.LEFT)} days. Nothing you deposited is refunded.`,
  kick: (t) => `<@${t}> can't join a family for ${days(CRIME_FAMILY_CONFIG.hopCooldownSeconds.KICKED)} day(s). Nothing they deposited is refunded.`,
  chair: (t) => `<@${t}> becomes the Boss and you become a Soldier. This cannot be undone.`,
};

const confirmScreen = (uid: string, kind: CrewConfirmKind, target: string | null) =>
  buildConfirm(uid, kind, target, CONSEQUENCES[kind](target ?? "0"));

// ── Routes ───────────────────────────────────────────────────────────────────

/** `crew:v:<screen>:<owner>` (S2/S6 buttons, S5/S6/S24 Back). */
const viewRoute: CfRoute = async (i, [screen, uid]) => {
  switch (screen) {
    case "vault": return show(i, await vaultScreen(uid));
    case "manage": return show(i, await manageScreen(uid, null));
    case "log": return show(i, await logScreen(uid, 0));
    case "top": return show(i, await topScreen(uid, LEADERBOARD_SORTS[0].key, true));
    case "invites": return show(i, await invitesScreen(uid));
    default: return show(i, await homeScreen(uid));
  }
};

/** `crew:open:<kind>:[<target>:]<owner>` (S27 opener buttons). */
const openRoute: CfRoute = async (i, args) => {
  const uid = owner(args);
  const kind = args[0];
  switch (kind) {
    case "vault": return show(i, await vaultScreen(uid));
    case "payday": return show(i, await paydayScreen(uid));
    case "level": return show(i, await levelScreen(uid));
    case "log": return show(i, await logScreen(uid, 0));
    case "disband": return show(i, await disbandScreen(uid));
    case "leave": return show(i, confirmScreen(uid, "leave", null));
    case "kick":
    case "chair": return show(i, confirmScreen(uid, kind, args[1]));
    default: throw new FamilyError("This button is no longer active.");
  }
};

/** `crew:vault:<payday|level>:<owner>` (S6). Deposit is a modal opener. */
const vaultRoute: CfRoute = async (i, [action, uid]) => {
  return show(i, action === "level" ? await levelScreen(uid) : await paydayScreen(uid));
};

/** `crew:mg:sel:<owner>` (select) and `crew:mg:<action>:<target>:<owner>` (S5 buttons). */
const manageRoute: CfRoute = async (i, args) => {
  const uid = owner(args);
  const [action, target] = args;
  if (action === "sel") return show(i, await manageScreen(uid, i.isStringSelectMenu() ? i.values[0] ?? null : null));
  if (action === "kick" || action === "chair") return show(i, confirmScreen(uid, action, target));
  const kind = action === "promote" ? "promoted" : "demoted";
  const { family, newRole } = await (action === "promote" ? promoteMember : demoteMember)(uid, target);
  await announceRoleChange(i.client, family, kind, target, newRole);
  return show(i, await manageScreen(uid, target));
};

/** `crew:cf:<kind>:<ok|no>:<target|0>:<owner>` (S26). */
const confirmRoute: CfRoute = async (i, [kind, answer, target, uid]) => {
  if (answer !== "ok") return show(i, notice("Cancelled."));
  if (kind === "leave") {
    const { family } = await leaveFamily(uid);
    return show(i, notice(`You left **${familyLabel(family)}**.`));
  }
  if (kind === "kick") {
    const { family } = await kickMember(uid, target);
    await announceRoleChange(i.client, family, "kicked", target, null);
    return show(i, notice(`<@${target}> was kicked from **${familyLabel(family)}**.`));
  }
  const move = await handOverChair(uid, target);
  await announceChairChange(i.client, move.family, "handed", move.oldBossId, move.newBossId);
  return show(i, notice(`<@${target}> is now the Boss of **${familyLabel(move.family)}**.`));
};

/** `crew:pay:ok:<E>:<N>:<owner>` (S7 Confirm): a stale preview re-renders S7 with the reason. */
const paydayRoute: CfRoute = async (i, [, earnings, count, uid]) => {
  const { family } = await requireMembership(uid);
  const result = await executePayday(family.id, uid, { earnings: Number(earnings), count: Number(count) });
  if (result.status === "changed") return show(i, buildPaydayPreview(uid, result.preview, result.reason));
  await announcePayday(i.client, result);
  return show(i, await vaultScreen(uid, `Paid ${result.paid.length} members.`));
};

/** `crew:lvl:ok:<L>:<owner>` (S8 Confirm). */
const levelRoute: CfRoute = async (i, [, level, uid]) => {
  const { family } = await requireMembership(uid);
  const result = await levelUp(family.id, uid, Number(level));
  return show(i, await vaultScreen(uid, `Your family is now level ${result.level}.`));
};

/** `crew:create:ok:<TAG>:<name>:<owner>` (S3 Confirm). */
const createOkRoute: CfRoute = async (i, [, tag, encodedName, uid]) => {
  assertCreateOpen(i);
  await createFamily({
    uid, username: i.user.username, name: decodeName(encodedName), tag, guildId: i.guildId!, channelId: i.channelId!,
  });
  return show(i, await homeScreen(uid));
};

/** `crew:inv:<accept|decline>:<inviteId>` (S4, shared: the service checks the invitee). */
const inviteRoute: CfRoute = async (i, [answer, inviteId]) => {
  assertInvitesOpen();
  const uid = i.user.id;
  if (answer === "accept") {
    const { family } = await acceptInvite(inviteId, uid);
    await resolveInviteCard(i.client, inviteId, `Accepted by <@${uid}>`);
    return show(i, notice(`You joined **${familyLabel(family)}**. Open it with \`!crew\`.`));
  }
  await declineInvite(inviteId, uid);
  await resolveInviteCard(i.client, inviteId, "Declined");
  return show(i, notice("Invite declined."));
};

/** `crew:inv:sel:<owner>` (S24 select). */
const inviteSelectRoute: CfRoute = async (i, [, uid]) => {
  assertInvitesOpen();
  const inviteId = i.isStringSelectMenu() ? i.values[0] : undefined;
  if (!inviteId) throw new FamilyError("Pick an invite.");
  await acceptInvite(inviteId, uid);
  await resolveInviteCard(i.client, inviteId, `Accepted by <@${uid}>`);
  return show(i, await homeScreen(uid));
};

/** `crew:claim:<familyId>` (S2 claim row, S23; shared: the service checks the Underboss). */
const claimRoute: CfRoute = async (i, [familyId]) => {
  const move = await claimChair(familyId, i.user.id);
  await announceChairChange(i.client, move.family, "claimed", move.oldBossId, move.newBossId);
  return show(i, notice(`You are now the Boss of **${familyLabel(move.family)}**.`));
};

/** `crew:modal:<kind>:<owner>` submits; each re-validates everything. */
const modalRoute: CfRoute = async (i, [kind, uid]) => {
  if (!i.isModalSubmit()) return;
  const field = (id: string) => i.fields.getTextInputValue(id);
  switch (kind as CrewModalKind) {
    case "create": {
      assertCreateOpen(i);
      const name = checkFamilyName(field("name"));
      if (!name.ok) throw new FamilyError(name.reason);
      const tag = checkFamilyTag(field("tag"));
      if (!tag.ok) throw new FamilyError(tag.reason);
      const gate = await checkMemberEligibility(uid, "found", { now: new Date() });
      if (!gate.ok) throw eligibilityError(gate.failures);
      return show(i, buildCreateConfirm(uid, { name: name.name, tag: tag.tag, fee: CRIME_FAMILY_CONFIG.createFee }));
    }
    case "deposit": {
      const amount = await resolveDepositAmount(uid, field("amount"), new Date());
      if (amount === null) throw new FamilyError(BAD_AMOUNT);
      const d = await depositToVault(uid, amount);
      return show(i, await vaultScreen(uid, `Deposited ${fmtFortunes(d.net)} (${fmtFortunes(d.tax)} tax burned).`));
    }
    case "rename": {
      const family = await renameFamily(uid, field("name"));
      return show(i, notice(`Your family is now **${familyLabel(family)}**.`));
    }
    case "disband": {
      const result = await disbandFamily(uid, field("tag"));
      await announceDisband(i.client, result);
      return show(i, notice(`**${familyLabel(result.family)}** has disbanded.`));
    }
    default:
      throw new FamilyError("This button is no longer active.");
  }
};

const cancelled: CfRoute = (i) => show(i, notice("Cancelled."));

const auto = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "auto", run });
const update = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "update", run });

export const CREW_ROUTES: CfRouteTable = {
  "create:open": modalOpener("create"),
  "vault:deposit": modalOpener("deposit"),
  "open:rename": modalOpener("rename"),
  "disband:open": modalOpener("disband"),
  v: auto(viewRoute),
  open: auto(openRoute),
  vault: auto(vaultRoute),
  "create:ok": update(createOkRoute),
  "create:no": update(cancelled),
  mg: update(manageRoute),
  cf: update(confirmRoute),
  pay: update(paydayRoute),
  lvl: update(levelRoute),
  log: update((i, [page, uid]) => logScreen(uid, Number(page) || 0).then((p) => show(i, p))),
  top: update((i, [sort, uid]) => topScreen(uid, sort, false).then((p) => show(i, p))),
  "disband:no": update(cancelled),
  "inv:sel": update(inviteSelectRoute),
  modal: { scope: "owner", ack: "ephemeral", run: modalRoute },
  inv: { scope: "shared", ack: "ephemeral", run: inviteRoute },
  claim: { scope: "shared", ack: "ephemeral", run: claimRoute },
};
