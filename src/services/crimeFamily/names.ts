// Family name and tag rules (spec 6.2): what a player may type into the
// Create, Rename and force-rename inputs, and the unique keys derived from it.
import { FAMILY_NAME_DENYLIST, FAMILY_NAME_RULE, FAMILY_NAME_SLURS, FAMILY_TAG_RULE } from "../../data/crimeFamilyCatalog";

export type NameCheck = { ok: true; name: string; nameKey: string } | { ok: false; reason: string };
export type TagCheck = { ok: true; tag: string; tagKey: string } | { ok: false; reason: string };

const NAME_RULE_REASON = "Names are 3–24 characters: letters, digits, spaces, ' and -; start and end with a letter or digit.";
const TAG_RULE_REASON = "Tags are 2–4 letters or digits.";

/** The unique key of a family name: case and inner whitespace folded. */
export function nameKeyOf(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ");
}

/** Denylist and slurs match as substrings once case and every non-alphanumeric are stripped. */
function isDenied(raw: string): boolean {
  const folded = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [...FAMILY_NAME_DENYLIST, ...FAMILY_NAME_SLURS].some((word) => folded.includes(word));
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
