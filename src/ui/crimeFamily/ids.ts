// customIds for the three Crime Families prefixes (spec 13.2). Owner-scoped
// ids end with the owner's id; shared cards carry a DB id instead. Plans 2
// and 3 add their builders to CPR_IDS and TURF_IDS.
import type { BoardSort, Requirements } from "../../services/crimeFamily/recruitService";
import type { WarBlockKey } from "../../services/crimeFamily/warMath";

export type CfPrefix = "crew" | "cpr" | "turf";

const PREFIXES: ReadonlySet<string> = new Set<CfPrefix>(["crew", "cpr", "turf"]);
const MAX_CUSTOM_ID = 100;

/** Joins the parts with ":"; throws when Discord's 100-character limit would be passed. */
export function cfId(prefix: CfPrefix, ...parts: (string | number)[]): string {
  const id = [prefix, ...parts].join(":");
  if (id.length > MAX_CUSTOM_ID) throw new Error(`customId over ${MAX_CUSTOM_ID} characters: ${id}`);
  return id;
}

export function parseCfId(customId: string): { prefix: CfPrefix; action: string; args: string[] } | null {
  const [prefix, action, ...args] = customId.split(":");
  if (!PREFIXES.has(prefix) || !action) return null;
  return { prefix: prefix as CfPrefix, action, args };
}

/** A family name inside a customId (names may hold spaces and apostrophes). */
export function encodeName(name: string): string {
  return Buffer.from(name, "utf8").toString("base64url");
}

export function decodeName(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString("utf8");
}

export type CrewScreen = "home" | "vault" | "manage" | "log" | "top" | "invites";
export type CrewOpenKind = "vault" | "payday" | "level" | "log" | "disband" | "rename" | "leave" | "vote";
export type CrewConfirmKind = "leave" | "kick" | "chair";
export type CrewManageAction = "promote" | "demote" | "kick" | "chair";
export type CrewModalKind = "create" | "deposit" | "rename" | "disband";

export const CREW_IDS = {
  view: (screen: CrewScreen, owner: string) => cfId("crew", "v", screen, owner),
  createOpen: (owner: string) => cfId("crew", "create", "open", owner),
  createOk: (tag: string, name: string, owner: string) => cfId("crew", "create", "ok", tag, encodeName(name), owner),
  createNo: (owner: string) => cfId("crew", "create", "no", owner),
  manageSelect: (page: number, owner: string) => cfId("crew", "mg", "sel", page, owner),
  managePage: (page: number, owner: string) => cfId("crew", "mg", "pg", page, owner),
  manage: (action: CrewManageAction, target: string, owner: string) => cfId("crew", "mg", action, target, owner),
  confirm: (kind: CrewConfirmKind, answer: "ok" | "no", target: string, owner: string) => cfId("crew", "cf", kind, answer, target, owner),
  open: (kind: CrewOpenKind, owner: string) => cfId("crew", "open", kind, owner),
  openTarget: (kind: "kick" | "chair", target: string, owner: string) => cfId("crew", "open", kind, target, owner),
  vault: (action: "deposit" | "payday" | "level", owner: string) => cfId("crew", "vault", action, owner),
  paydayOk: (earnings: number, count: number, owner: string) => cfId("crew", "pay", "ok", earnings, count, owner),
  levelOk: (level: number, owner: string) => cfId("crew", "lvl", "ok", level, owner),
  log: (page: number, owner: string) => cfId("crew", "log", page, owner),
  top: (sort: string, owner: string) => cfId("crew", "top", sort, owner),
  disband: (action: "open" | "no", owner: string) => cfId("crew", "disband", action, owner),
  modal: (kind: CrewModalKind, owner: string) => cfId("crew", "modal", kind, owner),
  inviteSelect: (owner: string) => cfId("crew", "inv", "sel", owner),
  invite: (answer: "accept" | "decline", inviteId: string) => cfId("crew", "inv", answer, inviteId),
  claim: (familyId: string) => cfId("crew", "claim", familyId),
  /** S2's Vote button and `!crew vote`'s opener target: S35, or the S25 vote card while a vote is open (F20). */
  voteStart: (owner: string) => cfId("crew", "vt", "start", owner),
  voteOk: (owner: string) => cfId("crew", "vt", "ok", owner),
  voteCancel: (owner: string) => cfId("crew", "vt", "cancel", owner),
  /** Shared: authorised against the vote's snapshot and membership. */
  ballot: (choice: "yes" | "no", voteId: string) => cfId("crew", "vote", choice, voteId),
  // Recruitment (amendment 8.8): every id is owner-scoped; the routes re-read the permission.
  board: (sort: BoardSort, qualify: boolean, page: number, owner: string) => cfId("crew", "bd", sort, qualify ? 1 : 0, page, owner),
  /** S29's select; the value is the familyId. */
  boardSelect: (owner: string) => cfId("crew", "bd", "sel", owner),
  myApps: (owner: string) => cfId("crew", "app", "mine", owner),
  /** S33's select; the value is the applicationId. */
  withdraw: (owner: string) => cfId("crew", "app", "wd", owner),
  familyCard: (familyId: string, owner: string) => cfId("crew", "fc", familyId, owner),
  applyOpen: (familyId: string, owner: string) => cfId("crew", "app", "open", familyId, owner),
  applyModal: (familyId: string, owner: string) => cfId("crew", "modal", "apply", familyId, owner),
  recruit: (kind: "home" | "toggle" | "inbox", owner: string) => cfId("crew", "rc", kind, owner),
  /** The listing modal opener carries the current requirements so M2 can pre-fill them without I/O (F10). */
  recruitEdit: (r: Requirements, owner: string) => cfId("crew", "rc", "edit", r.netWorth, r.shifts, r.ageDays, r.heists, owner),
  recruitModal: (owner: string) => cfId("crew", "modal", "recruit", owner),
  appAnswer: (answer: "accept" | "decline", appId: string, owner: string) => cfId("crew", "ap", answer, appId, owner),
  inboxPage: (page: number, owner: string) => cfId("crew", "ap", "pg", page, owner),
} as const;

/** Caper ids (spec 13.2): S2's Caper button and S11's select are owner-scoped; the shared cards carry the caper id. */
export const CPR_IDS = {
  viewPlan: (owner: string) => cfId("cpr", "v", "plan", owner),
  plan: (owner: string) => cfId("cpr", "plan", owner),
  join: (caperId: string) => cfId("cpr", "join", caperId),
  leave: (caperId: string) => cfId("cpr", "leave", caperId),
  start: (caperId: string) => cfId("cpr", "start", caperId),
  cancel: (caperId: string) => cfId("cpr", "cancel", caperId),
  /** Open brief on S13, S25 and S28, and S14's Refresh. */
  brief: (caperId: string) => cfId("cpr", "brief", caperId),
  act: (caperId: string, index: number) => cfId("cpr", "act", caperId, index),
  /** S14's Share: the seat's held intel to the seat it answers (A18). */
  share: (caperId: string) => cfId("cpr", "share", caperId),
  /** S27 opener for `!caper brief`: cpr:open:brief:<caperId>:<owner>, 60 characters at most. */
  openBrief: (caperId: string, owner: string) => cfId("cpr", "open", "brief", caperId, owner),
} as const;

/** Turf ids (spec 13.2): the map, select, opener and bid ids are owner-scoped; the war cards carry the war or hit id. */
export const TURF_IDS = {
  /** The S2 Turf button and S17's Back: S16. */
  viewMap: (owner: string) => cfId("turf", "v", "map", owner),
  /** S16's War board button (T20). */
  viewWar: (owner: string) => cfId("turf", "v", "war", owner),
  select: (owner: string) => cfId("turf", "sel", owner),
  /** S27 opener for `!turf racket <key>`. */
  openRacket: (racketKey: string, owner: string) => cfId("turf", "open", "racket", racketKey, owner),
  /** S17's Bid button: opens the bid modal. */
  bid: (racketKey: string, owner: string) => cfId("turf", "bid", racketKey, owner),
  bidModal: (racketKey: string, owner: string) => cfId("turf", "modal", "bid", racketKey, owner),
  scout: (warId: string) => cfId("turf", "scout", warId),
  hit: (warId: string, block: WarBlockKey) => cfId("turf", "hit", warId, block),
  hitAnswer: (hitId: string, index: number) => cfId("turf", "hx", hitId, index),
} as const;
