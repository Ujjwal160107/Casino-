# Hunt Crafting & Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the hunt system to 100% — add recipe unlock progression, persist craft effects to DB, add blueprint items, add a Craft button to hunt results, and surface the craft tutorial.

**Architecture:** Add `UserCraftUnlock` to the Prisma schema as the unlock source of truth. Unlock logic lives in `huntCraftService.ts`. Blueprint item effects live in `shopItemEffects.ts`. Effect persistence is a write-through layer added to `applyCraftEffect` in `huntCraftService.ts`, falling back to DB on Redis miss in `huntService.ts` and `claimZooIncome`.

**Tech Stack:** TypeScript, discord.js v14, Prisma (MongoDB), Redis (`redisService`), existing `ActiveEffect` model.

---

## File Map

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `UserCraftUnlock` model |
| `src/services/huntCraftService.ts` | Add unlock functions, fix `applyCraftEffect` to persist to DB, update `buildHuntCraftPayload` for unlock states + tutorial |
| `src/services/huntService.ts` | Call `unlockCommonRecipesForAnimal` after catch; add DB fallback for `crafted_zoo_boost` read in `claimZooIncome` and `getZooStatus`; add DB fallback for `crafted_hunt_boost` read |
| `src/utils/shopCatalog.ts` | Add `rare_blueprint` and `legendary_blueprint` to `HUNT_SHOP_CATALOG` |
| `src/services/shopItemEffects.ts` | Add `case "rare_blueprint"` and `case "legendary_blueprint"` handlers |
| `src/commands/games/hunt.ts` | Add "Craft" button to `buildGlobalRow` |

---

## Task 1: Add `UserCraftUnlock` to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Open `prisma/schema.prisma`. After the `HuntPartListing` model (ends around line 676), add:

```prisma
model UserCraftUnlock {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String
  recipeKey   String
  unlockedAt  DateTime @default(now())

  @@unique([userId, recipeKey])
  @@index([userId])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

```bash
cd "c:/Users/ujjwa/OneDrive/Desktop/Casino-"
npx prisma generate
```

Expected output: `Generated Prisma Client` with no errors.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add UserCraftUnlock model for recipe progression"
```

---

## Task 2: Add unlock functions to `huntCraftService.ts`

**Files:**
- Modify: `src/services/huntCraftService.ts`

- [ ] **Step 1: Add `getUnlockedRecipeKeys` helper**

After the `HUNT_CRAFT_RECIPES` array (after line 196), add:

```ts
export async function getUnlockedRecipeKeys(userId: string): Promise<Set<string>> {
  const rows = await prisma.userCraftUnlock.findMany({ where: { userId } });
  return new Set(rows.map((r) => r.recipeKey));
}
```

- [ ] **Step 2: Add `unlockCommonRecipesForAnimal`**

After `getUnlockedRecipeKeys`, add:

```ts
export async function unlockCommonRecipesForAnimal(
  userId: string,
  animalKey: string,
): Promise<string[]> {
  const animal = ANIMAL_CATALOG.find((a) => a.key === animalKey);
  if (!animal) return [];

  const animalPartKeys = new Set(animal.parts.map((p) => `${animalKey}_${p}`));

  const eligible = HUNT_CRAFT_RECIPES.filter(
    (r) =>
      (r.tier === "Common" || r.tier === "Uncommon") &&
      Object.keys(r.parts).some((pk) => animalPartKeys.has(pk)),
  );

  if (eligible.length === 0) return [];

  const alreadyUnlocked = await getUnlockedRecipeKeys(userId);
  const toUnlock = eligible.filter((r) => !alreadyUnlocked.has(r.key));
  if (toUnlock.length === 0) return [];

  await prisma.$transaction(
    toUnlock.map((r) =>
      prisma.userCraftUnlock.upsert({
        where: { userId_recipeKey: { userId, recipeKey: r.key } },
        create: { userId, recipeKey: r.key },
        update: {},
      }),
    ),
  );

  return toUnlock.map((r) => r.name);
}
```

You need to add `ANIMAL_CATALOG` to the import at the top of the file. Change:

```ts
import { formatPartName, getHuntPartMap } from "./huntPartService";
```

to:

```ts
import { ANIMAL_CATALOG } from "../utils/animalCatalog";
import { formatPartName, getHuntPartMap } from "./huntPartService";
```

- [ ] **Step 3: Commit**

```bash
git add src/services/huntCraftService.ts
git commit -m "feat: add recipe unlock helpers to huntCraftService"
```

---

## Task 3: Call `unlockCommonRecipesForAnimal` in `huntService.ts`

**Files:**
- Modify: `src/services/huntService.ts`

- [ ] **Step 1: Import the unlock function**

At the top of `src/services/huntService.ts`, after the existing imports, add:

```ts
import { unlockCommonRecipesForAnimal } from "./huntCraftService";
```

- [ ] **Step 2: Call it after animals are created**

In the `hunt()` function, after the loop that creates DB records for caught animals (after the `entry.ids = created.map(...)` line, around line 133), add the unlock call. The full block after `grouped` is populated should end like this:

```ts
  // Create DB records for all caught animals
  for (const [animalKey, entry] of grouped) {
    const created = await Promise.all(
      Array.from({ length: entry.count }).map(() =>
        prisma.caughtAnimal.create({
          data: {
            discordId,
            animalKey,
            partsAvailable: [...entry.def.parts],
            inZoo: false,
          },
        })
      )
    );
    entry.ids = created.map((c) => c.id);
  }

  // Unlock Common/Uncommon recipes for each species caught
  const allNewlyUnlocked: string[] = [];
  for (const [animalKey] of grouped) {
    const names = await unlockCommonRecipesForAnimal(discordId, animalKey);
    allNewlyUnlocked.push(...names);
  }

  if (!isTester(discordId)) {
    await redis.set(huntKey, "1", "EX", tier.cooldownSeconds);
  }
```

- [ ] **Step 3: Return `newlyUnlockedRecipes` from `hunt()`**

Change the return type signature from:

```ts
): Promise<{ groups: HuntGroup[]; rifleName: string }>
```

to:

```ts
): Promise<{ groups: HuntGroup[]; rifleName: string; newlyUnlockedRecipes: string[] }>
```

Change the return statement at the bottom of `hunt()` from:

```ts
  return { groups, rifleName };
```

to:

```ts
  return { groups, rifleName, newlyUnlockedRecipes: allNewlyUnlocked };
```

- [ ] **Step 4: Surface discoveries in `hunt.ts` result container**

In `src/commands/games/hunt.ts`, the `handleHunt` function destructures the result. Change:

```ts
  const { groups, rifleName } = result;
```

to:

```ts
  const { groups, rifleName, newlyUnlockedRecipes } = result;
```

Then, just before `container.addActionRowComponents(buildGlobalRow(ownerId));` at the bottom of the container build loop (around line 143), add:

```ts
  if (newlyUnlockedRecipes.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        newlyUnlockedRecipes.map((name) => `-# New recipe discovered: **${name}**!`).join("\n")
      )
    );
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/services/huntService.ts src/commands/games/hunt.ts
git commit -m "feat: unlock Common/Uncommon recipes on first animal catch"
```

---

## Task 4: Persist craft effects to `ActiveEffect` (fix Redis-only bug)

**Files:**
- Modify: `src/services/huntCraftService.ts`

- [ ] **Step 1: Replace `applyCraftEffect` with DB-persisted version**

In `src/services/huntCraftService.ts`, replace the entire `applyCraftEffect` function (lines 275–319) with:

```ts
async function upsertActiveEffect(userId: string, effectType: string, value: number, durationMs: number) {
  const expiresAt = new Date(Date.now() + durationMs);
  await prisma.activeEffect.upsert({
    where: { id: (await prisma.activeEffect.findFirst({ where: { userId, effectType } }))?.id ?? "new" },
    create: { userId, effectType, value, expiresAt },
    update: { value, expiresAt },
  });
  const ttlSeconds = Math.floor(durationMs / 1000);
  await redisService.set(`craft_effect:${userId}:${effectType}`, { value, expiresAt: expiresAt.toISOString() }, ttlSeconds);
}

async function applyCraftEffect(userId: string, guildId: string, recipe: HuntCraftRecipe) {
  const effect = recipe.effect;

  switch (effect.type) {
    case "luck":
      await upsertLuckModifier(userId, effect.value, effect.source, effect.durationMs);
      await upsertActiveEffect(userId, "luck", effect.value, effect.durationMs);
      return `${recipe.name} activated: Luck +${effect.value}.`;
    case "study_xp":
      await upsertActiveEffect(userId, "study_xp", effect.bonusXp, 2 * 24 * 3600 * 1000);
      await redisService.set(`crafted_study_xp:${userId}`, { bonusXp: effect.bonusXp }, 2 * 24 * 3600);
      return `${recipe.name} prepared: next successful study gets +${effect.bonusXp} XP.`;
    case "crime_fine_guard":
      await upsertActiveEffect(userId, "crime_fine_guard", effect.chance, 3 * 24 * 3600 * 1000);
      await redisService.set(`crafted_crime_fine_guard:${userId}`, { chance: effect.chance }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next crime failure may soften the fine.`;
    case "rob_boost":
      await upsertActiveEffect(userId, "rob_boost", effect.multiplier, 3 * 24 * 3600 * 1000);
      await redisService.set(`crafted_rob_boost:${userId}`, { multiplier: effect.multiplier }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next successful rob gets +10% loot.`;
    case "hunt_rare_boost":
      await upsertActiveEffect(userId, "hunt_rare_boost", effect.rareBonus, 3 * 24 * 3600 * 1000);
      await redisService.set(`crafted_hunt_boost:${userId}`, { rareBonus: effect.rareBonus }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next hunt has better Rare odds.`;
    case "cock_defense":
      await upsertActiveEffect(userId, "cock_defense", effect.reduction, 3 * 24 * 3600 * 1000);
      await redisService.set(`crafted_cock_defense:${userId}`, { reduction: effect.reduction }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next cockfight has reduced incoming damage.`;
    case "rob_defense":
      await upsertActiveEffect(userId, "rob_defense", 1, effect.durationMs);
      await redisService.set(`crafted_rob_defense:${userId}`, { active: true }, Math.floor(effect.durationMs / 1000));
      return `${recipe.name} active: blocks one robbery attempt for 24 hours.`;
    case "crime_boost":
      await upsertActiveEffect(userId, "crime_boost", effect.successBonus, 3 * 24 * 3600 * 1000);
      await redisService.set(`crafted_crime_boost:${userId}`, { successBonus: effect.successBonus }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next crime attempt gets +7% success.`;
    case "cosmetic":
      await grantCraftedInventoryItem(userId, guildId, recipe, false);
      return `${recipe.name} added to your cosmetics collection (+${effect.luck} cosmetic luck).`;
    case "venom_item":
      await grantCraftedInventoryItem(userId, guildId, recipe, true);
      return `${recipe.name} added to inventory. Use it on a target later.`;
    case "hunt_legendary_boost":
      await upsertActiveEffect(userId, "hunt_legendary_boost", effect.legendaryBonus, 3 * 24 * 3600 * 1000);
      await redisService.set(`crafted_hunt_boost:${userId}`, { legendaryBonus: effect.legendaryBonus }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next hunt has better Legendary odds.`;
    case "zoo_boost":
      await upsertActiveEffect(userId, "zoo_boost", effect.multiplier, effect.durationMs);
      await redisService.set(`crafted_zoo_boost:${userId}`, { multiplier: effect.multiplier }, Math.floor(effect.durationMs / 1000));
      return `${recipe.name} active: zoo income +10% for 7 days.`;
    default:
      return `${recipe.name} crafted.`;
  }
}
```

Note: `upsertActiveEffect` uses a findFirst + upsert pattern because `ActiveEffect` has no unique constraint on `[userId, effectType]`. This is safe — it overwrites the latest matching effect.

- [ ] **Step 2: Add DB fallback helper**

At the top of `huntCraftService.ts`, export a new helper that other services (huntService, etc.) can call to read an effect with DB fallback:

```ts
export async function getCraftEffect<T extends object>(
  userId: string,
  redisKey: string,
  effectType: string,
  builder: (value: number) => T,
): Promise<T | null> {
  const cached = await redisService.get<T>(redisKey);
  if (cached) return cached;

  const row = await prisma.activeEffect.findFirst({
    where: { userId, effectType, expiresAt: { gt: new Date() } },
  });
  if (!row) return null;

  const result = builder(row.value);
  const ttlMs = row.expiresAt ? row.expiresAt.getTime() - Date.now() : 0;
  if (ttlMs > 0) await redisService.set(redisKey, result, Math.floor(ttlMs / 1000));
  return result;
}
```

- [ ] **Step 3: Add DB fallback to zoo boost read in `huntService.ts`**

In `src/services/huntService.ts`, add to the top imports:

```ts
import { getCraftEffect } from "./huntCraftService";
```

In `claimZooIncome()`, replace:

```ts
  const zooBoost = await redisService.get<{ multiplier: number }>(`crafted_zoo_boost:${discordId}`);
  const totalIncome = Math.floor(ratePerHour * cappedHours * (zooBoost?.multiplier ?? 1));
```

with:

```ts
  const zooBoost = await getCraftEffect(discordId, `crafted_zoo_boost:${discordId}`, "zoo_boost", (v) => ({ multiplier: v }));
  const totalIncome = Math.floor(ratePerHour * cappedHours * (zooBoost?.multiplier ?? 1));
```

In `getZooStatus()`, replace:

```ts
  const zooBoost = await redisService.get<{ multiplier: number }>(`crafted_zoo_boost:${discordId}`);
  const ratePerHour = Math.floor(slots.reduce((sum, s) => sum + s.incomePerHour, 0) * (zooBoost?.multiplier ?? 1));
```

with:

```ts
  const zooBoost = await getCraftEffect(discordId, `crafted_zoo_boost:${discordId}`, "zoo_boost", (v) => ({ multiplier: v }));
  const ratePerHour = Math.floor(slots.reduce((sum, s) => sum + s.incomePerHour, 0) * (zooBoost?.multiplier ?? 1));
```

In `hunt()`, replace:

```ts
  const craftedBoost = await redisService.get<{ rareBonus?: number; legendaryBonus?: number }>(`crafted_hunt_boost:${discordId}`);
```

with:

```ts
  const rareBoostRow = await getCraftEffect(discordId, `crafted_hunt_boost:${discordId}`, "hunt_rare_boost", (v) => ({ rareBonus: v }));
  const legendaryBoostRow = await getCraftEffect(discordId, `crafted_hunt_boost:${discordId}`, "hunt_legendary_boost", (v) => ({ legendaryBonus: v }));
  const craftedBoost = rareBoostRow ?? legendaryBoostRow ?? null;
```

- [ ] **Step 4: Commit**

```bash
git add src/services/huntCraftService.ts src/services/huntService.ts
git commit -m "fix: persist craft effects to ActiveEffect DB, add Redis fallback"
```

---

## Task 5: Add blueprint items to `HUNT_SHOP_CATALOG`

**Files:**
- Modify: `src/utils/shopCatalog.ts`

- [ ] **Step 1: Add blueprint entries**

In `src/utils/shopCatalog.ts`, find the end of `HUNT_SHOP_CATALOG` (after `legendary_rifle`, before the closing `];`). Add:

```ts
  {
    key: "rare_blueprint",
    name: "Rare Blueprint",
    price: 500_000,
    description: "A worn schematic recovered from a master craftsman's workshop. Using it teaches you one Rare craft recipe you haven't learned yet — chosen at random.",
    shortDescription: "Unlocks a random Rare recipe.",
    category: "HUNT",
    asset: "rare blueprint",
    consumable: true,
    usable: true,
    itemType: "CONSUMABLE",
    maxStack: 5,
    effects: [],
  },
  {
    key: "legendary_blueprint",
    name: "Legendary Blueprint",
    price: 2_000_000,
    description: "An ancient blueprint etched onto hide, recovered from the rarest hunts. Using it reveals one Legendary craft recipe you don't already know.",
    shortDescription: "Unlocks a random Legendary recipe.",
    category: "HUNT",
    asset: "legendary blueprint",
    consumable: true,
    usable: true,
    itemType: "CONSUMABLE",
    maxStack: 3,
    effects: [],
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/shopCatalog.ts
git commit -m "feat: add rare_blueprint and legendary_blueprint to hunt shop"
```

---

## Task 6: Add blueprint effect handlers to `shopItemEffects.ts`

**Files:**
- Modify: `src/services/shopItemEffects.ts`

- [ ] **Step 1: Import required functions**

At the top of `src/services/shopItemEffects.ts`, add to existing imports:

```ts
import { HUNT_CRAFT_RECIPES, getUnlockedRecipeKeys } from "./huntCraftService";
```

- [ ] **Step 2: Add handler functions**

At the bottom of `src/services/shopItemEffects.ts`, before the final closing brace or export, add:

```ts
async function handleRareBlueprint(discordId: string): Promise<ShopItemUseResult> {
  return handleBlueprintUnlock(discordId, "Rare");
}

async function handleLegendaryBlueprint(discordId: string): Promise<ShopItemUseResult> {
  return handleBlueprintUnlock(discordId, "Legendary");
}

async function handleBlueprintUnlock(
  discordId: string,
  tier: "Rare" | "Legendary",
): Promise<ShopItemUseResult> {
  const unlocked = await getUnlockedRecipeKeys(discordId);
  const available = HUNT_CRAFT_RECIPES.filter(
    (r) => r.tier === tier && !unlocked.has(r.key),
  );

  if (available.length === 0) {
    return {
      success: false,
      message: `You've already unlocked all ${tier} recipes! The blueprint has been refunded.`,
      shouldConsume: false,
    };
  }

  const recipe = available[Math.floor(Math.random() * available.length)];
  await prisma.userCraftUnlock.upsert({
    where: { userId_recipeKey: { userId: discordId, recipeKey: recipe.key } },
    create: { userId: discordId, recipeKey: recipe.key },
    update: {},
  });

  return {
    success: true,
    message: `${Mascot.Emotes.Accept} Unlocked: **${recipe.name}** — view it with \`!hunt craft\``,
    shouldConsume: true,
  };
}
```

- [ ] **Step 3: Wire the cases into `handleSpecialItemUse`**

In the `switch (itemKey)` block of `handleSpecialItemUse`, add before the final `default: return null;` (or at the end of the hunt shop items section):

```ts
    case "rare_blueprint":
      return handleRareBlueprint(discordId);
    case "legendary_blueprint":
      return handleLegendaryBlueprint(discordId);
```

- [ ] **Step 4: Commit**

```bash
git add src/services/shopItemEffects.ts
git commit -m "feat: add blueprint item handlers to unlock rare/legendary craft recipes"
```

---

## Task 7: Update `buildHuntCraftPayload` to show locked/unlocked states and tutorial

**Files:**
- Modify: `src/services/huntCraftService.ts`

- [ ] **Step 1: Update `getSortedCraftRecipes` to accept unlock set**

Replace the existing `getSortedCraftRecipes` function (lines 221–236) with:

```ts
export async function getSortedCraftRecipes(userId: string, unlockedKeys: Set<string>) {
  const [parts, wallet] = await Promise.all([
    getHuntPartMap(userId),
    prisma.wallet.findUnique({ where: { userId } }),
  ]);
  const coins = wallet?.balance ?? 0;

  return HUNT_CRAFT_RECIPES
    .map((recipe) => ({ recipe, score: getRecipeScore(recipe, parts, coins), parts, coins }))
    .sort((a, b) => {
      const aUnlocked = unlockedKeys.has(a.recipe.key);
      const bUnlocked = unlockedKeys.has(b.recipe.key);
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
      if (a.score.craftable !== b.score.craftable) return a.score.craftable ? -1 : 1;
      if (a.score.missingKinds !== b.score.missingKinds) return a.score.missingKinds - b.score.missingKinds;
      if (a.score.missingTotal !== b.score.missingTotal) return a.score.missingTotal - b.score.missingTotal;
      return a.recipe.coinCost - b.recipe.coinCost;
    });
}
```

- [ ] **Step 2: Add animal hint helper**

After `getRecipeScore`, add:

```ts
function getAnimalHintForRecipe(recipe: HuntCraftRecipe): string {
  const firstPartKey = Object.keys(recipe.parts)[0];
  if (!firstPartKey) return "Hunt animals";
  const animal = ANIMAL_CATALOG.find((a) => firstPartKey.startsWith(`${a.key}_`));
  return animal ? `Catch a ${animal.name}` : "Hunt animals";
}
```

- [ ] **Step 3: Replace `buildHuntCraftPayload` with unlock-aware version**

Replace the entire `buildHuntCraftPayload` function with:

```ts
export async function buildHuntCraftPayload(userId: string, ownerId: string, page = 1, disabled = false) {
  const unlockedKeys = await getUnlockedRecipeKeys(userId);
  const rows = await getSortedCraftRecipes(userId, unlockedKeys);
  const totalPages = Math.max(1, Math.ceil(rows.length / CRAFTS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = rows.slice((safePage - 1) * CRAFTS_PER_PAGE, safePage * CRAFTS_PER_PAGE);

  const container = new ContainerBuilder()
    .setAccentColor(CRAFT_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Hunt Crafting\n-# Recipes sorted by availability. Page ${safePage}/${totalPages}`),
    )
    .addSeparatorComponents(separator(true));

  // Tutorial: show if user has zero unlocked recipes
  const tutorialKey = `craft_tutorial_seen:${userId}`;
  const tutorialSeen = await redisService.get<boolean>(tutorialKey);
  if (!tutorialSeen && unlockedKeys.size === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# Hunt animals to discover Common and Uncommon recipes on first catch.\n" +
        "-# Buy Rare and Legendary Blueprints from the hunt shop to unlock higher-tier recipes.\n" +
        "-# Each recipe shows the parts and amounts needed — store parts with `Store Parts` during a hunt.",
      ),
    );
    container.addSeparatorComponents(separator(true));
    await redisService.set(tutorialKey, true, 365 * 24 * 3600); // 1 year — effectively permanent
  }

  for (const row of pageRows) {
    const { recipe, score, parts, coins } = row;
    const isUnlocked = unlockedKeys.has(recipe.key);
    const coinOk = coins >= recipe.coinCost;

    if (!isUnlocked) {
      const isCommonOrUncommon = recipe.tier === "Common" || recipe.tier === "Uncommon";
      const hint = isCommonOrUncommon
        ? getAnimalHintForRecipe(recipe)
        : recipe.tier === "Rare"
        ? "Buy a Rare Blueprint"
        : "Buy a Legendary Blueprint";

      const displayName = isCommonOrUncommon ? "???" : recipe.name;
      const lockLine = isCommonOrUncommon
        ? `-# ${hint} to discover this recipe`
        : `-# ${hint} to unlock this recipe`;

      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${displayName}\n-# ${recipe.tier} recipe`),
            new TextDisplayBuilder().setContent(lockLine),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`hunt_craft_make:${recipe.key}:${ownerId}`)
              .setLabel("Locked")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          ),
      );
    } else {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${recipe.name}\n-# ${recipe.tier} recipe | ${fmtCurrency(recipe.coinCost)}`),
            new TextDisplayBuilder().setContent(
              `${recipe.description}\n` +
              `${coinOk ? Mascot.Emotes.Accept : Mascot.Emotes.Decline} Coins ${fmtCurrency(Math.min(coins, recipe.coinCost))}/${fmtCurrency(recipe.coinCost)}\n` +
              recipeRequirementLines(recipe, parts),
            ),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`hunt_craft_make:${recipe.key}:${ownerId}`)
              .setLabel(score.craftable ? "Craft" : "Missing")
              .setStyle(score.craftable ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(disabled || !score.craftable),
          ),
      );
    }
    container.addSeparatorComponents(separator(false));
  }

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hunt_craft_page:${safePage - 1}:${ownerId}`)
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage <= 1),
    new ButtonBuilder()
      .setCustomId(`hunt_craft_page:${safePage + 1}:${ownerId}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || safePage >= totalPages),
  );

  return {
    components: [container, nav],
    flags: MessageFlags.IsComponentsV2,
  } as any;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/huntCraftService.ts
git commit -m "feat: unlock-aware craft UI with locked recipe display and tutorial"
```

---

## Task 8: Add "Craft" button to hunt result global row

**Files:**
- Modify: `src/commands/games/hunt.ts`

- [ ] **Step 1: Add Craft button to `buildGlobalRow`**

Replace the existing `buildGlobalRow` function:

```ts
function buildGlobalRow(ownerId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hunt_sell_all:${ownerId}`)
      .setLabel("Sell All")
      .setStyle(ButtonStyle.Danger),
  );
}
```

with:

```ts
function buildGlobalRow(ownerId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hunt_sell_all:${ownerId}`)
      .setLabel("Sell All")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`inv2_hunt_craft:${ownerId}`)
      .setLabel("Craft")
      .setStyle(ButtonStyle.Secondary),
  );
}
```

The `inv2_hunt_craft:` button ID is already handled in `src/commands/economy/inventory.ts` (line 589) and will open the craft dashboard ephemerally.

- [ ] **Step 2: Commit**

```bash
git add src/commands/games/hunt.ts
git commit -m "feat: add Craft button to hunt result global action row"
```

---

## Task 9: Verify all routes work end-to-end

- [ ] **Step 1: Verify `hunt_part_modal:` is already handled**

Confirm `src/handlers/huntInteractionHandler.ts` line 240 handles `hunt_part_modal:` as a modal submit. The handler already calls `interaction.isModalSubmit()` on this prefix — this route is complete. No changes needed.

- [ ] **Step 2: Verify `inv2_part_select:` flow**

Confirm `src/commands/economy/inventory.ts` line 619 handles `inv2_part_select:` using `awaitModalSubmit` inline — this is already complete. No changes needed.

- [ ] **Step 3: Verify `hunt_` routing in `index.ts` covers modal submits**

In `src/index.ts` around line 186, the routing block is:

```ts
if (id.startsWith("hunt_") || id.startsWith("zoo_")) {
  const { handleHuntInteraction } = require("./handlers/huntInteractionHandler");
  return await handleHuntInteraction(interaction);
}
```

The `handleHuntInteraction` function already accepts `isModalSubmit` interactions (line 54 of the handler: `if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;`). The `hunt_part_modal:` prefix starts with `hunt_` so it will be routed correctly.

No code changes needed for routing. Document this as confirmed.

- [ ] **Step 4: Run TypeScript compile check**

```bash
cd "c:/Users/ujjwa/OneDrive/Desktop/Casino-"
npx tsc --noEmit
```

Expected: 0 errors. If any type errors appear, fix them before committing.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: hunt crafting & marketplace 100% — unlock system, effect persistence, blueprints, craft button"
```
