# Components V2 Migration — Design

**Date:** 2026-07-13
**Status:** Approved pending user spec review

## Goal

Remove every classic Discord embed from the bot and replace it with Discord Components V2
(ContainerBuilder + TextDisplayBuilder + SectionBuilder), in the minimal Dank Memer style
already used by the migrated hunt/zoo/shop screens. Nothing user-visible may break and no
message content may be silently dropped.

## Decisions (confirmed with user)

1. **No accent colors anywhere.** `setAccentColor` renders the same colored side bar as
   old embeds. Strip all 76 occurrences from the 33 already-migrated V2 files, and never
   use it in newly migrated code. The hunt embed (stripe-free) is the reference look.
2. **Scope: absolutely everything.** Player commands, admin commands, DMs/service
   messages (tax, jail, welcome-on-join), and internal ops logging (`discordLogger`) all
   move to V2. Zero embeds remain in `src/`.
3. **Status messages keep the mascot thumbnail.** info/success/error replies render as a
   container with a Section: text left, Fortuna mascot reaction image (think/success/fail
   emote via `getEmoteUrl`) as the right-side thumbnail accessory.
4. **Footer and timestamp are gone.** The "Lady Fortuna • Play Responsibly" footer line
   and `setTimestamp()` are removed by design. This is the only intentional content loss.
5. **Author header dropped.** Old embeds set the invoker's username + avatar as the embed
   author. V2 replies rely on Discord's reply reference; titles carry the name where it
   matters (e.g. `## Yash's Balance`).
6. **Approach: central V2 kit + module batches** (chosen over inline per-file conversion
   and over a compatibility shim).
7. **Verification: typecheck + payload audit + live smoke test** with the dev token
   against a test guild before pushing to `main`.

## House style (matches existing hunt/zoo V2 code)

- `## Title` markdown heading in the first TextDisplay; bold key numbers.
- `SeparatorBuilder` with `SeparatorSpacingSize.Small` between logical blocks;
  `setDivider(true)` for real breaks, `setDivider(false)` for breathing room.
- `-#` small text for cooldowns, hints, and fine print.
- Game-asset thumbnails (animals, items, shop art) stay, as `SectionBuilder`
  thumbnail accessories with `attachment://` URLs.
- Every V2 send sets `MessageFlags.IsComponentsV2` (OR-combined with `Ephemeral` where
  the old reply was ephemeral).
- No `content:` or `embeds:` field may coexist with the flag — everything is components.

## Component 1: V2 kit — `src/utils/componentsV2.ts`

Drop-in replacement for `src/utils/embed.ts`:

- `statusContainer(kind: "info" | "success" | "error", title: string, desc?: string, opts?: { hint?: string })`
  → `ContainerBuilder` holding one `SectionBuilder` (TextDisplay: `## title\ndesc`,
  thumbnail accessory: mascot emote for the kind). If `opts.hint` is set, append a
  no-divider separator + `-# hint` TextDisplay.
- `plainContainer(...lines: string[])` → bare container of TextDisplays for custom screens.
- `v2Reply(containers: ContainerBuilder[] | ContainerBuilder, files?: AttachmentBuilder[], extraFlags?: number)`
  → `{ components, files, flags: MessageFlags.IsComponentsV2 | extraFlags }`.
- `balanceContainer(...)` — V2 equivalent of the old `balanceEmbed` (wallet/bank lines,
  money mascot thumbnail).

The kit is the single place that enforces: no accent color, no footer, no timestamp.

## Component 2: next-step hints — `src/config/nextSteps.ts`

A curated `Record<string, string>` from command key → hint line, plus
`nextStepHint(key, prefix)` that formats it as `-# Tip: …` with the server prefix
substituted. Hints appear on **success outputs only** — never on error replies, never on
admin commands. Commands not in the map show no hint. `{p}` = server prefix.

| Command | Hint |
|---|---|
| balance | Wallets can be robbed — bank it with `{p}deposit` |
| deposit | Upgrade capacity and earn interest in `{p}bank` |
| withdraw | Wallet cash is rob-bait — a padlock from `{p}shop` slows thieves down |
| daily | Stack `{p}weekly`, `{p}monthly`, and `{p}vote` rewards too |
| weekly | Don't miss `{p}daily` and `{p}vote` |
| monthly | Keep the streak: `{p}daily` and `{p}weekly` |
| vote | Claim `{p}daily` while you're here |
| bank | Need credit? `{p}card issue` gets you a Fortuna Card |
| card / mycards | Keep your score healthy — check `{p}credit` |
| credit | Manage cards with `{p}mycards` |
| beg | Ready for bigger scores? Try `{p}crime` |
| crime (success) | Deposit it before someone robs you — `{p}deposit` |
| crime (jailed) | Check `{p}jail`, pay `{p}bail` to get out early |
| rob (success) | Bank the loot fast — `{p}deposit` |
| jail | Pay `{p}bail` to get out early |
| bail | Stay clean… or don't: `{p}crime` |
| shop buy | `{p}equip` gear, `{p}use` consumables, `{p}iteminfo` for details |
| inventory | `{p}use`, `{p}equip`, or `{p}iteminfo <item>` |
| market | Rare loot comes from `{p}hunt` |
| stock buy/sell | Track P/L with `{p}my-stocks` |
| my-stocks | Trade with `{p}stock buy` / `{p}stock sell` |
| properties / buy-property | Collect income with `{p}collect-rent` |
| collect-rent | Browse more with `{p}properties` |
| coinflip / slots / blackjack / bet (roulette) / rr | New here? `{p}casinoguide` explains every game |
| cockfight | Raise your own fighter: `{p}chicken` |
| chicken | Ready to fight? `{p}cockfight <amount>` |
| feed | Train it too: `{p}chicken train` |
| hunt | (already live: craft/zoo hints — unchanged) |
| zoo | (already live: `!hunt` hint — unchanged) |
| jobs | Apply with `{p}apply <job>` |
| apply | Start your first shift: `{p}work` |
| work | Promotions live in `{p}career`; stressed? `{p}relax` |
| career | Better jobs unlock with degrees — `{p}education` |
| relax | Back to the grind: `{p}work` |
| education | Enroll with `{p}enroll <degree>`, then `{p}study` |
| enroll | Hit the books: `{p}study` |
| study | Ready? `{p}exam`. Stressed? `{p}relax` |
| exam (pass) | Higher-tier jobs just unlocked — `{p}jobs` |
| dropout | Re-enroll anytime: `{p}enroll <degree>` |
| start | Take the `{p}tutorial`, then grab your `{p}daily` |
| tutorial | Grab `{p}daily`, get a job via `{p}jobs`, or hit `{p}casinoguide` |

Copy is reviewable/editable in this one file without touching command code.

## Component 3: pagination — `src/utils/pagination.ts`

`sendPaginatedEmbed(message, embeds[])` becomes
`sendPaginatedContainers(message, containers: ContainerBuilder[])`: same Prev/Next
collector logic, but pages are containers sent with `IsComponentsV2`, and the page
indicator moves into a `-# Page x/y` TextDisplay appended to each page. All callers
updated in the same commit as their module batch.

## Component 4: commandRouter + shared error surfaces

The router's catch-all error reply, cooldown replies, and permission denials switch to
`statusContainer("error", …)` via the kit. Same for `interactionHelpers`/`collectorHelper`
if they build embeds.

## Migration batches

Each batch = migrate files → `npm run typecheck` → payload audit script → one commit.
Atomicity rule: **a message sent as V2 can never be edited back into an embed message**,
so a command and every handler/collector that later edits its messages migrate in the
same commit (blackjack loop, chicken, russian roulette, roulette, cockfight, jail, ask,
life flows, pagination callers).

- **Batch 0 — foundation:** componentsV2 kit, nextSteps config, strip `setAccentColor`
  from all 33 existing V2 files, pagination rework, commandRouter error/cooldown replies,
  generalize `checkHuntPayload.ts` into `src/scripts/checkV2Payloads.ts`.
- **Batch 1 — economy:** ask (+askInteractionHandler), balance, crime, daily, deposit,
  equip, incomeCommands, iteminfo, jail (+jailInteractionHandler), monthly, myStocks,
  profile (finish), rob, transfer, vote, weekly, withdrawBank.
- **Batch 2 — games:** blackjack, chicken, cockfight (finish), coinflip (finish), feed,
  roulette, russianRoulette, slots (finish), hunt (finish, +huntInteractionHandler
  remnants).
- **Batch 3 — life:** apply, dropout, education (finish), enroll, study,
  +lifeInteractionHandler (24 embed sends — the single biggest file).
- **Batch 4 — general + admin:** ping, start, testwelcome, setPrefix, setMoney, addMoney,
  removeMoney, removeItem, resetEconomy, resetShop, addShopItem, manageShop,
  manageCreditScore, adminProperty, educationAdmin, addEmoji.
- **Batch 5 — services/listeners + teardown:** taxService, discordLogger,
  guildCreateListener, delete `src/utils/embed.ts`, repo-wide sweep proving zero
  `EmbedBuilder` / `embeds: [` / `setAccentColor` / `setFooter` / `setTimestamp` in
  `src/`, full `npm run build`.

## Hard limits (enforced by checkV2Payloads.ts)

- ≤ 40 total components per message (Discord 50035 otherwise — swallowed silently by the
  global handler, worst failure mode).
- ≤ 4000 chars across all TextDisplays per message.
- ≤ 10 attachments.
- Audit covers the worst-case largest screens: hunt (existing check), profile, education,
  study results, leaderboard, iteminfo, help pages, lifeInteractionHandler screens.

## What does NOT change

- Business logic, services, DB schema, cooldowns, payouts — presentation only.
- dashboard/ website.
- Existing V2 layouts (hunt, zoo, shop, market, bank, help, tutorial…) except accent-color
  removal.
- Game-asset thumbnails and attachment plumbing.

## Verification & delivery

1. Per batch: `npm run typecheck` + `npx ts-node --transpile-only src/scripts/checkV2Payloads.ts`.
2. After Batch 5: `npm run build`.
3. Live smoke: run `npm run dev` with the local `.env`, exercise migrated commands in the
   test guild, watch logs for 50035/50006 errors; fix before push.
4. Push all batch commits to `main` after the smoke test passes.
