import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "canvas";
import {
  ApplicationEmoji,
  Client,
  Collection,
  GatewayIntentBits,
} from "discord.js";
import dotenv from "dotenv";
import { SHOP_CATALOG } from "../utils/shopCatalog";
import {
  getShopApplicationEmojiName,
  resolveShopItemThumbnailAsset,
  SHOP_APPLICATION_EMOJI_PREFIX,
  SHOP_ITEM_THUMBNAIL_ASSETS,
} from "../utils/shopItemAssets";

dotenv.config({ quiet: true });

const EMOJI_SIZE = 128;
const IMAGE_PADDING = 8;
const MAX_IMAGE_BYTES = 256 * 1024;
const MAX_APPLICATION_EMOJIS = 2_000;

type Options = {
  dryRun: boolean;
  replace: boolean;
  prune: boolean;
};

type PreparedEmoji = {
  itemKey: string;
  itemName: string;
  emojiName: string;
  image: Buffer;
};

type SyncSummary = {
  desired: number;
  created: number;
  replaced: number;
  skipped: number;
  pruned: number;
  failed: number;
};

function printUsage(): void {
  console.log([
    "Shop application emoji sync",
    "",
    "Usage: npm run sync:shop-emojis -- [options]",
    "",
    "Options:",
    "  --dry-run  Validate and render every current shop thumbnail without contacting Discord.",
    "  --replace  Safely replace images for existing shop_* application emojis.",
    "  --prune    Remove stale shop_* application emojis after a fully successful sync.",
    "  --help     Show this help.",
  ].join("\n"));
}

function parseOptions(args: string[]): Options | null {
  const allowed = new Set(["--dry-run", "--replace", "--prune", "--help"]);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Unknown option${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
  if (args.includes("--help")) {
    printUsage();
    return null;
  }
  return {
    dryRun: args.includes("--dry-run"),
    replace: args.includes("--replace"),
    prune: args.includes("--prune"),
  };
}

async function renderApplicationEmoji(filePath: string): Promise<Buffer> {
  const source = await loadImage(filePath);
  if (source.width <= 0 || source.height <= 0) {
    throw new Error("The source image has invalid dimensions.");
  }

  const canvas = createCanvas(EMOJI_SIZE, EMOJI_SIZE);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, EMOJI_SIZE, EMOJI_SIZE);
  context.imageSmoothingEnabled = true;

  const availableSize = EMOJI_SIZE - IMAGE_PADDING * 2;
  const scale = Math.min(availableSize / source.width, availableSize / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const x = Math.round((EMOJI_SIZE - width) / 2);
  const y = Math.round((EMOJI_SIZE - height) / 2);
  context.drawImage(source, x, y, width, height);

  const image = canvas.toBuffer("image/png", { compressionLevel: 9 });
  if (image.length > MAX_IMAGE_BYTES) {
    throw new Error(`Rendered PNG is ${image.length} bytes; Discord allows at most ${MAX_IMAGE_BYTES}.`);
  }
  return image;
}

async function prepareEmojis(projectRoot = process.cwd()): Promise<PreparedEmoji[]> {
  const catalogByKey = new Map(SHOP_CATALOG.map((item) => [item.key, item]));
  const seenNames = new Map<string, string>();
  const prepared: PreparedEmoji[] = [];
  const errors: string[] = [];

  for (const itemKey of Object.keys(SHOP_ITEM_THUMBNAIL_ASSETS).sort()) {
    const catalogItem = catalogByKey.get(itemKey);
    if (!catalogItem) {
      errors.push(`${itemKey}: mapped thumbnail does not belong to a current shop item.`);
      continue;
    }

    let emojiName: string;
    try {
      emojiName = getShopApplicationEmojiName(itemKey);
    } catch (error) {
      errors.push(`${itemKey}: ${describeError(error)}`);
      continue;
    }

    if (!/^[a-z0-9_]{2,32}$/.test(emojiName)) {
      errors.push(`${itemKey}: generated emoji name "${emojiName}" is invalid.`);
      continue;
    }
    const duplicateItemKey = seenNames.get(emojiName);
    if (duplicateItemKey) {
      errors.push(`${itemKey}: emoji name collides with ${duplicateItemKey} as "${emojiName}".`);
      continue;
    }
    seenNames.set(emojiName, itemKey);

    const asset = resolveShopItemThumbnailAsset(itemKey);
    if (!asset) {
      errors.push(`${itemKey}: thumbnail file "${SHOP_ITEM_THUMBNAIL_ASSETS[itemKey]}" is missing.`);
      continue;
    }

    try {
      prepared.push({
        itemKey,
        itemName: catalogItem.name,
        emojiName,
        image: await renderApplicationEmoji(asset.filePath),
      });
    } catch (error) {
      errors.push(`${itemKey}: could not render thumbnail (${describeError(error)}).`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Shop emoji validation failed:\n- ${errors.join("\n- ")}`);
  }
  return prepared;
}

function emojisNamed(
  emojis: Collection<string, ApplicationEmoji>,
  name: string,
): ApplicationEmoji[] {
  return [...emojis.values()].filter((emoji) => emoji.name === name);
}

function temporaryEmojiName(target: PreparedEmoji, existingNames: Set<string>): string {
  const digest = createHash("sha256")
    .update(target.itemKey)
    .update(target.image)
    .digest("hex")
    .slice(0, 16);
  let name = `shop_tmp_${digest}`;
  let suffix = 1;
  while (existingNames.has(name)) {
    name = `shop_tmp_${digest}_${suffix}`.slice(0, 32);
    suffix += 1;
  }
  return name;
}

async function safelyReplaceEmoji(
  application: NonNullable<Client["application"]>,
  existing: ApplicationEmoji,
  target: PreparedEmoji,
  existingNames: Set<string>,
): Promise<void> {
  const temporaryName = temporaryEmojiName(target, existingNames);
  const replacement = await application.emojis.create({
    attachment: target.image,
    name: temporaryName,
  });
  existingNames.add(temporaryName);

  try {
    await existing.delete();
    await replacement.setName(target.emojiName);
    existingNames.delete(temporaryName);
    existingNames.add(target.emojiName);
  } catch (error) {
    // If the old emoji still exists, remove the temporary upload. If deletion of
    // the old emoji succeeded, retain the temporary emoji so no artwork is lost.
    try {
      const current = await application.emojis.fetch();
      const currentReplacement = current.get(replacement.id);
      if (!current.has(existing.id) && currentReplacement?.name === target.emojiName) {
        existingNames.delete(temporaryName);
        existingNames.add(target.emojiName);
        return;
      }
      if (current.has(existing.id) && currentReplacement) {
        await replacement.delete();
        existingNames.delete(temporaryName);
      }
    } catch {
      // Preserve the original error; a later run can reconcile the managed emoji.
    }
    throw error;
  }
}

async function syncEmojis(options: Options, prepared: PreparedEmoji[]): Promise<SyncSummary> {
  const token = process.env.TOKEN || process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
  if (!token) {
    throw new Error("Missing bot token. Set TOKEN, DISCORD_TOKEN, or BOT_TOKEN.");
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const summary: SyncSummary = {
    desired: prepared.length,
    created: 0,
    replaced: 0,
    skipped: 0,
    pruned: 0,
    failed: 0,
  };

  try {
    await client.login(token);
    if (!client.application) throw new Error("Discord application was not available after login.");
    const application = client.application;
    await application.fetch();
    let existing = await application.emojis.fetch();
    const desiredNames = new Set(prepared.map((target) => target.emojiName));
    const existingNames = new Set(
      [...existing.values()].map((emoji) => emoji.name).filter((name): name is string => !!name),
    );

    const duplicateManagedNames = [...desiredNames].filter(
      (name) => emojisNamed(existing, name).length > 1,
    );
    if (duplicateManagedNames.length > 0) {
      throw new Error(
        `Duplicate managed application emoji names must be resolved first: ${duplicateManagedNames.join(", ")}`,
      );
    }

    const missingCount = prepared.filter((target) => emojisNamed(existing, target.emojiName).length === 0).length;
    const replacementBuffer = options.replace && prepared.length > missingCount ? 1 : 0;
    if (existing.size + missingCount + replacementBuffer > MAX_APPLICATION_EMOJIS) {
      throw new Error(
        `Sync needs ${existing.size + missingCount + replacementBuffer} application emoji slots, but Discord allows ${MAX_APPLICATION_EMOJIS}.`,
      );
    }

    console.log(`Connected as ${client.user?.tag ?? "the configured bot"}.`);
    console.log(`Synchronizing ${prepared.length} shop item emojis...`);

    for (const target of prepared) {
      const current = emojisNamed(existing, target.emojiName)[0];
      try {
        if (!current) {
          const created = await application.emojis.create({
            attachment: target.image,
            name: target.emojiName,
          });
          existing.set(created.id, created);
          existingNames.add(target.emojiName);
          summary.created += 1;
          console.log(`Created ${target.emojiName} (${target.itemName}).`);
        } else if (options.replace) {
          await safelyReplaceEmoji(application, current, target, existingNames);
          existing = await application.emojis.fetch();
          summary.replaced += 1;
          console.log(`Replaced ${target.emojiName} (${target.itemName}).`);
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        console.error(`Failed ${target.emojiName}: ${describeError(error)}`);
      }
    }

    if (options.prune && summary.failed === 0) {
      existing = await application.emojis.fetch();
      const stale = [...existing.values()].filter(
        (emoji) =>
          !!emoji.name &&
          emoji.name.startsWith(SHOP_APPLICATION_EMOJI_PREFIX) &&
          !desiredNames.has(emoji.name),
      );
      for (const emoji of stale) {
        try {
          await emoji.delete();
          summary.pruned += 1;
          console.log(`Pruned stale managed emoji ${emoji.name}.`);
        } catch (error) {
          summary.failed += 1;
          console.error(`Failed to prune ${emoji.name}: ${describeError(error)}`);
        }
      }
    } else if (options.prune && summary.failed > 0) {
      console.warn("Pruning skipped because one or more uploads failed.");
    }

    const verified = await application.emojis.fetch();
    const missingAfterSync = [...desiredNames].filter((name) => emojisNamed(verified, name).length !== 1);
    if (missingAfterSync.length > 0) {
      summary.failed += missingAfterSync.length;
      console.error(`Verification failed for: ${missingAfterSync.join(", ")}`);
    }

    return summary;
  } finally {
    client.destroy();
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;

  console.log("Validating and rendering the current shop item-info thumbnails...");
  const prepared = await prepareEmojis();
  const totalBytes = prepared.reduce((sum, target) => sum + target.image.length, 0);
  console.log(
    `Validated ${prepared.length} transparent ${EMOJI_SIZE}x${EMOJI_SIZE} PNG emojis (${Math.ceil(totalBytes / 1024)} KiB total).`,
  );

  if (options.dryRun) {
    console.log("Dry run complete. Discord was not contacted and no emojis were changed.");
    return;
  }

  const summary = await syncEmojis(options, prepared);
  console.log(
    `Sync complete: ${summary.desired} desired, ${summary.created} created, ${summary.replaced} replaced, ` +
      `${summary.skipped} unchanged, ${summary.pruned} pruned, ${summary.failed} failed.`,
  );
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
