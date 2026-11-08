import type { ReactNode } from "react";
import type { DocSection as DocSectionData, KeyTable } from "@/content/types";
import { sectionId } from "./anchors";
import { richText } from "./rich-text";
import { SectionAnchor } from "./SectionAnchor";

/** A docs section: the anchor target, its big heading with a copy-link "#", then its content. */
export function DocSectionFrame({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} tabIndex={-1} className="scroll-mt-[calc(var(--docs-nav-h,64px)+88px)] pt-16 focus:outline-none!">
      <h2 className="group flex items-center gap-1 font-display text-[clamp(32px,5vw,40px)] font-black uppercase leading-[.95] [overflow-wrap:anywhere]">
        {heading}
        <SectionAnchor id={id} heading={heading} />
      </h2>
      {children}
    </section>
  );
}

/**
 * Cell styles live once on the <table> as descendant selectors instead of on
 * every <th>/<tr>/<td>: the Crime Families page alone has 38 tables, and
 * per-cell class strings were a large share of its HTML and RSC payload.
 */
const TABLE = [
  "w-full border-collapse text-sm tabular-nums",
  "[&_th]:whitespace-nowrap [&_th]:border-b-2 [&_th]:border-line-2 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted",
  "[&_tbody_tr]:border-b [&_tbody_tr]:border-line [&_tbody_tr]:transition-colors [&_tbody_tr:last-child]:border-b-0 [&_tbody_tr:hover]:bg-panel",
  "[&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_td]:text-ink-2 [&_td:first-child]:font-medium [&_td:first-child]:text-ink",
].join(" ");

function DocTable({ table }: { table: KeyTable }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border-2 border-line-2">
      <table className={TABLE}>
        {table.title ? (
          <caption className="px-4 pt-3.5 pb-1 text-left font-mono text-xs font-bold uppercase tracking-[.12em] text-muted">
            {table.title}
          </caption>
        ) : null}
        <thead>
          <tr>
            {table.columns.map((c, ci) => (
              <th key={`${ci}-${c}`} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{richText(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A module section from src/content: paragraphs, an optional table and an optional note. */
export function DocSection({ section }: { section: DocSectionData }) {
  return (
    <DocSectionFrame id={sectionId(section.heading)} heading={section.heading}>
      {section.body.map((p, i) => (
        <p key={i} className="mt-4 max-w-[70ch] leading-[1.7] text-ink-2">
          {richText(p)}
        </p>
      ))}
      {section.table && <DocTable table={section.table} />}
      {section.note && (
        <p className="mt-6 max-w-[70ch] rounded-r-xl border-l-[3px] border-gold bg-panel px-4 py-3 text-[14.5px] leading-relaxed text-ink-2">
          {richText(section.note)}
        </p>
      )}
    </DocSectionFrame>
  );
}
