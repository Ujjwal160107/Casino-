/**
 * The one place that names in-page anchors, so the pages, the TOC and the
 * search palette always agree on where a thing lives. Kept free of content
 * imports: client components use it.
 */

/** In-page id of a doc section, derived from its heading. */
export function sectionId(heading: string) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** In-page id of a command card (module pages and /commands). */
export function cmdAnchor(commandId: string) {
  return `cmd-${commandId}`;
}

/** In-page id of a module group on /commands. */
export function commandGroupId(module: string) {
  return `group-${module}`;
}

export const COMMANDS_SECTION_ID = "commands";
export const PRO_TIPS_SECTION_ID = "pro-tips";
