import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "canvas";
import {
  ApplicationEmoji,
  Client,
  Collection,
  GatewayIntentBits,
} from "discord.js";
import dotenv from "dotenv";
import { applicationEmojiName, resolveTableAsset } from "../utils/applicationEmojiNames";
import {
  APPLICATION_EMOJI_FAMILIES,
  ApplicationEmojiFamily,
  assertFamilyRegistry,
  pruneCandidates,
  selectFamilies,
} from "../utils/applicationEmojiFamilies";

// One sync for every managed application emoji family (spec 20.4). Families
// live in APPLICATION_EMOJI_FAMILIES; this script never branches on one.
// `--dry-run` never reads .env or contacts Discord.

assertFamilyRegistry(APPLICATION_EMOJI_FAMILIES);

const EMOJI_SIZE = 128;
const IMAGE_PADDING = 8;
/** Pixel-grid families: art at an integer scale, 4 px from each edge (D39). */
const PIXEL_GRID_PADDING = 4;
const MAX_IMAGE_BYTES = 256 * 1024;
const MAX_APPLICATION_EMOJIS = 2_000;

type Options = {
  dryRun: boolean;
  plan: boolean;
  replace: boolean;
  prune: boolean;
  /** `--family` ids; null means every family. */
  families: string[] | null;
};

export type PreparedEmoji = {
  familyId: ApplicationEmojiFamily["id"];
  prefix: string;
  key: string;
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
  const families = APPLICATION_EMOJI_FAMILIES.map((f) => `${f.id} (${f.prefix}*)`).join(", ");
  console.log([
    "Application emoji sync",
    "",
    "Usage: npm run sync:app-emojis -- [options]",
    "",
    `Families: ${families}`,
    "",
    "Options:",
    "  --family <ids>  Only these families, comma-separated (default: all).",
    "  --dry-run       Validate and render every selected emoji without contacting Discord.",
    "  --plan          Log in and print what a sync would create, replace and prune, changing nothing.",
    "  --replace       Safely replace images for existing managed application emojis.",
    "  --prune         Remove stale emojis in each selected family's prefix after a fully successful sync.",
    "  --help          Show this help.",
  ].join("\n"));
}

function parseOptions(args: string[]): Options | null {
  const flags = new Set(["--dry-run", "--plan", "--replace", "--prune", "--help"]);
  const unknown: string[] = [];
  let families: string[] | null = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--family") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--family needs a value, e.g. --family shop,cf");
      families = value.split(",").map((id) => id.trim()).filter(Boolean);
      i += 1;
    } else if (!flags.has(args[i])) {
      unknown.push(args[i]);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown option${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }
  if (args.includes("--help")) {
    printUsage();
    return null;
  }
  return {
    dryRun: args.includes("--dry-run"),
    plan: args.includes("--plan"),
    replace: args.includes("--replace"),
    prune: args.includes("--prune"),
    families,
  };
}

/**
 * A 128x128 emoji PNG. Families without a pixel grid are scaled smoothly into
 * 8 px of padding; a pixel-grid family is drawn nearest-neighbour at an
 * integer cell size, so 160 px art (40 cells of 4 px) lands as 120 px at offset 4.
 */
export async function renderApplicationEmoji(filePath: string, family: ApplicationEmojiFamily): Promise<Buffer> {
  const source = await loadImage(filePath);
  if (source.width <= 0 || source.height <= 0) {
    throw new Error("The source image has invalid dimensions.");
  }

  const canvas = createCanvas(EMOJI_SIZE, EMOJI_SIZE);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, EMOJI_SIZE, EMOJI_SIZE);

  if (family.pixelGrid) {
    const grid = family.pixelGrid;
    if (source.width !== source.height || source.width % grid !== 0) {
      throw new Error(`Expected a square image divisible by the ${grid}-cell grid, got ${source.width}x${source.height}.`);
    }
    const cell = Math.floor((EMOJI_SIZE - PIXEL_GRID_PADDING * 2) / grid);
    const size = cell * grid;
    const offset = Math.floor((EMOJI_SIZE - size) / 2);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, offset, offset, size, size);
  } else {
    context.imageSmoothingEnabled = true;
    const availableSize = EMOJI_SIZE - IMAGE_PADDING * 2;
    const scale = Math.min(availableSize / source.width, availableSize / source.height);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const x = Math.round((EMOJI_SIZE - width) / 2);
    const y = Math.round((EMOJI_SIZE - height) / 2);
    context.drawImage(source, x, y, width, height);
  }

  const image = canvas.toBuffer("image/png", { compressionLevel: 9 });
  if (image.length > MAX_IMAGE_BYTES) {
    throw new Error(`Rendered PNG is ${image.length} bytes; Discord allows at most ${MAX_IMAGE_BYTES}.`);
  }
  return image;
}

/** Validates and renders every emoji of the given families; throws listing every problem. */
export async function prepareEmojis(families: readonly ApplicationEmojiFamily[]): Promise<PreparedEmoji[]> {
  const seenNames = new Map<string, string>();
  const prepared: PreparedEmoji[] = [];
  const errors: string[] = [];

  for (const family of families) {
    for (const key of Object.keys(family.assets).sort()) {
      const label = `${family.id}:${key}`;
      if (!family.validKeys.has(key)) {
        errors.push(`${label}: mapped asset does not belong to a current ${family.id} key.`);
        continue;
      }

      let emojiName: string;
      try {
        emojiName = applicationEmojiName(family.prefix, key);
      } catch (error) {
        errors.push(`${label}: ${describeError(error)}`);
        continue;
      }

      if (!/^[a-z0-9_]{2,32}$/.test(emojiName)) {
        errors.push(`${label}: generated emoji name "${emojiName}" is invalid.`);
        continue;
      }
      const duplicate = seenNames.get(emojiName);
      if (duplicate) {
        errors.push(`${label}: emoji name collides with ${duplicate} as "${emojiName}".`);
        continue;
      }
      seenNames.set(emojiName, label);

      const asset = resolveTableAsset(family.assets, key);
      if (!asset) {
        errors.push(`${label}: asset file "${family.assets[key]}" is missing.`);
        continue;
      }

      try {
        prepared.push({
          familyId: family.id,
          prefix: family.prefix,
          key,
          emojiName,
          image: await renderApplicationEmoji(asset.filePath, family),
        });
      } catch (error) {
        errors.push(`${label}: could not render (${describeError(error)}).`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Application emoji validation failed:\n- ${errors.join("\n- ")}`);
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
    .update(target.key)
    .update(target.image)
    .digest("hex")
    .slice(0, 16);
  let name = `${target.prefix}tmp_${digest}`;
  let suffix = 1;
  while (existingNames.has(name)) {
    name = `${target.prefix}tmp_${digest}_${suffix}`.slice(0, 32);
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

/** The live bot, logged in. The only place .env is read, so --dry-run never touches it (P19). */
async function loginClient(): Promise<Client> {
  dotenv.config({ quiet: true });
  // DISCORD_TOKEN first: it is what src/index.ts logs in with, and a stale TOKEN may linger for older scripts.
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.BOT_TOKEN;
  if (!token) {
    throw new Error("Missing bot token. Set DISCORD_TOKEN (or TOKEN, BOT_TOKEN).");
  }
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(token);
    if (!client.application) throw new Error("Discord application was not available after login.");
    await client.application.fetch();
  } catch (error) {
    client.destroy();
    throw error;
  }
  return client;
}

function existingNamesOf(emojis: Collection<string, ApplicationEmoji>): string[] {
  return [...emojis.values()].map((emoji) => emoji.name).filter((name): name is string => !!name);
}

function desiredNamesOf(prepared: readonly PreparedEmoji[], family: ApplicationEmojiFamily): Set<string> {
  return new Set(prepared.filter((target) => target.familyId === family.id).map((target) => target.emojiName));
}

/** --plan: what a sync would create, replace (with --replace) and prune (with --prune), per family. Changes nothing. */
async function planEmojis(families: readonly ApplicationEmojiFamily[], prepared: PreparedEmoji[]): Promise<void> {
  const client = await loginClient();
  try {
    const existing = await client.application!.emojis.fetch();
    const existingNames = existingNamesOf(existing);
    console.log(`Connected as ${client.user?.tag ?? "the configured bot"}. ${existing.size} application emojis exist.`);
    for (const family of families) {
      const desired = desiredNamesOf(prepared, family);
      const create = [...desired].filter((name) => emojisNamed(existing, name).length === 0);
      const replace = [...desired].filter((name) => emojisNamed(existing, name).length > 0);
      const prune = pruneCandidates(existingNames, family, desired);
      console.log(`[${family.id}] ${desired.size} desired`);
      console.log(`  would create (${create.length}): ${create.join(", ") || "none"}`);
      console.log(`  would replace with --replace (${replace.length}): ${replace.join(", ") || "none"}`);
      console.log(`  would prune with --prune (${prune.length}): ${prune.join(", ") || "none"}`);
    }
    console.log("Plan complete. No emojis were changed.");
  } finally {
    client.destroy();
  }
}

async function syncEmojis(
  options: Options,
  families: readonly ApplicationEmojiFamily[],
  prepared: PreparedEmoji[],
): Promise<SyncSummary> {
  const client = await loginClient();
  const summary: SyncSummary = {
    desired: prepared.length,
    created: 0,
    replaced: 0,
    skipped: 0,
    pruned: 0,
    failed: 0,
  };

  try {
    const application = client.application!;
    let existing = await application.emojis.fetch();
    const desiredNames = new Set(prepared.map((target) => target.emojiName));
    const existingNames = new Set(existingNamesOf(existing));

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
    console.log(`Synchronizing ${prepared.length} application emojis (${families.map((f) => f.id).join(", ")})...`);

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
          console.log(`Created ${target.emojiName} (${target.familyId}:${target.key}).`);
        } else if (options.replace) {
          await safelyReplaceEmoji(application, current, target, existingNames);
          existing = await application.emojis.fetch();
          summary.replaced += 1;
          console.log(`Replaced ${target.emojiName} (${target.familyId}:${target.key}).`);
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
      const staleNames = new Set(
        families.flatMap((family) => pruneCandidates(existingNamesOf(existing), family, desiredNamesOf(prepared, family))),
      );
      const stale = [...existing.values()].filter((emoji) => !!emoji.name && staleNames.has(emoji.name));
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
    for (const family of families) {
      const missingAfterSync = [...desiredNamesOf(prepared, family)].filter((name) => emojisNamed(verified, name).length !== 1);
      if (missingAfterSync.length > 0) {
        summary.failed += missingAfterSync.length;
        console.error(`[${family.id}] verification failed for: ${missingAfterSync.join(", ")}`);
      }
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

  const families = selectFamilies(options.families);
  console.log(`Validating and rendering application emojis for ${families.map((f) => f.id).join(", ")}...`);
  const prepared = await prepareEmojis(families);
  const totalBytes = prepared.reduce((sum, target) => sum + target.image.length, 0);
  for (const family of families) {
    console.log(`  ${family.id}: ${prepared.filter((target) => target.familyId === family.id).length} emojis (${family.prefix}*)`);
  }
  console.log(
    `Validated ${prepared.length} transparent ${EMOJI_SIZE}x${EMOJI_SIZE} PNG emojis (${Math.ceil(totalBytes / 1024)} KiB total).`,
  );

  if (options.dryRun) {
    console.log("Dry run complete. Discord was not contacted and no emojis were changed.");
    return;
  }

  if (options.plan) {
    await planEmojis(families, prepared);
    return;
  }

  const summary = await syncEmojis(options, families, prepared);
  console.log(
    `Sync complete: ${summary.desired} desired, ${summary.created} created, ${summary.replaced} replaced, ` +
      `${summary.skipped} unchanged, ${summary.pruned} pruned, ${summary.failed} failed.`,
  );
  if (summary.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(describeError(error));
    process.exitCode = 1;
  });
}
