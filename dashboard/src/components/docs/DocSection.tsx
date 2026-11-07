import type { ReactNode } from "react";
import type { DocSection as DocSectionData, KeyTable } from "@/content/types";
import { sectionId } from "./anchors";
import { RichText } from "./RichText";
import { SectionAnchor } from "./SectionAnchor";

/** A docs section: the anchor target, its big heading with a copy-link "#", then its content. */
export function DocSectionFrame({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} tabIndex={-1} className="scroll-mt-[calc(var(--docs-nav-h,64px)+88px)] pt-16 focus:outline-none">
      <h2 className="group flex items-center gap-1 font-display text-[clamp(32px,5vw,40px)] font-black uppercase leading-[.95] [overflow-wrap:anywhere]">
        {heading}
        <SectionAnchor id={id} heading={heading} />
      </h2>
      {children}
    </section>
  );
}

function DocTable({ table }: { table: KeyTable }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border-2 border-line-2">
      <table className="w-full border-collapse text-sm tabular-nums">
        {table.title && (
          <caption className="px-4 pt-3.5 pb-1 text-left font-mono text-xs font-bold uppercase tracking-[.12em] text-muted">
            {table.title}
          </caption>
        )}
        <thead>
          <tr>
            {table.columns.map((c, ci) => (
              <th key={`${ci}-${c}`} scope="col" className="whitespace-nowrap border-b-2 border-line-2 px-4 py-3 text-left font-semibold text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-line transition-colors last:border-b-0 hover:bg-panel">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 align-top text-ink-2 first:font-medium first:text-ink">
                  <RichText text={cell} />
                </td>
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
          <RichText text={p} />
        </p>
      ))}
      {section.table && <DocTable table={section.table} />}
      {section.note && (
        <p className="mt-6 max-w-[70ch] rounded-r-xl border-l-[3px] border-gold bg-panel px-4 py-3 text-[14.5px] leading-relaxed text-ink-2">
          <RichText text={section.note} />
        </p>
      )}
    </DocSectionFrame>
  );
}
