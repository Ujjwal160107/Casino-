import { Client } from "discord.js";
import prisma from "../utils/prisma";
import { isTester } from "../utils/developerAccess";

export const REMINDER_TYPES = {
  daily: { label: "Daily reward", command: "!daily" },
  weekly: { label: "Weekly reward", command: "!weekly" },
  monthly: { label: "Monthly reward", command: "!monthly" },
  crime: { label: "Crime board", command: "!crime" },
  hunt: { label: "Hunt", command: "!hunt" },
  work: { label: "Work shift", command: "!work" },
  vote: { label: "Vote", command: "!vote" },
} as const;

export type ReminderType = keyof typeof REMINDER_TYPES;

const ALL_TYPES = Object.keys(REMINDER_TYPES) as ReminderType[];
const BATCH_SIZE = 200;
const MAX_DM_FAILS = 3;
const FOOTER = "-# Manage these DMs with `!settings` in any server with Fortuna.";

export function isReminderType(value: string): value is ReminderType {
  return (ALL_TYPES as string[]).includes(value);
}

export async function getReminderPrefs(discordId: string) {
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { remindersEnabled: true, disabledReminders: true },
  });
  return {
    remindersEnabled: user?.remindersEnabled ?? true,
    disabledReminders: user?.disabledReminders ?? [],
  };
}

/**
 * Queue a reminder for when a cooldown lifts. Replaces any pending reminder
 * of the same type. Fire-and-forget: never throws, never blocks the caller.
 */
export async function enqueueReminder(discordId: string, type: ReminderType, dueAt: Date): Promise<void> {
  try {
    if (isTester(discordId)) return;

    // Lazy migration: carry the legacy vote opt-out into the new prefs once.
    if (type === "vote") {
      const legacy = await prisma.user.findUnique({
        where: { discordId },
        select: { voteReminder: true, disabledReminders: true },
      });
      if (legacy && legacy.voteReminder === false && !legacy.disabledReminders.includes("vote")) {
        await prisma.user.update({
          where: { discordId },
          data: { disabledReminders: { push: "vote" }, voteReminder: true },
        });
        return;
      }
    }

    const prefs = await getReminderPrefs(discordId);
    if (!prefs.remindersEnabled || prefs.disabledReminders.includes(type)) return;

    await prisma.cooldownReminder.upsert({
      where: { discordId_type: { discordId, type } },
      create: { discordId, type, dueAt },
      update: { dueAt },
    });
  } catch (err) {
    console.error(`enqueueReminder failed for ${discordId}/${type}:`, err);
  }
}

export async function cancelReminder(discordId: string, type: ReminderType): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId, type } }).catch(() => {});
}

export async function cancelAll(discordId: string): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId } }).catch(() => {});
}

/** Toggle one type. Returns the NEW enabled state of that type. */
export async function setReminderTypeEnabled(discordId: string, type: ReminderType, enabled: boolean): Promise<boolean> {
  const prefs = await getReminderPrefs(discordId);
  const disabled = new Set(prefs.disabledReminders);
  if (enabled) disabled.delete(type);
  else disabled.add(type);
  await prisma.user.update({
    where: { discordId },
    data: { disabledReminders: { set: Array.from(disabled) } },
  });
  if (!enabled) await cancelReminder(discordId, type);
  return enabled;
}

export async function setMasterEnabled(discordId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({
    where: { discordId },
    data: { remindersEnabled: enabled, ...(enabled ? { reminderDmFailCount: 0 } : {}) },
  });
  if (!enabled) await cancelAll(discordId);
}

function buildDmContent(types: ReminderType[]): string {
  if (types.length === 1) {
    const t = REMINDER_TYPES[types[0]];
    return `⏰ **Cooldown lifted!** Your **${t.label.toLowerCase()}** is ready — use \`${t.command}\`.\n${FOOTER}`;
  }
  const lines = types.map((ty) => `• **${REMINDER_TYPES[ty].label}** — \`${REMINDER_TYPES[ty].command}\``);
  return `⏰ **Cooldowns lifted!** Ready to use:\n${lines.join("\n")}\n${FOOTER}`;
}

/** Called by the per-minute cron. Drains due reminders, one combined DM per player. */
export async function processDueReminders(client: Client): Promise<void> {
  const due = await prisma.cooldownReminder.findMany({
    where: { dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: BATCH_SIZE,
  });
  if (due.length === 0) return;

  // Delete the batch up front: fire-once semantics regardless of DM outcome.
  await prisma.cooldownReminder.deleteMany({ where: { id: { in: due.map((r) => r.id) } } });

  const byUser = new Map<string, ReminderType[]>();
  for (const row of due) {
    if (!isReminderType(row.type)) continue; // unknown types are dropped silently
    const list = byUser.get(row.discordId) ?? [];
    list.push(row.type);
    byUser.set(row.discordId, list);
  }

  for (const [discordId, types] of byUser) {
    try {
      const prefs = await getReminderPrefs(discordId);
      if (!prefs.remindersEnabled) continue;
      const active = types.filter((t) => !prefs.disabledReminders.includes(t));
      if (active.length === 0) continue;

      const discordUser = await client.users.fetch(discordId).catch(() => null);
      if (!discordUser) continue;

      try {
        await discordUser.send({ content: buildDmContent(active) });
        await prisma.user.update({
          where: { discordId },
          data: { reminderDmFailCount: 0 },
        }).catch(() => {});
      } catch {
        // DMs closed or blocked — count it; auto-pause after MAX_DM_FAILS in a row.
        const user = await prisma.user.findUnique({
          where: { discordId },
          select: { reminderDmFailCount: true },
        });
        const fails = (user?.reminderDmFailCount ?? 0) + 1;
        if (fails >= MAX_DM_FAILS) {
          await prisma.user.update({
            where: { discordId },
            data: { remindersEnabled: false, reminderDmFailCount: 0 },
          }).catch(() => {});
          await cancelAll(discordId);
        } else {
          await prisma.user.update({
            where: { discordId },
            data: { reminderDmFailCount: fails },
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`processDueReminders failed for ${discordId}:`, err);
    }
  }
}
