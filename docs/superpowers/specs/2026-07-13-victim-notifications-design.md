# Victim DM Notifications (Robbery + Padlock) — Design Spec

Date: 2026-07-13
Status: Approved by Ujjwal

## Goal

DM a player instantly when something is done TO them: they got robbed (who + how much), or their Padlock was consumed blocking a robbery. Always on — deliberately NOT part of the `!settings` reminder toggles.

## Scope — exactly two notifications

| Event | Trigger site | DM content |
|---|---|---|
| Robbed | `src/commands/economy/rob.ts` success path, after the wallet-debit transaction commits | Robber's display name, exact amount stolen, server name, tip that bank money can't be robbed |
| Padlock used | `src/commands/economy/rob.ts` padlock-block branch (`checkPadlock` returns true — the padlock is single-use and is deleted at that moment) | Robber's display name, server name, that the Padlock blocked the hit and broke, tip to buy another |

Out of scope: DM on failed rob attempts without a padlock; padlock natural-expiry notices (no expiry events exist); any settings toggle for these.

## Architecture

New `src/services/victimNotifyService.ts`:

- `notifyRobbed(client: Client, victimId: string, robberName: string, amount: number, guildName: string | null): Promise<void>`
- `notifyPadlockUsed(client: Client, victimId: string, robberName: string, guildName: string | null): Promise<void>`

Rules for both:
- **Always on.** Do NOT read `remindersEnabled`/`disabledReminders`; do NOT touch `reminderDmFailCount` (fully independent of the cooldown-alarm system and its auto-pause).
- Fire-and-forget: internal try/catch, all failures swallowed (closed DMs = silent skip). A DM failure must never affect the robbery flow.
- Amounts formatted with `fmtCurrency`; copy in the bot's voice.

DM copy:

Robbed:
> 🚨 **You've been robbed!** **{robber}** lifted **{amount}** from your wallet in **{server}**.
> -# Wallet money can be robbed — bank what you don't need with `!deposit`.

Padlock:
> 🔒 **Your Padlock just paid for itself.** **{robber}** tried to rob you in **{server}** — it blocked the hit and broke in the process.
> -# Padlocks are single-use. Grab another: `!shop buy padlock`.

(`in **{server}**` is omitted when guildName is null.)

## Hooks (rob.ts)

1. Padlock branch (~line 59): after the "Robbery Blocked" reply, `void notifyPadlockUsed(message.client, targetUser.id, message.author.displayName ?? message.author.username, guild name)`.
2. Success path: after the Prisma transaction commits and the final `robAmount` is known, `void notifyRobbed(message.client, targetUser.id, <robber display name>, robAmount, guild name)`.

## Settings transparency

`src/commands/general/settings.ts`: add one container line under the toggles: `-# Security alerts (robbery, padlock) are always on.`

## Website docs

`dashboard/src/content/modules/economy.ts`: one sentence in the "Robbing & getting robbed" section body: victims are DM'd who robbed them and for how much, and when their Padlock is consumed.

## Verification

`npx tsc --noEmit` clean (bot); `npx next build` clean (site); manual smoke on a live bot: rob a padlocked account → victim gets the padlock DM; rob an unprotected account successfully → victim gets the robbed DM with correct name/amount.
