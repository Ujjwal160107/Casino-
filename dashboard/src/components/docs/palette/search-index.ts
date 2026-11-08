import { COMMANDS } from "@/content/commands";
import { MODULE_DOCS } from "@/content/modules";
import { cmdAnchor, sectionId } from "../anchors";

/** One palette result. Built on the server so the client only gets what it shows. */
export interface SearchItem {
  kind: "command" | "section";
  /** command name ("!work") or section heading */
  label: string;
  /** command short description, or the section's module title */
  context: string;
  /** extra words the query also matches (a command's aliases) */
  terms: string;
  href: string;
}

/**
 * Where a command is documented: the module page that lists it, else the full
 * list. Getting Started repeats the starter commands of other modules, so it
 * is only the home of a command no other module lists.
 */
function commandHref(commandId: string) {
  const [starter, ...rest] = MODULE_DOCS;
  const home =
    rest.find((m) => m.commandIds.includes(commandId)) ??
    (starter.commandIds.includes(commandId) ? starter : undefined);
  const anchor = cmdAnchor(commandId);
  return home ? `/docs/${home.slug}#${anchor}` : `/commands#${anchor}`;
}

export function buildSearchIndex(): SearchItem[] {
  const commands: SearchItem[] = COMMANDS.map((c) => ({
    kind: "command",
    label: c.name,
    context: c.short,
    terms: c.aliases.map((a) => `!${a}`).join(" "),
    href: commandHref(c.id),
  }));
  const sections: SearchItem[] = MODULE_DOCS.flatMap((m) =>
    m.sections.map((s) => ({
      kind: "section" as const,
      label: s.heading,
      context: m.title,
      terms: "",
      href: `/docs/${m.slug}#${sectionId(s.heading)}`,
    })),
  );
  return [...commands, ...sections];
}
