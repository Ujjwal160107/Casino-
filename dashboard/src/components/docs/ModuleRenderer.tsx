import Link from "next/link";
import * as icons from "lucide-react";
import type { ModuleDoc } from "@/content/types";
import { getCommand } from "@/content/commands";
import { Panel } from "@/components/ui/Panel";
import { CommandString } from "@/components/ui/CommandString";
import { ScreenshotSlot } from "@/components/ui/ScreenshotSlot";

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon =
    (icons as unknown as Record<string, icons.LucideIcon>)[name] ??
    icons.BookOpen;
  return <Icon className={className} />;
}

export function ModuleRenderer({ doc }: { doc: ModuleDoc }) {
  return (
    <article className="min-w-0 max-w-3xl">
      <div className="mb-2 flex items-center gap-3">
        <ModuleIcon name={doc.icon} className="h-7 w-7 text-gold" />
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          {doc.title}
        </h1>
      </div>
      <p className="text-lg text-muted">{doc.tagline}</p>

      {/* For Beginners callout */}
      <Panel className="mt-8 border-felt/40 bg-felt/10 p-6">
        <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-felt">
          For beginners
        </p>
        <p className="leading-relaxed text-ink">{doc.forBeginners.what}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {doc.forBeginners.firstCommands.map((c) => (
            <CommandString key={c} command={c} />
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          <span className="font-bold text-felt">Tip:</span>{" "}
          {doc.forBeginners.tip}
        </p>
      </Panel>

      {/* Bot screenshot (placeholder until the owner drops the file) */}
      {doc.screenshot && (
        <ScreenshotSlot
          className="mt-8"
          src={doc.screenshot.src}
          alt={doc.screenshot.alt}
          caption={doc.screenshot.caption}
        />
      )}

      {/* Sections */}
      {doc.sections.map((s) => (
        <section key={s.heading} className="mt-12">
          <h2 className="font-display text-2xl font-bold text-ink">
            {s.heading}
          </h2>
          {s.body.map((p, i) => (
            <p key={i} className="mt-3 leading-relaxed text-muted">
              {p}
            </p>
          ))}
          {s.table && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse overflow-hidden rounded-xl border border-line text-sm">
                {s.table.title && (
                  <caption className="border border-b-0 border-line bg-panel-2 px-4 py-2 text-left font-bold text-ink">
                    {s.table.title}
                  </caption>
                )}
                <thead>
                  <tr className="bg-panel-2 text-left">
                    {s.table.columns.map((c) => (
                      <th
                        key={c}
                        className="border-b border-line px-4 py-2.5 font-bold text-ink"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.table.rows.map((row, ri) => (
                    <tr key={ri} className="bg-panel">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="border-b border-line px-4 py-2.5 text-muted first:font-mono first:text-ink"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.note && (
            <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ink">
              {s.note}
            </p>
          )}
        </section>
      ))}

      {/* Related commands */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-ink">
          Commands in this module
        </h2>
        <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-panel">
          {doc.commandIds.map((id) => {
            const cmd = getCommand(id);
            if (!cmd) return null;
            return (
              <Link
                key={id}
                href={`/commands#${id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-panel-2"
              >
                <span className="font-mono font-bold text-ink">{cmd.name}</span>
                <span className="truncate text-sm text-muted">{cmd.short}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Pro tips */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-ink">Pro tips</h2>
        <ul className="mt-4 space-y-2.5">
          {doc.proTips.map((t) => (
            <li key={t} className="flex gap-2.5 text-muted">
              <span aria-hidden className="mt-0.5 select-none text-gold">
                ♦
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
