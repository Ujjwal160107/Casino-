import prisma from "../utils/prisma";

// How a player controls Fortuna's DMs. Nothing here sends anything or knows
// about the reminder queue; the drain and the notice senders read these prefs
// at send time.

export type DmNoticeGroup = "cooldown" | "account";

/**
 * Every DM a player can switch off in `!settings`. Cooldown types carry the
 * command the reminder points at; account types have none. Insertion order is
 * the order the settings panel renders.
 */
export const DM_NOTICE_TYPES = {
  daily: { label: "Daily reward", command: "!daily", group: "cooldown" },
  weekly: { label: "Weekly reward", command: "!weekly", group: "cooldown" },
  monthly: { label: "Monthly reward", command: "!monthly", group: "cooldown" },
  crime: { label: "Crime board", command: "!crime", group: "cooldown" },
  hunt: { label: "Hunt", command: "!hunt", group: "cooldown" },
  work: { label: "Work shift", command: "!work", group: "cooldown" },
  vote: { label: "Vote", command: "!vote", group: "cooldown" },
  card: { label: "Card statements", group: "account" },
  market: { label: "Market sales", group: "account" },
  investment: { label: "Investment payouts", group: "account" },
} as const;

export type DmNoticeType = keyof typeof DM_NOTICE_TYPES;

/** The subset that can be queued as a cooldown reminder: every entry with a command. */
export type CooldownReminderType = {
  [K in DmNoticeType]: (typeof DM_NOTICE_TYPES)[K] extends { command: string } ? K : never;
}[DmNoticeType];

const ALL_TYPES = Object.keys(DM_NOTICE_TYPES) as DmNoticeType[];

export function isDmNoticeType(value: string): value is DmNoticeType {
  return (ALL_TYPES as string[]).includes(value);
}

export function isCooldownReminderType(value: string): value is CooldownReminderType {
  return isDmNoticeType(value) && "command" in DM_NOTICE_TYPES[value];
}

export function noticeTypesInGroup(group: DmNoticeGroup): DmNoticeType[] {
  return ALL_TYPES.filter((t) => DM_NOTICE_TYPES[t].group === group);
}

export const MAX_DM_FAILS = 3;

export type DmPrefs = { remindersEnabled: boolean; disabledReminders: string[] };

export async function getDmPrefs(discordId: string): Promise<DmPrefs> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { remindersEnabled: true, disabledReminders: true },
  });
  return {
    remindersEnabled: user?.remindersEnabled ?? true,
    disabledReminders: user?.disabledReminders ?? [],
  };
}

export function isNoticeEnabled(prefs: DmPrefs, type: DmNoticeType): boolean {
  return prefs.remindersEnabled && !prefs.disabledReminders.includes(type);
}

/** Toggle one type. Returns the NEW enabled state of that type. */
export async function setNoticeTypeEnabled(discordId: string, type: DmNoticeType, enabled: boolean): Promise<boolean> {
  const prefs = await getDmPrefs(discordId);
  const disabled = new Set(prefs.disabledReminders);
  if (enabled) disabled.delete(type);
  else disabled.add(type);
  await prisma.user.update({
    where: { discordId },
    data: { disabledReminders: { set: Array.from(disabled) } },
  });
  return enabled;
}

export async function setMasterEnabled(discordId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({
    where: { discordId },
    data: { remindersEnabled: enabled, ...(enabled ? { reminderDmFailCount: 0 } : {}) },
  });
}

export async function recordDmDelivered(discordId: string): Promise<void> {
  await prisma.user.update({ where: { discordId }, data: { reminderDmFailCount: 0 } }).catch(() => {});
}

/** Count a closed or blocked DM. Auto-pauses the master at MAX_DM_FAILS in a row. */
export async function recordDmFailed(discordId: string): Promise<{ paused: boolean }> {
  const updated = await prisma.user
    .update({
      where: { discordId },
      data: { reminderDmFailCount: { increment: 1 } },
      select: { reminderDmFailCount: true },
    })
    .catch(() => null);
  const fails = updated?.reminderDmFailCount ?? 0;
  if (fails >= MAX_DM_FAILS) {
    await prisma.user.update({
      where: { discordId },
      data: { remindersEnabled: false, reminderDmFailCount: 0 },
    }).catch(() => {});
    return { paused: true };
  }
  return { paused: false };
}
