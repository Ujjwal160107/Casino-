import { Client } from "discord.js";
import prisma from "../utils/prisma";
import { isTester } from "../utils/developerAccess";
import {
  CooldownReminderType,
  DM_NOTICE_TYPES,
  getDmPrefs,
  isCooldownReminderType,
  isNoticeEnabled,
  recordDmDelivered,
  recordDmFailed,
} from "./dmPrefsService";

// The reminder QUEUE. Which DMs a player allows lives in dmPrefsService; the
// drain reads those prefs at fire time, so nothing here has to delete rows
// when a toggle changes.

const BATCH_SIZE = 200;
const FOOTER = "-# Manage these DMs with `!settings` in any server with Fortuna.";

/**
 * Queue a reminder for when a cooldown lifts. Replaces any pending reminder
 * of the same type. Fire-and-forget: never throws, never blocks the caller.
 */
export async function enqueueReminder(discordId: string, type: CooldownReminderType, dueAt: Date): Promise<void> {
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

    const prefs = await getDmPrefs(discordId);
    if (!isNoticeEnabled(prefs, type)) return;

    await prisma.cooldownReminder.upsert({
      where: { discordId_type: { discordId, type } },
      create: { discordId, type, dueAt },
      update: { dueAt },
    });
  } catch (err) {
    console.error(`enqueueReminder failed for ${discordId}/${type}:`, err);
  }
}

// Mirrors the shift gate in lifeInteractionHandler: flat base minus
// COOLDOWN_REDUCTION active effects, floored at zero.
const WORK_BASE_COOLDOWN_SECONDS = 3600;

/** Enqueue a work reminder using the same cooldown math as the shift gate. */
export async function enqueueWorkReminder(discordId: string): Promise<void> {
  try {
    const effects = await prisma.activeEffect.findMany({
      where: {
        userId: discordId,
        effectType: "COOLDOWN_REDUCTION",
        OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
      },
    });
    const reduction = effects.reduce((sum, eff) => sum + (eff.value || 0), 0);
    const seconds = Math.max(0, WORK_BASE_COOLDOWN_SECONDS - reduction);
    await enqueueReminder(discordId, "work", new Date(Date.now() + seconds * 1000));
  } catch (err) {
    console.error(`enqueueWorkReminder failed for ${discordId}:`, err);
  }
}

export async function cancelReminder(discordId: string, type: CooldownReminderType): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId, type } }).catch(() => {});
}

export async function cancelAll(discordId: string): Promise<void> {
  await prisma.cooldownReminder.deleteMany({ where: { discordId } }).catch(() => {});
}

function buildDmContent(types: CooldownReminderType[]): string {
  if (types.length === 1) {
    const t = DM_NOTICE_TYPES[types[0]];
    return `⏰ **Cooldown lifted!** Your **${t.label.toLowerCase()}** is ready — use \`${t.command}\`.\n${FOOTER}`;
  }
  const lines = types.map((ty) => `• **${DM_NOTICE_TYPES[ty].label}** — \`${DM_NOTICE_TYPES[ty].command}\``);
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

  const byUser = new Map<string, CooldownReminderType[]>();
  for (const row of due) {
    if (!isCooldownReminderType(row.type)) continue; // unknown types are dropped silently
    const list = byUser.get(row.discordId) ?? [];
    list.push(row.type);
    byUser.set(row.discordId, list);
  }

  for (const [discordId, types] of byUser) {
    try {
      const prefs = await getDmPrefs(discordId);
      const active = types.filter((t) => isNoticeEnabled(prefs, t));
      if (active.length === 0) continue;

      const discordUser = await client.users.fetch(discordId).catch(() => null);
      if (!discordUser) continue;

      try {
        await discordUser.send({ content: buildDmContent(active) });
        await recordDmDelivered(discordId);
      } catch {
        await recordDmFailed(discordId);
      }
    } catch (err) {
      console.error(`processDueReminders failed for ${discordId}:`, err);
    }
  }
}
