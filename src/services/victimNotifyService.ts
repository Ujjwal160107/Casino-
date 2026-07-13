import { Client } from "discord.js";
import { fmtCurrency } from "../utils/format";

// Security notices sent when something is done TO a player. Deliberately
// independent of the cooldown-alarm settings: always on, never counted
// against reminderDmFailCount, all failures swallowed.

async function sendDm(client: Client, userId: string, content: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    await user.send({ content }).catch(() => {});
  } catch {
    // Never let a notification failure surface to gameplay.
  }
}

export async function notifyRobbed(
  client: Client,
  victimId: string,
  robberName: string,
  amount: number,
  guildName: string | null,
): Promise<void> {
  const where = guildName ? ` in **${guildName}**` : "";
  await sendDm(
    client,
    victimId,
    `🚨 **You've been robbed!** **${robberName}** lifted **${fmtCurrency(amount)}** from your wallet${where}.\n` +
      "-# Wallet money can be robbed — bank what you don't need with `!deposit`.",
  );
}

export async function notifyPadlockUsed(
  client: Client,
  victimId: string,
  robberName: string,
  guildName: string | null,
): Promise<void> {
  const where = guildName ? ` in **${guildName}**` : "";
  await sendDm(
    client,
    victimId,
    `🔒 **Your Padlock just paid for itself.** **${robberName}** tried to rob you${where} — it blocked the hit and broke in the process.\n` +
      "-# Padlocks are single-use. Grab another: `!shop buy padlock`.",
  );
}
