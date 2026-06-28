# Crime Module Overhaul — Design Spec

**Date:** 2026-06-21  
**Status:** Approved for planning  
**Command:** `,crime` (prefix-aware)

> **Minigames addendum:** Success is determined by crime-specific minigame stages, not RNG. See [2026-06-21-crime-minigames-design.md](./2026-06-21-crime-minigames-design.md).

---

## 1. Summary

Replace the current single-roll `,crime` command with an interactive **Crime Board**: a pool of ~58 crimes, **5 random offers** per session, **required item prep** (1 item for standard jobs; **3 cross-category items** for Legendary heists), one commit roll, **1 hour shared cooldown**.

Crime is **high win / high lose**: tiered payouts and fines scale up; optional jail on high-tier failures. **Legendary** heavy crimes (bank robbery, drug dealing, etc.) sit at the top — highest payout, lowest base odds, **multi-item prep**. Only a **curated whitelist** of thematically appropriate shop + Hunt Craft items can be used as crime prep (e.g. Thieves Gloves, rifles, Cheat Sheet — not every store item).

---

## 2. Goals

| Goal | Detail |
|------|--------|
| Interactivity | User chooses a crime; **fixed required gear** must be owned to commit |
| Shop integration | Curated crime-prep whitelist across shops + Hunt Craft |
| Variety | ~58 crime definitions; 5 shown per board; 8 Legendary heavy crimes |
| Economy | 1 attempt/hr; swings worth the wait |
| Compatibility | Keep heat, luck, crafted buffs, Crown/Devil/Soul Ledger |

## Non-goals (v1)

- Cosmetics shop items as crime prep
- Auto-eligibility for all items in a shop category (whitelist only)
- Optional / pick-one prep items (items are **mandatory gates**, not bonuses you choose)
- PvP crime (rob stays separate)
- Per-crime cooldowns
- Admin crime editor UI

---

## 3. Player Flow

```
,crime
  → [Cooldown check: if on CD, show time remaining + last result hint]
  → [Roll board session: 5 crimes, smart selection — see §5]
  → Crime Board UI (CV2)
       • 5 jobs with tier, odds preview, payout/fine bands, lock state
  → User selects a crime (playable only if they **own all required items**)
  → Prep confirmation UI
       • Lists the crime’s **fixed required items** (not a picker — no alternatives)
       • Standard: **1** mandated item · Legendary: **3** mandated items
       • Confirm enabled only when every required item is in inventory
  → Confirm
  → Single roll → success/fail embed
  → Set 1hr cooldown (on commit only, not on board open)
```

**Session rules**

- Board session stored in Redis: `crime_session:{discordId}` TTL **10 minutes**
- Re-opening `,crime` within TTL reuses same 5 crimes (no fishing)
- After TTL, next `,crime` rolls a fresh board
- Cooldown does **not** start when opening the board

**Required prep (mandatory — not optional)**

- Every crime defines **`requiredItems: string[]`** — exact item keys from the prep whitelist. **No substitutes. No pick-one menus.**
- **Standard (Petty–Elite):** exactly **1** required item. User must **own** it to see the crime as playable; commit uses that item automatically.
- **Legendary:** exactly **3** required items (fixed per crime). User must **own all three** to play; commit uses all three automatically.
- If the user lacks **any** required item → crime is **locked** on the board with: `🔒 Requires: Thieves Gloves` (lists every missing item).
- Items are **not consumed** on commit (required gear check only).
- **Hunt Craft** required items show: `-# Craft via Hunt Craft in inventory` when missing.

---

## 4. Smart Board Selection (Approach 2)

When rolling 5 crimes from the ~58 pool:

1. Load user inventory (owned shop item keys + quantities)
2. Classify each pool crime as **playable** iff user owns **every** item in `crime.requiredItems` (inventory `amount >= 1` for each key)
3. Pick **≥2 playable standard** crimes when possible (weighted random within playable set)
4. Fill remaining slots from **locked teaser** crimes (petty/medium weighted higher)
5. **Legendary slot:** at most **1** Legendary crime per board; **5% board chance** to include one (playable or locked teaser). Never more than 1 Legendary on a board.
6. Shuffle display order

**Edge case:** New player with zero whitelisted prep items → show 5 locked teasers + footer pointing to `,shop` and Hunt Craft in `,inventory`. Cannot commit until they own eligible gear.

---

## 5. Crime Catalog (~58 entries)

**File:** `src/data/crimeCatalog.ts`

```ts
export type CrimeTier = "petty" | "medium" | "high" | "elite" | "legendary";
export type CrimeTag =
  | "GENERAL" | "JOB" | "UNI" | "HUNT" | "COCK"
  | "THEFT" | "FRAUD" | "SMUGGLE" | "FIX" | "SCAM"
  | "HEIST" | "NARCOTICS" | "LAUNDER" | "LUCK";

export interface CrimeDefinition {
  key: string;
  name: string;
  tier: CrimeTier;
  tags: CrimeTag[];
  baseSuccess: number;      // 0–1
  payoutMin: number;
  payoutMax: number;
  fineMin: number;
  fineMax: number;
  heatMultiplier: number;     // applied to TAX_CONFIG.crimeHeatGain
  weight: number;           // board roll weight (legendary lowest)
  prepSlots: 1 | 3;         // must match requiredItems.length
  requiredItems: string[];  // exact prep whitelist keys — ALL mandatory, no alternatives
  winMessages: string[];
  failMessages: string[];
}
```

**`requiredItems` rules**

| Rule | Detail |
|------|--------|
| Length | `1` for standard crimes · `3` for Legendary |
| Keys | Must exist in `crimePrepWhitelist.ts` |
| Uniqueness | All keys in one crime must be distinct |
| Playable | `isCrimePlayable` = user owns **100%** of listed items |
| Commit | Server validates ownership again at confirm; rejects if any missing |

**Example standard crimes**

| Crime key | Name | `requiredItems` |
|-----------|------|-----------------|
| `pickpocket_alley` | Pickpocket Alley | `["thief_gloves"]` |
| `counterfeit_stamps` | Counterfeit Stamps | `["counterfeit_kit"]` |
| `office_expense_fraud` | Office Expense Fraud | `["business_briefcase"]` |
| `exam_swap` | Exam Swap | `["cheat_sheet"]` |
| `poacher_run` | Poacher Run | `["wooden_rifle"]` |
| `fight_fix` | Fight Fix | `["iron_spurs"]` |

**Legendary crimes — fixed triple prep (no slot picking)**

| Key | Name | `requiredItems` (all mandatory) |
|-----|------|-----------------------------------|
| `bank_vault_heist` | Bank Vault Heist | `eclipse_mask`, `corporate_blessing`, `sniper_rifle` |
| `drug_pipeline_deal` | Drug Pipeline Deal | `lab_kit`, `komodo_venom_flask`, `iron_spurs` |
| `armored_truck_hit` | Armored Truck Hit | `mechanic_toolkit`, `wolf_fang_dagger`, `guard_vest` |
| `money_laundering_ring` | Money Laundering Ring | `counterfeit_kit`, `calculator_pro`, `blackmarket_resume` |
| `casino_backroom_skim` | Casino Backroom Skim | `lucky_coin`, `iron_spurs`, `legal_case_file` |
| `port_smuggling_run` | Port Smuggling Run | `iron_rifle`, `camouflage_kit`, `mechanic_toolkit` |
| `hostage_ransom_plot` | Hostage Ransom Plot | `legal_case_file`, `sniper_rifle`, `python_skin_cloak` |
| `black_market_auction_raid` | Black Market Auction Raid | `hunting_permit`, `guard_vest`, `thief_gloves` |

| Shop theme | Count | Example crimes |
|------------|-------|----------------|
| General | ~10 | Pickpocket Alley, Counterfeit Stamps, ATM Skim, Tax Dodge |
| Job | ~10 | Expense Fraud, Resume Forge, Overtime Skim, Gear Resale |
| Uni | ~10 | Exam Swap, Scholarship Forgery, Lab Chemical Theft |
| Hunt | ~10 | Poacher Run, Permit Forgery, Bait Warehouse Heist |
| Cock | ~10 | Fight Fix, Spurs Smuggling, Feed Racket |
| **Legendary (heavy)** | **~8** | Bank Vault Heist, Drug Pipeline Deal, etc. |

**Legendary board rules:** max **1** Legendary per board; ~**5%** chance to include one. Legendary appears as locked teaser unless user owns all 3 required items.

Each crime also has theme `tags` for flavor/filtering only — **tags do not gate prep**; `requiredItems` does.

---

## 6. Economy (High Win / High Lose)

**Cooldown:** `3600` seconds (1 hour), shared across all crimes. Update `GRINDING_COMMANDS.crime.cooldownSeconds`.

| Tier | Base success | Win payout | Fail fine | Heat mult |
|------|-------------|------------|-----------|-----------|
| Petty | 48–52% | 50k – 120k | 25k – 60k | 0.8× |
| Medium | 38–42% | 100k – 220k | 60k – 140k | 1.0× |
| High | 28–32% | 180k – 350k | 120k – 240k | 1.3× |
| Elite | 18–22% | 300k – 550k | 200k – 400k | 1.6× |
| **Legendary** | **12–16%** | **500k – 1.2M** | **350k – 700k** | **2.0×** |

**Required item bonuses:** success/payout bonuses come from the **sum** of each mandated item’s whitelist stats (Legendary = all 3 items stack).

**Success path**

- Payout = `random(payoutMin, payoutMax) × payoutMult × crownMult × devilReduction`
- `payoutMult` = `1 + sum(requiredItems[].payoutBonus)`
- `successChance` = `baseSuccess + sum(requiredItems[].successBonus)` (+ luck, crafted passives)
- Apply income tax path if crime uses taxed income (keep existing `crime_income` source)
- Add heat: `TAX_CONFIG.crimeHeatGain × crime.heatMultiplier`
- Show heat warning at ≥70% of raid threshold (existing behavior)

**Failure path**

- Fine = `random(fineMin, fineMax) × crownLossMult`
- Fox Tail Talisman / `crafted_crime_fine_guard`: 50% fine reduction roll (existing)
- Wallet drain if insufficient funds (existing)
- Soul Ledger tracks loss (existing)

**Jail (new wiring)**

| Tier | On fail | Jail chance | Duration |
|------|---------|-------------|----------|
| Petty / Medium | Fine only | 0% | — |
| High | Fine + roll | 10% | 20 min (1200s) |
| Elite | Fine + roll | 20% | 45 min (2700s) |
| **Legendary** | Fine + roll | **35%** | **60 min (3600s)** |

Use existing `jailUser()` + `commandRouter` jail gate. Fail embed notes jail when triggered. Bail uses existing `,bail` flow.

**EV note:** Base odds keep crime slightly negative EV before items; primary item match + luck should make informed play modestly positive at medium tier without breaking 1hr pacing.

---

## 7. Crime Prep Whitelist (curated required items)

**Principle:** Only whitelisted items may appear in `crime.requiredItems`. Each crime names **exact** keys — players cannot swap in a different item. Global buff items via `,use` (Crown of Greed, etc.) remain separate passive layers.

**File:** `src/data/crimePrepWhitelist.ts`

```ts
export type CrimePrepSource = "shop" | "hunt_craft";

export interface CrimePrepItem {
  key: string;
  name: string;
  category: "GENERAL" | "JOB" | "UNI" | "HUNT" | "COCK" | "CRAFT";
  source: CrimePrepSource;
  craftRecipeKey?: string;
  successBonus: number;
  payoutBonus: number;
  failFineGuard?: number;   // e.g. Fox Tail Talisman
}
```

**Eligibility:** Crime is playable only if user owns **every** key in `crime.requiredItems`. No partial prep. No optional picks.

**Bonus stacking:** At commit, add `successBonus` / `payoutBonus` from **each** required item in the crime definition.

---

### 7.1 Shop whitelist (v1)

| Category | Item key | Success | Payout |
|----------|----------|-----------|---------|--------|
| **General** | `thief_gloves` | +12% | +8% |
| **General** | `counterfeit_kit` | +10% | +10% |
| **General** | `lucky_coin` | +8% | +5% |
| **General** | `eclipse_mask` | +14% | +12% |
| **Job** | `blackmarket_resume` | +12% | +6% |
| **Job** | `business_briefcase` | +10% | +8% |
| **Job** | `legal_case_file` | +9% | +7% |
| **Job** | `mechanic_toolkit` | +8% | +6% |
| **Job** | `corporate_blessing` | +15% | +10% |
| **Uni** | `cheat_sheet` | +13% | +5% |
| **Uni** | `lab_kit` | +11% | +8% |
| **Uni** | `calculator_pro` | +9% | +6% |
| **Hunt** | `wooden_rifle` | +8% | +5% |
| **Hunt** | `iron_rifle` | +10% | +7% |
| **Hunt** | `sniper_rifle` | +14% | +9% |
| **Hunt** | `camouflage_kit` | +12% | +6% |
| **Hunt** | `hunting_permit` | +9% | +5% |
| **Cock** | `iron_spurs` | +10% | +8% |
| **Cock** | `guard_vest` | +8% | +6% |

**Explicitly excluded from prep:** Bandage, Padlock, Energy Drink, Mystery Box, study/cock feed items, cosmetics, job repair/warranty items, and other non-crime gear.

---

### 7.2 Hunt Craft whitelist (v1)

| Recipe key | Name | Success | Payout | Notes |
|------------|------|---------|--------|-------|
| `python_skin_cloak` | Python Skin Cloak | +12% | +7% | Hunt Craft |
| `fox_tail_talisman` | Fox Tail Talisman | +5% | +0% | `failFineGuard: 0.20` |
| `wolf_fang_dagger` | Wolf Fang Dagger | +10% | +10% | Hunt Craft |
| `rabbit_foot_charm` | Rabbit Foot Charm | +6% | +4% | Hunt Craft |
| `arctic_wolf_spirit_charm` | Arctic Wolf Spirit Charm | +12% | +8% | Hunt Craft |
| `komodo_venom_flask` | Komodo Venom Flask | +11% | +9% | Hunt Craft |

**Not crime prep (stay Hunt Craft only):** Duck Feather Quill, Eagle Talon Gloves, Black Bear War Vest, Crocodile Hide Armor (rob defense), cosmetic crowns/mantles, zoo boosts, hunt-only boosts.

**Craft + loadout integration**

- Missing required craft item → `-# Craft {Item Name} via Hunt Craft in inventory`
- Craft effects apply on crime resolve when that craft key is in `requiredItems`

---

### 7.3 UI copy for craft hints

**Locked crime (board):**
`🔒 Requires: Thieves Gloves`  
`🔒 Requires: Eclipse Mask, Corporate Blessing, Sniper Rifle`

**Missing Hunt Craft item:**
`-# Craft Python Skin Cloak via Hunt Craft in inventory`

**Help one-liner:**
`Each crime needs specific gear — buy from shop or craft via Hunt Craft.`

---

### 7.4 Passive layers (NOT loadout — unchanged)

These still apply via `,use` / existing redis checks during `executeCrime`:

- Crown of Greed, Devil Contract, Celestial Harp (luck), Soul Ledger
- Active craft redis keys if recipe **not** selected as loadout item (legacy path during migration)

**Cosmetics:** never crime prep.

---

## 8. UI / UX

**Pattern:** Components V2 (`ContainerBuilder`) consistent with bank/shop.

### 8.1 Crime Board

```
## 🎭 Crime Board
Pick a job you have the required gear for.

[ StringSelectMenu: 5 crimes — disabled if missing required items ]

Petty · Pickpocket Alley · ✅ Ready
Medium · Office Expense Fraud · 🔒 Requires: Business Briefcase
Legendary · Bank Vault Heist · 🔒 Requires: Eclipse Mask, Corporate Blessing, Sniper Rifle
...
-# Missing craft items? Hunt Craft in inventory.

-# Cooldown starts when you commit. Next board refresh in 8m.
```

### 8.2 Prep Confirmation (Standard — 1 required item)

```
## Prep — Office Expense Fraud
Required gear (must own):

✅ Business Briefcase · +10% success · +8% payout

Preview: 40% → 50% success · 100k–220k → 108k–238k payout

[ Commit Crime ] [ Back ]
```

No item picker — the required item is fixed. If ✅ missing, user never reaches this screen (crime locked on board).

### 8.2b Prep Confirmation (Legendary — 3 required items)

```
## Legendary Prep — Bank Vault Heist
Required gear (must own all):

✅ Eclipse Mask · +14% success
✅ Corporate Blessing · +15% success
✅ Sniper Rifle · +14% success

Preview: 14% → 43% success · 500k–1.2M payout band

[ Commit Crime ] [ Back ]
```

Confirm disabled if any required item missing (re-validated server-side).

### 8.3 Result

Existing success/error embed style + fields: Wallet, Heat (on win), Jail (on fail if jailed).

### 8.4 Cooldown State

If on cooldown, skip board roll; show:

```
## Crime Cooldown
Next job available <relative time>.
Last crime: {name} — {success/fail summary}
```

### Interaction routing

- Handler: `src/handlers/crimeInteractionHandler.ts`
- Custom IDs:
  - `crime:pick:{sessionId}:{crimeKey}`
  - `crime:confirm:{sessionId}:{crimeKey}`
  - `crime:back:{sessionId}`
- Register in `src/index.ts` for `crime:*` prefix
- Author validation: only session owner can interact

---

## 9. Technical Architecture

```
src/data/crimeCatalog.ts          ~58 crime definitions (incl. 8 Legendary)
src/data/crimePrepWhitelist.ts    curated shop + hunt craft prep items
src/services/crimeService.ts      board roll, session, resolve, bonuses
src/handlers/crimeInteractionHandler.ts
src/commands/economy/crime.ts     entry point (thin)
```

### `crimeService.ts` responsibilities

| Function | Purpose |
|----------|---------|
| `createCrimeSession(userId)` | Smart-roll 5 crimes, store Redis |
| `getCrimeSession(userId)` | Read session |
| `getRequiredItems(crimeKey)` | Returns fixed `requiredItems` with whitelist metadata |
| `getMissingRequiredItems(userId, crimeKey)` | Keys user does not own — for lock messages |
| `computeCrimeOdds(userId, crime)` | Base + sum(required item bonuses) + luck |
| `executeCrime(userId, username, crimeKey)` | Validates all required items owned, then roll |
| `isCrimePlayable(userId, crimeKey)` | Owns **all** items in `crime.requiredItems` |

### Config changes

`src/utils/economyConfig.ts`:

```ts
crime: {
  commandName: "crime",
  cooldownSeconds: 3600,
  // remove legacy winRate/payoutMin/Max — live in catalog tiers
}
```

Keep backward-compatible exports if other code references them; migrate to catalog.

### Redis keys

| Key | TTL | Payload |
|-----|-----|---------|
| `crime_session:{userId}` | 600s | `{ sessionId, crimeKeys[], legendaryKey?, createdAt }` |
| Existing crafted/luck keys | unchanged | |

### Logging

- `logToChannel` on legendary/elite success, jail triggers, payouts ≥500k

---

## 10. Error Handling

| Case | Behavior |
|------|----------|
| Session expired mid-flow | "Board expired — run `,crime` again." |
| Item sold between loadout and confirm | Re-validate ownership; fail gracefully |
| User jailed mid-flow | Block commit at confirm |
| Duplicate confirm spam | Idempotent via session delete on commit |
| Interaction not owner | Ephemeral "Not your board." |

---

## 11. Testing Plan

- [ ] New player, no items → 5 locked crimes, no commit possible
- [ ] Crime locked when missing **any** required item — no partial commit
- [ ] No item select menus — required items are fixed per crime
- [ ] Owning Thieves Gloves does **not** unlock Counterfeit Stamps crime (different required item)
- [ ] Legendary requires all 3 listed items; bank heist blocked without all three
- [ ] Lock message lists exact missing item names (+ Hunt Craft hint for crafts)
- [ ] Cooldown starts on commit only; 1hr block
- [ ] Session reuse within 10min; refresh after TTL
- [ ] High/Elite/Legendary fail jail rolls at ~10%/20%/35% (statistical spot check)
- [ ] Legendary board: max 1 per board; ~5% appearance rate
- [ ] Heat scales by tier multiplier
- [ ] Required Hunt Craft item (e.g. Python Skin Cloak) blocks crime until crafted and owned
- [ ] Fox Tail Talisman fine guard still works
- [ ] Jailed user cannot open commit flow
- [ ] `npx tsc --noEmit` clean

---

## 12. Migration / Rollout

- No DB migration required (Redis sessions + static catalogs)
- **Hunt Craft tweak:** crime-eligible recipes grant an **inventory charge** on craft so ownership can be validated like shop items. Effects (fine guard, etc.) fire on crime resolve when that key is in `requiredItems`.
- Update help text for `,crime` in `help.ts`
- Tutorial step: mention crime board, whitelisted prep gear, and Hunt Craft path

---

## 13. Open Questions (resolved)

| Question | Decision |
|----------|----------|
| Interaction depth | Crime Board (A) |
| Item model | **Fixed required items per crime** — must own all; no pick-one loadout |
| Prep items | Curated whitelist; each crime names exact keys (shop + Hunt Craft) |
| Hunt Craft | Required on specific crimes; UI says craft via `inventory → Hunt Craft` |
| Required item | **Mandatory gate** — not optional bonus choice |
| Cooldown | 1hr shared, starts on commit |
| Catalog size | ~58 pool, 5 random; max 1 Legendary per board |
| Board algorithm | Smart: ≥2 playable + teasers |
| Economy | High win / high lose tiers |
| Cosmetics in loadout | No (v1) |

---

## 14. Approval

Design approved by user through iterative brainstorming (2026-06-21). Updated: Legendary tier, **fixed mandatory requiredItems** (no optional loadout picks), curated whitelist + Hunt Craft.

**Next step:** Invoke `writing-plans` skill to produce implementation plan.
