# Buff-Item Use Cooldowns — Design

**Date:** 2026-07-13
**Problem:** Shop buff/utility items whose benefit is repeatable have no per-use
cooldown, letting players money-print. Reported case: **Energy Drink** clears the
1-hour work cooldown, so `buy → use → work → repeat` is an infinite-income loop.

## Exploitable items and durations

Each item grants a repeatable economic benefit or bypasses a designed sink/gate.
Durations are tuned to exploit power, not a flat number.

| Item | Exploit vector | Use cooldown |
|---|---|---|
| Energy Drink | −1h job cooldown → clears the 1h work gate | 8h |
| Energy Flask | −2h work cooldown → same loop, bigger clear | 8h |
| Overtime Contract | clears work cooldown for an instant extra shift | 12h |
| Stress Pills | −20 stress → removes the stress gate on working | 6h |
| Lucky Coin | +50% next casino payout → repeatable EV flip | 6h |
| Bandage | clears a casino game cooldown → pacing bypass | 6h |
| Tax Shield | blocks taxes 1h → repeatable tax-sink bypass | 6h |
| Black Market Resume | +3–8 lifetime shifts → spam to skip career gates | 24h |

Items deliberately **excluded** (gated by their own context, not money loops):
Counterfeit Kit / Crown of Greed / Celestial Harp / Eclipse Mask / Padlock /
Thieves Gloves (combat & one-income-event buffs), Coffee Thermos (clears the
trivial 5-min study cooldown, XP not money). Gamble items (Mystery Box, Treasure
Map, Loaded Dice, Pandora Box, Devil Contract) already carry 24h cooldowns.

## Mechanism

Reuse the existing atomic cooldown infra in `shopItemEffects.ts`
(`claimItemCooldown` / `releaseItemCooldown`, backed by Redis `SET NX EX` on
`item_cd:<itemKey>:<discordId>`). Add:

- `BUFF_ITEM_COOLDOWN_SECONDS` — per-item durations.
- `withBuffCooldown(itemKey, discordId, fn)` — claims the cooldown **before**
  running the handler (atomic, so concurrent uses can't both resolve), and
  **releases** it if the item didn't actually grant its benefit
  (`success === false` **or** `shouldConsume === false`). Only a real, consumed
  use holds the cooldown.

The 8 handlers are wrapped at their `switch` cases in `handleSpecialItemUse`; the
handlers themselves are unchanged.

### Invariants preserved

- **No-op uses are free.** Energy Drink with no active shift, Stress Pills at 0
  stress, Bandage with no casino cooldown → `shouldConsume:false` → cooldown
  released and item not consumed. Matches the existing "pointless use is
  refunded" promise.
- **Blocked use never consumes.** All three call sites (`use.ts`, inventory
  button, shop "Use Now") consume only on `success && shouldConsume !== false`;
  a blocked claim returns `success:false`.
- **Testers bypass** (`claimItemCooldown` returns null for testers).
- **Redis-down fails open** (`setIfNotExists` returns true on error), consistent
  with existing gamble-item behavior; the Energy Drink's own `lastShift` check in
  Postgres still bounds the damage.

## Player-facing

Item descriptions (`shopCatalog.ts`) and the dashboard item table
(`items-and-shop.ts`, plus one casino strategy line) state the use cooldown. A
blocked use shows "This item is still recharging! Available <t:…:R>."
