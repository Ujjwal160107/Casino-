import fs from "fs";
import path from "path";

export const SHOP_APPLICATION_EMOJI_PREFIX = "shop_";

/**
 * Stable Discord application-emoji name for a shop item.
 * Discord emoji names support lowercase letters, numbers, and underscores.
 */
export function getShopApplicationEmojiName(itemKey: string): string {
  const normalizedKey = itemKey
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = `${SHOP_APPLICATION_EMOJI_PREFIX}${normalizedKey}`.slice(0, 32).replace(/_+$/g, "");

  if (!normalizedKey || name.length < 2) {
    throw new Error(`Cannot create a valid application emoji name for shop item "${itemKey}".`);
  }

  return name;
}

/**
 * Exact asset files used by the shop's item-info and purchase cards.
 * This is also the single source of truth for managed application emojis.
 */
export const SHOP_ITEM_THUMBNAIL_ASSETS: Readonly<Record<string, string>> = {
  tax_shield: "tax shield.png",
  bandage: "bandage.png",
  counterfeit_kit: "counterfeit kit.png",
  lucky_coin: "lucky coin.png",
  thief_gloves: "thieves gloves.png",
  energy_drink: "energy drink.png",
  padlock: "padlock.png",
  mystery_box: "mystery box.png",
  treasure_map: "treasure map.png",
  loaded_dice_of_ruin: "dice.png",
  celestial_harp: "angelic harp.png",
  demonic_harp: "demonic harp.png",
  pandora_box: "pandoras box.png",
  eclipse_mask: "eclipse mask.png",
  mirror_of_fate: "mirror of fate.png",
  crown_of_greed: "crown of greed.png",
  devil_contract: "devils contract.png",
  soul_ledger: "soul ledger.png",
  work_laptop: "work laptop.png",
  medical_kit: "medical kit.png",
  business_briefcase: "business briefcase.png",
  legal_case_file: "legal case file.png",
  service_uniform: "service uniform.png",
  mechanic_toolkit: "mechanic toolkit.png",
  freelance_starter_pack: "freelance starter kit.png",
  repair_coupon: "repair token.png",
  warranty_card: "warranty card.png",
  stress_pills: "stress pills.png",
  energy_flask: "energy flask.png",
  focus_headphones: "focus headphones.png",
  lucky_tie: "lucky tie.png",
  premium_tools_oil: "premium tools oil.png",
  emergency_pager: "emergency pager.png",
  overtime_contract: "overtime contract.png",
  blackmarket_resume: "blackmarket resume.png",
  corporate_blessing: "golden resume.png",
  study_laptop: "study laptop.png",
  textbook_bundle: "textbook bundle.png",
  lab_kit: "lab kit.png",
  calculator_pro: "calculator pro.png",
  coffee_thermos: "coffee thermos.png",
  focus_notes: "focus notes.png",
  cheat_sheet: "cheat sheet.png",
  tutor_pass: "tutor pass.png",
  scholarship_letter: "scholarship letter.png",
  hunting_permit: "hunting permit.png",
  wooden_rifle: "wooden rifle.png",
  echo_whistle: "echo whistle.png",
  bait_box: "bait box.png",
  camouflage_kit: "camouflage kit.png",
  iron_rifle: "iron rifle.png",
  hunters_compass: "hunter's compass.png",
  sniper_rifle: "sniper rifle.png",
  legendary_rifle: "legendary rifle.png",
  basic_feed: "basic feed.png",
  protein_feed: "protein feed.png",
  agility_vitamins: "agility vitamins.png",
  feather_bandage: "feather bandage.png",
  training_whistle: "training whistle.png",
  iron_spurs: "iron spurs.png",
  guard_vest: "gaurd vest.png",
  champion_feed: "champion feed.png",
  phoenix_serum: "pheonix serum.png",
};

export type ShopItemThumbnailAsset = {
  itemKey: string;
  fileName: string;
  filePath: string;
  attachmentName: string;
};

export function resolveShopItemThumbnailAsset(
  itemKey: string,
  projectRoot = process.cwd(),
): ShopItemThumbnailAsset | null {
  const fileName = SHOP_ITEM_THUMBNAIL_ASSETS[itemKey];
  if (!fileName) return null;

  const filePath = path.resolve(projectRoot, "src", "assets", fileName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;

  return {
    itemKey,
    fileName,
    filePath,
    attachmentName: fileName.replace(/\s+/g, "_"),
  };
}
