import type { ReactNode } from "react";

/** Matches a command written inline in copy: "!work", "!turf", "/turf". */
const COMMAND = /(^|[\s(])([!/][a-z][a-z-]*)/g;

/** Doc copy with every inline command set as gold mono code. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(COMMAND)) {
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
