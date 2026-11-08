import type { ModuleDoc } from "@/content/types";
import { snippet } from "./metadata";

/**
 * How a docs module presents itself to search and answer engines: its page
 * title, snippet and social-card path, derived from the module's own copy so
 * they never drift from the page. Metadata, JSON-LD, the OG card and the llms
 * files all read these.
 */

export function modulePath(doc: ModuleDoc) {
  return `/docs/${doc.slug}`;
}

/** Page title before the site suffix, e.g. "Casino Games: Discord Bot Guide". */
export function moduleTitle(doc: ModuleDoc) {
  return `${doc.title}: Discord Bot Guide`;
}

function sentences(text: string) {
  return text.match(/\S.*?[.!?](?=\s|$)/g) ?? [text];
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * A 120–160 character description built from the module's tagline and
 * beginner intro: the first combination that fits, else the fullest one cut
 * at a clause.
 */
export function moduleDescription(doc: ModuleDoc) {
  const [s1 = "", s2 = ""] = sentences(doc.forBeginners.what);
  const tagline = lowerFirst(doc.tagline);
  const lead = `${doc.title} in Fortuna, the Discord life sim bot: ${tagline}`;
  return snippet(
    lead,
    `${doc.title} in the Fortuna Discord bot: ${tagline}`,
    doc.tagline,
    `${doc.tagline} ${s1}`,
    `${lead} ${s1}`,
    s1,
    `${s1} ${s2}`,
  );
}

export function moduleOgImage(doc: ModuleDoc) {
  return `${modulePath(doc)}/opengraph-image`;
}
