import type { ReactNode } from "react";

/**
 * Matches a command written inline in copy: "!work", "!turf", "/turf".
 * Group 1 is the leading space or bracket, group 2 the command. Also used to
 * mark commands in the markdown served to answer engines (llms-full.txt).
 */
export const INLINE_COMMAND = /(^|[\s(])([!/][a-z][a-z-]*)/g;

/**
 * Doc copy with every inline command set as gold mono code. A plain function,
 * not a component: it runs for every paragraph and table cell, and a component
 * boundary per cell bloats the RSC payload (the Crime Families page has 38 tables).
 */
export function richText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_COMMAND)) {
    const start = m.index + m[1].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <code key={start} className="font-mono text-[.92em] font-bold text-gold">
        {m[2]}
      </code>,
    );
    last = start + m[2].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
