// Family name and tag rules (spec 6.2): what a player may type into the
// Create, Rename and force-rename inputs, and the unique keys derived from it;
// plus the free-text rule (amendment 8.6) for a recruitment pitch or application.
import { FAMILY_NAME_DENYLIST, FAMILY_NAME_RULE, FAMILY_NAME_SLURS, FAMILY_TAG_RULE, PITCH_DENYLIST } from "../../data/crimeFamilyCatalog";

export type NameCheck = { ok: true; name: string; nameKey: string } | { ok: false; reason: string };
export type TagCheck = { ok: true; tag: string; tagKey: string } | { ok: false; reason: string };
export type PublicTextCheck = { ok: true; text: string } | { ok: false; reason: string };

const NAME_RULE_REASON = "Names are 3–24 characters: letters, digits, spaces, ' and -; start and end with a letter or digit.";
const TAG_RULE_REASON = "Tags are 2–4 letters or digits.";

/** The unique key of a family name: case and inner whitespace folded. */
export function nameKeyOf(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ");
}

/** Case and every non-alphanumeric stripped: the form the denylist and slurs match against. */
const fold = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Denylist and slurs match as substrings of the folded text. */
function isDenied(raw: string): boolean {
  const folded = fold(raw);
  return [...FAMILY_NAME_DENYLIST, ...FAMILY_NAME_SLURS].some((word) => folded.includes(word));
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const MENTION = /<@[!&]?\d+>|<#\d+>|@everyone|@here/i;
const LINK = /(https?:\/\/|www\.|discord\.gg|discord(app)?\.com\/invite|dsc\.gg|\]\()/i;
const PITCH_DENIED = new RegExp(`\\b(${PITCH_DENYLIST.join("|")})\\b`);

/**
 * Slurs per word (A37): each word folded on its own, plus one joined word per
 * run of two or more one-character words ("n i g g e r"). Folding the whole
 * sentence would join neighbours and invent matches ("go ok" → "gook").
 */
function hasSlur(text: string): boolean {
  const words = text.split(" ").map(fold).filter((w) => w !== "");
  const joined: string[] = [];
  let run: string[] = [];
  for (const w of [...words, ""]) {
    if (w.length === 1) { run.push(w); continue; }
    if (run.length >= 2) joined.push(run.join(""));
    run = [];
  }
  return [...words, ...joined].some((w) => FAMILY_NAME_SLURS.some((slur) => w.includes(slur)));
}

/** A pitch or application message (amendment 8.6): zero-width stripped, whitespace collapsed, then each rule in order. */
export function checkPublicText(raw: string, limits: { min: number; max: number }): PublicTextCheck {
  const text = raw.replace(ZERO_WIDTH, "").trim().replace(/\s+/g, " ");
  if (text.length < limits.min || text.length > limits.max) return { ok: false, reason: `Write ${limits.min}–${limits.max} characters.` };
  if (MENTION.test(text)) return { ok: false, reason: "No mentions or pings." };
  if (LINK.test(text)) return { ok: false, reason: "No links or invites." };
  if (hasSlur(text)) return { ok: false, reason: "That text is not allowed." };
  if (PITCH_DENIED.test(text.toLowerCase())) return { ok: false, reason: "Don't use Fortuna, staff or Discord names." };
  return { ok: true, text };
}

export function checkFamilyName(raw: string): NameCheck {
  const name = raw.trim();
  if (/\s{2,}/.test(name)) return { ok: false, reason: "No double spaces." };
  if (!FAMILY_NAME_RULE.test(name)) return { ok: false, reason: NAME_RULE_REASON };
  if (isDenied(name)) return { ok: false, reason: "That name is not allowed." };
  return { ok: true, name, nameKey: nameKeyOf(name) };
}

export function checkFamilyTag(raw: string): TagCheck {
  const tag = raw.trim().toUpperCase();
  if (!FAMILY_TAG_RULE.test(tag)) return { ok: false, reason: TAG_RULE_REASON };
  if (isDenied(tag)) return { ok: false, reason: "That tag is not allowed." };
  return { ok: true, tag, tagKey: tag };
}
