import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";
import prisma from "../utils/prisma";
import { GLOBAL_CATALOG_GUILD_ID } from "../utils/globalCatalog";
import { Mascot } from "../config/branding";
import { fmtCurrency } from "../utils/format";
import { redisService } from "./redisService";
import { upsertLuckModifier } from "./shopBuffs";
import { ANIMAL_CATALOG } from "../utils/animalCatalog";
import { formatPartName, getHuntPartMap } from "./huntPartService";
import { CRIME_PREP_CRAFT_KEYS } from "../data/crimePrepWhitelist";

const CRAFTS_PER_PAGE = 4;

export type HuntCraftEffect =
  | { type: "luck"; value: number; durationMs: number; source: string }
  | { type: "study_xp"; bonusXp: number }
  | { type: "crime_fine_guard"; chance: number }
  | { type: "rob_boost"; multiplier: number }
  | { type: "hunt_rare_boost"; rareBonus: number }
  | { type: "cock_defense"; reduction: number }
  | { type: "rob_defense"; durationMs: number }
  | { type: "crime_boost"; successBonus: number }
  | { type: "cosmetic"; luck: number }
  | { type: "venom_item" }
  | { type: "hunt_legendary_boost"; legendaryBonus: number }
  | { type: "zoo_boost"; multiplier: number; durationMs: number };

export interface HuntCraftRecipe {
  key: string;
  name: string;
  tier: "Common" | "Uncommon" | "Rare" | "Legendary";
  description: string;
  coinCost: number;
  parts: Record<string, number>;
  effect: HuntCraftEffect;
}

export const HUNT_CRAFT_RECIPES: HuntCraftRecipe[] = [
  {
    key: "rabbit_foot_charm",
    name: "Rabbit Foot Charm",
    tier: "Common",
    description: "+3 Luck for 2 hours.",
    coinCost: 75_000,
    parts: { rabbit_fur: 3, rabbit_meat: 2 },
    effect: { type: "luck", value: 3, durationMs: 2 * 3600 * 1000, source: "rabbit_foot_charm" },
  },
  {
    key: "duck_feather_quill",
    name: "Duck Feather Quill",
    tier: "Common",
    description: "Next successful study gives +25 education XP.",
    coinCost: 90_000,
    parts: { duck_feathers: 5 },
    effect: { type: "study_xp", bonusXp: 25 },
  },
  {
    key: "fox_tail_talisman",
    name: "Fox Tail Talisman",
    tier: "Common",
    description: "Next crime failure has a 20% chance to reduce the fine.",
    coinCost: 150_000,
    parts: { fox_tail: 3, fox_fur: 3 },
    effect: { type: "crime_fine_guard", chance: 0.2 },
  },
  {
    key: "wolf_fang_dagger",
    name: "Wolf Fang Dagger",
    tier: "Uncommon",
    description: "Next successful rob earns +10% loot.",
    coinCost: 400_000,
    parts: { wolf_fang: 4, wolf_pelt: 2 },
    effect: { type: "rob_boost", multiplier: 1.1 },
  },
  {
    key: "deer_antler_crown",
    name: "Deer Antler Crown",
    tier: "Uncommon",
    description: "Cosmetic collectible, +4 cosmetic luck.",
    coinCost: 500_000,
    parts: { deer_antlers: 4, deer_hide: 3 },
    effect: { type: "cosmetic", luck: 4 },
  },
  {
    key: "eagle_talon_gloves",
    name: "Eagle Talon Gloves",
    tier: "Uncommon",
    description: "Next hunt has +8% Rare chance.",
    coinCost: 650_000,
    parts: { eagle_talons: 3, eagle_feathers: 4 },
    effect: { type: "hunt_rare_boost", rareBonus: 0.06 },
  },
  {
    key: "black_bear_war_vest",
    name: "Black Bear War Vest",
    tier: "Rare",
    description: "Next cockfight reduces incoming damage slightly.",
    coinCost: 1_500_000,
    parts: { black_bear_pelt: 3, black_bear_claws: 2 },
    effect: { type: "cock_defense", reduction: 0.08 },
  },
  {
    key: "crocodile_hide_armor",
    name: "Crocodile Hide Armor",
    tier: "Rare",
    description: "Blocks one robbery attempt for 24 hours.",
    coinCost: 1_750_000,
    parts: { crocodile_hide: 3, crocodile_teeth: 2 },
    effect: { type: "rob_defense", durationMs: 24 * 3600 * 1000 },
  },
  {
    key: "python_skin_cloak",
    name: "Python Skin Cloak",
    tier: "Rare",
    description: "Next crime attempt gets +7% success chance.",
    coinCost: 1_250_000,
    parts: { python_skin: 3 },
    effect: { type: "crime_boost", successBonus: 0.07 },
  },
  {
    key: "snow_leopard_mantle",
    name: "Snow Leopard Mantle",
    tier: "Rare",
    description: "Cosmetic collectible, +8 cosmetic luck.",
    coinCost: 2_000_000,
    parts: { snow_leopard_pelt: 2 },
    effect: { type: "cosmetic", luck: 8 },
  },
  {
    key: "white_tiger_crown",
    name: "White Tiger Crown",
    tier: "Legendary",
    description: "Cosmetic collectible, +18 cosmetic luck.",
    coinCost: 7_500_000,
    parts: { white_tiger_pelt: 2, white_tiger_fangs: 2 },
    effect: { type: "cosmetic", luck: 18 },
  },
  {
    key: "komodo_venom_flask",
    name: "Komodo Venom Flask",
    tier: "Legendary",
    description: "One-use item; target loses 20 Luck for 2 hours.",
    coinCost: 5_000_000,
    parts: { komodo_dragon_venom: 2, komodo_dragon_scales: 1 },
    effect: { type: "venom_item" },
  },
  {
    key: "komodo_scale_rifle_kit",
    name: "Komodo Scale Rifle Kit",
    tier: "Legendary",
    description: "Next hunt gets +7% Legendary chance, safely capped.",
    coinCost: 8_000_000,
    parts: { komodo_dragon_scales: 3, golden_eagle_talons: 2 },
    effect: { type: "hunt_legendary_boost", legendaryBonus: 0.02 },
  },
  {
    key: "arctic_wolf_spirit_charm",
    name: "Arctic Wolf Spirit Charm",
    tier: "Legendary",
    description: "+15 Luck for 6 hours.",
    coinCost: 6_000_000,
    parts: { arctic_wolf_fur: 2, arctic_wolf_fangs: 2 },
    effect: { type: "luck", value: 15, durationMs: 6 * 3600 * 1000, source: "arctic_wolf_spirit_charm" },
  },
  {
    key: "golden_eagle_crown",
    name: "Golden Eagle Crown",
    tier: "Legendary",
    description: "Zoo income +10% for 7 days.",
    coinCost: 6_500_000,
    parts: { golden_eagle_feathers: 3, golden_eagle_talons: 2 },
    effect: { type: "zoo_boost", multiplier: 1.1, durationMs: 7 * 24 * 3600 * 1000 },
  },
  {
    key: "apex_trophy_case",
    name: "Apex Trophy Case",
    tier: "Legendary",
    description: "Endgame profile trophy, +25 cosmetic luck.",
    coinCost: 15_000_000,
    parts: {
      white_tiger_fangs: 1,
      komodo_dragon_scales: 1,
      arctic_wolf_fangs: 1,
      golden_eagle_talons: 1,
    },
    effect: { type: "cosmetic", luck: 25 },
  },
];

export async function getUnlockedRecipeKeys(userId: string): Promise<Set<string>> {
  const rows = await prisma.userCraftUnlock.findMany({ where: { userId } });
  return new Set(rows.map((r) => r.recipeKey));
}

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

function separator(divider = false) {
  return new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Small);
}

function getRecipeScore(recipe: HuntCraftRecipe, parts: Map<string, number>, coins: number) {
  let missingKinds = 0;
  let missingTotal = 0;
  for (const [partKey, required] of Object.entries(recipe.parts)) {
    const owned = parts.get(partKey) ?? 0;
    if (owned < required) {
      missingKinds++;
      missingTotal += required - owned;
    }
  }
  const coinMissing = coins < recipe.coinCost;
  return {
    craftable: missingKinds === 0 && !coinMissing,
    missingKinds,
    missingTotal,
    coinMissing,
  };
}

function getAnimalHintForRecipe(recipe: HuntCraftRecipe): string {
  const firstPartKey = Object.keys(recipe.parts)[0];
  if (!firstPartKey) return "Hunt animals";
  const animal = ANIMAL_CATALOG.find((a) => firstPartKey.startsWith(`${a.key}_`));
  return animal ? `Catch a ${animal.name}` : "Hunt animals";
}

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

async function grantCraftedInventoryItem(userId: string, _guildId: string, recipe: HuntCraftRecipe, consumable = false, client: typeof prisma | any = prisma) {
  const item = await client.shopItem.upsert({
    where: { catalogKey: recipe.key },
    create: {
      catalogKey: recipe.key,
      guildId: GLOBAL_CATALOG_GUILD_ID,
      name: recipe.name,
      description: recipe.description,
      price: recipe.coinCost,
      category: consumable ? "HUNT" : "COSMETICS",
      itemType: consumable ? "CONSUMABLE" : "COLLECTIBLE",
      consumable,
      usable: consumable,
      effects: [],
      showInInventory: true,
    },
    update: {
      name: recipe.name,
      description: recipe.description,
      price: recipe.coinCost,
      category: consumable ? "HUNT" : "COSMETICS",
      itemType: consumable ? "CONSUMABLE" : "COLLECTIBLE",
      consumable,
      usable: consumable,
      showInInventory: true,
    },
  });

  await client.inventory.upsert({
    where: { userId_shopItemId: { userId, shopItemId: item.id } },
    create: { userId, shopItemId: item.id, amount: 1, meta: { crafted: true, key: recipe.key, cosmeticLuck: (recipe.effect as any).luck ?? 0 } },
    update: { amount: { increment: 1 } },
  });
}

async function upsertActiveEffect(
  userId: string,
  effectType: string,
  value: number,
  durationMs: number,
  sourceItem?: Pick<HuntCraftRecipe, "key" | "name">,
) {
  const expiresAt = new Date(Date.now() + durationMs);
  const meta = sourceItem
    ? { sourceItem: { key: sourceItem.key, name: sourceItem.name, emojiKey: sourceItem.key } }
    : undefined;
  const existing = await prisma.activeEffect.findFirst({ where: { userId, effectType } });
  if (existing) {
    await prisma.activeEffect.update({ where: { id: existing.id }, data: { value, expiresAt, meta } });
  } else {
    await prisma.activeEffect.create({ data: { userId, effectType, value, expiresAt, meta } });
  }
  const ttlSeconds = Math.floor(durationMs / 1000);
  await redisService.set(`craft_effect:${userId}:${effectType}`, { value, expiresAt: expiresAt.toISOString() }, ttlSeconds);
}

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

async function applyCraftEffect(userId: string, guildId: string, recipe: HuntCraftRecipe) {
  if (CRIME_PREP_CRAFT_KEYS.has(recipe.key)) {
    await grantCraftedInventoryItem(userId, guildId, recipe, true);
    return `${recipe.name} added to inventory. Required for certain crimes — open your crime board when ready.`;
  }

  const effect = recipe.effect;

  switch (effect.type) {
    case "luck":
      await upsertLuckModifier(userId, effect.value, effect.source, effect.durationMs);
      await upsertActiveEffect(userId, "luck", effect.value, effect.durationMs, recipe);
      return `${recipe.name} activated: Luck +${effect.value}.`;
    case "study_xp":
      await upsertActiveEffect(userId, "study_xp", effect.bonusXp, 2 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_study_xp:${userId}`, { bonusXp: effect.bonusXp }, 2 * 24 * 3600);
      return `${recipe.name} prepared: next successful study gets +${effect.bonusXp} XP.`;
    case "crime_fine_guard":
      await upsertActiveEffect(userId, "crime_fine_guard", effect.chance, 3 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_crime_fine_guard:${userId}`, { chance: effect.chance }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next crime failure may soften the fine.`;
    case "rob_boost":
      await upsertActiveEffect(userId, "rob_boost", effect.multiplier, 3 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_rob_boost:${userId}`, { multiplier: effect.multiplier }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next successful rob gets +10% loot.`;
    case "hunt_rare_boost":
      await upsertActiveEffect(userId, "hunt_rare_boost", effect.rareBonus, 3 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_hunt_rare_boost:${userId}`, { rareBonus: effect.rareBonus }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next hunt has better Rare odds.`;
    case "cock_defense":
      await upsertActiveEffect(userId, "cock_defense", effect.reduction, 3 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_cock_defense:${userId}`, { reduction: effect.reduction }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next cockfight has reduced incoming damage.`;
    case "rob_defense":
      await upsertActiveEffect(userId, "rob_defense", 1, effect.durationMs, recipe);
      await redisService.set(`crafted_rob_defense:${userId}`, { active: true }, Math.floor(effect.durationMs / 1000));
      return `${recipe.name} active: blocks one robbery attempt for 24 hours.`;
    case "crime_boost":
      await upsertActiveEffect(userId, "crime_boost", effect.successBonus, 3 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_crime_boost:${userId}`, { successBonus: effect.successBonus }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next crime attempt gets +7% success.`;
    case "cosmetic":
      await grantCraftedInventoryItem(userId, guildId, recipe, false);
      return `${recipe.name} added to your cosmetics collection (+${effect.luck} cosmetic luck).`;
    case "venom_item":
      await grantCraftedInventoryItem(userId, guildId, recipe, true);
      return `${recipe.name} added to inventory. Use it on a target later.`;
    case "hunt_legendary_boost":
      await upsertActiveEffect(userId, "hunt_legendary_boost", effect.legendaryBonus, 3 * 24 * 3600 * 1000, recipe);
      await redisService.set(`crafted_hunt_legendary_boost:${userId}`, { legendaryBonus: effect.legendaryBonus }, 3 * 24 * 3600);
      return `${recipe.name} prepared: next hunt has better Legendary odds.`;
    case "zoo_boost":
      await upsertActiveEffect(userId, "zoo_boost", effect.multiplier, effect.durationMs, recipe);
      await redisService.set(`crafted_zoo_boost:${userId}`, { multiplier: effect.multiplier }, Math.floor(effect.durationMs / 1000));
      return `${recipe.name} active: zoo income +10% for 7 days.`;
    default:
      return `${recipe.name} crafted.`;
  }
}

export async function craftHuntRecipe(userId: string, guildId: string, recipeKey: string) {
  const recipe = HUNT_CRAFT_RECIPES.find((item) => item.key === recipeKey);
  if (!recipe) throw new Error("Unknown recipe.");

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < recipe.coinCost) throw new Error(`You need **${fmtCurrency(recipe.coinCost)}** to craft this.`);

  await prisma.$transaction(async (tx) => {
    const rows = await tx.huntPartInventory.findMany({ where: { userId, partKey: { in: Object.keys(recipe.parts) } } });
    const partMap = new Map(rows.map((row) => [row.partKey, row]));

    for (const [partKey, required] of Object.entries(recipe.parts)) {
      const row = partMap.get(partKey);
      if (!row || row.amount < required) {
        throw new Error(`Missing **${formatPartName(partKey)}** (${row?.amount ?? 0}/${required}).`);
      }
    }

    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: recipe.coinCost } } });
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        amount: -recipe.coinCost,
        type: "hunt_craft",
        meta: { recipeKey: recipe.key, recipeName: recipe.name },
        isEarned: false,
      },
    });

    for (const [partKey, required] of Object.entries(recipe.parts)) {
      const row = partMap.get(partKey)!;
      if (row.amount === required) {
        await tx.huntPartInventory.delete({ where: { id: row.id } });
      } else {
        await tx.huntPartInventory.update({ where: { id: row.id }, data: { amount: { decrement: required } } });
      }
    }

    if (recipe.effect.type === "cosmetic") {
      await grantCraftedInventoryItem(userId, guildId, recipe, false, tx);
    }
    if (recipe.effect.type === "venom_item") {
      await grantCraftedInventoryItem(userId, guildId, recipe, true, tx);
    }
  });

  if (recipe.effect.type === "cosmetic") {
    return {
      recipe,
      effectMessage: `${recipe.name} added to your cosmetics collection (+${recipe.effect.luck} cosmetic luck).`,
    };
  }
  if (recipe.effect.type === "venom_item") {
    return {
      recipe,
      effectMessage: `${recipe.name} added to inventory. Use it on a target later.`,
    };
  }

  const effectMessage = await applyCraftEffect(userId, guildId, recipe);
  return { recipe, effectMessage };
}

function recipeRequirementLines(recipe: HuntCraftRecipe, parts: Map<string, number>) {
  return Object.entries(recipe.parts)
    .map(([partKey, required]) => {
      const owned = parts.get(partKey) ?? 0;
      const ok = owned >= required;
      return `${ok ? Mascot.Emotes.Accept : Mascot.Emotes.Decline} ${formatPartName(partKey)} ${owned}/${required}`;
    })
    .join("\n");
}

export async function buildHuntCraftPayload(userId: string, ownerId: string, page = 1, disabled = false) {
  const unlockedKeys = await getUnlockedRecipeKeys(userId);
  const rows = await getSortedCraftRecipes(userId, unlockedKeys);
  const totalPages = Math.max(1, Math.ceil(rows.length / CRAFTS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageRows = rows.slice((safePage - 1) * CRAFTS_PER_PAGE, safePage * CRAFTS_PER_PAGE);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Hunt Crafting\n-# Recipes sorted by availability. Page ${safePage}/${totalPages}`),
    )
    .addSeparatorComponents(separator(true));

  // Tutorial: show if user has zero unlocked recipes and hasn't seen it
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
    await redisService.set(tutorialKey, true, 365 * 24 * 3600); // 1 year TTL
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
