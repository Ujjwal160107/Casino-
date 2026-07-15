import prisma from "../utils/prisma";
import { Mascot } from "../config/branding";
import { emojiInline } from "../utils/emojiRegistry";
import { SHOP_CATALOG } from "../utils/shopCatalog";
import { getShopApplicationEmojiName } from "../utils/shopItemAssets";
import { HUNT_CRAFT_RECIPES } from "./huntCraftService";
import { redisService } from "./redisService";

export type ItemEffectKind = "Buff" | "Debuff" | "Buff + Debuff";

export interface ActiveItemEffectView {
  key: string;
  itemName: string;
  emoji: string;
  kind: ItemEffectKind;
  detail: string;
  expiresAt: Date | null;
}

type RedisEffectDefinition = {
  redisPrefix: string;
  itemKey: string;
  kind: ItemEffectKind;
  detail: string | ((data: Record<string, unknown>) => string);
};

type SourceItemMeta = {
  key?: string;
  name?: string;
  emojiKey?: string;
  emoji?: string;
};

const CATALOG_BY_KEY = new Map(SHOP_CATALOG.map((item) => [item.key, item]));
const CRAFT_BY_KEY = new Map(HUNT_CRAFT_RECIPES.map((recipe) => [recipe.key, recipe]));

const FALLBACK_ITEM_EMOJIS: Record<string, string> = {
  lucky_coin: "🪙",
  padlock: "🔒",
  thief_gloves: "🧤",
  echo_whistle: "📯",
  bait_box: "🪤",
  camouflage_kit: "🥷",
  hunters_compass: "🧭",
  counterfeit_kit: "🧰",
  tax_shield: "🛡️",
  treasure_map: "🗺️",
  celestial_harp: "🎵",
  demonic_harp: "🎶",
  pandora_box: "📦",
  eclipse_mask: "🎭",
  mirror_of_fate: "🪞",
  crown_of_greed: "👑",
  devil_contract: "😈",
  soul_ledger: "📕",
  warranty_card: "🛡️",
  focus_headphones: "🎧",
  lucky_tie: "👔",
  premium_tools_oil: "🛢️",
  emergency_pager: "📟",
  overtime_contract: "📜",
  corporate_blessing: "✨",
  study_laptop: "💻",
  textbook_bundle: "📚",
  lab_kit: "🧪",
  calculator_pro: "🧮",
  focus_notes: "📝",
  cheat_sheet: "📄",
  tutor_pass: "🎓",
  komodo_venom_flask: "🦎",
  rabbit_foot_charm: "🐇",
  duck_feather_quill: "🪶",
  fox_tail_talisman: "🦊",
  wolf_fang_dagger: "🐺",
  eagle_talon_gloves: "🦅",
  black_bear_war_vest: "🐻",
  crocodile_hide_armor: "🐊",
  python_skin_cloak: "🐍",
  komodo_scale_rifle_kit: "🦎",
  arctic_wolf_spirit_charm: "🐺",
  golden_eagle_crown: "🦅",
};

const REDIS_EFFECTS: RedisEffectDefinition[] = [
  { redisPrefix: "lucky_coin", itemKey: "lucky_coin", kind: "Buff", detail: "Next game payout +50%" },
  { redisPrefix: "padlock", itemKey: "padlock", kind: "Buff", detail: "Blocks the next robbery attempt" },
  {
    redisPrefix: "thief_gloves",
    itemKey: "thief_gloves",
    kind: "Buff",
    detail: (data) => `Robbery loot +25%${countDetail(data.uses, "attempt")}`,
  },
  { redisPrefix: "hunt_echo_whistle", itemKey: "echo_whistle", kind: "Buff", detail: "Next hunt may attract an extra animal" },
  { redisPrefix: "hunt_bait_box", itemKey: "bait_box", kind: "Buff", detail: "Next hunt attracts at least 2 animals" },
  { redisPrefix: "hunt_camouflage", itemKey: "camouflage_kit", kind: "Buff", detail: "Next hunt has improved Rare and Legendary odds" },
  {
    redisPrefix: "hunt_compass",
    itemKey: "hunters_compass",
    kind: "Buff",
    detail: (data) => `${String(data.mode ?? "chosen")} route active for the next hunt`,
  },
  { redisPrefix: "counterfeit_kit", itemKey: "counterfeit_kit", kind: "Buff", detail: "Next eligible income +25%" },
  { redisPrefix: "tax_shield", itemKey: "tax_shield", kind: "Buff", detail: "Transaction taxes are blocked" },
  { redisPrefix: "demonic_vulnerability", itemKey: "demonic_harp", kind: "Debuff", detail: "More vulnerable to robbery" },
  { redisPrefix: "eclipse_mask", itemKey: "eclipse_mask", kind: "Buff + Debuff", detail: "Next robbery gets better odds and loot, but failure costs more" },
  { redisPrefix: "mirror_of_fate", itemKey: "mirror_of_fate", kind: "Buff", detail: "Reflects the next targeted curse" },
  { redisPrefix: "crown_of_greed", itemKey: "crown_of_greed", kind: "Buff + Debuff", detail: "Income +25%, losses +25%" },
  { redisPrefix: "warranty_card", itemKey: "warranty_card", kind: "Buff", detail: "Blocks the next gear break" },
  {
    redisPrefix: "focus_headphones",
    itemKey: "focus_headphones",
    kind: "Buff",
    detail: (data) => `Double sector reputation${countDetail(data.shiftsLeft, "shift")}`,
  },
  { redisPrefix: "lucky_tie", itemKey: "lucky_tie", kind: "Buff", detail: "Improves job event and interview odds" },
  {
    redisPrefix: "tools_oil",
    itemKey: "premium_tools_oil",
    kind: "Buff",
    detail: (data) => `Reduced gear wear${countDetail(data.shiftsLeft, "shift")}`,
  },
  { redisPrefix: "emergency_pager", itemKey: "emergency_pager", kind: "Buff", detail: "Redirects the next critical job failure" },
  { redisPrefix: "overtime_active", itemKey: "overtime_contract", kind: "Debuff", detail: "Extra-shift gear damage risk" },
  { redisPrefix: "corporate_blessing", itemKey: "corporate_blessing", kind: "Buff + Debuff", detail: "Massive payout chance, with severe failure risk" },
  {
    redisPrefix: "study_laptop",
    itemKey: "study_laptop",
    kind: "Buff",
    detail: (data) => `Study XP, stress, and rescue bonuses${countDetail(data.sessionsLeft, "session")}`,
  },
  {
    redisPrefix: "textbook_bundle",
    itemKey: "textbook_bundle",
    kind: "Buff + Debuff",
    detail: (data) => `1.4x study XP with wrong-chapter risk${countDetail(data.sessionsLeft, "session")}`,
  },
  {
    redisPrefix: "lab_kit",
    itemKey: "lab_kit",
    kind: "Buff + Debuff",
    detail: (data) => `Better study odds with amplified events${countDetail(data.sessionsLeft, "session")}`,
  },
  {
    redisPrefix: "calculator_pro",
    itemKey: "calculator_pro",
    kind: "Buff",
    detail: (data) => `Study fail-rescue and XP bonus${countDetail(data.sessionsLeft, "session")}`,
  },
  { redisPrefix: "focus_notes", itemKey: "focus_notes", kind: "Buff", detail: "Next successful study gets bonus XP and event protection" },
  { redisPrefix: "cheat_sheet", itemKey: "cheat_sheet", kind: "Buff + Debuff", detail: "Next exam has a major boost or severe penalty" },
  { redisPrefix: "tutor_pass", itemKey: "tutor_pass", kind: "Buff", detail: "Next study cannot fail and gets boosted rewards" },
];

const CRAFT_REDIS_PREFIX: Partial<Record<string, string>> = {
  study_xp: "crafted_study_xp",
  crime_fine_guard: "crafted_crime_fine_guard",
  rob_boost: "crafted_rob_boost",
  hunt_rare_boost: "crafted_hunt_rare_boost",
  cock_defense: "crafted_cock_defense",
  rob_defense: "crafted_rob_defense",
  crime_boost: "crafted_crime_boost",
  hunt_legendary_boost: "crafted_hunt_legendary_boost",
  zoo_boost: "crafted_zoo_boost",
};

for (const recipe of HUNT_CRAFT_RECIPES) {
  const redisPrefix = CRAFT_REDIS_PREFIX[recipe.effect.type];
  if (!redisPrefix) continue;
  REDIS_EFFECTS.push({
    redisPrefix,
    itemKey: recipe.key,
    kind: "Buff",
    detail: recipe.description.replace(/\.$/, ""),
  });
}

const LUCK_SOURCE_ITEMS: Record<string, string> = {
  celestial_harp: "celestial_harp",
  demonic_harp: "demonic_harp",
  pandora_box: "pandora_box",
  treasure_map: "treasure_map",
  komodo_venom_flask: "komodo_venom_flask",
  rabbit_foot_charm: "rabbit_foot_charm",
  arctic_wolf_spirit_charm: "arctic_wolf_spirit_charm",
};

function countDetail(value: unknown, noun: string) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  if (count === null) return "";
  return ` · ${count} ${noun}${count === 1 ? "" : "s"} left`;
}

function safeJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeEmojiKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function safeExplicitEmoji(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^<a?:[A-Za-z0-9_]+:\d+>$/.test(trimmed)) return trimmed;
  if (trimmed.length <= 32 && !/[A-Za-z0-9@<>]/.test(trimmed)) return trimmed;
  return undefined;
}

function resolveItemIdentity(itemKey: string, source?: SourceItemMeta) {
  const catalog = CATALOG_BY_KEY.get(itemKey);
  const craft = CRAFT_BY_KEY.get(itemKey);
  const itemName = source?.name || catalog?.name || craft?.name || itemKey.replace(/_/g, " ");
  const shopApplicationEmoji = emojiInline(getShopApplicationEmojiName(itemKey));
  const candidates = [
    source?.emojiKey,
    catalog?.asset,
    itemKey,
    normalizeEmojiKey(itemName),
  ].filter(
    (candidate): candidate is string => !!candidate,
  );
  const registeredEmoji = candidates.map((candidate) => emojiInline(candidate)).find(Boolean);
  const explicitEmoji = safeExplicitEmoji(source?.emoji);

  return {
    itemName,
    emoji: shopApplicationEmoji || explicitEmoji || registeredEmoji || FALLBACK_ITEM_EMOJIS[itemKey] || Mascot.Emotes.Sparks || "✨",
  };
}

function combineKinds(left: ItemEffectKind, right: ItemEffectKind): ItemEffectKind {
  if (left === right) return left;
  if (left === "Buff + Debuff" || right === "Buff + Debuff") return "Buff + Debuff";
  return "Buff + Debuff";
}

function laterExpiry(left: Date | null, right: Date | null) {
  if (!left || !right) return null;
  return left.getTime() >= right.getTime() ? left : right;
}

function mergeEffect(target: Map<string, ActiveItemEffectView>, effect: ActiveItemEffectView) {
  const existing = target.get(effect.key);
  if (!existing) {
    target.set(effect.key, effect);
    return;
  }

  const detailParts = new Set(
    `${existing.detail}; ${effect.detail}`
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  target.set(effect.key, {
    ...existing,
    kind: combineKinds(existing.kind, effect.kind),
    detail: Array.from(detailParts).join("; "),
    expiresAt: laterExpiry(existing.expiresAt, effect.expiresAt),
  });
}

async function getRedisItemEffects(userId: string, now: Date): Promise<ActiveItemEffectView[]> {
  try {
    const pipeline = redisService.getInstance().pipeline();
    for (const definition of REDIS_EFFECTS) {
      const key = `${definition.redisPrefix}:${userId}`;
      pipeline.get(key);
      pipeline.ttl(key);
    }

    const results = await pipeline.exec() as Array<[Error | null, unknown]> | null;
    if (!results) return [];

    const active: ActiveItemEffectView[] = [];
    REDIS_EFFECTS.forEach((definition, index) => {
      const raw = results[index * 2]?.[1];
      const ttl = Number(results[index * 2 + 1]?.[1]);
      if (typeof raw !== "string" || (ttl <= 0 && ttl !== -1)) return;

      const data = safeJsonObject(raw);
      const identity = resolveItemIdentity(definition.itemKey);
      active.push({
        key: definition.itemKey,
        itemName: identity.itemName,
        emoji: identity.emoji,
        kind: definition.kind,
        detail: typeof definition.detail === "function" ? definition.detail(data) : definition.detail,
        expiresAt: ttl > 0 ? new Date(now.getTime() + ttl * 1000) : null,
      });
    });
    return active;
  } catch (error) {
    console.error("Failed to read active Redis item effects:", error);
    return [];
  }
}

function sourceItemFromMeta(meta: Record<string, unknown>): SourceItemMeta | undefined {
  const raw = meta.sourceItem;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const item = raw as Record<string, unknown>;
  return {
    key: typeof item.key === "string" ? item.key : undefined,
    name: typeof item.name === "string" ? item.name : undefined,
    emojiKey: typeof item.emojiKey === "string" ? item.emojiKey : undefined,
    emoji: typeof item.emoji === "string" ? item.emoji : undefined,
  };
}

function genericEffectDetail(effectType: string, value: number, meta: Record<string, unknown>) {
  switch (effectType) {
    case "TEMP_ROLE": return "Temporary role active";
    case "DEATH_SAVE": return "Protects against the next chicken death";
    case "PAY_MULTIPLIER": return `Pay bonus ${Math.round(value * 100)}%`;
    case "COOLDOWN_REDUCTION": return "Cooldown reduction active";
    case "EXAM_BOOST": return `Exam Intelligence +${value}`;
    case "XP_MULTIPLIER": return `${value}x XP multiplier`;
    default:
      return typeof meta.description === "string" ? meta.description : effectType.toLowerCase().replace(/_/g, " ");
  }
}

async function getDatabaseItemEffects(userId: string, now: Date): Promise<ActiveItemEffectView[]> {
  const rows = await prisma.activeEffect.findMany({
    where: {
      userId,
      OR: [{ expiresAt: { gt: now } }, { expiresAt: null }],
    },
    orderBy: { createdAt: "desc" },
  });

  const active: ActiveItemEffectView[] = [];
  for (const row of rows) {
    if (row.effectType.startsWith("cooldown:")) continue;
    const meta = row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
      ? row.meta as Record<string, unknown>
      : {};

    if (row.effectType === "luck_modifier") {
      const source = typeof meta.source === "string" ? meta.source : "";
      const itemKey = LUCK_SOURCE_ITEMS[source];
      if (!itemKey) continue;
      const identity = resolveItemIdentity(itemKey);
      active.push({
        key: itemKey,
        itemName: identity.itemName,
        emoji: identity.emoji,
        kind: row.value < 0 ? "Debuff" : "Buff",
        detail: `${row.value > 0 ? "+" : ""}${row.value} Luck`,
        expiresAt: row.expiresAt,
      });
      continue;
    }

    if (row.effectType === "devil_contract_debt") {
      const usesLeft = typeof meta.usesLeft === "number" ? Math.max(0, Math.floor(meta.usesLeft)) : 0;
      const identity = resolveItemIdentity("devil_contract");
      active.push({
        key: "devil_contract",
        itemName: identity.itemName,
        emoji: identity.emoji,
        kind: "Debuff",
        detail: `Income -20% · ${usesLeft} event${usesLeft === 1 ? "" : "s"} left`,
        expiresAt: row.expiresAt,
      });
      continue;
    }

    if (row.effectType === "soul_ledger_watch") {
      const identity = resolveItemIdentity("soul_ledger");
      const readyAt = typeof meta.readyAt === "string" ? new Date(meta.readyAt) : null;
      const validReadyAt = readyAt && Number.isFinite(readyAt.getTime()) ? readyAt : null;
      active.push({
        key: "soul_ledger",
        itemName: identity.itemName,
        emoji: identity.emoji,
        kind: "Buff",
        detail: row.value > 0
          ? `Tracking a loss · resolution ${validReadyAt ? `<t:${Math.floor(validReadyAt.getTime() / 1000)}:R>` : "pending"}`
          : "Watching for the next qualifying loss",
        expiresAt: row.expiresAt,
      });
      continue;
    }

    // One-use crafted effects use their Redis key as the source of truth. Their
    // database rows can outlive consumption, so only the Redis registry renders them.
    if (CRAFT_REDIS_PREFIX[row.effectType] || row.effectType === "luck") continue;

    const sourceItem = sourceItemFromMeta(meta);
    if (!sourceItem?.name && !sourceItem?.key) continue;
    const itemKey = sourceItem.key || normalizeEmojiKey(sourceItem.name!);
    const identity = resolveItemIdentity(itemKey, sourceItem);
    active.push({
      key: itemKey,
      itemName: identity.itemName,
      emoji: identity.emoji,
      kind: row.value < 0 ? "Debuff" : "Buff",
      detail: genericEffectDetail(row.effectType, row.value, meta),
      expiresAt: row.expiresAt,
    });
  }

  return active;
}

export async function getActiveItemEffects(userId: string, now = new Date()): Promise<ActiveItemEffectView[]> {
  const [databaseEffects, redisEffects] = await Promise.all([
    getDatabaseItemEffects(userId, now),
    getRedisItemEffects(userId, now),
  ]);

  const merged = new Map<string, ActiveItemEffectView>();
  for (const effect of [...databaseEffects, ...redisEffects]) mergeEffect(merged, effect);

  return Array.from(merged.values()).sort((left, right) => {
    const leftExpiry = left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightExpiry = right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return leftExpiry - rightExpiry || left.itemName.localeCompare(right.itemName);
  });
}

function escapeProfileText(value: string) {
  return value
    .replace(/@/g, "@\u200b")
    .replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

export function formatActiveItemEffectList(effects: ActiveItemEffectView[], maxLength = 2_300) {
  if (effects.length === 0) return "- No active item buffs or debuffs.";

  const lines: string[] = [];
  for (const effect of effects) {
    const time = effect.expiresAt
      ? `ends <t:${Math.floor(effect.expiresAt.getTime() / 1000)}:R>`
      : "until consumed";
    const line = `${lines.length + 1}. ${effect.emoji} **${escapeProfileText(effect.itemName)}** — **${effect.kind}** · ${escapeProfileText(effect.detail)} · ${time}`;
    const remaining = effects.length - lines.length;
    const overflowLine = `\n-# +${remaining} more active item effect${remaining === 1 ? "" : "s"}`;
    const projected = [...lines, line].join("\n");
    if (projected.length + overflowLine.length > maxLength) break;
    lines.push(line);
  }

  const omitted = effects.length - lines.length;
  if (omitted > 0) {
    lines.push(`-# +${omitted} more active item effect${omitted === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}
