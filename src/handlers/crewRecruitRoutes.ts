// RECRUIT_ROUTES: the recruitment board presses (amendment 8.8). Every id is
// owner-scoped; the services re-read the officer's permission on each press.
// Like the vote presses, these work from DMs (the digest's Open inbox), so
// they check only the kill switch, never the guild (F1). Imports no other
// route table.
import type { ModalBuilder } from "discord.js";
import { requireMembership } from "../services/crimeFamily/familyQueries";
import {
  getBoardView, getFamilyCardView, getInboxView, getMyApplicationsView, getRecruitPanelView, type BoardSort,
} from "../services/crimeFamily/recruitQueries";
import {
  acceptApplication, applyToFamily, declineApplication, editListing, setRecruiting, withdrawApplication,
} from "../services/crimeFamily/recruitService";
import { FamilyError } from "../services/crimeFamily/tx";
import { announceApplicationAnswer } from "../ui/crimeFamily/recruitAnnounce";
import {
  buildApplyModal, buildBoard, buildFamilyCard, buildInbox, buildListingModal, buildMyApplications, buildRecruitPanel,
} from "../ui/crimeFamily/recruitScreens";
import type { CfInteraction, CfRoute, CfRouteEntry, CfRouteTable } from "./crimeFamilyRouter";
import { assertEnabled, auto, owner, show, showThenAnnounce, update } from "./crewRouteKit";

const SORTS: ReadonlySet<string> = new Set<BoardSort>(["lvl", "mem", "act"]);

const ephemeral = (run: CfRoute): CfRouteEntry => ({ scope: "owner", ack: "ephemeral", run });
/** A modal opener: showModal is the first await, with no I/O before it (the submit re-checks everything). */
const modalOpener = (modal: (args: string[]) => ModalBuilder): CfRouteEntry => ({
  scope: "modalOpener",
  ack: "modal",
  run: async (i, args) => {
    if (!i.isModalSubmit()) await i.showModal(modal(args));
  },
});

const picked = (i: CfInteraction) => (i.isStringSelectMenu() ? i.values[0] : undefined);
const field = (i: CfInteraction, id: string) => (i.isModalSubmit() ? i.fields.getTextInputValue(id) : "");

const boardScreen = (uid: string, sort: string, qualify: boolean, page: number) =>
  getBoardView(uid, SORTS.has(sort) ? (sort as BoardSort) : "lvl", qualify, page, new Date()).then(buildBoard);
const cardScreen = async (familyId: string, uid: string, note?: string) => buildFamilyCard(await getFamilyCardView(familyId, uid, new Date()), note);
const panelScreen = async (uid: string, note?: string) => buildRecruitPanel(await getRecruitPanelView(uid, new Date()), note);
const inboxScreen = async (uid: string, page: number, note?: string) => buildInbox(await getInboxView(uid, page, new Date()), note);
const myAppsScreen = async (uid: string, note?: string) => buildMyApplications(await getMyApplicationsView(uid, new Date()), note);

/** `crew:bd:<sort>:<0|1>:<page>:<owner>` (S29 sorts, filter and pager; S1's Find a family; S33's Board). */
const boardRoute: CfRoute = async (i, [sort, q, page, uid]) => {
  assertEnabled();
  return show(i, await boardScreen(uid, sort, q === "1", Number(page) || 0));
};

/** `crew:bd:sel:<owner>` (value = familyId) and `crew:fc:<familyId>:<owner>`: S30. */
const cardRoute = (familyIdOf: (i: CfInteraction, args: string[]) => string | undefined): CfRoute => async (i, args) => {
  assertEnabled();
  const familyId = familyIdOf(i, args);
  if (!familyId) throw new FamilyError("Pick a family.");
  return show(i, await cardScreen(familyId, owner(args)));
};

/** `crew:modal:apply:<familyId>:<owner>` (M1): the application, then S30 (F12: the press's guild and channel). */
const applyRoute: CfRoute = async (i, args) => {
  assertEnabled();
  const uid = owner(args);
  await applyToFamily({ applicantId: uid, familyId: args[1], message: field(i, "message"), guildId: i.guildId ?? "", channelId: i.channelId ?? "" });
  return show(i, await cardScreen(args[1], uid, "Application sent. Officers see it in their inbox."));
};

/** `crew:app:wd:<owner>` (S33's select, value = applicationId). */
const withdrawRoute: CfRoute = async (i, args) => {
  assertEnabled();
  const appId = picked(i);
  if (!appId) throw new FamilyError("Pick an application.");
  const uid = owner(args);
  await withdrawApplication(appId, uid);
  return show(i, await myAppsScreen(uid, "Application withdrawn. You can apply there again in 24 hours."));
};

/** `crew:rc:toggle:<owner>` (S31). */
const toggleRoute: CfRoute = async (i, args) => {
  assertEnabled();
  const uid = owner(args);
  const panel = await getRecruitPanelView(uid, new Date());
  await setRecruiting(uid, !panel.recruiting);
  return show(i, await panelScreen(uid));
};

/** `crew:modal:recruit:<owner>` (M2). */
const listingRoute: CfRoute = async (i, args) => {
  assertEnabled();
  const uid = owner(args);
  await editListing(uid, {
    pitch: field(i, "pitch"), minNetWorth: field(i, "nw"), minShifts: field(i, "shifts"), minAgeDays: field(i, "age"), minHeists: field(i, "heists"),
  });
  return show(i, await panelScreen(uid, "Listing saved."));
};

/** `crew:ap:<accept|decline>:<appId>:<owner>` (S32): the answer, S32 page 0 (the id carries no page), then the applicant's DM. */
const answerRoute: CfRoute = async (i, [answer, appId, uid]) => {
  assertEnabled();
  if (answer === "accept") {
    const { family, application } = await acceptApplication(appId, uid);
    return showThenAnnounce(i, inboxScreen(uid, 0, `Accepted <@${application.inviteeId}>.`),
      () => announceApplicationAnswer(i.client, application, family, "accepted"));
  }
  const application = await declineApplication(appId, uid);
  const { family } = await requireMembership(uid);
  return showThenAnnounce(i, inboxScreen(uid, 0, `Declined <@${application.inviteeId}>.`),
    () => announceApplicationAnswer(i.client, application, family, "declined"));
};

const read = (run: (uid: string, args: string[]) => Promise<Parameters<typeof show>[1]>): CfRoute => async (i, args) => {
  assertEnabled();
  return show(i, await run(owner(args), args));
};

export const RECRUIT_ROUTES: CfRouteTable = {
  bd: auto(boardRoute),
  "bd:sel": ephemeral(cardRoute((i) => picked(i))),
  fc: ephemeral(cardRoute((_i, [familyId]) => familyId)),
  "app:open": modalOpener((args) => buildApplyModal(args[1], owner(args))),
  /** More specific than CREW_ROUTES' `modal`, so it wins in the merged table. */
  "modal:apply": ephemeral(applyRoute),
  "app:mine": auto(read((uid) => myAppsScreen(uid))),
  "app:wd": update(withdrawRoute),
  "rc:home": auto(read((uid) => panelScreen(uid))),
  "rc:toggle": update(toggleRoute),
  /** F10: `crew:rc:edit:<nw>:<sh>:<age>:<heists>:<owner>` pre-fills M2. */
  "rc:edit": modalOpener((args) => buildListingModal(
    { netWorth: Number(args[1]) || 0, shifts: Number(args[2]) || 0, ageDays: Number(args[3]) || 0, heists: Number(args[4]) || 0 }, owner(args))),
  "modal:recruit": ephemeral(listingRoute),
  "rc:inbox": auto(read((uid) => inboxScreen(uid, 0))),
  "ap:pg": update(read((uid, [, page]) => inboxScreen(uid, Number(page) || 0))),
  ap: update(answerRoute),
};
